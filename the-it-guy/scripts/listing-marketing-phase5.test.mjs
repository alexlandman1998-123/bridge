import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const detailSource = readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const modelSource = readFileSync(new URL('../src/services/listings/listingWithdrawalModel.js', import.meta.url), 'utf8')

assert.match(detailSource, /Withdraw it from Property24, Private Property, the agency website and Arch9/, 'The Marketing tab must explain the unified withdrawal action.')
assert.match(detailSource, /callProperty24ListingAction\('withdraw'/, 'Unified withdrawal must remove the Property24 listing.')
assert.match(detailSource, /propertyStatus: 'Inactive'/, 'Unified withdrawal must inactivate Private Property.')
assert.match(detailSource, /setWebsiteListingPublication\(listingRecord\.id, 'unpublish'\)/, 'Unified withdrawal must unpublish the agency website listing.')
assert.match(detailSource, /Retry remaining channels/, 'Failed channel withdrawals must remain retryable.')
assert.match(detailSource, /activityType: completeBeforeSave \? 'listing_withdrawn' : 'listing_withdrawal_incomplete'/, 'Complete and partial withdrawal attempts must be auditable.')
assert.match(modelSource, /listingWithdrawalIsComplete/, 'The listing must have an explicit all-channel completion gate.')
assert.match(modelSource, /listingStatus: 'withdrawn'/, 'The listing must only transition to withdrawn through the completion model.')

console.log('Listing marketing phase 5 withdrawal contract passed')
