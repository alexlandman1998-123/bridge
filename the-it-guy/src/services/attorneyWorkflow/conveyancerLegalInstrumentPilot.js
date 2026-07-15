import {
  MATTER_PLAN_ACTION_STATES,
  MATTER_PLAN_OWNER_ROLES as R,
  MATTER_PLAN_STATUSES,
  validateConveyancerMatterPlan,
} from '../../core/transactions/conveyancerMatterPlanContract.js'
import {
  buildConveyancerTemplateGovernanceFingerprint,
  validateConveyancerTemplateVersion,
} from '../../core/documents/legalTemplateGovernance.js'
import { getLegalInstrumentFamilyDefinition } from '../../core/documents/legalInstrumentFamilyRouter.js'
import { generateConveyancerMatterPlan } from './conveyancerMatterPlanGenerator.js'
import { buildConveyancerCorrespondenceClauseContentHash } from './conveyancerCorrespondenceGenerator.js'
import {
  CONVEYANCER_OPERATIONAL_DOCUMENT_ASSET_VERSION,
  CONVEYANCER_OPERATIONAL_DOCUMENT_GENERATOR_VERSION,
  CONVEYANCER_OPERATIONAL_DOCUMENT_OUTPUT_FORMATS,
  CONVEYANCER_OPERATIONAL_SIGNING_FIELD_TYPES,
  buildConveyancerOperationalDocumentAssetContentHash,
  buildConveyancerOperationalDocumentContentFingerprint,
  buildConveyancerOperationalDocumentProvenanceFingerprint,
  generateConveyancerOperationalDocument,
} from './conveyancerOperationalDocumentGenerator.js'
import { CONVEYANCER_CORRESPONDENCE_DATA_VALIDATOR_VERSION } from './conveyancerCorrespondenceDataValidation.js'

export const CONVEYANCER_LEGAL_INSTRUMENT_ASSURANCE_VERSION = 'conveyancer_legal_instrument_assurance_v1'
export const CONVEYANCER_LEGAL_INSTRUMENT_PILOT_VERSION = 'conveyancer_legal_instrument_pilot_v1'

export const DEFAULT_CONVEYANCER_LEGAL_INSTRUMENT_PILOT_THRESHOLDS = Object.freeze({
  minimumScenarioPassRate: 1,
  maximumUnexpectedGenerationFailureRate: 0.02,
  observeUnexpectedGenerationFailureRate: 0.01,
  maximumDataBlockRate: 0.2,
  observeDataBlockRate: 0.1,
  maximumWarningRate: 0.25,
  observeWarningRate: 0.1,
  maximumReviewSlaBreachRate: 0.1,
  observeReviewSlaBreachRate: 0.05,
})

export const CONVEYANCER_LEGAL_INSTRUMENT_PILOT_SCENARIOS = Object.freeze([
  Object.freeze({
    id: 'residential_transfer_instruction',
    label: 'Residential transfer instruction',
    lane: 'transfer',
    documentKind: 'instruction',
    instrumentFamily: 'residential_resale',
    actionKey: 'draft_transfer_documents',
    actorRole: R.transferAttorney,
    transaction: Object.freeze({ finance_type: 'cash', transaction_type: 'private_sale', buyer_entity_type: 'individual', seller_entity_type: 'individual', seller_has_existing_bond: false, property_tenure: 'freehold' }),
    referenceRule: 'south_african_id',
    referenceValue: '8001015009087',
    expectedOutcome: 'ready',
  }),
  Object.freeze({
    id: 'commercial_company_resolution',
    label: 'Commercial company transfer resolution',
    lane: 'transfer',
    documentKind: 'resolution',
    instrumentFamily: 'commercial_sale',
    actionKey: 'draft_transfer_documents',
    actorRole: R.transferAttorney,
    transaction: Object.freeze({ finance_type: 'cash', transaction_type: 'commercial', property_type: 'commercial', buyer_entity_type: 'company', seller_entity_type: 'company', seller_has_existing_bond: false, property_tenure: 'freehold', vat_treatment: 'vat' }),
    referenceRule: 'company_registration',
    referenceValue: '2020/123456/07',
    expectedOutcome: 'ready',
  }),
  Object.freeze({
    id: 'bank_bond_application',
    label: 'Bank-appointed bond application',
    lane: 'bond',
    documentKind: 'application',
    instrumentFamily: 'residential_resale',
    actionKey: 'coordinate_bond_attorney',
    actorRole: R.bondAttorney,
    transaction: Object.freeze({ finance_type: 'bond', transaction_type: 'private_sale', buyer_entity_type: 'individual', seller_entity_type: 'individual', seller_has_existing_bond: false, property_tenure: 'freehold' }),
    referenceRule: 'south_african_id',
    referenceValue: '8001015009087',
    expectedOutcome: 'ready',
  }),
  Object.freeze({
    id: 'lender_cancellation_instruction',
    label: 'Existing-lender cancellation instruction',
    lane: 'cancellation',
    documentKind: 'instruction',
    instrumentFamily: 'residential_resale',
    actionKey: 'coordinate_cancellation_attorney',
    actorRole: R.cancellationAttorney,
    transaction: Object.freeze({ finance_type: 'cash', transaction_type: 'private_sale', buyer_entity_type: 'individual', seller_entity_type: 'individual', seller_has_existing_bond: true, property_tenure: 'freehold' }),
    referenceRule: 'south_african_id',
    referenceValue: '8001015009087',
    expectedOutcome: 'ready',
  }),
  Object.freeze({
    id: 'warning_requires_attorney_review',
    label: 'Warning-only declaration remains under attorney review',
    lane: 'transfer',
    documentKind: 'declaration',
    instrumentFamily: 'residential_resale',
    actionKey: 'draft_transfer_documents',
    actorRole: R.transferAttorney,
    transaction: Object.freeze({ finance_type: 'cash', transaction_type: 'private_sale', buyer_entity_type: 'individual', seller_entity_type: 'individual', seller_has_existing_bond: false, property_tenure: 'freehold' }),
    referenceRule: 'south_african_id',
    referenceValue: '8001015009087',
    longNote: true,
    expectedOutcome: 'observe',
  }),
  Object.freeze({
    id: 'invalid_identity_fails_closed',
    label: 'Invalid identity blocks instrument assembly',
    lane: 'transfer',
    documentKind: 'instruction',
    instrumentFamily: 'residential_resale',
    actionKey: 'draft_transfer_documents',
    actorRole: R.transferAttorney,
    transaction: Object.freeze({ finance_type: 'cash', transaction_type: 'private_sale', buyer_entity_type: 'individual', seller_entity_type: 'individual', seller_has_existing_bond: false, property_tenure: 'freehold' }),
    referenceRule: 'south_african_id',
    referenceValue: '123',
    expectedOutcome: 'safe_block',
  }),
])

const OUTPUT_FORMATS = new Set(Object.values(CONVEYANCER_OPERATIONAL_DOCUMENT_OUTPUT_FORMATS))
const SIGNING_FIELD_TYPES = new Set(Object.values(CONVEYANCER_OPERATIONAL_SIGNING_FIELD_TYPES))
const TERMINAL_ACTION_STATES = new Set([MATTER_PLAN_ACTION_STATES.completed, MATTER_PLAN_ACTION_STATES.cancelled])

function text(value = '') {
  return String(value ?? '').trim()
}

function number(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function validDate(value) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()))
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function clone(value) {
  return typeof globalThis.structuredClone === 'function' ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value))
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}

function check({ id, label, category = 'platform', severity = 'warning', passed, detail, evidence = null }) {
  return { id, label, category, severity, status: passed ? 'passed' : 'failed', passed: passed === true, detail, evidence }
}

function objectContainsForbiddenKey(value, forbiddenKeys) {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([itemKey, item]) => forbiddenKeys.has(itemKey) || objectContainsForbiddenKey(item, forbiddenKeys))
}

function validateRenderModel(document = {}) {
  const model = document.renderModel || {}
  const sections = Array.isArray(model.sections) ? model.sections : []
  const signingFields = Array.isArray(model.signingFields) ? model.signingFields : []
  const sectionKeys = sections.map((item) => text(item.sectionKey))
  const signingKeys = signingFields.map((item) => text(item.fieldKey))
  const issues = []
  if (model.schemaVersion !== CONVEYANCER_OPERATIONAL_DOCUMENT_ASSET_VERSION) issues.push('render_schema_version_invalid')
  if (!OUTPUT_FORMATS.has(text(model.outputFormat))) issues.push('render_output_format_invalid')
  if (!text(model.fileName) || !text(model.title)) issues.push('render_identity_missing')
  if (!sections.length) issues.push('render_sections_missing')
  if (sectionKeys.some((item) => !item) || new Set(sectionKeys).size !== sectionKeys.length) issues.push('render_section_identity_invalid')
  if (sections.some((item) => item.required && !text(item.body))) issues.push('required_render_section_empty')
  if (signingKeys.some((item) => !item) || new Set(signingKeys).size !== signingKeys.length) issues.push('render_signing_field_identity_invalid')
  if (signingFields.some((item) => !SIGNING_FIELD_TYPES.has(text(item.fieldType)))) issues.push('render_signing_field_type_invalid')
  if (signingFields.some((item) => !sectionKeys.includes(text(item.sectionKey)))) issues.push('render_signing_field_section_invalid')
  return { valid: issues.length === 0, issues }
}

export function buildConveyancerLegalInstrumentAssurance({ plan = {}, template = {}, document = {}, event = {}, asOf = '' } = {}) {
  const resolvedAsOf = validDate(asOf) ? new Date(asOf).toISOString() : new Date().toISOString()
  const planValidation = validateConveyancerMatterPlan(plan)
  const templateValidation = validateConveyancerTemplateVersion(template)
  const governedTemplate = templateValidation.template
  const family = getLegalInstrumentFamilyDefinition(governedTemplate.instrumentFamily)
  const action = planValidation.plan.actions.find((item) => item.key === document.actionKey)
  const render = validateRenderModel(document)
  const calculatedFingerprint = buildConveyancerOperationalDocumentContentFingerprint({
    renderModel: document.renderModel,
    templateVersionId: document.template?.templateVersionId,
  })
  const governanceFingerprint = buildConveyancerTemplateGovernanceFingerprint(governedTemplate)
  const provenanceFingerprint = buildConveyancerOperationalDocumentProvenanceFingerprint({
    contentFingerprint: document.contentFingerprint,
    planId: document.planId,
    planVersion: document.planVersion,
    transactionId: document.transactionId,
    organisationId: document.organisationId,
    actionKey: document.actionKey,
    documentKey: document.documentKey,
    documentKind: document.documentKind,
    lane: document.lane,
    template: document.template,
    variableManifest: document.variableManifest,
    clauseManifest: document.clauseManifest,
    dataValidation: document.dataValidation,
  })
  const templateEffective = validDate(governedTemplate.publication.effectiveFrom) && new Date(governedTemplate.publication.effectiveFrom) <= new Date(resolvedAsOf) && (!governedTemplate.publication.effectiveUntil || (validDate(governedTemplate.publication.effectiveUntil) && new Date(governedTemplate.publication.effectiveUntil) > new Date(resolvedAsOf)))
  const forbiddenAuditKeys = new Set(['body', 'subject', 'recipients', 'renderModel', 'sections', 'variableManifest', 'clauseManifest', 'fieldResults'])
  const checks = [
    check({ id: 'active_plan_contract', label: 'The instrument belongs to a valid active matter plan', severity: 'critical', passed: planValidation.valid && planValidation.plan.status === MATTER_PLAN_STATUSES.active, detail: planValidation.valid ? `Plan status: ${planValidation.plan.status}.` : `${planValidation.errors.length} plan error(s).`, evidence: planValidation.errors }),
    check({ id: 'c1_template_contract', label: 'The exact C1 template version remains governed, published and effective', severity: 'critical', passed: templateValidation.valid && governedTemplate.status === 'published' && templateEffective && governedTemplate.approval.templateFingerprint === governanceFingerprint, detail: templateValidation.valid ? `Template ${governedTemplate.templateVersionId || 'missing'} checked.` : `${templateValidation.errors.length} template error(s).`, evidence: templateValidation.errors }),
    check({ id: 'legal_instrument_family', label: 'The pilot template declares a recognised legal-instrument family', severity: 'critical', passed: Boolean(family), detail: family ? `${family.label} (${family.key}).` : 'Instrument family missing or unknown.' }),
    check({ id: 'c4_document_contract', label: 'The assembled draft uses the C4 operational-document contract', severity: 'critical', passed: document.version === CONVEYANCER_OPERATIONAL_DOCUMENT_GENERATOR_VERSION && document.status === 'draft', detail: `Document status: ${document.status || 'missing'}.` }),
    check({ id: 'matter_action_binding', label: 'The draft binds to an existing non-terminal matter action', severity: 'critical', passed: Boolean(action && !TERMINAL_ACTION_STATES.has(action.state)), detail: action ? `${action.key}: ${action.state}.` : 'Bound action missing.' }),
    check({ id: 'matter_identity_binding', label: 'Plan, transaction and organisation bindings are exact', severity: 'critical', passed: document.planId === planValidation.plan.planId && Number(document.planVersion) === Number(planValidation.plan.version) && document.transactionId === planValidation.plan.transactionId && document.organisationId === planValidation.plan.organisationId, detail: 'C4 binding compared with active plan.' }),
    check({ id: 'template_identity_binding', label: 'Template version, hash and governance fingerprint are exact', severity: 'critical', passed: document.template?.templateId === governedTemplate.templateId && document.template?.templateVersionId === governedTemplate.templateVersionId && document.template?.contentHash === governedTemplate.content.contentHash && document.template?.governanceFingerprint === governanceFingerprint, detail: `Template version: ${document.template?.templateVersionId || 'missing'}.` }),
    check({ id: 'c3_data_gate', label: 'C3 governed data checks contain no blocking failure', severity: 'critical', passed: document.dataValidation?.version === CONVEYANCER_CORRESPONDENCE_DATA_VALIDATOR_VERSION && document.dataValidation?.blockingCount === 0 && ['passed', 'warning'].includes(document.dataValidation?.outcome), detail: `Data outcome: ${document.dataValidation?.outcome || 'missing'}.`, evidence: document.dataValidation?.failedCodes || [] }),
    check({ id: 'c3_data_warning_health', label: 'The draft has no data warning requiring review attention', category: 'instrument', passed: document.dataValidation?.outcome === 'passed', detail: `${number(document.dataValidation?.warningCount)} data warning(s).`, evidence: document.dataValidation?.failedCodes || [] }),
    check({ id: 'render_model_integrity', label: 'The renderer-neutral section and signing model is structurally valid', severity: 'critical', passed: render.valid, detail: render.valid ? `${document.renderModel?.sections?.length || 0} section(s) verified.` : `${render.issues.length} render issue(s).`, evidence: render.issues }),
    check({ id: 'content_fingerprint_integrity', label: 'The operational draft content fingerprint recomputes exactly', severity: 'critical', passed: document.contentFingerprint === calculatedFingerprint, detail: document.contentFingerprint === calculatedFingerprint ? 'Content unchanged.' : 'Content fingerprint mismatch.' }),
    check({ id: 'provenance_fingerprint_integrity', label: 'Field, clause, validation and route provenance recomputes exactly', severity: 'critical', passed: document.provenanceFingerprint === provenanceFingerprint, detail: document.provenanceFingerprint === provenanceFingerprint ? 'Document provenance unchanged.' : 'Document provenance fingerprint mismatch.' }),
    check({ id: 'generation_chronology', label: 'Document and event timestamps are coherent and not in the future', severity: 'critical', passed: validDate(document.generatedAt) && validDate(event.occurredAt) && document.generatedAt === event.occurredAt && new Date(document.generatedAt) <= new Date(resolvedAsOf), detail: `Generated at: ${document.generatedAt || 'missing'}.` }),
    check({ id: 'human_review_boundary', label: 'The pilot draft cannot persist, sign or dispatch before human review', severity: 'critical', passed: document.renderReady === true && document.reviewRequired === true && document.persistAllowed === false && document.signingAllowed === false && document.dispatchAllowed === false, detail: 'C4 safety boundary checked.' }),
    check({ id: 'generation_audit_binding', label: 'The redacted C4 generation event binds to the exact draft', severity: 'critical', passed: event.version === CONVEYANCER_OPERATIONAL_DOCUMENT_GENERATOR_VERSION && event.eventType === 'operational_document_generated' && event.commandId === document.commandId && event.documentId === document.documentId && event.planId === document.planId && Number(event.planVersion) === Number(document.planVersion) && event.actionKey === document.actionKey && event.documentKey === document.documentKey && event.documentKind === document.documentKind && event.lane === document.lane && event.templateVersionId === governedTemplate.templateVersionId && event.contentFingerprint === document.contentFingerprint && event.provenanceFingerprint === document.provenanceFingerprint && event.actor?.role === document.generatedBy?.role && event.actor?.userId === document.generatedBy?.userId, detail: `Event: ${event.eventId || 'missing'}.` }),
    check({ id: 'no_side_effect_evidence', label: 'The generation event confirms no render, write, signing or dispatch side effect', severity: 'critical', passed: event.renderingPerformed === false && event.persistencePerformed === false && event.signingPerformed === false && event.dispatchPerformed === false, detail: 'Side-effect flags checked.' }),
    check({ id: 'audit_redaction', label: 'Audit metadata excludes document content and resolved field payloads', severity: 'critical', passed: !objectContainsForbiddenKey(event, forbiddenAuditKeys), detail: 'Audit payload key scan completed.' }),
  ]
  const failedCritical = checks.filter((item) => item.status === 'failed' && item.severity === 'critical')
  const failedWarnings = checks.filter((item) => item.status === 'failed' && item.severity !== 'critical')
  const decision = failedCritical.length ? 'blocked' : failedWarnings.length ? 'observe' : 'ready'
  const evidence = {
    version: CONVEYANCER_LEGAL_INSTRUMENT_ASSURANCE_VERSION,
    generatedAt: resolvedAsOf,
    decision,
    planId: planValidation.plan.planId || null,
    planVersion: Number(planValidation.plan.version || 0),
    documentId: document.documentId || null,
    documentKind: document.documentKind || null,
    actionKey: document.actionKey || null,
    instrumentFamily: family?.key || null,
    templateVersionId: governedTemplate.templateVersionId || null,
    templateGovernanceFingerprint: governanceFingerprint,
    contentFingerprint: calculatedFingerprint,
    checks: checks.map((item) => ({ id: item.id, status: item.status, detail: item.detail })),
  }
  return deepFreeze({
    version: CONVEYANCER_LEGAL_INSTRUMENT_ASSURANCE_VERSION,
    decision,
    decisionLabel: decision === 'ready' ? 'Legal-instrument draft assured for attorney review' : decision === 'observe' ? 'Draft assured with review observations' : 'Legal-instrument assurance blocked',
    reviewReady: decision !== 'blocked',
    releaseReady: decision === 'ready',
    checks,
    failedChecks: checks.filter((item) => item.status === 'failed'),
    failedCriticalCount: failedCritical.length,
    failedWarningCount: failedWarnings.length,
    evidence,
  })
}

function pilotVariables(scenario) {
  return [
    { key: 'party_name', label: 'Primary party name', type: 'text', coverage: 'mapped', sourcePaths: ['party.name'], required: true, validationRules: [{ type: 'min_length', value: 2 }] },
    { key: 'party_reference', label: 'Primary party reference', type: 'text', coverage: 'mapped', sourcePaths: ['party.reference'], required: true, sensitive: true, validationRules: [{ type: scenario.referenceRule }, { type: 'source_verification_required' }] },
    { key: 'property_description', label: 'Property description', type: 'text', coverage: 'mapped', sourcePaths: ['property.description'], required: true },
    { key: 'matter_reference', label: 'Matter reference', type: 'text', coverage: 'calculated', sourcePaths: ['plan.planId'], required: true },
    { key: 'generated_date', label: 'Generated date', type: 'date', coverage: 'calculated', sourcePaths: ['generated.date'], required: true, validationRules: [{ type: 'date_not_future' }] },
    { key: 'pilot_note', label: 'Pilot note', type: 'text', coverage: 'manual', sourcePaths: [], manualEntryAllowed: true, required: true, validationRules: [{ type: 'max_length', value: 80, severity: 'warning' }] },
    { key: 'legal_terms', label: 'Approved legal terms', type: 'text', coverage: 'approved_clause', sourcePaths: [], clauseKey: `${scenario.id}_terms`, required: true },
    { key: 'organisation_name', label: 'Firm name', type: 'text', coverage: 'agency_setting', sourcePaths: ['organisation.legalName'], required: true },
    { key: 'signatory_name', label: 'Signatory name', type: 'text', coverage: 'signing_preset', sourcePaths: ['signing.signatoryName'], required: true },
  ]
}

function pilotAsset(scenario, templateVersionId) {
  const base = {
    assetVersion: CONVEYANCER_OPERATIONAL_DOCUMENT_ASSET_VERSION,
    templateVersionId,
    outputFormat: 'pdf',
    titleTemplate: `${scenario.label} · {{matter_reference}}`,
    fileNameTemplate: `${scenario.label} - {{party_name}}`,
    sections: [
      { sectionKey: 'details', titleTemplate: 'Matter details', bodyTemplate: 'Party: {{party_name}}\nReference: {{party_reference}}\nProperty: {{property_description}}\nDate: {{generated_date}}', required: true },
      { sectionKey: 'instrument', titleTemplate: scenario.label, bodyTemplate: '{{legal_terms}}\n{{pilot_note}}\nPrepared by {{organisation_name}}.', required: true, pageBreakBefore: true, keepTogether: true },
      { sectionKey: 'execution', titleTemplate: 'Execution', bodyTemplate: 'Authorised signatory: {{signatory_name}}', required: true },
    ],
    signingFields: [{ fieldKey: 'legal_reviewer_signature', fieldType: 'signature', signerRole: scenario.lane === 'bond' ? 'bond_attorney' : scenario.lane === 'cancellation' ? 'cancellation_attorney' : 'transfer_attorney', sectionKey: 'execution', variableKey: 'signatory_name', required: true, order: 1 }],
  }
  return { ...base, contentHash: buildConveyancerOperationalDocumentAssetContentHash(base) }
}

function pilotTemplate(scenario, organisationId, generatedAt) {
  const variables = pilotVariables(scenario)
  const templateId = `pilot-template-${scenario.id}`
  const templateVersionId = `${templateId}-v1`
  const asset = pilotAsset(scenario, templateVersionId)
  const clauseText = `This ${scenario.documentKind} is governed for {{property_description}}.`
  const clauseHash = buildConveyancerCorrespondenceClauseContentHash(clauseText)
  const attorney = { role: R.transferAttorney, userId: 'pilot-template-attorney' }
  const base = {
    contractVersion: 'conveyancer_template_governance_v1',
    governanceVersion: 1,
    templateId,
    templateVersionId,
    organisationId,
    moduleType: 'attorney',
    packetType: 'operational_documents',
    templateKey: `${scenario.id}_instrument`,
    templateLabel: scenario.label,
    documentKind: scenario.documentKind,
    documentModel: 'single_master_document',
    templateFormat: 'structured',
    lane: scenario.lane,
    status: 'published',
    versionNumber: 1,
    versionTag: 'v1',
    jurisdictionCode: 'ZA',
    languageCode: 'en-ZA',
    instrumentFamily: scenario.instrumentFamily,
    applicability: {
      transactionTypes: [scenario.transaction.transaction_type],
      buyerEntityTypes: [scenario.transaction.buyer_entity_type],
      sellerEntityTypes: [scenario.transaction.seller_entity_type],
      propertyTenures: [scenario.transaction.property_tenure],
      sellerHasExistingBond: scenario.transaction.seller_has_existing_bond,
    },
    content: { contentHash: asset.contentHash, storageBucket: 'pilot-legal-templates', storagePath: `${organisationId}/${scenario.id}-v1.json`, fileName: `${scenario.id}-v1.json`, sectionCount: asset.sections.length, placeholderKeys: variables.map((item) => item.key) },
    variables,
    clauses: [{ key: `${scenario.id}_terms`, version: 1, required: true, contentHash: clauseHash, approvedAt: generatedAt, approvedBy: attorney }],
    change: { type: 'initial', summary: `Initial C5 pilot template for ${scenario.label}.` },
    authoredBy: { role: R.secretary, userId: 'pilot-template-author' },
    createdAt: generatedAt,
    publication: { publishedAt: generatedAt, publishedBy: { role: R.firmManager, userId: 'pilot-template-manager' }, effectiveFrom: generatedAt, effectiveUntil: null },
  }
  const template = { ...base, approval: { approvedAt: generatedAt, approvedBy: attorney, templateFingerprint: buildConveyancerTemplateGovernanceFingerprint(base) } }
  const clause = { key: `${scenario.id}_terms`, version: 1, contentHash: clauseHash, legalText: clauseText, approvedAt: generatedAt, approvedBy: attorney }
  return { template, asset, clause }
}

function runPilotScenario(scenario, options) {
  const transaction = { id: `pilot-c5-${scenario.id}`, organisation_id: options.organisationId, ...scenario.transaction }
  const generatedPlan = generateConveyancerMatterPlan({ transaction, generatedAt: options.generatedAt })
  if (!generatedPlan.valid) return { scenarioId: scenario.id, label: scenario.label, passed: false, errors: generatedPlan.errors, actualOutcome: 'generation_error', assurance: null }
  const plan = { ...clone(generatedPlan.plan), status: MATTER_PLAN_STATUSES.active, activatedAt: options.generatedAt }
  const fixture = pilotTemplate(scenario, options.organisationId, options.generatedAt)
  const result = generateConveyancerOperationalDocument({
    plan,
    templates: [fixture.template],
    assets: [fixture.asset],
    documentKey: fixture.template.templateKey,
    documentKind: scenario.documentKind,
    actionKey: scenario.actionKey,
    lane: scenario.lane,
    actor: { role: scenario.actorRole, userId: `pilot-${scenario.actorRole}` },
    data: { party: { name: 'Pilot Party', reference: scenario.referenceValue }, property: { description: 'Erf 123 Pilot Township' } },
    organisationSettings: { legalName: 'Pilot Attorneys Inc.' },
    signingPreset: { signatoryName: 'Pilot Attorney' },
    manualValues: { pilot_note: scenario.longNote ? 'A'.repeat(81) : 'Prepared for controlled pilot review.' },
    clauses: [fixture.clause],
    sourceEvidence: { party_reference: { verifiedAt: options.generatedAt, verifiedBy: { role: R.transferAttorney, userId: 'pilot-verifier' }, expiresAt: new Date(new Date(options.generatedAt).getTime() + 30 * 86400000).toISOString() } },
    generatedAt: options.generatedAt,
    commandId: `pilot-c5-command-${scenario.id}`,
    expectedPlanId: plan.planId,
    expectedPlanVersion: plan.version,
  })
  if (scenario.expectedOutcome === 'safe_block') {
    const passed = !result.ok && result.code === 'operational_document_data_blocked' && result.validation?.outcome === 'blocked'
    return { scenarioId: scenario.id, label: scenario.label, expectedOutcome: scenario.expectedOutcome, actualOutcome: passed ? 'safe_block' : result.code, passed, errors: passed ? [] : result.errors, assurance: null }
  }
  if (!result.ok) return { scenarioId: scenario.id, label: scenario.label, expectedOutcome: scenario.expectedOutcome, actualOutcome: result.code, passed: false, errors: result.errors, assurance: null }
  const assurance = buildConveyancerLegalInstrumentAssurance({ plan, template: fixture.template, document: result.document, event: result.event, asOf: options.generatedAt })
  return {
    scenarioId: scenario.id,
    label: scenario.label,
    lane: scenario.lane,
    documentKind: scenario.documentKind,
    instrumentFamily: scenario.instrumentFamily,
    expectedOutcome: scenario.expectedOutcome,
    actualOutcome: assurance.decision,
    passed: assurance.decision === scenario.expectedOutcome,
    errors: [],
    assurance,
    ...(options.includeArtifacts ? { artifacts: { plan, template: fixture.template, document: result.document, event: result.event } } : {}),
  }
}

export function runConveyancerLegalInstrumentPilotScenario({ scenarioId = '', scenario = null, generatedAt = '', organisationId = 'pilot-c5-organisation', includeArtifacts = false } = {}) {
  const selected = scenario || CONVEYANCER_LEGAL_INSTRUMENT_PILOT_SCENARIOS.find((item) => item.id === text(scenarioId))
  if (!selected) return deepFreeze({ scenarioId: text(scenarioId) || null, label: null, passed: false, errors: ['pilot_scenario_not_found'], actualOutcome: 'scenario_not_found', assurance: null })
  const resolvedGeneratedAt = validDate(generatedAt) ? new Date(generatedAt).toISOString() : new Date().toISOString()
  return deepFreeze(runPilotScenario(selected, { generatedAt: resolvedGeneratedAt, organisationId: text(organisationId) || 'pilot-c5-organisation', includeArtifacts }))
}

function rateTrigger({ key, rate, maximum, observe, label }) {
  if (rate > maximum) return { key, severity: 'critical', detail: `${Math.round(rate * 100)}% ${label}.` }
  if (rate > observe) return { key, severity: 'warning', detail: `${Math.round(rate * 100)}% ${label}.` }
  return null
}

function operationalTriggers(metrics, thresholds) {
  const attempts = number(metrics.generationAttempts)
  const validated = number(metrics.validatedDrafts)
  const reviewDecisions = number(metrics.reviewDecisions)
  const unexpectedFailureRate = attempts ? number(metrics.unexpectedGenerationFailures) / attempts : 0
  const dataBlockRate = attempts ? number(metrics.dataValidationBlocks) / attempts : 0
  const warningRate = validated ? number(metrics.warningDrafts) / validated : 0
  const reviewSlaBreachRate = reviewDecisions ? number(metrics.reviewSlaBreaches) / reviewDecisions : 0
  const triggers = [
    number(metrics.templateSelectionConflicts) > 0 ? { key: 'template_selection_conflict', severity: 'critical', detail: `${number(metrics.templateSelectionConflicts)} template selection conflict(s).` } : null,
    number(metrics.contentIntegrityFailures) > 0 ? { key: 'content_integrity_failure', severity: 'critical', detail: `${number(metrics.contentIntegrityFailures)} integrity failure(s).` } : null,
    number(metrics.unauthorisedGenerationsAccepted || metrics.unauthorizedGenerationsAccepted) > 0 ? { key: 'unauthorised_generation_accepted', severity: 'critical', detail: 'An unauthorised generation crossed the pilot boundary.' } : null,
    number(metrics.auditGaps) > 0 ? { key: 'instrument_audit_gap', severity: 'critical', detail: `${number(metrics.auditGaps)} audit gap(s).` } : null,
    number(metrics.tamperedDraftsAccepted) > 0 ? { key: 'tampered_draft_accepted', severity: 'critical', detail: 'A tampered draft passed assurance.' } : null,
    number(metrics.renderAttempts) > 0 ? { key: 'render_attempted', severity: 'critical', detail: 'Rendering occurred inside the C5 pilot boundary.' } : null,
    number(metrics.persistenceAttempts) > 0 ? { key: 'persistence_attempted', severity: 'critical', detail: 'Persistence occurred inside the C5 pilot boundary.' } : null,
    number(metrics.signingAttempts) > 0 ? { key: 'signing_attempted', severity: 'critical', detail: 'Signing occurred inside the C5 pilot boundary.' } : null,
    number(metrics.dispatchAttempts) > 0 ? { key: 'dispatch_attempted', severity: 'critical', detail: 'Dispatch occurred inside the C5 pilot boundary.' } : null,
    rateTrigger({ key: 'unexpected_generation_failure_rate', rate: unexpectedFailureRate, maximum: thresholds.maximumUnexpectedGenerationFailureRate, observe: thresholds.observeUnexpectedGenerationFailureRate, label: 'unexpected generation failure rate' }),
    rateTrigger({ key: 'data_block_rate', rate: dataBlockRate, maximum: thresholds.maximumDataBlockRate, observe: thresholds.observeDataBlockRate, label: 'data block rate' }),
    rateTrigger({ key: 'warning_rate', rate: warningRate, maximum: thresholds.maximumWarningRate, observe: thresholds.observeWarningRate, label: 'warning draft rate' }),
    rateTrigger({ key: 'review_sla_breach_rate', rate: reviewSlaBreachRate, maximum: thresholds.maximumReviewSlaBreachRate, observe: thresholds.observeReviewSlaBreachRate, label: 'review SLA breach rate' }),
  ].filter(Boolean)
  return { triggers, unexpectedFailureRate, dataBlockRate, warningRate, reviewSlaBreachRate }
}

function resolvePilotThresholds(input = {}) {
  const thresholds = { ...DEFAULT_CONVEYANCER_LEGAL_INSTRUMENT_PILOT_THRESHOLDS }
  const errors = []
  for (const [thresholdKey, defaultValue] of Object.entries(DEFAULT_CONVEYANCER_LEGAL_INSTRUMENT_PILOT_THRESHOLDS)) {
    if (input[thresholdKey] === undefined) continue
    const proposed = Number(input[thresholdKey])
    const weakensMinimum = thresholdKey.startsWith('minimum') && proposed < defaultValue
    const weakensMaximum = !thresholdKey.startsWith('minimum') && proposed > defaultValue
    if (!Number.isFinite(proposed) || proposed < 0 || proposed > 1 || weakensMinimum || weakensMaximum) errors.push(`unsafe_pilot_threshold:${thresholdKey}`)
    else thresholds[thresholdKey] = proposed
  }
  const pairs = [
    ['observeUnexpectedGenerationFailureRate', 'maximumUnexpectedGenerationFailureRate'],
    ['observeDataBlockRate', 'maximumDataBlockRate'],
    ['observeWarningRate', 'maximumWarningRate'],
    ['observeReviewSlaBreachRate', 'maximumReviewSlaBreachRate'],
  ]
  pairs.forEach(([observeKey, maximumKey]) => {
    if (thresholds[observeKey] > thresholds[maximumKey]) errors.push(`pilot_observe_threshold_exceeds_maximum:${observeKey}`)
  })
  return { thresholds, errors: unique(errors) }
}

export function runConveyancerLegalInstrumentPilotSuite({
  scenarios = CONVEYANCER_LEGAL_INSTRUMENT_PILOT_SCENARIOS,
  generatedAt = '',
  organisationId = 'pilot-c5-organisation',
  thresholds = {},
  operationalMetrics = {},
} = {}) {
  const resolvedGeneratedAt = validDate(generatedAt) ? new Date(generatedAt).toISOString() : new Date().toISOString()
  const thresholdResolution = resolvePilotThresholds(thresholds)
  const effectiveThresholds = thresholdResolution.thresholds
  const results = (Array.isArray(scenarios) ? scenarios : []).map((scenario) => runPilotScenario(scenario, { generatedAt: resolvedGeneratedAt, organisationId: text(organisationId) || 'pilot-c5-organisation' }))
  const passedCount = results.filter((item) => item.passed).length
  const scenarioPassRate = results.length ? passedCount / results.length : 0
  const operational = operationalTriggers(operationalMetrics, effectiveThresholds)
  const criticalTriggers = operational.triggers.filter((item) => item.severity === 'critical')
  const warningTriggers = operational.triggers.filter((item) => item.severity !== 'critical')
  const releaseBlockers = unique([
    ...(results.length ? [] : ['no_pilot_scenarios']),
    ...(scenarioPassRate < effectiveThresholds.minimumScenarioPassRate ? ['scenario_pass_rate'] : []),
    ...thresholdResolution.errors,
    ...criticalTriggers.map((item) => item.key),
  ])
  const decision = releaseBlockers.length ? 'hold' : warningTriggers.length ? 'observe' : 'go'
  return deepFreeze({
    version: CONVEYANCER_LEGAL_INSTRUMENT_PILOT_VERSION,
    decision,
    decisionLabel: decision === 'go' ? 'Legal-instrument pilot supports controlled attorney review' : decision === 'observe' ? 'Legal-instrument pilot may continue under observation' : 'Hold or roll back the legal-instrument pilot',
    generatedAt: resolvedGeneratedAt,
    scenarioResults: results,
    metrics: {
      scenarioCount: results.length,
      passedCount,
      failedCount: results.length - passedCount,
      scenarioPassRate,
      readyCount: results.filter((item) => item.actualOutcome === 'ready').length,
      observeCount: results.filter((item) => item.actualOutcome === 'observe').length,
      expectedSafeBlockCount: results.filter((item) => item.actualOutcome === 'safe_block').length,
      unexpectedGenerationFailureRate: operational.unexpectedFailureRate,
      dataBlockRate: operational.dataBlockRate,
      warningRate: operational.warningRate,
      reviewSlaBreachRate: operational.reviewSlaBreachRate,
    },
    thresholds: effectiveThresholds,
    thresholdErrors: thresholdResolution.errors,
    rollbackTriggers: operational.triggers,
    releaseBlockers,
  })
}

export function buildConveyancerLegalInstrumentPilotManifest({
  firmIds = [],
  templateVersionIds = [],
  instrumentFamilies = [],
  lanes = [],
  startsAt = '',
  endsAt = '',
  maximumMatters = 10,
  maximumDocumentsPerMatter = 5,
  assuranceOwnerId = '',
  legalReviewOwnerId = '',
  rollbackOwnerId = '',
  supportOwnerId = '',
} = {}) {
  const normalizedFirmIds = unique((Array.isArray(firmIds) ? firmIds : []).map(text))
  const normalizedTemplateIds = unique((Array.isArray(templateVersionIds) ? templateVersionIds : []).map(text))
  const suppliedFamilies = unique((Array.isArray(instrumentFamilies) ? instrumentFamilies : []).map(text))
  const normalizedFamilies = unique(suppliedFamilies.map((item) => getLegalInstrumentFamilyDefinition(item)?.key).filter(Boolean))
  const normalizedLanes = unique((Array.isArray(lanes) ? lanes : []).map(text))
  const errors = []
  if (!normalizedFirmIds.length || normalizedFirmIds.length > 3) errors.push('pilot_firm_count_out_of_range')
  if (!normalizedTemplateIds.length) errors.push('pilot_template_version_required')
  if (!suppliedFamilies.length) errors.push('pilot_instrument_family_required')
  suppliedFamilies.filter((item) => !getLegalInstrumentFamilyDefinition(item)).forEach((item) => errors.push(`unknown_pilot_instrument_family:${item}`))
  if (!normalizedLanes.length || normalizedLanes.some((item) => !['transfer', 'bond', 'cancellation'].includes(item))) errors.push('valid_pilot_lane_required')
  if (!validDate(startsAt)) errors.push('valid_start_date_required')
  if (!validDate(endsAt)) errors.push('valid_end_date_required')
  if (validDate(startsAt) && validDate(endsAt) && new Date(endsAt) <= new Date(startsAt)) errors.push('pilot_end_must_follow_start')
  if (!Number.isInteger(Number(maximumMatters)) || Number(maximumMatters) < 5 || Number(maximumMatters) > 25) errors.push('pilot_matter_limit_out_of_range')
  if (!Number.isInteger(Number(maximumDocumentsPerMatter)) || Number(maximumDocumentsPerMatter) < 1 || Number(maximumDocumentsPerMatter) > 10) errors.push('pilot_document_limit_out_of_range')
  if (!text(assuranceOwnerId)) errors.push('assurance_owner_required')
  if (!text(legalReviewOwnerId)) errors.push('legal_review_owner_required')
  if (!text(rollbackOwnerId)) errors.push('rollback_owner_required')
  if (!text(supportOwnerId)) errors.push('support_owner_required')
  return deepFreeze({
    version: CONVEYANCER_LEGAL_INSTRUMENT_PILOT_VERSION,
    valid: errors.length === 0,
    errors: unique(errors),
    cohort: {
      firmIds: normalizedFirmIds,
      templateVersionIds: normalizedTemplateIds,
      instrumentFamilies: normalizedFamilies,
      lanes: normalizedLanes,
      maximumMatters: Number(maximumMatters),
      maximumDocumentsPerMatter: Number(maximumDocumentsPerMatter),
      startsAt: validDate(startsAt) ? new Date(startsAt).toISOString() : null,
      endsAt: validDate(endsAt) ? new Date(endsAt).toISOString() : null,
    },
    owners: {
      assuranceOwnerId: text(assuranceOwnerId) || null,
      legalReviewOwnerId: text(legalReviewOwnerId) || null,
      rollbackOwnerId: text(rollbackOwnerId) || null,
      supportOwnerId: text(supportOwnerId) || null,
    },
    controls: {
      legacyDocumentFallback: true,
      killSwitchRequired: true,
      humanAttorneyReviewRequired: true,
      oneApprovedTemplateVersionPerInstrument: true,
      automaticRendering: false,
      databaseWritesEnabledByManifest: false,
      automaticLegalApproval: false,
      automaticSigning: false,
      automaticDispatch: false,
      productionPacketIntegration: false,
    },
    entryCriteria: ['A1-A7, B1-B7 and C1-C5 tests passing', 'named assurance, legal-review, rollback and support owners', 'exact published template versions pinned', 'legal-instrument families and lanes explicitly scoped', 'legacy document fallback and kill switch available'],
    exitCriteria: ['100% expected scenario outcomes', 'no critical rollback trigger', 'all generated drafts independently assured', 'all warning drafts reviewed within SLA', 'no content-integrity, access-control or audit failure', 'no render, persistence, signing or dispatch side effect inside the pilot boundary'],
  })
}

export function serializeConveyancerLegalInstrumentAssuranceEvidence(assurance) {
  return JSON.stringify(assurance?.evidence || {}, null, 2)
}
