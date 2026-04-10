import type { Transport } from '../transport.js';
import type { Office, CreateOfficeRequest, OfficeSettings, ClusterStatus } from '../types/index.js';
export declare class OfficesAPI {
    private transport;
    constructor(transport: Transport);
    list(): Promise<Office[]>;
    create(req: CreateOfficeRequest): Promise<Office>;
    get(officeId: string): Promise<Office>;
    status(officeId: string): Promise<ClusterStatus>;
    getSettings(officeId: string): Promise<OfficeSettings>;
    updateSettings(officeId: string, settings: Partial<OfficeSettings>): Promise<OfficeSettings>;
    delete(officeId: string): Promise<void>;
    suspend(officeId: string): Promise<void>;
    resume(officeId: string): Promise<void>;
}
//# sourceMappingURL=offices.d.ts.map