import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')

assert.match(
  source,
  /commissionPercentage: commissionType === 'percentage' \? String\(percentage\) : undefined/,
  'Percentage saves must omit inactive percentage fields instead of writing nulls.',
)
assert.match(
  source,
  /commissionAmount: commissionType === 'fixed' \? String\(amount\) : undefined/,
  'Fixed amount saves must omit inactive amount fields instead of writing nulls.',
)
assert.match(
  source,
  /if \(commissionType !== 'fixed' && hasAmount\)/,
  'Inactive fixed amounts should be preserved as previous values instead of discarded.',
)
assert.doesNotMatch(
  source,
  /if \(value === 'percentage'\) onCommissionDraftChange\?\.\('amount', ''\)/,
  'Switching to percentage must not clear the fixed amount draft value.',
)
assert.doesNotMatch(
  source,
  /if \(value === 'fixed'\) onCommissionDraftChange\?\.\('percentage', ''\)/,
  'Switching to fixed amount must not clear the percentage draft value.',
)
assert.doesNotMatch(
  source,
  /const existingFormData = readSellerOnboardingFormData\(linkedSellerListing, row\)[\s\S]*\.\.\.existingFormData,\s*\n\s*\.\.\.formPatch/,
  'Mandate save should send a sparse patch and let the service merge with current onboarding data.',
)
assert.match(
  source,
  /updatePrivateListingOnboardingFormData\(listingId, formPatch,/,
  'Mandate save should persist only the mandate patch.',
)

console.log('seller mandate save preserves data tests passed')
