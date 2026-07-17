# Attorney client-portal preview — Phase 1 contract

Phase 1 introduces the canonical access and projection contract only. It does not create preview sessions, expose an attorney route, add a matter-page button, or authorize preview access.

## Access contexts

- `client_token` preserves the existing `/client/:token` behaviour and delegates to the established token-scoped workspace loader.
- `attorney_preview` requires an opaque preview-session token and a buyer or seller persona. It fails closed until Phase 2 injects the secure server-backed preview loader.

Both access paths produce the same canonical workspace model. The parity projection covers the client, transaction, property, lifecycle, timeline, next actions, document centre, onboarding, mandate, finance, workflow summary, activity feed, notifications, seller journey, and educational content.

## Preview invariants

- Preview responses remove token-bearing fields and exact occurrences of the preview-session secret.
- A supplied transaction identifier must match the returned workspace transaction.
- Buyer preview requires an active buyer context.
- Seller preview requires an active or pending, transaction-linked `client_portal_contexts` row.
- The legacy seller runtime/localStorage path is not considered preview-eligible.
- Preview permissions are always read-only, including uploads, comments, appointment responses, signing, settings, and client decisions.
- The contract does not trust UI controls to establish security; Phase 2 must enforce authorization and read-only access server-side.

## Phase 2 handoff

Phase 2 should provide `previewWorkspaceLoader` from an authenticated, assignment-scoped backend endpoint. The loader must return the same workspace shape as the client-token loader without returning a real client portal token. The contract deliberately throws when this loader is absent.
