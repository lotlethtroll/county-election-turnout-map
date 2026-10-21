// C-6 legend.js: draws each shade with its range in words and numbers, read
// from the same C-4 scale the map uses, so legend and map always match (FR-1.3).

import { h } from './format.js';
import { getScale } from './scales.js';

export function swatch(color, pattern = false) {
  const element = h('span', { class: pattern ? 'swatch swatch-no-data' : 'swatch', 'aria-hidden': 'true' });
  if (!pattern && color) element.style.backgroundColor = color;
  return element;
}

export function createLegend(section) {
  const heading = h('h2', { id: 'legend-heading', class: 'section-heading' }, 'Legend');
  const body = h('div', { class: 'legend-body' });
  section.append(heading, body);
  let lastScale = null;

  function item({ color, label, pattern }) {
    return h('li', { class: 'legend-item' }, swatch(color, pattern), h('span', { class: 'legend-label' }, label));
  }

  return {
    render(state, data) {
      if (!data.election) return;
      const scale = getScale(data.election, state.view, data.config);
      if (scale === lastScale) return;
      lastScale = scale;
      const { legend } = scale;
      heading.textContent = `Legend: ${legend.title}`;
      const parts = [
        h(
          'div',
          { class: 'legend-groups' },
          legend.groups.map((group) =>
            h(
              'div',
              { class: 'legend-group' },
              h('p', { class: 'legend-group-title' }, group.title),
              h('ul', { class: 'legend-items', role: 'list' }, group.items.map(item)),
            ),
          ),
        ),
        legend.extras.length
          ? h('ul', { class: 'legend-items legend-extras', role: 'list' }, legend.extras.map(item))
          : null,
        legend.note ? h('p', { class: 'legend-note' }, legend.note) : null,
      ];
      body.replaceChildren(...parts.filter(Boolean));
    },
  };
}
