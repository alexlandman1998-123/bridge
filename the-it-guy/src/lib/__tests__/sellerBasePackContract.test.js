import assert from 'node:assert/strict'
import test from 'node:test'
import {
  projectSellerDocumentArtifact,
  selectAuthoritativeSellerDocumentArtifacts,
  SELLER_DOCUMENT_CONTRACT_VERSION,
} from '../sellerBasePackContract.js'

test('classifies legacy onboarding drafts separately from signed artefacts', () => {
  const mandate = projectSellerDocumentArtifact({
    key: 'signed_mandate',
    name: 'Mandate preparation summary',
    status: 'awaiting_agent_review',
    source: 'seller_onboarding.post_submission_draft',
    generatedHtml: '<html>summary</html>',
    metadata: { notForSignature: true },
  })
  const fica = projectSellerDocumentArtifact({
    key: 'signed_fica_declaration',
    status: 'awaiting_agent_review',
    source: 'seller_onboarding.post_submission_draft',
    generatedHtml: '<html>review</html>',
  })

  assert.equal(mandate.contractVersion, SELLER_DOCUMENT_CONTRACT_VERSION)
  assert.equal(mandate.artifactKey, 'mandate_preparation_summary')
  assert.equal(mandate.targetRequirementKey, 'signed_mandate')
  assert.equal(mandate.stage, 'review_draft')
  assert.equal(mandate.visibleInSellerDocuments, false)
  assert.equal(mandate.satisfiesRequirement, false)
  assert.equal(fica.artifactKey, 'fica_review_draft')
  assert.equal(fica.targetRequirementKey, 'signed_fica_declaration')
  assert.equal(fica.visibleInSellerDocuments, false)
})

test('records legal state, representation, template and branding independently', () => {
  const contract = projectSellerDocumentArtifact({
    key: 'signed_disclosure_form',
    status: 'completed',
    storage_path: 'private/listing/disclosure.pdf',
    templateVersion: 'property_disclosure_annexure_a_v2',
    brandingVersion: 'kingdom_brand_v3',
  })

  assert.equal(contract.artifactKey, 'signed_disclosure_form')
  assert.equal(contract.stage, 'final_signed')
  assert.equal(contract.requirementStatus, 'completed')
  assert.equal(contract.representation.kind, 'stored_file')
  assert.equal(contract.representation.downloadable, true)
  assert.equal(contract.satisfiesRequirement, true)
  assert.equal(contract.templateVersion, 'property_disclosure_annexure_a_v2')
  assert.equal(contract.brandingVersion, 'kingdom_brand_v3')
})

test('selects one authoritative visible artefact per signed-document requirement', () => {
  const selected = selectAuthoritativeSellerDocumentArtifacts([
    {
      id: 'mandate-summary',
      key: 'signed_mandate',
      name: 'Mandate preparation summary',
      status: 'awaiting_agent_review',
      source: 'seller_onboarding.post_submission_draft',
      generatedHtml: '<html>summary</html>',
    },
    {
      id: 'mandate-generated',
      key: 'signed_mandate',
      status: 'completed',
      generatedHtml: '<html>signed mandate</html>',
    },
    {
      id: 'mandate-stored',
      key: 'signed_mandate',
      status: 'completed',
      storage_path: 'private/listing/signed-mandate.pdf',
    },
    {
      id: 'fica-review',
      key: 'fica_review_draft',
      targetRequirementKey: 'signed_fica_declaration',
      status: 'awaiting_agent_review',
      generatedHtml: '<html>review</html>',
    },
    {
      id: 'rates',
      key: 'rates_account',
      status: 'uploaded',
      storage_path: 'private/listing/rates.pdf',
    },
  ])

  assert.deepEqual(selected.map((artifact) => artifact.id).sort(), ['mandate-stored', 'rates'])
  assert.equal(selected.find((artifact) => artifact.id === 'mandate-stored').documentContract.targetRequirementKey, 'signed_mandate')
})

