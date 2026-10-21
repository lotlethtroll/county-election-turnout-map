# Shared data contract version 1

Every published state configuration, geometry FeatureCollection and election file has the same nonempty `buildId` string for that publication. The loader rejects mismatched revisions and Retry reloads the whole state. This additive field prevents open tabs from combining an older cached configuration with newer election files at mutable URLs.

This makes the supplied design concrete without changing scope. Paths are relative to site root. All browser paths must also work under a GitHub Pages repository subpath.

`data/states.json`: `{ "schemaVersion": 1, "states": [{ "abbr": "co", "name": "Colorado", "stateFips": "08" }] }`.

`data/co/config.json`: `{ schemaVersion:1, abbr:"co", name:"Colorado", stateFips:"08", officeName, officeUrl, counties:[{fips,name,aliases:[]}], elections:[{id,label,date,type,party,race,certified,sources:[]}], sources:[] }`. Sources have `{name,publisher,url,retrievedAt}`. General party is null. Newest general is default. Full `states/co/config.json` additionally has adapter/sourceFiles and any build-only inputs; published config strips these. `candidateColors` may map candidate IDs to colors per election. Each primary party contest is a separate election entry; party selector chooses its corresponding contest with matching date/race/type.

`data/co/counties.geojson`: FeatureCollection, Polygon/MultiPolygon geometry, each feature has properties `{fips,name}`. Exactly one feature per configured county.

`data/co/<electionId>.json`: `{schemaVersion:1,electionId,label,date,race,type,party,builtAt,candidates:[{id,name,party,statewideVotes}],statewide:Result,counties:{[fips]:Result},missing:[]}`. Optional sources array is permitted. Party codes D and R are normalized; other codes retained and colored neutrally.

`Result`: `{name,activeVoters,ballotsCast,raceTotal,votes:{[candidateId]:integer},shares:{[candidateId]:number|null},turnout:number|null,leaderId:string|null,runnerUpId:string|null,margin:number|null,marginLabel:string}`. Counties also include fips. Statewide name is state name. Totals derive from county counts, checked against independent official controls. Margin is percentage points, not signed. Tie is exact equality of top vote counts, never rounded equality. Tied leaders can be determined from votes; do not label a sole leader in a tie. Missing turnout is null, not zero. Zero race total gives null shares/leader/margin and No data. Sole candidate with votes has 100 share and 100 margin against zero, runnerUpId null. Label generated for display at one decimal; numeric data keeps full precision.

Adapter output: `{counties:[{county,fips?,activeVoters,ballotsCast,votes}],candidates:[{id,name,party}],official:{ballotsCast,activeVoters?,raceTotal?,votes:{[candidateId]:integer}},issues:[]}`. Build authors may refine internal interfaces without changing public schema. Unmatched source rows remain reportable; never silently drop them. Colorado requires complete counts. Future unavailable active-voter metric may be explicit null; it is distinct from a malformed missing field. UI missing-data handling is defensive and does not authorize incomplete Colorado builds.

For margin bins apply absolute magnitude [0,5), [5,10), [10,20), [20,infinity) separately by leader party. Primary uses candidate colors with shades. Ties bypass scales; missing uses diagonal pattern. Turnout uses six equal bins across non-null county values; uniform values get one clearly labeled range. Source percentages only serve as checks when their denominator matches the mandated formula.

Public data is generated only by the pipeline. Frontend author must not fabricate or hand-edit data. The frontend must handle missing startup files gracefully until the pipeline finishes.
