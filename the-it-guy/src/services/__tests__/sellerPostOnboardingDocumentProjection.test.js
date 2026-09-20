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

test('projects frozen onboarding drafts once using their canonical requirement keys', () => {
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
  assert.equal(fica.status, 'awaiting_agent_review')
  assert.equal(fica.canUpload, false)
  assert.equal(fica.canDownload, false)
  assert.match(fica.downloadReason, /Awaiting agent review/)
  assert.equal(mandate.canUpload, false)
  assert.equal(mandate.canDownload, false)
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
  assert.match(fica.upload.generatedHtml, /physical fica/)
  assert.match(mandate.upload.generatedHtml, /physical mandate/)
})

test('unlocks FICA after review and mandate only after commission confirmation', () => {
  const reviewRows = source({ reviewStatus: 'approved' }).rows
  assert.equal(reviewRows.find((row) => row.key === 'signed_fica_declaration').canDownload, true)
  assert.equal(reviewRows.find((row) => row.key === 'signed_mandate').canDownload, false)
  const rows = source({ reviewStatus: 'approved', commissionConfirmed: true }).rows
  const fica = rows.find((row) => row.key === 'signed_fica_declaration')
  const mandate = rows.find((row) => row.key === 'signed_mandate')
  assert.equal(fica.canDownload, true)
  assert.equal(mandate.canDownload, true)
  assert.equal(fica.canUpload, false)
  assert.equal(mandate.canUpload, false)
})

test('blocks obsolete FICA and mandate drafts when the agent requests a correction', () => {
  const rows = source({ reviewStatus: 'correction_requested', commissionConfirmed: true }).rows
  const fica = rows.find((row) => row.key === 'signed_fica_declaration')
  const mandate = rows.find((row) => row.key === 'signed_mandate')
  assert.equal(fica.status, 'correction_requested')
  assert.equal(mandate.status, 'correction_requested')
  assert.equal(fica.canDownload, false)
  assert.match(mandate.downloadReason, /correction was requested/i)
})

test('refreshes the disclosure HTML with the public on-light agency logo', () => {
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
          { key: 'signed_disclosure_form', status: 'completed', generatedHtml: '<html>stale disclosure</html>' },
        ],
      },
    },
  })
  const disclosure = result.rows.find((row) => row.key === 'signed_disclosure_form')
  assert.match(disclosure.upload.generatedHtml, /\/storage\/v1\/object\/public\/organisation-assets\/kingdom-light\.png/)
  assert.doesNotMatch(disclosure.upload.generatedHtml, /object\/sign/)
  assert.equal(disclosure.canUpload, false)
  assert.equal(disclosure.canDownload, true)
})
