// C-4 scales.js: builds the margin threshold scales and the turnout quantize
// scale for the loaded election (FR-1.2). The map, legend and county list all
// read colors and legend ranges from the object built here, so they agree.

import {
  NO_DATA,
  TIE,
  candidateById,
  formatPercent,
  hasRaceData,
  isNumber,
  isTie,
  soleLeaderId,
} from './format.js';

const d3 = globalThis.d3;

/** Lead-size boundaries in percentage points: [0,5), [5,10), [10,20), [20,∞). */
export const MARGIN_BREAKS = [5, 10, 20];

// Design Table 8. Every shade reaches at least 3:1 against the white borders.
export const MARGIN_COLORS = {
  D: ['#5B8FC7', '#3B73B5', '#245A99', '#123F73'],
  R: ['#D9605A', '#C2403A', '#9E2B26', '#6E1A17'],
};
export const TIE_COLOR = '#8A8A8A';
export const NO_DATA_COLOR = '#8A8A8A';
export const NO_DATA_STRIPE = '#4D4D4D';
const TURNOUT_LOW = '#8C7BB8';
const TURNOUT_HIGH = '#2B1A57';
const TURNOUT_STEPS = 6;

// Lab lightness for generated four-shade ramps (other parties, primary
// candidates). L* 58 and darker keeps every shade at or above 3:1 on white.
const RAMP_LIGHTNESS = [58, 48, 38, 26];
const OTHER_PARTY_BASE = { a: 2, b: 22 };
// Used only when a primary has no candidateColors entry for a candidate.
const FALLBACK_CANDIDATE_COLORS = ['#1B7F79', '#7A4FA0', '#A0612A', '#4F7A2F', '#A23B72', '#3F5E7A'];

const BAND_WORDS = ['Under 5 points', '5 to 10 points', '10 to 20 points', '20 points or more'];

const cache = new WeakMap();

/** Scale for an election and view; cached per election object. */
export function getScale(election, view, config) {
  if (!election) return null;
  let byView = cache.get(election);
  if (!byView) {
    byView = new Map();
    cache.set(election, byView);
  }
  const key = `${view}|${config?.abbr ?? ''}`;
  if (!byView.has(key)) {
    byView.set(key, view === 'turnout' ? buildTurnout(election, config) : buildMargin(election, config));
  }
  return byView.get(key);
}

/** The county's record, or null when it is listed as missing or absent. */
export function resultFor(election, fips) {
  if (!election || !fips) return null;
  if (Array.isArray(election.missing) && election.missing.includes(fips)) return null;
  return election.counties?.[fips] ?? null;
}

function configuredFips(election, config) {
  const list = config?.counties?.map((county) => county.fips);
  return list?.length ? list : Object.keys(election.counties ?? {});
}

const NO_DATA_PAINT = Object.freeze({ color: NO_DATA_COLOR, noData: true, tie: false });
const TIE_PAINT = Object.freeze({ color: TIE_COLOR, noData: false, tie: true });

// ---------------------------------------------------------------- margin

function buildMargin(election, config) {
  const isPrimary = election.type === 'primary';
  const groups = new Map();
  const groupOf = (leaderId) => {
    const candidate = candidateById(election, leaderId);
    if (!candidate) return null;
    const key = isPrimary ? `c:${candidate.id}` : partyGroupKey(candidate.party);
    if (!groups.has(key)) groups.set(key, makeGroup(key, candidate, election, config));
    return groups.get(key);
  };

  // General elections always show both major-party ramps (FR-1.2).
  if (!isPrimary) {
    for (const key of ['D', 'R']) groups.set(key, makeGroup(key, null, election, config));
  }

  const paint = (result) => {
    if (!hasRaceData(result)) return NO_DATA_PAINT;
    if (isTie(result)) return TIE_PAINT;
    const group = groupOf(soleLeaderId(result));
    if (!group || !isNumber(result.margin)) return NO_DATA_PAINT;
    return {
      color: group.scale(Math.abs(result.margin)),
      noData: false,
      tie: false,
      group: group.key,
    };
  };

  let hasTie = false;
  let hasNoData = false;
  const used = new Set();
  for (const fips of configuredFips(election, config)) {
    const painted = paint(resultFor(election, fips));
    if (painted.noData) hasNoData = true;
    else if (painted.tie) hasTie = true;
    else used.add(painted.group);
  }

  const legendGroups = [...groups.values()]
    .filter((group) => group.always || used.has(group.key))
    .sort((a, b) => a.order - b.order || b.weight - a.weight);

  return {
    view: 'margin',
    paint,
    legend: {
      title: isPrimary ? 'Lead by candidate' : 'Lead by party',
      note: 'Lead is the leader’s share of the race minus the runner-up’s share, in percentage points.',
      groups: legendGroups.map((group) => ({
        title: group.title,
        items: group.scale.range().map((color, index) => ({
          color,
          label: group.bandLabels[index],
        })),
      })),
      extras: extrasFor(hasTie, hasNoData),
    },
  };
}

function partyGroupKey(party) {
  return party === 'D' || party === 'R' ? party : 'other';
}

function makeGroup(key, candidate, election, config) {
  let colors;
  let title;
  let bandLabels = BAND_WORDS;
  let order = 2;
  let weight = 0;
  if (key === 'D' || key === 'R') {
    colors = MARGIN_COLORS[key];
    title = key === 'D' ? 'Democratic lead' : 'Republican lead';
    bandLabels = [`${key}+0 to ${key}+5`, `${key}+5 to ${key}+10`, `${key}+10 to ${key}+20`, `${key}+20 or more`];
    order = key === 'D' ? 0 : 1;
  } else if (key === 'other') {
    colors = ramp(OTHER_PARTY_BASE);
    title = 'Other party lead';
  } else {
    colors = ramp(candidateBase(candidate, election, config));
    title = `${candidate.name} leads`;
    weight = isNumber(candidate.statewideVotes) ? candidate.statewideVotes : 0;
  }
  return {
    key,
    title,
    bandLabels,
    order,
    weight,
    always: key === 'D' || key === 'R',
    scale: d3.scaleThreshold().domain(MARGIN_BREAKS).range(colors),
  };
}

function candidateColorMap(election, config) {
  const merged = { ...(election.candidateColors ?? {}) };
  const configured = config?.candidateColors;
  if (configured && typeof configured === 'object') {
    const perElection = configured[election.electionId];
    if (perElection && typeof perElection === 'object') Object.assign(merged, perElection);
    else {
      for (const [id, color] of Object.entries(configured)) {
        if (typeof color === 'string') merged[id] = color;
      }
    }
  }
  const entry = config?.elections?.find((item) => item.id === election.electionId);
  if (entry?.candidateColors && typeof entry.candidateColors === 'object') {
    Object.assign(merged, entry.candidateColors);
  }
  return merged;
}

function candidateBase(candidate, election, config) {
  const color = d3.color(candidateColorMap(election, config)[candidate.id] ?? '');
  if (color) {
    const lab = d3.lab(color);
    return { a: lab.a, b: lab.b };
  }
  const index = Math.max(0, election.candidates.findIndex((item) => item.id === candidate.id));
  const lab = d3.lab(FALLBACK_CANDIDATE_COLORS[index % FALLBACK_CANDIDATE_COLORS.length]);
  return { a: lab.a, b: lab.b };
}

/** Four shades of one hue, light to dark, each at least 3:1 against white. */
function ramp({ a, b }) {
  return RAMP_LIGHTNESS.map((lightness) => {
    let l = lightness;
    let hex = d3.lab(l, a, b).formatHex();
    while (contrastWithWhite(hex) < 3 && l > 5) {
      l -= 2;
      hex = d3.lab(l, a, b).formatHex();
    }
    return hex;
  });
}

export function contrastWithWhite(hex) {
  const { r, g, b } = d3.rgb(hex);
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return 1.05 / (luminance + 0.05);
}

// --------------------------------------------------------------- turnout

let turnoutColors = null;

/** Six shades from #8C7BB8 to #2B1A57, interpolated in Lab (Design Table 8). */
export function getTurnoutColors() {
  turnoutColors ??= d3
    .quantize(d3.interpolateLab(TURNOUT_LOW, TURNOUT_HIGH), TURNOUT_STEPS)
    .map((color) => d3.color(color).formatHex());
  return turnoutColors;
}

function buildTurnout(election, config) {
  const values = [];
  let hasNoData = false;
  for (const fips of configuredFips(election, config)) {
    const result = resultFor(election, fips);
    if (result && isNumber(result.turnout)) values.push(result.turnout);
    else hasNoData = true;
  }

  const [min, max] = values.length ? d3.extent(values) : [null, null];
  const uniform = values.length > 0 && min === max;
  const TURNOUT_COLORS = getTurnoutColors();
  const scale = d3.scaleQuantize().domain(uniform ? [min, min + 1] : [min ?? 0, max ?? 1]).range(TURNOUT_COLORS);
  const uniformColor = TURNOUT_COLORS[3];

  const paint = (result) => {
    if (!result || !isNumber(result.turnout)) return NO_DATA_PAINT;
    return { color: uniform ? uniformColor : scale(result.turnout), noData: false, tie: false };
  };

  let items = [];
  if (uniform) {
    items = [{ color: uniformColor, label: `${formatPercent(min)} (every county with data)` }];
  } else if (values.length) {
    items = TURNOUT_COLORS.map((color) => {
      const [low, high] = scale.invertExtent(color);
      return { color, label: `${formatPercent(low)} to ${formatPercent(high)}` };
    });
  }

  return {
    view: 'turnout',
    paint,
    legend: {
      title: 'Turnout',
      note: values.length
        ? 'Six equal ranges from the lowest to the highest county turnout in this election.'
        : '',
      groups: items.length ? [{ title: 'Ballots cast ÷ active registered voters', items }] : [],
      extras: extrasFor(false, hasNoData),
    },
  };
}

function extrasFor(hasTie, hasNoData) {
  const extras = [];
  if (hasTie) extras.push({ color: TIE_COLOR, label: TIE });
  if (hasNoData) extras.push({ color: NO_DATA_COLOR, label: NO_DATA, pattern: true });
  return extras;
}
