import assert from 'node:assert/strict'

import {
  createProperty24RentalExDevSetupChecks,
} from '../server/property24/healthService.js'

const ready = createProperty24RentalExDevSetupChecks({
  config: {
    environment: 'exdev',
    agencyId: '31382',
    serverCredentialsReady: true,
    defaultSuburbId: '5864',
    defaultPropertyTypeId: '4',
    rentalLivePublishEnabled: false,
  },
  settings: {
    environment: 'exdev',
    agencyId: '31382',
    agentMappings: [{ property24AgentId: '77959' }],
  },
})

assert.equal(ready.length, 5)
assert.ok(ready.every((check) => check.status === 'ok'))

const blocked = createProperty24RentalExDevSetupChecks({
  config: { environment: 'production', rentalLivePublishEnabled: true },
  settings: { agentMappings: [] },
})

assert.equal(blocked.filter((check) => check.status === 'blocked').length, 5)
assert.match(blocked.find((check) => check.key === 'rental_catalog_mapping').detail, /PROPERTY24_DEFAULT_SUBURB_ID/)
assert.match(blocked.find((check) => check.key === 'rental_live_publish_guard').detail, /controlled ExDev publish run/)

console.log('rental Property24 Phase 1 ExDev readiness tests passed')
