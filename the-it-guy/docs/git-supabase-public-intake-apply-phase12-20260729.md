# Phase 12: Supabase Public Intake Production Apply

Date: 2026-07-29

## Scope

Apply only the three public intake Supabase migrations that support the agency public buyer/seller intake feature. No broad `supabase db push` was run.

Applied versions:

- `202607290002`
- `202607290003`
- `202607290004`

## Recovery Check

Production project:

```text
isdowlnollckzvltkasn
```

Backup status before SQL:

- PITR: disabled
- WAL-G: enabled
- Completed physical backups: 8
- Latest physical backup: `2026-07-29T03:10:24.225Z`

Decision:

Proceed with the focused migration application because production had completed physical backups and the SQL scope was limited to three reviewed public intake files.

## Dependency Preflight

Required production relations existed:

- `public.organisations`
- `public.organisation_branches`
- `public.organisation_users`
- `public.leads`
- `public.notification_automation_definitions`
- `public.notification_events`

Required production functions existed:

- `public.bridge_set_updated_at`
- `public.bridge_is_active_member`
- `public.bridge_is_org_admin`

Required production columns existed:

- `organisation_branches.id`
- `organisation_branches.organisation_id`
- `organisation_users.organisation_id`
- `organisation_users.user_id`
- `organisation_users.status`
- `leads.lead_id`
- `leads.organisation_id`
- `notification_automation_definitions.automation_key`
- `notification_automation_definitions.updated_at`

Pre-apply state:

- `public.agency_public_intake_links`: absent
- `public.agency_public_intake_submissions`: absent
- `public.bridge_validate_agency_public_intake_link`: absent
- Ledger `202607290002`: absent
- Ledger `202607290003`: absent
- Ledger `202607290004`: absent

## SQL Application

Applied exactly these files in order:

```bash
npx supabase db query --linked --file supabase/migrations/202607290002_agency_public_intake_links_phase1.sql
npx supabase db query --linked --file supabase/migrations/202607290003_agency_public_intake_submissions_phase2.sql
npx supabase db query --linked --file supabase/migrations/202607290004_agency_public_intake_phase8_automation.sql
```

Notes:

- `202607290002` applied successfully on first attempt.
- `202607290003` initially returned a transient Supabase upstream `503`.
- A catalog check confirmed no partial table, foreign key, policy, or ledger row existed after the failed attempt.
- `202607290003` was retried once and applied successfully.
- `202607290004` applied successfully on first attempt.

## Ledger Recording

After each SQL file was verified, exactly that version was recorded:

```bash
npx supabase migration repair --linked --status applied 202607290002
npx supabase migration repair --linked --status applied 202607290003
npx supabase migration repair --linked --status applied 202607290004
```

No batch repair and no broad repair was run.

## PostgREST Reload

After the SQL and ledger steps:

```sql
notify pgrst, 'reload schema';
```

## Production Verification

Final catalog and ledger smoke:

- `public.agency_public_intake_links`: exists
- `public.agency_public_intake_submissions`: exists
- `public.bridge_validate_agency_public_intake_link`: exists
- `agency_public_intake_received` automation definition: active
- `202607290002`: recorded
- `202607290003`: recorded
- `202607290004`: recorded
- public intake link count: 0
- public intake submission count: 0

Production API behavior changed from schema-missing to normal not-found behavior:

```text
GET https://app.arch9.co.za/api/public/agency-intake?slug=test-agency
HTTP 404
{"error":"agency_public_intake_not_found","message":"This agency intake link is not available."}
```

Interpretation:

The production API can now see the public intake schema. The dummy slug returns 404 because no active agency public intake link exists yet, not because storage is missing.

## Closeout State After Apply

`scripts/supabase-phase8-closeout.mjs --verify-live --json` still reports:

```text
CLOSEOUT_BLOCKED
```

The public intake migrations are now matched in the live ledger:

- `202607290002`
- `202607290003`
- `202607290004`

Remaining live local-only migration versions are unrelated to the public intake PR:

- `202607260008`
- `202607270002`
- `202607270009`
- `202607270010`
- `202607270011`
- `202607270012`
- `202607270013`
- `202607270014`
- `202607270015`
- `202607280002`
- `202607280003`
- `202607280004`
- `202607280005`
- `202607280006`
- `202607280007`
- `202607280008`
- `202607280009`
- `202607280010`
- `202607280011`
- `202607280012`
- `202607280013`
- `202607280014`
- `202607280015`
- `202607280016`
- `202607280017`
- `202607280018`
- `202607280019`
- `202607280020`
- `202607280021`
- `202607280022`
- `202607280023`
- `202607280024`

## Plan To Sort The Rest

### Phase 13: Commit And Push Evidence Fixes

Commit and push:

- the four Supabase evidence filename corrections from Phase 11
- the Phase 11 and Phase 12 reports if we want the audit trail in the PR

Then rerun PR checks.

Expected result:

- Phase 8 closeout should no longer fail because of the stale missing filename.
- Phase 0 may still fail until the PR label decision is made.

### Phase 14: Label And PR Readiness

Because the three PR migrations have now been applied and ledger-recorded in production, add the `database-reconciliation` label to PR #7 only with this evidence trail attached.

Then:

- convert PR #7 from draft to ready
- rerun GitHub checks
- verify Vercel remains green
- verify Supabase Phase 0 accepts the reviewed reconciliation path

### Phase 15: Activate A Real Agency Link

In production settings:

- create or activate one agency public intake link
- confirm the warning no longer says storage is missing
- copy the public agency link
- open the public link unauthenticated

Expected API behavior:

- dummy slug: 404 not found
- real active slug: 200 with public intake configuration

### Phase 16: End-To-End CRM Smoke

Run one buyer and one seller intake against a real agency link.

Verify:

- submission row is created
- CRM lead is created or updated
- buyer selected listings are captured
- enquiry/follow-up automation fires
- source attribution is recorded as public intake

### Phase 17: Remaining Supabase Drift Triage

Treat the 32 remaining local-only versions as a separate database reconciliation project.

Recommended grouping:

1. `202607260008`
2. `202607270002`
3. `202607270009` through `202607270015`
4. `202607280002` through `202607280024`

For each group:

- classify module ownership
- run dependency preflight
- determine action: repair-only, apply-original, corrective migration, or manual data review
- process one dependency stream at a time
- record production evidence after each batch
- rerun closeout after every batch

### Phase 18: Closeout And Freeze Retirement

Only after the remaining local-only list reaches zero:

- update `docs/supabase-ledger-drift-resolution.json`
- update closeout evidence
- rerun `node scripts/supabase-phase8-closeout.mjs --verify-live --json`
- retire the Phase 0 broad-push freeze in a separate reviewed PR

## Phase 12 Decision

The public intake database blocker is resolved. The remaining Supabase blocker is now broader historical ledger drift, not the public intake feature itself.
