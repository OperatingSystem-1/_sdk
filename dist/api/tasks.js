function base(officeId) {
    return `/api/v1/offices/${officeId}/tasks`;
}
export class TasksAPI {
    transport;
    constructor(transport) {
        this.transport = transport;
    }
    /** Create a task in the office task queue. */
    async create(officeId, task) {
        return this.transport.post(base(officeId), task);
    }
    /** List tasks with optional filters. */
    async list(officeId, query) {
        return this.transport.get(base(officeId), query);
    }
    /** Get task details by ID. */
    async get(officeId, taskId) {
        return this.transport.get(`${base(officeId)}/${taskId}`);
    }
    /** Get task queue statistics. */
    async stats(officeId) {
        return this.transport.get(`${base(officeId)}/stats`);
    }
}
//# sourceMappingURL=tasks.js.map