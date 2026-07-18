import test from 'node:test'
import assert from 'node:assert/strict'
import { assessSigningFieldLayout, createSigningFieldBlock } from '../signingFieldLayout.js'

test('accepts separate blocks on the same PDF page', () => {
  const signature = createSigningFieldBlock({ fieldType: 'signature', signerRole: 'seller', index: 0 })
  const initials = createSigningFieldBlock({ fieldType: 'initial', signerRole: 'seller', index: 1 })
  assert.equal(assessSigningFieldLayout([signature, initials]).ready, true)
})

test('rejects overlapping visual blocks', () => {
  const first = createSigningFieldBlock({ fieldType: 'signature', signerRole: 'seller' })
  const second = { ...createSigningFieldBlock({ fieldType: 'initial', signerRole: 'seller' }), id: 'second', xPosition: first.xPosition + 10, yPosition: first.yPosition + 10 }
  const result = assessSigningFieldLayout([first, second])
  assert.equal(result.ready, false)
  assert.ok(result.reasons.includes('E2_FIELD_COLLISION:0:1'))
})

test('allows identical coordinates on different pages', () => {
  const first = createSigningFieldBlock({ fieldType: 'signature', signerRole: 'seller' })
  const second = { ...first, id: 'second', pageNumber: 2 }
  assert.equal(assessSigningFieldLayout([first, second]).ready, true)
})
