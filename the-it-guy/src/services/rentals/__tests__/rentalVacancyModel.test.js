import assert from 'node:assert/strict'
import { assertRentalVacancyTransition, canTransitionRentalVacancy, createRentalVacancyPayload, validateRentalVacancy } from '../rentalVacancyModel.js'
const vacancy = createRentalVacancyPayload({ organisationId: 'org-1', propertyId: 'property-1', unitId: 'unit-1', askingRent: 12000, depositAmount: 12000, availableFrom: '2026-09-01' })
assert.equal(vacancy.status, 'draft'); assert.equal(canTransitionRentalVacancy('draft', 'preparing'), true); assert.throws(() => assertRentalVacancyTransition('draft', 'let')); assert.equal(validateRentalVacancy({ organisationId: 'org-1', propertyId: 'property-1', unitId: 'unit-1', askingRent: -1 }).valid, false)
console.log('Rental vacancy model tests passed.')
