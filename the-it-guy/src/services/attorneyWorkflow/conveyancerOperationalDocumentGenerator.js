import {
  MATTER_PLAN_ACTION_STATES,
  MATTER_PLAN_OWNER_ROLES as R,
  MATTER_PLAN_STATUSES,
  normalizeMatterPlanOwnerRole,
  validateConveyancerMatterPlan,
} from '../../core/transactions/conveyancerMatterPlanContract.js'
import {
  CONVEYANCER_TEMPLATE_CAPABILITIES,
  CONVEYANCER_TEMPLATE_DOCUMENT_KINDS,
  CONVEYANCER_TEMPLATE_LANES,
  buildConveyancerTemplateGovernanceFingerprint,
  canConveyancerTemplateActor,
  normalizeConveyancerTemplateVersion,
  selectConveyancerTemplateVersion,
} from '../../core/documents/legalTemplateGovernance.js'
import {
  buildConveyancerGovernedContentHash,
  resolveConveyancerCorrespondenceTemplateValues,
} from './conveyancerCorrespondenceGenerator.js'
import {
  CONVEYANCER_CORRESPONDENCE_DATA_VALIDATOR_VERSION,
  evaluateConveyancerGovernedTemplateData,
} from './conveyancerCorrespondenceDataValidation.js'

export const CONVEYANCER_OPERATIONAL_DOCUMENT_GENERATOR_VERSION = 'conveyancer_operational_document_generator_v1'
export const CONVEYANCER_OPERATIONAL_DOCUMENT_ASSET_VERSION = 'conveyancer_operational_document_asset_v1'

export const CONVEYANCER_OPERATIONAL_DOCUMENT_KINDS = Object.freeze([
  CONVEYANCER_TEMPLATE_DOCUMENT_KINDS.instruction,
  CONVEYANCER_TEMPLATE_DOCUMENT_KINDS.application,
  CONVEYANCER_TEMPLATE_DOCUMENT_KINDS.declaration,
  CONVEYANCER_TEMPLATE_DOCUMENT_KINDS.consent,
  CONVEYANCER_TEMPLATE_DOCUMENT_KINDS.resolution,
  CONVEYANCER_TEMPLATE_DOCUMENT_KINDS.certificate,
  CONVEYANCER_TEMPLATE_DOCUMENT_KINDS.checklist,
  CONVEYANCER_TEMPLATE_DOCUMENT_KINDS.annexure,
])

export const CONVEYANCER_OPERATIONAL_DOCUMENT_OUTPUT_FORMATS = Object.freeze({
  docx: 'docx',
  pdf: 'pdf',
  html: 'html',
})

export const CONVEYANCER_OPERATIONAL_SIGNING_FIELD_TYPES = Object.freeze({
  signature: 'signature',
  initial: 'initial',
  signedDate: 'signed_date',
  text: 'text',
})

const DOCUMENT_KINDS = new Set(CONVEYANCER_OPERATIONAL_DOCUMENT_KINDS)
const OUTPUT_FORMATS = new Set(Object.values(CONVEYANCER_OPERATIONAL_DOCUMENT_OUTPUT_FORMATS))
const SIGNING_FIELD_TYPES = new Set(Object.values(CONVEYANCER_OPERATIONAL_SIGNING_FIELD_TYPES))
const SIGNER_ROLES = new Set(['seller', 'buyer', 'conveyancer', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney', 'witness', 'commissioner', 'other'])
const TRANSFER_ROLES = new Set([R.conveyancer, R.transferAttorney, R.secretary, R.firmManager, R.system])
const BOND_ROLES = new Set([R.bondAttorney, R.secretary, R.firmManager, R.system])
const CANCELLATION_ROLES = new Set([R.cancellationAttorney, R.secretary, R.firmManager, R.system])

function text(value = '') {
  return String(value ?? '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[\s./-]+/g, '_').replace(/[^a-z0-9_:]+/g, '').replace(/^_+|_+$/g, '')
}

function validDate(value) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()))
}

function clone(value) {
  return typeof globalThis.structuredClone === 'function'
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value))
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}

function fail(code, errors = [], validation = null) {
  return { ok: false, duplicate: false, code, errors: unique(errors), document: null, validation, event: null }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((result, itemKey) => ({ ...result, [itemKey]: stable(value[itemKey]) }), {})
  return value
}

function laneAuthorised(role, lane) {
  if (lane === CONVEYANCER_TEMPLATE_LANES.transfer) return TRANSFER_ROLES.has(role)
  if (lane === CONVEYANCER_TEMPLATE_LANES.bond) return BOND_ROLES.has(role)
  if (lane === CONVEYANCER_TEMPLATE_LANES.cancellation) return CANCELLATION_ROLES.has(role)
  return canConveyancerTemplateActor(role, CONVEYANCER_TEMPLATE_CAPABILITIES.view)
}

function extractTokens(value = '') {
  return unique([...String(value || '').matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((match) => key(match[1])))
}

function interpolate(value, resolvedValues) {
  return String(value || '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, token) => resolvedValues[key(token)] ?? '').trim()
}

function normalizeSection(input = {}, index = 0) {
  return {
    sectionKey: key(input.sectionKey || input.section_key) || `section_${index + 1}`,
    titleTemplate: String(input.titleTemplate ?? input.title_template ?? ''),
    bodyTemplate: String(input.bodyTemplate ?? input.body_template ?? ''),
    required: input.required !== false,
    pageBreakBefore: input.pageBreakBefore === true || input.page_break_before === true,
    keepTogether: input.keepTogether === true || input.keep_together === true,
  }
}

function normalizeSigningField(input = {}, index = 0) {
  return {
    fieldKey: key(input.fieldKey || input.field_key) || `signing_field_${index + 1}`,
    fieldType: key(input.fieldType || input.field_type || input.type),
    signerRole: key(input.signerRole || input.signer_role),
    sectionKey: key(input.sectionKey || input.section_key),
    variableKey: key(input.variableKey || input.variable_key) || null,
    required: input.required !== false,
    order: Number.isInteger(Number(input.order)) && Number(input.order) > 0 ? Number(input.order) : index + 1,
  }
}

function normalizeAsset(input = {}) {
  return {
    assetVersion: text(input.assetVersion || input.asset_version),
    templateVersionId: text(input.templateVersionId || input.template_version_id),
    outputFormat: key(input.outputFormat || input.output_format),
    titleTemplate: String(input.titleTemplate ?? input.title_template ?? ''),
    fileNameTemplate: String(input.fileNameTemplate ?? input.file_name_template ?? ''),
    sections: (Array.isArray(input.sections) ? input.sections : []).map(normalizeSection),
    signingFields: (Array.isArray(input.signingFields || input.signing_fields) ? input.signingFields || input.signing_fields : []).map(normalizeSigningField),
    contentHash: text(input.contentHash || input.content_hash).toLowerCase(),
  }
}

function assetHashSnapshot(input = {}) {
  const asset = normalizeAsset(input)
  return stable({
    assetVersion: asset.assetVersion,
    outputFormat: asset.outputFormat,
    titleTemplate: asset.titleTemplate,
    fileNameTemplate: asset.fileNameTemplate,
    sections: asset.sections,
    signingFields: asset.signingFields,
  })
}

export function buildConveyancerOperationalDocumentAssetContentHash(asset = {}) {
  return buildConveyancerGovernedContentHash(JSON.stringify(assetHashSnapshot(asset)))
}

export function buildConveyancerOperationalDocumentContentFingerprint({ renderModel = {}, templateVersionId = '' } = {}) {
  return buildConveyancerGovernedContentHash(JSON.stringify(stable({ renderModel: clone(renderModel), templateVersionId: text(templateVersionId) })))
}

export function buildConveyancerOperationalDocumentProvenanceFingerprint({
  contentFingerprint = '',
  planId = '',
  planVersion = 0,
  transactionId = '',
  organisationId = '',
  actionKey = '',
  documentKey = '',
  documentKind = '',
  lane = '',
  template = {},
  variableManifest = [],
  clauseManifest = [],
  dataValidation = {},
} = {}) {
  return buildConveyancerGovernedContentHash(JSON.stringify(stable({
    contentFingerprint: text(contentFingerprint),
    planId: text(planId),
    planVersion: Number(planVersion || 0),
    transactionId: text(transactionId),
    organisationId: text(organisationId),
    actionKey: key(actionKey),
    documentKey: key(documentKey),
    documentKind: key(documentKind),
    lane: key(lane),
    template: clone(template),
    variableManifest: clone(variableManifest),
    clauseManifest: clone(clauseManifest),
    dataValidation: clone(dataValidation),
  })))
}

function validateAsset(input, template) {
  const asset = normalizeAsset(input)
  const errors = []
  if (asset.assetVersion !== CONVEYANCER_OPERATIONAL_DOCUMENT_ASSET_VERSION) errors.push('unsupported_operational_document_asset')
  if (asset.templateVersionId !== template.templateVersionId) errors.push('operational_asset_template_version_mismatch')
  if (!OUTPUT_FORMATS.has(asset.outputFormat)) errors.push('invalid_operational_output_format')
  if (!asset.titleTemplate.trim()) errors.push('operational_document_title_template_required')
  if (!asset.fileNameTemplate.trim()) errors.push('operational_document_file_name_template_required')
  if (!asset.sections.length) errors.push('operational_document_section_required')
  const sectionKeys = asset.sections.map((item) => item.sectionKey)
  unique(sectionKeys.filter((item, index) => sectionKeys.indexOf(item) !== index)).forEach((item) => errors.push(`duplicate_operational_section:${item}`))
  asset.sections.forEach((section) => {
    if (section.required && !section.bodyTemplate.trim()) errors.push(`required_operational_section_body_missing:${section.sectionKey}`)
  })
  const signingFieldKeys = asset.signingFields.map((item) => item.fieldKey)
  unique(signingFieldKeys.filter((item, index) => signingFieldKeys.indexOf(item) !== index)).forEach((item) => errors.push(`duplicate_operational_signing_field:${item}`))
  const variableKeys = new Set(template.variables.map((item) => item.key))
  asset.signingFields.forEach((field) => {
    if (!SIGNING_FIELD_TYPES.has(field.fieldType)) errors.push(`invalid_operational_signing_field_type:${field.fieldKey}`)
    if (!SIGNER_ROLES.has(field.signerRole)) errors.push(`invalid_operational_signer_role:${field.fieldKey}`)
    if (!sectionKeys.includes(field.sectionKey)) errors.push(`operational_signing_field_section_unknown:${field.fieldKey}`)
    if (field.variableKey && !variableKeys.has(field.variableKey)) errors.push(`operational_signing_field_variable_unknown:${field.fieldKey}`)
  })
  const calculatedHash = buildConveyancerOperationalDocumentAssetContentHash(asset)
  if (asset.contentHash !== calculatedHash) errors.push('operational_asset_content_hash_invalid')
  if (asset.contentHash !== template.content.contentHash) errors.push('operational_asset_hash_mismatch')
  const tokens = unique([
    ...extractTokens(asset.titleTemplate),
    ...extractTokens(asset.fileNameTemplate),
    ...asset.sections.flatMap((section) => [...extractTokens(section.titleTemplate), ...extractTokens(section.bodyTemplate)]),
  ]).sort()
  const governedTokens = [...template.content.placeholderKeys].sort()
  tokens.filter((item) => !governedTokens.includes(item)).forEach((item) => errors.push(`undeclared_operational_placeholder:${item}`))
  governedTokens.filter((item) => !tokens.includes(item)).forEach((item) => errors.push(`governed_operational_placeholder_not_used:${item}`))
  return { valid: errors.length === 0, errors: unique(errors), asset }
}

function findAsset(assets, templateVersionId) {
  if (Array.isArray(assets)) return assets.find((item) => text(item.templateVersionId || item.template_version_id) === templateVersionId) || null
  if (assets && typeof assets === 'object') return assets[templateVersionId] || null
  return null
}

function safeFileName(value, outputFormat) {
  const printable = [...text(value)].map((character) => character.charCodeAt(0) < 32 ? '-' : character).join('')
  const cleaned = printable.replace(/[\\/:*?"<>|]/g, '-').replace(/\.\.+/g, '.').replace(/\s+/g, ' ').slice(0, 120).trim()
  if (!cleaned || cleaned === '.') return ''
  return cleaned.toLowerCase().endsWith(`.${outputFormat}`) ? cleaned : `${cleaned}.${outputFormat}`
}

export function generateConveyancerOperationalDocument({
  plan = {},
  templates = [],
  assets = [],
  documentKey = '',
  documentKind = '',
  actionKey = '',
  lane = CONVEYANCER_TEMPLATE_LANES.transfer,
  actor = {},
  data = {},
  organisationSettings = {},
  signingPreset = {},
  manualValues = {},
  calculatedValues = {},
  clauses = [],
  sourceEvidence = {},
  sourceConflicts = [],
  generatedAt = '',
  commandId = '',
  expectedPlanId = '',
  expectedPlanVersion = null,
  existingDocuments = [],
} = {}) {
  const planValidation = validateConveyancerMatterPlan(plan)
  if (!planValidation.valid) return fail('matter_plan_invalid', planValidation.errors)
  const currentPlan = planValidation.plan
  if (currentPlan.status !== MATTER_PLAN_STATUSES.active) return fail('active_matter_plan_required')
  const actorRole = normalizeMatterPlanOwnerRole(actor.role)
  const actorUserId = text(actor.userId || actor.user_id)
  if (!actorUserId) return fail('operational_document_actor_user_required')
  if (!canConveyancerTemplateActor(actorRole, CONVEYANCER_TEMPLATE_CAPABILITIES.view)) return fail('operational_document_generation_not_authorised')
  const requestedLane = key(lane)
  if (!laneAuthorised(actorRole, requestedLane)) return fail('operational_document_lane_not_authorised')
  const requestedKey = key(documentKey)
  if (!requestedKey) return fail('operational_document_key_required')
  const requestedKind = key(documentKind)
  if (!DOCUMENT_KINDS.has(requestedKind)) return fail('unsupported_operational_document_kind')
  const requestedActionKey = key(actionKey)
  if (!requestedActionKey) return fail('operational_document_action_key_required')
  const matterAction = currentPlan.actions.find((item) => item.key === requestedActionKey)
  if (!matterAction) return fail('operational_document_action_unknown')
  if ([MATTER_PLAN_ACTION_STATES.completed, MATTER_PLAN_ACTION_STATES.cancelled].includes(matterAction.state)) return fail('operational_document_action_terminal')
  const resolvedCommandId = text(commandId)
  if (!resolvedCommandId) return fail('command_id_required')
  if (!text(expectedPlanId)) return fail('expected_plan_id_required')
  if (text(expectedPlanId) !== currentPlan.planId) return fail('stale_plan_id')
  if (!Number.isInteger(Number(expectedPlanVersion))) return fail('expected_plan_version_required')
  if (Number(expectedPlanVersion) !== Number(currentPlan.version)) return fail('stale_plan_version')
  const duplicate = (Array.isArray(existingDocuments) ? existingDocuments : []).find((item) => text(item.commandId || item.command_id) === resolvedCommandId && text(item.planId || item.plan_id) === currentPlan.planId)
  if (duplicate) {
    const existing = duplicate.document || duplicate
    if (existing.documentKey !== requestedKey || existing.documentKind !== requestedKind || existing.actionKey !== requestedActionKey) return fail('command_id_operational_document_conflict')
    return { ok: true, duplicate: true, code: 'idempotent_replay', errors: [], document: clone(existing), validation: clone(duplicate.validation || existing.dataValidation || null), event: clone(duplicate.event || null) }
  }
  if (!validDate(generatedAt)) return fail('generated_at_required')
  const resolvedGeneratedAt = new Date(generatedAt).toISOString()

  const eligibleTemplates = (Array.isArray(templates) ? templates : []).filter((item) => {
    const normalized = normalizeConveyancerTemplateVersion(item)
    return normalized.templateKey === requestedKey && normalized.documentKind === requestedKind && normalized.packetType !== 'correspondence' && normalized.lane === requestedLane
  })
  const selection = selectConveyancerTemplateVersion({
    templates: eligibleTemplates,
    matterFacts: { ...currentPlan.factsSnapshot, legal_lane: requestedLane },
    organisationId: currentPlan.organisationId,
    asOf: resolvedGeneratedAt,
  })
  if (selection.conflict) return fail('operational_document_template_selection_conflict', selection.candidates.slice(0, 2).map((item) => item.template.templateVersionId))
  if (!selection.selected) return fail('no_selectable_operational_document_template', selection.evaluations.flatMap((item) => item.reasons))
  const template = selection.selected
  const inputAsset = findAsset(assets, template.templateVersionId)
  if (!inputAsset) return fail('operational_document_asset_missing')
  const assetValidation = validateAsset(inputAsset, template)
  if (!assetValidation.valid) return fail('operational_document_asset_invalid', assetValidation.errors)
  const asset = assetValidation.asset

  const sourceContext = {
    ...clone(data),
    matter: clone(currentPlan.factsSnapshot),
    plan: { planId: currentPlan.planId, version: currentPlan.version, transactionId: currentPlan.transactionId, organisationId: currentPlan.organisationId },
    organisation: clone(organisationSettings),
    signing: clone(signingPreset),
    generated: { date: resolvedGeneratedAt.slice(0, 10), dateTime: resolvedGeneratedAt },
    template: { versionTag: template.versionTag, versionNumber: template.versionNumber },
  }
  const resolution = resolveConveyancerCorrespondenceTemplateValues({ template, sourceContext, manualValues, calculatedValues, clauses })
  if (!resolution.valid) return fail('operational_document_values_incomplete', resolution.errors)
  const governedData = evaluateConveyancerGovernedTemplateData({ template, resolution, sourceEvidence, sourceConflicts, validatedAt: resolvedGeneratedAt })
  const failedDataCodes = unique(governedData.checks.filter((item) => item.status === 'failed').map((item) => item.code))
  if (governedData.outcome === 'blocked') return fail('operational_document_data_blocked', failedDataCodes, governedData)

  const title = interpolate(asset.titleTemplate, resolution.resolved)
  const fileName = safeFileName(interpolate(asset.fileNameTemplate, resolution.resolved), asset.outputFormat)
  const sections = asset.sections.map((section, index) => ({
    sectionKey: section.sectionKey,
    order: index + 1,
    title: interpolate(section.titleTemplate, resolution.resolved) || null,
    body: interpolate(section.bodyTemplate, resolution.resolved),
    required: section.required,
    pageBreakBefore: section.pageBreakBefore,
    keepTogether: section.keepTogether,
  }))
  if (!title) return fail('generated_operational_document_title_empty')
  if (!fileName) return fail('generated_operational_document_file_name_invalid')
  const emptyRequired = sections.filter((item) => item.required && !item.body).map((item) => item.sectionKey)
  if (emptyRequired.length) return fail('generated_operational_document_section_empty', emptyRequired)
  const unresolved = unique([title, fileName, ...sections.flatMap((item) => [item.title, item.body])].flatMap(extractTokens))
  if (unresolved.length) return fail('unresolved_operational_document_placeholder', unresolved)

  const signingFields = asset.signingFields.sort((left, right) => left.order - right.order || left.fieldKey.localeCompare(right.fieldKey))
  const renderModel = deepFreeze({
    schemaVersion: CONVEYANCER_OPERATIONAL_DOCUMENT_ASSET_VERSION,
    outputFormat: asset.outputFormat,
    fileName,
    title,
    sections,
    signingFields,
  })
  const contentFingerprint = buildConveyancerOperationalDocumentContentFingerprint({ renderModel, templateVersionId: template.templateVersionId })
  const documentId = `operational_document:${currentPlan.planId}:${requestedKey}:${buildConveyancerGovernedContentHash(resolvedCommandId).slice(0, 12)}`
  const dataValidation = deepFreeze({
    version: CONVEYANCER_CORRESPONDENCE_DATA_VALIDATOR_VERSION,
    outcome: governedData.outcome,
    readyForAssembly: true,
    blockingCount: governedData.blockingCount,
    warningCount: governedData.warningCount,
    failedCodes: failedDataCodes,
    checks: governedData.checks,
  })
  const templateProvenance = {
    templateId: template.templateId,
    templateVersionId: template.templateVersionId,
    templateKey: template.templateKey,
    versionNumber: template.versionNumber,
    versionTag: template.versionTag,
    contentHash: template.content.contentHash,
    governanceFingerprint: buildConveyancerTemplateGovernanceFingerprint(template),
    selectionReason: selection.selectionReason,
  }
  const provenanceFingerprint = buildConveyancerOperationalDocumentProvenanceFingerprint({
    contentFingerprint,
    planId: currentPlan.planId,
    planVersion: currentPlan.version,
    transactionId: currentPlan.transactionId,
    organisationId: currentPlan.organisationId,
    actionKey: requestedActionKey,
    documentKey: requestedKey,
    documentKind: requestedKind,
    lane: requestedLane,
    template: templateProvenance,
    variableManifest: resolution.manifest,
    clauseManifest: resolution.clauseManifest,
    dataValidation,
  })
  const document = deepFreeze({
    version: CONVEYANCER_OPERATIONAL_DOCUMENT_GENERATOR_VERSION,
    documentId,
    commandId: resolvedCommandId,
    status: 'draft',
    renderReady: true,
    persistAllowed: false,
    signingAllowed: false,
    dispatchAllowed: false,
    reviewRequired: true,
    planId: currentPlan.planId,
    planVersion: currentPlan.version,
    transactionId: currentPlan.transactionId,
    organisationId: currentPlan.organisationId,
    documentKey: requestedKey,
    documentKind: requestedKind,
    actionKey: requestedActionKey,
    lane: requestedLane,
    template: templateProvenance,
    renderModel,
    variableManifest: resolution.manifest,
    clauseManifest: resolution.clauseManifest,
    dataValidation,
    contentFingerprint,
    provenanceFingerprint,
    generatedAt: resolvedGeneratedAt,
    generatedBy: { role: actorRole, userId: actorUserId },
  })
  const event = deepFreeze({
    version: CONVEYANCER_OPERATIONAL_DOCUMENT_GENERATOR_VERSION,
    eventId: `operational_document_generation:${documentId}`,
    eventType: 'operational_document_generated',
    commandId: resolvedCommandId,
    documentId,
    planId: currentPlan.planId,
    planVersion: currentPlan.version,
    transactionId: currentPlan.transactionId,
    organisationId: currentPlan.organisationId,
    documentKey: requestedKey,
    documentKind: requestedKind,
    actionKey: requestedActionKey,
    lane: requestedLane,
    templateVersionId: template.templateVersionId,
    templateContentHash: template.content.contentHash,
    contentFingerprint,
    provenanceFingerprint,
    outputFormat: asset.outputFormat,
    sectionCount: sections.length,
    signingFieldCount: signingFields.length,
    dataValidationOutcome: dataValidation.outcome,
    dataWarningCount: dataValidation.warningCount,
    sensitiveVariableKeys: resolution.manifest.filter((item) => item.sensitive).map((item) => item.key),
    occurredAt: resolvedGeneratedAt,
    actor: document.generatedBy,
    persistencePerformed: false,
    renderingPerformed: false,
    signingPerformed: false,
    dispatchPerformed: false,
  })
  return { ok: true, duplicate: false, code: 'operational_document_generated', errors: [], document, validation: dataValidation, event }
}
