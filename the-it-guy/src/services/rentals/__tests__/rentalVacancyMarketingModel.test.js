import assert from 'node:assert/strict'
import { buildRentalVacancyMarketingPreview, canTransitionRentalVacancyMarketing, createRentalVacancyMarketingPayload, evaluateRentalVacancyMarketingReadiness } from '../rentalVacancyMarketingModel.js'
assert.equal(createRentalVacancyMarketingPayload({ organisationId: 'org-1', vacancyId: 'vacancy-1', title: 'Oak House', features: ['Pool'] }).title, 'Oak House')
assert.equal(evaluateRentalVacancyMarketingReadiness({ marketing: { title: 'Oak', description: 'x'.repeat(80) }, mediaCount: 1, vacancy: { status: 'preparing' } }).ready, true)
assert.equal(canTransitionRentalVacancyMarketing('draft', 'ready_for_review'), true)
assert.equal(canTransitionRentalVacancyMarketing('archived', 'approved'), false)
assert.equal(buildRentalVacancyMarketingPreview({ marketing: { title: 'Oak' }, vacancy: { askingRent: 12000 } }).externalPublication, 'not_published')
console.log('Rental vacancy marketing model tests passed.')
