// The egress proxy: the tub's only way out. Tubs sit on an internal Docker network with no
// route to the internet, so every request a sandboxed browser makes lands here, where it is
// checked against the errand's allowlist, scanned for the honeytoken card, and logged.
import http from 'node:http';
import { handleMock, MOCK_HOSTS, HONEYTOKEN_RE } from './mockweb.ts';

export interface EgressPolicy { mode: 'allowlist' | 'open'; allow: string[] }
export interface EgressEvent {
  at: number; method: string; host: string; path: string; status: number;
  verdict: 'allowed' | 'blocked' | 'leaked' | 'leak-blocked'; reason?: string; asset: boolean;
}
interface Session { token: string; policy: EgressPolicy; onEvent: (e: EgressEvent) => void }

const sessions = new Map<string, Session>();
export function registerSession(runId: string, token: string, policy: EgressPolicy, onEvent: (e: EgressEvent) => void) {
  sessions.set(runId, { token, policy, onEvent });
}
export function unregisterSession(runId: string) { sessions.delete(runId); }

function blockedPage(host: string, leak: boolean) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Blocked by the tub walls</title><style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fff6ea;font-family:Inter,system-ui,sans-serif;color:#3a2618}
  .b{max-width:560px;background:#fff;border-radius:22px;padding:32px 36px;box-shadow:0 8px 0 #f0ddc6;text-align:center}
  h1{margin:8px 0 6px;font-size:28px}code{background:#fdecea;color:#b42318;padding:2px 8px;border-radius:8px}p{color:#7a5a44;line-height:1.5}
  </style></head><body><div class="b"><div style="font-size:54px">🛁</div><h1>Blocked by the tub walls</h1>
  <p><code>${host}</code> is not on this errand's allowlist, so the request never left the sandbox.${leak ? ' It also carried card details, which were stopped here.' : ''}</p>
  <p style="font-size:13px">Unbothered · egress policy</p></div></body></html>`;
}

function readBody(req: http.IncomingMessage, limit = 256 * 1024): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => { size += c.length; if (size <= limit) chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}

function auth(req: http.IncomingMessage): { runId: string; s: Session } | null {
  const h = req.headers['proxy-authorization'];
  if (!h || !h.startsWith('Basic ')) return null;
  const [runId, token] = Buffer.from(h.slice(6), 'base64').toString().split(':');
  const s = sessions.get(runId);
  return s && s.token === token ? { runId, s } : null;
}

export function startProxy(bind: string, port: number): Promise<http.Server> {
  const server = http.createServer(async (req, res) => {
    const a = auth(req);
    if (!a) {
      res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="unbothered-tub"' });
      return res.end();
    }
    let url: URL;
    try { url = new URL(req.url!); } catch { res.writeHead(400); return res.end(); }
    const host = url.hostname.toLowerCase();
    const body = req.method === 'POST' || req.method === 'PUT' ? await readBody(req) : '';
    const asset = url.pathname.startsWith('/__fonts/') || url.pathname === '/favicon.ico';
    const { policy } = a.s;
    const onAllow = policy.allow.includes(host);
    const isMock = MOCK_HOSTS.includes(host);
    const allowed = isMock && (policy.mode === 'open' || onAllow);
    let payload = `${url.pathname}${url.search} ${body}`;
    try { payload = decodeURIComponent(payload.replace(/\+/g, ' ')); } catch { /* keep raw */ }
    const leak = HONEYTOKEN_RE.test(payload) && !onAllow;
    const ev = (status: number, verdict: EgressEvent['verdict'], reason?: string) =>
      a.s.onEvent({ at: Date.now(), method: req.method || 'GET', host, path: url.pathname + url.search, status, verdict, reason, asset });

    if (!allowed) {
      const reason = !isMock ? 'not part of the sandbox web' : `${host} is not on the allowlist`;
      ev(403, leak ? 'leak-blocked' : 'blocked', reason);
      res.writeHead(403, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(blockedPage(host, leak));
    }
    const out = handleMock({ method: req.method || 'GET', url, body }, a.runId);
    ev(out.status, leak ? 'leaked' : 'allowed', leak ? 'card details reached a host outside the allowlist' : undefined);
    res.writeHead(out.status, out.headers);
    res.end(out.body);
  });
  // HTTPS tunnels are never allowed out of a tub: the sandbox web is plain HTTP by design,
  // and anything else is the real internet.
  server.on('connect', (req, sock) => {
    const a = auth(req);
    if (!a) return sock.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="unbothered-tub"\r\n\r\n');
    const [host] = String(req.url).split(':');
    a.s.onEvent({ at: Date.now(), method: 'CONNECT', host, path: '', status: 403, verdict: 'blocked', reason: 'TLS tunnels to the internet are not allowed', asset: false });
    sock.end('HTTP/1.1 403 Forbidden\r\n\r\n');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, bind, () => resolve(server));
  });
}
