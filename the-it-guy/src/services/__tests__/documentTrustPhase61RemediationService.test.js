import { describe, expect, it } from 'vitest'
import { buildDocumentTrustPhase61ReviewQueue } from '../documentTrustPhase61RemediationService'

describe('document trust Phase 6.1 remediation queue', () => {
  it('creates manual-only work for evidence without a satisfier and unlinked legacy rows', () => {
    const result = buildDocumentTrustPhase61ReviewQueue({
      canonicalRequirements: [
        { id: 'requirement-1', transaction_id: 'transaction-1', status: 'approved', satisfied_by_document_id: null },
      ],
      legacyRequiredDocuments: [
        { id: 'legacy-1', transaction_id: 'transaction-1', enabled: true, canonical_requirement_instance_id: null },
      ],
    })

    expect(result.status).toBe('review_required')
    expect(result.summary.total).toBe(2)
    expect(result.queue.every((item) => item.instruction.includes('explicitly'))).toBe(true)
    expect(result.safety.automaticMatching).toBe(false)
  })

  it('does not queue inactive legacy rows or pending requirements', () => {
    const result = buildDocumentTrustPhase61ReviewQueue({
      canonicalRequirements: [{ id: 'pending', status: 'requested', satisfied_by_document_id: null }],
      legacyRequiredDocuments: [{ id: 'disabled', enabled: false, canonical_requirement_instance_id: null }],
    })

    expect(result.status).toBe('clear')
    expect(result.summary.total).toBe(0)
  })

  it('keeps conflicting document links manual-only', () => {
    const result = buildDocumentTrustPhase61ReviewQueue({
      canonicalRequirements: [{ id: 'requirement-1', transaction_id: 'transaction-1', status: 'approved', satisfied_by_document_id: 'document-1' }],
      documents: [{ id: 'document-1', canonical_requirement_instance_id: 'requirement-elsewhere' }],
    })

    expect(result.summary.conflictingDocumentLinkCount).toBe(1)
    expect(result.queue[0].action).toBe('manual_resolve_conflicting_document_link')
  })
})
