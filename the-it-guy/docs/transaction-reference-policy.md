# Transaction Reference Policy

Status: Phase 7 reference audit visibility

This policy separates Bridge-owned references from partner-owned external references. The transaction remains the canonical spine; reference numbers are labels attached to that spine or to a specific operational lane.

## Canonical References

| Reference | Owner | Scope | Storage target | Edit policy |
| --- | --- | --- | --- | --- |
| Bridge Matter No | Bridge system | Whole transaction | `transactions.matter_number` | Read-only, admin correction only |
| Transaction Ref | Bridge system / agency legacy | Whole transaction | `transactions.transaction_reference` | Read-only, workspace-admin correction only |
| Transfer Matter No | Transfer attorney | Transfer attorney assignment | `transaction_attorney_assignments.matter_reference` | Editable by transfer attorney firm/admin |
| Bond Matter No | Bond attorney | Bond attorney assignment | `transaction_attorney_assignments.matter_reference` | Editable by bond attorney firm/admin |
| Cancellation Matter No | Cancellation attorney | Cancellation attorney assignment | `transaction_attorney_assignments.matter_reference` | Editable by cancellation attorney firm/admin |
| Bond Originator App Ref | Bond originator | Bond application | `transaction_bond_applications.application_reference` | Editable by bond originator/admin |
| Bank Application Ref | Bond originator / bank | Bank application | `transaction_bond_applications.reference_number` | Editable by bond originator/admin |

## Audience Rule

Agents, buyers, sellers, and client portal users should see the same Bridge Matter No as the transaction reference. Do not create separate buyer and seller transaction numbers in the product unless a later phase introduces explicit external client file references.

## Edit Rule

Bridge-owned references are not normal editable fields. They may be corrected only by trusted admin roles and every correction must be audited.

Partner-owned references are editable because they are assigned by outside operating systems after the transaction already exists. Every edit must capture actor, role, timestamp, old value, new value, and reason.

## Phase 2 Implementation Boundary

Phase 2 adds nullable attorney matter reference fields to `transaction_attorney_assignments`:

- `matter_reference`
- `matter_reference_source`
- `matter_reference_updated_by`
- `matter_reference_updated_at`

Existing assignments are not backfilled. A transfer, bond, or cancellation matter number remains empty until the responsible attorney firm supplies it.

## Phase 3 Implementation Boundary

Phase 3 wires partner-owned reference edits through policy-aware mutation paths:

- Attorney matter numbers are updated through `updateTransactionAttorneyMatterReference`.
- Bond originator and bank application references are audited through the existing bond application mutations.
- Each reference change writes a `transaction_events` row with reference type, storage target, old value, new value, source, actor, and reason.
- The attorney assignment summary UI exposes inline matter-number edits for users who can update attorney assignments.

Bridge-owned transaction references remain read-only in normal UI and are not part of this mutation phase.

## Phase 4 Implementation Boundary

Phase 4 adds the shared read/display model:

- `buildTransactionReferenceDisplayModel` resolves the primary transaction reference and visible partner references for an audience role.
- The Bridge Matter No is the primary display reference for agents, buyers, sellers, clients, and partner roles.
- If `transactions.matter_number` is missing, the display model falls back to the legacy transaction reference and then to a stable transaction-id-derived label.
- The transaction workspace header uses the display model instead of reading ad hoc reference fields directly.
- Partner references can be surfaced from attorney assignments and bond finance applications when those collections are already loaded by the caller.

Phase 4 does not introduce new edit permissions. It only standardises what each audience sees.

## Phase 5 Implementation Boundary

Phase 5 adds the trusted correction path for Bridge-owned transaction references:

- `correctTransactionReference` corrects only transaction-scoped, Bridge-owned references.
- Correction rights are enforced through `canCorrectTransactionReference`.
- Corrected values must be explicit and non-blank.
- Every correction must include a reason.
- Each accepted correction writes a `transaction_events` audit row with reference type, storage target, corrected column, old value, new value, actor role, and `correction` source.

Phase 5 does not make Bridge-owned references generally editable. Normal partner edit flows remain limited to the partner-owned references from Phase 3.

## Phase 6 Implementation Boundary

Phase 6 exposes the correction contract in the transaction workspace:

- Users with correctable reference types see a `Correct Reference` action in the transaction workspace header menu.
- The correction modal is populated from `getCorrectableTransactionReferenceTypesForRole`.
- The form pre-fills the current Bridge-owned reference value and requires a corrected value plus audit reason.
- Saving calls `correctTransactionReference`, refreshes the transaction workspace, and relies on the Phase 5 API for final permission enforcement and audit logging.

Phase 6 is an admin UX layer only. It does not add new reference types or weaken the correction policy.

## Phase 7 Implementation Boundary

Phase 7 exposes reference-change audit history in the transaction workspace:

- `transaction_events` rows with `changeType: transaction_reference_updated` are normalised into reference history rows.
- Users with correction access, or developer/internal admin workspace access, can open `Reference History` from the workspace header menu when history exists.
- The modal shows reference label, old value, new value, source, reason, actor role, timestamp, and storage target.
- The audit view is read-only and uses the events already written by Phases 3 and 5.

Phase 7 does not add new write paths. It makes existing reference audits visible to trusted workspace users.
