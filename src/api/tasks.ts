import type { Transport } from '../transport.js';
import type {
  Task,
  TaskDetail,
  TaskStats,
  TaskArtifact,
  CreateTaskRequest,
  UpdateTaskRequest,
  VerifyTaskRequest,
} from '../types/index.js';

function base(officeId: string) {
  return `/api/v1/offices/${officeId}/tasks`;
}

export class TasksAPI {
  constructor(private transport: Transport) {}

  async create(officeId: string, task: CreateTaskRequest): Promise<Task> {
    return this.transport.post<Task>(base(officeId), task);
  }

  async list(
    officeId: string,
    query?: { status?: string; limit?: number; offset?: number },
  ): Promise<Task[]> {
    return this.transport.get<Task[]>(
      base(officeId),
      query as Record<string, string | number>,
    );
  }

  async get(officeId: string, taskId: string): Promise<TaskDetail> {
    return this.transport.get<TaskDetail>(`${base(officeId)}/${taskId}`);
  }

  async stats(officeId: string): Promise<TaskStats> {
    return this.transport.get<TaskStats>(`${base(officeId)}/stats`);
  }

  async update(officeId: string, taskId: string, update: UpdateTaskRequest): Promise<Task> {
    return this.transport.patch<Task>(`${base(officeId)}/${taskId}`, update);
  }

  async complete(officeId: string, taskId: string, result: string): Promise<Task> {
    return this.update(officeId, taskId, { status: 'done', result });
  }

  async fail(officeId: string, taskId: string, error: string): Promise<Task> {
    return this.update(officeId, taskId, { status: 'failed', error });
  }

  async log(officeId: string, taskId: string, message: string, event = 'progress'): Promise<void> {
    await this.transport.post(`${base(officeId)}/${taskId}/log`, { message, event });
  }

  async claim(officeId: string, agentName: string, kind?: string): Promise<Task> {
    return this.transport.post<Task>(`${base(officeId)}/claim`, {
      agent: agentName,
      kind: kind || '',
    });
  }

  async subtasks(officeId: string, taskId: string): Promise<Task[]> {
    return this.transport.get<Task[]>(`${base(officeId)}/${taskId}/subtasks`);
  }

  async addArtifact(
    officeId: string,
    taskId: string,
    artifact: { kind?: string; path: string; label?: string },
  ): Promise<TaskArtifact> {
    return this.transport.post<TaskArtifact>(`${base(officeId)}/${taskId}/artifacts`, {
      kind: artifact.kind || 'file',
      path: artifact.path,
      label: artifact.label || '',
    });
  }

  async artifacts(officeId: string, taskId: string): Promise<TaskArtifact[]> {
    return this.transport.get<TaskArtifact[]>(`${base(officeId)}/${taskId}/artifacts`);
  }

  async comment(officeId: string, taskId: string, agent: string, message: string): Promise<void> {
    await this.transport.post(`${base(officeId)}/${taskId}/comments`, { agent, message });
  }

  async verify(officeId: string, taskId: string, req: VerifyTaskRequest): Promise<void> {
    await this.transport.post(`${base(officeId)}/${taskId}/verify`, req);
  }

  async reassign(officeId: string, taskId: string, newAgent: string): Promise<Task> {
    return this.update(officeId, taskId, { assignedAgent: newAgent });
  }

  async retry(
    officeId: string,
    taskId: string,
    opts?: { reason?: string; updatedDescription?: string; assignedAgent?: string },
  ): Promise<Task> {
    return this.transport.post<Task>(`${base(officeId)}/${taskId}/retry`, opts || {});
  }

  async watch(
    officeId: string,
    taskId: string,
    callbacks?: {
      onProgress?: (log: { message: string; event: string }, task: Task) => void;
      onDone?: (task: Task) => void;
      onFailed?: (task: Task) => void;
      onChange?: (task: Task) => void;
    },
    pollMs = 5000,
    timeoutMs = 600000,
  ): Promise<Task> {
    const start = Date.now();
    let lastLogCount = 0;
    let lastStatus: string | null = null;

    while (Date.now() - start < timeoutMs) {
      const detail = await this.get(officeId, taskId);
      const task = detail?.task;
      if (!task) throw new Error(`Task ${taskId} not found`);

      if (task.status !== lastStatus) {
        lastStatus = task.status;
        callbacks?.onChange?.(task);
        if (task.status === 'done') { callbacks?.onDone?.(task); return task; }
        if (task.status === 'failed' || task.status === 'cancelled') { callbacks?.onFailed?.(task); return task; }
      }

      const logs = detail?.logs || [];
      if (logs.length > lastLogCount) {
        for (const log of logs.slice(lastLogCount)) { callbacks?.onProgress?.(log, task); }
        lastLogCount = logs.length;
      }

      await new Promise(r => setTimeout(r, pollMs));
    }
    throw new Error(`Task ${taskId} did not complete within ${timeoutMs / 1000}s`);
  }
}
