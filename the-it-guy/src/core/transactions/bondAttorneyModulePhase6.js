import { BOND_ATTORNEY_PHASE2_FACT_STATUSES } from './bondAttorneyModulePhase2.js'
import {
  buildBondPackWorkspace,
  buildBondPackWorkspaceAuditEvent,
  validateBondPackWorkspace,
} from './bondAttorneyModulePhase3.js'
import { buildBondConditionRegister } from './bondAttorneyModulePhase5.js'

export const BOND_ATTORNEY_PHASE6_VERSION = 'bond_attorney_module_phase6_signing_workspace_v1'
export const BOND_ATTORNEY_PHASE6_RELEASE_BLOCKER_ID = 'signing_workspace_missing'

export const BOND_SIGNING_WORKSPACE_STATUSES = Object.freeze({
  blocked: 'blocked',
  prepared: 'prepared',
  partiallySigned: 'partially_signed',
  fullySigned: 'fully_signed',
  expired: 'expired',
  voided: 'voided',
})

export const BOND_SIGNER_STATUSES = Object.freeze({
  blocked: 'blocked',
  readyToSign: 'ready_to_sign',
  partiallySigned: 'partially_signed',
  signed: 'signed',
})

export const BOND_SIGNING_METHODS = Object.freeze({
  wetInk: 'wet_ink',
  electronic: 'electronic',
  mixed: 'mixed',
})

export const BOND_SIGNER_ROLES = Object.freeze({
  mortgagor: 'mortgagor',
  mortgagorRepresentative: 'mortgagor_representative',
  consentingSpouse: 'consenting_spouse',
  witness: 'witness',
  commissioner: 'commissioner',
  bondAttorney: 'bond_attorney',
  bankSignatory: 'bank_signatory',
})

export const BOND_SIGNING_CAPACITY_TYPES = Object.freeze({
  self: 'self',
  spouseConsent: 'spouse_consent',
  director: 'director',
  trustee: 'trustee',
  member: 'member',
  authorisedRepresentative: 'authorised_representative',
  attorneyUnderPower: 'attorney_under_power',
  witness: 'witness',
  commissioner: 'commissioner',
  bondAttorney: 'bond_attorney',
  bankAuthorised: 'bank_authorised',
})

export const BOND_SIGNING_EVIDENCE_STATUSES = Object.freeze({
  missing: 'missing',
  requested: 'requested',
  provided: 'provided',
  verified: 'verified',
  rejected: 'rejected',
  waived: 'waived',
})

export const BOND_SIGNING_REQUIREMENT_KEYS = Object.freeze({
  identityVerified: 'identity_verified',
  capacityAuthority: 'capacity_authority',
  signedBondPack: 'signed_bond_pack',
  originalSignedPackReceived: 'original_signed_pack_received',
  witnessAttestation: 'witness_attestation',
})

export const BOND_SIGNING_WORKSPACE_CONTROL_BOUNDARY = Object.freeze({
  signerCapacityTracked: true,
  wetInkOriginalsTracked: true,
  signedPackEvidenceRequired: true,
  conditionGateRequired: true,
  mayPrepareSigningWorkspace: true,
  mayRecordEvidenceLinks: true,
  generatesLegalInstrument: false,
  createsSigningProviderEnvelope: false,
  capturesLiveSignature: false,
  submitsToBankPortal: false,
  changesExternalRegistryOutcome: false,
})

const W = BOND_SIGNING_WORKSPACE_STATUSES
const SS = BOND_SIGNER_STATUSES
const M = BOND_SIGNING_METHODS
const R = BOND_SIGNER_ROLES
const C = BOND_SIGNING_CAPACITY_TYPES
const E = BOND_SIGNING_EVIDENCE_STATUSES
const K = BOND_SIGNING_REQUIREMENT_KEYS

const SIGNING_METHOD_SET = new Set(Object.values(M))
const SIGNER_ROLE_SET = new Set(Object.values(R))
const CAPACITY_SET = new Set(Object.values(C))
const EVIDENCE_STATUS_SET = new Set(Object.values(E))

const SIGNATURE_REQUIREMENTS = new Set([K.signedBondPack, K.originalSignedPackReceived, K.witnessAttestation])

const CAPACITY_ALIASES = Object.freeze({
  individual_mortgagor: C.self,
  individual: C.self,
  natural_person: C.self,
  self_capacity: C.self,
  self_identity: C.self,
  spouse: C.spouseConsent,
  spouse_consent_required: C.spouseConsent,
  company_director: C.director,
  director_authority: C.director,
  trust_trustee: C.trustee,
  trustee_authority: C.trustee,
  cc_member: C.member,
  close_corporation_member: C.member,
  representative: C.authorisedRepresentative,
  authorised_rep: C.authorisedRepresentative,
  poa: C.attorneyUnderPower,
  power_of_attorney: C.attorneyUnderPower,
  attorney: C.bondAttorney,
  bank: C.bankAuthorised,
})

const ROLE_ALIASES = Object.freeze({
  buyer: R.mortgagor,
  purchaser: R.mortgagor,
  primary_mortgagor: R.mortgagor,
  representative: R.mortgagorRepresentative,
  authorised_representative: R.mortgagorRepresentative,
  spouse: R.consentingSpouse,
  attorney: R.bondAttorney,
  bank: R.bankSignatory,
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

function bool(value, fallback = false) {
  if (typeof value === 'boolean') return value
  const normalized = key(value)
  if (['true', 'yes', 'y', '1', 'required', 'wet_ink'].includes(normalized)) return true
  if (['false', 'no', 'n', '0', 'not_required'].includes(normalized)) return false
  return fallback
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    if (Array.isArray(value.signers)) return value.signers
    if (Array.isArray(value.items)) return value.items
    return Object.entries(value).map(([signerKey, signerValue]) => {
      if (signerValue && typeof signerValue === 'object' && !Array.isArray(signerValue)) return { signerKey, ...signerValue }
      return { signerKey, label: signerKey, value: signerValue }
    })
  }
  return []
}

function actorSummary(actor = {}) {
  return Object.freeze({
    role: key(actor.role || actor.actorRole || actor.actor_role) || 'system',
    userId: text(actor.userId || actor.user_id) || null,
  })
}

function normalizeSigningMethod(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : { method: value, status: value }
  const rawMethod = key(source.method || source.signingMethod || source.signing_method || source.type || source.value || value)
  const method = rawMethod.includes('electronic')
    ? M.electronic
    : rawMethod.includes('mixed')
      ? M.mixed
      : M.wetInk
  return Object.freeze({
    method,
    signedPackStatus: key(source.status || source.signedPackStatus || source.signed_pack_status),
    wetInkRequired: bool(source.wetInkRequired ?? source.wet_ink_required, [M.wetInk, M.mixed].includes(method)),
    originalRequired: bool(source.originalRequired ?? source.original_required, [M.wetInk, M.mixed].includes(method)),
    witnessRequired: bool(source.witnessRequired ?? source.witness_required, method === M.wetInk),
  })
}

function normalizeSignerRole(value = '') {
  const normalized = key(value)
  const role = ROLE_ALIASES[normalized] || normalized
  return SIGNER_ROLE_SET.has(role) ? role : R.mortgagor
}

function normalizeCapacityType(value = '') {
  const normalized = key(value)
  const capacity = CAPACITY_ALIASES[normalized] || normalized
  return CAPACITY_SET.has(capacity) ? capacity : C.self
}

function normalizeMethod(value = '', fallback = M.wetInk) {
  const normalized = key(value)
  if (normalized.includes('electronic')) return M.electronic
  if (normalized.includes('mixed')) return M.mixed
  if (normalized.includes('wet') || normalized.includes('ink') || normalized.includes('original')) return M.wetInk
  return SIGNING_METHOD_SET.has(normalized) ? normalized : fallback
}

function normalizeEvidenceStatus(value = '', fallback = E.missing) {
  const normalized = key(value)
  if (['approved', 'accepted', 'reviewed'].includes(normalized)) return E.verified
  if (['attached', 'uploaded', 'received', 'supplied'].includes(normalized)) return E.provided
  if (['declined'].includes(normalized)) return E.rejected
  return EVIDENCE_STATUS_SET.has(normalized) ? normalized : fallback
}

function deriveCapacityFromFacts(mortgagor = {}, authority = {}) {
  const source = mortgagor && typeof mortgagor === 'object' ? mortgagor : {}
  const authoritySource = authority && typeof authority === 'object' ? authority : {}
  return normalizeCapacityType(source.capacityType || source.capacity_type || source.capacity || authoritySource.capacityType || authoritySource.capacity_type || authoritySource.authority || authoritySource.status)
}

function spouseConsentRequired(authority = {}) {
  if (!authority || typeof authority !== 'object') return false
  const status = key(authority.status || authority.maritalStatus || authority.marital_status)
  return bool(authority.spouseConsentRequired ?? authority.spouse_consent_required, status.includes('community') || status.includes('spouse_consent'))
}

function defaultSignersFromWorkspace(workspace = {}) {
  const mortgagor = workspace.canonicalData?.factsByKey?.mortgagor_identity_and_capacity?.value || {}
  const authority = workspace.canonicalData?.factsByKey?.buyer_marital_or_entity_authority?.value || {}
  const primaryCapacity = deriveCapacityFromFacts(mortgagor, authority)
  const signers = [{
    signerKey: 'primary_mortgagor',
    signerRole: primaryCapacity === C.self ? R.mortgagor : R.mortgagorRepresentative,
    partyRole: 'mortgagor',
    capacityType: primaryCapacity,
    signingOrder: 1,
    required: true,
  }]
  if (spouseConsentRequired(authority)) {
    signers.push({
      signerKey: 'consenting_spouse',
      signerRole: R.consentingSpouse,
      partyRole: 'consenting_spouse',
      capacityType: C.spouseConsent,
      signingOrder: 2,
      required: true,
    })
  }
  return signers
}

function normalizeEvidenceItem(input = {}, index = 0) {
  const source = input && typeof input === 'object' ? input : { referenceId: input }
  return Object.freeze({
    evidenceId: text(source.evidenceId || source.evidence_id || source.id) || `bond-signing-evidence-${index + 1}`,
    requirementKey: key(source.requirementKey || source.requirement_key || source.key || source.evidenceKey || source.evidence_key),
    status: normalizeEvidenceStatus(source.status || source.evidenceStatus || source.evidence_status, text(source.referenceId || source.reference_id || source.documentId || source.document_id) ? E.provided : E.missing),
    referenceId: text(source.referenceId || source.reference_id || source.documentId || source.document_id || source.fileId || source.file_id) || null,
    artifactHash: text(source.artifactHash || source.artifact_hash || source.contentHash || source.content_hash) || null,
    capturedAt: source.capturedAt || source.captured_at || null,
    verifiedAt: source.verifiedAt || source.verified_at || source.reviewedAt || source.reviewed_at || null,
    verifiedBy: actorSummary(source.verifiedBy || source.verified_by || {}),
    reason: text(source.reason || source.waiverReason || source.waiver_reason) || null,
  })
}

function normalizeEvidenceItems(items) {
  return Object.freeze(asArray(items).map(normalizeEvidenceItem))
}

function buildRequirement({ key: requirementKey, label, type = 'document', required = true, signatureEvidence = false }) {
  return Object.freeze({ key: requirementKey, label, type, required, signatureEvidence, requiresVerification: true })
}

function buildSignerRequirements(signer) {
  const requirements = [
    buildRequirement({ key: K.identityVerified, label: 'Signer identity verified', type: 'identity' }),
  ]
  if (signer.capacityType !== C.self) {
    requirements.push(buildRequirement({ key: K.capacityAuthority, label: 'Signing capacity / authority evidence', type: 'authority' }))
  }
  requirements.push(buildRequirement({ key: K.signedBondPack, label: 'Signed bond pack evidence', type: 'signed_document', signatureEvidence: true }))
  if (signer.originalRequired || signer.wetInkRequired) {
    requirements.push(buildRequirement({ key: K.originalSignedPackReceived, label: 'Original wet-ink bond pack received', type: 'original_document', signatureEvidence: true }))
  }
  if (signer.witnessRequired) {
    requirements.push(buildRequirement({ key: K.witnessAttestation, label: 'Witness / commissioner attestation evidence', type: 'attestation', signatureEvidence: true }))
  }
  return Object.freeze(requirements)
}

function evidenceMatchesRequirement(evidence, requirement) {
  return evidence.requirementKey === requirement.key || (!evidence.requirementKey && evidence.referenceId && requirement.key)
}

function evidenceSatisfiesRequirement(evidence) {
  if (!evidence) return false
  if (evidence.status === E.waived) return Boolean(evidence.reason)
  return evidence.status === E.verified
}

function buildEvidenceContract({ requirements, evidenceItems }) {
  const required = requirements.filter((requirement) => requirement.required !== false)
  const preSigningRequired = required.filter((requirement) => !SIGNATURE_REQUIREMENTS.has(requirement.key))
  const signatureRequired = required.filter((requirement) => SIGNATURE_REQUIREMENTS.has(requirement.key))
  const gaps = required.filter((requirement) => !evidenceItems.some((evidence) => evidenceMatchesRequirement(evidence, requirement) && evidenceSatisfiesRequirement(evidence)))
  const preSigningGaps = preSigningRequired.filter((requirement) => gaps.some((gap) => gap.key === requirement.key)).map((requirement) => requirement.key)
  const signatureGaps = signatureRequired.filter((requirement) => gaps.some((gap) => gap.key === requirement.key)).map((requirement) => requirement.key)
  const rejected = required.filter((requirement) => evidenceItems.some((evidence) => evidenceMatchesRequirement(evidence, requirement) && evidence.status === E.rejected)).map((requirement) => requirement.key)
  return Object.freeze({
    required: Object.freeze(required),
    provided: evidenceItems,
    preSigningGaps: Object.freeze(preSigningGaps),
    signatureGaps: Object.freeze(signatureGaps),
    evidenceGaps: Object.freeze(gaps.map((requirement) => requirement.key)),
    rejectedEvidenceKeys: Object.freeze(unique(rejected)),
    capacityReady: preSigningGaps.length === 0 && rejected.length === 0,
    signatureEvidenceComplete: signatureGaps.length === 0 && rejected.length === 0,
  })
}

function buildSignerBlockers(signer) {
  const blockers = []
  signer.evidenceContract.rejectedEvidenceKeys.forEach((requirementKey) => blockers.push(`signer_evidence_rejected:${requirementKey}`))
  signer.evidenceContract.preSigningGaps.forEach((requirementKey) => blockers.push(`signer_capacity_gap:${requirementKey}`))
  signer.evidenceContract.signatureGaps.forEach((requirementKey) => {
    if (requirementKey === K.originalSignedPackReceived) blockers.push('original_wet_ink_pack_missing')
    else blockers.push(`signature_evidence_gap:${requirementKey}`)
  })
  return Object.freeze(unique(blockers))
}

function signerStatus(signer) {
  if (signer.evidenceContract.rejectedEvidenceKeys.length || signer.evidenceContract.preSigningGaps.length) return SS.blocked
  if (signer.evidenceContract.signatureEvidenceComplete) return SS.signed
  if (signer.evidenceContract.signatureGaps.length < signer.signatureRequirementCount) return SS.partiallySigned
  return SS.readyToSign
}

function normalizeSigner(input = {}, index = 0, signingMethod) {
  const source = input && typeof input === 'object' ? input : { signerKey: input }
  const signerRole = normalizeSignerRole(source.signerRole || source.signer_role || source.role || source.partyRole || source.party_role)
  const capacityType = normalizeCapacityType(source.capacityType || source.capacity_type || source.capacity)
  const selectedMethod = normalizeMethod(source.selectedMethod || source.selected_method || source.method || source.signingMethod || source.signing_method, signingMethod.method)
  const signerKey = key(source.signerKey || source.signer_key || source.key || `${signerRole}_${index + 1}`) || `signer_${index + 1}`
  const base = {
    signerId: text(source.signerId || source.signer_id || source.id) || hash({ signerKey, signerRole, capacityType, index }),
    signerKey,
    signerReferenceHash: text(source.signerReferenceHash || source.signer_reference_hash) || hash({ signerKey, signerRole, capacityType }),
    signerRole,
    partyRole: key(source.partyRole || source.party_role || (signerRole === R.consentingSpouse ? 'consenting_spouse' : 'mortgagor')),
    capacityType,
    signingOrder: Math.max(1, Number(source.signingOrder || source.signing_order || index + 1) || index + 1),
    required: source.required !== false,
    selectedMethod,
    allowedMethods: Object.freeze(unique((Array.isArray(source.allowedMethods || source.allowed_methods) ? source.allowedMethods || source.allowed_methods : [selectedMethod]).map((item) => normalizeMethod(item, selectedMethod))).sort()),
    wetInkRequired: bool(source.wetInkRequired ?? source.wet_ink_required, signingMethod.wetInkRequired || selectedMethod === M.wetInk || selectedMethod === M.mixed),
    originalRequired: bool(source.originalRequired ?? source.original_required, signingMethod.originalRequired || selectedMethod === M.wetInk || selectedMethod === M.mixed),
    witnessRequired: bool(source.witnessRequired ?? source.witness_required, signingMethod.witnessRequired && [M.wetInk, M.mixed].includes(selectedMethod)),
  }
  const requirements = buildSignerRequirements(base)
  const evidenceContract = buildEvidenceContract({
    requirements,
    evidenceItems: normalizeEvidenceItems(source.evidence || source.signatureEvidence || source.signature_evidence),
  })
  const signer = {
    ...base,
    requirements,
    evidenceContract,
    signatureRequirementCount: requirements.filter((requirement) => requirement.signatureEvidence).length,
    capacityReady: evidenceContract.capacityReady,
    signatureEvidenceComplete: evidenceContract.signatureEvidenceComplete,
    status: SS.blocked,
    blockers: Object.freeze([]),
  }
  signer.status = signerStatus(signer)
  signer.blockers = buildSignerBlockers(signer)
  return Object.freeze(signer)
}

function signerSort(left, right) {
  return Number(left.signingOrder) - Number(right.signingOrder) || left.signerKey.localeCompare(right.signerKey)
}

function buildMetrics(signers = []) {
  const requiredSigners = signers.filter((signer) => signer.required !== false)
  return Object.freeze({
    signerCount: signers.length,
    requiredSignerCount: requiredSigners.length,
    capacityReadyCount: requiredSigners.filter((signer) => signer.capacityReady).length,
    signedRequiredCount: requiredSigners.filter((signer) => signer.signatureEvidenceComplete).length,
    wetInkSignerCount: requiredSigners.filter((signer) => signer.wetInkRequired).length,
    originalRequiredCount: requiredSigners.filter((signer) => signer.originalRequired).length,
    missingCapacityEvidenceCount: requiredSigners.reduce((sum, signer) => sum + signer.evidenceContract.preSigningGaps.length, 0),
    signatureEvidenceGapCount: requiredSigners.reduce((sum, signer) => sum + signer.evidenceContract.signatureGaps.length, 0),
    missingOriginalCount: requiredSigners.filter((signer) => signer.evidenceContract.signatureGaps.includes(K.originalSignedPackReceived)).length,
    rejectedEvidenceCount: requiredSigners.reduce((sum, signer) => sum + signer.evidenceContract.rejectedEvidenceKeys.length, 0),
  })
}

function deriveWorkspaceStatus({ conditionGateReady, signers, metrics }) {
  if (!conditionGateReady || !signers.length || metrics.missingCapacityEvidenceCount || metrics.rejectedEvidenceCount) return W.blocked
  if (metrics.signedRequiredCount === metrics.requiredSignerCount && metrics.requiredSignerCount > 0) return W.fullySigned
  if (metrics.signedRequiredCount > 0) return W.partiallySigned
  return W.prepared
}

function buildSigningFingerprint({ signers, signingMethod }) {
  return hash({
    signingMethod,
    signers: signers.map((signer) => ({
      signerKey: signer.signerKey,
      signerRole: signer.signerRole,
      signerReferenceHash: signer.signerReferenceHash,
      capacityType: signer.capacityType,
      selectedMethod: signer.selectedMethod,
      originalRequired: signer.originalRequired,
      wetInkRequired: signer.wetInkRequired,
      witnessRequired: signer.witnessRequired,
      requirements: signer.requirements.map((requirement) => requirement.key),
      evidence: signer.evidenceContract.provided.map((evidence) => ({
        requirementKey: evidence.requirementKey,
        status: evidence.status,
        referenceId: evidence.referenceId,
        artifactHash: evidence.artifactHash,
        verifiedAt: evidence.verifiedAt,
      })),
    })),
  })
}

function buildNextActionForSigner(signer) {
  if (signer.status === SS.signed) return null
  if (signer.evidenceContract.rejectedEvidenceKeys.length) {
    return Object.freeze({
      signerKey: signer.signerKey,
      signerRole: signer.signerRole,
      priority: 'high',
      actionLabel: 'Resolve rejected signing evidence',
      reason: `rejected:${signer.evidenceContract.rejectedEvidenceKeys[0]}`,
    })
  }
  if (signer.evidenceContract.preSigningGaps.length) {
    return Object.freeze({
      signerKey: signer.signerKey,
      signerRole: signer.signerRole,
      priority: 'high',
      actionLabel: 'Verify signer identity and capacity',
      reason: `capacity_gap:${signer.evidenceContract.preSigningGaps[0]}`,
    })
  }
  if (signer.evidenceContract.signatureGaps.includes(K.signedBondPack)) {
    return Object.freeze({
      signerKey: signer.signerKey,
      signerRole: signer.signerRole,
      priority: 'normal',
      actionLabel: 'Capture signed bond pack evidence',
      reason: `signature_gap:${K.signedBondPack}`,
    })
  }
  if (signer.evidenceContract.signatureGaps.includes(K.originalSignedPackReceived)) {
    return Object.freeze({
      signerKey: signer.signerKey,
      signerRole: signer.signerRole,
      priority: 'high',
      actionLabel: 'Receive original wet-ink bond pack',
      reason: `signature_gap:${K.originalSignedPackReceived}`,
    })
  }
  if (signer.evidenceContract.signatureGaps.includes(K.witnessAttestation)) {
    return Object.freeze({
      signerKey: signer.signerKey,
      signerRole: signer.signerRole,
      priority: 'normal',
      actionLabel: 'Attach witness attestation evidence',
      reason: `signature_gap:${K.witnessAttestation}`,
    })
  }
  return Object.freeze({
    signerKey: signer.signerKey,
    signerRole: signer.signerRole,
    priority: 'normal',
    actionLabel: 'Monitor signer',
    reason: signer.status,
  })
}

export function buildBondSigningNextActions(signingWorkspace = {}) {
  const conditionGateAction = signingWorkspace.conditionGate?.ready === false
    ? [Object.freeze({
        signerKey: null,
        signerRole: null,
        priority: 'high',
        actionLabel: 'Resolve bank conditions before signing',
        reason: 'condition_gate_not_ready',
      })]
    : []
  const signerActions = (signingWorkspace.signers || []).map(buildNextActionForSigner).filter(Boolean)
  return Object.freeze([...conditionGateAction, ...signerActions].sort((left, right) => {
    const priorityRank = { high: 0, normal: 1 }
    return (priorityRank[left.priority] ?? 9) - (priorityRank[right.priority] ?? 9) ||
      text(left.signerKey || '').localeCompare(text(right.signerKey || ''))
  }))
}

function buildChecklistModel(signingWorkspace) {
  return Object.freeze({
    version: BOND_ATTORNEY_PHASE6_VERSION,
    workspaceId: signingWorkspace.workspaceId,
    transactionId: signingWorkspace.transactionId,
    generatedAt: signingWorkspace.generatedAt,
    signingFingerprint: signingWorkspace.signingFingerprint,
    status: signingWorkspace.status,
    rows: Object.freeze(signingWorkspace.signers.map((signer) => Object.freeze({
      signerKey: signer.signerKey,
      signerRole: signer.signerRole,
      capacityType: signer.capacityType,
      signingOrder: signer.signingOrder,
      selectedMethod: signer.selectedMethod,
      wetInkRequired: signer.wetInkRequired,
      originalRequired: signer.originalRequired,
      status: signer.status,
      capacityReady: signer.capacityReady,
      signatureEvidenceComplete: signer.signatureEvidenceComplete,
      evidenceGaps: signer.evidenceContract.evidenceGaps,
      nextAction: buildNextActionForSigner(signer)?.actionLabel || 'No action required',
    }))),
  })
}

function buildAuditEvent({ workspace, signingWorkspace, actor, commandId, occurredAt }) {
  const base = buildBondPackWorkspaceAuditEvent({
    workspace,
    eventType: 'bond_signing_workspace_prepared',
    actor,
    commandId,
    occurredAt,
  })
  return Object.freeze({
    ...base,
    version: BOND_ATTORNEY_PHASE6_VERSION,
    workspaceEventVersion: base.version,
    releaseBlockerId: BOND_ATTORNEY_PHASE6_RELEASE_BLOCKER_ID,
    signingFingerprint: signingWorkspace.signingFingerprint,
    signingMetrics: signingWorkspace.metrics,
    conditionGateReady: signingWorkspace.conditionGate.ready,
    readyForPhase7: signingWorkspace.readyForPhase7,
    readyForBankSubmission: signingWorkspace.readyForBankSubmission,
  })
}

export function validateBondSigningWorkspace(signingWorkspace = {}) {
  const errors = []
  const warnings = []
  if (signingWorkspace.version !== BOND_ATTORNEY_PHASE6_VERSION) errors.push('signing_workspace_version_invalid')
  if (signingWorkspace.packWorkspaceValidation && signingWorkspace.packWorkspaceValidation.valid !== true) errors.push(...signingWorkspace.packWorkspaceValidation.errors.map((error) => `workspace:${error}`))
  if (signingWorkspace.conditionGate?.ready !== true) errors.push('condition_gate_not_ready')
  if (signingWorkspace.mortgagorFactStatus !== BOND_ATTORNEY_PHASE2_FACT_STATUSES.verified) errors.push('mortgagor_capacity_fact_not_verified')
  if (signingWorkspace.signingMethodFactStatus !== BOND_ATTORNEY_PHASE2_FACT_STATUSES.verified) errors.push('signing_method_fact_not_verified')
  if (!Array.isArray(signingWorkspace.signers) || !signingWorkspace.signers.length) errors.push('signer_contract_required')

  const signerKeys = (signingWorkspace.signers || []).map((signer) => signer.signerKey)
  if (new Set(signerKeys).size !== signerKeys.length) errors.push('duplicate_signer_key')

  ;(signingWorkspace.signers || []).forEach((signer) => {
    if (!signer.signerKey) errors.push('signer_key_required')
    if (!SIGNER_ROLE_SET.has(signer.signerRole)) errors.push(`signer_role_invalid:${signer.signerKey || 'unknown'}`)
    if (!CAPACITY_SET.has(signer.capacityType)) errors.push(`signer_capacity_invalid:${signer.signerKey || 'unknown'}`)
    if (!SIGNING_METHOD_SET.has(signer.selectedMethod)) errors.push(`signing_method_invalid:${signer.signerKey || 'unknown'}`)
    if (!signer.signerReferenceHash) errors.push(`signer_reference_hash_required:${signer.signerKey || 'unknown'}`)
    if (!signer.requirements?.some((requirement) => requirement.key === K.identityVerified)) errors.push(`identity_requirement_missing:${signer.signerKey || 'unknown'}`)
    if (!signer.requirements?.some((requirement) => requirement.key === K.signedBondPack)) errors.push(`signed_pack_requirement_missing:${signer.signerKey || 'unknown'}`)
    if (signer.originalRequired && !signer.requirements?.some((requirement) => requirement.key === K.originalSignedPackReceived)) errors.push(`original_requirement_missing:${signer.signerKey || 'unknown'}`)
    if (signer.witnessRequired && !signer.requirements?.some((requirement) => requirement.key === K.witnessAttestation)) errors.push(`witness_requirement_missing:${signer.signerKey || 'unknown'}`)
    signer.evidenceContract?.preSigningGaps?.forEach((gap) => warnings.push(`signer_capacity_gap:${signer.signerKey}:${gap}`))
    signer.evidenceContract?.signatureGaps?.forEach((gap) => warnings.push(`signature_evidence_gap:${signer.signerKey}:${gap}`))
    signer.evidenceContract?.rejectedEvidenceKeys?.forEach((gap) => errors.push(`signer_evidence_rejected:${signer.signerKey}:${gap}`))
  })

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(unique(errors)),
    warnings: Object.freeze(unique(warnings)),
  })
}

export function buildBondSigningWorkspace({
  workspace = null,
  transaction = {},
  lane = {},
  evidence = {},
  conditionRegister = null,
  signers = null,
  actor = {},
  commandId = 'bond-signing-workspace',
  generatedAt = new Date().toISOString(),
} = {}) {
  const effectiveWorkspace = workspace || buildBondPackWorkspace({ transaction, lane, evidence, generatedAt })
  const packWorkspaceValidation = validateBondPackWorkspace(effectiveWorkspace)
  const effectiveConditionRegister = conditionRegister || buildBondConditionRegister({
    workspace: effectiveWorkspace,
    actor,
    commandId: `${commandId}-condition-gate`,
    generatedAt,
  })
  const signingMethodFact = effectiveWorkspace.canonicalData?.factsByKey?.signing_method_and_signed_pack_status || null
  const mortgagorFact = effectiveWorkspace.canonicalData?.factsByKey?.mortgagor_identity_and_capacity || null
  const signingMethod = normalizeSigningMethod(signingMethodFact?.value || {})
  const signerSource = signers === null || signers === undefined ? defaultSignersFromWorkspace(effectiveWorkspace) : signers
  const normalizedSigners = Object.freeze(asArray(signerSource).map((signer, index) => normalizeSigner(signer, index, signingMethod)).sort(signerSort))
  const metrics = buildMetrics(normalizedSigners)
  const conditionGateReady = effectiveConditionRegister.readyForPhase6 === true
  const status = deriveWorkspaceStatus({ conditionGateReady, signers: normalizedSigners, metrics })
  const signingFingerprint = buildSigningFingerprint({ signers: normalizedSigners, signingMethod })
  const shell = Object.freeze({
    version: BOND_ATTORNEY_PHASE6_VERSION,
    releaseBlockerId: BOND_ATTORNEY_PHASE6_RELEASE_BLOCKER_ID,
    workspaceId: effectiveWorkspace.workspaceId,
    transactionId: effectiveWorkspace.transactionId,
    laneKey: 'bond',
    generatedAt,
    status,
    signingMethod,
    signingMethodFactStatus: signingMethodFact?.status || BOND_ATTORNEY_PHASE2_FACT_STATUSES.missing,
    signingMethodFactFingerprint: signingMethodFact?.fingerprint || null,
    mortgagorFactStatus: mortgagorFact?.status || BOND_ATTORNEY_PHASE2_FACT_STATUSES.missing,
    mortgagorFactFingerprint: mortgagorFact?.fingerprint || null,
    conditionGate: Object.freeze({
      ready: conditionGateReady,
      conditionFingerprint: effectiveConditionRegister.conditionFingerprint || null,
      validation: effectiveConditionRegister.validation || null,
      blockingOpenCount: effectiveConditionRegister.metrics?.blockingOpenCount ?? null,
      evidenceGapCount: effectiveConditionRegister.metrics?.evidenceGapCount ?? null,
    }),
    packWorkspaceValidation,
    signers: normalizedSigners,
    metrics,
    signingFingerprint,
    controls: BOND_SIGNING_WORKSPACE_CONTROL_BOUNDARY,
    readyForPhase7: false,
    readyForBankSubmission: false,
  })
  const validation = validateBondSigningWorkspace(shell)
  const readyForPhase7 = validation.valid &&
    metrics.requiredSignerCount > 0 &&
    metrics.capacityReadyCount === metrics.requiredSignerCount &&
    metrics.rejectedEvidenceCount === 0 &&
    BOND_SIGNING_WORKSPACE_CONTROL_BOUNDARY.signerCapacityTracked &&
    BOND_SIGNING_WORKSPACE_CONTROL_BOUNDARY.wetInkOriginalsTracked
  const readyForBankSubmission = readyForPhase7 &&
    metrics.signedRequiredCount === metrics.requiredSignerCount &&
    metrics.signatureEvidenceGapCount === 0 &&
    metrics.missingOriginalCount === 0 &&
    status === W.fullySigned
  const signingWorkspace = Object.freeze({
    ...shell,
    validation,
    nextActions: buildBondSigningNextActions(shell),
    checklistModel: buildChecklistModel(shell),
    readyForPhase7,
    readyForBankSubmission,
  })
  return Object.freeze({
    ...signingWorkspace,
    nextActions: buildBondSigningNextActions(signingWorkspace),
    checklistModel: buildChecklistModel(signingWorkspace),
    auditEvent: buildAuditEvent({ workspace: effectiveWorkspace, signingWorkspace, actor, commandId, occurredAt: generatedAt }),
  })
}

export function buildBondAttorneyPhase6BaselineReport(input = {}) {
  const signingWorkspace = buildBondSigningWorkspace(input)
  return Object.freeze({
    version: BOND_ATTORNEY_PHASE6_VERSION,
    releaseBlockerId: BOND_ATTORNEY_PHASE6_RELEASE_BLOCKER_ID,
    status: signingWorkspace.status,
    signerCount: signingWorkspace.metrics.signerCount,
    requiredSignerCount: signingWorkspace.metrics.requiredSignerCount,
    capacityReadyCount: signingWorkspace.metrics.capacityReadyCount,
    signedRequiredCount: signingWorkspace.metrics.signedRequiredCount,
    wetInkSignerCount: signingWorkspace.metrics.wetInkSignerCount,
    missingOriginalCount: signingWorkspace.metrics.missingOriginalCount,
    signatureEvidenceGapCount: signingWorkspace.metrics.signatureEvidenceGapCount,
    validation: signingWorkspace.validation,
    nextActionCount: signingWorkspace.nextActions.length,
    controls: signingWorkspace.controls,
    readyForPhase7: signingWorkspace.readyForPhase7,
    readyForBankSubmission: signingWorkspace.readyForBankSubmission,
  })
}
