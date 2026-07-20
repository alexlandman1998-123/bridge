import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLegalDocumentLibraryModel } from '../legalDocumentLibraryModel.js'
import {
  buildConditionalMasterTemplateSections,
  getConditionalMasterTemplateDefinition,
} from '../conditionalMasterTemplateDefinitions.js'

const otpMaster = getConditionalMasterTemplateDefinition('otp')

const otpTemplates = [
  {
    id: 'otp-live',
    packet_type: 'otp',
    organisation_id: 'org-1',
    is_default: true,
    is_active: true,
    version_tag: 'v4',
    updated_at: '2026-07-10T08:00:00.000Z',
    metadata_json: {
      document_kind: 'standard',
      lifecycle_status: 'active',
      default_signer_roles: otpMaster.defaultSignerRoles,
    },
    sections: buildConditionalMasterTemplateSections('otp', [
      { sectionKey: 'parties', metadataJson: {}, legalText: 'Parties' },
      { sectionKey: 'property_details', metadataJson: {}, legalText: 'Property' },
      {
        sectionKey: 'signature_pages',
        legalText: 'Signatures',
        metadataJson: {
          planned_signing_fields: [
            { signer_role: 'purchaser_1', field_type: 'signature' },
            { signer_role: 'seller', field_type: 'signature' },
          ],
        },
      },
    ]),
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

test('derives real OTP status, section groups, signing rules and conditional-master coverage', () => {
  const model = buildLegalDocumentLibraryModel({
    templatesByType: { otp: otpTemplates, mandate: [] },
  })
  const otp = model.documentsByKey.otp

  assert.equal(otp.liveTemplateId, 'otp-live')
  assert.equal(otp.versionLabel, 'v4')
  assert.equal(otp.standardSectionCount, 3)
  assert.equal(otp.situationClauseCount, 13)
  assert.deepEqual(otp.standardSections.map((section) => section.title), [
    'Parties',
    'Signature Pages',
    'Property Details',
  ])
  assert.equal(otp.situationSections[0].ruleLabel, 'Individual buyer capacity pack')
  assert.equal(otp.signerRuleCount, 2)
  assert.equal(otp.coverageReady, true)
  assert.equal(otp.draftCount, 1)
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

test('selects the prepared organisation conditional master for editing while legacy wording remains live', () => {
  const mandateMaster = getConditionalMasterTemplateDefinition('mandate')
  const masterSections = buildConditionalMasterTemplateSections('mandate', [
    { sectionKey: 'introduction_purpose', sectionLabel: 'Introduction', legalText: 'Master introduction' },
    { sectionKey: 'signature_pages', sectionLabel: 'Signatures', legalText: 'Master signatures' },
  ])
  const templates = [
    {
      id: 'mandate-global-master',
      packet_type: 'mandate',
      organisation_id: null,
      status: 'published',
      is_active: true,
      is_default: true,
      metadata_json: {
        conditional_master: true,
        conditional_master_version: mandateMaster.masterVersion,
        default_signer_roles: mandateMaster.defaultSignerRoles,
      },
      sections: masterSections,
    },
    {
      id: 'mandate-legacy-live',
      packet_type: 'mandate',
      organisation_id: 'org-1',
      status: 'published',
      is_active: true,
      is_default: true,
      sections: [{ sectionKey: 'introduction_purpose', legalText: 'Legacy wording' }],
    },
    {
      id: 'mandate-migration-candidate',
      packet_type: 'mandate',
      organisation_id: 'org-1',
      status: 'draft',
      is_active: false,
      is_default: false,
      updated_at: '2026-07-20T12:00:00.000Z',
      metadata_json: {
        conditional_master: true,
        conditional_master_version: mandateMaster.masterVersion,
        default_signer_roles: mandateMaster.defaultSignerRoles,
      },
      sections: masterSections,
    },
  ]

  const model = buildLegalDocumentLibraryModel({
    templatesByType: { mandate: templates },
    migrationsByType: {
      mandate: {
        state: 'prepared',
        source_master_template_id: 'mandate-global-master',
        candidate_template_id: 'mandate-migration-candidate',
        previous_default_template_id: 'mandate-legacy-live',
      },
    },
  })
  const mandate = model.documentsByKey.mandate

  assert.equal(mandate.primaryTemplateId, 'mandate-migration-candidate')
  assert.equal(mandate.liveTemplateId, 'mandate-legacy-live')
  assert.equal(mandate.situationClauseCount, 6)
  assert.equal(mandate.migrationReadiness.candidate.id, 'mandate-migration-candidate')
})
