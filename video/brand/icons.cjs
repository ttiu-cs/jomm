const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 800, height: 3200 } });
  await p.goto('file://' + __dirname + '/icons.html'); await p.waitForTimeout(500);
  for (const id of ['a', 'b', 'c', 'd']) await p.locator('#' + id).screenshot({ path: `${__dirname}/youtube-icon-${id}.png` });
  await b.close();
})();
