# Shared journey phase 4 — role readers

## Implemented locally

`bridge_read_shared_matter_journey` reads the active plan, stored legal task outcomes and refresh revision from one stable database snapshot. Static task and phase wording is seeded from the same 73-task Work catalog. Missing planned rows remain not started; unknown catalog items fail explicitly.

The reader authorises access using the existing transaction-spine or scoped portal/onboarding-token helpers. It returns the same allowlisted facts to authorised professionals and clients. No caller-supplied role grants access, and nullable permission results fail closed. No profile, notes, work packets, documents, URLs, contacts or outcome reasons are returned.

The JavaScript reader validates the response and uses the phase 1 contract's completion/N/A calculation and recipient-safe projection. All roles currently receive the minimal buyer-safe shape, not internal attorney metadata. The snapshot's planRevision is the coherent refresh version, not a separate routing-profile revision counter.

## Connected surfaces

- Attorney Work: shared task outcomes are combined with already-authorised Work detail rows before building the Work model. A plan mismatch or failed shared read requires refresh, rather than silently using a competing outcome source.
- Attorney header: selected lane phases, counts, status and task navigation derive from the shared reader.
- Agent transaction overview and developer Unit detail: their existing rollup now carries the shared legal snapshot to the common journey tracker.
- Buyer and seller portal journeys: the same token-scoped client fetches the reader through the rollup. If the broader legacy rollup fails after resolving the portal link, the shared legal read can still succeed independently.
- Common journey tracker: legal phases/tasks replace its legacy milestone rail for matters with legal work. Pre-legal milestones remain when no legal workflow exists.
- Seller linked-matter journey: guessed stage panels and estimated durations are removed; real pending actions and participant contacts remain.
- Old client legal-progress activity cards no longer compete with the shared journey when the new model is present. Explicit attorney communications retain their existing visibility controls.

These changes concern journey surfaces, not a redesign of every dashboard badge or financial metric. Overall transaction rollups remain separate from legal task percentages. Shared tasks do not automatically publish private comments.

## Freshness and failure

The existing rollup refresh paths load this reader. The stable-rollup selector rejects a lower legal revision for the same matter. Failed reads show an unavailable state, not an invented zero-percent legal journey.

Near-live token subscription reliability, reconnect handling and full client-cache revision ordering remain phase 5. This phase does not claim live cross-device delivery has been proven.

## Migration and release

Apply `20260908150256_shared_matter_journey_reader.sql` after phase 3's atomic-command migration, coordinated with the frontend release. It adds phase metadata to the internal catalog and an explicitly granted, access-checked read RPC. The internal tables remain inaccessible to browser roles.

No staging or production migration has been applied. Without the new reader, the new frontend deliberately marks legal progress unavailable and refuses to prepare an unverified Work snapshot.

## Verification

- Isolated PGlite execution: six finance/entity scenarios and five recipient projections; matches phase 2 Work tasks/counts; missing-row behaviour; unknown catalog rejection; current/revoked/wrong-matter token fixtures; actual anon/authenticated SQL roles; NULL permission rejection.
- Static catalog parity covers all transfer, bond and cancellation phase mappings.
- SSR rendering: all five audiences show identical task IDs and exact outcomes; no private fixture data; unavailable states; seller legacy duration panel absent.
- Seven existing presentation/stable-rollup tests and fifteen milestone parity/snapshot tests pass.
- Existing workflow rollup, header phase, phase 3 atomic SQL and refresh-contract tests pass.
- Production build passes with existing bundle/Browserslist warnings.

Tests use isolated permission-helper fixtures, not production membership/token tables. Full hosted migration-chain/RLS validation and authenticated browser acceptance remain required before release.

Commands:

```sh
PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node scripts/shared-matter-journey-reader.test.mjs
node scripts/shared-matter-journey-views.test.mjs
node scripts/attorney-header-phases.test.mjs
npm run build
```
