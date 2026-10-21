// C-5 mapView.js: draws the county paths, applies fills, refits the projection
// whenever the map area changes size, and runs roving focus (FR-1.1, FR-1.2,
// FR-3.1, FR-6.2, NFR-1.4). The whole map is one Tab stop; the arrow keys move
// between counties in alphabetical order.

import { countyName, h, viewValueText } from './format.js';
import { NO_DATA_COLOR, NO_DATA_STRIPE, getScale, resultFor } from './scales.js';

const d3 = globalThis.d3;
const PATTERN_ID = 'cetm-no-data-pattern';
const PAD = 8;
const MIN_HEIGHT = 200;

export function createMapView({ frame, tooltip, onSelect }) {
  const instructions = h(
    'p',
    { id: 'map-instructions', class: 'visually-hidden' },
    'Counties are in alphabetical order. Use the arrow keys to move between counties, Home and End to jump to the first and last county, and Enter or Space to show a county’s details.',
  );
  const placeholder = h('p', { class: 'map-placeholder' }, 'Loading map…');
  frame.prepend(instructions, placeholder);

  const svg = d3
    .select(frame)
    .insert('svg', '.map-tooltip')
    .attr('class', 'map-svg')
    .attr('role', 'group')
    .attr('aria-describedby', 'map-instructions')
    .attr('focusable', 'false');
  const pattern = svg
    .append('defs')
    .append('pattern')
    .attr('id', PATTERN_ID)
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', 6)
    .attr('height', 6)
    .attr('patternTransform', 'rotate(45)');
  pattern.append('rect').attr('width', 6).attr('height', 6).attr('fill', NO_DATA_COLOR);
  pattern.append('rect').attr('width', 2).attr('height', 6).attr('fill', NO_DATA_STRIPE);

  const countyLayer = svg.append('g').attr('class', 'counties');
  const overlay = svg.append('g').attr('class', 'map-overlay').attr('aria-hidden', 'true');
  const hoverPath = overlay.append('path').attr('class', 'outline-hover');
  const selectedRing = overlay.append('path').attr('class', 'outline-selected-ring');
  const selectedLine = overlay.append('path').attr('class', 'outline-selected');
  const focusRing = overlay.append('path').attr('class', 'outline-focus-ring');
  const focusLine = overlay.append('path').attr('class', 'outline-focus');

  let geo = null;
  let config = null;
  let state = null;
  let data = null;
  let features = [];
  let byFips = new Map();
  let order = [];
  let activeFips = null;
  let lastSelected = null;
  let hoverFips = null;
  let focusFips = null;
  let pointerFocus = false;
  let width = 0;
  let pathGen = null;

  // ------------------------------------------------------------- geometry

  function setGeometry(nextGeo, nextConfig) {
    geo = nextGeo;
    config = nextConfig;
    const names = new Map(config.counties.map((county) => [String(county.fips), county.name]));
    features = [];
    for (const feature of geo.features) {
      const fips = String(feature?.properties?.fips ?? '');
      if (!names.has(fips) || !feature.geometry) {
        console.warn(`Skipping a county shape that is not in the configuration: ${fips || '(no FIPS)'}`);
        continue;
      }
      features.push({
        type: 'Feature',
        properties: { fips, name: names.get(fips) },
        geometry: rewind(feature.geometry),
      });
    }
    features.sort((a, b) => countyName(a.properties.name).localeCompare(countyName(b.properties.name)));
    order = features.map((feature) => feature.properties.fips);
    byFips = new Map();
    activeFips = null;
    lastSelected = null;

    countyLayer
      .selectAll('path.county')
      .data(features, (feature) => feature.properties.fips)
      .join(
        (enter) =>
          enter
            .append('path')
            .attr('class', 'county')
            .attr('role', 'button')
            .attr('tabindex', -1)
            .attr('data-fips', (feature) => feature.properties.fips)
            .each(function bind(feature) {
              wireCounty(this, feature.properties.fips);
            }),
        (update) => update,
        (exit) => exit.remove(),
      )
      .order()
      .attr('tabindex', -1)
      .each(function index(feature) {
        byFips.set(feature.properties.fips, this);
      });

    placeholder.hidden = true;
    width = 0;
    layout();
  }

  function layout() {
    if (!features.length) return;
    const nextWidth = Math.floor(frame.clientWidth);
    if (!nextWidth || nextWidth === width) return;
    width = nextWidth;
    const collection = { type: 'FeatureCollection', features };
    const projection = makeProjection(collection);
    projection.fitWidth(Math.max(1, width - PAD * 2), collection);
    const [[, top], [, bottom]] = d3.geoPath(projection).bounds(collection);
    const maxHeight = Math.max(260, Math.round(window.innerHeight * 0.72));
    const height = Math.round(Math.min(Math.max(bottom - top + PAD * 2, MIN_HEIGHT), maxHeight));
    projection.fitExtent(
      [
        [PAD, PAD],
        [width - PAD, height - PAD],
      ],
      collection,
    );
    pathGen = d3.geoPath(projection);
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
    countyLayer.selectAll('path.county').attr('d', pathGen);
    drawOverlays();
    // Keep an open tooltip inside the resized map, including after rotation.
    const tooltipFips = tooltip.currentKey();
    const tooltipCounty = byFips.get(tooltipFips);
    if (tooltipCounty) tooltip.showForElement(tooltipFips, content(tooltipFips), tooltipCounty);
  }

  let resizeFrame = 0;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(layout);
  });
  observer.observe(frame);

  // A tap or click anywhere outside the map closes a touch tooltip.
  document.addEventListener('pointerdown', (event) => {
    if (!frame.contains(event.target)) tooltip.hide();
  });

  // ---------------------------------------------------------- interaction

  function content(fips) {
    const county = config?.counties.find((item) => item.fips === fips);
    const result = resultFor(data?.election, fips);
    return {
      name: countyName(county?.name ?? fips),
      value: viewValueText(result, state?.view, data?.election),
    };
  }

  function wireCounty(element, fips) {
    element.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;
      hoverFips = fips;
      drawOverlays();
      tooltip.showAtPoint(fips, content(fips), event.clientX, event.clientY);
    });
    element.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'mouse') return;
      if (hoverFips === fips) hoverFips = null;
      drawOverlays();
      tooltip.resetDismissal(fips);
      if (tooltip.currentKey() === fips && focusFips !== fips) tooltip.scheduleHide();
    });
    element.addEventListener('pointerdown', (event) => {
      // Focus from a click should not move the tooltip away from the pointer.
      pointerFocus = true;
      setTimeout(() => {
        pointerFocus = false;
      }, 0);
      if (event.pointerType !== 'mouse') {
        tooltip.resetDismissal();
        tooltip.showAtPoint(fips, content(fips), event.clientX, event.clientY);
      }
    });
    element.addEventListener('click', () => select(fips, 'pointer'));
    element.addEventListener('focus', () => {
      setActive(fips);
      focusFips = fips;
      const fromPointer = pointerFocus;
      pointerFocus = false;
      drawOverlays();
      if (!fromPointer) tooltip.showForElement(fips, content(fips), element);
    });
    element.addEventListener('blur', () => {
      if (focusFips === fips) focusFips = null;
      drawOverlays();
      if (tooltip.currentKey() === fips && hoverFips !== fips) tooltip.hide();
    });
    element.addEventListener('keydown', (event) => onKeydown(event, fips));
  }

  function onKeydown(event, fips) {
    const index = order.indexOf(fips);
    let next = null;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = order[(index + 1) % order.length];
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = order[(index - 1 + order.length) % order.length];
        break;
      case 'Home':
        next = order[0];
        break;
      case 'End':
        next = order[order.length - 1];
        break;
      case 'Enter':
      case ' ':
      case 'Spacebar':
        event.preventDefault();
        select(fips, 'keyboard');
        return;
      default:
        return;
    }
    event.preventDefault();
    focusCounty(next);
  }

  function select(fips, source) {
    setActive(fips);
    onSelect(fips, source);
  }

  function setActive(fips) {
    if (!byFips.has(fips)) return;
    if (activeFips && activeFips !== fips) byFips.get(activeFips)?.setAttribute('tabindex', '-1');
    activeFips = fips;
    byFips.get(fips).setAttribute('tabindex', '0');
  }

  function focusCounty(fips) {
    const element = byFips.get(fips);
    if (!element) return false;
    setActive(fips);
    element.focus();
    return true;
  }

  function drawOverlays() {
    const pathFor = (fips) => (fips && pathGen && byFips.has(fips) ? pathGen(byFips.get(fips).__data__) : null);
    const focusVisible = focusFips && matchesFocusVisible(byFips.get(focusFips));
    hoverPath.attr('d', hoverFips !== state?.selectedFips ? pathFor(hoverFips) : null);
    const selected = pathFor(state?.selectedFips);
    selectedRing.attr('d', selected);
    selectedLine.attr('d', selected);
    const focused = focusVisible ? pathFor(focusFips) : null;
    focusRing.attr('d', focused);
    focusLine.attr('d', focused);
  }

  // --------------------------------------------------------------- render

  function render(nextState, nextData) {
    state = nextState;
    data = nextData;
    frame.classList.toggle('is-loading', state.loadStatus === 'loading' && Boolean(data.geo));
    frame.setAttribute('aria-busy', String(state.loadStatus === 'loading'));
    if (!data.geo || !data.config) {
      placeholder.hidden = state.loadStatus === 'error';
      return;
    }
    if (data.geo !== geo || data.config !== config) setGeometry(data.geo, data.config);
    if (!data.election) return;

    const scale = getScale(data.election, state.view, data.config);
    const viewName = state.view === 'turnout' ? 'Turnout' : 'Margin';
    svg.attr('aria-label', `Map of ${data.config.name} counties, ${viewName} view`);

    countyLayer.selectAll('path.county').each(function paint(feature) {
      const fips = feature.properties.fips;
      const result = resultFor(data.election, fips);
      const painted = scale.paint(result);
      this.setAttribute('fill', painted.noData ? `url(#${PATTERN_ID})` : painted.color);
      this.classList.toggle('is-no-data', painted.noData);
      this.setAttribute(
        'aria-label',
        `${countyName(feature.properties.name)}, ${viewValueText(result, state.view, data.election)}`,
      );
      this.setAttribute('aria-pressed', String(fips === state.selectedFips));
    });

    if (state.selectedFips !== lastSelected) {
      lastSelected = state.selectedFips;
      if (byFips.has(state.selectedFips)) setActive(state.selectedFips);
    }
    if (!byFips.has(activeFips) && order.length) setActive(order[0]);

    const key = tooltip.currentKey();
    if (key) tooltip.refresh(key, content(key));
    drawOverlays();
  }

  return { render, focusCounty };
}

/** Equal-area conic centered on the shapes; works for any state, including across the antimeridian. */
function makeProjection(collection) {
  const [[west, south], [east, north]] = d3.geoBounds(collection);
  let center = (west + east) / 2;
  if (east < west) center = ((west + east + 360) / 2 + 540) % 360 - 180;
  const span = north - south;
  return d3
    .geoConicEqualArea()
    .parallels([south + span / 6, north - span / 6])
    .rotate([-center, 0]);
}

/**
 * D3 expects clockwise exterior rings (the reverse of RFC 7946). A polygon whose
 * spherical area exceeds a hemisphere is wound the other way, so reverse it.
 */
function rewind(geometry) {
  const fix = (rings) => {
    const area = d3.geoArea({ type: 'Polygon', coordinates: rings });
    return area > 2 * Math.PI ? rings.map((ring) => [...ring].reverse()) : rings;
  };
  if (geometry.type === 'Polygon') return { type: 'Polygon', coordinates: fix(geometry.coordinates) };
  if (geometry.type === 'MultiPolygon') {
    return { type: 'MultiPolygon', coordinates: geometry.coordinates.map(fix) };
  }
  return geometry;
}

function matchesFocusVisible(element) {
  if (!element) return false;
  try {
    return element.matches(':focus-visible');
  } catch {
    return element === document.activeElement;
  }
}
