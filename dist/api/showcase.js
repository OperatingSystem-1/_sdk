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
}
//# sourceMappingURL=showcase.js.map
