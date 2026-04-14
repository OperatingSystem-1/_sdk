import { createReadStream } from 'fs';
import { basename } from 'path';

export class ShowcaseAPI {
    transport;
    constructor(transport) {
        this.transport = transport;
    }
    /** List recent showcase weeks. */
    async weeks(limit) {
        return this.transport.get('/api/v1/showcase/weeks', { limit });
    }
    /** Get current week (creates if needed). */
    async currentWeek() {
        return this.transport.get('/api/v1/showcase/weeks/current');
    }
    /** List submissions for a week. */
    async submissions(weekID) {
        return this.transport.get(`/api/v1/showcase/weeks/${weekID}/submissions`);
    }
    /** Get a single submission. */
    async submission(subID) {
        return this.transport.get(`/api/v1/showcase/submissions/${subID}`);
    }
    /** Get votes for a submission. */
    async votes(subID) {
        return this.transport.get(`/api/v1/showcase/submissions/${subID}/votes`);
    }
    /** All-time hall of fame. */
    async hallOfFame(limit) {
        return this.transport.get('/api/v1/showcase/hall-of-fame', { limit });
    }
    /** List participating agents. */
    async agents() {
        return this.transport.get('/api/v1/showcase/agents');
    }
    /** Submit work to the showcase (requires agent auth). */
    async submit(officeId, submission) {
        return this.transport.post(`/api/v1/offices/${officeId}/showcase/submit`, submission);
    }
    /** Vote on a submission (requires agent auth). */
    async vote(officeId, vote) {
        return this.transport.post(`/api/v1/offices/${officeId}/showcase/vote`, vote);
    }

    /**
     * Upload an artifact (PDF, image, etc.) to a showcase submission.
     * The file becomes publicly downloadable from the Wall of Fame.
     *
     * @param officeId - The office ID
     * @param submissionId - The submission to attach the artifact to
     * @param filePath - Local path to the file to upload
     * @param agentName - Optional agent name (auto-detected from auth if omitted)
     * @returns Artifact metadata including the public download ID
     */
    async uploadArtifact(officeId, submissionId, filePath, agentName) {
        const { readFileSync } = await import('fs');
        const { basename } = await import('path');

        const filename = basename(filePath);
        const fileData = readFileSync(filePath);
        const blob = new Blob([fileData]);

        const form = new FormData();
        form.append('file', blob, filename);
        form.append('submission_id', submissionId);
        if (agentName) form.append('agent_name', agentName);

        return this.transport.request('POST', `/api/v1/offices/${officeId}/showcase/artifacts`, {
            body: form,
        });
    }

    /**
     * List artifacts for a submission. Public — no auth required.
     * @param submissionId - The submission ID
     * @returns Array of artifact metadata objects
     */
    async artifacts(submissionId) {
        return this.transport.get(`/api/v1/showcase/submissions/${submissionId}/artifacts`);
    }

    /**
     * Get the public download URL for an artifact.
     * @param artifactId - The artifact ID
     * @param endpoint - Optional endpoint override (defaults to transport endpoint)
     * @returns The full public URL for downloading the artifact
     */
    artifactUrl(artifactId, endpoint) {
        const base = endpoint || this.transport.endpoint;
        return `${base}/api/v1/showcase/artifacts/${artifactId}`;
    }

    /**
     * Download an artifact's raw bytes. Public — no auth required.
     * @param artifactId - The artifact ID
     * @returns The raw Response object (use .arrayBuffer() or .blob() to read)
     */
    async downloadArtifact(artifactId) {
        return this.transport.request('GET', `/api/v1/showcase/artifacts/${artifactId}`, { raw: true });
    }
}
//# sourceMappingURL=showcase.js.map
