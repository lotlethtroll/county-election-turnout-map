// Gap audit for legend/map agreement, tooltip hover and Escape, keyboard
// focus return, definition controls, candidate tables, county stats, footer
// attribution, target size, contrast, and text equivalents of color.
// Uses the local Playwright install. Start `npm run serve` first.
// Does not install browsers, WAVE, or a screen reader.
import { chromium } from '../.cache/qa/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const origin = 'http://127.0.0.1:4173';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, '.cache', 'qa', 'results');

const MARGIN_COLORS = {
  D: ['#5B8FC7', '#3B73B5', '#245A99', '#123F73'],
  R: ['#D9605A', '#C2403A', '#9E2B26', '#6E1A17'],
};
const MARGIN_LABELS = {
  D: ['D+0 to D+5', 'D+5 to D+10', 'D+10 to D+20', 'D+20 or more'],
  R: ['R+0 to R+5', 'R+5 to R+10', 'R+10 to R+20', 'R+20 or more'],
};
const TURNOUT_LOW = '#8C7BB8';
const TURNOUT_HIGH = '#2B1A57';
const PARTY_NAMES = {
  D: 'Democratic',
  R: 'Republican',
  LIB: 'Libertarian',
  GRN: 'Green',
  UNA: 'Unaffiliated',
  IND: 'Independent',
};
const DEFINITIONS = {
  turnout:
    'Turnout is the number of ballots cast divided by the number of active registered voters, shown as a percentage.',
  margin:
    'Margin is the leading candidate’s share of the votes in this race minus the runner-up’s share, in percentage points. Shares are out of the votes cast in this race, not out of all ballots.',
  activeVoters:
    'Active registered voters are the registered voters the state election office lists as active for this election. Turnout is measured against this number, not against every registered voter.',
};

const oneDecimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const countFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const longDate = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

function formatCount(value) {
  return countFormat.format(value);
}
function formatPercent(value) {
  return `${oneDecimal.format(value)}%`;
}
function formatDate(value) {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  return longDate.format(date);
}
function partyName(code) {
  if (code === null || code === undefined || code === '') return 'No party listed';
  return PARTY_NAMES[code] ?? String(code);
}
function countyDisplay(name) {
  const text = String(name ?? '').trim();
  if (!text) return 'Unknown county';
  return /\b(county|parish|borough|census area|municipality|city)$/i.test(text) ? text : `${text} County`;
}
function hexOf(color) {
  if (!color) return '';
  const text = String(color).trim().toLowerCase();
  if (text.startsWith('#')) {
    if (text.length === 4) return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`.toUpperCase();
    return text.slice(0, 7).toUpperCase();
  }
  const match = text.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (!match) return text;
  const channel = (value) => Math.round(Number(value)).toString(16).padStart(2, '0');
  return `#${channel(match[1])}${channel(match[2])}${channel(match[3])}`.toUpperCase();
}
function marginBand(points) {
  if (points < 5) return 0;
  if (points < 10) return 1;
  if (points < 20) return 2;
  return 3;
}
function topIds(votes) {
  let max = 0;
  for (const value of Object.values(votes)) if (value > max) max = value;
  if (max <= 0) return [];
  return Object.keys(votes).filter((id) => votes[id] === max);
}
function expectedCounty(election, result) {
  const ids = topIds(result.votes);
  const tie = ids.length > 1;
  const leader = election.candidates.find((candidate) => candidate.id === ids[0]);
  const runner = election.candidates.find((candidate) => {
    const votes = result.votes[candidate.id] ?? -1;
    return candidate.id !== ids[0] && votes === Math.max(...election.candidates.filter((item) => item.id !== ids[0]).map((item) => result.votes[item.id] ?? -1));
  });
  const ranked = [...election.candidates].sort((a, b) => {
    const votesA = result.votes[a.id] ?? -1;
    const votesB = result.votes[b.id] ?? -1;
    return votesB - votesA || String(a.name).localeCompare(String(b.name));
  });
  const rows = ranked.map((candidate) => {
    const votes = result.votes[candidate.id];
    const share = result.raceTotal > 0 ? (votes / result.raceTotal) * 100 : null;
    let marker = '';
    if (tie && ids.includes(candidate.id)) marker = 'Tied for lead';
    else if (!tie && candidate.id === ids[0]) marker = 'Leader';
    return {
      name: candidate.name,
      party: partyName(candidate.party),
      votes: formatCount(votes),
      share: share === null ? 'No data' : formatPercent(share),
      marker,
    };
  });
  let marginLine = 'No data';
  let marginPoints = null;
  let party = null;
  if (tie) {
    const names = ids.map((id) => election.candidates.find((candidate) => candidate.id === id)?.name ?? id);
    marginLine = `Tie between ${names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`}`;
  } else if (leader && runner && result.raceTotal > 0) {
    marginPoints = ((result.votes[leader.id] - result.votes[runner.id]) / result.raceTotal) * 100;
    party = leader.party === 'D' || leader.party === 'R' ? leader.party : 'other';
    const prefix = party === 'other' ? leader.name : leader.party;
    marginLine = `${prefix}+${oneDecimal.format(marginPoints)}`;
  }
  const turnout = result.activeVoters > 0 ? (result.ballotsCast / result.activeVoters) * 100 : null;
  return {
    name: countyDisplay(result.name),
    tie,
    party,
    marginPoints,
    marginLine,
    turnout,
    turnoutText: turnout === null ? 'No data' : formatPercent(turnout),
    ballotsText: formatCount(result.ballotsCast),
    votersText: formatCount(result.activeVoters),
    rows,
    totalText: formatCount(result.raceTotal),
  };
}

function loadJson(file) {
  return fs.readFile(file, 'utf8').then((text) => JSON.parse(text));
}

let activeBrowser = '';

function push(findings, item) {
  findings.push({ browser: item.browser ?? activeBrowser, ...item });
}

async function readDom(page) {
  return page.evaluate(() => {
    const hex = (color) => {
      const match = String(color).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
      if (!match) return String(color);
      const channel = (value) => Math.round(Number(value)).toString(16).padStart(2, '0');
      return `#${channel(match[1])}${channel(match[2])}${channel(match[3])}`.toUpperCase();
    };
    const items = (root) =>
      [...root.querySelectorAll(':scope > .legend-item, :scope .legend-item')].map((item) => ({
        label: item.querySelector('.legend-label')?.textContent ?? '',
        color: hex(getComputedStyle(item.querySelector('.swatch')).backgroundColor),
        pattern: item.querySelector('.swatch')?.classList.contains('swatch-no-data') ?? false,
      }));
    return {
      legendHeading: document.querySelector('#legend-heading')?.textContent ?? '',
      groups: [...document.querySelectorAll('#legend .legend-group')].map((group) => ({
        title: group.querySelector('.legend-group-title')?.textContent ?? '',
        items: [...group.querySelectorAll('.legend-item')].map((item) => ({
          label: item.querySelector('.legend-label')?.textContent ?? '',
          color: hex(getComputedStyle(item.querySelector('.swatch')).backgroundColor),
          pattern: item.querySelector('.swatch')?.classList.contains('swatch-no-data') ?? false,
        })),
      })),
      extras: [...document.querySelectorAll('#legend .legend-extras .legend-item')].map((item) => ({
        label: item.querySelector('.legend-label')?.textContent ?? '',
        color: hex(getComputedStyle(item.querySelector('.swatch')).backgroundColor),
        pattern: item.querySelector('.swatch')?.classList.contains('swatch-no-data') ?? false,
      })),
      note: document.querySelector('#legend .legend-note')?.textContent ?? '',
      paths: [...document.querySelectorAll('path.county')].map((path) => ({
        fips: path.getAttribute('data-fips'),
        fill: getComputedStyle(path).fill.startsWith('url') ? 'pattern' : hex(getComputedStyle(path).fill),
        label: path.getAttribute('aria-label'),
      })),
      list: [...document.querySelectorAll('#county-list .county-button')].map((button) => ({
        name: button.querySelector('.county-name')?.textContent ?? '',
        value: button.querySelector('.county-value')?.textContent ?? '',
        color: button.querySelector('.swatch')?.classList.contains('swatch-no-data')
          ? 'pattern'
          : hex(getComputedStyle(button.querySelector('.swatch')).backgroundColor),
      })),
      footer: {
        notice: document.querySelector('.footer-notice')?.innerText.replace(/\s+/g, ' ').trim() ?? '',
        officeHref: document.querySelector('.footer-notice a')?.href ?? '',
        officeText: document.querySelector('.footer-notice a')?.textContent ?? '',
        builtAt: document.querySelector('#site-footer time')?.getAttribute('datetime') ?? '',
        builtAtText: document.querySelector('#site-footer time')?.textContent ?? '',
      },
      sources: [...document.querySelectorAll('#about .source-list li')].map((item) => ({
        text: item.innerText.replace(/\s+/g, ' ').trim(),
        href: item.querySelector('a')?.href ?? '',
        name: item.querySelector('a')?.textContent ?? '',
      })),
      aboutText: document.querySelector('#about')?.innerText ?? '',
      status: document.querySelector('#status-line')?.textContent ?? '',
    };
  });
}

function expectedMarginLegend() {
  return ['D', 'R'].map((party) => ({
    title: party === 'D' ? 'Democratic lead' : 'Republican lead',
    items: MARGIN_COLORS[party].map((color, index) => ({ color, label: MARGIN_LABELS[party][index], pattern: false })),
  }));
}

async function expectedTurnoutLegend(page, turnouts) {
  return page.evaluate(
    ({ values, low, high }) => {
      const format = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      const percent = (value) => `${format.format(value)}%`;
      const colors = d3.quantize(d3.interpolateLab(low, high), 6).map((color) => d3.color(color).formatHex().toUpperCase());
      const min = Math.min(...values);
      const max = Math.max(...values);
      const scale = d3.scaleQuantize().domain([min, max]).range(colors);
      return {
        min,
        max,
        items: colors.map((color) => {
          const [start, end] = scale.invertExtent(color);
          return { color, label: `${percent(start)} to ${percent(end)}`, pattern: false };
        }),
        paint: Object.fromEntries(values.map((value, index) => [index, scale(value).toUpperCase()])),
      };
    },
    { values: turnouts, low: TURNOUT_LOW, high: TURNOUT_HIGH },
  );
}

function compareLegend(findings, view, electionId, actual, expectedGroups) {
  if (actual.groups.length !== expectedGroups.length) {
    push(findings, {
      severity: 'fail',
      code: 'legend-groups',
      electionId,
      view,
      message: `Legend has ${actual.groups.length} groups; expected ${expectedGroups.length}.`,
      actual: actual.groups.map((group) => group.title),
      expected: expectedGroups.map((group) => group.title),
    });
  }
  for (const expected of expectedGroups) {
    const group = actual.groups.find((item) => item.title === expected.title);
    if (!group) {
      push(findings, { severity: 'fail', code: 'legend-group-missing', electionId, view, message: `Missing legend group “${expected.title}”.` });
      continue;
    }
    const actualItems = group.items.map((item) => `${item.label}|${item.color}|${item.pattern}`);
    const expectedItems = expected.items.map((item) => `${item.label}|${item.color}|${item.pattern}`);
    if (actualItems.join('\n') !== expectedItems.join('\n')) {
      push(findings, {
        severity: 'fail',
        code: 'legend-swatches',
        electionId,
        view,
        message: `Legend ranges or swatches differ for ${expected.title}.`,
        actual: group.items,
        expected: expected.items,
      });
    }
  }
}

async function auditScale(page, findings, election, config, view) {
  await page.locator('#election-select').selectOption(`election|${election.electionId}`);
  await page.locator(`[data-view="${view}"]`).click();
  await page.waitForFunction(
    ([id, viewName]) => {
      const status = document.querySelector('#status-line')?.textContent ?? '';
      return status.includes(id.slice(0, 4)) && status.toLowerCase().includes(viewName);
    },
    [election.electionId, view],
  );
  const dom = await readDom(page);
  const byFips = new Map(config.counties.map((county) => [county.fips, county]));
  const expectations = new Map(
    Object.entries(election.counties).map(([fips, result]) => [fips, expectedCounty(election, { ...result, name: result.name ?? byFips.get(fips)?.name })]),
  );

  if (view === 'margin') {
    compareLegend(findings, view, election.electionId, dom, expectedMarginLegend());
    const tieCount = [...expectations.values()].filter((item) => item.tie).length;
    const missingRace = config.counties.filter((county) => {
      const result = election.counties[county.fips];
      return !result || !(result.raceTotal > 0);
    }).length;
    const expectedExtras = [];
    if (tieCount) expectedExtras.push('Tie');
    if (missingRace) expectedExtras.push('No data');
    const extraLabels = dom.extras.map((item) => item.label);
    if (extraLabels.join('|') !== expectedExtras.join('|')) {
      push(findings, {
        severity: 'fail',
        code: 'legend-extras',
        electionId: election.electionId,
        view,
        message: `Margin legend extras were ${extraLabels.join(', ') || 'none'}; expected ${expectedExtras.join(', ') || 'none'}.`,
        actual: dom.extras,
      });
    }
  } else {
    const turnouts = config.counties.map((county) => expectations.get(county.fips).turnout);
    const turnoutLegend = await expectedTurnoutLegend(page, turnouts);
    compareLegend(findings, view, election.electionId, dom, [
      { title: 'Ballots cast ÷ active registered voters', items: turnoutLegend.items },
    ]);
    const indexed = new Map(config.counties.map((county, index) => [county.fips, turnoutLegend.paint[index]]));
    for (const county of config.counties) {
      const path = dom.paths.find((item) => item.fips === county.fips);
      const expectedColor = indexed.get(county.fips);
      if (path?.fill !== expectedColor) {
        push(findings, {
          severity: 'fail',
          code: 'map-fill',
          electionId: election.electionId,
          view,
          fips: county.fips,
          message: `${countyDisplay(county.name)} fill ${path?.fill} is not turnout swatch ${expectedColor}.`,
        });
      }
    }
  }

  const listByName = new Map(dom.list.map((item) => [item.name, item]));
  for (const county of config.counties) {
    const expected = expectations.get(county.fips);
    const path = dom.paths.find((item) => item.fips === county.fips);
    const value = view === 'margin' ? expected.marginLine : expected.turnoutText;
    const list = listByName.get(expected.name);
    if (!path) {
      push(findings, { severity: 'fail', code: 'map-path', electionId: election.electionId, view, message: `No path for ${expected.name}.` });
      continue;
    }
    if (path.label !== `${expected.name}, ${value}`) {
      push(findings, {
        severity: 'fail',
        code: 'map-label',
        electionId: election.electionId,
        view,
        fips: county.fips,
        message: `Map label “${path.label}” does not match “${expected.name}, ${value}”.`,
      });
    }
    if (!list) {
      push(findings, { severity: 'fail', code: 'list-missing', electionId: election.electionId, view, message: `County list has no ${expected.name}.` });
    } else if (list.value !== value || list.color !== path.fill) {
      push(findings, {
        severity: 'fail',
        code: 'list-mismatch',
        electionId: election.electionId,
        view,
        fips: county.fips,
        message: `${expected.name} list value/swatch does not match the map.`,
        list,
        path: { fill: path.fill, label: path.label },
        expected: value,
      });
    }
    if (view === 'margin' && expected.party && expected.marginPoints !== null && !expected.tie) {
      const band = marginBand(expected.marginPoints);
      const color = MARGIN_COLORS[expected.party]?.[band];
      if (!color) {
        push(findings, {
          severity: 'fail',
          code: 'other-party-lead',
          electionId: election.electionId,
          view,
          fips: county.fips,
          message: `${expected.name} leader is not Democratic or Republican (${expected.marginLine}).`,
        });
      } else if (path.fill !== color) {
        push(findings, {
          severity: 'fail',
          code: 'map-fill',
          electionId: election.electionId,
          view,
          fips: county.fips,
          message: `${expected.name} margin ${expected.marginPoints} painted ${path.fill}; band ${band} color is ${color}.`,
        });
      }
      const legendItem = dom.groups.flatMap((group) => group.items).find((item) => item.color === path.fill);
      if (color && legendItem?.label !== MARGIN_LABELS[expected.party][band]) {
        push(findings, {
          severity: 'fail',
          code: 'legend-map-range',
          electionId: election.electionId,
          view,
          fips: county.fips,
          message: `${expected.name} fill ${path.fill} is legend “${legendItem?.label ?? 'missing'}”, expected “${MARGIN_LABELS[expected.party][band]}”.`,
        });
      }
    }
  }

  const unused = dom.paths.filter((path) => path.fill !== 'pattern' && !dom.groups.some((group) => group.items.some((item) => item.color === path.fill)));
  if (unused.length) {
    push(findings, {
      severity: 'fail',
      code: 'fill-not-in-legend',
      electionId: election.electionId,
      view,
      message: `${unused.length} map fills are absent from the legend.`,
      sample: unused.slice(0, 5),
    });
  }
  return { dom, expectations };
}

async function openCounty(page, displayName) {
  await page.evaluate((name) => {
    const button = [...document.querySelectorAll('#county-list .county-button')].find(
      (element) => element.querySelector('.county-name')?.textContent === name,
    );
    button?.click();
  }, displayName);
  await page.waitForFunction((name) => document.querySelector('#details-heading')?.textContent === name, displayName);
  return page.evaluate(() => {
    const textOf = (element) => {
      if (!element) return '';
      const copy = element.cloneNode(true);
      copy.querySelectorAll('button, .visually-hidden').forEach((node) => node.remove());
      return copy.textContent.replace(/\s+/g, ' ').trim();
    };
    return {
      heading: document.querySelector('#details-heading')?.textContent ?? '',
      focused: document.activeElement?.id ?? document.activeElement?.getAttribute('data-fips') ?? document.activeElement?.textContent?.trim() ?? '',
      stats: [...document.querySelectorAll('#details .stat')].map((stat) => ({
        label: textOf(stat.querySelector('dt')),
        value: stat.querySelector('dd')?.textContent.trim() ?? '',
      })),
      rows: [...document.querySelectorAll('#details tbody tr')].map((row) => ({
        name: row.querySelector('.candidate-name')?.textContent.trim() ?? '',
        marker: row.querySelector('.leader-tag')?.textContent.trim() ?? '',
        party: row.children[1]?.textContent.trim() ?? '',
        votes: row.children[2]?.textContent.trim() ?? '',
        share: row.children[3]?.textContent.trim() ?? '',
      })),
      total: document.querySelector('#details tfoot td')?.textContent.trim() ?? '',
      totalShare: document.querySelector('#details tfoot td:last-child')?.textContent.trim() ?? '',
      margin: document.querySelector('#details .margin-line strong')?.textContent.trim() ?? '',
    };
  });
}

async function auditTables(page, findings, election, config, expectations) {
  await page.locator('#election-select').selectOption(`election|${election.electionId}`);
  await page.locator('[data-view="margin"]').click();
  let mismatches = 0;
  for (const county of config.counties) {
    const expected = expectations.get(county.fips);
    const actual = await openCounty(page, expected.name);
    const problems = [];
    const stat = (label) => actual.stats.find((item) => item.label === label)?.value;
    if (stat('Turnout') !== expected.turnoutText) problems.push(`turnout ${stat('Turnout')} != ${expected.turnoutText}`);
    if (stat('Ballots cast') !== expected.ballotsText) problems.push(`ballots ${stat('Ballots cast')} != ${expected.ballotsText}`);
    if (stat('Active registered voters') !== expected.votersText) problems.push(`voters ${stat('Active registered voters')} != ${expected.votersText}`);
    if (actual.rows.length !== expected.rows.length) problems.push(`row count ${actual.rows.length} != ${expected.rows.length}`);
    expected.rows.forEach((row, index) => {
      const seen = actual.rows[index];
      if (!seen || seen.name !== row.name || seen.party !== row.party || seen.votes !== row.votes || seen.share !== row.share || seen.marker !== row.marker) {
        problems.push(`row ${index + 1} ${JSON.stringify(seen)} != ${JSON.stringify(row)}`);
      }
    });
    if (actual.total !== expected.totalText || actual.totalShare !== '100.0%') problems.push(`total ${actual.total} ${actual.totalShare}`);
    if (actual.margin !== expected.marginLine) problems.push(`margin “${actual.margin}” != “${expected.marginLine}”`);
    if (problems.length) {
      mismatches += 1;
      if (mismatches <= 8) {
        push(findings, {
          severity: 'fail',
          code: 'county-table',
          electionId: election.electionId,
          fips: county.fips,
          message: `${expected.name}: ${problems.slice(0, 4).join('; ')}`,
        });
      }
    }
  }
  if (mismatches > 8) {
    push(findings, {
      severity: 'fail',
      code: 'county-table-more',
      electionId: election.electionId,
      message: `${mismatches} counties failed the table or stat comparison; the first 8 are listed.`,
    });
  }
  return mismatches;
}

async function pointOnCounty(page, fips) {
  return page.evaluate((id) => {
    const path = document.querySelector(`path.county[data-fips="${id}"]`);
    if (!path) return null;
    const box = path.getBoundingClientRect();
    for (let y = box.top + 1; y < box.bottom; y += 3) {
      for (let x = box.left + 1; x < box.right; x += 3) {
        if (document.elementFromPoint(x, y) === path) return { x, y, label: path.getAttribute('aria-label') };
      }
    }
    return null;
  }, fips);
}

async function tooltipState(page) {
  return page.evaluate(() => {
    const tip = document.querySelector('#map-tooltip');
    const box = tip?.getBoundingClientRect();
    return {
      hidden: tip?.hidden ?? true,
      name: tip?.querySelector('.tooltip-name')?.textContent ?? '',
      value: tip?.querySelector('.tooltip-value')?.textContent ?? '',
      box: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null,
    };
  });
}

async function auditTooltip(page, findings, browserName) {
  const denver = await pointOnCounty(page, '08031');
  if (!denver) {
    push(findings, { severity: 'fail', code: 'tooltip-point', browser: browserName, message: 'Could not find an interior point on Denver.' });
    return;
  }
  await page.mouse.move(denver.x, denver.y);
  await page.waitForFunction(() => document.querySelector('#map-tooltip')?.hidden === false);
  let tip = await tooltipState(page);
  if (`${tip.name}, ${tip.value}` !== denver.label) {
    push(findings, { severity: 'fail', code: 'tooltip-content', browser: browserName, message: `Denver hover tooltip was “${tip.name}, ${tip.value}”; the map label is “${denver.label}”.`, tip });
  }
  const center = { x: tip.box.x + tip.box.width / 2, y: tip.box.y + tip.box.height / 2 };
  await page.mouse.move(center.x, center.y, { steps: 8 });
  await page.waitForTimeout(500);
  tip = await tooltipState(page);
  const overTip = await page.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y);
    return Boolean(hit && (hit.id === 'map-tooltip' || hit.closest('#map-tooltip')));
  }, center);
  if (tip.hidden || !overTip) {
    push(findings, {
      severity: 'fail',
      code: 'tooltip-hoverable',
      browser: browserName,
      message: 'Moving the pointer onto the Denver tooltip hid it or the pointer was not over the tooltip after 500ms.',
      tip,
      overTip,
    });
  }
  await page.keyboard.press('Escape');
  tip = await tooltipState(page);
  if (!tip.hidden) {
    push(findings, { severity: 'fail', code: 'tooltip-escape', browser: browserName, message: 'Escape did not hide the tooltip.' });
  }
  await page.mouse.move(denver.x + 4, denver.y + 4);
  await page.waitForTimeout(300);
  tip = await tooltipState(page);
  if (!tip.hidden) {
    push(findings, {
      severity: 'fail',
      code: 'tooltip-stays-dismissed',
      browser: browserName,
      message: 'After Escape, moving inside the same county showed the tooltip again.',
      tip,
    });
  }
  const adams = await pointOnCounty(page, '08001');
  if (adams) {
    await page.mouse.move(adams.x, adams.y);
    await page.waitForTimeout(200);
    tip = await tooltipState(page);
    if (tip.hidden || tip.name !== 'Adams County') {
      push(findings, {
        severity: 'fail',
        code: 'tooltip-next-county',
        browser: browserName,
        message: `Hovering Adams after a dismissal showed “${tip.name}” hidden=${tip.hidden}.`,
      });
    }
  }
  await page.mouse.move(0, 0);
}

async function focusCountyByKeyboard(page) {
  await page.evaluate(() => document.body.focus());
  for (let step = 0; step < 30; step += 1) {
    const focused = await page.evaluate(() => document.activeElement?.matches?.('path.county') ?? false);
    if (focused) return page.evaluate(() => document.activeElement.getAttribute('data-fips'));
    await page.keyboard.press('Tab');
  }
  return null;
}

async function auditKeyboard(page, findings, browserName) {
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.querySelector('#county-search')?.blur());
  const fips = await focusCountyByKeyboard(page);
  if (!fips) {
    push(findings, { severity: 'fail', code: 'keyboard-map', browser: browserName, message: 'Tab never reached a county path.' });
    return;
  }
  const shown = await tooltipState(page);
  const label = await page.evaluate(() => document.activeElement.getAttribute('aria-label'));
  if (shown.hidden || `${shown.name}, ${shown.value}` !== label) {
    push(findings, {
      severity: 'fail',
      code: 'keyboard-tooltip',
      browser: browserName,
      message: `Keyboard focus tooltip “${shown.name}, ${shown.value}” does not match ${label}.`,
    });
  }
  const ring = await page.evaluate(() => ({
    focus: document.querySelector('.outline-focus')?.getAttribute('d'),
    ring: document.querySelector('.outline-focus-ring')?.getAttribute('d'),
    stroke: document.querySelector('.outline-focus')?.getAttribute('stroke'),
    width: getComputedStyle(document.querySelector('.outline-focus')).strokeWidth,
    ringWidth: getComputedStyle(document.querySelector('.outline-focus-ring')).strokeWidth,
  }));
  if (!ring.focus || !ring.ring) {
    push(findings, { severity: 'fail', code: 'focus-ring', browser: browserName, message: 'Keyboard focus did not draw the county focus outline.', ring });
  }
  await page.keyboard.press('ArrowDown');
  const next = await page.evaluate(() => document.activeElement.getAttribute('data-fips'));
  if (next === fips) {
    push(findings, { severity: 'fail', code: 'keyboard-arrow', browser: browserName, message: 'ArrowDown did not move map focus.' });
  }
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#details')?.dataset.empty === 'false');
  let tip = await tooltipState(page);
  if (!tip.hidden) {
    await page.keyboard.press('Escape');
    tip = await tooltipState(page);
    const stillOpen = await page.evaluate(() => document.querySelector('#details')?.dataset.empty === 'false');
    const stillFocused = await page.evaluate((id) => document.activeElement?.getAttribute('data-fips') === id, next);
    if (!stillOpen || tip.hidden === false || !stillFocused) {
      push(findings, {
        severity: 'fail',
        code: 'escape-tooltip-first',
        browser: browserName,
        message: 'With the tooltip open, Escape should dismiss only the tooltip and leave the county panel focused.',
        stillOpen,
        tipHidden: tip.hidden,
        stillFocused,
      });
    }
  }
  await page.keyboard.press('Escape');
  const afterEscape = await page.evaluate((id) => ({
    empty: document.querySelector('#details')?.dataset.empty,
    focus: document.activeElement?.getAttribute('data-fips'),
    expected: id,
  }), next);
  if (afterEscape.empty !== 'true' || afterEscape.focus !== next) {
    push(findings, {
      severity: 'fail',
      code: 'escape-focus-return',
      browser: browserName,
      message: 'Escape did not close the panel and return focus to the county path.',
      afterEscape,
    });
  }

  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.querySelector('#details')?.dataset.empty === 'false');
  await page.getByRole('button', { name: /Close / }).click();
  const afterClose = await page.evaluate((id) => ({
    empty: document.querySelector('#details')?.dataset.empty,
    focus: document.activeElement?.getAttribute('data-fips'),
    expected: id,
  }), next);
  if (afterClose.empty !== 'true' || afterClose.focus !== next) {
    push(findings, {
      severity: 'fail',
      code: 'close-focus-return',
      browser: browserName,
      message: 'Close did not return focus to the county that Space selected.',
      afterClose,
    });
  }

  await page.mouse.move(2, 2);
  await page.waitForTimeout(400);
  await page.locator('#county-search').fill('Yuma');
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('#county-list .county-button')].find((element) =>
      element.querySelector('.county-name')?.textContent?.startsWith('Yuma'),
    );
    button?.click();
  });
  await page.waitForFunction(() => document.querySelector('#details-heading')?.textContent === 'Yuma County');
  const beforeEscape = await page.evaluate(() => ({
    headingFocused: document.activeElement?.id === 'details-heading',
    tooltipHidden: document.querySelector('#map-tooltip')?.hidden ?? true,
  }));
  if (!beforeEscape.headingFocused) {
    push(findings, { severity: 'fail', code: 'list-focus', browser: browserName, message: 'Choosing Yuma from the list did not focus the details heading.' });
  }
  if (!beforeEscape.tooltipHidden) {
    push(findings, {
      severity: 'fail',
      code: 'list-opens-tooltip',
      browser: browserName,
      message: 'Choosing Yuma from the list left the map tooltip visible, so the next Escape dismisses the tooltip instead of the panel.',
    });
  }
  await page.keyboard.press('Escape');
  const yumaFocus = await page.evaluate(() => ({
    empty: document.querySelector('#details')?.dataset.empty,
    focus: document.activeElement?.getAttribute('data-fips'),
  }));
  if (yumaFocus.empty !== 'true' || yumaFocus.focus !== '08125') {
    push(findings, {
      severity: 'fail',
      code: 'escape-from-list',
      browser: browserName,
      message: 'Escape after a list selection did not return focus to Yuma on the map.',
      yumaFocus,
      beforeEscape,
    });
  }
}

async function auditDefinitions(page, findings, browserName) {
  await page.evaluate(() => document.querySelector('#details .close-button')?.click());
  const cases = [
    ['turnout', 'What is turnout?', DEFINITIONS.turnout],
    ['activeVoters', 'What is active registered voters?', DEFINITIONS.activeVoters],
    ['margin', 'What is margin?', DEFINITIONS.margin],
  ];
  for (const [key, name, text] of cases) {
    const button = page.getByRole('button', { name, exact: true }).first();
    await button.focus();
    await page.keyboard.press('Enter');
    const opened = await button.evaluate((element) => {
      const panel = document.getElementById(element.getAttribute('aria-controls'));
      return { expanded: element.getAttribute('aria-expanded'), hidden: panel?.hidden ?? true, text: panel?.textContent ?? '' };
    });
    if (opened.expanded !== 'true' || opened.hidden || opened.text !== text) {
      push(findings, { severity: 'fail', code: 'definition-keyboard', browser: browserName, key, message: `Enter did not open “${name}”.`, opened });
    }
    await page.keyboard.press(' ');
    const closed = await button.evaluate((element) => {
      const panel = document.getElementById(element.getAttribute('aria-controls'));
      return { expanded: element.getAttribute('aria-expanded'), hidden: panel?.hidden ?? false };
    });
    if (closed.expanded !== 'false' || closed.hidden !== true) {
      push(findings, { severity: 'fail', code: 'definition-keyboard-close', browser: browserName, key, message: `Space did not dismiss “${name}”.`, closed });
    }
    await button.click();
    const pointerOpen = await button.evaluate((element) => element.getAttribute('aria-expanded') === 'true');
    await button.click();
    const pointerClosed = await button.evaluate((element) => element.getAttribute('aria-expanded') === 'false');
    if (!pointerOpen || !pointerClosed) {
      push(findings, { severity: 'fail', code: 'definition-pointer', browser: browserName, key, message: `Pointer click did not toggle “${name}”.` });
    }
  }
  const about = await page.locator('#about').innerText();
  if (!about.includes('ballots cast divided by the number of active registered voters')) {
    push(findings, { severity: 'fail', code: 'about-turnout-formula', browser: browserName, message: 'About does not state the turnout formula.' });
  }
  if (!about.includes('leading candidate’s share of the votes in this race minus the runner-up’s share')) {
    push(findings, { severity: 'fail', code: 'about-margin-formula', browser: browserName, message: 'About does not state the margin formula.' });
  }
}

function expectedSources(config) {
  const sources = new Map();
  const add = (source, usedFor) => {
    const key = `${source.url ?? ''}|${source.name ?? ''}`;
    if (!sources.has(key)) sources.set(key, { ...source, usedFor: new Set() });
    if (usedFor) sources.get(key).usedFor.add(usedFor);
  };
  for (const source of config.sources ?? []) add(source, null);
  for (const entry of [...config.elections].sort((a, b) => String(b.date).localeCompare(String(a.date)))) {
    const label = entry.race && !String(entry.label).toLowerCase().includes(String(entry.race).toLowerCase())
      ? `${entry.label}, ${entry.race}`
      : entry.label;
    for (const source of entry.sources ?? []) add(source, label);
  }
  return [...sources.values()];
}

async function auditAttribution(page, findings, election, config, view) {
  await page.locator('#election-select').selectOption(`election|${election.electionId}`);
  await page.locator(`[data-view="${view}"]`).click();
  await page.waitForFunction((id) => (document.querySelector('#status-line')?.textContent ?? '').includes(id.slice(0, 4)), election.electionId);
  const dom = await readDom(page);
  const date = formatDate(election.builtAt);
  if (dom.footer.builtAt !== election.builtAt || dom.footer.builtAtText !== date) {
    push(findings, {
      severity: 'fail',
      code: 'built-at',
      electionId: election.electionId,
      view,
      message: `Footer date “${dom.footer.builtAtText}” (${dom.footer.builtAt}) does not match ${date} (${election.builtAt}).`,
    });
  }
  const notice = dom.footer.notice.toLowerCase();
  if (!notice.includes('unofficial') || !notice.includes('not affiliated')) {
    push(findings, { severity: 'fail', code: 'footer-notice', electionId: election.electionId, view, message: `Footer notice: ${dom.footer.notice}` });
  }
  if (dom.footer.officeHref !== config.officeUrl || dom.footer.officeText !== config.officeName) {
    push(findings, {
      severity: 'fail',
      code: 'footer-office',
      electionId: election.electionId,
      view,
      message: `Office link was “${dom.footer.officeText}” ${dom.footer.officeHref}.`,
    });
  }
  const expected = expectedSources(config);
  if (dom.sources.length !== expected.length) {
    push(findings, {
      severity: 'fail',
      code: 'source-count',
      electionId: election.electionId,
      view,
      message: `About lists ${dom.sources.length} sources; configuration has ${expected.length}.`,
      actual: dom.sources.map((source) => source.name),
      expected: expected.map((source) => source.name),
    });
  }
  for (const source of expected) {
    const item = dom.sources.find((entry) => entry.href === source.url);
    const retrieved = formatDate(source.retrievedAt);
    if (!item || item.name !== source.name || !item.text.includes(source.publisher) || !item.text.includes(retrieved)) {
      push(findings, {
        severity: 'fail',
        code: 'source-entry',
        electionId: election.electionId,
        view,
        message: `Missing or incomplete source “${source.name}”.`,
        item,
      });
    }
  }
}

function contrastRatio(foreground, background) {
  const parse = (color) => {
    const match = String(color).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/);
    if (!match) return null;
    return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: match[4] === undefined ? 1 : Number(match[4]) };
  };
  const channel = (value) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  const lum = (rgb) => 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  const fg = parse(foreground);
  const bg = parse(background);
  if (!fg || !bg) return null;
  const mix = (color) => ({
    r: color.r * color.a + bg.r * (1 - color.a),
    g: color.g * color.a + bg.g * (1 - color.a),
    b: color.b * color.a + bg.b * (1 - color.a),
  });
  const lighter = Math.max(lum(mix(fg)), lum(bg));
  const darker = Math.min(lum(mix(fg)), lum(bg));
  return (lighter + 0.05) / (darker + 0.05);
}

async function auditPresentation(page, findings, browserName) {
  await page.locator('#county-search').fill('');
  await page.mouse.move(2, 2);
  await page.waitForTimeout(400);
  const widths = [1440, 768, 320];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('path.county').first().waitFor();
    // ResizeObserver schedules map layout on RAF; sample after it has run.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
    const measured = await page.evaluate(() => {
      const opaqueBackground = (element) => {
        let node = element;
        while (node) {
          const style = getComputedStyle(node);
          const match = style.backgroundColor.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/);
          if (match && Number(match[4] ?? 1) > 0.98) return style.backgroundColor;
          node = node.parentElement;
        }
        return getComputedStyle(document.body).backgroundColor;
      };
      const interesting = [
        'h1',
        '.site-tag',
        '#status-line',
        '.field label',
        '.legend-label',
        '.legend-note',
        '.legend-group-title',
        '#summary .stat dt',
        '#summary .stat dd',
        '.footer-notice',
        '.footer-meta',
        '.source-list a',
        '.county-name',
        '.county-value',
        'select',
        '.segmented button[aria-pressed="false"]',
        '.segmented button[aria-pressed="true"]',
      ];
      const texts = interesting.map((selector) => {
        const element = document.querySelector(selector);
        if (!element) return { selector, missing: true };
        const style = getComputedStyle(element);
        return {
          selector,
          color: style.color,
          background: opaqueBackground(element),
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          text: element.textContent.trim().slice(0, 80),
        };
      });
      const swatches = [...document.querySelectorAll('#legend .swatch')].map((swatch) => ({
        color: getComputedStyle(swatch).backgroundColor,
        background: opaqueBackground(swatch),
        pattern: swatch.classList.contains('swatch-no-data'),
      }));
      const controls = [...document.querySelectorAll('button, a, input, select')].map((element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          kind: element.tagName.toLowerCase(),
          county: element.classList.contains('county-button'),
          name: element.getAttribute('aria-label') || element.innerText.replace(/\s+/g, ' ').trim().slice(0, 80),
          width: box.width,
          height: box.height,
          border: style.borderTopColor,
          background: style.backgroundColor,
          hidden: element.closest('[hidden]') || style.display === 'none' || element.classList.contains('visually-hidden') || box.width === 0,
        };
      });
      const paths = [...document.querySelectorAll('path.county')].map((path) => {
        const box = path.getBoundingClientRect();
        return { fips: path.getAttribute('data-fips'), width: box.width, height: box.height, fill: getComputedStyle(path).fill };
      });
      return {
        texts,
        swatches,
        controls: controls.filter((control) => !control.hidden),
        paths,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        panel: {
          border: getComputedStyle(document.querySelector('.panel')).borderTopColor,
          background: getComputedStyle(document.querySelector('.panel')).backgroundColor,
        },
        wide: [...document.querySelectorAll('body *')]
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              tag: element.tagName,
              id: element.id,
              cls: String(element.className || '').slice(0, 50),
              width: Math.round(rect.width),
              right: Math.round(rect.right),
            };
          })
          .filter((item) => item.right > window.innerWidth + 1 || item.width > window.innerWidth + 1)
          .sort((a, b) => b.width - a.width)
          .slice(0, 6),
      };
    });
    if (measured.scrollWidth > width + 1) {
      push(findings, {
        severity: 'fail',
        code: 'overflow',
        browser: browserName,
        width,
        message: `scrollWidth ${measured.scrollWidth} exceeds ${width}.`,
        sample: measured.wide,
      });
    }
    for (const sample of measured.texts) {
      if (sample.missing) continue;
      const ratio = contrastRatio(sample.color, sample.background);
      const large = Number.parseFloat(sample.fontSize) >= 24 || (Number.parseFloat(sample.fontSize) >= 18.66 && Number(sample.fontWeight) >= 700);
      const minimum = large ? 3 : 4.5;
      if (ratio !== null && ratio < minimum) {
        push(findings, {
          severity: 'fail',
          code: 'text-contrast',
          browser: browserName,
          width,
          message: `${sample.selector} contrast ${ratio.toFixed(2)}:1 is below ${minimum}:1 (${sample.text}).`,
          sample,
        });
      }
    }
    for (const swatch of measured.swatches) {
      if (swatch.pattern) continue;
      const ratio = contrastRatio(swatch.color, 'rgb(255, 255, 255)');
      if (ratio !== null && ratio < 3) {
        push(findings, { severity: 'fail', code: 'swatch-contrast', browser: browserName, width, message: `Legend swatch ${swatch.color} is ${ratio.toFixed(2)}:1 against white.` });
      }
    }
    const inlineLink = (control) => control.kind === 'a';
    const undersized = measured.controls.filter((control) => control.width < 24 || control.height < 24);
    const undersizedControls = undersized.filter((control) => !inlineLink(control));
    const undersizedLinks = undersized.filter(inlineLink);
    if (undersizedControls.length) {
      push(findings, {
        severity: 'fail',
        code: 'target-size',
        browser: browserName,
        width,
        message: `${undersizedControls.length} buttons or inputs are under 24×24 CSS pixels.`,
        sample: undersizedControls.slice(0, 8),
      });
    }
    if (undersizedLinks.length) {
      push(findings, {
        severity: 'note',
        code: 'inline-link-size',
        browser: browserName,
        width,
        message: `${undersizedLinks.length} inline links are shorter than 24 CSS pixels. WCAG 2.5.8 exempts targets in a sentence; this is not a button-size failure.`,
        shortest: Math.min(...undersizedLinks.map((control) => control.height)),
        sample: undersizedLinks.slice(0, 4).map((control) => ({ name: control.name, height: control.height })),
      });
    }
    const borderFails = measured.controls.filter((control) => {
      if (control.kind === 'a') return false;
      const background = control.background === 'rgba(0, 0, 0, 0)' ? 'rgb(255, 255, 255)' : control.background;
      const ratio = contrastRatio(control.border, background);
      return ratio !== null && ratio < 3 && control.name;
    });
    if (width === 1440 && borderFails.length) {
      const groups = new Map();
      for (const control of borderFails) {
        const background = control.background === 'rgba(0, 0, 0, 0)' ? 'rgb(255, 255, 255)' : control.background;
        const ratio = Number(contrastRatio(control.border, background).toFixed(2));
        const key = `${control.border}|${background}|${ratio}`;
        if (!groups.has(key)) groups.set(key, { border: control.border, background, ratio, count: 0, example: control.name });
        groups.get(key).count += 1;
      }
      push(findings, {
        severity: 'fail',
        code: 'control-border',
        browser: browserName,
        width,
        message: `${borderFails.length} buttons use a border under 3:1 against the button background. Text inside those buttons was measured separately.`,
        sample: [...groups.values()],
      });
    }
    if (width === 1440) {
      const countyButtons = measured.controls.filter((control) => control.county);
      const countyBorderRatios = countyButtons.map((control) => {
        const background = control.background === 'rgba(0, 0, 0, 0)' ? 'rgb(255, 255, 255)' : control.background;
        return {
          name: control.name,
          border: control.border,
          background,
          ratio: Number(contrastRatio(control.border, background).toFixed(2)),
        };
      });
      const lowCountyBorders = countyBorderRatios.filter((item) => item.ratio < 3);
      const lowest = countyBorderRatios.reduce((min, item) => (item.ratio < min.ratio ? item : min), countyBorderRatios[0]);
      push(findings, {
        severity: lowCountyBorders.length ? 'fail' : 'note',
        code: 'county-button-border',
        browser: browserName,
        width,
        message: lowest
          ? `${lowCountyBorders.length} of ${countyButtons.length} county-list buttons have a border under 3:1. Lowest is ${lowest.ratio}:1 (${lowest.border} on ${lowest.background}), for example “${lowest.name}”.`
          : 'No county-list buttons were measured.',
        sample: lowCountyBorders.slice(0, 2),
      });
      if (measured.panel && width === 1440) {
        const ratio = contrastRatio(measured.panel.border, measured.panel.background);
        push(findings, {
          severity: ratio !== null && ratio < 3 ? 'fail' : 'note',
          code: 'panel-border',
          browser: browserName,
          width,
          message: `Panel border ${measured.panel.border} on ${measured.panel.background} is ${ratio === null ? 'unmeasured' : `${ratio.toFixed(2)}:1`}.`,
        });
      }
      const buttons = measured.controls.filter((control) => control.kind === 'button' || control.kind === 'input' || control.kind === 'select');
      const shortest = buttons.reduce((min, control) => Math.min(min, control.width, control.height), Infinity);
      push(findings, {
        severity: 'note',
        code: 'control-target-size',
        browser: browserName,
        width,
        message: `Smallest measured button, input, or select is ${shortest} CSS pixels at 1440. The 24px minimum applies to these controls.`,
      });
    }
    const smallPaths = measured.paths.filter((path) => path.width < 24 || path.height < 24);
    push(findings, {
      severity: 'note',
      code: 'map-target-size',
      browser: browserName,
      width,
      message: `${smallPaths.length} of ${measured.paths.length} county paths have a bounding box under 24 CSS pixels. The county list is the large-target alternative.`,
      smallest: measured.paths.sort((a, b) => a.width * a.height - b.width * b.height)[0],
    });
    const lowFills = [];
    for (const path of measured.paths) {
      if (String(path.fill).startsWith('url')) continue;
      const ratio = contrastRatio(path.fill, 'rgb(255, 255, 255)');
      if (ratio !== null && ratio < 3) lowFills.push({ fips: path.fips, fill: path.fill, ratio: Number(ratio.toFixed(2)) });
    }
    if (lowFills.length) {
      push(findings, { severity: 'fail', code: 'fill-contrast', browser: browserName, width, message: `${lowFills.length} county fills are under 3:1 against white.`, sample: lowFills.slice(0, 5) });
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  const point = await pointOnCounty(page, '08031');
  if (point) {
    await page.mouse.move(point.x, point.y);
    await page.waitForFunction(() => document.querySelector('#map-tooltip')?.hidden === false);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.waitForTimeout(300);
    const resized = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      inner: innerWidth,
      hidden: document.querySelector('#map-tooltip')?.hidden,
      left: document.querySelector('#map-tooltip')?.style.left,
    }));
    if (resized.scroll > 321) {
      push(findings, {
        severity: 'fail',
        code: 'tooltip-resize-overflow',
        browser: browserName,
        message: `With a tooltip open, narrowing to 320px made scrollWidth ${resized.scroll}. Tooltip left stayed ${resized.left}, hidden=${resized.hidden}.`,
      });
    } else {
      push(findings, {
        severity: 'note',
        code: 'tooltip-resize',
        browser: browserName,
        message: `Narrowing from 1440 to 320 with a Denver tooltip open left scrollWidth ${resized.scroll}. Tooltip hidden=${resized.hidden}.`,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-view="margin"]').click();
  const grayscale = await page.evaluate(() => {
    document.documentElement.style.filter = 'grayscale(1)';
    const list = [...document.querySelectorAll('#county-list .county-value')].map((node) => node.textContent);
    const labels = [...document.querySelectorAll('path.county')].map((path) => path.getAttribute('aria-label'));
    const legend = [...document.querySelectorAll('#legend .legend-label')].map((node) => node.textContent);
    document.documentElement.style.filter = '';
    return {
      listHasText: list.every((value) => value && value !== ''),
      labelsHaveValues: labels.every((label) => /[DR]\+\d+\.\d$|Tie$|No data$|\d+\.\d%$/.test(label)),
      legend,
      sample: labels.slice(0, 3),
    };
  });
  if (!grayscale.listHasText || !grayscale.labelsHaveValues || grayscale.legend.length < 8) {
    push(findings, { severity: 'fail', code: 'grayscale-text', browser: browserName, message: 'Grayscale filter removed a text equivalent.', grayscale });
  } else {
    push(findings, {
      severity: 'note',
      code: 'grayscale-text',
      browser: browserName,
      message: 'A CSS grayscale(1) filter left county-list values, map aria-labels, and legend text in place. This is not an operating-system grayscale or forced-colors pass.',
    });
  }

  await page.emulateMedia({ forcedColors: 'active' });
  const forced = await page.evaluate(() => ({
    list: document.querySelector('#county-list .county-value')?.textContent ?? '',
    swatch: getComputedStyle(document.querySelector('#legend .swatch')).backgroundColor,
    adjust: getComputedStyle(document.querySelector('#legend .swatch')).forcedColorAdjust,
  }));
  await page.emulateMedia({ forcedColors: 'none' });
  push(findings, {
    severity: 'note',
    code: 'forced-colors',
    browser: browserName,
    message: `Playwright forced-colors emulation still showed a county-list value “${forced.list}”. Swatch computed background was ${forced.swatch}, forced-color-adjust ${forced.adjust}. Emulation is not Windows high contrast and not a screen reader.`,
  });
}

async function auditMapClick(page, findings, browserName, expectations) {
  const point = await pointOnCounty(page, '08031');
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => document.querySelector('#details-heading')?.textContent === 'Denver County');
  const actual = await page.evaluate(() =>
    [...document.querySelectorAll('#details tbody tr')].map((row) => row.querySelector('.candidate-name')?.textContent.trim()),
  );
  const expected = expectations.get('08031').rows.map((row) => row.name);
  if (actual.join('|') !== expected.join('|')) {
    push(findings, { severity: 'fail', code: 'map-click-table', browser: browserName, message: 'Map click on Denver did not show the expected candidate order.', actual, expected });
  }
}

async function runBrowser(engineName, launchOptions, elections, config, findings) {
  activeBrowser = engineName;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...launchOptions });
  } catch (error) {
    push(findings, {
      severity: 'note',
      code: 'browser-unavailable',
      browser: engineName,
      message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
    return { browser: engineName, launched: false };
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(origin);
    await page.locator('path.county').last().waitFor();
    const served = await page.evaluate(async () => {
      const [president, governor] = await Promise.all([
        fetch('data/co/2024-general-president.json').then((response) => response.json()),
        fetch('data/co/2022-general-governor.json').then((response) => response.json()),
      ]);
      return {
        president: president.builtAt,
        governor: governor.builtAt,
        presidentCounties: Object.keys(president.counties).length,
        governorCounties: Object.keys(governor.counties).length,
      };
    });
    if (served.president !== elections.president.builtAt || served.governor !== elections.governor.builtAt) {
      push(findings, { severity: 'fail', code: 'served-builtAt', browser: engineName, message: 'Served election builtAt does not match the files on disk.', served });
    }
    for (const election of [elections.president, elections.governor]) {
      for (const view of ['margin', 'turnout']) {
        const { expectations } = await auditScale(page, findings, election, config, view);
        if (view === 'margin') election.__expectations = expectations;
        await auditAttribution(page, findings, election, config, view);
      }
    }
    let tableMismatches = 0;
    for (const election of [elections.president, elections.governor]) {
      tableMismatches += await auditTables(page, findings, election, config, election.__expectations);
    }
    await page.locator('#election-select').selectOption('election|2024-general-president');
    await page.locator('[data-view="margin"]').click();
    await auditTooltip(page, findings, engineName);
    await auditKeyboard(page, findings, engineName);
    await auditDefinitions(page, findings, engineName);
    await auditMapClick(page, findings, engineName, elections.president.__expectations);
    await auditPresentation(page, findings, engineName);
    if (errors.length) push(findings, { severity: 'fail', code: 'pageerror', browser: engineName, message: errors.join('\n') });
    const fails = findings.filter((item) => item.severity === 'fail' && item.browser === engineName).length;
    return { browser: engineName, launched: true, version: browser.version(), tableMismatches, fails };
  } finally {
    await browser.close();
  }
}

const config = await loadJson(path.join(root, 'data', 'co', 'config.json'));
const elections = {
  president: await loadJson(path.join(root, 'data', 'co', '2024-general-president.json')),
  governor: await loadJson(path.join(root, 'data', 'co', '2022-general-governor.json')),
};
const findings = [];
const started = new Date().toISOString();
const browsers = [];
browsers.push(await runBrowser('chromium', {}, elections, config, findings));
browsers.push(await runBrowser('chrome', { channel: 'chrome' }, elections, config, findings));
const report = {
  started,
  finished: new Date().toISOString(),
  origin,
  browsers,
  failCount: findings.filter((item) => item.severity === 'fail').length,
  findings,
};
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'ui-audit.json'), JSON.stringify(report, null, 2));
const brief = {
  browsers,
  failCount: report.failCount,
  fails: findings.filter((item) => item.severity === 'fail').map((item) => ({ code: item.code, browser: item.browser, electionId: item.electionId, view: item.view, message: item.message })),
  notes: findings.filter((item) => item.severity === 'note').map((item) => ({ code: item.code, browser: item.browser, width: item.width, message: item.message })),
};
console.log(JSON.stringify(brief, null, 2));
if (report.failCount) process.exitCode = 1;
