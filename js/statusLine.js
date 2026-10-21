// C-9 statusLine.js: writes "Colorado, 2024 General Election, President, Margin
// view" into the role="status" element (FR-2.5). Text changes only when the
// committed view changes, so screen readers announce each change once.

import { electionEntry } from './store.js';
import { partyName } from './format.js';

export function statusText(state, data) {
  if (!data.config || !data.election) return '';
  const entry = electionEntry(data.config, state.electionId);
  const label = entry?.label ?? data.election.label ?? state.electionId;
  const race = entry?.race ?? data.election.race;
  const view = state.view === 'turnout' ? 'Turnout' : 'Margin';
  const party = entry?.type === 'primary' && entry.party ? partyName(entry.party) : null;
  const partyContext = party && !label.toLowerCase().includes(party.toLowerCase()) ? `${party} primary` : null;
  return [data.config.name, label, partyContext, race, `${view} view`].filter(Boolean).join(', ');
}

export function createStatusLine(element) {
  return {
    render(state, data) {
      let text = statusText(state, data);
      if (!text) text = state.loadStatus === 'error' ? 'The map could not be loaded.' : 'Loading election data…';
      if (element.textContent !== text) element.textContent = text;
    },
  };
}
