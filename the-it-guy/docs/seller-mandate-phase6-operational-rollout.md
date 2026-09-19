# Seller mandate Phase 6 — operational controls and rollout

Phase 6 is a release gate, not a deployment switch. It keeps the seller signing workflow unavailable for broad activation until one named agency has completed the required pilot evidence.

Run `npm run check:seller-mandate-phase6-rollout` to verify the gate contract and prerequisite checks. A passing command deliberately reports `HOLD`; it does not constitute approval and cannot enable a pilot.

Before a pilot owner may request activation, retain evidence for every scenario in `config/seller-mandate-phase6-rollout-plan.json`, including the correction path after one signer has signed. The audit export sample must show the frozen terms version, acknowledgement records, signature records, and superseded/replacement relationship.

The human pilot approval must name the agency, approved legal terms version, rollback owner, and pilot cohort. Global enablement is explicitly out of scope for Phase 6.
