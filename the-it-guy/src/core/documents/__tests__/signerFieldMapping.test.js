import test from 'node:test'
import assert from 'node:assert/strict'
import { assessSignerFieldMapping } from '../signerFieldMapping.js'

const fields = [
  { signerRole: 'seller', fieldType: 'signature', required: true },
  { signerRole: 'seller', fieldType: 'initial', required: true },
]

test('maps placed fields to a real signer', () => {
  const result = assessSignerFieldMapping({ fields, signers: [{ signerRole: 'seller', signerName: 'Seller Name', signerEmail: 'seller@example.com' }] })
  assert.equal(result.ready, true)
  assert.deepEqual(result.mappedRoles, ['seller'])
})

test('rejects a missing signer identity', () => {
  const result = assessSignerFieldMapping({ fields, signers: [] })
  assert.ok(result.reasons.includes('E3_SIGNER_MISSING:seller'))
})

test('rejects a signer with initials but no required signature', () => {
  const result = assessSignerFieldMapping({
    fields: [{ signerRole: 'seller', fieldType: 'initial', required: true }],
    signers: [{ signerRole: 'seller', signerName: 'Seller Name', signerEmail: 'seller@example.com' }],
  })
  assert.ok(result.reasons.includes('E3_REQUIRED_SIGNATURE_MISSING:seller'))
})

test('rejects synthetic signer email addresses', () => {
  const result = assessSignerFieldMapping({ fields, signers: [{ signerRole: 'seller', signerName: 'Seller', signerEmail: 'seller@bridge.local' }] })
  assert.ok(result.reasons.includes('E3_SIGNER_IDENTITY_INVALID:seller'))
})
