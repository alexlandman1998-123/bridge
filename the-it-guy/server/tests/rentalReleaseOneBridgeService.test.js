import assert from 'node:assert/strict'
import { buildRentalLegacyRentalDataDryRun, resolveRentalInternalMarketingPilotGate } from '../services/rentalReleaseOneBridgeService.js'
assert.equal(resolveRentalInternalMarketingPilotGate({ enabled: true, pilotVacancyIds: ['v1'], vacancyId: 'v1' }).allowed, true)
assert.equal(resolveRentalInternalMarketingPilotGate({ enabled: true, pilotVacancyIds: ['v1'], vacancyId: 'v2' }).allowed, false)
assert.equal(buildRentalLegacyRentalDataDryRun([{ id: 'l1', listing_category: 'rental', address: '1 Oak', asking_price: 12000 }])[0].action, 'review_link')
console.log('Rental internal marketing operations tests passed.')
