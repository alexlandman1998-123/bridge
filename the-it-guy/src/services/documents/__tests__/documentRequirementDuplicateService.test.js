import test from 'node:test'
import assert from 'node:assert/strict'
import { findDuplicateRequirements } from '../documentRequirementDuplicateService.js'
const context = { contextType: 'transaction', contextId: 'matter' }
const row = { id: 'existing', context_type: 'transaction', context_id: 'matter', requested_from_role: 'seller', status: 'pending', custom_label: 'SARS letter', subject_kind: 'party' }
const payload = { party: 'seller', label: '  SARS   LETTER ' }

test('duplicates require exact matter, party and subject, never a fuzzy name', () => {
  assert.equal(findDuplicateRequirements([row], context, payload).length, 1)
  for (const changes of [{ context_id: 'other' }, { requested_from_role: 'buyer' }, { subject_kind: 'person', subject_id: 'person-a' }, { custom_label: 'SARS letter 2025' }]) {
    assert.equal(findDuplicateRequirements([{ ...row, ...changes }], context, payload).length, 0)
  }
  const person = { ...row, requested_from_contact_id: 'person-a' }
  assert.equal(findDuplicateRequirements([person], context, { ...payload, subjectKind: 'person', subjectId: 'person-a' }).length, 1)
  assert.equal(findDuplicateRequirements([person], context, { ...payload, subjectKind: 'entity', subjectId: 'person-a' }).length, 0)
})
test('catalogue identity is authoritative; exact custom names cannot bypass an existing type', () => {
  const standard = { ...row, custom_label: null, document_definition_key: 'sars', document_definitions: { display_label: 'SARS letter' } }
  assert.equal(findDuplicateRequirements([standard], context, { party: 'seller', definitionKey: 'sars' }).length, 1)
  assert.equal(findDuplicateRequirements([standard], context, { party: 'seller', definitionKey: 'other' }, 'SARS letter').length, 0)
  assert.equal(findDuplicateRequirements([standard], context, payload).length, 1)
  assert.equal(findDuplicateRequirements([row], context, { party: 'seller', definitionKey: 'sars' }, 'SARS letter').length, 1)
})
test('removed requests remain reusable and all historical matches remain separate', () => {
  const removed = { ...row, id: 'removed', status: 'not_applicable', applicability_override: 'removed' }
  assert.equal(findDuplicateRequirements([row, removed], context, payload).length, 2)
  assert.equal(findDuplicateRequirements([{ ...row, status: 'not_applicable' }], context, payload).length, 0)
})
