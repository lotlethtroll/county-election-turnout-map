# Performance audit

Measured 2026-10-10T17:59:26.182Z against the local server at http://127.0.0.1:4173. Six sequential, fresh Chromium contexts: three at 1440 px desktop and three at 390 px narrow width. Profile: 10 Mbps down, 5 Mbps up, 100 ms latency, 4x CPU slowdown. Environment: Chromium 156.0.8078.4 on win32/x64.

Times use browser performance.now() and requestAnimationFrame polling until the corresponding DOM state is observed; each poll has a 10000 ms timeout. This observes DOM readiness on an animation-frame callback and does not guarantee a completed paint. Initial map readiness is navigation start to 64 county paths plus enabled election control. Uncached election is the first 2022 election selection and waits for the 2022 status; cached election returns to 2024 already held in the app memory and waits for its status. View change waits for Turnout status. County selection dispatches a county click and waits for Adams details. These are UI response times, including application work and browser scheduling.

## Results

| Viewport | Metric | Samples (ms) | Median | Maximum | Limit | Result |
|---|---|---:|---:|---:|---:|---|
| desktop | Initial map ready | 1291, 1292, 1306 | 1292 | 1306 | <3000 | PASS |
| desktop | First election load | 165, 189, 192 | 189 | 192 | <500 | PASS |
| desktop | Return to cached election | 5, 6, 7 | 6 | 7 | <500 | PASS |
| desktop | View change | 6, 7, 10 | 7 | 10 | <500 | PASS |
| desktop | County selection | 5, 6, 14 | 6 | 14 | <500 | PASS |
| narrow | Initial map ready | 1309, 1310, 1333 | 1310 | 1333 | <3000 | PASS |
| narrow | First election load | 172, 173, 182 | 173 | 182 | <500 | PASS |
| narrow | Return to cached election | 5, 6, 9 | 6 | 9 | <500 | PASS |
| narrow | View change | 10, 12, 15 | 12 | 15 | <500 | PASS |
| narrow | County selection | 5, 5, 7 | 5 | 7 | <500 | PASS |

## Transfer and request checks

Initial decoded bytes (HTML plus resources): max 558,821 bytes; limit <1,000,000: **PASS**.
County geometry decoded bytes: max 83,033 bytes; limit <=500,000: **PASS**.
Third-party runtime requests: **none observed (PASS)**. All requests and per-run decoded resource sizes are in [performance-audit.json](../.cache/qa/results/performance-audit.json).

The harness asserts that the uncached-election interaction adds exactly one election data request and returning to 2024 adds no request because the app retains its data in memory. The report records request counts, full request URLs, and resource timing entries to expose request behavior and transfer sizes.

## Limits

The six runs were sequential and modest. Machine activity may affect the worst sample, so maxima are retained alongside medians. This measures local headless Chromium against the local uncompressed server; it does not establish public hosting performance or represent every device/network. `transferSize` can be zero for memory-cached entries, so byte-budget checks use decoded response sizes and the per-run initial resource list.

Reproduce with `node scripts/performance-audit.mjs` while `npm run serve` is running on port 4173.
