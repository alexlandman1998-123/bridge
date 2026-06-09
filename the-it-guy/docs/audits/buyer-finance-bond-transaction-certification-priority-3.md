# Priority 3 Buyer -> Finance -> Bond Application -> Transaction Certification

Date: 2026-06-09  
Scope: Buyer Lead -> Offer/OTP -> Buyer Onboarding -> Finance -> Bond Application -> Quotes -> Instruction -> Transaction

## Final Recommendation

GO WITH REMEDIATION REQUIRED.

The buyer-to-transaction spine is structurally sound. Accepted offers create or reuse one transaction, buyer onboarding persists the finance profile, required documents are generated from canonical rules, selected roleplayers are activated, bond-originator intake applications are idempotent, bank applications and quotes are transaction-scoped, and accepted quotes/instructions are constrained to the finance workflow.

The main certification gap is automation completeness: bond finance only becomes a real originator application when a bond originator roleplayer is already selected or activated. If no originator is selected, the system logs and notifies the agent, but it does not automatically route to a default Ooba/BetterBond-style partner from the buyer onboarding alone. That is operationally safe, but not fully partnership-ready at national scale.

## Lifecycle Diagram

```text
Buyer Lead
  leads
  lead_activities
        |
        v
Canonical Offer / OTP
  offers
  offer_portal_sessions
  offer_seller_review_sessions
        |
        v
Accepted Offer Conversion
  transactions
  buyers
  transaction_onboarding
  onboarding_form_data
        |
        v
Buyer Onboarding
  onboarding_form_data
  transaction_funding_sources
  transaction_required_documents
  document_requirement_instances
        |
        v
Finance / Bond Workspace
  transaction_finance_workflows
  transaction_bond_applications
  transaction_bond_quotes
  transaction_bond_offer_decisions
  transaction_bond_instructions
        |
        v
Transaction Spine
  transaction_participants
  transaction_role_players
  transaction_attorney_assignments
  transaction_events
  documents
```

## Trigger Audit

| Trigger | What Happens Today | Certification |
| --- | --- | --- |
| Seller accepts buyer offer | `bridge_submit_seller_offer_decision()` can create/reuse a transaction and mark the offer `converted_to_transaction`. | Pass |
| Agent converts accepted offer | `createTransactionFromAcceptedCanonicalOffer()` reuses `offer.transaction_id` or creates via `createTransactionFromLeadOverride()`. | Pass |
| Repeated conversion / refresh | Existing transactions are searched by `accepted_offer_id`, `originating_buyer_lead_id`, and offer linkage before insert. | Pass |
| Buyer onboarding sent | Requires an existing transaction; buyer lead page blocks onboarding if no accepted offer/transaction exists. | Pass |
| Buyer onboarding submitted | Saves `onboarding_form_data`, updates transaction finance fields, creates required docs, activates selected attorneys/originator, sends notifications. | Pass |
| Bond originator selected | Creates/updates a single `originator_intake` application for the transaction. | Pass |
| Bond originator missing | Logs `bond_originator_missing` and notifies the agent. No default partner auto-route is guaranteed. | Needs remediation |
| Bank application submitted | `addBondApplication()` creates `bank_application`, advances workflow to submitted-to-banks. | Pass |
| Quote received / accepted | `addBondQuote()` records quote; `approveBondQuote()` enforces one accepted quote per workflow. | Pass |
| Instruction sent | `markFinanceInstructionSent()` upserts one instruction record and advances workflow. | Pass |

## Finance Path Audit

| Path | Expected | Actual | Status |
| --- | --- | --- | --- |
| Cash Buyer | Transaction only, no bond application. | Cash finance creates transaction/onboarding/docs and cash proof requirements; bond workflow rejects non-bond finance. | Pass |
| Bond Buyer | Transaction, bond workflow, originator intake, bank applications, quotes. | Works when bond originator roleplayer is selected; missing-originator path becomes an agent action item. | Partial |
| Hybrid / Combination Buyer | Bond workflow plus cash proof requirements. | `hybrid` normalizes to `combination`; documents include proof of funds and bond requirements. | Pass |
| Developer Buyer | Transaction supports developer finance presentation, but certification found finance command-centre logic rather than a separate developer-buyer application spine. | Medium gap |
| Private Seller Buyer | Accepted offer to private listing creates transaction and onboarding prefill. | Pass |

## Buyer Field Mapping Matrix

| Buyer / Onboarding Field | Destination | Status |
| --- | --- | --- |
| Buyer name | `buyers.name`, `onboarding_form_data.form_data`, transaction display context | Transferred |
| Phone / email | `buyers`, `onboarding_form_data.form_data`, client portal context | Transferred |
| ID / tax / company registration | `onboarding_form_data.form_data`; canonical document requirements carry ID/FICA docs | Transferred, not denormalized |
| Purchaser type | `transactions.purchaser_type`, `transaction_onboarding`, `onboarding_form_data` | Transferred |
| Purchase price | `transactions.purchase_price` / `sales_price`, `onboarding_form_data` | Transferred |
| Finance type | `transactions.finance_type`, `onboarding_form_data.purchase_finance_type` | Transferred |
| Cash / bond / deposit amount | `transactions`, `onboarding_form_data`, funding source snapshot | Transferred |
| Employment | `onboarding_form_data.employment.*` | Transferred to finance profile |
| Income / deductions / expenses | `onboarding_form_data.income_deductions_expenses.*` | Transferred to finance profile |
| Dependents / marital / credit | `onboarding_form_data` bond application sections | Transferred to finance profile |
| Preferred banks | `onboarding_form_data.bond_application.selected_banks` / bond form data | Partial: captured, but bank application rows are still created by workflow action |
| Consent | `onboarding_form_data` bond application sections | Transferred |

The platform intentionally treats the full Ooba-style application as structured form data rather than copying every finance field into `transaction_bond_applications`. That is acceptable if originator workspaces consistently read the transaction/onboarding profile.

## Document Flow Matrix

| Document | Source / Storage | Finance Visibility | Status |
| --- | --- | --- | --- |
| Buyer ID | Canonical definition + requirement instances, uploaded to `documents` | Buyer, agent, attorneys, bond originator where visible | Pass |
| Proof of address | Canonical buyer FICA requirement | Buyer, agent, attorneys, bond originator where visible | Pass |
| Bank statements | Canonical buyer finance requirement | Buyer, agent, bond originator | Pass |
| Payslips / income proof | Canonical buyer finance requirement | Buyer, agent, bond originator | Pass |
| Proof of funds | Required for cash/hybrid | Buyer, agent, attorney | Pass |
| Bond pre-approval / approval | Buyer finance canonical docs | Buyer, agent, bond originator, attorney | Pass |
| Bond application form | Bond originator canonical docs | Buyer/bond originator upload paths | Pass |
| Bank feedback | Bond originator canonical docs and application status | Bond originator/agent where scoped | Pass |
| Quote documents | `documents` with `finance_lane = bond`, related to `bond_offer` | Linked to quote via `quote_document_id` | Pass |
| Instruction to attorneys | `transaction_bond_instructions` plus optional finance document | One instruction per transaction | Pass |

## Source Of Truth

| Domain | Source Of Truth | Certification |
| --- | --- | --- |
| Buyer lead status | `leads.stage/status/current_stage` until converted | Pass |
| Offer / OTP state | `offers` plus review/session tables | Pass |
| Transaction state | `transactions` | Pass |
| Buyer onboarding data | `onboarding_form_data` and `transaction_onboarding` | Pass |
| Finance workflow state | `transaction_finance_workflows` | Pass |
| Originator intake | `transaction_bond_applications.application_type = originator_intake` | Pass |
| Bank submissions | `transaction_bond_applications.application_type = bank_application` | Pass |
| Quotes | `transaction_bond_quotes` | Pass |
| Buyer quote decision | `transaction_bond_offer_decisions` and accepted quote status | Pass |
| Bond instruction | `transaction_bond_instructions` | Pass |
| Documents | `documents` plus canonical requirement instances | Pass |

## Ownership And Roleplayer Validation

| Object | Organisation | Branch / Scope | Current Owner | Attribution | Status |
| --- | --- | --- | --- | --- | --- |
| Buyer lead | `leads.organisation_id` | `branch_id` where present | `assigned_user_id` / `assigned_agent_id` | `created_by` | Pass |
| Transaction | `transactions.organisation_id` | `assigned_branch_id` where present | `owner_user_id` / assigned agent fields | `created_by` where present | Pass |
| Originator application | `assigned_organisation_id` / `bond_workspace_id` | region/branch/team/user scope columns | `assigned_user_id` / primary consultant | `created_by` | Pass |
| Bank application | Transaction/workflow scoped | Inherits workflow transaction access | created/updated/submitted by user fields | Pass |
| Quote | Transaction/workflow scoped | Inherits workflow transaction access | uploaded/created/updated fields | Pass |
| Instruction | Transaction scoped | Inherits transaction access | `instruction_sent_by` | Pass |

RLS architecture is transaction-spine based for bond application, quote, instruction, participant, and roleplayer access. This audit is local/code-level; staging penetration validation should still be run before external partner rollout.

## Duplication Risk Report

Critical duplication risks: none found in transaction or originator-intake creation.

Controlled risks:

- There are two valid transaction creation paths: seller review RPC and agent UI conversion. Both include reuse/idempotency checks, but they should remain covered by regression tests.
- `transaction_finance_workflows` has a unique `(transaction_id, workflow_type)` constraint, and `createOrGetBondHybridFinanceWorkflow()` handles duplicate conflicts.
- `transaction_bond_applications` has a unique originator-intake index by transaction/application type.
- `transaction_bond_quotes` enforces one accepted quote per workflow.
- `transaction_bond_instructions` enforces one instruction per transaction.

Operational gaps:

- No guaranteed default Ooba/BetterBond routing when a bond buyer submits onboarding without a selected bond originator.
- Preferred banks captured in the portal do not automatically create bank application rows; the originator/workflow still submits to banks.
- Developer finance is represented in UI/service derivation, but not certified as a standalone external finance application spine.

## Partnership Readiness

| Partner Model | Readiness | Notes |
| --- | --- | --- |
| Internal bond originator workspace | Ready | Intake, assignment, documents, queue, quotes, instructions, and notifications exist. |
| Ooba / BetterBond referral workflow | Conditionally ready | Works if configured as selected roleplayer/partner; missing default routing is the blocker. |
| Bank submission tracking | Ready internally | Bank applications/feedback/quotes are tracked; direct bank API submission was not certified. |
| Attorney handoff | Ready | Accepted quote/instruction and transaction roleplayer propagation exist. |

## Required Remediation

Critical:

- Add deterministic default bond-originator routing when buyer onboarding selects bond/combination finance and no originator roleplayer exists. Use existing partner/routing rules; do not create a new workflow.

Medium:

- Convert selected/preferred banks from onboarding into draft or pending `bank_application` intent rows, or explicitly keep them as originator instructions and show that state.
- Add a regression test that submits buyer onboarding for bond finance with a selected originator and asserts exactly one `originator_intake` application.
- Add a regression test for missing originator that asserts notification/action item creation and no orphan bond application.
- Certify developer finance as either a supported finance path or an explicitly separate future module.

Low:

- Surface the field mapping in originator workspaces so originators can see which Ooba-style sections are complete without opening raw onboarding JSON.

## Test Evidence

Passed locally:

- `npm run test:bond-application-classification`
- `npm run test:bond-intake-notifications`
- `npm run test:bond-application-assignment`
- `npm run test:bond-routing-rules`
- `npm run test:bond-originator-banks`
- `npm run test:bond-bank-relationships`
- `npm run test:canonical-document-resolver`
- `npm run test:canonical-document-lifecycle`
- `npm run test:transaction-stage-compatibility`
- `npm run test:transaction-workflow-model`
- `npm run test:transaction-workflow-rollup`

Not completed because of existing test harness/import issues:

- `npm run test:finance-readiness` failed before assertions because direct Node ESM could not resolve `src/auth/permissions/permissionResolver` from `bondOperationalQueueService.js`.
- `npm run test:finance-intelligence` failed before assertions because direct Node ESM could not resolve `src/core/finance/financeReadinessSelectors` from `financeIntelligenceService.js`.

Non-blocking UI contract drift:

- `npm run test:transaction-documents-command-centre` failed on a UI text expectation for the Documents tab title. The failure did not invalidate the canonical document resolver/lifecycle checks used for this finance certification.

## Certification Decision

Buyer -> Finance -> Bond Application -> Transaction is certified for internal transaction-spine architecture and local workflow contracts.

It should not yet be presented as fully Ooba/BetterBond enterprise-certified until the missing-originator default routing path is closed and staging validation proves that selected-originator onboarding creates exactly one originator intake application, documents remain scoped, and former/unauthorised users cannot access finance records.
