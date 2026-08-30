import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPropertyDisclosureDocumentMarkup,
  PROPERTY_DISCLOSURE_ANSWER,
  PROPERTY_DISCLOSURE_QUESTIONS,
  shouldPromptPropertyDisclosureComment,
} from '../../../lib/propertyDisclosure.js'
import { buildSellerComplianceDocumentModel } from '../sellerComplianceDocumentModel.js'
import { buildSellerCompliancePortalModel } from '../sellerCompliancePortalModel.js'

const completedDisclosure = {
  responses: Object.fromEntries(
    Array.from({ length: 20 }, (_, index) => [
      `q${index + 1}`,
      PROPERTY_DISCLOSURE_ANSWER.no,
    ]),
  ),
  signatureName: 'John Smith',
  signature: 'John Smith',
  signedAt: '2026-08-25T08:00:00.000Z',
}

test('buildSellerComplianceDocumentModel humanizes seller FICA fields', () => {
  const model = buildSellerComplianceDocumentModel({
    generatedAt: '2026-08-25T09:00:00.000Z',
    formData: {
      sellerFirstName: 'John',
      sellerSurname: 'Smith',
      email: 'john@example.test',
      phone: '0821234567',
      idNumber: '8001015009087',
      maritalStatus: 'not_married',
      ownerStructureType: 'individual',
      propertyStructureType: 'full_title',
      propertyAddress: '1 Main Road, Cape Town',
      sellerTaxNumber: '1234567890',
      taxResident: 'sa_resident',
      popiConsentAccepted: true,
      propertyDisclosure: completedDisclosure,
    },
    signing: buildSellerCompliancePortalModel({
      formData: {
        sellerFirstName: 'John',
        sellerSurname: 'Smith',
        email: 'john@example.test',
        maritalStatus: 'not_married',
        propertyDisclosure: completedDisclosure,
      },
    }),
  })

  const sellerRows = model.ficaSections.find((section) => section.title === 'Seller').rows
  const taxRows = model.ficaSections.find((section) => section.title === 'FICA / Tax').rows

  assert.equal(model.title, 'Seller Compliance Pack')
  assert.equal(sellerRows.find((row) => row.label === 'Marital status').value, 'Not Married')
  assert.equal(taxRows.find((row) => row.label === 'SA resident / tax resident').value, 'SA Resident')
  assert.equal(model.signers.length, 1)
  assert.equal(model.complete, true)
})

test('buildPropertyDisclosureDocumentMarkup renders FICA and signer pages when compliance pack is supplied', () => {
  const signing = buildSellerCompliancePortalModel({
    formData: {
      sellerFirstName: 'John',
      sellerSurname: 'Smith',
      email: 'john@example.test',
      maritalStatus: 'married',
      spouseInvolved: true,
      spouseName: 'Jane Smith',
      spouseEmail: 'jane@example.test',
      propertyDisclosure: completedDisclosure,
    },
  })
  const pack = buildSellerComplianceDocumentModel({
    formData: {
      sellerFirstName: 'John',
      sellerSurname: 'Smith',
      email: 'john@example.test',
      maritalStatus: 'married',
      spouseInvolved: true,
      spouseName: 'Jane Smith',
      spouseEmail: 'jane@example.test',
      propertyAddress: '1 Main Road, Cape Town',
      propertyDisclosure: completedDisclosure,
    },
    signing,
  })

  const html = buildPropertyDisclosureDocumentMarkup(completedDisclosure, {
    sellerName: 'John Smith',
    propertyAddress: '1 Main Road, Cape Town',
    documentReference: 'LIST-123',
    sellerCompliancePack: pack,
  })

  assert.match(html, /FICA Summary/)
  assert.match(html, /Signature Certificate/)
  assert.match(html, /Jane Smith/)
  assert.match(html, /Page 5 of 5/)
})

test('property disclosure requests details for answers that indicate a defect', () => {
  const electricalFaults = PROPERTY_DISCLOSURE_QUESTIONS.find((question) => question.key === 'electrical_faults')
  const securitySystems = PROPERTY_DISCLOSURE_QUESTIONS.find((question) => question.key === 'security_systems')

  assert.equal(shouldPromptPropertyDisclosureComment(electricalFaults, PROPERTY_DISCLOSURE_ANSWER.yes), true)
  assert.equal(shouldPromptPropertyDisclosureComment(electricalFaults, PROPERTY_DISCLOSURE_ANSWER.no), false)
  assert.equal(shouldPromptPropertyDisclosureComment(securitySystems, PROPERTY_DISCLOSURE_ANSWER.no), true)
  assert.equal(shouldPromptPropertyDisclosureComment(securitySystems, PROPERTY_DISCLOSURE_ANSWER.yes), false)
  assert.equal(shouldPromptPropertyDisclosureComment(securitySystems, PROPERTY_DISCLOSURE_ANSWER.unsure), true)
})

test('buildPropertyDisclosureDocumentMarkup includes per-question issue details', () => {
  const html = buildPropertyDisclosureDocumentMarkup({
    ...completedDisclosure,
    responses: {
      ...completedDisclosure.responses,
      electrical_faults: {
        answer: PROPERTY_DISCLOSURE_ANSWER.yes,
        note: 'Kitchen plug trips when the kettle is used.',
      },
    },
  })

  assert.match(html, /Details:/)
  assert.match(html, /Kitchen plug trips when the kettle is used\./)
})
