import test from 'node:test';
import assert from 'node:assert/strict';
import {createDataLoader, RevisionError} from '../js/dataLoader.js';
import {createStore} from '../js/store.js';

const entries = [
  {id: '2026-primary', date: '2026-06-01', type: 'primary', party: 'D', certified: true},
  {id: '2024', date: '2024-11-05', type: 'general', party: null, certified: true},
  {id: '2022', date: '2022-11-08', type: 'general', party: null, certified: true},
];
const config = (buildId) => ({schemaVersion: 1, abbr: 'co', buildId, counties: [{fips: '08001', name: 'Adams'}], elections: entries});
const geo = (buildId) => ({type: 'FeatureCollection', buildId, features: []});
const election = (id, buildId) => ({schemaVersion: 1, electionId: id, buildId, candidates: [], counties: {}});
const states = {schemaVersion: 1, states: [{abbr: 'co', name: 'Colorado'}]};

function fixture() {
  let revision = 'A';
  let geometryRevision;
  const requests = [];
  const loader = createDataLoader({baseUrl: 'https://example.test/repository/', fetchImpl: async (url) => {
    const path = new URL(url).pathname.split('/repository/')[1];
    requests.push(path);
    const data = path === 'data/states.json' ? states
      : path.endsWith('/config.json') ? config(revision)
      : path.endsWith('/counties.geojson') ? geo(geometryRevision ?? revision)
      : election(path.split('/').at(-1).replace('.json', ''), revision);
    return {ok: true, json: async () => data};
  }});
  return {loader, requests, setRevision(value) {revision = value;}, setGeometryRevision(value) {geometryRevision = value;}};
}

test('newest general is default even when a newer primary exists', async () => {
  const f = fixture();
  const store = createStore({loader: f.loader});
  await store.setState({});
  assert.equal(store.getState().electionId, '2024');
  assert.equal(store.getState().view, 'margin');
});

test('cross-deploy election is rejected; retry replaces the complete bundle coherently', async (t) => {
  t.mock.method(console, 'error', () => {});
  const f = fixture();
  const store = createStore({loader: f.loader});
  await store.setState({});
  await store.setState({selectedFips: '08001'});
  const previous = store.getData();
  f.setRevision('B');
  await store.setState({electionId: '2022'});
  assert.equal(store.getState().loadStatus, 'error');
  assert.ok(store.getState().error instanceof RevisionError);
  assert.strictEqual(store.getData(), previous);
  assert.equal(store.getState().electionId, '2024');
  await store.retry();
  assert.equal(store.getState().loadStatus, 'ready');
  assert.equal(store.getState().electionId, '2022');
  assert.equal(store.getState().selectedFips, '08001');
  for (const part of ['config', 'geo', 'election']) assert.equal(store.getData()[part].buildId, 'B');
  await store.setState({electionId: '2024'});
  assert.equal(store.getData().election.buildId, 'B');
  assert.equal(f.requests.filter(p => p === 'data/co/2024.json').length, 2);
});

test('config/geometry revision mismatch clears every cached state file', async () => {
  const f = fixture();
  await f.loader.getElection('co', '2024', 'A');
  f.setGeometryRevision('B');
  await assert.rejects(f.loader.getStateBundle('co'), RevisionError);
  f.setRevision('B');
  const bundle = await f.loader.getStateBundle('co');
  assert.equal(bundle.config.buildId, 'B');
  assert.equal(bundle.geo.buildId, 'B');
  assert.equal((await f.loader.getElection('co', '2024', 'B')).buildId, 'B');
  assert.equal(f.requests.filter(p => p === 'data/co/2024.json').length, 2);
});

test('absent build IDs are rejected instead of treating legacy files as coherent', async () => {
  const f = fixture();
  f.setRevision(undefined);
  await assert.rejects(f.loader.getStateBundle('co'), RevisionError);
  await assert.rejects(f.loader.getElection('co', '2024', undefined), RevisionError);
});

test('network and invalid JSON failures are not cached', async () => {
  let calls = 0;
  const loader = createDataLoader({baseUrl: 'https://example.test/', fetchImpl: async () => {
    calls += 1;
    if (calls === 1) throw new Error('offline');
    if (calls === 2) return {ok: true, json: async () => {throw new Error('invalid JSON');}};
    return {ok: true, json: async () => states};
  }});
  await assert.rejects(loader.getStates());
  await assert.rejects(loader.getStates());
  assert.deepEqual(await loader.getStates(), states);
  assert.equal(calls, 3);
});

test('slow responses cannot overwrite a newer election and view selection', async () => {
  const delayed = [];
  const loader = {
    getStates: async () => states,
    getStateBundle: async () => ({config: config('A'), geo: geo('A')}),
    getElection: (abbr, id, buildId) => id === '2022'
      ? new Promise(resolve => delayed.push(() => resolve(election(id, buildId))))
      : Promise.resolve(election(id, buildId)),
  };
  const store = createStore({loader});
  await store.setState({});
  const slow = store.setState({electionId: '2022'});
  const newer = store.setState({view: 'turnout'});
  // Both requests retain the intended election; resolve the newer one first.
  delayed[1]();
  await newer;
  delayed[0]();
  await slow;
  assert.equal(store.getState().electionId, '2022');
  assert.equal(store.getState().view, 'turnout');
  assert.equal(store.getData().election.electionId, '2022');
});

test('an older election response cannot replace a newer committed choice', async () => {
  let release;
  const loader = {
    getStates: async () => states,
    getStateBundle: async () => ({config: config('A'), geo: geo('A')}),
    getElection: (abbr, id, buildId) => id === '2022'
      ? new Promise(resolve => {release = () => resolve(election(id, buildId));})
      : Promise.resolve(election(id, buildId)),
  };
  const store = createStore({loader});
  await store.setState({});
  const slow = store.setState({electionId: '2022'});
  await store.setState({electionId: '2026-primary'});
  release();
  await slow;
  assert.equal(store.getState().electionId, '2026-primary');
  assert.equal(store.getState().party, 'D');
  assert.equal(store.getData().election.electionId, '2026-primary');
});
