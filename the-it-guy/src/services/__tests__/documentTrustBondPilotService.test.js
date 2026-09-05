import { expect, test } from 'vitest'
import { buildDocumentTrustBondPilotPreflight } from '../documentTrustBondPilotService.js'

const readinessReport = {
  reportVersion: 'phase-r1-originator-internal-readiness-v1',
  status: 'ready',
}
const originator = { id: 'originator-1', name: 'Pilot Originator' }
const packages = [{
  id: 'package-1',
  transactionId: 'transaction-1',
  destinationKey: 'bond_originator_intake',
  status: 'ready_for_originator',
  assignment: { assignedToProfileId: 'originator-1' },
}]
const pilotControls = { supportOwner: 'Operations', rollbackOwner: 'Operations' }

test('Phase 5 blocks a bond pilot when handoff evidence is not canonically linked', () => {
  const preflight = buildDocumentTrustBondPilotPreflight({
    readinessReport,
    originatorRecipient: originator,
    packages,
    pilotControls,
    phase4Enabled: true,
    canonicalDocumentLinks: [{ documentId: 'document-1' }],
  })
  expect(preflight.status).toBe('blocked')
  expect(preflight.issues.some((issue) => issue.key === 'canonical_document_handoff_complete')).toBe(true)
})

test('Phase 5 requires Phase 4 and accepts a bounded, exact canonical handoff', () => {
  const preflight = buildDocumentTrustBondPilotPreflight({
    readinessReport,
    originatorRecipient: originator,
    packages,
    pilotControls,
    phase4Enabled: true,
    canonicalDocumentLinks: [{
      documentId: 'document-1',
      canonicalRequirementInstanceId: 'requirement-1',
    }],
  })
  expect(preflight.status).toBe('ready')
  expect(preflight.workflowBoundary).toMatchObject({
    canonicalDocumentLinksRequired: true,
    buyerCanonicalReadFenceRequired: true,
    maximumActiveOriginators: 1,
    automaticBankSubmission: false,
  })
})
