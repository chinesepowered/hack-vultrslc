// How the agent sees a page: visible text plus a numbered list of interactive elements.
// Everything here is UNTRUSTED (it comes from web pages), which is exactly where prompt
// injections live.
import type { Page } from 'playwright';

export interface El {
  id: number; tag: string; type: string; label: string; href: string; name: string; value: string;
  options?: string[]; formAction: string; formMethod: string; inModal: boolean;
}
export interface Observation { url: string; title: string; text: string; elements: El[] }

// Kept as a plain JS string: tsx/esbuild wraps compiled functions with __name() helpers
// that do not exist inside the page, so a serialized TS function would throw there.
const OBSERVE_JS = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  document.querySelectorAll('[data-ub-id]').forEach((e) => e.removeAttribute('data-ub-id'));
  const out = [];
  let id = 1;
  for (const el of Array.from(document.querySelectorAll('a[href], button, input, select, textarea, [role=button]'))) {
    if (!visible(el) || el.type === 'hidden' || el.disabled) continue;
    el.setAttribute('data-ub-id', String(id));
    const tag = el.tagName.toLowerCase();
    const label = String((el.labels && el.labels[0] && el.labels[0].innerText) || el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || el.name || '')
      .trim().replace(/\\s+/g, ' ').slice(0, 90);
    const form = el.form || el.closest('form');
    out.push({
      id, tag, type: el.type || '', label, href: el.href || '', name: el.name || '',
      value: tag === 'select' ? ((el.options[el.selectedIndex] || {}).text || '') : (tag === 'input' || tag === 'textarea') ? el.value : '',
      options: tag === 'select' ? Array.from(el.options).map((o) => o.text).slice(0, 12) : undefined,
      formAction: form ? (form.action || location.href) : '', formMethod: form ? (form.method || 'get').toLowerCase() : '',
      inModal: !!el.closest('.ub-modal, [role=dialog]'),
    });
    id++;
  }
  const text = ((document.body && document.body.innerText) || '').replace(/\\n{3,}/g, '\\n\\n').trim().slice(0, 6000);
  return { url: location.href, title: document.title, text, elements: out };
})()`;

export async function observe(page: Page): Promise<Observation> {
  return page.evaluate(OBSERVE_JS) as Promise<Observation>;
}

export function describeEl(el?: El): string {
  if (!el) return '(unknown element)';
  const kind = el.tag === 'a' ? 'link' : el.tag === 'input' ? `input${el.type ? `[${el.type}]` : ''}` : el.tag;
  let s = `${kind} ${JSON.stringify(el.label)}`;
  if (el.href && el.tag === 'a') s += ` -> ${el.href}`;
  if (el.value && el.tag !== 'a') s += ` value=${JSON.stringify(el.value.slice(0, 160))}`;
  if (el.options) s += ` options=${JSON.stringify(el.options)}`;
  if (el.formAction && el.tag !== 'a') s += ` (form ${el.formMethod.toUpperCase()} ${el.formAction})`;
  if (el.inModal) s += ' [in a pop-up]';
  return s;
}

export function renderObservation(o: Observation): string {
  return `URL: ${o.url}\nTITLE: ${o.title}\nVISIBLE TEXT:\n${o.text.slice(0, 4200)}\n\nINTERACTIVE ELEMENTS:\n${o.elements.map((e) => `[${e.id}] ${describeEl(e)}`).join('\n')}`;
}

export async function elementBox(page: Page, id: number) {
  const box = await page.locator(`[data-ub-id="${id}"]`).first().boundingBox().catch(() => null);
  if (!box) return undefined;
  const vp = page.viewportSize() ?? { width: 1280, height: 800 };
  return { x: box.x / vp.width, y: box.y / vp.height, w: box.width / vp.width, h: box.height / vp.height };
}

export async function settle(page: Page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(350);
}
