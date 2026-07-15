# Conveyancer Matter Plan — Phase A2

## Purpose

Phase A2 turns the A1 contract into a deterministic draft-plan generator. It consumes the existing canonical transaction-facts and legal-requirements resolvers, so matter planning and the current attorney workflow share one interpretation of finance, party, property and legal-lane facts.

The executable generator is `src/services/attorneyWorkflow/conveyancerMatterPlanGenerator.js`.

## Generation behaviour

- Every matter receives the common transfer path from instruction triage through close-out.
- Missing classification facts create an explicit fact-resolution action and gate dependent work.
- Company, trust and multi-party matters add signing-authority work.
- Bond or hybrid finance adds coordination of the bank-appointed bond attorney.
- A seller's existing bond or cancellation flag adds coordination of the existing lender's appointed cancellation attorney.
- The transfer attorney coordinates confirmed bank-appointed firms and platform access; the plan never gives them appointment authority.
- Property tenure changes the clearance evidence contract.
- VAT treatment changes the tax evidence contract.
- Existing legal document and signature requirements feed the relevant plan actions.
- Each generated action records the rule and rationale that produced it.

## Safe regeneration

A regenerated plan is a new immutable version linked to the previous plan. Runtime progress is carried forward only where the complete generated action definition is unchanged and the carried state still validates against A1. Changed or invalid actions reset safely and the reason is recorded in the generation trace.

## Phase boundary

A2 generates and validates draft plans in memory. It adds no database persistence, activation UI, reminders, automatic event handling or document generation. Those later phases must consume the generated plan and preserve the A1 invariants.

