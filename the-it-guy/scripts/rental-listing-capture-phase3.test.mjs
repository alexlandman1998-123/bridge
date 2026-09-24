import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const createPage = readFileSync('src/pages/rentals/RentalListingCreatePage.jsx', 'utf8')
const detailPage = readFileSync('src/pages/rentals/RentalListingDetailPage.jsx', 'utf8')

for (const source of [createPage, detailPage]) {
  assert.match(source, /rentalPriceFrequency/)
  assert.match(source, /rentalMandateType/)
  assert.match(source, /depositPolicy/)
  assert.match(source, /retirementAccommodation/)
  assert.match(source, /rentalPriceFrequencyOptions/)
  assert.match(source, /PER_SQUARE_METRE_RENTAL_CATEGORIES/)
  assert.match(source, /form\.depositPolicy !== 'no_deposit'/)
}

assert.match(createPage, /Rental amount/)
assert.match(createPage, /Retirement accommodation \(optional\)/)
assert.match(createPage, /This rental will be marked as having no deposit\./)
assert.match(detailPage, /Listing Service v55/)
assert.doesNotMatch(detailPage, /Listing Service v53/)

console.log('Rental listing capture Phase 3 checks passed')
