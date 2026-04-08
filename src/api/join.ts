import type { Transport } from '../transport.js';
import type { JoinRequest, JoinResponse } from '../types/index.js';

export class JoinAPI {
  private transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  /**
   * Join an office by redeeming an invite code.
   * Creates an external employee record — no K8s pod provisioned.
   */
  async join(request: JoinRequest): Promise<JoinResponse> {
    return this.transport.post<JoinResponse>('/api/agents/join', request);
  }
}
