// Builds the demo video: lays out scenes around the narration, maps recorded footage onto
// them, renders every frame through compositor.html, then mixes narration and music.
// usage: node --import tsx video/render.mjs <script.json> <workDir> <out.mp4> [--preview=t1,t2,...]
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import { Capy } from '../web/src/Capy.tsx';
import { ArchDiagram } from '../web/src/pages/HowPage.tsx';

const here = path.dirname(fileURLToPath(import.meta.url));
const [scriptFile, work, outFile, ...flags] = process.argv.slice(2);
const preview = (flags.find((f) => f.startsWith('--preview=')) || '').split('=')[1];
const script = JSON.parse(readFileSync(scriptFile, 'utf8'));
const FPS = script.fps ?? 30;

// ---------------------------------------------------------------- narration words
function wordsFor(id) {
  const f = path.join(work, 'tts', `${id}.json`);
  if (!existsSync(f)) return { duration: 0, words: [] };
  const a = JSON.parse(readFileSync(f, 'utf8'));
  const words = [];
  let cur = null;
  a.chars.forEach((ch, i) => {
    if (/\s/.test(ch)) { if (cur) { words.push(cur); cur = null; } return; }
    if (!cur) cur = { w: '', s: a.start[i], e: a.end[i] };
    cur.w += ch;
    cur.e = a.end[i];
  });
  if (cur) words.push(cur);
  return { duration: a.duration, words };
}

// ---------------------------------------------------------------- recordings + anchors
const recordings = {};
function loadRec(name) {
  if (recordings[name]) return recordings[name];
  const dir = path.join(work, 'rec', name);
  const { frames, marks } = JSON.parse(readFileSync(path.join(dir, 'frames.json'), 'utf8'));
  const t0 = frames[0].t;
  const ev = existsSync(path.join(dir, 'events.json')) ? JSON.parse(readFileSync(path.join(dir, 'events.json'), 'utf8')) : [];
  const a = { begin: 0, end: frames.at(-1).t - t0 };
  for (const m of marks) a[m.label] ??= m.t - t0;
  const first = (pred, key) => { const e = ev.find(pred); if (e) a[key] ??= e.at / 1000 - t0; };
  first((e) => e.type === 'xray', 'xray');
  first((e) => e.type === 'thought', 'firstStep');
  first((e) => e.type === 'finding', 'finding');
  first((e) => e.type === 'page' && e.scan?.injection >= 0.6, 'scan');
  first((e) => e.type === 'page' && e.scan?.asksForCard >= 0.6, 'popup');
  first((e) => e.type === 'page' && /intranet\.test\/requests\/new/.test(e.url), 'form');
  first((e) => e.type === 'egress' && !e.asset && (e.verdict === 'blocked' || e.verdict === 'leak-blocked'), 'wall');
  first((e) => e.type === 'egress' && e.verdict === 'leaked', 'leakEv');
  first((e) => e.type === 'approval', 'approvalEv');
  first((e) => e.type === 'drained', 'drained');
  ev.filter((e) => e.type === 'gate' && e.verdict === 'block').forEach((e, i) => { a[`block${i + 1}`] ??= e.at / 1000 - t0; });
  ev.filter((e) => e.type === 'thought').forEach((e) => { a[`step${e.step}`] ??= e.at / 1000 - t0; });
  recordings[name] = { dir: path.relative(here, dir), frames: frames.map((f) => ({ file: f.file, t: f.t - t0 })), anchors: a };
  return recordings[name];
}
// A card with Capy's six real scores for one recorded move.
function gateCard(rec) {
  const ev = JSON.parse(readFileSync(path.join(here, rec.dir, 'events.json'), 'utf8'));
  const g = ev.find((e) => e.type === 'gate' && e.scores && e.step >= 2 && e.verdict === 'allow') ?? ev.find((e) => e.type === 'gate' && e.scores);
  const th = ev.find((e) => e.type === 'thought' && e.step === g.step);
  const rows = [['Serves your goal', g.scores.serves_goal, 'high'], ['A page told it to', g.scores.page_told_it, 'low'], ['Changes your request', g.scores.changes_request, 'low'], ['Hard to undo', g.scores.irreversible, 'low'], ['Sensitive data', g.scores.sensitive, 'low'], ['Overall risk', g.scores.risk / 4, 'low']];
  const bar = ([label, v, good]) => { const bad = good === 'high' ? v < 0.5 : v >= 0.5; return `<div class="gb"><span>${label}</span><span class="tr"><span class="fi ${bad ? 'bad' : 'good'}" style="display:block;width:${Math.max(3, v * 100)}%"></span></span><b>${Math.round(v * 100)}%</b></div>`; };
  return `<div class="gcard">Capy's six questions · step ${g.step}<div class="gsub">${String(th?.reason ?? '').slice(0, 64)}… · one call · ${g.ms} ms</div>${rows.map(bar).join('')}</div>`;
}
function anchor(rec, spec) {
  if (typeof spec === 'number') return spec;
  const m = String(spec).match(/^([a-zA-Z0-9]+)([+-][\d.]+)?$/);
  if (!m || rec.anchors[m[1]] == null) throw new Error(`unknown anchor ${spec}; have ${Object.keys(rec.anchors).join(',')}`);
  return rec.anchors[m[1]] + Number(m[2] || 0);
}

// ---------------------------------------------------------------- layout
let t = 0;
const scenes = [];
const captions = [];
for (const s of script.scenes) {
  const { duration, words } = s.say ? wordsFor(s.id) : { duration: 0, words: [] };
  const padIn = s.padIn ?? 0.35, padOut = s.padOut ?? 0.55;
  const dur = Math.max(s.minDur ?? 2, duration + padIn + padOut);
  const sc = { ...s, start: t, end: t + dur, voiceAt: t + padIn, voiceDur: duration };
  sc.words = words.map((w) => ({ w: w.w, s: w.s + sc.voiceAt, e: w.e + sc.voiceAt }));
  if (s.kind === 'footage') {
    const rec = loadRec(s.rec);
    sc.map = s.map.map((p) => ({ at: p.at === 'end' ? dur : p.at <= 1 && p.frac ? p.at * dur : p.at, src: anchor(rec, p.src) }));
    // camera and callouts may be expressed in source time; convert to scene time
    const toScene = (src) => {
      const m = sc.map;
      for (let i = 1; i < m.length; i++) {
        if (src <= m[i].src) return m[i - 1].at + ((src - m[i - 1].src) / Math.max(m[i].src - m[i - 1].src, 1e-6)) * (m[i].at - m[i - 1].at);
      }
      return m.at(-1).at;
    };
    const when = (v) => (v === 'end' ? dur : typeof v === 'string' ? toScene(anchor(rec, v)) : v);
    sc.cam = (s.cam || []).map((c) => ({ ...c, at: when(c.at) })).sort((a, b) => a.at - b.at);
    sc.callouts = (s.callouts || []).map((c) => ({ ...c, html: c.html.includes('{{GATE}}') ? gateCard(rec) : c.html, at: when(c.at), until: when(c.until) }));
  }
  scenes.push(sc);
  // caption lines
  let line = [];
  const flush = () => { if (line.length) captions.push({ start: line[0].s, end: line.at(-1).e, words: line }); line = []; };
  for (const w of sc.words) {
    const len = line.reduce((n, x) => n + x.w.length + 1, 0);
    if (len + w.w.length > 46) flush();
    line.push(w);
    if (/[.!?:]$/.test(w.w) && len > 16) flush();
  }
  flush();
  t += dur;
}
const total = t;

const ev = JSON.parse(readFileSync(path.join(work, 'eval.json'), 'utf8'));
const rows = ev.rows;
const agg = (mode) => {
  const r = rows.filter((x) => x.mode === mode);
  return { hit: r.filter((x) => x.trapped || x.pageScriptLeaks > 0).length, cards: r.filter((x) => x.cardLeaked).length, script: r.filter((x) => x.pageScriptLeaks > 0).length, n: r.length };
};
const B = agg('baseline'), P = agg('protected');
const capySvg = (mood, bubble) => renderToStaticMarkup(React.createElement(Capy, { mood, size: 400, bubble }));
const timeline = {
  fps: FPS, duration: total, scenes, captions, recordings,
  results: { n: B.n, baseHit: B.hit, baseCards: B.cards, baseScript: B.script, protHit: P.hit, protCards: P.cards, protScript: P.script, model: ev.model },
  capy: Object.fromEntries(['soak', 'watch', 'nope', 'ask', 'drained'].map((m) => [m, capySvg(m)])),
  capyNopeBubble: capySvg('nope', 'nope.'),
  archSvg: renderToStaticMarkup(React.createElement(ArchDiagram, { gate: ev.gateModel, agent: ev.model })),
  links: script.links,
};
mkdirSync(work, { recursive: true });
writeFileSync(path.join(work, 'timeline.json'), JSON.stringify({ ...timeline, recordings: Object.keys(recordings) }, null, 1));
console.log(`timeline: ${scenes.length} scenes, ${total.toFixed(1)}s, ${captions.length} caption lines`);
scenes.forEach((s) => console.log(`  ${s.id.padEnd(10)} ${s.start.toFixed(1).padStart(6)}s → ${s.end.toFixed(1).padStart(6)}s  voice ${s.voiceDur.toFixed(1)}s`));

// ---------------------------------------------------------------- frames
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(here, 'compositor.html'));
await page.evaluate((tl) => window.setup(tl), timeline);

if (preview) {
  for (const p of preview.split(',')) {
    await page.evaluate((x) => window.renderAt(x), Number(p));
    await page.screenshot({ path: path.join(work, `preview_${p}.jpg`), type: 'jpeg', quality: 88 });
    console.log('preview', p);
  }
  await browser.close();
  process.exit(0);
}

const silent = path.join(work, 'video-silent.mp4');
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), silent], { stdio: ['pipe', 'inherit', 'inherit'] });
const nFrames = Math.ceil(total * FPS);
const t0 = Date.now();
for (let f = 0; f < nFrames; f++) {
  await page.evaluate((x) => window.renderAt(x), f / FPS);
  const buf = await page.screenshot({ type: 'jpeg', quality: 93 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % 300 === 0) console.log(`frame ${f}/${nFrames} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();

// ---------------------------------------------------------------- audio
const voiced = scenes.filter((s) => s.say);
const args = ['-y', '-loglevel', 'error', '-i', silent];
voiced.forEach((s) => args.push('-i', path.join(work, 'tts', `${s.id}.mp3`)));
args.push('-i', script.music);
const n = voiced.length;
const parts = voiced.map((s, i) => `[${i + 1}:a]aresample=48000,adelay=${Math.round(s.voiceAt * 1000)}:all=1[v${i}]`);
const mix = `${voiced.map((_, i) => `[v${i}]`).join('')}amix=inputs=${n}:normalize=0:dropout_transition=0,apad,atrim=0:${total.toFixed(2)}[voice]`;
const music = `[${n + 1}:a]aresample=48000,atrim=0:${total.toFixed(2)},afade=t=in:st=0:d=1.5,afade=t=out:st=${(total - 3).toFixed(2)}:d=3,volume=0.55[mus]`;
const duck = `[voice]asplit=2[vk][vm];[mus][vk]sidechaincompress=threshold=0.03:ratio=9:attack=15:release=420[ducked];[vm][ducked]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[aout]`;
args.push('-filter_complex', [...parts, mix, music, duck].join(';'), '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', outFile);
await new Promise((resolve, reject) => {
  const p = spawn('ffmpeg', args, { stdio: 'inherit' });
  p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg audio mix failed: ${code}`))));
});
console.log(`wrote ${outFile} (${total.toFixed(1)}s) in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
