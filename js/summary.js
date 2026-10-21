// C-12 summary.js: statewide turnout, leader and margin from the election
// file's statewide record (FR-1.5). Values were calculated from county totals
// and checked against official statewide figures by the build.

import { definitionToggle } from './about.js';
import {
  NO_DATA,
  candidateById,
  formatCount,
  formatPercent,
  h,
  hasRaceData,
  isTie,
  joinNames,
  marginText,
  partyName,
  soleLeaderId,
  topCandidateIds,
} from './format.js';

export function createSummary(section) {
  const heading = h('h2', { id: 'summary-heading', class: 'section-heading' }, 'Statewide');
  const body = h('div', { class: 'summary-body' });
  section.append(heading, body);
  let lastKey = null;

  return {
    render(state, data) {
      if (!data.config || !data.election) return;
      const key = `${data.config.abbr}|${data.election.electionId}|${data.election.buildId ?? data.election.builtAt}`;
      if (key === lastKey) return;
      lastKey = key;

      const { election } = data;
      const statewide = election.statewide;
      heading.textContent = `Statewide: ${statewide?.name ?? data.config.name}`;
      if (!statewide) {
        body.replaceChildren(h('p', { class: 'no-data-message' }, NO_DATA));
        return;
      }

      const definitions = [];
      const row = (label, value, definitionKey) => {
        let button = null;
        if (definitionKey) {
          const toggle = definitionToggle(definitionKey);
          button = toggle.button;
          definitions.push(toggle.panel);
        }
        return h('div', { class: 'stat' }, h('dt', {}, label, button ? ' ' : null, button), h('dd', {}, value));
      };

      body.replaceChildren(
        h(
          'dl',
          { class: 'stat-grid' },
          row('Turnout', formatPercent(statewide.turnout), 'turnout'),
          row('Ballots cast', formatCount(statewide.ballotsCast)),
          row('Active registered voters', formatCount(statewide.activeVoters), 'activeVoters'),
          row('Leader', leaderText(election, statewide)),
          row('Margin', hasRaceData(statewide) ? marginText(statewide, election) : NO_DATA, 'margin'),
        ),
        ...definitions,
      );
    },
  };
}

function leaderText(election, result) {
  if (!hasRaceData(result)) return NO_DATA;
  if (isTie(result)) {
    const names = topCandidateIds(result).map((id) => candidateById(election, id)?.name ?? id);
    return `Tie between ${joinNames(names)}`;
  }
  const leader = candidateById(election, soleLeaderId(result));
  if (!leader) return NO_DATA;
  const share = result.shares?.[leader.id];
  const party = election.type === 'primary' || !leader.party ? '' : ` (${partyName(leader.party)})`;
  return `${leader.name}${party}, ${formatPercent(share)}`;
}
