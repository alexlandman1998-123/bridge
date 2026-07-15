import { CANCELLATION_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION } from './cancellationAttorneyModulePhase0.js'
import { CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES } from './cancellationAttorneyModulePhase2.js'
import {
  buildCancellationPackWorkspace,
  buildCancellationPackWorkspaceAuditEvent,
} from './cancellationAttorneyModulePhase3.js'
import {
  buildCancellationGuaranteeWorkspace,
  validateCancellationGuaranteeWorkspace,
} from './cancellationAttorneyModulePhase6.js'

export const CANCELLATION_ATTORNEY_PHASE7_VERSION = 'cancellation_attorney_module_phase7_document_signing_workspace_v1'
export const CANCELLATION_ATTORNEY_PHASE7_RELEASE_BLOCKER_ID = 'cancellation_document_signing_workspace_missing'

export const CANCELLATION_DOCUMENT_SIGNING_WORKSPACE_STATUSES = Object.freeze({
  blocked: 'blocked',
  prepared: 'prepared',
  partiallySigned: 'partially_signed',
  readyForLodgement: 'ready_for_lodgement',
})

export const CANCELLATION_DOCUMENT_SIGNING_ITEM_STATUSES = Object.freeze({
  blocked: 'blocked',
  templateReady: 'template_ready',
  awaitingSignature: 'awaiting_signature',
  partiallySigned: 'partially_signed',
  ready: 'ready',
  waived: 'waived',
})

export const CANCELLATION_DOCUMENT_SIGNING_EVIDENCE_STATUSES = Object.freeze({
  missing: 'missing',
  requested: 'requested',
  provided: 'provided',
  verified: 'verified',
  rejected: 'rejected',
  waived: 'waived',
})

export const CANCELLATION_DOCUMENT_TEMPLATE_STATUSES = Object.freeze({
  draft: 'draft',
  attorneyReview: 'attorney_review',
  approved: 'approved',
  published: 'published',
  superseded: 'superseded',
  withdrawn: 'withdrawn',
})

export const CANCELLATION_DOCUMENT_TEMPLATE_APPROVAL_TYPES = Object.freeze({
  firm: 'firm_template_approval',
  bank: 'bank_template_approval',
  firmAndBank: 'firm_and_bank_template_approval',
})

export const CANCELLATION_DOCUMENT_SIGNING_CONTROL_BOUNDARY = Object.freeze({
  documentSigningWorkspaceOnly: true,
  templateControlledDocumentsOnly: true,
  requiresGuaranteeWorkspaceReady: true,
  requiresSellerSigningFactsVerified: true,
  requiresExactTemplateVersion: true,
  requiresTemplateFingerprint: true,
  requiresLockedWording: true,
  requiresFirmApprovalWhereApplicable: true,
  requiresBankApprovalWhereApplicable: true,
  requiresPublishedOrApprovedTemplate: true,
  requiresSignedEvidenceBeforeLodgement: true,
  allowsGenericFallback: false,
  mayRecordEvidenceLinks: true,
  maySelectGovernedTemplate: true,
  generatesLegalInstrument: false,
  rendersDocument: false,
  createsSigningProviderEnvelope: false,
  capturesLiveSignature: false,
  submitsToBankPortal: false,
  lodgesAtDeedsOffice: false,
  marksRegistration: false,
  writesExternalSystem: false,
  mutatesMatter: false,
})

const WS = CANCELLATION_DOCUMENT_SIGNING_WORKSPACE_STATUSES
const DS = CANCELLATION_DOCUMENT_SIGNING_ITEM_STATUSES
const ES = CANCELLATION_DOCUMENT_SIGNING_EVIDENCE_STATUSES
const TS = CANCELLATION_DOCUMENT_TEMPLATE_STATUSES
const A = CANCELLATION_DOCUMENT_TEMPLATE_APPROVAL_TYPES
const FACT_STATUSES = CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES

const TEMPLATE_APPROVED_STATUSES = new Set([TS.approved, TS.published])
const FIRM_APPROVER_ROLES = new Set(['cancellation_attorney', 'conveyancer', 'firm_manager'])
const PUBLISHER_ROLES = new Set(['firm_manager', 'system'])
const BANK_APPROVER_ROLES = new Set(['bank', 'lender', 'bank_or_lender', 'system'])
const EVIDENCE_STATUS_SET = new Set(Object.values(ES))

const TEMPLATE_CONTROLLED_DOCUMENTS = CANCELLATION_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION
  .filter((document) => document.strategy === 'template_controlled')

const TEMPLATE_CONTROLLED_DOCUMENT_BY_KEY = TEMPLATE_CONTROLLED_DOCUMENTS
  .reduce((result, document) => ({ ...result, [document.id]: document }), {})

const TEMPLATE_DOCUMENT_FACTS = Object.freeze({
  bank_cancellation_documents: Object.freeze(['cancellation_bank', 'cancellation_bond_account_number', 'lender_instruction_reference', 'guarantee_acceptance_status']),
  cancellation_consent: Object.freeze(['seller_cancellation_signing_requirement', 'signed_cancellation_document_status']),
  bond_discharge_or_cancellation_instrument: Object.freeze(['cancellation_bank', 'cancellation_bond_account_number', 'lender_instruction_reference', 'seller_cancellation_signing_requirement']),
  seller_authority_resolution_for_cancellation: Object.freeze(['seller_cancellation_signing_requirement']),
})

const DOCUMENT_EVIDENCE_REQUIREMENTS = Object.freeze({
  bank_cancellation_documents: Object.freeze([
    Object.freeze({ key: 'governed_template_binding', label: 'Governed bank cancellation template binding', required: true, requiresVerification: true }),
    Object.freeze({ key: 'bank_cancellation_document_prepared', label: 'Prepared bank cancellation document evidence', required: true, requiresVerification: true }),
  ]),
  cancellation_consent: Object.freeze([
    Object.freeze({ key: 'seller_signature', label: 'Seller cancellation consent signature evidence', required: true, requiresVerification: true, signatureEvidence: true }),
    Object.freeze({ key: 'original_signed_document', label: 'Original signed consent received', required: true, requiresVerification: true, signatureEvidence: true }),
  ]),
  bond_discharge_or_cancellation_instrument: Object.freeze([
    Object.freeze({ key: 'governed_template_binding', label: 'Governed discharge/cancellation instrument template binding', required: true, requiresVerification: true }),
    Object.freeze({ key: 'seller_signature', label: 'Signed discharge/cancellation instrument evidence', required: true, requiresVerification: true, signatureEvidence: true }),
  ]),
  seller_authority_resolution_for_cancellation: Object.freeze([
    Object.freeze({ key: 'seller_authority_evidence', label: 'Seller authority or waiver evidence', required: true, requiresVerification: true, signatureEvidence: true }),
  ]),
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
  if (value && typeof value === 'object') {
    if (Array.isArray(value.documents)) return value.documents
    if (Array.isArray(value.items)) return value.items
    return Object.values(value)
  }
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

function normalizeTemplateStatus(value = '', fallback = TS.draft) {
  const normalized = key(value)
  const aliases = {
    active: TS.published,
    live: TS.published,
    review: TS.attorneyReview,
    in_review: TS.attorneyReview,
    under_review: TS.attorneyReview,
    archived: TS.withdrawn,
  }
  return Object.values(TS).includes(aliases[normalized] || normalized) ? (aliases[normalized] || normalized) : fallback
}

function normalizeEvidenceStatus(value = '', fallback = ES.missing) {
  const normalized = key(value)
  if (['approved', 'accepted', 'reviewed'].includes(normalized)) return ES.verified
  if (['attached', 'uploaded', 'received', 'supplied'].includes(normalized)) return ES.provided
  if (['declined'].includes(normalized)) return ES.rejected
  return EVIDENCE_STATUS_SET.has(normalized) ? normalized : fallback
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
  return Object.freeze({
    templateKey: normalizedKey,
    documentKey: normalizedKey,
    documentLabel: document?.label || text(input.documentLabel || input.document_label),
    requiredApproval: key(input.requiredApproval || input.required_approval || document?.requiredApproval),
    riskTier: key(input.riskTier || input.risk_tier || document?.riskTier),
    templateId: text(input.templateId || input.template_id) || `cancellation-${normalizedKey}`,
    templateVersionId: text(input.templateVersionId || input.template_version_id || input.id) || '',
    versionNumber: Number(input.versionNumber || input.version_number || 1) || 1,
    status: normalizeTemplateStatus(input.status || input.lifecycleStatus || input.lifecycle_status),
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

export function listCancellationTemplateControlledDocumentKeys() {
  return Object.freeze(TEMPLATE_CONTROLLED_DOCUMENTS.map((document) => document.id))
}

export function getCancellationTemplateControlledDocumentDefinition(documentKey = '') {
  return TEMPLATE_CONTROLLED_DOCUMENT_BY_KEY[key(documentKey)] || null
}

export function getCancellationDocumentTemplateRequiredFactKeys(documentKey = '') {
  return Object.freeze([...(TEMPLATE_DOCUMENT_FACTS[key(documentKey)] || [])])
}

export function buildCancellationDocumentTemplateFingerprint(template = {}) {
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

export function buildApprovedCancellationDocumentTemplate(documentKey, {
  templateVersionId = '',
  versionNumber = 1,
  status = TS.published,
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
  const requiredFactKeys = getCancellationDocumentTemplateRequiredFactKeys(normalizedKey)
  const template = normalizeTemplate({
    ...overrides,
    documentKey: normalizedKey,
    requiredApproval: document?.requiredApproval,
    riskTier: document?.riskTier,
    templateVersionId: templateVersionId || `cancellation-${normalizedKey}-v${versionNumber}`,
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
          approvedBy: { role: 'cancellation_attorney', userId: 'cancellation-attorney-approver-1' },
          approvalReference: `firm-approval-${normalizedKey}`,
          ...firmApproval,
        }
      : firmApproval,
    bankApproval: bankApprovalRequired(document)
      ? {
          approvedAt: '2026-07-15T08:30:00.000Z',
          approvedBy: { role: 'bank', userId: 'bank-approver-1' },
          approvalReference: `bank-approval-${normalizedKey}`,
          bankName: 'Existing lender',
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
    templateFingerprint: buildCancellationDocumentTemplateFingerprint(template),
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

export function validateCancellationDocumentTemplate(template = {}, documentKey = '', { asOf = new Date().toISOString() } = {}) {
  const normalized = normalizeTemplate(template, documentKey)
  const document = TEMPLATE_CONTROLLED_DOCUMENT_BY_KEY[normalized.documentKey]
  const errors = []
  if (!document) errors.push('unsupported_cancellation_template_controlled_document')
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

  if (normalized.status === TS.published) {
    if (!validDate(normalized.publication.publishedAt)) errors.push('template_publication_date_required')
    if (!normalized.publication.publishedBy.userId) errors.push('template_publisher_required')
    if (!PUBLISHER_ROLES.has(normalized.publication.publishedBy.role)) errors.push('template_publisher_not_authorised')
    if (!validDate(normalized.publication.effectiveFrom)) errors.push('template_effective_from_required')
  }
  const resolvedAsOf = validDate(asOf) ? new Date(asOf) : new Date()
  if (validDate(normalized.publication.effectiveFrom) && new Date(normalized.publication.effectiveFrom) > resolvedAsOf) errors.push('template_not_yet_effective')
  if (validDate(normalized.publication.effectiveUntil) && new Date(normalized.publication.effectiveUntil) <= resolvedAsOf) errors.push('template_expired')

  getCancellationDocumentTemplateRequiredFactKeys(normalized.documentKey).forEach((factKey) => {
    if (!normalized.variableKeys.includes(factKey)) errors.push(`required_variable_missing:${factKey}`)
  })

  const fingerprint = buildCancellationDocumentTemplateFingerprint(normalized)
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

function normalizeEvidenceItem(input = {}, index = 0) {
  const source = input && typeof input === 'object' ? input : { referenceId: input }
  return Object.freeze({
    evidenceId: text(source.evidenceId || source.evidence_id || source.id) || `cancellation-document-evidence-${index + 1}`,
    requirementKey: key(source.requirementKey || source.requirement_key || source.key || source.evidenceKey || source.evidence_key),
    status: normalizeEvidenceStatus(source.status || source.evidenceStatus || source.evidence_status, text(source.referenceId || source.reference_id || source.documentId || source.document_id) ? ES.provided : ES.missing),
    referenceId: text(source.referenceId || source.reference_id || source.documentId || source.document_id || source.fileId || source.file_id) || null,
    artifactHash: text(source.artifactHash || source.artifact_hash || source.documentHash || source.document_hash || source.contentHash || source.content_hash) || null,
    capturedAt: source.capturedAt || source.captured_at || null,
    verifiedAt: source.verifiedAt || source.verified_at || source.reviewedAt || source.reviewed_at || null,
    reason: text(source.reason || source.waiverReason || source.waiver_reason) || null,
  })
}

function normalizeEvidenceItems(items) {
  return Object.freeze(asArray(items).map(normalizeEvidenceItem))
}

function evidenceSatisfies(evidence) {
  if (!evidence) return false
  if (evidence.status === ES.waived) return Boolean(evidence.reason)
  return evidence.status === ES.verified
}

function buildEvidenceContract(documentKey, evidenceItems = []) {
  const required = DOCUMENT_EVIDENCE_REQUIREMENTS[documentKey] || Object.freeze([])
  const gaps = required.filter((requirement) => !evidenceItems.some((evidence) => evidence.requirementKey === requirement.key && evidenceSatisfies(evidence)))
  const rejected = required.filter((requirement) => evidenceItems.some((evidence) => evidence.requirementKey === requirement.key && evidence.status === ES.rejected))
  const signatureRequired = required.filter((requirement) => requirement.signatureEvidence)
  const signatureGaps = signatureRequired.filter((requirement) => gaps.some((gap) => gap.key === requirement.key)).map((requirement) => requirement.key)
  const waived = required.filter((requirement) => evidenceItems.some((evidence) => evidence.requirementKey === requirement.key && evidence.status === ES.waived && evidenceSatisfies(evidence))).map((requirement) => requirement.key)
  return Object.freeze({
    required,
    provided: evidenceItems,
    evidenceSatisfied: gaps.length === 0 && rejected.length === 0,
    evidenceGaps: Object.freeze(gaps.map((requirement) => requirement.key)),
    signatureGaps: Object.freeze(signatureGaps),
    rejectedEvidenceKeys: Object.freeze(rejected.map((requirement) => requirement.key)),
    waivedRequirementKeys: Object.freeze(waived),
  })
}

function buildTemplateBinding({ document, validation, guaranteeReady }) {
  const ready = guaranteeReady && validation.valid
  return Object.freeze({
    documentKey: document.id,
    label: document.label,
    requiredApproval: document.requiredApproval,
    riskTier: document.riskTier,
    status: ready ? 'ready' : 'blocked',
    templateVersionId: validation.template.templateVersionId || null,
    templateFingerprint: validation.template.templateFingerprint || null,
    contentHash: validation.template.contentHash || null,
    firmApprovalReference: validation.template.firmApproval.approvalReference || null,
    bankApprovalReference: validation.template.bankApproval.approvalReference || null,
    documentPreparationAllowed: ready,
    legalInstrumentGenerated: false,
    signingPacketCreated: false,
    errors: validation.errors,
  })
}

function documentRequiredFactsVerified(facts = {}, documentKey = '') {
  return getCancellationDocumentTemplateRequiredFactKeys(documentKey).every((factKey) => facts?.[factKey]?.status === FACT_STATUSES.verified)
}

function buildDocumentBlockers({ document, templateBinding, evidenceContract, guaranteeReady, facts }) {
  const blockers = []
  if (!guaranteeReady) blockers.push({ id: 'guarantee_workspace_not_ready', severity: 'critical', category: 'guarantee' })
  if (templateBinding.status !== 'ready') blockers.push({ id: 'governed_template_not_ready', severity: 'critical', category: 'template' })
  getCancellationDocumentTemplateRequiredFactKeys(document.id).forEach((factKey) => {
    if (facts?.[factKey]?.status !== FACT_STATUSES.verified) blockers.push({ id: `${factKey}_fact_not_verified`, severity: 'critical', category: 'facts' })
  })
  evidenceContract.rejectedEvidenceKeys.forEach((gap) => blockers.push({ id: `document_evidence_rejected:${gap}`, severity: 'high', category: 'evidence' }))
  evidenceContract.evidenceGaps.forEach((gap) => blockers.push({ id: `document_evidence_missing:${gap}`, severity: 'high', category: 'evidence' }))
  return Object.freeze(blockers.map(Object.freeze))
}

function itemStatus({ evidenceContract, blockers }) {
  if (blockers.some((blocker) => blocker.severity === 'critical')) return DS.blocked
  if (evidenceContract.evidenceSatisfied) {
    if (evidenceContract.waivedRequirementKeys.length === evidenceContract.required.length) return DS.waived
    return DS.ready
  }
  if (evidenceContract.signatureGaps.length && evidenceContract.signatureGaps.length < evidenceContract.required.filter((item) => item.signatureEvidence).length) return DS.partiallySigned
  if (evidenceContract.signatureGaps.length) return DS.awaitingSignature
  return DS.templateReady
}

function normalizeDocumentItem(input = {}, document, { templateBinding, guaranteeReady, facts }) {
  const source = input && typeof input === 'object' ? input : { documentKey: document.id }
  const evidenceItems = normalizeEvidenceItems(source.evidence || source.evidenceItems || source.evidence_items)
  const contract = buildEvidenceContract(document.id, evidenceItems)
  const blockers = buildDocumentBlockers({ document, templateBinding, evidenceContract: contract, guaranteeReady, facts })
  const status = itemStatus({ evidenceContract: contract, blockers })
  return Object.freeze({
    documentKey: document.id,
    label: document.label,
    requiredApproval: document.requiredApproval,
    riskTier: document.riskTier,
    requiredFactKeys: getCancellationDocumentTemplateRequiredFactKeys(document.id),
    requiredFactsVerified: documentRequiredFactsVerified(facts, document.id),
    templateBinding,
    evidenceContract: contract,
    status,
    readyForLodgement: status === DS.ready || status === DS.waived,
    legalInstrumentGenerated: false,
    signingPacketCreated: false,
    blockers,
  })
}

function buildMetrics(documents = []) {
  return Object.freeze({
    documentCount: documents.length,
    readyDocumentCount: documents.filter((document) => document.readyForLodgement).length,
    blockedDocumentCount: documents.filter((document) => document.status === DS.blocked).length,
    awaitingSignatureCount: documents.filter((document) => document.status === DS.awaitingSignature || document.status === DS.partiallySigned).length,
    evidenceGapCount: documents.reduce((sum, document) => sum + document.evidenceContract.evidenceGaps.length, 0),
    signatureGapCount: documents.reduce((sum, document) => sum + document.evidenceContract.signatureGaps.length, 0),
    rejectedEvidenceCount: documents.reduce((sum, document) => sum + document.evidenceContract.rejectedEvidenceKeys.length, 0),
    waivedDocumentCount: documents.filter((document) => document.status === DS.waived).length,
    legalInstrumentGeneratedCount: documents.filter((document) => document.legalInstrumentGenerated).length,
    signingPacketCreatedCount: documents.filter((document) => document.signingPacketCreated).length,
  })
}

function buildSigningFingerprint(documents = []) {
  return hash(documents.map((document) => ({
    documentKey: document.documentKey,
    status: document.status,
    templateVersionId: document.templateBinding.templateVersionId,
    templateFingerprint: document.templateBinding.templateFingerprint,
    evidence: document.evidenceContract.provided.map((evidence) => ({
      requirementKey: evidence.requirementKey,
      status: evidence.status,
      referenceId: evidence.referenceId,
      artifactHash: evidence.artifactHash,
      verifiedAt: evidence.verifiedAt,
      reason: evidence.reason,
    })),
  })))
}

function buildNextActionForDocument(document) {
  if (document.readyForLodgement) return null
  const first = document.blockers[0]?.id || null
  let actionLabel = 'Review cancellation document'
  if (first === 'guarantee_workspace_not_ready') actionLabel = 'Clear guarantee workspace before cancellation signing'
  else if (first === 'governed_template_not_ready') actionLabel = 'Select governed cancellation template'
  else if (first?.endsWith('_fact_not_verified')) actionLabel = 'Verify cancellation signing facts'
  else if (first?.startsWith('document_evidence_rejected')) actionLabel = 'Resolve rejected cancellation document evidence'
  else if (document.evidenceContract.signatureGaps.length) actionLabel = 'Capture seller signing evidence'
  else if (document.evidenceContract.evidenceGaps.length) actionLabel = 'Attach verified cancellation document evidence'
  return Object.freeze({
    documentKey: document.documentKey,
    priority: document.status === DS.blocked ? 'critical' : 'high',
    actionLabel,
    reason: first || document.status,
    blockerIds: Object.freeze(document.blockers.map((blocker) => blocker.id)),
    evidenceGaps: document.evidenceContract.evidenceGaps,
  })
}

export function buildCancellationDocumentSigningNextActions(workspace = {}) {
  const gateAction = workspace.guaranteeGate?.ready === false
    ? [Object.freeze({
        documentKey: null,
        priority: 'critical',
        actionLabel: 'Clear guarantee workspace before cancellation signing',
        reason: 'guarantee_gate_not_ready',
        blockerIds: Object.freeze(['guarantee_gate_not_ready']),
        evidenceGaps: Object.freeze([]),
      })]
    : []
  const documentActions = (workspace.documents || []).map(buildNextActionForDocument).filter(Boolean)
  return Object.freeze([...gateAction, ...documentActions].sort((left, right) => {
    const priorityRank = { critical: 0, high: 1, normal: 2 }
    return (priorityRank[left.priority] ?? 9) - (priorityRank[right.priority] ?? 9) ||
      text(left.documentKey || '').localeCompare(text(right.documentKey || ''))
  }))
}

function buildChecklistModel(workspace) {
  return Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE7_VERSION,
    workspaceId: workspace.workspaceId,
    transactionId: workspace.transactionId,
    generatedAt: workspace.generatedAt,
    signingFingerprint: workspace.signingFingerprint,
    status: workspace.status,
    rows: Object.freeze(workspace.documents.map((document) => Object.freeze({
      documentKey: document.documentKey,
      label: document.label,
      requiredApproval: document.requiredApproval,
      status: document.status,
      readyForLodgement: document.readyForLodgement,
      templateVersionId: document.templateBinding.templateVersionId,
      evidenceSatisfied: document.evidenceContract.evidenceSatisfied,
      evidenceGaps: document.evidenceContract.evidenceGaps,
      signatureGaps: document.evidenceContract.signatureGaps,
      nextAction: buildNextActionForDocument(document)?.actionLabel || 'No action required',
    }))),
  })
}

function buildAuditEvent({ packWorkspace, signingWorkspace, actor, commandId, occurredAt }) {
  const base = buildCancellationPackWorkspaceAuditEvent({
    workspace: packWorkspace,
    eventType: 'cancellation_document_signing_workspace_prepared',
    actor,
    commandId,
    occurredAt,
  })
  return Object.freeze({
    ...base,
    version: CANCELLATION_ATTORNEY_PHASE7_VERSION,
    workspaceEventVersion: base.version,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE7_RELEASE_BLOCKER_ID,
    status: signingWorkspace.status,
    signingFingerprint: signingWorkspace.signingFingerprint,
    documentMetrics: signingWorkspace.metrics,
    guaranteeGateReady: signingWorkspace.guaranteeGate.ready,
    readyForPhase8: signingWorkspace.readyForPhase8,
    documentBindings: signingWorkspace.documents.map((document) => Object.freeze({
      documentKey: document.documentKey,
      status: document.status,
      readyForLodgement: document.readyForLodgement,
      templateVersionId: document.templateBinding.templateVersionId,
      templateFingerprint: document.templateBinding.templateFingerprint,
      legalInstrumentGenerated: false,
      signingPacketCreated: false,
    })),
  })
}

export function validateCancellationDocumentSigningWorkspace(workspace = {}) {
  const errors = []
  const warnings = []
  if (workspace.version !== CANCELLATION_ATTORNEY_PHASE7_VERSION) errors.push('document_signing_workspace_version_invalid')
  if (workspace.guaranteeGate?.ready !== true) errors.push('guarantee_gate_not_ready')
  if (workspace.signingRequirementFactStatus !== FACT_STATUSES.verified) errors.push('seller_cancellation_signing_requirement_fact_not_verified')
  if (workspace.signedDocumentStatusFactStatus !== FACT_STATUSES.verified) errors.push('signed_cancellation_document_status_fact_not_verified')
  if (!Array.isArray(workspace.documents) || !workspace.documents.length) errors.push('cancellation_document_contract_required')
  const documentKeys = (workspace.documents || []).map((document) => document.documentKey)
  if (new Set(documentKeys).size !== documentKeys.length) errors.push('duplicate_cancellation_document_key')
  ;(workspace.documents || []).forEach((document) => {
    if (!TEMPLATE_CONTROLLED_DOCUMENT_BY_KEY[document.documentKey]) errors.push(`unsupported_cancellation_document:${document.documentKey || 'unknown'}`)
    if (document.templateBinding?.status !== 'ready') errors.push(`governed_template_not_ready:${document.documentKey}`)
    document.templateBinding?.errors?.forEach((error) => errors.push(`template:${document.documentKey}:${error}`))
    document.blockers?.filter((blocker) => blocker.severity === 'critical' && blocker.category === 'facts').forEach((blocker) => errors.push(`${document.documentKey}:${blocker.id}`))
    document.evidenceContract?.rejectedEvidenceKeys?.forEach((gap) => errors.push(`document_evidence_rejected:${document.documentKey}:${gap}`))
    document.evidenceContract?.evidenceGaps?.forEach((gap) => warnings.push(`document_evidence_gap:${document.documentKey}:${gap}`))
    document.evidenceContract?.signatureGaps?.forEach((gap) => warnings.push(`document_signature_gap:${document.documentKey}:${gap}`))
    if (document.legalInstrumentGenerated) errors.push(`legal_instrument_generation_forbidden:${document.documentKey}`)
    if (document.signingPacketCreated) errors.push(`signing_packet_creation_forbidden:${document.documentKey}`)
  })
  if (workspace.controls?.generatesLegalInstrument !== false) errors.push('legal_instrument_generation_boundary_required')
  if (workspace.controls?.createsSigningProviderEnvelope !== false) errors.push('signing_provider_boundary_required')
  if (workspace.controls?.lodgesAtDeedsOffice !== false) errors.push('lodgement_boundary_required')
  if (workspace.controls?.writesExternalSystem !== false) errors.push('external_write_boundary_required')
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(unique(errors)),
    warnings: Object.freeze(unique(warnings)),
  })
}

export function buildCancellationDocumentSigningWorkspace({
  guaranteeWorkspace = null,
  workspace = null,
  transaction = {},
  lane = {},
  evidence = {},
  figuresRegister = null,
  guarantees = null,
  templates = {},
  documents = null,
  actor = {},
  commandId = 'cancellation-document-signing-workspace',
  generatedAt = new Date().toISOString(),
  asOf = generatedAt,
} = {}) {
  const packWorkspace = workspace || buildCancellationPackWorkspace({
    transaction,
    lane,
    evidence,
    generatedAt,
  })
  const effectiveGuaranteeWorkspace = guaranteeWorkspace || buildCancellationGuaranteeWorkspace({
    workspace: packWorkspace,
    transaction,
    lane,
    evidence,
    figuresRegister,
    guarantees,
    actor,
    commandId: `${commandId}-guarantee-gate`,
    generatedAt,
  })
  const guaranteeValidation = validateCancellationGuaranteeWorkspace(effectiveGuaranteeWorkspace)
  const guaranteeReady = guaranteeValidation.valid && effectiveGuaranteeWorkspace.readyForPhase7 === true
  const facts = packWorkspace.canonicalData?.factsByKey || {}
  const signingRequirementFact = facts.seller_cancellation_signing_requirement || null
  const signedDocumentStatusFact = facts.signed_cancellation_document_status || null
  const documentSourceByKey = new Map(asArray(documents).map((item) => [key(item.documentKey || item.document_key || item.key || item.id), item]))
  const normalizedDocuments = Object.freeze(TEMPLATE_CONTROLLED_DOCUMENTS.map((document) => {
    const validation = validateCancellationDocumentTemplate(templateLookup(templates, document.id) || {}, document.id, { asOf })
    const templateBinding = buildTemplateBinding({ document, validation, guaranteeReady })
    return normalizeDocumentItem(documentSourceByKey.get(document.id) || {}, document, { templateBinding, guaranteeReady, facts })
  }))
  const metrics = buildMetrics(normalizedDocuments)
  const status = !guaranteeReady || metrics.blockedDocumentCount
    ? WS.blocked
    : metrics.readyDocumentCount === normalizedDocuments.length
      ? WS.readyForLodgement
      : metrics.awaitingSignatureCount
        ? WS.partiallySigned
        : WS.prepared
  const shell = Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE7_VERSION,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE7_RELEASE_BLOCKER_ID,
    workspaceId: packWorkspace.workspaceId,
    transactionId: packWorkspace.transactionId,
    laneKey: 'cancellation',
    generatedAt,
    status,
    guaranteeGate: Object.freeze({
      ready: guaranteeReady,
      guaranteeFingerprint: effectiveGuaranteeWorkspace.guaranteeFingerprint || null,
      validation: guaranteeValidation,
      matchedGuaranteeCount: effectiveGuaranteeWorkspace.metrics?.matchedGuaranteeCount ?? null,
      blockedGuaranteeCount: effectiveGuaranteeWorkspace.metrics?.blockedGuaranteeCount ?? null,
    }),
    signingRequirementFactStatus: signingRequirementFact?.status || FACT_STATUSES.missing,
    signingRequirementFactFingerprint: signingRequirementFact?.fingerprint || null,
    signedDocumentStatusFactStatus: signedDocumentStatusFact?.status || FACT_STATUSES.missing,
    signedDocumentStatusFactFingerprint: signedDocumentStatusFact?.fingerprint || null,
    documents: normalizedDocuments,
    metrics,
    signingFingerprint: buildSigningFingerprint(normalizedDocuments),
    controls: CANCELLATION_DOCUMENT_SIGNING_CONTROL_BOUNDARY,
    readyForPhase8: false,
    legalInstrumentsGenerated: false,
    signingPacketsCreated: false,
  })
  const validation = validateCancellationDocumentSigningWorkspace(shell)
  const nextActions = buildCancellationDocumentSigningNextActions(shell)
  const readyForPhase8 = validation.valid &&
    guaranteeReady &&
    normalizedDocuments.length === TEMPLATE_CONTROLLED_DOCUMENTS.length &&
    metrics.readyDocumentCount === normalizedDocuments.length &&
    metrics.blockedDocumentCount === 0 &&
    metrics.evidenceGapCount === 0 &&
    metrics.signatureGapCount === 0 &&
    metrics.rejectedEvidenceCount === 0 &&
    metrics.legalInstrumentGeneratedCount === 0 &&
    metrics.signingPacketCreatedCount === 0
  const signingWorkspace = Object.freeze({
    ...shell,
    validation,
    nextActions,
    checklistModel: buildChecklistModel({ ...shell, nextActions }),
    readyForPhase8,
  })
  return Object.freeze({
    ...signingWorkspace,
    checklistModel: buildChecklistModel(signingWorkspace),
    auditEvent: buildAuditEvent({ packWorkspace, signingWorkspace, actor, commandId, occurredAt: generatedAt }),
  })
}

export function buildCancellationAttorneyPhase7BaselineReport(input = {}) {
  const workspace = buildCancellationDocumentSigningWorkspace(input)
  return Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE7_VERSION,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE7_RELEASE_BLOCKER_ID,
    status: workspace.status,
    templateControlledCount: workspace.documents.length,
    readyDocumentCount: workspace.metrics.readyDocumentCount,
    blockedDocumentCount: workspace.metrics.blockedDocumentCount,
    awaitingSignatureCount: workspace.metrics.awaitingSignatureCount,
    evidenceGapCount: workspace.metrics.evidenceGapCount,
    signatureGapCount: workspace.metrics.signatureGapCount,
    guaranteeReady: workspace.guaranteeGate.ready,
    validation: workspace.validation,
    nextActionCount: workspace.nextActions.length,
    controls: workspace.controls,
    readyForPhase8: workspace.readyForPhase8,
    legalInstrumentsGenerated: workspace.legalInstrumentsGenerated,
    signingPacketsCreated: workspace.signingPacketsCreated,
  })
}
