import type { Transport } from '../transport.js';
import type { FileInfo, FileChanges } from '../types/index.js';
export declare class FilesAPI {
    private transport;
    constructor(transport: Transport);
    /** List files in the office shared drive. */
    list(officeId: string): Promise<FileInfo[]>;
    /** Upload a file to the shared drive. */
    upload(officeId: string, filename: string, body: Uint8Array, contentType?: string): Promise<void>;
    /** Download a file from the shared drive. Returns the raw Response. */
    download(officeId: string, filename: string): Promise<Response>;
    /** Delete a file from the shared drive. */
    delete(officeId: string, filename: string): Promise<void>;
    /** Poll for file changes since a timestamp (ms). */
    changes(officeId: string, since?: number): Promise<FileChanges>;
}
//# sourceMappingURL=files.d.ts.map