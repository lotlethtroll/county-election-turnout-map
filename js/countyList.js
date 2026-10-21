// C-11 countyList.js: a searchable list of every county with its value in the
// current view as text, and a large target for counties that are small on the
// map (FR-3.1, NFR-1.5).

import { countyName, h, viewValueText } from './format.js';
import { swatch } from './legend.js';
import { getScale, resultFor } from './scales.js';

const normalize = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export function createCountyList(section, { onChoose }) {
  const heading = h('h2', { id: 'list-heading', class: 'section-heading' }, 'Counties');
  const search = h('input', {
    id: 'county-search',
    type: 'search',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-describedby': 'county-count',
  });
  const count = h('p', { id: 'county-count', class: 'list-count', 'aria-live': 'polite' });
  const list = h('ul', { class: 'county-list', role: 'list' });
  const empty = h('p', { class: 'list-empty', hidden: true }, 'No county matches that name.');
  section.append(
    heading,
    h('div', { class: 'search-row' }, h('label', { for: 'county-search' }, 'Find a county'), search),
    count,
    list,
    empty,
  );

  let config = null;
  let rows = [];
  let lastValuesKey = null;
  let selected = null;

  search.addEventListener('input', () => applyFilter(true));

  function applyFilter(announce) {
    const query = normalize(search.value);
    let shown = 0;
    for (const row of rows) {
      const match = !query || row.terms.some((term) => term.includes(query));
      row.item.hidden = !match;
      if (match) shown += 1;
    }
    empty.hidden = shown > 0;
    const text = query ? `${shown} of ${rows.length} counties shown` : `${rows.length} counties`;
    if (announce || count.textContent !== text) count.textContent = text;
  }

  function build(nextConfig) {
    config = nextConfig;
    rows = [...config.counties]
      .map((county) => ({ county, label: countyName(county.name) }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(({ county, label }) => {
        const mark = swatch(null);
        const value = h('span', { class: 'county-value' });
        const button = h(
          'button',
          { type: 'button', class: 'county-button', 'aria-pressed': 'false' },
          mark,
          h('span', { class: 'county-name' }, label),
          value,
        );
        button.addEventListener('click', () => onChoose(county.fips));
        return {
          fips: county.fips,
          button,
          mark,
          value,
          item: h('li', {}, button),
          terms: [county.name, label, ...(county.aliases ?? [])].map(normalize),
        };
      });
    list.replaceChildren(...rows.map((row) => row.item));
    lastValuesKey = null;
    selected = null;
    applyFilter(false);
  }

  return {
    render(state, data) {
      if (!data.config || !data.election) return;
      if (data.config !== config) build(data.config);

      const valuesKey = `${data.election.electionId}|${state.view}`;
      if (valuesKey !== lastValuesKey) {
        lastValuesKey = valuesKey;
        const scale = getScale(data.election, state.view, data.config);
        for (const row of rows) {
          const result = resultFor(data.election, row.fips);
          const painted = scale.paint(result);
          row.mark.className = painted.noData ? 'swatch swatch-no-data' : 'swatch';
          row.mark.style.backgroundColor = painted.noData ? '' : painted.color;
          row.value.textContent = viewValueText(result, state.view, data.election);
        }
      }

      if (state.selectedFips !== selected) {
        selected = state.selectedFips;
        for (const row of rows) row.button.setAttribute('aria-pressed', String(row.fips === selected));
      }
    },
  };
}
