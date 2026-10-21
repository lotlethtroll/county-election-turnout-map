# Implementation decisions

These decisions clarify the supplied requirements and design. They preserve the Colorado scope, formulas, architecture and interface. The user confirmed that the Basin proposal is unrelated and must be ignored.

## Authority

The October 3 requirements specification refines the September 26 analysis. The October 10 design controls implementation structure and appearance. Its pseudocode is interpreted in light of the numbered requirements when an example omits a required case. The complete product is being built at the user's request even though a deployed prototype is no longer a course deliverable.

## Data and calculation details

The public schema is documented in data-contract.md. Source counts are never fabricated. The adapter preserves independent statewide control totals rather than calculating its own expected totals from county rows. Source percentages can verify calculated turnout only when they use the active-voter denominator. A percentage published with all registered voters is not interchangeable.

Validation collects every check that can run on the available inputs. A corrupt or unavailable source can prevent downstream checks; the report must explain that rather than report a pass. Any failure blocks replacement of public data. Missing-value rendering is defensive behavior and does not permit incomplete Colorado data through validation.

Exact ties use vote counts, not rounded displayed percentages. Bin membership uses absolute margin separately by party, avoiding asymmetric behavior at negative thresholds. Other-party leaders use neutral colors; primaries use candidate colors. A zero race denominator produces unavailable shares and margin. All six turnout shades and their labels derive from one scale, with uniform-value handling.

## Frontend consistency

A common buildId on configuration, geometry and elections detects a deployment changing between requests. The loader rejects mixed revisions and clears that state's cache; Retry reloads the complete bundle while the previous coherent view remains available. HTTP cache revalidation alone does not provide this guarantee. Summary and detail redraw keys include the revision as well as the election and county.

The store commits a coherent state/configuration/geometry/election snapshot only after required loads complete. Stale responses cannot overwrite a newer selection. Failed loads retain enough context to retry the intended change. Newest general election is the initial selection, even if a newer primary is configured. Memory caching is permitted by NFR-3.2; persistent browser storage is excluded by NFR-9.2.

## Boundaries

The initial geometry uses the Census Bureau's 2025 national 1:500,000 county file, filtered to state FIPS 08. This is the current catalog vintage retrieved for the project. The design permits one boundary file for both elections under A-5. All 64 Colorado county FIPS are retained, including Broomfield. The unchanged archive and its checksum are retained in states/_census. mapshaper simplifies shared boundaries together and preserves small shapes.

## Verification limits

Automated checks do not establish complete WCAG conformance or substitute for screen-reader, cross-browser, phone, and first-time-user testing. Record tests actually performed and leave the rest pending. Performance measurements must identify network and browser conditions; local timings alone do not establish the throttled-network acceptance criteria.

## Dependencies

The design's browser dependency limit is strict: vendored D3 only. A small open-source HTML parser in the local pipeline is a routine implementation choice for reliable parsing of saved official tables; it does not add a browser dependency or alter the static architecture. Versions and licenses must be recorded.
