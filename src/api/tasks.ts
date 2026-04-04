import type { Transport } from '../transport.js';
import type { Task, CreateTaskRequest, TaskStats } from '../types/index.js';

function base(officeId: string) {
  return `/api/v1/offices/${officeId}/tasks`;
}

export class TasksAPI {
  constructor(private transport: Transport) {}

  async create(officeId: string, req: CreateTaskRequest): Promise<Task> {
    return this.transport.post<Task>(base(officeId), req);
  }

  async list(officeId: string): Promise<Task[]> {
    return this.transport.get<Task[]>(base(officeId));
  }

  async get(officeId: string, taskId: string): Promise<Task> {
    return this.transport.get<Task>(`${base(officeId)}/${taskId}`);
  }

  async stats(officeId: string): Promise<TaskStats> {
    return this.transport.get<TaskStats>(`${base(officeId)}/stats`);
  }
}
