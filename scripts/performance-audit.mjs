// Bounded performance audit: 3 cold browser contexts at desktop and narrow widths.
// Requires the documented local Playwright install and a server at :4173.
import { chromium } from '../.cache/qa/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import os from 'node:os';

const origin = 'http://127.0.0.1:4173';
const profile = { downloadMbps: 10, uploadMbps: 5, latencyMs: 100, cpuSlowdown: 4 };
const rafTimeoutMs = 10000;
const targets = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'narrow', width: 390, height: 844 },
];
const runs = [];
const browser = await chromium.launch({ headless: true });

async function pageAction(page, action, done) {
  return page.evaluate(({ action, done, timeoutMs }) => new Promise((resolve, reject) => {
    const start = performance.now();
    try {
      if (action === 'uncachedElection') {
        const select = document.querySelector('#election-select');
        select.value = 'election|2022-general-governor';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (action === 'cachedElection') {
        const select = document.querySelector('#election-select');
        select.value = 'election|2024-general-president';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (action === 'viewChange') {
        document.querySelector('[data-view="turnout"]').click();
      } else if (action === 'countySelection') {
        document.querySelector('path[data-fips="08001"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    } catch (error) { reject(error); return; }
    const isDone = new Function(`return (${done})`);
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${action} DOM state after ${timeoutMs} ms`)), timeoutMs);
    const poll = () => {
      if (isDone()) {
        clearTimeout(timer);
        resolve(performance.now() - start);
      }
      else requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }), { action, done, timeoutMs: rafTimeoutMs });
}

try {
  for (const target of targets) {
    for (let index = 1; index <= 3; index++) {
      const context = await browser.newContext({ viewport: { width: target.width, height: target.height } });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false, latency: profile.latencyMs,
        downloadThroughput: profile.downloadMbps * 125000,
        uploadThroughput: profile.uploadMbps * 125000,
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuSlowdown });
      const requests = [];
      page.on('request', request => requests.push({ url: request.url(), resourceType: request.resourceType() }));
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      const initialMs = await page.evaluate(timeoutMs => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for initial map DOM state after ${timeoutMs} ms`)), timeoutMs);
        const poll = () => {
          if (document.querySelectorAll('path.county').length === 64 &&
              !document.querySelector('#election-select').disabled) {
            clearTimeout(timer);
            resolve(performance.now());
          }
          else requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
      }), rafTimeoutMs);
      // performance.now() is relative to the navigation time origin in this page.
      const initialSinceGotoMs = initialMs;
      const initial = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const resources = performance.getEntriesByType('resource');
        const geometry = resources.filter(entry => /counties\.geojson(?:\?|$)/.test(entry.name));
        return {
          totalDecodedBytes: nav.decodedBodySize + resources.reduce((sum, entry) => sum + entry.decodedBodySize, 0),
          geometryDecodedBytes: geometry.reduce((sum, entry) => sum + entry.decodedBodySize, 0),
          resources: resources.map(entry => ({ url: entry.name, decodedBodySize: entry.decodedBodySize, transferSize: entry.transferSize })),
        };
      });
      const firstCount = requests.length;
      const uncachedElectionMs = await pageAction(page, 'uncachedElection', "document.querySelector('#status-line').textContent.includes('2022')");
      const requestCountAfterUncachedElection = requests.length;
      assert.equal(requestCountAfterUncachedElection, firstCount + 1, 'First election switch should add exactly one data request');
      const cachedElectionMs = await pageAction(page, 'cachedElection', "document.querySelector('#status-line').textContent.includes('2024')");
      const requestCountAfterCachedElection = requests.length;
      assert.equal(requestCountAfterCachedElection, requestCountAfterUncachedElection, 'Returning to the loaded election should not add a request');
      const viewChangeMs = await pageAction(page, 'viewChange', "document.querySelector('#status-line').textContent.includes('Turnout')");
      const countySelectionMs = await pageAction(page, 'countySelection', "document.querySelector('#details-heading')?.textContent.includes('Adams')");
      const allRequests = requests;
      const thirdParty = allRequests.filter(request => !request.url.startsWith(origin));
      const run = {
        viewport: target.name, width: target.width, sample: index,
        initialMapReadyMs: Math.round(initialSinceGotoMs),
        uncachedElectionMs: Math.round(uncachedElectionMs),
        cachedElectionMs: Math.round(cachedElectionMs),
        viewChangeMs: Math.round(viewChangeMs),
        countySelectionMs: Math.round(countySelectionMs),
        initialDecodedBytes: initial.totalDecodedBytes,
        geometryDecodedBytes: initial.geometryDecodedBytes,
        initialResources: initial.resources,
        initialRequestCount: firstCount,
        requestCountAfterUncachedElection,
        requestCountAfterCachedElection,
        thirdPartyRequests: thirdParty,
        requestURLs: allRequests.map(request => request.url),
      };
      runs.push(run);
      await context.close();
    }
  }
} finally { await browser.close(); }

const metricKeys = ['initialMapReadyMs', 'uncachedElectionMs', 'cachedElectionMs', 'viewChangeMs', 'countySelectionMs'];
const summaries = {};
for (const target of targets) {
  const selected = runs.filter(run => run.viewport === target.name);
  summaries[target.name] = {};
  for (const key of metricKeys) {
    const values = selected.map(run => run[key]).sort((a, b) => a - b);
    summaries[target.name][key] = { medianMs: values[1], maxMs: values[2], samplesMs: values };
  }
}
const thresholds = { initialMapReadyMs: 3000, uncachedElectionMs: 500, cachedElectionMs: 500, viewChangeMs: 500, countySelectionMs: 500 };
const checks = {};
for (const key of metricKeys) {
  const sorted = runs.map(run => run[key]).sort((a, b) => a - b);
  checks[key] = {
    limitMs: thresholds[key],
    pass: runs.every(run => run[key] < thresholds[key]),
    medianMs: (sorted[(sorted.length / 2) - 1] + sorted[sorted.length / 2]) / 2,
    maxMs: sorted.at(-1),
  };
}
checks.initialByteBudget = { limitBytes: 1000000, maxBytes: Math.max(...runs.map(run => run.initialDecodedBytes)), pass: runs.every(run => run.initialDecodedBytes < 1000000) };
checks.geometryBudget = { limitBytes: 500000, maxBytes: Math.max(...runs.map(run => run.geometryDecodedBytes)), pass: runs.every(run => run.geometryDecodedBytes <= 500000) };
checks.noThirdPartyRequests = { pass: runs.every(run => run.thirdPartyRequests.length === 0) };
const report = {
  generatedAt: new Date().toISOString(), origin, profile, runs, summaries, checks,
  environment: { browser: browser.version(), platform: os.platform(), architecture: os.arch() },
  caveat: 'Six sequential local headless Chromium runs; other machine/browser activity may contribute background load. Local server responses are uncompressed. No live hosted network path was measured.',
};
await fs.mkdir('.cache/qa/results', { recursive: true });
await fs.writeFile('.cache/qa/results/performance-audit.json', JSON.stringify(report, null, 2));
await fs.mkdir('docs', { recursive: true });
const lines = [
  '# Performance audit', '',
  `Measured ${report.generatedAt} against the local server at ${origin}. Six sequential, fresh Chromium contexts: three at 1440 px desktop and three at 390 px narrow width. Profile: 10 Mbps down, 5 Mbps up, ${profile.latencyMs} ms latency, ${profile.cpuSlowdown}x CPU slowdown. Environment: Chromium ${report.environment.browser} on ${report.environment.platform}/${report.environment.architecture}.`, '',
  `Times use browser performance.now() and requestAnimationFrame polling until the corresponding DOM state is observed; each poll has a ${rafTimeoutMs} ms timeout. This observes DOM readiness on an animation-frame callback and does not guarantee a completed paint. Initial map readiness is navigation start to 64 county paths plus enabled election control. Uncached election is the first 2022 election selection and waits for the 2022 status; cached election returns to 2024 already held in the app memory and waits for its status. View change waits for Turnout status. County selection dispatches a county click and waits for Adams details. These are UI response times, including application work and browser scheduling.`, '',
  '## Results', '',
  '| Viewport | Metric | Samples (ms) | Median | Maximum | Limit | Result |',
  '|---|---|---:|---:|---:|---:|---|',
];
const labels = { initialMapReadyMs: 'Initial map ready', uncachedElectionMs: 'First election load', cachedElectionMs: 'Return to cached election', viewChangeMs: 'View change', countySelectionMs: 'County selection' };
for (const target of targets) for (const key of metricKeys) {
  const s = summaries[target.name][key];
  lines.push(`| ${target.name} | ${labels[key]} | ${s.samplesMs.join(', ')} | ${s.medianMs} | ${s.maxMs} | <${thresholds[key]} | ${s.samplesMs.every(value => value < thresholds[key]) ? 'PASS' : 'FAIL'} |`);
}
lines.push('', '## Transfer and request checks', '',
  `Initial decoded bytes (HTML plus resources): max ${checks.initialByteBudget.maxBytes.toLocaleString()} bytes; limit <1,000,000: **${checks.initialByteBudget.pass ? 'PASS' : 'FAIL'}**.`,
  `County geometry decoded bytes: max ${checks.geometryBudget.maxBytes.toLocaleString()} bytes; limit <=500,000: **${checks.geometryBudget.pass ? 'PASS' : 'FAIL'}**.`,
  `Third-party runtime requests: **${checks.noThirdPartyRequests.pass ? 'none observed (PASS)' : 'observed (FAIL)'}**. All requests and per-run decoded resource sizes are in [performance-audit.json](../.cache/qa/results/performance-audit.json).`, '',
  'The harness asserts that the uncached-election interaction adds exactly one election data request and returning to 2024 adds no request because the app retains its data in memory. The report records request counts, full request URLs, and resource timing entries to expose request behavior and transfer sizes.', '',
  '## Limits', '',
  'The six runs were sequential and modest. Machine activity may affect the worst sample, so maxima are retained alongside medians. This measures local headless Chromium against the local uncompressed server; it does not establish public hosting performance or represent every device/network. `transferSize` can be zero for memory-cached entries, so byte-budget checks use decoded response sizes and the per-run initial resource list.', '',
  'Reproduce with `node scripts/performance-audit.mjs` while `npm run serve` is running on port 4173.');
await fs.writeFile('docs/performance-audit.md', lines.join('\n') + '\n');
console.log(JSON.stringify({ summaries, checks }, null, 2));
assert.ok(Object.values(checks).every(check => check.pass), 'One or more performance budgets failed. See docs/performance-audit.md and .cache/qa/results/performance-audit.json.');
