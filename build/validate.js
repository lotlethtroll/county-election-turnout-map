// C-22: gather every failed check, including failures in rows that cannot calculate.
import {isCount, sumCounts} from './calculate.js';
export function validate(rows, adapter, result, config, election) {
  const checks = [];
  const check = (passed, name, county, message) => checks.push({passed: Boolean(passed), check: name, county, message});
  for (const issue of adapter.issues ?? []) check(false, issue.check, issue.county, issue.message);
  check(election.certified === true, 'certified election', 'Statewide', 'Election must be marked certified');
  const counts = new Map();
  for (const row of rows) counts.set(row.fips, (counts.get(row.fips) ?? 0) + 1);
  const configured = new Set(config.counties.map(c => c.fips));
  for (const county of config.counties) check(counts.get(county.fips) === 1, 'county appears exactly once', county.name, `Expected one ${county.fips}; found ${counts.get(county.fips) ?? 0}`);
  for (const row of rows) {
    check(configured.has(row.fips), 'configured county', row.name, `County FIPS ${row.fips} must be configured`);
    for (const field of ['activeVoters', 'ballotsCast']) check(isCount(row[field]) || (field === 'activeVoters' && config.abbr !== 'co' && row[field] === null), 'nonnegative integer count', row.name, `${field}: ${JSON.stringify(row[field])}`);
    const expectedIds = new Set(adapter.candidates.map(c => c.id));
    for (const c of adapter.candidates) check(isCount(row.votes?.[c.id]), 'candidate count', row.name, `${c.name}: ${JSON.stringify(row.votes?.[c.id])}`);
    for (const id of Object.keys(row.votes ?? {})) check(expectedIds.has(id), 'known candidate', row.name, `Vote column ${id} must identify a configured candidate`);
    const countyResult = result.counties[row.fips];
    check(countyResult?.turnout === null ? config.abbr !== 'co' && row.activeVoters === null : Number.isFinite(countyResult?.turnout) && countyResult.turnout >= 0 && countyResult.turnout <= 100, 'turnout 0–100%', row.name, `Calculated turnout ${countyResult?.turnout}; active voters ${row.activeVoters}, ballots ${row.ballotsCast}`);
    check(isCount(countyResult?.raceTotal) && countyResult.raceTotal <= row.ballotsCast, 'race votes within ballots', row.name, `Race votes ${countyResult?.raceTotal}; ballots ${row.ballotsCast}`);
  }
  const candidateIds = adapter.candidates.map(c => c.id);
  check(candidateIds.length > 0 && new Set(candidateIds).size === candidateIds.length, 'candidate identities', 'Statewide', 'Candidate IDs must be nonempty and unique');
  for (const field of ['ballotsCast', 'activeVoters', 'raceTotal']) {
    // Other adapters can explicitly lack active-voter reporting; the required
    // independent controls remain ballots and every candidate's votes. A race
    // total omitted by a source is still controlled by those candidate totals.
    const optional = config.abbr !== 'co' && field !== 'ballotsCast' && adapter.official[field] == null;
    if (optional) continue;
    check(isCount(adapter.official[field]), 'independent official control', 'Statewide', `Official ${field}: ${JSON.stringify(adapter.official[field])}`);
    check(result.statewide[field] === adapter.official[field], `statewide ${field} reconciles`, 'Statewide', `County sum ${result.statewide[field]}; independent official total ${adapter.official[field]}`);
  }
  for (const c of adapter.candidates) {
    check(isCount(adapter.official.votes[c.id]), 'official candidate count', 'Statewide', `${c.name}: ${adapter.official.votes[c.id]}`);
    check(result.statewide.votes[c.id] === adapter.official.votes[c.id], 'candidate statewide reconciliation', 'Statewide', `${c.name}: county sum ${result.statewide.votes[c.id]}; independent official total ${adapter.official.votes[c.id]}`);
  }
  const independentRace = adapter.official.raceTotal ?? sumCounts(Object.values(adapter.official.votes));
  check(sumCounts(Object.values(adapter.official.votes)) === independentRace && result.statewide.raceTotal === independentRace, 'official race total', 'Statewide', 'Independent candidate totals must equal the statewide race total');
  check(result.statewide.turnout === null ? config.abbr !== 'co' : result.statewide.turnout >= 0 && result.statewide.turnout <= 100, 'statewide turnout 0–100%', 'Statewide', `Calculated statewide turnout ${result.statewide.turnout}`);
  return checks;
}
