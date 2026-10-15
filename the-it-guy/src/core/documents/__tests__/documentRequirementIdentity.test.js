import assert from 'node:assert/strict'
import test from 'node:test'
import { isDocumentRequirementRequired, matchDocumentRequirementLink } from '../documentRequirementIdentity.js'

test('explicit legacy request links are authoritative, including conflicting links', () => {
  assert.equal(matchDocumentRequirementLink({ requirement_id: 'request-A' }, { id: 'request-A' }), true)
  assert.equal(matchDocumentRequirementLink({ requirementId: 'request-B' }, { id: 'request-A' }), false)
  assert.equal(matchDocumentRequirementLink({ requirement_id: 'request-A' }, {}), false)
  assert.equal(matchDocumentRequirementLink({}, { id: 'request-A' }), null)
})

test('canonical links cannot fall back to the type of another request', () => {
  const requirement = { id: 'legacy-A', canonical_requirement_instance_id: 'canonical-A' }
  assert.equal(matchDocumentRequirementLink({ canonical_requirement_instance_id: 'canonical-A' }, requirement), true)
  assert.equal(matchDocumentRequirementLink({ canonicalRequirementInstanceId: 'canonical-B' }, requirement), false)
  assert.equal(matchDocumentRequirementLink({ requirement_id: 'legacy-B', canonical_requirement_instance_id: 'canonical-A' }, requirement), false)
  assert.equal(matchDocumentRequirementLink({ requirement_id: 'legacy-A', canonical_requirement_instance_id: 'canonical-B' }, requirement), false)
  assert.equal(matchDocumentRequirementLink({ canonical_requirement_instance_id: 'unknown' }, { id: 'legacy-A' }), false)
  assert.equal(matchDocumentRequirementLink({ canonical_requirement_instance_id: 'canonical-A' }, { id: 'canonical-A', context_type: 'transaction' }), true)
})

test('optional flags and levels do not become required, while unspecified legacy requests stay required', () => {
  for (const requirement of [{ required: false }, { is_required: false }, { isRequired: false },
    { requirement_level: 'optional' }, { requirementLevel: 'recommended' }, { requirement_level: ' OPTIONAL ' }]) {
    assert.equal(isDocumentRequirementRequired(requirement), false)
  }
  for (const requirement of [{}, { requirement_level: 'required' }, { requirementLevel: 'blocker' }]) {
    assert.equal(isDocumentRequirementRequired(requirement), true)
  }
})
