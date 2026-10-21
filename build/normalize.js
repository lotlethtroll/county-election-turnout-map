// C-20: county identity is independent of row position and presentation spelling.
export function countyKey(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/\bcounty\b/g, '').replace(/\s+/g, '').trim();
}

export function normalize(rows, config) {
  const names = new Map();
  for (const county of config.counties) {
    for (const name of [county.name, ...county.aliases]) names.set(countyKey(name), county);
  }
  const issues = [], normalized = [];
  for (const row of rows) {
    const county = names.get(countyKey(row.county));
    if (!county || (row.fips && row.fips !== county.fips)) {
      issues.push({county: row.county, check: 'county match', message: `No unambiguous configured match for ${row.county}${row.fips ? ` (${row.fips})` : ''}`});
      continue;
    }
    normalized.push({...row, name: county.name, fips: county.fips});
  }
  return {rows: normalized, issues};
}
