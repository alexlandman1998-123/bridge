import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLegalDocumentLibraryModel } from '../legalDocumentLibraryModel.js'

const otpTemplates = [
  {
    id: 'otp-live',
    packet_type: 'otp',
    organisation_id: 'org-1',
    is_default: true,
    is_active: true,
    version_tag: 'v4',
    updated_at: '2026-07-10T08:00:00.000Z',
    metadata_json: { document_kind: 'standard', lifecycle_status: 'active' },
    sections: [
      { section_key: 'parties', metadata_json: {} },
      { section_key: 'property_details', metadata_json: {} },
      { section_key: 'buyer_company_authority_pack', metadata_json: {} },
      {
        section_key: 'signature_pages',
        metadata_json: {
          planned_signing_fields: [
            { signer_role: 'purchaser_1', field_type: 'signature' },
            { signer_role: 'seller', field_type: 'signature' },
          ],
        },
      },
    ],
  },
  {
    id: 'otp-specialised-draft',
    packet_type: 'otp',
    organisation_id: 'org-1',
    is_default: false,
    is_active: true,
    metadata_json: {
      document_kind: 'standard',
      lifecycle_status: 'draft',
      property_clause_profile: 'sectional_title',
    },
  },
  {
    id: 'price-addendum',
    packet_type: 'otp',
    organisation_id: 'org-1',
    is_default: false,
    is_active: true,
    metadata_json: {
      document_kind: 'addendum',
      template_family: 'general_addendum',
      addendum_type: 'purchase_price_addendum',
      lifecycle_status: 'active',
    },
    sections: [{ section_key: 'addendum_details' }],
  },
]

test('derives real OTP status, section groups, signing rules and routing coverage', () => {
  const model = buildLegalDocumentLibraryModel({
    templatesByType: { otp: otpTemplates, mandate: [] },
  })
  const otp = model.documentsByKey.otp

  assert.equal(otp.liveTemplateId, 'otp-live')
  assert.equal(otp.versionLabel, 'v4')
  assert.equal(otp.standardSectionCount, 2)
  assert.equal(otp.situationClauseCount, 1)
  assert.deepEqual(otp.standardSections.map((section) => section.title), [
    'Parties',
    'Property Details',
  ])
  assert.equal(otp.situationSections[0].ruleLabel, 'Company buyer authority')
  assert.equal(otp.signerRuleCount, 2)
  assert.equal(otp.coverageReady, true)
  assert.equal(otp.draftCount, 1)
  assert.equal(otp.attorneyReadiness.summary.coreCount, 0)
  assert.equal(otp.attorneyReadiness.summary.requiredClauseCount, 23)
  assert.equal(otp.attorneyReadiness.summary.clauseWordingCount, 0)
  assert.equal(otp.attorneyReadiness.canSubmitForAttorneyReview, false)
  assert.equal(otp.attorneyReadiness.canPublish, false)
  assert.equal(otp.rolloutCandidateTemplateId, 'otp-specialised-draft')
  assert.equal(otp.launchReadiness.status, 'preparing_candidate')
  assert.equal(otp.rolloutOperations.status, 'not_governed')
  assert.equal(otp.rolloutOperations.canRollback, false)
})

test('keeps addenda separate from the primary OTP document', () => {
  const model = buildLegalDocumentLibraryModel({ templatesByType: { otp: otpTemplates } })

  assert.equal(model.documentsByKey.otp.templateCount, 2)
  assert.equal(model.documentsByKey.purchase_price_addendum.primaryTemplateId, 'price-addendum')
  assert.equal(model.documentsByKey.occupation_addendum.status, 'missing')
})

test('summarises live, draft and coverage state across the catalogue', () => {
  const model = buildLegalDocumentLibraryModel({ templatesByType: { otp: otpTemplates, mandate: [] } })

  assert.equal(model.summary.documentCount, 4)
  assert.equal(model.summary.liveCount, 2)
  assert.equal(model.summary.draftCount, 1)
  assert.equal(model.summary.allCovered, false)
})

test('uses canonical version pointers instead of legacy routing coverage', () => {
  const canonicalTemplate = {
    id: 'otp-canonical',
    packet_type: 'otp',
    organisation_id: 'org-1',
    is_default: true,
    is_active: true,
    status: 'published',
    document_model: 'single_master_document',
    live_version_id: 'template-version-2',
    previous_live_version_id: 'template-version-1',
    metadata_json: {
      document_kind: 'standard',
      otp_rollout: { status: 'activated', activatedVersionId: 'template-version-2' },
    },
  }
  const model = buildLegalDocumentLibraryModel({ templatesByType: { otp: [canonicalTemplate] } })
  const otp = model.documentsByKey.otp

  assert.equal(otp.coverageReady, true)
  assert.equal(otp.rolloutOperations.canonical, true)
  assert.equal(otp.rolloutOperations.status, 'healthy')
  assert.equal(otp.rolloutOperations.canRollback, true)
})
