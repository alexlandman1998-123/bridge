# Public websites phase 5: CRM lead ingestion

Phase 5 connects public agency website enquiries to the existing CRM without allowing a browser to select a tenant or write directly to CRM tables.

## Delivered contract

- The server resolves the organisation from an active hostname and published website.
- One service-role-only database command atomically creates or resolves the contact, creates exactly one CRM lead, records consent and attribution, stores the routing decision, and queues the notification audit event.
- Property enquiries are accepted only while both the canonical listing projection and the agency-website channel are published.
- Page enquiries must reference a page in the currently published revision, and the form purpose must match the page kind.
- A stable idempotency key makes browser and provider retries safe. Exact tenant-scoped email or phone matches reuse a contact; every genuine new submission still creates its own lead.
- Assigned listing enquiries route to an active listing agent. Other enquiries route to the unassigned CRM queue and notify the first active principal/admin/branch manager.
- If delivery to an assigned agent fails, a durable manager fallback event is created and attempted. Notification failure never rolls back or removes the CRM lead.
- Oversized payloads, a honeypot, and a ten-minute request limit protect the endpoint. The limit uses an HMAC-SHA256 fingerprint; raw IP addresses are never stored.
- Privacy consent is mandatory. Marketing consent is optional and stored separately.

## Production configuration

The website runtime requires these server-only values:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
WEBSITES_LEAD_FINGERPRINT_SECRET
ARCH9_APP_URL
```

`WEBSITES_LEAD_FINGERPRINT_SECRET` should be a generated value of at least 32 random characters. Do not expose it or the service-role key through a `NEXT_PUBLIC_` variable.

The shared `send-email` function also requires `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL`. `LEAD_OPERATIONS_EMAILS_ENABLED=false` deliberately records a skipped delivery instead of treating it as sent.

## Verification

Run the static contract and application checks:

```bash
cd the-it-guy
npm run test:public-websites-phase5
npm run test:public-websites-phase4

cd ../apps/websites
npm run typecheck
npm run build
```

With the local Supabase stack running, execute `supabase test db`. The Phase 5 pgTAP suite proves that receipt PII and all mutation commands are unavailable to anonymous and authenticated browser roles while remaining callable by `service_role`.

## Release smoke test

1. Publish a site, a page, and one listing to the website channel.
2. Submit a page enquiry using email only and confirm one Contact, one Lead, one routed receipt, and one notification event.
3. Retry the same request with the same idempotency key and confirm no second Contact or Lead.
4. Submit a property enquiry and confirm the active listing agent owns the Lead.
5. Disable or remove that agent membership and confirm the Lead lands unassigned and the manager receives the notification.
6. Force the agent email delivery to fail and confirm the manager fallback event records its own outcome without changing the Lead.
7. Unpublish the website listing channel and confirm the public property enquiry is rejected.

Phase 5 is complete at source level after the migration and email function are deployed. Phase 6 publication isolation/recovery is now implemented locally; production release still requires migration deployment plus the staging and cross-device acceptance work defined in the foundation roadmap.
