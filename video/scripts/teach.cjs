// Records /demo Act 1: Rosa's camera replay teaching her agent.
const { chromium } = require('playwright');
const { startRec } = require('./rec.cjs');
const out = process.argv[2] || 'raw/teach1';
(async () => {
  const b = await chromium.launch({ args: ['--force-device-scale-factor=1.3333333'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 810 }, locale: 'en-US' });
  const p = await ctx.newPage();
  await p.goto('https://jomm.onrender.com/demo', { waitUntil: 'networkidle' });
  await p.locator('section[aria-label="Rosa teaches"]').scrollIntoViewIfNeeded();
  await p.evaluate(() => { const s = document.querySelector('section[aria-label="Rosa teaches"]'); window.scrollTo(0, s.getBoundingClientRect().top + window.scrollY - 90); });
  await p.waitForTimeout(1000);
  const rec = await startRec(p, `${out}/main`);
  await p.waitForTimeout(800);
  await p.getByText('▶ Play Rosa’s video').click();
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    await p.waitForTimeout(2000);
    if (!(await p.getByText('Skip ›').isVisible().catch(() => false))) break;
  }
  console.log('teach done after', (Date.now() - t0) / 1000);
  await p.waitForTimeout(3000);
  console.log('frames', await rec.stop());
  await b.close();
})();
