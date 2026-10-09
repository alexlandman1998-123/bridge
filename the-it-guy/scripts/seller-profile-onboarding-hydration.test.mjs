import { resolveSellerLeadOwnershipRoute } from '../src/lib/sellerLeadOwnershipSetupModel.js'
import { buildSellerLeadManualCapturePayload } from '../src/lib/sellerLeadManualCaptureModel.js'
import { formatPropertyAddress } from '../src/lib/sellerPropertyAddress.js'
import { getListingSellerFormData } from '../src/lib/listingSellerProfileBuilderModel.js'
import { projectSellerProfilePeople, buildSellerEntityProfileAliases } from '../src/lib/sellerProfileCaptureModel.js'
import { buildSellerSubject } from '../src/lib/sellerSubjectModel.js'
import { buildSellerFicaScope } from '../src/lib/sellerFicaScopeModel.js'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const workspaceService = await readFile(new URL('../src/services/agentLeadWorkspaceService.js', import.meta.url), 'utf8')
const pipelinePage = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

assert.match(
  workspaceService,
  /sellerOnboardingSource\s*=\s*row\?\.sellerOnboarding\s*\|\|\s*row\?\.seller_onboarding/,
  'listing normalization must accept both camelCase and database snake_case onboarding records',
)
assert.match(
  workspaceService,
  /sellerOnboarding,\s*\n\s*seller_onboarding:\s*sellerOnboarding,/,
  'listing normalization must retain onboarding data for downstream seller-profile hydration',
)
assert.match(
  workspaceService,
  /formData:\s*onboardingFormData,\s*\n\s*form_data:\s*onboardingFormData,/,
  'normalized onboarding must expose the persisted form under both supported aliases',
)
assert.match(
  pipelinePage,
  /listing\?\.seller_onboarding\s*&&\s*typeof listing\.seller_onboarding === 'object'/,
  'seller profile extraction must fall back to the database snake_case onboarding relation',
)
assert.match(
  pipelinePage,
  /onboarding\?\.residentialAddressDetails\?\.line1[\s\S]*onboarding\?\.residentialAddress/,
  'seller profile must render the residential-address shape written by onboarding',
)
assert.match(
  pipelinePage,
  /onboarding\?\.maritalRegime[\s\S]*onboarding\?\.ownershipType/,
  'seller profile must render the marital/ownership values written by onboarding',
)

console.log('seller profile onboarding hydration regression: ok')


const normalizeText = value => String(value ?? '').trim()
const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value))
function loadFunctions(startName, endName, dependencies, returnExpression) {
  const start = pipelinePage.indexOf(`function ${startName}(`)
  const end = pipelinePage.indexOf(`\nfunction ${endName}(`, start)
  assert.ok(start >= 0 && end > start)
  return new Function(...Object.keys(dependencies), `${pipelinePage.slice(start, end)}; return ${returnExpression}`)(...Object.values(dependencies))
}
const readWorkspace = loadFunctions('getWorkspaceSellerCanonicalFacts', 'getWorkspacePropertyPostalCode', {
  isPlainObject, projectSellerProfilePeople, getListingSellerFormData,
  getLeadSellerOnboardingFormData: lead => lead.sellerOnboarding.formData,
}, 'getWorkspaceSellerOnboarding')
const peopleHelpers = loadFunctions('splitKingstonsSellerProfileList', 'normalizeKingstonsSellerProfileKindKey', {
  isPlainObject, normalizeText,
}, '({ format: formatKingstonsSellerProfilePeople, build: buildKingstonsSellerProfilePeople })')
const director = {
  full_name: 'Captured Director', id_number: '8001015009087', nationality: 'South African',
  residential_address: '1 Residential Road', email: 'director@example.test',
}
const canonicalFacts = { seller: {
  owner_entity_type: 'company', owner_structure_type: 'company', ownership_type: 'company',
  company: { name: 'Captured Company', registration_number: '2020/000001/07', registered_address: '2 Registered Road',
    directors: [director], authorised_signatory: { ...director, capacity: 'Director' },
  },
} }
const staleForm = {
  ownerEntityType: 'company', ownerStructureType: 'company', ownershipType: 'company',
  companyName: 'Captured Company', companyRegistrationNumber: '2020/000001/07', companyRegisteredAddress: '2 Registered Road',
  companyDirectors: [{ name: 'Captured Director' }], authorisedSignatoryName: 'Captured Director',
}
const hydrated = readWorkspace({
  sellerCanonicalFacts: { seller: { company: { directors: [{ name: 'Captured Director' }] } } },
  sellerOnboarding: { formData: staleForm },
}, { sellerCanonicalFacts: canonicalFacts, sellerOnboarding: { formData: staleForm } })
assert.equal(hydrated.companyDirectors[0].idNumber, director.id_number)
assert.equal(hydrated.companyDirectors[0].residentialAddress, director.residential_address)
assert.equal(hydrated.authorisedSignatoryIdNumber, director.id_number)
assert.equal(hydrated.authorisedSignatoryNationality, director.nationality)
const sellerSubject = buildSellerSubject({ formData: hydrated, canonicalFacts })
const scope = buildSellerFicaScope({ sellerSubject, onboarding: hydrated, canonicalFacts })
const people = scope.subjects.filter(entry => entry.type === 'person')
assert.equal(people.length, 1, 'Matching committed identities should display one person with both roles.')
assert.deepEqual(people[0].roles, ['Director / member', 'Authorised representative'])
assert.deepEqual(people[0].missing, [])
assert.equal(scope.missing.some(gap => gap.includes('ID or passport') || gap.includes('residential address') || gap.includes('nationality')), false)

const preserved = peopleHelpers.build(peopleHelpers.format(hydrated.companyDirectors), hydrated.companyDirectors)
assert.deepEqual(preserved, hydrated.companyDirectors, 'Editing another profile field must not flatten captured director details into names.')
assert.equal(peopleHelpers.build('Replacement Person', hydrated.companyDirectors)[0].idNumber, undefined, 'A replacement person must not inherit the previous identity.')
const aliases = buildSellerEntityProfileAliases(hydrated)
assert.equal(aliases.company.authorisedSignatory.idNumber, director.id_number)
assert.equal(aliases.company.authorised_signatory.nationality, director.nationality)
assert.equal(aliases.authorised_signatory_id_number, director.id_number)

const trustForm = projectSellerProfilePeople({}, { seller: { trust: { trustees: [director], authorised_trustee: director } } })
assert.equal(trustForm.trustees[0].idNumber, director.id_number)
assert.equal(trustForm.authorisedTrusteeIdNumber, director.id_number)
const trustAliases = buildSellerEntityProfileAliases(trustForm)
assert.equal(trustAliases.trust.authorisedTrustee.idNumber, director.id_number)
assert.equal(trustAliases.trust.authorised_trustee.nationality, director.nationality)
console.log('seller profile captured identity and CRM mismatch regression: ok')


const buildEditorSave = loadFunctions('splitKingstonsSellerProfileList', 'hasLeadSellerOnboardingFormData', {
  isPlainObject, normalizeText, formatPropertyAddress, resolveSellerLeadOwnershipRoute,
  normalizeKey: value => normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
  joinSellerNameParts: (first, last) => [first, last].filter(Boolean).join(' '),
}, 'buildKingstonsSellerProfileFormData')
const editDraft = {
  ...hydrated,
  companyDirectorsText: peopleHelpers.format(hydrated.companyDirectors),
  companyDirectorsRecords: hydrated.companyDirectors,
  incomeTaxNumber: 'Updated unrelated tax number',
}
const editorSave = buildEditorSave(editDraft)
assert.equal(editorSave.companyDirectors[0].idNumber, director.id_number)
assert.equal(editorSave.companyDirectors[0].nationality, director.nationality)
assert.equal(editorSave.companyDirectors[0].residentialAddress, director.residential_address)
assert.equal(editorSave.company.authorisedSignatory.idNumber, director.id_number)
const manualCapture = buildSellerLeadManualCapturePayload({ form: editDraft, legacyFormData: editorSave })
assert.equal(manualCapture.formPatch.companyDirectors[0].idNumber, director.id_number)
assert.equal(manualCapture.formPatch.authorisedSignatoryIdNumber, director.id_number)
assert.equal(manualCapture.formPatch.authorisedSignatoryNationality, director.nationality)
assert.equal(manualCapture.canonicalSellerFacts.seller.company.authorised_signatory.id_number, director.id_number)
console.log('seller profile actual editor save preserves captured identity: ok')
