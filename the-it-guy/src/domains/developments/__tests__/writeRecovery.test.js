// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../../lib/supabaseClient', () => ({ supabase: null }))
import { invokeDevelopmentWrite } from '../reliableWrites.js'
const dev = '20000000-0000-4000-8000-000000000001'
let storage, actor
beforeEach(() => {
  actor = 'actor-one'
  storage = new Map()
  vi.stubGlobal('localStorage', { getItem: key => storage.get(key), setItem: (key,value) => storage.set(key,value), removeItem: key => storage.delete(key) })
})
afterEach(() => { vi.unstubAllGlobals() })
function client(rpc) { return { auth: { getSession: async () => ({ data: { session: actor ? { user: { id: actor } } : null }, error: null }) }, rpc } }
const result = args => ({ data: { requestId: args.p_request_id, developmentId: dev }, error: null })

it('recovers the same pending request after the browser runtime restarts', async () => {
  const rpc = vi.fn(async () => ({ data: null, error: new TypeError('Network response lost') }))
  const c = client(rpc)
  await expect(invokeDevelopmentWrite(c, 'fixture', dev, { change: 1 })).rejects.toThrow('response lost')
  const requestId = rpc.mock.calls[0][1].p_request_id
  expect(rpc).toHaveBeenCalledTimes(2)
  expect(storage.size).toBe(1)
  expect([...storage.values()]).toEqual([requestId])
  vi.resetModules()
  const restarted = await import('../reliableWrites.js')
  rpc.mockImplementation(async (_name,args) => result(args))
  await restarted.invokeDevelopmentWrite(c, 'fixture', dev, { change: 1 })
  expect(rpc.mock.calls.at(-1)[1].p_request_id).toBe(requestId)
  expect(storage.size).toBe(0)
})
it('does not replay a previous actor’s pending request after an account switch', async () => {
  const rpc = vi.fn(async () => ({ data: null, error: new TypeError('Network response lost') }))
  const c = client(rpc)
  await expect(invokeDevelopmentWrite(c, 'fixture', dev, { change: 2 })).rejects.toThrow()
  const first = rpc.mock.calls[0][1].p_request_id
  actor = 'actor-two'
  rpc.mockImplementation(async (_name,args) => result(args))
  await invokeDevelopmentWrite(c, 'fixture', dev, { change: 2 })
  expect(rpc.mock.calls.at(-1)[1].p_request_id).not.toBe(first)
})
it('works within the current tab when browser storage is unavailable', async () => {
  vi.stubGlobal('localStorage', { getItem() { throw Error('Storage blocked') }, setItem() { throw Error('Storage blocked') }, removeItem() { throw Error('Storage blocked') } })
  const rpc = vi.fn(async () => ({ data: null, error: new TypeError('Network response lost') })), c=client(rpc)
  await expect(invokeDevelopmentWrite(c,'fixture',dev,{change:3})).rejects.toThrow()
  const id=rpc.mock.calls[0][1].p_request_id
  rpc.mockImplementation(async(_name,args)=>result(args))
  await invokeDevelopmentWrite(c,'fixture',dev,{change:3})
  expect(rpc.mock.calls.at(-1)[1].p_request_id).toBe(id)
})
it('requires sign-in before submitting or recovering a write',async()=>{
  actor=null
  const rpc=vi.fn()
  await expect(invokeDevelopmentWrite(client(rpc),'fixture',dev,{change:4})).rejects.toThrow('Sign in')
  expect(rpc).not.toHaveBeenCalled()
})
it('does not confirm a receipt from another development',async()=>{
  const rpc=vi.fn(async(_name,args)=>({data:{...result(args).data,developmentId:'another-development'},error:null}))
  await expect(invokeDevelopmentWrite(client(rpc),'fixture',dev,{change:5})).rejects.toThrow('could not be confirmed')
  expect(storage.size).toBe(1)
})
