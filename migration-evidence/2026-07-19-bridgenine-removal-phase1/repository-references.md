# Repository reference inventory

Scan command:

```bash
rg --hidden -i \
  --glob '!.git/**' \
  --glob '!**/node_modules/**' \
  --glob '!**/dist/**' \
  --glob '!**/test-results/**' \
  --glob '!migration-evidence/**' \
  'bridgenine(?:\.co\.za)?' .
```

Post-Phase-1 result: 39 matches across 28 files.

## Active code and configuration

| File | Matches | Phase 2 disposition |
| --- | ---: | --- |
| `supabase/config.toml` | 5 | Remove old auth redirect URLs after live setting is captured |
| `the-it-guy/vercel.json` | 1 | Remove old app-host redirect in Phase 2 deployment |
| `apps/admin/vercel.json` | 1 | Remove old admin-host redirect in Phase 2 deployment |
| `the-it-guy/src/services/transactionPartnerInvitationService.js` | 1 | Remove legacy invite-origin acceptance |
| `the-it-guy/src/services/attorneyDashboard.js` | 1 | Replace/remove old demo-account check |
| `the-it-guy/.env.example` | 1 | Remove old domain from allowed recipient defaults |
| `the-it-guy/.env.staging.local.save` | 1 | Migrate the local saved fixture account; do not commit the file |

## Demo, seed, staging, and test tooling

| File | Matches |
| --- | ---: |
| `the-it-guy/scripts/seed-attorney-demo-transactions.mjs` | 7 |
| `the-it-guy/scripts/agency-runtime-isolation.test.mjs` | 1 |
| `the-it-guy/scripts/attorney-calendar-phase1-readiness.test.mjs` | 1 |
| `the-it-guy/scripts/attorney-calendar-phase4-rsvp.test.mjs` | 1 |
| `the-it-guy/scripts/attorney-calendar-phase5-reschedule.test.mjs` | 1 |
| `the-it-guy/scripts/attorney-calendar-phase7-staging-certification.mjs` | 1 |
| `the-it-guy/scripts/attorney-calendar-phase8-controlled-rollout.test.mjs` | 1 |
| `the-it-guy/scripts/bond-rls-phase5h-runtime-smoke-checklist.mjs` | 1 |
| `the-it-guy/scripts/create-bond-runtime-auth-state.mjs` | 1 |
| `the-it-guy/scripts/lead-pilot-environment-readiness.mjs` | 1 |
| `the-it-guy/scripts/lead-pilot-smoke.mjs` | 1 |
| `the-it-guy/scripts/lead-pilot-smoke.test.mjs` | 1 |
| `the-it-guy/scripts/otp-phase2-staging-acceptance.mjs` | 1 |
| `the-it-guy/scripts/public-listing-phase8.test.mjs` | 1 |
| `the-it-guy/scripts/public-listing-phase9.test.mjs` | 1 |
| `the-it-guy/server/tests/publicListingReadinessService.test.js` | 1 |
| `the-it-guy/server/tests/publicListingsService.test.js` | 1 |

Use `@example.test` for nondeliverable fixtures. Use controlled Arch9 aliases only for scripts that genuinely deliver email.

## Historical documentation

- `the-it-guy/docs/audits/arch9-buy-listing-bridge-phase-1-audit.md` — one historical reference.
- `the-it-guy/docs/bond-phase5-readiness.md` — one QA-account reference that may need updating if the fixture is migrated.

## Phase 1 artifacts

- `.gitignore` — one rule protecting the raw backup directory.
- `scripts/inventory-bridgenine-phase1.mjs` — two intentional search/export references.
