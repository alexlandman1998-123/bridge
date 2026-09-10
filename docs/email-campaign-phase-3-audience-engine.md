# Arch9 Email Campaigns — Phase 3: Audience engine

Phase 3 adds repeatable, compliance-first targeting.

## Included

- `email_saved_audiences`: organisation-scoped reusable filter definitions, not stored recipient copies.
- Audience filters for contact role, area, tag and explicit manual contact selection.
- An exact recipient preview RPC that requires an organisation membership and calculates against the current marketing-consent, category subscription, valid-address and suppression records.
- Dispatch applies the same filter clauses again while creating the immutable recipient snapshot.

## Safety properties

Saved audience filters cannot include a bypass flag. A saved segment that used to contain a recipient does not make that recipient sendable if they later unsubscribe, hard-bounce, lose category consent or become invalid. Manual selection also resolves through the same checks.

The preview function is `SECURITY DEFINER` only because it needs to calculate an aggregate across the protected consent and suppression model; it pins an empty search path, checks active membership in its body, has public and anonymous execution revoked, and is granted only to authenticated users.

## Release boundary

This remains source-only while the production migration freeze is active. Apply the reviewed migration only after the ledger-reconciliation release gate.
