// Builds the 16:9 cover image (docs/out/cover.png, 1920x1080): wordmark, tagline, result
// chips and a real frame of the red-team run where Capy blocks the card going to a scam site.
// usage: node --import tsx docs/build-cover.mjs
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import { Capy } from '../web/src/Capy.tsx';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const font = (pkg, file) => readFileSync(path.join(path.dirname(require.resolve(`${pkg}/package.json`)), 'files', file)).toString('base64');
const fonts = [
  ['Nunito', 800, font('@fontsource/nunito', 'nunito-latin-800-normal.woff2')],
  ['Nunito', 900, font('@fontsource/nunito', 'nunito-latin-900-normal.woff2')],
  ['Inter', 700, font('@fontsource/inter', 'inter-latin-700-normal.woff2')],
].map(([f, w, b64]) => `@font-face{font-family:${f};font-weight:${w};src:url(data:font/woff2;base64,${b64}) format('woff2')}`).join('\n');
const shot = readFileSync(path.join(here, 'assets', 'redteam-nope.jpg')).toString('base64');
const capy = renderToStaticMarkup(React.createElement(Capy, { mood: 'nope', size: 300, bubble: 'nope.', still: true }));

// The screenshot is cropped to the tub (URL bar, Capy's warning, the "nope." stamp on the card
// field) so it still reads when the cover is shown as a thumbnail.
const crop = { x: 36, y: 208, w: 952, h: 500 }, shotW = 860, k = shotW / crop.w;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${fonts}
* { box-sizing: border-box; }
html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; }
body { font-family: Inter, sans-serif; color: #2B1D14;
  background: radial-gradient(1000px 700px at 78% 40%, rgba(255,197,61,.28), transparent 70%), radial-gradient(800px 600px at 8% 95%, rgba(127,203,255,.22), transparent 70%), #FBF6EE; }
.text { position: absolute; left: 110px; top: 282px; width: 840px; }
.eyebrow { font: 800 25px Nunito, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: #8E5A39; }
h1 { margin: 10px 0 0 -6px; font: 900 150px Nunito, sans-serif; letter-spacing: -.045em; line-height: 1; }
.tag { margin-top: 24px; font: 800 41px Nunito, sans-serif; line-height: 1.2; color: #5E4A3B; }
.chips { margin-top: 44px; display: flex; gap: 14px; }
.chip { font: 800 25px Nunito, sans-serif; padding: 12px 20px; border-radius: 16px; background: #fff; box-shadow: 0 7px 0 #F0DDC6; white-space: nowrap; }
.chip.ok { background: #E5F6ED; color: #1C7A4C; box-shadow: 0 7px 0 #C4E9D4; }
.chip.blue { background: #EAF1FF; color: #2F6FDE; box-shadow: 0 7px 0 #D3E2FD; }
.shot { position: absolute; left: 975px; top: 196px; width: ${shotW}px; height: ${Math.round(crop.h * k)}px; overflow: hidden;
  border-radius: 24px; transform: rotate(-2deg); background: #fff;
  box-shadow: 0 50px 90px -40px rgba(43,29,20,.55), 0 0 0 10px #fff; }
.shot img { position: absolute; display: block; width: ${Math.round(1920 * k)}px; left: ${-Math.round(crop.x * k)}px; top: ${-Math.round(crop.y * k)}px; }
.mascot { position: absolute; left: 1560px; top: 560px; width: 300px; filter: drop-shadow(0 22px 26px rgba(43,29,20,.28)); }
.mascot svg { display: block; width: 100%; height: auto; overflow: visible; }
.caption { position: absolute; left: 1000px; top: 760px; width: 540px; font: 800 30px Nunito, sans-serif; line-height: 1.25; color: #5E4A3B; }
.caption b { color: #C2410C; }
</style></head><body>
<div class="text">
  <div class="eyebrow">Vultr Agent Rush · Blast Radius Zero</div>
  <h1>Unbothered</h1>
  <div class="tag">Browser agents that do real work,<br>and ignore what web pages tell them to.</div>
  <div class="chips"><span class="chip ok">0/20 attacks got through</span><span class="chip blue">gVisor tubs on Vultr</span></div>
</div>
<div class="shot"><img src="data:image/jpeg;base64,${shot}" alt=""></div>
<div class="caption">A fake pop-up asks for the company card. <b>Capy says nope</b>, and the card never leaves the tub.</div>
<div class="mascot">${capy}</div>
</body></html>`;

mkdirSync(path.join(here, 'out'), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(here, 'out', 'cover.png') });
await browser.close();
console.log('wrote docs/out/cover.png (1920x1080)');
