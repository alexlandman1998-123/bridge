import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildDirectListingIntakePayload } from '../src/lib/directListingIntakeModel.js'
import { verifyListingPropertyPersistenceCopies, verifyListingPropertySave } from '../src/lib/listingPropertySaveVerification.js'
import { preferSavedPropertyFact, recoverStructuredPropertyFactsFromMarketingCopy } from '../src/lib/listingMarketingPropertyFactRecovery.js'

const agentListingsSource = readFileSync(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')
const agentListingDetailSource = readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const privateListingServiceSource = readFileSync(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('Quick Add persists direct listing form data through the seller onboarding form-data helper', () => {
  assert.match(agentListingsSource, /persistSellerProfileOnboardingFormData/)
  assert.match(agentListingsSource, /buildQuickAddDirectListingPersistencePayload/)
  assert.match(agentListingsSource, /sellerOnboardingFormData/)
  assert.match(agentListingsSource, /status: 'not_started'/)
})

test('Quick Add create and merge paths persist direct listing intake form data', () => {
  const persistenceCallCount = (agentListingsSource.match(/persistSellerProfileOnboardingFormData\(/g) || []).length
  assert.ok(persistenceCallCount >= 2, 'expected persistence calls for create and merge paths')
  assert.match(agentListingsSource, /direct listing intake form data persistence skipped after quick add create/)
  assert.match(agentListingsSource, /direct listing intake form data persistence skipped during merge/)
})

test('Quick Add stores direct listing canonical facts and readiness on listing records', () => {
  assert.match(agentListingsSource, /\.\.\.directListingPersistence\.sellerCanonicalFacts/)
  assert.match(agentListingsSource, /\.\.\.directListingPersistence\.sellerCanonicalFactReadiness/)
  assert.match(agentListingsSource, /sellerCanonicalFacts,\s*\n\s*sellerCanonicalFactReadiness,/)
})

test('Quick Add local fallback mirrors direct listing persistence data', () => {
  assert.match(agentListingsSource, /directListingIntake: directListingPersistence/)
  assert.match(agentListingsSource, /complianceDeclarations: directListingPersistence\.complianceDeclarations/)
  assert.match(agentListingsSource, /formData: directListingPersistence\.sellerOnboardingFormData/)
})

test('direct listing persistence payload remains declaration-only and portal-aware', () => {
  const payload = buildDirectListingIntakePayload({
    sellerType: 'trust',
    sellerName: 'Trust contact',
    sellerEmail: 'trustee@example.com',
    trustName: 'The Phase Three Trust',
    trustees: [{ name: 'Tessa', surname: 'Trustee' }],
    hasSignedMandate: true,
    mandateType: 'open',
    hasSignedPropertyConditionDisclosure: false,
    hasSignedFicaForm: false,
    sellerPortalInviteRequested: true,
  })

  assert.equal(payload.sellerCanonicalFacts.seller.legal_type, 'trust')
  assert.equal(payload.sellerOnboardingFormData.trust.trustees.length, 1)
  assert.equal(payload.complianceDeclarations.uploadsRequired, false)
  assert.equal(payload.complianceDeclarations.evidenceRequired, false)
  assert.equal(payload.sellerPortalInvite.requested, true)
})

test('listing description is persisted and rehydrated through shared aliases', () => {
  assert.match(agentListingsSource, /listingMarketing\.description/)
  assert.match(agentListingsSource, /onboardingFormData\.listingDescription/)
  assert.match(agentListingsSource, /onboardingFormData\.propertyDescription/)
  assert.match(agentListingsSource, /const hasPortalDescription = Boolean\(normalizeText\(form\.listingDescription \|\| form\.notes\)\)/)
  assert.match(agentListingsSource, /const saved = await performUpdateExistingListing\(\{\s*\n\s*navigateAfterSave: false,\s*\n\s*reloadAfterSave: false,\s*\n\s*emitListingsUpdated: false,/)
  assert.match(agentListingsSource, /if \(!saved\) \{\s*\n\s*setIsListingSaving\(false\)\s*\n\s*return\s*\n\s*\}/)
  assert.match(agentListingDetailSource, /onboardingFormData\.listingDescription/)
  assert.match(agentListingDetailSource, /propertyDescription: String\(draft\.description/)
  assert.match(agentListingDetailSource, /listingPreviewDescription: String\(draft\.listingPreviewDescription \|\| draft\.description/)
  assert.match(agentListingDetailSource, /listingDescription: nextDraft\.description\.trim\(\)/)
  assert.match(agentListingDetailSource, /description: value,\s*\n\s*listingPreviewDescription: shouldSyncPreview \? value : previous\.listingPreviewDescription/)
  assert.match(privateListingServiceSource, /onboardingFormData\.listingDescription/)
  assert.match(privateListingServiceSource, /const listingDescription = pickFirstText\(rowDescription, onboardingDescription, publicationDescription\)/)
})

test('listing editor verifies durable property details before navigating away', () => {
  assert.match(agentListingsSource, /const savedOnboarding = await persistSellerProfileOnboardingFormData/)
  assert.match(agentListingsSource, /const distributionSync = await syncPrivateListingDistributionData/)
  assert.match(agentListingsSource, /const verifiedListing = await getPrivateListing/)
  assert.match(agentListingsSource, /verifyListingPropertyPersistenceCopies\(/)
  assert.match(agentListingsSource, /allowProtectedSectionOverride: true/)
  assert.match(agentListingsSource, /Enter a listing price or select Price on Application\./)
  assert.match(agentListingsSource, /const structuredAddress = composeStructuredListingAddress\(form\)/)
  assert.doesNotMatch(agentListingsSource, /listing editor onboarding form persistence skipped/)
  assert.doesNotMatch(agentListingsSource, /listing editor distribution sync skipped/)

  const verification = verifyListingPropertySave({
    propertyAddress: '18 Test Avenue',
    propertyType: 'House',
    listingPrice: '2500000',
    bedrooms: '3',
    bathrooms: '2',
    garages: '1',
    parkingCount: '2',
    floorSize: '180',
    erfSize: '600',
  }, {
    addressLine1: '18 Test Avenue',
    propertyType: 'House',
    askingPrice: 2500000,
    bedrooms: 3,
    bathrooms: 2,
    garages: 1,
    parkingBays: 2,
    floorSize: 180,
    erfSize: 600,
  })
  assert.equal(verification.ready, true)

  const lostValues = verifyListingPropertySave({ bedrooms: '3', bathrooms: '2' }, { bedrooms: 0, bathrooms: 0 })
  assert.equal(lostValues.ready, false)
  assert.deepEqual(lostValues.mismatches.map((item) => item.field), ['bedrooms', 'bathrooms'])

  const durableCopies = verifyListingPropertyPersistenceCopies({
    form: {
      propertyAddress: '18 Test Avenue',
      propertyType: 'House',
      propertyStructureType: 'full_title',
      listingPrice: '2500000',
    },
    listing: {
      addressLine1: '18 Test Avenue',
      propertyType: 'House',
      propertyStructureType: 'full_title',
      askingPrice: 2500000,
    },
    onboarding: {
      form_data: {
        propertyAddress: '18 Test Avenue',
        propertyType: 'House',
        propertyStructureType: 'full_title',
        askingPrice: 2500000,
      },
    },
    publication: {
      address: '18 Test Avenue',
      property_type: 'House',
      asking_price: 2500000,
    },
  })
  assert.equal(durableCopies.ready, true)

  const staleOnboardingCopy = verifyListingPropertyPersistenceCopies({
    form: { propertyAddress: '18 Test Avenue', propertyType: 'House', propertyStructureType: 'full_title', listingPrice: '2500000' },
    listing: { addressLine1: '18 Test Avenue', propertyType: 'House', propertyStructureType: 'full_title', askingPrice: 2500000 },
    onboarding: { form_data: { propertyAddress: '', propertyType: 'House', propertyStructureType: '', askingPrice: 0 } },
    publication: { address: '18 Test Avenue', property_type: 'House', asking_price: 2500000 },
  })
  assert.equal(staleOnboardingCopy.ready, false)
  assert.deepEqual(staleOnboardingCopy.mismatches.map((item) => item.label), [
    'property address (onboarding)',
    'ownership scheme (onboarding)',
    'listing price (onboarding)',
  ])

  const deployedSchemaCopies = verifyListingPropertyPersistenceCopies({
    form: {
      propertyAddress: '395 Paul Kruger St, Capital Park, Pretoria, 0084, South Africa',
      streetAddress: '395 Paul Kruger Street',
      propertyType: 'House',
      propertyStructureType: 'full_title',
      listingPrice: '2050000',
      parkingCount: '16',
    },
    listing: {
      addressLine1: '395 Paul Kruger Street',
      propertyType: 'House',
      propertyStructureType: 'full_title',
      askingPrice: 2050000,
    },
    onboarding: {
      form_data: {
        propertyAddress: '395 Paul Kruger St, Capital Park, Pretoria, 0084, South Africa',
        propertyType: 'House',
        propertyStructureType: 'full_title',
        askingPrice: 2050000,
        parkingCount: '16',
      },
    },
    publication: {
      address: '395 Paul Kruger St, Capital Park, Pretoria, 0084, South Africa',
      property_type: 'House',
      asking_price: 2050000,
      parking_bays: 16,
    },
  })
  assert.equal(deployedSchemaCopies.ready, true)

  const recoveredFacts = recoverStructuredPropertyFactsFromMarketingCopy(
    'Spacious 5-Bedroom Property',
    'This 4-bathroom home is situated on a 1,023 m² erf with parking for approximately 16 vehicles.',
  )
  assert.equal(recoveredFacts.bedrooms, 5)
  assert.equal(recoveredFacts.bathrooms, 4)
  assert.equal(recoveredFacts.erfSize, 1023)
  assert.equal(recoveredFacts.parkingCount, 16)
  assert.equal(recoveredFacts.garages, null)
  assert.equal(preferSavedPropertyFact('6', recoveredFacts.bedrooms), '6')
  assert.equal(preferSavedPropertyFact('0', recoveredFacts.bedrooms), '5')
})

test('listing persistence recognises production UUIDs and cannot silently fall back to browser storage', () => {
  const canonicalUuidPattern = /\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[1-5\]\[0-9a-f\]\{3\}-\[89ab\]\[0-9a-f\]\{3\}-\[0-9a-f\]\{12\}\$/
  assert.match(agentListingsSource, canonicalUuidPattern)
  assert.match(agentListingDetailSource, canonicalUuidPattern)
  assert.match(agentListingsSource, /if \(isUuidLike\(editListingId\) && \(!isSupabaseConfigured \|\| !isUuidLike\(listingId\)\)\)/)
  assert.match(agentListingsSource, /Nothing was saved; please retry after the connection is restored\./)

  const productionListingId = 'de953aba-9901-48c6-aa31-c24671e50c4e'
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  assert.equal(uuidPattern.test(productionListingId), true)
})

test('listing editor keeps its detailed record when listing-grid summaries refresh', () => {
  assert.match(agentListingsSource, /const \[detailedEditListing, setDetailedEditListing\] = useState\(null\)/)
  assert.match(agentListingsSource, /setDetailedEditListing\(listing\)/)
  assert.match(agentListingsSource, /return normalizeText\(detailedEditListing\?\.id\) === editListingId\s*\? detailedEditListing\s*:\s*gridEditListingRecord/)
  assert.match(agentListingsSource, /background grid refresh can never replace it with that\s*\/\/ summary while the publication form is being hydrated/)
})

test('listing editor rehydrates older onboarding property facts before using defaults', () => {
  assert.match(privateListingServiceSource, /const onboardingAddress = pickFirstText\(/)
  assert.match(privateListingServiceSource, /onboardingFormData\.propertyAddress/)
  assert.match(privateListingServiceSource, /normalizeNumber\(onboardingFormData\.askingPrice\)/)
  assert.match(privateListingServiceSource, /onboardingFormData\.suburb, canonicalPropertyFacts\.suburb/)
  assert.match(privateListingServiceSource, /onboardingFormData\.postalCode/)
})

test('listing updates remove only the unsupported database column during schema fallback', () => {
  assert.match(privateListingServiceSource, /const missingColumn = Object\.keys\(compatiblePatch\)/)
  assert.match(privateListingServiceSource, /delete compatiblePatch\[missingColumn\]/)
  assert.match(privateListingServiceSource, /must not discard supported fields such as/)
})

test('listing marketing saves are not blocked by browser fallback cache or click events', () => {
  assert.match(agentListingDetailSource, /try \{\s*\n\s*writeAgentPrivateListings\(rowsWithListing\)/)
  assert.match(agentListingDetailSource, /local listing cache write skipped/)
  assert.match(agentListingDetailSource, /!\('nativeEvent' in draftOverride\)/)
  assert.match(agentListingDetailSource, /!\('currentTarget' in draftOverride\)/)
  assert.doesNotMatch(agentListingDetailSource, /onClick=\{saveMarketingDraft\}/)
  assert.match(agentListingDetailSource, /mergeListingRecord\(savedListing, updatedListing\)/)
  assert.match(agentListingDetailSource, /listing distribution sync skipped/)
})

test('key selling points survive editor, detail workspace, and publication mapping', () => {
  assert.match(agentListingsSource, /normalizeDirectListingFeatureSelections\(listing\.keySellingPoints/)
  assert.match(agentListingsSource, /normalizeDirectListingFeatureSelections\(listingMarketing\.features/)
  assert.match(agentListingsSource, /normalizeDirectListingFeatureSelections\(listing\.listingPublicationData\?\.features/)
  assert.match(agentListingDetailSource, /normalizeListingFeatureSelections\(\s*propertyDetails\?\.selectedFeatures/)
  assert.match(agentListingDetailSource, /listingRecord\?\.keySellingPoints/)
  assert.match(agentListingDetailSource, /listingRecord\?\.listingPublicationData\?\.features/)
  assert.match(privateListingServiceSource, /normalizeListingSellingPointSelections/)
  assert.match(privateListingServiceSource, /keySellingPoints: listingFeatureSelections/)
})

test('publication sync can still save description when feature columns are missing', () => {
  assert.match(privateListingServiceSource, /delete compatiblePublicationPayload\.features/)
  assert.match(privateListingServiceSource, /delete compatiblePublicationPayload\.amenities/)
  assert.match(privateListingServiceSource, /\.select\('listing_id, title, address, suburb, province, property_type, listing_type, asking_price, bedrooms, bathrooms, garages, parking_bays, floor_size, erf_size, rates_taxes, levies, description, status, created_at, updated_at'\)/)
})

test('approved listings publish their selected agency-website channel after the public projection is ready', () => {
  assert.match(agentListingsSource, /import \{ setWebsiteListingPublication \} from '..\/services\/websiteListingPublicationService'/)
  assert.match(agentListingsSource, /function shouldAutoPublishToAgencyWebsite\(listingStatus = '', selectedChannels = \[\]\)/)
  assert.match(agentListingsSource, /status: shouldAutoPublishToAgencyWebsite\(context\.listingStatus, form\.selectedSyndicationChannels\) \? 'Published' : 'Draft'/)
  assert.match(agentListingsSource, /setWebsiteListingPublication\(created\.listing\.id, 'publish'\)/)
  assert.match(agentListingsSource, /setWebsiteListingPublication\(listingId, 'publish'\)/)
})

test('blank marketing drafts do not erase persisted listing content', () => {
  assert.match(agentListingsSource, /LISTING_MARKETING_DRAFT_STORAGE_KEY = 'itg:listing-marketing-draft:v1'/)
  assert.match(agentListingsSource, /writeListingMarketingDraftStorage\(editListingId,\s*\{\s*\n\s*description: normalizeText\(value\)/)
  assert.match(agentListingsSource, /const effectiveListingDescription = normalizeText\(form\.listingDescription\) \|\| normalizeText\(/)
  assert.match(agentListingsSource, /const effectiveKeySellingPoints = keySellingPoints\.length \? keySellingPoints : existingKeySellingPoints/)
  assert.match(agentListingDetailSource, /const effectiveDescription = draftDescription \|\| existingDescription/)
  assert.match(agentListingDetailSource, /(?:const|let) effectiveDraft = \{\s*\n\s*\.\.\.draft,\s*\n\s*description: effectiveDescription,/)
  assert.match(privateListingServiceSource, /if \(nextDescription \|\| options\?\.allowBlankDescription === true\)/)
  assert.match(privateListingServiceSource, /if \(!publicationPayload\.description && existingPublicationData\.description\)/)
  assert.match(privateListingServiceSource, /if \(!publicationPayload\.features\.length && Array\.isArray\(existingPublicationData\.features\) && existingPublicationData\.features\.length\)/)
})
