import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildEditableDraftSectionManifest,
  buildEditableTransactionDocumentDraft,
} from '../transactionDocumentDraft.js'

function template() {
  return {
    id: '5e448018-a8df-4e68-92f0-50a70a370d7e',
    packet_type: 'mandate',
    module_type: 'agency',
    template_key: 'company_mandate_v2',
    template_label: 'Company Seller Mandate',
    template_format: 'structured',
    version_tag: 'v2',
    revision_number: 2,
    revision_root_template_id: 'ea728221-05af-43b9-8644-dd1da6da12e5',
    status: 'published',
    sections: [
      {
        section_key: 'parties',
        section_label: 'Parties',
        section_type: 'legal_text',
        sort_order: 0,
        legal_text: 'The seller is {{seller_full_name}}.',
        placeholder_keys: ['seller_full_name'],
      },
      {
        section_key: 'signatures',
        section_label: 'Signatures',
        section_type: 'signature_zone',
        sort_order: 1,
        legal_text: 'Signed by the seller.',
        metadata_json: {
          signing: {
            signing_fields: [{ signerRole: 'seller', fieldType: 'signature', required: true }],
          },
        },
      },
    ],
  }
}

test('copies a published template into an independent editable document', () => {
  const source = template()
  const draft = buildEditableTransactionDocumentDraft(source, {
    title: 'Mandate · 14 Sample Road',
    createdAt: '2026-07-18T12:00:00.000Z',
  })

  assert.equal(draft.title, 'Mandate · 14 Sample Road')
  assert.equal(draft.status, 'draft')
  assert.equal(draft.editable, true)
  assert.equal(draft.templateRevision.id, source.id)
  assert.equal(draft.templateRevision.rootId, source.revision_root_template_id)
  assert.equal(draft.templateRevision.versionTag, 'v2')
  assert.deepEqual(draft.mergeFields, ['seller_full_name'])
  assert.equal(draft.sections[0].content, 'The seller is {{seller_full_name}}.')

  draft.sections[0].content = 'Transaction-specific wording.'
  assert.equal(source.sections[0].legal_text, 'The seller is {{seller_full_name}}.')
})

test('produces an editable section manifest for packet version persistence', () => {
  const draft = buildEditableTransactionDocumentDraft(template())
  const manifest = buildEditableDraftSectionManifest(draft)
  assert.equal(manifest.length, 2)
  assert.equal(manifest[0].content, 'The seller is {{seller_full_name}}.')
  assert.deepEqual(manifest[0].placeholders, [['seller_full_name', 'seller_full_name']])
  assert.equal(manifest[1].signingFields[0].fieldType, 'signature')
})

test('rejects legacy file templates because they are not independently editable', () => {
  const source = template()
  source.template_format = 'docx'
  assert.throws(
    () => buildEditableTransactionDocumentDraft(source),
    (error) => error?.code === 'EDITABLE_DRAFT_REQUIRES_NATIVE_TEMPLATE',
  )
})
