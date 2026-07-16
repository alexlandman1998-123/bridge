# Conveyancer productisation — P7 durable provider transport

P7 makes P6 provider calls durable without making any external provider mandatory. It adds a transactional outbox, bounded retry worker, signed inbound inbox and explicit human reconciliation. Manual evidence remains the continuity path whenever transport is disabled, unavailable, dead-lettered or uncertain.

## Delivered

- Versioned, firm-scoped transport controls for inbound/outbound activation, exact pilots, kill switch, leases, retry limits, replay windows and body-size limits.
- A reference-only outbound command ledger with idempotency, atomic `SKIP LOCKED` leasing, expired-lease recovery, exponential backoff, dead letters and reconciliation-required state.
- A protected dispatcher that claims commands with the service role, invokes P6 through a separate worker secret, and completes every lease through a guarded RPC.
- Versioned HMAC webhook endpoints with separate `env://` secrets, event/capability allowlists and pause/disable revisions.
- A private, hash-addressed provider inbox. Valid webhook bodies are timestamp checked, HMAC verified, size bounded and stored before their envelope is recorded.
- Replay protection across endpoint revisions using provider-profile/event identity.
- Explicit accept-for-review, quarantine and ignore decisions. Inbound evidence cannot create legal truth, approve evidence or mutate workflow.
- Append-only transport receipts, P1 integration-event evidence and cockpit counts for queued, dead-lettered and inbound-review work.

## Operations

Deploy `conveyancer-provider-runtime`, `dispatch-conveyancer-provider-commands` and `conveyancer-provider-webhook`. Provision distinct high-entropy values for `CONVEYANCER_PROVIDER_WORKER_SECRET` and `CONVEYANCER_PROVIDER_DISPATCH_SECRET`, plus each endpoint's referenced HMAC secret. The dispatcher should be called by a trusted scheduler with `x-p7-dispatch-secret`; it must never be exposed as an unauthenticated cron URL.

Start disabled, then observe, then use one exact pilot matter. Test success, timeout, provider 5xx, expired lease, exhausted retries, reconciliation-required outcomes, duplicate webhook delivery, stale timestamp, bad signature and quarantine before increasing the cohort.

P8 remains responsible for operational telemetry, deployment approvals, global kill switches and production incident controls.
