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

import { saveDevelopmentDetails } from '../detailActions.js'
import { updateDevelopmentSettings, syncDevelopmentParticipantsFromSettings } from '../configurationActions.js'
import { supabase } from '../../../lib/supabaseClient'

const developmentId = '22222222-2222-4222-8222-222222222222'
const receipt = args => ({ requestId: args.p_request_id, developmentId: args.p_development_id, developmentRevision: 1, profileRevision: 1 })
const input = { expectedDevelopmentRevision: 0, expectedProfileRevision: 0, name: 'Madison fixture', marketingContent: { listingOverview: { listingTitle: 'Saved headline' } }, snagTrackingEnabled: true, alterationsEnabled: false }
beforeEach(() => {
  state.calls = []; state.handlers = {}; state.rpcHandlers = {}
  state.handlers.developments = () => ({ data: { id: developmentId }, error: null })
  state.rpcHandlers.bridge_save_development_details = args => ({ data: receipt(args), error: null })
  state.rpcHandlers.bridge_save_development_settings = args => ({ data: {
    development_id: developmentId, participants_saved: args.default_participants.length,
    settings: { ...args.settings_patch, development_id: developmentId },
  }, error: null })
})

it('saves the complete development and profile in one revision-checked request', async () => {
  await expect(saveDevelopmentDetails(developmentId, input)).resolves.toBe(true)
  const request = state.calls.find(c => c.rpc === 'bridge_save_development_details')
  expect(request.parameters.p_details.name).toBe('Madison fixture')
  expect(request.parameters.p_profile.marketing_content.listingOverview.listingTitle).toBe('Saved headline')
  expect(request.parameters.p_expected_development_revision).toBe(0)
  expect(state.calls.some(c => c.operation && c.operation !== 'select')).toBe(false)
  expect(state.calls.some(c => c.rpc === 'bridge_save_development_settings')).toBe(false)
})

it.each([
  { code: '42501', message: 'Profile permission denied' },
  { code: '42P01', message: 'Missing profile table' },
  { code: '42703', message: 'Missing marketing_content column' },
])('never falls back to partial browser writes after a database rejection: $message', async error => {
  state.rpcHandlers.bridge_save_development_details = () => ({ data: null, error })
  await expect(saveDevelopmentDetails(developmentId, input)).rejects.toThrow()
  expect(state.calls.filter(c => c.rpc)).toHaveLength(1)
  expect(state.calls.some(c => c.table)).toBe(false)
})

it('requires the original editor revisions instead of loading a newer version before saving', async () => {
  await expect(saveDevelopmentDetails(developmentId, { ...input, expectedDevelopmentRevision: undefined })).rejects.toThrow('load its current version')
  expect(state.calls).toEqual([])
})

it('shows a clear conflict and never retries a stale edit as a fresh save', async () => {
  state.rpcHandlers.bridge_save_development_details = () => ({ data: null, error: { code: '40001', message: 'Stale editor' } })
  await expect(saveDevelopmentDetails(developmentId, input)).rejects.toMatchObject({ code: 'DEVELOPMENT_CONFLICT' })
  expect(state.calls.filter(c => c.rpc)).toHaveLength(1)
})

it('recovers a committed save after its response is lost using the same request ID', async () => {
  let first = true, commits = 0, committed
  state.rpcHandlers.bridge_save_development_details = args => {
    if (!committed) { committed = receipt(args); commits += 1 }
    if (first) { first = false; return { data: null, error: new TypeError('Network response lost') } }
    return { data: committed, error: null }
  }
  await expect(saveDevelopmentDetails(developmentId, input)).resolves.toBe(true)
  const requests = state.calls.filter(c => c.rpc)
  expect(requests).toHaveLength(2)
  expect(requests[0].parameters.p_request_id).toBe(requests[1].parameters.p_request_id)
  expect(commits).toBe(1)
})

it('keeps the original request available when a malformed receipt cannot confirm the save', async () => {
  state.rpcHandlers.bridge_save_development_details = args => ({ data: { ...receipt(args), developmentRevision: 0 }, error: null })
  await expect(saveDevelopmentDetails(developmentId, input)).rejects.toThrow('could not be confirmed')
  const first = state.calls.find(c => c.rpc).parameters.p_request_id
  state.rpcHandlers.bridge_save_development_details = args => ({ data: receipt(args), error: null })
  await saveDevelopmentDetails(developmentId, input)
  expect(state.calls.filter(c => c.rpc).at(-1).parameters.p_request_id).toBe(first)
})

it('returns a confirmed save receipt to creation callers', async () => {
  await expect(saveDevelopmentDetails(developmentId, input, { reportWarnings: true })).resolves.toEqual({ saved: true, warnings: [] })
})

it('saves settings and resolved default participants through one atomic request', async () => {
  state.handlers.profiles = () => ({ data: [{ id: state.userId, email: 'agent@example.test' }], error: null })
  const saved = await updateDevelopmentSettings(developmentId, { stakeholderTeams: { agents: [{ name: 'Agent', email: 'agent@example.test' }] } })
  expect(saved.stakeholderTeams.agents[0].name).toBe('Agent')
  const rpc = state.calls.find(c => c.rpc)
  expect(rpc.rpc).toBe('bridge_save_development_settings')
  expect(rpc.parameters.settings_patch.stakeholder_teams.agents).toHaveLength(1)
  expect(rpc.parameters.default_participants[0]).toMatchObject({ user_id: state.userId, role_type: 'agent', assignment_source: 'development_default' })
  expect(state.calls.some(c => c.operation && c.operation !== 'select')).toBe(false)
})

it.each([
  { code: '42501', message: 'Assignment insert denied' },
  { code: 'PGRST202', message: 'Atomic save function is unavailable' },
])('rejects failed team saves without falling back to browser deletes: $message', async error => {
  state.rpcHandlers.bridge_save_development_settings = () => ({ data: null, error })
  await expect(updateDevelopmentSettings(developmentId, {})).rejects.toMatchObject({ code: error.code })
  expect(state.calls.filter(c => c.rpc)).toHaveLength(1)
  expect(state.calls.some(c => c.table === 'development_participants' || c.table === 'development_settings')).toBe(false)
})

it('requires the participant count as well as the settings receipt', async () => {
  state.rpcHandlers.bridge_save_development_settings = () => ({ data: { development_id: developmentId, participants_saved: 0 }, error: null })
  await expect(syncDevelopmentParticipantsFromSettings(supabase, { developmentId, stakeholderTeams: { agents: [{ name: 'Agent' }] } })).rejects.toThrow('could not be confirmed')
})

it('requires the saved settings row even when a participant receipt is present', async () => {
  state.rpcHandlers.bridge_save_development_settings = () => ({ data: { development_id: developmentId, participants_saved: 0, settings: null }, error: null })
  await expect(updateDevelopmentSettings(developmentId, {})).rejects.toThrow('settings could not be confirmed')
})

it('shows an actionable error when the atomic database save has not been installed', async () => {
  state.rpcHandlers.bridge_save_development_settings = () => ({ data: null, error: { code: 'PGRST202', message: 'Function missing' } })
  await expect(updateDevelopmentSettings(developmentId, {})).rejects.toThrow('workspace needs a database update')
})
