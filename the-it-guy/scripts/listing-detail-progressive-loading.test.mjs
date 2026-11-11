import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Exercise the actual loader with delayed local reads. No hosted data is read.
const source = readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const start = source.indexOf('const loadListingData = useCallback(async (')
const end = source.indexOf('}, [listingId, needsListingDocuments])', start)
assert.ok(start >= 0 && end > start)
const expression = source.slice(start + 'const loadListingData = useCallback('.length, end + 1)
const tick = () => new Promise(resolve => setImmediate(resolve))
function fixture() {
  const context = {
    listingId: 'synthetic-listing', listingLoadSequence: { current: 0 }, loadedCoreListingIdRef: { current: '' },
    privateListingsRef: { current: [] }, needsListingDocuments: false, isSupabaseConfigured: true,
    rows: [], ready: false, busy: false, loading: false, error: '',
    console: { error() {} },
    readAgentPrivateListings: () => [], sanitizePrivateListingRows: rows => rows,
    upsertListingRecord: (rows, record) => [...rows.filter(row => row.id !== record.id), record],
    getPrivateListingRecordId: row => row?.id || '', getPrivateListingActivity: async () => [],
    getListingChannelExpiries: async () => [], setChannelExpiries() {}, setChannelExpiryAvailable() {},
    setListingSupportingDataLoading(value) { context.busy = value },
    setListingSupportingDataReady(value) { context.ready = value },
    setLoading(value) { context.loading = value },
    setDetailError(value) { context.error = value },
    setPrivateListings(rows) { context.rows = rows; context.privateListingsRef.current = rows },
    setListingChannelActivity() {}, setChannelActivityUnavailable() {},
  }
  const load = new Function('context', `with (context) { return ${expression}; }`)(context)
  return { context, load }
}

test('the listing overview requests the same saved documents as the Documents tab', async () => {
  const expression = source.match(/const needsListingDocuments = ([^\n]+)/)[1]
  const needsDocuments = new Function('activeTab','sellerWorkspaceTab','sellerDocumentSendOpen','sellerDocumentUploadModalOpen',`return ${expression}`)
  assert.equal(needsDocuments('seller','overview',false,false),true)
  assert.equal(needsDocuments('seller','documents',false,false),true)
  assert.equal(needsDocuments('seller','marketing',false,false),false)
  const {context,load} = fixture()
  context.needsListingDocuments = needsDocuments('seller','overview',false,false)
  let relatedOptions
  context.getPrivateListing = async (_id, options) => {
    if (options.includeRelatedData === false) return {id:context.listingId}
    relatedOptions = options
    return {id:context.listingId,documents:[{id:'saved-file'}],canonicalDocumentSnapshot:{requirements:[{id:'saved-requirement'}]}}
  }
  await load()
  assert.equal(relatedOptions.includeRequirementsAndDocuments,true)
  assert.equal(context.rows[0].documents[0].id,'saved-file')
  assert.equal(context.rows[0].canonicalDocumentSnapshot.requirements[0].id,'saved-requirement')
})

test('the core listing renders before a slow related-data read, with editing still gated', async () => {
  const { context, load } = fixture()
  let finish
  const optionsSeen = []
  context.getPrivateListing = async (_id, options) => {
    optionsSeen.push(options)
    return options.includeRelatedData === false ? { id: context.listingId, title: 'Core listing' } : new Promise(resolve => { finish = resolve })
  }
  const pending = load()
  await tick()
  assert.equal(context.rows[0].title, 'Core listing')
  assert.equal(context.loading, false)
  assert.equal(context.ready, false)
  assert.equal(context.busy, true)
  finish({ id: context.listingId, title: 'Hydrated listing' })
  await pending
  assert.equal(context.ready, true)
  assert.equal(context.busy, false)
  assert.equal(context.rows[0].title, 'Hydrated listing')
  assert.equal(optionsSeen[1].includeRequirementsAndDocuments, false)
})

test('failed supporting reads keep the visible listing and do not enable incomplete editing', async () => {
  const { context, load } = fixture()
  context.getPrivateListing = async (_id, options) => {
    if (options.includeRelatedData === false) return { id: context.listingId, title: 'Core listing' }
    throw new Error('Related data unavailable')
  }
  await load()
  assert.equal(context.rows[0].title, 'Core listing')
  assert.equal(context.ready, false)
  assert.equal(context.busy, false)
  assert.equal(context.error, 'Related data unavailable')
  // A later failed refresh must retain the visible record too.
  await load({ showLoading: false })
  assert.equal(context.rows[0].title, 'Core listing')
})

test('a stale related-data response cannot replace the latest tab read', async () => {
  const { context, load } = fixture()
  let finishOld
  let relatedReads = 0
  context.getPrivateListing = async (_id, options) => {
    if (options.includeRelatedData === false) return { id: context.listingId, title: 'Core listing' }
    relatedReads += 1
    return relatedReads === 1 ? new Promise(resolve => { finishOld = resolve }) : { id: context.listingId, title: 'Latest listing' }
  }
  const oldRead = load()
  await tick()
  context.needsListingDocuments = true
  await load({ showLoading: false })
  finishOld({ id: context.listingId, title: 'Old listing' })
  await oldRead
  assert.equal(context.rows[0].title, 'Latest listing')
  assert.equal(context.ready, true)
})
