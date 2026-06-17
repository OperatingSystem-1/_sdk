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

/**
 * API client for interacting with tasks.
 */
export class TasksAPI {
  /**
   * Creates an instance of TasksAPI.
   * @param transport The transport layer for API calls.
   */
  constructor(private transport: Transport) {}

  /**
   * Creates a new task.
   * @param officeId The ID of the office.
   * @param task The task creation request.
   * @returns A promise that resolves with the created task.
   */
  async create(officeId: string, task: CreateTaskRequest): Promise<Task> {
    return this.transport.post<Task>(base(officeId), task);
  }

  /**
   * Lists tasks for a given office.
   * @param officeId The ID of the office.
   * @param query Optional query parameters for filtering tasks.
   * @returns A promise that resolves with an array of tasks.
   */
  async list(
    officeId: string,
    query?: { status?: string; limit?: number; offset?: number },
  ): Promise<Task[]> {
    return this.transport.get<Task[]>(
      base(officeId),
      query as Record<string, string | number>,
    );
  }

  /**
   * Retrieves a specific task by its ID.
   * @param officeId The ID of the office.
   * @param taskId The ID of the task.
   * @returns A promise that resolves with the task details.
   */
  async get(officeId: string, taskId: string): Promise<TaskDetail> {
    return this.transport.get<TaskDetail>(`${base(officeId)}/${taskId}`);
  }

  /**
   * Retrieves statistics for tasks in an office.
   * @param officeId The ID of the office.
   * @returns A promise that resolves with task statistics.
   */
  async stats(officeId: string): Promise<TaskStats> {
    return this.transport.get<TaskStats>(`${base(officeId)}/stats`);
  }

  /**
   * Updates an existing task.
   * @param officeId The ID of the office.
   * @param taskId The ID of the task.
   * @param update The task update request.
   * @returns A promise that resolves with the updated task.
   */
  async update(officeId: string, taskId: string, update: UpdateTaskRequest): Promise<Task> {
    return this.transport.patch<Task>(`${base(officeId)}/${taskId}`, update);
  }

  /**
   * Marks a task as complete with a given result.
   * @param officeId The ID of the office.
   * @param taskId The ID of the task.
   * @param result The result message for the completed task.
   * @returns A promise that resolves with the updated task.
   */
  async complete(officeId: string, taskId: string, result: string): Promise<Task> {
    return this.update(officeId, taskId, { status: 'done', result });
  }

  /**
   * Marks a task as failed with a given error message.
   * @param officeId The ID of the office.
   * @param taskId The ID of the task.
   * @param error The error message for the failed task.
   * @returns A promise that resolves with the updated task.
   */
  async fail(officeId: string, taskId: string, error: string): Promise<Task> {
    return this.update(officeId, taskId, { status: 'failed', error });
  }

  /**
   * Logs a message for a specific task.
   * @param officeId The ID of the office.
   * @param taskId The ID of the task.
   * @param message The log message.
   * @param event The type of event (defaults to 'progress').
   * @returns A promise that resolves when the log is added.
   */
  async log(officeId: string, taskId: string, message: string, event = 'progress'): Promise<void> {
    await this.transport.post(`${base(officeId)}/${taskId}/log`, { message, event });
  }

  /**
   * Claims a task for an agent.
   * @param officeId The ID of the office.
   * @param agentName The name of the agent claiming the task.
   * @param kind Optional kind of task to claim.
   * @returns A promise that resolves with the claimed task.
   */
  async claim(officeId: string, agentName: string, kind?: string): Promise<Task> {
    return this.transport.post<Task>(`${base(officeId)}/claim`, {
      agent: agentName,
      kind: kind || '',
    });
  }

  /**
   * Retrieves subtasks for a given task.
   * @param officeId The ID of the office.
   * @param taskId The ID of the parent task.
   * @returns A promise that resolves with an array of subtasks.
   */
  async subtasks(officeId: string, taskId: string): Promise<Task[]> {
    return this.transport.get<Task[]>(`${base(officeId)}/${taskId}/subtasks`);
  }

  /**
   * Adds an artifact to a task.
   * @param officeId The ID of the office.
   * @param taskId The ID of the task.
   * @param artifact The artifact details.
   * @returns A promise that resolves with the created task artifact.
   */
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

  /**
   * Retrieves artifacts for a given task.
   * @param officeId The ID of the office.
   * @param taskId The ID of the task.
   * @returns A promise that resolves with an array of task artifacts.
   */
  async artifacts(officeId: string, taskId: string): Promise<TaskArtifact[]> {
    return this.transport.get<TaskArtifact[]>(`${base(officeId)}/${taskId}/artifacts`);
  }

  /**
   * Adds a comment to a task.
   * @param officeId The ID of the office.
   * @param taskId The ID of the task.
   * @param agent The name of the agent making the comment.
   * @param message The comment message.
   * @returns A promise that resolves when the comment is added.
   */
  async comment(officeId: string, taskId: string, agent: string, message: string): Promise<void> {
    await this.transport.post(`${base(officeId)}/${taskId}/comments`, { agent, message });
  }

  /**
   * Verifies a task.
   * @param officeId The ID of the office.
   * @param taskId The ID of the task.
   * @param req The verification request.
   * @returns A promise that resolves when the task is verified.
   */
  async verify(officeId: string, taskId: string, req: VerifyTaskRequest): Promise<void> {
    await this.transport.post(`${base(officeId)}/${taskId}/verify`, req);
  }

  /**
   * Reassigns a task to a different agent.
   * @param officeId The ID of the office.
   * @param taskId The ID of the task.
   * @param newAgent The name of the new agent to assign the task to.
   * @returns A promise that resolves with the updated task.
   */
  async reassign(officeId: string, taskId: string, newAgent: string): Promise<Task> {
    return this.update(officeId, taskId, { assignedAgent: newAgent });
  }

  /**
   * Retries a failed or cancelled task.
   * @param officeId The ID of the office.
   * @param taskId The ID of the task.
   * @param opts Optional parameters for the retry, such as reason, updated description, or assigned agent.
   * @returns A promise that resolves with the updated task.
   */
  async retry(
    officeId: string,
    taskId: string,
    opts?: { reason?: string; updatedDescription?: string; assignedAgent?: string },
  ): Promise<Task> {
    return this.transport.post<Task>(`${base(officeId)}/${taskId}/retry`, opts || {});
  }

  /**
   * Watches a task for status changes and log updates.
   * @param officeId The ID of the office.
   * @param taskId The ID of the task to watch.
   * @param callbacks Optional callbacks for progress, done, failed, and change events.
   * @param pollMs The polling interval in milliseconds (defaults to 5000).
   * @param timeoutMs The maximum time to wait for the task to complete in milliseconds (defaults to 600000).
   * @returns A promise that resolves with the final task when complete.
   * @throws An error if the task is not found or times out.
   */
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
