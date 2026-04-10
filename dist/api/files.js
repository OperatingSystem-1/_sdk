function base(officeId) {
    return `/api/v1/offices/${officeId}/files`;
}
export class FilesAPI {
    transport;
    constructor(transport) {
        this.transport = transport;
    }
    /** List files in the office shared drive. */
    async list(officeId) {
        return this.transport.get(base(officeId));
    }
    /** Upload a file to the shared drive. */
    async upload(officeId, filename, body, contentType = 'application/octet-stream') {
        const form = new FormData();
        // Copy into a clean ArrayBuffer to satisfy strict TypeScript Blob typing
        const ab = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
        const blob = new Blob([ab], { type: contentType });
        form.append('file', blob, filename);
        await this.transport.request('POST', base(officeId), { body: form });
    }
    /** Download a file from the shared drive. Returns the raw Response. */
    async download(officeId, filename) {
        return this.transport.request('GET', `${base(officeId)}/${filename}`, {
            raw: true,
        });
    }
    /** Delete a file from the shared drive. */
    async delete(officeId, filename) {
        await this.transport.delete(`${base(officeId)}/${filename}`);
    }
    /** Poll for file changes since a timestamp (ms). */
    async changes(officeId, since) {
        return this.transport.get(`${base(officeId)}/_changes`, {
            since: since ?? 0,
        });
    }
}
//# sourceMappingURL=files.js.map