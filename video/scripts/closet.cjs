// Records the phone seller app: new shop -> Teach -> "Closet, 5 items" sample (Channel3 price check).
const { chromium, devices } = require('playwright');
const { startRec } = require('./rec.cjs');
const out = process.argv[2] || 'raw/closet1';
const scene = process.argv[3] || 'Closet, 5 items';
const shopName = process.argv[4] || 'Mina’s Closet';
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--force-device-scale-factor=3'] });
  const dev = { ...devices['iPhone 13'] }; delete dev.deviceScaleFactor;
  const ctx = await b.newContext({ ...dev, locale: 'en-US' });
  const p = await ctx.newPage();
  await p.goto('https://jomm.onrender.com/seller', { waitUntil: 'networkidle' });
  const rec = await startRec(p, `${out}/main`);
  await p.waitForTimeout(800);
  const inp = p.getByLabel('Shop name');
  await inp.click(); await inp.pressSequentially(shopName, { delay: 60 });
  await p.getByRole('button', { name: 'Continue' }).click();
  await p.getByText(scene).waitFor({ timeout: 60000 });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/pick.png` });
  await p.getByText(scene).click();
  const t0 = Date.now(); let n = 0;
  while (Date.now() - t0 < 170000) {
    await p.waitForTimeout(10000);
    await p.screenshot({ path: `${out}/s${String(++n).padStart(2, '0')}.png` });
  }
  console.log('frames', await rec.stop());
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
