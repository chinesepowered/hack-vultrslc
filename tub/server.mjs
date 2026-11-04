// Runs inside the tub. Starts a headless Chromium behind a Playwright browser server.
// The control plane connects to ws://<tub>:3000/tub and drives the browser remotely.
// Network egress is decided outside the tub: the only route out is the egress proxy.
import { chromium } from 'playwright';

const server = await chromium.launchServer({
  host: '0.0.0.0',
  port: 3000,
  wsPath: '/tub',
  headless: true,
  // gVisor is the sandbox boundary; Chromium's own setuid sandbox can't run under it.
  chromiumSandbox: false,
  args: [
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-domain-reliability',
    '--disable-sync',
    '--metrics-recording-only',
    '--disable-features=Translate,OptimizationHints,MediaRouter',
  ],
});

console.log(`TUB_READY ${server.wsEndpoint()}`);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await server.close().catch(() => {});
    process.exit(0);
  });
}
