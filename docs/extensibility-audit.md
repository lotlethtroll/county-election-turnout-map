# Extensibility and maintainer walkthrough

Recorded 2026-10-10. Relevant command: `node --test tests/extensibility.test.js`.
Result: 2 tests passed, 0 failed, approximately 3.2 seconds on this Windows workspace.
These tests invoke the actual `build/cli.js` pipeline in disposable OS temporary
directories. They exercise configuration, integrity hashes, adapter import,
normalization, calculation, validation, national Census ZIP filtering, reporting,
publication and the unchanged public data loader/election grouping code.
They do not rebuild or modify the repository's published `data/` or source inputs.

## Added election

The fixture first builds Colorado's archived certified 2022 Governor source format,
then adds another configuration entry using that same unchanged reader and official
source files. Its ID and label explicitly identify a fixture repeat, rather than
claiming another historical election. The second build publishes both election
files, with identical county/statewide counts and a shared build ID. The shared
frontend election grouping exposes the added entry and the data loader reads it
using a repository subpath. CSS and JavaScript content hashes remain unchanged.

This proves the mechanics of adding an entry when a supported official format is
reused. It does not demonstrate parsing a genuinely new official election's source
layout, nor replace browser interaction verification of the resulting selector.

## Added state and primary

The fixture adds Delaware configuration and `build/adapters/de.js`. The adapter
reads separately supplied synthetic county rows and synthetic statewide controls;
it does not derive its controls from the county rows. All fixture election inputs
are explicitly marked synthetic and remain under the temporary fixture root.
The actual archived national Census boundary ZIP supplies Delaware's three real
county polygons: Kent (10001), New Castle (10003), Sussex (10005).

The pipeline publishes a general and Democratic primary contest, adds Delaware to
the existing Colorado registry, and leaves Colorado's published bytes unchanged.
The unchanged public loader accepts the new state's geometry and elections under
a repository subpath; shared election grouping exposes both contests. Candidate
colors survive publication. Normalization matches case, surrounding whitespace
and a County suffix. Primary margins use candidate names. An exact vote tie remains
Tie. Zero ballots with a positive active-voter denominator gives 0% turnout;
zero race votes gives null shares and No data. Explicit null active voters is
accepted outside Colorado and produces null county/statewide turnout.

Separate failing builds reject an uncertified contest, an omitted active-voter
field, null candidate votes, omitted ballots, negative candidate counts,
candidate/statewide control disagreement, a missing county row, and an unsupported
source format. Each failure leaves every previously published fixture data file
and state registry byte-for-byte unchanged. Optional absent statewide active-voter
and race-total controls are accepted for the generic state; candidate totals and
ballots controls remain mandatory.

This is synthetic adapter integration evidence, not a claim that official Delaware
election data was acquired or independently verified. The earlier browser fixture
and these pipeline tests complement each other; this audit does not claim a browser
was operated against this newly generated Delaware fixture.

## Review as an unfamiliar maintainer

The guide gives reproducible setup commands, explains archived source integrity,
warns against source modification, describes failure preservation and correctly
separates local publication from deployment. Following it with the data contract
and existing Colorado config was sufficient for both integrations. The walkthrough
was performed by a coding agent unfamiliar with these build details, not an observed
human maintainer study. The initial guide required reading code or inspecting the
Colorado example for the following details:

1. Provide a minimal complete state configuration example, including
   `boundaries: {file, sha256, simplify, precision}` and
   `sourceIntegrity: [{file, sha256}]`. Mention that simplification is a mapshaper
   argument such as `15%`, precision is such as `0.00001`, and the existing pinned
   national ZIP/hash can be reused unchanged for another state. Merely listing
   field names does not show their expected types or placement.
2. Show an ES module adapter skeleton with the exact named export
   `export async function extract(election, root, temporary)`, relative source-path
   resolution, and the returned object. Adapter configuration is a lowercase
   two-letter filename stem, e.g. `adapter: "de"` loads `build/adapters/de.js`;
   longer descriptive names fail extraction. `sourceFormat` interpretation is the
   adapter's responsibility, while the CLI always requires an `issues` array.
3. County `name` must exactly match Census `NAME`, because geometry validation
   compares them directly. Source-specific display variants belong in `aliases`.
   Generic name normalization already ignores case, whitespace and County suffixes.
   The current guide says identities must align but does not state this name check.
4. State explicitly that unavailable county active voters must be `null` outside
   Colorado, never an omitted property; Colorado requires complete counts. Zero
   race votes are allowed, but zero active voters do not satisfy the current turnout
   validator. Explain the optional non-Colorado statewide active-voter/race-total
   controls alongside mandatory ballots and candidate controls, and show separately
   obtained controls rather than computing them from the extracted county rows.
5. Give a fixture/test command for safely developing an adapter before touching
   published data, and distinguish fixture certification flags from real evidence
   that an election office certified a dataset. Configuration's boolean gate cannot
   independently establish real-world certification.

The maintainer guide now includes these constraints, a build-only configuration
field example, an ES module adapter skeleton, and the runnable temporary-fixture
test reference. These were documentation gaps, not observed pipeline failures in
the cases above. The audit introduced no production build changes.

### Tested template pointers

The complete disposable configuration and adapter are in
[`tests/extensibility.test.js`](../tests/extensibility.test.js), in the second test.
Copy its structure for a development fixture, then replace all synthetic rows,
controls and attribution with archived certified official inputs before any real
publication. The first test shows the exact config-only entry addition with the
existing Colorado reader. The actual fixture adapter has this interface:

```js
import fs from 'node:fs/promises';
import path from 'node:path';
export async function extract(election, root) {
  if (election.sourceFormat !== 'synthetic-json') throw new Error('Unsupported synthetic source format');
  const rows = JSON.parse(await fs.readFile(path.join(root, election.sourceFiles.rows), 'utf8'));
  const official = JSON.parse(await fs.readFile(path.join(root, election.sourceFiles.controls), 'utf8'));
  if (!rows.synthetic || !official.synthetic) throw new Error('Fixture inputs must be marked synthetic');
  return {counties: rows.counties, candidates: rows.candidates, official, issues: []};
}
```

The tested config uses `adapter: "de"`, `sourceFormat: "synthetic-json"`,
`sourceFiles: {rows: "states/de/sources/synthetic-rows.json", controls:
"states/de/sources/synthetic-controls.json"}`, and a separate SHA-256 entry for
each of those paths. It copies `boundaries` unchanged from
[`states/co/config.json`](../states/co/config.json), whose pinned ZIP contains all
states; `stateFips: "10"` causes the actual boundary builder to select Delaware.
County definitions are `{fips: "10001", name: "Kent", aliases: []}`,
`{fips: "10003", name: "New Castle", aliases: []}`, and
`{fips: "10005", name: "Sussex", aliases: []}`. General elections use
`type: "general", party: null`; the primary uses `type: "primary", party: "D"`
and a distinct ID. The test's `fixture(t)` helper copies the actual build modules
and sources, links the immutable boundary archive and dependencies, and registers
temporary-directory cleanup. Its `fixtureLoader(root)` reads published output
through the actual frontend loader using a repository subpath.

## Static frontend audit

Searching `js/`, `css/` and `index.html` for Colorado, state code `co`, Colorado
county FIPS prefixes, county count 64, 2022/2024, Governor/President and named current
candidates found only an illustrative Colorado status string in a source comment
in `js/statusLine.js`. No matching runtime state/election constants were found.
The shared loader and election grouping operate on the newly generated fixtures.
This bounded search supports configuration-driven behavior; it is not an exhaustive
proof of all possible state-specific assumptions.
