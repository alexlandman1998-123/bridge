# Bridgenine removal — Phase 3 production-data migration

Implemented: 2026-07-19  
Supabase project: `isdowlnollckzvltkasn` (`Bridge9 SaaS`)

## Outcome

The production identity and operational-data migration is complete for every record readable through the Supabase Auth Admin and PostgREST APIs.

- 973 operational database records migrated.
- 24 readable Auth users migrated.
- Four human-facing demo/canonical logins moved to `@arch9.co.za`.
- Twenty automated QA/runtime identities moved to `@example.test`.
- One residual `user_metadata.email` value was found and repaired in a follow-up metadata-only operation.
- Five reusable offer/activity links now use `https://app.arch9.co.za`.
- Post-change mutable scan: zero Auth operations and zero database operations remaining.

No accounts were deleted and no immutable history was rewritten.

## Mapping policy

The following controlled login local-parts retained their local-part and moved to `arch9.co.za`:

- `agent.demo`
- `attorney.demo`
- `principal.demo`
- `qa.attorney+canonical`

All other synthetic Bridgenine emails moved to the reserved nondeliverable `example.test` domain. Passwords and user IDs were preserved.

Web URLs were mapped by host:

- `app.bridgenine.co.za` → `app.arch9.co.za`
- `admin.bridgenine.co.za` → `admin.arch9.co.za`
- `www.bridgenine.co.za` → `www.arch9.co.za`
- apex `bridgenine.co.za` → `arch9.co.za`

## Operational relations migrated

The 973 database operations covered:

- profiles, organisation users, organisations, and branch records;
- attorney firms, buyers, contacts, leads, and signup intents;
- active transactions, transaction participants, and role-player snapshots;
- signing participants/fields and active private-listing seller data;
- organisation settings, routing rules, offers, seed manifests, and activity links.

Exact per-relation counts are recorded in `migration-summary.json`. The raw before/after plan is stored in the ignored `backups/migration-plan.json` file with mode `0600`.

## Preserved immutable history

The full post-change scan intentionally retains:

- 36 structured records: 17 sent `communication_deliveries` and 19 `documents.uploaded_by_email` audit fields;
- 737 JSON records across document packet events/versions/snapshots, private-listing activity, security audit events, telemetry, transaction events, and transaction workflow events.

These values are historical evidence or generated-document snapshots. They are not used as current authentication, routing, delivery, invitation, or source-of-truth values.

## Guard and recovery behavior

The first apply attempt stopped after 86 operations because `organization_branches` mirrors `organisation_branches`; changing the base relation made the duplicate view operations fail their precondition. The migration was made idempotent and resumed from the verified state. All 973 planned operations subsequently completed.

Rollback remains available from the protected plans. Roll back the metadata repair first, then the main plan:

```bash
PHASE3_PLAN_PATH=migration-evidence/2026-07-19-bridgenine-removal-phase3/backups/metadata-repair-plan.json \
PHASE3_SUMMARY_PATH=migration-evidence/2026-07-19-bridgenine-removal-phase3/metadata-repair-summary.json \
node --env-file=the-it-guy/.env.production.local scripts/migrate-bridgenine-phase3.mjs --rollback

node --env-file=the-it-guy/.env.production.local scripts/migrate-bridgenine-phase3.mjs --rollback
```

## Verification

- Mutable relation verification: `verified_clean`.
- Readable Auth objects containing Bridgenine: zero.
- Attorney demo login through `attorney.demo@arch9.co.za`: passed; profile email matches.
- Canonical attorney login through `qa.attorney+canonical@arch9.co.za`: passed; profile email matches.
- Pre-change and post-change backups are checksumed and permissioned `0600`.
- All remaining full-inventory matches are confined to the preserved-history relations above.

## Known Auth API exception

Supabase Auth reports 161 users but its Admin list endpoint returns HTTP 500 for positions 153–161. The other 152 users were scanned and migrated successfully. All exposed `profiles` and operational database relations are clean, but the nine unserializable Auth positions cannot be independently inspected through the available API and remain a documented platform-level exception.

## Exit decision

Operational data migration: complete for all readable records.  
Ready for Phase 4 deployment and Arch9 smoke testing: yes.  
Ready to detach Vercel domains or remove DNS: not until Phase 4 passes.
