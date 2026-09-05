export const DOCUMENT_TRUST_PHASE61_REMEDIATION_VERSION = 'document-trust-phase61-confirmed-remediation-v1'

const EVIDENCE_STATUSES = new Set(['uploaded', 'under_review', 'approved', 'completed'])

function text(value = '') {
  return String(value || '').trim()
}

function rows(value) {
  return Array.isArray(value) ? value : []
}

export function buildDocumentTrustPhase61ReviewQueue({
  canonicalRequirements = [],
  documents = [],
  legacyRequiredDocuments = [],
} = {}) {
  const documentsById = new Map(rows(documents).map((document) => [text(document?.id), document]).filter(([id]) => id))
  const evidenceRequirements = rows(canonicalRequirements).filter((requirement) =>
    EVIDENCE_STATUSES.has(text(requirement?.status).toLowerCase()),
  )
  const requirementDocumentQueue = evidenceRequirements.flatMap((requirement) => {
    const documentId = text(requirement?.satisfied_by_document_id || requirement?.satisfiedByDocumentId)
    const document = documentsById.get(documentId)
    const linkedRequirementId = text(document?.canonical_requirement_instance_id || document?.canonicalRequirementInstanceId)
    const common = {
      requirementInstanceId: requirement.id,
      transactionId: requirement.transaction_id || requirement.transactionId || null,
      status: requirement.status,
    }
    if (!documentId || !document) return [{
      ...common,
      type: 'requirement_document_link',
      action: 'manual_confirm_requirement_document_link',
      instruction: 'A reviewer must explicitly select a same-transaction document ID. No automatic candidate is supplied.',
    }]
    if (linkedRequirementId !== text(requirement.id)) return [{
      ...common,
      type: 'conflicting_requirement_document_link',
      documentId,
      linkedRequirementInstanceId: linkedRequirementId || null,
      action: 'manual_resolve_conflicting_document_link',
      instruction: 'The selected document is already linked elsewhere. Resolve the conflicting lifecycle history manually; this tool will not overwrite it.',
    }]
    return []
  })
  const missingLegacyLinks = rows(legacyRequiredDocuments)
    .filter((row) => row?.enabled !== false && !text(row?.canonical_requirement_instance_id || row?.canonicalRequirementInstanceId))
    .map((row) => ({
      type: 'legacy_requirement_link',
      legacyRequiredDocumentId: row.id,
      transactionId: row.transaction_id || row.transactionId || null,
      action: 'manual_confirm_legacy_requirement_link',
      instruction: 'A reviewer must explicitly select a same-transaction canonical requirement ID. No automatic candidate is supplied.',
    }))

  return {
    version: DOCUMENT_TRUST_PHASE61_REMEDIATION_VERSION,
    status: requirementDocumentQueue.length || missingLegacyLinks.length ? 'review_required' : 'clear',
    queue: [...requirementDocumentQueue, ...missingLegacyLinks],
    summary: {
      missingSatisfierCount: requirementDocumentQueue.filter((item) => item.type === 'requirement_document_link').length,
      conflictingDocumentLinkCount: requirementDocumentQueue.filter((item) => item.type === 'conflicting_requirement_document_link').length,
      missingLegacyCanonicalLinkCount: missingLegacyLinks.length,
      total: requirementDocumentQueue.length + missingLegacyLinks.length,
    },
    safety: {
      automaticMatching: false,
      requiresExplicitIdentifiers: true,
      requiresActorReference: true,
      mutationsRequireConfirmation: true,
    },
  }
}
