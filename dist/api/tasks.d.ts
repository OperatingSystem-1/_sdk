import type { Transport } from '../transport.js';
import type { Task, CreateTaskRequest, TaskStats } from '../types/index.js';
export declare class TasksAPI {
    private transport;
    constructor(transport: Transport);
    /** Create a task in the office task queue. */
    create(officeId: string, task: CreateTaskRequest): Promise<Task>;
    /** List tasks with optional filters. */
    list(officeId: string, query?: {
        status?: string;
        limit?: number;
        offset?: number;
    }): Promise<Task[]>;
    /** Get task details by ID. */
    get(officeId: string, taskId: string): Promise<Task>;
    /** Get task queue statistics. */
    stats(officeId: string): Promise<TaskStats>;
}
//# sourceMappingURL=tasks.d.ts.map