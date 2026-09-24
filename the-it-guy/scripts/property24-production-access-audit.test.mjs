import assert from 'node:assert/strict'
import { runProperty24ProductionAccessAudit } from '../server/property24/productionAccessAuditService.js'
import { PROPERTY24_PHASE2_PROPERTY_TYPES } from '../server/property24/propertyTypeCatalogue.js'

function response(data = {}) { return Promise.resolve({ status: 200, data }) }
function client({ userGroupId } = {}) {
  return {
    echoAuthenticated: async () => {
      if (userGroupId === 'wrong-group') {
        const error = new Error('Property24 GET failed with 401.')
        error.status = 401
        throw error
      }
      return response('ok')
    },
    fetchAgency: async () => response({ id: 31382 }),
    fetchAgencyAgents: async () => response([{ id: 7 }]),
    fetchListingReconciliation: async () => response([]),
    fetchPropertyTypes: async () => response(PROPERTY24_PHASE2_PROPERTY_TYPES),
    fetchListingTypes: async () => response([{ listingType: 'Sale' }]),
  }
}

const ready = await runProperty24ProductionAccessAudit({
  credentials: {
    configured: true,
    credentialSource: 'environment_specific',
    baseUrl: 'https://api.property24.com', username: 'user', password: 'password', apiVersion: 'v55',
    userGroupId: 'correct-group', sendUserGroupHeader: true,
  },
  agencyId: '31382',
  createClient: (options) => client(options),
})
assert.equal(ready.status, 'READY')
assert.equal(ready.checks.filter((item) => item.status === 'PASS').length, 7)
assert.equal(ready.propertyTypeCatalogue.matches, true)

const rejectedGroup = await runProperty24ProductionAccessAudit({
  credentials: {
    configured: true,
    credentialSource: 'environment_specific',
    baseUrl: 'https://api.property24.com', username: 'user', password: 'password', apiVersion: 'v55',
    userGroupId: 'wrong-group', sendUserGroupHeader: true,
  },
  agencyId: '31382',
  createClient: (options) => client(options),
})
assert.equal(rejectedGroup.status, 'BLOCKED')
assert.ok(rejectedGroup.blockers.includes('configured_property24_user_group_rejected'))
assert.equal(rejectedGroup.checks.some((item) => item.name === 'Configured agency access' && item.status === 'SKIPPED'), true)

const missing = await runProperty24ProductionAccessAudit({
  credentials: { configured: false, missing: ['PROPERTY24_PRODUCTION_BASE_URL'] },
  agencyId: '31382',
})
assert.ok(missing.blockers.includes('missing_explicit_property24_production_credentials'))

console.log('Property24 production access audit contract passed')
