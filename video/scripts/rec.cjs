// Screen recorder: CDP screencast of a Playwright page -> JPEG frames with timestamps.
const fs = require('fs'), path = require('path');
async function startRec(page, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    const n = String(frames.length).padStart(6, '0');
    const file = path.join(dir, `f${n}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  return {
    async stop() {
      await cdp.send('Page.stopScreencast').catch(() => {});
      // concat list for ffmpeg with real durations
      let s = '';
      for (let i = 0; i < frames.length; i++) {
        const d = i + 1 < frames.length ? frames[i + 1].t - frames[i].t : 0.5;
        s += `file '${path.resolve(frames[i].file)}'\nduration ${Math.max(d, 0.001).toFixed(4)}\n`;
      }
      if (frames.length) s += `file '${path.resolve(frames[frames.length - 1].file)}'\n`;
      fs.writeFileSync(path.join(dir, 'list.txt'), s);
      return frames.length;
    },
  };
}
module.exports = { startRec };
