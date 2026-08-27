# Document Request Phase 6: Professional Request Propagation

## Purpose

Phase 6 verifies that document requests created by attorneys and bond originators become one shared request container, not separate buyer, seller, agent, or professional-side records.

When a professional clicks request document, the created `document_requests` row must populate the same container model used by:

- buyer portal;
- seller portal;
- agent workspace;
- attorney workspace;
- bond originator workspace;
- internal/admin views.

## Scope

- Transfer attorney requests to buyer.
- Cancellation attorney requests to seller.
- Bond originator requests to buyer.
- Transfer attorney requests to both buyer and seller.
- Bond originator professional-only follow-up requests.
- Upload transition from requested to uploaded with a linked document id.

## Contract

The shared row must preserve these fields:

- `requested_from`
- `visibility_scope`
- `created_by_role`
- `assigned_to_role`
- `request_group_id`
- `requested_document_id`

The Phase 2 container model then decides which audiences can see the request.

Client-visible requests targeted at `buyer`, `seller`, or `buyer_and_seller` appear to the relevant client portal, agent, professional requester, attorneys, and internal users.

Professional-only requests with `shared_role_players` visibility remain out of buyer and seller portals, even if a legacy target field names a client party.

`visibility_scope` is authoritative. A row cannot become client-visible merely because `requested_from` or `assigned_to_role` contains `buyer`, `seller`, or `client`. The same boundary applies to portal containers, client email, and in-app notification delivery.

## Fail-Closed Runtime

Phase 6 removes compatibility writes that silently discarded propagation fields. If the shared audience columns are unavailable, professional request creation now stops with a migration-required error. Client reads return no additional requests when `requested_from` or `visibility_scope` is unavailable, preventing professional-only requests from leaking through legacy role inference.

Apply the Phase 6 migration before activation:

```text
supabase/migrations/20260827163336_document_request_professional_visibility_phase6.sql
```

## Verification

Run:

```sh
npm run verify:document-request-phase6-professional-propagation
```

The generated report is written to:

```text
output/document-request-phase6-professional-propagation.json
```
