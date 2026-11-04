import { useEffect, useMemo, useRef, useState } from 'react';

export type Mode = 'protected' | 'baseline' | 'redteam';
export interface Scores { serves_goal: number; page_told_it: number; changes_request: number; irreversible: number; sensitive: number; risk: number }
export interface Box { x: number; y: number; w: number; h: number }
export interface RunEvent { seq: number; at: number; type: string; [k: string]: any }
export interface RunSummary {
  id: string; taskId: string; title: string; goal: string; traps: string[]; trapLabel: string; mode: Mode;
  status: string; startedAt: number; endedAt?: number; outcome?: any; frames: number; agentModel?: string;
}
export interface Step {
  step: number; at: number; action: { name: string; args: any }; reason?: string; target?: string; box?: Box; ms?: number;
  gate?: { verdict: 'allow' | 'ask' | 'block'; layer: string; reasons: string[]; rules: string[]; scores?: Scores; ms: number; destination?: string };
  approval?: { id: string; approved?: boolean; by?: string; auto?: boolean };
  exec?: { ok: boolean; detail: string };
}
export interface Config {
  agentModel: string; gateModel: string; verifyModel: string; driver: string; runtime: string; region: string; allow: string[];
  hero: any; suite: { id: string; title: string; trapLabel: string; target: string }[]; trapInfo: Record<string, { label: string; where: string; attack: string }>;
}

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
  return body as T;
}

export const startRun = (taskId: string, mode: Mode) => api<{ id: string }>('/api/runs', { method: 'POST', body: JSON.stringify({ taskId, mode }) });
export const answerApproval = (runId: string, approvalId: string, approve: boolean) =>
  api(`/api/runs/${runId}/approval`, { method: 'POST', body: JSON.stringify({ approvalId, approve }) });
export const stopRun = (runId: string) => api(`/api/runs/${runId}/stop`, { method: 'POST' });
export const frameUrl = (runId: string, n: number) => `/api/runs/${runId}/frames/${n}`;

export function useConfig() {
  const [cfg, setCfg] = useState<Config | null>(null);
  useEffect(() => { api<Config>('/api/config').then(setCfg).catch(() => {}); }, []);
  return cfg;
}

export function usePoll<T>(path: string, ms: number, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = () => api<T>(path).then((d) => alive && setData(d)).catch(() => {});
    tick();
    const t = setInterval(tick, ms);
    return () => { alive = false; clearInterval(t); };
  }, [path, ms, enabled]);
  return data;
}

/** Loads a run snapshot, then follows its live event stream. */
export function useRunEvents(id: string) {
  const [meta, setMeta] = useState<RunSummary | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef(0);
  useEffect(() => {
    let es: EventSource | null = null;
    let alive = true;
    seen.current = 0;
    setEvents([]);
    api<RunSummary & { events: RunEvent[] }>(`/api/runs/${id}`)
      .then((snap) => {
        if (!alive) return;
        const { events: evs, ...m } = snap;
        setMeta(m);
        setEvents(evs);
        seen.current = evs.length;
        es = new EventSource(`/api/runs/${id}/stream?from=${evs.length}`);
        es.onmessage = (msg) => {
          const ev = JSON.parse(msg.data) as RunEvent;
          if (ev.seq < seen.current) return;
          seen.current = ev.seq + 1;
          setEvents((prev) => [...prev, ev]);
        };
        es.addEventListener('end', () => es?.close());
      })
      .catch((e) => setError(e.message));
    return () => { alive = false; es?.close(); };
  }, [id]);
  return { meta, events, error };
}

export interface Derived {
  status: string; steps: Step[]; frame?: { n: number; url: string; step?: number; box?: Box; final?: boolean };
  page?: { url: string; title: string; scan?: { injection: number; asksForCard: number } };
  pages: { url: string; title: string; scan?: { injection: number; asksForCard: number }; at: number }[];
  egress: RunEvent[]; findings: { store: string; product: string; price: number; url: string; in_stock: boolean }[];
  xray?: any; pendingApproval?: RunEvent; outcome?: any; verify?: any; drained?: RunEvent; finished?: RunEvent; error?: string;
  warnings: string[]; startedAt?: number; endedAt?: number; blocks: number; asks: number; wallBlocks: number; leaks: number;
}

export function derive(events: RunEvent[]): Derived {
  const d: Derived = { status: 'starting', steps: [], pages: [], egress: [], findings: [], warnings: [], blocks: 0, asks: 0, wallBlocks: 0, leaks: 0 };
  const byStep = new Map<number, Step>();
  const approvals = new Map<string, RunEvent>();
  for (const e of events) {
    if (d.startedAt == null) d.startedAt = e.at;
    switch (e.type) {
      case 'status': d.status = e.status; if (['done', 'failed', 'stopped'].includes(e.status)) d.endedAt = e.at; break;
      case 'xray': d.xray = e.info; break;
      case 'page': d.page = { url: e.url, title: e.title, scan: e.scan }; d.pages.push({ url: e.url, title: e.title, scan: e.scan, at: e.at }); break;
      case 'thought': {
        const s: Step = { step: e.step, at: e.at, action: e.action, reason: e.reason, target: e.target, box: e.box, ms: e.ms };
        byStep.set(e.step, s);
        d.steps.push(s);
        break;
      }
      case 'gate': {
        const s = byStep.get(e.step);
        if (s) s.gate = { verdict: e.verdict, layer: e.layer, reasons: e.reasons, rules: e.rules, scores: e.scores, ms: e.ms, destination: e.destination };
        if (e.verdict === 'block') d.blocks++;
        if (e.verdict === 'ask') d.asks++;
        break;
      }
      case 'approval': {
        approvals.set(e.id, e);
        const s = byStep.get(e.step);
        if (s) s.approval = { id: e.id, auto: e.auto };
        if (!e.auto) d.pendingApproval = e;
        break;
      }
      case 'approval_resolved': {
        const a = approvals.get(e.id);
        const s = a && byStep.get(a.step);
        if (s?.approval) { s.approval.approved = e.approved; s.approval.by = e.by; }
        if (d.pendingApproval?.id === e.id) d.pendingApproval = undefined;
        break;
      }
      case 'exec': { const s = byStep.get(e.step); if (s) s.exec = { ok: e.ok, detail: e.detail }; break; }
      case 'frame': d.frame = { n: e.n, url: e.url, step: e.step, box: e.box, final: e.final }; break;
      case 'egress':
        if (!e.asset) d.egress.push(e);
        if (e.verdict === 'blocked' || e.verdict === 'leak-blocked') d.wallBlocks += e.asset ? 0 : 1;
        if (e.verdict === 'leaked') d.leaks++;
        break;
      case 'finding': d.findings.push({ store: e.store, product: e.product, price: e.price, url: e.url, in_stock: e.in_stock }); break;
      case 'verify': d.verify = e; break;
      case 'outcome': d.outcome = e; break;
      case 'finished': d.finished = e; break;
      case 'drained': d.drained = e; break;
      case 'error': d.error = e.message; break;
      case 'warning': d.warnings.push(e.message); break;
    }
  }
  return d;
}

export function useDerived(events: RunEvent[]) {
  return useMemo(() => derive(events), [events]);
}

export function useNow(active: boolean, ms = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}

export const host = (u?: string) => { try { return u ? new URL(u).host : ''; } catch { return ''; } };
export const fmtDuration = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const money = (n: number) => `$${Number(n).toFixed(2).replace(/\.00$/, '')}`;
