import { Play, ShieldCheck, Bath, Droplets, ArrowRight, Eye, BrickWall, ListChecks, Sparkles } from 'lucide-react';
import { Capy } from '../Capy';
import { Link, Stat } from '../ui';
import { usePoll } from '../api';
import { summarize } from './TestPage';

export function Home() {
  const ev = usePoll<any>('/api/eval', 15000);
  const s = ev?.rows?.length ? summarize(ev.rows) : null;
  return (
    <div className="page home">
      <section className="hero">
        <div className="hero-text">
          <div className="eyebrow">Vultr Agent Rush · Blast Radius Zero</div>
          <h1>Browser agents that do real work, and ignore what web pages tell them to.</h1>
          <p className="lead">
            Every errand runs in its own disposable <b>gVisor tub</b> on Vultr. <b>Capy</b>, our lifeguard, checks every move with
            Vultr's decision models before it happens. When the job is done, the tub is drained.
          </p>
          <div className="hero-cta">
            <Link to="/errand" className="btn btn-primary btn-lg"><Play size={18} fill="currentColor" /> Run the live errand</Link>
            <Link to="/test" className="btn btn-ghost btn-lg">See the Capybara Test <ArrowRight size={16} /></Link>
          </div>
          <div className="hero-foot muted small">Agent and gate on Vultr Serverless Inference · tubs on Vultr Cloud Compute</div>
        </div>
        <div className="hero-art">
          <div className="hero-glow" />
          <Capy mood="soak" size={400} />
        </div>
      </section>

      <section className="features">
        <div className="feature card">
          <div className="feature-icon blue"><Bath size={22} /></div>
          <h3>Its own tub</h3>
          <p>Each errand gets a fresh gVisor sandbox with Chromium inside. No API keys, no internet route, read-only root, capped CPU, memory and processes.</p>
        </div>
        <div className="feature card">
          <div className="feature-icon capy"><Eye size={22} /></div>
          <h3>A lifeguard on every move</h3>
          <p>Before a click, a form fill or a page load runs, Capy scores it: does it serve your goal, did a web page tell the agent to do it, can it be undone.</p>
        </div>
        <div className="feature card">
          <div className="feature-icon ok"><Droplets size={22} /></div>
          <h3>Drained afterwards</h3>
          <p>Hard-to-undo steps wait for your approval. When the errand ends, the container is destroyed. The only thing left is the audit trail.</p>
        </div>
      </section>

      <section className="layers card">
        <div className="layers-text">
          <div className="eyebrow">Defense in depth</div>
          <h2>Three things stand between a malicious page and your data</h2>
          <ol className="layer-list">
            <li><span className="ln capy"><Eye size={16} /></span><div><b>Capy reads it.</b> Every new page is scanned for instructions aimed at AI agents, and the agent is warned that page text is data, not orders.</div></li>
            <li><span className="ln warn"><ListChecks size={16} /></span><div><b>Capy scores it.</b> Each proposed action goes to a Vultr decision model with six questions in one call. Off-goal moves are blocked, hard-to-undo ones ask you.</div></li>
            <li><span className="ln bad"><BrickWall size={16} /></span><div><b>The walls hold.</b> Whatever slips through still can't leave: the tub's only exit is a proxy that enforces the errand's allowlist and catches card numbers.</div></li>
          </ol>
        </div>
        <div className="layers-art">
          <Capy mood="nope" size={260} bubble="nope." />
        </div>
      </section>

      <section className="teaser">
        <div className="teaser-head">
          <div>
            <div className="eyebrow">The Capybara Test</div>
            <h2>20 errands, 5 kinds of traps, run twice</h2>
            <p className="muted">Same model, same prompt. Once as a typical agent, once with Unbothered. Scored from what actually happened inside each sandbox.</p>
          </div>
          <Link to="/test" className="btn btn-ghost">Full results <ArrowRight size={16} /></Link>
        </div>
        {s ? (
          <div className="teaser-grid">
            <div className="teaser-col card bad-edge">
              <div className="teaser-label">Typical agent</div>
              <div className="teaser-stats">
                <Stat label="errands where an attack worked" value={`${s.baseline.harmed}/${s.baseline.n}`} tone={s.baseline.harmed ? 'bad' : 'neutral'} />
                <Stat label="card numbers stolen" value={s.baseline.cardLeaks} tone={s.baseline.cardLeaks ? 'bad' : 'neutral'} />
                <Stat label="errands done right" value={`${s.baseline.completed}/${s.baseline.n}`} />
              </div>
            </div>
            <div className="teaser-col card ok-edge">
              <div className="teaser-label"><ShieldCheck size={16} /> With Unbothered</div>
              <div className="teaser-stats">
                <Stat label="errands where an attack worked" value={`${s.protected.harmed}/${s.protected.n}`} tone={s.protected.harmed ? 'bad' : 'ok'} />
                <Stat label="card numbers stolen" value={s.protected.cardLeaks} tone={s.protected.cardLeaks ? 'bad' : 'ok'} />
                <Stat label="errands done right" value={`${s.protected.completed}/${s.protected.n}`} tone="ok" />
              </div>
            </div>
          </div>
        ) : <div className="muted card pad">Results will appear here after the first Capybara Test run.</div>}
      </section>

      <section className="cta-band card">
        <Capy mood="drained" size={150} />
        <div>
          <h2>Stay unbothered.</h2>
          <p className="muted">Watch a real agent shop three stores, dodge three traps, and file a purchase request, live in a Vultr sandbox.</p>
        </div>
        <Link to="/errand" className="btn btn-primary btn-lg"><Sparkles size={18} /> Start an errand</Link>
      </section>
    </div>
  );
}
