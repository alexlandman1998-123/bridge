// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ events: [], calls: [], readError: null, writeError: null, actor: 'actor', lostReplies: 0, activitySaved: true, receipts: new Map() }))
vi.mock('../../lib/supabaseClient', () => ({ invokeEdgeFunction: vi.fn(), supabase: {
  auth: { getSession: async () => ({ data: { session: state.actor ? { user: { id: state.actor } } : null }, error: null }) },
  async rpc(name, args) {
    state.calls.push({ name, args })
    if (state.writeError) return { data: null, error: state.writeError }
    if (!state.receipts.has(args.p_request_id)) {
      const row = { ...args.p_event, id: crypto.randomUUID(), subject_type: 'development', subject_id: args.p_development_id, created_by: state.actor }
      state.events.push(row)
      state.receipts.set(args.p_request_id, { requestId: args.p_request_id, developmentId: args.p_development_id, event: row, activitySaved: state.activitySaved })
    }
    if (state.lostReplies-- > 0) return { data: null, error: new TypeError('Network response lost after commit') }
    return { data: state.receipts.get(args.p_request_id), error: null }
  },
  from(table) {
    const filters = [], query = { select: () => query, order: () => query,
      eq: (key,value) => { filters.push([key,value]); return query },
      then(resolve,reject) { return Promise.resolve({ data: state.events.filter(row => filters.every(([key,value]) => row[key] === value)), error: state.readError }).then(resolve,reject) },
    }
    state.calls.push({ table, filters })
    return query
  },
} }))
import { createDevelopmentMarketingEvent } from '../../domains/developments/marketingActions.js'
import { fetchDevelopmentMarketingEvents } from '../../domains/developments/readApi.js'
const input = { developmentId: 'dev', organisationId: 'org', title: 'Sunday viewing', eventType: 'show_day', startsAt: '2026-11-15T10:00:00Z' }
beforeEach(() => {
  state.events = []; state.calls = []; state.readError = null; state.writeError = null; state.actor = 'actor'
  state.receipts = new Map(); state.lostReplies = 0; state.activitySaved = true
})
it.each(['show_day','launch'])('creates and reloads a scoped %s event through the reliable endpoint',async eventType => {
  const saved = await createDevelopmentMarketingEvent({ ...input, eventType })
  expect(saved).toMatchObject({ title: input.title, eventType, createdBy: 'actor', activityWarning: false })
  expect(state.calls[0]).toMatchObject({ name: 'bridge_create_development_marketing_event', args: { p_development_id: 'dev', p_event: { organisation_id: 'org' } } })
  expect(await fetchDevelopmentMarketingEvents('dev','org')).toEqual([expect.objectContaining({ id: saved.id, eventType })])
  expect(state.calls.at(-1).filters).toEqual([['organisation_id','org'],['subject_type','development'],['subject_id','dev']])
})
it('recovers a lost event response without inserting a duplicate',async()=>{
  state.lostReplies=1
  const saved=await createDevelopmentMarketingEvent(input)
  expect(saved.id).toBe(state.events[0].id)
  expect(state.events).toHaveLength(1)
  expect(state.calls.filter(call=>call.name)).toHaveLength(2)
  expect(state.calls[0].args.p_request_id).toBe(state.calls[1].args.p_request_id)
})
it('preserves the form request ID and surfaces optional history failure as a saved warning',async()=>{
  state.activitySaved=false
  const requestId=crypto.randomUUID()
  expect(await createDevelopmentMarketingEvent({...input,requestId})).toMatchObject({activityWarning:true})
  expect(state.calls[0].args.p_request_id).toBe(requestId)
})
it.each([{code:'42501',message:'Access denied'},{code:'42P01',message:'Event table missing'}])('surfaces a failed event read instead of an empty calendar: $message',async error=>{
  state.readError=error
  await expect(fetchDevelopmentMarketingEvents('dev','org')).rejects.toMatchObject({ code: error.code })
})
it('requires a complete read scope, sign-in and valid event input',async()=>{
  await expect(fetchDevelopmentMarketingEvents('dev','')).rejects.toThrow('could not be identified')
  await expect(createDevelopmentMarketingEvent({...input,startsAt:'bad'})).rejects.toThrow('date and time')
  await expect(createDevelopmentMarketingEvent({...input,eventType:'unsupported'})).rejects.toThrow('event type')
  state.actor=null
  await expect(createDevelopmentMarketingEvent(input)).rejects.toThrow('Sign in')
  expect(state.events).toHaveLength(0)
})
it('propagates a rejected creation without reporting a saved event',async()=>{
  state.writeError={code:'42501',message:'Creation denied'}
  await expect(createDevelopmentMarketingEvent(input)).rejects.toMatchObject({code:'42501'})
  expect(state.events).toHaveLength(0)
})
