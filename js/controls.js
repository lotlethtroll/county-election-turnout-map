// C-8 controls.js: builds the election, view, party and state controls and
// shows or hides the conditional ones (FR-2.1, FR-2.2, FR-2.4, FR-2.6).
// Primary contests for the same date and race share one election option; the
// party selector then chooses the contest.

import { h, partyName } from './format.js';
import { electionEntry, electionsNewestFirst } from './store.js';

export function electionGroups(config) {
  const groups = [];
  const byKey = new Map();
  for (const entry of electionsNewestFirst(config)) {
    const key = entry.type === 'primary' ? `primary|${entry.date}|${entry.race}` : `election|${entry.id}`;
    if (!byKey.has(key)) {
      const group = { key, entries: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).entries.push(entry);
  }
  return groups;
}

export function electionOptionLabel(entry) {
  const label = String(entry.label ?? entry.id);
  return entry.race && !label.toLowerCase().includes(String(entry.race).toLowerCase())
    ? `${label}, ${entry.race}`
    : label;
}

function groupLabel(group) {
  if (group.entries.length === 1) return electionOptionLabel(group.entries[0]);
  const [first] = group.entries;
  const year = /^\d{4}/.exec(String(first.date ?? ''))?.[0];
  return [year ? `${year} Primary Election` : 'Primary Election', first.race].filter(Boolean).join(', ');
}

export function createControls({ store, stateField, stateSelect, electionSelect, partyField, partySelect, viewButtons }) {
  let groups = [];
  let lastConfig = null;
  let lastStates = null;

  const groupFor = (electionId) => groups.find((group) => group.entries.some((entry) => entry.id === electionId));

  stateSelect.addEventListener('change', () => {
    store.setState({ stateAbbr: stateSelect.value, electionId: null, party: null, selectedFips: null });
  });

  electionSelect.addEventListener('change', () => {
    const group = groups.find((item) => item.key === electionSelect.value);
    if (!group) return;
    const { party } = store.getIntended();
    const entry = group.entries.find((item) => item.party && item.party === party) ?? group.entries[0];
    store.setState({ electionId: entry.id });
  });

  partySelect.addEventListener('change', () => {
    store.setState({ electionId: partySelect.value });
  });

  for (const button of viewButtons) {
    button.addEventListener('click', () => store.setState({ view: button.dataset.view }));
  }

  function rebuildStates(states) {
    const list = states?.states ?? [];
    stateSelect.replaceChildren(...list.map((item) => h('option', { value: item.abbr }, item.name ?? item.abbr)));
    stateField.hidden = list.length < 2;
  }

  function rebuildElections(config) {
    groups = electionGroups(config);
    electionSelect.replaceChildren(...groups.map((group) => h('option', { value: group.key }, groupLabel(group))));
  }

  return {
    render(state, data) {
      if (data.states !== lastStates) {
        lastStates = data.states;
        rebuildStates(data.states);
      }
      if (data.config !== lastConfig) {
        lastConfig = data.config;
        rebuildElections(data.config);
      }
      const ready = Boolean(data.config && data.election);
      electionSelect.disabled = !ready;
      stateSelect.disabled = !ready;

      // While a load is in flight keep showing the user's choice; once it
      // commits or fails, show the committed state.
      if (state.loadStatus !== 'loading') {
        if (state.stateAbbr) stateSelect.value = state.stateAbbr;
        const group = groupFor(state.electionId);
        if (group) electionSelect.value = group.key;
        const contests = group?.entries.filter((entry) => entry.type === 'primary') ?? [];
        if (contests.length) {
          partySelect.replaceChildren(
            ...contests.map((entry) =>
              h('option', { value: entry.id }, entry.party ? partyName(entry.party) : electionOptionLabel(entry)),
            ),
          );
          partySelect.value = state.electionId;
        }
        partyField.hidden = contests.length === 0 || electionEntry(data.config, state.electionId)?.type !== 'primary';
      }

      for (const button of viewButtons) {
        button.setAttribute('aria-pressed', String(button.dataset.view === state.view));
        button.disabled = !ready;
      }
    },
  };
}
