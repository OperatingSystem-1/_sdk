/**
 * Poll clone pod status until it's online or times out.
 *
 * @param onProgress Called on each phase change with the current status
 * @param timeoutMs Max time to wait (default: 5 minutes)
 * @returns Final status when pod is ready, or throws on timeout
 */
export async function waitForCloneOnline(transport, officeId, cloneName, onProgress, timeoutMs = 300_000) {
    const start = Date.now();
    let lastPhase = '';
    while (Date.now() - start < timeoutMs) {
        try {
            const status = await transport.get(`/api/v1/offices/${officeId}/employees/${cloneName}`);
            const cs = {
                name: status.name,
                phase: status.status.phase,
                ready: status.status.ready,
                gatewayEndpoint: status.status.gatewayEndpoint,
                lastSeen: status.status.lastSeen,
            };
            if (cs.phase !== lastPhase) {
                lastPhase = cs.phase;
                onProgress?.(cs);
            }
            if (cs.ready || cs.phase === 'Running') {
                return cs;
            }
            if (cs.phase === 'Failed' || cs.phase === 'Suspended') {
                throw new Error(`Clone ${cloneName} entered ${cs.phase} state`);
            }
        }
        catch (err) {
            // 404 means pod not created yet — keep waiting
            if (err.status !== 404) {
                onProgress?.({ name: cloneName, phase: 'waiting', ready: false });
            }
        }
        await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error(`Clone ${cloneName} did not come online within ${timeoutMs / 1000}s`);
}
//# sourceMappingURL=clone-status.js.map