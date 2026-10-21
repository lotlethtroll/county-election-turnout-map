import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const json = async p => JSON.parse(await readFile(new URL(`../${p}`, import.meta.url), 'utf8'));

test('published Colorado files satisfy the browser contract and complete county coverage', async () => {
  const stateList = await json('data/states.json');
  assert.equal(stateList.schemaVersion, 1);
  assert.ok(stateList.states.some(s => s.abbr === 'co'));
  const config = await json('data/co/config.json');
  const geometry = await json('data/co/counties.geojson');
  const fips = config.counties.map(c => c.fips).sort();
  assert.equal(fips.length, 64);
  assert.equal(new Set(fips).size, 64);
  assert.ok(fips.includes('08014'), 'Broomfield is retained');
  assert.deepEqual(geometry.features.map(f => f.properties.fips).sort(), fips);
  assert.ok((await stat(new URL('../data/co/counties.geojson', import.meta.url))).size <= 500000);
  assert.deepEqual(config.elections.map(e => e.id).sort(), ['2022-general-governor', '2024-general-president']);
  for (const entry of config.elections) {
    assert.equal(entry.certified, true);
    assert.equal(entry.adapter, undefined);
    assert.equal(entry.sourceFiles, undefined);
    const data = await json(`data/co/${entry.id}.json`);
    assert.equal(data.schemaVersion, 1);
    assert.equal(data.electionId, entry.id);
    assert.ok(Number.isFinite(Date.parse(data.builtAt)));
    assert.deepEqual(Object.keys(data.counties).sort(), fips);
    assert.deepEqual(data.missing, []);
    assert.ok(data.candidates.length >= 2);
    for (const [key, result] of Object.entries(data.counties)) {
      assert.equal(result.fips, key);
      assert.ok(Number.isSafeInteger(result.ballotsCast));
      assert.ok(Number.isSafeInteger(result.activeVoters));
      assert.ok(result.turnout >= 0 && result.turnout <= 100);
      assert.ok(Math.abs(result.turnout - result.ballotsCast / result.activeVoters * 100) < 1e-10);
      assert.equal(result.raceTotal, Object.values(result.votes).reduce((a,b) => a+b, 0));
      assert.deepEqual(Object.keys(result.votes).sort(), data.candidates.map(c => c.id).sort());
      for (const c of data.candidates) {
        assert.ok(Number.isSafeInteger(result.votes[c.id]));
        assert.ok(Math.abs(result.shares[c.id] - result.votes[c.id] / result.raceTotal * 100) < 1e-10);
      }
    }
  }
});

test('published counts match independent official statewide control figures', async () => {
  // 2022 official Governor/turnout tables; 2024 biennial abstract p106–110 and p181.
  const expected = {
    '2022-general-governor': { ballotsCast: 2543316, raceTotal: 2508830 },
    '2024-general-president': { ballotsCast: 3241155, activeVoters: 4074612, raceTotal: 3192745 },
  };
  for (const [id, controls] of Object.entries(expected)) {
    const data = await json(`data/co/${id}.json`);
    for (const [field,value] of Object.entries(controls)) assert.equal(data.statewide[field], value, `${id}: ${field}`);
  }
  const data = await json('data/co/2022-general-governor.json');
  assert.equal(data.counties['08001'].ballotsCast, 169626);
  assert.equal(data.counties['08001'].activeVoters, 296776);
  assert.equal(data.counties['08125'].ballotsCast, 5312);
  assert.equal(data.counties['08125'].activeVoters, 5750);
});
