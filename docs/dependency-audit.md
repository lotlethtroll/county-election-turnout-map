# Dependency and static-site audit

Reviewed October 10, 2026 against installed package metadata, `package-lock.json`, pinned Python requirements, vendored licenses, source provenance, and browser source.

## Software inventory

| Use | Package/version | License |
| --- | --- | --- |
| Browser map | D3 7.9.0 | ISC; shipped in `vendor/d3-LICENSE.txt` |
| HTML extraction | Cheerio 1.1.2 | MIT |
| Boundary preparation | mapshaper 0.7.83 | MPL-2.0 |
| Workbook/CSV extraction | SheetJS CE 0.20.3 | Apache-2.0; included in vendored archive |
| PDF extraction | pdfplumber 0.11.7 | MIT; verified installed LICENSE |
| PDF parser | pdfminer.six 20250506 | MIT |
| PDF support | pypdfium2 5.14.0 | BSD-3-Clause, Apache-2.0, bundled dependency licenses |
| Image support | Pillow 11.3.0 | MIT-CMU |
| Text encoding | charset-normalizer 3.4.3 | MIT |
| Crypto support | cryptography 45.0.7 | Apache-2.0 OR BSD-3-Clause |
| Native interface | cffi 1.17.1 | MIT |
| C parser | pycparser 2.22 | BSD-3-Clause |

All 250 dependency entries in the npm lockfile declare licenses; none are missing license metadata. These comprise MIT, MPL-2.0, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, WTFPL alternatives, Zlib combinations, Unlicense, 0BSD, and CC0-1.0. This is an inventory of open-source build tools, not a legal opinion. Preserve upstream notices, including bundled dependency notices, when redistributing those tools. Only D3 ships as executable third-party browser code. The build tools and optional Playwright/axe QA tools are not browser dependencies.

## Configuration, sources, and privacy

Search of `js/`, `css/`, and `index.html` found no executable Colorado name, state FIPS, fixed 64-county count, candidate name, or election year. Colorado, Adams, and an election year occur only in explanatory comments. The JavaScript-disabled link is a state-neutral government directory. Alternate-state behavior also has browser-fixture coverage; see `verification.md` and the extensibility audit.

Election inputs are attributed to the Colorado Secretary of State, and boundary geometry to the U.S. Census Bureau. Their archived provenance records contain government URLs, retrieval dates, and hashes. `about.js` renders configured source citations, an unofficial/unaffiliated notice, and the configured official election-office link. D3 attribution links to its shipped license. No government seal or logo assets are used.

The About privacy text discloses that GitHub Pages logs visitor IP addresses when hosted there. Browser source contains no analytics, cookie writes, browser persistence, or third-party runtime fetches. Earlier browser checks independently observed no cookies, local/session storage, or external runtime requests. Clicking an attributed external source link is ordinary navigation, not a background runtime request.
