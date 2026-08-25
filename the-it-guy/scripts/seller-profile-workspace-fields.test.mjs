import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const agencySource = readFileSync(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

const workspaceStart = agencySource.indexOf('const selectedSellerProfileWorkspace = useMemo')
const workspaceEnd = agencySource.indexOf('const selectedSellerProfileCompletion', workspaceStart)
const workspaceSource = agencySource.slice(workspaceStart, workspaceEnd)

const modalStart = agencySource.indexOf("{sellerLeadEditMode === 'personal' || sellerLeadEditMode === 'profile'")
const modalEnd = agencySource.indexOf("{sellerLeadEditMode === 'property'", modalStart)
const modalSource = agencySource.slice(modalStart, modalEnd)

assert.ok(
  agencySource.includes("not_married: 'Not Married'"),
  'seller profile should present not_married as Not Married',
)

assert.ok(
  agencySource.includes('formatSellerProfileDisplayValue(firstWorkspaceValue(...values))'),
  'seller profile rows should use the seller-specific display formatter',
)

for (const removedLabel of [
  "['Occupation'",
  "['Employer'",
  "'Banking Details'",
  "['Electronic Signature'",
  "['Purchase Date'",
  "['Purchase Price'",
  "['Approx Bond Balance'",
  "['Primary Residence'",
]) {
  assert.ok(
    !workspaceSource.includes(removedLabel),
    `seller profile workspace should not display removed field ${removedLabel}`,
  )
}

for (const requiredLabel of [
  "['Ownership Scheme'",
  "['HOA / Estate'",
]) {
  assert.ok(
    workspaceSource.includes(requiredLabel),
    `seller profile workspace should display onboarding-aligned field ${requiredLabel}`,
  )
}

for (const removedInput of [
  'placeholder="Occupation"',
  'placeholder="Employer"',
  "sellerLeadEditMode === 'banking'",
  'placeholder="Electronic signature"',
  'placeholder="Purchase date"',
  'placeholder="Purchase price"',
  'placeholder="Approx bond balance"',
  'placeholder="Primary residence"',
]) {
  assert.ok(
    !modalSource.includes(removedInput),
    `seller profile edit modal should not expose removed input ${removedInput}`,
  )
}

assert.ok(
  modalSource.includes('placeholder="Ownership scheme"'),
  'seller profile edit modal should allow ownership scheme updates',
)

assert.ok(
  modalSource.includes('placeholder="HOA / estate"'),
  'seller profile edit modal should allow HOA / estate updates',
)

assert.match(
  agencySource,
  /ownershipScheme,[\s\S]*?ownership_scheme: ownershipScheme,[\s\S]*?propertyStructureType: ownershipScheme/,
  'seller profile save data should retain ownership scheme for listing prefill',
)

assert.match(
  agencySource,
  /estateOrHoa,[\s\S]*?estate_or_hoa: estateOrHoa,[\s\S]*?inEstate: estateOrHoa/,
  'seller profile save data should retain HOA / estate for listing prefill',
)

console.log('seller profile workspace fields contract passed')
