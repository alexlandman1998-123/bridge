import { BOND_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION } from './bondAttorneyModulePhase0.js'
import {
  BOND_PACK_DRAFT_WATERMARK,
  BOND_PACK_WORKSPACE_STATUSES,
  buildBondPackWorkspace,
  buildBondPackWorkspaceAuditEvent,
  prepareBondPackDraftVersion,
  validateBondPackWorkspace,
} from './bondAttorneyModulePhase3.js'

export const BOND_ATTORNEY_PHASE4_VERSION = 'bond_attorney_module_phase4_operational_generator_v1'

export const BOND_OPERATIONAL_DOCUMENT_STATUS = Object.freeze({
  draftGenerated: 'draft_generated',
  attorneyReview: 'attorney_review',
})

export const BOND_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY = Object.freeze({
  permittedStrategies: Object.freeze(['generate_now']),
  blockedStrategies: Object.freeze(['template_controlled', 'ingest_only']),
  generatedDocumentKind: 'operational_draft',
  watermark: BOND_PACK_DRAFT_WATERMARK,
  reviewRequired: true,
  finalAllowed: false,
  signingAllowed: false,
  dispatchAllowed: false,
  bankSubmissionAllowed: false,
})

const OPERATIONAL_ROLE_SET = new Set(['bond_attorney', 'secretary', 'firm_manager', 'system'])
const APPROVED_TEMPLATE_STATUSES = new Set(['approved', 'published'])
const GENERATED_DOCUMENTS = BOND_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION.filter((item) => item.strategy === 'generate_now')
const GENERATED_DOCUMENT_KEYS = new Set(GENERATED_DOCUMENTS.map((item) => item.id))
const GENERATED_DOCUMENT_BY_KEY = GENERATED_DOCUMENTS.reduce((result, item) => ({ ...result, [item.id]: item }), {})

const TEMPLATE_BLUEPRINTS = Object.freeze({
  instruction_acknowledgement: Object.freeze({
    titleTemplate: 'Bond instruction acknowledgement - {{bank_reference}}',
    fileNameTemplate: 'bond-instruction-acknowledgement-{{bank_reference}}',
    sections: Object.freeze([
      Object.freeze({ key: 'opening', titleTemplate: 'Instruction received', bodyTemplate: '{{firm_name}} acknowledges receipt of the bond instruction from {{bank_name}} under reference {{bank_reference}}.' }),
      Object.freeze({ key: 'next_steps', titleTemplate: 'Next operational steps', bodyTemplate: 'The bond team will verify bank conditions, confirm the approved amount and prepare the matter for controlled drafting once all Phase 2 facts are verified.' }),
    ]),
  }),
  buyer_fica_request_pack: Object.freeze({
    titleTemplate: 'Buyer FICA request pack',
    fileNameTemplate: 'buyer-fica-request-pack-{{bank_reference}}',
    sections: Object.freeze([
      Object.freeze({ key: 'request', titleTemplate: 'FICA and authority request', bodyTemplate: 'Please provide or confirm the buyer FICA and authority documents for {{mortgagor_identity_and_capacity}}.' }),
      Object.freeze({ key: 'reminder', titleTemplate: 'Outstanding response', bodyTemplate: 'The bond file cannot proceed to draft-ready status until buyer identity, capacity and authority evidence are verified.' }),
    ]),
  }),
  bank_condition_schedule: Object.freeze({
    titleTemplate: 'Bank condition schedule - {{bank_reference}}',
    fileNameTemplate: 'bank-condition-schedule-{{bank_reference}}',
    sections: Object.freeze([
      Object.freeze({ key: 'conditions', titleTemplate: 'Bank conditions', bodyTemplate: 'The verified bank conditions for {{bank_name}} reference {{bank_reference}} are: {{bank_conditions}}.' }),
      Object.freeze({ key: 'ownership', titleTemplate: 'Follow-up ownership', bodyTemplate: 'Each open condition must retain an owner, due date and evidence link before the bond pack can move to lodgement readiness.' }),
    ]),
  }),
  bond_signing_appointment_pack: Object.freeze({
    titleTemplate: 'Bond signing appointment pack',
    fileNameTemplate: 'bond-signing-appointment-pack-{{bank_reference}}',
    sections: Object.freeze([
      Object.freeze({ key: 'appointment', titleTemplate: 'Signing appointment', bodyTemplate: 'Bond signing is prepared for {{mortgagor_identity_and_capacity}} using {{signing_method_and_signed_pack_status}}.' }),
      Object.freeze({ key: 'checklist', titleTemplate: 'Signing checklist', bodyTemplate: 'Originals, identity evidence, witnessing requirements and signed-pack return status must be confirmed before bank submission.' }),
    ]),
  }),
  guarantee_request_cover: Object.freeze({
    titleTemplate: 'Guarantee request cover - {{bank_reference}}',
    fileNameTemplate: 'guarantee-request-cover-{{bank_reference}}',
    sections: Object.freeze([
      Object.freeze({ key: 'guarantees', titleTemplate: 'Guarantee schedule', bodyTemplate: 'Guarantees for {{bank_name}} reference {{bank_reference}}: {{guarantee_values_and_expiry}}.' }),
      Object.freeze({ key: 'handoff', titleTemplate: 'Transfer handoff', bodyTemplate: 'Guarantee wording and expiry must be confirmed with the transfer attorney before simultaneous lodgement.' }),
    ]),
  }),
  lodgement_readiness_cover: Object.freeze({
    titleTemplate: 'Bond lodgement readiness cover',
    fileNameTemplate: 'bond-lodgement-readiness-cover-{{bank_reference}}',
    sections: Object.freeze([
      Object.freeze({ key: 'approval', titleTemplate: 'Approval to lodge', bodyTemplate: 'Approval to lodge reference: {{approval_to_lodge_reference}}.' }),
      Object.freeze({ key: 'lodgement', titleTemplate: 'Lodgement reference', bodyTemplate: 'Lodgement reference: {{lodgement_reference}}. Simultaneous lodgement coordination must remain evidence-backed.' }),
    ]),
  }),
  registration_notification: Object.freeze({
    titleTemplate: 'Bond registration notification',
    fileNameTemplate: 'bond-registration-notification-{{bank_reference}}',
    sections: Object.freeze([
      Object.freeze({ key: 'registration', titleTemplate: 'Registration confirmed', bodyTemplate: 'Bond registration has been recorded as {{registration_date}}.' }),
      Object.freeze({ key: 'notice', titleTemplate: 'Notification boundary', bodyTemplate: 'This notice records the verified registration fact and does not replace Deeds Office evidence.' }),
    ]),
  }),
  bank_closeout_report: Object.freeze({
    titleTemplate: 'Bank close-out report - {{bank_reference}}',
    fileNameTemplate: 'bank-closeout-report-{{bank_reference}}',
    sections: Object.freeze([
      Object.freeze({ key: 'summary', titleTemplate: 'Close-out summary', bodyTemplate: '{{bank_name}} reference {{bank_reference}} registered on {{registration_date}}.' }),
      Object.freeze({ key: 'closure', titleTemplate: 'Administrative closure', bodyTemplate: 'The bond attorney close-out record must retain final bank confirmation, registration evidence and unresolved exception notes.' }),
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
  return cleaned || 'bond-operational-draft'
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
    templateVersionId: `bond-operational-${normalized}-v1`,
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

export function listBondOperationalDocumentKeys() {
  return Object.freeze([...GENERATED_DOCUMENT_KEYS])
}

export function buildBondOperationalTemplateFingerprint(template = {}) {
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

export function buildApprovedBondOperationalTemplate(documentKey, {
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
    templateFingerprint: buildBondOperationalTemplateFingerprint(template),
  })
}

export function validateBondOperationalTemplate(template = {}, documentKey = '') {
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
  const fingerprint = buildBondOperationalTemplateFingerprint(normalized)
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
    firm_name: text(firmBranding.firmName || firmBranding.name || firmBranding.legalName) || 'Bond attorney firm',
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
    renderModelVersion: BOND_ATTORNEY_PHASE4_VERSION,
    documentKey: document.id,
    documentLabel: document.label,
    outputFormat: template.outputFormat,
    title,
    fileName,
    watermark: BOND_PACK_DRAFT_WATERMARK,
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
    laneKey: 'bond',
    documentId,
    documentKey,
    versionId: version.versionId,
    versionNumber: version.versionNumber,
    contentHash,
    dataFingerprint: version.dataFingerprint,
  })
}

function redactAuditEvent({ workspace, document, version, commandId, actor, generatedAt }) {
  const base = buildBondPackWorkspaceAuditEvent({
    workspace,
    eventType: 'bond_operational_document_generated',
    actor,
    version,
    commandId,
    occurredAt: generatedAt,
  })
  return Object.freeze({
    ...base,
    generatorVersion: BOND_ATTORNEY_PHASE4_VERSION,
    documentKey: document.documentKey,
    documentId: document.documentId,
    artifactLink: document.artifactLink,
  })
}

export function generateBondOperationalDocument({
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
  if (!document) return fail('unsupported_bond_operational_document', [normalizedKey ? `unsupported_document:${normalizedKey}` : 'document_key_required'])
  if (!actorAuthorised(actor)) return fail('bond_operational_actor_not_authorised', ['actor_not_authorised'])
  const effectiveWorkspace = workspace || buildBondPackWorkspace({ generatedAt })
  const workspaceValidation = validateBondPackWorkspace(effectiveWorkspace)
  if (!workspaceValidation.valid) return fail('bond_workspace_invalid', workspaceValidation.errors)
  if (effectiveWorkspace.canonicalData?.readyForDrafting !== true) return fail('canonical_bond_data_not_ready', ['canonical_data_not_ready'])
  const packItem = (effectiveWorkspace.packItems || []).find((item) => item.id === normalizedKey)
  if (!packItem) return fail('bond_pack_item_missing', ['pack_item_missing'])
  if (packItem.strategy !== 'generate_now') return fail('bond_pack_item_not_operational', [`blocked_strategy:${packItem.strategy}`])
  if (packItem.generationState !== 'ready_for_phase4_generator') return fail('bond_pack_item_not_ready', [packItem.generationState])

  const templateValidation = validateBondOperationalTemplate(template, normalizedKey)
  if (!templateValidation.valid) return fail('bond_operational_template_invalid', templateValidation.errors)

  const renderModel = buildRenderModel({ workspace: effectiveWorkspace, document: packItem, template: templateValidation.template, generatedAt, firmBranding })
  const contentHash = buildOperationalContentHash(renderModel, templateValidation.template)
  const draft = prepareBondPackDraftVersion({
    workspace: effectiveWorkspace,
    templateVersionId: templateValidation.template.templateVersionId,
    templateFingerprint: templateValidation.template.templateFingerprint,
    contentHash,
    commandId,
    actor,
    generatedAt,
  })
  if (!draft.ok) return fail('bond_operational_draft_version_blocked', draft.errors)

  const documentId = hash({ workspaceId: effectiveWorkspace.workspaceId, documentKey: normalizedKey, versionId: draft.version.versionId })
  const artifactLink = buildArtifactLink({ workspace: effectiveWorkspace, documentId, documentKey: normalizedKey, version: draft.version, contentHash })
  const output = Object.freeze({
    documentId,
    documentKey: normalizedKey,
    label: packItem.label,
    generatorVersion: BOND_ATTORNEY_PHASE4_VERSION,
    documentKind: BOND_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.generatedDocumentKind,
    status: BOND_OPERATIONAL_DOCUMENT_STATUS.draftGenerated,
    renderReady: true,
    reviewRequired: true,
    finalAllowed: false,
    signingAllowed: false,
    dispatchAllowed: false,
    bankSubmissionAllowed: false,
    watermark: BOND_PACK_DRAFT_WATERMARK,
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
    code: 'bond_operational_document_generated',
    errors: Object.freeze([]),
    document: output,
    version: draft.version,
    auditEvent: redactAuditEvent({ workspace: effectiveWorkspace, document: output, version: draft.version, commandId, actor, generatedAt }),
  })
}

export function generateBondOperationalDocumentPack({
  workspace = null,
  templates = {},
  actor = {},
  commandIdPrefix = 'bond-operational-pack',
  generatedAt = new Date().toISOString(),
  firmBranding = {},
} = {}) {
  const effectiveWorkspace = workspace || buildBondPackWorkspace({ generatedAt })
  const results = GENERATED_DOCUMENTS.map((document, index) => {
    const template = Array.isArray(templates)
      ? templates.find((item) => key(item.documentKey || item.document_key) === document.id)
      : templates[document.id]
    return generateBondOperationalDocument({
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
    version: BOND_ATTORNEY_PHASE4_VERSION,
    workspaceId: effectiveWorkspace.workspaceId,
    generatedAt,
    documentCount: results.length,
    generatedCount: results.filter((result) => result.ok).length,
    failedCount: results.filter((result) => !result.ok).length,
    results: Object.freeze(results),
  })
}

export function buildBondAttorneyPhase4BaselineReport(input = {}) {
  const workspace = input.workspace || buildBondPackWorkspace(input)
  const templates = GENERATED_DOCUMENTS.reduce((result, document) => ({
    ...result,
    [document.id]: buildApprovedBondOperationalTemplate(document.id),
  }), {})
  const pack = generateBondOperationalDocumentPack({
    workspace,
    templates,
    actor: input.actor || { role: 'bond_attorney', userId: 'phase4-bond-attorney' },
    commandIdPrefix: 'phase4-baseline',
    generatedAt: input.generatedAt || new Date().toISOString(),
    firmBranding: input.firmBranding || { firmName: 'Pilot Bond Attorneys' },
  })
  const blockedNonOperational = BOND_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION
    .filter((item) => item.strategy !== 'generate_now')
    .map((item) => item.id)
  return Object.freeze({
    version: BOND_ATTORNEY_PHASE4_VERSION,
    operationalDocumentCount: GENERATED_DOCUMENTS.length,
    generatedCount: pack.generatedCount,
    failedCount: pack.failedCount,
    blockedNonOperational,
    boundary: BOND_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY,
    readyForPhase5: GENERATED_DOCUMENTS.length === 8 && pack.generatedCount === 8 && pack.failedCount === 0 && blockedNonOperational.length === 8,
  })
}
