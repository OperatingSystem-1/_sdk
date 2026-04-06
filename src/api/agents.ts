import type { Transport } from '../transport.js';
import type {
  Agent,
  HireAgentRequest,
  UpdateAgentRequest,
  PromoteRequest,
  SkillsRequest,
  AgentLogs,
  ActivityEvent,
  ActivityQuery,
} from '../types/index.js';

function base(officeId: string) {
  return `/api/v1/offices/${officeId}/employees`;
}

export class AgentsAPI {
  constructor(private transport: Transport) {}

  async hire(officeId: string, req: HireAgentRequest): Promise<Agent> {
    return this.transport.post<Agent>(base(officeId), req);
  }

  async list(officeId: string): Promise<Agent[]> {
    return this.transport.get<Agent[]>(base(officeId));
  }

  async get(officeId: string, name: string): Promise<Agent> {
    return this.transport.get<Agent>(`${base(officeId)}/${name}`);
  }

  async update(officeId: string, name: string, req: UpdateAgentRequest): Promise<Agent> {
    return this.transport.patch<Agent>(`${base(officeId)}/${name}`, req);
  }

  async fire(officeId: string, name: string): Promise<void> {
    await this.transport.delete(`${base(officeId)}/${name}`);
  }

  async logs(officeId: string, name: string, opts?: { tail?: number }): Promise<AgentLogs> {
    return this.transport.get<AgentLogs>(`${base(officeId)}/${name}/logs`, {
      tail: opts?.tail,
    });
  }

  async activity(officeId: string, name: string, query?: ActivityQuery): Promise<ActivityEvent[]> {
    return this.transport.get<ActivityEvent[]>(
      `${base(officeId)}/${name}/activity`,
      query as Record<string, string | number>,
    );
  }

  async promote(officeId: string, name: string, req: PromoteRequest): Promise<Agent> {
    return this.transport.post<Agent>(`${base(officeId)}/${name}/promote`, req);
  }

  async setSkills(officeId: string, name: string, req: SkillsRequest): Promise<Agent> {
    return this.transport.post<Agent>(`${base(officeId)}/${name}/skills`, req);
  }

  async archive(officeId: string, name: string): Promise<void> {
    await this.transport.post(`${base(officeId)}/${name}/archive`);
  }

  async restore(officeId: string, name: string): Promise<void> {
    await this.transport.post(`${base(officeId)}/${name}/restore`);
  }

  async presence(officeId: string, name: string): Promise<{ online: boolean; last_seen?: string }> {
    return this.transport.get(`${base(officeId)}/${name}/presence`);
  }

  /** Get the last error for an agent. */
  async lastError(officeId: string, name: string): Promise<{ error?: string; timestamp?: string }> {
    return this.transport.get(`${base(officeId)}/${name}/last-error`);
  }

  /** Stop, start, or restart an agent pod. */
  async lifecycle(officeId: string, name: string, action: 'stop' | 'start' | 'restart'): Promise<void> {
    await this.transport.post(`${base(officeId)}/${name}/lifecycle`, { action });
  }

  /** Rotate agent credentials (signing key + IAM). */
  async rotateCredentials(officeId: string, name: string): Promise<void> {
    await this.transport.post(`${base(officeId)}/${name}/credentials/rotate`);
  }
}
