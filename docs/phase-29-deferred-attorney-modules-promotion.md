# Phase 29 — Promote Deferred Attorney Modules

## Decision

**Status: PRODUCTION_PHASE_29_COMPLETE**

The eight deferred attorney-accounting migrations are live and ledgered on production project `isdowlnollckzvltkasn`.

## Prerequisite correction

Production recorded canonical migration `202607180025`, but its four accounting tables were absent. The exact SQL already certified by the Phase 3 staging prerequisite repair was replayed without modifying the historical ledger entry. It created four empty RLS-protected tables, 11 scoped policies and the canonical balance model.

## Result

| Check | Result |
| --- | --- |
| Deferred migrations promoted | 8/8 |
| Production ledger | 492 → 500 |
| Reviewed production evidence | 67/71 |
| Remaining governed migrations | 4 |
| Party financial accounts | 318 |
| Bootstrap audit events | 318 |
| Non-zero opening balances | 0 |
| Imported financial documents | 0 |
| Imported financial entries | 0 |
| Document requests | 0 |
| Phase 0 broad-push guard | Active |

## Controls verified

- Party-account synchronization is idempotent and protected by a unique active-participant index.
- The portal account read model returns an empty response when no token exists.
- Portal read and upload functions are security-definer functions with a fixed `public` search path where applicable.
- Public execution is revoked; only the intended anonymous token session and authenticated roles may call portal functions.
- One posted ledger entry per client proof is enforced by a partial unique index.
- Payment instructions are returned only through the published portal model.
- Document requests use RLS, three scoped policies, two indexes and an updated-at trigger.
- The legacy proof-upload signature was removed before the request-aware signature became authoritative.
- No production behavior probe inserted a financial document, financial entry or document request.

## Remaining boundary

Four governed versions remain: attorney-calendar RSVP repair `202607180047` and conditional legal masters `202607200004`–`202607200006`. The Phase 0 freeze remains active. This phase does not widen the pilot cohort or enable the document-experience rollout.
