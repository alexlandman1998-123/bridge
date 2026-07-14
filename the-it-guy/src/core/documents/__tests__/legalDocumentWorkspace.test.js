import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveLegalDocumentOrganisationId } from '../legalDocumentWorkspace.js'

test('resolves the active workspace before membership fallbacks', () => {
  assert.equal(resolveLegalDocumentOrganisationId(
    { id: 'workspace-1' },
    { organisationId: 'membership-org' },
  ), 'workspace-1')
})

test('supports organisation membership naming variants', () => {
  assert.equal(resolveLegalDocumentOrganisationId({}, { organisation_id: 'organisation-2' }), 'organisation-2')
})
