import { CANCELLATION_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION } from './cancellationAttorneyModulePhase0.js'
import {
  CANCELLATION_PACK_DRAFT_WATERMARK,
  buildCancellationPackWorkspace,
  buildCancellationPackWorkspaceAuditEvent,
  prepareCancellationPackDraftVersion,
  validateCancellationPackWorkspace,
} from './cancellationAttorneyModulePhase3.js'

export const CANCELLATION_ATTORNEY_PHASE4_VERSION = 'cancellation_attorney_module_phase4_operational_generator_v1'
export const CANCELLATION_ATTORNEY_PHASE4_RELEASE_BLOCKER_ID = 'cancellation_operational_generator_missing'

export const CANCELLATION_OPERATIONAL_DOCUMENT_STATUS = Object.freeze({
  draftGenerated: 'draft_prepared',
  attorneyReview: 'attorney_review',
})

export const CANCELLATION_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY = Object.freeze({
  permittedStrategies: Object.freeze(['generate_now']),
  blockedStrategies: Object.freeze(['template_controlled', 'ingest_only']),
  generatedDocumentKind: 'operational_draft',
  watermark: CANCELLATION_PACK_DRAFT_WATERMARK,
  reviewRequired: true,
  finalAllowed: false,
  signingAllowed: false,
  dispatchAllowed: false,
  lenderSubmissionAllowed: false,
  bankPortalSubmissionAllowed: false,
  deedsSubmissionAllowed: false,
  settlementExecutionAllowed: false,
  registrationMarkingAllowed: false,
})

const OPERATIONAL_ROLE_SET = new Set(['cancellation_attorney', 'conveyancer', 'secretary', 'firm_manager', 'system'])
const APPROVED_TEMPLATE_STATUSES = new Set(['approved', 'published'])
const GENERATED_DOCUMENTS = CANCELLATION_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION.filter((item) => item.strategy === 'generate_now')
const GENERATED_DOCUMENT_KEYS = new Set(GENERATED_DOCUMENTS.map((item) => item.id))
const GENERATED_DOCUMENT_BY_KEY = GENERATED_DOCUMENTS.reduce((result, item) => ({ ...result, [item.id]: item }), {})

const TEMPLATE_BLUEPRINTS = Object.freeze({
  cancellation_instruction_acknowledgement: Object.freeze({
    titleTemplate: 'Cancellation instruction acknowledgement - {{lender_instruction_reference}}',
    fileNameTemplate: 'cancellation-instruction-acknowledgement-{{lender_instruction_reference}}',
    sections: Object.freeze([
      Object.freeze({ key: 'opening', titleTemplate: 'Instruction received', bodyTemplate: '{{firm_name}} acknowledges receipt of the cancellation instruction from {{cancellation_bank}} under reference {{lender_instruction_reference}}.' }),
      Object.freeze({ key: 'source_boundary', titleTemplate: 'Source evidence boundary', bodyTemplate: 'This acknowledgement records the verified instruction receipt date of {{cancellation_instruction_received_at}} and does not originate a lender instruction or bank outcome.' }),
    ]),
  }),
  seller_existing_bond_information_request: Object.freeze({
    titleTemplate: 'Seller existing-bond information request',
    fileNameTemplate: 'seller-existing-bond-information-request-{{cancellation_bond_account_number}}',
    sections: Object.freeze([
      Object.freeze({ key: 'request', titleTemplate: 'Information required', bodyTemplate: 'Please confirm the existing bond details for {{cancellation_bank}}, account/reference {{cancellation_bond_account_number}}, and provide any available bond statement or notice evidence.' }),
      Object.freeze({ key: 'why_needed', titleTemplate: 'Why this is needed', bodyTemplate: 'The cancellation team requires verified existing-bond facts before requesting or reconciling cancellation figures.' }),
    ]),
  }),
  cancellation_figures_request_cover: Object.freeze({
    titleTemplate: 'Cancellation figures request - {{cancellation_bond_account_number}}',
    fileNameTemplate: 'cancellation-figures-request-{{cancellation_bond_account_number}}',
    sections: Object.freeze([
      Object.freeze({ key: 'request', titleTemplate: 'Figures request', bodyTemplate: 'Please issue cancellation figures for {{cancellation_bank}} account {{cancellation_bond_account_number}} under instruction {{lender_instruction_reference}}.' }),
      Object.freeze({ key: 'return_requirements', titleTemplate: 'Return requirements', bodyTemplate: 'Please include the settlement amount, expiry date, daily interest and any notice or penalty exposure. This request does not accept or alter lender figures automatically.' }),
    ]),
  }),
  notice_penalty_risk_summary: Object.freeze({
    titleTemplate: '90-day notice and penalty-risk summary',
    fileNameTemplate: 'notice-penalty-risk-summary-{{cancellation_bond_account_number}}',
    sections: Object.freeze([
      Object.freeze({ key: 'notice', titleTemplate: 'Notice position', bodyTemplate: 'Verified notice status: {{notice_period_status}}. Notice date: {{notice_date}}.' }),
      Object.freeze({ key: 'risk', titleTemplate: 'Penalty risk', bodyTemplate: 'Penalty or notice risk currently recorded as: {{penalty_notice_risk}}. This is an operational summary and does not determine the lender outcome.' }),
    ]),
  }),
  cancellation_guarantee_request_cover: Object.freeze({
    titleTemplate: 'Cancellation guarantee request cover',
    fileNameTemplate: 'cancellation-guarantee-request-{{guarantee_reference}}',
    sections: Object.freeze([
      Object.freeze({ key: 'guarantee_required', titleTemplate: 'Guarantee required', bodyTemplate: 'Required guarantee amount: {{guarantee_required_amount}}. Figures expiry date: {{cancellation_figures_expiry_date}}.' }),
      Object.freeze({ key: 'wording', titleTemplate: 'Beneficiary and wording', bodyTemplate: 'Guarantee beneficiary and wording requirements: {{guarantee_beneficiary_and_wording}}.' }),
      Object.freeze({ key: 'handoff', titleTemplate: 'Linked handoff', bodyTemplate: 'The transfer or bond team must provide evidence of the issued guarantee. Bridge does not synthesize or accept guarantee wording automatically.' }),
    ]),
  }),
  guarantee_acceptance_or_variance_note: Object.freeze({
    titleTemplate: 'Guarantee acceptance or variance note - {{guarantee_reference}}',
    fileNameTemplate: 'guarantee-acceptance-variance-note-{{guarantee_reference}}',
    sections: Object.freeze([
      Object.freeze({ key: 'guarantee_state', titleTemplate: 'Guarantee state', bodyTemplate: 'Guarantee reference {{guarantee_reference}} is currently recorded as {{guarantee_acceptance_status}}.' }),
      Object.freeze({ key: 'comparison', titleTemplate: 'Operational comparison', bodyTemplate: 'Compare the received guarantee against required amount {{guarantee_required_amount}} and wording requirements before marking acceptance.' }),
    ]),
  }),
  cancellation_lodgement_readiness_checklist: Object.freeze({
    titleTemplate: 'Cancellation lodgement readiness checklist',
    fileNameTemplate: 'cancellation-lodgement-readiness-{{lender_instruction_reference}}',
    sections: Object.freeze([
      Object.freeze({ key: 'figures', titleTemplate: 'Figures readiness', bodyTemplate: 'Cancellation figures expiry date: {{cancellation_figures_expiry_date}}.' }),
      Object.freeze({ key: 'guarantee', titleTemplate: 'Guarantee readiness', bodyTemplate: 'Guarantee acceptance status: {{guarantee_acceptance_status}}.' }),
      Object.freeze({ key: 'signing', titleTemplate: 'Signing readiness', bodyTemplate: 'Signed cancellation document status: {{signed_cancellation_document_status}}.' }),
      Object.freeze({ key: 'boundary', titleTemplate: 'Lodgement boundary', bodyTemplate: 'This checklist records readiness only. It does not lodge, register or create Deeds Office evidence.' }),
    ]),
  }),
  cancellation_registration_notification: Object.freeze({
    titleTemplate: 'Cancellation registration notification',
    fileNameTemplate: 'cancellation-registration-notification-{{cancellation_registration_reference}}',
    sections: Object.freeze([
      Object.freeze({ key: 'registration', titleTemplate: 'Registration evidence captured', bodyTemplate: 'Cancellation registration reference {{cancellation_registration_reference}} is recorded with date {{cancellation_registration_date}}.' }),
      Object.freeze({ key: 'evidence_boundary', titleTemplate: 'Evidence boundary', bodyTemplate: 'This notification records verified registration evidence and does not replace lender, registry or Deeds Office proof.' }),
    ]),
  }),
  settlement_closeout_report: Object.freeze({
    titleTemplate: 'Settlement and close-out report',
    fileNameTemplate: 'settlement-closeout-report-{{settlement_payment_reference}}',
    sections: Object.freeze([
      Object.freeze({ key: 'settlement', titleTemplate: 'Settlement proof', bodyTemplate: 'Settlement amount {{settlement_amount}} has payment reference {{settlement_payment_reference}}.' }),
      Object.freeze({ key: 'closeout', titleTemplate: 'Close-out status', bodyTemplate: 'Cancellation close-out status: {{closeout_status}}.' }),
      Object.freeze({ key: 'boundary', titleTemplate: 'Settlement boundary', bodyTemplate: 'This report records evidence and unresolved notes only. It does not execute payment or reconcile bank accounts automatically.' }),
    ]),
  }),
})

function text(value = '') {
  return String(value ?? '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[\s./-]+/g, '_').replace(/[^a-z0-9_:]+/g, '').replace(/^_+|_+$/g, '')
}

function validDate(value) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()))
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, itemKey) => {
      result[itemKey] = stable(value[itemKey])
      return result
    }, {})
  }
  return value
}

function hash(value) {
  const source = typeof value === 'string' ? value : JSON.stringify(stable(value))
  let result = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    result ^= source.charCodeAt(index)
    result = Math.imul(result, 0x01000193)
  }
  return `fnv1a_${(result >>> 0).toString(16).padStart(8, '0')}`
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function stringifyFact(value) {
  if (Array.isArray(value)) return value.map(stringifyFact).join('; ')
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([itemKey, itemValue]) => `${itemKey}: ${stringifyFact(itemValue)}`)
      .join(', ')
  }
  return text(value)
}

function safeFileName(value = '') {
  const cleaned = text(value)
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 140)
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return cleaned || 'cancellation-operational-draft'
}

function interpolate(template = '', values = {}) {
  return String(template || '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, token) => {
    const tokenKey = key(token)
    return values[tokenKey] ?? ''
  }).trim()
}

function actorSummary(actor = {}) {
  return Object.freeze({
    role: key(actor.role || actor.actorRole || actor.actor_role) || 'system',
    userId: text(actor.userId || actor.user_id) || null,
  })
}

function actorAuthorised(actor = {}) {
  return OPERATIONAL_ROLE_SET.has(actorSummary(actor).role)
}

function defaultTemplateFor(documentKey) {
  const normalized = key(documentKey)
  const blueprint = TEMPLATE_BLUEPRINTS[normalized]
  const document = GENERATED_DOCUMENT_BY_KEY[normalized]
  if (!blueprint || !document) return null
  return {
    documentKey: normalized,
    label: document.label,
    templateVersionId: `cancellation-operational-${normalized}-v1`,
    status: 'draft',
    locked: false,
    approvedAt: null,
    approvedBy: null,
    outputFormat: 'html',
    ...blueprint,
  }
}

function normalizeTemplate(input = {}, documentKey = '') {
  const normalizedKey = key(input.documentKey || input.document_key || documentKey)
  const base = defaultTemplateFor(normalizedKey) || {}
  return {
    ...base,
    ...input,
    documentKey: normalizedKey,
    templateVersionId: text(input.templateVersionId || input.template_version_id || base.templateVersionId),
    templateFingerprint: text(input.templateFingerprint || input.template_fingerprint),
    status: key(input.status || base.status),
    locked: input.locked === true || input.wordingLocked === true || input.wording_locked === true || base.locked === true,
    approvedAt: input.approvedAt || input.approved_at || base.approvedAt || null,
    approvedBy: input.approvedBy || input.approved_by || base.approvedBy || null,
    outputFormat: key(input.outputFormat || input.output_format || base.outputFormat || 'html'),
    titleTemplate: String(input.titleTemplate ?? input.title_template ?? base.titleTemplate ?? ''),
    fileNameTemplate: String(input.fileNameTemplate ?? input.file_name_template ?? base.fileNameTemplate ?? ''),
    sections: Object.freeze((Array.isArray(input.sections) ? input.sections : base.sections || []).map((section, index) => Object.freeze({
      key: key(section.key || section.sectionKey || section.section_key) || `section_${index + 1}`,
      titleTemplate: String(section.titleTemplate ?? section.title_template ?? ''),
      bodyTemplate: String(section.bodyTemplate ?? section.body_template ?? ''),
    }))),
  }
}

export function listCancellationOperationalDocumentKeys() {
  return Object.freeze([...GENERATED_DOCUMENT_KEYS])
}

export function buildCancellationOperationalTemplateFingerprint(template = {}) {
  const normalized = normalizeTemplate(template, template.documentKey)
  return hash({
    documentKey: normalized.documentKey,
    templateVersionId: normalized.templateVersionId,
    outputFormat: normalized.outputFormat,
    titleTemplate: normalized.titleTemplate,
    fileNameTemplate: normalized.fileNameTemplate,
    sections: normalized.sections,
  })
}

export function buildApprovedCancellationOperationalTemplate(documentKey, {
  approvedAt = '2026-07-15T08:00:00.000Z',
  approvedBy = { role: 'firm_manager', userId: 'firm-manager-1' },
  firmId = 'pilot-firm',
  status = 'approved',
  locked = true,
  overrides = {},
} = {}) {
  const template = normalizeTemplate({
    ...overrides,
    documentKey,
    status,
    locked,
    approvedAt,
    approvedBy,
    firmId,
  }, documentKey)
  return Object.freeze({
    ...template,
    templateFingerprint: buildCancellationOperationalTemplateFingerprint(template),
  })
}

export function validateCancellationOperationalTemplate(template = {}, documentKey = '') {
  const normalized = normalizeTemplate(template, documentKey)
  const errors = []
  if (!GENERATED_DOCUMENT_KEYS.has(normalized.documentKey)) errors.push('unsupported_operational_document')
  if (documentKey && normalized.documentKey !== key(documentKey)) errors.push('template_document_key_mismatch')
  if (!text(normalized.templateVersionId)) errors.push('template_version_required')
  if (!APPROVED_TEMPLATE_STATUSES.has(normalized.status)) errors.push('template_not_approved')
  if (normalized.locked !== true) errors.push('template_wording_not_locked')
  if (!validDate(normalized.approvedAt)) errors.push('template_approval_date_required')
  const approver = actorSummary(normalized.approvedBy || {})
  if (!approver.userId || !OPERATIONAL_ROLE_SET.has(approver.role)) errors.push('template_approver_required')
  if (!normalized.sections.length) errors.push('template_sections_required')
  normalized.sections.forEach((section) => {
    if (!section.titleTemplate.trim()) errors.push(`template_section_title_required:${section.key}`)
    if (!section.bodyTemplate.trim()) errors.push(`template_section_body_required:${section.key}`)
  })
  const fingerprint = buildCancellationOperationalTemplateFingerprint(normalized)
  if (normalized.templateFingerprint && normalized.templateFingerprint !== fingerprint) errors.push('template_fingerprint_mismatch')
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(unique(errors)), template: Object.freeze({ ...normalized, templateFingerprint: fingerprint }) })
}

function buildTemplateValues({ workspace, document, generatedAt, firmBranding = {} }) {
  const facts = workspace.canonicalData?.factsByKey || {}
  const factValues = Object.entries(facts).reduce((result, [factKey, fact]) => {
    result[factKey] = stringifyFact(fact.value)
    return result
  }, {})
  return {
    ...factValues,
    firm_name: text(firmBranding.firmName || firmBranding.name || firmBranding.legalName) || 'Cancellation attorney firm',
    firm_email: text(firmBranding.email || firmBranding.firmEmail),
    firm_phone: text(firmBranding.phone || firmBranding.firmPhone),
    document_label: document.label,
    generated_date: validDate(generatedAt) ? new Date(generatedAt).toISOString().slice(0, 10) : '',
  }
}

function buildRenderModel({ workspace, document, template, generatedAt, firmBranding }) {
  const values = buildTemplateValues({ workspace, document, generatedAt, firmBranding })
  const title = interpolate(template.titleTemplate, values) || document.label
  const fileName = `${safeFileName(interpolate(template.fileNameTemplate, values) || title)}.${template.outputFormat || 'html'}`
  return Object.freeze({
    renderModelVersion: CANCELLATION_ATTORNEY_PHASE4_VERSION,
    documentKey: document.id,
    documentLabel: document.label,
    outputFormat: template.outputFormat,
    title,
    fileName,
    watermark: CANCELLATION_PACK_DRAFT_WATERMARK,
    header: Object.freeze({
      firmName: values.firm_name,
      firmEmail: values.firm_email,
      firmPhone: values.firm_phone,
      logoUrl: text(firmBranding.logoUrl || firmBranding.logo_url),
      primaryColour: text(firmBranding.primaryColour || firmBranding.primary_colour),
    }),
    sections: Object.freeze(template.sections.map((section) => Object.freeze({
      key: section.key,
      title: interpolate(section.titleTemplate, values),
      body: interpolate(section.bodyTemplate, values),
    }))),
    factsUsed: Object.freeze(document.requiredFactKeys || []),
    generatedAt,
  })
}

function buildOperationalContentHash(renderModel, template) {
  return hash({ renderModel, templateVersionId: template.templateVersionId, templateFingerprint: template.templateFingerprint })
}

function fail(code, errors = []) {
  return Object.freeze({ ok: false, code, errors: Object.freeze(unique(errors)), document: null, version: null, auditEvent: null })
}

function buildArtifactLink({ workspace, documentId, documentKey, version, contentHash }) {
  return Object.freeze({
    workspaceId: workspace.workspaceId,
    transactionId: workspace.transactionId,
    laneKey: 'cancellation',
    documentId,
    documentKey,
    versionId: version.versionId,
    versionNumber: version.versionNumber,
    contentHash,
    dataFingerprint: version.dataFingerprint,
  })
}

function redactAuditEvent({ workspace, document, version, commandId, actor, generatedAt }) {
  const base = buildCancellationPackWorkspaceAuditEvent({
    workspace,
    eventType: 'cancellation_operational_document_generated',
    actor,
    version,
    commandId,
    occurredAt: generatedAt,
  })
  return Object.freeze({
    ...base,
    generatorVersion: CANCELLATION_ATTORNEY_PHASE4_VERSION,
    documentKey: document.documentKey,
    documentId: document.documentId,
    artifactLink: document.artifactLink,
  })
}

export function generateCancellationOperationalDocument({
  workspace = null,
  documentKey = '',
  template = {},
  actor = {},
  commandId = '',
  generatedAt = new Date().toISOString(),
  firmBranding = {},
} = {}) {
  const normalizedKey = key(documentKey)
  const document = GENERATED_DOCUMENT_BY_KEY[normalizedKey]
  if (!document) return fail('unsupported_cancellation_operational_document', [normalizedKey ? `unsupported_document:${normalizedKey}` : 'document_key_required'])
  if (!actorAuthorised(actor)) return fail('cancellation_operational_actor_not_authorised', ['actor_not_authorised'])
  const effectiveWorkspace = workspace || buildCancellationPackWorkspace({ generatedAt })
  const workspaceValidation = validateCancellationPackWorkspace(effectiveWorkspace)
  if (!workspaceValidation.valid) return fail('cancellation_workspace_invalid', workspaceValidation.errors)
  if (effectiveWorkspace.canonicalData?.readyForCancellationPack !== true) return fail('canonical_cancellation_data_not_ready', ['canonical_data_not_ready'])
  const packItem = (effectiveWorkspace.packItems || []).find((item) => item.id === normalizedKey)
  if (!packItem) return fail('cancellation_pack_item_missing', ['pack_item_missing'])
  if (packItem.strategy !== 'generate_now') return fail('cancellation_pack_item_not_operational', [`blocked_strategy:${packItem.strategy}`])
  if (packItem.generationState !== 'ready_for_phase4_generator') return fail('cancellation_pack_item_not_ready', [packItem.generationState])

  const templateValidation = validateCancellationOperationalTemplate(template, normalizedKey)
  if (!templateValidation.valid) return fail('cancellation_operational_template_invalid', templateValidation.errors)

  const renderModel = buildRenderModel({ workspace: effectiveWorkspace, document: packItem, template: templateValidation.template, generatedAt, firmBranding })
  const contentHash = buildOperationalContentHash(renderModel, templateValidation.template)
  const draft = prepareCancellationPackDraftVersion({
    workspace: effectiveWorkspace,
    templateVersionId: templateValidation.template.templateVersionId,
    templateFingerprint: templateValidation.template.templateFingerprint,
    contentHash,
    commandId,
    actor,
    generatedAt,
  })
  if (!draft.ok) return fail('cancellation_operational_draft_version_blocked', draft.errors)

  const documentId = hash({ workspaceId: effectiveWorkspace.workspaceId, documentKey: normalizedKey, versionId: draft.version.versionId })
  const artifactLink = buildArtifactLink({ workspace: effectiveWorkspace, documentId, documentKey: normalizedKey, version: draft.version, contentHash })
  const output = Object.freeze({
    documentId,
    documentKey: normalizedKey,
    label: packItem.label,
    generatorVersion: CANCELLATION_ATTORNEY_PHASE4_VERSION,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE4_RELEASE_BLOCKER_ID,
    documentKind: CANCELLATION_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.generatedDocumentKind,
    status: CANCELLATION_OPERATIONAL_DOCUMENT_STATUS.draftGenerated,
    renderReady: true,
    reviewRequired: true,
    finalAllowed: false,
    signingAllowed: false,
    dispatchAllowed: false,
    lenderSubmissionAllowed: false,
    bankPortalSubmissionAllowed: false,
    deedsSubmissionAllowed: false,
    settlementExecutionAllowed: false,
    registrationMarkingAllowed: false,
    watermark: CANCELLATION_PACK_DRAFT_WATERMARK,
    generatedAt,
    generatedBy: actorSummary(actor),
    template: Object.freeze({
      templateVersionId: templateValidation.template.templateVersionId,
      templateFingerprint: templateValidation.template.templateFingerprint,
      approvedAt: templateValidation.template.approvedAt,
      approvedBy: actorSummary(templateValidation.template.approvedBy || {}),
      locked: templateValidation.template.locked,
    }),
    contentHash,
    dataFingerprint: draft.version.dataFingerprint,
    factFingerprints: draft.version.factFingerprints,
    renderModel,
    artifactLink,
    version: draft.version,
  })

  return Object.freeze({
    ok: true,
    code: 'cancellation_operational_document_generated',
    errors: Object.freeze([]),
    document: output,
    version: draft.version,
    auditEvent: redactAuditEvent({ workspace: effectiveWorkspace, document: output, version: draft.version, commandId, actor, generatedAt }),
  })
}

export function generateCancellationOperationalDocumentPack({
  workspace = null,
  templates = {},
  actor = {},
  commandIdPrefix = 'cancellation-operational-pack',
  generatedAt = new Date().toISOString(),
  firmBranding = {},
} = {}) {
  const effectiveWorkspace = workspace || buildCancellationPackWorkspace({ generatedAt })
  const results = GENERATED_DOCUMENTS.map((document, index) => {
    const template = Array.isArray(templates)
      ? templates.find((item) => key(item.documentKey || item.document_key) === document.id)
      : templates[document.id]
    return generateCancellationOperationalDocument({
      workspace: effectiveWorkspace,
      documentKey: document.id,
      template,
      actor,
      commandId: `${commandIdPrefix}-${index + 1}-${document.id}`,
      generatedAt,
      firmBranding,
    })
  })
  return Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE4_VERSION,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE4_RELEASE_BLOCKER_ID,
    workspaceId: effectiveWorkspace.workspaceId,
    generatedAt,
    documentCount: results.length,
    generatedCount: results.filter((result) => result.ok).length,
    failedCount: results.filter((result) => !result.ok).length,
    results: Object.freeze(results),
  })
}

export function buildCancellationAttorneyPhase4BaselineReport(input = {}) {
  const workspace = input.workspace || buildCancellationPackWorkspace(input)
  const templates = GENERATED_DOCUMENTS.reduce((result, document) => ({
    ...result,
    [document.id]: buildApprovedCancellationOperationalTemplate(document.id),
  }), {})
  const pack = generateCancellationOperationalDocumentPack({
    workspace,
    templates,
    actor: input.actor || { role: 'cancellation_attorney', userId: 'phase4-cancellation-attorney' },
    commandIdPrefix: 'phase4-baseline',
    generatedAt: input.generatedAt || new Date().toISOString(),
    firmBranding: input.firmBranding || { firmName: 'Pilot Cancellation Attorneys' },
  })
  const blockedNonOperational = CANCELLATION_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION
    .filter((item) => item.strategy !== 'generate_now')
    .map((item) => item.id)
  return Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE4_VERSION,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE4_RELEASE_BLOCKER_ID,
    operationalDocumentCount: GENERATED_DOCUMENTS.length,
    generatedCount: pack.generatedCount,
    failedCount: pack.failedCount,
    blockedNonOperational: Object.freeze(blockedNonOperational),
    boundary: CANCELLATION_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY,
    readyForPhase5: GENERATED_DOCUMENTS.length === 9 &&
      pack.generatedCount === 9 &&
      pack.failedCount === 0 &&
      blockedNonOperational.length === 10 &&
      CANCELLATION_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.finalAllowed === false &&
      CANCELLATION_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.settlementExecutionAllowed === false &&
      CANCELLATION_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.registrationMarkingAllowed === false,
  })
}
