# Bridge Migration Pack 1

## Purpose

Migration Pack 1 is the first additive, non-breaking schema hardening pack for Bridge.

It is designed to:

- preserve the current app behavior
- extend the existing Supabase schema into the approved production model
- avoid destructive renames, drops, or incompatible constraint changes
- prepare the database for stricter role access, workflow enforcement, and client-facing production flows

This pack does **not**:

- remove legacy fields
- replace demo/open RLS with final production RLS
- force application reads to new columns immediately
- normalize every legacy value in-place

This pack should be applied to **staging first**.

## Current Schema Baseline

This pack is based on the current schema already present in:

- `/Users/alexanderlandman/the-it-guy/the-it-guy/sql/schema.sql`

The following existing tables remain canonical and are extended rather than replaced:

- `developments`
- `units`
- `buyers`
- `transactions`
- `transaction_finance_details`
- `transaction_subprocesses`
- `transaction_subprocess_steps`
- `documents`
- `document_groups`
- `document_templates`
- `document_requirement_rules`
- `transaction_required_documents`
- `transaction_participants`
- `transaction_comments`
- `transaction_events`
- `transaction_readiness_states`
- `transaction_notifications`
- `transaction_onboarding`
- `onboarding_form_data`
- `client_portal_links`
- `client_issues`
- `transaction_handover`
- `development_settings`
- `development_attorney_configs`
- `development_bond_configs`

## Pack 1 Scope

Pack 1 includes:

1. `development_participants` table
2. extensions to `transactions`
3. extensions to `transaction_participants`
4. extensions to `documents`
5. extensions to `transaction_required_documents`
6. extensions to `transaction_subprocesses`
7. extensions to `transaction_subprocess_steps`
8. extensions to `transaction_handover`
9. extensions to `client_issues`
10. new `transaction_occupational_rent` table

## Non-Breaking Rules

All SQL in this pack must follow these rules:

- only `create table if not exists`
- only `alter table ... add column if not exists`
- only additive indexes
- only additive triggers
- no dropping columns
- no renaming columns
- no tightening of existing status constraints that the current app depends on
- no RLS policy replacement in this pack

## Section 1: Development Participants

### Why

The current schema stores some development-level role information in config tables and JSON. Production access control needs a normalized assignment table.

### New table

`development_participants`

### Required columns

- `id uuid primary key default gen_random_uuid()`
- `development_id uuid not null references developments(id) on delete cascade`
- `user_id uuid references profiles(id) on delete set null`
- `role_type text not null`
- `participant_name text`
- `participant_email text`
- `organisation_name text`
- `is_primary boolean not null default false`
- `can_view boolean not null default true`
- `can_create_transactions boolean not null default false`
- `assignment_source text not null default 'development_default'`
- `is_active boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### Recommended indexes

- `(development_id)`
- `(user_id)`
- `(development_id, role_type)`
- `(development_id, is_primary)`

### Notes

- do not enforce hard one-row uniqueness for all role types yet
- one primary conveyancer and one primary bond originator can be enforced later once backfill is complete

## Section 2: Transactions

### Why

The current `transactions` table already works as the master record, but needs production metadata to reflect origin, legal participants, and archival lifecycle.

### Add columns

- `transaction_origin_role text`
- `transaction_origin_source text`
- `buyer_attorney_name text`
- `buyer_attorney_email text`
- `seller_attorney_name text`
- `seller_attorney_email text`
- `primary_transfer_conveyancer_name text`
- `primary_transfer_conveyancer_email text`
- `main_stage_key text`
- `completed_at timestamptz`
- `archived_at timestamptz`
- `archived_by uuid references profiles(id) on delete set null`

### Notes

- keep `stage` and `current_main_stage` in place for compatibility
- `main_stage_key` is the long-term canonical stage field
- `completed_at` and `archived_at` enable reporting over live/completed/archived scopes

## Section 3: Transaction Participants

### Why

The table exists, but needs to become the canonical transaction assignment model.

### Add columns

- `participant_scope text not null default 'transaction'`
- `is_primary boolean not null default false`
- `assignment_source text not null default 'transaction_direct'`
- `organisation_name text`
- `can_manage_handover boolean not null default false`
- `can_manage_snags boolean not null default false`
- `can_approve_documents boolean not null default false`
- `can_view_financials boolean not null default false`
- `can_assign_roles boolean not null default false`

### Notes

- keep existing booleans as compatibility permissions
- this table should eventually drive transaction access checks
- later, role-scoped permissions should be enforced by RLS, not UI only

## Section 4: Documents

### Why

The existing `documents` table is too lightweight for versioning, approval workflow, and visibility enforcement.

### Add columns

- `bucket_key text`
- `template_key text references document_templates(key) on update cascade on delete set null`
- `status text not null default 'uploaded'`
- `visibility_scope text not null default 'internal'`
- `owner_role text`
- `uploaded_by_user_id uuid references profiles(id) on delete set null`
- `approved_by_user_id uuid references profiles(id) on delete set null`
- `approved_at timestamptz`
- `rejected_at timestamptz`
- `rejection_note text`
- `version_group_id uuid`
- `version_number integer not null default 1`
- `supersedes_document_id uuid references documents(id) on delete set null`
- `metadata jsonb not null default '{}'::jsonb`
- `updated_at timestamptz not null default now()`

### Recommended backfill

- `bucket_key` from existing `category`
- `visibility_scope` from `is_client_visible`
- `owner_role` from `uploaded_by_role`

### Recommended indexes

- `(transaction_id, bucket_key)`
- `(transaction_id, visibility_scope)`
- `(transaction_id, status)`
- `(version_group_id, version_number desc)`
- `(template_key)`

### Notes

- do not remove `category`, `is_client_visible`, `uploaded_by_role`, or `uploaded_by_email` yet
- keep them until the app is fully switched to the new fields

## Section 5: Transaction Required Documents

### Why

This table already powers conditional document logic and should be extended, not replaced.

### Add columns

- `requested_at timestamptz`
- `submitted_at timestamptz`
- `reviewed_at timestamptz`
- `approved_at timestamptz`
- `rejected_note text`
- `requested_by_user_id uuid references profiles(id) on delete set null`
- `linked_bucket_key text`
- `request_source_role text`

### Notes

- do not alter the existing `status` constraint in this pack
- map legacy statuses into the new lifecycle at the application layer first
- keep `uploaded_document_id` as the active/latest linked file

## Section 6: Transaction Subprocesses

### Why

The lane table exists and is close to correct, but production rules require clearer readiness and visibility metadata.

### Add columns

- `finance_type_context text`
- `is_required boolean not null default true`
- `started_at timestamptz`
- `completed_at timestamptz`
- `blocked_reason text`
- `visibility_scope text not null default 'internal'`

### Notes

- keep existing `process_type` as-is
- do not replace `finance` / `attorney` process keys yet

## Section 7: Transaction Subprocess Steps

### Why

The steps table needs to support real dependency logic, OTP handoff, and role-visible workflow states.

### Add columns

- `status_flag_key text`
- `is_blocking boolean not null default false`
- `is_optional boolean not null default false`
- `applies_to_finance_type text`
- `started_at timestamptz`
- `due_at timestamptz`
- `completed_by uuid references profiles(id) on delete set null`
- `visibility_scope text not null default 'internal'`
- `document_dependency_key text`
- `stage_dependency_key text`
- `step_metadata jsonb not null default '{}'::jsonb`

### Notes

- this is where bond-only `OTP Received` step logic lives cleanly
- do not remove `comment`, `owner_type`, or `sort_order`

## Section 8: Transaction Handover

### Why

The table exists, but the approved production model requires attendance confirmation, photos, and signature evidence.

### Add columns

- `scheduled_by_user_id uuid references profiles(id) on delete set null`
- `attendance_confirmed_at timestamptz`
- `attendance_confirmed_by_name text`
- `signature_image_path text`
- `inspection_document_id uuid references documents(id) on delete set null`
- `electricity_meter_photo_document_id uuid references documents(id) on delete set null`
- `water_meter_photo_document_id uuid references documents(id) on delete set null`
- `gas_meter_photo_document_id uuid references documents(id) on delete set null`

### Notes

- keep existing meter reading fields
- sign-off should eventually use both `signature_image_path` and `signature_signed_at`

## Section 9: Client Issues / Snags

### Why

The current snag table exists, but needs enough fields to support assignment, resolution, and client confirmation.

### Add columns

- `category_key text`
- `assigned_contractor_name text`
- `assigned_contractor_contact text`
- `resolution_notes text`
- `addressed_at timestamptz`
- `addressed_by_user_id uuid references profiles(id) on delete set null`
- `completed_at timestamptz`
- `completed_by_user_id uuid references profiles(id) on delete set null`
- `client_confirmed_at timestamptz`
- `client_rejected_at timestamptz`
- `client_feedback text`
- `due_date date`

### Notes

- do not tighten the current `status` constraint yet
- application logic should begin using:
  - `Open`
  - `In Progress`
  - `Addressed`
  - `Completed`

## Section 10: Transaction Occupational Rent

### Why

Occupational rent is approved as a transaction-level, developer-managed module and should not be forced into the generic `transactions` table.

### New table

`transaction_occupational_rent`

### Required columns

- `id uuid primary key default gen_random_uuid()`
- `transaction_id uuid not null unique references transactions(id) on delete cascade`
- `is_enabled boolean not null default false`
- `status text not null default 'not_applicable'`
- `occupation_date date`
- `rent_start_date date`
- `monthly_amount numeric(12,2)`
- `pro_rata_amount numeric(12,2)`
- `next_due_date date`
- `waived boolean not null default false`
- `waiver_reason text`
- `notes text`
- `created_by uuid references profiles(id) on delete set null`
- `updated_by uuid references profiles(id) on delete set null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### Recommended indexes

- `(transaction_id)`
- `(status)`
- `(is_enabled)`

## Section 11: Backfill Requirements

After applying the additive schema, run a controlled backfill.

### Backfill 1: development participants

Populate `development_participants` from:

- `development_attorney_configs`
- `development_bond_configs`
- `development_settings.stakeholder_teams` where still relevant

### Backfill 2: documents

Populate:

- `documents.bucket_key`
- `documents.visibility_scope`
- `documents.owner_role`

from existing fields where possible.

### Backfill 3: transactions

Populate:

- `transactions.main_stage_key` from `current_main_stage`
- `transactions.primary_transfer_conveyancer_*` from current attorney assignments where possible

### Backfill 4: participants

Populate:

- `transaction_participants.is_primary`
- `transaction_participants.assignment_source`
- `transaction_participants.can_manage_handover`
- `transaction_participants.can_manage_snags`
- `transaction_participants.can_view_financials`

from current role assumptions.

## Section 12: What This Pack Does Not Yet Do

Pack 1 does not yet:

- replace demo-wide RLS with production RLS
- remove legacy compatibility fields
- enforce final workflow dependency rules at DB level
- normalize all legacy status values
- switch the app to read exclusively from new fields

Those belong to:

- Migration Pack 2
- RLS Pack 1
- App read/write cutover

## Section 13: Immediate Next Step

After this document is approved:

1. draft the actual SQL file(s) for Migration Pack 1
2. apply them to staging
3. run backfill scripts
4. update the app to dual-write old and new fields
5. then draft RLS Pack 1

## Section 14: Suggested File Outputs

The next implementation artifacts should be:

- `/Users/alexanderlandman/the-it-guy/the-it-guy/sql/bridge_migration_pack_1.sql`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/sql/bridge_backfill_pack_1.sql`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/sql/bridge_rls_pack_1.sql`

This document is the blueprint for the first file only.
