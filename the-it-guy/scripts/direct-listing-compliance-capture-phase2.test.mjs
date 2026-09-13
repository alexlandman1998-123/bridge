import assert from 'node:assert/strict'

import { buildDirectListingIntakePayload } from '../src/lib/directListingIntakeModel.js'

const intake = buildDirectListingIntakePayload({
  sellerName: 'Manual Seller',
  hasSignedMandate: true,
  hasSignedPropertyConditionDisclosure: true,
  hasSignedFicaForm: true,
  complianceCaptureMethod: 'agent_managed',
  complianceCaptureNotes: 'Seller handed paper copies to the listing agent; scan still required.',
  mandateCaptureSource: 'in_person',
  disclosureCaptureSource: 'email',
  ficaCaptureSource: 'whatsapp',
})

const declarations = intake.complianceDeclarations

assert.equal(declarations.capture.method, 'agent_managed')
assert.equal(declarations.capture.notes, 'Seller handed paper copies to the listing agent; scan still required.')
assert.equal(declarations.mandate.status, 'reported_held')
assert.equal(declarations.mandate.capturedVia, 'in_person')
assert.equal(declarations.propertyConditionDisclosure.capturedVia, 'email')
assert.equal(declarations.ficaForm.capturedVia, 'whatsapp')
assert.equal(intake.sellerOnboardingFormData.complianceDeclarations.capture.method, 'agent_managed')

console.log('Direct listing compliance capture phase 2 checks passed.')
