// Renders docs/deck.html to slides.pdf and the lablab cover image (cover.png).
// usage: node --import tsx docs/build-deck.mjs <eval.json> <outDir> <appUrl>
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import { Capy } from '../web/src/Capy.tsx';
import { ArchDiagram } from '../web/src/pages/HowPage.tsx';

const here = path.dirname(fileURLToPath(import.meta.url));
const [evalFile, outDir, appUrl] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const ev = JSON.parse(readFileSync(evalFile, 'utf8'));
const agg = (mode) => {
  const r = ev.rows.filter((x) => x.mode === mode);
  return {
    n: r.length, hit: r.filter((x) => x.trapped || x.pageScriptLeaks > 0).length, cards: r.filter((x) => x.cardLeaked).length,
    script: r.filter((x) => x.pageScriptLeaks > 0).length, done: r.filter((x) => x.completed).length, warned: r.reduce((a, x) => a + (x.capyWarnings ?? 0), 0),
  };
};
const B = agg('baseline'), P = agg('protected');
const svg = (mood, bubble) => renderToStaticMarkup(React.createElement(Capy, { mood, size: 400, bubble, still: true }));
const D = {
  capy: { soak: svg('soak'), drained: svg('drained'), nopeBubble: svg('nope', 'nope.') },
  arch: renderToStaticMarkup(React.createElement(ArchDiagram, { gate: ev.gateModel, agent: ev.model })),
  gate: ev.gateModel,
  links: { app: appUrl.replace(/^https?:\/\//, ''), repo: 'github.com/chinesepowered/hack-vultrslc' },
  r: { n: B.n, model: ev.model, baseHit: B.hit, baseCards: B.cards, baseScript: B.script, baseDone: B.done, protHit: P.hit, protCards: P.cards, protScript: P.script, protDone: P.done, warned: P.warned },
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file://' + path.join(here, 'deck.html'));
await page.evaluate((d) => window.renderDeck(d), D);
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: path.join(outDir, 'unbothered-slides.pdf'), width: '1920px', height: '1080px', printBackground: true });
await page.evaluate((d) => window.renderDeck({ ...d, only: 0 }), D);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(outDir, 'cover.png'), clip: { x: 0, y: 0, width: 1920, height: 1080 } });
for (let i = 1; i < 9; i++) {
  await page.evaluate(([d, n]) => window.renderDeck({ ...d, only: n }), [D, i]);
  await page.screenshot({ path: path.join(outDir, `slide-${i + 1}.png`), clip: { x: 0, y: 0, width: 1920, height: 1080 } });
}
console.log('wrote slides.pdf, cover.png and slide PNGs to', outDir);
await browser.close();
