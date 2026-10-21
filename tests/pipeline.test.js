import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {calculateResult, calculate} from '../build/calculate.js';
import {normalize} from '../build/normalize.js';
import {validate} from '../build/validate.js';
import {publish} from '../build/publish.js';
import {build} from '../build/cli.js';

const candidates = [{id: 'a', name: 'Candidate A', party: 'D'}, {id: 'b', name: 'Candidate B', party: 'R'}];
const general = {id: 'test', label: 'Test Election', date: '2024-11-05', race: 'President', type: 'general', party: null, certified: true, sources: []};
const config = {abbr: 'co', name: 'Colorado', counties: [{fips: '08001', name: 'Adams', aliases: ['Adams County']}], elections: [general]};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('active turnout and race shares use their distinct denominators at full precision', () => {
  const result = calculateResult({name: 'Test', activeVoters: 90, ballotsCast: 80, votes: {a: 40, b: 30}}, candidates, general);
  assert.equal(result.turnout, 80 / 90 * 100);
  assert.equal(result.shares.a, 40 / 70 * 100);
  assert.equal(result.margin, 10 / 70 * 100);
  assert.equal(result.marginLabel, 'D+14.3');
  assert.equal(result.leaderId, 'a');
  assert.equal(result.runnerUpId, 'b');
});

test('ties, rounded near ties, zero votes, missing turnout, and uncontested primaries', () => {
  const row = {name: 'Test', activeVoters: 100, ballotsCast: 100, votes: {a: 50, b: 50}};
  assert.equal(calculateResult(row, candidates, general).marginLabel, 'Tie');
  assert.equal(calculateResult(row, candidates, general).leaderId, null);
  assert.equal(calculateResult(row, candidates, general).runnerUpId, null);
  const nearTie = calculateResult({...row, votes: {a: 100001, b: 100000}}, candidates, general);
  assert.equal(nearTie.leaderId, 'a');
  assert.notEqual(nearTie.marginLabel, 'Tie');
  assert.ok(nearTie.margin > 0);
  const zero = calculateResult({...row, votes: {a: 0, b: 0}}, candidates, general);
  assert.deepEqual(zero.shares, {a: null, b: null});
  assert.equal(zero.margin, null); assert.equal(zero.marginLabel, 'No data');
  assert.equal(calculateResult({...row, activeVoters: null}, candidates, general).turnout, null);
  const sole = calculateResult({...row, votes: {a: 50}}, candidates.slice(0, 1), {...general, type: 'primary', party: 'D'});
  assert.equal(sole.shares.a, 100); assert.equal(sole.margin, 100);
  assert.equal(sole.runnerUpId, null); assert.equal(sole.marginLabel, 'Candidate A+100.0');
});

test('normalizer accepts case/spacing/County and aliases but reports unmatched and conflicting FIPS', () => {
  const result = normalize([{county: '  ADAMS  county '}, {county: 'Unknown'}, {county: 'Adams', fips: '08005'}, {county: 'Adams County'}], config);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].fips, '08001');
  assert.equal(result.issues.length, 2);
  // Keep duplicate matches so the validator can report them.
  assert.equal(result.rows[1].fips, result.rows[0].fips);
});

test('validator collects duplicate, malformed, negative, turnout, missing candidate and control errors together', () => {
  const rows = [{fips: '08001', name: 'Adams', activeVoters: 2, ballotsCast: 5, votes: {a: -1, b: null}},
    {fips: '08001', name: 'Adams', activeVoters: null, ballotsCast: 4, votes: {a: 2, b: 1}}];
  const official = {activeVoters: 10, ballotsCast: 100, raceTotal: 20, votes: {a: 15, b: 5}};
  const adapter = {candidates, official, issues: [{county: 'Unknown', check: 'county match', message: 'unmatched'}]};
  const result = calculate(rows, candidates, config, general, official, '2026-10-10T00:00:00Z');
  const failed = validate(rows, adapter, result, config, general).filter(c => !c.passed);
  for (const name of ['county match', 'county appears exactly once', 'nonnegative integer count', 'candidate count', 'turnout 0–100%', 'statewide ballotsCast reconciles', 'candidate statewide reconciliation']) assert.ok(failed.some(c => c.check === name), `Missing check ${name}`);
  assert.ok(failed.length >= 10);
});

async function snapshot(directory) {
  const output = {};
  async function walk(current, prefix = '') {
    for (const entry of await fs.readdir(current, {withFileTypes: true})) {
      const relative = path.join(prefix, entry.name);
      if (entry.isDirectory()) await walk(path.join(current, entry.name), relative);
      else output[relative] = sha(await fs.readFile(path.join(current, entry.name)));
    }
  }
  await walk(directory);
  return output;
}

test('publisher rolls back the entire state and state list when a swap fails', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cetm-publish-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.mkdir(path.join(root, 'data/co'), {recursive: true});
  await fs.writeFile(path.join(root, 'data/co/old.json'), 'untouched');
  await fs.writeFile(path.join(root, 'data/states.json'), JSON.stringify({schemaVersion: 1, states: [{abbr: 'co', name: 'Old Colorado', stateFips: '08'}]}));
  const before = await snapshot(path.join(root, 'data'));
  const operations = {...fs, async rename(from, to) {
    if (path.basename(from).startsWith('.states-') && !path.basename(from).startsWith('.states-previous-') && path.basename(to) === 'states.json') throw new Error('Injected registry swap failure');
    return fs.rename(from, to);
  }};
  await assert.rejects(publish({...config, schemaVersion: 1, stateFips: '08'}, [], {type: 'FeatureCollection', features: []}, root, operations), /Injected/);
  assert.deepEqual(await snapshot(path.join(root, 'data')), before);
});

test('publisher stamps one build ID on every state file and generates a different ID on rebuild', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cetm-revision-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const geometry = {type: 'FeatureCollection', features: []};
  const elections = [{electionId: 'first'}, {electionId: 'second'}];
  const publishConfig = {...config, schemaVersion: 1, stateFips: '08'};
  const readFiles = async () => Promise.all(['config.json', 'counties.geojson', 'first.json', 'second.json'].map(async name => JSON.parse(await fs.readFile(path.join(root, 'data/co', name), 'utf8'))));
  const first = await publish(publishConfig, elections, geometry, root);
  assert.match(first, /^[a-f0-9-]{36}$/);
  assert.ok((await readFiles()).every(file => file.buildId === first));
  const second = await publish(publishConfig, elections, geometry, root);
  assert.notEqual(second, first);
  assert.ok((await readFiles()).every(file => file.buildId === second));
  assert.equal(geometry.buildId, undefined); // Publication never mutates inputs.
  assert.equal(elections[0].buildId, undefined);
});

async function fixtureRoot() {
  const repo = path.resolve('.');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cetm-build-'));
  await fs.mkdir(path.join(root, 'build/adapters'), {recursive: true});
  await fs.mkdir(path.join(root, 'states/_census'), {recursive: true});
  for (const entry of await fs.readdir(path.join(repo, 'build'))) if (/\.(js|py)$/.test(entry)) await fs.copyFile(path.join(repo, 'build', entry), path.join(root, 'build', entry));
  await fs.copyFile(path.join(repo, 'build/adapters/co.js'), path.join(root, 'build/adapters/co.js'));
  await fs.copyFile(path.join(repo, 'package.json'), path.join(root, 'package.json'));
  await fs.cp(path.join(repo, 'states/co'), path.join(root, 'states/co'), {recursive: true});
  const full = JSON.parse(await fs.readFile(path.join(root, 'states/co/config.json'), 'utf8'));
  await fs.link(path.join(repo, full.boundaries.file), path.join(root, full.boundaries.file));
  await fs.symlink(path.join(repo, 'node_modules'), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  return root;
}

test('archived official inputs build both races; validation and certification failures preserve every published byte', {timeout: 120000}, async t => {
  const root = await fixtureRoot();
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const successful = await build('co', {root, quiet: true});
  assert.equal(successful.failed, 0, JSON.stringify(successful.checks.filter(c => !c.passed)));
  assert.equal(successful.published, true);
  const read = name => fs.readFile(path.join(root, 'data/co', name), 'utf8').then(JSON.parse);
  const governor = await read('2022-general-governor.json'), president = await read('2024-general-president.json');
  assert.equal(Object.keys(governor.counties).length, 64); assert.equal(Object.keys(president.counties).length, 64);
  assert.equal(governor.statewide.ballotsCast, 2543316); assert.equal(governor.statewide.activeVoters, 3839814); assert.equal(governor.statewide.raceTotal, 2508830);
  assert.equal(governor.statewide.votes['jared-polis'], 1468481);
  assert.equal(president.statewide.ballotsCast, 3241155); assert.equal(president.statewide.activeVoters, 4074612); assert.equal(president.statewide.raceTotal, 3192745);
  assert.equal(president.statewide.votes['kamala-d-harris'], 1728159);
  assert.equal(president.candidates.length, 14);
  assert.equal(president.counties['08083'].activeVoters, 20051); // Footnoted Montezuma precincts.
  assert.equal(successful.elections[1].precinctCount, 3183);
  assert.equal(successful.elections[1].extractionAudit.reduce((sum, a) => sum + a.numericCellsCheckedAgainstText, 0), 1365);
  const publishedConfig = await read('config.json');
  const publishedGeometry = await read('counties.geojson');
  assert.match(successful.buildId, /^[a-f0-9-]{36}$/);
  assert.equal(publishedConfig.buildId, successful.buildId);
  assert.equal(publishedGeometry.buildId, successful.buildId);
  assert.equal(governor.buildId, successful.buildId);
  assert.equal(president.buildId, successful.buildId);
  assert.equal(publishedConfig.sourceIntegrity, undefined); assert.equal(publishedConfig.boundaries, undefined);
  assert.equal(publishedConfig.elections[0].sourceFiles, undefined);
  const warnings = [];
  const warningMock = t.mock.method(console, 'warn', value => warnings.push(value));
  const evidenceFailure = await build('co', {root, quiet: true, reportOperation: async () => {throw new Error('Injected disk-full report error');}});
  warningMock.mock.restore();
  assert.equal(evidenceFailure.published, true);
  assert.equal(evidenceFailure.stage, 'complete');
  assert.equal(evidenceFailure.failed, 0);
  assert.equal(evidenceFailure.error, undefined);
  assert.match(evidenceFailure.evidenceWriteError, /Injected disk-full/);
  assert.notEqual(evidenceFailure.buildId, successful.buildId);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Data published successfully/);
  assert.match(warnings[0], /report could not be saved/);
  assert.equal((await read('config.json')).buildId, evidenceFailure.buildId);
  assert.equal((await read('counties.geojson')).buildId, evidenceFailure.buildId);
  assert.equal((await read('2022-general-governor.json')).buildId, evidenceFailure.buildId);
  assert.equal((await read('2024-general-president.json')).buildId, evidenceFailure.buildId);
  const before = await snapshot(path.join(root, 'data'));
  const configFile = path.join(root, 'states/co/config.json');
  const full = JSON.parse(await fs.readFile(configFile, 'utf8'));
  const turnoutFile = path.join(root, 'states/co/sources/2022-turnout.html');
  const corrupted = (await fs.readFile(turnoutFile, 'utf8')).replace('296,776', '-1').replace('9,880', 'not-a-count');
  await fs.writeFile(turnoutFile, corrupted);
  full.sourceIntegrity.find(s => s.file.endsWith('2022-turnout.html')).sha256 = sha(Buffer.from(corrupted));
  await fs.writeFile(configFile, JSON.stringify(full));
  const failed = await build('co', {root, quiet: true});
  assert.equal(failed.published, false);
  assert.ok(failed.checks.filter(c => !c.passed).some(c => c.county === 'Adams'));
  assert.ok(failed.checks.filter(c => !c.passed).some(c => c.county === 'Alamosa'));
  assert.deepEqual(await snapshot(path.join(root, 'data')), before);
  full.elections[1].certified = false;
  await fs.writeFile(configFile, JSON.stringify(full));
  const uncertified = await build('co', {root, quiet: true});
  assert.equal(uncertified.published, false); assert.equal(uncertified.stage, 'configuration');
  assert.ok(uncertified.checks.some(c => c.message.includes('not marked certified')));
  assert.deepEqual(await snapshot(path.join(root, 'data')), before);
});
