# Production pilot phase 0 — creation freeze

**Status:** HOLD — do not create live listings or transactions.

## Scope

- Retain existing records, including the synthetic `TEST — DO NOT ACTION` seller lead (`5624668d-d338-4bd7-800f-3f933ff16e34`).
- Do not send test notifications to pilot users.
- Limit any eventual first batch to two transactions, with a health and audit check after each one.

## Recorded production evidence

During the controlled Kingstons test on 2026-07-19, opening the existing `TEST — DO NOT ACTION` listing failed with:

```text
Unable to load application shell
Cannot read properties of null (reading 'id')
```

The session also observed stale asset requests for `SettingsLayout-C1aXxrU-.js` and `index-BqzwTpwu.js` returning 404 while the current HTML referenced newer assets. A fresh direct lead route loaded, so this is treated as a release-integrity and listing-detail blocker rather than proof that all routes are healthy.

## Enforcement

- Production defaults to a fail-closed creation pause unless `VITE_MVP_PILOT_CREATION_PAUSED=false` is explicitly configured after a documented go decision.
- Transaction creation paths reject new accepted-offer, lead override, and manual-fallback transactions while the pause is active.
- The listing workspace shows the hold and disables new listing and mandate entry points.
- `mvp-pilot-session-check` returns `no_go` while `MVP_PILOT_CREATION_PAUSED` is not explicitly false.

## Resume conditions

Do not clear the hold until the listing-detail null-id crash is fixed and deployed, current assets are served consistently, and the synthetic lead-to-transaction, notification, and health/audit checks have passed.
