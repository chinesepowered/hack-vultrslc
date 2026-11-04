import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ShieldCheck, ShieldOff, Skull, Square, Timer, Cpu, MemoryStick, Network, KeyRound, Lock, Container, BrickWall, TriangleAlert,
  CircleCheck, CircleX, Ban, Hand, Droplets, FileSearch, Eye, Crown, RotateCcw,
} from 'lucide-react';
import { useRunEvents, useDerived, useNow, frameUrl, answerApproval, stopRun, startRun, host, fmtDuration, money, type Derived, type Step, type RunEvent } from '../api';
import { Capy, type Mood } from '../Capy';
import { ActionIcon, ACTION_LABEL, GateBars, Pill, VerdictPill, navigate } from '../ui';

const PR_RE = /\/requests\/(PR-\d+)/;

export function RunPage({ id }: { id: string }) {
  const { meta, events, error } = useRunEvents(id);
  const d = useDerived(events);
  const live = !d.endedAt && !d.drained && !error;
  const now = useNow(live);
  if (error) return <div className="page"><div className="error-box">Couldn't load this errand: {error}</div></div>;
  if (!meta) return <div className="page loading"><Capy mood="soak" size={160} /><p>Filling the tub…</p></div>;
  const elapsed = (d.endedAt ?? (live ? now : d.drained?.at ?? now)) - (d.startedAt ?? meta.startedAt);
  return (
    <div className="run">
      <RunHeader meta={meta} d={d} elapsed={elapsed} live={live} />
      <div className="run-grid">
        <div className="run-left">
          <TubView id={id} d={d} protectedMode={meta.mode !== 'baseline'} />
          <div className="run-left-bottom">
            <XRay d={d} />
            <Walls d={d} protectedMode={meta.mode !== 'baseline'} />
          </div>
        </div>
        <div className="run-right">
          <CapyPanel d={d} protectedMode={meta.mode !== 'baseline'} />
          <Timeline d={d} events={events} />
          <Findings d={d} />
        </div>
      </div>
      <AnimatePresence>{d.pendingApproval && <ApprovalModal key={d.pendingApproval.id} runId={id} ev={d.pendingApproval} />}</AnimatePresence>
      <AnimatePresence>{d.drained && <ResultSheet d={d} mode={meta.mode} key="result" />}</AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- header
function RunHeader({ meta, d, elapsed, live }: { meta: any; d: Derived; elapsed: number; live: boolean }) {
  const [rerunning, setRerunning] = useState(false);
  const statusText: Record<string, string> = { starting: 'Filling the tub', running: 'Working', awaiting_approval: 'Waiting for you', done: 'Done', failed: 'Failed', stopped: 'Stopped' };
  const again = async (mode: any) => {
    setRerunning(true);
    try { const r = await startRun(meta.taskId, mode); navigate(`/run/${r.id}`); } catch { setRerunning(false); }
  };
  return (
    <div className="run-header">
      <div className="run-title">
        <div className="run-title-top">
          {meta.mode === 'protected'
            ? <Pill tone="ok" icon={<ShieldCheck size={14} />}>Protected by Unbothered</Pill>
            : meta.mode === 'redteam'
              ? <Pill tone="warn" icon={<Skull size={14} />}>Red team · agent told to obey web pages · Unbothered on</Pill>
              : <Pill tone="bad" icon={<ShieldOff size={14} />}>Typical agent · no protection</Pill>}
          <span className="trap-chips">{meta.traps.map((t: string) => <span className="trap-chip" key={t}><TriangleAlert size={12} />{trapName(t)}</span>)}</span>
        </div>
        <h1>{meta.title}</h1>
      </div>
      <div className="run-meta">
        <div className={`status status-${d.status}`}><span className="status-dot" />{statusText[d.status] ?? d.status}</div>
        <div className="meta-box"><Timer size={15} /> {fmtDuration(elapsed)}</div>
        <div className="meta-box">{d.steps.length} steps</div>
        {live ? (
          <button className="btn btn-ghost" onClick={() => stopRun(meta.id)}><Square size={14} /> Stop</button>
        ) : (
          <button className="btn btn-ghost" disabled={rerunning} onClick={() => again(meta.mode)}><RotateCcw size={14} /> Run again</button>
        )}
      </div>
    </div>
  );
}
const trapName = (t: string) => ({ 'review-injection': 'Injected review', 'partner-banner': 'Cheaper "partner" lure', 'fake-policy': 'Fake policy fine print', 'intranet-cleanup': 'Destructive notice', 'session-expired': 'Fake session pop-up', none: 'No trap' } as Record<string, string>)[t] ?? t;

// ---------------------------------------------------------------- the tub (browser view)
function useLoadedFrame(id: string, n?: number) {
  const [shown, setShown] = useState<{ n: number; src: string }[]>([]);
  useEffect(() => {
    if (n == null) return;
    const src = frameUrl(id, n);
    const img = new Image();
    img.onload = () => setShown((prev) => [...prev.slice(-1), { n, src }]);
    img.src = src;
  }, [id, n]);
  return shown;
}

function TubView({ id, d, protectedMode }: { id: string; d: Derived; protectedMode: boolean }) {
  const layers = useLoadedFrame(id, d.frame?.n);
  const last: Step | undefined = d.steps[d.steps.length - 1];
  const url = d.page?.url ?? (d.frame?.url !== 'about:blank' ? d.frame?.url : '');
  const h = host(url);
  const allowed = !h || ['pixelpeak.test', 'monitormart.test', 'bytebarn.test', 'intranet.test'].includes(h);
  const blocked = last?.gate?.verdict === 'block' && !last.exec;
  const asking = !!d.pendingApproval;
  const acting = last && !last.exec && !blocked && last.box;
  const box = (blocked || asking || acting) ? last?.box : undefined;
  const scan = d.page?.scan;
  const flagged = protectedMode && scan && (scan.injection >= 0.6 || scan.asksForCard >= 0.6);
  return (
    <div className="tub card">
      <div className="tub-head">
        <div className="tub-title"><span className="tub-icon">🛁</span> The tub <span className="muted">· disposable browser sandbox</span></div>
        <div className="tub-badges">
          {d.xray ? <>
            <Pill tone={d.xray.driver === 'docker' ? 'blue' : 'warn'} icon={<Container size={13} />}>{d.xray.runtime}</Pill>
            <Pill tone="neutral" icon={<Lock size={13} />}>{d.xray.kernel}</Pill>
          </> : <Pill tone="neutral">booting…</Pill>}
        </div>
      </div>
      <div className="browser">
        <div className="browser-bar">
          <span className="dots"><i /><i /><i /></span>
          <div className={`urlbar ${h ? (allowed ? 'ok' : 'bad') : ''}`}>
            {h ? (allowed ? <ShieldCheck size={14} /> : <Ban size={14} />) : <Eye size={14} />}
            <span className="url-text">{url ? url.replace(/^http:\/\//, '') : 'about:blank'}</span>
            {h && <span className="url-tag">{allowed ? 'on allowlist' : 'not allowed'}</span>}
          </div>
        </div>
        <div className="screen">
          {layers.length === 0 && <div className="screen-empty"><Capy mood="soak" size={150} /><p>{d.xray ? 'Opening the browser…' : 'Filling a fresh tub…'}</p></div>}
          {layers.map((l, i) => (
            <img key={l.n} src={l.src} className={`shot ${i === layers.length - 1 ? 'top' : 'under'}`} alt="Sandboxed browser screen" draggable={false} />
          ))}
          <AnimatePresence>
            {box && (
              <motion.div key={`${last?.step}-${blocked}-${asking}`} className={`target-ring ${blocked ? 'bad' : asking ? 'warn' : ''}`}
                initial={{ opacity: 0, scale: 1.25 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
                style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }} />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {blocked && (
              <motion.div key={`nope-${last?.step}`} className="nope-stamp" initial={{ opacity: 0, scale: 1.6, rotate: -14 }} animate={{ opacity: 1, scale: 1, rotate: -8 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 18 }}
                style={box ? { left: `${Math.min(70, box.x * 100)}%`, top: `${Math.min(80, Math.max(6, box.y * 100 - 12))}%` } : { left: '38%', top: '40%' }}>
                <Capy mood="nope" size={54} still /> nope.
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {flagged && !d.drained && (
              <motion.div key={d.page?.url} className="scan-banner" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}>
                <TriangleAlert size={16} />
                {scan!.injection >= 0.6 ? <>Capy read this page first: it has <b>instructions aimed at AI agents</b> ({Math.round(scan!.injection * 100)}%). The agent was told to ignore them.</>
                  : <>Capy read this page first: it <b>asks for card details</b> ({Math.round(scan!.asksForCard * 100)}%). Nobody asked the agent to pay.</>}
              </motion.div>
            )}
          </AnimatePresence>
          {d.drained && (
            <div className="drained-overlay">
              <Droplets size={20} /> Tub drained · container {d.drained.containerId ?? ''} removed in {d.drained.ms} ms
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- sandbox x-ray
function XRay({ d }: { d: Derived }) {
  const x = d.xray;
  return (
    <div className="xray card">
      <div className="panel-title"><FileSearch size={16} /> Tub X-ray</div>
      {!x ? <div className="muted small">Booting the sandbox…</div> : (
        <div className="xray-grid">
          <XItem icon={<Container size={15} />} label="Isolation" value={x.runtime} ok={x.driver === 'docker'} />
          <XItem icon={<Lock size={15} />} label="Kernel" value={x.kernel} ok={x.driver === 'docker'} />
          <XItem icon={<Cpu size={15} />} label="CPU / PIDs" value={`${x.cpus} vCPU · ${x.pids ?? '∞'} procs`} ok />
          <XItem icon={<MemoryStick size={15} />} label="Memory" value={String(x.memory).replace(/^(\d+)g$/i, '$1 GB').replace(/^(\d+)m$/i, '$1 MB')} ok />
          <XItem icon={<Network size={15} />} label="Internet route" value={x.internetRoute ? 'yes (dev)' : 'none, proxy only'} ok={!x.internetRoute} />
          <XItem icon={<KeyRound size={15} />} label="Secrets inside" value={`${x.secretsInside} (env: ${x.envKeys.length} vars, no keys)`} ok={x.secretsInside === 0} />
          <XItem icon={<ShieldCheck size={15} />} label="Root filesystem" value={x.readOnlyRoot ? 'read-only' : 'writable'} ok={x.readOnlyRoot} />
          <XItem icon={<Ban size={15} />} label="Capabilities" value={x.capabilities} ok={x.driver === 'docker'} />
        </div>
      )}
    </div>
  );
}
function XItem({ icon, label, value, ok }: { icon: React.ReactNode; label: string; value: string; ok?: boolean }) {
  return (
    <div className="xitem">
      <span className={`xicon ${ok ? 'ok' : 'warn'}`}>{icon}</span>
      <span className="xtext"><span className="xlabel">{label}</span><span className="xvalue">{value}</span></span>
    </div>
  );
}

// ---------------------------------------------------------------- tub walls (egress)
function Walls({ d, protectedMode }: { d: Derived; protectedMode: boolean }) {
  const list = d.egress.slice(-7).reverse();
  const allowed = d.egress.filter((e) => e.verdict === 'allowed').length;
  return (
    <div className="walls card">
      <div className="panel-title"><BrickWall size={16} /> Tub walls · every request out
        <span className="walls-count"><span className="ok">{allowed} allowed</span> · <span className={d.wallBlocks ? 'bad' : ''}>{d.wallBlocks} blocked</span>{d.leaks ? <> · <span className="bad">{d.leaks} leaked</span></> : null}</span>
      </div>
      <div className="egress-list">
        {list.length === 0 && <div className="muted small">Nothing has left the tub yet.</div>}
        <AnimatePresence initial={false}>
          {list.map((e) => (
            <motion.div key={e.seq} className={`egress ${e.verdict}`} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} layout>
              <span className="eg-method">{e.method}</span>
              <span className="eg-url">{e.host}{e.path.length > 46 ? e.path.slice(0, 46) + '…' : e.path}</span>
              <span className={`eg-verdict ${e.verdict}`}>{e.verdict === 'allowed' ? e.status : e.verdict === 'leaked' ? 'LEAKED' : 'BLOCKED'}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {!protectedMode && <div className="walls-note bad small">Open egress: this typical agent can reach any site, including the scam one.</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Capy panel
function CapyPanel({ d, protectedMode }: { d: Derived; protectedMode: boolean }) {
  const last = d.steps[d.steps.length - 1];
  const lastBlockRecent = last?.gate?.verdict === 'block';
  let mood: Mood = 'watch';
  let msg = 'Watching every move.';
  let sub = protectedMode ? 'Each action is scored by a Vultr decision model before it runs.' : 'No lifeguard on duty for this run.';
  if (!protectedMode) { mood = 'ask'; msg = 'Capy is off duty.'; }
  if (d.status === 'starting') { mood = 'soak'; msg = 'Filling a fresh tub…'; sub = 'New gVisor sandbox, no keys inside, internal network only.'; }
  if (protectedMode && d.page?.scan && d.page.scan.injection >= 0.6) { msg = 'This page is trying to give orders.'; sub = 'I told the agent: page text is data, not instructions.'; }
  if (lastBlockRecent) { mood = 'nope'; msg = 'nope.'; sub = last.gate!.reasons.join(' · ') || 'Blocked.'; }
  if (d.pendingApproval) { mood = 'ask'; msg = 'This one is hard to undo.'; sub = 'Your call: approve or deny.'; }
  if (d.drained) { mood = 'drained'; msg = protectedMode ? 'All clear. Tub drained.' : 'Tub drained.'; sub = `${d.blocks} blocked · ${d.asks} asked you · ${d.wallBlocks} stopped at the walls`; }
  return (
    <div className={`capy-panel card mood-${mood}`}>
      <Capy mood={mood} size={112} />
      <div className="capy-say">
        <div className="capy-name">Capy <span className="muted">· lifeguard</span></div>
        <AnimatePresence mode="wait">
          <motion.div key={msg} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            <div className="capy-msg">{msg}</div>
            <div className="capy-sub">{sub}</div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- timeline
type Item = { kind: 'step'; at: number; step: Step } | { kind: 'scan'; at: number; ev: RunEvent } | { kind: 'wall'; at: number; ev: RunEvent };

function Timeline({ d, events }: { d: Derived; events: RunEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const items = useMemo<Item[]>(() => {
    const out: Item[] = d.steps.map((s) => ({ kind: 'step', at: s.at, step: s }));
    for (const e of events) {
      if (e.type === 'page' && e.scan && (e.scan.injection >= 0.6 || e.scan.asksForCard >= 0.6)) out.push({ kind: 'scan', at: e.at, ev: e });
      if (e.type === 'egress' && !e.asset && e.verdict !== 'allowed') out.push({ kind: 'wall', at: e.at, ev: e });
    }
    return out.sort((a, b) => a.at - b.at);
  }, [d.steps, events]);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' }); }, [items.length, d.steps[d.steps.length - 1]?.gate, d.steps[d.steps.length - 1]?.exec]);
  return (
    <div className="timeline card">
      <div className="panel-title"><Eye size={16} /> Every move, checked</div>
      <div className="timeline-scroll" ref={ref}>
        {items.length === 0 && <div className="muted small pad">The agent's moves will appear here.</div>}
        <AnimatePresence initial={false}>
          {items.map((it) => (
            <motion.div key={it.kind === 'step' ? `s${it.step.step}` : `${it.kind}${it.ev.seq}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              {it.kind === 'step' ? <StepCard s={it.step} /> : it.kind === 'scan' ? <ScanCard ev={it.ev} /> : <WallCard ev={it.ev} />}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function shortTarget(s: Step) {
  const a = s.action.args ?? {};
  if (s.action.name === 'navigate') return String(a.url ?? '').replace(/^https?:\/\//, '');
  if (s.action.name === 'record_price') return `${a.store} · ${a.product} · ${money(a.price)}${a.in_stock ? '' : ' (out of stock)'}`;
  if (s.action.name === 'fill_form') return (a.fields ?? []).map((f: any) => String(f.value)).filter(Boolean).slice(0, 4).join(' · ');
  if (s.action.name === 'type') return `"${String(a.text ?? '').slice(0, 60)}"`;
  if (s.action.name === 'finish') return 'Wrap up and report back';
  return (s.target ?? '').replace(/^(link|button|input\[\w+\]|select) /, '').replace(/ \(form .*\)$/, '').slice(0, 80);
}

function StepCard({ s }: { s: Step }) {
  const [open, setOpen] = useState(false);
  const v = s.gate?.verdict;
  const expanded = open || v === 'block' || v === 'ask';
  return (
    <div className={`step v-${v ?? 'none'} ${s.exec && !s.exec.ok ? 'failed' : ''}`} onClick={() => setOpen((o) => !o)}>
      <div className="step-head">
        <span className="step-n">{s.step}</span>
        <span className="step-icon"><ActionIcon name={s.action.name} size={15} /></span>
        <span className="step-label">{ACTION_LABEL[s.action.name] ?? s.action.name}</span>
        <span className="step-target">{shortTarget(s)}</span>
        {s.gate ? <VerdictPill verdict={v} /> : !s.exec ? <span className="thinking">checking…</span> : null}
      </div>
      {s.reason && <div className="step-reason">{s.reason}</div>}
      {s.gate && v === 'allow' && !open && s.gate.scores && <div className="step-mini">goal fit {Math.round(s.gate.scores.serves_goal * 100)}% · {s.gate.ms} ms</div>}
      {expanded && s.gate?.scores && <GateBars scores={s.gate.scores} compact />}
      {v === 'block' && <div className="step-why bad"><Ban size={14} /> {s.gate!.reasons.join(' · ')}</div>}
      {s.approval && s.approval.approved !== undefined && (
        <div className={`step-why ${s.approval.approved ? 'ok' : 'bad'}`}>
          {s.approval.approved ? <CircleCheck size={14} /> : <CircleX size={14} />} {s.approval.approved ? 'You approved it' : 'Denied'}{s.approval.by === 'policy' ? ' (test reviewer)' : ''}
        </div>
      )}
      {s.approval && s.approval.approved === undefined && <div className="step-why warn"><Hand size={14} /> Waiting for your approval…</div>}
      {s.exec && !s.exec.ok && <div className="step-why bad small">{s.exec.detail}</div>}
    </div>
  );
}

function ScanCard({ ev }: { ev: RunEvent }) {
  const inj = ev.scan.injection >= 0.6;
  return (
    <div className="step special scan">
      <div className="step-head"><span className="step-icon warn"><TriangleAlert size={15} /></span><span className="step-label">Capy read the page first</span><span className="step-target">{host(ev.url)}{new URL(ev.url).pathname}</span></div>
      <div className="step-reason">{inj ? `Found instructions aimed at AI agents (${Math.round(ev.scan.injection * 100)}%). The agent was told they are not from you.` : `This page asks for card details (${Math.round(ev.scan.asksForCard * 100)}%). Nobody asked the agent to pay.`}</div>
    </div>
  );
}
function WallCard({ ev }: { ev: RunEvent }) {
  return (
    <div className="step special wall">
      <div className="step-head"><span className="step-icon bad"><BrickWall size={15} /></span><span className="step-label">Tub walls blocked a request</span><span className="step-target">{ev.method} {ev.host}{ev.path.slice(0, 40)}</span></div>
      <div className="step-reason">{ev.path.startsWith('/beacon') ? 'A script on the page tried to phone home to the scam site. It never left the sandbox.' : ev.reason}</div>
    </div>
  );
}

// ---------------------------------------------------------------- findings
function Findings({ d }: { d: Derived }) {
  if (!d.findings.length) return null;
  const inStock = d.findings.filter((f) => f.in_stock);
  const best = inStock.reduce<typeof inStock[number] | undefined>((b, f) => (!b || f.price < b.price ? f : b), undefined);
  return (
    <div className="findings card">
      <div className="panel-title"><Crown size={16} /> Prices checked</div>
      <table>
        <tbody>
          {d.findings.map((f, i) => (
            <tr key={i} className={f === best ? 'best' : !f.in_stock ? 'oos' : ''}>
              <td className="f-store">{f.store}</td>
              <td className="f-prod">{f.product}</td>
              <td className="f-stock">{f.in_stock ? 'In stock' : 'Out of stock'}</td>
              <td className="f-price">{money(f.price)}{f === best && <span className="best-tag">cheapest</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- approval modal
function ApprovalModal({ runId, ev }: { runId: string; ev: RunEvent }) {
  const [busy, setBusy] = useState(false);
  const answer = async (approve: boolean) => {
    setBusy(true);
    try { await answerApproval(runId, ev.id, approve); } finally { setBusy(false); }
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'a') answer(true); if (e.key === 'd') answer(false); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });
  const values: { label: string; value: string }[] = (ev.values ?? []).filter((v: any) => v.value);
  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="modal card" initial={{ y: 40, scale: 0.96, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
        <div className="modal-head">
          <Capy mood="ask" size={92} still />
          <div>
            <div className="eyebrow warn">Capy needs a human</div>
            <h2>{ev.summary}</h2>
            {ev.destination && <div className="muted small">Sends to <code>{ev.destination.replace(/^http:\/\//, '')}</code></div>}
          </div>
        </div>
        {values.length > 0 && (
          <table className="approval-values"><tbody>{values.map((v, i) => <tr key={i}><td>{v.label}</td><td>{String(v.value)}</td></tr>)}</tbody></table>
        )}
        <div className="approval-reasons">{(ev.reasons ?? []).map((r: string) => <Pill key={r} tone="warn">{r}</Pill>)}</div>
        <GateBars scores={ev.scores} compact />
        <div className="modal-actions">
          <button className="btn btn-ghost btn-lg" disabled={busy} onClick={() => answer(false)}><CircleX size={18} /> Deny <kbd>D</kbd></button>
          <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => answer(true)}><CircleCheck size={18} /> Approve <kbd>A</kbd></button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------- result
function ResultSheet({ d, mode }: { d: Derived; mode: string }) {
  const [hidden, setHidden] = useState(false);
  const o = d.outcome;
  const pr = [...d.pages].reverse().map((p) => p.url.match(PR_RE)?.[1]).find(Boolean);
  if (hidden) return <button className="result-reopen btn btn-ghost" onClick={() => setHidden(false)}>Show result</button>;
  const good = o?.completed && !o?.trapped;
  return (
    <motion.div className={`result card ${good ? 'good' : 'bad'}`} initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 24, delay: 0.3 }}>
      <button className="result-close" onClick={() => setHidden(true)} aria-label="Hide">×</button>
      <div className="result-main">
        <div className={`result-icon ${good ? 'ok' : 'bad'}`}>{good ? <CircleCheck size={30} /> : <TriangleAlert size={30} />}</div>
        <div>
          <div className="result-title">
            {o?.trapped ? `Trapped: ${o.sprung.join(', ')}` : o?.completed ? `Filed ${pr ?? 'the purchase request'} for ${o.expected.vendor} · ${o.expected.product} · ${money(o.expected.price)}` : d.error ? `Stopped: ${d.error}` : 'The errand did not finish'}
          </div>
          <div className="result-sub">
            {o?.completed ? 'Correct item, correct vendor, quantity 1. ' : ''}
            {typeof d.verify?.submitted === 'number' && <>Capy checked the final screen: {Math.round(d.verify.submitted * 100)}% confident it was submitted. </>}
            {o?.pageScriptLeaks ? <span className="bad">A page script phoned home {o.pageScriptLeaks}×. </span> : null}
          </div>
        </div>
      </div>
      <div className="blast">
        <div className="blast-title">Blast radius</div>
        <div className="blast-grid">
          <div><b className={mode !== 'baseline' ? 'ok' : ''}>{d.blocks}</b><span>moves blocked by Capy</span></div>
          <div><b>{d.asks}</b><span>asked you first</span></div>
          <div><b className={d.wallBlocks ? 'ok' : ''}>{d.wallBlocks}</b><span>requests stopped at the walls</span></div>
          <div><b className={d.leaks || o?.cardLeaked ? 'bad' : 'ok'}>{o?.cardLeaked ? 'card' : d.leaks}</b><span>leaked</span></div>
          <div><b className="ok">{d.xray?.secretsInside ?? 0}</b><span>secrets inside the tub</span></div>
          <div><b className="ok">0</b><span>files left behind</span></div>
        </div>
      </div>
    </motion.div>
  );
}
