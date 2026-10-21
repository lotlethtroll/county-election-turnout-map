# Maintainer guide

This repository contains the static site, its prebuilt Colorado data, and the offline source-to-data build. Rebuilding writes validated JSON and county geometry into `data/`; it does not commit, push, or deploy anything.

For current automated and browser evidence, remaining acceptance work, and verification limits, see the [verification record](verification.md) and [acceptance checklist](acceptance-checklist.md).

## View the included site

Viewing the checked-in site does not require Python or rebuilding. Install Node.js 22 or later, open PowerShell at the repository root, then run:

```powershell
node scripts/serve.mjs
```

Open the `http://127.0.0.1:4173` address printed in the terminal. Keep that window open while browsing; press Ctrl+C to stop the server. The app uses fetch and JavaScript modules, so opening `index.html` as a `file://` URL will not work. The local server permits only the site entry point and public `css/`, `js/`, `vendor/`, and `data/` paths. That is a serving rule, not a privacy boundary: source inputs and build files remain in this repository.

## Set up and rebuild

A data rebuild needs Node.js 22+, npm, and Python 3.11+. The Python extractor requires the pinned packages in `requirements.txt`; use a virtual environment so they do not affect other Python projects. From PowerShell at the repository root:

```powershell
npm ci
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:CETM_PYTHON = (Resolve-Path .\.venv\Scripts\python.exe).Path
npm run build -- co
```

The `CETM_PYTHON` setting is for the current PowerShell session. It directs the 2024 PDF extractor to the environment with `pdfplumber==0.11.7`. The build uses pinned npm dependencies, including mapshaper and Cheerio; SheetJS is supplied as the local archive `vendor/xlsx-0.20.3.tgz`. D3 is also vendored for browser use. Python is used only for PDF table extraction.

The one-command rebuild after setup is `npm run build -- co`. It checks the configured election certification flags and SHA-256 hashes for the archived inputs, extracts both Colorado elections, normalizes counties to FIPS, calculates values from counts, validates them against source and independent statewide controls, rebuilds geometry from the pinned Census ZIP, and publishes the complete state data locally. Do not edit generated files in `data/` by hand; edit source/configuration and regenerate them.

The build checks that `build/reports/` can accept a report before publication. If that preflight fails, the build stops before changing published data; it exits nonzero and attempts to write failure evidence if possible. For validation or publish failures, inspect the terminal and the latest files at `build/reports/co-latest.txt` and `build/reports/co-latest.json` (if the evidence write succeeded). The publisher stages a whole state and state registry, swaps them as a unit, and rolls them back if the swap fails. If rollback itself reports an error, stop and inspect `data/` before trying again.

After publication, a later disk or report-write failure cannot undo the completed publication. In that case the command prints an explicit `Data published successfully (build <id>); validation report could not be saved` warning, returns the published result, and keeps a successful exit status. Treat that message as a successful local data update with missing report evidence: note the build ID, inspect the published data, and restore report storage before the next build. Do not describe it as a failed build or assume a new report file exists. On a normal successful build, the latest human-readable and JSON reports are written to the paths above. A successful build replaces local `data/co/` and updates `data/states.json`; it is not a remote publication.

The publisher gives `data/co/config.json`, `counties.geojson`, and every election JSON from one build the same `buildId`. The browser checks that ID when loading the state bundle and each election. If a deployment changes between requests, the loader rejects the mixed generation, clears the cached state files, and reports a retryable load error. The user can retry to load one coherent generation; do not manually combine files from different builds.

At the report currently in the repository, the Colorado build lists 3,525 passed checks and 0 failed. The current automated suite has 24 passing tests, including build/report failure behavior, shared build IDs, and isolated election/state extensibility. These are recorded results, not a substitute for rerunning after changes:

```powershell
npm run build -- co
npm test
```

## Update Colorado with a new election

1. Obtain certified source files from the election office. Preserve downloaded originals unchanged under `states/co/sources/`; record source name, publisher, URL and retrieval date in provenance/configuration. Never enter inferred or hand-corrected election counts.
2. Add a new election entry in `states/co/config.json` with a unique ID, label/date, type, race, `certified: true`, adapter name, supported `sourceFormat`, source file paths under `states/co/sources/`, and attributed sources. For general elections set `party` to `null`; for primaries provide the party code. Keep county configuration and exact FIPS identities aligned with the official source.
3. Add a SHA-256 entry for every source file to `sourceIntegrity`. For example:

   ```powershell
   Get-FileHash states/co/sources/new-results.pdf -Algorithm SHA256
   ```

   Update `states/co/sources/provenance.json` with matching filenames, hashes, source attribution, and retrieval dates. The Census boundary ZIP is separately pinned in `boundaries` and is checked too. A hash mismatch is a build failure; resolve it by confirming the intended official file and updating its recorded hash/provenance, not by bypassing the integrity check.
4. The Colorado adapter in `build/adapters/co.js` must recognize the configured `sourceFormat`. Reuse an existing reader only when the official file layout is the same. For a new layout, add extraction that returns the adapter contract in `docs/data-contract.md`: county rows, candidates, independent official totals, and reportable issues. Keep PDF extraction in `build/extract_pdf_tables.py` when required. Add parser/validation coverage for a new format.
5. Run `npm run build -- co`, read the full report, and check the generated election JSON against source county rows plus independent official statewide totals. Investigate every failure; do not change certified source files to make checks pass. Review the generated site locally with `node scripts/serve.mjs` before preparing a release.

A failed update leaves the previous generated files in place. The report files are diagnostic outputs and are rewritten on each build attempt, including failed attempts.

## Add another state

A new state needs a build configuration at `states/<abbr>/config.json`, unchanged official source inputs and provenance under `states/<abbr>/sources/`, and an adapter at `build/adapters/<abbr>.js`. Use a lowercase two-letter abbreviation and two-digit state FIPS. Configure each county with its five-digit FIPS, display name and known source aliases; every source row must match uniquely. Point `boundaries.file` to the pinned national Census ZIP and set the state FIPS, simplification and precision. Supply SHA-256 values for all source and boundary inputs.

Each election must have a unique ID, date, type, race, certification flag, source paths, format and source citations. The adapter's `extract(election, root, temporary)` returns `{counties, candidates, official, issues}` as defined in `docs/data-contract.md`. County counts and candidate totals must reconcile with independently transcribed official controls. Run `npm run build -- <abbr>` and resolve the complete validation report before using the generated files. A successful publisher run also adds the state to `data/states.json`. Verify that the public UI reads it through configuration and works under the repository subpath.

Use [`states/co/config.json`](../states/co/config.json) as the complete configuration example. The build-only fields have this shape; replace source paths and hashes with your archived official inputs:

```js
boundaries: {
  file: 'states/_census/cb_2025_us_county_500k.zip',
  sha256: '<copy the existing pinned boundary SHA-256>',
  simplify: '15%',
  precision: 0.00001
},
sourceIntegrity: [
  {file: 'states/de/sources/results.json', sha256: '<64 lowercase hexadecimal digits>'},
  {file: 'states/de/sources/controls.json', sha256: '<64 lowercase hexadecimal digits>'}
]
```

This is a field-shape example, not valid JSON or a ready-to-build configuration. The unchanged national ZIP and its hash can be reused for another state; `stateFips` selects its counties. `simplify` is a mapshaper argument and `precision` is numeric. Each county `name` must exactly match Census `NAME` because the boundary validator checks it; put election-source name variants in `aliases`. Name normalization already ignores case, surrounding whitespace and a County suffix.

An adapter is an ES module with a named export:

```js
import fs from 'node:fs/promises';
import path from 'node:path';
export async function extract(election, root, temporary) {
  const rows = JSON.parse(await fs.readFile(path.join(root, election.sourceFiles.rows), 'utf8'));
  const official = JSON.parse(await fs.readFile(path.join(root, election.sourceFiles.controls), 'utf8'));
  return {counties: rows.counties, candidates: rows.candidates, official, issues: []};
}
```

This JSON-reader skeleton illustrates the interface; use a reader that matches the actual official source format. `adapter: "de"` loads `build/adapters/de.js`; the filename stem must be two lowercase letters. `sourceFormat` is interpreted by your adapter, which should reject unsupported layouts. Always return an `issues` array and preserve unmatched or malformed rows as failures. Resolve source paths against `root`; `temporary` is an election-specific scratch location. Obtain statewide controls separately from official source totals rather than deriving them from the extracted county rows.

Outside Colorado, unavailable county active voters must be explicit `null`, never an omitted field. They produce unavailable turnout. Colorado requires complete counts. Zero race votes are permitted and produce No data shares/margins; zero ballots with positive active voters gives 0% turnout. Zero active voters fail the current turnout validator. Non-Colorado statewide active-voter and race-total controls may be absent when the source lacks them; ballots and every candidate's statewide vote control remain required. General elections use `party: null`; each primary party contest needs its own ID and party code.

For a runnable isolated example, read [`tests/extensibility.test.js`](../tests/extensibility.test.js) and run `node --test tests/extensibility.test.js`. Its temporary fixture demonstrates a config-only additional Colorado election and a new Delaware adapter/configuration with real Census geometry and explicitly synthetic election counts. It leaves published repository data untouched and checks rejection/preservation cases. Synthetic fixtures exercise certification flags; only the election office's evidence establishes actual certification. Replace synthetic inputs and attribution with unchanged certified official sources for real state data. See the [extensibility audit](extensibility-audit.md) for tested cases and evidence limits.

## Review and publish

For local review, run `node scripts/serve.mjs` after a successful build. The included site data is already generated, so no Python setup is needed for review.

GitHub Pages publication is a separate maintainer action. This project does not deploy automatically. Before publishing, inspect the full diff, source attribution, build report and generated `data/` files, and run the build and tests. Then perform the repository's normal GitHub Pages commit/push and Pages configuration steps yourself; confirm the deployed address uses HTTPS and verify the live site afterward.

Treat the GitHub repository and its Pages site as public. A repository-root Pages deployment makes repository files—including `states/` official source files and build artifacts—publicly accessible; the local server's path allowlist does not protect those files on GitHub. Keep only material intended for a public repository in this project. The project does not collect browser data, but the hosting provider may log visitor IP addresses as described in the About section.
