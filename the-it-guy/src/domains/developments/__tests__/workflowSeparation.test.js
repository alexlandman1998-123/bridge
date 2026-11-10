// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ calls: [], handlers: {}, rpcHandlers: {}, uploads: [], removals: [], userId: '11111111-1111-4111-8111-111111111111' }))
vi.mock('../../../lib/supabaseClient', () => ({
  DOCUMENTS_BUCKET_CANDIDATES: ['documents'],
  invokeEdgeFunction: vi.fn(async () => ({ data: { sent: true }, error: null })),
  supabase: {
    supabaseUrl: 'https://project.supabase.co',
    auth: {
      getUser: async () => ({ data: { user: state.userId ? { id: state.userId } : null }, error: null }),
      getSession: async () => ({ data: { session: state.userId ? { user: { id: state.userId } } : null }, error: null }),
    },
    rpc(name, parameters) {
      state.calls.push({ rpc: name, parameters })
      return Promise.resolve(state.rpcHandlers[name]?.(parameters) || { data: {}, error: null })
    },
    storage: { from(bucket) { return {
      upload: async (path) => { state.uploads.push({ bucket, path }); return { data: { path }, error: null } },
      remove: async (paths) => { state.removals.push({ bucket, paths }); return { error: null } },
      getPublicUrl: (path) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
    } } },
    from(table) {
      const call = { table, filters: [], operation: 'select', payload: null }
      state.calls.push(call)
      const query = {}
      for (const method of ['select', 'eq', 'in', 'ilike', 'neq', 'order', 'limit', 'single', 'maybeSingle', 'is', 'not', 'or']) {
        query[method] = (...args) => { call.filters.push([method, ...args]); return query }
      }
      for (const operation of ['insert', 'update', 'upsert', 'delete']) query[operation] = (payload) => { call.operation = operation; call.payload = payload; return query }
      query.then = (resolve, reject) => {
        const result = state.handlers[table]?.(call)
        const single = call.filters.some(([method]) => ['single', 'maybeSingle'].includes(method))
        const data = call.payload ? { ...call.payload, id: call.payload.id || 'saved' } : single ? null : []
        return Promise.resolve(result || { data, error: null }).then((response) => ({
          ...response, data: single && Array.isArray(response.data) ? response.data[0] || null
            : !single && response.data && !Array.isArray(response.data) ? [response.data] : response.data,
        })).then(resolve, reject)
      }
      return query
    },
  },
}))
vi.mock('../../../lib/documentAccess.js', () => ({ createFreshDocumentSignedUrl: vi.fn(async () => 'https://private.test/signed') }))
vi.mock('../../../lib/developmentMediaStorage.js', async importOriginal => ({ ...(await importOriginal()), persistDevelopmentMedia: (_client, value) => value, refreshDevelopmentMedia: async (_client, value) => value }))
vi.mock('../../../lib/api.js', () => { throw new Error('Selected actions must not load the legacy API') })

import { invokeEdgeFunction, supabase } from '../../../lib/supabaseClient'
import * as adapter from '../../../lib/developmentDetailApi.js'
import { getOrCreateTransactionOnboarding as onboardThroughAdapter } from '../../../lib/transactionWorkspaceApi.js'
import { createDevelopment } from '../detailActions.js'
import { createDevelopmentMarketingAccess, createDevelopmentMarketingEvent } from '../marketingActions.js'
import { createDeveloperPartnerInvite } from '../../partners/invitationActions.js'
import { getOrCreateTransactionOnboardingRecord, recordBuyerOnboardingSent } from '../../onboarding/workflow.js'
import { logTransactionEventIfPossible } from '../../transactions/eventActions.js'

const developmentId = '22222222-2222-4222-8222-222222222222'
const transactionId = '33333333-3333-4333-8333-333333333333'
beforeEach(() => {
  state.calls = []; state.handlers = {}; state.rpcHandlers = {}; state.uploads = []; state.removals = []
  state.userId = '11111111-1111-4111-8111-111111111111'
  vi.clearAllMocks()
})

it('rejects invalid creation input before writing', async () => {
  await expect(adapter.createDevelopment({ name: '' })).rejects.toThrow('name is required')
  await expect(createDevelopment({ name: 'Development', plannedUnits: -1 })).rejects.toThrow('0 or greater')
  expect(state.calls).toEqual([])
})

it('keeps the client-created development ID through optional-column retries', async () => {
  let first = true, createdRow
  state.handlers.developments = (call) => {
    if (call.operation === 'insert' && first) { first = false; return { data: null, error: { code: '42703', message: 'column code does not exist' } } }
    if (call.operation === 'insert') createdRow = { ...call.payload }
    return { data: createdRow, error: null }
  }
  const created = await createDevelopment({ name: 'Development', plannedUnits: 4, profile: { organisationId: developmentId, code: 'D' } })
  const writes = state.calls.filter((call) => call.table === 'developments' && call.operation === 'insert')
  expect(writes).toHaveLength(2)
  expect(writes[0].payload.id).toBe(writes[1].payload.id)
  expect(writes[1].payload).not.toHaveProperty('code')
  expect(writes[1].payload.organisation_id).toBe(developmentId)
  expect(created.id).toBe(writes[0].payload.id)
})

it('keeps denied creation errors from becoming schema retries', async () => {
  const error = { code: '42501', message: 'Permission denied' }
  state.handlers.developments = () => ({ data: null, error })
  await expect(createDevelopment({ name: 'Development' })).rejects.toEqual(error)
  expect(state.calls).toHaveLength(1)
})

it('routes stock and document actions through their feature modules', async () => {
  await adapter.saveDevelopmentUnit({ developmentId, unitNumber: '1' })
  await adapter.saveDevelopmentDocument({ developmentId, title: 'Document', storagePath: 'private/proof.pdf', visibility: 'internal' })
  expect(state.calls.find((call) => call.table === 'units').payload.development_id).toBe(developmentId)
  expect(state.calls.find((call) => call.table === 'development_documents').payload).toMatchObject({ development_id: developmentId, storage_path: 'private/proof.pdf', visibility: 'internal' })
})

it('recovers a committed asset after a lost save reply without uploading or deleting it twice', async () => {
  let committed
  state.handlers.development_documents = (call) => {
    if (call.operation === 'upsert') { committed = { ...call.payload, id: call.payload.id || 'asset' }; return { data: null, error: new TypeError('Save reply lost') } }
    return { data: committed, error: null }
  }
  const file = new File(['%PDF-1.4 diagnostic'], `${crypto.randomUUID()}.pdf`, { type: 'application/pdf' })
  const options = { developmentId, file, title: 'Asset' }
  const saved = await adapter.uploadDevelopmentDocumentAsset(options)
  expect(saved.id).toBe('asset')
  await adapter.uploadDevelopmentDocumentAsset(options)
  expect(state.uploads).toHaveLength(1)
  expect(state.removals).toHaveLength(0)
  expect(state.calls.filter((call) => call.table === 'development_documents' && call.operation === 'upsert')).toHaveLength(1)
})

it('cleans up an uncommitted asset after a definite permission rejection', async () => {
  state.handlers.development_documents = (call) => call.operation === 'upsert'
    ? { data: null, error: { code: '42501', status: 403, message: 'Permission denied' } }
    : { data: null, error: null }
  const file = new File(['%PDF-1.4 diagnostic'], `${crypto.randomUUID()}.pdf`, { type: 'application/pdf' })
  await expect(adapter.uploadDevelopmentDocumentAsset({ developmentId, file })).rejects.toMatchObject({ code: '42501' })
  expect(state.uploads).toHaveLength(1)
  expect(state.removals).toHaveLength(1)
})

it('validates marketing recipients and requires a signed-in actor', async () => {
  await expect(createDevelopmentMarketingAccess({ developmentId, userId: 'user', inviteeEmail: 'recipient@example.test' })).rejects.toThrow('exactly one')
  expect(state.calls).toEqual([])
  state.userId = null
  await expect(createDevelopmentMarketingAccess({ developmentId, inviteeEmail: 'recipient@example.test' })).rejects.toThrow('Sign in')
  expect(state.calls).toEqual([])
})

it('returns a saved invitation when email delivery fails instead of duplicating its insert', async () => {
  state.rpcHandlers.bridge_prepare_development_marketing_invite = () => ({ data: { token: 'token', inviteeEmail: 'recipient@example.test' }, error: null })
  invokeEdgeFunction.mockResolvedValueOnce({ data: null, error: new Error('Provider unavailable') })
  const result = await adapter.createDevelopmentMarketingAccess({ developmentId, inviteeEmail: 'recipient@example.test' })
  expect(result).toMatchObject({ id: 'saved', invitationDelivery: { ok: false, error: 'Provider unavailable' } })
  expect(state.calls.filter((call) => call.table === 'development_marketing_access' && call.operation === 'insert')).toHaveLength(1)
})

it('keeps a saved marketing event when its optional audit write fails', async () => {
  state.rpcHandlers.bridge_create_development_marketing_event = args => ({ data: {
    requestId: args.p_request_id, developmentId, activitySaved: false,
    event: { ...args.p_event, id: 'saved', subject_type: 'development', subject_id: developmentId },
  }, error: null })
  const event = await createDevelopmentMarketingEvent({ developmentId, organisationId: developmentId, title: 'Show day', startsAt: '2027-01-01T10:00:00Z' })
  expect(event).toMatchObject({ id: 'saved', activityWarning: true })
  expect(state.calls.filter(call => call.rpc === 'bridge_create_development_marketing_event')).toHaveLength(1)
  expect(state.calls.some(call => call.table === 'marketing_events')).toBe(false)
})

it('keeps duplicate partner invites from creating another relationship', async () => {
  state.handlers.developer_partner_relationships = () => ({ data: { id: 'existing' }, error: null })
  await expect(createDeveloperPartnerInvite({ developerOrganisationId: developmentId, partnerInvitationEmail: 'partner@example.test' })).rejects.toThrow('already')
  expect(state.calls.some((call) => call.operation === 'insert')).toBe(false)
  expect(invokeEdgeFunction).not.toHaveBeenCalled()
})

it('reuses an existing onboarding record and skips document preparation when requested', async () => {
  state.handlers.transaction_onboarding = () => ({ data: [{ id: 'onboarding', transaction_id: transactionId, purchaser_type: 'individual', token: 'saved-token' }], error: null })
  const result = await onboardThroughAdapter({ transactionId, prepareDocuments: false })
  expect(result.token).toBe('saved-token')
  expect(state.calls.filter((call) => call.table === 'transaction_onboarding' && call.operation === 'insert')).toHaveLength(0)
  expect(state.calls.some((call) => call.table === 'transaction_required_documents')).toBe(false)
})

it('re-reads the winning onboarding record after a uniqueness conflict', async () => {
  let reads = 0
  state.handlers.transaction_onboarding = (call) => call.operation === 'insert'
    ? { data: null, error: { code: '23505' } }
    : { data: ++reads === 1 ? [] : [{ id: '44444444-4444-4444-8444-444444444444', transaction_id: transactionId, token: 'winner-token', purchaser_type: 'individual' }], error: null }
  expect(await getOrCreateTransactionOnboardingRecord(supabase, { transactionId })).toMatchObject({ id: '44444444-4444-4444-8444-444444444444', token: 'winner-token' })
  expect(state.calls.filter((call) => call.operation === 'insert')).toHaveLength(1)
})

it('scopes onboarding delivery status to the selected buyer participant', async () => {
  await recordBuyerOnboardingSent({ transactionId, recipientEmail: 'buyer@example.test', buyerTarget: { participantId: 'participant' } })
  const update = state.calls.find((call) => call.table === 'transaction_participants')
  expect(update.filters).toContainEqual(['eq', 'transaction_id', transactionId])
  expect(update.filters).toContainEqual(['eq', 'id', 'participant'])
  expect(update.payload.buyer_onboarding_status).toBe('sent')
})

it('does not attribute a delayed audit write to a replacement session', async () => {
  state.userId = developmentId
  expect(await logTransactionEventIfPossible(supabase, { transactionId, createdBy: '11111111-1111-4111-8111-111111111111' })).toBeNull()
  expect(state.calls).toEqual([])
})

it('uses a new version with the NEW durable path for replacement links, instead of retaining the old path', async () => {
  await adapter.saveDevelopmentDocument({developmentId,documentId:'old-document',title:'Replacement',fileUrl:`https://project.supabase.co/storage/v1/object/sign/documents/developments/${developmentId}/legal/new.pdf?token=fresh`})
  const call=state.calls.find(call=>call.table==='development_documents')
  expect(call.operation).toBe('upsert')
  expect(call.payload.id).toBeUndefined()
  expect(call.payload).toMatchObject({supersedes_document_id:'old-document',storage_bucket:'documents',storage_path:`developments/${developmentId}/legal/new.pdf`})
})

it('external replacement links clear the previous durable path and do not inherit old file metadata', async () => {
  await adapter.saveDevelopmentDocument({developmentId,documentId:'old-document',title:'Replacement',fileUrl:'https://external.test/new.pdf'})
  expect(state.calls.find(call=>call.table==='development_documents').payload).toMatchObject({storage_bucket:null,storage_path:null,mime_type:null,file_size_bytes:null,supersedes_document_id:'old-document'})
})

it('metadata edits preserve existing file locations and are scoped to the selected development', async () => {
  await adapter.saveDevelopmentDocument({developmentId,documentId:'current-document',title:'Renamed'})
  const call=state.calls.find(call=>call.table==='development_documents')
  expect(call.operation).toBe('update')
  expect(call.filters).toContainEqual(['eq','development_id',developmentId])
  expect(call.payload).not.toHaveProperty('storage_path')
  expect(call.payload).not.toHaveProperty('file_url')
})

it('archives a confirmed removal and never claims success for an empty or denied mutation', async () => {
  state.handlers.development_documents=call=>call.operation==='update'?{data:{id:'current-document'},error:null}:null
  await expect(adapter.deleteDevelopmentDocument('current-document')).resolves.toMatchObject({removed:true,fileErased:false})
  const call=state.calls.find(call=>call.table==='development_documents')
  expect(call.operation).toBe('update')
  expect(call.payload.archived_at).toMatch(/^\d{4}-/)
  expect(state.removals).toHaveLength(0)
  state.handlers.development_documents=()=>({data:null,error:null})
  await expect(adapter.deleteDevelopmentDocument('missing')).rejects.toThrow(/Removal could not be confirmed/)
  state.handlers.development_documents=()=>({data:null,error:{code:'42501',message:'Permission denied'}})
  await expect(adapter.deleteDevelopmentDocument('denied')).rejects.toMatchObject({code:'42501'})
})
