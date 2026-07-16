# Attorney Public Intake & Leads — Phase 3 Security Notes

Phase 3 establishes the database security boundary. It does not add an intake page, route, Edge Function, Attorney Leads screen, or Incoming Instructions behaviour.

## Decisions implemented

- Attorney Leads continue to use the shared `leads` aggregate with `lead_domain = 'attorney'`.
- Existing Agency and support policies explicitly exclude Attorney rows. This is required because PostgreSQL permissive RLS policies are combined with `OR`.
- Attorney access is tenant-, role-, branch-, and assignment-scoped according to the Phase 1 contract.
- Assignment and archive changes are protected by a database trigger because row policies alone cannot reliably enforce changed-column capabilities.
- Related contact, detail, activity, submission, and assignment-history visibility is derived from the parent Attorney Lead.
- Attorney assignment history is append-only for authenticated users.
- Anonymous callers have no direct table access.
- The public resolver exposes only active-link presentation fields; it does not expose tenant, firm, user, membership, or settings identifiers.
- The atomic submission command is executable only by `service_role`. A future Edge Function will validate and throttle HTTP traffic before invoking it.
- The command resolves the tenant from the link slug and accepts no organisation or firm identifier.
- Idempotency is scoped to `(intake_link_id, idempotency_key)` and creates at most one Lead.
- Contact reuse uses exact normalized email or phone within the resolved organisation. Names are never identity keys, and a reused contact still receives a new Lead for a new submission.
- Exact contact resolution uses a transaction-scoped advisory lock, preventing concurrent submissions for the same tenant and identity from racing into duplicate contact rows without serialising unrelated submissions.

## Deferred intentionally

- Public route and intake UI
- Edge Function, CAPTCHA, rate limiting, and HTTP response mapping
- Internal Attorney Leads workspace and service layer
- Notifications and assignment automation
- Quote workflow and Lead-to-Matter conversion
- Incoming Instructions changes
- Remote migration deployment

## Verification boundary

The Phase 3 repository test audits policy isolation, capability enforcement, public-safe output, service-role grants, tenant derivation, idempotency, exact contact matching, and the complete atomic write set. Live RLS actor tests should additionally run against a disposable Supabase database before deployment.
