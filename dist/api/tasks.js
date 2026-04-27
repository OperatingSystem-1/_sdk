function base(officeId) {
    return `/api/v1/offices/${officeId}/tasks`;
}
export class TasksAPI {
    transport;
    constructor(transport) {
        this.transport = transport;
    }
    async create(officeId, task) {
        return this.transport.post(base(officeId), task);
    }
    async list(officeId, query) {
        return this.transport.get(base(officeId), query);
    }
    async get(officeId, taskId) {
        return this.transport.get(`${base(officeId)}/${taskId}`);
    }
    async stats(officeId) {
        return this.transport.get(`${base(officeId)}/stats`);
    }
    async update(officeId, taskId, update) {
        return this.transport.patch(`${base(officeId)}/${taskId}`, update);
    }
    async complete(officeId, taskId, result) {
        return this.update(officeId, taskId, { status: 'done', result });
    }
    async fail(officeId, taskId, error) {
        return this.update(officeId, taskId, { status: 'failed', error });
    }
    async log(officeId, taskId, message, event = 'progress') {
        await this.transport.post(`${base(officeId)}/${taskId}/log`, { message, event });
    }
    async claim(officeId, agentName, kind) {
        return this.transport.post(`${base(officeId)}/claim`, {
            agent: agentName,
            kind: kind || '',
        });
    }
    async subtasks(officeId, taskId) {
        return this.transport.get(`${base(officeId)}/${taskId}/subtasks`);
    }
    async addArtifact(officeId, taskId, artifact) {
        return this.transport.post(`${base(officeId)}/${taskId}/artifacts`, {
            kind: artifact.kind || 'file',
            path: artifact.path,
            label: artifact.label || '',
        });
    }
    async artifacts(officeId, taskId) {
        return this.transport.get(`${base(officeId)}/${taskId}/artifacts`);
    }
    async comment(officeId, taskId, agent, message) {
        await this.transport.post(`${base(officeId)}/${taskId}/comments`, { agent, message });
    }
    async verify(officeId, taskId, req) {
        await this.transport.post(`${base(officeId)}/${taskId}/verify`, req);
    }
    async reassign(officeId, taskId, newAgent) {
        return this.update(officeId, taskId, { assignedAgent: newAgent });
    }
    async retry(officeId, taskId, opts) {
        return this.transport.post(`${base(officeId)}/${taskId}/retry`, opts || {});
    }
    async watch(officeId, taskId, callbacks, pollMs = 5000, timeoutMs = 600000) {
        const start = Date.now();
        let lastLogCount = 0;
        let lastStatus = null;
        while (Date.now() - start < timeoutMs) {
            const detail = await this.get(officeId, taskId);
            const task = detail?.task;
            if (!task)
                throw new Error(`Task ${taskId} not found`);
            if (task.status !== lastStatus) {
                lastStatus = task.status;
                callbacks?.onChange?.(task);
                if (task.status === 'done') {
                    callbacks?.onDone?.(task);
                    return task;
                }
                if (task.status === 'failed' || task.status === 'cancelled') {
                    callbacks?.onFailed?.(task);
                    return task;
                }
            }
            const logs = detail?.logs || [];
            if (logs.length > lastLogCount) {
                for (const log of logs.slice(lastLogCount)) {
                    callbacks?.onProgress?.(log, task);
                }
                lastLogCount = logs.length;
            }
            await new Promise(r => setTimeout(r, pollMs));
        }
        throw new Error(`Task ${taskId} did not complete within ${timeoutMs / 1000}s`);
    }
}
//# sourceMappingURL=tasks.js.map