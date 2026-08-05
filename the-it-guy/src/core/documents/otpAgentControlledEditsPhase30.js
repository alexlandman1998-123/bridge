import {
  OTP_FINAL_PRODUCTION_READINESS_GATE_READY_STATUS,
  buildOtpFinalProductionReadinessGatePhase29Audit,
} from './otpFinalProductionReadinessGatePhase29.js'
import { OTP_DOCUMENT_VARIANTS, normalizeOtpDocumentVariant } from './otpRouteUniverse.js'

export const OTP_AGENT_CONTROLLED_EDITS_PHASE30_VERSION = 'otp_agent_controlled_edits_phase30_v1'
export const OTP_AGENT_CONTROLLED_EDITS_READY_STATUS = 'OTP_AGENT_CONTROLLED_EDITS_READY_FOR_UI_WIRING'
export const OTP_AGENT_CONTROLLED_EDITS_CONTRACT = 'otp-vnext-agent-controlled-edits-phase30-v1'

export const OTP_AGENT_EDIT_RISK_LEVELS = Object.freeze([
  'safe_structured',
  'review_required',
  'approval_required',
  'blocked_raw_template_edit',
])

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function money(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function cloneJson(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value))
}

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

function fieldRef(key, label, type = 'text', riskLevel = 'safe_structured') {
  return Object.freeze({
    key,
    label,
    inputType: type,
    riskLevel,
    rawTemplateEdit: false,
  })
}

function section({
  key,
  label,
  routeVariants = ['resale_existing_property', 'new_development'],
  fields = [],
  actions = [],
  approvalRequired = false,
  notes = '',
} = {}) {
  return Object.freeze({
    key: normalizeKey(key),
    label,
    routeVariants: Object.freeze(routeVariants.map(normalizeOtpDocumentVariant).filter(Boolean)),
    fields: Object.freeze(fields),
    actions: Object.freeze(actions.map(normalizeKey)),
    approvalRequired,
    notes: normalizeText(notes),
  })
}

export const OTP_AGENT_EDITABLE_SECTIONS = Object.freeze([
  section({
    key: 'party_details',
    label: 'Buyer and seller/developer details',
    fields: [
      fieldRef('buyer_full_name', 'Buyer full name'),
      fieldRef('buyer_id_number', 'Buyer ID / registration number'),
      fieldRef('buyer_email', 'Buyer email', 'email'),
      fieldRef('buyer_phone', 'Buyer telephone'),
      fieldRef('seller_full_name', 'Seller full name'),
      fieldRef('developer_name', 'Developer name'),
    ],
    actions: ['edit_party_details', 'request_authority_documents'],
  }),
  section({
    key: 'property_details',
    label: 'Property details',
    fields: [
      fieldRef('property_address', 'Property address'),
      fieldRef('property_title_type', 'Title / unit details'),
      fieldRef('fixtures_included', 'Fixtures included', 'textarea', 'review_required'),
      fieldRef('fixtures_excluded', 'Fixtures excluded', 'textarea', 'review_required'),
    ],
    actions: ['edit_property_details', 'review_fixtures'],
  }),
  section({
    key: 'purchase_economics',
    label: 'Price, deposit and guarantees',
    fields: [
      fieldRef('purchase_price', 'Purchase price', 'money'),
      fieldRef('deposit_amount', 'Deposit amount', 'money'),
      fieldRef('deposit_due_date', 'Deposit due date', 'date'),
      fieldRef('guarantee_delivery_deadline', 'Guarantee delivery deadline', 'date'),
      fieldRef('guarantee_delivery_period', 'Guarantee delivery period'),
    ],
    actions: ['edit_price_deposit', 'update_guarantee_terms'],
  }),
  section({
    key: 'finance_and_suspensive_conditions',
    label: 'Finance and suspensive conditions',
    fields: [
      fieldRef('finance_type', 'Finance type', 'select'),
      fieldRef('bond_amount', 'Bond amount', 'money'),
      fieldRef('bond_approval_deadline', 'Bond approval deadline', 'date'),
      fieldRef('cash_amount', 'Cash contribution', 'money'),
      fieldRef('cash_proof_deadline', 'Cash proof deadline', 'date'),
      fieldRef('structured_suspensive_conditions', 'Structured suspensive conditions', 'condition_list', 'review_required'),
    ],
    actions: ['toggle_standard_condition', 'add_guided_custom_condition', 'request_condition_approval'],
  }),
  section({
    key: 'occupation_and_rent',
    label: 'Occupation and occupational rent',
    fields: [
      fieldRef('occupation_date', 'Occupation date', 'date'),
      fieldRef('occupational_rent_payable', 'Occupational rent payable', 'toggle'),
      fieldRef('occupational_rent_amount', 'Occupational rent amount', 'money'),
    ],
    actions: ['edit_occupation_terms'],
  }),
  section({
    key: 'buyer_cost_obligations',
    label: 'Buyer cost obligations',
    fields: [
      fieldRef('otp_buyer_cost_obligations', 'Buyer cost obligations', 'cost_schedule', 'review_required'),
      fieldRef('otp_pending_cost_obligations', 'Pending buyer cost obligations', 'cost_schedule', 'review_required'),
      fieldRef('matter_attorney_cost_quote_status', 'Matter attorney cost quote status', 'status'),
    ],
    actions: ['edit_cost_obligation', 'mark_cost_not_applicable', 'request_matter_attorney_quote'],
  }),
  section({
    key: 'commission',
    label: 'Commission',
    fields: [
      fieldRef('mandate_commission_snapshot', 'Mandate commission snapshot', 'readonly'),
      fieldRef('otp_commission_proposal', 'OTP commission proposal', 'money_or_percentage', 'approval_required'),
      fieldRef('otp_commission_variation_status', 'Commission variation status', 'status', 'approval_required'),
    ],
    actions: ['request_commission_approval', 'review_locked_commission'],
    approvalRequired: true,
  }),
  section({
    key: 'special_conditions_annexures',
    label: 'Special conditions and annexures',
    fields: [
      fieldRef('special_conditions', 'Special conditions', 'textarea', 'approval_required'),
      fieldRef('annexures_list', 'Annexures', 'annexure_list', 'review_required'),
    ],
    actions: ['add_special_condition', 'attach_annexure', 'request_special_condition_approval'],
    approvalRequired: true,
  }),
])

function conditionControl({
  key,
  label,
  routeVariants = ['resale_existing_property', 'new_development'],
  requiredFields = [],
  generatedWordingKey,
  approvalRequired = false,
  riskLevel = 'safe_structured',
  description = '',
} = {}) {
  return Object.freeze({
    key: normalizeKey(key),
    label,
    routeVariants: Object.freeze(routeVariants.map(normalizeOtpDocumentVariant).filter(Boolean)),
    requiredFields: Object.freeze(requiredFields.map(normalizeKey)),
    generatedWordingKey: normalizeKey(generatedWordingKey || key),
    approvalRequired,
    riskLevel,
    description: normalizeText(description),
  })
}

export const OTP_AGENT_STANDARD_CONDITION_CONTROLS = Object.freeze([
  conditionControl({
    key: 'bond_approval',
    label: 'Subject to bond approval',
    requiredFields: ['bond_amount', 'bond_approval_deadline'],
    description: 'Uses approved bond-finance wording and deadline fields.',
  }),
  conditionControl({
    key: 'cash_proof',
    label: 'Subject to proof of cash contribution',
    requiredFields: ['cash_amount', 'cash_proof_deadline'],
    description: 'Uses approved proof-of-funds wording.',
  }),
  conditionControl({
    key: 'subject_to_sale',
    label: 'Subject to sale of purchaser property',
    routeVariants: ['resale_existing_property'],
    requiredFields: ['subject_sale_property', 'subject_sale_minimum_price', 'subject_sale_fulfilment_date'],
    riskLevel: 'review_required',
    description: 'Requires agent review because chain sales need correct dates and minimum-price facts.',
  }),
  conditionControl({
    key: 'guarantee_delivery',
    label: 'Guarantee delivery deadline',
    requiredFields: ['guarantee_delivery_deadline'],
    description: 'Uses approved guarantee-delivery wording.',
  }),
  conditionControl({
    key: 'development_document_approval',
    label: 'Development document approval',
    routeVariants: ['new_development'],
    requiredFields: ['annexures_list', 'irrevocable_offer_expiry'],
    riskLevel: 'review_required',
    description: 'Uses new-development annexure/project document review wording.',
  }),
])

export const OTP_AGENT_CUSTOM_CONDITION_FIELDS = Object.freeze([
  'condition_title',
  'responsible_party',
  'required_action',
  'fulfilment_deadline',
  'lapse_consequence',
  'waivable_by',
  'approval_reference',
])

export const OTP_AGENT_BLOCKED_EDIT_TARGETS = Object.freeze([
  'legal_template_clause_body',
  'published_template_revision',
  'signature_field_role_map',
  'route_default_template',
])

function routeAllows(control = {}, routeVariant = '') {
  const routeKey = normalizeOtpDocumentVariant(routeVariant)
  return Boolean(routeKey && list(control.routeVariants).includes(routeKey))
}

function missingFields(source = {}, fields = []) {
  return fields.filter((field) => normalizeText(source[field]) === '' && money(source[field]) === null)
}

export function buildOtpAgentConditionRecord({
  routeVariant = 'resale_existing_property',
  conditionType = '',
  enabled = true,
  fields = {},
  customCondition = {},
  actorRole = 'agent',
} = {}) {
  const routeKey = normalizeOtpDocumentVariant(routeVariant)
  const typeKey = normalizeKey(conditionType)
  const standard = OTP_AGENT_STANDARD_CONDITION_CONTROLS.find((item) => item.key === typeKey) || null
  const isCustom = typeKey === 'other_suspensive_condition' || typeKey === 'custom_suspensive_condition'
  const customText = normalizeText(customCondition.requiredAction || customCondition.required_action || fields.required_action || fields.requestedText)
  const missing = standard
    ? missingFields(fields, standard.requiredFields)
    : isCustom
      ? OTP_AGENT_CUSTOM_CONDITION_FIELDS.filter((field) => (
        field !== 'approval_reference' &&
        normalizeText(customCondition[field] || customCondition[field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())]) === ''
      ))
      : []
  const routeAllowed = standard ? routeAllows(standard, routeKey) : Boolean(routeKey)
  const approvalRequired = Boolean(isCustom || standard?.approvalRequired || standard?.riskLevel === 'approval_required')
  const reviewRequired = Boolean(approvalRequired || standard?.riskLevel === 'review_required')
  const approvalReference = normalizeText(customCondition.approval_reference || customCondition.approvalReference || fields.approval_reference)
  const approvalStatus = approvalRequired
    ? approvalReference ? 'approved' : 'approval_required'
    : reviewRequired ? 'agent_review_required' : 'structured'
  const blockerCodes = [
    enabled ? '' : 'condition_disabled',
    routeAllowed ? '' : 'condition_not_allowed_for_route',
    ...missing.map((field) => `missing_${field}`),
    approvalRequired && !approvalReference ? 'custom_condition_requires_approval' : '',
  ].filter(Boolean)

  return Object.freeze({
    conditionType: isCustom ? 'other_suspensive_condition' : typeKey,
    routeVariant: routeKey,
    enabled: Boolean(enabled),
    standardControl: standard ? standard.key : '',
    generatedWordingKey: standard?.generatedWordingKey || 'counsel_approved_special_condition',
    actorRole: normalizeKey(actorRole),
    riskLevel: approvalRequired ? 'approval_required' : reviewRequired ? 'review_required' : 'safe_structured',
    reviewStatus: approvalStatus,
    approvalRequired,
    approvalReference,
    routeAllowed,
    missingFields: Object.freeze(missing),
    blockerCodes: Object.freeze(blockerCodes),
    canRenderIntoOtp: blockerCodes.length === 0,
    structuredFields: Object.freeze({
      amount: money(fields.amount || fields.bond_amount || fields.cash_amount),
      fulfilmentDeadline: normalizeText(fields.fulfilment_deadline || fields.bond_approval_deadline || fields.cash_proof_deadline || fields.subject_sale_fulfilment_date || customCondition.fulfilment_deadline || customCondition.fulfilmentDeadline),
      responsibleParty: normalizeText(fields.responsible_party || customCondition.responsible_party || customCondition.responsibleParty || 'buyer'),
      waivableBy: normalizeText(fields.waivable_by || customCondition.waivable_by || customCondition.waivableBy),
      lapseConsequence: normalizeText(fields.lapse_consequence || customCondition.lapse_consequence || customCondition.lapseConsequence || 'agreement_lapses_unless_waived_or_extended'),
      requestedText: customText,
      title: normalizeText(customCondition.condition_title || customCondition.conditionTitle || fields.condition_title || standard?.label),
    }),
    rawTemplateEdit: false,
  })
}

function normalizeEditRequest(request = {}) {
  const target = normalizeKey(request.target || request.fieldKey || request.key)
  const sectionKey = normalizeKey(request.sectionKey || request.section || '')
  const rawTemplateEdit = OTP_AGENT_BLOCKED_EDIT_TARGETS.includes(target) || Boolean(request.rawTemplateEdit)
  const sectionMatch = OTP_AGENT_EDITABLE_SECTIONS.find((item) => (
    item.key === sectionKey || item.fields.some((field) => field.key === target)
  ))
  const fieldMatch = sectionMatch?.fields.find((field) => field.key === target)
  const riskLevel = rawTemplateEdit
    ? 'blocked_raw_template_edit'
    : fieldMatch?.riskLevel || (target ? 'safe_structured' : 'review_required')
  const approvalRequired = riskLevel === 'approval_required' || sectionMatch?.approvalRequired === true

  return Object.freeze({
    target,
    sectionKey: sectionMatch?.key || sectionKey || 'unmapped',
    label: fieldMatch?.label || target.replace(/_/g, ' '),
    previousValue: request.previousValue ?? null,
    nextValue: request.nextValue ?? null,
    riskLevel,
    approvalRequired,
    approvalReference: normalizeText(request.approvalReference || request.approval_reference),
    rawTemplateEdit,
    canApplyToTransactionTerms: !rawTemplateEdit && Boolean(target),
    blockerCodes: Object.freeze([
      rawTemplateEdit ? 'raw_template_edit_blocked' : '',
      approvalRequired && !normalizeText(request.approvalReference || request.approval_reference) ? 'approval_required' : '',
    ].filter(Boolean)),
  })
}

export function buildOtpAgentControlledEditModel({
  transactionId = '',
  routeVariant = 'resale_existing_property',
  editRequests = [],
  standardConditionSelections = [],
  customConditionRequests = [],
  phase29Audit = null,
  reviewedAt = new Date().toISOString(),
} = {}) {
  const routeKey = normalizeOtpDocumentVariant(routeVariant)
  const route = OTP_DOCUMENT_VARIANTS.find((variant) => variant.key === routeKey) || null
  const editableSections = OTP_AGENT_EDITABLE_SECTIONS
    .filter((item) => !routeKey || item.routeVariants.includes(routeKey))
  const standardConditions = OTP_AGENT_STANDARD_CONDITION_CONTROLS
    .filter((item) => !routeKey || item.routeVariants.includes(routeKey))
  const editRows = list(editRequests).map(normalizeEditRequest)
  const conditionRows = [
    ...list(standardConditionSelections).map((selection) => buildOtpAgentConditionRecord({
      routeVariant: routeKey,
      conditionType: selection.conditionType || selection.key,
      enabled: selection.enabled !== false,
      fields: selection.fields || selection,
      actorRole: selection.actorRole || 'agent',
    })),
    ...list(customConditionRequests).map((condition) => buildOtpAgentConditionRecord({
      routeVariant: routeKey,
      conditionType: 'other_suspensive_condition',
      enabled: condition.enabled !== false,
      customCondition: condition,
      fields: condition.fields || {},
      actorRole: condition.actorRole || 'agent',
    })),
  ]
  const approvalRows = [
    ...editRows.filter((row) => row.approvalRequired),
    ...conditionRows.filter((row) => row.approvalRequired),
  ]
  const blockers = [
    route ? '' : 'invalid_otp_route',
    ...editRows.flatMap((row) => row.blockerCodes),
    ...conditionRows.flatMap((row) => row.blockerCodes),
  ].filter(Boolean)
  const warnings = unique([
    ...editRows.filter((row) => row.riskLevel === 'review_required').map((row) => `review_required:${row.target}`),
    ...conditionRows.filter((row) => row.riskLevel === 'review_required').map((row) => `review_required:${row.conditionType}`),
  ])
  const phase29Ready = !phase29Audit || phase29Audit.status === OTP_FINAL_PRODUCTION_READINESS_GATE_READY_STATUS

  return Object.freeze({
    version: OTP_AGENT_CONTROLLED_EDITS_PHASE30_VERSION,
    contract: OTP_AGENT_CONTROLLED_EDITS_CONTRACT,
    reviewedAt,
    transactionId: normalizeText(transactionId),
    routeVariant: routeKey,
    routeLabel: route?.label || 'Unknown OTP route',
    phase29Ready,
    editableSections: Object.freeze(editableSections.map(cloneJson)),
    standardConditionControls: Object.freeze(standardConditions.map(cloneJson)),
    editRows: Object.freeze(editRows),
    conditionRows: Object.freeze(conditionRows),
    approvalRows: Object.freeze(approvalRows),
    warningCodes: Object.freeze(warnings),
    blockerCodes: Object.freeze(unique(blockers)),
    canOpenAgentReviewModal: Boolean(route && phase29Ready),
    canGenerateOtp: Boolean(route && phase29Ready && blockers.length === 0),
    controlPolicy: Object.freeze({
      agentsEditTransactionTermsOnly: true,
      rawLegalTemplateEditingAllowed: false,
      customSuspensiveConditionsRequireApproval: true,
      publishedTemplateMutationAllowed: false,
      routeSeparationEnforced: true,
      otpPreviewRequiredBeforeSend: true,
    }),
    mutatedData: false,
  })
}

function buildSampleModels(checkedAt = new Date().toISOString()) {
  return Object.freeze({
    resaleReady: buildOtpAgentControlledEditModel({
      transactionId: 'tx-phase30-resale-ready',
      routeVariant: 'resale_existing_property',
      reviewedAt: checkedAt,
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
    }),
    customBlocked: buildOtpAgentControlledEditModel({
      transactionId: 'tx-phase30-custom-blocked',
      routeVariant: 'resale_existing_property',
      reviewedAt: checkedAt,
      customConditionRequests: [
        {
          condition_title: 'Purchaser due diligence',
          responsible_party: 'buyer',
          required_action: 'Purchaser must be satisfied with documents supplied by the seller.',
          fulfilment_deadline: '2026-08-20',
          lapse_consequence: 'requires_review',
          waivable_by: 'buyer',
        },
      ],
    }),
    customApproved: buildOtpAgentControlledEditModel({
      transactionId: 'tx-phase30-custom-approved',
      routeVariant: 'resale_existing_property',
      reviewedAt: checkedAt,
      customConditionRequests: [
        {
          condition_title: 'Purchaser due diligence',
          responsible_party: 'buyer',
          required_action: 'Purchaser must be satisfied with documents supplied by the seller.',
          fulfilment_deadline: '2026-08-20',
          lapse_consequence: 'agreement_lapses_unless_waived_or_extended',
          waivable_by: 'buyer',
          approval_reference: 'SPECIAL-COND-APPROVED-001',
        },
      ],
    }),
    rawTemplateBlocked: buildOtpAgentControlledEditModel({
      transactionId: 'tx-phase30-raw-blocked',
      routeVariant: 'new_development',
      reviewedAt: checkedAt,
      editRequests: [
        { target: 'legal_template_clause_body', nextValue: 'Agent typed legal wording', rawTemplateEdit: true },
      ],
    }),
    developmentReady: buildOtpAgentControlledEditModel({
      transactionId: 'tx-phase30-development-ready',
      routeVariant: 'new_development',
      reviewedAt: checkedAt,
      standardConditionSelections: [
        {
          conditionType: 'development_document_approval',
          fields: { annexures_list: 'Plans, rules and specifications', irrevocable_offer_expiry: '2026-08-12T17:00:00' },
        },
      ],
    }),
  })
}

export function buildOtpAgentControlledEditsPhase30Audit({
  checkedAt = new Date().toISOString(),
  phase29Audit = buildOtpFinalProductionReadinessGatePhase29Audit({ checkedAt }),
} = {}) {
  const checks = []
  const samples = buildSampleModels(checkedAt)
  const sectionKeys = OTP_AGENT_EDITABLE_SECTIONS.map((item) => item.key)
  const conditionKeys = OTP_AGENT_STANDARD_CONDITION_CONTROLS.map((item) => item.key)

  addCheck(
    checks,
    phase29Audit.status === OTP_FINAL_PRODUCTION_READINESS_GATE_READY_STATUS,
    'PHASE30_PHASE29_FINAL_GATE_READY',
    'Agent controlled edits start after the final production readiness gate is green.',
  )
  addCheck(
    checks,
    ['party_details', 'purchase_economics', 'finance_and_suspensive_conditions', 'buyer_cost_obligations', 'special_conditions_annexures'].every((key) => sectionKeys.includes(key)),
    'PHASE30_AGENT_REVIEW_SECTIONS_PRESENT',
    'Agent review modal exposes controlled sections for parties, economics, conditions, buyer costs and special conditions.',
  )
  addCheck(
    checks,
    ['bond_approval', 'cash_proof', 'subject_to_sale', 'guarantee_delivery', 'development_document_approval'].every((key) => conditionKeys.includes(key)),
    'PHASE30_STANDARD_CONDITION_TOGGLES_PRESENT',
    'Standard suspensive-condition toggles exist before any custom condition path.',
  )
  addCheck(
    checks,
    samples.resaleReady.canGenerateOtp === true &&
      samples.resaleReady.conditionRows.some((row) => row.conditionType === 'bond_approval' && row.canRenderIntoOtp),
    'PHASE30_SAFE_STRUCTURED_EDITS_CAN_GENERATE',
    'Safe structured edits and standard condition toggles can render into the OTP without template mutation.',
  )
  addCheck(
    checks,
    samples.customBlocked.canGenerateOtp === false &&
      samples.customBlocked.blockerCodes.includes('custom_condition_requires_approval') &&
      samples.customApproved.canGenerateOtp === true,
    'PHASE30_CUSTOM_CONDITIONS_REQUIRE_APPROVAL',
    'Guided custom suspensive conditions require approval before they can render.',
  )
  addCheck(
    checks,
    samples.rawTemplateBlocked.canGenerateOtp === false &&
      samples.rawTemplateBlocked.blockerCodes.includes('raw_template_edit_blocked') &&
      samples.rawTemplateBlocked.controlPolicy.rawLegalTemplateEditingAllowed === false,
    'PHASE30_RAW_TEMPLATE_EDITING_BLOCKED',
    'Agents cannot edit published template clauses, route defaults or signing maps through OTP review.',
  )
  addCheck(
    checks,
    samples.developmentReady.standardConditionControls.some((control) => control.key === 'development_document_approval') &&
      !samples.resaleReady.standardConditionControls.some((control) => control.key === 'development_document_approval'),
    'PHASE30_ROUTE_SPECIFIC_CONTROLS_SEPARATED',
    'New-development controls stay out of resale review and route separation remains enforced.',
  )
  addCheck(
    checks,
    Object.values(samples).every((model) => model.mutatedData === false),
    'PHASE30_NO_MUTATION_DURING_REVIEW',
    'Phase 30 builds review controls and decisions without mutating transaction, template or signing records.',
  )

  const blockers = checks.filter((check) => !check.pass)

  return Object.freeze({
    version: OTP_AGENT_CONTROLLED_EDITS_PHASE30_VERSION,
    contract: OTP_AGENT_CONTROLLED_EDITS_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_AGENT_CONTROLLED_EDITS_REMEDIATION_REQUIRED' : OTP_AGENT_CONTROLLED_EDITS_READY_STATUS,
    mutatedData: false,
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 31,
      key: 'agent_otp_review_ui_wiring',
      label: 'Agent OTP Review UI Wiring',
    }),
    summary: Object.freeze({
      routeCount: OTP_DOCUMENT_VARIANTS.length,
      editableSectionCount: OTP_AGENT_EDITABLE_SECTIONS.length,
      standardConditionControlCount: OTP_AGENT_STANDARD_CONDITION_CONTROLS.length,
      customConditionFieldCount: OTP_AGENT_CUSTOM_CONDITION_FIELDS.length,
      blockerCount: blockers.length,
    }),
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    editableSections: OTP_AGENT_EDITABLE_SECTIONS,
    standardConditionControls: OTP_AGENT_STANDARD_CONDITION_CONTROLS,
    blockedEditTargets: OTP_AGENT_BLOCKED_EDIT_TARGETS,
    sampleModels: samples,
    evidence: Object.freeze({
      phase29: Object.freeze({
        version: phase29Audit.version,
        status: phase29Audit.status,
        blockerCount: phase29Audit.summary?.blockerCount ?? phase29Audit.blockers?.length ?? 0,
      }),
    }),
  })
}

export function formatOtpAgentControlledEditsPhase30Markdown(report = buildOtpAgentControlledEditsPhase30Audit()) {
  return [
    '# OTP Generator Phase 30 Agent Controlled Edits',
    '',
    `Generated: ${report.checkedAt}`,
    `Version: ${report.version}`,
    `Contract: ${report.contract}`,
    `Status: ${report.status}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Routes', report.summary.routeCount],
        ['Editable sections', report.summary.editableSectionCount],
        ['Standard condition controls', report.summary.standardConditionControlCount],
        ['Custom condition fields', report.summary.customConditionFieldCount],
        ['Blockers', report.summary.blockerCount],
        ['Next phase', report.nextPhase ? `Phase ${report.nextPhase.phase}: ${report.nextPhase.label}` : 'Blocked'],
      ],
    ),
    '',
    '## Checks',
    '',
    table(
      ['Check', 'Pass', 'Detail'],
      report.checks.map((check) => [check.code, check.pass ? 'yes' : 'no', check.detail]),
    ),
    '',
    '## Agent Review Sections',
    '',
    table(
      ['Section', 'Fields', 'Approval Required', 'Actions'],
      report.editableSections.map((item) => [
        item.label,
        item.fields.map((field) => field.key).join(', '),
        item.approvalRequired ? 'yes' : 'no',
        item.actions.join(', '),
      ]),
    ),
    '',
    '## Standard Suspensive Controls',
    '',
    table(
      ['Control', 'Routes', 'Required Fields', 'Risk', 'Approval Required'],
      report.standardConditionControls.map((item) => [
        item.key,
        item.routeVariants.join(', '),
        item.requiredFields.join(', '),
        item.riskLevel,
        item.approvalRequired ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 30 lets agents edit transaction terms through controlled records only. It does not allow raw legal-template editing, published-template mutation, signing role-map changes, route-default changes, signing dispatch, or production activation.',
    '',
  ].join('\n')
}
