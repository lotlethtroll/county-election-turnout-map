# Verification record

Verified on October 10, 2026. The website is local and has not been deployed. This records observed checks, not a claim of complete acceptance or WCAG conformance.

## Official data

`npm run build -- co` passes 3,525 validation checks. Both elections contain all 64 counties. The 2022 Governor data contains seven tickets; the 2024 President data contains fourteen tickets, including write-ins. The 2024 turnout spreadsheet contributes 3,183 precincts. The extractor checks 1,365 PDF numeric cells against a separate text extraction and reconciles each county's turnout with the abstract.

Source control totals:

| Election | Active registered voters | Ballots cast | Votes in selected race |
| --- | ---: | ---: | ---: |
| 2022 Governor | 3,839,814 | 2,543,316 | 2,508,830 |
| 2024 President | 4,074,612 | 3,241,155 | 3,192,745 |

The final `npm test` run passed all 24 tests. They cover distinct turnout/share denominators, ties and near ties, null/zero cases, aliases and duplicate counties, multiple validation failures, certification refusal, publish rollback, report-write failure after publication, coherent build IDs, failed-request retry and out-of-order responses. Public-data tests also check county coverage, geometry size, schema and official control values; scale tests cover margin bands and future primary behavior.

## Browser integration

`scripts/browser-check.mjs` passed in these headless browsers/engines:

| Browser or engine | Version | Widths checked |
| --- | --- | --- |
| Chromium | 156.0.8078.4 | 1440, 768, 320 |
| Firefox | 157.0 | 1440, 768, 320 |
| WebKit | 27.2 | 1440, 768, 320 |
| Installed Microsoft Edge | 155.0.4283.45 | 1440, 768, 320 |

All checks passed: 64 map paths; one roving map Tab stop; Home/End and Enter selection; detail rows for all candidates; county persistence when switching elections; correct Adams and Yuma turnout; Close restores focus; search selects the county; no horizontal page overflow; no JavaScript exceptions; no third-party runtime requests; no cookies, localStorage or sessionStorage.

The axe WCAG A/AA scan reported zero violations in Chromium at all three widths with the county detail view open. Desktop and narrow screenshots were visually inspected. This is **not** the specifically requested WAVE check or a complete screen-reader audit. WebKit on Windows is not Safari on an Apple device, and responsive/touch emulation is not a real-phone test.

`scripts/browser-scenarios.mjs` also passed initial geometry-load failure and Retry, touch county selection and election persistence, relative assets under a simulated `/capstone/` repository subpath, and a JavaScript-disabled fallback linking to the official state-election-office directory. The fallback directory is state-neutral so website code does not hardcode Colorado.

`scripts/browser-fixtures.mjs` passed an alternate-state configuration, grouped primary contests and party switching, selected-county persistence, candidate labels, null turnout and missing-county patterns, and switching back to Colorado. These synthetic responses exist only inside the test browser. The test caught and prompted a fix to include the selected primary party in the announced status text. Scale unit tests cover exact D/R margin boundaries, ties, uniform turnout, primary colors and other-party colors.

## Performance

Follow-up: [six-run performance audit](performance-audit.md) covers cold desktop/narrow loads, uncached and cached election changes, view changes, county selection, and request counts. All six runs passed: maximum initial DOM readiness 1,333 ms, uncached switch 192 ms, cached switch 9 ms, view 15 ms, county selection 14 ms; 558,821 decoded bytes and 83,033-byte geometry. RAF sampling observes the updated DOM, not guaranteed completed paint. The earlier single-run evidence below remains historical.

Cold Chromium context, 10 Mbps download / 5 Mbps upload, 100 ms simulated network latency, 4x CPU slowdown, local HTTP server without response compression:

| Measurement | Observed | Requirement |
| --- | ---: | ---: |
| Initial map ready | 1,714 ms | <3,000 ms |
| First uncached election switch | 200 ms | <500 ms |
| Margin/Turnout switch | 100 ms | <500 ms |
| Initial decoded transfer bytes | 558,079 | <1,000,000 |
| County geometry | approximately 83 KB | <=500 KB |

These timings establish performance under this recorded profile, not all network conditions or the future public host. The geometry includes the common build ID. Small source edits may change exact byte totals.

## Reproduce browser checks

The optional QA dependencies are local-only and excluded from the website and normal build:

```powershell
npm install --prefix .cache/qa playwright @axe-core/playwright
node .cache/qa/node_modules/playwright/cli.js install chromium firefox webkit
```

Start `npm run serve` in another terminal, then:

```powershell
node scripts/browser-check.mjs
node scripts/browser-scenarios.mjs
node scripts/browser-fixtures.mjs
node scripts/performance-audit.mjs
node scripts/browser-ui-audit.mjs
```

Reports and screenshots are written to `.cache/qa/results/`. Microsoft Edge must be installed for the Edge check. Browser automation originally attempted the T3 shared preview; its host became unavailable, so the checks used local headless Playwright.

## Follow-up UI verification

The [UI audit](ui-audit.md) passed in Chromium and installed Chrome with zero table mismatches for every county in both elections. It prompted fixes to open-tooltip resize positioning, county-button border contrast, and source/footer link target heights. The existing four-browser suite and axe scans passed after these changes, as did the dedicated tooltip-resize scenario. See the audit for precise coverage and limits.

## Remaining manual acceptance

Additional audit evidence: [pipeline extensibility](extensibility-audit.md), [dependency/static audit](dependency-audit.md), and `tests/extensibility.test.js`. The actual pipeline now has isolated coverage for an additional election entry and a synthetic second-state adapter using real Census geometry. These tests preserve repository data and verify invalid updates preserve fixture publication. The election entry reuses archived official 2022 inputs; it is explicitly not a new historical election. The second-state rows/controls are explicitly synthetic. `browser-scenarios.mjs` additionally passed an aborted election-data request followed by Retry, complementing the existing geometry-request retry.

- WAVE and screen-reader testing, including live announcements, SVG focus, tooltip dismissal and focus return.
- Safari on Apple hardware and at least one real phone; installed Chrome 155.0.8059.39 passed the follow-up UI audit. The engine matrix above supplies partial coverage.
- First-time users finding turnout/winner and comparing elections without help.
- A second maintainer following the guide to add an election and state.
- Actual GitHub Pages HTTPS, public URL, and production network checks after the user publishes.

The implementation is complete for local review; these external/manual acceptance checks are not marked passed.
