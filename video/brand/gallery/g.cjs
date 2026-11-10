const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1300 } });
  await p.goto('file://' + __dirname + '/g.html'); await p.waitForTimeout(800);
  for (let i = 1; i <= 8; i++) await p.locator('#g' + i).screenshot({ path: `${__dirname}/gallery-${i}.jpg`, type: 'jpeg', quality: 88 });
  await b.close();
})();
