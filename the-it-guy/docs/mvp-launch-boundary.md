# Arch9 MVP Launch Boundary

**Version:** `arch9_mvp_launch_scope_v1`  
**Purpose:** Keep the MVP focused on the residential transaction journeys that Arch9 can operate reliably at launch.

## Supported transaction scope

| Dimension | MVP-supported values |
| --- | --- |
| Transaction type | `resale`, `private_sale`, `development_sale` |
| Finance | `cash`, `bond`, `hybrid` |
| Property tenure | `freehold`, `sectional_title`, `estate_hoa` |
| Buyer entity | `individual`, `company`, `trust` |
| Seller entity | `individual`, `company`, `trust`, `developer` |

`developer` is valid only for a `development_sale`.

An existing seller bond is supported as an additional condition. It activates the cancellation workflow; it is not a separate transaction type.

## Not in launch scope

- Commercial transactions and commercial lease workflows
- Property tenures outside the three supported residential categories
- Unknown finance, buyer entity, seller entity, or property-tenure facts
- New workflow types that require rules beyond the canonical residential transaction lanes

## Implementation contract

`src/core/transactions/mvpLaunchScope.js` is the canonical policy.

`resolveTransactionRoutingProfile(...)` attaches a `launchScope` result to every routing profile:

- `supported`: safe for the MVP transaction creation flow
- `incomplete`: required routing facts are missing; collect them before creation
- `out_of_scope`: do not route through the MVP workflow

Phase 1A is intentionally **preflight-only**: it exposes scope eligibility without blocking existing conversion paths. Phase 2 will make `supported` a hard requirement inside the atomic transaction-creation command, after the affected form paths collect all required facts.

## MVP launch roles

`src/core/transactions/mvpLaunchRoles.js` is the canonical launch-role catalog. It defines the actor's transaction role, allowed operating scope, and the work the actor owns.

Every routing profile also includes `launchRolePlan`, which describes the roles required at each point in the lifecycle:

- `requiredAtCreation`: buyer, seller/developer representative, and agent where applicable
- `requiredByOtp`: entity signatories and trustees
- `requiredByFinance`: bond originator for bond and hybrid transactions
- `requiredByTransfer`: transfer attorney, plus bond/cancellation attorneys when applicable

This is intentionally a role-plan preflight only. It does not yet create participants or change current permission behaviour. Participant creation, invitation, and stage-gate enforcement will use this plan in Phase 2 onward.

## MVP transaction truth contract

`src/core/transactions/mvpTransactionTruth.js` defines the minimum operational answer set for every active transaction:

1. Current stage
2. Active blockers
3. Next action and owner
4. Required-document state
5. Required and missing participants
6. Latest activity
7. Readiness to progress

The contract accepts the transaction record, routing profile, participants, document requirements, workflow lanes, and events. It is intentionally data-source neutral so the transaction overview, module pages, daily consistency scanner, and future transaction-creation command can use exactly the same derived truth.

## MVP feature freeze

Only these workstreams may proceed until the core transaction journey is pilot-ready:

- Launch scope and role/transaction-truth contracts
- Transaction spine and idempotent creation
- Workflow controls and stage integrity
- Canonical document control
- Participants, signatories, and invitations
- Shared transaction overview
- Communications and delivery retries
- Simulations, reconciliation, and release operations

The following workstreams are frozen: CRM expansion, AI automation, advanced analytics, calendar expansion, commercial expansion, enterprise workspace work, custom workflow builders, and billing/payments work.

Use the delivery guard before starting a workstream:

```bash
node scripts/mvp-delivery-guard.mjs --workstream=workflow_controls
```

Frozen or unknown work requires an explicit product exception and a corresponding update to this boundary before implementation.

## Phase 2A: canonical transaction creation

All new MVP transactions now pass through `prepareMvpTransactionCreationCommand(...)` before persistence. The command rejects incomplete or out-of-scope routing facts, requires the organisation, listing, buyer lead, assigned agent, and accepted offer, and derives a stable idempotency key from the organisation and accepted offer.

The `bridge_create_mvp_transaction(jsonb)` database command persists the transaction, buyer resolution, lead conversion link, and accepted-offer link in one database transaction. It also takes a transaction-scoped advisory lock, so a retry or double-click returns the same transaction instead of creating a duplicate matter.

Apply `supabase/migrations/202607180046_mvp_atomic_transaction_creation_phase2a.sql` before enabling this path in an environment. It is intentionally the only supported production persistence route for `createTransactionFromLeadOverride`; local mock mode remains isolated for development only.

## Phase 2B: participant bootstrap

The creation command now writes the initial buyer, seller/developer representative, and agent participants together with the transaction. It also records every planned role as a durable participant requirement, including trustees, company signatories, bond originators, and attorneys that are not yet assigned. This prevents entity and finance scenarios from losing their required actors before the invitation and assignment phases.

## Phase 2C: document bootstrap

The same creation command now seeds a canonical transaction document checklist. The checklist adapts for cash, bond, and hybrid finance; individual, company, and trust purchasers/sellers; development sales; and existing seller-bond cancellation. Each requirement has a stable key and responsible role, so the transaction truth contract and later workflow gates use the same checklist.

## Phase 2D: workflow bootstrap

New transactions now start with one main onboarding lane plus finance, transfer, and—where applicable—bond lanes. These lanes have stable owners and initial stages, giving the transaction overview and gate engine a single workflow starting point rather than relying on module-specific setup.

## Phase 3A: onboarding gate

The transaction truth contract now exposes an explicit onboarding gate. While the transaction is in setup, it blocks progression until the buyer and seller/developer representative are captured and their required onboarding documents are complete. The resulting blocker identifies the owner and next action, so the overview and workflow action surfaces agree on why progression is unavailable.

## Phase 3B: OTP execution gate

At the OTP stage, Arch9 now reuses the onboarding gate and adds the entity-signing roles from the launch role plan. Trust purchasers require a captured trustee and company parties require their signatory before the OTP is treated as ready to execute. The transaction truth response exposes `otpGateSatisfied` and the exact missing actor.

## Phase 3C: finance gate

At finance, cash and hybrid transactions require verified proof of funds. Bond and hybrid transactions require an assigned bond originator and verified pre-approval or application evidence. The transaction truth response exposes `financeGateSatisfied` and blocks transfer readiness until the applicable evidence is complete.

## Phase 3D: transfer gate

At transfer, Arch9 requires a transfer attorney, finance readiness, and completion of the canonical required-document checklist. The transaction truth response exposes `transferGateSatisfied` and names the document or owner preventing instruction from moving into transfer.

## Phase 4A: shared transaction control board

The workflow read model now includes `mvpControlBoard`: one module-neutral operational view of stage, status, next action, onboarding/OTP/finance/transfer gates, blockers, and counts. Module pages can use this instead of independently interpreting transaction state.

## Phase 4B: shared control-board surface

`MvpTransactionControlBoard` is the reusable workspace component for the shared control board. It presents stage, next action, gate states, and the highest-priority blockers consistently across transaction-facing modules, including a compact mode for constrained screens.

## Phase 4C: client portal integration

The client portal now receives the shared control-board model from its workflow read model and renders the compact surface on the overview. This gives buyers and sellers a consistent stage and gate summary without duplicating lifecycle logic in the portal.
