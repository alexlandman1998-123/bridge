# Document Generator Final-Mile Phase 5

## Scope

Phase 5 is the staging recovery pass for the already generated final signed documents.

The recovery sequence is intentionally narrow:

1. Apply the single corrective migration `202607260001_corrective_final_completion_status_truth.sql`.
2. Deploy `dispatch-final-signed-document`.
3. Deploy `resolve-final-signed-document-access`.
4. Re-run final delivery dispatch for the pinned staging OTP and mandate packets.
5. Re-read `bridge_get_final_completion_status_f5` and only accept `ready=true` when recipient delivery is complete.

## Safety

Smoke tests must not send real customer email. controlled test recipients remain suppressed and are recorded as durable delivery success with `suppressed:controlled_test_recipient:<signer-id>` provider evidence.

The staging blocker exposed one extra deployment issue: service-role JWT rotation can make an exact string comparison against the function runtime secret reject a still-valid service-role key. The final dispatcher and access resolver now accept service-role JWT rotation by requiring:

- a `service_role` claim,
- a Supabase issuer,
- the same project ref as `SUPABASE_URL`,
- a non-expired token when an expiry is present.

This keeps normal workspace, portal, and signer access unchanged.

The two staged packets were generated before the immutable Phase 5 binding table had rows for their rendered documents. For this staging recovery only, the approved runtime digest is the sealed plan in `config/legal-document-final-mile-phase5-staging-recovery.json`, and the existing generated artifacts are bound to that digest before delivery retry.

The recovery also applies `202607260002_corrective_phase5_lifecycle_trace_hash_format.sql` because final artifact evidence in staging stores a bare 64-char SHA-256 while the lifecycle trace table originally only accepted `sha256:<hex>`. The correction keeps both persisted formats valid.

Older staging packets can predate Phase 3 visual signature evidence. Their immutable final-artifact evidence must not be rewritten. Access recovery therefore stays narrow: `resolve-final-signed-document-access` may accept legacy evidence only when an exact Phase 5 `final_delivery_completed` lifecycle trace exists for the same packet, version, organisation, and artifact hash.
