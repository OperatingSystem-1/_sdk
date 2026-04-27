import type { Transport } from '../transport.js';
import type { Agent, Task, ColonyMember, ColonyStatus, HireAgentRequest } from '../types/index.js';
import { AgentsAPI } from './agents.js';
import { TasksAPI } from './tasks.js';

export class ColonyAPI {
  constructor(
    private transport: Transport,
    private agents: AgentsAPI,
    private tasks: TasksAPI,
  ) {}

  async status(officeId: string, leaderName?: string): Promise<ColonyMember[]> {
    const allAgents = await this.agents.list(officeId);
    const allTasks = await this.tasks.list(officeId, { limit: 200 });
    const agents = leaderName
      ? allAgents.filter((a: any) => a.spawnedBy === leaderName || a.spawned_by === leaderName)
      : allAgents;
    return agents.map(a => {
      const agentTasks = allTasks.filter((t: any) => t.assignedAgent === a.name || t.assigned_agent === a.name);
      return {
        name: a.name,
        phase: a.status?.phase || 'unknown',
        ready: a.status?.ready || false,
        tasks: agentTasks.map(t => ({ id: t.id, title: t.title, status: t.status, result: t.resultSummary || (t as any).result_summary })),
      };
    });
  }

  async check(officeId: string, leaderName?: string): Promise<ColonyStatus> {
    const members = await this.status(officeId, leaderName);
    if (!members.length) return { allDone: true, summary: 'No colony members.', members: [], pending: 0, failed: 0, done: 0 };
    let pending = 0, failed = 0, done = 0;
    for (const m of members) for (const t of m.tasks) {
      if (t.status === 'done') done++; else if (t.status === 'failed') failed++; else pending++;
    }
    return { allDone: pending === 0, summary: `Colony: ${members.length} agents, ${done} done, ${pending} pending, ${failed} failed.`, members, pending, failed, done };
  }

  async cleanup(officeId: string, leaderName?: string): Promise<string[]> {
    const members = await this.status(officeId, leaderName);
    const fired: string[] = [];
    for (const m of members) {
      const allDone = m.tasks.length > 0 && m.tasks.every(t => t.status === 'done' || t.status === 'failed');
      if (allDone || m.tasks.length === 0) {
        try { await this.agents.fire(officeId, m.name); fired.push(m.name); } catch { /* gone */ }
      }
    }
    return fired;
  }

  async monitor(officeId: string, opts?: { leaderName?: string; intervalMs?: number; timeoutMs?: number; onUpdate?: (s: ColonyStatus) => void }): Promise<ColonyStatus> {
    const interval = opts?.intervalMs || 30000;
    const timeout = opts?.timeoutMs || 600000;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const status = await this.check(officeId, opts?.leaderName);
      opts?.onUpdate?.(status);
      if (status.allDone) return status;
      await new Promise(r => setTimeout(r, interval));
    }
    return this.check(officeId, opts?.leaderName);
  }
}
