# Public websites pilot closeout Phase 3: durable CRM leads

Phase 3 closes the operational gap between a successful public enquiry and a reliably actioned CRM lead.

## Delivered

- Public forms still use the tenant-resolving atomic database command, so a successful response means the Contact, Lead, consent, attribution, routing decision, activity, receipt, and primary notification event already exist together.
- The public route no longer performs one-shot email delivery. It asks the service-only `website-lead-dispatcher` to claim the queued event.
- A Postgres outbox claim uses `FOR UPDATE SKIP LOCKED`, stable provider idempotency keys, attempt counters, and due timestamps.
- Assigned-agent delivery receives three attempts. Manager delivery receives five attempts. The retry cadence is 1, 5, 15, 30, and 60 minutes as applicable.
- A terminal assigned-agent failure creates one manager fallback event. A fallback can retry but cannot recursively create another fallback.
- Claims left in `processing` for more than five minutes are returned to the queue.
- Supabase Cron invokes the dispatcher every minute through `pg_net`; the project URL and service-role credential are read from Vault.
- Browser roles cannot claim, complete, reset, or schedule the worker. Lead receipt PII remains unavailable to browser clients.

## Environment contract

Deploy the migration and `website-lead-dispatcher` together. The environment requires:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ARCH9_APP_URL
RESEND_API_KEY
RESEND_FROM_EMAIL
LEAD_OPERATIONS_EMAILS_ENABLED
```

Vault must also contain `arch9_project_url` and `arch9_service_role_key` for the same Supabase project. A missing Vault secret makes the scheduled bridge a safe no-op and leaves events queued for later recovery.

## Verification

```bash
cd the-it-guy
node scripts/public-websites-pilot-phase3-durable-leads.test.mjs
npm run test:public-websites-phase5

cd ../supabase/functions
deno check website-lead-dispatcher/index.ts
deno test _shared/websiteLeadDispatch.test.ts
```

The staging acceptance is complete when a Kingstons enquiry creates exactly one CRM Lead, the primary event reaches `sent` or intentionally `skipped`, a forced provider failure schedules retries, and a terminal assigned-agent failure creates and processes one manager fallback event.

The staging-only SQL smoke harness creates synthetic queue rows, verifies retry and fallback state, removes those rows, and leaves the real Kingstons CRM Lead untouched:

```bash
supabase db query --linked --project-ref "$SUPABASE_STAGING_PROJECT_REF" \
  --file the-it-guy/scripts/public-websites-pilot-phase3-staging-smoke.sql
```
