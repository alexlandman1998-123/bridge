import assert from 'node:assert/strict'
import test from 'node:test'
import {
  legalDocumentBlocksToTemplateSections,
  templateSectionsToLegalDocumentBlocks,
  updateLegalDocumentBlock,
} from '../legalDocumentBlockAdapter.js'

const sections = [
  {
    id: 'section-finance',
    template_id: 'template-1',
    section_key: 'bond_approval_pack',
    section_label: 'Bond approval',
    section_type: 'legal_text',
    sort_order: 3,
    is_required: false,
    is_repeatable: true,
    condition_json: {
      enabled: true,
      field: 'transaction.finance_type',
      operator: 'equals',
      value: 'bond',
    },
    placeholder_keys: ['transaction.purchase_price', 'transaction.bond_amount'],
    legal_text: 'The purchase is subject to a bond of {{transaction.bond_amount}}.',
    metadata_json: {
      clause_pack_key: 'bond_approval_pack',
      governance: {
        locked: true,
        approval_status: 'attorney_approved',
        approved_at: '2026-07-14T10:00:00.000Z',
        approved_by: 'attorney-1',
      },
    },
  },
  {
    id: 'section-signatures',
    section_key: 'signature_pages',
    section_label: 'Signatures',
    section_type: 'legal_text',
    sort_order: 4,
    is_required: true,
    is_repeatable: false,
    condition_json: {},
    placeholder_keys: ['buyer_signature'],
    legal_text: 'Signed by the purchaser.',
    metadata_json: {
      custom_value: 'preserve-me',
      signing: {
        signing_requirement: 'client_signature',
        signing_role: 'buyer',
        requires_signature: true,
        signature_placeholder_key: 'buyer_signature',
        planned_fields: [{ signer_role: 'buyer', field_type: 'signature' }],
      },
    },
  },
]

test('adapts persisted sections into one ordered block model', () => {
  const blocks = templateSectionsToLegalDocumentBlocks(sections, {
    packetType: 'otp',
    templateId: 'template-1',
  })

  assert.deepEqual(blocks.map((block) => block.id), ['section-finance', 'section-signatures'])
  assert.equal(blocks[0].classification.conditional, true)
  assert.equal(blocks[0].approval.approved, true)
  assert.equal(blocks[0].approval.reviewedBy, 'attorney-1')
  assert.equal(blocks[1].kind, 'signing')
  assert.equal(blocks[1].signing.role, 'buyer')
  assert.equal(blocks[1].signing.fields[0].field_type, 'signature')
})

test('round-trips every persisted section field accepted by the template API', () => {
  const blocks = templateSectionsToLegalDocumentBlocks(sections, {
    packetType: 'otp',
    templateId: 'template-1',
  })
  const saved = legalDocumentBlocksToTemplateSections(blocks)

  assert.deepEqual(saved, sections.map((section) => ({
    sectionKey: section.section_key,
    sectionLabel: section.section_label,
    sectionType: section.section_type,
    legalText: section.legal_text,
    placeholderKeys: section.placeholder_keys,
    isRequired: section.is_required,
    isRepeatable: section.is_repeatable,
    conditionJson: section.condition_json,
    metadataJson: section.metadata_json,
    sortOrder: section.sort_order,
  })))
})

test('writes canonical signing metadata when a new signing block is introduced', () => {
  const [saved] = legalDocumentBlocksToTemplateSections([{
    key: 'seller_signature',
    label: 'Seller signature',
    kind: 'signing',
    sectionType: 'legal_text',
    content: 'Signed by the seller.',
    signing: {
      configured: true,
      persistedInMetadata: false,
      requirement: 'client_signature',
      role: 'seller',
      requiresSignature: true,
      signaturePlaceholderKey: 'seller_signature',
      fields: [{ signer_role: 'seller', field_type: 'signature' }],
    },
  }])

  assert.equal(saved.metadataJson.signing.signing_role, 'seller')
  assert.equal(saved.metadataJson.requires_signature, true)
  assert.deepEqual(saved.metadataJson.planned_signing_fields, [{ signer_role: 'seller', field_type: 'signature' }])
})

test('invalidates locked legal approval when wording changes', () => {
  const [block] = templateSectionsToLegalDocumentBlocks(sections, {
    packetType: 'otp',
    templateId: 'template-1',
  })
  const updated = updateLegalDocumentBlock(block, {
    content: `${block.content} The approval period is 14 days.`,
  }, { changedAt: '2026-07-16T09:00:00.000Z' })

  assert.equal(updated.approval.approved, false)
  assert.equal(updated.approval.status, 'attorney_review')
  assert.equal(updated.metadata.governance.locked, false)
  assert.equal(updated.metadata.governance.review_invalidated_at, '2026-07-16T09:00:00.000Z')
})

test('collects new merge fields without discarding persisted field coverage', () => {
  const [block] = templateSectionsToLegalDocumentBlocks(sections)
  const updated = updateLegalDocumentBlock(block, {
    content: `${block.content} Deposit: {{transaction.deposit_amount}}`,
  })

  assert.deepEqual(updated.placeholderKeys, [
    'transaction.purchase_price',
    'transaction.bond_amount',
    'transaction.deposit_amount',
  ])
})

test('allows display-label changes without invalidating legal approval', () => {
  const [block] = templateSectionsToLegalDocumentBlocks(sections)
  const updated = updateLegalDocumentBlock(block, { label: 'Finance approval' })

  assert.equal(updated.approval.approved, true)
  assert.equal(updated.metadata.governance.locked, true)
})

test('invalidates legal approval when signing requirements change', () => {
  const [block] = templateSectionsToLegalDocumentBlocks(sections)
  const updated = updateLegalDocumentBlock(block, {
    signing: {
      ...block.signing,
      modified: true,
      requirement: 'client_signature',
      requiresSignature: true,
    },
  }, { changedAt: '2026-07-16T10:00:00.000Z' })

  assert.equal(updated.approval.approved, false)
  assert.equal(updated.metadata.governance.review_invalidated_at, '2026-07-16T10:00:00.000Z')
})
