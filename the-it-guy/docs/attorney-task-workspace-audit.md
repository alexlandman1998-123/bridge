# Attorney task workspace audit

Date: 6 October 2026. Owner: primary Arch9 transaction application (`the-it-guy/`).

All attorney task workspaces should use the selected stage's task list beside one focused task panel. The current catalogue contains **89 task definitions across 14 stages: 49 transfer tasks in six stages, 18 bond tasks in four stages, and 22 cancellation tasks in four stages**. This is the Phase 1 audit for that change. Every definition has a record below, including four historical tasks; a matter's saved plan determines which tasks actually apply.

The shared panel can reuse existing confirmation, document, party, finance, appointment and workflow-save services. Moving those controls into a panel will improve continuity, but several tasks also need a more concrete way to record their work. Those content changes belong in the later task-specific implementation phase.

## Working experience

Keep the matter identity and lane selector visible. Above the work area, show the selected lane's stages: six for transfer, four for bond and four for cancellation. Beside the selected stage's task list, show one task's purpose, relevant checks or fields, required documents and optional comment. Task options hold waiting, blocked, external completion, not applicable and manual completion where permitted. A task requiring a completion note or exception reason must still ask for it.

On desktop, selecting another task replaces the panel while the list remains available. On mobile, the panel fills the work area and provides a clear return to the same stage, row and scroll position. Browser Back, saved links and lane switching must preserve this context. Longer document review can occupy more space and return to the same task.

Use **Save draft** for partial work and **Complete task** for the explicit outcome. Saving a draft must not complete a task, send a message or advance to the next stage. Completion must retain required reasons, current permissions and server checks. The current application saves confirmation answers separately from the lifecycle outcome; a later combined completion flow must handle a successful answer save followed by a failed outcome save without losing or duplicating work.

## Current screens and data

[`AttorneyTransactionDetail.jsx`](../src/pages/AttorneyTransactionDetail.jsx) hosts the Work view for all three lanes. [`transferWorkspaceViewModel.js`](../src/services/attorneyWorkflow/transferWorkspaceViewModel.js) combines the saved journey, catalogue, runtime requirements and permissions. [`LegalTaskWorkbench.jsx`](../src/components/attorney/workflow/LegalTaskWorkbench.jsx) renders contracted tasks through [`legalTaskWorkbenchModel.js`](../src/core/transactions/legalTaskWorkbenchModel.js). Its current focused view already has checklist, details, documents, notes and activity sections, plus several task-specific controls. Reuse these improvements rather than treating the screenshots as the complete current implementation.

The host still renders an older layout when a selected task has no operational contract. That layout contains the matter coverage, lane command queue and outcome checkpoint shown in the screenshots. All 89 current catalogue definitions have a contract, but an unrecognised task in a saved shared journey can lack one and reach this layout. Removing it without a replacement would lose access to saved work.

Current definitions and default requirements come from [`attorneyWorkflowStages.js`](../src/constants/attorneyWorkflowStages.js). The [3 October process audit](../../docs/attorney-conveyancing-process-audit-2026-10-03.md) and its [task appendix](../../docs/attorney-conveyancing-task-audit-appendix-2026-10-03.md) remain the detailed process references. This audit maps those tasks to the working interface; it does not establish new legal rules. Current task wording takes precedence over older audit wording, including intake's distinction between receiving the agreement and substantively reviewing it.

## Shared findings and implementation decisions

| Finding | Decision for the side panel | Implementation phase |
| --- | --- | --- |
| Stage selection and task selection currently switch between overview and workspace routes. | Keep stage and list visible while changing the selected panel. Retain valid deep links and unsaved-work guards; restore row focus and list scroll on close. | Phase 2 shared layout |
| The legacy layout repeats matter coverage, lane-wide follow-ups and outcome containers. | Put coverage and queues in the matter overview. Inside a task, show only the warning or dependency that affects its work. Retain a link to the wider matter when needed. | Phase 2 shared layout |
| Saved tasks newer than the local catalogue can have no contract. | Render their saved title, outcome and history in the shared shell. Do not fabricate requirements or silently drop the task. Enable edits only through a recognised, authorised save path; otherwise explain the limitation. | Phase 2 shared layout |
| Some document actions open the whole register or another drawer. | Open the selected requirement and document version in context. Preserve task and party identity through request, upload, review and return. The full register remains available as a secondary action. | Phase 3 saves and documents |
| Confirmation drafts are held in component state; selection is stored separately in session storage. | Keep pending changes through panel resizing, document review and returning to the list. Use the existing confirmation save for persisted drafts; define recovery before changing a dirty task. | Phase 3 saves and drafts |
| “Task notes” can include lane-wide entries: selected activity matches the task key **or** the lane key. | Use explicit task identity for task comments. Keep older unscoped notes in matter or lane history with their original scope, rather than attributing them to every task. | Phase 3 comments |
| A completion outcome and checklist answers are different records. A manual, imported or external completion can coexist with unconfirmed items. | Explain the completion method and outstanding evidence. Show task outcome and check count distinctly. Never hide missing evidence merely because the outcome is completed. | Phase 3 completion |
| In the empty-data audit fixture, 23 tasks project only Add note as their work action: six transfer, eight bond and nine cancellation. Some already have contextual details or structured registers. | Review the actual editor behind each record. Reuse existing controls where present; define missing dates, references, evidence targets or decisions where a general note is doing their job. | Phase 4 task content |
| Bond approval amount, cancellation penalty risk and settlement reference are declared inputs, but their tasks do not project a generic capture_data action in this fixture. | Resolve the task's concrete editor and save destination rather than assuming the input declaration provides a usable control. | Phase 4 task content |
| Bank approval to lodge has confirmation wording for an approval date and reference, but no default authority document or dedicated work action. | Make bank authority visible as its own record. Keep submission, query or correction, resubmission, authority to lodge, current instruction and close-out distinct. Resolve any additional workflow checkpoints against actual lender practice before changing the task catalogue. | Phase 4 bond content |
| Catalogue task types are partly inferred from key names. A review can therefore be classified as a milestone or document collection. | Choose panel controls from the actual requirements and outcome. Do not select a generic screen solely from the inferred type. | Phase 4 task content |

“Only Add note” describes the projected **work action list**, not the absence of lifecycle actions, details, registers or external editors. The 23-task count is a reproducible local fixture observation; it is not a count of broken live matters.

## Completion and comment rules

The per-task records show the declared completion policy, default inputs and documents, and the current confirmation prompts from the local model. These declarations are not proof that every requirement is a hard database gate. Ordinary tasks allow an authorised attorney to record completion with a note when evidence is outstanding; unresolved evidence remains visible. Attested milestones and specialist decisions have narrower permitted outcomes. Lodgement, registration, transfer-tax and closure checks must continue through the existing canonical save and server validation.

A **declared completion note** below is separate from an optional task comment. A task without a declared note can still require one at runtime when completing with unresolved requirements. Blocked or waiting outcomes, permitted external completion and not-applicable outcomes retain their reason rules. Choosing not applicable for an individual check does not automatically exempt the entire task or clear a readiness gate.

Confirmation saves currently use internal visibility. Task updates preserve the task's internal or professional-sharing policy; client communication uses its own permitted audience and explicit publishing action. FICA review references and financial close-out must retain their internal scope. Saving a comment, recording a bank submission, or recording external communication must not imply that anything was delivered.

## Task requirements and panel contents

Each record states the task's purpose, **catalogue** inputs and documents, current confirmation prompts, intended focused content and specific gap or reuse decision. A dash means no default catalogue requirement, not “no evidence needed.” Runtime party, tax, security, specialist and document resolvers can add requirements. Related documents must remain scoped to the actual party, account, requirement and current version.

The records were projected with one saved journey task at a time, editable local permissions, empty matter facts and no uploaded documents. This deliberately retains conditional and historical definitions for coverage. Actual matters must use their saved plan and resolved requirements rather than displaying every row in this inventory.

### Transfer Instruction & File Opening

**Instruction Received** — `transfer/instruction_received`

The transfer instruction and source documents have been received.

- Current inputs: Finance Type (finance_type, transaction_finance_type, funding_type, purchase_finance_type, routingProfile.financeType, routing_profile.financeType); Transaction Type (transaction_type, property_transaction_type, sale_type, listing_type, routingProfile.transactionType, routing_profile.transactionType).
- Catalogue documents: `sales_agreement_or_otp`.
- Current confirmations: 1. Transfer instruction received from the instructing party. 2. Source agreement received or requested. Substantive review follows in the OTP task. 3. Finance Type 4. Transaction Type
- Current work actions: `capture_data, request_document, upload_document, open_documents, open_parties, add_note`. Declared completion note: not required by default. Declared readiness gate: Attorney Instruction Ready (`attorney_instruction_ready`).
- Panel content: Instruction source and date, finance route and transaction type; attach or request the agreement. Keep substantive agreement review in its own task.
- Gap or reuse decision: Reuse intake controls; show source status without implying agreement approval.

**File Opened and Matter Number Assigned** — `transfer/matter_opened`

The conveyancing file is opened and a matter number is recorded.

- Current inputs: Matter Number (matter_number, matterNumber, legal_matter_number, conveyancing_matter_number).
- Catalogue documents: —.
- Current confirmations: 1. Matter number captured. 2. Responsible conveyancer or secretary is allocated.
- Current work actions: `capture_data, open_parties, add_note`. Declared completion note: not required by default.
- Panel content: Matter number and responsible conveyancer or secretary, with the existing team allocation controls.
- Gap or reuse decision: Reuse inline number and team save; avoid a second generic capture screen.

**OTP and Source Documents Checked** — `transfer/otp_source_docs_checked`

The sale agreement, parties, purchase price, suspensive conditions, and property details are checked.

- Current inputs: Purchase Price (purchase_price, purchasePrice, sale_price, transaction_amount, amount); Property Description (property_description, propertyDescription, property.address, property_address, unit.address, erf_number, erfNumber).
- Catalogue documents: `sales_agreement_or_otp`, `seller_property_documents`.
- Current confirmations: 1. OTP or sale agreement reviewed. 2. Parties, property, price, and suspensive conditions checked. 3. Applicable agreement conditions and payment dates reviewed against the current agreement. 4. Purchase Price 5. Seller Property Documents
- Current work actions: `capture_data, request_document, upload_document, open_documents, open_parties, add_note`. Declared completion note: not required by default.
- Panel content: Agreement preview, price and property details, and the existing condition register with dates, owners and decisions.
- Gap or reuse decision: Reuse source fields and condition register; retain document replacement invalidation.

**Title Deed or Ownership Checked** — `transfer/title_deed_checked`

The title deed, ownership, restrictions, and property description are checked.

- Current inputs: Property Tenure (property_tenure, propertyTenure, property_title_type, propertyTitleType, title_type, titleType, property_structure_type, propertyStructureType, ownership_type, routingProfile.propertyTenure, routing_profile.propertyTenure); Title Deed / Property Identifier (title_deed_number, titleDeedNumber, deed_of_transfer_number, erf_number, erfNumber, property.erf_number, unit.erf_number).
- Catalogue documents: `seller_property_documents`.
- Current confirmations: 1. Title deed or ownership source checked. 2. Restrictions or title conditions recorded. 3. Property Tenure 4. Seller Property Documents
- Current work actions: `capture_data, request_document, upload_document, open_documents, open_parties, add_note`. Declared completion note: required.
- Panel content: Ownership source, tenure, property identifier and recorded restrictions, with document review beside the fields.
- Gap or reuse decision: Reuse title controls; show unit and complex from the same saved property identity.

**Existing Bond or Cancellation Requirement Confirmed** — `transfer/existing_bond_confirmed`

Any seller existing bond and cancellation requirement is confirmed.

- Current inputs: Seller Existing Bond Status (seller_has_existing_bond, seller_has_bond, existing_bond, has_existing_bond, bond_status, seller.bond_status, routingProfile.sellerHasExistingBond, routing_profile.sellerHasExistingBond).
- Catalogue documents: `seller_bond_cancellation_information`.
- Current confirmations: 1. Seller existing bond position captured. 2. Cancellation lane is required or explicitly not required.
- Current work actions: `capture_data, request_document, upload_document, open_documents, open_parties, add_note`. Declared completion note: not required by default.
- Panel content: Existing bond decision and cancellation requirement, supported by the seller bond information.
- Gap or reuse decision: Keep answer save and routing decision as distinct recoverable writes.


### Transfer FICA & Authority

**Review & Approve Buyer FICA** — `transfer/buyer_fica_review`

Review the buyer's applicable identity, address and authority documents in one pack.

- Current inputs: Buyer Entity Type (buyer_entity_type, buyer_type, purchaser_type, purchaser_entity_type, routingProfile.buyerEntityType, routing_profile.buyerEntityType).
- Catalogue documents: —.
- Current confirmations: 1. Buyer identity and FICA documents checked. 2. Buyer Marital Status
- Current work actions: `capture_data, open_parties, add_note`. Declared completion note: not required by default.
- Panel content: Only the current buyer party packs, identity and address evidence, applicable entity requirements and internal RMCP review references.
- Gap or reuse decision: Use per-party requirements; an empty default document list must not hide runtime FICA evidence.

**Review & Approve Seller FICA** — `transfer/seller_fica_review`

Review the seller's applicable identity, address and authority documents in one pack.

- Current inputs: Seller Entity Type (seller_entity_type, seller_type, vendor_type, routingProfile.sellerEntityType, routing_profile.sellerEntityType).
- Catalogue documents: —.
- Current confirmations: 1. Seller identity and FICA documents checked. 2. Seller Marital Status
- Current work actions: `capture_data, open_parties, add_note`. Declared completion note: not required by default.
- Panel content: Only the current seller party packs, identity and address evidence, applicable entity requirements and internal RMCP review references.
- Gap or reuse decision: Use per-party requirements; an empty default document list must not hide runtime FICA evidence.

**Resolve Each Buyer Capacity** — `transfer/buyer_party_capacity_review`

Record a separate identity, beneficial ownership, representative, marital and signing authority decision for every buyer and applicable signatory.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Every buyer and applicable signatory has an attorney-reviewed capacity decision tied to the current party facts.
- Current work actions: `open_parties, add_note`. Declared completion note: required.
- Panel content: Separate buyer and signatory decisions, relevant authority documents and stale approvals requiring another review.
- Gap or reuse decision: Bring the existing party review into context; do not replace per-party decisions with one tick.

**Resolve Each Seller Capacity** — `transfer/seller_party_capacity_review`

Record a separate identity, beneficial ownership, representative, marital and signing authority decision for every seller and applicable signatory.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Every seller and applicable signatory has an attorney-reviewed capacity decision tied to the current party facts.
- Current work actions: `open_parties, add_note`. Declared completion note: required.
- Panel content: Separate seller and signatory decisions, relevant authority documents and stale approvals requiring another review.
- Gap or reuse decision: Bring the existing party review into context; do not replace per-party decisions with one tick.

**Specialist Party Capacity Hold** — `transfer/party_capacity_specialist_review`

Hold the ordinary transfer route for an estate, insolvency, unknown legal type or other exceptional capacity until a reviewed specialist route is available.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Specialist owner, reason and next decision recorded; ordinary signing stays on hold.
- Current work actions: `open_parties, add_note`. Declared completion note: required.
- Panel content: Saved specialist hold, owner, reason and next decision, with history visible for older matters.
- Gap or reuse decision: Historical task; do not add it back into new ordinary plans.

**Classify Specialist Routes** — `transfer/specialist_classification_review`

Record the attorney decision, specialist owner, instrument and evidence for every exceptional route.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Attorney-reviewed specialist evidence and route-specific completion note recorded.
- Current work actions: `open_parties, add_note`. Declared completion note: required.
- Panel content: Applicable specialist routes, reviewed owner, instrument, evidence and decision from the saved classification.
- Gap or reuse decision: Current checklist opens the broader classification screen; focus that editor on this task.

**Review Estate Authority and Transfer** — `transfer/estate_authority_transfer_review`

Verify the executor or representative authority and the applicable deceased-estate transfer path.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Attorney-reviewed specialist evidence and route-specific completion note recorded.
- Current work actions: `open_parties, add_note`. Declared completion note: required.
- Panel content: The saved estate route, representative authority, reviewed instrument and supporting evidence.
- Gap or reuse decision: Use route-specific classification details; the common specialist confirmation is too broad on its own.

**Review Insolvency Authority and Transfer** — `transfer/insolvency_authority_transfer_review`

Verify the trustee or liquidator authority and the applicable transfer path.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Attorney-reviewed specialist evidence and route-specific completion note recorded.
- Current work actions: `open_parties, add_note`. Declared completion note: required.
- Panel content: The saved insolvency route, representative authority, reviewed instrument and supporting evidence.
- Gap or reuse decision: Use route-specific classification details; the common specialist confirmation is too broad on its own.

**Review Court Order or Divorce Transfer** — `transfer/court_order_transfer_review`

Verify the order, parties, implementation authority and required transfer instrument.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Attorney-reviewed specialist evidence and route-specific completion note recorded.
- Current work actions: `open_parties, add_note`. Declared completion note: required.
- Panel content: The relevant order, parties, implementation authority and reviewed instrument from the selected route.
- Gap or reuse decision: Use route-specific classification details; keep professional decisions separate from a general confirmation.

**Resolve Unusual Title Conditions** — `transfer/unusual_title_resolution_review`

Verify the restriction or servitude, consents and registrable instrument.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Attorney-reviewed specialist evidence and route-specific completion note recorded.
- Current work actions: `open_parties, add_note`. Declared completion note: required.
- Panel content: The identified restriction or servitude, reviewed resolution, consents and selected instrument.
- Gap or reuse decision: Use the selected title issue and its evidence, rather than the whole matter profile.

**Review Agricultural Land Consent** — `transfer/agricultural_consent_review`

Verify whether statutory consent or an exception applies and retain the evidence.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Attorney-reviewed specialist evidence and route-specific completion note recorded.
- Current work actions: `open_parties, add_note`. Declared completion note: required.
- Panel content: The saved consent or exception decision and the supporting evidence for this route.
- Gap or reuse decision: Surface the existing specialist decision; do not infer consent from a checklist answer.

**Review Share Block Instrument** — `transfer/share_block_instrument_review`

Verify the legal instrument and whether an ordinary deeds transfer is appropriate.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Attorney-reviewed specialist evidence and route-specific completion note recorded.
- Current work actions: `open_parties, add_note`. Declared completion note: required.
- Panel content: The selected share-block instrument, applicability decision and reviewed supporting records.
- Gap or reuse decision: Preserve route applicability and avoid presenting an ordinary deeds pack as universal.

**Review Other Specialist Route** — `transfer/other_specialist_execution_review`

Verify the specialist decision and evidence for the exceptional route.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Attorney-reviewed specialist evidence and route-specific completion note recorded.
- Current work actions: `open_parties, add_note`. Declared completion note: required.
- Panel content: The selected exceptional route, owner, instrument, reason and supporting decision.
- Gap or reuse decision: Allow the reviewed custom route without generating an unrelated generic checklist.


### Transfer Financial Preparation

**Confirm Transfer Tax Route** — `transfer/transfer_tax_route_confirmed`

Confirm the transfer-duty, VAT, zero-rated, exempt, or advice route from the seller facts and agreement.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Confirm Transfer Tax Route evidence checked and applicable to this matter.
- Current work actions: `open_finance, add_note`. Declared completion note: required.
- Panel content: The current saved tax-route decision, relevant agreement facts, reviewer and evidence reference.
- Gap or reuse decision: Reuse the financial review and route editor; show only the selected tax decision.

**Prepare & Submit TDC01** — `transfer/transfer_duty_tdc01_submission`

Prepare and submit the Transfer Duty Declaration for the transfer-duty route.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Prepare & Submit TDC01 evidence checked and applicable to this matter.
- Current work actions: `open_finance, add_note`. Declared completion note: required.
- Panel content: The applicable declaration, submission date, reference and supporting submission record.
- Gap or reuse decision: Current financial details are projected; check that the task exposes the corresponding saved fields and document target.

**Respond to SARS Evidence Request** — `transfer/sars_evidence_request_response`

Provide supporting material only where SARS has requested it.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Respond to SARS Evidence Request evidence checked and applicable to this matter.
- Current work actions: `open_finance, add_note`. Declared completion note: required.
- Panel content: The actual SARS request, requested evidence, response and response reference for this matter.
- Gap or reuse decision: Conditional task; show the request and response rather than the entire tax register.

**Confirm Duty Assessment & Payment** — `transfer/transfer_duty_assessment_payment`

Record the assessment and payment where transfer duty is payable.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Confirm Duty Assessment & Payment evidence checked and applicable to this matter.
- Current work actions: `open_finance, add_note`. Declared completion note: required.
- Panel content: The assessment, payment position and matching proof for the chosen duty route.
- Gap or reuse decision: Focus the existing tax records; preserve the separate receipt verification.

**Verify VAT / Exemption Evidence** — `transfer/vat_exemption_evidence_verified`

Verify the VAT, zero-rated, or exemption evidence for the selected route.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Verify VAT / Exemption Evidence evidence checked and applicable to this matter.
- Current work actions: `open_finance, add_note`. Declared completion note: required.
- Panel content: The historical combined decision and its evidence for older matters.
- Gap or reuse decision: Historical task; retain review history without duplicating the newer VAT and exemption tasks.

**Review Non-Resident Seller Withholding** — `transfer/non_resident_seller_withholding_review`

Review withholding-tax requirements for a non-resident seller where applicable.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Review Non-Resident Seller Withholding evidence checked and applicable to this matter.
- Current work actions: `open_parties, open_finance, add_note`. Declared completion note: required.
- Panel content: The historical withholding decision and its supporting records.
- Gap or reuse decision: Historical task; do not duplicate the current per-seller reviews.

**Verify Ordinary VAT Basis** — `transfer/ordinary_vat_basis_verified`

Verify vendor status, enterprise supply, agreement treatment and VAT evidence.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Verify Ordinary VAT Basis evidence checked and applicable to this matter.
- Current work actions: `open_finance, add_note`. Declared completion note: required.
- Panel content: The saved ordinary VAT decision, relevant vendor and agreement facts, and supporting evidence.
- Gap or reuse decision: Focus the existing route fields; avoid a generic evidence tick as the only visible work.

**Verify Going-Concern Zero Rate** — `transfer/going_concern_zero_rate_verified`

Review the written going-concern agreement and the facts supporting the claimed zero rate.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Verify Going-Concern Zero Rate evidence checked and applicable to this matter.
- Current work actions: `open_finance, add_note`. Declared completion note: required.
- Panel content: The saved going-concern decision, agreement evidence and reviewed basis for the claimed route.
- Gap or reuse decision: Focus the existing route fields; route changes must invalidate obsolete evidence.

**Verify Claimed Exemption** — `transfer/transfer_duty_exemption_basis_verified`

Record the specific statutory exemption and review its supporting proof.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Verify Claimed Exemption evidence checked and applicable to this matter.
- Current work actions: `open_finance, add_note`. Declared completion note: required.
- Panel content: The recorded exemption basis and the proof supporting that selected basis.
- Gap or reuse decision: Focus the existing exemption decision; do not infer it from not-applicable answers.

**Review Each Non-Resident Seller** — `transfer/non_resident_seller_applicability_review`

Resolve withholding applicability independently for every potentially non-resident seller and seller type.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Review Each Non-Resident Seller evidence checked and applicable to this matter.
- Current work actions: `open_parties, open_finance, add_note`. Declared completion note: required.
- Panel content: One applicability decision per relevant seller, including seller type and saved review basis.
- Gap or reuse decision: Keep the existing per-seller record distinct from a single matter-wide confirmation.

**Verify SARS Directive** — `transfer/non_resident_seller_directive_review`

Review the issued directive and its reference for each seller relying on one.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Verify SARS Directive evidence checked and applicable to this matter.
- Current work actions: `open_parties, open_finance, add_note`. Declared completion note: required.
- Panel content: The directive, reference and reviewed decision for each seller relying on it.
- Gap or reuse decision: Focus the saved seller record and directive; do not mix different sellers' evidence.

**Verify Non-Resident Withholding** — `transfer/non_resident_seller_withholding_payment_review`

Review withholding decision, remittance and proof for each applicable seller.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Verify Non-Resident Withholding evidence checked and applicable to this matter.
- Current work actions: `open_parties, open_finance, add_note`. Declared completion note: required.
- Panel content: Each applicable seller's reserved funds or payment position, payment event, owner, deadline and proof where due.
- Gap or reuse decision: Reuse current withholding decisions; distinguish future remittance from completed payment.

**Verify SARS Transfer-Tax Receipt** — `transfer/sars_transfer_tax_receipt_verified`

Verify the applicable SARS transfer-duty, VAT, zero-rated, or exemption proof before lodgement.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Verify SARS Transfer-Tax Receipt evidence checked and applicable to this matter.
- Current work actions: `open_finance, add_note`. Declared completion note: required.
- Panel content: The current SARS proof for the selected tax route, reference and verification decision.
- Gap or reuse decision: Keep the separate receipt check and lodgement guard; other tax task completion is not a substitute.

**Review Municipal Rates Clearance** — `transfer/municipal_rates_clearance_review`

Review rates figures, payment evidence, and the municipal certificate issuer, reference and validity dates.

- Current inputs: —.
- Catalogue documents: `rates_clearance`, `rates_clearance_certificate`.
- Current confirmations: 1. Review Municipal Rates Clearance evidence checked and applicable to this matter. 2. Rates Clearance Certificate
- Current work actions: `request_document, upload_document, open_documents, open_finance, add_note`. Declared completion note: required.
- Panel content: Figures, payment proof, municipal certificate issuer, reference and usable dates.
- Gap or reuse decision: Show the existing clearance review and document versions; keep the current SAST cutoff rule.

**Review Levy / HOA Clearance** — `transfer/levy_hoa_clearance_review`

Review the body-corporate or HOA clearance only where the property requires it.

- Current inputs: Levy / HOA Account Reference (levy_account_number, levyAccountNumber, body_corporate_account_number, hoa_account_number).
- Catalogue documents: `body_corporate_levy_clearance`, `hoa_levy_clearance`.
- Current confirmations: 1. Review Levy / HOA Clearance evidence checked and applicable to this matter. 2. Hoa Levy Clearance 3. Levy / HOA Account Reference
- Current work actions: `request_document, upload_document, open_documents, open_finance, add_note`. Declared completion note: required.
- Panel content: The older combined body-corporate or HOA review and account reference.
- Gap or reuse decision: Historical task; avoid duplicating the newer separate clearance tasks.

**Review Body-Corporate Clearance** — `transfer/body_corporate_levy_clearance_review`

For sectional title, review the body-corporate clearance, issuer and validity.

- Current inputs: —.
- Catalogue documents: `body_corporate_levy_clearance`.
- Current confirmations: 1. Review Body-Corporate Clearance evidence checked and applicable to this matter.
- Current work actions: `request_document, upload_document, open_documents, open_finance, add_note`. Declared completion note: required.
- Panel content: The applicable body-corporate certificate, issuer, reference and reviewed validity.
- Gap or reuse decision: Show this clearance only for its applicable route; keep issuer conditions visible.

**Review HOA Clearance** — `transfer/hoa_clearance_review`

Where an HOA applies, review the HOA clearance, issuer and validity.

- Current inputs: —.
- Catalogue documents: `hoa_levy_clearance`.
- Current confirmations: 1. Review HOA Clearance evidence checked and applicable to this matter.
- Current work actions: `request_document, upload_document, open_documents, open_finance, add_note`. Declared completion note: required.
- Panel content: The applicable HOA clearance, issuer, reference and reviewed validity.
- Gap or reuse decision: Show this clearance only for its applicable route; do not merge it with municipal clearance.

**Classify Property Conditions** — `transfer/property_conditions_applicability_review`

Decide whether title restrictions and compliance certificates apply to this property and agreement.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Classify Property Conditions evidence checked and applicable to this matter.
- Current work actions: `open_finance, add_note`. Declared completion note: required.
- Panel content: The saved applicability decisions for title restrictions and property or agreement compliance requirements.
- Gap or reuse decision: Use the existing property-condition editor and preserve unknown applicability as unresolved.

**Review Title Conditions** — `transfer/title_conditions_review`

Review applicable title restrictions, servitudes or conditions before lodgement.

- Current inputs: —.
- Catalogue documents: `seller_property_documents`.
- Current confirmations: 1. Review Title Conditions evidence checked and applicable to this matter. 2. Seller Property Documents
- Current work actions: `request_document, upload_document, open_documents, open_parties, open_finance, add_note`. Declared completion note: required.
- Panel content: The applicable title restrictions or servitudes, resolution and supporting documents.
- Gap or reuse decision: Focus each recorded condition and its decision; reuse the property-condition review.

**Review Property Compliance Certificates** — `transfer/property_compliance_review`

Review only the compliance certificates that apply to this property and agreement.

- Current inputs: —.
- Catalogue documents: `compliance_certificates`.
- Current confirmations: 1. Review Property Compliance Certificates evidence checked and applicable to this matter.
- Current work actions: `request_document, upload_document, open_documents, open_finance, add_note`. Declared completion note: required.
- Panel content: Only applicable certificates and the saved applicability decisions for this property and agreement.
- Gap or reuse decision: Do not show irrelevant certificates; preserve municipality and contract conditions.


### Transfer Documents & Guarantees

**Prepare & Review Transfer Document Pack** — `transfer/transfer_document_pack_review`

Prepare the transfer pack and review it against the OTP, parties, property, and finance route.

- Current inputs: —.
- Catalogue documents: `sales_agreement_or_otp`, `seller_property_documents`.
- Current confirmations: 1. Prepare & Review Transfer Document Pack is complete and the supporting documents are reviewed. 2. Sales Agreement Or Otp 3. Seller Property Documents
- Current work actions: `request_document, upload_document, open_documents, add_note`. Declared completion note: required. Declared readiness gate: Lodgement Ready (`lodgement_ready`).
- Panel content: The prepared transfer pack and its review against the saved agreement, parties, property and finance route.
- Gap or reuse decision: Default documents list agreement and property sources, not an explicit prepared-pack target; resolve the actual pack before replacing the UI.

**Complete Buyer Signing** — `transfer/buyer_signing_review`

Schedule or manage the buyer signing route, then review the signed transfer documents.

- Current inputs: —.
- Catalogue documents: `buyer_signed_transfer_documents`.
- Current confirmations: 1. Complete Buyer Signing is complete and the supporting documents are reviewed.
- Current work actions: `request_document, upload_document, open_documents, open_parties, schedule_signing, add_note`. Declared completion note: required.
- Panel content: Buyer appointment or remote route, required signatories, signed pack and review outcome.
- Gap or reuse decision: Reuse signing actions and party review; scheduling alone must not complete signed-pack review.

**Complete Seller Signing** — `transfer/seller_signing_review`

Schedule or manage the seller signing route, then review the signed transfer documents.

- Current inputs: —.
- Catalogue documents: `seller_signed_transfer_documents`.
- Current confirmations: 1. Complete Seller Signing is complete and the supporting documents are reviewed.
- Current work actions: `request_document, upload_document, open_documents, open_parties, schedule_signing, add_note`. Declared completion note: required.
- Panel content: Seller appointment or remote route, required signatories, signed pack and review outcome.
- Gap or reuse decision: Reuse signing actions and party review; scheduling alone must not complete signed-pack review.

**Review Cash Funding Source** — `transfer/cash_funding_source_review`

For cash or hybrid funding, identify the buyer funding source and review its supporting evidence before accepting payment security.

- Current inputs: —.
- Catalogue documents: `proof_of_funds`.
- Current confirmations: 1. Buyer cash component and source identified. 2. Source-of-funds evidence reviewed and any outstanding compliance questions resolved.
- Current work actions: `request_document, upload_document, open_documents, add_note`. Declared completion note: required.
- Panel content: Only the applicable cash component, identified source, source evidence and outstanding review questions.
- Gap or reuse decision: Reuse security review; keep source-of-funds evidence distinct from accepted payment security.

**Review Payment Security** — `transfer/payment_security_review`

Review the applicable guarantee, bond, undertaking, or cleared-trust-funds route and its evidence.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Applicable payment security is reviewed and accepted.
- Current work actions: `add_note`. Declared completion note: required.
- Panel content: The applicable guarantee, undertaking or trust-funds position, evidence and recorded acceptance.
- Gap or reuse decision: Security details exist, but generic work actions project only Add note; expose the relevant evidence and review controls.


### Transfer Lodgement & Registration

**Lodgement Ready** — `transfer/lodgement_ready`

Review the completed lodgement pack and coordination position, then confirm that the transfer is ready for lodgement.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Lodgement pack and applicable cross-attorney coordination are ready.
- Current work actions: `add_note`. Declared completion note: required. Declared readiness gate: Lodgement Ready (`lodgement_ready`).
- Panel content: Unresolved items in the saved plan, applicable lane coordination and required lodgement evidence.
- Gap or reuse decision: Reuse readiness details and guards; no generic completion override should bypass the readiness check.

**Lodged at Deeds Office** — `transfer/lodged_at_deeds_office`

Record the Deeds Office lodgement once the submission has been accepted.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Deeds Office lodgement has been accepted and the lodgement reference is recorded.
- Current work actions: `add_note`. Declared completion note: required. Declared readiness gate: Lodgement Ready (`lodgement_ready`).
- Panel content: Accepted lodgement date, reference and evidence, with only outstanding issues relevant to this milestone.
- Gap or reuse decision: Work actions project Add note; give the milestone a clear reference and evidence capture path.

**On Prep** — `transfer/in_prep`

Record Deeds Office prep once the matter is in preparation for registration.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Deeds Office prep status has been confirmed.
- Current work actions: `add_note`. Declared completion note: not required by default. Declared readiness gate: Registration Ready (`registration_ready`).
- Panel content: Confirmed prep position, confirmation date and evidence or source reference.
- Gap or reuse decision: Work actions project Add note; distinguish recorded prep from inferred readiness.

**Registered** — `transfer/registered`

Confirm the transfer registration and capture its registration evidence before close-out begins.

- Current inputs: —.
- Catalogue documents: `registration_confirmation`.
- Current confirmations: 1. Transfer registration has been confirmed and registration evidence reviewed.
- Current work actions: `request_document, upload_document, open_documents, add_note`. Declared completion note: required. Declared readiness gate: Registration Ready (`registration_ready`).
- Panel content: Registration date, reference and confirmation evidence, tied to the transfer milestone.
- Gap or reuse decision: Reuse document review and registration guards; expose the actual milestone record.


### Transfer Post-Registration & Closure

**Review Final Accounts** — `transfer/post_registration_closeout_review`

Review the final account, proceeds, refunds, fees, and settlement position before closing the file.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Final accounts, proceeds, refunds, and fees position reviewed.
- Current work actions: `add_note`. Declared completion note: not required by default.
- Panel content: Final account, proceeds, refunds, fees and relevant settlement or withholding evidence.
- Gap or reuse decision: Reuse closure review, focused on financial close-out; keep financial notes internal.

**Matter Closed** — `transfer/matter_closed`

Close the file after financial close-out, recipient-scoped registration communication, and any linked attorney lanes are complete.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Matter closure is confirmed and the file is ready to be archived. 2. Registration communication recorded for all appropriate recipients.
- Current work actions: `add_note`. Declared completion note: not required by default.
- Panel content: Administrative closure checklist, linked-lane completion and existing recipient-specific communication records.
- Gap or reuse decision: Reuse closure checks; recording communication evidence must not send an update automatically.


### Bond registration Instruction & Bank

**Bond Instruction Received** — `bond/bond_instruction_received`

Bond attorney instruction has been received and logged.

- Current inputs: —.
- Catalogue documents: `bond_instruction`.
- Current confirmations: 1. Bond instruction received from bank or bond originator. 2. Instruction date and source captured.
- Current work actions: `request_document, upload_document, open_documents, add_note`. Declared completion note: not required by default. Declared readiness gate: Finance Ready (`finance_ready`).
- Panel content: Bank instruction, source, instruction date and evidence.
- Gap or reuse decision: Keep instruction collection distinct from loan approval and authority to lodge.

**Bank and Reference Captured** — `bond/bank_reference_captured`

Bank, branch, bond amount, and reference/account details are captured.

- Current inputs: Bond Bank (bond_bank, bank_name, bankName, finance_bank, bond.bank_name); Bond Reference / Account (bond_reference, bank_reference, bankReference, bond_account_number, loan_account_number, bond.account_number).
- Catalogue documents: —.
- Current confirmations: 1. Bank name captured. 2. Bank reference, loan account, or attorney instruction reference captured.
- Current work actions: `capture_data, add_note`. Declared completion note: not required by default.
- Panel content: Bank, reference or account and the relevant amount from the saved bond record.
- Gap or reuse decision: Capture action routes to broader details; expose the specific saved fields in context.

**Grant / Approval Letter Received** — `bond/bond_approval_letter_received`

The bank grant or bond approval letter has been received.

- Current inputs: Bond Approval Amount (bond_approval_amount, approved_bond_amount, loan_amount, bond.amount).
- Catalogue documents: `bond_instruction`, `bond_approval_letter`.
- Current confirmations: 1. Bank grant or approval letter received. 2. Approval amount and conditions reviewed. 3. Bond Approval Amount
- Current work actions: `request_document, upload_document, open_documents, add_note`. Declared completion note: required.
- Panel content: The grant or approval letter, approved amount and relevant conditions.
- Gap or reuse decision: Loan approval is distinct from approval to lodge; default input exists but no capture_data action is projected for this task.


### Bond registration Bank Conditions

**Bank Conditions Reviewed** — `bond/bank_requirements_confirmed`

Bank conditions and attorney requirements have been reviewed.

- Current inputs: —.
- Catalogue documents: `bank_requirements`.
- Current confirmations: 1. Bank conditions checklist reviewed. 2. Outstanding conditions are listed with owners.
- Current work actions: `request_document, upload_document, open_documents, add_note`. Declared completion note: not required by default.
- Panel content: The current bank requirements with each outstanding condition, owner and evidence.
- Gap or reuse decision: A confirmation does not supply a condition editor; reuse or define the saved condition record.

**Bank Conditions Outstanding** — `bond/bank_conditions_outstanding`

Outstanding bank conditions are captured and assigned.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Outstanding bank conditions captured. 2. Owner and follow-up action recorded for each condition.
- Current work actions: `add_note`. Declared completion note: required.
- Panel content: Only unresolved bank conditions, owners, follow-up dates and responses.
- Gap or reuse decision: Work actions project only Add note; provide a condition list rather than free-text-only progress.

**Bank Conditions Resolved** — `bond/bank_conditions_resolved`

Bank conditions required before lodgement have been resolved.

- Current inputs: —.
- Catalogue documents: `bank_requirements`.
- Current confirmations: 1. Outstanding bank conditions cleared. 2. Bank or internal confirmation saved.
- Current work actions: `request_document, upload_document, open_documents, add_note`. Declared completion note: not required by default.
- Panel content: Each condition's resolution and matching bank or internal evidence.
- Gap or reuse decision: Show resolved conditions and unresolved exceptions, rather than a second generic document screen.


### Bond registration Documents & Guarantees

**Bond Documents Prepared** — `bond/bond_documents_prepared`

Bond documentation has been prepared for buyer signature.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Bond document pack prepared. 2. Bond amount, parties, and property details checked.
- Current work actions: `add_note`. Declared completion note: not required by default.
- Panel content: The prepared bond pack and review of amount, parties and property.
- Gap or reuse decision: No explicit default pack target or capture fields; define the pack link and review record.

**Buyer Bond Signing Scheduled** — `bond/buyer_bond_signing_scheduled`

Buyer signing appointment for bond documents has been scheduled.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Buyer bond signing appointment or remote instruction captured. 2. Buyer signing requirements sent.
- Current work actions: `open_parties, open_documents, schedule_signing, add_note`. Declared completion note: not required by default.
- Panel content: Appointment or remote route, date and time, attendees and signing instructions.
- Gap or reuse decision: Reuse existing scheduling callback; distinguish appointment data from a note or follow-up command.

**Buyer Signed Bond Documents** — `bond/buyer_signed_bond_documents`

Buyer signatures on the bond documents have been received.

- Current inputs: —.
- Catalogue documents: `buyer_signed_bond_documents`.
- Current confirmations: 1. Buyer signed bond documents received. 2. Signing, witnessing, and FICA checks completed.
- Current work actions: `request_document, upload_document, open_documents, open_parties, schedule_signing, add_note`. Declared completion note: required.
- Panel content: The signed bond pack with signing, witnessing and applicable party checks.
- Gap or reuse decision: Keep this a document review; a Schedule Signing action is secondary after the signed pack arrives.

**Documents Sent to Bank for Approval** — `bond/bond_documents_sent_to_bank`

Signed bond documents have been sent to the bank for approval where applicable.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Signed docs sent to bank or uploaded to bank portal. 2. Submission date/reference captured.
- Current work actions: `add_note`. Declared completion note: not required by default.
- Panel content: Submitted pack version, bank channel, submission date, reference and supporting record.
- Gap or reuse decision: Work actions project only Add note; add submission controls without implying automatic bank delivery.

**Bank Approval to Lodge Received** — `bond/bank_approval_to_lodge_received`

The bank has approved lodgement of the bond documents.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Bank approval to lodge received. 2. Approval date/reference captured.
- Current work actions: `add_note`. Declared completion note: required. Declared readiness gate: Lodgement Ready (`lodgement_ready`).
- Panel content: Bank authority to lodge, approval date, reference, conditions and evidence.
- Gap or reuse decision: Work actions project only Add note and no default authority document; show the authority record and define how queries and resubmissions remain visible.

**Guarantees Issued** — `bond/guarantees_issued`

Guarantees have been issued to the transfer attorney.

- Current inputs: —.
- Catalogue documents: `guarantee_letter`.
- Current confirmations: 1. Guarantees issued to transfer attorney. 2. Guarantee values, wording, and expiry checked.
- Current work actions: `request_document, upload_document, open_documents, open_finance, add_note`. Declared completion note: not required by default.
- Panel content: Issued guarantees, values, wording, expiry and recipient evidence.
- Gap or reuse decision: Distinguish document issue and delivery evidence from another generic guarantee upload.

**Guarantee Wording Accepted** — `bond/guarantee_wording_accepted`

Guarantee wording has been accepted by the transfer attorney.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Transfer attorney accepted guarantee wording. 2. Any wording amendments are resolved.
- Current work actions: `open_finance, add_note`. Declared completion note: required.
- Panel content: Recipient acceptance, reviewed version and any resolved wording amendments.
- Gap or reuse decision: No default acceptance evidence target; link acceptance to the actual issued guarantee.


### Bond registration Lodgement & Registration

**Bank Lodgement Instructions Confirmed** — `bond/bond_lodgement_instructions_confirmed`

Confirm the bank instruction to lodge, its current conditions and the linked transfer lodgement arrangements.

- Current inputs: —.
- Catalogue documents: `bond_instruction`.
- Current confirmations: 1. Current bank lodgement instruction and conditions checked. 2. Bond attorney confirms the transfer coordination and lodgement reference.
- Current work actions: `request_document, upload_document, open_documents, add_note`. Declared completion note: required.
- Panel content: Current bank lodgement instruction, conditions and linked transfer coordination.
- Gap or reuse decision: Keep this current-instruction review separate from the earlier approval-to-lodge record.

**Bond Lodgement Pack Ready** — `bond/bond_lodgement_ready`

The bond pack is ready to lodge simultaneously with the transfer.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Bond lodgement pack complete. 2. Simultaneous lodgement coordination confirmed.
- Current work actions: `add_note`. Declared completion note: required. Declared readiness gate: Lodgement Ready (`lodgement_ready`).
- Panel content: Bond pack and applicable simultaneous-lodgement readiness issues.
- Gap or reuse decision: Reuse cross-lane readiness model and canonical milestone guard.

**Bond Lodged Simultaneously** — `bond/bond_lodged`

The bond documents have been lodged with the transfer.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Bond lodgement confirmed. 2. Simultaneous lodgement reference captured.
- Current work actions: `add_note`. Declared completion note: required. Declared readiness gate: Lodgement Ready (`lodgement_ready`).
- Panel content: Accepted bond lodgement date, reference and linked submission evidence.
- Gap or reuse decision: Work actions project only Add note; expose the milestone's saved reference and evidence.

**Bond Registered** — `bond/bond_registered`

Bond registration has been confirmed.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Bond registration confirmed. 2. Registration date captured.
- Current work actions: `add_note`. Declared completion note: required. Declared readiness gate: Registration Ready (`registration_ready`).
- Panel content: Confirmed bond registration date, reference and supporting evidence.
- Gap or reuse decision: No default registration document target; resolve the milestone evidence capture path.

**Bank Confirmation and Close-Out Complete** — `bond/bond_close_out_complete`

Final bank confirmation and bond close-out tasks are complete.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Bank final confirmation completed. 2. Bond attorney close-out checklist completed.
- Current work actions: `add_note`. Declared completion note: not required by default.
- Panel content: Bank final confirmation and the actual bond close-out checklist with supporting records.
- Gap or reuse decision: Work actions project only Add note; keep funding or bank confirmation distinct from registration.


### Bond cancellation Instruction & Bank

**Existing Bond Confirmed** — `cancellation/cancellation_existing_bond_confirmed`

The seller existing bond requiring cancellation has been confirmed.

- Current inputs: Seller Existing Bond Status (seller_has_existing_bond, seller_has_bond, existing_bond, has_existing_bond, bond_status, seller.bond_status, routingProfile.sellerHasExistingBond, routing_profile.sellerHasExistingBond).
- Catalogue documents: —.
- Current confirmations: 1. Seller existing bond confirmed. 2. Cancellation requirement recorded on the matter.
- Current work actions: `capture_data, open_parties, add_note`. Declared completion note: not required by default.
- Panel content: The seller's registered security position and cancellation decision.
- Gap or reuse decision: Reuse bond decision controls; include paid-up registered security where the saved review requires it.

**Cancellation Bank Captured** — `cancellation/cancellation_bank_captured`

The cancellation bank has been captured.

- Current inputs: Cancellation Bank (cancellation_bank, cancellationBank, existing_bond_bank, seller_bond_bank, seller.bank_name, cancellation.bank_name).
- Catalogue documents: —.
- Current confirmations: 1. Cancellation bank captured. 2. Bank details checked with seller or cancellation instruction.
- Current work actions: `capture_data, add_note`. Declared completion note: not required by default.
- Panel content: The cancellation lender and verified bank details.
- Gap or reuse decision: Capture action routes to wider details; expose the specific saved lender fields.

**Bond Account Number Captured** — `cancellation/cancellation_bond_account_captured`

The seller bond account or reference number has been captured.

- Current inputs: Bond Account Number (cancellation_bond_account_number, bond_account_number, seller_bond_account_number, existing_bond_account_number, home_loan_account_number, cancellation.account_number).
- Catalogue documents: —.
- Current confirmations: 1. Bond account number or reference captured. 2. Account details checked before figures request.
- Current work actions: `capture_data, add_note`. Declared completion note: not required by default.
- Panel content: Each relevant bond or settlement account reference and the checked source.
- Gap or reuse decision: Avoid assuming one account where the registered-security review identifies several.

**Cancellation Instruction Received** — `cancellation/cancellation_instruction_received`

Cancellation instruction has been received by the cancellation attorney.

- Current inputs: —.
- Catalogue documents: `seller_bond_cancellation_information`.
- Current confirmations: 1. Cancellation instruction received. 2. Instruction source, bank, and reference captured.
- Current work actions: `request_document, upload_document, open_documents, add_note`. Declared completion note: not required by default.
- Panel content: Cancellation instruction, source, bank and reference, with the instruction evidence.
- Gap or reuse decision: Focus the instruction evidence; keep lender consent as a separate review.


### Bond cancellation Notice & Figures

**Bond Cancellation Notice Status Captured** — `cancellation/notice_period_captured`

Capture the lender-specific notice period, date and any early-settlement or penalty position.

- Current inputs: Cancellation Notice Status (notice_period_status, noticePeriodStatus, ninety_day_notice_status, cancellation_notice_status).
- Catalogue documents: —.
- Current confirmations: 1. Notice status captured. 2. Notice date or no-notice risk recorded.
- Current work actions: `capture_data, add_note`. Declared completion note: not required by default.
- Panel content: Saved lender-specific notice status, notice date and reviewed basis.
- Gap or reuse decision: Expose existing notice fields; do not add a universal notice-period rule.

**Cancellation Figures Requested** — `cancellation/cancellation_figures_requested`

Settlement or cancellation figures have been requested from the bank.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Cancellation figures request sent to bank. 2. Request date/reference captured.
- Current work actions: `add_note`. Declared completion note: not required by default.
- Panel content: The requested account, recipient, date, reference and request evidence.
- Gap or reuse decision: Work actions project only Add note; add request record controls without implying a request was sent.

**Cancellation Figures Received** — `cancellation/cancellation_figures_received`

Cancellation figures have been received and checked.

- Current inputs: —.
- Catalogue documents: `cancellation_figures`.
- Current confirmations: 1. Cancellation figures received. 2. Settlement amount and account details checked.
- Current work actions: `request_document, upload_document, open_documents, add_note`. Declared completion note: required.
- Panel content: Current figures, amounts and account details, with the matching figures document.
- Gap or reuse decision: Link figures and accounts explicitly; preserve older versions for history.

**Figures Expiry Date Captured** — `cancellation/figures_expiry_captured`

The cancellation figures expiry date has been captured.

- Current inputs: Figures Expiry Date (cancellation_figures_expiry_date, figures_expiry_date, settlement_figures_expiry_date, cancellation.expiry_date).
- Catalogue documents: —.
- Current confirmations: 1. Figures expiry date captured. 2. Expiry checked against expected lodgement timeline.
- Current work actions: `capture_data, add_note`. Declared completion note: required.
- Panel content: The current figures version and its expiry date, checked against the expected timeline.
- Gap or reuse decision: Reuse the saved expiry field; replacement figures must not silently retain the previous expiry.

**Penalty and Notice Risk Captured** — `cancellation/notice_penalty_risk_captured`

Penalty or short-notice risk is captured and escalated where needed.

- Current inputs: Penalty / Notice Risk (penalty_notice_risk, notice_penalty_risk, cancellation_penalty_amount, early_settlement_penalty).
- Catalogue documents: —.
- Current confirmations: 1. Penalty risk reviewed. 2. Any penalty or notice concern escalated to the responsible attorney/client team.
- Current work actions: `add_note`. Declared completion note: not required by default.
- Panel content: The reviewed notice or penalty position, amount where recorded, escalation and next action.
- Gap or reuse decision: Default required input exists but no capture_data action is projected; define a concrete risk editor.


### Bond cancellation Guarantees & Documents

**Guarantees Requested** — `cancellation/cancellation_guarantees_requested`

Guarantees have been requested from the transfer or bond attorney.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Guarantee request sent. 2. Required settlement amount and wording supplied.
- Current work actions: `open_finance, add_note`. Declared completion note: not required by default.
- Panel content: Required settlement amount, wording, recipient and request date or reference.
- Gap or reuse decision: Only Financials and Add note are projected; provide the request record in context.

**Guarantees Received** — `cancellation/cancellation_guarantees_received`

Guarantees have been received for the cancellation.

- Current inputs: —.
- Catalogue documents: `guarantee_letter`.
- Current confirmations: 1. Cancellation guarantees received. 2. Guarantee amount and bank details checked against figures.
- Current work actions: `request_document, upload_document, open_documents, open_finance, add_note`. Declared completion note: not required by default.
- Panel content: Received guarantee version, amount and bank details against current figures.
- Gap or reuse decision: Show receipt separately from acceptance; use current figures and the linked guarantee.

**Guarantees Accepted** — `cancellation/cancellation_guarantees_accepted`

Guarantees have been accepted by the cancellation bank or attorney.

- Current inputs: —.
- Catalogue documents: `guarantee_letter`.
- Current confirmations: 1. Guarantees accepted. 2. Any guarantee wording changes resolved.
- Current work actions: `request_document, upload_document, open_documents, open_finance, add_note`. Declared completion note: required.
- Panel content: The received guarantee and the actual acceptance or wording-amendment evidence.
- Gap or reuse decision: An uploaded guarantee alone does not show acceptance; expose the acceptance decision.

**Review Settlement Guarantee Allocation** — `cancellation/cancellation_guarantee_allocation_review`

Reconcile the bank settlement figures with each guarantee and the balance payable to the seller.

- Current inputs: —.
- Catalogue documents: `cancellation_figures`, `guarantee_letter`.
- Current confirmations: 1. Guarantee amount and beneficiary match current figures. 2. Any shortfall, surplus, or revised allocation is resolved with the transfer attorney. 3. All registered bonds and linked settlement accounts are recorded and reconciled.
- Current work actions: `request_document, upload_document, open_documents, open_finance, add_note`. Declared completion note: required.
- Panel content: Existing registered-security and settlement-account register, guarantee allocation, beneficiaries, shortfall or surplus and resolution.
- Gap or reuse decision: Reuse the structured security register; keep allocations tied to the current figures and guarantee versions.

**Cancellation Documents Prepared** — `cancellation/cancellation_documents_prepared`

Cancellation documents have been prepared or received.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Cancellation consent or bond documents prepared. 2. Documents checked against bank instruction.
- Current work actions: `add_note`. Declared completion note: not required by default.
- Panel content: Prepared cancellation documents or consent pack, checked against the bank instruction.
- Gap or reuse decision: No explicit default prepared-pack target; resolve the document link before replacing the screen.

**Seller Cancellation Documents Signed** — `cancellation/seller_cancellation_documents_signed`

Seller cancellation documents have been signed where required.

- Current inputs: —.
- Catalogue documents: `seller_signed_cancellation_documents`.
- Current confirmations: 1. Seller cancellation documents signed where required. 2. Signing authority and witnessing checked. 3. Does the lender instruction or reviewed instrument require seller signatures? Record the basis for Yes or No.
- Current work actions: `request_document, upload_document, open_documents, open_parties, schedule_signing, add_note`. Declared completion note: required.
- Panel content: Saved signature applicability and basis, then signatories, witnessing and signed documents only where required.
- Gap or reuse decision: Retain the lender or instrument decision; absence of required seller signatures must not waive bondholder consent.

**Bondholder Consent Confirmed** — `cancellation/cancellation_consent_confirmed`

Confirm the bondholder has consented to cancellation or release on the bank instruction and guarantees.

- Current inputs: —.
- Catalogue documents: `cancellation_consent`.
- Current confirmations: 1. Bondholder consent or authorised cancellation instruction verified. 2. Any consent conditions resolved before lodgement.
- Current work actions: `request_document, upload_document, open_documents, add_note`. Declared completion note: required.
- Panel content: Reviewed bondholder consent or authorised cancellation instruction and outstanding conditions.
- Gap or reuse decision: Keep the consent document and decision distinct from seller signing.


### Bond cancellation Registration & Close-Out

**Simultaneous Lodgement Confirmed** — `cancellation/cancellation_simultaneous_lodgement_confirmed`

Agree the linked transfer, cancellation and new bond lodgement arrangement where applicable.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Transfer and cancellation attorneys confirm the same lodgement plan. 2. New bond attorney included where the buyer is registering a bond.
- Current work actions: `add_note`. Declared completion note: required.
- Panel content: The agreed lodgement plan and confirmations from only the applicable linked attorneys.
- Gap or reuse decision: Work actions project only Add note; expose the coordination record and evidence.

**Cancellation Lodgement Ready** — `cancellation/cancellation_lodgement_ready`

Cancellation is ready to lodge simultaneously with the transfer and bond.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Cancellation lodgement pack complete. 2. Figures, guarantees, and simultaneous lodgement coordination confirmed.
- Current work actions: `add_note`. Declared completion note: required. Declared readiness gate: Lodgement Ready (`lodgement_ready`).
- Panel content: Current figures, guarantees, consent and relevant simultaneous-lodgement readiness issues.
- Gap or reuse decision: Reuse cross-lane readiness model and canonical guard; preserve document expiry checks.

**Cancellation Lodged Simultaneously** — `cancellation/cancellation_lodged`

Cancellation has been lodged with the linked transfer and bond.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Cancellation lodgement confirmed. 2. Simultaneous lodgement date/reference captured.
- Current work actions: `add_note`. Declared completion note: required. Declared readiness gate: Lodgement Ready (`lodgement_ready`).
- Panel content: Accepted cancellation lodgement date, reference and linked submission evidence.
- Gap or reuse decision: Work actions project only Add note; expose the saved milestone reference and evidence.

**Cancellation Registered** — `cancellation/cancellation_registered`

Seller bond cancellation has registered.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Cancellation registration confirmed. 2. Registration date captured.
- Current work actions: `add_note`. Declared completion note: required. Declared readiness gate: Registration Ready (`registration_ready`).
- Panel content: Confirmed cancellation registration date, reference and supporting evidence.
- Gap or reuse decision: No default registration document target; resolve the milestone evidence capture path.

**Settlement / Proof of Payment Captured** — `cancellation/settlement_proof_captured`

Settlement or proof of payment has been captured after cancellation registration.

- Current inputs: Settlement Payment Reference (settlement_payment_reference, proof_of_payment_reference, cancellation_settlement_reference).
- Catalogue documents: —.
- Current confirmations: 1. Settlement proof or payment confirmation captured. 2. Settlement amount reconciled to cancellation figures. 3. Each security account has registration and settlement evidence.
- Current work actions: `add_note`. Declared completion note: not required by default.
- Panel content: Existing per-account settlement register, payment reference, amount, proof and reconciliation to current figures.
- Gap or reuse decision: Structured settlement register exists; default payment input has no capture_data action and proof has no default document target.

**Cancellation Close-Out Complete** — `cancellation/cancellation_close_out_complete`

The cancellation matter is closed out.

- Current inputs: —.
- Catalogue documents: —.
- Current confirmations: 1. Cancellation close-out checklist completed. 2. Bank and stakeholder closure confirmations saved where applicable.
- Current work actions: `add_note`. Declared completion note: not required by default.
- Panel content: Actual cancellation close-out checklist, bank confirmation and relevant stakeholder records.
- Gap or reuse decision: Work actions project only Add note; expose close-out records without assuming payment from registration alone.

## Compatibility coverage

| Saved work shape | Current observation | Required treatment |
| --- | --- | --- |
| Current catalogue key | All 89 definitions have an operational contract and map to one of the 14 configured stages. | Reuse the contracted controls inside the shared panel. |
| Historical catalogue definition | Specialist party hold, combined VAT/exemption, generic non-resident withholding and combined levy/HOA tasks remain in the catalogue. | Keep saved work and history accessible; do not introduce these as extra tasks in new ordinary plans. |
| Declared alias | There are 71 declared aliases. All resolve through `getAttorneyStageDefinition`. When supplied directly as raw saved-journey keys, all 71 local fixtures lack a contract because that branch looks up the key directly. | Treat recognised older keys explicitly. Preserve the saved identifier and outcome; attach suitable current controls only after checking the original task's meaning. Do not collapse several older granular tasks into one review or merge their histories implicitly. |
| Unrecognised saved task with a known phase | A local fixture in each lane retains its saved title, completed outcome and phase, with no operational contract. | Provide a compatibility view in the shared shell instead of the cluttered legacy layout. Keep history readable and explain any unsupported edit. |
| Task with missing or unrecognised phase | The current phase builder uses configured lane stages. | Provide a visible place for unmatched saved work or a clear recovery message; never let unmatched work disappear from the list while affecting totals. |
| Invalid or obsolete task link | Navigation checks resolve invalid stage/task combinations back to the overview. | Keep recovery explicit and preserve the lane and matter context. |

The alias observation describes raw view-model input, not a verified production reader defect. Confirm what the shared journey reader supplies before choosing whether compatibility belongs at the reader boundary or in the panel adapter.

## Existing controls to carry into the panel

| Work | Existing owner | Preserve |
| --- | --- | --- |
| Stage and task navigation | `transferWorkspaceNavigation.js`, `TransferStageOverview.jsx`, host navigation callbacks | Lane, stage, task, valid links, dirty-answer decision and return context. |
| Confirmations and structured registers | `TaskConfirmations.jsx`, `legalTaskConfirmations.js` and the work packet | Stable item IDs, saved answers, notes and register rows, partial saves and retry behaviour. |
| Task outcomes | Host `persistTaskUpdate` and `submitStatusDraft`, `attorneyWorkflowLaneService.js` | Canonical authorised save, task identity, reasons, manual completion metadata and history. |
| Intake, source and title details | Workbench callbacks for matter number, matter team, source details and title details | Existing field saves and refresh; avoid duplicating the same values in new task-only storage. |
| Parties and specialist decisions | Matter scenario, capacity and routing profile services | Per-party/signatory decisions, stale approval handling, route applicability and internal evidence scope. |
| Tax and property reviews | `stageThreeFinancialReview.js`, transfer tax and property-condition editors | Selected route, seller-specific records, current certificates and evidence references. |
| Payment security | `stageFourSecurityReview.js` and the existing finance/document services | Applicable cash and bond components, evidence versions and security acceptance. |
| Lodgement and registration | `stageFiveLodgementReview.js`, tax lodgement gate and canonical mutation | Applicable lanes, current plan, assignments, document validity and save-time checks. |
| Closure | `stageSixClosureReview.js` and existing close-out services | Internal financial work, recipient-specific communication evidence and linked-lane completion. |
| Signing appointments | `LegalTaskAppointmentForm` and the host appointment callback | Real appointment data, task linkage and separate save/delivery feedback. Creation can send an invitation; expose that as an explicit action, never as an incidental draft save. |
| Documents | Existing request, upload, review and library callbacks | Requirement and party/account identity, originals, versions, document permissions and scoped access. |

Matter-wide dashboards and the full history remain available outside the task panel. Their omission from a selected task does not remove the underlying operational work.

## Phase 2 acceptance criteria

The next phase should deliver the shared stage, task-list and side-panel layout **for every stage in all three lanes**. It should reuse existing content first, carry all current task keys, and provide a compatibility view for older or unrecognised saved tasks. Task-specific field additions and workflow catalogue changes remain in Phase 4.

Phase 2 is ready for review when:

- Selecting a task opens the focused panel without replacing the selected stage or task list. Selecting a stage never starts or completes its work.
- All 89 catalogue definitions can render; applicable matters still display only their saved tasks. Historical and newer saved work remains reachable.
- Desktop, mobile, keyboard navigation, panel close, browser Back and direct links preserve task context. Focus and list position return to the same row.
- Unsaved confirmations, field changes and comments survive permitted in-context work or trigger one consistent save/discard decision.
- Read-only users can review work; authorised attorneys retain the existing permissions across all three lanes. Document and cross-firm permissions remain separate.
- The panel shows relevant task content without matter coverage, a lane-wide command queue or repeated outcome containers.
- Completion method and outstanding checks are understandable, and current hard checks remain intact.

Phase 3 must then verify draft, outcome, comment and document saves through the shared panel. Phase 4 must resolve the per-task editor gaps above, especially bank submission and authority, bank conditions, prepared packs, milestone references and close-out. No universal lender sequence, extra mandatory task or new storage model is assumed by this audit.

## Verification results

The local catalogue projection checked **89 unique keys, 89 contracts and 14 stage mappings**, selected each exact task without falling back to a different task, and recorded its current prompts and work actions. Separate fixtures checked 71 declared aliases and an unrecognised saved task in each lane. No live matter or production data was changed.

| Existing focused check | Result on 6 October 2026 |
| --- | --- |
| `node scripts/attorney-task-operational-contract.test.mjs` | Passed for all 89 legal workflow tasks. |
| `node scripts/attorney-transfer-navigation.test.mjs` | Passed stage/task return, all three lanes, guarded drafts, deep links and read-only review. |
| `node --test scripts/attorney-workbench-permission-contract.test.mjs` | Passed three-lane editing and private-access checks. |
| `node scripts/legal-task-workbench-simplification.test.mjs` | Failed at line 47: expects the old “Confirmations” heading; current component renders “Task checklist”. |
| `node scripts/legal-task-inline-work.test.mjs` | Failed at line 81: expects the intake source-confirmation note to be disabled; the current confirmation permits a note. |

The two failing checks were run against existing source without changing application code in this phase. Reconcile their expectations with the intended behaviour before using them as acceptance checks for the redesign. The passing local checks do not establish live Tuckers access or a deployed database state. Browser verification of the actual shared panel belongs to its implementation phase.
