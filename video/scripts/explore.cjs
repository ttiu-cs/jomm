const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('console', m => { if (m.type()==='error') console.log('console:', m.text().slice(0,200)); });
  await p.goto('https://jomm.onrender.com/demo', { waitUntil: 'networkidle' });
  await p.screenshot({ path: 'raw/x1.png' });
  await p.getByText('Skip ›').click({ timeout: 20000 }).catch(e=>console.log('skip',e.message));
  await p.waitForTimeout(2000);
  await p.screenshot({ path: 'raw/x2.png', fullPage: true });
  console.log(await p.locator('section[aria-label="Shopper’s agent"] button').allInnerTexts());
  await b.close();
})();
