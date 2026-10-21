// Optional integration QA: npm install --prefix .cache/qa playwright @axe-core/playwright
// Then: node .cache/qa/node_modules/playwright/cli.js install chromium firefox webkit
// Start npm run serve separately. These dependencies never ship to the website.
import {chromium, firefox, webkit} from '../.cache/qa/node_modules/playwright/index.mjs';
import AxeBuilder from '../.cache/qa/node_modules/@axe-core/playwright/dist/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const origin = 'http://127.0.0.1:4173';
const report = {date: new Date().toISOString(), results: []};
await fs.mkdir('.cache/qa/results', {recursive: true});
for (const [name, engine, options] of [
  ['chromium', chromium, {}], ['firefox', firefox, {}], ['webkit', webkit, {}],
  ['edge', chromium, {channel: 'msedge'}],
]) {
  let browser;
  try {
    browser = await engine.launch({headless: true, ...options});
    const context = await browser.newContext({viewport: {width:1440,height:1000}});
    const page = await context.newPage();
    const errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', req => requests.push(req.url()));
    const started = performance.now();
    await page.goto(origin);
    await page.locator('path.county').last().waitFor();
    assert.equal(await page.locator('path.county').count(), 64);
    assert.equal(await page.locator('path.county[tabindex="0"]').count(), 1);
    assert.match(await page.locator('#status-line').innerText(), /2024.*Margin/);
    const loadMs = Math.round(performance.now() - started);
    const sizes = await page.evaluate(() => ({
      html:performance.getEntriesByType('navigation')[0].decodedBodySize,
      resources:performance.getEntriesByType('resource').reduce((n,e)=>n+e.decodedBodySize,0),
    }));
    assert.ok(sizes.html+sizes.resources < 1000000);
    assert.equal(await page.locator('#state-field').isVisible(), false);
    assert.equal(await page.locator('#party-field').isVisible(), false);
    await page.locator('path.county[tabindex="0"]').focus();
    await page.keyboard.press('End');
    assert.equal(await page.locator(':focus').getAttribute('data-fips'), '08125');
    await page.keyboard.press('Home');
    assert.equal(await page.locator(':focus').getAttribute('data-fips'), '08001');
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#details-heading').innerText(), /Adams/);
    assert.equal(await page.locator('#details tbody tr').count(),14);
    await page.locator('#election-select').selectOption('election|2022-general-governor');
    await page.waitForFunction(() => document.querySelector('#status-line').textContent.includes('2022'));
    assert.match(await page.locator('#details').innerText(), /57\.2%/);
    assert.equal(await page.locator('#details tbody tr').count(),7);
    await page.getByRole('button',{name:'Turnout',exact:true}).click();
    assert.match(await page.locator('#status-line').innerText(), /Turnout/);
    assert.match(await page.locator('path[data-fips="08001"]').getAttribute('aria-label'),/57\.2%/);
    await page.getByRole('button',{name:/Close Adams/}).click();
    assert.equal(await page.locator(':focus').getAttribute('data-fips'),'08001');
    const layouts = [];
    for (const width of [1440,768,320]) {
      await page.setViewportSize({width,height:1000});
      await page.locator('#county-search').fill('Yuma');
      await page.locator('#county-list button').filter({hasText:'Yuma'}).click();
      const dimensions = await page.evaluate(() => ({width:innerWidth,scroll:document.documentElement.scrollWidth}));
      assert.ok(dimensions.scroll <= width, JSON.stringify(dimensions));
      assert.match(await page.locator('#details').innerText(),/92\.4%/);
      if (name === 'chromium') {
        const axe = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
        layouts.push({width,violations:axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))});
        await page.screenshot({path:`.cache/qa/results/${name}-${width}.png`,fullPage:true});
      }
    }
    assert.deepEqual(errors,[]);
    assert.ok(requests.every(url=>url.startsWith(origin)),'External runtime request');
    assert.equal((await context.cookies()).length,0);
    assert.deepEqual(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length})),{local:0,session:0});
    report.results.push({browser:name,version:browser.version(),passed:true,loadMs,firstViewBytes:sizes.html+sizes.resources,layouts});
  } catch(error) {
    report.results.push({browser:name,passed:false,error:error.stack});
  } finally {await browser?.close();}
}
await fs.writeFile('.cache/qa/results/browser-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(report.results.some(r=>!r.passed || r.layouts?.some(l=>l.violations.length))) process.exitCode=1;
