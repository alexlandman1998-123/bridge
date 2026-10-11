import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  SELLER_DATA_FIELDS,
  SELLER_RECORD_OWNERSHIP,
  getSellerFieldOwnership,
  sellerPersonSourceKey,
} from '../src/lib/sellerDataOwnershipContract.js'

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

assert.ok(
  workspaceSource.includes('const roleplayers ='),
  'seller profile should resolve each owner, director, or trustee as a person-specific profile.',
)

for (const roleplayerSource of ['profileModel.draft.multipleOwners', 'profileModel.draft.companyDirectors', 'profileModel.draft.trustees']) {
  assert.ok(workspaceSource.includes(roleplayerSource), `seller profile should resolve ${roleplayerSource} roleplayers.`)
}

assert.ok(
  agencySource.includes('People on this seller profile') && agencySource.includes('role="tablist"'),
  'seller profile should render named person tabs when roleplayers are present.',
)

assert.ok(
  agencySource.includes('setActiveSellerProfileRoleplayerId(roleplayer.id)'),
  'seller profile person tabs should switch the displayed roleplayer.',
)

const formAliases = new Set()
const canonicalPaths = new Set()
for (const field of SELLER_DATA_FIELDS) {
  assert.ok(SELLER_RECORD_OWNERSHIP[field.authority], `${field.key} must identify an existing authoritative record`)
  assert.ok(field.scope && field.revision && field.editors.length && field.review && field.projections, `${field.key} must specify its save contract`)
  assert.equal(field.empty.omitted, 'unchanged')
  assert.equal(field.empty.false, 'value', 'false must not be treated as missing')
  assert.equal(field.history, 'preserve_signed_evidence_and_deal_decisions')
  for (const alias of field.formFields) {
    assert.ok(!formAliases.has(alias), `form field ${alias} cannot have competing owners`)
    formAliases.add(alias)
  }
  for (const path of field.canonicalPaths) {
    assert.ok(!canonicalPaths.has(path), `canonical path ${path} cannot have competing owners`)
    canonicalPaths.add(path)
  }
}
for (const field of [
  'sellerFirstName', 'sellerSurname', 'primaryContactName', 'email', 'sellerEmail', 'mobile',
  'idNumber', 'dateOfBirth', 'nationality', 'residentialAddress', 'sellerTaxNumber',
  'taxResident', 'vatRegistered', 'vatNumber', 'occupation', 'sourceOfFunds',
  'politicallyExposedPerson', 'politicallyExposedDetails', 'maritalStatus', 'maritalRegime',
  'companyRegistrationNumber', 'trustRegistrationNumber', 'estateReferenceNumber',
  'spouseName', 'spouseIdNumber', 'powerOfAttorneyPrincipalName', 'powerOfAttorneyName',
  'companyDirectors[2].idNumber', 'trustees.1.nationality', 'multipleOwners[0].ownershipShare',
  'companyBeneficialOwners[0].controlBasis', 'trustFounders[0].residentialAddress',
]) assert.equal(getSellerFieldOwnership(field)?.authority, 'private_listing_seller_onboarding', `${field} must resolve through current seller facts`)

assert.equal(getSellerFieldOwnership('seller.contact.email', { source: 'canonical' }), getSellerFieldOwnership('sellerEmail'))
assert.equal(getSellerFieldOwnership('seller.primary_contact.email', { source: 'canonical' }), getSellerFieldOwnership('email'))
assert.notEqual(getSellerFieldOwnership('primaryContactName'), getSellerFieldOwnership('companyName'), 'contact and legal entity are distinct facts')
assert.notEqual(getSellerFieldOwnership('powerOfAttorneyName'), getSellerFieldOwnership('powerOfAttorneyPrincipalName'), 'representative and principal are distinct facts')
assert.notEqual(getSellerFieldOwnership('saResident'), getSellerFieldOwnership('taxResident'), 'residence and tax residence must not become one fact through a legacy fallback')
assert.notEqual(getSellerFieldOwnership('unitNumber'), getSellerFieldOwnership('sectionNumber'), 'unit and registered section identifiers can differ')
assert.equal(getSellerFieldOwnership('multipleOwners[0].email').scope, 'listing_person')
assert.equal(getSellerFieldOwnership('multipleOwners[0].id').empty.explicit, 'reject_identity_removal')
assert.deepEqual(getSellerFieldOwnership('multipleOwners[0].id').editors, ['system_or_reviewed_identity_link_assignment'])
assert.equal(getSellerFieldOwnership('sellerBankPassword'), null, 'unknown fields must not inherit permission or authority')
assert.throws(() => getSellerFieldOwnership('email', { source: 'crm' }), /source must/)
assert.equal(getSellerFieldOwnership('askingPrice').authority, 'private_listings')
assert.equal(getSellerFieldOwnership('propertyAddress').authorityBoundary, 'operational_listing_after_mandate_signed')
assert.notEqual(sellerPersonSourceKey('onboarding-1', 'owner-1'), sellerPersonSourceKey('onboarding-2', 'owner-1'), 'local person ids must be scoped to the captured record')
assert.notEqual(sellerPersonSourceKey('a:b', 'c'), sellerPersonSourceKey('a', 'b:c'), 'source references must not collide on delimiters')
assert.equal(sellerPersonSourceKey('', 'owner-1'), '', 'missing references must never be fabricated')

for (const component of ['listings/ListingSellerInformationEditor.jsx', 'onboarding/SellerFicaQuestions.jsx']) {
  const source = readFileSync(new URL(`../src/components/${component}`, import.meta.url), 'utf8')
  const exposedFields = [...source.matchAll(/\bfield="([^"]+)"|onChange\('([^']+)'/g)].map(match => match[1] || match[2])
  assert.ok(exposedFields.length, `${component} must expose fields for the ownership coverage check`)
  for (const path of exposedFields) assert.ok(getSellerFieldOwnership(path), `exposed capture field ${path} needs an ownership rule`)
}

console.log('seller profile workspace fields and data ownership contract passed')
