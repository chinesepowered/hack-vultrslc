// Unbothered control plane: serves the UI and API, runs agents, and hosts the egress proxy.
import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './config.ts';
import { initSandbox, sandboxDriver } from './sandbox.ts';
import { startProxy } from './proxy.ts';
import { runAgent, setProxyHost } from './agent.ts';
import { Run, runs, loadRun, recentRuns } from './runs.ts';
import { HERO, SUITE, getTask, TRAP_INFO, ALLOW } from './tasks.ts';
import { startEval, latestEval } from './eval.ts';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));

const recentStarts: number[] = [];
const activeRuns = () => [...runs.values()].filter((r) => !r.endedAt && r.source === 'ui').length;
const isAdmin = (req: express.Request) => !!config.adminToken && req.get('x-admin-token') === config.adminToken;

app.get('/api/health', (_req, res) => res.json({ ok: true, driver: sandboxDriver(), runs: runs.size }));

app.get('/api/config', (_req, res) => {
  res.json({
    agentModel: config.agentModel, gateModel: config.gateModel, verifyModel: config.verifyModel,
    driver: sandboxDriver(), runtime: sandboxDriver() === 'docker' ? config.tubRuntime : 'none', region: config.regionLabel,
    allow: ALLOW, hero: HERO, suite: SUITE.map(({ id, title, trapLabel, target }) => ({ id, title, trapLabel, target })), trapInfo: TRAP_INFO,
  });
});

app.post('/api/runs', (req, res) => {
  const task = getTask(String(req.body?.taskId ?? 'hero'));
  if (!task) return res.status(404).json({ error: 'unknown task' });
  const mode = req.body?.mode === 'baseline' ? 'baseline' : 'protected';
  const now = Date.now();
  while (recentStarts.length && now - recentStarts[0] > 3600e3) recentStarts.shift();
  if (!isAdmin(req)) {
    if (activeRuns() >= config.maxConcurrentRuns) return res.status(429).json({ error: 'All tubs are busy. Try again in a minute.' });
    if (recentStarts.length >= config.runsPerHour) return res.status(429).json({ error: 'Hourly demo limit reached. Try again later.' });
  }
  recentStarts.push(now);
  const run = new Run(task, mode);
  if (isAdmin(req) && typeof req.body?.agentModel === 'string') run.agentModel = req.body.agentModel;
  runs.set(run.id, run);
  runAgent(run).finally(() => setTimeout(() => runs.delete(run.id), 20 * 60e3).unref());
  res.json({ id: run.id });
});

app.get('/api/runs', (_req, res) => res.json(recentRuns().filter((r: any) => r.source !== 'eval')));

app.get('/api/runs/:id', (req, res) => {
  const live = runs.get(req.params.id);
  const snap = live ? live.snapshot() : loadRun(req.params.id);
  return snap ? res.json(snap) : res.status(404).json({ error: 'not found' });
});

app.get('/api/runs/:id/stream', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const send = (ev: unknown) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
  const from = Number(req.query.from ?? 0) || 0;
  const run = runs.get(req.params.id);
  if (!run) {
    const saved = loadRun(req.params.id);
    saved?.events.slice(from).forEach(send);
    res.write('event: end\ndata: {}\n\n');
    return res.end();
  }
  run.events.slice(from).forEach(send);
  const on = (ev: unknown) => send(ev);
  run.on('event', on);
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
  req.on('close', () => { run.off('event', on); clearInterval(ping); });
});

app.post('/api/runs/:id/approval', (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'not found' });
  const ok = run.resolveApproval(String(req.body?.approvalId), !!req.body?.approve);
  res.json({ ok });
});

app.post('/api/runs/:id/stop', (req, res) => {
  runs.get(req.params.id)?.stop();
  res.json({ ok: true });
});

app.get('/api/runs/:id/frames/:n', (req, res) => {
  if (!/^[a-f0-9]{10}$/.test(req.params.id) || !/^\d+$/.test(req.params.n)) return res.status(400).end();
  const f = path.resolve(config.dataDir, 'runs', req.params.id, `f${req.params.n}.jpg`);
  if (!existsSync(f)) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=86400, immutable');
  res.sendFile(f);
});

app.get('/api/eval', (_req, res) => res.json(latestEval()));
app.post('/api/eval', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'admin only' });
  const concurrency = Number(req.body?.concurrency ?? 2);
  const ids: string[] | undefined = req.body?.tasks;
  const tasks = ids ? SUITE.filter((t) => ids.includes(t.id)) : undefined;
  res.json(startEval({ concurrency, tasks, modes: req.body?.modes }));
});

app.get('/api/admin/diag', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'admin only' });
  const sh = promisify(execFile);
  const run = (cmd: string, args: string[]) => sh(cmd, args, { timeout: 20_000 }).then((r) => r.stdout.trim()).catch((e) => `ERR ${e.message}`);
  res.json({
    driver: sandboxDriver(), runs: [...runs.values()].map((r) => r.summary()),
    docker: await run('docker', ['ps', '--format', '{{.Names}} {{.Status}} {{.Image}}']),
    runsc: await run('runsc', ['--version']),
    git: await run('git', ['log', '-1', '--format=%h %s']),
    setupLog: await run('tail', ['-n', '25', '/var/log/unbothered-setup.log']),
    deployLog: await run('journalctl', ['-u', 'unbothered-deploy', '-n', '10', '--no-pager']),
    uptime: process.uptime(),
  });
});

// The built UI (web/dist), with client-side routing fallback.
const dist = path.resolve('web/dist');
app.use(express.static(dist, { index: false, maxAge: '1h' }));
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  const index = path.join(dist, 'index.html');
  return existsSync(index) ? res.sendFile(index) : res.status(503).send('UI not built yet: run npm run build');
});

const sb = await initSandbox();
setProxyHost(sb.proxyHostForTubs);
await startProxy(sb.proxyBind, config.proxyPort);
app.listen(config.port, config.host, () => {
  console.log(`unbothered on http://${config.host}:${config.port} · sandbox=${sb.driver} · proxy=${sb.proxyBind}:${config.proxyPort}`);
  console.log(`models: agent=${config.agentModel} gate=${config.gateModel} verify=${config.verifyModel}`);
});
