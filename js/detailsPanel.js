// C-10 detailsPanel.js: shows the selected county's figures and its results
// table (FR-3.2, FR-3.3), keeps the county across elections (FR-3.4), and
// handles Close; main.js returns focus to the county on the map (FR-3.5).

import { definitionToggle } from './about.js';
import { electionOptionLabel } from './controls.js';
import {
  NO_DATA,
  candidatesByVotes,
  countyName,
  formatCount,
  formatPercent,
  h,
  hasRaceData,
  isNumber,
  isTie,
  joinNames,
  marginText,
  partyName,
  soleLeaderId,
  topCandidateIds,
} from './format.js';
import { NO_COUNTY_RESULTS_TEXT, NO_RACE_RESULTS_TEXT } from './messages.js';
import { resultFor } from './scales.js';
import { electionEntry } from './store.js';

const SCROLL_AFTER_ROWS = 10;

export function createDetailsPanel(section, { onClose }) {
  let lastKey = null;
  let heading = null;

  function stat(label, value, definitionKey, definitions) {
    let button = null;
    if (definitionKey) {
      const toggle = definitionToggle(definitionKey);
      button = toggle.button;
      definitions.push(toggle.panel);
    }
    return h('div', { class: 'stat' }, h('dt', {}, label, button ? ' ' : null, button), h('dd', {}, value));
  }

  function renderEmpty() {
    section.dataset.empty = 'true';
    heading = h('h2', { id: 'details-heading', class: 'section-heading', tabindex: '-1' }, 'County details');
    section.replaceChildren(
      heading,
      h('p', { class: 'details-hint' }, 'Select a county on the map or in the county list to see its turnout and full results.'),
    );
  }

  function renderCounty(state, data) {
    section.dataset.empty = 'false';
    const county = data.config.counties.find((item) => item.fips === state.selectedFips);
    const name = countyName(county?.name ?? state.selectedFips);
    const entry = electionEntry(data.config, state.electionId);
    const result = resultFor(data.election, state.selectedFips);

    heading = h('h2', { id: 'details-heading', class: 'section-heading', tabindex: '-1' }, name);
    const close = h('button', { type: 'button', class: 'button close-button', 'aria-label': `Close ${name} details` }, 'Close');
    close.addEventListener('click', () => onClose());

    const parts = [
      h('div', { class: 'details-head' }, heading, close),
      h('p', { class: 'details-election' }, entry ? electionOptionLabel(entry) : data.election.label),
    ];

    if (!result) {
      parts.push(h('p', { class: 'no-data-message' }, NO_COUNTY_RESULTS_TEXT));
      section.replaceChildren(...parts);
      return;
    }

    const definitions = [];
    parts.push(
      h(
        'dl',
        { class: 'stat-grid' },
        stat('Turnout', formatPercent(result.turnout), 'turnout', definitions),
        stat('Ballots cast', formatCount(result.ballotsCast)),
        stat('Active registered voters', formatCount(result.activeVoters), 'activeVoters', definitions),
      ),
      ...definitions,
    );

    if (!hasRaceData(result)) {
      parts.push(h('p', { class: 'no-data-message' }, NO_RACE_RESULTS_TEXT));
      section.replaceChildren(...parts);
      return;
    }

    parts.push(resultsTable(data.election, result, name, entry?.race ?? data.election.race));

    const marginToggle = definitionToggle('margin');
    parts.push(
      h('p', { class: 'margin-line' }, 'Margin ', marginToggle.button, ': ', h('strong', {}, marginSummary(data.election, result))),
      marginToggle.panel,
    );
    section.replaceChildren(...parts);
  }

  return {
    render(state, data) {
      if (!data.config || !data.election) return;
      const key = state.selectedFips ? `${state.selectedFips}|${data.election.electionId}|${data.config.abbr}|${data.election.buildId ?? data.election.builtAt}` : 'empty';
      if (key === lastKey) return;
      lastKey = key;
      const hadFocus = section.contains(document.activeElement);
      if (state.selectedFips) renderCounty(state, data);
      else renderEmpty();
      if (hadFocus && state.selectedFips) heading.focus({ preventScroll: true });
    },
    /** Moves focus to the panel heading, e.g. after choosing from the county list. */
    focusHeading() {
      heading?.focus();
    },
  };
}

function resultsTable(election, result, name, race) {
  const tie = isTie(result);
  const tied = new Set(tie ? topCandidateIds(result) : []);
  const leader = soleLeaderId(result);
  const rows = candidatesByVotes(election, result).map((candidate) => {
    const votes = result.votes?.[candidate.id];
    const share = result.shares?.[candidate.id];
    let tag = null;
    if (tied.has(candidate.id)) tag = h('span', { class: 'leader-tag' }, 'Tied for lead');
    else if (candidate.id === leader) tag = h('span', { class: 'leader-tag' }, 'Leader');
    return h(
      'tr',
      { class: tag ? 'is-leader' : null },
      h('th', { scope: 'row' }, h('span', { class: 'candidate-name' }, candidate.name), tag ? ' ' : null, tag),
      h('td', {}, partyName(candidate.party)),
      h('td', { class: 'num' }, isNumber(votes) ? formatCount(votes) : NO_DATA),
      h('td', { class: 'num' }, formatPercent(share)),
    );
  });

  const table = h(
    'table',
    { class: 'results-table' },
    h('caption', {}, `${race ? `${race} results` : 'Results'} in ${name}, sorted by votes`),
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', { scope: 'col' }, 'Candidate'),
        h('th', { scope: 'col' }, 'Party'),
        h('th', { scope: 'col', class: 'num' }, 'Votes'),
        h('th', { scope: 'col', class: 'num' }, 'Share'),
      ),
    ),
    h('tbody', {}, rows),
    h(
      'tfoot',
      {},
      h(
        'tr',
        {},
        h('th', { scope: 'row', colspan: '2' }, 'Total votes in this race'),
        h('td', { class: 'num' }, formatCount(result.raceTotal)),
        h('td', { class: 'num' }, '100.0%'),
      ),
    ),
  );
  if (rows.length <= SCROLL_AFTER_ROWS) return h('div', { class: 'table-wrap' }, table);
  return h('div', { class: 'table-wrap table-scroll', tabindex: '0', role: 'region', 'aria-label': `${name} results table, scrollable` }, table);
}

function marginSummary(election, result) {
  if (!isTie(result)) return marginText(result, election);
  const names = topCandidateIds(result).map((id) => election.candidates.find((c) => c.id === id)?.name ?? id);
  return `Tie between ${joinNames(names)}`;
}
