import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { transformSellerOnboardingToFacts } from '../src/services/documents/sellerOnboardingFactTransformer.js'

const appRoot = new URL('../', import.meta.url)
const workspaceRoot = new URL('../../', import.meta.url)

async function readAppFile(path) {
  return fs.readFile(new URL(path, appRoot), 'utf8')
}

async function readWorkspaceFile(path) {
  return fs.readFile(new URL(path, workspaceRoot), 'utf8')
}

const sellerOnboardingPage = await readAppFile('src/pages/SellerOnboarding.jsx')
const buyerPreferencePage = await readAppFile('src/pages/BuyerViewingPreferencesPage.jsx')
const agencyPipelinePage = await readAppFile('src/pages/agency/AgencyPipelinePage.jsx')
const buyerViewingFunction = await readWorkspaceFile('supabase/functions/buyer-viewing-preferences/index.ts')
const sellerCoordinationFunction = await readWorkspaceFile('supabase/functions/seller-viewing-coordination/index.ts')
const buyerEmailContent = await readWorkspaceFile('supabase/functions/send-email/content/viewingAvailabilityRequest.ts')
const buyerEmailHandler = await readWorkspaceFile('supabase/functions/send-email/handlers/viewingAvailabilityRequest.ts')

for (const contract of [
  /viewingAvailabilityWindows/,
  /viewingAccessInstructions/,
  /viewingNoticePeriod/,
  /viewingNoticeRequired/,
  /Viewing availability/,
  /Minimum notice for viewings/,
  /Access instructions for viewings/,
]) {
  assert.match(sellerOnboardingPage, contract, `seller onboarding should include ${contract}`)
}

const facts = transformSellerOnboardingToFacts({
  sellerFirstName: 'Alex',
  sellerSurname: 'Seller',
  email: 'seller@example.test',
  phone: '0820000000',
  ownershipType: 'individual',
  propertyCategory: 'residential',
  propertyStructureType: 'freehold',
  propertyType: 'house',
  propertyAddressDetails: {
    line1: '114 West Street',
    suburb: 'Lynnwood',
    city: 'Pretoria',
    province: 'Gauteng',
  },
  mandateType: 'sole',
  viewingAvailabilityWindows: 'Weekdays 17:00-19:00\nSaturday mornings',
  viewingAccessInstructions: 'Use side gate and confirm alarm code.',
  viewingNoticePeriod: '24 hours',
  viewingNoticeRequired: true,
}, { id: 'listing-1' })

assert.equal(facts.occupancy.viewing_availability_windows, 'Weekdays 17:00-19:00\nSaturday mornings')
assert.equal(facts.occupancy.viewing_access_instructions, 'Use side gate and confirm alarm code.')
assert.equal(facts.occupancy.viewing_notice_period, '24 hours')
assert.equal(facts.occupancy.viewing_notice_required, true)

for (const contract of [
  /resolveSellerViewingAvailabilityFromListing/,
  /buildSellerViewingAvailabilityNoteForProperties/,
  /sellerViewingAvailabilityWindows/,
  /sellerViewingAccessInstructions/,
  /sellerViewingNoticePeriod/,
  /sellerViewingNoticeRequired/,
  /sellerCoordinationNotes: savedPlan\.sellerCoordinationNotes \|\| sellerAvailabilityNote/,
]) {
  assert.match(agencyPipelinePage, contract, `agency planner should include ${contract}`)
}

for (const contract of [
  /Owner indicated availability/,
  /getSellerAvailabilityText/,
  /sellerViewingNoticePeriod/,
]) {
  assert.match(buyerPreferencePage, contract, `buyer preference page should include ${contract}`)
}

for (const source of [buyerViewingFunction, sellerCoordinationFunction, buyerEmailHandler]) {
  assert.match(source, /sellerViewingAvailabilityWindows/, 'edge/email sanitizers should preserve seller availability windows')
  assert.match(source, /sellerViewingAccessInstructions/, 'edge/email sanitizers should preserve seller access instructions')
  assert.match(source, /sellerViewingNoticePeriod/, 'edge/email sanitizers should preserve seller notice period')
}

assert.match(buyerEmailContent, /Owner indicated availability/, 'buyer email should render owner availability')
assert.match(buyerEmailContent, /sellerViewingAvailability/, 'buyer email should accept seller availability fields')

console.log('seller viewing availability onboarding phase 5 contract tests passed')
