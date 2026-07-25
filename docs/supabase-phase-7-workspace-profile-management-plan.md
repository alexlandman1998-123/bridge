# Supabase Phase 7 Workspace Profile Management Plan

Generated: 2026-07-25

## Scope

Phase 7 isolates the workspace profile management migration. This phase does not apply SQL, repair the migration ledger, or retire the Phase 0 broad-push freeze.

The target stream is:

- `workspace_profile_management`

## Implemented

- Verified that the Phase 5 application manifest groups the workspace profile row under `workspace_profile_management`.
- Verified that staging and production runners produce the same one-row execution plan.
- Confirmed that the expected RPC is not live, so this row is a candidate for original single-file staging application after dependency checks.

## Workspace Profile Management Plan

| Version | Depends On | Action | Evidence | File |
| --- | --- | --- | --- | --- |
| `202607240001` | `stream preflight` | `apply_original_after_dependency_check` | `none_live` 0/1 | `202607240001_agent_profile_management_rpc.sql` |

## Runtime Shape

The migration defines `public.bridge_update_organisation_user_profile(uuid, jsonb)`.

The RPC lets an organisation admin update an organisation user profile and, when that organisation user is linked to an auth user, keeps the matching `profiles` row aligned for:

- email
- first name
- last name
- full name
- phone number
- avatar URL
- branch and primary branch

## Execution Rules

This row can only be applied after staging preflight proves:

- `organisation_users` exists with the expected profile and branch columns
- `profiles` exists with the expected identity fields
- `bridge_is_org_admin(uuid)` is present and enforces the admin gate
- the file is applied alone, not as part of a broad migration push
- catalog and behavior checks pass before production evidence is recorded

## Required Smoke Evidence

Before production, staging evidence should prove:

- an organisation admin can update an organisation user profile
- a non-admin user is rejected
- changing `branchId` updates both `branch_id` and `primary_branch_id`
- updating a linked organisation user upserts the corresponding `profiles` row
- omitted JSON fields do not overwrite existing profile values
- execute permission is available to `authenticated` and not to `anon`

## Current Blockers

Live mutation remains blocked by the repository gates:

- No staging target environment is configured.
- No reviewed staging evidence exists for `202607240001`.
- Production execution requires reviewed staging evidence before apply or ledger repair.
- Phase 8 closeout is still blocked because all 20 manifest rows lack complete production evidence.

## Read-Only Verification Commands

```bash
node scripts/supabase-phase6-staging-execution.mjs --plan --stream workspace_profile_management --json
node scripts/supabase-phase7-production-execution.mjs --plan --stream workspace_profile_management --json
```

