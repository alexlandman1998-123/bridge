export const DOCUMENT_TRUST_PHASE6_ASSURANCE_VERSION = 'document-trust-phase6-operational-assurance-v1'

const DOCUMENT_EVIDENCE_STATUSES = new Set(['uploaded', 'under_review', 'approved', 'completed'])

function text(value = '') {
  return String(value || '').trim()
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function issue(key, message, evidence = {}) {
  return { key, severity: 'blocking', message, evidence }
}

export function evaluateDocumentTrustOperationalAssurance({
  canonicalRequirements = [],
  documents = [],
  legacyRequiredDocuments = [],
  phase4Enabled = false,
  phase5Pilot = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const documentById = new Map(list(documents).map((document) => [text(document?.id), document]).filter(([id]) => id))
  const evidenceRequirements = list(canonicalRequirements).filter((requirement) =>
    DOCUMENT_EVIDENCE_STATUSES.has(text(requirement?.status).toLowerCase()),
  )
  const brokenCanonicalLinks = evidenceRequirements.flatMap((requirement) => {
    const requirementId = text(requirement?.id)
    const documentId = text(requirement?.satisfied_by_document_id || requirement?.satisfiedByDocumentId)
    const document = documentById.get(documentId)
    if (!documentId || !document) return [{ requirementId, documentId: documentId || null, reason: 'missing_satisfied_document' }]
    const linkedRequirementId = text(document?.canonical_requirement_instance_id || document?.canonicalRequirementInstanceId)
    return linkedRequirementId === requirementId
      ? []
      : [{ requirementId, documentId, linkedRequirementId: linkedRequirementId || null, reason: 'document_not_exactly_linked' }]
  })
  const activeLegacyRows = list(legacyRequiredDocuments).filter((row) => row?.enabled !== false && row?.is_active !== false)
  const legacyRowsWithoutCanonicalLink = activeLegacyRows.filter((row) =>
    !text(row?.canonical_requirement_instance_id || row?.canonicalRequirementInstanceId),
  )
  const pilotActive = phase5Pilot && ['ready', 'active'].includes(text(phase5Pilot?.status).toLowerCase())
  const pilotBoundaryBroken = pilotActive && (
    Number(phase5Pilot?.scope?.maximumActiveOriginators || phase5Pilot?.maximum_active_originators || 0) !== 1 ||
    phase5Pilot?.workflowBoundary?.noAutomaticBankSubmission !== true ||
    phase5Pilot?.workflowBoundary?.liveDeliveryEnabled !== false ||
    phase5Pilot?.workflowBoundary?.bankWorkflowUnchanged !== true
  )

  const issues = [
    ...brokenCanonicalLinks.map((entry) => issue(
      'canonical_link_broken',
      'A canonical requirement with document evidence is not linked to its exact shared document.',
      entry,
    )),
    ...(phase4Enabled && legacyRowsWithoutCanonicalLink.length
      ? [issue(
          'phase4_legacy_read_dependency',
          'Phase 4 is enabled while active legacy required-document rows still lack canonical links.',
          { count: legacyRowsWithoutCanonicalLink.length, ids: legacyRowsWithoutCanonicalLink.map((row) => row?.id).filter(Boolean) },
        )]
      : []),
    ...(pilotBoundaryBroken
      ? [issue(
          'phase5_pilot_boundary_broken',
          'An active/ready Phase 5 pilot no longer has its one-originator/manual-processing safety boundary.',
          { pilotId: phase5Pilot?.id || null, status: phase5Pilot?.status || null },
        )]
      : []),
  ]

  return {
    version: DOCUMENT_TRUST_PHASE6_ASSURANCE_VERSION,
    generatedAt,
    status: issues.length ? 'blocked' : 'healthy',
    summary: {
      canonicalRequirementCount: list(canonicalRequirements).length,
      evidenceRequirementCount: evidenceRequirements.length,
      brokenCanonicalLinkCount: brokenCanonicalLinks.length,
      activeLegacyRequiredDocumentCount: activeLegacyRows.length,
      legacyRowsWithoutCanonicalLinkCount: legacyRowsWithoutCanonicalLink.length,
      phase4Enabled: phase4Enabled === true,
      phase5PilotStatus: phase5Pilot?.status || null,
      issueCount: issues.length,
    },
    issues,
    controls: {
      phase4ReadFence: phase4Enabled === true ? 'observed_enabled' : 'not_enabled',
      phase5PilotBoundary: pilotActive ? (pilotBoundaryBroken ? 'broken' : 'healthy') : 'not_active',
      readOnly: true,
      deletesRows: false,
      writesDocumentRequests: false,
    },
  }
}
