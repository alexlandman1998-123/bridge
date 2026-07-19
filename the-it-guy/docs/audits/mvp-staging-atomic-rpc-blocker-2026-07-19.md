# MVP staging atomic-RPC blocker — 19 July 2026

## Decision

**Do not expose the controlled pilot.** Real staging transactions remain paused.

## Verified target

- Environment: staging
- Supabase host: `isdowlnollckzvltkasn.supabase.co`
- Verification type: read-only

## Blocking evidence

The exact deployed atomic-creation signature was called without creating any data:

```http
POST /rest/v1/rpc/bridge_create_mvp_transaction
{ "p_payload": {} }
```

Observed response:

```text
HTTP 404
PGRST202
Could not find the function public.bridge_create_mvp_transaction(p_payload) in the schema cache
```

This is a deployment/migration blocker. The lead → accepted offer → atomic transaction path cannot be verified or used in staging.

## Supporting evidence

- The `transactions`, `transaction_participants`, `transaction_required_documents`, `transaction_workflow_lanes`, and `notification_events` tables were reachable.
- The production frontend deployment was `READY` at commit `cf710f8e5141f9884d9a8e2140c70e769e20e0d2`.
- `app.arch9.co.za` loaded its sign-in page without browser console errors.
- These checks do not compensate for the missing atomic RPC.

## Scope confirmation

No transaction, notification, user, document, or database record was created, updated, or deleted while collecting this evidence. No secrets, client details, or document content are included.

## Required next action

Proceed to Phase 1: reconcile the staging migration history and determine why [202607180046_mvp_atomic_transaction_creation_phase2a.sql](../../../supabase/migrations/202607180046_mvp_atomic_transaction_creation_phase2a.sql) is not present in this project. Rerun the exact named-parameter probe after the reconciliation.
