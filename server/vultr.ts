// Thin client for Vultr Serverless Inference.
//  - chat():   OpenAI-compatible /chat/completions with tool calling (the agent's brain)
//  - decide(): /systemone decision models (Capy, the gate). They return probabilities
//              for typed yes/no, choice and score questions in one cheap call.
import { config } from './config.ts';

export interface ToolCall { id: string; name: string; args: any }
export interface ChatResult { content: string; toolCalls: ToolCall[]; usage: any; ms: number; model: string }

async function post(path: string, body: unknown, headers: Record<string, string> = {}, timeoutMs = 90_000) {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(config.inferenceBase + path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.inferenceKey}`, 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`Vultr inference ${res.status}: ${text.slice(0, 200)}`);
        await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
        continue;
      }
      if (!res.ok) throw new Error(`Vultr inference ${res.status}: ${text.slice(0, 300)}`);
      return JSON.parse(text);
    } catch (e: any) {
      lastErr = e;
      if (e?.message?.startsWith('Vultr inference 4')) throw e;
      await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

export async function chat(opts: {
  messages: any[];
  tools?: any[];
  model?: string;
  toolChoice?: 'auto' | 'required' | 'none';
  maxTokens?: number;
  temperature?: number;
}): Promise<ChatResult> {
  const model = opts.model ?? config.agentModel;
  const t0 = Date.now();
  const r = await post('/chat/completions', {
    model,
    messages: opts.messages,
    tools: opts.tools,
    tool_choice: opts.tools ? opts.toolChoice ?? 'required' : undefined,
    max_tokens: opts.maxTokens ?? 700,
    temperature: opts.temperature ?? 0.2,
    reasoning_effort: 'low',
  });
  const msg = r.choices?.[0]?.message ?? {};
  const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((c: any) => {
    let args: any = {};
    try { args = JSON.parse(c.function?.arguments || '{}'); } catch { args = { _raw: c.function?.arguments }; }
    return { id: c.id, name: c.function?.name, args };
  });
  return { content: msg.content ?? '', toolCalls, usage: r.usage, ms: Date.now() - t0, model };
}

export type Question =
  | { type: 'noul'; instructions: string; criteria?: { true?: string; false?: string } }
  | { type: 'choice'; instructions: string; criteria: Record<string, string | null> }
  | { type: 'score'; instructions: string; criteria: (string | null)[] };

export interface DecisionAnswer { type: string; noul?: number; choice?: string; score?: number; probabilities?: Record<string, number>; confidence?: number }

export async function decide(opts: {
  state: unknown;
  questions: Record<string, Question>;
  model?: string;
  images?: Record<string, { data_base64: string; format: 'png' | 'jpeg' }>;
}): Promise<{ answers: Record<string, DecisionAnswer>; ms: number; model: string; tokens: number }> {
  const model = opts.model ?? config.gateModel;
  const t0 = Date.now();
  const body: any = { model, state: opts.state, questions: opts.questions };
  const headers: Record<string, string> = {};
  if (opts.images) {
    body.assets = Object.fromEntries(Object.entries(opts.images).map(([k, v]) => [k, { type: 'image', ...v }]));
    headers['TypeSafe-Danger-Zone-Images'] = 'true';
  }
  const r = await post('/systemone', body, headers, 30_000);
  return { answers: r.answers ?? {}, ms: Date.now() - t0, model, tokens: r.usage?.input_tokens ?? 0 };
}
