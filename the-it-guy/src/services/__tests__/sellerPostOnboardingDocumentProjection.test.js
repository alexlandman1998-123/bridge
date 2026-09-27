import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSellerPostOnboardingDraftDocuments,
  buildSellerDocumentSourceOfTruth,
  filterSellerDocumentRequirementsForOnboarding,
} from '../sellerDocumentRequirementsService.js'
import { buildSellerPostOnboardingDrafts } from '../../core/documents/sellerPostOnboardingDrafts.js'
import { PROPERTY_DISCLOSURE_QUESTIONS } from '../../lib/propertyDisclosure.js'
import { createSellerReviewedDocumentVersions } from '../../core/documents/sellerReviewedDocumentVersions.js'
import { getSellerPhysicalSigningCopy } from '../../core/documents/sellerPhysicalSigningCopy.js'

const requiredDocuments = [
  { id: 'r-disclosure', key: 'signed_disclosure_form', label: 'Signed Mandatory Disclosure / Defects Form', status: 'required', is_required: true, group: 'legal' },
  { id: 'r-fica', key: 'signed_fica_declaration', label: 'Signed FICA Declaration', status: 'required', is_required: true, group: 'legal' },
  { id: 'r-mandate', key: 'signed_mandate', label: 'Signed Mandate', status: 'required', is_required: true, group: 'legal' },
]

test('new onboarding disclosure remains a review draft, even when a PDF can be downloaded', () => {
  const listing = { id: 'listing-new', sellerOnboarding: { status: 'completed' } }
  const drafts = buildSellerPostOnboardingDrafts({ formData: { sellerFirstName: 'Alex' }, listing, generatedAt: '2026-09-27T12:00:00Z' })
  const formData = { sellerPostOnboardingDrafts: drafts }
  const disclosure = buildSellerPostOnboardingDraftDocuments(formData, listing).find((row) => row.artifactKey === 'signed_disclosure_form')
  assert.equal(disclosure.status, 'awaiting_agent_review')
  assert.equal(disclosure.documentContract.stage, 'review_draft')
  assert.equal(disclosure.documentContract.satisfiesRequirement, false)
  assert.equal(disclosure.completionRoute, '')
  assert.equal(disclosure.canDownload, false)

  const approved = buildSellerPostOnboardingDraftDocuments({ ...formData, sellerOnboardingReview: { status: 'approved' } }, listing)
    .find((row) => row.artifactKey === 'signed_disclosure_form')
  assert.equal(approved.canDownload, true)
  assert.equal(approved.documentContract.satisfiesRequirement, false)
})

test('a signed onboarding disclosure remains complete when every required seller has signed', () => {
  const listing = { id: 'listing-signed', sellerOnboarding: { status: 'completed' }, documentRequirements: requiredDocuments }
  const propertyDisclosure = {
    responses: Object.fromEntries(PROPERTY_DISCLOSURE_QUESTIONS.map((question) => [question.key, { answer: 'no' }])),
    declarationAccepted: true,
    signature: 'data:image/png;base64,AA',
    signedAt: '2026-09-27',
    arch9TermsAccepted: true,
  }
  const formData = { propertyDisclosure, sellerComplianceSigning: { complete: true } }
  formData.sellerPostOnboardingDrafts = buildSellerPostOnboardingDrafts({ formData, listing, generatedAt: '2026-09-27T12:00:00Z' })
  const signed = buildSellerDocumentSourceOfTruth({ listing, formData }).rows.find((row) => row.key === 'signed_disclosure_form')
  assert.equal(signed.status, 'completed')

  const incomplete = buildSellerDocumentSourceOfTruth({ listing, formData: { ...formData, sellerComplianceSigning: { complete: false } } })
    .rows.find((row) => row.key === 'signed_disclosure_form')
  assert.notEqual(incomplete.status, 'completed')
})

test('reviewed signing copies map to three outstanding legal rows with their frozen versions', () => {
  const listing = { id: 'listing-reviewed', sellerOnboarding: { status: 'completed' }, documentRequirements: requiredDocuments }
  const formData = { sellerName: 'Alex Seller' }
  formData.sellerPostOnboardingDrafts = buildSellerPostOnboardingDrafts({ formData, listing, generatedAt: '2026-09-27T12:00:00Z' })
  formData.sellerOnboardingManualSigningPack = {
    status: 'awaiting_signed_hard_copy',
    documents: [
      { key: 'signed_disclosure_form', generatedHtml: '<article>Frozen disclosure</article>', versionId: 'disclosure-v1', versionDigest: 'sha256:disclosure' },
      { key: 'signed_fica_declaration', generatedHtml: '<article>Frozen FICA</article>', versionId: 'fica-v1', versionDigest: 'sha256:fica' },
      { key: 'signed_mandate', generatedHtml: '<article>Frozen mandate</article>', versionId: 'mandate-v1', versionDigest: 'sha256:mandate' },
    ],
  }
  const rows = buildSellerDocumentSourceOfTruth({ listing, formData }).rows
    .filter((row) => ['signed_disclosure_form', 'signed_fica_declaration', 'signed_mandate'].includes(row.key))
  assert.equal(rows.length, 3)
  for (const row of rows) {
    assert.notEqual(row.status, 'completed')
    assert.equal(row.canUpload, true)
    assert.equal(row.canDownload, true)
    assert.match(row.original.document.versionDigest, /^sha256:/)
  }
  assert.equal(rows.find((row) => row.key === 'signed_disclosure_form').original.document.versionId, 'disclosure-v1')
})

test('a returned signed mandate stays outstanding until its persisted copy is approved', async () => {
  const listing = { id: 'listing-physical', sellerOnboarding: { status: 'completed' }, documentRequirements: requiredDocuments }
  const reviewed = await createSellerReviewedDocumentVersions({
    manualSigningPack: { documents: [{ key: 'signed_mandate', generatedHtml: '<article>Frozen mandate</article>' }] },
    formalPackApproval: { status: 'approved', signingRoute: 'manual_upload', commission: { confirmed: true } },
    signingPack: { signers: [{ name: 'Alex Seller', role: 'Seller' }], mandate: { propertyAddress: '1 Test Road' } },
    actor: 'agent-1',
  })
  const formData = { sellerOnboardingManualSigningPack: { status: 'awaiting_signed_hard_copy', documents: reviewed.documents } }
  const upload = {
    id: 'signed-upload', requirement_id: 'r-mandate', document_type: 'signed_mandate', status: 'uploaded', storage_path: 'signed/mandate.pdf',
    reviewed_signing_version_id: reviewed.documents[0].versionId,
    reviewed_signing_version_digest: reviewed.documents[0].versionDigest,
  }
  const pending = buildSellerDocumentSourceOfTruth({ listing: { ...listing, documents: [upload] }, formData }).rows.find((row) => row.key === 'signed_mandate')
  assert.equal(pending.status, 'uploaded')
  assert.equal(pending.complete, false)
  assert.equal(pending.original.document.id, 'signed-upload')
  assert.equal(pending.original.document.reviewed_signing_version_id, reviewed.documents[0].versionId)
  assert.equal(getSellerPhysicalSigningCopy(pending)?.versionId, reviewed.documents[0].versionId)

  const approved = buildSellerDocumentSourceOfTruth({ listing: { ...listing, documents: [{ ...upload, status: 'approved' }] }, formData }).rows.find((row) => row.key === 'signed_mandate')
  assert.equal(approved.status, 'approved')
  assert.equal(approved.complete, true)
})

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

test('lead Documents keeps one outstanding legal FICA declaration after onboarding', () => {
  const rows = filterSellerDocumentRequirementsForOnboarding(source().rows, {
    onboardingSubmitted: true,
    retainOutstandingFicaDeclaration: true,
  })
  const ficaRows = rows.filter((row) => row.key === 'signed_fica_declaration')

  assert.equal(ficaRows.length, 1)
  assert.equal(ficaRows[0].group, 'legal')
  assert.equal(ficaRows[0].status, 'required')
  assert.equal(ficaRows[0].canUpload, true)
  assert.equal(ficaRows[0].upload, null)
})

test('seller document source shows one property levy row and retains a legacy upload', () => {
  const result = buildSellerDocumentSourceOfTruth({
    listing: {
      id: 'listing-legacy-levy',
      documents: [
        { id: 'old-levy-placeholder', document_type: 'Latest Levy Statement', document_name: 'Latest Levy Statement', category: 'legal', status: 'required' },
        { id: 'levy-file', document_type: 'sectional_title_levy_statement', document_name: 'Latest Levy Statement', category: 'property', status: 'uploaded', storage_path: 'seller/levy.pdf' },
      ],
    },
  })
  const levyRows = result.rows.filter((row) => row.key === 'levy_statement')

  assert.equal(levyRows.length, 1)
  assert.equal(levyRows[0].taxonomyCategory, 'property')
  assert.equal(levyRows[0].original.document.id, 'levy-file')
  assert.equal(levyRows[0].upload.filePath, 'seller/levy.pdf')
  assert.equal(levyRows[0].originalRows.length, 2)
})

test('submitted individual sectional-title onboarding keeps FICA and one required property levy row', () => {
  const result = buildSellerDocumentSourceOfTruth({
    listing: {
      id: 'seller-lead-listing',
      sellerOnboardingStatus: 'submitted',
      documentRequirements: [
        { id: 'old-levy', key: 'latest_levy_statement', name: 'Latest Levy Statement', group: 'legal', category: 'legal', is_required: false, status: 'required' },
        { id: 'property-levy', key: 'levy_statement', name: 'Latest Levy Statement', group: 'property', category: 'property', is_required: true, status: 'required' },
      ],
    },
    formData: {
      sellerType: 'individual',
      sellerName: 'Alex Landman',
      propertyStructureType: 'sectional_title',
      sectionalTitle: true,
      schemeName: 'Silver Leaf',
      sectionNumber: '2',
      unitNumber: '2',
      sellerPostOnboardingDrafts: {
        documents: [
          { key: 'signed_disclosure_form', status: 'completed', generatedHtml: '<html>signed disclosure</html>' },
          { key: 'signed_fica_declaration', status: 'awaiting_agent_review', generatedHtml: '<html>unsigned FICA draft</html>' },
        ],
      },
    },
  })
  const rows = filterSellerDocumentRequirementsForOnboarding(result.rows, {
    onboardingSubmitted: true,
    retainOutstandingFicaDeclaration: true,
  })
  const legalPackRows = rows.filter((row) => ['signed_mandate', 'signed_disclosure_form', 'signed_fica_declaration'].includes(row.key))
  const levyRows = rows.filter((row) => row.key === 'levy_statement')

  assert.equal(legalPackRows.length, 3)
  assert.equal(legalPackRows.find((row) => row.key === 'signed_disclosure_form').status, 'completed')
  assert.equal(legalPackRows.find((row) => row.key === 'signed_fica_declaration').status, 'required')
  assert.equal(legalPackRows.find((row) => row.key === 'signed_fica_declaration').canUpload, true)
  assert.equal(levyRows.length, 1)
  assert.equal(levyRows[0].required, true)
  assert.equal(levyRows[0].taxonomyCategory, 'property')
  assert.equal(rows.some((row) => row.key === 'latest_levy_statement'), false)
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
