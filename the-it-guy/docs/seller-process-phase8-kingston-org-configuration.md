# Seller Process Phase 8 Kingston Org Configuration

Date: 2026-08-06

## Purpose

Phase 8 adds an operational guard for activating the Kingston seller-process
profile on the Kingston organisation only.

It does not add a migration, does not change global defaults, and does not
infer Kingston from organisation name, branding, logo, or any other workspace
appearance.

## Target

- Organisation id: `ec19d0a6-bcba-4eef-aa72-9972de88204d`
- Seller process profile: `kingstons_residential`
- Settings table: `organisation_settings`

## Dry Run

The script is dry run by default. It requires Supabase URL and service-role
credentials so it can inspect the current `organisation_settings` row before
showing the plan.

```bash
node scripts/configure-kingston-seller-process-profile.mjs --confirm-org-id=ec19d0a6-bcba-4eef-aa72-9972de88204d
```

## Apply

The script writes only when both guards are present:

```bash
node scripts/configure-kingston-seller-process-profile.mjs --apply --confirm-org-id=ec19d0a6-bcba-4eef-aa72-9972de88204d
```

Any other organisation id, missing confirmation, or non-Kingston profile keeps
the write guard closed.

## Containment

The script only merges `sellerProcess.profile = "kingstons_residential"` into
the existing settings JSON for the exact Kingston organisation id. Existing
settings keys are preserved.

No migration is created, and no production write is performed by this code
release. Applying the configuration remains an explicit operational action.

## Verification

Run:

```bash
npm run test:seller-process-kingston-org-configuration-phase8
npm run test:seller-process-containment-phase7
npm run test:seller-process-profile-boundary-phase1
```
