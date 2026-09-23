import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSellerDocumentSourceOfTruth } from '../sellerDocumentRequirementsService.js'

const requiredDocuments = [
  { id: 'r-disclosure', key: 'signed_disclosure_form', label: 'Signed Mandatory Disclosure / Defects Form', status: 'required', is_required: true, group: 'legal' },
  { id: 'r-fica', key: 'signed_fica_declaration', label: 'Signed FICA Declaration', status: 'required', is_required: true, group: 'legal' },
  { id: 'r-mandate', key: 'signed_mandate', label: 'Signed Mandate', status: 'required', is_required: true, group: 'legal' },
]

function source({ reviewStatus = '', commissionConfirmed = false, manualSigningPack = null } = {}) {
  const formData = {
    sellerPostOnboardingDrafts: {
      documents: [
        { key: 'signed_disclosure_form', name: 'Mandatory Disclosure / Defects Form', status: 'completed', generatedHtml: '<html>disclosure</html>', generatedAt: '2026-09-19T08:00:00.000Z' },
        { key: 'signed_fica_declaration', name: 'Seller FICA Declaration', status: 'awaiting_agent_review', generatedHtml: '<html>fica</html>', generatedAt: '2026-09-19T08:00:00.000Z' },
        { key: 'signed_mandate', name: 'Mandate preparation summary', status: 'awaiting_agent_review', generatedHtml: '<html>mandate</html>', generatedAt: '2026-09-19T08:00:00.000Z' },
      ],
    },
    ...(reviewStatus ? { sellerOnboardingReview: { status: reviewStatus } } : {}),
    ...(commissionConfirmed ? { sellerOnboardingFormalPackApproval: { status: 'approved', commission: { confirmed: true } } } : {}),
    ...(manualSigningPack ? { sellerOnboardingManualSigningPack: manualSigningPack } : {}),
  }
  return buildSellerDocumentSourceOfTruth({
    listing: {
      id: 'listing-1',
      sellerOnboarding: { status: 'completed' },
      documentRequirements: requiredDocuments,
    },
    formData,
  })
}

test('keeps review drafts out of the three authoritative signed-document rows', () => {
  const result = source()
  const rows = result.rows.filter((row) => ['signed_disclosure_form', 'signed_fica_declaration', 'signed_mandate'].includes(row.key))

  assert.equal(rows.length, 3)
  assert.equal(new Set(rows.map((row) => row.key)).size, 3)
  assert.equal(rows.some((row) => row.key === 'property_condition_disclosure'), false)

  const disclosure = rows.find((row) => row.key === 'signed_disclosure_form')
  const fica = rows.find((row) => row.key === 'signed_fica_declaration')
  const mandate = rows.find((row) => row.key === 'signed_mandate')
  assert.equal(disclosure.status, 'completed')
  assert.equal(disclosure.canUpload, false)
  assert.equal(disclosure.canDownload, true)
  assert.match(disclosure.upload.generatedHtml, /disclosure/)
  assert.equal(fica.status, 'required')
  assert.equal(fica.canUpload, true)
  assert.equal(fica.canDownload, false)
  assert.equal(fica.upload, null)
  assert.equal(fica.artifactStage, 'requirement')
  assert.equal(mandate.status, 'required')
  assert.equal(mandate.canUpload, true)
  assert.equal(mandate.canDownload, false)
  assert.equal(mandate.upload, null)
  assert.equal(result.rows.some((row) => ['fica_review_draft', 'mandate_preparation_summary'].includes(row.key)), false)
})

test('replaces draft FICA and mandate rows with downloadable, uploadable physical-signing copies', () => {
  const rows = source({
    reviewStatus: 'approved',
    commissionConfirmed: true,
    manualSigningPack: {
      status: 'awaiting_signed_hard_copy',
      documents: [
        { key: 'signed_fica_declaration', name: 'Seller FICA Declaration', generatedHtml: '<html>physical fica</html>', generatedFileName: 'fica.pdf' },
        { key: 'signed_mandate', name: 'Seller Mandate', generatedHtml: '<html>physical mandate</html>', generatedFileName: 'mandate.pdf' },
      ],
    },
  }).rows
  const fica = rows.find((row) => row.key === 'signed_fica_declaration')
  const mandate = rows.find((row) => row.key === 'signed_mandate')
  assert.equal(fica.status, 'awaiting_signed_hard_copy')
  assert.equal(mandate.status, 'awaiting_signed_hard_copy')
  assert.equal(fica.canDownload, true)
  assert.equal(mandate.canDownload, true)
  assert.equal(fica.canUpload, true)
  assert.equal(mandate.canUpload, true)
  assert.equal(fica.artifactStage, 'signing_copy')
  assert.equal(mandate.artifactStage, 'signing_copy')
  assert.equal(fica.satisfiesRequirement, false)
  assert.equal(mandate.satisfiesRequirement, false)
  assert.match(fica.upload.generatedHtml, /physical fica/)
  assert.match(mandate.upload.generatedHtml, /physical mandate/)
})

test('agent approval never promotes review drafts into signed artefacts', () => {
  const reviewRows = source({ reviewStatus: 'approved' }).rows
  assert.equal(reviewRows.find((row) => row.key === 'signed_fica_declaration').canDownload, false)
  assert.equal(reviewRows.find((row) => row.key === 'signed_mandate').canDownload, false)
  const rows = source({ reviewStatus: 'approved', commissionConfirmed: true }).rows
  const fica = rows.find((row) => row.key === 'signed_fica_declaration')
  const mandate = rows.find((row) => row.key === 'signed_mandate')
  assert.equal(fica.canDownload, false)
  assert.equal(mandate.canDownload, false)
  assert.equal(fica.status, 'required')
  assert.equal(mandate.status, 'required')
})

test('correction-only drafts do not replace the outstanding signed requirements', () => {
  const rows = source({ reviewStatus: 'correction_requested', commissionConfirmed: true }).rows
  const fica = rows.find((row) => row.key === 'signed_fica_declaration')
  const mandate = rows.find((row) => row.key === 'signed_mandate')
  assert.equal(fica.status, 'required')
  assert.equal(mandate.status, 'required')
  assert.equal(fica.canDownload, false)
  assert.equal(mandate.canDownload, false)
})

test('keeps the disclosure HTML bound to its frozen branding snapshot', () => {
  const signedLogoUrl = 'https://example.supabase.co/storage/v1/object/sign/organisation-assets/kingdom-light.png?token=expired'
  const result = buildSellerDocumentSourceOfTruth({
    listing: {
      id: 'listing-branding',
      sellerOnboarding: { status: 'completed' },
      documentRequirements: requiredDocuments,
      branding: { organisationName: 'Kingdom Real Estate', logoLightUrl: signedLogoUrl },
    },
    formData: {
      sellerName: 'Alex Landman',
      idNumber: '8001015009087',
      propertyDisclosure: {
        declarationAccepted: true,
        signature: 'Alex Landman',
        signedAt: '2026-09-20T10:00:00.000Z',
        decision: 'none',
        arch9TermsAccepted: true,
      },
      sellerPostOnboardingDrafts: {
        documents: [
          { key: 'signed_disclosure_form', status: 'completed', generatedHtml: '<html>frozen Kingdom disclosure</html>' },
        ],
      },
    },
  })
  const disclosure = result.rows.find((row) => row.key === 'signed_disclosure_form')
  assert.equal(disclosure.upload.generatedHtml, '<html>frozen Kingdom disclosure</html>')
  assert.doesNotMatch(disclosure.upload.generatedHtml, /kingdom-light\.png/)
  assert.equal(disclosure.canUpload, false)
  assert.equal(disclosure.canDownload, true)
})

test('does not let acknowledgement rows without files duplicate or replace the onboarding documents', () => {
  const result = buildSellerDocumentSourceOfTruth({
    listing: {
      id: 'listing-acknowledgements',
      sellerOnboarding: { status: 'completed' },
      documentRequirements: requiredDocuments,
      documents: [
        { id: 'ack-mandate', document_type: 'signed_mandate', signing_session_id: 'session-1', status: 'completed' },
        { id: 'ack-fica', document_type: 'signed_fica_declaration', signing_session_id: 'session-1', status: 'completed' },
      ],
    },
    formData: {
      sellerPostOnboardingDrafts: {
        documents: [
          { key: 'signed_disclosure_form', status: 'completed', generatedHtml: '<html>disclosure</html>' },
          { key: 'signed_fica_declaration', status: 'awaiting_agent_review', generatedHtml: '<html>fica</html>' },
          { key: 'signed_mandate', status: 'awaiting_agent_review', generatedHtml: '<html>mandate</html>' },
        ],
      },
    },
  })
  const packRows = result.rows.filter((row) => ['signed_disclosure_form', 'signed_fica_declaration', 'signed_mandate'].includes(row.key))

  assert.equal(packRows.length, 3)
  const mandate = packRows.find((row) => row.key === 'signed_mandate')
  const fica = packRows.find((row) => row.key === 'signed_fica_declaration')
  assert.equal(mandate.original.document.id, 'ack-mandate')
  assert.equal(mandate.artifactRecoveryState, 'missing_final_pdf')
  assert.equal(mandate.canDownload, false)
  assert.equal(fica.original.document.id, 'ack-fica')
  assert.equal(fica.artifactRecoveryState, 'missing_final_pdf')
})

test('collapses duplicate final artefacts to one authoritative signed-document row', () => {
  const result = buildSellerDocumentSourceOfTruth({
    listing: {
      id: 'listing-duplicate-finals',
      sellerOnboarding: { status: 'completed' },
      documentRequirements: requiredDocuments,
      documents: [
        { id: 'mandate-html', document_type: 'signed_mandate', status: 'completed', generatedHtml: '<html>signed</html>' },
        { id: 'mandate-file', document_type: 'signed_mandate', status: 'completed', storage_path: 'listing/signed-mandate.pdf' },
      ],
    },
    formData: {
      sellerPostOnboardingDrafts: {
        documents: [
          { key: 'signed_mandate', name: 'Mandate preparation summary', status: 'awaiting_agent_review', generatedHtml: '<html>summary</html>' },
        ],
      },
    },
  })
  const mandateRows = result.rows.filter((row) => row.key === 'signed_mandate')

  assert.equal(mandateRows.length, 1)
  assert.equal(mandateRows[0].status, 'completed')
  assert.equal(mandateRows[0].upload.filePath, 'listing/signed-mandate.pdf')
  assert.equal(mandateRows[0].artifactStage, 'final_signed')
  assert.equal(mandateRows[0].satisfiesRequirement, true)
})
