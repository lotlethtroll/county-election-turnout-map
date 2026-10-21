// C-24: stage a complete state, then swap directories with rollback on failure.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {publicConfig} from './config.js';

const exists = async filename => {try {await fs.access(filename); return true;} catch {return false;}};
export async function publish(config, elections, geometry, root, operations = fs) {
  const dataRoot = path.resolve(root, 'data');
  await operations.mkdir(dataRoot, {recursive: true});
  const token = randomUUID();
  const destination = path.join(dataRoot, config.abbr), stage = path.join(dataRoot, `.staging-${config.abbr}-${token}`), previous = path.join(dataRoot, `.previous-${config.abbr}-${token}`);
  const stateList = path.join(dataRoot, 'states.json'), listStage = path.join(dataRoot, `.states-${token}.json`), listPrevious = path.join(dataRoot, `.states-previous-${token}.json`);
  const json = value => JSON.stringify(value, null, 2) + '\n';
  let oldStateMoved = false, newStateMoved = false, oldListMoved = false, newListMoved = false;
  try {
    await operations.mkdir(stage);
    // One identifier ties every state file to this publication. Browser loads
    // across a later directory replacement must reject mixed identifiers.
    await operations.writeFile(path.join(stage, 'config.json'), json({...publicConfig(config), buildId: token}));
    await operations.writeFile(path.join(stage, 'counties.geojson'), JSON.stringify({...geometry, buildId: token}) + '\n');
    for (const election of elections) await operations.writeFile(path.join(stage, `${election.electionId}.json`), json({...election, buildId: token}));
    const registry = await exists(stateList) ? JSON.parse(await operations.readFile(stateList, 'utf8')) : {schemaVersion: 1, states: []};
    registry.states = [...registry.states.filter(s => s.abbr !== config.abbr), {abbr: config.abbr, name: config.name, stateFips: config.stateFips}].sort((a, b) => a.abbr.localeCompare(b.abbr));
    await operations.writeFile(listStage, json(registry));
    if (await exists(destination)) {await operations.rename(destination, previous); oldStateMoved = true;}
    await operations.rename(stage, destination); newStateMoved = true;
    if (await exists(stateList)) {await operations.rename(stateList, listPrevious); oldListMoved = true;}
    await operations.rename(listStage, stateList); newListMoved = true;
  } catch (error) {
    const rollbackErrors = [];
    try {if (newListMoved) await operations.rm(stateList, {force: true});} catch (e) {rollbackErrors.push(e.message);}
    try {if (oldListMoved) await operations.rename(listPrevious, stateList);} catch (e) {rollbackErrors.push(e.message);}
    try {if (newStateMoved) await operations.rm(destination, {recursive: true, force: true});} catch (e) {rollbackErrors.push(e.message);}
    try {if (oldStateMoved) await operations.rename(previous, destination);} catch (e) {rollbackErrors.push(e.message);}
    if (rollbackErrors.length) throw new Error(`Publish failed (${error.message}); rollback requires attention: ${rollbackErrors.join('; ')}`);
    throw error;
  } finally {
    // Cleanup is outside the transaction. A cleanup failure cannot cause a
    // successful publish to be reported as failed or erase its rollback copy.
    await operations.rm(stage, {recursive: true, force: true}).catch(() => {});
    await operations.rm(listStage, {force: true}).catch(() => {});
  }
  await operations.rm(previous, {recursive: true, force: true}).catch(() => {});
  await operations.rm(listPrevious, {force: true}).catch(() => {});
  return token;
}
