// C-23: reproduce county geometry from the untouched pinned national Census ZIP.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
export async function buildBoundaries(config, root, destination) {
  execFileSync(process.execPath, [path.resolve(root, 'node_modules/mapshaper/bin/mapshaper'),
    path.resolve(root, config.boundaries.file), '-filter', `STATEFP == '${config.stateFips}'`,
    '-simplify', config.boundaries.simplify, 'keep-shapes', '-rename-fields', 'fips=GEOID,name=NAME',
    '-filter-fields', 'fips,name', '-o', destination, 'format=geojson', `precision=${config.boundaries.precision}`],
  {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  const bytes = await fs.readFile(destination);
  const geojson = JSON.parse(bytes);
  const issues = [];
  const check = (valid, county, message) => {if (!valid) issues.push({check: 'county geometry', county, message});};
  check(bytes.length <= 500000, 'Statewide', `Geometry exceeds 500 KB: ${bytes.length} bytes`);
  check(geojson.type === 'FeatureCollection' && Array.isArray(geojson.features), 'Statewide', 'Expected GeoJSON FeatureCollection');
  const expected = new Map(config.counties.map(c => [c.fips, c])), seen = new Set();
  for (const feature of geojson.features ?? []) {
    const {fips, name} = feature.properties ?? {};
    check(expected.has(fips), name ?? fips, `Unexpected shape FIPS ${fips}`);
    check(!seen.has(fips), name ?? fips, `Repeated shape ${fips}`); seen.add(fips);
    check(expected.get(fips)?.name === name, name ?? fips, `Shape name does not match configured name for ${fips}`);
    check(['Polygon', 'MultiPolygon'].includes(feature.geometry?.type) && feature.geometry.coordinates?.length > 0, name ?? fips, 'Missing polygon geometry');
  }
  for (const county of config.counties) check(seen.has(county.fips), county.name, `No geometry for ${county.fips}`);
  return {geojson, issues, bytes: bytes.length};
}
