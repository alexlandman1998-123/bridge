# Phase 8 Launch Readiness

Phase 8 prepares Bridge for controlled rollout by making staging, demos, QA, release management, support, rollback, and launch validation repeatable.

## Environment Strategy

### Local Development

Purpose: fast development and experimental testing.

Rules:

- Dev/demo flags may be enabled explicitly.
- Local data may be reset freely.
- Production credentials are not allowed.

### Demo / Staging

Purpose: investor demos, attorney demos, onboarding demos, and QA.

Rules:

- Use a separate Supabase project and separate auth users.
- Use `VITE_APP_ENV=demo` or `VITE_APP_ENV=staging`.
- Seed realistic but non-production data.
- Enable demo tooling only after `platform_environment_settings.demo_tools_enabled=true` in the isolated project.
- Never share production workspace, transaction, document, or auth records.

Suggested domains:

- `demo.arch9.co.za`
- `staging.arch9.co.za`

### Production

Purpose: real users only.

Rules:

- `VITE_APP_ENV=production`
- no demo mode
- no mock data
- no local fallbacks
- no dev auth bypass
- no disabled role restrictions

## Demo Seed Manifest

Permanent demo accounts are defined in `src/services/demo/demoManifest.js`.

Required seeded scenarios:

- Agency: principal, branch manager, agent, admin staff, branches, leads, listings, appointments, transactions, clients.
- Developer: owner, sales agent, developments, units, transactions, reports.
- Attorney: partner, conveyancer, admin staff, matters, transfer workflows, signing appointments, document requests.
- Bond: owner, consultant, processor, applications, bank workflows, finance statuses.
- Client: buyer portal, seller portal, transaction progress, document upload requests.

The current attorney demo has seed/reset SQL support through:

- `supabase/seed/reset-dalawyer-demo-data.sql`
- `supabase/seed/seed-dalawyer-demo-data.sql`

## Demo Reset Process

Demo reset requests are initiated from Platform Admin diagnostics.

Safety rules:

- Demo reset is blocked by default.
- Demo reset requires platform admin access.
- Demo reset requires a non-production environment setting.
- Demo reset requires `demo_tools_enabled=true`.
- Production defaults to locked.
- Reset requests are audited in `demo_reset_runs`.

Recommended reset run:

1. Deploy latest app to staging/demo.
2. Run deployment health check.
3. Dry-run demo reset.
4. Execute seed/reset SQL against staging/demo only.
5. Run launch readiness check.
6. Run role-based QA.
7. Record result in release notes.

## Regression Matrix

Core regression areas are defined in `src/services/release/qaRegressionMatrix.js`.

Required coverage:

- Auth: login, logout, timeout logout, refresh persistence, onboarding resume, invite acceptance.
- Onboarding: agency, developer, attorney, bond, and client paths.
- Workspaces: creation, branch creation, invites, approvals, membership activation.
- Permissions: route access, actions, exports, branch-only, assigned-only.
- Transactions: workflow progression, uploads, stage transitions, comments, assignments.
- Client portal: visibility, uploads, progress tracking.
- Recovery: missing membership, invalid onboarding, invalid assignment, orphan detection.
- Observability: logs, audit visibility, permission-denial tracking, deployment checks.

## Bond Originator Launch Gate

The bond-originator release gate covers bank delays, additional-document delays, buyer re-upload waits, grant evidence, signed-grant evidence, attorney instruction handoff, invalid legacy statuses, and active files that would otherwise fall out of a visible queue.

Current implemented audit phases:

- Bond originator Phase 3 launch gate: `docs/audits/bond-originator-phase3-launch-gate.md`
- Bond originator Phase 4 staging sweep: `docs/audits/bond-originator-phase4-staging-sweep.md`
- Bond originator Phase 5 final sign-off: `docs/audits/bond-originator-phase5-final-signoff.md`
- Bond originator Phase 6 post-launch monitoring: `docs/audits/bond-originator-phase6-post-launch-monitoring.md`

Local Phase 3 verification:

```bash
npm run verify:bond-originator-phase3-launch-gate
```

Strict read-only staging sweep before release:

```bash
node scripts/bond-originator-phase4-staging-sweep.mjs --live --confirm-staging --require-live
```

Phase 4 staging sweep verification:

```bash
npm run verify:bond-originator-phase4-staging-sweep
```

Phase 5 final sign-off package:

```bash
npm run verify:bond-originator-phase5-final-signoff
```

Strict final sign-off before production go:

```bash
node scripts/bond-originator-phase5-final-signoff.mjs --require-final-signoff
```

Phase 6 post-launch monitoring package:

```bash
npm run verify:bond-originator-phase6-post-launch-monitoring
```

Strict post-launch monitoring evidence:

```bash
node scripts/bond-originator-phase6-post-launch-monitoring.mjs --require-monitoring
```

## Seller-Side Transaction Launch Gate

The seller-side launch checklist is tracked separately because it spans agency, seller portal, listing, mandate, transaction, document, finance, attorney, and registration surfaces.

Current implemented audit phases:

- Phase 0 scope lock: `docs/audits/seller-side-transaction-launch-scope-phase0.md`
- Phase 1 staging fixture/env readiness: `docs/audits/seller-side-transaction-launch-phase1.md`
- Phase 2 lead-to-onboarding contracts: `docs/audits/seller-side-transaction-launch-phase2.md`
- Phase 3 listing/mandate conversion contracts: `docs/audits/seller-side-transaction-launch-phase3.md`
- Phase 4 transaction spine/documents/routing contracts: `docs/audits/seller-side-transaction-launch-phase4.md`
- Phase 5 transfer/registration/security/browser contracts: `docs/audits/seller-side-transaction-launch-phase5.md`
- Phase 6 launch hardening/build/RLS contracts: `docs/audits/seller-side-transaction-launch-phase6.md`
- Phase 7 release-candidate/cutover evidence contracts: `docs/audits/seller-side-transaction-launch-phase7.md`

Phase 1 verification:

```bash
npm run verify:seller-side-phase1-readiness
```

Phase 2 verification:

```bash
npm run verify:seller-side-phase2-lead-onboarding
```

Phase 3 verification:

```bash
npm run verify:seller-side-phase3-listing-mandate
```

Phase 4 verification:

```bash
npm run verify:seller-side-phase4-transaction-spine
```

Phase 5 verification:

```bash
npm run verify:seller-side-phase5-transfer-registration
```

Phase 6 verification:

```bash
npm run verify:seller-side-phase6-launch-hardening
```

Phase 6 live staging RLS cutover evidence:

```bash
SELLER_SIDE_RLS_ACTOR_EMAIL=<actor@example.com> \
SELLER_SIDE_RLS_ACTOR_PASSWORD=<actor-password> \
SELLER_SIDE_RLS_UNRELATED_EMAIL=<unrelated@example.com> \
SELLER_SIDE_RLS_UNRELATED_PASSWORD=<unrelated-password> \
SELLER_SIDE_RLS_TRANSACTION_ID=<transaction-id> \
node scripts/seller-side-phase6-rls-probes.mjs --live --confirm-staging --require-live
```

Phase 7 release-candidate verification:

```bash
npm run verify:seller-side-phase7-release-candidate
```

Phase 7 strict cutover evidence:

```bash
SELLER_SIDE_BROWSER_SMOKE_BASE_URL=https://staging.arch9.co.za \
SELLER_SIDE_BROWSER_SMOKE_TRANSACTION_ID=<transaction-id> \
SELLER_SIDE_BROWSER_SMOKE_AUTH_STATE=playwright/.auth/staging-internal.json \
SELLER_SIDE_RLS_ACTOR_EMAIL=<actor@example.com> \
SELLER_SIDE_RLS_ACTOR_PASSWORD=<actor-password> \
SELLER_SIDE_RLS_UNRELATED_EMAIL=<unrelated@example.com> \
SELLER_SIDE_RLS_UNRELATED_PASSWORD=<unrelated-password> \
SELLER_SIDE_RLS_TRANSACTION_ID=<transaction-id> \
node scripts/seller-side-phase7-release-candidate-gate.mjs --require-cutover-evidence
```

## Buyer-Side Lead-To-Registration Diagnostic

The buyer-side diagnostic mirrors the seller launch gate at a full journey level: lead capture, assignment, requirements, matching, offer submission, accepted-offer transaction conversion, onboarding, finance, document requirements, transfer workflow, registration action evidence, and browser entry protection.

Current diagnostic audit:

- Attorney workflow contract Phase 0: `docs/audits/attorney-workflow-contract-phase0.md`
- Attorney workflow Phase 1 queue actions: `docs/audits/attorney-workflow-phase1-queue-actions.md`
- Attorney workflow Phase 2 permission lock: `docs/audits/attorney-workflow-phase2-permission-lock.md`
- Attorney workflow Phase 3 launch gate: `docs/audits/attorney-workflow-phase3-launch-gate.md`
- Attorney workflow Phase 4 multi-firm smoke: `docs/audits/attorney-workflow-phase4-multi-firm-smoke.md`
- Attorney workflow Phase 5 signing appointments: `docs/audits/attorney-workflow-phase5-signing-appointments.md`
- Attorney workflow Phase 6 person-level requirements: `docs/audits/attorney-workflow-phase6-person-level-requirements.md`
- Attorney workflow Phase 7 actionable blockers: `docs/audits/attorney-workflow-phase7-actionable-blockers.md`
- Attorney workflow Phase 8 exceptional legal scenarios: `docs/audits/attorney-workflow-phase8-exceptional-legal-scenarios.md`
- Attorney workflow Phase 9 pilot monitoring: `docs/audits/attorney-workflow-phase9-pilot-monitoring.md`
- Buyer-side launch hardening Phase 0 scope lock: `docs/audits/buyer-side-launch-hardening-phase0.md`
- Buyer-side launch hardening Phase 1 live staging transaction: `docs/audits/buyer-side-launch-hardening-phase1.md`
- Buyer-side launch hardening Phase 2 RLS access probes: `docs/audits/buyer-side-launch-hardening-phase2.md`
- Buyer-side launch hardening Phase 3 public offer-token browser smoke: `docs/audits/buyer-side-launch-hardening-phase3.md`
- Buyer-side launch hardening Phase 4 token delivery and invalid-token handling: `docs/audits/buyer-side-launch-hardening-phase4.md`
- Buyer-side launch hardening Phase 5 document and privacy verification: `docs/audits/buyer-side-launch-hardening-phase5.md`
- Buyer-side launch hardening Phase 6 launch-candidate gate: `docs/audits/buyer-side-launch-hardening-phase6.md`
- Buyer-side launch hardening Phase 7 final staging sign-off: `docs/audits/buyer-side-launch-hardening-phase7.md`
- Buyer-side lead-to-registration diagnostic: `docs/audits/buyer-side-lead-registration-diagnostic.md`

Phase 0 verification:

```bash
npm run verify:attorney-workflow-phase0-contract
npm run verify:attorney-workflow-phase1-queue-actions
npm run verify:attorney-workflow-phase2-permission-lock
npm run verify:attorney-workflow-phase3-launch-gate
npm run verify:attorney-workflow-phase4-multi-firm-smoke
npm run verify:attorney-workflow-phase5-signing-appointments
npm run verify:attorney-workflow-phase6-person-level-requirements
npm run verify:attorney-workflow-phase7-actionable-blockers
npm run verify:attorney-workflow-phase8-exceptional-legal-scenarios
npm run verify:attorney-workflow-phase9-pilot-monitoring
npm run verify:buyer-side-phase0-scope-fixtures
```

Attorney Phase 4 strict live staging evidence:

```bash
npm run verify:attorney-workflow-phase4-live
```

Phase 1 local contract verification:

```bash
npm run verify:buyer-side-phase1-live-staging-transaction
```

Phase 1 strict live staging evidence:

```bash
node scripts/buyer-side-phase1-live-staging-transaction-gate.mjs --live --confirm-staging --require-live
```

Phase 2 local RLS contract verification:

```bash
npm run verify:buyer-side-phase2-rls-access
```

Phase 2 strict live RLS evidence:

```bash
node scripts/buyer-side-phase2-rls-access-probes.mjs --live --confirm-staging --require-live
```

Phase 3 local offer-token contract verification:

```bash
npm run verify:buyer-side-phase3-offer-token-browser
```

Phase 3 local mocked browser smoke:

```bash
node scripts/buyer-side-phase3-offer-token-browser-smoke.mjs --browser
```

Phase 3 strict live public-token browser evidence:

```bash
node scripts/buyer-side-phase3-offer-token-browser-smoke.mjs --live --confirm-staging --require-browser
```

Phase 4 local token delivery contract verification:

```bash
npm run verify:buyer-side-phase4-token-delivery
```

Phase 4 strict live delivery evidence:

```bash
node scripts/buyer-side-phase4-token-delivery-invalid-handling.mjs --live --confirm-staging --require-live
```

Phase 5 local document privacy contract verification:

```bash
npm run verify:buyer-side-phase5-document-privacy
```

Phase 5 strict live document privacy evidence:

```bash
node scripts/buyer-side-phase5-document-privacy-verification.mjs --live --confirm-staging --require-live
```

Phase 6 local launch-candidate verification:

```bash
npm run verify:buyer-side-phase6-launch-candidate
```

Phase 6 strict live evidence chain:

```bash
node scripts/buyer-side-phase6-launch-candidate-gate.mjs --require-live-evidence
```

Phase 7 local final sign-off package:

```bash
npm run verify:buyer-side-phase7-final-signoff
```

Phase 7 strict final staging sign-off:

```bash
node scripts/buyer-side-phase7-final-signoff-gate.mjs --require-final-signoff
```

Verification:

```bash
npm run verify:buyer-side-lead-registration-diagnostic
```

Optional browser smoke:

```bash
node scripts/buyer-side-lead-registration-diagnostic-gate.mjs --include-browser-smoke
```

## Role QA Suites

Agency:

- principal dashboard
- branch manager scope
- leads
- listings
- transactions
- appointments

Developer:

- developments
- units
- sales pipeline
- reports
- permissions

Attorney:

- matters
- transfer workflow
- document approvals
- departments

Bond:

- applications
- bank workflows
- consultant assignments

Client:

- portal access
- uploads
- visibility restrictions

## Release Management

Release flow:

1. Local development complete.
2. Deploy to staging/demo.
3. Run deployment health check.
4. Run demo reset dry-run and seeded data verification.
5. Run QA checklist.
6. Run regression matrix.
7. Verify migrations.
8. Verify production flags.
9. Approve release.
10. Deploy production.
11. Run post-deploy checks.
12. Monitor telemetry, errors, audit logs, and permission denials.

Release approval requires:

- no critical launch readiness blockers
- all production flags safe
- migrations verified
- staging auth/onboarding/workspace/permission flows verified
- support playbook ready
- rollback owner assigned

## Post-Deploy Verification

Verify:

- login works
- onboarding works
- route guards work
- memberships load
- workspace switching works
- permissions enforce route/action access
- transaction pages load
- workflows function
- client links work
- uploads work
- telemetry records
- audit events record
- diagnostics page loads for platform admins

## Rollback Procedures

### Broken Deployment

1. Stop rollout.
2. Roll back to previous deployment.
3. Restore previous env vars if changed.
4. Run auth boot, route guard, and dashboard smoke checks.
5. Log incident and affected release.

### Broken Migration

1. Stop writes if data integrity is at risk.
2. Identify migration failure point.
3. Restore backup only if required.
4. Apply forward repair migration where safer than rollback.
5. Run integrity checks before reopening.

### Broken Permissions

1. Block affected routes if leakage risk exists.
2. Restore prior permission registry.
3. Check audit/security events for denied or leaked access attempts.
4. Run wrong-module and scoped-data tests.

### Broken Onboarding

1. Freeze new onboarding if account corruption is possible.
2. Route users to recovery/maintenance.
3. Repair through onboarding diagnostics.
4. Do not mark users complete manually without validation.

### Broken Demo Environment

1. Confirm environment is not production.
2. Run demo reset dry-run.
3. Re-apply seed/reset scripts.
4. Run demo flow validation.

## Support Playbook

Auth issue:

- Run user diagnostics.
- Confirm Supabase auth user, profile, and session state.
- Check error events.
- Escalate if auth provider or config issue.

Onboarding issue:

- Run user diagnostics.
- Check signup intent, onboarding state, workspace action, and membership.
- Use recovery recommendation.
- Escalate if backend records conflict.

Workspace issue:

- Run workspace diagnostics.
- Confirm owner membership and default branch/team/department.
- Check membership status.
- Escalate if workspace records are orphaned.

Transaction issue:

- Run transaction diagnostics.
- Confirm workspace, participant, assignment, stage, documents.
- Escalate invalid workflow states.

Client issue:

- Confirm client access token/link.
- Confirm transaction participant mapping.
- Confirm upload request and document visibility.

## Go-Live Checklist

Seller-side transaction launch scope is locked in
`docs/audits/seller-side-transaction-launch-scope-phase0.md`.
Phase 1 fixture and env readiness is recorded in
`docs/audits/seller-side-transaction-launch-phase1.md`.
Phase 2 lead-to-onboarding contracts are recorded in
`docs/audits/seller-side-transaction-launch-phase2.md`.
Phase 3 listing/mandate conversion contracts are recorded in
`docs/audits/seller-side-transaction-launch-phase3.md`.
Phase 4 transaction spine, documents, and routing contracts are recorded in
`docs/audits/seller-side-transaction-launch-phase4.md`.
Phase 5 transfer, registration, security, and browser-smoke contracts are recorded in
`docs/audits/seller-side-transaction-launch-phase5.md`.
Phase 6 launch hardening, production build warning hygiene, and RLS probe contracts are recorded in
`docs/audits/seller-side-transaction-launch-phase6.md`.
Phase 7 release-candidate and strict cutover evidence contracts are recorded in
`docs/audits/seller-side-transaction-launch-phase7.md`.

Infrastructure:

- production env vars set
- domains configured
- SSL active
- Supabase auth config complete
- backups verified

Auth and onboarding:

- auth flows tested
- onboarding tested
- invite flows tested
- recovery flows tested

Workspace and permissions:

- membership loading tested
- route guards tested
- action permissions tested
- workspace scoping tested

Security:

- unsafe flags disabled
- demo bypass disabled
- platform admin routes restricted
- no production data in demo/staging

Observability:

- logs recorded
- audit logs visible
- errors tracked
- permission denials tracked

Support:

- support playbook ready
- diagnostics page ready
- escalation path assigned

Demo/staging:

- seeded demo stable
- reset dry-run works
- demo scripts verified

## Launch Readiness Scoring

Launch readiness is calculated in `src/services/release/launchReadiness.js`.

Categories:

- auth
- onboarding
- workspace
- permissions
- transactions
- client portal
- performance
- support
- observability
- security

Each category returns:

- status
- risk level
- blockers
- recommendations
- evidence

Status values:

- `ready`
- `needs_review`
- `blocked`

## Performance And Load Preparation

Likely bottlenecks:

- large agency lead/listing tables
- large transaction pipelines
- document-heavy client portals
- audit/event table growth
- export generation
- client-side table filtering
- repeated membership lookups

Before broad launch:

- add server-side pagination to large tables
- confirm workspace-first indexes
- run load tests for large agencies and attorney firms
- move heavy exports to background jobs
- monitor route and API latency

## Demo Flow Validation

Agency:

- principal dashboard
- leads
- listings
- transactions
- appointments

Developer:

- developments
- sales pipeline
- reporting

Attorney:

- matters
- workflow
- documents

Bond:

- applications
- statuses
- workflows

Client:

- portal
- uploads
- progress tracking

Each demo must survive refresh, logout/login, and seeded reset.

## Incident Response

Severity levels:

- Critical: production unavailable, auth broken, data leakage, cross-workspace access.
- High: onboarding blocked, key role dashboard broken, transaction workflow blocked.
- Medium: degraded feature, isolated support issue, non-critical integration failure.
- Low: cosmetic issue, documentation issue, minor telemetry gap.

Incident requirements:

- assign owner
- record start time
- define rollback criteria
- preserve logs
- communicate status
- record resolution
- run post-incident review

## Phase 9 Candidates

- Attorney workflow pilot monitoring is implemented in `docs/audits/attorney-workflow-phase9-pilot-monitoring.md`.
- Automated Playwright regression suite using seeded demo users.
- Dedicated staging seed runner.
- CI release gate using launch readiness checks.
- External monitoring/alerting.
- Background demo reset worker.
- Load testing scripts.
