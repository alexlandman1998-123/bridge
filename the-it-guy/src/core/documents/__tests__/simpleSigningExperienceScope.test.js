import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSimpleSigningExperienceScope,
  getSimpleSigningDocumentType,
  resolveSimpleSigningState,
  SIMPLE_SIGNING_EXPERIENCE_SCOPE_CONTRACT,
} from '../simpleSigningExperienceScope.js'

test('locks mandate and OTP as the generated document coverage', () => {
  const scope = buildSimpleSigningExperienceScope()
  assert.equal(scope.contract, SIMPLE_SIGNING_EXPERIENCE_SCOPE_CONTRACT)
  assert.equal(scope.status, 'scope_locked')
  assert.deepEqual(scope.coveredDocumentTypes.map((item) => item.packetType), ['mandate', 'otp'])
  assert.ok(getSimpleSigningDocumentType('mandate').supportedSignerRoles.includes('seller'))
  assert.ok(getSimpleSigningDocumentType('otp').supportedSignerRoles.includes('purchaser_1'))
})

test('maps signer sessions into the simple review sign finish completed states', () => {
  assert.equal(resolveSimpleSigningState({ signerStatus: 'sent', requiredFields: 2, completedFields: 0 }), 'review')
  assert.equal(resolveSimpleSigningState({ signerStatus: 'viewed', requiredFields: 2, completedFields: 0 }), 'sign')
  assert.equal(resolveSimpleSigningState({ signerStatus: 'viewed', requiredFields: 2, completedFields: 1 }), 'sign')
  assert.equal(resolveSimpleSigningState({ signerStatus: 'viewed', requiredFields: 2, completedFields: 2 }), 'finish')
  assert.equal(resolveSimpleSigningState({ signerStatus: 'signed', requiredFields: 2, completedFields: 2 }), 'completed')
})

test('fails blocked signing links into a help state', () => {
  for (const status of ['declined', 'expired', 'revoked', 'voided']) {
    assert.equal(resolveSimpleSigningState({ signerStatus: status, requiredFields: 2, completedFields: 1 }), 'blocked')
  }
  assert.equal(resolveSimpleSigningState({ hasSessionError: true }), 'blocked')
})

test('keeps signed sessions out of blocked link recovery copy', () => {
  assert.equal(resolveSimpleSigningState({ signerStatus: 'signed', hasSessionError: true }), 'completed')
})

test('keeps phase 0 out of backend and delivery behavior', () => {
  const scope = buildSimpleSigningExperienceScope()
  assert.equal(scope.mutatedData, false)
  assert.deepEqual(scope.backendBoundaries, {
    changesEmailDispatch: false,
    changesFinalArtifactGeneration: false,
    changesFinalCompletionTruth: false,
    changesSigningTokenAuthority: false,
    changesStorageAccess: false,
  })
})
