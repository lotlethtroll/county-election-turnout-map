# Vendored libraries

The site serves these files itself (Design assumption D-3). It makes no runtime
requests to a CDN or any other outside host.

## D3.js 7.9.0

| Item | Value |
|---|---|
| Files | `d3.min.js` (UMD bundle, sets the global `d3`), `d3-LICENSE.txt` |
| Upstream | https://d3js.org, https://github.com/d3/d3 |
| License | ISC, Copyright 2010-2023 Mike Bostock (see `d3-LICENSE.txt`) |
| Obtained from | npm registry tarball `https://registry.npmjs.org/d3/-/d3-7.9.0.tgz` (`package/dist/d3.min.js`, `package/LICENSE`) |
| Tarball integrity (npm) | `sha512-e1U46jVP+w7Iut8Jt8ri1YsPOvFpg46k+K8TpCb0P+zjCkjkPnV7WzfDJzMHy1LnA+wj5pLT1wjO901gLXeEhA==` (recomputed locally, matched the registry) |
| `d3.min.js` SHA-256 | `f2094bbf6141b359722c4fe454eb6c4b0f0e42cc10cc7af921fc158fceb86539` |
| `d3-LICENSE.txt` SHA-256 | `3e6849627f74ff73c257a3ae1efb574015d94fc1035c05ec3c15805165efcbc4` |
| Size | 279,706 bytes (about 92.6 KB gzip) |
| Retrieved | 2026-10-10; 7.9.0 was the registry `latest` tag on that date |

The files are byte-for-byte copies of the release and must not be edited. To
upgrade, download the new tarball from the npm registry, check its integrity
against the registry metadata, copy the same two files, and update this table.

## SheetJS Community Edition 0.20.3

This local release tarball is used only by the Node build pipeline to read the
official XLSX turnout workbook and extracted CSV tables. The website never
requests it. `package.json` installs it as `file:vendor/xlsx-0.20.3.tgz`.

| Item | Value |
|---|---|
| File | `xlsx-0.20.3.tgz`, unchanged official distribution |
| Upstream | https://sheetjs.com; installation documentation: https://docs.sheetjs.com/docs/getting-started/installation/nodejs/ |
| Obtained from | https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz |
| License | Apache License 2.0; the complete license is included at `package/LICENSE` inside the tarball |
| Tarball SHA-256 | `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8` |
| Size | 2,409,319 bytes |
| Retrieved | 2026-10-10 |

SheetJS identifies its CDN as the authoritative distribution and recommends
vendoring the tarball; the public npm registry carries an older release. To
upgrade, download the chosen official release, record its version and SHA-256,
update the local dependency and lockfile, and run the pipeline tests.
