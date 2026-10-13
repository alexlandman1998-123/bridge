import { buildSpecialistSalesFacts } from '../src/services/listings/specialistSalesListingSchema.js'
import { getListingFieldIssues, getSalesListingRequiredIssues } from '../src/services/listings/listingFieldRequirements.js'
import assert from 'node:assert/strict'
import { File } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildDirectListingIntakePayload } from '../src/lib/directListingIntakeModel.js'
import { settleListingImageUploads, reuseListingImageUpload } from '../src/lib/listingMediaUploads.js'

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
  Object.assign(context, { photoDraftCreationRef: { current: null }, photoUploadScopeRef: { current: 0 }, publicationStatusBusy: false, publicationPending: false, publicationUncertain: false, draftRecoveryBlocked: false, editDraftConflict: null, buildSpecialistSalesFacts, recoveryProtection: { markSaved() {} }, setCloudSave() {}, setDraftRecoveryBlocked() {}, setQuickAddSuccess() {}, buildInitialListingLeadForm: () => ({ listingImages: [] }), getCurrentDeletedListingIds: () => new Set(), profile: {}, workspace: {}, ...context })
  context.buildFinalSalesListingForm ||= new Function('normalizeKey', `${between('function buildFinalSalesListingForm(', 'function resolveQuickListingVisibility(')}; return buildFinalSalesListingForm;`)(normalizeKey)
  context.isDeveloperWorkspace ??= false
  context.editorRelistChannel ??= ''
  context.listingForm ??= context.form
  return new Function('context', `with (context) { ${code}; return ${expression}; }`)(context)
}

test('feature-step drafts resume in Extra details with navigable property and photo steps', () => {
  const steps = bind({}, source.match(/const CREATE_LISTING_WORKFLOW_STEPS = \[[\s\S]*?\n\]/)[0], 'CREATE_LISTING_WORKFLOW_STEPS')
  const resolve = bind({ CREATE_LISTING_WORKFLOW_STEPS: steps, normalizeDirectListingKey: normalizeKey }, between('function resolveListingEditorStep(', 'function buildListingEditorFormFromListing('), 'resolveListingEditorStep')
  assert.equal(resolve('features', 'property'), 'features')
  const newListingSteps = steps.filter(step => step.key !== 'seller')
  const restoredIndex = newListingSteps.findIndex(step => step.key === resolve('features'))
  assert.equal(newListingSteps[restoredIndex - 1].key, 'property')
  assert.equal(newListingSteps[restoredIndex + 1].key, 'marketing')
  assert.equal(resolve('marketing'), 'marketing')
})

test('listing validation accepts incomplete sellers of every ownership type while retaining property requirements', () => {
  const context = { getSalesListingRequiredIssues, normalizeText, normalizeKey, MANUAL_LISTING_STATUSES: ['draft', 'active', 'mandate_signed', 'under_offer', 'sold'] }
  context.hasListingPriceOrPoa = bind(context, between('function hasListingPriceOrPoa(', 'function listingHasPriceOrPoa('), 'hasListingPriceOrPoa')
  const validate = bind(context, between('function validateQuickListingMinimumFields(', 'function getDeveloperOrganisationName('), 'validateQuickListingMinimumFields')
  const form = { propertyType: 'House', suburb: 'Test suburb', streetNumber: '18', streetName: 'Test Avenue', city: 'Cape Town', province: 'Western Cape', bedrooms: 2, bathrooms: 1, propertyAddress: '18 Test Avenue', listingPrice: '2500000', propertyType: 'House', listingStatus: 'active' }
  for (const sellerType of ['unknown', 'individual', 'company', 'trust', 'close_corporation', 'deceased_estate', 'multiple_owners']) {
    assert.deepEqual(validate({ form: { ...form, sellerType, sellerName: '', sellerEmail: '', sellerPhone: '', hasSignedMandate: false }, assignedAgentKey: 'agent-1' }), [])
  }
  assert.deepEqual(validate({ form: { ...form, propertyAddress: '' }, assignedAgentKey: 'agent-1' }), ['Property address is required.'])
  assert.deepEqual(validate({ form: { ...form, listingPrice: '' }, assignedAgentKey: 'agent-1' }), ['Listing price or price on application is required.'])
})

test('initial channel guidance follows the integration photo and price requirements without inventing a floor-size blocker', () => {
  const context = { normalizeText, getListingFieldIssues, UNAVAILABLE_SYNDICATION_CHANNELS: {} }
  context.hasListingPriceOrPoa = bind(context, between('function hasListingPriceOrPoa(', 'function listingHasPriceOrPoa('), 'hasListingPriceOrPoa')
  const statuses = bind(context, between('function buildCreateListingPortalStatuses(', 'function shouldAutoPublishToAgencyWebsite('), 'buildCreateListingPortalStatuses')
  const form = { propertyType: 'House', suburb: 'Test suburb', streetNumber: '18', streetName: 'Test Avenue', city: 'Cape Town', province: 'Western Cape', bedrooms: 2, bathrooms: 1, propertyAddress: '18 Test Avenue', listingPrice: '', priceOnApplication: true, listingDescription: 'A family home.', listingImages: [{ id: 'photo-1' }], floorSize: '' }
  const result = statuses(form)
  assert.deepEqual(result.find(row => row.key === 'property24').missing, [])
  assert.deepEqual(result.find(row => row.key === 'private_property').missing, ['Private Property needs an asking price even when it is hidden. Add a price, or remove Private Property from your selected channels.', 'Add at least 3 photos.'])
  assert.deepEqual(statuses({ ...form, listingPrice: '2500000', listingImages: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }).find(row => row.key === 'private_property').missing, [])
})

function storageContext() {
  const data = new Map()
  const context = {
    normalizeText, isUnstorableCreateListingImageUrl, console: quietConsole,
    writeListingTextRecoveryDraft: (scope, data) => ({ scope, ...data }),
    saveListingRecoveryDraft: async () => {}, readListingRecoveryDraft: async () => null, clearListingRecoveryDraft: async () => {},
    listingCreationIdRef: { current: "" }, reserveListingCreationId: () => "00000000-0000-4000-8000-000000000001",
    isDeveloperWorkspace: false, legacyCreateListingDraftStorageKey: "legacy",
    setTimeout: (callback) => { callback(); return 1 }, clearTimeout() {},
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
const restoreEnd = source.indexOf('}, [isDeveloperWorkspace, createListingDraftScopeKey', restoreStart)
const restoreBody = source.slice(restoreStart + 'useEffect(() => {'.length, restoreEnd)
test('refresh resumes the photo step and existing listing before accepting input', async () => {
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
  restore()
  assert.equal(JSON.parse(data.get('draft')).propertyAddress, '18 Test Avenue', 'initial defaults must not overwrite the saved draft')
  await new Promise(resolve => setImmediate(resolve))
  pendingState.splice(0).forEach((apply) => apply())
  assert.equal(context.form.propertyAddress, '18 Test Avenue')
  assert.equal(context.createListingStep, 'marketing')
  assert.equal(context.createListingMaxVisitedStep, 4)
  assert.equal(context.pendingCreatedListingIdRef.current, 'listing-1')
  assert.equal(context.missingDraftPhotoCount, 2)
  assert.equal(JSON.parse(data.get('draft')).__draftRecovery.pendingListingId, 'listing-1')
  const legacyDraft = JSON.parse(data.get('draft'))
  legacyDraft.__draftRecovery.step = 'seller'
  legacyDraft.__draftRecovery.creationId = '00000000-0000-4000-8000-000000000007'
  context.readListingRecoveryDraft = async () => ({ form: { ...context.form }, recovery: { pendingListingId: '', creationId: '' }, missingPhotos: 2, release() {} })
  data.set('draft', JSON.stringify(legacyDraft))
  context.listingEditorSteps = steps.filter(step => step.key !== 'seller')
  restore()
  await new Promise(resolve => setImmediate(resolve))
  pendingState.splice(0).forEach((apply) => apply())
  assert.equal(context.createListingStep, 'property', 'old seller-step drafts must resume at the property without losing their saved listing')
  assert.equal(context.listingCreationIdRef.current, legacyDraft.__draftRecovery.creationId, 'the synchronous identity must survive an older photo transaction')
  assert.equal(context.pendingCreatedListingIdRef.current, 'listing-1')
  context.getCurrentDeletedListingIds = () => new Set(['listing-1'])
  let clearedScope = ''
  context.clearListingRecoveryDraft = async scope => { clearedScope = scope }
  restore()
  await new Promise(resolve => setImmediate(resolve))
  pendingState.splice(0).forEach(apply => apply())
  assert.notEqual(context.form.propertyAddress, '18 Test Avenue', 'deleted listing recovery must not return to the form')
  assert.equal(context.pendingCreatedListingIdRef.current, '')
  assert.equal(data.has('draft'), false)
  assert.equal(clearedScope, 'draft')
  context.completedCreateListingRef.current = true
  data.delete('draft')
  assert.equal(data.has('draft'), false, 'completed creates must not leave a new blank draft')
})

test('large photo previews use object URLs and partial uploads retain successful photos for retry', async () => {
  let reads = 0
  const bindings = {
    crypto: { randomUUID: () => 'photo' }, URL: { createObjectURL: (file) => `blob:${file.name}` },
    readQuickListingImageAsDataUrl: () => { reads += 1; throw new Error('Base64 should not be needed') },
    File, settleListingImageUploads, reuseListingImageUpload, isUnstorableCreateListingImageUrl,
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
    photoSaveCountRef: { current: 0 },
    setPhotoSaveProgress() {},
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

const saveStart = source.indexOf('const sellerUpdatePayload = {', source.indexOf('async function performSaveListing('))
const saveWait = between('  async function performSaveListing(', '    const sellerName =').split('\n').slice(1).join('\n')
const saveBody = saveWait + source.slice(saveStart, source.indexOf('} else {\n        uploadedDocuments', saveStart))

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
    isCreateListingWorkspace: true, isDeveloperWorkspace: false, createListingDraftStorageKey: 'draft', listingEditorDraftStorageKey: 'draft',
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
    persistCapturedListingSellerLead: async () => null,
    setInitialChannelResults() {},
    syndicationAvailability: { agency_website: { available: true, label: 'Agency Website' } },
    buildListingPublicationSnapshot: (draft) => draft,
    mergeListingFeatureSelections: (features) => features,
    publishInitialListingChannels: async (input) => { calls.push(['publish', input]); return [{ key: 'private_property', status: 'publishing' }] },
    readInitialListingChannelResults: () => context.resolvedListingStatus === 'active' ? [{ key: 'private_property', label: 'Private Property', status: 'publishing', message: 'Submitting…' }] : [],
    getPrivateListing: async () => { calls.push(['readback']); return { id: 'listing-1' } },
    verifyListingPropertyPersistenceCopies: () => {
      calls.push(['verify']); return { ready: context.failure !== 'verification', mismatches: [{ label: 'Bedrooms' }] }
    },
    shouldAutoPublishToAgencyWebsite: () => false,
    deliverQuickAddSellerPortalInvite: async () => { calls.push(['invite']); return { requested: false } },
    buildQuickAddHandoffPlan: () => ({}), mergeQuickListingMetadataInNotes: () => '',
    createPrivateListingActivity: async () => null,
    resetForm: () => calls.push(['reset']),
    navigate: (path, options) => { context.navigationState = options?.state; calls.push(['navigate', path]) },
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
    assert.equal(calls.some(([action]) => ['reset', 'success', 'navigate', 'invite', 'publish'].includes(action)), false)
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

test('an unconfirmed publishing request retains the saved record and form without reporting completion', async () => {
  const { context, data, calls, save, createdCount } = saveContext()
  context.resolvedListingStatus = 'active'
  context.publishInitialListingChannels = async () => { throw Error('Connection lost') }
  context.readInitialListingChannelResults = () => [{ key: 'private_property', status: 'uncertain' }]
  context.setInitialChannelResults = value => { context.channelResults = value }
  await assert.rejects(save(), /listing is saved.*not confirmed.*Check advertising status.*form has been kept/)
  assert.equal(createdCount(), 1)
  assert.equal(context.pendingCreatedListingIdRef.current, 'listing-1')
  assert.equal(JSON.parse(data.get('draft')).__draftRecovery.pendingListingId, 'listing-1')
  assert.equal(context.completedCreateListingRef.current, false)
  assert.equal(calls.some(([action]) => ['reset', 'success', 'navigate'].includes(action)), false)
  assert.equal(context.channelResults[0].status, 'uncertain')
})

test('blocked browser cleanup cannot turn a verified creation into a failed save', async () => {
  const { context, calls, save, createdCount } = saveContext()
  let released = false
  context.recoveryProtection = { markSaved() { released = true } }
  context.window.localStorage.removeItem = () => { throw new Error('Browser storage blocked') }
  await save()
  assert.equal(createdCount(), 1)
  assert.equal(context.completedCreateListingRef.current, true)
  assert.equal(released, true)
  assert.ok(calls.find(([action]) => action === 'navigate'))
})

for (const [mobile, developer] of [[false, false], [false, true], [true, true]]) test(`saving a ${mobile ? 'mobile' : 'desktop'} ${developer ? 'developer' : 'sale'} photo draft retries the same record and waits for saved marketing details`, async () => {
  const { context, data, calls, createdCount } = saveContext()
  Object.assign(context, {
    mobileEditor: mobile, isDeveloperWorkspace: developer, workspace: {}, buildDeveloperSellerFacts: () => ({ sellerRole: 'developer' }),
    isSupabaseConfigured: true, MOCK_DATA_ENABLED: false,
    buildListingEditorFormFromListing: () => ({ ...context.form, selectedSyndicationChannels: [] }),
    listingRecoveryRevision: () => 'confirmed-revision',
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
  assert.equal(calls.find(([action]) => action === 'create')[1].listingCategory, developer ? 'development_unit' : 'private_sale')
  assert.ok(calls.findIndex(([action]) => action === 'navigate') > calls.findLastIndex(([action]) => action === 'media'))
  assert.deepEqual(calls.find(([action]) => action === 'navigate'), ['navigate', `${mobile ? '/mobile/listings' : '/listings'}/listing-1/edit?step=marketing`])
  const editorDraft = JSON.parse(data.get('draft:edit:listing-1'))
  assert.equal(editorDraft.__draftRecovery.baseRevision, 'confirmed-revision')
  assert.deepEqual(editorDraft.selectedSyndicationChannels, [], 'recovery must reopen the confirmed stored form, rather than unsaved advertising choices')
  assert.equal(calls.some(([action]) => action === 'publish'), false)
  assert.deepEqual(editorDraft.__draftRecovery.baseForm.selectedSyndicationChannels, [])
  assert.equal(data.has('draft-prefix:edit:listing-1'), false)
})

for (const mobile of [false, true]) test(`${mobile ? 'mobile' : 'desktop'} activation sends selected channels after verified persistence and opens without waiting for a slow portal`, async () => {
  const { context, calls, save } = saveContext()
  context.mobileEditor = mobile
  context.resolvedListingStatus = 'active'
  context.form.sellerType = 'unknown'
  context.form.mandateType = ''
  context.form.hasSignedMandate = false
  context.persistCapturedListingSellerLead = async () => { throw new Error('Seller CRM unavailable') }
  await save()
  const publishIndex = calls.findIndex(([action]) => action === 'publish')
  assert.ok(publishIndex > calls.findIndex(([action]) => action === 'verify'))
  const request = calls[publishIndex][1]
  assert.equal(request.listingId, 'listing-1')
  assert.equal(request.listingStatus, 'active')
  assert.deepEqual(request.channels, ['private_property'])
  assert.equal(context.navigationState.initialChannelResults[0].status, 'publishing')
  assert.ok(calls.findIndex(([action]) => action === 'navigate') > publishIndex)
})

test('two immediate submit events cannot create two listings', async () => {
  let finishSave
  let saves = 0
  const context = {
    createListingDraftHydratedKey: 'draft', createListingDraftScopeKey: 'draft',
    floorplanUploading: false, isListingSaving: false, isCreateListingWorkspace: true, isEditListingWorkspace: false, form: { listingStatus: "active" }, listingFieldIssues: [],
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

const developerStart = source.indexOf('const developerPayload = {', source.indexOf('async function performSaveListing('))
const developerEnd = source.indexOf('await createPrivateListingActivity({', developerStart)
const developerSaveBody = source.slice(developerStart, developerEnd)

for (const mobileEditor of [false, true]) test(`${mobileEditor ? 'mobile' : 'desktop'} developer creation saves unit assignment, marketing and photos, and reuses the record on retry`, async () => {
  const { context, calls, data, createdCount } = saveContext()
  Object.assign(context, {
    mobileEditor, isDeveloperWorkspace: true, developerTitle: 'Unit 001 - Oak Court', developerListingStatus: 'active',
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

test('final edit save sends updates while an intermediate step only saves', async () => {
  const calls = []
  const context = {
    floorplanUploading: false, isListingSaving: false, isCreateListingWorkspace: false, isEditListingWorkspace: true, editorRelistChannel: '',
    form: { listingStatus: 'active' }, listingFieldIssues: [], listingSaveInFlightRef: { current: false },
    setError() {}, setWorkflowMessage() {}, setIsListingSaving() {}, console: quietConsole,
    performUpdateExistingListing: async options => calls.push(options),
  }
  const submit = bind(context, between('async function handleSaveListing(', 'function requestListingDeletion('), 'handleSaveListing')
  await submit({ preventDefault() {} })
  assert.deepEqual(calls, [{ sendUpdates: true, relistChannel: '' }])
  const nextSource = between('async function goToNextCreateListingStep(', 'function goToPreviousCreateListingStep(')
  assert.doesNotMatch(nextSource, /sendUpdates: true/)
})

test('selected photos start uploading immediately, retain success and ignore removed or departed photos', async () => {
  let finish
  const image = { id: 'early', name: 'early.jpg', file: new File(['photo'], 'early.jpg'), url: 'blob:early' }
  const context = {
    form: { listingImages: [image] }, isListingEditorWorkspace: true, isSupabaseConfigured: true, MOCK_DATA_ENABLED: false,
    photoUploadScopeRef: { current: 0 }, ensurePhotoListingDraft: async () => 'listing-1',
    photoSaveCountRef: { current: 0 }, setPhotoSaveProgress() {}, listingImagePreviewUrlsRef: { current: new Set() },
    setForm: update => { context.form = update(context.form) },
    uploadQuickListingImages: async (_id, images, retain) => {
      await new Promise(resolve => { finish = resolve })
      retain({ id: images[0].id, url: 'https://example.test/photo.jpg' }, images[0])
    },
  }
  context.retainUploadedListingImage = bind(context, between('function retainUploadedListingImage(', 'async function ensurePhotoListingDraft('), 'retainUploadedListingImage')
  const start = bind(context, between('async function startSelectedPhotoUploads(', 'async function handleCreateListingImageUpload('), 'startSelectedPhotoUploads')
  const early = start([image])
  assert.equal(context.form.listingImages[0].uploadStatus, 'uploading')
  await Promise.resolve()
  finish(); await early
  assert.equal(context.form.listingImages[0].uploadStatus, 'uploaded')
  assert.equal(context.form.listingImages[0].file, undefined)
  context.form.listingImages = [image]
  const removed = start([image]); await Promise.resolve()
  context.form.listingImages = []
  finish(); await removed
  assert.deepEqual(context.form.listingImages, [])
  context.form.listingImages = [image]
  const departed = start([image]); await Promise.resolve()
  context.photoUploadScopeRef.current += 1
  finish(); await departed
  assert.equal(context.form.listingImages[0].url, 'blob:early')
  context.uploadQuickListingImages = async () => { throw Error('offline') }
  await start([image])
  assert.equal(context.form.listingImages[0].uploadStatus, 'failed')
  assert.equal(context.form.listingImages[0].file, image.file)
})

test('final save waits for photo draft creation then updates that same listing', async () => {
  const { context, save, createdCount, calls } = saveContext()
  let finish
  context.photoDraftCreationRef.current = new Promise(resolve => { finish = resolve })
  const saving = save()
  await Promise.resolve()
  assert.equal(createdCount(), 0)
  context.pendingCreatedListingIdRef.current = 'listing-1'
  finish('listing-1'); await saving
  assert.equal(createdCount(), 0)
  assert.ok(calls.some(([action]) => action === 'update'))
  assert.ok(calls.some(([action]) => action === 'navigate'))
})

test('two photo selections share a private draft receipt without publishing or navigation', async () => {
  let finish, creates = 0
  const context = {
    isEditListingWorkspace: false, pendingCreatedListingIdRef: { current: '' }, photoDraftCreationRef: { current: null },
    photoUploadScopeRef: { current: 0 }, photoUploadFormRef: { current: { listingImages: [] } },
    form: { propertyAddress: '18 Test Avenue', sellerType: 'unknown' }, profile: { id: 'agent' },
    selectedWorkspaceOrganisationId: 'org', organisationId: 'org', currentBranchId: '', linkedDevelopmentId: '', linkedUnitId: '',
    normalizeText, normalizePropertyCategory: () => 'residential', normalizePropertyStructureType: () => 'freehold',
    isDeveloperWorkspace: false, assertMvpPilotCreationAllowed() {}, reserveListingCreationId: () => 'creation-1',
    saveCurrentCreateListingDraft() {}, createPrivateListing: async (payload, options) => {
      creates += 1
      assert.equal(payload.listingVisibility, 'internal')
      assert.equal(payload.isActive, false)
      assert.equal(options.creationId, 'creation-1')
      await new Promise(resolve => { finish = resolve })
      return { listing: { id: 'listing-1' } }
    },
  }
  const ensure = bind(context, between('async function ensurePhotoListingDraft(', 'async function startSelectedPhotoUploads('), 'ensurePhotoListingDraft')
  const first = ensure(), second = ensure()
  assert.equal(creates, 1)
  finish()
  assert.deepEqual(await Promise.all([first, second]), ['listing-1', 'listing-1'])
  assert.equal(context.pendingCreatedListingIdRef.current, 'listing-1')
  assert.equal(await ensure(), 'listing-1')
  assert.equal(creates, 1)
})

test('a website-row retry saves changes and queues only that failed website', async () => {
  const calls = []
  const context = {
    form: { listingStatus: 'active', selectedSyndicationChannels: ['property24', 'private_property', 'agency_website'] },
    editorRelistChannel: '', isListingSaving: false, isEditListingWorkspace: true, editListingId: 'listing-1',
    initialChannelResults: [{ key: 'property24', retryable: true }, { key: 'private_property', retryable: true }, { key: 'agency_website', status: 'submitted' }],
    getSalesListingRequiredIssues: () => [], getListingFieldIssues: () => [],
    setPublicationStatusBusy() {}, setError() {}, setWorkflowMessage() {},
    performUpdateExistingListing: async options => { calls.push(['save', options]); return true },
    retryFailedListingChannels: async options => { calls.push(['retry', options]); return [{ key: options.channels[0] }] },
  }
  const retry = bind(context, between('async function retryListingPublication(', 'async function handleSaveListing('), 'retryListingPublication')
  await retry(['private_property'])
  assert.equal(calls[0][0], 'save')
  assert.equal(calls[0][1].sendUpdates, false)
  assert.equal(calls[0][1].navigateAfterSave, false)
  assert.deepEqual(calls[1][1].channels, ['private_property'])
})


test('final sales publication activates resumed drafts without reopening closed or relisting records', () => {
  const resolve = bind({ normalizeKey }, between('function buildFinalSalesListingForm(', 'function resolveQuickListingVisibility('), 'buildFinalSalesListingForm')
  for (const listingStatus of ['draft', 'seller_lead', 'listing_review', 'mandate_signed']) {
    const form = { listingType: 'sale', listingStatus, selectedSyndicationChannels: ['private_property'] }
    assert.equal(resolve(form, { isEditListingWorkspace: true }).listingStatus, 'active')
    assert.equal(resolve(form, { isCreateListingWorkspace: true }).listingStatus, 'active')
    assert.equal(form.listingStatus, listingStatus, 'preparing a publish action must not alter the saved draft')
    for (const scope of [{ isEditListingWorkspace: true, editorRelistChannel: 'Property24' }, { isEditListingWorkspace: true, isDeveloperWorkspace: true }, {}]) assert.equal(resolve(form, scope), form)
    const rental = { ...form, listingType: 'rental' }
    assert.equal(resolve(rental, { isEditListingWorkspace: true }), rental)
  }
  for (const listingStatus of ['active', 'under_offer', 'sold', 'expired', 'withdrawn', 'archived', 'transaction_created']) {
    const form = { listingStatus }
    assert.equal(resolve(form, { isEditListingWorkspace: true }), form)
  }
})

test('the real final submit passes an active snapshot to both resumed and restored draft saves', async () => {
  for (const editing of [true, false]) {
    const calls = []
    const original = { listingStatus: 'seller_lead', listingType: 'sale', listingExpiryDate: '2099-12-31', selectedSyndicationChannels: ['private_property'] }
    const context = { form: original, isEditListingWorkspace: editing, isCreateListingWorkspace: !editing,
      listingFieldIssues: [], floorplanUploading: false, isListingSaving: false,
      createListingDraftHydratedKey: 'draft', createListingDraftScopeKey: 'draft', listingSaveInFlightRef: { current: false }, completedCreateListingRef: { current: false },
      setError() {}, setWorkflowMessage() {}, setIsListingSaving() {}, assertMvpPilotCreationAllowed() {}, console: quietConsole,
      performUpdateExistingListing: async options => calls.push(options), performSaveListing: async options => calls.push(options),
    }
    const submit = bind(context, between('async function handleSaveListing(', 'function requestListingDeletion('), 'handleSaveListing')
    await submit({ preventDefault() {} })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].listingForm.listingStatus, 'active')
    assert.equal(calls[0].listingForm.listingExpiryDate, '2099-12-31')
    assert.deepEqual(calls[0].listingForm.selectedSyndicationChannels, ['private_property'])
    if (editing) { assert.equal(calls[0].sendUpdates, true); assert.equal(calls[0].publishDraft, true) }
    assert.equal(original.listingStatus, 'seller_lead')
  }
})

test('a resumed draft with unmet channel requirements stays in setup and never silently saves instead of publishing', async () => {
  let saves = 0
  const steps = []
  const context = { form: { listingStatus: 'seller_lead' }, isEditListingWorkspace: true, isCreateListingWorkspace: false,
    listingFieldIssues: [{ step: 'syndication', field: 'listingExpiryDate' }], setValidationAttemptedStep() {}, setCreateListingStep: step => steps.push(step), setError() {},
    performUpdateExistingListing: async () => { saves++ },
  }
  const submit = bind(context, between('async function handleSaveListing(', 'function requestListingDeletion('), 'handleSaveListing')
  await submit({ preventDefault() {} })
  assert.deepEqual(steps, ['syndication']); assert.equal(saves, 0)
})

test('explicit Save draft updates the same saved listing without activating it or sending adverts', async () => {
  const calls = []
  const context = { isEditListingWorkspace: true, isListingSaving: false, listingSaveInFlightRef: { current: false },
    form: { listingStatus: 'seller_lead' }, setIsListingSaving() {}, setError() {},
    performUpdateExistingListing: async options => calls.push(options),
  }
  const saveDraft = bind(context, between('async function saveListingSetupDraft(', 'async function handleSaveListing('), 'saveListingSetupDraft')
  await saveDraft()
  assert.deepEqual(calls, [{ sendUpdates: false, navigateAfterSave: false, successMessage: 'Draft saved. No adverts were sent.' }])
  assert.equal(context.form.listingStatus, 'seller_lead')
})


test('resumed draft activation writes active market visibility and an active record, while draft saves preserve privacy', () => {
  const patchSource = between('    const listingPatch = {', '    const onboardingPatch = {')
  const context = { form: { listingStatus: 'active', visibility: 'agent', listingType: 'sale' }, publishDraft: true,
    listing: { listingStatus: 'seller_lead', listingVisibility: 'internal' }, listingTitle: 'Home', linkedDevelopmentId: '', propertyType: 'House', askingPrice: 2500000,
    propertyAddress: '18 Test Avenue', addressLine2: '', formattedAddress: '18 Test Avenue', streetAddress: '18 Test Avenue', country: 'South Africa', postalCode: '', latitude: null, longitude: null, googlePlaceId: '',
    effectiveListingDescription: 'Home for sale', nextNotes: '', mobileEditor: false, isDeveloperWorkspace: false, directListingPersistence: { seller: {} }, mandateStatus: 'not_started', sellerCanonicalFacts: {}, sellerCanonicalFactReadiness: {},
    normalizeText, normalizePropertyCategory: value => value || 'residential', normalizePropertyStructureType: value => value || 'full_title', stripQuickListingMetadataText: value => value || '',
    resolveQuickListingVisibility: bind({ normalizeKey }, between('function resolveQuickListingVisibility(', 'function extractBranchOptions('), 'resolveQuickListingVisibility'),
  }
  const patch = bind(context, patchSource, 'listingPatch')
  assert.equal(patch.listingStatus, 'active'); assert.equal(patch.listingVisibility, 'active_market'); assert.equal(patch.isActive, true)
  context.publishDraft = false; context.form.listingStatus = 'seller_lead'
  const draft = bind(context, patchSource, 'listingPatch')
  assert.equal(draft.listingStatus, 'seller_lead'); assert.equal(draft.listingVisibility, 'agent'); assert.equal(draft.isActive, undefined)
})


test('new sale final save persists active market state before requesting selected adverts', async () => {
  const { context, calls, save } = saveContext()
  context.resolvedListingStatus = 'active'
  context.resolveQuickListingVisibility = bind({ normalizeKey }, between('function resolveQuickListingVisibility(', 'function extractBranchOptions('), 'resolveQuickListingVisibility')
  await save()
  const created = calls.find(([kind]) => kind === 'create')[1]
  assert.equal(created.listingStatus, 'active'); assert.equal(created.isActive, true); assert.equal(created.listingVisibility, 'active_market')
  const publish = calls.find(([kind]) => kind === 'publish')[1]
  assert.equal(publish.listingStatus, 'active'); assert.deepEqual(publish.channels, ['private_property'])
  assert.ok(calls.findIndex(([kind]) => kind === 'verify') < calls.findIndex(([kind]) => kind === 'publish'))
})


test('creation persists the explicit publish snapshot even when the editor still holds a draft', async () => {
  const original = { listingStatus: 'seller_lead' }
  const prefix = between('  async function performSaveListing(', '    const sellerName =')
  const create = bind({ form: original }, `${prefix} return form; }`, 'performSaveListing')
  assert.equal(await create(), original)
  const published = { ...original, listingStatus: 'active' }
  assert.equal(await create({ listingForm: published }), published)
  assert.equal(original.listingStatus, 'seller_lead')
})
