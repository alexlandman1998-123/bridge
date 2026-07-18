import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildEditableDocumentRevision,
  buildEditableRevisionManifest,
} from '../editableDocumentRevision.js'

test('normalizes transaction-specific section edits without mutating the base document', () => {
  const base = {
    schemaVersion: 1,
    documentId: 'packet-1',
    templateRevision: { id: 'template-v2', versionTag: 'v2' },
    sections: [{ key: 'terms', content: 'Original wording.' }],
  }
  const revision = buildEditableDocumentRevision({
    baseDocument: base,
    reviewState: 'draft',
    updatedAt: '2026-07-18T14:00:00.000Z',
    sections: [{
      key: 'terms',
      label: 'Terms',
      content: 'Transaction-specific wording.',
      tokens: [{ token: 'purchase_price' }],
    }],
  })

  assert.equal(revision.sections[0].content, 'Transaction-specific wording.')
  assert.deepEqual(revision.sections[0].mergeFields, ['purchase_price'])
  assert.equal(revision.templateRevision.id, 'template-v2')
  assert.equal(revision.reviewState, 'draft')
  assert.equal(base.sections[0].content, 'Original wording.')
})

test('builds the packet version manifest from the edited content', () => {
  const revision = buildEditableDocumentRevision({
    sections: [{ key: 'special', label: 'Special conditions', content: 'Condition text.', mergeFields: ['seller_full_name'] }],
  })
  const manifest = buildEditableRevisionManifest(revision)
  assert.equal(manifest[0].legalText, 'Condition text.')
  assert.deepEqual(manifest[0].placeholders, [['seller_full_name', 'seller_full_name']])
})

test('rejects duplicate section keys and invalid review states', () => {
  assert.throws(
    () => buildEditableDocumentRevision({ sections: [{ key: 'terms' }, { key: 'terms' }] }),
    (error) => error?.code === 'EDITABLE_DOCUMENT_DUPLICATE_SECTION',
  )
  assert.throws(
    () => buildEditableDocumentRevision({ sections: [{ key: 'terms' }], reviewState: 'signed' }),
    /draft or in_review/,
  )
})
