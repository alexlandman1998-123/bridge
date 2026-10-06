import assert from 'node:assert/strict'
import { File } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildDirectListingIntakePayload } from '../src/lib/directListingIntakeModel.js'
import { settleListingImageUploads } from '../src/lib/listingMediaUploads.js'

const source = readFileSync(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')
const normalizeText = (value) => String(value ?? '').trim()
const normalizeKey = (value) => normalizeText(value).toLowerCase()
const isUnstorableCreateListingImageUrl = (value) => /^(data|blob):/i.test(value || '')
const quietConsole = { warn() {}, error() {} }

// Exercise the page's actual handlers with in-memory services, following the
// existing listing-channel tests. No production listings or portal calls occur.
function between(start, end) {
  const startIndex = source.indexOf(start)
  assert.ok(startIndex >= 0, `Missing ${start}`)
  const endIndex = source.indexOf(end, startIndex)
  assert.ok(endIndex > startIndex, `Missing ${end}`)
  return source.slice(startIndex, endIndex)
}

function bind(context, code, expression) {
  return new Function('context', `with (context) { ${code}; return ${expression}; }`)(context)
}

function storageContext() {
  const data = new Map()
  const context = {
    normalizeText, isUnstorableCreateListingImageUrl, console: quietConsole,
    window: {
      localStorage: {
        getItem: (key) => data.get(key) || null,
        setItem: (key, value) => data.set(key, value),
        removeItem: (key) => data.delete(key),
      },
      location: { search: '?step=marketing' },
      dispatchEvent() {},
    },
  }
  context.serializeCreateListingDraftForm = bind(context,
    between('function serializeCreateListingDraftForm(', 'function stripQuickListingMetadataText('), 'serializeCreateListingDraftForm')
  context.saveCreateListingDraftToStorage = bind(context,
    between('function saveCreateListingDraftToStorage(', 'function getListingMarketingDraftStorageKey('), 'saveCreateListingDraftToStorage')
  return { context, data }
}

test('drafts retain their step and listing receipt, without putting photo bytes in storage', () => {
  const { context, data } = storageContext()
  const form = {
    propertyAddress: '18 Test Avenue', coverImageId: 'local',
    listingImages: [
      { id: 'local', url: 'blob:local-photo', file: new File(['photo'], 'local.jpg') },
      { id: 'saved', url: 'https://example.test/photo.jpg', bucket: 'media', path: 'listing/photo.jpg' },
    ],
  }
  assert.equal(context.saveCreateListingDraftToStorage('draft', form, {
    step: 'marketing', maxVisitedStep: 4, pendingListingId: 'listing-1', organisationId: 'org-1',
  }), true)
  const restored = JSON.parse(data.get('draft'))
  assert.equal(restored.propertyAddress, form.propertyAddress)
  assert.equal(restored.__draftRecovery.step, 'marketing')
  assert.equal(restored.__draftRecovery.pendingListingId, 'listing-1')
  assert.equal(restored.__draftRecovery.missingPhotoCount, 1)
  assert.deepEqual(restored.listingImages.map((image) => image.id), ['saved'])
  assert.equal(restored.coverImageId, 'saved')
  assert.doesNotMatch(data.get('draft'), /blob:|"file":/)
  context.window.localStorage.setItem = () => { throw new Error('Storage quota exceeded') }
  assert.equal(context.saveCreateListingDraftToStorage('draft', form), false)
})

const restoreMarker = source.indexOf('// An edit form must always open')
const restoreStart = source.lastIndexOf('useEffect(() => {', restoreMarker)
const restoreEnd = source.indexOf('}, [createListingDraftScopeKey', restoreStart)
const restoreBody = source.slice(restoreStart + 'useEffect(() => {'.length, restoreEnd)
const autosaveMarker = source.indexOf('if (createListingDraftHydratedKey !== createListingDraftScopeKey')
const autosaveStart = source.lastIndexOf('useEffect(() => {', autosaveMarker)
const autosaveEnd = source.indexOf('}, [form,', autosaveStart)
const autosaveBody = source.slice(autosaveStart + 'useEffect(() => {'.length, autosaveEnd)

test('refresh resumes the photo step and its existing listing before autosave runs', () => {
  const { context, data } = storageContext()
  const pendingState = []
  const steps = ['seller', 'property', 'features', 'marketing', 'syndication', 'review'].map((key) => ({ key }))
  Object.assign(context, {
    form: { propertyAddress: '', listingImages: [], selectedSyndicationChannels: [] },
    isListingEditorWorkspace: true, isEditListingWorkspace: false,
    isSupabaseConfigured: true, MOCK_DATA_ENABLED: false,
    listingEditorDraftStorageKey: 'draft', createListingDraftScopeKey: 'draft:org-1',
    selectedWorkspaceOrganisationId: 'org-1', organisationId: 'org-1',
    pendingCreatedListingIdRef: { current: '' }, completedCreateListingRef: { current: false },
    createListingDraftHydratedKey: '', createListingStep: 'seller', createListingMaxVisitedStep: 0, missingDraftPhotoCount: 0,
    listingEditorSteps: steps,
    resolveListingEditorStep: (value, fallback) => steps.some((step) => step.key === value) ? value : fallback,
    normalizeCreateListingOwnerCards: () => [],
  })
  for (const [setter, key] of Object.entries({
    setForm: 'form', setCreateListingStep: 'createListingStep', setCreateListingMaxVisitedStep: 'createListingMaxVisitedStep',
    setMissingDraftPhotoCount: 'missingDraftPhotoCount', setCreateListingDraftHydratedKey: 'createListingDraftHydratedKey',
  })) {
    context[setter] = (value) => pendingState.push(() => { context[key] = typeof value === 'function' ? value(context[key]) : value })
  }
  context.saveCreateListingDraftToStorage('draft', { propertyAddress: '18 Test Avenue', listingImages: [] }, {
    pendingListingId: 'listing-1', organisationId: 'org-1', step: 'marketing', maxVisitedStep: 4, missingPhotoCount: 2,
  })
  const restore = bind(context, '', `() => { ${restoreBody} }`)
  const autosave = bind(context, '', `() => { ${autosaveBody} }`)
  restore()
  autosave()
  assert.equal(JSON.parse(data.get('draft')).propertyAddress, '18 Test Avenue', 'initial defaults must not overwrite the saved draft')
  pendingState.splice(0).forEach((apply) => apply())
  assert.equal(context.form.propertyAddress, '18 Test Avenue')
  assert.equal(context.createListingStep, 'marketing')
  assert.equal(context.createListingMaxVisitedStep, 4)
  assert.equal(context.pendingCreatedListingIdRef.current, 'listing-1')
  assert.equal(context.missingDraftPhotoCount, 2)
  autosave()
  assert.equal(JSON.parse(data.get('draft')).__draftRecovery.pendingListingId, 'listing-1')
  context.completedCreateListingRef.current = true
  data.delete('draft')
  autosave()
  assert.equal(data.has('draft'), false, 'completed creates must not leave a new blank draft')
})

test('large photo previews use object URLs and partial uploads retain successful photos for retry', async () => {
  let reads = 0
  const bindings = {
    crypto: { randomUUID: () => 'photo' }, URL: { createObjectURL: (file) => `blob:${file.name}` },
    readQuickListingImageAsDataUrl: () => { reads += 1; throw new Error('Base64 should not be needed') },
    File, settleListingImageUploads, isUnstorableCreateListingImageUrl,
  }
  const buildImages = bind(bindings, between('async function buildQuickListingImageDrafts(', 'async function uploadQuickListingImages('), 'buildQuickListingImageDrafts')
  const images = await buildImages([new File(['one'], 'one.jpg'), new File(['two'], 'two.jpg')])
  assert.equal(reads, 0)
  const attempts = []
  let failSecond = true
  bindings.uploadPrivateListingMediaAsset = async (file) => {
    attempts.push(file.name)
    if (file.name === 'two.jpg' && failSecond) throw new Error('Network request failed')
    return { url: `https://example.test/${file.name}`, path: file.name, bucket: 'media' }
  }
  const upload = bind(bindings, between('async function uploadQuickListingImages(', 'async function syncQuickListingDistributionData('), 'uploadQuickListingImages')
  let publication
  Object.assign(bindings, {
    normalizeText, normalizeKey, uploadQuickListingImages: upload,
    buildQuickListingPublicationFeatures: () => [], shouldAutoPublishToAgencyWebsite: () => true,
    syncPrivateListingDistributionData: async (_id, value) => { publication = value; return value },
  })
  const sync = bind(bindings, between('async function syncQuickListingDistributionData(', 'function serializeCreateListingDraftForm('), 'syncQuickListingDistributionData')
  const retained = [...images]
  const onUploaded = (result, original) => { retained[images.indexOf(original)] = result }
  await assert.rejects(sync('listing-1', { listingImages: images }, { onImageUploaded: onUploaded }), /1 image\(s\) uploaded successfully and retained/)
  assert.equal(publication.publicationData.status, 'Draft', 'partial photo uploads must not publish an incomplete website gallery')
  assert.equal(publication.media.galleryImages.length, 1)
  assert.equal(retained[0].file, undefined)
  assert.equal(retained[1].file.name, 'two.jpg')
  failSecond = false
  assert.equal((await upload('listing-1', retained)).length, 2)
  assert.deepEqual(attempts, ['one.jpg', 'two.jpg', 'two.jpg'], 'already uploaded photos must not upload again')
})

test('uploaded and removed photo previews release their object URLs', () => {
  const revoked = []
  const original = { id: 'photo-1', url: 'blob:photo-1' }
  const context = {
    form: { listingImages: [original], coverImageId: original.id },
    listingImagePreviewUrlsRef: { current: new Set([original.url]) },
    URL: { revokeObjectURL: (url) => revoked.push(url) },
    setForm: (update) => { context.form = update(context.form) },
  }
  const retain = bind(context, between('function retainUploadedListingImage(', 'async function handleCreateListingImageUpload('), 'retainUploadedListingImage')
  retain({ id: 'photo-1', url: 'https://example.test/photo-1.jpg' }, original)
  assert.deepEqual(revoked, ['blob:photo-1'])
  const second = { id: 'photo-2', url: 'blob:photo-2' }
  context.form.listingImages.push(second)
  context.listingImagePreviewUrlsRef.current.add(second.url)
  const remove = bind(context, between('function removeCreateListingImage(', 'function moveCreateListingImage('), 'removeCreateListingImage')
  remove(second.id)
  assert.deepEqual(revoked, ['blob:photo-1', 'blob:photo-2'])
  assert.equal(context.form.listingImages.length, 1)
})

const saveStart = source.indexOf('const sellerUpdatePayload = {', source.indexOf('async function performSaveListing()'))
const saveBody = source.slice(saveStart, source.indexOf('} else {\n        uploadedDocuments', saveStart))

function saveContext() {
  const { context, data } = storageContext()
  const calls = []
  let createdCount = 0
  const form = {
    suburb: 'Test Suburb', city: 'Test City', province: 'Gauteng', listingPrice: '2500000',
    propertyAddress: '18 Test Avenue',
    mandateType: 'sole', listingDescription: 'Listing description', sellerType: 'individual',
    selectedSyndicationChannels: ['private_property'], listingImages: [],
  }
  Object.assign(context, {
    mobileEditor: false, form, calls, failure: '', listingTitle: 'Test listing', propertyAddress: '18 Test Avenue',
    formattedAddress: '18 Test Avenue', addressLine2: '', streetAddress: '18 Test Avenue',
    country: 'South Africa', postalCode: '', latitude: null, longitude: null, googlePlaceId: '',
    selectedWorkspaceOrganisationId: 'org-1', organisationId: 'org-1', listingOrganisationId: 'org-1',
    linkedDevelopmentId: '', linkedUnitId: '', resolvedBranchId: '', resolvedAssignedAgentId: 'agent-1',
    resolvedAssignedAgentName: 'Agent', resolvedAssignedAgentEmail: 'agent@example.test',
    initialMandateStatus: 'not_started', resolvedListingStatus: 'draft', mandateStatus: 'not_started',
    sellerCanonicalFacts: {}, sellerCanonicalFactReadiness: {}, quickNotes: '', estimatedPrice: 2500000,
    completeness: {}, CANONICAL_LISTING_STRUCTURE: {}, createdListingId: '', createdListingTitle: '',
    directListingPersistence: { sellerOnboardingFormData: {}, seller: { sellerLegalType: 'unknown' } },
    pendingCreatedListingIdRef: { current: '' }, completedCreateListingRef: { current: false },
    isCreateListingWorkspace: true, createListingDraftStorageKey: 'draft',
    profile: { id: 'agent-1' }, activationTier: { statusLabel: 'Draft' }, complianceWarnings: [],
    listingDistributionSync: null, documentUploadQueue: [], normalizedStatus: 'draft',
    selectedQuickAddIntent: {}, activationWarnings: [], mandateUploaded: false, quickAddDuplicateOverride: false, mandatePack: {},
    uploadedDocuments: [], failedDocumentUploads: [], directListingRequirementSync: null,
    directListingSellerPortalInvite: null, websitePublication: null, handoffPlan: null,
    normalizePropertyCategory: () => 'residential', normalizePropertyStructureType: () => 'full_title',
    resolveQuickListingVisibility: () => 'internal',
    createPrivateListing: async (payload) => {
      createdCount += 1; calls.push(['create', payload]); return { listing: { id: 'listing-1', title: payload.title } }
    },
    updatePrivateListing: async (id, payload) => { calls.push(['update', id, payload]); return { id, title: payload.title } },
    saveCurrentCreateListingDraft: () => context.saveCreateListingDraftToStorage('draft', form, { pendingListingId: context.pendingCreatedListingIdRef.current, step: 'review' }),
    persistSellerProfileOnboardingFormData: async () => {
      calls.push(['onboarding']); if (context.failure === 'onboarding') throw new Error('Onboarding save failed'); return { id: 'onboarding-1' }
    },
    syncQuickListingDistributionData: async () => {
      calls.push(['media']); if (context.failure === 'photos') throw new Error('Photo upload failed'); return { publication: { listing_id: 'listing-1' } }
    },
    retainUploadedListingImage() {},
    getPrivateListing: async () => { calls.push(['readback']); return { id: 'listing-1' } },
    verifyListingPropertyPersistenceCopies: () => {
      calls.push(['verify']); return { ready: context.failure !== 'verification', mismatches: [{ label: 'Bedrooms' }] }
    },
    shouldAutoPublishToAgencyWebsite: () => false,
    deliverQuickAddSellerPortalInvite: async () => { calls.push(['invite']); return { requested: false } },
    buildQuickAddHandoffPlan: () => ({}), mergeQuickListingMetadataInNotes: () => '',
    createPrivateListingActivity: async () => null,
    resetForm: () => calls.push(['reset']),
    navigate: (path) => calls.push(['navigate', path]),
    setWorkflowMessage: (message) => calls.push(['message', message]),
    setQuickAddSuccess: (value) => calls.push(['success', value]),
    setShowNewListingModal() {}, setError() {}, setQuickAddDuplicateMatches() {}, setQuickAddDuplicateOverride() {},
  })
  return { context, data, calls, createdCount: () => createdCount, save: bind(context, '', `async () => { ${saveBody} }`) }
}

for (const failure of ['onboarding', 'photos', 'verification']) {
  test(`${failure} failure keeps the form and listing receipt, without reporting success`, async () => {
    const { context, data, calls, save } = saveContext()
    context.failure = failure
    await assert.rejects(save(), /saving is incomplete.*same listing/)
    assert.equal(context.pendingCreatedListingIdRef.current, 'listing-1')
    assert.equal(JSON.parse(data.get('draft')).__draftRecovery.pendingListingId, 'listing-1')
    assert.equal(calls.some(([action]) => ['reset', 'success', 'navigate', 'invite'].includes(action)), false)
    assert.equal(context.completedCreateListingRef.current, false)
  })
}

test('retry updates the original listing and opens it only after verified persistence', async () => {
  const { context, data, calls, save, createdCount } = saveContext()
  context.failure = 'photos'
  await assert.rejects(save())
  // The same receipt is restored after refresh; corrected fields belong to it.
  context.pendingCreatedListingIdRef.current = JSON.parse(data.get('draft')).__draftRecovery.pendingListingId
  context.form.listingPrice = '2600000'
  context.failure = ''
  await save()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(createdCount(), 1)
  const update = calls.find(([action, , payload]) => action === 'update' && payload.title)
  assert.equal(update[1], 'listing-1')
  assert.equal(update[2].askingPrice, 2600000)
  const verifyIndex = calls.findLastIndex(([action]) => action === 'verify')
  const navigateIndex = calls.findIndex(([action]) => action === 'navigate')
  assert.ok(navigateIndex > verifyIndex)
  assert.deepEqual(calls[navigateIndex], ['navigate', '/agent/listings/listing-1?tab=marketing'])
  assert.equal(data.has('draft'), false)
  assert.equal(context.completedCreateListingRef.current, true)
})

for (const mobile of [false, true]) test(`saving a ${mobile ? 'mobile developer' : 'desktop'} photo draft retries the same record and waits for saved marketing details`, async () => {
  const { context, data, calls, createdCount } = saveContext()
  Object.assign(context, {
    mobileEditor: mobile, isDeveloperWorkspace: mobile, workspace: {}, buildDeveloperSellerFacts: () => ({ sellerRole: 'developer' }),
    isSupabaseConfigured: true, MOCK_DATA_ENABLED: false,
    listingSaveInFlightRef: { current: false }, currentBranchId: '',
    createListingStep: 'marketing', CREATE_LISTING_DRAFT_STORAGE_KEY: 'draft-prefix',
    listingEditorDraftStorageKey: 'draft', deletedListingIds: [],
    buildListingAddressValueFromForm: () => ({}), getQuickAddSellerDisplayName: () => 'Seller',
    getQuickListingMandateStatus: () => 'not_started',
    buildQuickAddDirectListingPersistencePayload: () => context.directListingPersistence,
    buildListingPropertyCanonicalFacts: () => ({}), buildSectionalTitleAddressLine: () => '',
    setIsListingSaving() {}, setPrivateListings() {}, mergePrivateListingRows: () => [],
    setError: (message) => calls.push(['error', message]),
  })
  const saveDraft = bind(context, between('async function saveCreateListingDraft()', 'function buildContextualInitialListingLeadForm('), 'saveCreateListingDraft')
  context.failure = 'photos'
  await saveDraft()
  assert.equal(calls.some(([action]) => action === 'navigate'), false)
  assert.equal(JSON.parse(data.get('draft')).__draftRecovery.pendingListingId, 'listing-1')
  context.failure = ''
  await saveDraft()
  assert.equal(createdCount(), 1)
  assert.ok(calls.findIndex(([action]) => action === 'navigate') > calls.findLastIndex(([action]) => action === 'media'))
  assert.deepEqual(calls.find(([action]) => action === 'navigate'), ['navigate', `${mobile ? '/mobile/listings' : '/listings'}/listing-1/edit?step=marketing`])
})

test('two immediate submit events cannot create two listings', async () => {
  let finishSave
  let saves = 0
  const context = {
    isListingSaving: false, isCreateListingWorkspace: true, isEditListingWorkspace: false,
    listingSaveInFlightRef: { current: false }, completedCreateListingRef: { current: false },
    setError() {}, setWorkflowMessage() {}, setIsListingSaving() {}, assertMvpPilotCreationAllowed() {}, console: quietConsole,
    performSaveListing: () => { saves += 1; return new Promise((resolve) => { finishSave = resolve }) },
  }
  const submit = bind(context, between('async function handleSaveListing(', 'function requestListingDeletion('), 'handleSaveListing')
  const first = submit({ preventDefault() {} })
  await submit({ preventDefault() {} })
  assert.equal(saves, 1)
  finishSave()
  await first
  assert.equal(context.listingSaveInFlightRef.current, false)
})

 test('mobile creation returns to saved listings only after persistence and photo verification', async () => {
  const { context, save, calls } = saveContext()
  context.mobileEditor = true
  await save()
  assert.deepEqual(calls.find(([action]) => action === 'navigate'), ['navigate', '/mobile/listings'])
  assert.ok(calls.findIndex(([action]) => action === 'navigate') > calls.findIndex(([action]) => action === 'verify'))
 })

const developerStart = source.indexOf('const developerPayload = {', source.indexOf('async function performSaveListing()'))
const developerEnd = source.indexOf('await createPrivateListingActivity({', developerStart)
const developerSaveBody = source.slice(developerStart, developerEnd)

test('mobile developer creation saves unit assignment, marketing and photos, and reuses the record on retry', async () => {
  const { context, calls, data, createdCount } = saveContext()
  Object.assign(context, {
    mobileEditor: true, developerTitle: 'Unit 001 - Oak Court', developerListingStatus: 'active',
    developerVisibility: 'public', estimatedPrice: 2500000, developerNotes: 'Developer listing',
    developerSellerFacts: { sellerRole: 'developer', unitNumber: '001' }, developerReadinessWarnings: [],
    developerCompleteness: {}, sourceMode: 'development_unit',
    buildQuickAddDirectListingPersistencePayload: () => context.directListingPersistence,
    listingPropertySaveErrorMessage: () => 'Property mismatch',
    createdListingId: '', createdListingTitle: '',
  })
  context.form.developmentId = 'development-1'; context.form.unitId = 'unit-1'; context.form.notes = ''
  const saveDeveloper = bind(context, '', `async () => { ${developerSaveBody} }`)
  context.failure = 'photos'
  await assert.rejects(saveDeveloper(), /Photo upload failed/)
  assert.equal(context.pendingCreatedListingIdRef.current, 'listing-1')
  assert.equal(JSON.parse(data.get('draft')).__draftRecovery.pendingListingId, 'listing-1')
  context.failure = ''
  await saveDeveloper()
  assert.equal(createdCount(), 1)
  const payload = calls.find(([action]) => action === 'create')[1]
  assert.equal(payload.developmentId, 'development-1')
  assert.equal(payload.unitId, 'unit-1')
  assert.equal(payload.assignedAgentId, 'agent-1')
  assert.equal(payload.sellerType, 'developer')
  assert.equal(payload.listingCategory, 'development_unit')
  assert.ok(calls.findLastIndex(([action]) => action === 'verify') > calls.findLastIndex(([action]) => action === 'media'))
})

test('mobile channel preferences leave publication as a draft even for an active listing', async () => {
  let saved
  const context = {
    normalizeText, normalizeKey,
    uploadQuickListingImages: async () => [], buildQuickListingPublicationFeatures: () => [],
    shouldAutoPublishToAgencyWebsite: () => true,
    syncPrivateListingDistributionData: async (_id, payload) => { saved = payload; return { publication: { listing_id: 'listing-1' } } },
  }
  const sync = bind(context, between("async function syncQuickListingDistributionData(", 'function serializeCreateListingDraftForm('), 'syncQuickListingDistributionData')
  await sync('listing-1', {}, { listingStatus: 'active', deferPublication: true })
  assert.equal(saved.publicationData.status, 'Draft')
  await sync('listing-1', {}, { listingStatus: 'active' })
  assert.equal(saved.publicationData.status, 'Published', 'the existing desktop publishing path is preserved')
})

test('the real creation mapper persists the listing price and developer stock references in onboarding', () => {
  const context = {
    normalizeText, buildDirectListingIntakePayload,
    buildDirectListingMapperForm: (form) => form, normalizeDirectListingFeatureSelections: () => [],
    normalizePropertyCategory: () => 'residential', buildQuickListingPublicationFeatures: () => [],
    serializeListingFeatureFacts: () => ({}), normalizeListingFeatureFacts: () => ({}), buildDirectListingCanonicalFactReadiness: () => ({}),
  }
  const mapper = bind(context, between('function buildQuickAddDirectListingPersistencePayload(', 'function summarizeQuickAddRequirementSync('), 'buildQuickAddDirectListingPersistencePayload')
  const saved = mapper({ listingPrice: '2190000', unitNumber: '001', developmentId: 'development-1', unitId: 'unit-1' }).sellerOnboardingFormData
  assert.equal(saved.askingPrice, '2190000')
  assert.equal(saved.unitNumber, '001')
  assert.equal(saved.developmentId, 'development-1')
  assert.equal(saved.unitId, 'unit-1')
})
