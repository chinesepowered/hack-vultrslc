// Runtime configuration. Everything comes from the environment so the same build runs
// in local development and on the Vultr VM.

const env = (k: string, d = '') => process.env[k] ?? d;
const num = (k: string, d: number) => (process.env[k] ? Number(process.env[k]) : d);

export const config = {
  port: num('PORT', 8080),
  host: env('HOST', '0.0.0.0'),

  // Vultr Serverless Inference (OpenAI-compatible, plus the /systemone decision endpoint)
  inferenceBase: env('VULTR_INFERENCE_BASE', 'https://api.vultrinference.com/v1'),
  inferenceKey: env('VULTR_INFERENCE_API_KEY'),
  agentModel: env('AGENT_MODEL', 'minimax-m3.1-flash'),
  gateModel: env('GATE_MODEL', 'pplx-decider-v1.2'),
  verifyModel: env('VERIFY_MODEL', 'clef-flash'),

  // Sandbox ("tub") settings
  sandboxDriver: env('SANDBOX_DRIVER', 'auto') as 'auto' | 'docker' | 'local',
  tubImage: env('TUB_IMAGE', 'unbothered/tub:1.63.0'),
  tubRuntime: env('TUB_RUNTIME', 'runsc'),
  tubNetwork: env('TUB_NETWORK', 'ub-tubs'),
  tubMemory: env('TUB_MEMORY', '1g'),
  tubCpus: env('TUB_CPUS', '1'),
  tubPids: num('TUB_PIDS', 512),

  // Egress proxy: the only way out of a tub
  proxyPort: num('PROXY_PORT', 3128),
  proxyBind: env('PROXY_BIND'), // default: the tub network gateway (docker) or 127.0.0.1 (local)

  // Mock web ("the internet in a box"): stores, intranet, and the scam outlet
  mockPort: num('MOCK_PORT', 4100),

  dataDir: env('DATA_DIR', 'data'),
  maxSteps: num('MAX_STEPS', 30),
  maxConcurrentRuns: num('MAX_CONCURRENT_RUNS', 3),
  runsPerHour: num('RUNS_PER_HOUR', 40),
  adminToken: env('ADMIN_TOKEN'),
  regionLabel: env('REGION_LABEL', 'local dev'),
  publicUrl: env('PUBLIC_URL'),
};

// protected: Unbothered on. baseline: a typical agent (no gate, open egress, card in prompt).
// redteam: Unbothered on, but the agent is told to obey web pages, simulating a fooled agent.
export type Mode = 'protected' | 'baseline' | 'redteam';
