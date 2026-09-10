# Arch9 Email Campaigns — Phase 1: Trust, consent and deliverability

This source-only phase adds the compliance and sender-trust contract around the Phase 0 campaign engine. It must be released only after the active Supabase schema freeze is formally lifted.

## What Phase 1 enforces

- Every campaign names one active subscription category.
- The dispatcher snapshots only recipients with both organisation-wide `opted_in` consent and an explicit `subscribed` status for that category.
- A one-click unsubscribe remains an organisation-wide stop. The hosted preference centre lets a recipient restore only the categories they choose.
- Suppression is rechecked immediately before every provider call.
- Sender identities are refreshed from Resend through an authenticated admin-only Edge Function; browser users cannot mark a sender verified.
- Per-organisation sending policies bound worker batches and daily recipient volume. A paused policy prevents dispatch.
- `email_deliverability_health` surfaces health per sender identity. Complaint rate above 0.1% yields `paused`; bounce rate above 5% yields `warning`. Operations should set the organisation policy to paused before resuming a problematic domain.

## New server endpoints

- `email-preference-centre` is public but requires the recipient's unguessable unsubscribe token. It is deliberately configured with `verify_jwt = false`.
- `email-sender-verification` requires a signed-in sender-capable organisation user and checks Resend's domain API with `RESEND_API_KEY` held only in Supabase secrets.

## Release gate

Do not use `supabase db push --include-all` while the Phase 0 schema guard is active. Once the migration ledger is reconciled, apply the reviewed migration, deploy both new functions, provision the default subscription categories for each enabled organisation through the trusted server workflow, then test with a non-production audience.
