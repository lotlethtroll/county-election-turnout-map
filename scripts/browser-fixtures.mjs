// Synthetic configurations are intercepted in the test browser only; never published.
import {chromium} from '../.cache/qa/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin='http://127.0.0.1:4173';
const buildId='test-fixture';
const counties=[{fips:'99001',name:'Alpha',aliases:[]},{fips:'99003',name:'Beta',aliases:[]}];
const source={name:'Synthetic test fixture',publisher:'Test',url:'https://example.invalid',retrievedAt:'2026-10-10'};
const entries=['D','R'].map(p=>({id:`primary-${p}`,label:'Test primary',date:'2024-06-01',type:'primary',party:p,race:'Governor',certified:true,sources:[source],candidateColors:{a:'#245A99',b:'#6E1A17'}}));
const config={schemaVersion:1,buildId,abbr:'zz',name:'Test State',stateFips:'99',officeName:'Test office',officeUrl:'https://example.invalid',counties,elections:entries,sources:[source]};
const geo={type:'FeatureCollection',buildId,features:counties.map((c,i)=>({type:'Feature',properties:{fips:c.fips,name:c.name},geometry:{type:'Polygon',coordinates:[[[-105+i,39],[-105+i,40],[-104+i,40],[-104+i,39],[-105+i,39]]]}}))};
const result={name:'Alpha',fips:'99001',activeVoters:null,ballotsCast:3,raceTotal:3,votes:{a:2,b:1},shares:{a:200/3,b:100/3},turnout:null,leaderId:'a',runnerUpId:'b',margin:100/3,marginLabel:'Candidate A+33.3'};
const elections=Object.fromEntries(entries.map(e=>[e.id,{schemaVersion:1,buildId,electionId:e.id,...e,builtAt:'2026-10-10T00:00:00Z',candidates:[{id:'a',name:'Candidate A',party:e.party,statewideVotes:2},{id:'b',name:'Candidate B',party:e.party,statewideVotes:1}],statewide:result,counties:{'99001':result},missing:['99003']} ]));
const browser=await chromium.launch();
try {
  const page=await browser.newPage();
  const states=JSON.parse(await fs.readFile('data/states.json','utf8'));
  states.states.push({abbr:'zz',name:'Test State',stateFips:'99'});
  await page.route('**/data/states.json',route=>route.fulfill({json:states}));
  await page.route('**/data/zz/*',route=>{
    const file=new URL(route.request().url()).pathname.split('/').pop();
    return route.fulfill({json:file==='config.json'?config:file==='counties.geojson'?geo:elections[file.replace('.json','')]});
  });
  await page.goto(origin);
  await page.locator('path.county').last().waitFor();
  assert.equal(await page.locator('#state-field').isVisible(),true);
  await page.locator('#state-select').selectOption('zz');
  await page.waitForFunction(()=>document.querySelector('#status-line').textContent.includes('Test State'));
  assert.equal(await page.locator('path.county').count(),2);
  assert.equal(await page.locator('#party-field').isVisible(),true);
  assert.equal(await page.locator('#party-select option').count(),2);
  await page.locator('path[data-fips="99001"]').focus();
  await page.keyboard.press('Space');
  assert.match(await page.locator('#details').innerText(),/Candidate A/);
  await page.locator('#party-select').selectOption('primary-R');
  await page.waitForFunction(()=>document.querySelector('#status-line').textContent.includes('Republican'));
  assert.match(await page.locator('#details-heading').innerText(),/Alpha/);
  assert.match(await page.locator('path[data-fips="99003"]').getAttribute('fill'),/^url/);
  await page.locator('[data-view="turnout"]').click();
  assert.match(await page.locator('path[data-fips="99001"]').getAttribute('fill'),/^url/);
  await page.locator('path[data-fips="99003"]').focus();
  await page.keyboard.press('Enter');
  assert.match(await page.locator('#details').innerText(),/No results for this county/);
  await page.locator('#state-select').selectOption('co');
  await page.waitForFunction(()=>document.querySelectorAll('path.county').length===64);
  assert.equal(await page.locator('#party-field').isVisible(),false);
  console.log('PASS: alternate-state configuration, primary party switch, county persistence, candidate labels, null turnout and missing county patterns, return to Colorado.');
} finally {await browser.close();}
