// C-21: full precision throughout; display labels alone round to one decimal.
export const isCount = value => Number.isSafeInteger(value) && value >= 0;
export function sumCounts(values) {
  if (!values.every(isCount)) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return isCount(total) ? total : null;
}

export function calculateResult(row, candidates, election) {
  const votes = Object.fromEntries(candidates.map(c => [c.id, row.votes?.[c.id] ?? null]));
  const raceTotal = sumCounts(Object.values(votes));
  const turnout = isCount(row.ballotsCast) && isCount(row.activeVoters) && row.activeVoters > 0 ? row.ballotsCast / row.activeVoters * 100 : null;
  const shares = Object.fromEntries(candidates.map(c => [c.id, raceTotal > 0 ? votes[c.id] / raceTotal * 100 : null]));
  const ordered = [...candidates].sort((a, b) => votes[b.id] - votes[a.id] || a.id.localeCompare(b.id));
  let leaderId = null, runnerUpId = null, margin = null, marginLabel = 'No data';
  if (raceTotal > 0) {
    const top = ordered[0], second = ordered[1];
    if (second && votes[top.id] === votes[second.id]) {
      margin = 0; marginLabel = 'Tie';
    } else {
      leaderId = top.id; runnerUpId = second?.id ?? null;
      margin = (votes[top.id] - (second ? votes[second.id] : 0)) / raceTotal * 100;
      marginLabel = `${election.type === 'primary' ? top.name : top.party}+${margin.toFixed(1)}`;
    }
  }
  return {name: row.name, ...(row.fips ? {fips: row.fips} : {}), activeVoters: row.activeVoters,
    ballotsCast: row.ballotsCast, raceTotal, votes, shares, turnout, leaderId, runnerUpId, margin, marginLabel};
}

export function calculate(rows, candidates, config, election, official, builtAt) {
  const statewide = calculateResult({name: config.name,
    activeVoters: rows.some(r => r.activeVoters === null) ? null : sumCounts(rows.map(r => r.activeVoters)),
    ballotsCast: sumCounts(rows.map(r => r.ballotsCast)),
    votes: Object.fromEntries(candidates.map(c => [c.id, sumCounts(rows.map(r => r.votes?.[c.id]))]))}, candidates, election);
  return {schemaVersion: 1, electionId: election.id, label: election.label, date: election.date,
    race: election.race, type: election.type, party: election.party, builtAt,
    candidates: candidates.map(c => ({...c, statewideVotes: official.votes[c.id]})), statewide,
    counties: Object.fromEntries(rows.map(r => [r.fips, calculateResult(r, candidates, election)])), missing: [], sources: election.sources};
}
