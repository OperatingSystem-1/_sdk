import type { Transport } from '../transport.js';
import type {
  CreditBalance,
  AddCreditsRequest,
  CreditHistoryEntry,
  UsageSummary,
  LLMUsageSummary,
  Quota,
  SetQuotaRequest,
} from '../types/index.js';

function base(officeId: string) {
  return `/api/v1/offices/${officeId}`;
}

export class CreditsAPI {
  constructor(private transport: Transport) {}

  // ─── Credits ──────────────────────────────────────────────────────

  async balance(officeId: string): Promise<CreditBalance> {
    return this.transport.get<CreditBalance>(`${base(officeId)}/credits`);
  }

  async add(officeId: string, req: AddCreditsRequest): Promise<CreditBalance> {
    return this.transport.post<CreditBalance>(`${base(officeId)}/credits`, req);
  }

  async history(officeId: string, opts?: { limit?: number; offset?: number }): Promise<CreditHistoryEntry[]> {
    return this.transport.get<CreditHistoryEntry[]>(`${base(officeId)}/credits/history`, opts);
  }

  // ─── Usage ────────────────────────────────────────────────────────

  async usage(officeId: string): Promise<unknown> {
    return this.transport.get(`${base(officeId)}/usage`);
  }

  async usageCurrent(officeId: string): Promise<unknown> {
    return this.transport.get(`${base(officeId)}/usage/current`);
  }

  async usageSummary(officeId: string): Promise<UsageSummary> {
    return this.transport.get<UsageSummary>(`${base(officeId)}/usage/summary`);
  }

  async llmUsage(officeId: string): Promise<unknown> {
    return this.transport.get(`${base(officeId)}/usage/llm`);
  }

  async llmUsageSummary(officeId: string): Promise<LLMUsageSummary> {
    return this.transport.get<LLMUsageSummary>(`${base(officeId)}/usage/llm/summary`);
  }

  async agentUsage(officeId: string, name: string): Promise<unknown> {
    return this.transport.get(`${base(officeId)}/employees/${name}/usage`);
  }

  // ─── Quota ────────────────────────────────────────────────────────

  async quota(officeId: string): Promise<Quota> {
    return this.transport.get<Quota>(`${base(officeId)}/quota`);
  }

  async setQuota(officeId: string, req: SetQuotaRequest): Promise<Quota> {
    return this.transport.put<Quota>(`${base(officeId)}/quota`, req);
  }
}
