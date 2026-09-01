# Portal Non-Production Pilot — Phase 6

Phase 6 is the real, single-transaction rehearsal in a safe environment. It follows a clean Phase 5 `ready_for_internal_pilot` decision and creates an evidence receipt. It does not activate a live portal or approve a public launch.

## Pilot boundary

- Use **one** non-production transaction only, with confirmed test data.
- Name the pilot operator, rollback owner, start time and completion time before beginning.
- Confirm stop criteria before any interaction. If a role sees incorrect data, an upload misrepresents its state, a primary action fails, or an error cannot be recovered, stop and record an open incident.
- Do not put customer data, passwords, access tokens, document contents, or unredacted screenshots in the receipt. References to secured evidence are sufficient.

## Evidence required to pass

For buyer, seller, agency and developer, record a timestamped desktop screenshot, mobile screenshot, and a passing result. For buyer, seller, agency, developer, bond originator and transfer attorney, record a timestamped sync/visibility evidence reference. This evidence proves activity propagation, refresh persistence and role isolation.

Pass these inputs to `buildPortalNonProductionPilotReceipt()`. The returned decision is only `non_production_pilot_evidence_recorded` when Phase 5 is clean and every safety and evidence requirement is present. `productionReleaseAllowed` remains `false` in all outcomes.

Run `npm run test:portal-non-production-pilot-phase6` to verify the gate contract locally.
