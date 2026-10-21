// C-17: build-only configuration and certification gate.
import fs from 'node:fs/promises';
import path from 'node:path';
import {countyKey} from './normalize.js';
export async function loadConfig(state, root) {
  if (!/^[a-z]{2}$/.test(state ?? '')) throw new Error('Usage: npm run build -- <two-letter state>, for example co');
  const config = JSON.parse((await fs.readFile(path.join(root, 'states', state, 'config.json'), 'utf8')).replace(/^\uFEFF/, ''));
  const errors = [];
  const requireValue = (valid, message) => {if (!valid) errors.push(message);};
  requireValue(config.schemaVersion === 1, 'schemaVersion must be 1');
  requireValue(config.abbr === state, 'abbr must match the requested state');
  requireValue(/^\d{2}$/.test(config.stateFips ?? ''), 'stateFips must have two digits');
  for (const field of ['name', 'officeName', 'officeUrl']) requireValue(typeof config[field] === 'string' && config[field].length > 0, `${field} is required`);
  requireValue(Array.isArray(config.counties) && config.counties.length > 0, 'counties must be a nonempty array');
  requireValue(Array.isArray(config.elections) && config.elections.length > 0, 'elections must be a nonempty array');
  const fips = new Set(), names = new Map(), ids = new Set();
  for (const county of config.counties ?? []) {
    requireValue(/^\d{5}$/.test(county.fips ?? '') && county.fips.startsWith(config.stateFips), `Invalid county FIPS ${county.fips}`);
    requireValue(!fips.has(county.fips), `Duplicate configured FIPS ${county.fips}`); fips.add(county.fips);
    requireValue(typeof county.name === 'string' && county.name.length > 0, `Missing county name ${county.fips}`);
    requireValue(Array.isArray(county.aliases), `aliases must be an array for ${county.name}`);
    for (const name of [county.name, ...(county.aliases ?? [])]) {
      const key = countyKey(name);
      requireValue(!names.has(key) || names.get(key) === county.fips, `Ambiguous county name/alias ${name}`); names.set(key, county.fips);
    }
  }
  if (state === 'co') requireValue(fips.size === 64, 'Colorado requires exactly 64 configured counties');
  for (const election of config.elections ?? []) {
    requireValue(/^[a-z0-9-]+$/.test(election.id ?? ''), `Invalid election ID ${election.id}`);
    requireValue(!ids.has(election.id), `Duplicate election ID ${election.id}`); ids.add(election.id);
    for (const field of ['label', 'date', 'race', 'adapter', 'sourceFormat']) requireValue(typeof election[field] === 'string' && election[field].length > 0, `${election.id}: ${field} is required`);
    requireValue(/^\d{4}-\d{2}-\d{2}$/.test(election.date ?? '') && !Number.isNaN(Date.parse(election.date)), `${election.id}: invalid election date`);
    requireValue(['general', 'primary'].includes(election.type), `${election.id}: type must be general or primary`);
    requireValue(election.type === 'primary' ? typeof election.party === 'string' && election.party.length > 0 : election.party === null, `${election.id}: party must be null for general or a code for primary`);
    requireValue(election.certified === true, `${election.id}: election is not marked certified`);
    requireValue(election.sourceFiles && Object.keys(election.sourceFiles).length > 0, `${election.id}: sourceFiles required`);
    for (const filename of Object.values(election.sourceFiles ?? {})) requireValue(typeof filename === 'string' && filename.startsWith(`states/${state}/sources/`), `${election.id}: sourceFiles must be in the state sources folder`);
    requireValue(Array.isArray(election.sources) && election.sources.length > 0, `${election.id}: source attribution required`);
  }
  for (const source of [...(config.sources ?? []), ...(config.elections ?? []).flatMap(e => e.sources ?? [])]) {
    for (const field of ['name', 'publisher', 'url', 'retrievedAt']) requireValue(typeof source[field] === 'string' && source[field].length > 0, `Source ${source.name}: ${field} required`);
    requireValue(/^https?:\/\//.test(source.url ?? ''), `Invalid source URL ${source.url}`);
  }
  requireValue(config.boundaries && config.boundaries.file && config.boundaries.sha256, 'Census boundary file and hash required');
  requireValue(Array.isArray(config.sourceIntegrity) && config.sourceIntegrity.length > 0, 'sourceIntegrity manifest required');
  for (const election of config.elections ?? []) for (const filename of Object.values(election.sourceFiles ?? {})) requireValue(config.sourceIntegrity?.some(s => s.file === filename && /^[a-f0-9]{64}$/.test(s.sha256)), `Source hash required for ${filename}`);
  if (errors.length) {
    const error = new Error(`Configuration failed (${errors.length} checks)`);
    error.issues = errors.map(message => ({county: 'Statewide', check: 'configuration', message}));
    throw error;
  }
  return config;
}

export function publicConfig(config) {
  const {boundaries, sourceIntegrity, ...published} = config;
  published.elections = config.elections.map(({adapter, sourceFiles, sourceFormat, ...election}) => election);
  return published;
}
