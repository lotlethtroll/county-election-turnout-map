import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {build} from '../build/cli.js';
import {createDataLoader} from '../js/dataLoader.js';
import {electionGroups} from '../js/controls.js';

const repo = path.resolve('.');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const readJSON = filename => fs.readFile(filename, 'utf8').then(JSON.parse);
const writeJSON = (filename, value) => fs.writeFile(filename, JSON.stringify(value, null, 2));
function fixtureLoader(root) {
  return createDataLoader({baseUrl: 'https://example.invalid/repository-subpath/', fetchImpl: async url => ({
    ok: true,
    json: () => readJSON(path.join(root, new URL(url).pathname.replace('/repository-subpath/', ''))),
  })});
}
async function snapshot(directory) {
  const files = {};
  async function walk(current, prefix = '') {
    for (const entry of await fs.readdir(current, {withFileTypes: true})) {
      const relative = path.join(prefix, entry.name);
      if (entry.isDirectory()) await walk(path.join(current, entry.name), relative);
      else files[relative] = sha(await fs.readFile(path.join(current, entry.name)));
    }
  }
  await walk(directory);
  return files;
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cetm-extensibility-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.mkdir(path.join(root, 'build/adapters'), {recursive: true});
  await fs.mkdir(path.join(root, 'states/_census'), {recursive: true});
  for (const file of await fs.readdir(path.join(repo, 'build'))) {
    if (/\.(js|py)$/.test(file)) await fs.copyFile(path.join(repo, 'build', file), path.join(root, 'build', file));
  }
  await fs.copyFile(path.join(repo, 'build/adapters/co.js'), path.join(root, 'build/adapters/co.js'));
  await fs.copyFile(path.join(repo, 'package.json'), path.join(root, 'package.json'));
  await fs.cp(path.join(repo, 'states/co'), path.join(root, 'states/co'), {recursive: true});
  const config = await readJSON(path.join(root, 'states/co/config.json'));
  // Boundary archive is never modified; the hard link avoids copying ~20 MB.
  await fs.link(path.join(repo, config.boundaries.file), path.join(root, config.boundaries.file));
  await fs.symlink(path.join(repo, 'node_modules'), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  // Only the archived 2022 format is needed: no Python/PDF work in these fixtures.
  config.elections = config.elections.filter(e => e.sourceFormat === 'co-2022-html');
  await writeJSON(path.join(root, 'states/co/config.json'), config);
  return {root, config};
}

test('an additional configured election builds with unchanged shared site and adapter', {timeout: 120000}, async t => {
  const publicBefore = await Promise.all(['js', 'css'].map(name => snapshot(path.join(repo, name))));
  const {root, config} = await fixture(t);
  const first = await build('co', {root, quiet: true});
  assert.equal(first.published, true, JSON.stringify(first.checks.filter(c => !c.passed)));
  const original = await readJSON(path.join(root, 'data/co/2022-general-governor.json'));
  // Repeat official 2022 sources under a fixture ID, never invent a real election.
  config.elections.push({...structuredClone(config.elections[0]), id: 'fixture-repeat-governor', label: 'Fixture repeat of certified 2022 Governor'});
  await writeJSON(path.join(root, 'states/co/config.json'), config);
  const added = await build('co', {root, quiet: true});
  assert.equal(added.published, true, JSON.stringify(added.checks.filter(c => !c.passed)));
  const published = await readJSON(path.join(root, 'data/co/config.json'));
  const repeat = await readJSON(path.join(root, 'data/co/fixture-repeat-governor.json'));
  assert.equal(published.elections.length, 2);
  assert.equal(repeat.electionId, 'fixture-repeat-governor');
  assert.deepEqual(repeat.counties, original.counties);
  assert.deepEqual(repeat.statewide, original.statewide);
  assert.equal(repeat.buildId, published.buildId);
  assert.equal(published.elections[1].adapter, undefined);
  const loader = fixtureLoader(root);
  const bundle = await loader.getStateBundle('co');
  assert.ok(electionGroups(bundle.config).some(group => group.entries.some(e => e.id === repeat.electionId)));
  assert.deepEqual(await loader.getElection('co', repeat.electionId, bundle.config.buildId), repeat);
  assert.deepEqual(await Promise.all(['js', 'css'].map(name => snapshot(path.join(repo, name)))), publicBefore);
});

test('a new state adapter builds real county geometry, general/primary and null/zero data; invalid updates preserve publication', {timeout: 120000}, async t => {
  const {root, config: colorado} = await fixture(t);
  assert.equal((await build('co', {root, quiet: true})).published, true);
  const coBefore = await snapshot(path.join(root, 'data/co'));
  const sourceDirectory = path.join(root, 'states/de/sources');
  await fs.mkdir(sourceDirectory, {recursive: true});
  // All election counts below are SYNTHETIC fixture values, not Delaware results.
  const input = {
    synthetic: true,
    candidates: [{id: 'alice', name: 'Synthetic Alice', party: 'D'}, {id: 'bob', name: 'Synthetic Bob', party: 'D'}],
    counties: [
      {county: 'Kent County', activeVoters: 100, ballotsCast: 0, votes: {alice: 0, bob: 0}},
      {county: ' NEW CASTLE county ', activeVoters: null, ballotsCast: 20, votes: {alice: 15, bob: 5}},
      {county: 'Sussex', activeVoters: null, ballotsCast: 10, votes: {alice: 5, bob: 5}},
    ],
  };
  // Independently supplied fixture controls are a separate input, not computed by the adapter.
  const controls = {synthetic: true, ballotsCast: 30, votes: {alice: 20, bob: 10}};
  const rowsFile = 'states/de/sources/synthetic-rows.json', controlsFile = 'states/de/sources/synthetic-controls.json';
  await writeJSON(path.join(root, rowsFile), input);
  await writeJSON(path.join(root, controlsFile), controls);
  await fs.writeFile(path.join(root, 'build/adapters/de.js'), `import fs from 'node:fs/promises';
import path from 'node:path';
export async function extract(election, root) {
  if (election.sourceFormat !== 'synthetic-json') throw new Error('Unsupported synthetic source format');
  const rows = JSON.parse(await fs.readFile(path.join(root, election.sourceFiles.rows), 'utf8'));
  const official = JSON.parse(await fs.readFile(path.join(root, election.sourceFiles.controls), 'utf8'));
  if (!rows.synthetic || !official.synthetic) throw new Error('Fixture inputs must be marked synthetic');
  return {counties: rows.counties, candidates: rows.candidates, official, issues: []};
}
`);
  const source = {name: 'Synthetic fixture only; not election results', publisher: 'Test fixture', url: 'https://example.invalid/synthetic-fixture', retrievedAt: '2026-10-10'};
  const election = {id: 'synthetic-general', label: 'Synthetic general fixture', date: '2026-11-03', race: 'Fixture office', type: 'general', party: null, certified: true, adapter: 'de', sourceFormat: 'synthetic-json', sourceFiles: {rows: rowsFile, controls: controlsFile}, sources: [source]};
  const config = {schemaVersion: 1, abbr: 'de', name: 'Delaware', stateFips: '10', officeName: 'Fixture office', officeUrl: source.url,
    counties: [{fips: '10001', name: 'Kent', aliases: []}, {fips: '10003', name: 'New Castle', aliases: []}, {fips: '10005', name: 'Sussex', aliases: []}],
    elections: [election, {...structuredClone(election), id: 'synthetic-primary-d', label: 'Synthetic primary fixture', date: '2026-09-08', type: 'primary', party: 'D', candidateColors: {alice: '#123456', bob: '#654321'}}],
    sources: [source], boundaries: colorado.boundaries, sourceIntegrity: []};
  async function save() {
    await writeJSON(path.join(root, rowsFile), input);
    config.sourceIntegrity = await Promise.all([rowsFile, controlsFile].map(async file => ({file, sha256: sha(await fs.readFile(path.join(root, file)))})));
    await writeJSON(path.join(root, 'states/de/config.json'), config);
  }
  await save();
  const result = await build('de', {root, quiet: true});
  assert.equal(result.published, true, JSON.stringify(result.checks.filter(c => !c.passed)));
  const registry = await readJSON(path.join(root, 'data/states.json'));
  assert.deepEqual(registry.states.map(s => s.abbr), ['co', 'de']);
  const geometry = await readJSON(path.join(root, 'data/de/counties.geojson'));
  assert.deepEqual(geometry.features.map(f => f.properties.fips).sort(), ['10001', '10003', '10005']);
  assert.ok(geometry.features.every(f => ['Polygon', 'MultiPolygon'].includes(f.geometry.type)));
  const general = await readJSON(path.join(root, 'data/de/synthetic-general.json'));
  const primary = await readJSON(path.join(root, 'data/de/synthetic-primary-d.json'));
  assert.equal(general.counties['10001'].turnout, 0);
  assert.deepEqual(general.counties['10001'].shares, {alice: null, bob: null});
  assert.equal(general.counties['10001'].marginLabel, 'No data');
  assert.equal(general.counties['10003'].turnout, null);
  assert.equal(general.statewide.activeVoters, null);
  assert.equal(general.statewide.turnout, null);
  assert.equal(general.counties['10005'].marginLabel, 'Tie');
  assert.equal(primary.counties['10003'].marginLabel, 'Synthetic Alice+50.0');
  assert.equal(primary.party, 'D');
  assert.equal(primary.buildId, geometry.buildId);
  const loader = fixtureLoader(root);
  assert.equal((await loader.getStates()).states.length, 2);
  const bundle = await loader.getStateBundle('de');
  assert.equal(bundle.geo.features.length, 3);
  assert.equal(electionGroups(bundle.config).length, 2);
  assert.deepEqual(bundle.config.elections[1].candidateColors, {alice: '#123456', bob: '#654321'});
  assert.deepEqual(await loader.getElection('de', primary.electionId, bundle.config.buildId), primary);
  assert.deepEqual(await snapshot(path.join(root, 'data/co')), coBefore);
  const before = await snapshot(path.join(root, 'data'));
  async function rejected(mutate, expected) {
    const oldConfig = structuredClone(config), oldInput = structuredClone(input);
    mutate();
    await save();
    const failed = await build('de', {root, quiet: true});
    assert.equal(failed.published, false);
    assert.ok(failed.checks.some(c => !c.passed && expected(c)), JSON.stringify(failed.checks.filter(c => !c.passed)));
    assert.deepEqual(await snapshot(path.join(root, 'data')), before);
    Object.assign(config, oldConfig); Object.assign(input, oldInput);
  }
  await rejected(() => {config.elections[1].certified = false;}, c => c.message.includes('not marked certified'));
  await rejected(() => {delete input.counties[1].activeVoters;}, c => c.check === 'nonnegative integer count' && c.county === 'New Castle');
  await rejected(() => {input.counties[1].votes.alice = null;}, c => c.check === 'candidate count' && c.county === 'New Castle');
  await rejected(() => {delete input.counties[2].ballotsCast;}, c => c.check === 'nonnegative integer count' && c.county === 'Sussex');
  await rejected(() => {input.counties[1].votes.alice = -1;}, c => c.check === 'candidate count' && c.county === 'New Castle');
  await rejected(() => {input.counties[1].votes.alice = 14;}, c => c.check === 'candidate statewide reconciliation');
  await rejected(() => {input.counties.pop();}, c => c.check === 'county appears exactly once' && c.county === 'Sussex');
  await rejected(() => {config.elections[1].sourceFormat = 'unsupported';}, c => c.check === 'extract' && c.message.includes('Unsupported'));
});
