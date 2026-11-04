// A run is one errand executed by the agent in its own tub. Every step is an event that is
// streamed to the UI (Server-Sent Events) and saved to disk as an audit trail.
import { EventEmitter } from 'node:events';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { config, type Mode } from './config.ts';
import type { TaskDef, Outcome } from './tasks.ts';

export interface RunEvent { seq: number; at: number; type: string; [k: string]: any }
export type RunStatus = 'starting' | 'running' | 'awaiting_approval' | 'done' | 'failed' | 'stopped';
export interface ApprovalRequest { id: string; step: number; summary: string; action: any; reasons: string[]; scores?: any; target?: string; destination?: string; values?: any }

export class Run extends EventEmitter {
  id = randomBytes(5).toString('hex');
  token = randomBytes(12).toString('hex');
  status: RunStatus = 'starting';
  events: RunEvent[] = [];
  startedAt = Date.now();
  endedAt?: number;
  outcome?: Outcome;
  stopRequested = false;
  frames = 0;
  /** When set (Capybara Test), approvals are answered by this policy instead of a person. */
  autoApprove?: (req: ApprovalRequest) => boolean;
  agentModel?: string;
  private pending = new Map<string, (ok: boolean) => void>();

  constructor(public task: TaskDef, public mode: Mode, public source: 'ui' | 'eval' = 'ui') {
    super();
    this.setMaxListeners(100);
  }

  get dir() { return path.join(config.dataDir, 'runs', this.id); }

  push(type: string, data: Record<string, any> = {}) {
    const ev: RunEvent = { seq: this.events.length, at: Date.now(), type, ...data };
    this.events.push(ev);
    this.emit('event', ev);
    return ev;
  }

  setStatus(status: RunStatus, message?: string) {
    this.status = status;
    this.push('status', { status, message });
  }

  async requestApproval(req: Omit<ApprovalRequest, 'id'>): Promise<boolean> {
    const id = randomBytes(4).toString('hex');
    const full = { ...req, id };
    if (this.autoApprove) {
      const ok = this.autoApprove(full);
      this.push('approval', { ...full, auto: true });
      this.push('approval_resolved', { id, approved: ok, by: 'policy' });
      return ok;
    }
    this.setStatus('awaiting_approval', 'Capy needs a human');
    this.push('approval', full);
    const ok = await new Promise<boolean>((resolve) => {
      this.pending.set(id, resolve);
      // If nobody answers within 10 minutes, the safe answer is no.
      setTimeout(() => this.resolveApproval(id, false, 'timeout'), 10 * 60_000).unref();
    });
    this.setStatus('running');
    return ok;
  }

  resolveApproval(id: string, approved: boolean, by: 'human' | 'timeout' = 'human') {
    const r = this.pending.get(id);
    if (!r) return false;
    this.pending.delete(id);
    this.push('approval_resolved', { id, approved, by });
    r(approved);
    return true;
  }

  stop() {
    this.stopRequested = true;
    for (const id of [...this.pending.keys()]) this.resolveApproval(id, false);
  }

  summary() {
    return {
      id: this.id, taskId: this.task.id, title: this.task.title, goal: this.task.goal, traps: this.task.traps, trapLabel: this.task.trapLabel,
      mode: this.mode, agentModel: this.agentModel, status: this.status, startedAt: this.startedAt, endedAt: this.endedAt, outcome: this.outcome, source: this.source, frames: this.frames,
    };
  }

  snapshot() { return { ...this.summary(), events: this.events }; }

  save() {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(path.join(this.dir, 'run.json'), JSON.stringify(this.snapshot()));
  }
}

export const runs = new Map<string, Run>();

export function loadRun(id: string) {
  if (!/^[a-f0-9]{10}$/.test(id)) return null;
  const f = path.join(config.dataDir, 'runs', id, 'run.json');
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; }
}

export function recentRuns(limit = 30) {
  const live = [...runs.values()].map((r) => r.summary());
  const dir = path.join(config.dataDir, 'runs');
  const saved = existsSync(dir)
    ? readdirSync(dir).filter((d) => !runs.has(d)).map((d) => loadRun(d)).filter(Boolean).map(({ events, ...s }: any) => s)
    : [];
  return [...live, ...saved].sort((a, b) => b.startedAt - a.startedAt).slice(0, limit);
}
