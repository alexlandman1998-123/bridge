# Conveyancer productisation — P6 provider runtime

P6 turns the F1–F7 provider-neutral contracts into guarded live connections. It does **not** make banks, SARS, municipalities, levy administrators or Deeds providers mandatory. Every denied, unavailable or failed connection returns the matter to the established manual evidence workflow.

## Delivered

- Versioned, firm-scoped runtime controls with disabled/observe/pilot/live modes, exact pilot matters, capability and adapter allowlists, a kill switch, timeout and circuit-breaker policy.
- Versioned P6 profiles in the P1 integration-profile ledger. Profiles contain provider configuration and `env://` or `vault://` references only—never credential values.
- A generic HTTPS adapter plus a manual adapter. The live adapter permits an exact configured origin, reference-only payloads, content-hash verification, idempotency keys, transient credential resolution and minimal responses.
- A server-side runtime function that authenticates the conveyancer, relies on tenant RLS, reads payloads through the user's storage permissions, resolves environment credentials server-side, records secret-free health evidence and opens the circuit after repeated failures.
- Append-only provider health events and cockpit visibility for connected/paused providers.

## Safety boundary

P6 executes one synchronous, explicitly authorised request. Provider responses remain evidence requiring human review and do not create legal truth or silently advance a matter. Durable outbound queues, retries, replay handling and inbound webhooks are P7.

The default control is fail-closed. A firm administrator must create a profile and explicitly enable a sandbox, pilot or live cohort. Production credentials are provisioned outside the database. `vault://` is accepted as a governed reference, but requires a future/runtime vault resolver; the supplied Edge runtime currently resolves `env://` references only.

## Rollout

1. Apply P1–P6 migrations in order and deploy `conveyancer-provider-runtime` with JWT verification enabled.
2. Provision a provider secret as an Edge environment secret; create a sandbox profile referencing it.
3. Run observe mode, then an exact pilot matter with low transaction volume.
4. Confirm provider response references, content hashes, human review and manual fallback.
5. Expand capabilities or cohort only after health evidence is stable. The kill switch remains available at firm level.
