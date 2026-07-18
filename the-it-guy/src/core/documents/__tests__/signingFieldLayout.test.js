import test from 'node:test'
import assert from 'node:assert/strict'
import { assessSigningFieldLayout, createSigningFieldBlock } from '../signingFieldLayout.js'

test('creates valid signature and initial blocks', () => {
  const fields = [
    createSigningFieldBlock({ fieldType: 'signature', signerRole: 'seller', index: 0 }),
    createSigningFieldBlock({ fieldType: 'initial', signerRole: 'seller', index: 1 }),
  ]
  const result = assessSigningFieldLayout(fields)
  assert.equal(result.ready, true)
  assert.deepEqual(fields.map((field) => field.fieldType), ['signature', 'initial'])
})

test('rejects blocks outside the PDF page', () => {
  const field = createSigningFieldBlock({ fieldType: 'signature' })
  const result = assessSigningFieldLayout([{ ...field, xPosition: 590 }])
  assert.equal(result.ready, false)
  assert.ok(result.reasons.includes('E1_FIELD_OUTSIDE_PAGE:0'))
})

test('rejects unsupported signing field types', () => {
  const field = createSigningFieldBlock({ fieldType: 'signature' })
  const result = assessSigningFieldLayout([{ ...field, fieldType: 'stamp' }])
  assert.ok(result.reasons.includes('E1_FIELD_TYPE_INVALID:0'))
})
