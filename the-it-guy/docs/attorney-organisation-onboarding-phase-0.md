# Attorney organisation onboarding — Phase 0 baseline

## Decision

`organisations` is the canonical owner of identity shared across Arch9: name, legal name, registration number, website, contact details, complete address, and primary logo. `attorney_firms` remains the owner of attorney operations, including firm membership, departments, practice roles, and matter configuration.

During the migration period, `attorney_firms` and `attorney_firm_branding` are treated as legacy sources for backfill and drift comparison. They are not a second canonical owner.

Contract version: `attorney_organisation_identity_v1`.

## Canonical field map

| Product field | Canonical organisation field | Legacy attorney source | Direction |
| --- | --- | --- | --- |
| Firm name | `organisations.name` | `attorney_firms.name` | Attorney onboarding → organisation |
| Display name | `organisations.display_name` | `attorney_firms.name` | Attorney onboarding → organisation |
| Legal name | `organisations.legal_name` | `attorney_firms.name` | Attorney onboarding → organisation |
| Registration number | `organisations.registration_number` | `attorney_firms.registration_number` | Attorney onboarding → organisation |
| Website | `organisations.website` | `attorney_firms.website` | Attorney onboarding → organisation |
| General email | `organisations.company_email` | `attorney_firms.email` | Attorney onboarding → organisation |
| Main phone | `organisations.company_phone` | `attorney_firms.phone` | Attorney onboarding → organisation |
| Address line 1 | `organisations.address_line_1` | `attorney_firms.address_line_1` | Attorney onboarding → organisation |
| Address line 2 | `organisations.address_line_2` | `attorney_firms.address_line_2` | Attorney onboarding → organisation |
| City | `organisations.city` | `attorney_firms.city` | Attorney onboarding → organisation |
| Province | `organisations.province` | `attorney_firms.province` | Attorney onboarding → organisation |
| Postal code | `organisations.postal_code` | `attorney_firms.postal_code` | Attorney onboarding → organisation |
| Country | `organisations.country` | `attorney_firms.country` | Attorney onboarding → organisation |
| Primary logo | `organisations.logo_url` | `attorney_firm_branding.logo_url`, then `attorney_firms.logo_url` | Attorney onboarding → organisation |

After the transition, shared identity edits in Settings must update `organisations`. Attorney surfaces must read those shared fields from the backing organisation instead of relying on a reverse dual-write.

## Confirmed schema gaps

The current organisation schema has no dedicated canonical target for:

- VAT number (`attorney_firms.vat_number`)
- Primary brand colour (`attorney_firm_branding.primary_colour`)
- Secondary brand colour (`attorney_firm_branding.secondary_colour`)
- Dark logo and durable logo storage metadata

Phase 2 must resolve these with typed organisation-level storage. They must not be hidden in an agency-specific onboarding payload.

## Current propagation failures captured by the baseline

- The attorney bridge only populates a backing organisation on first insert.
- Existing backing organisations are linked but not refreshed.
- The bridge omits several mapped address and branding fields.
- Attorney organisation hydration uses an auth snapshot that does not contain website or address fields.
- The workspace resolver does not select website or complete address data for attorney firms.
- Organisation Settings has no `attorney_firm` presentation contract and falls back to agency copy.
- Settings writes shared fields to `organisations` while attorney onboarding writes them to the attorney tables.

## Read-only drift report

Run against an explicitly configured environment:

```bash
npm run report:attorney-organisation-drift
```

The command only performs `select` queries and prints redacted issue metadata by default. Options:

- `--output=/absolute/path/report.json` writes the report to a chosen path.
- `--include-values` includes the actual compared values; handle the output as sensitive operational data.
- `--fail-on-drift` exits non-zero if any firm has drift.

Required environment variables:

- `SUPABASE_URL` or `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Phase 0 acceptance checks

- The field contract is executable and versioned.
- The drift classifier detects missing links, missing organisation rows, missing canonical values, mismatches, type mismatches, and unresolved schema gaps.
- URL, email, and phone formatting differences do not create false drift.
- Diagnostic output is redacted unless values are explicitly requested.
- Environments missing newer branding metadata columns are reported and scanned with the legacy branding shape.
- No production persistence path, migration, trigger, RPC, or RLS policy is changed in Phase 0.

## Staging baseline — 15 July 2026

The read-only, redacted staging scan found:

- 4 attorney firms and 4 valid backing-organisation links
- 1 healthy firm and 3 firms with drift
- 16 missing canonical organisation values
- 1 shared-field value mismatch
- 9 populated values that currently have no canonical organisation target
- 1 environment schema issue: staging is missing the newer attorney branding bucket/path metadata columns

The most frequent missing fields are city and postal code (3 firms each), followed by website, email, phone, address line 1, and province (2 firms each). One firm is missing its canonical primary logo.

The sanitized machine-readable evidence is stored in `docs/database-evidence/attorney-organisation-phase0-staging-summary.json`. The detailed report containing row identifiers remains outside the repository in temporary local storage.
