import { useState } from 'react';
import { Play, ShieldCheck, ShieldOff, TriangleAlert, Clock } from 'lucide-react';
import { startRun, useConfig, usePoll, fmtDuration, type RunSummary } from '../api';
import { Capy } from '../Capy';
import { navigate, Link, Pill } from '../ui';

export function Errand() {
  const cfg = useConfig();
  const recent = usePoll<RunSummary[]>('/api/runs', 5000);
  const [mode, setMode] = useState<'protected' | 'baseline'>('protected');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const hero = cfg?.hero;

  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      const { id } = await startRun('hero', mode);
      navigate(`/run/${id}`);
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="page errand">
      <section className="errand-card card">
        <div className="errand-main">
          <div className="eyebrow">Live errand</div>
          <h1>{hero?.title ?? 'Find the cheapest 27" 4K monitor and file the purchase request'}</h1>
          <p className="goal">“{hero?.goal ?? '…'}”</p>

          <div className="trap-list">
            <div className="trap-head"><TriangleAlert size={16} /> Traps planted along the way</div>
            {hero?.traps.map((t: string) => (
              <div className="trap" key={t}>
                <b>{cfg?.trapInfo[t].label}</b>
                <span>{cfg?.trapInfo[t].attack}</span>
              </div>
            ))}
          </div>

          <div className="mode-toggle" role="radiogroup" aria-label="Protection">
            <button role="radio" aria-checked={mode === 'protected'} className={mode === 'protected' ? 'on ok' : ''} onClick={() => setMode('protected')}>
              <ShieldCheck size={18} /> <span><b>With Unbothered</b><small>Capy checks every move, sealed tub</small></span>
            </button>
            <button role="radio" aria-checked={mode === 'baseline'} className={mode === 'baseline' ? 'on bad' : ''} onClick={() => setMode('baseline')}>
              <ShieldOff size={18} /> <span><b>Typical agent</b><small>No gate, open egress, card in its prompt</small></span>
            </button>
          </div>

          <div className="errand-actions">
            <button className="btn btn-primary btn-lg" onClick={go} disabled={busy || !cfg}>
              <Play size={18} fill="currentColor" /> {busy ? 'Filling a fresh tub…' : 'Start the errand'}
            </button>
            <span className="muted small">Agent: <code>{cfg?.agentModel}</code> · Capy: <code>{cfg?.gateModel}</code> on Vultr Serverless Inference</span>
          </div>
          {err && <div className="error-box">{err}</div>}
        </div>
        <div className="errand-capy">
          <Capy mood={mode === 'protected' ? 'soak' : 'ask'} size={300} />
        </div>
      </section>

      <section className="recent">
        <h2>Recent errands</h2>
        <div className="recent-list">
          {(recent ?? []).slice(0, 8).map((r) => (
            <Link to={`/run/${r.id}`} className="recent-item card" key={r.id}>
              <div className="recent-top">
                {r.mode === 'protected' ? <Pill tone="ok" icon={<ShieldCheck size={13} />}>Unbothered</Pill> : <Pill tone="bad" icon={<ShieldOff size={13} />}>Typical agent</Pill>}
                <span className="muted small"><Clock size={12} /> {new Date(r.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="recent-title">{r.title}</div>
              <div className="recent-bottom">
                <span className={`dot ${r.outcome?.trapped ? 'bad' : r.outcome?.completed ? 'ok' : 'neutral'}`} />
                <span className="small">
                  {r.status !== 'done' && r.status !== 'failed' ? r.status : r.outcome?.trapped ? `Trapped: ${r.outcome.sprung[0]}` : r.outcome?.completed ? 'Filed the right request' : 'Did not finish'}
                </span>
                {r.endedAt && <span className="muted small"> · {fmtDuration(r.endedAt - r.startedAt)}</span>}
              </div>
            </Link>
          ))}
          {recent && recent.length === 0 && <div className="muted">No errands yet. Start the first one.</div>}
        </div>
      </section>
    </div>
  );
}
