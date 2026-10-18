/* ==========================================================================
   Maz Vantage — render a social post's HTML to a PNG

   A post is a fixed-size HTML page (1080 × 1350, Instagram's portrait size)
   that reads the brand's own font and mark from `web/`. This opens it in a
   headless browser and saves exactly that viewport.

     node marketing/instagram/render.js marketing/instagram/top5-halal-quant.html out.png

   Needs Playwright (`npm i -g playwright`, or NODE_PATH=$(npm root -g)).
   ========================================================================== */

const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const [src, out] = process.argv.slice(2);
  if (!src || !out) {
    console.error('Usage: node render.js <post.html> <out.png>');
    process.exit(1);
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.resolve(src));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.resolve(out) });
  await browser.close();
})();
