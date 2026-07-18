import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyFrozenEditableRenderInput,
  resolveFrozenEditableRenderInput,
} from '../frozenEditableRenderInput.js'

function context() {
  return {
    editableSections: [{ key: 'terms', content: 'Unsaved browser wording.' }],
    editableRenderFreeze: {
      contract: 'c4-v1',
      freezeId: 'freeze-id',
      sourceVersionId: 'version-id',
      sourceVersionNumber: 4,
      editSequence: 3,
      contentFingerprint: 'md5_123',
      editableContent: {
        sections: [{ key: 'terms', content: 'Frozen database wording.' }],
      },
      sectionManifest: [{
        key: 'terms',
        label: 'Terms',
        content: 'Frozen database wording.',
        placeholders: [['purchase_price', 'Purchase price']],
      }],
      placeholders: { purchase_price: 'R1 000 000' },
    },
  }
}

test('replaces mutable browser sections with the frozen database manifest', () => {
  const resolved = applyFrozenEditableRenderInput(context())
  assert.equal(resolved.editableSections[0].content, 'Frozen database wording.')
  assert.equal(resolved.editableSections[0].tokens[0].token, 'purchase_price')
  assert.equal(resolved.frozenEditableRenderInput.contract, 'd1-v1')
  assert.equal(resolved.frozenEditableRenderInput.contentFingerprint, 'md5_123')
})

test('rejects mismatched frozen editable content and manifest', () => {
  const input = context()
  input.editableRenderFreeze.sectionManifest[0].content = 'Different wording.'
  assert.throws(
    () => resolveFrozenEditableRenderInput(input),
    (error) => error?.code === 'FROZEN_EDITABLE_RENDER_INPUT_INVALID',
  )
})

test('leaves legacy generation contexts unchanged when no freeze exists', () => {
  const input = { editableSections: [{ key: 'legacy', content: 'Legacy content.' }] }
  assert.equal(applyFrozenEditableRenderInput(input), input)
})
