# Supabase Phase 13 — Production Access

Generated: 2026-07-20T12:45:54.964Z

## Outcome

**Status: PRODUCTION_ACCESS_CONFIGURED**

Production database access is configured through the Supabase CLI's short-lived linked login role. No permanent production database URL or database password was added locally, committed to Git, or added to Vercel.

## Verification

| Check | Result |
| --- | --- |
| Production project | `isdowlnollckzvltkasn` |
| Project health | `ACTIVE_HEALTHY` |
| Access mode | `linked_ephemeral` |
| Credential type | Supabase CLI short-lived login role |
| Linked project identity | Verified |
| Database connectivity | Pass |
| Production ledger rows visible | 492 after Phase 25 |
| Phase 12 recovery evidence | Valid |
| Runtime recovery confirmation | Configured locally |
| Static database URL/password | Not configured |
| Production mutation during Phase 13 | None |

The ignored local file `.env.production.local` contains only the fixed project reference, the access-mode selector, and the explicit recovery-confirmation phrase. It contains no database password.

## Operational usage

Load the ignored production configuration when running a reviewed production command:

```bash
node --env-file=.env.production.local scripts/supabase-phase7-production-execution.mjs <reviewed arguments>
```

The runner now requires `linked_ephemeral` access and independently verifies that `supabase/.temp/project-ref` identifies the fixed production project. SQL application uses `supabase db query --linked`; ledger recording uses `supabase migration repair --linked`.

Access alone does not authorize a migration. Every production action still requires the exact version, staging evidence, approved staging-readiness record, Phase 12 recovery evidence, explicit `APPLY_TO_PRODUCTION` confirmation, dependency checks, and—before ledger recording—reviewed production evidence.

## Phase 17 re-verification

After Phase 25, the live ledger contains 492 rows. The access verifier calculates its expected count from the approved 433-row Phase 12 recovery baseline plus 59 unique reviewed production promotions. The live check passes at 492/492; it does not treat the historical baseline as the permanent final ledger count.
