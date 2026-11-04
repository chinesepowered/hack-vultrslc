// Records real errands in the Unbothered UI for the demo video, using Chromium's screencast
// (frames + timestamps), and drives the UI like a person would: pick a mode, start, approve.
//
// usage: node video/record.mjs <name> <mode> <outDir> [--approve|--deny] [--until=result|leak]
//        node video/record.mjs <name> tour <outDir> <path> [scrollPx]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [name, mode, outRoot, ...rest] = process.argv.slice(2);
const base = process.env.UB_URL || 'http://localhost:8080';
const out = path.join(outRoot, name);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const frames = [];
let n = 0;
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const file = `${String(n++).padStart(5, '0')}.jpg`;
  writeFileSync(path.join(out, file), Buffer.from(data, 'base64'));
  frames.push({ file, t: metadata.timestamp });
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
const marks = [];
const mark = (label) => { marks.push({ label, t: Date.now() / 1000 }); console.log('mark', label); };
const start = () => cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });

if (mode === 'tour') {
  const [p, scroll = '0'] = rest;
  await page.goto(base + p, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await start();
  mark('start');
  await page.waitForTimeout(2500);
  const total = Number(scroll);
  for (let y = 0; y < total; y += 6) { await page.mouse.wheel(0, 6); await page.waitForTimeout(16); }
  await page.waitForTimeout(2500);
  mark('end');
} else {
  const approve = !rest.includes('--deny');
  const until = (rest.find((r) => r.startsWith('--until=')) || '--until=result').split('=')[1];
  await page.goto(`${base}/errand`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await start();
  mark('errand-page');
  await page.waitForTimeout(1800);
  const label = { protected: 'With Unbothered', baseline: 'Typical agent', redteam: 'Red team' }[mode];
  await page.getByRole('radio', { name: new RegExp(label) }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Start the errand/ }).click();
  mark('start');
  await page.waitForURL(/\/run\//, { timeout: 15000 });
  const runId = page.url().split('/run/')[1];
  console.log('run', runId);
  const deadline = Date.now() + 5 * 60_000;
  let resolved = 0;
  while (Date.now() < deadline) {
    const modal = page.locator('.modal');
    if (await modal.count()) {
      mark('approval');
      await page.waitForTimeout(3200);
      await page.getByRole('button', { name: approve ? /Approve/ : /Deny/ }).click();
      mark(approve ? 'approved' : 'denied');
      resolved++;
      await page.waitForTimeout(800);
    }
    if (until === 'leak' && (await page.locator('.egress.leaked, .eg-verdict.leaked').count())) { mark('leak'); await page.waitForTimeout(4000); break; }
    if (await page.locator('.result').count()) { mark('result'); await page.waitForTimeout(5500); break; }
    await page.waitForTimeout(250);
  }
  writeFileSync(path.join(out, 'run.txt'), runId);
  // keep the run's events so the video can align footage with what happened
  await page.waitForTimeout(1500);
  const snap = await (await fetch(`${base}/api/runs/${runId}`)).json();
  writeFileSync(path.join(out, 'events.json'), JSON.stringify(snap.events));
}
await cdp.send('Page.stopScreencast').catch(() => {});
await page.waitForTimeout(300);
writeFileSync(path.join(out, 'frames.json'), JSON.stringify({ frames, marks }, null, 1));
console.log(`saved ${frames.length} frames to ${out}`);
await browser.close();
