import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSellerDocumentSourceOfTruth } from '../sellerDocumentRequirementsService.js'
import { buildSellerDocumentWorkflow } from '../../core/documents/sellerDocumentWorkflow.js'

const requirement = { id: 'disclosure', key: 'signed_disclosure_form', is_required: true, status: 'required' }
const disclosure = {
  signature: 'seller signature',
  signedAt: '2026-09-27T10:00:00.000Z',
  declarationAccepted: true,
  decision: 'none',
  sellerDisclosureAcknowledgements: {
    acknowledgements: [
      { key: 'terms_and_conditions', required: true, accepted: true },
      { key: 'privacy_and_paia_notice', required: true, accepted: true },
      { key: 'disclosure_accuracy', required: true, accepted: true },
    ],
  },
}

function projectDisclosure(formOverrides = {}, documents = []) {
  const formData = {
    sellerFirstName: 'Seller',
    sellerSurname: 'One',
    ownershipType: 'individual',
    maritalStatus: 'not_married',
    propertyDisclosure: disclosure,
    sellerComplianceSigners: [],
    sellerPostOnboardingDrafts: {
      documents: [{ key: 'signed_disclosure_form', status: 'awaiting_agent_review', generatedHtml: '<html>frozen signed disclosure</html>' }],
    },
    sellerOnboardingManualSigningPack: {
      status: 'awaiting_signed_hard_copy',
      documents: [{ key: 'signed_disclosure_form', generatedHtml: '<html>old physical copy</html>' }],
    },
    ...formOverrides,
  }
  return buildSellerDocumentSourceOfTruth({
    listing: {
      id: 'listing-1',
      sellerOnboarding: { status: 'completed' },
      documentRequirements: [requirement],
      documents,
    },
    formData,
  }).rows.find((row) => row.key === 'signed_disclosure_form')
}

test('unsigned disclosure defaults and agent-captured answers leave the three document routes available', () => {
  for (const propertyDisclosure of [
    { signature: '', signedAt: '', declarationAccepted: false, responses: {} },
    { signature: '', signedAt: '', responses: { roof: { answer: 'no' } }, captureMode: 'agent_assisted' },
  ]) {
    for (const documents of [[], [{ key: 'signed_disclosure_form', artifactStage: 'review_draft', status: 'awaiting_agent_review', generatedHtml: '<html>unsigned frozen answers</html>' }]]) {
      const row = projectDisclosure({ propertyDisclosure, sellerPostOnboardingDrafts: { documents }, sellerOnboardingManualSigningPack: {} })
      assert.equal(row.status, 'required')
      assert.equal(row.complete, false)
      assert.equal(row.hasUpload, false)
      assert.equal(row.canUpload, true)
      const workflow = buildSellerDocumentWorkflow({ item: row })
      assert.equal(workflow.state, 'not_prepared')
      assert.equal(workflow.canPrepare, true)
      assert.equal(workflow.canSend, true)
      assert.equal(workflow.canUpload, true)
    }
  }
})

test('completed single-seller onboarding uses the frozen signed disclosure over an old physical copy', () => {
  const row = projectDisclosure()
  assert.equal(row.status, 'completed')
  assert.equal(row.complete, true)
  assert.equal(row.artifactStage, 'final_signed')
  assert.equal(row.canDownload, true)
  assert.equal(row.canUpload, false)
  assert.equal(row.upload.generatedHtml, '<html>frozen signed disclosure</html>')
})

test('a second required owner keeps the disclosure awaiting signatures without a physical upload prompt', () => {
  const row = projectDisclosure({ ownershipType: 'multiple_owners', owners: [{ name: 'Seller One' }, { name: 'Seller Two' }] })
  assert.equal(row.status, 'awaiting_required_signatures')
  assert.equal(row.statusLabel, 'Awaiting signatures')
  assert.equal(row.complete, false)
  assert.equal(row.artifactStage, 'signing_copy')
  assert.equal(row.canDownload, false)
  assert.equal(row.canUpload, false)
  assert.equal(row.upload.generatedHtml, '<html>frozen signed disclosure</html>')
})

test('a signature without a named seller cannot complete disclosure', () => {
  const row = projectDisclosure({ sellerFirstName: '', sellerSurname: '' })
  assert.equal(row.status, 'awaiting_required_signatures')
  assert.equal(row.complete, false)
  assert.equal(row.canDownload, false)
})

test('an agent reviewed route replaces the partial onboarding disclosure placeholder', () => {
  const row = projectDisclosure({
    ownershipType: 'multiple_owners', owners: [{ name: 'Seller One' }, { name: 'Seller Two' }],
    sellerOnboardingManualSigningPack: {
      status: 'awaiting_signature',
      documents: [{ key: 'signed_disclosure_form', signingRoute: 'digital_pack', versionId: 'reviewed-disclosure', versionDigest: 'digest', contentDigest: 'content', generatedHtml: '<html>reviewed disclosure</html>' }],
    },
  })
  assert.equal(row.status, 'awaiting_signature')
  assert.equal(row.canUpload, false)
  assert.equal(row.upload.generatedHtml, '<html>reviewed disclosure</html>')
})

test('without a frozen draft, completed onboarding generates disclosure evidence from the signed form', () => {
  const row = projectDisclosure({ sellerPostOnboardingDrafts: { documents: [] } })
  assert.equal(row.status, 'completed')
  assert.equal(row.complete, true)
  assert.equal(row.canDownload, true)
  assert.match(row.upload.generatedHtml, /seller signature/)
})

test('a stale pending-signature certificate is refreshed using the frozen agency branding', () => {
  const row = projectDisclosure({
    sellerPostOnboardingDrafts: {
      documents: [{
        key: 'signed_disclosure_form',
        status: 'awaiting_agent_review',
        generatedHtml: '<h1>Signature Certificate</h1><strong>Pending signatures</strong>',
        metadata: { brandingSnapshot: { organisationName: 'Original Agency' } },
      }],
    },
  })
  assert.equal(row.status, 'completed')
  assert.match(row.upload.generatedHtml, /Original Agency/)
  assert.match(row.upload.generatedHtml, /seller signature/)
  assert.doesNotMatch(row.upload.generatedHtml, /Pending signatures/)
  assert.equal(row.original.document.metadata.reconciledFromSignedOnboarding, true)
})

test('an actual uploaded disclosure remains authoritative over generated onboarding evidence', () => {
  const row = projectDisclosure({}, [{
    id: 'uploaded-disclosure',
    document_type: 'signed_disclosure_form',
    status: 'approved',
    storage_path: 'seller/signed-disclosure.pdf',
  }])
  assert.equal(row.original.document.id, 'uploaded-disclosure')
  assert.equal(row.complete, true)
})
