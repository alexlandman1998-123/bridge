# Attorney Public Intake and Leads CRM — Phase 2 Notes

Phase 2 adds the closed database foundation for the Attorney Leads CRM and public journey. It does not add application routes, UI, public resolution, public submission commands, RLS access policies, or grants.

## Migration

`supabase/migrations/202607160001_attorney_public_intake_leads_foundation_phase2.sql`

## Shared Lead compatibility

The existing `public.leads` table remains the canonical CRM aggregate. Phase 2 adds:

- `lead_domain`
- `source_channel`
- `campaign_code`
- `last_contacted_at`
- `next_follow_up_at`
- `closed_at`
- `lost_reason`

Existing rows receive `lead_domain = 'agency'`, preserving their current behavior. The Attorney stage/status checks are conditional on `lead_domain = 'attorney'`, so legacy agency stages remain valid.

Existing `assigned_user_id` and `created_by` columns were confirmed in the migration ledger and were not duplicated.

## New tables

### `public.public_intake_links`

Stores one active canonical journey link per organisation. The slug is globally unique after case normalisation and does not expose an organisation UUID. A composite foreign key ensures the selected Attorney firm belongs to the same organisation.

### `public.attorney_lead_details`

Extends a shared Lead with Attorney service, property, party-role, enquiry, consent, and bounded metadata fields. Composite foreign keys enforce that the Lead and optional intake link belong to the same organisation.

### `public.public_intake_submissions`

Provides the durable idempotency, attribution, consent, and abuse-control audit foundation. It includes a unique intake-link/idempotency key, bounded metadata, an optional IP hash, and tenant-consistent link/Lead relationships.

## Indexes

Phase 2 adds indexes for:

- Lead domain and stage queries
- Attorney assignee and follow-up queries
- Normalised organisation-scoped email and phone lookup
- Public slug resolution
- One active intake link per organisation
- Intake idempotency
- Submission throttling lookups
- Attorney service reporting

## Security posture

All three new tables have RLS enabled with no access policies. All privileges are explicitly revoked from `anon` and `authenticated`.

Phase 3 must deliberately add:

- Attorney member policies
- Role and assignment scopes
- A public-safe journey resolver
- An atomic public submission command
- Minimal grants

Anonymous clients must never receive direct table access.

## Verification

The structural migration test is available as:

```text
npm run test:attorney-leads-foundation-phase2
```

It verifies additive migration safety, canonical contract alignment, tenant-consistent foreign keys, indexes, consent and metadata bounds, RLS lockdown, and the absence of policies, public commands, or grants.

## Deferred

- RLS access policies and grants
- Public resolver and submission RPC/Edge Function
- Internal Attorney Lead services
- Attorney Leads UI
- Public journey UI
- Lead-to-Matter conversion
- Notifications and automated routing

