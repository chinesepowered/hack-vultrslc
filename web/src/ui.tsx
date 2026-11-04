import { useEffect, useState, type ReactNode, type MouseEvent } from 'react';
import { Globe, MousePointerClick, Keyboard, ClipboardList, Tag, Flag, ShieldCheck, Ban, Hand, CircleCheck, Server } from 'lucide-react';
import { CapyFace } from './Capy';
import type { Scores } from './api';

// ---------------------------------------------------------------- tiny router
export function navigate(to: string) {
  if (to === location.pathname) return;
  history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}
export function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return path;
}
export function Link({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  const go = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={go} className={className}>{children}</a>;
}

// ---------------------------------------------------------------- nav
export function Nav({ path }: { path: string }) {
  const on = (p: string) => (path === p || (p !== '/' && path.startsWith(p)) ? 'on' : '');
  return (
    <header className="nav">
      <Link to="/" className="brand"><CapyFace size={34} /><span>Unbothered</span></Link>
      <nav className="nav-links">
        <Link to="/" className={on('/') && path === '/' ? 'on' : ''}>Home</Link>
        <Link to="/errand" className={on('/errand') || on('/run')}>Live errand</Link>
        <Link to="/test" className={on('/test')}>Capybara Test</Link>
        <Link to="/how" className={on('/how')}>How it works</Link>
      </nav>
      <div className="nav-right">
        <span className="vultr-pill"><Server size={14} /> Runs on Vultr</span>
        <a className="gh" href="https://github.com/chinesepowered/hack-vultrslc" target="_blank" rel="noreferrer">GitHub</a>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------- bits
export function Pill({ tone = 'neutral', children, icon }: { tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'blue' | 'capy'; children: ReactNode; icon?: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{icon}{children}</span>;
}

export function VerdictPill({ verdict }: { verdict?: 'allow' | 'ask' | 'block' }) {
  if (!verdict) return null;
  if (verdict === 'block') return <Pill tone="bad" icon={<Ban size={13} />}>Blocked</Pill>;
  if (verdict === 'ask') return <Pill tone="warn" icon={<Hand size={13} />}>Asked you</Pill>;
  return <Pill tone="ok" icon={<ShieldCheck size={13} />}>Allowed</Pill>;
}

export const ACTION_LABEL: Record<string, string> = {
  navigate: 'Open page', click: 'Click', type: 'Type', fill_form: 'Fill form', record_price: 'Record price', finish: 'Finish',
};
export function ActionIcon({ name, size = 16 }: { name: string; size?: number }) {
  const p = { size, strokeWidth: 2.2 };
  switch (name) {
    case 'navigate': return <Globe {...p} />;
    case 'click': return <MousePointerClick {...p} />;
    case 'type': return <Keyboard {...p} />;
    case 'fill_form': return <ClipboardList {...p} />;
    case 'record_price': return <Tag {...p} />;
    case 'finish': return <Flag {...p} />;
    default: return <CircleCheck {...p} />;
  }
}

const METRICS: { key: keyof Scores; label: string; good: 'high' | 'low' }[] = [
  { key: 'serves_goal', label: 'Serves your goal', good: 'high' },
  { key: 'page_told_it', label: 'A page told it to', good: 'low' },
  { key: 'changes_request', label: 'Changes your request', good: 'low' },
  { key: 'irreversible', label: 'Hard to undo', good: 'low' },
  { key: 'sensitive', label: 'Sensitive data', good: 'low' },
];
export function GateBars({ scores, compact = false }: { scores?: Scores; compact?: boolean }) {
  if (!scores) return null;
  return (
    <div className={`bars ${compact ? 'compact' : ''}`}>
      {METRICS.map((m) => {
        const v = scores[m.key];
        const bad = m.good === 'high' ? v < 0.5 : v >= 0.5;
        return (
          <div className="bar" key={m.key}>
            <span className="bar-label">{m.label}</span>
            <span className="bar-track"><span className={`bar-fill ${bad ? 'bad' : 'good'}`} style={{ width: `${Math.max(2, v * 100)}%` }} /></span>
            <span className={`bar-val ${bad ? 'bad' : ''}`}>{Math.round(v * 100)}%</span>
          </div>
        );
      })}
      <div className="bar">
        <span className="bar-label">Overall risk</span>
        <span className="bar-track"><span className={`bar-fill ${scores.risk >= 2 ? 'bad' : 'good'}`} style={{ width: `${Math.max(2, (scores.risk / 4) * 100)}%` }} /></span>
        <span className={`bar-val ${scores.risk >= 2 ? 'bad' : ''}`}>{['Harmless', 'Minor', 'Moderate', 'Serious', 'Severe'][Math.min(4, Math.round(scores.risk))]}</span>
      </div>
    </div>
  );
}

export function Stat({ label, value, tone = 'neutral', sub }: { label: string; value: ReactNode; tone?: 'neutral' | 'ok' | 'bad' | 'warn'; sub?: ReactNode }) {
  return (
    <div className={`stat stat-${tone}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div><CapyFace size={22} /> Unbothered · built for the Vultr Agent Rush hackathon, Salt Lake City 2026</div>
      <div className="muted">Vultr Cloud Compute · Serverless Inference · gVisor tubs · MIT licensed</div>
    </footer>
  );
}
