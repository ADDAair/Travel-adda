// node tools/art/render.js <outdir>  -> renders every illustration in art.js to PNG (1.5x).
const path = require('path');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const arts = require('./art');
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch();
  const pg = await b.newPage({ deviceScaleFactor: 1.5 });
  for (const [name, s] of Object.entries(arts)) {
    await pg.setContent(`<html><body style="margin:0;background:transparent">${s}</body></html>`);
    await pg.locator('svg').screenshot({ path: path.join(out, name + '.png'), omitBackground: true });
  }
  await b.close();
  console.log('rendered', Object.keys(arts).join(', '));
})();
