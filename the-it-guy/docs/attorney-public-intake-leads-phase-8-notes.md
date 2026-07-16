# Attorney Leads — Phase 8 Hardening and Demo Readiness

Phase 8 closes the first-release delivery sequence. It adds rollout evidence and operational guardrails; it does not introduce a new Lead lifecycle, notification engine, or Incoming Matters behaviour.

## Delivered

- A tenant-safe, read-only launch-readiness command available to authenticated firm members.
- A launch panel beside the canonical public Journey link.
- Blocking checks for the active Attorney firm, active Journey link, six-service configuration, and an Attorney-qualified owner.
- Non-blocking checks for branding, public contact details, overdue follow-ups, and failed conversion attempts.
- Aggregate 30-day submission and operational counts without exposing public submission metadata or personal information.
- Stronger Edge Function response headers, a response correlation identifier, and standards-compliant `Retry-After` throttling guidance.
- An explicit duplicate-submission confirmation message for refreshes and retries.
- A single Phase 8 certification command covering Phases 1–8 and the unchanged Incoming Matters boundary.

## Demo rehearsal

1. Apply migrations `202607160001` through `202607160007` in order.
2. Configure `ATTORNEY_INTAKE_IP_HASH_SECRET` and deploy `attorney-public-intake` with JWT verification disabled only for this function.
3. Open **Pipeline → Leads → Public link** and clear all blocking readiness items.
4. Preview the Journey on a mobile viewport with `?source=instagram&campaign=transfer-quote`.
5. Submit once, refresh/retry the same request, and verify only one Lead appears.
6. Assign the Lead, add contact activity, schedule a follow-up, qualify it, and convert it deliberately.
7. Confirm the resulting active Matter opens and that no record was added to Incoming Matters.
8. Run `npm run verify:attorney-leads-phase8` before release.

## Production gate

Code-level readiness is not a substitute for a deployed smoke test. Release requires the migration, Edge Function secret and deployment, an active real firm fixture, authenticated tenant-isolation checks, and one browser-to-database duplicate/throttle rehearsal in staging.

## Deferred after first release

- Managed CAPTCHA or challenge provider.
- Automated notifications, SLA escalation, and assignment routing.
- Quote generation and acceptance.
- Configurable service catalogues and campaign management.
- Cross-vertical extraction for Estate Agencies, Bond Originators, and Developers.
