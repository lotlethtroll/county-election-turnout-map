import {chromium} from '../.cache/qa/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin='http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true});
const results={date:new Date().toISOString()};
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();
  const client=await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions',{offline:false,latency:100,downloadThroughput:1250000,uploadThroughput:625000});
  await client.send('Emulation.setCPUThrottlingRate',{rate:4});
  let start=performance.now();
  await page.goto(origin);
  await page.locator('path.county').last().waitFor();
  results.performance={profile:'10 Mbps down / 5 Mbps up, 100 ms latency, 4x CPU slowdown, cold Chromium context',initialMs:Math.round(performance.now()-start)};
  assert.ok(results.performance.initialMs<3000);
  start=performance.now();
  await page.locator('#election-select').selectOption('election|2022-general-governor');
  await page.waitForFunction(()=>document.querySelector('#status-line').textContent.includes('2022'));
  results.performance.uncachedElectionMs=Math.round(performance.now()-start);
  start=performance.now();
  await page.locator('[data-view="turnout"]').click();
  await page.waitForFunction(()=>document.querySelector('#status-line').textContent.includes('Turnout'));
  results.performance.viewMs=Math.round(performance.now()-start);
  assert.ok(results.performance.uncachedElectionMs<500);
  assert.ok(results.performance.viewMs<500);
  await context.close();

  const failed=await browser.newContext();
  const retryPage=await failed.newPage();
  await retryPage.route('**/data/co/counties.geojson',route=>route.abort('failed'));
  await retryPage.goto(origin);
  await retryPage.getByRole('button',{name:'Try Again'}).waitFor();
  assert.match(await retryPage.locator('#map-frame').innerText(),/The map could not be loaded/);
  await retryPage.unroute('**/data/co/counties.geojson');
  await retryPage.getByRole('button',{name:'Try Again'}).click();
  await retryPage.locator('path.county').last().waitFor();
  assert.equal(await retryPage.locator('path.county').count(),64);
  results.initialLoadRetry=true;
  await failed.close();

  const electionFailure = await browser.newContext();
  const electionRetry = await electionFailure.newPage();
  await electionRetry.route('**/data/co/2024-general-president.json', route => route.abort('failed'));
  await electionRetry.goto(origin);
  await electionRetry.getByRole('button', {name: 'Try Again'}).waitFor();
  await electionRetry.unroute('**/data/co/2024-general-president.json');
  await electionRetry.getByRole('button', {name: 'Try Again'}).click();
  await electionRetry.locator('path.county').last().waitFor();
  assert.equal(await electionRetry.locator('path.county').count(), 64);
  assert.match(await electionRetry.locator('#status-line').innerText(), /2024/);
  results.electionDataLoadRetry = true;
  await electionFailure.close();

  const resizeContext = await browser.newContext({viewport: {width: 1440, height: 1000}});
  const resizePage = await resizeContext.newPage();
  await resizePage.goto(origin);
  await resizePage.locator('path[data-fips="08125"]').focus();
  assert.equal(await resizePage.locator('.map-tooltip').isVisible(), true);
  await resizePage.setViewportSize({width: 320, height: 1000});
  await resizePage.waitForFunction(() => document.documentElement.scrollWidth <= 320, null, {timeout: 1000});
  assert.equal(await resizePage.locator('.map-tooltip').isVisible(), true);
  const tooltipRight = await resizePage.locator('.map-tooltip').evaluate(element => element.getBoundingClientRect().right);
  assert.ok(tooltipRight <= 320, 'Open tooltip stays within the narrow viewport after resize');
  results.openTooltipResize = true;
  await resizeContext.close();

  const mobile=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2});
  const phone=await mobile.newPage();
  await phone.goto(origin);
  await phone.locator('path[data-fips="08069"]').tap();
  assert.match(await phone.locator('#details-heading').innerText(),/Larimer/);
  assert.equal(await phone.locator('.map-tooltip').isVisible(),true);
  await phone.locator('#election-select').selectOption('election|2022-general-governor');
  await phone.waitForFunction(()=>document.querySelector('#details').textContent.includes('2022'));
  assert.match(await phone.locator('#details-heading').innerText(),/Larimer/);
  results.touchAndCountyPersistence=true;
  await mobile.close();

  const subpathContext=await browser.newContext();
  const nested=await subpathContext.newPage();
  await nested.route('**/capstone/**',async route=>{
    const response=await route.fetch({url:route.request().url().replace('/capstone/','/')});
    await route.fulfill({response});
  });
  await nested.goto(origin+'/capstone/');
  await nested.locator('path.county').last().waitFor();
  assert.equal(await nested.locator('path.county').count(),64);
  results.repositorySubpath=true;
  await nested.screenshot({path:'.cache/qa/results/default-map.png',fullPage:true});
  await subpathContext.close();

  const nojs=await browser.newContext({javaScriptEnabled:false});
  const fallback=await nojs.newPage();
  await fallback.goto(origin);
  assert.equal(await fallback.locator('noscript a').isVisible(),true);
  results.noJavaScriptFallback=true;
  await nojs.close();
} finally {
  await browser.close();
  await fs.writeFile('.cache/qa/results/scenarios-report.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
}
