import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSellerRequirementProfile,
  getRequiredSellerDocuments,
} from '../../../lib/sellerDocumentRequirementEngine.js'
import { buildSellerCompliancePortalModel } from '../sellerCompliancePortalModel.js'
import { buildSellerDocumentWorkflow } from '../sellerDocumentWorkflow.js'

test('spouse consent is a signing task on the compliance pack, not a standalone document', () => {
  const profile = buildSellerRequirementProfile({
    sellerFirstName: 'John',
    sellerSurname: 'Smith',
    email: 'john@example.test',
    phone: '0821234567',
    sellerType: 'individual',
    ownershipType: 'married_in_community',
    maritalStatus: 'married_in_community',
    maritalRegime: 'in_community',
    spouseName: 'Jane Smith',
    spouseEmail: 'jane@example.test',
    propertyAddress: '1 Main Road',
    mandateType: 'sole',
    askingPrice: 2_000_000,
  }, {
    id: 'listing-1',
    status: 'onboarding_completed',
    assignedAgentId: 'agent-1',
    organisationId: 'org-1',
  })
  const documentKeys = getRequiredSellerDocuments(profile).map((requirement) => requirement.key)
  const signingModel = buildSellerCompliancePortalModel({
    token: 'seller-token-123',
    formData: {
      sellerFirstName: 'John',
      sellerSurname: 'Smith',
      email: 'john@example.test',
      maritalStatus: 'married',
      spouseInvolved: true,
      spouseName: 'Jane Smith',
      spouseEmail: 'jane@example.test',
    },
  })

  assert.equal(documentKeys.includes('spouse_consent'), false)
  assert.equal(signingModel.signatureRequests.some((request) => request.signerId === 'spouse'), true)
})

test('buildSellerCompliancePortalModel keeps spouse pending after primary seller signs disclosure', () => {
  const model = buildSellerCompliancePortalModel({
    token: 'seller-token-123',
    formData: {
      sellerFirstName: 'John',
      sellerSurname: 'Smith',
      email: 'john@example.test',
      phone: '0821234567',
      maritalStatus: 'married',
      spouseInvolved: true,
      spouseName: 'Jane Smith',
      spouseEmail: 'jane@example.test',
      propertyDisclosure: {
        signatureName: 'John Smith',
        signedAt: '2026-08-25T08:00:00.000Z',
      },
    },
  })

  assert.equal(model.complete, false)
  assert.equal(model.signingState.signedCount, 1)
  assert.equal(model.signingState.requiredCount, 2)
  assert.equal(model.statusLabel, '1 of 2 signed')
  assert.equal(model.nextSigner.name, 'Jane Smith')
  assert.match(model.nextMessage, /Waiting for Jane Smith/)
  assert.equal(model.actions[0].label, 'Sign on this device')
  assert.match(model.actions[0].href, /seller-token-123/)
  assert.match(model.actions[0].href, /signer=spouse/)
  assert.equal(model.signatureRequests.length, 1)
  assert.equal(model.signatureRequests[0].signerId, 'spouse')
  assert.equal(model.signatureRequests[0].email, 'jane@example.test')
  assert.match(model.signatureRequests[0].href, /signer=spouse/)
  assert.deepEqual(model.signatureRequests[0].documents.map((document) => document.key), [
    'property_condition_disclosure',
  ])
})

test('buildSellerCompliancePortalModel completes individual seller after disclosure signature', () => {
  const model = buildSellerCompliancePortalModel({
    formData: {
      sellerFirstName: 'John',
      sellerSurname: 'Smith',
      email: 'john@example.test',
      maritalStatus: 'not_married',
      propertyDisclosure: {
        signatureName: 'John Smith',
        signedAt: '2026-08-25T08:00:00.000Z',
      },
    },
  })

  assert.equal(model.complete, true)
  assert.equal(model.signingState.signedCount, 1)
  assert.equal(model.statusLabel, 'All signatures complete')
  assert.equal(model.actions.length, 0)
  assert.equal(model.signatureRequests.length, 0)
})

test('buildSellerCompliancePortalModel exposes authority action for company signatory', () => {
  const model = buildSellerCompliancePortalModel({
    token: 'seller-token-456',
    workspacePath: '/client/seller-token-456/selling/documents',
    formData: {
      ownershipType: 'company',
      companyName: 'Acme Pty Ltd',
      authorisedSignatoryName: 'Pat Director',
      authorisedSignatoryEmail: 'pat@example.test',
    },
    existingSigners: [
      {
        id: 'company-authorised-signatory',
        status: 'authority_uploaded',
        authority: {
          documentId: 'doc-company-resolution',
          documentName: 'Company resolution.pdf',
        },
      },
    ],
  })

  assert.equal(model.complete, false)
  assert.equal(model.status, 'authority_review_required')
  assert.equal(model.statusLabel, 'Authority uploaded for review')
  assert.equal(model.nextSigner.name, 'Pat Director')
  assert.equal(model.actions.some((action) => action.key === 'upload_authority'), true)
})

test('buildSellerCompliancePortalModel resets a duplicated secondary signature from the legacy unscoped flow', () => {
  const duplicatedSignature = 'data:image/png;base64,one-person-signature'
  const model = buildSellerCompliancePortalModel({
    token: 'seller-token-duplicate',
    formData: {
      sellerFirstName: 'John',
      sellerSurname: 'Smith',
      email: 'john@example.test',
      maritalStatus: 'married',
      spouseInvolved: true,
      spouseName: 'Jane Smith',
      spouseEmail: 'jane@example.test',
      propertyDisclosure: {
        signature: duplicatedSignature,
        signedAt: '2026-08-25T08:00:00.000Z',
      },
      sellerComplianceSigners: [
        { id: 'seller-1', role: 'seller_1', status: 'signed', signedAt: '2026-08-25T08:00:00.000Z', signature: duplicatedSignature },
        { id: 'spouse', role: 'spouse', status: 'signed', signedAt: '2026-08-25T08:00:00.000Z', signature: duplicatedSignature },
      ],
    },
  })

  assert.equal(model.complete, false)
  assert.equal(model.signingState.signedCount, 1)
  assert.equal(model.signers.find((signer) => signer.id === 'seller-1').status, 'signed')
  assert.equal(model.signers.find((signer) => signer.id === 'spouse').status, 'pending')
  assert.equal(model.signatureRequests[0].signerId, 'spouse')
})


test('information-only submission directs sellers to three independent document states without legacy signing links', () => {
  const formData = { ownershipType: 'individual', sellerFirstName: 'Sam', sellerSurname: 'Seller', email: 'sam@example.test',
    sellerOnboardingCompletion: { informationOnly: true },
    sellerOnboardingManualSigningPack: { documents: [{ key: 'signed_fica_declaration', versionId: 'frozen-fica', signingRoute: 'manual_upload' }] } }
  const model = buildSellerCompliancePortalModel({ formData, token: 'local-token', portalData: { requiredDocuments: [
    { key: 'signed_mandate', status: 'approved' }, { key: 'signed_disclosure_form', status: 'uploaded' }, { key: 'signed_fica_declaration', status: 'required' },
  ] } })
  assert.equal(model.informationOnly, true)
  assert.deepEqual(model.signatureRequests, [])
  assert.equal(model.actions[0].to, 'documents')
  assert.equal(model.complete, false)
  assert.deepEqual(model.documentWorkflows.map(item => [item.key, item.state]), [
    ['signed_mandate', 'complete'], ['signed_disclosure_form', 'review'], ['signed_fica_declaration', 'prepared'],
  ])
  assert.equal(model.documentWorkflows[1].nextActor, 'agent')
  assert.equal(model.documentWorkflows[2].nextActor, 'seller')
  assert.equal(model.documentWorkflows[2].versionId, 'frozen-fica')
  assert.deepEqual(model.documentWorkflows[2].permittedActors.upload, ['agent'])
  assert.equal(model.progressLabel, '1 of 3 documents reviewed')
  assert.equal(model.nextSigner, null)
})

test('protected core portal progress matches the agent workflow for the current document version', () => {
  const copy = { key: 'signed_fica_declaration', versionId: 'current', signingRoute: 'digital_pack' }
  const request = { document_key: copy.key, version_id: 'current', status: 'partially_signed', signed_count: 1, signer_count: 2 }
  const portalData = { sellerSigningProgressAvailable: true,
    sellerDocumentWorkspace: { informationOnly: true, documents: [copy] },
    sellerPortalSigningRequests: [{ ...request, version_id: 'historical', status: 'reviewed' }, request] }
  const model = buildSellerCompliancePortalModel({ portalData })
  const seller = model.documentWorkflows.find(item => item.key === copy.key)
  const agent = buildSellerDocumentWorkflow({ item: { lockedByTeam: true }, copy, request })
  for (const key of ['state', 'detail', 'label', 'nextActor', 'versionId']) assert.equal(seller[key], agent[key])
  assert.equal(seller.state, 'signing')
  assert.match(seller.detail, /1 of 2/)
  assert.equal(model.complete, false)
})

test('unavailable protected progress never claims that prepared signature links were not sent', () => {
  const model = buildSellerCompliancePortalModel({ portalData: { sellerSigningProgressAvailable: false,
    sellerDocumentWorkspace: { informationOnly: true, documents: [{ key: 'signed_mandate', versionId: 'current', signingRoute: 'digital_pack' }] } } })
  const mandate = model.documentWorkflows[0]
  assert.match(mandate.label, /progress unavailable/)
  assert.doesNotMatch(mandate.detail, /not been sent/)
  assert.equal(mandate.nextActor, 'agent')
  assert.match(mandate.nextAction, /confirms/)
})
