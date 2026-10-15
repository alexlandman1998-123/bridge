# Arch9 production release — 15 October 2026

The requester approved releasing all local Arch9 source changes in this chat.
The release candidate starts from remote main `5841262e8c97d04ee1d42014f99e71b4cd7064c2`
and merges the active checkout's source changes. Existing remote fixes and source
exclusions are retained. Scratch, generated output, environment files and the
independent Only Realty checkout are excluded. The active working tree remains intact.

## Verified preflight

- Supabase target: Arch9 SaaS, `isdowlnollckzvltkasn`, ACTIVE_HEALTHY.
- Phase 0 target/migration guard passed; no duplicate local timestamps.
- Production recovery: RECOVERY_LOCKED, verified eight physical backups and a
  previously accepted isolated restore rehearsal. No production restore was run.
- Primary app: 352 landlord/Client/listing regressions passed, app checks/build passed.
- Merged candidate: 79 joined rental acceptance tests, 140 seller/rental/listing
  merge tests, 10 Node draft-review tests and production build passed.
- Candidate bundle, operational-script packaging and schema compatibility gates passed.
- Website and admin checks/builds passed. Edge Function checks: 23 passed.
- Changed-source scan found no excluded generated/environment paths or literal
  production service credentials.
- Pre-change database function definitions/ACLs captured privately outside Git;
  previous app deployment retained: `dpl_6L7vhStac5CHwftKmxgp4D1LCYo8`.

## Exact pending database scope

1. `20261015074830_rental_landlord_next_action_contact_step.sql`
2. `20261015083559_rental_landlord_profile_consistent_saving.sql`
3. `20261015100645_rental_landlord_shared_conditional_rules.sql`
4. `20261015103158_rental_landlord_selected_signatories.sql`

The linked dry run contains exactly those four migrations, with no seeds or roles.
The approved direct-production pilot override applies only to this reviewed push.
Apply the database scope before dependent application code. Preserve additive
schema and all historical documents on recovery; restore prior app/function
bundles if necessary and use a separately reviewed forward correction.

## Release state

Database push and application deployment are in progress. Final deployment IDs,
URLs and live verification will be recorded after they are confirmed.
