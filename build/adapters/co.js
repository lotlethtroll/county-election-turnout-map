// C-18: read only archived official inputs. Source percentages never enter calculations.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {load} from 'cheerio';
import {countyKey} from '../normalize.js';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const tidy = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const partyCode = value => ({DEM: 'D', REP: 'R'})[value] ?? value;
function candidate(header) {
  const party = header.match(/\(([A-Z]+)\)/)?.[1];
  if (!party) throw new Error(`Candidate header has no party: ${header}`);
  const name = tidy(header.replace(/\s*\([A-Z]+\)/, '').replace(/\s*\(Write-in\)/i, ''));
  const id = name.split('/')[0].trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {id, name, party: partyCode(party)};
}
function count(value, county, field, issues) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  const text = tidy(value);
  if (/^(?:\d{1,3}(?:,\d{3})+|\d+)$/.test(text)) {
    const number = Number(text.replace(/,/g, ''));
    if (Number.isSafeInteger(number)) return number;
  }
  issues.push({county, check: 'source count', message: `${field} is missing or malformed: ${JSON.stringify(value)}`});
  return null;
}
function tables(html) {
  const $ = load(html);
  return $('table').toArray().map(table => $(table).find('tr').toArray().map(row => $(row).find('th,td').toArray().map(cell => tidy($(cell).text()))));
}
function uniqueRows(rows, issues, label) {
  const map = new Map();
  for (const row of rows) {
    const key = countyKey(row[0]);
    if (map.has(key)) issues.push({county: row[0], check: 'duplicate source county', message: `${label} contains repeated county ${row[0]}`});
    else map.set(key, row);
  }
  return map;
}
function totals(rows) {
  const matches = rows.filter(r => countyKey(r[0]) === 'total');
  if (matches.length !== 1) throw new Error(`Expected exactly one independent statewide Total row, found ${matches.length}`);
  return matches[0];
}
function checkEqual(actual, expected, county, label, issues) {
  if (actual !== expected) issues.push({county, check: label, message: `Found ${actual}; official county control is ${expected}`});
}

async function governor(election, root) {
  const issues = [];
  const turnout = tables(await fs.readFile(path.resolve(root, election.sourceFiles.turnout), 'utf8')).find(t => t[0]?.includes('Active Voters'));
  const results = tables(await fs.readFile(path.resolve(root, election.sourceFiles.results), 'utf8')).find(t => t[0]?.some(h => h.includes('Jared Polis')));
  if (!turnout || !results) throw new Error('2022 source tables or required headings not found');
  const headers = results[0], candidateHeaders = headers.slice(3, -2);
  const candidates = candidateHeaders.map(candidate);
  const turnoutTotal = totals(turnout.slice(1)), resultTotal = totals(results.slice(1));
  const turnoutMap = uniqueRows(turnout.slice(1).filter(r => r !== turnoutTotal), issues, '2022 active turnout table');
  const resultMap = uniqueRows(results.slice(1).filter(r => r !== resultTotal), issues, '2022 Governor table');
  const counties = [];
  for (const [key, row] of turnoutMap) {
    const voteRow = resultMap.get(key);
    if (!voteRow) issues.push({county: row[0], check: 'results source join', message: 'County missing from Governor table'});
    const votes = Object.fromEntries(candidates.map((c, index) => [c.id, count(voteRow?.[index + 3], row[0], c.name, issues)]));
    const activeVoters = count(row[1], row[0], 'activeVoters', issues), ballotsCast = count(row[2], row[0], 'ballotsCast', issues);
    if (voteRow) {
      checkEqual(ballotsCast, count(voteRow[2], row[0], 'Governor ballotsCast', issues), row[0], 'ballots match both sources', issues);
      checkEqual(Object.values(votes).reduce((a, b) => a + b, 0), count(voteRow.at(-2), row[0], 'raceTotal', issues), row[0], 'county official race total', issues);
    }
    const publishedPercent = Number(row[3]?.replace('%', ''));
    if (!Number.isFinite(publishedPercent) || Math.abs(ballotsCast / activeVoters * 100 - publishedPercent) > 0.00501) issues.push({county: row[0], check: 'active turnout source percentage', message: `Official ${row[3]} does not reconcile with active-voter counts`});
    counties.push({county: row[0], activeVoters, ballotsCast, votes});
  }
  for (const [key, row] of resultMap) if (!turnoutMap.has(key)) issues.push({county: row[0], check: 'turnout source join', message: 'Governor row has no active turnout row'});
  const official = {activeVoters: count(turnoutTotal[1], 'Statewide', 'activeVoters', issues), ballotsCast: count(turnoutTotal[2], 'Statewide', 'ballotsCast', issues), raceTotal: count(resultTotal.at(-2), 'Statewide', 'raceTotal', issues), votes: Object.fromEntries(candidates.map((c, i) => [c.id, count(resultTotal[i + 3], 'Statewide', c.name, issues)]))};
  checkEqual(official.ballotsCast, count(resultTotal[2], 'Statewide', 'Governor ballotsCast', issues), 'Statewide', 'official ballots sources agree', issues);
  return {counties, candidates, official, issues};
}

async function readCSV(filename) {
  const text = await fs.readFile(filename, 'utf8');
  const wb = XLSX.read(text, {type: 'string', raw: true});
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, raw: true, defval: ''});
}

async function president(election, root, temporary) {
  const issues = [];
  const python = process.env.CETM_PYTHON || 'python';
  try {
    const version = execFileSync(python, ['-c', 'import pdfplumber; print(pdfplumber.__version__)'], {encoding: 'utf8'}).trim();
    if (version !== '0.11.7') throw new Error(`Expected pdfplumber 0.11.7; found ${version}`);
    execFileSync(python, [path.resolve(root, 'build/extract_pdf_tables.py'), path.resolve(root, election.sourceFiles.results), temporary], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  } catch (error) {
    throw new Error(`PDF extraction failed; install requirements.txt and set CETM_PYTHON if needed. ${error.stderr?.toString() || error.message}`);
  }
  const [main, other, otherTotal, writeins, writeinsTotal, turnout] = await Promise.all(['president-main', 'president-other', 'president-other-total', 'president-writeins', 'president-writeins-total', 'active-turnout'].map(name => readCSV(path.join(temporary, `${name}.csv`))));
  const groups = [{rows: main.slice(1), headers: main[0].slice(3), start: 3, total: totals(main.slice(1))},
    {rows: other.slice(1), headers: other[0].slice(1), start: 1, total: totals(otherTotal)},
    {rows: writeins.slice(1), headers: writeins[0].slice(1, 3), start: 1, total: totals(writeinsTotal)}];
  const candidates = groups.flatMap(group => group.headers.map(candidate));
  if (candidates.length !== 14) throw new Error(`Expected all 14 presidential tickets, found ${candidates.length}`);
  const voteMaps = groups.map(group => uniqueRows(group.rows.filter(r => r[0] !== 'Total'), issues, 'PDF presidential table'));
  const turnoutTotal = totals(turnout.slice(1));
  const turnoutMap = uniqueRows(turnout.slice(1).filter(r => r !== turnoutTotal), issues, 'PDF active turnout');
  const workbook = XLSX.readFile(path.resolve(root, election.sourceFiles.turnout));
  if (workbook.SheetNames.length !== 1) throw new Error('Expected one 2024 turnout worksheet');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const headings = ['County', 'Precinct', 'Active Voters', 'Inactive Voters', 'Total Voters', 'Ballots Cast', 'Total Voter Turnout'];
  headings.forEach((name, i) => {if (sheet[`${String.fromCharCode(65 + i)}1`]?.v !== name) throw new Error(`Missing spreadsheet heading ${name}`);});
  // The official workbook styles over a million rows and sixteen thousand columns.
  // Iterate populated A:F cells instead of sheet_to_json over its inflated !ref.
  // G contains percentage formula remnants far beyond "End of worksheet" and
  // has no input counts. Those remnants are not precinct records.
  const sourceRows = new Set();
  for (const cell of Object.keys(sheet)) if (/^[A-F]\d+$/.test(cell) && sheet[cell].v !== undefined && sheet[cell].v !== '') sourceRows.add(Number(cell.slice(1)));
  const countyCounts = new Map(), precincts = new Set();
  for (const rowNumber of [...sourceRows].sort((a, b) => a - b)) {
    if (rowNumber === 1) continue;
    const row = 'ABCDEFG'.split('').map(c => sheet[`${c}${rowNumber}`]?.v);
    if (row[0] === 'End of worksheet' || (typeof row[0] === 'string' && row[0].startsWith('*=Due to an error'))) {
      if (row.slice(1).some(v => v !== undefined)) issues.push({county: 'Statewide', check: 'worksheet notes', message: `Unexpected data on note row ${rowNumber}`});
      continue;
    }
    const key = countyKey(row[0]);
    const precinctId = `${key}/${row[1]}`;
    if (!row[0] || row[1] === undefined || row[1] === '') issues.push({county: row[0] ?? `row ${rowNumber}`, check: 'precinct identity', message: `Missing county or precinct at worksheet row ${rowNumber}`});
    if (precincts.has(precinctId)) issues.push({county: row[0], check: 'duplicate precinct', message: `Repeated precinct ${row[1]}`});
    precincts.add(precinctId);
    // Montezuma precincts 6 and 7 carry the official explanatory footnote '*'.
    // Strip only that marker in this documented county; never coerce other text.
    const marked = value => key === 'montezuma' && /^\d+\*$/.test(String(value)) ? String(value).slice(0, -1) : value;
    const active = count(marked(row[2]), row[0], `activeVoters, worksheet row ${rowNumber}`, issues);
    const total = count(marked(row[4]), row[0], `totalVoters, worksheet row ${rowNumber}`, issues);
    const ballots = count(marked(row[5]), row[0], `ballotsCast, worksheet row ${rowNumber}`, issues);
    // Inactive counts are not a required output. The source leaves this field
    // blank for zero-inactive precincts; its total still must equal active.
    const inactive = row[3] === undefined || row[3] === '' ? null : count(marked(row[3]), row[0], `inactiveVoters, worksheet row ${rowNumber}`, issues);
    if (active !== null) checkEqual(active + (inactive ?? 0), total, row[0], `precinct registered voters row ${rowNumber}`, issues);
    if (!countyCounts.has(key)) countyCounts.set(key, {county: row[0], activeVoters: 0, ballotsCast: 0});
    const sums = countyCounts.get(key);
    sums.activeVoters = sums.activeVoters === null || active === null ? null : sums.activeVoters + active;
    sums.ballotsCast = sums.ballotsCast === null || ballots === null ? null : sums.ballotsCast + ballots;
  }
  const counties = [];
  for (const [key, row] of countyCounts) {
    const control = turnoutMap.get(key);
    if (!control) issues.push({county: row.county, check: 'county turnout PDF control', message: 'Spreadsheet county missing in certified PDF'});
    else {
      checkEqual(row.activeVoters, count(control[1], row.county, 'PDF activeVoters', issues), row.county, 'precinct sum vs PDF active voters', issues);
      checkEqual(row.ballotsCast, count(control[2], row.county, 'PDF ballotsCast', issues), row.county, 'precinct sum vs PDF ballots', issues);
    }
    const votes = {};
    groups.forEach((group, i) => {
      const source = voteMaps[i].get(key);
      if (!source) issues.push({county: row.county, check: 'PDF county join', message: `Missing presidential table fragment ${i + 1}`});
      group.headers.map(candidate).forEach((c, j) => {votes[c.id] = count(source?.[j + group.start], row.county, c.name, issues);});
    });
    const officialRace = count(voteMaps[2].get(key)?.[3], row.county, 'PDF race total', issues);
    checkEqual(Object.values(votes).reduce((a, b) => a + b, 0), officialRace, row.county, 'county official race total', issues);
    checkEqual(row.ballotsCast, count(voteMaps[0].get(key)?.[2], row.county, 'PDF presidential ballots', issues), row.county, 'presidential ballots vs turnout', issues);
    counties.push({...row, votes});
  }
  for (const map of [...voteMaps, turnoutMap]) for (const [key, row] of map) if (!countyCounts.has(key)) issues.push({county: row[0], check: 'spreadsheet source join', message: 'PDF county has no spreadsheet turnout rows'});
  const official = {activeVoters: count(turnoutTotal[1], 'Statewide', 'PDF activeVoters', issues), ballotsCast: count(turnoutTotal[2], 'Statewide', 'PDF ballotsCast', issues), raceTotal: count(writeinsTotal[0][3], 'Statewide', 'PDF raceTotal', issues), votes: {}};
  groups.forEach(group => group.headers.map(candidate).forEach((c, i) => {official.votes[c.id] = count(group.total[i + group.start], 'Statewide', c.name, issues);}));
  checkEqual(official.ballotsCast, count(groups[0].total[2], 'Statewide', 'presidential statewide ballots', issues), 'Statewide', 'official ballots sources agree', issues);
  const audit = JSON.parse(await fs.readFile(path.join(temporary, 'audit.json'), 'utf8'));
  return {counties, candidates, official, issues, extractionAudit: audit, precinctCount: precincts.size};
}

export async function extract(election, root, temporary) {
  if (election.sourceFormat === 'co-2022-html') return governor(election, root);
  if (election.sourceFormat === 'co-2024-pdf-xlsx') return president(election, root, temporary);
  throw new Error(`Colorado adapter has no reader for ${election.sourceFormat}`);
}
