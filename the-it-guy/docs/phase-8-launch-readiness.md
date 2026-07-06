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

- Automated Playwright regression suite using seeded demo users.
- Dedicated staging seed runner.
- CI release gate using launch readiness checks.
- External monitoring/alerting.
- Background demo reset worker.
- Load testing scripts.
