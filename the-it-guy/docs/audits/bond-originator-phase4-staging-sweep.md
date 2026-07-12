# Bond Originator Phase 4 Staging Sweep

Implemented on 2026-07-12.

## Goal

Make the bond-originator staging data sweep a first-class release evidence gate. Phase 3 proves the local code contract; Phase 4 proves that staging data does not contain bond files that can get stuck through orphaned intake rows, invalid legacy statuses, stale external waits, missing grant evidence, or missing attorney handoff evidence.

## Commands

Local contract verification:

```bash
npm run verify:bond-originator-phase4-staging-sweep
```

Static-only preflight:

```bash
node scripts/bond-originator-phase4-staging-sweep.mjs --static-only
```

Strict live staging evidence:

```bash
node scripts/bond-originator-phase4-staging-sweep.mjs --live --confirm-staging --require-live
```

Strict live staging evidence that blocks on warnings:

```bash
node scripts/bond-originator-phase4-staging-sweep.mjs --live --confirm-staging --require-live --fail-on-warning
```

## Staging Evidence Contract

Real values must live in `.env.staging.local` or managed deployment secrets. `.env.example` only contains empty placeholders.

Required strict-live evidence:

- `SUPABASE_URL` or `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BOND_ORIGINATOR_PHASE4_SUPABASE_PROJECT_REF`
- `BOND_ORIGINATOR_PHASE4_STAGING_RUN_ID`
- `BOND_ORIGINATOR_PHASE4_SWEEP_APPROVER`
- `BOND_ORIGINATOR_PHASE4_SWEEP_APPROVED_AT`
- `BOND_ORIGINATOR_PHASE4_RELEASE_NOTES_URL`
- `BOND_ORIGINATOR_PHASE4_REMEDIATION_OWNER`
- `BOND_ORIGINATOR_PHASE4_MONITORING_OWNER`

The gate also derives the Supabase project ref from the URL when possible and refuses to run against any project other than the approved staging project.

## Sweep Finding Semantics

| Finding type | Release behavior |
| --- | --- |
| Critical findings | Block release. Examples include orphaned `READY_FOR_REVIEW`, accepted files still in intake, invalid workflow/application/quote statuses, missing grant evidence, and missing attorney handoff evidence beyond threshold. |
| Warning findings | Visible in the report and acceptable only with operational sign-off. Use `--fail-on-warning` to promote warnings into blockers. |
| Live read warnings | Visible table/column compatibility warnings from the read-only sweep. These need review when staging schema differs from expected canonical tables. |
| No findings | Strict live gate reports `READY_LIVE`. |

## Acceptance

- [x] Phase 4 harness is implemented.
- [x] Phase 4 package command is exposed.
- [x] Phase 4 reuses the Phase 3 aggregate launch gate as a prerequisite.
- [x] Strict live mode is read-only and staging-confirmed.
- [x] Strict live mode checks the approved Supabase staging project.
- [x] Strict live mode requires run id, approval, release notes, remediation owner, and monitoring owner metadata.
- [ ] Strict live staging sweep has been run with real staging credentials and evidence metadata.

## Current Result

2026-07-12 local contract result: `READY_LOCAL_CONTRACT`.

- Local prerequisite: Phase 3 launch gate.
- Strict live staging evidence remains pending until staging credentials and evidence metadata are supplied.

2026-07-12 static preflight result: `READY_STATIC_ONLY`.

- Command run: `node scripts/bond-originator-phase4-staging-sweep.mjs --static-only`

## Phase 4 Decision

Phase 5 owns the final sign-off package after the strict staging sweep evidence is available.

Decision: PHASE 4 HARNESS IMPLEMENTED; STRICT LIVE STAGING SWEEP REQUIRED.
