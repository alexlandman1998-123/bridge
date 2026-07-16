# Conveyancer productisation P3 — cockpit and action queue UI

P3 gives transfer-attorney teams one operational starting point inside the existing matter workspace. It presents the P2 orchestration state without creating a second source of legal truth.

## Delivered

- A **Work** tab visible only in the attorney workspace.
- One prioritised queue grouped into needs review, do now, blocked, waiting and upcoming work.
- A next-best-action summary, matter health, overdue/blocker/evidence metrics and plan provenance.
- Guarded action execution through the P2 orchestration runner and database RPC boundary.
- Explicit reasons for waiting and resume decisions.
- Evidence gaps route to the established document workspace.
- Fact changes and external evidence receipts surface as human review prompts.
- Paused, awaiting-plan, loading, unavailable, success and error states.
- Manual provider fallback messaging for SARS, municipalities, banks and Deeds.

## Safety and rollout

The cockpit observes the P2 firm control. When orchestration is disabled, killed, outside the pilot cohort or unavailable, the existing matter tabs remain usable. P3 adds no database migration: it reads the P1 ledgers and P2 controls/receipts and sends mutations only through the guarded P2 RPC.

Enable P2 for a small transaction cohort first. Keep the kill switch active until the P1 and P2 migrations have been verified in the target environment and the pilot firm has approved the generated plan and action vocabulary.

## Verification

Run:

```sh
npm run test:conveyancer-productisation-p3
```

The suite verifies the cockpit projection, safe fallback modes, evidence routing, reason-gated resumes, review prompts, attorney-only navigation and absence of direct UI table mutations.
