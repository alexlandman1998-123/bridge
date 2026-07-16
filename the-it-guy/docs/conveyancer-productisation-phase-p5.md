# Conveyancer productisation P5 — document storage, rendering and signing

P5 connects the governed C/D document contracts to the existing Arch9 packet renderer, private object storage and signer portal. It adds a provider-neutral job boundary without creating a competing document store.

## Delivered

- Versioned P5 controls with disabled, observe, pilot and live modes, exact pilot matters, allowed operations/adapters and an independent kill switch.
- Reference-only render, signing-release, signed-pack-finalisation and manual-upload commands.
- C6 approval, content and provenance bindings before rendering.
- Mandatory human release plus D2 signing-plan binding before signing links can be generated.
- SHA-256 verification of rendered, uploaded and signed object-storage artifacts.
- Reuse of the existing Arch9 packet renderer and signer portal through a lazy, provider-neutral adapter.
- A manual upload adapter so the workflow does not depend on a signing provider.
- Durable document jobs with idempotent enqueue, exact-user claim and guarded completion.
- Appending generated/manual/signed artifacts into the P1 artifact ledger and signing transitions into the P1 signing ledger.
- HMAC-verified, replay-windowed provider webhook ingestion with bounded metadata and no raw document bytes.
- Provider callbacks remain evidence and create a signed-pack review requirement; they do not accept signatures automatically.
- P5 pipeline health and a route to Documents in the conveyancer cockpit.

## Storage and privacy boundary

Document bytes remain in private object storage. P5 persists bucket/path references, hashes and minimal provenance. Command payloads reject document content, HTML, file bytes, signing links, access tokens and secrets. Signer data is reduced to internal signer references, roles and order.

## Migration and activation

P5 requires `202607160006_conveyancer_productisation_p5.sql` after P1 and P2. It adds no enabled control and executes no document job by default.

1. Verify P1/P2 in the target environment.
2. Apply P5 and run `sql/conveyancer-productisation-p5-verify.sql`.
3. Configure `CONVEYANCER_SIGNING_WEBHOOK_SECRET` only if an external provider callback is used.
4. Run observe mode against approved C6 drafts and compare output with the established document workspace.
5. Pilot exact matters with the manual adapter first.
6. Add `arch9_packet` rendering, then signing release, as separately approved operations.
7. Keep signed-pack review mandatory and monitor failed jobs and provider events.

Stopping P5 requires a new control revision with its kill switch enabled. Existing Documents and manual signed-pack workflows remain available.

## Verification

```sh
npm run test:conveyancer-productisation-p5
```
