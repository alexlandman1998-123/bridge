# Attorney firm-first allocation operations

Phase 9 adds a durable alert outbox for firm nomination, acceptance, internal allocation, activation readiness, decline/replacement, and SLA escalation. It does not send email, SMS, or push messages. Delivery providers must consume the alert boundary separately and preserve its deduplication key.

The firm acceptance SLA is 48 hours. The internal primary-attorney allocation SLA is 24 hours after firm acceptance. Run the service-role refresh on a controlled schedule to create overdue alerts:

```bash
npm run refresh:attorney-firm-first-allocation:sla
```

Only a server-side `SUPABASE_SERVICE_ROLE_KEY` may execute the refresh function. Never place that key in a `VITE_` variable. Firm administrators, directors, transaction owners, and organisation administrators can read permitted alerts. Acknowledgement uses the dedicated RPC; authenticated users cannot directly update the outbox table.

State transitions automatically resolve prior open alerts. Alerts use a state-timestamp deduplication key so retries do not create duplicate notifications. External delivery failures must not roll back the underlying legal allocation state.
