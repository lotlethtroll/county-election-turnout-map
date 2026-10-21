// C-3 dataLoader.js: fetches the published JSON files, keeps each loaded file
// in memory (NFR-3.2) and reports load errors (FR-6.1). A failed request is
// never cached, so Try Again simply asks again. Paths are relative to the page,
// so the site also works under a GitHub Pages repository subpath.

const SCHEMA_VERSION = 1;
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export class LoadError extends Error {
  constructor(message, path, cause) {
    super(message);
    this.name = 'LoadError';
    this.path = path;
    if (cause) this.cause = cause;
  }
}

/** A deployment changed between file requests; retry must reload the whole state. */
export class RevisionError extends LoadError {
  constructor(path) {
    super('The election data changed while loading. Try again to reload it together.', path);
    this.name = 'RevisionError';
  }
}

export function createDataLoader({ baseUrl = document.baseURI, fetchImpl = (...args) => globalThis.fetch(...args) } = {}) {
  const cache = new Map();

  function revisionError(abbr, path) {
    const prefix = `data/${abbr}/`;
    for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
    return new RevisionError(path);
  }

  const hasBuildId = (value) => typeof value === 'string' && value.trim().length > 0;

  function getJson(path) {
    if (cache.has(path)) return cache.get(path);
    const url = new URL(path, baseUrl);
    const request = (async () => {
      let response;
      try {
        // Revalidate mutable files; build IDs below also detect cross-deploy
        // responses and old files already retained in the in-memory cache.
        response = await fetchImpl(url.href, { cache: 'no-cache', credentials: 'same-origin' });
      } catch (error) {
        throw new LoadError(`Network request failed for ${path}`, path, error);
      }
      if (!response.ok) throw new LoadError(`${path} returned HTTP ${response.status}`, path);
      try {
        return await response.json();
      } catch (error) {
        throw new LoadError(`${path} is not valid JSON`, path, error);
      }
    })();
    cache.set(path, request);
    request.catch(() => {
      if (cache.get(path) === request) cache.delete(path);
    });
    return request;
  }

  /** Rejects a file that loaded but has the wrong shape; it is not kept, so a retry refetches it. */
  function invalid(message, path) {
    cache.delete(path);
    return new LoadError(message, path);
  }

  function segment(value, path) {
    if (typeof value !== 'string' || !SAFE_SEGMENT.test(value)) {
      throw new LoadError(`Invalid file name "${value}"`, path);
    }
    return value;
  }

  async function getStates() {
    const path = 'data/states.json';
    const data = await getJson(path);
    if (data?.schemaVersion !== SCHEMA_VERSION || !Array.isArray(data.states) || !data.states.length) {
      throw invalid('The list of states is empty or in an unknown format', path);
    }
    for (const state of data.states) segment(state?.abbr, path);
    return data;
  }

  async function getStateBundle(abbr) {
    const folder = `data/${segment(abbr, 'data/')}`;
    const [config, geo] = await Promise.all([
      getJson(`${folder}/config.json`),
      getJson(`${folder}/counties.geojson`),
    ]);
    if (config?.schemaVersion !== SCHEMA_VERSION || config.abbr !== abbr || !Array.isArray(config.counties)) {
      throw invalid('The state configuration is in an unknown format', `${folder}/config.json`);
    }
    if (!Array.isArray(config.elections)) {
      throw invalid('The state configuration lists no elections', `${folder}/config.json`);
    }
    if (geo?.type !== 'FeatureCollection' || !Array.isArray(geo.features)) {
      throw invalid('The county shapes are in an unknown format', `${folder}/counties.geojson`);
    }
    if (!hasBuildId(config.buildId) || config.buildId !== geo.buildId) {
      throw revisionError(abbr, `${folder}/config.json`);
    }
    return { config, geo };
  }

  async function getElection(abbr, electionId, expectedBuildId) {
    const path = `data/${segment(abbr, 'data/')}/${segment(electionId, 'data/')}.json`;
    const data = await getJson(path);
    if (
      data?.schemaVersion !== SCHEMA_VERSION ||
      data.electionId !== electionId ||
      !Array.isArray(data.candidates) ||
      !data.counties ||
      typeof data.counties !== 'object'
    ) {
      throw invalid('The election file is in an unknown format', path);
    }
    if (!hasBuildId(expectedBuildId) || data.buildId !== expectedBuildId) {
      throw revisionError(abbr, path);
    }
    return data;
  }

  return { getStates, getStateBundle, getElection };
}
