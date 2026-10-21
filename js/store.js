// C-2 store.js: the one place view state changes (Design 6.2). A change that
// needs a file waits for the Data Loader, then every subscriber redraws once,
// so the map, legend, panel and status line always agree (FR-3.4, NFR-3.2).
//
// Race safety: requested changes accumulate in `pending` until committed, and
// only the newest request may commit, so a slow response can never overwrite a
// newer choice and a later view toggle never drops an earlier election choice.
// A failed load leaves the committed state and data untouched and remembers the
// intended changes, which retry() requests again (FR-6.1).

import { LoadError, RevisionError } from './dataLoader.js';

export const VIEWS = ['margin', 'turnout'];

/** Published, certified elections, newest first; config order breaks ties. */
export function electionsNewestFirst(config) {
  const list = (config?.elections ?? []).filter((entry) => entry && entry.id && entry.certified !== false);
  return list
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => String(b.entry.date ?? '').localeCompare(String(a.entry.date ?? '')) || a.index - b.index)
    .map(({ entry }) => entry);
}

/** Newest general election, or the newest election when there is no general (FR-2.1). */
export function defaultElection(config) {
  const list = electionsNewestFirst(config);
  return list.find((entry) => entry.type === 'general') ?? list[0] ?? null;
}

export function electionEntry(config, id) {
  return electionsNewestFirst(config).find((entry) => entry.id === id) ?? null;
}

export function createStore({ loader }) {
  let committed = Object.freeze({
    stateAbbr: null,
    electionId: null,
    view: 'margin',
    party: null,
    selectedFips: null,
    loadStatus: 'loading',
    error: null,
  });
  let data = Object.freeze({ states: null, config: null, geo: null, election: null });
  let pending = {};
  let failed = null;
  let ticketCounter = 0;
  let reloadBundle = false;
  const subscribers = new Set();

  function notify() {
    for (const subscriber of subscribers) {
      try {
        subscriber(committed, data);
      } catch (error) {
        console.error('A view failed to render', error);
      }
    }
  }

  function commit(next, nextData) {
    committed = Object.freeze({ ...next, loadStatus: 'ready', error: null });
    data = Object.freeze(nextData);
    pending = {};
    failed = null;
    reloadBundle = false;
    notify();
  }

  function sanitize(changes) {
    const clean = { ...changes };
    if ('view' in clean && !VIEWS.includes(clean.view)) delete clean.view;
    if ('selectedFips' in clean && clean.selectedFips !== null && typeof clean.selectedFips !== 'string') {
      delete clean.selectedFips;
    }
    return clean;
  }

  async function resolve() {
    const ticket = ++ticketCounter;
    const target = { ...committed, ...pending };

    const loaded = Boolean(data.config && data.election);
    const sameState = loaded && target.stateAbbr === committed.stateAbbr;
    if (sameState && !reloadBundle && target.electionId === committed.electionId) {
      commit(target, data);
      return;
    }

    if (committed.loadStatus !== 'loading' || committed.error) {
      committed = Object.freeze({ ...committed, loadStatus: 'loading', error: null });
      notify();
    }

    try {
      const states = data.states ?? (await loader.getStates());
      const known = states.states.some((state) => state.abbr === target.stateAbbr);
      const abbr = known ? target.stateAbbr : states.states[0].abbr;
      const stateChanged = reloadBundle || !data.config || abbr !== committed.stateAbbr;
      const bundle = stateChanged ? await loader.getStateBundle(abbr) : { config: data.config, geo: data.geo };

      const entry = electionEntry(bundle.config, target.electionId) ?? defaultElection(bundle.config);
      if (!entry) throw new LoadError('No elections are published for this state yet', `data/${abbr}/config.json`);
      const election =
        !stateChanged && entry.id === committed.electionId && data.election
          ? data.election
          : await loader.getElection(abbr, entry.id, bundle.config.buildId);

      if (ticket !== ticketCounter) return; // a newer request owns `pending` now

      const fipsKnown = bundle.config.counties.some((county) => county.fips === target.selectedFips);
      commit(
        {
          ...target,
          stateAbbr: abbr,
          electionId: entry.id,
          party: entry.party ?? null,
          // A county stays selected across elections even with no record (FR-3.4).
          selectedFips: fipsKnown ? target.selectedFips : null,
        },
        { states, config: bundle.config, geo: bundle.geo, election },
      );
    } catch (error) {
      if (ticket !== ticketCounter) return;
      if (error instanceof RevisionError) reloadBundle = true;
      console.error(error);
      failed = pending;
      pending = {};
      committed = Object.freeze({ ...committed, loadStatus: 'error', error });
      notify();
    }
  }

  return {
    getState: () => committed,
    getData: () => data,
    /** Committed state with requested but unfinished changes applied. */
    getIntended: () => ({ ...committed, ...pending }),
    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    setState(changes) {
      pending = { ...pending, ...sanitize(changes) };
      return resolve();
    },
    /** Requests the failed files again for the action the user intended. */
    retry() {
      if (failed) pending = { ...failed, ...pending };
      failed = null;
      return resolve();
    },
  };
}
