// C-1 main.js: starts the app. It creates the Data Loader and the store, builds
// every view, and asks the store for the first state, which loads states.json,
// that state's configuration and county shapes, and its newest general
// election (FR-2.1, NFR-3.1). Escape handling lives here because it spans the
// tooltip and the details panel.

import { createAbout } from './about.js';
import { createControls } from './controls.js';
import { createCountyList } from './countyList.js';
import { createDataLoader } from './dataLoader.js';
import { createDetailsPanel } from './detailsPanel.js';
import { countyName } from './format.js';
import { createLegend } from './legend.js';
import { createMapView } from './mapView.js';
import { createAnnouncer, createLoadError } from './messages.js';
import { createStatusLine } from './statusLine.js';
import { createStore } from './store.js';
import { createSummary } from './summary.js';
import { createTooltip } from './tooltip.js';

const $ = (selector) => document.querySelector(selector);
const wideLayout = window.matchMedia('(min-width: 960px)');

function start() {
  const frame = $('#map-frame');

  // D3 is vendored and served by this site; if it did not arrive, only a
  // fresh page load can fetch it again.
  if (!globalThis.d3) {
    createLoadError(frame, { onRetry: () => window.location.reload() }).render({ loadStatus: 'error' });
    $('#status-line').textContent = 'The map could not be loaded.';
    return;
  }

  const store = createStore({ loader: createDataLoader() });
  const announcer = createAnnouncer();
  const tooltip = createTooltip(frame);

  const countyLabel = (fips) =>
    countyName(store.getData().config?.counties.find((county) => county.fips === fips)?.name ?? fips);

  function closeDetails() {
    const fips = store.getState().selectedFips;
    if (!fips) return;
    tooltip.hide();
    store.setState({ selectedFips: null });
    if (!map.focusCounty(fips)) $('#map-heading').focus();
  }

  const map = createMapView({
    frame,
    tooltip,
    onSelect(fips) {
      store.setState({ selectedFips: fips });
      const where = wideLayout.matches ? 'beside' : 'below';
      announcer.say(`${countyLabel(fips)} selected. Details are shown ${where} the map.`);
    },
  });

  const details = createDetailsPanel($('#details'), { onClose: closeDetails });

  const views = [
    createControls({
      store,
      stateField: $('#state-field'),
      stateSelect: $('#state-select'),
      electionSelect: $('#election-select'),
      partyField: $('#party-field'),
      partySelect: $('#party-select'),
      viewButtons: [...document.querySelectorAll('[data-view]')],
    }),
    createStatusLine($('#status-line')),
    map,
    createLegend($('#legend')),
    createSummary($('#summary')),
    details,
    createCountyList($('#county-list'), {
      async onChoose(fips) {
        await store.setState({ selectedFips: fips });
        if (store.getState().selectedFips === fips) details.focusHeading();
      },
    }),
    createAbout({ section: $('#about'), footer: $('#site-footer') }),
    createLoadError(frame, { onRetry: () => store.retry() }),
  ];

  for (const view of views) {
    store.subscribe((state, data) => view.render(state, data));
    view.render(store.getState(), store.getData());
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' && event.key !== 'Esc') return;
    if (tooltip.isVisible()) {
      tooltip.dismiss();
      event.preventDefault();
      return;
    }
    const { target } = event;
    if (target instanceof HTMLSelectElement) return;
    if (target instanceof HTMLInputElement && target.value) return; // let the search box clear itself
    if (store.getState().selectedFips) {
      event.preventDefault();
      closeDetails();
    }
  });

  store.setState({});
}

start();
