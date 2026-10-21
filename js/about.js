// C-13 about.js: builds the About section, the footer and the definition
// buttons from the configuration and the data file (FR-4.1 to FR-4.4,
// NFR-1.2, NFR-9.2, NFR-9.3).

import { formatDate, h } from './format.js';
import { electionsNewestFirst } from './store.js';

export const DEFINITIONS = {
  turnout: {
    term: 'turnout',
    text: 'Turnout is the number of ballots cast divided by the number of active registered voters, shown as a percentage.',
  },
  margin: {
    term: 'margin',
    text: 'Margin is the leading candidate’s share of the votes in this race minus the runner-up’s share, in percentage points. Shares are out of the votes cast in this race, not out of all ballots.',
  },
  activeVoters: {
    term: 'active registered voters',
    text: 'Active registered voters are the registered voters the state election office lists as active for this election. Turnout is measured against this number, not against every registered voter.',
  },
};

let definitionCount = 0;

/** A "?" button with aria-expanded that shows a one-sentence definition. */
export function definitionToggle(key) {
  const definition = DEFINITIONS[key];
  const id = `definition-${key}-${++definitionCount}`;
  const panel = h('p', { class: 'definition', id, hidden: true }, definition.text);
  const button = h(
    'button',
    { type: 'button', class: 'definition-button', 'aria-expanded': 'false', 'aria-controls': id },
    h('span', { 'aria-hidden': 'true' }, '?'),
    h('span', { class: 'visually-hidden' }, `What is ${definition.term}?`),
  );
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
  });
  return { button, panel };
}

/** Only http(s) links are rendered as links. */
export function safeUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function externalLink(url, text) {
  const href = safeUrl(url);
  return href ? h('a', { href, rel: 'noopener noreferrer external' }, text) : h('span', {}, text);
}

function electionName(entry) {
  const label = String(entry.label ?? entry.id);
  return entry.race && !label.toLowerCase().includes(String(entry.race).toLowerCase())
    ? `${label}, ${entry.race}`
    : label;
}

function collectSources(config, election) {
  const sources = new Map();
  const add = (source, usedFor) => {
    if (!source || (!source.name && !source.url)) return;
    const key = `${source.url ?? ''}|${source.name ?? ''}`;
    if (!sources.has(key)) sources.set(key, { ...source, usedFor: new Set() });
    if (usedFor) sources.get(key).usedFor.add(usedFor);
  };
  for (const source of config?.sources ?? []) add(source, null);
  for (const entry of electionsNewestFirst(config)) {
    for (const source of entry.sources ?? []) add(source, electionName(entry));
  }
  for (const source of election?.sources ?? []) add(source, election.label ? electionName(election) : null);
  return [...sources.values()];
}

export function createAbout({ section, footer }) {
  const heading = h('h2', { id: 'about-heading', class: 'section-heading', tabindex: '-1' }, 'About this map');
  const sourcesList = h('ul', { class: 'source-list' });
  const turnout = definitionTerm('Turnout', DEFINITIONS.turnout.text);
  const margin = definitionTerm('Margin', DEFINITIONS.margin.text);
  const active = definitionTerm('Active registered voters', DEFINITIONS.activeVoters.text);

  section.append(
    heading,
    h(
      'p',
      {},
      'This map shows certified county election results and turnout from public government sources. It is an unofficial site and is not affiliated with any government.',
    ),
    h('h3', {}, 'How the numbers are calculated'),
    h(
      'dl',
      { class: 'definition-list' },
      turnout,
      margin,
      active,
      definitionTerm(
        'Tie and No data',
        'A tie means the top candidates have exactly the same number of votes. No data means the election file has no results for that county; it is never shown as zero.',
      ),
      definitionTerm(
        'Rounding',
        'Percentages are calculated from the full vote and voter counts and rounded to one decimal place only for display.',
      ),
    ),
    h('h3', {}, 'Data sources'),
    sourcesList,
    h('h3', {}, 'Privacy'),
    h(
      'p',
      {},
      'This site sets no cookies, runs no analytics or tracking, and uses no persistent browser storage. It loads its own files without contacting other websites. When hosted on GitHub Pages, the hosting service logs visitor IP addresses for security purposes; the site itself cannot turn this off.',
    ),
    h('h3', {}, 'Software'),
    h(
      'p',
      {},
      'The map is drawn with D3.js 7.9.0, served from this site under the ',
      h('a', { href: 'vendor/d3-LICENSE.txt' }, 'ISC license'),
      '.',
    ),
  );

  const notice = h('p', { class: 'footer-notice' });
  const updated = h('p', { class: 'footer-meta' });
  footer.append(notice, updated);

  let lastKey = null;

  function renderSources(config, election) {
    const sources = collectSources(config, election);
    if (!sources.length) {
      sourcesList.replaceChildren(h('li', {}, 'Source details will appear here once the data has loaded.'));
      return;
    }
    sourcesList.replaceChildren(
      ...sources.map((source) =>
        h(
          'li',
          {},
          externalLink(source.url, source.name || source.url),
          source.publisher ? `, ${source.publisher}` : '',
          '.',
          source.retrievedAt ? ` Retrieved ${formatDate(source.retrievedAt)}.` : '',
          source.usedFor.size ? h('span', { class: 'source-use' }, ` Used for: ${[...source.usedFor].join('; ')}.`) : '',
        ),
      ),
    );
  }

  function renderFooter(config, election) {
    const office = config?.officeName
      ? externalLink(config.officeUrl, config.officeName)
      : h('span', {}, 'the state election office');
    notice.replaceChildren(
      'This is an unofficial site and is not affiliated with any government. Official results are available from ',
      office,
      '.',
    );
    const aboutLink = h('a', { href: '#about' }, 'About this map and its sources');
    aboutLink.addEventListener('click', () => {
      requestAnimationFrame(() => heading.focus({ preventScroll: true }));
    });
    updated.replaceChildren(
      election?.builtAt
        ? h('span', {}, 'Data last updated ', h('time', { datetime: election.builtAt }, formatDate(election.builtAt)), '. ')
        : '',
      aboutLink,
    );
  }

  renderFooter(null, null);
  renderSources(null, null);

  return {
    render(state, data) {
      const key = `${data.config?.abbr}|${data.election?.electionId}|${data.election?.builtAt}`;
      if (key === lastKey) return;
      lastKey = key;
      renderSources(data.config, data.election);
      renderFooter(data.config, data.election);
    },
  };
}

function definitionTerm(term, text) {
  return h('div', { class: 'definition-row' }, h('dt', {}, term), h('dd', {}, text));
}
