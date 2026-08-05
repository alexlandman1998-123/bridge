# OTP Generator Phase 30 Agent Controlled Edits

Generated: 2026-08-05T12:57:20.599Z
Version: otp_agent_controlled_edits_phase30_v1
Contract: otp-vnext-agent-controlled-edits-phase30-v1
Status: OTP_AGENT_CONTROLLED_EDITS_READY_FOR_UI_WIRING
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Routes | 2 |
| Editable sections | 8 |
| Standard condition controls | 5 |
| Custom condition fields | 7 |
| Blockers | 0 |
| Next phase | Phase 31: Agent OTP Review UI Wiring |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE30_PHASE29_FINAL_GATE_READY | yes | Agent controlled edits start after the final production readiness gate is green. |
| PHASE30_AGENT_REVIEW_SECTIONS_PRESENT | yes | Agent review modal exposes controlled sections for parties, economics, conditions, buyer costs and special conditions. |
| PHASE30_STANDARD_CONDITION_TOGGLES_PRESENT | yes | Standard suspensive-condition toggles exist before any custom condition path. |
| PHASE30_SAFE_STRUCTURED_EDITS_CAN_GENERATE | yes | Safe structured edits and standard condition toggles can render into the OTP without template mutation. |
| PHASE30_CUSTOM_CONDITIONS_REQUIRE_APPROVAL | yes | Guided custom suspensive conditions require approval before they can render. |
| PHASE30_RAW_TEMPLATE_EDITING_BLOCKED | yes | Agents cannot edit published template clauses, route defaults or signing maps through OTP review. |
| PHASE30_ROUTE_SPECIFIC_CONTROLS_SEPARATED | yes | New-development controls stay out of resale review and route separation remains enforced. |
| PHASE30_NO_MUTATION_DURING_REVIEW | yes | Phase 30 builds review controls and decisions without mutating transaction, template or signing records. |

## Agent Review Sections

| Section | Fields | Approval Required | Actions |
| --- | --- | --- | --- |
| Buyer and seller/developer details | buyer_full_name, buyer_id_number, buyer_email, buyer_phone, seller_full_name, developer_name | no | edit_party_details, request_authority_documents |
| Property details | property_address, property_title_type, fixtures_included, fixtures_excluded | no | edit_property_details, review_fixtures |
| Price, deposit and guarantees | purchase_price, deposit_amount, deposit_due_date, guarantee_delivery_deadline, guarantee_delivery_period | no | edit_price_deposit, update_guarantee_terms |
| Finance and suspensive conditions | finance_type, bond_amount, bond_approval_deadline, cash_amount, cash_proof_deadline, structured_suspensive_conditions | no | toggle_standard_condition, add_guided_custom_condition, request_condition_approval |
| Occupation and occupational rent | occupation_date, occupational_rent_payable, occupational_rent_amount | no | edit_occupation_terms |
| Buyer cost obligations | otp_buyer_cost_obligations, otp_pending_cost_obligations, matter_attorney_cost_quote_status | no | edit_cost_obligation, mark_cost_not_applicable, request_matter_attorney_quote |
| Commission | mandate_commission_snapshot, otp_commission_proposal, otp_commission_variation_status | yes | request_commission_approval, review_locked_commission |
| Special conditions and annexures | special_conditions, annexures_list | yes | add_special_condition, attach_annexure, request_special_condition_approval |

## Standard Suspensive Controls

| Control | Routes | Required Fields | Risk | Approval Required |
| --- | --- | --- | --- | --- |
| bond_approval | resale_existing_property, new_development | bond_amount, bond_approval_deadline | safe_structured | no |
| cash_proof | resale_existing_property, new_development | cash_amount, cash_proof_deadline | safe_structured | no |
| subject_to_sale | resale_existing_property | subject_sale_property, subject_sale_minimum_price, subject_sale_fulfilment_date | review_required | no |
| guarantee_delivery | resale_existing_property, new_development | guarantee_delivery_deadline | safe_structured | no |
| development_document_approval | new_development | annexures_list, irrevocable_offer_expiry | review_required | no |

## Boundary

Phase 30 lets agents edit transaction terms through controlled records only. It does not allow raw legal-template editing, published-template mutation, signing role-map changes, route-default changes, signing dispatch, or production activation.
