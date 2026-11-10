const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 2000 }, deviceScaleFactor: 1 });
  await p.goto('file://' + __dirname + '/thumb.html'); await p.waitForTimeout(800);
  for (const id of ['a', 'b']) await p.locator('#' + id).screenshot({ path: `${__dirname}/devpost-thumb-${id}.png` });
  await b.close();
})();
