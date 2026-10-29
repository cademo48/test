// Renders hello-confetti.html frame by frame and encodes it to MP4 with ffmpeg.
// Usage: node render.js [out.mp4]   (needs playwright, three and ffmpeg)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const FPS = 30;
const out = process.argv[2] || path.join(__dirname, 'hello-confetti.mp4');

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => { window.__capture = true; });
  // Serve three.js from local node_modules if installed, else fetch from the CDN
  try {
    const threePath = path.join(path.dirname(require.resolve('three')), 'three.module.js');
    await page.route('**/three.module.js', (r) => r.fulfill({ path: threePath, contentType: 'text/javascript' }));
  } catch {}
  await page.goto('file://' + path.join(__dirname, 'hello-confetti.html'));
  await page.waitForFunction(() => window.ready);
  const duration = await page.evaluate(() => window.DURATION);

  const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', out],
    { stdio: ['pipe', 'ignore', 'inherit'] });

  const frames = duration * FPS;
  for (let i = 0; i < frames; i++) {
    const png = await page.evaluate((t) => {
      window.renderFrame(t);
      return document.querySelector('canvas').toDataURL('image/png');
    }, i / FPS);
    ff.stdin.write(Buffer.from(png.split(',')[1], 'base64'));
  }
  ff.stdin.end();
  await new Promise((res) => ff.on('close', res));
  await browser.close();
  console.log(`Wrote ${out} (${frames} frames)`);
})();
