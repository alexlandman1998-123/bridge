import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSellerRequirementProfile,
  getRequiredSellerDocuments,
} from '../../../lib/sellerDocumentRequirementEngine.js'
import { buildSellerCompliancePortalModel } from '../sellerCompliancePortalModel.js'

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
