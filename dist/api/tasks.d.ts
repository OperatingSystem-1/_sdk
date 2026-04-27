import type { Transport } from '../transport.js';
import type { Task, TaskDetail, TaskStats, TaskArtifact, CreateTaskRequest, UpdateTaskRequest, VerifyTaskRequest } from '../types/index.js';
export declare class TasksAPI {
    private transport;
    constructor(transport: Transport);
    create(officeId: string, task: CreateTaskRequest): Promise<Task>;
    list(officeId: string, query?: {
        status?: string;
        limit?: number;
        offset?: number;
    }): Promise<Task[]>;
    get(officeId: string, taskId: string): Promise<TaskDetail>;
    stats(officeId: string): Promise<TaskStats>;
    update(officeId: string, taskId: string, update: UpdateTaskRequest): Promise<Task>;
    complete(officeId: string, taskId: string, result: string): Promise<Task>;
    fail(officeId: string, taskId: string, error: string): Promise<Task>;
    log(officeId: string, taskId: string, message: string, event?: string): Promise<void>;
    claim(officeId: string, agentName: string, kind?: string): Promise<Task>;
    subtasks(officeId: string, taskId: string): Promise<Task[]>;
    addArtifact(officeId: string, taskId: string, artifact: {
        kind?: string;
        path: string;
        label?: string;
    }): Promise<TaskArtifact>;
    artifacts(officeId: string, taskId: string): Promise<TaskArtifact[]>;
    comment(officeId: string, taskId: string, agent: string, message: string): Promise<void>;
    verify(officeId: string, taskId: string, req: VerifyTaskRequest): Promise<void>;
    reassign(officeId: string, taskId: string, newAgent: string): Promise<Task>;
    retry(officeId: string, taskId: string, opts?: {
        reason?: string;
        updatedDescription?: string;
        assignedAgent?: string;
    }): Promise<Task>;
    watch(officeId: string, taskId: string, callbacks?: {
        onProgress?: (log: {
            message: string;
            event: string;
        }, task: Task) => void;
        onDone?: (task: Task) => void;
        onFailed?: (task: Task) => void;
        onChange?: (task: Task) => void;
    }, pollMs?: number, timeoutMs?: number): Promise<Task>;
}
//# sourceMappingURL=tasks.d.ts.map