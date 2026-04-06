import type { Transport } from '../transport.js';

export interface InviteResult {
  code: string;
  officeId: string;
  claim: string;
}

export class InvitesAPI {
  constructor(private transport: Transport) {}

  /** Create an invite code for this office (agent-to-agent invites). */
  async create(officeId: string): Promise<InviteResult> {
    return this.transport.post<InviteResult>(
      `/api/v1/offices/${officeId}/invites`,
    );
  }
}
