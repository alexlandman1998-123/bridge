# Bond Application Portal — Phase 2 application-scoped access

Phase 2 introduces the dedicated buyer access boundary for the standalone Bond Application Portal.

## Contract

- Each link is bound to exactly one `bond_applications.id`.
- Only a SHA-256 token hash is stored; raw access tokens are never persisted.
- Links expire within 90 days and can be revoked independently of the buyer portal.
- The bearer token is delivered only in `x-bridge-bond-application-token`.
- The portal calls `bridge_bond_application_portal_projection()`, which returns a summary for the linked application only.
- The projection does not expose onboarding drafts, unrelated transaction data, raw document content, bank delivery controls, or originator operations.
- Token issuance and reminder delivery are intentionally deferred to Phase 4 and Phase 5.

## Routes

- Existing buyer entry: `/client/:token/bond-application` (Phase 1 compatibility path).
- New application-only entry: `/bond-application/:accessToken`.

## Deployment note

Deploy `20260905100612_bond_application_portal_phase2_access_tokens.sql` before issuing access links. The create/revoke RPCs are granted only to `service_role`; browser clients can call only the scoped projection.
