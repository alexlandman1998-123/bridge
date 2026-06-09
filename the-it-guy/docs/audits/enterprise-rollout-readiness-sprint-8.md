# Sprint 8: Enterprise Rollout Simulation, Scale Validation & National Readiness

Supersession note: Sprint 8 produced a NO-GO because of creator-based operational access. Sprint 8.5 remediated that blocker and produced the final GO certification in `docs/audits/ownership-enforcement-rollout-certification-sprint-8-5.md`.

## Executive Decision

Recommendation: NO-GO for national production rollout until the critical RLS findings are resolved and rerun against staging.

The in-memory enterprise model passed the desired isolation, ownership, transfer, offboarding, transaction-spine, document, and reporting invariants. The current migration-policy audit still found direct `created_by = auth.uid()` operational access patterns. That is a national-rollout blocker because historical attribution must not grant former agents operational access after offboarding or agency transfer.

## Section A: National Rollout Simulation Environment

Added:

- `scripts/enterprise-rollout-simulation.test.mjs`
- `npm run test:enterprise-rollout-simulation`

Synthetic workload:

- 3 organisations.
- 5 national regions.
- 100 national branches.
- 25 principals.
- 100 branch managers.
- 100 team leads.
- 1,000 agents.
- 250 assistants.
- 50,000 national leads.
- 25,000 national listings.
- 10,000 national transactions.
- 20,000 national appointments.
- 100,000 national documents.

The simulation is deterministic, in-memory, and does not touch production or staging data.

## Section B: Security Validation Report

Passed in desired model:

- Agency A users cannot see Agency B assets.
- Agency B principals cannot see Agency A reporting assets.
- Branch managers can see only their branch.
- Agents can see only assigned/owned assets.
- Assistants can see only delegated agent scope.
- Documents inherit parent ownership and organisation scope.

Critical implementation risk:

- Migration-policy scan found direct operational access through `created_by = auth.uid()`.
- This can undermine Sprint 4 and Sprint 8 requirements if a transferred/offboarded agent remains the historical creator of an old-agency asset.
- Historical attribution must remain reportable, but it must not be an operational access path unless wrapped in active membership and current visibility scope.

## Section C: Ownership Validation Report

Passed:

- Lead, listing, transaction, and appointment ownership transfers update current owner.
- `createdBy` attribution remains unchanged.
- Offboarding reassignment leaves no active assets owned by removed agents.
- Agency transfer keeps old-agency assets in the originating agency.
- Assistants never become operational owners.

Stress run:

- 300 ownership transfers.
- 10 offboarded agents.
- 1,050 offboarding asset reassignments.
- 50 agency transfers.
- 5,250 retained source-agency assets.

## Section D: Governance Validation Report

Passed:

- Owner can perform highest authority actions.
- Principal can operate agency management actions but cannot transfer ownership.
- Branch manager can manage branch operations but not organisation structure.
- Team lead has limited operational authority.
- Agent cannot manage agency governance.
- Assistant cannot own assets, invite users, or access executive reporting.
- Self-transfer and self-deactivation are blocked in the model.

## Section E: Performance Report

Simulation timings from the latest run:

| Step | Duration |
| --- | ---: |
| Fixture generation | 101.42 ms |
| Organisation isolation scan | 0.59 ms |
| Branch isolation scan | 0.02 ms |
| Ownership transfer stress | 73.83 ms |
| Offboarding stress | 91.66 ms |
| Agency transfer stress | 286.46 ms |
| Transaction spine visibility scan | 0.07 ms |
| Document security scan | 0.16 ms |
| Reporting aggregation | 6.71 ms |

Interpretation:

- The pure business-rule model is fast enough at national scale.
- Real browser/API performance still needs staging validation with Supabase query plans, RLS execution cost, dashboard waterfalls, and storage signed URL checks.

## Section F: Reporting Accuracy Report

Passed:

- Branch lead totals sum to organisation lead totals.
- Branch listing totals sum to organisation listing totals.
- Branch transaction totals sum to organisation transaction totals.
- Assistants are excluded from production agent headcount.
- Old-agency attribution survives agency transfer without moving assets into the destination agency.

Remaining validation:

- Run against staging read models to confirm no dashboard query still counts support users as production agents.
- Validate branch and agency rankings against database-level aggregation, not only in-memory aggregation.

## Section G: Critical Risk Register

Critical:

- Direct `created_by = auth.uid()` access in operational RLS can allow former agents to retain visibility after transfer/offboarding.
- Private-listing document policies previously used broad active organisation membership. Sprint 7 added parent-listing visibility policies, but effective staging policies must be inspected after migration application.
- Storage bucket and signed URL policies were not proven by the in-memory simulation.

Medium:

- Appointment branch access still lacks a canonical `branch_id` in all paths; branch-coordinator visibility may require linked-record branch resolution.
- Transfer/offboarding execution should become a database RPC for atomicity before high-volume production operations.
- Dashboard performance needs real query-plan validation under RLS.

Low:

- Regions are simulated but not yet a first-class residential hierarchy layer.
- Agency acquisition and branch closure are modelled as scenarios, not product workflows.

## Section H: Enterprise Readiness Scorecard

| Category | Score |
| --- | ---: |
| Security | 7.2 / 10 |
| Ownership | 9.0 / 10 |
| Governance | 8.8 / 10 |
| Scalability | 8.8 / 10 |
| Performance | 8.6 / 10 |
| Reporting | 8.7 / 10 |
| Compliance | 7.4 / 10 |
| Operational Readiness | 7.8 / 10 |

## Section I: Go / No-Go Recommendation

Current recommendation: NO-GO for national production rollout.

Bridge is structurally close: the desired enterprise model holds under a Harcourts-sized synthetic workload. The blocker is not the ownership or governance model; it is database enforcement proof.

Required before changing this to Go:

- Replace or wrap direct `created_by = auth.uid()` operational access with active membership and current scope checks.
- Apply Sprint 7 and Sprint 8 migrations to staging.
- Run the simulation plus staging RLS probes using real Supabase roles.
- Validate storage bucket and signed URL access for listing, seller, buyer, and transaction documents.
- Run dashboard performance traces against national-scale seeded staging data.

Once those pass, Bridge can move from "architecturally ready" to "enterprise rollout ready."
