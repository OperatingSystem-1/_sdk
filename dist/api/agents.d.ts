import type { Transport } from '../transport.js';
import type { Agent, HireAgentRequest, UpdateAgentRequest, PromoteRequest, SkillsRequest, AgentLogs, ActivityEvent, ActivityQuery } from '../types/index.js';
export declare class AgentsAPI {
    private transport;
    constructor(transport: Transport);
    hire(officeId: string, req: HireAgentRequest): Promise<Agent>;
    list(officeId: string): Promise<Agent[]>;
    get(officeId: string, name: string): Promise<Agent>;
    update(officeId: string, name: string, req: UpdateAgentRequest): Promise<Agent>;
    fire(officeId: string, name: string): Promise<void>;
    logs(officeId: string, name: string, opts?: {
        tail?: number;
    }): Promise<AgentLogs>;
    activity(officeId: string, name: string, query?: ActivityQuery): Promise<ActivityEvent[]>;
    promote(officeId: string, name: string, req: PromoteRequest): Promise<Agent>;
    setSkills(officeId: string, name: string, req: SkillsRequest): Promise<Agent>;
    archive(officeId: string, name: string): Promise<void>;
    restore(officeId: string, name: string): Promise<void>;
    presence(officeId: string, name: string): Promise<{
        online: boolean;
        last_seen?: string;
    }>;
    /** Get the last error for an agent. */
    lastError(officeId: string, name: string): Promise<{
        error?: string;
        timestamp?: string;
    }>;
    /** Stop, start, or restart an agent pod. */
    lifecycle(officeId: string, name: string, action: 'stop' | 'start' | 'restart'): Promise<void>;
    /** Rotate agent credentials (signing key + IAM). */
    rotateCredentials(officeId: string, name: string): Promise<void>;
}
//# sourceMappingURL=agents.d.ts.map