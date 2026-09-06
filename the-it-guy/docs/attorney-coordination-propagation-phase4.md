# Attorney coordination Phase 4 — canonical propagation and attribution

Phase 4 makes attorney-lane activity safe to consume outside the attorney workspace. Transfer, bond and cancellation updates continue to use one transaction and the existing canonical event/shared-progress paths; no duplicate dashboard record is introduced.

Every attorney event, lane update, lane-history entry and shared-progress projection now carries an attorney action attribution envelope:

- the authenticated user who performed the action;
- whether that user was acting on behalf of another lane;
- the exact delegation grant, responsible firm and delegated lane when applicable.

Database triggers provide the authoritative enrichment for direct writes and atomic RPC actions. The application also enriches transaction events so attribution is preserved during a staged deployment before all writers move to the new database version. Shared-progress readers expose the envelope to professional, client and Televent consumers, while their existing visibility filtering still decides which update each audience may see.

## Gate

Run `npm run test:attorney-coordination-phase4`. The gate is cumulative through Phase 3 and verifies the canonical write/read path. Before release, apply the Phase 3 and Phase 4 migrations to staging and execute a database-backed three-actor walkthrough: responsible attorney direct update, delegated transfer-attorney update, then expiry/revocation denial. Confirm the same permitted update appears in the attorney workspace and Televent/client-facing views with the correct visibility.
