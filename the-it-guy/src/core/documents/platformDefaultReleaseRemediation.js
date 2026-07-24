import { assessLegalTemplateApproval, PHASE4_B3_RELEASE_CONTRACT } from './legalTemplateApproval.js'
import { assessNativeStarterTemplate } from './nativeStarterTemplateAssurance.js'
import {
  assessPlatformDefaultReleaseGate,
  hydratePlatformTemplates,
  PLATFORM_DEFAULT_TEMPLATE_KEYS,
} from './platformDefaultReleaseGate.js'

export const PLATFORM_DEFAULT_REMEDIATION_CONTRACT = 'legal-template-platform-default-remediation-v1'
export const PLATFORM_DEFAULT_REMEDIATION_WRITE_FLAG = 'LEGAL_TEMPLATE_PLATFORM_DEFAULTS_PHASE8_WRITE'
export const PLATFORM_DEFAULT_REMEDIATION_BLOCKER_CODES = Object.freeze({
  mandateCounselReviewRequired: 'PHASE8_MANDATE_COUNSEL_REVIEW_REQUIRED',
  otpCounselReviewRequired: 'PHASE8_OTP_COUNSEL_REVIEW_REQUIRED',
})

const PACKET_TYPES = Object.freeze(['mandate', 'otp'])
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/i

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function iso(value) {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : ''
}

function isPlatformTemplate(template = {}, packetType = '') {
  return !text(template.organisation_id || template.organisationId) &&
    lower(template.module_type || template.moduleType) === 'agency' &&
    lower(template.packet_type || template.packetType) === packetType &&
    lower(template.template_key || template.templateKey) === PLATFORM_DEFAULT_TEMPLATE_KEYS[packetType]
}

function sortCandidates(left, right) {
  const leftStarter = assessNativeStarterTemplate(left)
  const rightStarter = assessNativeStarterTemplate(right)
  const score = (template, starter) => [
    lower(template.status) === 'published' ? 1 : 0,
    template.is_active === true ? 1 : 0,
    template.is_default === true ? 1 : 0,
    starter.ready ? 1 : 0,
    Array.isArray(template.sections) ? template.sections.length : 0,
    Date.parse(template.updated_at || template.updatedAt || template.created_at || template.createdAt || '') || 0,
  ]
  const leftScore = score(left, leftStarter)
  const rightScore = score(right, rightStarter)
  for (let index = 0; index < leftScore.length; index += 1) {
    if (leftScore[index] !== rightScore[index]) return rightScore[index] - leftScore[index]
  }
  return text(left.id).localeCompare(text(right.id))
}

function selectCandidate(templates = [], packetType = '') {
  return templates
    .filter((template) => isPlatformTemplate(template, packetType))
    .sort(sortCandidates)[0] || null
}

function readApprovalFacts(template = {}) {
  const metadata = record(template.metadata_json || template.metadataJson)
  const nested = record(metadata.legal_review || metadata.legalReview)
  return {
    status: lower(metadata.legal_review_status || metadata.legalApprovalStatus || nested.status),
    approvedAt: text(metadata.legal_approved_at || metadata.legalApprovedAt || nested.approvedAt),
    reference: text(metadata.legal_approval_reference || metadata.legalApprovalReference || nested.reference),
    approvedBy: text(metadata.legal_approved_by || metadata.legalApprovedBy || nested.approvedBy),
    contentDigest: text(metadata.legal_approval_content_digest || metadata.legalApprovalContentDigest || nested.contentDigest),
    reviewEvidenceDigest: text(metadata.legal_counsel_review_evidence_digest || metadata.legalCounselReviewEvidenceDigest || nested.reviewEvidenceDigest),
    b1ManifestDigest: text(metadata.legal_b1_manifest_digest || metadata.legalB1ManifestDigest),
    b3AppliedAt: text(metadata.legal_b3_applied_at || metadata.legalB3AppliedAt),
    b3AppliedBy: text(metadata.legal_b3_applied_by || metadata.legalB3AppliedBy),
    b3ApplicationReference: text(metadata.legal_b3_application_reference || metadata.legalB3ApplicationReference),
    phase4B3ReleaseContract: text(metadata.legal_phase4_b3_release_contract || metadata.legalPhase4B3ReleaseContract),
  }
}

function b3ReplayEligibility(template = {}) {
  const approval = readApprovalFacts(template)
  const reasons = []
  if (lower(template.status) !== 'published') reasons.push('TEMPLATE_NOT_PUBLISHED')
  if (template.is_active !== true) reasons.push('TEMPLATE_NOT_ACTIVE')
  if (approval.status !== 'approved') reasons.push('LEGAL_REVIEW_NOT_APPROVED')
  if (!approval.approvedAt || !Number.isFinite(Date.parse(approval.approvedAt))) reasons.push('LEGAL_APPROVAL_DATE_MISSING')
  if (!approval.reference) reasons.push('LEGAL_APPROVAL_REFERENCE_MISSING')
  if (!approval.approvedBy) reasons.push('LEGAL_APPROVED_BY_MISSING')
  if (!DIGEST_PATTERN.test(approval.contentDigest)) reasons.push('LEGAL_APPROVAL_CONTENT_DIGEST_INVALID')
  if (!DIGEST_PATTERN.test(approval.reviewEvidenceDigest)) reasons.push('LEGAL_COUNSEL_REVIEW_EVIDENCE_INVALID')
  if (!DIGEST_PATTERN.test(approval.b1ManifestDigest)) reasons.push('LEGAL_B1_MANIFEST_DIGEST_INVALID')

  return {
    eligible: reasons.length === 0,
    reasons,
    approval,
    rpcPayload: reasons.length === 0
      ? {
          templateId: text(template.id),
          packetType: lower(template.packet_type || template.packetType),
          decision: 'approved',
          contentDigest: approval.contentDigest,
          reviewEvidenceDigest: approval.reviewEvidenceDigest,
          reviewedBy: approval.approvedBy,
          reviewedAt: approval.approvedAt,
          reviewReference: approval.reference,
          b1ManifestDigest: approval.b1ManifestDigest,
        }
      : null,
  }
}

function hasProtectedProvenance(template = {}, provenanceRows = []) {
  const approval = readApprovalFacts(template)
  return (Array.isArray(provenanceRows) ? provenanceRows : []).some((row) => (
    text(row.template_id || row.templateId) === text(template.id) &&
    text(row.content_digest || row.contentDigest) === approval.contentDigest &&
    text(row.review_evidence_digest || row.reviewEvidenceDigest) === approval.reviewEvidenceDigest &&
    text(row.b1_manifest_digest || row.b1ManifestDigest) === approval.b1ManifestDigest &&
    text(row.review_reference || row.reviewReference) === approval.reference &&
    text(row.reviewed_by || row.reviewedBy) === approval.approvedBy &&
    iso(row.reviewed_at || row.reviewedAt) === iso(approval.approvedAt) &&
    text(row.b3_applied_by || row.b3AppliedBy) === approval.b3AppliedBy &&
    text(row.b3_application_reference || row.b3ApplicationReference) === approval.b3ApplicationReference &&
    text(row.release_contract || row.releaseContract) === PHASE4_B3_RELEASE_CONTRACT &&
    iso(row.b3_applied_at || row.b3AppliedAt) === iso(approval.b3AppliedAt)
  ))
}

function action(actions, value) {
  actions.push({
    safeAutomation: true,
    requiresWriteFlag: true,
    ...value,
  })
}

function blocker(blockers, value) {
  blockers.push(value)
}

function buildPacketPlan({ packetType, templates, releaseGate, provenanceRows }) {
  const actions = []
  const blockers = []
  const warnings = []
  const candidate = selectCandidate(templates, packetType)
  const matching = templates.filter((template) => isPlatformTemplate(template, packetType))
  const gatePacket = releaseGate.evidence?.templates?.[packetType] || {}
  const gateBlockerCodes = new Set((gatePacket.blockers || []).map((item) => item.code))
  const gateWarningCodes = new Set((gatePacket.warnings || []).map((item) => item.code))

  if (!candidate) {
    blocker(blockers, {
      code: `PHASE8_${packetType.toUpperCase()}_PLATFORM_DEFAULT_MISSING`,
      detail: `No global agency ${packetType} platform default exists for ${PLATFORM_DEFAULT_TEMPLATE_KEYS[packetType]}.`,
    })
    return { packetType, candidateTemplateId: null, actions, blockers, warnings }
  }

  const starter = assessNativeStarterTemplate(candidate)
  const approval = assessLegalTemplateApproval(candidate, { expectedPacketType: packetType })
  const shouldNormalise = gateBlockerCodes.has(`P7_GLOBAL_${packetType.toUpperCase()}_DEFAULT_CARDINALITY`) ||
    gateBlockerCodes.has(`P7_GLOBAL_${packetType.toUpperCase()}_NOT_DEFAULT`) ||
    gateBlockerCodes.has(`P7_GLOBAL_${packetType.toUpperCase()}_NOT_ACTIVE`)

  if (shouldNormalise) {
    if (lower(candidate.status) !== 'published' || !starter.ready) {
      blocker(blockers, {
        code: `PHASE8_${packetType.toUpperCase()}_NATIVE_STARTER_FIX_REQUIRED`,
        detail: `Cannot safely promote the ${packetType} platform default until it is a published native starter.`,
        templateId: text(candidate.id),
        starterBlockers: starter.blockers,
      })
    } else {
      action(actions, {
        type: 'normalise_global_default_route',
        applyMethod: 'supabase_update',
        packetType,
        templateId: text(candidate.id),
        scopeTemplateIds: matching.map((template) => text(template.id)).filter(Boolean),
        detail: `Make ${candidate.template_key || PLATFORM_DEFAULT_TEMPLATE_KEYS[packetType]} the single active/default global ${packetType} route and archive sibling global defaults.`,
      })
    }
  }

  if (gateWarningCodes.has(`P7_GLOBAL_${packetType.toUpperCase()}_PLATFORM_DEFAULT_MARKER_MISSING`)) {
    warnings.push({
      code: `PHASE8_${packetType.toUpperCase()}_ROUTE_MARKER_DEFERRED`,
      detail: 'The explicit platform-default route marker is missing. Because published template metadata is immutable, add it only through a new revision or a dedicated service-owned metadata migration.',
      templateId: text(candidate.id),
    })
  }

  const b3 = b3ReplayEligibility(candidate)
  const runtimeMissing = gateBlockerCodes.has(`P7_GLOBAL_${packetType.toUpperCase()}_NOT_RUNTIME_RELEASED`)
  const provenanceMissing = approval.approved && !hasProtectedProvenance(candidate, provenanceRows)

  if (runtimeMissing || provenanceMissing) {
    if (b3.eligible) {
      action(actions, {
        type: 'apply_b3_runtime_release',
        applyMethod: 'bridge_apply_legal_document_counsel_approvals',
        packetType,
        templateId: text(candidate.id),
        detail: `Replay the service-owned B3 runtime release for the ${packetType} platform default so metadata and protected provenance match.`,
        approval: b3.rpcPayload,
      })
    } else {
      blocker(blockers, {
        code: `PHASE8_${packetType.toUpperCase()}_COUNSEL_REVIEW_REQUIRED`,
        detail: `The ${packetType} platform default cannot be runtime-released automatically because counsel/B1 evidence is incomplete.`,
        templateId: text(candidate.id),
        reasons: b3.reasons,
      })
    }
  }

  return {
    packetType,
    candidateTemplateId: text(candidate.id),
    gateReady: gatePacket.ready === true,
    nativeStarterReady: starter.ready,
    legalApprovalReady: approval.approved,
    protectedProvenanceReady: approval.approved ? hasProtectedProvenance(candidate, provenanceRows) : false,
    actions,
    blockers,
    warnings,
  }
}

export function buildPlatformDefaultReleaseRemediationPlan({
  templates = [],
  sections = [],
  provenanceRows = [],
  releaseGateCertificate = null,
} = {}) {
  const hydrated = hydratePlatformTemplates(templates, sections)
  const releaseGate = releaseGateCertificate || assessPlatformDefaultReleaseGate({ templates, sections })
  const packets = PACKET_TYPES.map((packetType) => buildPacketPlan({
    packetType,
    templates: hydrated,
    releaseGate,
    provenanceRows,
  }))
  const actions = packets.flatMap((packet) => packet.actions)
  const blockers = packets.flatMap((packet) => packet.blockers)
  const warnings = packets.flatMap((packet) => packet.warnings)
  const status = releaseGate.status === 'GO' && packets.every((packet) => packet.protectedProvenanceReady)
    ? 'NO_REPAIR_NEEDED'
    : actions.length && blockers.length
      ? 'PARTIAL_REPAIR_AVAILABLE'
      : actions.length
        ? 'READY_TO_APPLY'
        : 'BLOCKED_MANUAL_REVIEW_REQUIRED'

  return {
    phase: 8,
    contract: PLATFORM_DEFAULT_REMEDIATION_CONTRACT,
    status,
    mutatedData: false,
    writeFlag: PLATFORM_DEFAULT_REMEDIATION_WRITE_FLAG,
    actionCount: actions.length,
    blockerCount: blockers.length,
    warningCount: warnings.length,
    actions,
    blockers,
    warnings,
    packets,
    releaseGate: {
      phase: releaseGate.phase,
      contract: releaseGate.contract,
      status: releaseGate.status,
      blockerCount: releaseGate.blockerCount,
      warningCount: releaseGate.warningCount,
    },
    checkedAt: new Date().toISOString(),
  }
}
