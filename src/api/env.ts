import type { Transport } from '../transport.js';
import type { EnvVar } from '../types/index.js';

function base(officeId: string) {
  return `/api/v1/offices/${officeId}`;
}

export class EnvAPI {
  constructor(private transport: Transport) {}

  /** List env var keys (without values). */
  async list(officeId: string): Promise<EnvVar[]> {
    return this.transport.get<EnvVar[]>(`${base(officeId)}/env`);
  }

  /** List env vars with their values. */
  async listValues(officeId: string): Promise<EnvVar[]> {
    return this.transport.get<EnvVar[]>(`${base(officeId)}/env/values`);
  }

  /** Set an env var (office-scoped or agent-scoped). */
  async set(
    officeId: string,
    key: string,
    value: string,
    opts?: { scope?: 'office' | 'agent'; agentName?: string },
  ): Promise<void> {
    await this.transport.put(`${base(officeId)}/env`, {
      key,
      value,
      scope: opts?.scope ?? 'office',
      agentName: opts?.agentName,
    });
  }

  /** Delete an env var. */
  async delete(officeId: string, key: string): Promise<void> {
    await this.transport.delete(`${base(officeId)}/env/${key}`);
  }

  /** Get env vars for a specific agent. */
  async getAgentEnv(officeId: string, agentName: string): Promise<EnvVar[]> {
    return this.transport.get<EnvVar[]>(
      `${base(officeId)}/employees/${agentName}/env`,
    );
  }
}
