import { expect, test } from 'vitest'
import { evaluateDocumentTrustOperationalAssurance } from '../documentTrustOperationalAssuranceService.js'

const healthyInput = {
  phase4Enabled: true,
  canonicalRequirements: [{ id: 'requirement-1', status: 'under_review', satisfied_by_document_id: 'document-1' }],
  documents: [{ id: 'document-1', canonical_requirement_instance_id: 'requirement-1' }],
  legacyRequiredDocuments: [{ id: 'legacy-1', enabled: false }],
  phase5Pilot: {
    id: 'pilot-1',
    status: 'active',
    scope: { maximumActiveOriginators: 1 },
    workflowBoundary: {
      noAutomaticBankSubmission: true,
      liveDeliveryEnabled: false,
      bankWorkflowUnchanged: true,
    },
  },
}

test('Phase 6 reports healthy only for exact canonical links and intact pilot boundary', () => {
  expect(evaluateDocumentTrustOperationalAssurance(healthyInput)).toMatchObject({
    status: 'healthy',
    controls: { readOnly: true, deletesRows: false },
  })
})

test('Phase 6 blocks a mismatched document link and legacy dependency after the Phase 4 cutover', () => {
  const report = evaluateDocumentTrustOperationalAssurance({
    ...healthyInput,
    documents: [{ id: 'document-1', canonical_requirement_instance_id: 'other-requirement' }],
    legacyRequiredDocuments: [{ id: 'legacy-1', enabled: true }],
  })
  expect(report.status).toBe('blocked')
  expect(report.issues.map((entry) => entry.key)).toEqual([
    'canonical_link_broken',
    'phase4_legacy_read_dependency',
  ])
})
