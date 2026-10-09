import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

const propertyWorkspaceStart = source.indexOf("leadWorkspaceTab === 'property'")
assert.notEqual(propertyWorkspaceStart, -1, 'Seller lead property workspace block is missing.')

const nextWorkspaceTab = source.indexOf("leadWorkspaceTab === 'documents'", propertyWorkspaceStart)
assert.notEqual(nextWorkspaceTab, -1, 'Seller lead documents workspace marker is missing after property block.')

const propertyWorkspace = source.slice(propertyWorkspaceStart, nextWorkspaceTab)

for (const removedCopy of [
  'Marketing Information & Media',
  'Edit Marketing Information',
  'Manage Media',
  'Published listing description',
  'Key selling points',
]) {
  assert.ok(!propertyWorkspace.includes(removedCopy), `Seller lead Property workspace should not render ${removedCopy}.`)
}

assert.ok(propertyWorkspace.includes('Property Profile'), 'Seller lead Property workspace should still render the property profile.')
assert.ok(propertyWorkspace.includes('Property Characteristics'), 'Seller lead Property workspace should still render property characteristics.')
assert.ok(propertyWorkspace.includes('Occupancy & Ownership'), 'Seller lead Property workspace should still render occupancy and ownership.')
assert.ok(propertyWorkspace.includes('Listing not created'), 'Pre-mandate property record should be shown as an uncreated listing.')
assert.ok(!propertyWorkspace.includes('listing.status}'), 'The raw private listing status must not appear in the indicator.')
assert.ok(propertyWorkspace.includes('selectedSellerJourney.onboardingSubmitted ? ('), 'Create Draft Listing must require submitted onboarding.')
assert.ok(propertyWorkspace.includes('handleCreateSellerPropertyDraftListing()'), 'Listing readiness must use the private draft creation action.')
assert.ok(propertyWorkspace.includes('Open {selectedLeadPropertyWorkspace.listing.isPrivateDraft'), 'A created draft must be openable from Listing & Readiness.')
assert.ok(!propertyWorkspace.includes("handleSellerJourneyAction('create_listing')"), 'Listing readiness must not use the mandate-gated journey action.')

const propertyEditor = source.slice(source.indexOf("sellerLeadEditMode === 'property' ? ("), source.indexOf("sellerLeadEditMode === 'characteristics' ? ("))
for (const field of ['propertyAddress', 'propertyType', 'erfNumber', 'sectionalTitle', 'sectionNumber', 'unitNumber', 'propertySuburb', 'propertyCity', 'propertyProvince', 'propertyPostalCode']) {
  assert.ok(propertyEditor.includes(`updateSellerProfileEditField('${field}'`), `Property Profile editor is missing ${field}.`)
}
assert.ok(propertyEditor.includes('Complex / Estate / Scheme'), 'Property Profile editor should use one shared name field.')
assert.ok(propertyEditor.includes('estateComplexName: value, schemeName: value'), 'The shared name must update both legacy fields.')
for (const removedField of ['placeholder="Scheme name"', 'placeholder="GPS latitude"', 'placeholder="GPS longitude"']) {
  assert.ok(!propertyEditor.includes(removedField), `Property Profile editor should not render ${removedField}.`)
}
assert.ok(source.includes("{ label: 'Complex / Estate / Scheme'"), 'Property Profile should show one shared name row.')
for (const removedLabel of ["{ label: 'Scheme name'", "{ label: 'GPS coordinates'", "{ label: 'Storeys'", "{ label: 'Year built'", "{ label: 'Condition'"]) {
  assert.ok(!source.includes(removedLabel), `Seller lead Property workspace should not show ${removedLabel}.`)
}
assert.ok(propertyWorkspace.includes('xl:self-stretch'), 'Property Characteristics and Occupancy cards should stretch to equal height on desktop.')
assert.ok(propertyEditor.includes('ownershipScheme: value'), 'Property title type must update the stored structure type.')
assert.ok(source.includes("'listing_review', 'mandate_ready'"), 'An explicit private review draft must count as a listing while an intake shell does not.')
assert.ok(source.includes('createPrivateDraft: true,') && source.includes('suppressSellerPortalInvite: true,'), 'Private draft creation must suppress the seller portal invite.')
assert.ok(source.includes("listingStatus: 'listing_review'"), 'An existing seller intake shell must be promoted to a private review draft.')
for (const field of ['estateComplexName', 'erfNumber', 'schemeName', 'sectionNumber', 'unitNumber', 'propertyPostalCode', 'latitude', 'longitude']) {
  assert.ok(source.includes(`${field}: normalizeText(form.`), `Manual property capture does not persist ${field}.`)
}

console.log('Seller lead property workspace presentation and capture contract verified.')

// Execute the production readers and save handler against isolated persisted
// fixtures: stale CRM data must not win after saving, clearing, or reopening.
const { getListingSellerFormData } = await import('../src/lib/listingSellerProfileBuilderModel.js')
const { projectSellerProfilePeople } = await import('../src/lib/sellerProfileCaptureModel.js')
const { resolveSellerLeadOwnershipRoute } = await import('../src/lib/sellerLeadOwnershipSetupModel.js')
const { buildSellerLeadManualCapturePayload } = await import('../src/lib/sellerLeadManualCaptureModel.js')
const { formatPropertyAddress } = await import('../src/lib/sellerPropertyAddress.js')
const { readSellerPopiConsent } = await import('../src/core/documents/sellerOnboardingConsent.js')
const { getSellerProfileNarrativeNotes } = await import('../src/lib/sellerLeadProfileNotesModel.js')
const { saveListingSellerCanonicalUpdate } = await import('../src/services/listings/listingSellerCanonicalUpdateService.js')
const normalizeStart = source.indexOf('function normalizeText(')
const normalizeEnd = source.indexOf('\nfunction asRecord(', normalizeStart)
const normalizeText = Function(`${source.slice(normalizeStart, normalizeEnd)}; return normalizeText`)()
const capturedText = value => String(value ?? '').trim()
const normalizeKey = value => normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value))
function functionsBetween(first, last) {
  const start = source.indexOf(`function ${first}(`)
  const end = source.indexOf(`\nfunction ${last}(`, start)
  assert.ok(start >= 0 && end > start)
  return source.slice(start, end)
}
const dependencies = {
  normalizeText, normalizeKey, isPlainObject, getListingSellerFormData, projectSellerProfilePeople,
  resolveSellerLeadOwnershipRoute, formatPropertyAddress, readSellerPopiConsent, getSellerProfileNarrativeNotes,
  getMigrationGuardedSellerOnboardingSnapshot: candidate => candidate,
  parseLeadRawEnquiryPayload: value => typeof value === 'string' ? JSON.parse(value) : value || {},
  KINGSTONS_SELLER_PROFILE_EDIT_DEFAULTS: {}, PROPERTY_WORKSPACE_FIELD_MAPPING: {},
  asArray: value => Array.isArray(value) ? value : [],
  ...Object.fromEntries(['BedDouble', 'Bath', 'Home', 'Car', 'Ruler', 'Building2', 'UserRound', 'CalendarDays', 'FileText', 'Clock3', 'Tag', 'Columns3', 'Lock'].map(key => [key, key])),
}
const readers = Function(...Object.keys(dependencies), [
  functionsBetween('firstWorkspaceText', 'getWorkspaceSellerCanonicalFacts'),
  functionsBetween('getWorkspaceSellerCanonicalFacts', 'formatCompactCurrency'),
  functionsBetween('getLeadSellerOnboardingFormData', 'hasLeadSellerOnboardingFormData'),
  'return { view: buildSellerPropertyWorkspaceViewModel, edit: buildKingstonsSellerProfileEditForm, form: buildKingstonsSellerProfileFormData, patch: buildSellerPropertyCharacteristicsPatch, onboarding: getWorkspaceSellerOnboarding, latest: retainLatestSellerListing }',
].join('\n'))(...Object.values(dependencies))
const savedForm = {
  ownerEntityType: 'natural_person', ownerStructureType: 'individual', sellerLegalType: 'individual',
  ownershipRouteConfirmed: true, sellerFirstName: 'Fixture', sellerSurname: 'Owner', email: 'fixture@example.test',
  phone: '0100000000', propertyAddress: '1 Fixture Road',
  bedrooms: '4', bathrooms: '2.5', garages: 0, parking: '3', erfSize: '17000', floorSize: '',
  levies: 0, ratesAndTaxes: '', monthlyRates: '99', askingPrice: '10700000',
}
const listing = {
  id: '11111111-1111-4111-8111-111111111111', updatedAt: '2026-10-09T06:58:13Z',
  sellerType: 'individual', sellerOnboardingStatus: 'in_progress', askingPrice: 10700000,
  bedrooms: 21, bathrooms: 21, garages: 21, parking: 21, erfSize: 1, floorSize: 500,
  sellerOnboarding: { formData: savedForm, status: 'in_progress' },
  documents: [{ id: 'existing-document' }], galleryImages: ['existing-image'],
}
const staleLead = {
  leadId: 'fixture-lead', contactId: 'fixture-contact', bedrooms: 21, bathrooms: 21, garages: 21, parking: 21, erfSize: 1, floorSize: 500,
  sellerOnboarding: { formData: { ...savedForm, bedrooms: '21', garages: '21', floorSize: '500' } },
}
function assertReadersUseSaved(lead, listing, expected) {
  const edit = readers.edit({ lead, listing })
  const view = readers.view({ lead, listing })
  for (const [key, label] of Object.entries({ bedrooms: 'Bedrooms', bathrooms: 'Bathrooms', garages: 'Garages', parking: 'Parking', erfSize: 'Erf size', floorSize: 'Floor size' })) {
    assert.equal(edit[key], capturedText(expected[key]), `Reopening ${key} must retain the saved value.`)
    assert.equal(view.characteristics.metrics.find(metric => metric.label === label).value, capturedText(expected[key]), `Displayed ${key} must use saved data, including zero and clears.`)
  }
  assert.equal(edit.levies, capturedText(expected.levies))
  assert.equal(edit.ratesAndTaxes, capturedText(expected.ratesAndTaxes))
}
assertReadersUseSaved(staleLead, listing, savedForm)
assertReadersUseSaved(staleLead, { sourceListing: listing }, savedForm)
const legacy = { ...listing, sellerOnboarding: { formData: {} } }
assert.equal(readers.edit({ listing: legacy, lead: staleLead }).bedrooms, '21')
const latestListing = { ...listing, updatedAt: '2026-10-09T07:01:00Z' }
assert.equal(readers.latest(latestListing, listing), latestListing, 'A late hydration response must not replace the committed save.')
assert.equal(readers.latest(listing, latestListing), latestListing)

async function runSave({ failCommit = false, failCrm = false, busy = false } = {}) {
  const state = { closed: false, busy, contactCalls: 0, activityCalls: 0, crmCalls: 0 }
  const form = { ...readers.edit({ lead: staleLead, listing }), bedrooms: '5', bathrooms: '0', garages: '', floorSize: '460', incomeTaxNumber: 'Unrelated draft value' }
  const scope = {
    ...dependencies, organisationId: 'fixture-org', selectedLead: staleLead,
    selectedLeadContact: { contactId: 'fixture-contact' }, selectedLeadLinkedListing: listing,
    sellerProfileEditForm: form, sellerLeadEditModal: { mode: 'characteristics', open: true },
    isLeadDetailSaving: busy, isSupabaseConfigured: true, currentAgent: { id: 'fixture-agent' },
    isValidEmail: () => true, buildKingstonsSellerProfileFormData: readers.form,
    buildSellerPropertyCharacteristicsPatch: readers.patch, getWorkspaceSellerOnboarding: readers.onboarding, buildSellerLeadManualCapturePayload,
    needsSellerOnboardingReplacement: () => { throw Error('A characteristics edit must not change ownership.') },
    setIsLeadDetailSaving: value => { state.busy = value },
    setError: value => { state.error = value }, setMessage: value => { state.message = value },
    setSelectedLeadHydratedListing: value => { state.listing = value },
    setRecords: () => {}, setLeadDetailForm: () => {}, scheduleRecordsReload: () => {},
    setSellerLeadEditModal: callback => { state.closed = callback({ open: true }).open === false },
    patchSelectedLeadRecord: patch => { state.leadPatch = patch },
    updateAgencyCrmContactRecord: () => { state.contactCalls++; throw Error('Must not write the contact') },
    updateAgencyCrmLeadRecord: async (org, id, patch) => {
      state.crmCalls++
      if (failCrm) throw Error('CRM unavailable')
      state.crmPatch = patch
    },
    // Activity may remain pending; the completed property save must still close.
    createAgencyCrmLeadActivity: () => { state.activityCalls++; return new Promise(() => {}) },
    saveListingSellerCanonicalUpdate: input => {
      state.input = input
      return saveListingSellerCanonicalUpdate(input, {
        savePrivateListingSellerCanonicalUpdate: async (update, options) => {
          if (failCommit) throw Error('Property save failed')
          state.update = update; state.options = options
          return {
            receipt: { committed: true, onboarding: { form_data: update.nextFormData } },
            snapshotOnly: true, listing: { id: listing.id, updatedAt: '2026-10-09T07:02:00Z' },
          }
        },
      })
    },
  }
  const start = source.indexOf('  async function handleSaveSellerLeadEditDetails(')
  const end = source.indexOf('\n  async function handleMovePipelineCard(', start)
  const handler = Function(...Object.keys(scope), `${source.slice(start, end)}; return handleSaveSellerLeadEditDetails`)(...Object.values(scope))
  await Promise.race([handler({ preventDefault() {} }), new Promise((_, reject) => {
    const timeout = setTimeout(() => reject(Error('The form waited for unrelated activity logging.')), 1000)
    timeout.unref()
  })])
  return { state, form }
}
const { state, form } = await runSave()
assert.equal(state.closed, true)
assert.equal(state.busy, false)
assert.equal(state.contactCalls, 0)
assert.equal(state.activityCalls, 1)
assert.equal(state.options.includeRequirementsAndDocuments, false)
assert.equal(state.update.requirementsAffected, false)
assert.deepEqual(state.input.formPatch, readers.patch(form), 'Send only the nine editable characteristics, keeping unrelated seller facts intact.')
assert.equal(state.update.nextFormData.incomeTaxNumber, undefined)
assert.equal(state.crmPatch.sellerOnboarding.formData.bedrooms, '5')
assert.equal(state.listing.documents[0].id, 'existing-document')
assert.deepEqual(state.listing.galleryImages, listing.galleryImages)
assertReadersUseSaved(staleLead, state.listing, form)
const failed = (await runSave({ failCommit: true })).state
assert.equal(failed.closed, false)
assert.equal(failed.error, 'Property save failed')
assert.equal(failed.busy, false)
assert.equal(failed.crmCalls, 0)
const crmFailed = (await runSave({ failCrm: true })).state
assert.equal(crmFailed.closed, false)
assert.match(crmFailed.error, /saved on the listing/)
assertReadersUseSaved(staleLead, crmFailed.listing, form)
assert.equal((await runSave({ busy: true })).state.input, undefined, 'Ignore a second submit while a save is already pending.')
assert.ok(source.includes('{error ? <p role="alert"'), 'Save errors must remain visible inside the open edit form.')
console.log('Seller property characteristics: saved values, clears, zeroes, reopen, stale hydration, delayed activity and failed saves verified.')
