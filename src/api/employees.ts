import type { Transport } from '../transport.js';
import type {
  Employee,
  HireRequest,
  UpdateEmployeeRequest,
  PromoteRequest,
  SkillsRequest,
  EmployeeAction,
  EmployeeLogs,
  ActivityEvent,
  ActivityQuery,
  ChatSession,
} from '../types/index.js';

function base(officeId: string) {
  return `/api/v1/offices/${officeId}/employees`;
}

export class EmployeesAPI {
  constructor(private transport: Transport) {}

  async hire(officeId: string, req: HireRequest): Promise<Employee> {
    return this.transport.post<Employee>(base(officeId), req);
  }

  async list(officeId: string): Promise<Employee[]> {
    return this.transport.get<Employee[]>(base(officeId));
  }

  async get(officeId: string, name: string): Promise<Employee> {
    return this.transport.get<Employee>(`${base(officeId)}/${name}`);
  }

  async update(officeId: string, name: string, req: UpdateEmployeeRequest): Promise<Employee> {
    return this.transport.patch<Employee>(`${base(officeId)}/${name}`, req);
  }

  async delete(officeId: string, name: string): Promise<void> {
    await this.transport.delete(`${base(officeId)}/${name}`);
  }

  async logs(officeId: string, name: string, opts?: { tail?: number }): Promise<EmployeeLogs> {
    return this.transport.get<EmployeeLogs>(`${base(officeId)}/${name}/logs`, {
      tail: opts?.tail,
    });
  }

  async activity(officeId: string, name: string, query?: ActivityQuery): Promise<ActivityEvent[]> {
    return this.transport.get<ActivityEvent[]>(`${base(officeId)}/${name}/activity`, query as Record<string, string | number>);
  }

  async presence(officeId: string, name: string): Promise<{ online: boolean; last_seen?: string }> {
    return this.transport.get(`${base(officeId)}/${name}/presence`);
  }

  async lastError(officeId: string, name: string): Promise<{ error?: string; timestamp?: string }> {
    return this.transport.get(`${base(officeId)}/${name}/last-error`);
  }

  async action(officeId: string, name: string, action: EmployeeAction): Promise<unknown> {
    return this.transport.post(`${base(officeId)}/${name}/action`, action);
  }

  async promote(officeId: string, name: string, req: PromoteRequest): Promise<Employee> {
    return this.transport.post<Employee>(`${base(officeId)}/${name}/promote`, req);
  }

  async setSkills(officeId: string, name: string, req: SkillsRequest): Promise<Employee> {
    return this.transport.post<Employee>(`${base(officeId)}/${name}/skills`, req);
  }

  async logStatusEvent(officeId: string, name: string, event: { type: string; message?: string }): Promise<void> {
    await this.transport.post(`${base(officeId)}/${name}/events`, event);
  }

  async archive(officeId: string, name: string): Promise<void> {
    await this.transport.post(`${base(officeId)}/${name}/archive`);
  }

  async restore(officeId: string, name: string): Promise<void> {
    await this.transport.post(`${base(officeId)}/${name}/restore`);
  }

  async rotateCredentials(officeId: string, name: string): Promise<void> {
    await this.transport.post(`${base(officeId)}/${name}/credentials/rotate`);
  }

  async lifecycle(officeId: string, name: string, action: string): Promise<void> {
    await this.transport.post(`${base(officeId)}/${name}/lifecycle`, { action });
  }

  async events(officeId: string, name: string): Promise<unknown[]> {
    return this.transport.get<unknown[]>(`${base(officeId)}/${name}/events`);
  }

  async chatSessions(officeId: string, name: string): Promise<ChatSession[]> {
    return this.transport.get<ChatSession[]>(`${base(officeId)}/${name}/chat-sessions`);
  }
}
