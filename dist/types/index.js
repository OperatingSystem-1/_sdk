// ─── Auth ────────────────────────────────────────────────────────────────────
// ─── Errors ──────────────────────────────────────────────────────────────────
export class OS1Error extends Error {
    status;
    code;
    constructor(status, message, code) {
        super(message);
        this.name = 'OS1Error';
        this.status = status;
        this.code = code;
    }
}
//# sourceMappingURL=index.js.map