import { BOND_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION } from './bondAttorneyModulePhase0.js'
import { buildBondPackWorkspaceAuditEvent } from './bondAttorneyModulePhase3.js'
import {
  buildBondSigningWorkspace,
  validateBondSigningWorkspace,
} from './bondAttorneyModulePhase6.js'

export const BOND_ATTORNEY_PHASE7_VERSION = 'bond_attorney_module_phase7_template_governance_v1'
export const BOND_ATTORNEY_PHASE7_RELEASE_BLOCKER_ID = 'legal_instrument_templates_not_approved'

export const BOND_LEGAL_TEMPLATE_STATUSES = Object.freeze({
  draft: 'draft',
  attorneyReview: 'attorney_review',
  approved: 'approved',
  published: 'published',
  superseded: 'superseded',
  withdrawn: 'withdrawn',
})

export const BOND_LEGAL_TEMPLATE_APPROVAL_TYPES = Object.freeze({
  firm: 'firm_template_approval',
  bank: 'bank_template_approval',
  firmAndBank: 'firm_and_bank_template_approval',
})

export const BOND_LEGAL_TEMPLATE_GATE_STATUSES = Object.freeze({
  ready: 'ready',
  blocked: 'blocked',
})

export const BOND_LEGAL_TEMPLATE_GOVERNANCE_BOUNDARY = Object.freeze({
  templateControlledDocumentsOnly: true,
  requiresExactTemplateVersion: true,
  requiresTemplateFingerprint: true,
  requiresLockedWording: true,
  requiresFirmApprovalWhereApplicable: true,
  requiresBankApprovalWhereApplicable: true,
  requiresPublishedOrApprovedTemplate: true,
  requiresPhase6SigningReadiness: true,
  allowsGenericFallback: false,
  maySelectGovernedTemplate: true,
  mayPrepareDraftCommand: false,
  generatesLegalInstrument: false,
  rendersDocument: false,
  createsSigningPacket: false,
  submitsToBankPortal: false,
})

const S = BOND_LEGAL_TEMPLATE_STATUSES
const A = BOND_LEGAL_TEMPLATE_APPROVAL_TYPES
const G = BOND_LEGAL_TEMPLATE_GATE_STATUSES

const TEMPLATE_APPROVED_STATUSES = new Set([S.approved, S.published])
const FIRM_APPROVER_ROLES = new Set(['bond_attorney', 'firm_manager'])
const PUBLISHER_ROLES = new Set(['firm_manager', 'system'])
const BANK_APPROVER_ROLES = new Set(['bank', 'lender', 'originator', 'bank_or_originator', 'system'])

const TEMPLATE_CONTROLLED_DOCUMENTS = BOND_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION
  .filter((document) => document.strategy === 'template_controlled')

const TEMPLATE_CONTROLLED_DOCUMENT_BY_KEY = TEMPLATE_CONTROLLED_DOCUMENTS
  .reduce((result, document) => ({ ...result, [document.id]: document }), {})

const TEMPLATE_DOCUMENT_FACTS = Object.freeze({
  power_of_attorney_to_pass_mortgage_bond: Object.freeze(['mortgagor_identity_and_capacity', 'mortgagee_identity', 'property_legal_description', 'title_deed_or_deeds_office_reference']),
  company_or_trust_authority_resolution: Object.freeze(['mortgagor_identity_and_capacity', 'buyer_marital_or_entity_authority']),
  mortgage_bond_draft: Object.freeze(['bank_name', 'bank_reference', 'approved_bond_amount', 'mortgagor_identity_and_capacity', 'mortgagee_identity', 'property_legal_description', 'title_deed_or_deeds_office_reference']),
  banking_mandate_or_debit_order: Object.freeze(['bank_name', 'bank_reference', 'mortgagor_identity_and_capacity']),
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

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return Object.values(value)
  return text(value) ? [value] : []
}

function validContentHash(value = '') {
  return /^(?:sha256:)?[a-f0-9]{64}$/i.test(text(value))
}

function actorSummary(actor = {}) {
  return Object.freeze({
    role: key(actor.role || actor.actorRole || actor.actor_role) || 'system',
    userId: text(actor.userId || actor.user_id) || null,
  })
}

function approvalSummary(approval = {}) {
  return Object.freeze({
    approvedAt: approval.approvedAt || approval.approved_at || null,
    approvedBy: actorSummary(approval.approvedBy || approval.approved_by || {}),
    approvalReference: text(approval.approvalReference || approval.approval_reference || approval.reference || approval.ref) || null,
    bankName: text(approval.bankName || approval.bank_name || approval.lenderName || approval.lender_name) || null,
  })
}

function normalizeStatus(value = '', fallback = S.draft) {
  const normalized = key(value)
  const aliases = {
    active: S.published,
    live: S.published,
    review: S.attorneyReview,
    in_review: S.attorneyReview,
    under_review: S.attorneyReview,
    archived: S.withdrawn,
  }
  return Object.values(S).includes(aliases[normalized] || normalized) ? (aliases[normalized] || normalized) : fallback
}

function firmApprovalRequired(document = {}) {
  return [A.firm, A.firmAndBank].includes(document.requiredApproval)
}

function bankApprovalRequired(document = {}) {
  return [A.bank, A.firmAndBank].includes(document.requiredApproval)
}

function normalizeVariableKey(input = {}) {
  if (typeof input === 'string') return key(input)
  return key(input.key || input.variableKey || input.variable_key || input.sourceFactKey || input.source_fact_key || input.factKey || input.fact_key)
}

function normalizeVariableKeys(input = []) {
  return Object.freeze(unique(asArray(input).map(normalizeVariableKey)))
}

function normalizeTemplate(input = {}, documentKey = '') {
  const normalizedKey = key(input.documentKey || input.document_key || input.templateKey || input.template_key || documentKey)
  const document = TEMPLATE_CONTROLLED_DOCUMENT_BY_KEY[normalizedKey]
  const status = normalizeStatus(input.status || input.lifecycleStatus || input.lifecycle_status)
  return Object.freeze({
    templateKey: normalizedKey,
    documentKey: normalizedKey,
    documentLabel: document?.label || text(input.documentLabel || input.document_label),
    requiredApproval: key(input.requiredApproval || input.required_approval || document?.requiredApproval),
    riskTier: key(input.riskTier || input.risk_tier || document?.riskTier),
    templateId: text(input.templateId || input.template_id) || `bond-${normalizedKey}`,
    templateVersionId: text(input.templateVersionId || input.template_version_id || input.id) || '',
    versionNumber: Number(input.versionNumber || input.version_number || 1) || 1,
    status,
    locked: input.locked === true || input.wordingLocked === true || input.wording_locked === true,
    jurisdictionCode: text(input.jurisdictionCode || input.jurisdiction_code || 'ZA').toUpperCase() || 'ZA',
    languageCode: text(input.languageCode || input.language_code || 'en-ZA') || 'en-ZA',
    contentHash: text(input.contentHash || input.content_hash || input.content?.contentHash || input.content?.content_hash).toLowerCase(),
    storagePath: text(input.storagePath || input.storage_path || input.content?.storagePath || input.content?.storage_path) || null,
    outputFormat: key(input.outputFormat || input.output_format || input.templateFormat || input.template_format || 'docx') || 'docx',
    genericFallbackAllowed: input.genericFallbackAllowed === true || input.generic_fallback_allowed === true,
    authoredBy: actorSummary(input.authoredBy || input.authored_by || {}),
    createdAt: input.createdAt || input.created_at || null,
    firmApproval: approvalSummary(input.firmApproval || input.firm_approval || input.approval || {}),
    bankApproval: approvalSummary(input.bankApproval || input.bank_approval || {}),
    publication: Object.freeze({
      publishedAt: input.publication?.publishedAt || input.publication?.published_at || input.publishedAt || input.published_at || null,
      publishedBy: actorSummary(input.publication?.publishedBy || input.publication?.published_by || input.publishedBy || input.published_by || {}),
      effectiveFrom: input.publication?.effectiveFrom || input.publication?.effective_from || input.effectiveFrom || input.effective_from || null,
      effectiveUntil: input.publication?.effectiveUntil || input.publication?.effective_until || input.effectiveUntil || input.effective_until || null,
    }),
    variableKeys: normalizeVariableKeys(input.variableKeys || input.variable_keys || input.variables || input.fieldMappings || input.field_mappings),
    templateFingerprint: text(input.templateFingerprint || input.template_fingerprint).toLowerCase(),
  })
}

export function listBondTemplateControlledDocumentKeys() {
  return Object.freeze(TEMPLATE_CONTROLLED_DOCUMENTS.map((document) => document.id))
}

export function getBondTemplateControlledDocumentDefinition(documentKey = '') {
  return TEMPLATE_CONTROLLED_DOCUMENT_BY_KEY[key(documentKey)] || null
}

export function getBondLegalTemplateRequiredFactKeys(documentKey = '') {
  return Object.freeze([...(TEMPLATE_DOCUMENT_FACTS[key(documentKey)] || [])])
}

export function buildBondLegalTemplateFingerprint(template = {}) {
  const normalized = normalizeTemplate(template, template.documentKey)
  return hash({
    documentKey: normalized.documentKey,
    requiredApproval: normalized.requiredApproval,
    templateId: normalized.templateId,
    templateVersionId: normalized.templateVersionId,
    versionNumber: normalized.versionNumber,
    jurisdictionCode: normalized.jurisdictionCode,
    languageCode: normalized.languageCode,
    contentHash: normalized.contentHash,
    storagePath: normalized.storagePath,
    outputFormat: normalized.outputFormat,
    variableKeys: normalized.variableKeys,
  })
}

export function buildApprovedBondLegalTemplate(documentKey, {
  templateVersionId = '',
  versionNumber = 1,
  status = S.published,
  locked = true,
  contentHash = '',
  firmApproval = {},
  bankApproval = {},
  authoredBy = { role: 'secretary', userId: 'template-author-1' },
  publication = {},
  createdAt = '2026-07-15T07:00:00.000Z',
  overrides = {},
} = {}) {
  const normalizedKey = key(documentKey)
  const document = TEMPLATE_CONTROLLED_DOCUMENT_BY_KEY[normalizedKey]
  const requiredFactKeys = getBondLegalTemplateRequiredFactKeys(normalizedKey)
  const template = normalizeTemplate({
    ...overrides,
    documentKey: normalizedKey,
    requiredApproval: document?.requiredApproval,
    riskTier: document?.riskTier,
    templateVersionId: templateVersionId || `bond-${normalizedKey}-v${versionNumber}`,
    versionNumber,
    status,
    locked,
    contentHash: contentHash || `${String(versionNumber).slice(-1).repeat(64)}`,
    variableKeys: overrides.variableKeys || overrides.variable_keys || requiredFactKeys,
    authoredBy,
    createdAt,
    firmApproval: firmApprovalRequired(document)
      ? {
          approvedAt: '2026-07-15T08:00:00.000Z',
          approvedBy: { role: 'bond_attorney', userId: 'bond-attorney-approver-1' },
          approvalReference: `firm-approval-${normalizedKey}`,
          ...firmApproval,
        }
      : firmApproval,
    bankApproval: bankApprovalRequired(document)
      ? {
          approvedAt: '2026-07-15T08:30:00.000Z',
          approvedBy: { role: 'bank', userId: 'bank-approver-1' },
          approvalReference: `bank-approval-${normalizedKey}`,
          bankName: 'Nedbank',
          ...bankApproval,
        }
      : bankApproval,
    publication: {
      publishedAt: '2026-07-15T09:00:00.000Z',
      publishedBy: { role: 'firm_manager', userId: 'firm-manager-1' },
      effectiveFrom: '2026-07-15T00:00:00.000Z',
      effectiveUntil: null,
      ...publication,
    },
  }, normalizedKey)
  return Object.freeze({
    ...template,
    templateFingerprint: buildBondLegalTemplateFingerprint(template),
  })
}

function validateFirmApproval(template, errors) {
  if (!validDate(template.firmApproval.approvedAt)) errors.push('firm_template_approval_date_required')
  if (!template.firmApproval.approvedBy.userId) errors.push('firm_template_approver_required')
  if (!FIRM_APPROVER_ROLES.has(template.firmApproval.approvedBy.role)) errors.push('firm_template_approver_not_authorised')
  if (template.firmApproval.approvedBy.userId && template.firmApproval.approvedBy.userId === template.authoredBy.userId) errors.push('independent_firm_template_approval_required')
  if (!template.firmApproval.approvalReference) errors.push('firm_template_approval_reference_required')
}

function validateBankApproval(template, errors) {
  if (!validDate(template.bankApproval.approvedAt)) errors.push('bank_template_approval_date_required')
  if (!template.bankApproval.approvedBy.userId) errors.push('bank_template_approver_required')
  if (!BANK_APPROVER_ROLES.has(template.bankApproval.approvedBy.role)) errors.push('bank_template_approver_not_authorised')
  if (!template.bankApproval.approvalReference) errors.push('bank_template_approval_reference_required')
  if (!template.bankApproval.bankName) errors.push('bank_template_bank_name_required')
}

export function validateBondLegalTemplate(template = {}, documentKey = '', { asOf = new Date().toISOString() } = {}) {
  const normalized = normalizeTemplate(template, documentKey)
  const document = TEMPLATE_CONTROLLED_DOCUMENT_BY_KEY[normalized.documentKey]
  const errors = []
  if (!document) errors.push('unsupported_template_controlled_document')
  if (documentKey && normalized.documentKey !== key(documentKey)) errors.push('template_document_key_mismatch')
  if (document && normalized.requiredApproval !== document.requiredApproval) errors.push('template_required_approval_mismatch')
  if (!normalized.templateVersionId) errors.push('template_version_required')
  if (!Number.isInteger(normalized.versionNumber) || normalized.versionNumber < 1) errors.push('template_version_number_required')
  if (!TEMPLATE_APPROVED_STATUSES.has(normalized.status)) errors.push('template_not_approved')
  if (normalized.locked !== true) errors.push('template_wording_not_locked')
  if (!validContentHash(normalized.contentHash)) errors.push('valid_template_content_hash_required')
  if (!normalized.storagePath && !normalized.contentHash) errors.push('template_content_source_required')
  if (normalized.genericFallbackAllowed) errors.push('generic_template_fallback_forbidden')
  if (!normalized.authoredBy.userId) errors.push('template_author_required')
  if (!validDate(normalized.createdAt)) errors.push('template_created_at_required')

  if (document && firmApprovalRequired(document)) validateFirmApproval(normalized, errors)
  if (document && bankApprovalRequired(document)) validateBankApproval(normalized, errors)

  if (normalized.status === S.published) {
    if (!validDate(normalized.publication.publishedAt)) errors.push('template_publication_date_required')
    if (!normalized.publication.publishedBy.userId) errors.push('template_publisher_required')
    if (!PUBLISHER_ROLES.has(normalized.publication.publishedBy.role)) errors.push('template_publisher_not_authorised')
    if (!validDate(normalized.publication.effectiveFrom)) errors.push('template_effective_from_required')
  }
  const resolvedAsOf = validDate(asOf) ? new Date(asOf) : new Date()
  if (validDate(normalized.publication.effectiveFrom) && new Date(normalized.publication.effectiveFrom) > resolvedAsOf) errors.push('template_not_yet_effective')
  if (validDate(normalized.publication.effectiveUntil) && new Date(normalized.publication.effectiveUntil) <= resolvedAsOf) errors.push('template_expired')

  getBondLegalTemplateRequiredFactKeys(normalized.documentKey).forEach((factKey) => {
    if (!normalized.variableKeys.includes(factKey)) errors.push(`required_variable_missing:${factKey}`)
  })

  const fingerprint = buildBondLegalTemplateFingerprint(normalized)
  if (normalized.templateFingerprint && normalized.templateFingerprint !== fingerprint) errors.push('template_fingerprint_mismatch')

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(unique(errors)),
    template: Object.freeze({ ...normalized, templateFingerprint: fingerprint }),
  })
}

function templateLookup(templates = {}, documentKey = '') {
  if (Array.isArray(templates)) return templates.find((template) => key(template.documentKey || template.document_key || template.templateKey || template.template_key) === documentKey) || null
  return templates[documentKey] || null
}

function buildTemplateBinding({ document, validation, signingReady }) {
  const ready = signingReady && validation.valid
  return Object.freeze({
    documentKey: document.id,
    label: document.label,
    requiredApproval: document.requiredApproval,
    riskTier: document.riskTier,
    status: ready ? G.ready : G.blocked,
    templateVersionId: validation.template.templateVersionId || null,
    templateFingerprint: validation.template.templateFingerprint || null,
    contentHash: validation.template.contentHash || null,
    firmApprovalReference: validation.template.firmApproval.approvalReference || null,
    bankApprovalReference: validation.template.bankApproval.approvalReference || null,
    generationAllowed: ready,
    legalInstrumentGenerated: false,
    errors: validation.errors,
  })
}

function buildAuditEvent({ workspace, gate, actor, commandId, occurredAt }) {
  const base = buildBondPackWorkspaceAuditEvent({
    workspace,
    eventType: 'bond_legal_template_gate_evaluated',
    actor,
    commandId,
    occurredAt,
  })
  return Object.freeze({
    ...base,
    version: BOND_ATTORNEY_PHASE7_VERSION,
    workspaceEventVersion: base.version,
    releaseBlockerId: BOND_ATTORNEY_PHASE7_RELEASE_BLOCKER_ID,
    gateStatus: gate.status,
    readyForPhase8: gate.readyForPhase8,
    templateControlledCount: gate.templateControlledCount,
    readyTemplateCount: gate.readyTemplateCount,
    blockedTemplateCount: gate.blockedTemplateCount,
    bindings: gate.bindings.map((binding) => Object.freeze({
      documentKey: binding.documentKey,
      status: binding.status,
      templateVersionId: binding.templateVersionId,
      templateFingerprint: binding.templateFingerprint,
      contentHash: binding.contentHash,
      generationAllowed: binding.generationAllowed,
      legalInstrumentGenerated: false,
    })),
  })
}

export function buildBondLegalTemplateGate({
  signingWorkspace = null,
  workspace = null,
  transaction = {},
  lane = {},
  evidence = {},
  conditionRegister = null,
  signers = null,
  templates = {},
  actor = {},
  commandId = 'bond-legal-template-gate',
  generatedAt = new Date().toISOString(),
  asOf = generatedAt,
} = {}) {
  const effectiveSigningWorkspace = signingWorkspace || buildBondSigningWorkspace({
    workspace,
    transaction,
    lane,
    evidence,
    conditionRegister,
    signers,
    actor,
    commandId: `${commandId}-signing-readiness`,
    generatedAt,
  })
  const signingValidation = validateBondSigningWorkspace(effectiveSigningWorkspace)
  const signingReady = signingValidation.valid && effectiveSigningWorkspace.readyForPhase7 === true
  const bindings = Object.freeze(TEMPLATE_CONTROLLED_DOCUMENTS.map((document) => {
    const validation = validateBondLegalTemplate(templateLookup(templates, document.id) || {}, document.id, { asOf })
    return buildTemplateBinding({ document, validation, signingReady })
  }))
  const readyTemplateCount = bindings.filter((binding) => binding.status === G.ready).length
  const blockedTemplateCount = bindings.length - readyTemplateCount
  const status = signingReady && blockedTemplateCount === 0 ? G.ready : G.blocked
  const gate = Object.freeze({
    version: BOND_ATTORNEY_PHASE7_VERSION,
    releaseBlockerId: BOND_ATTORNEY_PHASE7_RELEASE_BLOCKER_ID,
    workspaceId: effectiveSigningWorkspace.workspaceId,
    transactionId: effectiveSigningWorkspace.transactionId,
    laneKey: 'bond',
    generatedAt,
    status,
    signingReady,
    signingValidation,
    signingFingerprint: effectiveSigningWorkspace.signingFingerprint || null,
    templateControlledCount: bindings.length,
    readyTemplateCount,
    blockedTemplateCount,
    bindings,
    controls: BOND_LEGAL_TEMPLATE_GOVERNANCE_BOUNDARY,
    readyForPhase8: status === G.ready,
    generationCommandsPrepared: false,
    legalInstrumentsGenerated: false,
  })
  const effectiveWorkspace = workspace || effectiveSigningWorkspace
  return Object.freeze({
    ...gate,
    auditEvent: buildAuditEvent({ workspace: effectiveWorkspace, gate, actor, commandId, occurredAt: generatedAt }),
  })
}

export function buildBondAttorneyPhase7BaselineReport(input = {}) {
  const gate = buildBondLegalTemplateGate(input)
  return Object.freeze({
    version: BOND_ATTORNEY_PHASE7_VERSION,
    releaseBlockerId: BOND_ATTORNEY_PHASE7_RELEASE_BLOCKER_ID,
    status: gate.status,
    templateControlledCount: gate.templateControlledCount,
    readyTemplateCount: gate.readyTemplateCount,
    blockedTemplateCount: gate.blockedTemplateCount,
    signingReady: gate.signingReady,
    controls: gate.controls,
    readyForPhase8: gate.readyForPhase8,
    generationCommandsPrepared: gate.generationCommandsPrepared,
    legalInstrumentsGenerated: gate.legalInstrumentsGenerated,
  })
}
