# County Election and Turnout Map

Build the Colorado capstone per docs/specifications/Design.txt and Requirements.txt; Analysis.txt provides earlier context. Basin is unrelated and excluded. User authorizes parallel agents and routine implementation decisions. No commits, pushes, PRs or deployment without request.

Initial data: Colorado's 64 counties, certified 2022 Governor and 2024 President. Static HTML/CSS/ES modules plus vendored D3, Node build pipeline, Python/pdfplumber only for PDF extraction. Follow specified C-1 through C-25 file responsibilities and desktop/mobile wireframe. No framework, backend, tracking, persistent browser storage or third-party runtime requests.

Use docs/data-contract.md for integration. Never invent election data. Source files remain unchanged, with provenance. Build must reject validation errors and preserve existing published data. Counts reconcile against independently extracted official statewide totals; also check county extraction against source. Turnout uses active voters; candidate shares use race votes. Preserve precision, display one decimal.

Primary implementation model: GPT-6.1 Sol. Opus 5.5 for substantial implementation and independent review. Grok 4.7 and Gemini 3.8 Flash for bounded work. Haiku 5.5/Luna for simple tasks. Reserve Astra/Fable delegation for exceptional difficulty. T3 live catalog supplies provider/model IDs.

Browser QA uses T3 preview tools first. Required widths 320, 768, 1440; keyboard and screen-reader behavior; performance budgets <1MB initial, <=500KB geometry, 3s initial, 0.5s updates under recorded network conditions. Do not claim manual or cross-browser checks not performed.
