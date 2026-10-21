# UI audit

Recorded October 10, 2026, against `http://127.0.0.1:4173`. The listener was down (`Unable to connect to the remote server`) before the final pass, so this session started `node scripts/serve.mjs` and left it running. The script is `scripts/browser-ui-audit.mjs`. Machine-readable output is `.cache/qa/results/ui-audit.json` from the run that started at 2026-10-10T18:02:52Z and finished at 2026-10-10T18:03:00Z.

## Preview

`preview_status` first returned `"available":false`. `preview_open` with `reuseExistingTab: false` then opened `http://127.0.0.1:4173/` on tab `tab_4_af252840-a7ae-4562-bf3a-71b7a0ba62d4`. A page script on that tab read the 2024 President margin legend (four Democratic shades `#5B8FC7`, `#3B73B5`, `#245A99`, `#123F73` and four Republican shades `#D9605A`, `#C2403A`, `#9E2B26`, `#6E1A17`) and the footer: unofficial, not affiliated, Colorado Secretary of State, `datetime="2026-10-10T16:16:24.272Z"`, visible date October 10, 2026.

A later hover on that tab failed. Raw error: `The calling provider no longer owns an active thread run.` The checks below are headless Playwright.

## Browsers

| Browser | Version | Result |
| --- | --- | --- |
| Playwright Chromium | 156.0.8078.4 | Interactions and data checks passed. Panel border 1.49:1. |
| Installed Google Chrome (`channel: 'chrome'`) | 155.0.8059.39 | Same. |

Firefox, WebKit, and Edge were not repeated. Safari on Apple hardware was not run. A physical phone was not run.

## What the script compared

Published `data/co/2024-general-president.json` and `data/co/2022-general-governor.json` were read from disk and checked against the files the page fetched. For every county the script recomputed turnout as ballots cast ÷ active registered voters, share as votes ÷ race total, order by votes then name, and the leader as the single highest vote count. Display uses thousands separators and one decimal place.

Both elections, margin and turnout:

- Legend labels and swatch colors matched those recomputed bands. Margin bands are `[0,5)`, `[5,10)`, `[10,20)`, `[20, ∞)`, labeled `D+0 to D+5` through `D+20 or more` and the Republican equivalents, in the colors above. Turnout uses six `d3.scaleQuantize` bins from the lowest to the highest county turnout in that election. Neither published election showed a tie or a no-data extra.
- Each county path’s fill was the swatch for its band. The path’s `aria-label` and the county-list value used the same one-decimal text. List swatches matched path fills.

Candidate tables, both elections, all 64 counties, in both browsers: 0 mismatches. That includes party text, vote counts, shares, row order, the word Leader, the race total, `100.0%`, turnout, ballots cast, active registered voters, and the margin line under the table.

Footer in each election and each view: the notice says unofficial and not affiliated, the office link is the Colorado Secretary of State URL from `data/co/config.json`, and the `<time datetime>` plus visible date match `builtAt` (`October 10, 2026`). About lists the five configured sources with publisher and retrieved date. Those external pages were not opened.

## Interaction

On Denver’s interior, in margin view: the tooltip text matched the path label; moving onto the tooltip left it visible after 500ms; Escape hid it; a small move on the same county left it hidden; hovering Adams showed Adams.

Keyboard, both browsers: Tab reached a county; the tooltip matched that county’s label; the focus outline path had a `d`; ArrowDown moved focus; Enter opened details; when the tooltip was open, the first Escape hid only the tooltip; the next Escape closed the panel and returned focus to that path. Space selected. Close returned focus to that path. Choosing Yuma from the list focused the details heading. Escape then closed the panel and focused the Yuma path (`08125`). The list click was a DOM click with the pointer parked, so the pointer did not travel across the map and open a tooltip first.

Summary definition buttons for turnout, active registered voters, and margin: Enter opened the configured sentence, Space hid it, and a pointer click opened and closed it. About states both formulas in those same words.

## Contrast, size, and text without color

Sampled text (page title, status, labels, legend, summary figures, footer, county names, both view buttons, the election select) met 4.5:1, or 3:1 where the type is large. Legend swatches and county fills against white met 3:1. No horizontal overflow at 1440, 768, or 320 with Denver details open. Narrowing from 1440 to 320 while a Denver tooltip was open left `scrollWidth` at 320 in both browsers. In that last run the tooltip stayed visible (`hidden=false`) and did not widen the page.

Buttons, inputs, and selects: smallest measured box was 24 CSS pixels (the definition buttons). All 64 county-list buttons had a border of `rgb(107, 107, 107)` on white, 5.33:1. Lowest example: Adams County, `D+9.0`. About and footer links were in the same target-size pass; none were under 24 CSS pixels.

County path bounding boxes under 24 CSS pixels: 1 of 64 at 1440, 2 at 768, 31 at 320. The smallest is Broomfield (`08014`): about 21.5px at 1440, 19.9px at 768, and 7.2px at 320. The county list is the large target; those buttons are at least 40px tall.

A `grayscale(1)` filter left county-list values, map `aria-label`s, and legend text in place. Playwright `forcedColors: 'active'` still showed a list value (`D+9.0`) and a legend swatch of `rgb(91, 143, 199)` with `forced-color-adjust: none`. That emulation is not Windows high contrast. It is not an operating-system grayscale setting.

## Finding

Section panels use border `rgb(214, 211, 204)` (`#d6d3cc`, `--rule`) on `rgb(255, 255, 255)`. Contrast is 1.49:1 in Chromium and Chrome at 1440. Map fills, legend swatches, form controls, and county-list buttons are separate measurements and cleared 3:1.

Reproduction: open the site, inspect `.panel` `border-top-color` against its background. The script records this and exits 1.

## Not done

WAVE was not installed and was not run. This pass did not run axe. An axe result would not be a WAVE result.

No screen reader was used. Live announcement quality, SVG speech, and tooltip speech were not heard.

Safari, a real phone, and opening each source URL in a browser were not done. The grayscale check was a CSS filter. The high-contrast check was Playwright’s forced-colors emulation.

## Run again

With `npm run serve` already listening:

```powershell
node scripts/browser-ui-audit.mjs
```
