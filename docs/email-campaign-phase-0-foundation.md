# Email Campaigns — Phase 0 foundation

## Release boundary

The linked production database is under the repository's migration-ledger freeze. This work is source-only until the approved reconciliation/release path admits the feature migration. Do not use broad `supabase db push`, `--include-all`, or migration repair to release it.

## Canonical contact contract

`email_marketing_contacts` is the deduplicated organisation-level sendable-address projection. It is not a replacement CRM table.

- Exactly one projection row exists per organisation/email.
- `email_marketing_contact_sources` retains CRM/contact/import lineage so a campaign can explain why a recipient was included.
- `contact_marketing_preferences` alone owns consent; projection refreshes cannot change it.
- `email_suppressions` always wins over contact eligibility.
- `email_campaign_recipients` is an immutable send-time snapshot, never a live audience.

The service-role-only `email_campaign_refresh_contact_projection(organisation_id)` imports valid addresses from the established `contacts` and `leads` CRM records. It does not send mail and has no `authenticated` or `anon` execution grant.

## Release gates

1. Ledger reconciliation authorises the new migration.
2. Apply it to staging via the approved one-migration release path.
3. Run `node scripts/email-campaign-phase0.test.mjs` and targeted staging checks.
4. Confirm RLS, function privileges, sender-identity verification, and contact-projection counts.
5. Run a one-recipient campaign pilot; only then enable an agency cohort.

## Non-negotiable security controls

- Campaign content and audience cannot change after sending begins.
- Browser users cannot execute the CRM projection function.
- A sender identity can only be created as `pending`; verification is server-controlled.
- Suppression is checked when the audience snapshots and again immediately before a provider call.
