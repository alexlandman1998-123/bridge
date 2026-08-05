import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_AGENT_BLOCKED_EDIT_TARGETS,
  OTP_AGENT_CONTROLLED_EDITS_CONTRACT,
  OTP_AGENT_CONTROLLED_EDITS_PHASE30_VERSION,
  OTP_AGENT_CONTROLLED_EDITS_READY_STATUS,
  OTP_AGENT_CUSTOM_CONDITION_FIELDS,
  OTP_AGENT_EDITABLE_SECTIONS,
  OTP_AGENT_STANDARD_CONDITION_CONTROLS,
  buildOtpAgentConditionRecord,
  buildOtpAgentControlledEditModel,
  buildOtpAgentControlledEditsPhase30Audit,
  formatOtpAgentControlledEditsPhase30Markdown,
} from '../src/core/documents/otpAgentControlledEditsPhase30.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const source = await readFile(new URL('../src/core/documents/otpAgentControlledEditsPhase30.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-agent-controlled-edits-phase30'],
  'node scripts/otp-agent-controlled-edits-phase30.test.mjs',
  'package.json should expose the OTP agent controlled edits Phase 30 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-agent-controlled-edits-phase30'],
  'node scripts/report-otp-agent-controlled-edits-phase30.mjs',
  'package.json should expose the OTP agent controlled edits Phase 30 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-agent-controlled-edits-phase30'),
  'OTP vNext verification should include Phase 30 agent controlled edits.',
)

assert.equal(OTP_AGENT_CONTROLLED_EDITS_PHASE30_VERSION, 'otp_agent_controlled_edits_phase30_v1')
assert.equal(OTP_AGENT_CONTROLLED_EDITS_READY_STATUS, 'OTP_AGENT_CONTROLLED_EDITS_READY_FOR_UI_WIRING')
assert.equal(OTP_AGENT_CONTROLLED_EDITS_CONTRACT, 'otp-vnext-agent-controlled-edits-phase30-v1')

assert.ok(OTP_AGENT_EDITABLE_SECTIONS.some((section) => section.key === 'finance_and_suspensive_conditions'))
assert.ok(OTP_AGENT_EDITABLE_SECTIONS.some((section) => section.key === 'buyer_cost_obligations'))
assert.ok(OTP_AGENT_EDITABLE_SECTIONS.some((section) => section.key === 'special_conditions_annexures' && section.approvalRequired))
assert.ok(OTP_AGENT_STANDARD_CONDITION_CONTROLS.some((control) => control.key === 'bond_approval'))
assert.ok(OTP_AGENT_STANDARD_CONDITION_CONTROLS.some((control) => control.key === 'subject_to_sale' && control.riskLevel === 'review_required'))
assert.ok(OTP_AGENT_STANDARD_CONDITION_CONTROLS.some((control) => control.key === 'development_document_approval' && control.routeVariants.includes('new_development')))
assert.ok(OTP_AGENT_CUSTOM_CONDITION_FIELDS.includes('required_action'))
assert.ok(OTP_AGENT_BLOCKED_EDIT_TARGETS.includes('legal_template_clause_body'))

const bondCondition = buildOtpAgentConditionRecord({
  routeVariant: 'resale_existing_property',
  conditionType: 'bond_approval',
  fields: {
    bond_amount: 2280000,
    bond_approval_deadline: '2026-08-26',
  },
})
assert.equal(bondCondition.conditionType, 'bond_approval')
assert.equal(bondCondition.canRenderIntoOtp, true)
assert.equal(bondCondition.riskLevel, 'safe_structured')
assert.equal(bondCondition.rawTemplateEdit, false)

const missingSubjectSale = buildOtpAgentConditionRecord({
  routeVariant: 'resale_existing_property',
  conditionType: 'subject_to_sale',
  fields: {
    subject_sale_property: '12 Buyer Street',
  },
})
assert.equal(missingSubjectSale.canRenderIntoOtp, false)
assert.ok(missingSubjectSale.blockerCodes.includes('missing_subject_sale_minimum_price'))
assert.ok(missingSubjectSale.blockerCodes.includes('missing_subject_sale_fulfilment_date'))

const developmentOnlyOnResale = buildOtpAgentConditionRecord({
  routeVariant: 'resale_existing_property',
  conditionType: 'development_document_approval',
  fields: {
    annexures_list: 'Plans and rules',
    irrevocable_offer_expiry: '2026-08-12T17:00:00',
  },
})
assert.equal(developmentOnlyOnResale.canRenderIntoOtp, false)
assert.ok(developmentOnlyOnResale.blockerCodes.includes('condition_not_allowed_for_route'))

const customCondition = buildOtpAgentConditionRecord({
  routeVariant: 'resale_existing_property',
  conditionType: 'other_suspensive_condition',
  customCondition: {
    condition_title: 'Purchaser due diligence',
    responsible_party: 'buyer',
    required_action: 'Purchaser must be satisfied with seller documents.',
    fulfilment_deadline: '2026-08-20',
    lapse_consequence: 'requires_review',
    waivable_by: 'buyer',
  },
})
assert.equal(customCondition.approvalRequired, true)
assert.equal(customCondition.canRenderIntoOtp, false)
assert.ok(customCondition.blockerCodes.includes('custom_condition_requires_approval'))

const customApproved = buildOtpAgentConditionRecord({
  routeVariant: 'resale_existing_property',
  conditionType: 'other_suspensive_condition',
  customCondition: {
    condition_title: 'Purchaser due diligence',
    responsible_party: 'buyer',
    required_action: 'Purchaser must be satisfied with seller documents.',
    fulfilment_deadline: '2026-08-20',
    lapse_consequence: 'agreement_lapses_unless_waived_or_extended',
    waivable_by: 'buyer',
    approval_reference: 'SPECIAL-COND-APPROVED-001',
  },
})
assert.equal(customApproved.canRenderIntoOtp, true)
assert.equal(customApproved.reviewStatus, 'approved')

const rawTemplateBlocked = buildOtpAgentControlledEditModel({
  transactionId: 'tx-raw-template-blocked',
  routeVariant: 'resale_existing_property',
  editRequests: [
    { target: 'legal_template_clause_body', nextValue: 'Change the legal clause.', rawTemplateEdit: true },
  ],
})
assert.equal(rawTemplateBlocked.canGenerateOtp, false)
assert.ok(rawTemplateBlocked.blockerCodes.includes('raw_template_edit_blocked'))
assert.equal(rawTemplateBlocked.controlPolicy.rawLegalTemplateEditingAllowed, false)

const resaleModel = buildOtpAgentControlledEditModel({
  transactionId: 'tx-resale-phase30',
  routeVariant: 'resale_existing_property',
  editRequests: [
    { fieldKey: 'purchase_price', nextValue: 2850000 },
    { fieldKey: 'occupation_date', nextValue: '2026-09-01' },
  ],
  standardConditionSelections: [
    {
      conditionType: 'bond_approval',
      fields: { bond_amount: 2280000, bond_approval_deadline: '2026-08-26' },
    },
  ],
})
assert.equal(resaleModel.canOpenAgentReviewModal, true)
assert.equal(resaleModel.canGenerateOtp, true)
assert.equal(resaleModel.controlPolicy.agentsEditTransactionTermsOnly, true)
assert.equal(resaleModel.standardConditionControls.some((control) => control.key === 'development_document_approval'), false)

const developmentModel = buildOtpAgentControlledEditModel({
  transactionId: 'tx-development-phase30',
  routeVariant: 'new_development',
})
assert.equal(developmentModel.standardConditionControls.some((control) => control.key === 'development_document_approval'), true)
assert.equal(developmentModel.editableSections.some((section) => section.key === 'buyer_cost_obligations'), true)

const readyPhase29 = {
  version: 'otp_final_production_readiness_gate_phase29_v1',
  status: 'OTP_FINAL_PRODUCTION_READINESS_GATE_READY_FOR_SEPARATE_AUTHORISED_APPLY_DECISION',
  mutatedData: false,
  summary: { blockerCount: 0 },
  blockers: [],
}
const audit = buildOtpAgentControlledEditsPhase30Audit({
  checkedAt: '2026-08-05T17:15:00.000Z',
  phase29Audit: readyPhase29,
})
assert.equal(audit.version, OTP_AGENT_CONTROLLED_EDITS_PHASE30_VERSION)
assert.equal(audit.contract, OTP_AGENT_CONTROLLED_EDITS_CONTRACT)
assert.equal(audit.status, OTP_AGENT_CONTROLLED_EDITS_READY_STATUS)
assert.equal(audit.mutatedData, false)
assert.equal(audit.summary.editableSectionCount, 8)
assert.equal(audit.summary.standardConditionControlCount, 5)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])
assert.equal(audit.nextPhase.phase, 31)
assert.equal(audit.nextPhase.key, 'agent_otp_review_ui_wiring')

for (const check of [
  'PHASE30_PHASE29_FINAL_GATE_READY',
  'PHASE30_AGENT_REVIEW_SECTIONS_PRESENT',
  'PHASE30_STANDARD_CONDITION_TOGGLES_PRESENT',
  'PHASE30_SAFE_STRUCTURED_EDITS_CAN_GENERATE',
  'PHASE30_CUSTOM_CONDITIONS_REQUIRE_APPROVAL',
  'PHASE30_RAW_TEMPLATE_EDITING_BLOCKED',
  'PHASE30_ROUTE_SPECIFIC_CONTROLS_SEPARATED',
  'PHASE30_NO_MUTATION_DURING_REVIEW',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const blockedByPhase29 = buildOtpAgentControlledEditsPhase30Audit({
  checkedAt: '2026-08-05T17:15:00.000Z',
  phase29Audit: {
    ...readyPhase29,
    status: 'OTP_FINAL_PRODUCTION_READINESS_GATE_REMEDIATION_REQUIRED',
    summary: { blockerCount: 1 },
  },
})
assert.equal(blockedByPhase29.status, 'OTP_AGENT_CONTROLLED_EDITS_REMEDIATION_REQUIRED')
assert.equal(blockedByPhase29.nextPhase, null)
assert.equal(blockedByPhase29.checks.find((item) => item.code === 'PHASE30_PHASE29_FINAL_GATE_READY')?.pass, false)

const markdown = formatOtpAgentControlledEditsPhase30Markdown(audit)
for (const token of [
  'OTP Generator Phase 30 Agent Controlled Edits',
  'OTP_AGENT_CONTROLLED_EDITS_READY_FOR_UI_WIRING',
  'PHASE30_CUSTOM_CONDITIONS_REQUIRE_APPROVAL',
  'Standard Suspensive Controls',
  'Phase 31: Agent OTP Review UI Wiring',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

for (const token of [
  'OTP_AGENT_CONTROLLED_EDITS_PHASE30_VERSION',
  'buildOtpAgentConditionRecord',
  'buildOtpAgentControlledEditModel',
  'rawLegalTemplateEditingAllowed: false',
  'customSuspensiveConditionsRequireApproval: true',
  'development_document_approval',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('OTP agent controlled edits Phase 30 contract passed.')
