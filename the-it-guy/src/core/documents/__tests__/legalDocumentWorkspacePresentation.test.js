import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildLegalDocumentReviewModel,
  buildLegalDocumentScenarioTestResults,
  buildLegalDocumentOutlineGroups,
  describeLegalDocumentCondition,
  formatLegalDocumentFieldLabel,
  resolveLegalDocumentWorkspaceSelectedBlockId,
} from '../legalDocumentWorkspacePresentation.js'

const blocks = [
  { id: 'buyer', key: 'buyer_details', label: 'Buyer details', classification: { standard: true } },
  { id: 'property', key: 'property_sectional_title_pack', label: 'Sectional title', classification: { conditional: true } },
  { id: 'price', key: 'purchase_price', label: 'Purchase price', classification: { standard: true } },
  { id: 'bond', key: 'bond_finance_pack', label: 'Bond finance', classification: { conditional: true } },
  { id: 'terms', key: 'general_terms', label: 'General terms', classification: { standard: true } },
  { id: 'signatures', key: 'signature_pages', label: 'Signatures', classification: { signing: true } },
]

test('collapses technical sections into six recognisable document areas', () => {
  const groups = buildLegalDocumentOutlineGroups(blocks)

  assert.deepEqual(groups.map((group) => group.label), [
    'Buyer & seller',
    'Property',
    'Purchase price',
    'Finance',
    'Terms & conditions',
    'Signatures',
  ])
  assert.deepEqual(groups.map((group) => group.blocks[0]?.id), [
    'buyer',
    'property',
    'price',
    'bond',
    'terms',
    'signatures',
  ])
})

test('resolves deep-linked blocks before temporary focused areas', () => {
  assert.equal(resolveLegalDocumentWorkspaceSelectedBlockId(blocks, { blockId: 'price', area: 'conditions' }), 'price')
  assert.equal(resolveLegalDocumentWorkspaceSelectedBlockId(blocks, { area: 'conditions' }), 'property')
  assert.equal(resolveLegalDocumentWorkspaceSelectedBlockId(blocks, { area: 'signatures' }), 'signatures')
  assert.equal(resolveLegalDocumentWorkspaceSelectedBlockId(blocks), 'buyer')
})

test('turns field keys and conditions into plain-language labels', () => {
  assert.equal(formatLegalDocumentFieldLabel('transaction.finance_type'), 'Finance Type')
  assert.equal(describeLegalDocumentCondition({
    enabled: true,
    field: 'transaction.finance_type',
    operator: 'equals',
    value: 'bond_finance',
  }), 'Finance Type is Bond Finance')
  assert.equal(describeLegalDocumentCondition({ enabled: false }), 'Always included')
})

test('keeps review submission behind saved and complete draft wording', () => {
  const ready = buildLegalDocumentReviewModel({
    template: { status: 'draft', organisation_id: 'org-1', is_active: false },
    blocks: [{ id: 'one', label: 'Parties', required: true, content: 'The parties agree.' }],
    editPermission: { editable: true, reason: '' },
  })
  assert.equal(ready.action, 'submit_review')
  assert.equal(ready.actionEnabled, true)

  const blocked = buildLegalDocumentReviewModel({
    template: { status: 'draft', organisation_id: 'org-1', is_active: false },
    blocks: [{ id: 'one', label: 'Parties', required: true, content: '' }],
    dirty: true,
    editPermission: { editable: true, reason: '' },
  })
  assert.equal(blocked.actionEnabled, false)
  assert.equal(blocked.submissionBlockers.length, 2)
})

test('offers governed next actions for review and approved templates', () => {
  assert.equal(buildLegalDocumentReviewModel({
    template: { status: 'attorney_review' },
    editPermission: { editable: true },
  }).action, 'return_to_draft')
  assert.equal(buildLegalDocumentReviewModel({
    template: { status: 'approved' },
    publication: { ready: true },
  }).action, 'open_release')
})

test('tests conditional wording against the shared legal scenarios', () => {
  const [company, trust] = buildLegalDocumentScenarioTestResults({
    blocks: [{
      id: 'company-authority',
      label: 'Company authority',
      content: 'Authority wording',
      classification: { conditional: true },
      condition: { enabled: true, field: 'buyer_entity_type', operator: 'equals', value: 'company' },
    }],
    scenarios: [
      { key: 'company', label: 'Company', description: '' },
      { key: 'trust', label: 'Trust', description: '' },
    ],
  })

  assert.equal(company.conditionalIncludedCount, 1)
  assert.equal(trust.conditionalIncludedCount, 0)
})
