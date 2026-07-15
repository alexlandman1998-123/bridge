# OTP Phase 3: complete attorney-review draft

Phase 3 turns the simplified Phase 2 composition model into one complete, reviewable OTP candidate. It does not replace or publish the organisation's live OTP.

## What is included

- The existing standard OTP wording and signing structure.
- All 23 publishable South African conditional clause packs.
- Existing clause-pack wording is reused, including the bond clause already represented by `schedule_2`.
- Missing conditional packs are inserted before the standard legal core so the document remains easy to understand as exceptions plus core wording.
- Every legal section starts with `attorney_review` governance and remains unlocked only for review work. It is not treated as approved wording.

## User journey

On the Legal Templates settings page, an incomplete legacy OTP offers **Create complete review draft**. The action creates a separate inactive draft called **Offer to Purchase · Attorney Review Draft**.

The OTP overview then shows a single **Attorney readiness** summary:

- standard legal core count;
- conditional wording coverage out of 23;
- completed attorney approvals;
- whether signing is configured; and
- the first concrete blockers.

This separates three questions that were previously mixed together:

1. Is the wording present?
2. Has an attorney approved it?
3. Is it safe to publish?

The answer to the third question remains **no** until wording, signing, governance records, approvals and locks are complete.

## Safety boundary

- The live template is never edited by the Phase 3 action.
- Draft creation requires an explicit user click.
- Phase 3 does not publish, activate or make the candidate the default.
- Runtime clause enforcement remains a later rollout concern; Phase 3 prepares and reviews the catalogue.
- Attorney approval is still required before production use.

## Verification

```bash
npm run test:otp-governance-phase3
npm run test:otp-composition-phase2
npm run test:otp-legal-baseline
npm run build
```
