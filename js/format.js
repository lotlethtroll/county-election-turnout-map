// C-14 format.js: formats numbers, percentages, dates and margin labels the
// same way everywhere (FR-1.4, FR-3.2), and reads leader/tie facts from a
// Result record. Also holds the tiny DOM builder the views share.

export const NO_DATA = 'No data';
export const TIE = 'Tie';

const countFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const longDate = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

const PARTY_NAMES = {
  D: 'Democratic',
  R: 'Republican',
  LIB: 'Libertarian',
  GRN: 'Green',
  UNA: 'Unaffiliated',
  IND: 'Independent',
};

export function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function formatCount(value) {
  return isNumber(value) ? countFormat.format(value) : NO_DATA;
}

export function formatOneDecimal(value) {
  return isNumber(value) ? oneDecimal.format(value) : NO_DATA;
}

export function formatPercent(value) {
  return isNumber(value) ? `${oneDecimal.format(value)}%` : NO_DATA;
}

/** "2026-10-10" or an ISO timestamp -> "October 10, 2026". */
export function formatDate(value) {
  if (typeof value !== 'string' || !value) return '';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? value : longDate.format(date);
}

/** County display name: "Adams" -> "Adams County"; keeps names that already carry a type. */
export function countyName(name) {
  const text = String(name ?? '').trim();
  if (!text) return 'Unknown county';
  return /\b(county|parish|borough|census area|municipality|city)$/i.test(text)
    ? text
    : `${text} County`;
}

export function partyName(code) {
  if (code === null || code === undefined || code === '') return 'No party listed';
  return PARTY_NAMES[code] ?? String(code);
}

export function partyLabel(code) {
  const name = partyName(code);
  return PARTY_NAMES[code] && code !== name ? `${name} (${code})` : name;
}

/** True when the record has a positive race total, so shares and margins exist. */
export function hasRaceData(result) {
  return Boolean(result) && isNumber(result.raceTotal) && result.raceTotal > 0;
}

/**
 * Candidate IDs holding the top vote count. Exact integer equality, never a
 * rounded comparison. Empty when nobody has votes.
 */
export function topCandidateIds(result) {
  if (!result || !result.votes) return [];
  let max = 0;
  for (const votes of Object.values(result.votes)) {
    if (isNumber(votes) && votes > max) max = votes;
  }
  if (max <= 0) return [];
  return Object.keys(result.votes).filter((id) => result.votes[id] === max);
}

export function isTie(result) {
  if (!hasRaceData(result)) return false;
  return topCandidateIds(result).length > 1 || result.marginLabel === TIE;
}

/** The sole leader's candidate ID, or null for a tie or no data. */
export function soleLeaderId(result) {
  if (!hasRaceData(result) || isTie(result)) return null;
  if (typeof result.leaderId === 'string' && result.leaderId) return result.leaderId;
  const top = topCandidateIds(result);
  return top.length === 1 ? top[0] : null;
}

export function candidateById(election, id) {
  return election?.candidates?.find((candidate) => candidate.id === id) ?? null;
}

/** Margin text for display: "D+4.2", "Tie" or "No data". */
export function marginText(result, election) {
  if (!hasRaceData(result)) return NO_DATA;
  if (isTie(result)) return TIE;
  if (typeof result.marginLabel === 'string' && result.marginLabel) return result.marginLabel;
  const leader = candidateById(election, soleLeaderId(result));
  if (!leader || !isNumber(result.margin)) return NO_DATA;
  const prefix = election?.type === 'primary' ? leader.name : leader.party ?? leader.name;
  return `${prefix}+${formatOneDecimal(result.margin)}`;
}

/** The value a county shows in the current view, as text. */
export function viewValueText(result, view, election) {
  if (!result) return NO_DATA;
  return view === 'turnout' ? formatPercent(result.turnout) : marginText(result, election);
}

/** Candidates sorted by votes in this result, highest first, then by name. */
export function candidatesByVotes(election, result) {
  const votesOf = (candidate) => {
    const votes = result?.votes?.[candidate.id];
    return isNumber(votes) ? votes : -1;
  };
  return [...(election?.candidates ?? [])].sort(
    (a, b) => votesOf(b) - votesOf(a) || String(a.name).localeCompare(String(b.name)),
  );
}

/** "A and B" / "A, B and C". */
export function joinNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Minimal element builder. Children may be strings, nodes, arrays or null.
 * Text always goes through text nodes, never innerHTML.
 */
export function h(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') element.className = value;
    else if (key === 'text') element.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else element.setAttribute(key, value === true ? '' : String(value));
  }
  appendChildren(element, children);
  return element;
}

function appendChildren(element, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) appendChildren(element, child);
    else element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}
