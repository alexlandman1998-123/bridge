import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    deletePartnerInvitation,
    mapPartnerRelationship,
    normalizeOrganisationPartnerVisibilityLevel,
    resendPartnerInvitation,
    revokePartnerInvitation,
  } = await server.ssrLoadModule('/src/lib/partnersRepository.js')

  assert.equal(normalizeOrganisationPartnerVisibilityLevel('connected_partners_only'), 'connected_partners')
  assert.equal(normalizeOrganisationPartnerVisibilityLevel('preferred_partners_only'), 'preferred_partners')
  assert.equal(normalizeOrganisationPartnerVisibilityLevel('', { preferred: true }), 'preferred_partners')
  assert.equal(normalizeOrganisationPartnerVisibilityLevel('invite_only'), 'invite_only')

  const relationship = mapPartnerRelationship({
    id: 'relationship-1',
    organisation_id: 'org-agency',
    partner_organisation_id: 'org-bond',
    relationship_status: 'accepted',
    visibility_level: 'preferred_partners_only',
  }, 'org-agency')

  assert.equal(relationship.visibilityLevel, 'preferred_partners')
  assert.equal(relationship.preferred, true)
  assert.equal(typeof resendPartnerInvitation, 'function')
  assert.equal(typeof revokePartnerInvitation, 'function')
  assert.equal(typeof deletePartnerInvitation, 'function')

  console.log('partnersRepository tests passed')
} finally {
  await server.close()
}
