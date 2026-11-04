// Dev helper: start an errand and print its live event stream in the terminal.
// usage: node scripts/watch-run.mjs [taskId] [protected|baseline] [--approve|--deny]
const base = process.env.UB_URL || 'http://localhost:8080';
const [taskId = 'hero', mode = 'protected', policy = '--approve'] = process.argv.slice(2);

const r = await fetch(`${base}/api/runs`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-token': process.env.ADMIN_TOKEN || '' }, body: JSON.stringify({ taskId, mode, agentModel: process.env.AGENT_MODEL_OVERRIDE || undefined }) });
const { id, error } = await r.json();
if (!id) { console.error('could not start:', error); process.exit(1); }
console.log(`run ${id} (${taskId}, ${mode})  ${base}/run/${id}`);

const t0 = Date.now();
const res = await fetch(`${base}/api/runs/${id}/stream`);
const dec = new TextDecoder();
let buf = '';
const pct = (x) => (x == null ? '  - ' : String(Math.round(x * 100)).padStart(3) + '%');
for await (const chunk of res.body) {
  buf += dec.decode(chunk, { stream: true });
  let i;
  while ((i = buf.indexOf('\n\n')) >= 0) {
    const block = buf.slice(0, i); buf = buf.slice(i + 2);
    if (block.startsWith('event: end')) process.exit(0);
    const line = block.split('\n').find((l) => l.startsWith('data: '));
    if (!line) continue;
    const e = JSON.parse(line.slice(6));
    const ts = ((e.at - t0) / 1000).toFixed(1).padStart(5) + 's';
    switch (e.type) {
      case 'xray': console.log(ts, 'TUB ', e.info.runtime, '|', e.info.kernel, '| net', e.info.network, '| env', e.info.envKeys.join(','), '| boot', e.info.bootMs + 'ms'); break;
      case 'page': console.log(ts, 'PAGE', e.url, e.scan ? `scan: injection ${pct(e.scan.injection)} card ${pct(e.scan.asksForCard)}` : ''); break;
      case 'thought': console.log(ts, `#${e.step}`.padEnd(4), e.action.name, JSON.stringify(e.action.args).slice(0, 150), `(${e.ms}ms)`); break;
      case 'gate': console.log(ts, '  CAPY', e.verdict.toUpperCase().padEnd(5), e.layer.padEnd(5), e.scores ? `goal${pct(e.scores.serves_goal)} page${pct(e.scores.page_told_it)} chg${pct(e.scores.changes_request)} irr${pct(e.scores.irreversible)} sens${pct(e.scores.sensitive)} risk ${e.scores.risk.toFixed(1)}` : '', e.reasons.join(' | ')); break;
      case 'approval':
        console.log(ts, '  ASK ', e.summary, JSON.stringify(e.values ?? '').slice(0, 200));
        if (!e.auto) await fetch(`${base}/api/runs/${id}/approval`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approvalId: e.id, approve: policy !== '--deny' }) });
        break;
      case 'approval_resolved': console.log(ts, '  ->', e.approved ? 'APPROVED' : 'DENIED', 'by', e.by); break;
      case 'exec': if (!e.ok) console.log(ts, '  EXEC FAIL', e.detail); break;
      case 'egress': if (!e.asset && e.verdict !== 'allowed') console.log(ts, '  WALL', e.verdict, e.method, e.host + e.path.slice(0, 60), e.reason || ''); break;
      case 'finding': console.log(ts, '  NOTE', e.store, e.product, '$' + e.price, e.in_stock ? 'in stock' : 'OUT'); break;
      case 'verify': console.log(ts, 'VERIFY', e.submitted != null ? `submitted ${pct(e.submitted)}` : e.error); break;
      case 'outcome': console.log(ts, 'OUTCOME', JSON.stringify({ completed: e.completed, sprung: e.sprung, expected: e.expected, leaks: e.pageScriptLeaks })); break;
      case 'finished': console.log(ts, 'DONE', String(e.summary).slice(0, 200)); break;
      case 'drained': console.log(ts, 'DRAINED', e.containerId, e.ms + 'ms'); break;
      case 'error': case 'warning': console.log(ts, e.type.toUpperCase(), e.message); break;
      case 'status': if (['failed', 'done', 'stopped'].includes(e.status)) console.log(ts, 'STATUS', e.status, e.message || ''); break;
    }
  }
}
