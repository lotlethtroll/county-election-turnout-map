// C-16: offline extraction → normalize → calculate → validate → stage/publish.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {loadConfig} from './config.js';
import {normalize} from './normalize.js';
import {calculate} from './calculate.js';
import {validate} from './validate.js';
import {buildBoundaries} from './boundaries.js';
import {publish} from './publish.js';
import {preflightReport, writeReport} from './report.js';

export async function build(state, {root = process.cwd(), quiet = false, publishOperation = publish,
  reportOperation = writeReport, reportPreflightOperation = preflightReport} = {}) {
  const builtAt = process.env.SOURCE_DATE_EPOCH ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString() : new Date().toISOString();
  const report = {schemaVersion: 1, state, builtAt, stage: 'configuration', published: false, checks: [], elections: []};
  let temporary;
  try {
    const config = await loadConfig(state, root);
    report.stateName = config.name;
    report.checks.push({passed: true, check: 'configuration', county: 'Statewide', message: 'Required configuration and certification checks passed'});
    report.stage = 'source integrity';
    for (const source of [...config.sourceIntegrity, config.boundaries]) {
      try {
        const bytes = await fs.readFile(path.resolve(root, source.file));
        const actual = createHash('sha256').update(bytes).digest('hex');
        report.checks.push({passed: actual === source.sha256, check: 'source SHA-256', county: 'Statewide', message: `${source.file}: ${actual}`, expected: source.sha256});
      } catch (error) {report.checks.push({passed: false, check: 'source read', county: 'Statewide', message: `${source.file}: ${error.message}`});}
    }
    if (report.checks.some(c => !c.passed)) throw new Error('Archived source integrity failed');
    const tempRoot = path.join(root, 'build', '.tmp');
    await fs.mkdir(tempRoot, {recursive: true});
    temporary = await fs.mkdtemp(path.join(tempRoot, `${state}-`));
    report.stage = 'extract';
    const extracted = [];
    for (const election of config.elections) {
      try {
        if (!/^[a-z]{2}$/.test(election.adapter)) throw new Error(`Invalid adapter ${election.adapter}`);
        const adapter = await import(pathToFileURL(path.join(root, 'build', 'adapters', `${election.adapter}.js`)).href);
        const raw = await adapter.extract(election, root, path.join(temporary, election.id));
        const normalized = normalize(raw.counties, config);
        raw.issues.push(...normalized.issues);
        const result = calculate(normalized.rows, raw.candidates, config, election, raw.official, builtAt);
        const checks = validate(normalized.rows, raw, result, config, election).map(c => ({...c, electionId: election.id}));
        report.checks.push(...checks);
        report.elections.push({id: election.id, counties: normalized.rows.length, candidates: raw.candidates.length,
          official: raw.official, ...(raw.extractionAudit ? {extractionAudit: raw.extractionAudit, precinctCount: raw.precinctCount} : {})});
        extracted.push(result);
      } catch (error) {report.checks.push({passed: false, electionId: election.id, check: 'extract', county: 'Statewide', message: error.message});}
    }
    report.stage = 'validate';
    if (report.checks.some(c => !c.passed)) throw new Error('Election validation failed');
    report.stage = 'boundaries';
    const geometry = await buildBoundaries(config, root, path.join(temporary, 'counties.geojson'));
    report.checks.push(...geometry.issues.map(i => ({...i, passed: false})));
    if (geometry.issues.length) throw new Error('Geometry validation failed');
    report.checks.push({passed: true, check: 'county geometry', county: 'Statewide', message: `${config.counties.length} configured county shapes; ${geometry.bytes} bytes; within 500 KB`});
    report.stage = 'report preflight';
    await reportPreflightOperation(root);
    report.stage = 'publish';
    report.buildId = await publishOperation(config, extracted, geometry.geojson, root);
    report.published = true;
    report.stage = 'complete';
  } catch (error) {
    if (error.issues) report.checks.push(...error.issues.map(issue => ({...issue, passed: false})));
    else if (!report.checks.some(c => !c.passed)) report.checks.push({passed: false, check: report.stage, county: 'Statewide', message: error.stderr?.toString() || error.message});
    report.error = error.message;
  } finally {
    if (temporary) await fs.rm(temporary, {recursive: true, force: true}).catch(() => {});
  }
  report.failed = report.checks.filter(c => !c.passed).length;
  report.passed = report.checks.filter(c => c.passed).length;
  try {
    return await reportOperation(report, root, {quiet});
  } catch (error) {
    // Evidence storage is not publication. Report the already committed result
    // truthfully and keep a successful CLI exit if complete data was published.
    report.evidenceWriteError = error.message;
    report.warning = report.published
      ? `Data published successfully (build ${report.buildId}); validation report could not be saved: ${error.message}`
      : `Build stopped; previous published data kept. Validation report could not be saved: ${error.message}`;
    console.warn(report.warning);
    return report;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const report = await build(process.argv[2]);
  if (!report.published) process.exitCode = 1;
}
