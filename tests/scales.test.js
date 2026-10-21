import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const d3Context = {console};
d3Context.globalThis = d3Context;
vm.runInNewContext(await fs.readFile(new URL('../vendor/d3.min.js', import.meta.url), 'utf8'), d3Context);
globalThis.d3 = d3Context.d3;
const {getScale, getTurnoutColors, MARGIN_COLORS, TIE_COLOR, NO_DATA_COLOR} = await import('../js/scales.js');

const config = {abbr: 'xy', counties: []};
const candidates = [
  {id: 'dem', name: 'Demo Democrat', party: 'D'},
  {id: 'rep', name: 'Demo Republican', party: 'R'},
];
const result = (overrides = {}) => ({
  raceTotal: 100,
  votes: {dem: 60, rep: 40},
  leaderId: 'dem',
  runnerUpId: 'rep',
  margin: 20,
  marginLabel: 'D+20.0',
  turnout: 70,
  ...overrides,
});
function general(records, extra = {}) {
  return {
    electionId: 'fixture-general',
    type: 'general',
    candidates,
    counties: Object.fromEntries(Object.entries(records).map(([fips, value]) => [fips, value])),
    ...extra,
  };
}

await test('general margin bins use inclusive 5/10/20 breaks symmetrically for D and R', () => {
  const election = general({});
  const marginScale = getScale(election, 'margin', config);
  for (const [margin, band] of [[0, 0], [4.999, 0], [5, 1], [9.999, 1], [10, 2], [19.999, 2], [20, 3], [45, 3]]) {
    const demPaint = marginScale.paint(result({margin, marginLabel: `D+${margin}`}));
    const repPaint = marginScale.paint(result({leaderId: 'rep', runnerUpId: 'dem', margin, marginLabel: `R+${margin}`}));
    assert.equal(demPaint.color, MARGIN_COLORS.D[band], `D margin ${margin}`);
    assert.equal(repPaint.color, MARGIN_COLORS.R[band], `R margin ${margin}`);
    assert.equal(demPaint.group, 'D');
    assert.equal(repPaint.group, 'R');
  }
});

await test('exact ties are neutral while a one-vote lead stays in the first band', () => {
  const election = general({});
  const marginScale = getScale(election, 'margin', config);
  const tie = marginScale.paint(result({
    raceTotal: 200001,
    votes: {dem: 100000, rep: 100000},
    leaderId: null,
    runnerUpId: null,
    margin: 0,
    marginLabel: 'Tie',
  }));
  const nearTie = marginScale.paint(result({
    raceTotal: 200001,
    votes: {dem: 100001, rep: 100000},
    margin: 100 / 200001,
    marginLabel: 'D+0.0',
  }));
  assert.deepEqual({...tie}, {color: TIE_COLOR, noData: false, tie: true});
  assert.equal(nearTie.color, MARGIN_COLORS.D[0]);
  assert.equal(nearTie.tie, false);
});

await test('missing turnout and empty races are no-data paints, not zero-value paints', () => {
  const election = general({});
  const turnoutScale = getScale(election, 'turnout', config);
  const missingTurnout = turnoutScale.paint(result({turnout: null}));
  assert.equal(missingTurnout.color, NO_DATA_COLOR);
  assert.equal(missingTurnout.noData, true);

  const marginScale = getScale(election, 'margin', config);
  const emptyRace = marginScale.paint(result({
    raceTotal: 0,
    votes: {dem: 0, rep: 0},
    leaderId: null,
    runnerUpId: null,
    margin: null,
    marginLabel: 'No data',
  }));
  assert.equal(emptyRace.color, NO_DATA_COLOR);
  assert.equal(emptyRace.noData, true);
  assert.equal(emptyRace.tie, false);
  assert.equal(turnoutScale.paint(null).noData, true);
});

await test('uniform turnout receives one labeled range and one shared color', () => {
  const election = general({
    'xy001': result({turnout: 68.25}),
    'xy003': result({turnout: 68.25}),
    'xy005': result({turnout: null}),
  });
  const turnoutScale = getScale(election, 'turnout', {abbr: 'xy', counties: Object.keys(election.counties).map(fips => ({fips}))});
  const a = turnoutScale.paint(election.counties['xy001']);
  const b = turnoutScale.paint(election.counties['xy003']);
  assert.equal(a.color, b.color);
  assert.equal(a.color, getTurnoutColors()[3]);
  assert.equal(turnoutScale.legend.groups[0].items.length, 1);
  assert.equal(turnoutScale.legend.groups[0].items[0].label, '68.3% (every county with data)');
  assert.equal(turnoutScale.paint(election.counties['xy005']).noData, true);
  assert.ok(turnoutScale.legend.extras.some(item => item.label === 'No data'));
});

await test('primary candidate colors are candidate-specific and config is state-generic', () => {
  const primaryCandidates = [
    {id: 'alpha', name: 'Alpha', party: 'D', statewideVotes: 900},
    {id: 'beta', name: 'Beta', party: 'D', statewideVotes: 800},
  ];
  const election = {
    electionId: 'xy-primary',
    type: 'primary',
    candidates: primaryCandidates,
    counties: {
      'xy001': result({votes: {alpha: 70, beta: 30}, leaderId: 'alpha', runnerUpId: 'beta', margin: 40, marginLabel: 'Alpha+40.0'}),
      'xy003': result({votes: {alpha: 30, beta: 70}, leaderId: 'beta', runnerUpId: 'alpha', margin: 40, marginLabel: 'Beta+40.0'}),
    },
  };
  const primaryConfig = {
    abbr: 'xy',
    counties: [{fips: 'xy001'}, {fips: 'xy003'}],
    candidateColors: {'xy-primary': {alpha: '#D02020', beta: '#2050D0'}},
  };
  const primaryScale = getScale(election, 'margin', primaryConfig);
  const alpha = primaryScale.paint(election.counties['xy001']);
  const beta = primaryScale.paint(election.counties['xy003']);
  assert.equal(alpha.group, 'c:alpha');
  assert.equal(beta.group, 'c:beta');
  assert.notEqual(alpha.color, beta.color);
  assert.deepEqual(primaryScale.legend.groups.map(group => group.title).sort(), ['Alpha leads', 'Beta leads']);
  const changedConfig = {...primaryConfig, candidateColors: {'xy-primary': {alpha: '#2050D0', beta: '#D02020'}}};
  const recoloredElection = {...election};
  assert.notEqual(getScale(recoloredElection, 'margin', changedConfig).paint(election.counties['xy001']).color, alpha.color);
});

await test('non-major-party leads use a distinct neutral ramp', () => {
  const election = {
    electionId: 'xy-other-party',
    type: 'general',
    candidates: [{id: 'other', name: 'Other Party Candidate', party: 'LIB'}],
    counties: {
      'xy001': {raceTotal: 50, votes: {other: 50}, leaderId: 'other', margin: 100, marginLabel: 'LIB+100.0'},
    },
  };
  const scale = getScale(election, 'margin', {abbr: 'xy', counties: [{fips: 'xy001'}]});
  const painted = scale.paint(election.counties['xy001']);
  assert.equal(painted.group, 'other');
  assert.ok(scale.legend.groups.some(group => group.title === 'Other party lead'));
  assert.ok(!Object.values(MARGIN_COLORS).flat().includes(painted.color));
  assert.ok(d3.lab(painted.color).b > d3.lab(painted.color).a);
});
