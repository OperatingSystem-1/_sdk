import type { Transport } from '../transport.js';
import type { Task, CreateTaskRequest, TaskStats } from '../types/index.js';

function base(officeId: string) {
  return `/api/v1/offices/${officeId}/tasks`;
}

export class TasksAPI {
  constructor(private transport: Transport) {}

  /** Create a task in the office task queue. */
  async create(officeId: string, task: CreateTaskRequest): Promise<Task> {
    return this.transport.post<Task>(base(officeId), task);
  }

  /** List tasks with optional filters. */
  async list(
    officeId: string,
    query?: { status?: string; limit?: number; offset?: number },
  ): Promise<Task[]> {
    return this.transport.get<Task[]>(
      base(officeId),
      query as Record<string, string | number>,
    );
  }

  /** Get task details by ID. */
  async get(officeId: string, taskId: string): Promise<Task> {
    return this.transport.get<Task>(`${base(officeId)}/${taskId}`);
  }

  /** Get task queue statistics. */
  async stats(officeId: string): Promise<TaskStats> {
    return this.transport.get<TaskStats>(`${base(officeId)}/stats`);
  }
}
