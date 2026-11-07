// Tub drivers. A tub is one disposable browser sandbox per errand.
//
//  docker: a gVisor (runsc) container on an internal network with no internet route,
//          read-only root, no Linux capabilities, CPU/memory/PID caps and no secrets.
//          The control plane drives its Chromium remotely; the tub is destroyed afterwards.
//  local:  plain local Chromium for development without Docker (no isolation, labelled so).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, type Browser } from 'playwright';
import { config } from './config.ts';

const sh = promisify(execFile);
const docker = async (...args: string[]) => (await sh('docker', args, { timeout: 60_000, maxBuffer: 4 << 20 })).stdout.trim();

export interface TubInfo {
  driver: 'docker' | 'local';
  runtime: string;
  kernel: string;
  image: string;
  containerId?: string;
  name?: string;
  ip?: string;
  memory: string;
  cpus: string;
  pids: number | null;
  readOnlyRoot: boolean;
  capabilities: string;
  network: string;
  internetRoute: boolean;
  envKeys: string[];
  secretsInside: number;
  bootMs: number;
}
export interface Tub { browser: Browser; info: TubInfo; destroy(): Promise<void> }

let resolvedDriver: 'docker' | 'local' | null = null;
let gateway = '';

// Hosts with UFW active (Vultr's Ubuntu images ship that way) drop traffic from the tub
// network to the host, which is where the egress proxy listens. Open exactly that port, for
// exactly the tub subnet. Without ufw, or without root, there is nothing to do.
async function openProxyPortForTubs(gw: string) {
  try {
    if (!/Status: active/.test((await sh('ufw', ['status'], { timeout: 15_000 })).stdout)) return;
    const subnet = await docker('network', 'inspect', config.tubNetwork, '--format', '{{range .IPAM.Config}}{{.Subnet}}{{end}}');
    await sh('ufw', ['allow', 'from', subnet, 'to', gw, 'port', String(config.proxyPort), 'proto', 'tcp', 'comment', 'unbothered tubs to egress proxy'], { timeout: 15_000 });
    console.log(`firewall: tubs (${subnet}) may reach the egress proxy at ${gw}:${config.proxyPort}`);
  } catch { /* no ufw here, or not root */ }
}

export async function initSandbox(): Promise<{ driver: 'docker' | 'local'; proxyBind: string; proxyHostForTubs: string }> {
  if (config.sandboxDriver !== 'local') {
    try {
      await docker('info', '--format', '{{.ServerVersion}}');
      await docker('image', 'inspect', config.tubImage, '--format', '{{.Id}}');
      try {
        await docker('network', 'inspect', config.tubNetwork);
      } catch {
        await docker('network', 'create', '--internal', '--label', 'unbothered=tubs', config.tubNetwork);
      }
      gateway = await docker('network', 'inspect', config.tubNetwork, '--format', '{{range .IPAM.Config}}{{.Gateway}}{{end}}');
      await openProxyPortForTubs(gateway);
      const stale = await docker('ps', '-aq', '--filter', 'label=unbothered=tub');
      if (stale) await docker('rm', '-f', ...stale.split(/\s+/));
      resolvedDriver = 'docker';
    } catch (e: any) {
      if (config.sandboxDriver === 'docker') throw new Error(`docker sandbox unavailable: ${e.message}`);
      resolvedDriver = 'local';
    }
  } else resolvedDriver = 'local';
  const proxyHost = resolvedDriver === 'docker' ? gateway : '127.0.0.1';
  return { driver: resolvedDriver, proxyBind: config.proxyBind || proxyHost, proxyHostForTubs: proxyHost };
}

export const sandboxDriver = () => resolvedDriver ?? 'local';

export async function createTub(runId: string): Promise<Tub> {
  const t0 = Date.now();
  if (sandboxDriver() === 'local') {
    const browser = await chromium.launch({ headless: true });
    return {
      browser,
      info: {
        driver: 'local', runtime: 'none (dev mode)', kernel: 'host', image: 'local chromium', memory: 'unlimited', cpus: 'unlimited', pids: null,
        readOnlyRoot: false, capabilities: 'host user', network: 'host via proxy', internetRoute: true, envKeys: [], secretsInside: 0, bootMs: Date.now() - t0,
      },
      destroy: async () => { await browser.close().catch(() => {}); },
    };
  }

  const name = `ub-tub-${runId}`;
  const args = [
    'run', '-d', '--name', name,
    '--runtime', config.tubRuntime,
    '--network', config.tubNetwork,
    '--memory', config.tubMemory, '--cpus', config.tubCpus, '--pids-limit', String(config.tubPids),
    '--read-only', '--tmpfs', '/tmp:rw,size=512m',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--label', 'unbothered=tub', '--label', `unbothered.run=${runId}`,
    config.tubImage,
  ];
  const id = await docker(...args);
  try {
    let ready = false;
    for (let i = 0; i < 80 && !ready; i++) {
      const logs = (await sh('docker', ['logs', id], { timeout: 10_000 })).stdout;
      ready = logs.includes('TUB_READY');
      if (!ready) await new Promise((r) => setTimeout(r, 250));
    }
    if (!ready) throw new Error('tub did not become ready');
    const ip = await docker('inspect', id, '--format', `{{(index .NetworkSettings.Networks "${config.tubNetwork}").IPAddress}}`);
    const [kernel, envKeys] = await Promise.all([
      docker('exec', id, 'uname', '-sr').catch(() => 'unknown'),
      docker('exec', id, 'sh', '-c', 'env | cut -d= -f1').then((s) => s.split('\n').filter(Boolean)).catch(() => []),
    ]);
    const browser = await chromium.connect(`ws://${ip}:3000/tub`, { timeout: 20_000 });
    const secretish = envKeys.filter((k) => /key|token|secret|pass|auth/i.test(k));
    return {
      browser,
      info: {
        driver: 'docker', runtime: config.tubRuntime === 'runsc' ? 'gVisor (runsc)' : config.tubRuntime, kernel, image: config.tubImage,
        containerId: id.slice(0, 12), name, ip, memory: config.tubMemory, cpus: config.tubCpus, pids: config.tubPids,
        readOnlyRoot: true, capabilities: 'all dropped', network: `${config.tubNetwork} (internal)`, internetRoute: false,
        envKeys, secretsInside: secretish.length, bootMs: Date.now() - t0,
      },
      destroy: async () => {
        await browser.close().catch(() => {});
        await docker('rm', '-f', id).catch(() => {});
      },
    };
  } catch (e) {
    await docker('rm', '-f', id).catch(() => {});
    throw e;
  }
}

export async function tubExists(containerId?: string) {
  if (!containerId || sandboxDriver() !== 'docker') return false;
  return docker('ps', '-aq', '--filter', `id=${containerId}`).then((s) => !!s).catch(() => false);
}
