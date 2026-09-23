import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { createFixtureFetch, FIXTURE_KEY } from './market-hub-preview-fixtures.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/yilma/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const fixtureFetch = createFixtureFetch();
  await page.addInitScript(key => localStorage.setItem('mazvantage.fmp.key', key), FIXTURE_KEY);
  await page.route('https://financialmodelingprep.com/**', async route => {
    const url = new URL(route.request().url());
    let rows;
    if (url.pathname.endsWith('economic-calendar')) {
      const date = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10) + ' 08:00:00';
      rows = ['US', 'GB', 'DE', 'FR', 'BR', 'CN', 'IN', 'ZA', 'AU', 'JP'].flatMap((country, i) => [
        { country, date, event: country === 'US' ? 'GDP Growth Annualized (Q2)' : 'GDP Growth Rate YoY (Q2)', actual: i - 2, unit: '%' },
        { country, date, event: 'Inflation Rate YoY (Aug)', actual: i * 1.2, unit: '%' },
      ]);
    } else rows = await (await fixtureFetch(url.href)).json();
    await route.fulfill({ json: rows });
  });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('http://localhost:8792/?view=markets&sub=economy');
    await page.waitForSelector('.em-map svg path');
    assert.equal(await page.locator('.em-map svg').count(), 2);
    assert(await page.locator('.em-map svg path').count() > 300);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const gdp = page.locator('#economy-map-gdp');
    await gdp.locator('select[aria-label="GDP growth basis"]').selectOption('gdpAnnualized');
    await gdp.locator('select[aria-label="GDP growth rate country"]').selectOption('US');
    assert((await gdp.locator('.em-detail').innerText()).includes('Annualized QoQ'));
    await page.locator('#economy-map-inflation select').selectOption('DE');
    assert((await page.locator('#economy-map-inflation .em-detail').innerText()).includes('2.40%'));
    await gdp.locator('select[aria-label="GDP growth basis"]').selectOption('gdp');
    await page.screenshot({ path: `economy-map-${width}.png`, fullPage: true });
    console.log(`Passed ${width}px: two maps, country selection, GDP basis, values, no overflow.`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
