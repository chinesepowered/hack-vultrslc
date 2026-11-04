import { Server, Cpu, Network, KeyRound, Eye, BrickWall, Droplets, Hand } from 'lucide-react';
import { useConfig } from '../api';
import { Capy } from '../Capy';

export function HowPage() {
  const cfg = useConfig();
  return (
    <div className="page how">
      <section className="how-hero">
        <div>
          <div className="eyebrow">How it works</div>
          <h1>A hot tub for every errand</h1>
          <p className="lead">The agent's brain lives in the control plane. Its hands live in a sealed tub. Capy sits between them and checks every move.</p>
        </div>
        <Capy mood="watch" size={200} />
      </section>

      <section className="arch card">
        <ArchDiagram gate={cfg?.gateModel ?? 'pplx-decider-v1.2'} agent={cfg?.agentModel ?? 'minimax-m3.1-flash'} />
      </section>

      <section className="how-grid">
        <div className="card how-card"><div className="feature-icon blue"><Server size={20} /></div><h3>Control plane on a Vultr VM</h3>
          <p>Node.js on a Vultr Cloud Compute instance serves this app, runs the agent loop, and starts and destroys tubs through Docker. Model calls happen here, so the tub never holds a key.</p></div>
        <div className="card how-card"><div className="feature-icon capy"><Cpu size={20} /></div><h3>Brains on Vultr Serverless Inference</h3>
          <p>The agent uses <code>{cfg?.agentModel}</code> with tool calling. Capy uses <code>{cfg?.gateModel}</code> on the <code>/v1/systemone</code> decision endpoint, and <code>{cfg?.verifyModel}</code> checks the final screenshot.</p></div>
        <div className="card how-card"><div className="feature-icon bad"><BrickWall size={20} /></div><h3>Tubs: gVisor containers</h3>
          <p>Each errand gets a fresh container running under gVisor's user-space kernel, on an internal network with no route out, a read-only root, no Linux capabilities and capped CPU, memory and processes.</p></div>
        <div className="card how-card"><div className="feature-icon warn"><Network size={20} /></div><h3>One door out</h3>
          <p>The only reachable address is the egress proxy. It enforces the errand's allowlist, refuses TLS tunnels to the internet, logs every request, and flags the decoy card number anywhere it appears.</p></div>
        <div className="card how-card"><div className="feature-icon ok"><Hand size={20} /></div><h3>Humans for the hard stuff</h3>
          <p>Submitting a form, deleting something or entering card details waits for you. The agent never sees the real card: it types a placeholder that is filled in only after you approve.</p></div>
        <div className="card how-card"><div className="feature-icon blue"><Droplets size={20} /></div><h3>Drained, with receipts</h3>
          <p>When the errand ends the container is removed. Every step, score, approval, request and screenshot is kept as an audit trail you can replay.</p></div>
      </section>

      <section className="card how-qs">
        <div className="panel-title"><Eye size={16} /> The six questions Capy asks about every move</div>
        <div className="qs">
          {[
            ['Serves your goal', 'Does this action directly help with what you asked for?'],
            ['A page told it to', 'Is the agent doing this because text on a web page said so?'],
            ['Changes your request', 'Does it change the item, quantity, price or vendor you specified?'],
            ['Hard to undo', 'Is it a submission, payment, deletion or data send?'],
            ['Sensitive data', 'Does it involve card details, passwords or secrets?'],
            ['Overall risk', 'From harmless to severe.'],
          ].map(([q, d]) => <div className="q" key={q}><b>{q}</b><span>{d}</span></div>)}
        </div>
        <p className="muted small">All six come back from one decision-model call as probabilities, typically in under half a second, and cost a fraction of a cent.</p>
      </section>
      <section className="card how-qs">
        <div className="panel-title"><KeyRound size={16} /> What is inside a tub</div>
        <p className="muted">Chromium and a Playwright browser server. No agent code, no model access, no API keys, no SSH keys, no mounted volumes. Environment variables: <code>HOSTNAME HOME PATH PLAYWRIGHT_BROWSERS_PATH LANG LC_ALL PWD NODE_ENV</code>.</p>
      </section>
    </div>
  );
}

export function ArchDiagram({ gate, agent }: { gate: string; agent: string }) {
  return (
    <svg viewBox="0 0 1100 440" className="arch-svg" role="img" aria-label="Architecture diagram">
      <defs>
        <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#8C7767" /></marker>
        <marker id="ahb" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#E5484D" /></marker>
      </defs>
      {/* Vultr VM boundary */}
      <rect x="250" y="20" width="600" height="400" rx="26" fill="#F3F7FF" stroke="#BFD3FA" strokeWidth="2" strokeDasharray="8 6" />
      <text x="270" y="50" className="a-cap">VULTR CLOUD COMPUTE VM</text>

      {/* user */}
      <rect x="30" y="160" width="170" height="100" rx="18" fill="#fff" stroke="#E4D4BF" strokeWidth="2" />
      <text x="115" y="200" textAnchor="middle" className="a-title">You</text>
      <text x="115" y="224" textAnchor="middle" className="a-sub">errand · approvals</text>

      {/* control plane */}
      <rect x="290" y="80" width="260" height="300" rx="20" fill="#fff" stroke="#E4D4BF" strokeWidth="2" />
      <text x="420" y="112" textAnchor="middle" className="a-title">Control plane</text>
      <rect x="312" y="130" width="216" height="52" rx="12" fill="#FBF6EE" /><text x="420" y="161" textAnchor="middle" className="a-sub">web app + live stream</text>
      <rect x="312" y="192" width="216" height="52" rx="12" fill="#FBF6EE" /><text x="420" y="223" textAnchor="middle" className="a-sub">agent loop</text>
      <rect x="312" y="254" width="216" height="52" rx="12" fill="#FFF4DC" stroke="#F2C66B" /><text x="420" y="285" textAnchor="middle" className="a-sub">Capy gate</text>
      <rect x="312" y="316" width="216" height="52" rx="12" fill="#FDECEC" stroke="#F3B4B4" /><text x="420" y="347" textAnchor="middle" className="a-sub">egress proxy (allowlist)</text>

      {/* tub */}
      <rect x="610" y="150" width="210" height="170" rx="20" fill="#EAF5FF" stroke="#7FCBFF" strokeWidth="3" />
      <text x="715" y="185" textAnchor="middle" className="a-title">🛁 Tub</text>
      <text x="715" y="210" textAnchor="middle" className="a-sub">gVisor container</text>
      <text x="715" y="232" textAnchor="middle" className="a-sub">Chromium · no keys</text>
      <text x="715" y="254" textAnchor="middle" className="a-sub">internal network only</text>
      <text x="715" y="290" textAnchor="middle" className="a-small">destroyed after each errand</text>

      {/* inference */}
      <rect x="890" y="70" width="190" height="170" rx="18" fill="#fff" stroke="#BFD3FA" strokeWidth="2" />
      <text x="985" y="102" textAnchor="middle" className="a-title">Vultr Serverless</text>
      <text x="985" y="124" textAnchor="middle" className="a-title">Inference</text>
      <text x="985" y="156" textAnchor="middle" className="a-small">{agent}</text>
      <text x="985" y="178" textAnchor="middle" className="a-small">{gate}</text>
      <text x="985" y="200" textAnchor="middle" className="a-small">/v1/systemone decisions</text>

      {/* sandbox web */}
      <rect x="890" y="290" width="190" height="120" rx="18" fill="#fff" stroke="#E4D4BF" strokeWidth="2" />
      <text x="985" y="322" textAnchor="middle" className="a-title">Sandbox web</text>
      <text x="985" y="346" textAnchor="middle" className="a-small">3 stores · intranet</text>
      <text x="985" y="368" textAnchor="middle" className="a-small" fill="#E5484D">scam outlet (blocked)</text>

      <path d="M200,210 L290,210" stroke="#8C7767" strokeWidth="2.5" markerEnd="url(#ah)" markerStart="url(#ah)" />
      <path d="M528,218 L610,218" stroke="#8C7767" strokeWidth="2.5" fill="none" markerEnd="url(#ah)" />
      <text x="569" y="208" textAnchor="middle" className="a-small">drives</text>
      <path d="M610,300 C575,300 560,342 528,342" stroke="#8C7767" strokeWidth="2.5" fill="none" markerEnd="url(#ah)" />
      <text x="592" y="366" textAnchor="middle" className="a-small">only exit</text>
      <path d="M550,110 C680,70 800,80 890,120" stroke="#2F6FDE" strokeWidth="2.5" fill="none" markerEnd="url(#ah)" />
      <text x="720" y="70" textAnchor="middle" className="a-small" fill="#2F6FDE">model calls (keys stay here)</text>
      <path d="M528,350 C700,400 800,370 890,350" stroke="#8C7767" strokeWidth="2.5" fill="none" markerEnd="url(#ah)" />
      <text x="720" y="400" textAnchor="middle" className="a-small">allowed requests</text>
    </svg>
  );
}
