import {
  MATTER_PLAN_EVIDENCE_TYPES as E,
  MATTER_PLAN_OWNER_ROLES as R,
  MATTER_PLAN_STATUSES,
  normalizeMatterPlanOwnerRole,
  validateConveyancerMatterPlan,
} from './conveyancerMatterPlanContract.js'
import {
  CONVEYANCER_MATTER_EXCEPTION_CONTRACT_VERSION,
  MATTER_EXCEPTION_CAPABILITIES,
  MATTER_EXCEPTION_CATEGORIES as C,
  MATTER_EXCEPTION_SEVERITIES as S,
  MATTER_EXCEPTION_SEVERITY_POLICY,
  MATTER_EXCEPTION_SOURCE_TYPES,
  MATTER_EXCEPTION_STATUSES,
  canMatterExceptionActor,
  validateConveyancerMatterException,
} from './conveyancerMatterExceptionContract.js'

export const CONVEYANCER_MATTER_EXCEPTION_LIBRARY_VERSION = 'conveyancer_matter_exception_library_v1'

export const MATTER_EXCEPTION_TRIGGER_TYPES = Object.freeze({
  fact: 'fact',
  evidence: 'evidence',
  deadline: 'deadline',
  externalEvent: 'external_event',
  audit: 'audit',
  manual: 'manual',
})

export const MATTER_EXCEPTION_TRIGGER_OPERATORS = Object.freeze({
  missing: 'missing',
  false: 'false',
  true: 'true',
  overdue: 'overdue',
  rejected: 'rejected',
  conflict: 'conflict',
  changed: 'changed',
})

export const CONVEYANCER_MATTER_ACTION_KEYS = Object.freeze([
  'open_matter',
  'resolve_fact_gaps',
  'verify_parties',
  'verify_authority',
  'coordinate_bond_attorney',
  'coordinate_cancellation_attorney',
  'obtain_clearances',
  'confirm_tax_position',
  'confirm_financial_readiness',
  'draft_transfer_documents',
  'complete_signatures',
  'confirm_lodgement_readiness',
  'lodge_transfer',
  'register_transfer',
  'close_matter',
])

const TRIGGER_TYPE_VALUES = Object.values(MATTER_EXCEPTION_TRIGGER_TYPES)
const TRIGGER_OPERATOR_VALUES = Object.values(MATTER_EXCEPTION_TRIGGER_OPERATORS)
const CATEGORY_VALUES = Object.values(C)
const SEVERITY_VALUES = Object.values(S)
const EVIDENCE_TYPE_VALUES = Object.values(E)
const ACTION_KEYS = new Set(CONVEYANCER_MATTER_ACTION_KEYS)
const PLAN_FACT_FIELDS = new Set([
  'transactionType',
  'financeType',
  'propertyType',
  'propertyTenure',
  'vatTreatment',
  'buyerEntityType',
  'sellerEntityType',
  'sellerHasExistingBond',
  'requiresBondAttorney',
  'requiresCancellationAttorney',
  'hasMultipleBuyers',
  'hasMultipleSellers',
])

function text(value = '') {
  return String(value || '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '')
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function addHours(value, hours) {
  return new Date(new Date(value).getTime() + hours * 60 * 60 * 1000).toISOString()
}

function validDate(value) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()))
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}

function evidence(id, label, type = E.document, requiresApproval = true) {
  return { key: id, label, type, required: true, requiresApproval }
}

function definition({
  key: definitionKey,
  title,
  description,
  category,
  severity,
  actionKey = null,
  ownerRole = R.transferAttorney,
  affectedRoles = [R.transferAttorney],
  blocksMatter = false,
  customerVisible = true,
  triggerType,
  signalKey,
  operator,
  appliesWhen = {},
  evidenceRequirements = [],
  resolutionGuidance,
}) {
  return deepFreeze({
    libraryVersion: CONVEYANCER_MATTER_EXCEPTION_LIBRARY_VERSION,
    definitionVersion: 1,
    key: definitionKey,
    code: definitionKey,
    title,
    description,
    category,
    severity,
    actionKey,
    ownerRole,
    affectedRoles,
    impact: { blocksMatter, blocksAction: Boolean(actionKey), customerVisible },
    trigger: { type: triggerType, signalKey, operator },
    appliesWhen,
    evidenceRequirements,
    resolutionGuidance,
  })
}

export const CONVEYANCER_MATTER_EXCEPTION_DEFINITIONS = deepFreeze([
  definition({
    key: 'missing_plan_classification_fact',
    title: 'Matter classification fact is missing',
    description: 'A plan-driving finance, party, property or transaction fact has not been confirmed.',
    category: C.factGap,
    severity: S.high,
    actionKey: 'resolve_fact_gaps',
    triggerType: MATTER_EXCEPTION_TRIGGER_TYPES.fact,
    signalKey: 'plan.missing_classification_fact',
    operator: MATTER_EXCEPTION_TRIGGER_OPERATORS.true,
    evidenceRequirements: [evidence('confirmed_classification_fact', 'Confirmed classification fact', E.data)],
    resolutionGuidance: 'Confirm the source fact, regenerate a preview and retain the confirmation.',
  }),
  definition({
    key: 'signed_transfer_instruction_missing',
    title: 'Signed transfer instruction is missing',
    description: 'The transfer matter cannot be treated as formally instructed without the signed instruction.',
    category: C.instruction,
    severity: S.high,
    actionKey: 'open_matter',
    triggerType: MATTER_EXCEPTION_TRIGGER_TYPES.evidence,
    signalKey: 'instruction.signed_transfer_instruction',
    operator: MATTER_EXCEPTION_TRIGGER_OPERATORS.missing,
    evidenceRequirements: [evidence('signed_transfer_instruction', 'Signed transfer instruction')],
    resolutionGuidance: 'Obtain and verify the signed transfer instruction before progressing the matter.',
  }),
  definition({
    key: 'party_fica_incomplete',
    title: 'Party FICA evidence is incomplete',
    description: 'Required identity, address, entity or beneficial-ownership evidence remains outstanding.',
    category: C.compliance,
    severity: S.high,
    actionKey: 'verify_parties',
    triggerType: MATTER_EXCEPTION_TRIGGER_TYPES.evidence,
    signalKey: 'fica.required_evidence',
    operator: MATTER_EXCEPTION_TRIGGER_OPERATORS.missing,
    evidenceRequirements: [evidence('fica_pack_approved', 'Approved FICA evidence pack')],
    resolutionGuidance: 'Request only the missing FICA items and complete the recorded risk review.',
  }),
  definition({
    key: 'party_fica_risk_review_required',
    title: 'Party FICA risk requires legal review',
    description: 'A FICA risk signal requires a recorded legal decision before work may continue.',
    category: C.compliance,
    severity: S.critical,
    actionKey: 'verify_parties',
    blocksMatter: true,
    customerVisible: false,
    affectedRoles: [R.transferAttorney, R.firmManager],
    triggerType: MATTER_EXCEPTION_TRIGGER_TYPES.audit,
    signalKey: 'fica.risk_review_required',
    operator: MATTER_EXCEPTION_TRIGGER_OPERATORS.true,
    evidenceRequirements: [evidence('fica_risk_decision', 'Approved FICA risk decision', E.decision)],
    resolutionGuidance: 'Escalate immediately and record the authorised risk decision and supporting evidence.',
  }),
  definition({
    key: 'entity_authority_document_missing',
    title: 'Entity authority evidence is missing',
    description: 'A company, trust, estate or representative party has not supplied sufficient authority evidence.',
    category: C.authority,
    severity: S.high,
    actionKey: 'verify_authority',
    triggerType: MATTER_EXCEPTION_TRIGGER_TYPES.evidence,
    signalKey: 'authority.required_document',
    operator: MATTER_EXCEPTION_TRIGGER_OPERATORS.missing,
    evidenceRequirements: [evidence('authority_pack_approved', 'Approved entity authority pack')],
    resolutionGuidance: 'Obtain the missing resolution, mandate or appointment evidence and verify signatories.',
  }),
  definition({
    key: 'conflicting_signing_authority',
    title: 'Signing authority is contradictory',
    description: 'The recorded mandate, entity resolution or signatory configuration conflicts with another source.',
    category: C.authority,
    severity: S.critical,
    actionKey: 'verify_authority',
    blocksMatter: true,
    affectedRoles: [R.transferAttorney, R.firmManager],
    triggerType: MATTER_EXCEPTION_TRIGGER_TYPES.audit,
    signalKey: 'authority.signatory_conflict',
    operator: MATTER_EXCEPTION_TRIGGER_OPERATORS.conflict,
    evidenceRequirements: [evidence('authority_conflict_decision', 'Approved authority reconciliation decision', E.decision)],
    resolutionGuidance: 'Stop progression, reconcile every authority source and record the authorised conclusion.',
  }),
  definition({
    key: 'bond_attorney_appointment_outstanding',
    title: 'Bank-appointed bond attorney is not confirmed',
    description: 'Bond finance applies but the bank-appointed bond attorney firm has not been confirmed.',
    category: C.appointment,
    severity: S.high,
    actionKey: 'coordinate_bond_attorney',
    affectedRoles: [R.transferAttorney, R.bondAttorney],
    triggerType: MATTER_EXCEPTION_TRIGGER_TYPES.externalEvent,
    signalKey: 'bond.bank_appointment',
    operator: MATTER_EXCEPTION_TRIGGER_OPERATORS.missing,
    appliesWhen: { requiresBondAttorney: true },
    evidenceRequirements: [evidence('bank_bond_attorney_appointment', 'Bank bond-attorney appointment', E.externalReference)],
    resolutionGuidance: 'Track the bank appointment; invite the confirmed firm without selecting it on the bank’s behalf.',
  }),
  definition({
    key: 'bond_attorney_instruction_outstanding',
    title: 'Bond attorney instruction is outstanding',
    description: 'The appointed bond attorney has not yet recorded formal bank instruction.',
    category: C.instruction,
    severity: S.high,
    actionKey: 'coordinate_bond_attorney',
    affectedRoles: [R.transferAttorney, R.bondAttorney],
    triggerType: MATTER_EXCEPTION_TRIGGER_TYPES.externalEvent,
    signalKey: 'bond.formal_instruction',
    operator: MATTER_EXCEPTION_TRIGGER_OPERATORS.missing,
    appliesWhen: { requiresBondAttorney: true },
    evidenceRequirements: [evidence('bond_instruction_reference', 'Bond attorney instruction reference', E.externalReference)],
    resolutionGuidance: 'Obtain the formal instruction state from the appointed firm; an accepted invite is not instruction.',
  }),
  definition({
    key: 'cancellation_attorney_appointment_outstanding',
    title: 'Bank-appointed cancellation attorney is not confirmed',
    description: 'An existing seller bond requires cancellation but the lender-appointed firm is not confirmed.',
    category: C.appointment,
    severity: S.high,
    actionKey: 'coordinate_cancellation_attorney',
    affectedRoles: [R.transferAttorney, R.cancellationAttorney],
    triggerType: MATTER_EXCEPTION_TRIGGER_TYPES.externalEvent,
    signalKey: 'cancellation.bank_appointment',
    operator: MATTER_EXCEPTION_TRIGGER_OPERATORS.missing,
    appliesWhen: { requiresCancellationAttorney: true },
    evidenceRequirements: [evidence('bank_cancellation_attorney_appointment', 'Bank cancellation-attorney appointment', E.externalReference)],
    resolutionGuidance: 'Track the lender appointment and invite the confirmed firm without choosing it for the lender.',
  }),
  definition({
    key: 'cancellation_figures_outstanding',
    title: 'Bond cancellation figures are outstanding',
    description: 'Required cancellation figures or guarantees remain outstanding from the appointed cancellation lane.',
    category: C.externalParty,
    severity: S.high,
    actionKey: 'coordinate_cancellation_attorney',
    affectedRoles: [R.transferAttorney, R.cancellationAttorney],
    triggerType: MATTER_EXCEPTION_TRIGGER_TYPES.deadline,
    signalKey: 'cancellation.figures',
    operator: MATTER_EXCEPTION_TRIGGER_OPERATORS.overdue,
    appliesWhen: { requiresCancellationAttorney: true },
    evidenceRequirements: [evidence('cancellation_figures_received', 'Cancellation figures received')],
    resolutionGuidance: 'Follow up with the appointed cancellation firm and retain the current figures or guarantee state.',
  }),
  definition({
    key: 'municipal_clearance_outstanding',
    title: 'Municipal clearance remains outstanding',
    description: 'The required municipal figures, payment or clearance certificate is not available.',
    category: C.externalParty,
    severity: S.high,
    actionKey: 'obtain_clearances',
    triggerType: MATTER_EXCEPTION_TRIGGER_TYPES.deadline,
    signalKey: 'clearance.municipal',
    operator: MATTER_EXCEPTION_TRIGGER_OPERATORS.overdue,
    evidenceRequirements: [evidence('municipal_clearance_certificate', 'Municipal clearance certificate')],
    resolutionGuidance: 'Confirm the outstanding clearance stage, next external dependency and follow-up date.',
  }),
  definition({
    key: 'sectional_title_levy_clearance_outstanding',
    title: 'Sectional-title levy clearance is outstanding',
    description: 'The body corporate or managing agent has not supplied the required levy clearance evidence.',
    category: C.externalParty,
    severity: S.high,
    actionKey: 'obtain_clearances',
    triggerType: MATTER_EXCEPTION_TRIGGER_TYPES.deadline,
    signalKey: 'clearance.sectional_title_levy',
    operator: MATTER_EXCEPTION_TRIGGER_OPERATORS.overdue,
    appliesWhen: { propertyTenure: 'sectional_title' },
    evidenceRequirements: [evidence('body_corporate_levy_clearance', 'Body corporate levy clearance')],
    resolutionGuidance: 'Follow up with the body corporate or managing agent and retain the issued clearance.',
  }),
  definition({
    key: 'tax_or_vat_position_unconfirmed',
    title: 'Transfer tax or VAT position is unconfirmed',
    description: 'The applicable transfer-duty or VAT treatment has not been approved.',
    category: C.financial,
    severity: S.high,
    actionKey: 'confirm_tax_position',
    triggerType: MATTER_EXCEPTION_TRIGGER_TYPES.evidence,
    signalKey: 'tax.position_approval',
    operator: MATTER_EXCEPTION_TRIGGER_OPERATORS.missing,
    evidenceRequirements: [evidence('tax_position_approved', 'Approved transfer tax or VAT decision', E.decision)],
    resolutionGuidance: 'Record the approved tax treatment and supporting calculation or external reference.',
  }),
  definition({
    key: 'purchase_funds_not_confirmed',
    title: 'Purchase funding is not confirmed',
    description: 'The purchase price, bond proceeds or cash contribution cannot yet be treated as available.',
    category: C.financial,
    severity: S.high,
    actionKey: 'confirm_financial_readiness',
    triggerType: MATTER_EXCEPTION_TRIGGER_TYPES.evidence,
    signalKey: 'finance.purchase_funds',
    operator: MATTER_EXCEPTION_TRIGGER_OPERATORS.missing,
    evidenceRequirements: [evidence('purchase_funds_confirmed', 'Purchase funding confirmation', E.confirmation)],
    resolutionGuidance: 'Reconcile every funding source and retain the approved funding confirmation.',
  }),
  definition({
    key: 'transfer_cost_payment_outstanding',
    title: 'Required transfer payment is outstanding',
    description: 'A required transfer cost, tax or disbursement payment has not cleared.',
    category: C.financial,
    severity: S.high,
    actionKey: 'confirm_financial_readiness',
    ownerRole: R.accounts,
    affectedRoles: [R.accounts, R.transferAttorney],
    triggerType: MATTER_EXCEPTION_TRIGGER_TYPES.deadline,
    signalKey: 'finance.required_payment',
    operator: MATTER_EXCEPTION_TRIGGER_OPERATORS.overdue,
    evidenceRequirements: [evidence('required_payment_reconciled', 'Reconciled payment confirmation', E.payment)],
    resolutionGuidance: 'Reconcile the payment to the matter ledger and confirm cleared funds.',
  }),
  definition({
    key: 'signature_pack_incomplete_or_defective',
    title: 'Transfer signature pack is incomplete or defective',
    description: 'One or more required signatures, dates, capacities or execution formalities need correction.',
    category: C.document,
    severity: S.high,
    actionKey: 'complete_signatures',
    triggerType: MATTER_EXCEPTION_TRIGGER_TYPES.evidence,
    signalKey: 'signatures.transfer_pack',
    operator: MATTER_EXCEPTION_TRIGGER_OPERATORS.rejected,
    evidenceRequirements: [evidence('corrected_signature_pack', 'Approved corrected signature pack', E.signature)],
    resolutionGuidance: 'Identify the precise defect, correct only the affected execution and re-approve the pack.',
  }),
  definition({
    key: 'lodgement_readiness_conflict',
    title: 'Lodgement readiness checks conflict',
    description: 'Transfer, bond, cancellation or financial readiness states do not align for lodgement.',
    category: C.workflow,
    severity: S.critical,
    actionKey: 'confirm_lodgement_readiness',
    blocksMatter: true,
    affectedRoles: [R.transferAttorney, R.bondAttorney, R.cancellationAttorney, R.firmManager],
    triggerType: MATTER_EXCEPTION_TRIGGER_TYPES.audit,
    signalKey: 'lodgement.readiness_conflict',
    operator: MATTER_EXCEPTION_TRIGGER_OPERATORS.conflict,
    evidenceRequirements: [evidence('lodgement_readiness_reapproved', 'Re-approved lodgement readiness decision', E.decision)],
    resolutionGuidance: 'Stop lodgement, reconcile every legal lane and record a fresh readiness approval.',
  }),
  definition({
    key: 'deeds_office_rejection',
    title: 'Deeds Office rejected the lodgement',
    description: 'The lodged transfer was rejected and requires a controlled correction and relodgement decision.',
    category: C.registry,
    severity: S.critical,
    actionKey: 'lodge_transfer',
    blocksMatter: true,
    affectedRoles: [R.transferAttorney, R.firmManager],
    triggerType: MATTER_EXCEPTION_TRIGGER_TYPES.externalEvent,
    signalKey: 'deeds_office.lodgement_result',
    operator: MATTER_EXCEPTION_TRIGGER_OPERATORS.rejected,
    evidenceRequirements: [evidence('rejection_remediation_approved', 'Approved rejection remediation', E.decision)],
    resolutionGuidance: 'Capture the rejection reason, assign correction ownership and approve the relodgement path.',
  }),
  definition({
    key: 'registration_external_delay',
    title: 'Registration is externally delayed',
    description: 'The matter remains lodged but registration has exceeded the expected external timeframe.',
    category: C.registry,
    severity: S.high,
    actionKey: 'register_transfer',
    triggerType: MATTER_EXCEPTION_TRIGGER_TYPES.deadline,
    signalKey: 'deeds_office.registration',
    operator: MATTER_EXCEPTION_TRIGGER_OPERATORS.overdue,
    evidenceRequirements: [evidence('registration_status_confirmed', 'Current registration status', E.externalReference, false)],
    resolutionGuidance: 'Record the current Deeds Office state, reason if available and next follow-up date.',
  }),
  definition({
    key: 'post_registration_reconciliation_outstanding',
    title: 'Post-registration reconciliation is outstanding',
    description: 'The registered matter still has an incomplete ledger, payout or final account reconciliation.',
    category: C.financial,
    severity: S.medium,
    actionKey: 'close_matter',
    ownerRole: R.accounts,
    affectedRoles: [R.accounts, R.transferAttorney],
    triggerType: MATTER_EXCEPTION_TRIGGER_TYPES.deadline,
    signalKey: 'closeout.financial_reconciliation',
    operator: MATTER_EXCEPTION_TRIGGER_OPERATORS.overdue,
    evidenceRequirements: [evidence('final_account_reconciled', 'Approved final account reconciliation', E.payment)],
    resolutionGuidance: 'Complete the ledger and payout reconciliation before closing the matter.',
  }),
  definition({
    key: 'matter_plan_audit_integrity_failure',
    title: 'Matter-plan audit integrity failed',
    description: 'A runtime revision, event chain or actor-authority check cannot be verified.',
    category: C.dataIntegrity,
    severity: S.critical,
    blocksMatter: true,
    customerVisible: false,
    ownerRole: R.firmManager,
    affectedRoles: [R.firmManager, R.transferAttorney],
    triggerType: MATTER_EXCEPTION_TRIGGER_TYPES.audit,
    signalKey: 'matter_plan.audit_integrity',
    operator: MATTER_EXCEPTION_TRIGGER_OPERATORS.false,
    evidenceRequirements: [evidence('audit_integrity_restored', 'Audit-integrity remediation report', E.data)],
    resolutionGuidance: 'Freeze automated execution, investigate the event chain and retain the remediation evidence.',
  }),
  definition({
    key: 'cross_lane_instruction_conflict',
    title: 'Legal-lane instruction states conflict',
    description: 'Transfer, bond or cancellation participants disagree about appointment or formal instruction state.',
    category: C.instruction,
    severity: S.critical,
    actionKey: 'confirm_lodgement_readiness',
    blocksMatter: true,
    affectedRoles: [R.transferAttorney, R.bondAttorney, R.cancellationAttorney, R.firmManager],
    triggerType: MATTER_EXCEPTION_TRIGGER_TYPES.audit,
    signalKey: 'legal_lanes.instruction_conflict',
    operator: MATTER_EXCEPTION_TRIGGER_OPERATORS.conflict,
    evidenceRequirements: [evidence('legal_lane_states_reconciled', 'Approved legal-lane state reconciliation', E.decision)],
    resolutionGuidance: 'Reconcile appointment, invitation and instruction separately for each legal lane.',
  }),
])

const DEFINITIONS_BY_KEY = new Map(CONVEYANCER_MATTER_EXCEPTION_DEFINITIONS.map((item) => [item.key, item]))

export function getConveyancerMatterExceptionDefinition(definitionKey) {
  return DEFINITIONS_BY_KEY.get(key(definitionKey)) || null
}

export function listConveyancerMatterExceptionDefinitions({ category, severity, ownerRole, actionKey, triggerType } = {}) {
  const normalizedRole = normalizeMatterPlanOwnerRole(ownerRole)
  return CONVEYANCER_MATTER_EXCEPTION_DEFINITIONS.filter((item) =>
    (!category || item.category === key(category)) &&
    (!severity || item.severity === key(severity)) &&
    (!normalizedRole || item.ownerRole === normalizedRole) &&
    (!actionKey || item.actionKey === key(actionKey)) &&
    (!triggerType || item.trigger.type === key(triggerType)))
}

export function validateConveyancerMatterExceptionLibrary(definitions = CONVEYANCER_MATTER_EXCEPTION_DEFINITIONS) {
  const errors = []
  const items = Array.isArray(definitions) ? definitions : []
  const keys = items.map((item) => key(item.key))
  const codes = items.map((item) => key(item.code))
  const triggerSignatures = items.map((item) => `${key(item.trigger?.signalKey)}:${key(item.trigger?.operator)}`)
  if (!items.length) errors.push('exception_library_empty')
  if (keys.some((item) => !item)) errors.push('definition_key_required')
  if (new Set(keys).size !== keys.length) errors.push('duplicate_definition_key')
  if (codes.some((item) => !item)) errors.push('definition_code_required')
  if (new Set(codes).size !== codes.length) errors.push('duplicate_definition_code')
  if (new Set(triggerSignatures).size !== triggerSignatures.length) errors.push('duplicate_trigger_signature')
  for (const item of items) {
    const prefix = key(item.key) || 'unknown_definition'
    if (item.libraryVersion !== CONVEYANCER_MATTER_EXCEPTION_LIBRARY_VERSION) errors.push(`${prefix}:unsupported_library_version`)
    if (Number(item.definitionVersion) !== 1) errors.push(`${prefix}:invalid_definition_version`)
    if (!text(item.title)) errors.push(`${prefix}:title_required`)
    if (!text(item.description)) errors.push(`${prefix}:description_required`)
    if (!CATEGORY_VALUES.includes(item.category)) errors.push(`${prefix}:invalid_category`)
    if (!SEVERITY_VALUES.includes(item.severity)) errors.push(`${prefix}:invalid_severity`)
    if (item.actionKey && !ACTION_KEYS.has(item.actionKey)) errors.push(`${prefix}:unknown_action_key`)
    if (item.impact?.blocksAction && !item.actionKey) errors.push(`${prefix}:blocking_action_key_required`)
    if (typeof item.impact?.blocksMatter !== 'boolean' || typeof item.impact?.blocksAction !== 'boolean' || typeof item.impact?.customerVisible !== 'boolean') errors.push(`${prefix}:invalid_impact_contract`)
    if (!canMatterExceptionActor(item.ownerRole, MATTER_EXCEPTION_CAPABILITIES.acknowledge)) errors.push(`${prefix}:invalid_owner_role`)
    if (!(item.affectedRoles || []).length) errors.push(`${prefix}:affected_role_required`)
    if ((item.affectedRoles || []).some((role) => !normalizeMatterPlanOwnerRole(role))) errors.push(`${prefix}:invalid_affected_role`)
    if (!TRIGGER_TYPE_VALUES.includes(item.trigger?.type)) errors.push(`${prefix}:invalid_trigger_type`)
    if (!text(item.trigger?.signalKey)) errors.push(`${prefix}:signal_key_required`)
    if (!TRIGGER_OPERATOR_VALUES.includes(item.trigger?.operator)) errors.push(`${prefix}:invalid_trigger_operator`)
    if (item.severity === S.critical && !item.impact?.blocksMatter && !item.impact?.blocksAction) errors.push(`${prefix}:critical_definition_must_block_work`)
    if (Object.keys(item.appliesWhen || {}).some((field) => !PLAN_FACT_FIELDS.has(field))) errors.push(`${prefix}:unknown_applicability_fact`)
    if (!text(item.resolutionGuidance)) errors.push(`${prefix}:resolution_guidance_required`)
    const evidenceKeys = (item.evidenceRequirements || []).map((requirement) => key(requirement.key))
    if (!evidenceKeys.length) errors.push(`${prefix}:resolution_evidence_required`)
    if (new Set(evidenceKeys).size !== evidenceKeys.length) errors.push(`${prefix}:duplicate_evidence_requirement`)
    if ((item.evidenceRequirements || []).some((requirement) => !text(requirement.label))) errors.push(`${prefix}:evidence_label_required`)
    if ((item.evidenceRequirements || []).some((requirement) => !EVIDENCE_TYPE_VALUES.includes(requirement.type))) errors.push(`${prefix}:invalid_evidence_type`)
  }
  return { valid: errors.length === 0, errors: unique(errors), definitionCount: items.length }
}

export function isConveyancerMatterExceptionDefinitionApplicable(definitionOrKey, plan = {}) {
  const definitionItem = typeof definitionOrKey === 'string'
    ? getConveyancerMatterExceptionDefinition(definitionOrKey)
    : definitionOrKey
  if (!definitionItem) return false
  const actionKeys = new Set((plan.actions || []).map((action) => action.key))
  if (definitionItem.actionKey && !actionKeys.has(definitionItem.actionKey)) return false
  return Object.entries(definitionItem.appliesWhen || {}).every(([field, expected]) => plan.factsSnapshot?.[field] === expected)
}

export function buildConveyancerMatterExceptionFromLibrary({
  definitionKey,
  plan = {},
  detectedAt = '',
  detectedBy = { role: R.system },
  escalationActor = null,
  sourceType = MATTER_EXCEPTION_SOURCE_TYPES.systemRule,
  sourceId = '',
  owner = {},
  scopeKey = '',
  exceptionId = '',
} = {}) {
  const definitionItem = getConveyancerMatterExceptionDefinition(definitionKey)
  if (!definitionItem) return { valid: false, errors: ['unknown_exception_definition'], definition: null, exception: null }
  const planValidation = validateConveyancerMatterPlan(plan)
  if (!planValidation.valid) return { valid: false, errors: planValidation.errors.map((item) => `plan:${item}`), definition: definitionItem, exception: null }
  if (plan.status !== MATTER_PLAN_STATUSES.active) return { valid: false, errors: ['active_plan_required'], definition: definitionItem, exception: null }
  if (!validDate(detectedAt)) return { valid: false, errors: ['valid_detected_at_required'], definition: definitionItem, exception: null }
  if (!isConveyancerMatterExceptionDefinitionApplicable(definitionItem, plan)) return { valid: false, errors: ['exception_definition_not_applicable'], definition: definitionItem, exception: null }

  const policy = MATTER_EXCEPTION_SEVERITY_POLICY[definitionItem.severity]
  const normalizedDetectedAt = new Date(detectedAt).toISOString()
  const normalizedScope = key(scopeKey) || definitionItem.actionKey || 'matter'
  const deduplicationKey = key(`${plan.planId}:${plan.version}:${definitionItem.key}:${normalizedScope}`)
  const escalationBy = escalationActor || (canMatterExceptionActor(detectedBy.role, MATTER_EXCEPTION_CAPABILITIES.escalate) ? detectedBy : null)
  const isCritical = definitionItem.severity === S.critical
  const built = {
    contractVersion: CONVEYANCER_MATTER_EXCEPTION_CONTRACT_VERSION,
    exceptionId: text(exceptionId) || `matter_exception:${deduplicationKey}`,
    planId: plan.planId,
    planVersion: Number(plan.version),
    transactionId: plan.transactionId,
    organisationId: plan.organisationId,
    actionKey: definitionItem.actionKey,
    code: definitionItem.code,
    deduplicationKey,
    title: definitionItem.title,
    description: definitionItem.description,
    category: definitionItem.category,
    severity: definitionItem.severity,
    status: MATTER_EXCEPTION_STATUSES.open,
    source: {
      type: sourceType,
      sourceId: text(sourceId) || null,
      ruleId: sourceType === MATTER_EXCEPTION_SOURCE_TYPES.systemRule ? `exception_library:${definitionItem.key}:v${definitionItem.definitionVersion}` : null,
      detectedAt: normalizedDetectedAt,
      detectedBy,
    },
    impact: {
      blocksMatter: definitionItem.impact.blocksMatter,
      blockedActionKeys: definitionItem.impact.blocksAction ? [definitionItem.actionKey] : [],
      affectedRoles: definitionItem.affectedRoles,
      customerVisible: definitionItem.impact.customerVisible,
    },
    owner: {
      role: owner.role || definitionItem.ownerRole,
      userId: owner.userId || owner.user_id || null,
      teamId: owner.teamId || owner.team_id || null,
    },
    sla: {
      respondBy: addHours(normalizedDetectedAt, policy.responseHours),
      resolveBy: addHours(normalizedDetectedAt, policy.resolutionHours),
    },
    evidenceRequirements: definitionItem.evidenceRequirements,
    evidence: [],
    waitingOn: '',
    followUpAt: null,
    stateReason: '',
    escalation: isCritical && escalationBy ? {
      level: 1,
      reason: `Critical exception opened from ${definitionItem.key}.`,
      escalatedAt: normalizedDetectedAt,
      escalatedBy: escalationBy,
    } : { level: 0 },
    resolution: {},
    relatedExceptionIds: [],
    supersededByExceptionId: null,
    createdAt: normalizedDetectedAt,
    updatedAt: normalizedDetectedAt,
    runtimeRevision: 0,
    lastEventId: null,
    provenance: {
      libraryVersion: CONVEYANCER_MATTER_EXCEPTION_LIBRARY_VERSION,
      definitionKey: definitionItem.key,
      definitionVersion: definitionItem.definitionVersion,
      scopeKey: normalizedScope,
    },
  }
  const actionKeys = (plan.actions || []).map((action) => action.key)
  const validation = validateConveyancerMatterException(built, { actionKeys })
  return {
    valid: validation.valid,
    errors: validation.errors,
    warnings: validation.warnings,
    definition: definitionItem,
    exception: validation.exception,
  }
}
