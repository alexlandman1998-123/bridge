# Attorney Transaction Workflow Phase 1 Audit

Date: 2026-05-15  
Scope: read-only audit of current transaction, attorney, workflow, document, signing, updates, and permission architecture.  
Status: no workflow logic, schema, or migration changes were introduced as part of this Phase 1 audit.

## 1. Executive Summary

Bridge already has the beginnings of a proper attorney architecture, but it is split across two overlapping models:

- `transaction_participants` handles broad transaction access, generic stakeholder permissions, and legacy role visibility.
- `transaction_attorney_assignments` handles attorney firm assignment, primary attorney, secretary, admin handler, and assignment type.

That split is directionally correct, because firm-level role and transaction-level attorney assignment should remain separate. The current implementation, however, is not fully normalized yet. Attorney lane editing is still partly derived from generic participant flags, and several legacy fallbacks allow editing or access when newer attorney assignment tables/columns are missing. This keeps older workflows alive, but it is risky before adding Transfer Attorney, Bond Attorney, and Cancellation Attorney as first-class lanes.

The current workflow engine supports main transaction stages plus subprocess lanes for `finance`, `transfer`, and `bond`. Cancellation attorney is not yet a first-class workflow lane in the database-driven subprocess definitions. Some current UI/service work references cancellation assignment, but that appears ahead of the older migration constraints and can drift if the matching migration has not been applied.

The document and signing systems are functional but not fully lane-aware. Documents can be transaction-linked, request-linked, stage-linked, and visibility-scoped, but not consistently linked to an attorney lane or attorney role. Signing packets are transaction-linked and signer-token based, but packet permissions are mostly organisation/member/agent oriented and not attorney-lane oriented.

The biggest Phase 2 risk is schema chaos from adding attorney workflow roles into the wrong layer. The safest path is to normalize around `transaction_attorney_assignments` for lane ownership, introduce explicit lane keys for `transfer`, `bond`, and `cancellation`, and keep `transaction_participants` for access/collaboration rather than lane authority.

## 2. Current Data Model

### Core Transaction Tables

Observed service expectations:

- `transactions`
  - Expected fields include `id`, `organisation_id`, `development_id`, `unit_id`, `buyer_id`, `transaction_reference`, `transaction_type`, `property_type`, `stage`, `current_main_stage`, `current_sub_stage_summary`, `finance_type`, `purchase_price`, `bank`, `assigned_user_id`, `assigned_agent`, `assigned_agent_email`, `assigned_attorney_email`, `assigned_bond_originator_email`, `access_level`, `owner_user_id`, `lifecycle_state`, `is_active`, `risk_status`, `operational_state`, `attorney_stage`, `next_action`.
  - Many queries include fallbacks for missing columns, which means the service layer is currently tolerant of partial schema versions.

- `transaction_participants`
  - Expected fields include `transaction_id`, `user_id`, `role_type`, `legal_role`, `status`, `firm_id`, invitation fields, `visibility_scope`, `is_internal`, `participant_name`, `participant_email`, and direct permission booleans such as `can_edit_finance_workflow`, `can_edit_attorney_workflow`, and `can_edit_core_transaction`.
  - Used for transaction access and stakeholder management.
  - Can represent attorneys, but this is not specific enough for lane authority unless `legal_role` is present and used consistently.

- `transaction_subprocesses`
  - Expected fields include `transaction_id`, `process_type`, `owner_type`, `status`.
  - Current lane/process types in code are `sales`, `finance`, `transfer`, and `bond`; legacy code also maps `attorney` to `transfer`.

- `transaction_subprocess_steps`
  - Expected fields include `subprocess_id`, `step_key`, `step_label`, `status`, `completed_at`, `comment`, `owner_type`, `sort_order`.

### Attorney Firm Tables

Migration `202605090001_attorney_firm_foundation.sql` creates:

- `attorney_firms`
  - Firm identity, contact, address, logo, colours, `created_by`, active flag, timestamps.

- `attorney_firm_departments`
  - `firm_id`, `name`, `department_type`.
  - Department type constraint: `transfer`, `bond`, `admin`, `management`.

- `attorney_firm_members`
  - `firm_id`, `user_id`, `department_id`, `role`, `status`, invitation/join metadata.
  - Role constraint includes `firm_admin`, `director_partner`, `transfer_attorney`, `bond_attorney`, `conveyancing_secretary`, `admin_staff`, `reception_scheduling`, `candidate_attorney`.

- `attorney_firm_invitations`
  - Invitation email/token/status flow.

- Profile extensions:
  - `profiles.primary_attorney_firm_id`
  - `profiles.attorney_role`

Migration `202605110001_attorney_onboarding_stabilization.sql` adds branding and team/invite views:

- `attorney_firm_branding`
- `attorney_team_members`
- `attorney_invites`

### Attorney Assignment Tables

Migration `202605090011_transaction_attorney_assignments_foundation.sql` creates:

- `transaction_attorney_assignments`
  - `transaction_id`
  - `firm_id`
  - `assignment_type`
  - `department_id`
  - `primary_attorney_id`
  - `secretary_id`
  - `admin_handler_id`
  - `status`
  - `assigned_by`
  - timestamps

Original assignment type constraint:

- `transfer`
- `bond`
- `transfer_and_bond`

Current working-tree service/UI references also include `cancellation`. There is also an untracked migration in the repo, `supabase/migrations/202605150001_attorney_role_hierarchy_lane_permissions.sql`, which appears intended to add cancellation and management override support. If that migration is not applied to the active Supabase database, the UI/service layer can expect values the database rejects.

### Legacy / Parallel Firm Model

`src/lib/api.js` still contains a generic `firms` / `firm_memberships` service model. This appears separate from the newer `attorney_firms` / `attorney_firm_members` model. Phase 2 should avoid expanding the generic firm model for attorney lane ownership.

## 3. Current UI Flow

### Agent / Transaction Views

Attorneys can be added from the transaction workspace through `AttorneyAssignmentSection` and `AttorneyAssignmentForm`.

Current UI supports:

- Transfer attorney assignment.
- Bond attorney assignment when finance type is not cash.
- Cancellation attorney assignment in current working-tree UI.
- Firm, department, primary attorney, secretary, and admin handler fields.

The assignment UI uses `transactionAttorneyAssignments.js`, not only `transaction_participants`, which is the correct direction.

### Attorney Operations Workspace

`AttorneyOperationsPage.jsx` loads data via `getAttorneyOperationalWorkspaceData`.

The operations service:

- Resolves current attorney firm and membership.
- Uses role permissions from `attorneyPermissions.js`.
- Loads firm-wide assignments for management roles.
- Loads user-specific assignments for non-management roles.
- Builds matter queues from `transaction_attorney_assignments`.
- Builds document queues from `document_requests`.
- Builds signing queues from `document_packets` and `document_packet_signers`.
- Builds appointment queues from `appointments`.

This page is currently assignment-driven, which is good. It is still not a true workflow authority layer because lane edit permission can be decided elsewhere by participant flags.

### Attorney Transaction Workspace

`AttorneyTransactionDetail.jsx` consumes attorney permissions and lane assignment context. Recent working-tree changes added clearer management/assigned-lane behavior, but the older API lane update path still has permissive legacy fallbacks. This should be normalized before Phase 2 workflow expansion.

## 4. Current Workflow Model

### Main Transaction Stage

Main transaction state is stored on `transactions.stage` and newer summary fields:

- `current_main_stage`
- `current_sub_stage_summary`

Stage updates create transaction events through `logTransactionEventIfPossible` when service paths call it.

### Finance Lane

Finance lane logic lives in:

- `src/core/transactions/financeWorkflow.js`
- `src/core/workflows/definitions.js`
- `transaction_subprocesses`
- `transaction_subprocess_steps`

Finance templates are conditional on `finance_type`:

- cash
- bond
- combination/hybrid

Finance lane updates are guarded by sales readiness checks and sequential transition checks.

### Transfer / Attorney Lane

Transfer lane logic lives in:

- `src/core/workflows/definitions.js`
- `src/core/transactions/attorneyWorkflowConfig.js`
- `TransferWorkflowLane.jsx`
- `SubprocessWorkflowPanel.jsx`
- `updateTransactionSubprocessStep`

There are two overlapping definitions:

- `WORKFLOW_LANE_DEFINITIONS.transfer` in `definitions.js`.
- `ATTORNEY_WORKFLOW_STAGES` in `attorneyWorkflowConfig.js`.

This duplication is a schema/logic drift risk. Phase 2 should choose one source of truth for attorney lane stages.

### Bond Lane

`definitions.js` has a first-class `bond` lane with bond registration stages. Bond subprocess activation appears conditional on finance type and/or bond assignment.

The current lane update permission helper only recognizes `transfer` and `bond`. There is no first-class cancellation subprocess lane in `WORKFLOW_LANE_DEFINITIONS`.

### Cancellation Lane

Cancellation exists in the current working-tree UI/service assignment layer, but not as a complete workflow lane:

- No `cancellation` lane in `WORKFLOW_LANE_DEFINITIONS`.
- No `cancellation` branch in the legacy `canAttorneyEditLaneByAssignment` helper.
- Original assignment migration does not allow `cancellation`.

Current status: cancellation is partially introduced and should be treated as unstable until the schema, subprocess template, UI, and permission helpers are aligned.

## 5. Current Permission Model

### Firm-Level Attorney Permissions

`attorneyPermissions.js` defines firm role capabilities.

Key role groups:

- `firm_admin`
- `director_partner`
- `transfer_attorney`
- `bond_attorney`
- `conveyancing_secretary`
- `admin_staff`
- `reception_scheduling`
- `candidate_attorney`

Management roles can view firm-wide work and manage assignments. Working attorney roles can operate assigned work according to role permissions.

### Transaction-Level / Lane Permissions

There are currently two permission sources:

1. `transaction_participants`
   - Generic participant flags such as `can_edit_attorney_workflow`.
   - `role_type = attorney` can grant broad attorney workflow editing.

2. `transaction_attorney_assignments`
   - Assignment-specific firm/user fields.
   - Used by `canAttorneyEditLaneByAssignment` for transfer/bond lane checks.

Current risks:

- `canAttorneyEditLaneByAssignment` returns `true` if the assignment table is missing, has no rows, or transaction id is missing.
- It only checks `transfer` and `bond`; other lanes pass through.
- If `actorUserId` is absent, it returns `true` when matching assignments exist.
- It allows `primary_attorney_id`, `secretary_id`, or `admin_handler_id` to edit matching lanes.
- `updateTransactionSubprocessStep` only performs participant permission checks when it finds a participant row for `transaction_id` + `role_type`. If no participant row is found, there is no explicit deny in that block.
- Generic `attorney` role permissions can still be too broad unless assignment checks are always enforced.

### RLS Coverage Observed in Migrations

RLS exists for:

- `attorney_firms`
- `attorney_firm_departments`
- `attorney_firm_members`
- `attorney_firm_invitations`
- `transaction_attorney_assignments`
- document packet tables via `202605100020_document_packets_rls_stabilization.sql`

Important limitation:

- I could not verify live RLS on base tables such as `transactions`, `transaction_participants`, `document_requests`, `documents`, `transaction_comments`, `transaction_events`, `transaction_subprocesses`, or `transaction_subprocess_steps` because the local schema dump failed. See QA section.

### Direct URL Access

`fetchTransactionById` blocks attorney users from loading a transaction if `canUserAccessTransaction` returns false.

Access is derived from:

- direct transaction participants,
- email/name participant matches,
- legacy assigned role columns,
- inherited development access.

Risk:

- Attorneys assigned at development level inherit access to all transactions in that development.
- This may be intended for development attorneys, but Phase 2 should decide whether this is acceptable for private/resale/commercial matters.

## 6. Current Document Model

### Document Requests

`document_requests` is the main request workflow table expected by services.

Observed fields:

- `transaction_id`
- `category`
- `document_type`
- `title`
- `description`
- `priority`
- `due_date`
- `assigned_to_role`
- `assigned_to_user_id`
- `request_group_id`
- `status`
- `requires_review`
- `requested_document_id`
- `created_by`
- `created_by_role`
- `completed_at`
- `rejected_reason`
- `resend_count`
- `last_resent_at`
- `requested_from`
- `visibility_scope`
- `request_type`
- `notes`

Statuses in service usage include:

- `requested`
- `uploaded`
- `under_review`
- `reviewed`
- `rejected`
- `completed`
- `cancelled`

### Uploaded Documents

Uploaded files are stored in `documents`.

Observed fields:

- `transaction_id`
- `name`
- `file_path`
- `category`
- `document_type`
- `visibility_scope`
- `uploaded_by_user_id`
- `uploaded_by_role`
- `uploaded_by_email`
- `stage_key`
- `is_client_visible`
- `external_access_id`
- `archived_at`

Documents can be:

- transaction-linked,
- category/type-linked,
- stage-linked via `stage_key`,
- visibility-scoped.

They are not consistently linked to:

- attorney lane,
- attorney assignment id,
- attorney role (`transfer_attorney`, `bond_attorney`, `cancellation_attorney`).

### Review / Rejection

Document request status can be updated and can store `rejected_reason`. The service does not consistently require a rejection reason before setting `rejected`.

### Client Portal Visibility

Visibility is represented by both:

- `visibility_scope` values such as `shared`, `internal`, `client`, `client_visible`, `internal_only`, `shared_role_players`.
- `is_client_visible` boolean on documents.

This mixed visibility vocabulary is a drift risk. Phase 2 should normalize visibility values before using them for legal/client-sensitive attorney documents.

## 7. Current Signing Model

### Packet Tables

The signing/document packet model uses:

- `document_packets`
- `document_packet_versions`
- `document_packet_templates`
- `document_packet_events`
- `document_packet_signers`
- `document_signing_fields`

Packet types:

- `otp`
- `mandate`
- `addendum`
- `supporting_legal`
- `custom`

Packet statuses:

- `draft`
- `ready_for_generation`
- `generated`
- `signing_prep`
- `sent`
- `partially_signed`
- `completed`
- `voided`
- `archived`

Signer roles currently include:

- purchaser roles,
- seller,
- agent,
- contractor,
- witnesses,
- other.

There are no attorney-specific signer roles in the packet constants.

### Token Signing Flow

`resolve-signer-token`:

- Uses Supabase service role.
- Resolves `document_packet_signers.signing_token`.
- Expires token if `token_expires_at` is past.
- Loads packet and packet version.
- Loads signer-scoped fields by signer role and email.
- Returns preview URL or fallback preview HTML.
- Writes `signer_link_viewed` event to `document_packet_events`.

`signer-signing-action`:

- Uses Supabase service role.
- Saves signature/initial assets.
- Applies assets only to fields matching the signer role/email.
- Completes signer only when required fields for that signer are complete.
- Updates packet to `partially_signed` or `completed`.
- Writes packet events.

`generate-final-signed-document`:

- Uses Supabase service role.
- Requires all signers signed and required fields complete.
- Overlays signature assets onto generated PDF/DOCX-converted PDF.
- Creates final signed artifact.
- Inserts a `documents` row for the final signed packet.

Risk:

- Final signed document insert currently sets `transaction_id: null`, so final signed packet discoverability in transaction/client/attorney document views may depend only on packet links rather than the `documents` row.
- Packet RLS migration is broad for organisation active members and does not express attorney lane-specific permissions.
- Signing packet creation/management permissions are principal/admin/agent oriented, not attorney-lane oriented.

## 8. Updates / Activity / Notes Model

### Activity Events

`transaction_events` is used for workflow, comments, document, and operational audit-style activity.

`logTransactionEventIfPossible` inserts:

- `transaction_id`
- `event_type`
- `event_data`
- `created_by`
- `created_by_role`

It falls back if columns such as `created_by`, `created_by_role`, or `event_data` are missing.

### Comments / Notes

`transaction_comments` stores:

- `transaction_id`
- `author_name`
- `author_role`
- `comment_text`
- `created_at`

Comment visibility is inferred from encoded metadata or prefixes parsed from the text, not from a robust database column in the insert path.

Risks:

- Internal attorney notes and client-visible/shared comments are not strongly separated at table level.
- Some code uses encoded prefixes such as `[shared]` or metadata blocks inside comment text.
- If a portal viewer parser changes or misses metadata, internal legal notes could leak or shared notes could disappear.

Recommendation:

- Phase 2 should introduce explicit note/comment fields for `visibility_scope`, `lane_key`, `attorney_assignment_id`, and `client_visible`, or create separate internal legal note storage.

## 9. Conditional Logic Gaps

Existing conditional logic:

- `finance_type` drives cash/bond/combination finance templates.
- `property_type` affects levy/sectional title style steps in some workflow templates.
- Buyer document requirements use buyer/onboarding context.
- Seller document requirements use seller onboarding/private listing context.
- Seller document requirement logic can distinguish individual/company/trust/deceased estate/multiple/other and can add bond/sectional/share-block related requirements.

Current gaps for proper attorney workflows:

- No normalized `deal_funding_type` with values such as `cash`, `bond`, `hybrid` across all modules.
- No reliable transaction-level `seller_has_existing_bond` / `cancellation_required` field observed in core transaction flow.
- No first-class cancellation lane activation condition.
- No normalized transaction type model for `development_sale`, `private_sale`, `resale`, `commercial`.
- Buyer/seller legal entity types are captured in onboarding/portal contexts, but not consistently promoted to transaction-level fields.
- Multiple buyers/sellers and joint ownership appear only partially represented.
- Trust/company representative capacity is not consistently downstreamed into documents/workflow.
- Attorney subprocess steps do not yet conditionally fork based on purchaser type, seller type, property type, existing bond, or commercial/private/development transaction type.

## 10. Schema Drift Risks

High-risk drift areas:

- `transaction_attorney_assignments.assignment_type`
  - Original migration allows only `transfer`, `bond`, `transfer_and_bond`.
  - Current working-tree code references `cancellation`.

- `attorney_firm_departments.department_type`
  - Original migration allows `transfer`, `bond`, `admin`, `management`.
  - Cancellation assignment currently maps to transfer/admin/management departments, not a cancellation department.

- `transaction_participants.legal_role`
  - Code supports legal roles such as transfer/bond/cancellation.
  - Fallback paths collapse to generic `role_type = attorney` if `legal_role` is missing.

- Workflow definitions
  - `definitions.js` and `attorneyWorkflowConfig.js` duplicate attorney stage concepts.
  - UI components also map legacy `attorney` process type to `transfer`.

- Permission helpers
  - `attorneyPermissions.js` has newer helper intent.
  - `src/lib/api.js` still has older `canAttorneyEditLaneByAssignment` behavior.

- Visibility vocabulary
  - Documents/requests/appointments/comments use multiple overlapping visibility labels.

- Packet/document linkage
  - Packets are transaction-linked, but final generated signed documents may be inserted into `documents` with `transaction_id = null`.

- Live schema verification
  - Supabase schema dump failed locally because Docker is unavailable, so live drift could not be fully confirmed.

## 11. Risks / Bugs / Blockers Before Phase 2

1. Attorney lane edit permissions are not strict enough yet.
   - Missing assignment rows or missing assignment table can allow edits.
   - Generic participant attorney permissions can grant broad attorney workflow edit.

2. Cancellation attorney is partially introduced but not normalized.
   - It needs schema, workflow definitions, subprocess creation, UI, permissions, and document requirements aligned.

3. `transaction_participants` and `transaction_attorney_assignments` overlap.
   - Participants should grant collaboration/access.
   - Assignments should grant lane authority.

4. Internal attorney notes are not safely separated enough.
   - Table-level visibility is weak for `transaction_comments`.

5. Documents are not lane-aware.
   - Attorney document requests should be linkable to `lane_key` and `transaction_attorney_assignment_id`.

6. Signing packets are not attorney-lane aware.
   - Attorneys cannot safely own/manage packet actions by lane without broad packet permissions.

7. Final signed documents may not attach cleanly to transaction documents.
   - This can cause transaction/client/attorney views to miss signed artifacts.

8. Conditional data needed for legal workflow is scattered.
   - Seller/buyer type, transaction type, existing bond/cancellation requirement, and property title type need normalized transaction-level fields or a reliable derived profile.

9. RLS for base transaction/workflow/document/comment tables could not be confirmed from a live schema dump.

10. Several service queries contain fallback logic for missing columns.
    - This is useful for migration tolerance but can hide real production drift.

## 12. Recommended Phase 2 Migration Plan

Do not add workflow behavior until the data model is normalized. Recommended sequence:

1. Freeze the canonical lane model.
   - Lane keys: `transfer`, `bond`, `cancellation`.
   - Keep firm roles separate from lane assignments.

2. Normalize `transaction_attorney_assignments`.
   - Add/confirm `cancellation` assignment type.
   - Consider replacing `transfer_and_bond` with separate `transfer` and `bond` rows, or document strict compatibility behavior.
   - Add `lane_key` if needed, but avoid duplicating `assignment_type` and `lane_key` indefinitely.

3. Add cancellation workflow definition.
   - Add cancellation subprocess template and activation rules.
   - Activation should depend on seller existing bond/cancellation requirement.

4. Make assignment the source of lane edit authority.
   - `transaction_participants` should not independently grant attorney lane editing.
   - Remove permissive fallbacks after migrations are confirmed.

5. Add explicit conditional transaction profile.
   - Funding type, transaction type, buyer entity type, seller entity type, property title type, cancellation requirement.

6. Make documents lane-aware.
   - Add `lane_key`, `attorney_assignment_id`, and `required_from_party`/`required_from_role` consistency.
   - Require rejection reasons for rejected legal documents.

7. Make notes lane-aware and visibility-safe.
   - Use explicit `visibility_scope` and `client_visible`.
   - Separate internal legal notes from client-visible updates.

8. Make signing packets role/lane-aware.
   - Link packet management to transaction, document, and attorney assignment where relevant.
   - Add attorney-specific signer roles only when a legal workflow requires attorney signature.

9. Tighten RLS.
   - Verify direct URL access against live Supabase.
   - Add policies for attorney assignment visibility and lane update authority.

10. Remove duplicate workflow definitions.
    - Use one canonical workflow definition source for transfer/bond/cancellation.

## 13. QA / Verification Results

### Build

Command:

```bash
cd the-it-guy && npm run build
```

Result:

- Passed.
- Vite built successfully in 10.80s.

Warnings observed:

- CSS minifier warning:
  - `Expected identifier but found "-"` at generated CSS input around `-: TZ.;`
- Rollup chunk-size warning:
  - Main JS bundle is larger than 500 kB after minification.
  - `dist/assets/index-DcsrKG8b.js` reported at 5,471.94 kB raw / 1,327.54 kB gzip.

### Lint

Command:

```bash
cd the-it-guy && npm run lint
```

Result:

- Failed.
- ESLint reported `126 problems (95 errors, 31 warnings)`.
- These are repo-wide existing issues; no Phase 1 functional code changes were introduced by this audit.

High-signal lint categories:

- Unused variables/functions across multiple components and services.
- React compiler/hook rules, including `setState` inside effects and conditional hook usage.
- `no-undef` in `src/lib/api.js`:
  - `deriveAttorneyOperationalStateForRow`
  - `resolvePurchaserTypeFromFormData`
  - `ensureOrganisationContext`
- `no-undef` in `TransactionStatusShare.jsx`:
  - `stageExplainer`
- Fast Refresh warnings for files exporting non-component values.
- Temporary/debug specs under `tmp/` using CommonJS `require` in an ESLint context.

Notable audit-relevant lint finding:

- `src/lib/api.js` has undefined symbols in active service code. This should be treated as a stabilization item before Phase 2 because `api.js` is central to transaction/workflow/document access.

### Schema Dump Attempt

Command attempted:

```bash
npx supabase db dump --linked --schema public --file /private/tmp/phase1_public_schema.sql
```

Result:

- Failed because Docker is unavailable in this local environment:
  - `Cannot connect to the Docker daemon at unix:///var/run/docker.sock`

Impact:

- This audit maps migrations and service/UI expectations, but it cannot guarantee the live linked database schema exactly matches the repo.
