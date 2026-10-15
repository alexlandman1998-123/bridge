import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createClientPortalReadFetch, isTransientBuyerPortalReadError, recoverBuyerPortalLoad } from '../clientPortalReadRecovery.js'
import { readFileSync } from 'node:fs'

const url = 'https://portal.invalid/rest/v1/transactions?id=eq.test'
const json = (body = [], status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
afterEach(() => vi.useRealTimers())

describe('buyer read transport', () => {
  it('recovers a real SDK select after a network failure with the same portal and authorization headers', async () => {
    vi.useFakeTimers()
    const transport = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(json([{ id: 'test' }]))
    const client = createClient('https://portal.invalid', 'synthetic-public-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-bridge-client-portal-token': 'synthetic-link' }, fetch: createClientPortalReadFetch(transport) },
    })
    const pending = client.from('transactions').select('id')
    const result = Promise.resolve(pending)
    await vi.advanceTimersByTimeAsync(350)
    expect((await result).data).toEqual([{ id: 'test' }])
    expect(transport).toHaveBeenCalledTimes(2)
    for (const [request] of transport.mock.calls) {
      expect(request.headers.get('x-bridge-client-portal-token')).toBe('synthetic-link')
      expect(request.headers.get('authorization')).toBe('Bearer synthetic-public-key')
    }
  })

  it('aborts a hung read and recovers automatically instead of waiting for the portal deadline', async () => {
    vi.useFakeTimers()
    const transport = vi.fn().mockImplementationOnce(() => new Promise(() => {})).mockResolvedValueOnce(json())
    const pending = createClientPortalReadFetch(transport, { timeoutMs: 100, retryDelayMs: 20 })(url)
    await vi.advanceTimersByTimeAsync(125)
    expect((await pending).status).toBe(200)
    expect(transport.mock.calls[0][1].signal.aborted).toBe(true)
    expect(transport).toHaveBeenCalledTimes(2)
  })

  it.each([408, 502, 503, 504, 520, 521, 522, 523, 524])('preserves recovery after the SDK receives repeated HTTP %s failures', async status => {
    const transport = vi.fn(async () => new Response('Upstream unavailable', { status }))
    const client = createClient('https://portal.invalid', 'synthetic-public-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: createClientPortalReadFetch(transport, { retryDelayMs: 0 }) },
    })
    const result = await client.from('transactions').select('id')
    expect(result.data).toBeNull()
    expect(isTransientBuyerPortalReadError(result.error)).toBe(true)
    expect(transport).toHaveBeenCalledTimes(2)
  })

  it('keeps the deadline active when headers arrive but the response body stalls', async () => {
    vi.useFakeTimers()
    const stalled = { clone: () => ({ arrayBuffer: () => new Promise(() => {}) }) }
    const transport = vi.fn().mockResolvedValueOnce(stalled).mockResolvedValueOnce(json())
    const pending = createClientPortalReadFetch(transport, { timeoutMs: 100, retryDelayMs: 20 })(url)
    await vi.advanceTimersByTimeAsync(125)
    expect((await pending).status).toBe(200)
    expect(transport.mock.calls[0][1].signal.aborted).toBe(true)
  })

  it.each([401, 403, 404, 429])('does not retry rejected or invalid access (HTTP %s)', async status => {
    const transport = vi.fn().mockResolvedValue(json({ message: 'denied' }, status))
    expect((await createClientPortalReadFetch(transport)(url)).status).toBe(status)
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it('recovers an allowlisted document projection RPC and preserves its body', async () => {
    vi.useFakeTimers()
    const bodies = []
    const transport = vi.fn(async request => { bodies.push(await request.text()); return json({}, bodies.length === 1 ? 503 : 200) })
    const pending = createClientPortalReadFetch(transport)('https://portal.invalid/rest/v1/rpc/bridge_client_portal_canonical_document_projection', { method: 'POST', body: '{}' })
    await vi.advanceTimersByTimeAsync(350)
    expect((await pending).status).toBe(200)
    expect(bodies).toEqual(['{}', '{}'])
  })

  it.each([
    ['POST', '/rest/v1/transactions'],
    ['PATCH', '/rest/v1/transactions?id=eq.test'],
    ['DELETE', '/rest/v1/transactions?id=eq.test'],
    ['POST', '/rest/v1/rpc/submit_purchase'],
    ['POST', '/storage/v1/object/documents/test.pdf'],
    ['POST', '/storage/v1/object/sign/documents/test.pdf'],
  ])('never replays %s %s', async (method, path) => {
    const error = new TypeError('fetch failed')
    const transport = vi.fn().mockRejectedValue(error)
    await expect(createClientPortalReadFetch(transport)('https://portal.invalid' + path, { method })).rejects.toBe(error)
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it('stops after two failed attempts', async () => {
    vi.useFakeTimers()
    const transport = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    const pending = expect(createClientPortalReadFetch(transport)(url)).rejects.toThrow('fetch failed')
    await vi.runAllTimersAsync()
    await pending
    expect(transport).toHaveBeenCalledTimes(2)
  })

  it('passes a write Request through without consuming its body', async () => {
    const request = new Request('https://portal.invalid/rest/v1/transactions', { method: 'POST', body: '{"title":"Synthetic"}' })
    const transport = vi.fn(async original => {
      expect(original).toBe(request)
      expect(await original.text()).toBe('{"title":"Synthetic"}')
      return json()
    })
    expect((await createClientPortalReadFetch(transport)(request)).status).toBe(200)
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it('honors caller cancellation immediately without retrying', async () => {
    const controller = new AbortController()
    const transport = vi.fn(() => new Promise(() => {}))
    const pending = expect(createClientPortalReadFetch(transport)(url, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await pending
    expect(transport).toHaveBeenCalledTimes(1)
  })
})

it('does not restart a superseded portal load during recovery', async () => {
  vi.useFakeTimers()
  let current = true
  const load = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
  const pending = expect(recoverBuyerPortalLoad(load, { isCurrent: () => current })).rejects.toThrow('fetch failed')
  await vi.advanceTimersByTimeAsync(1)
  current = false
  await vi.runAllTimersAsync()
  await pending
  expect(load).toHaveBeenCalledTimes(1)
})

it('the shared client factory installs recovery only for buyer token clients', () => {
  const source = readFileSync(new URL('../supabaseClient.js', import.meta.url), 'utf8')
  const start = source.indexOf('export function createScopedSupabaseClient(')
  const end = source.indexOf('\nexport const __supabaseClientTestUtils', start)
  const factory = Function('scope', `with(scope) { return (${source.slice(start, end).replace(/^export /, '')}) }`)({
    isSupabaseConfigured: true, scopedClientCache: new Map(), supabaseUrl: 'https://portal.invalid', supabaseKey: 'public-key',
    createClientPortalReadFetch, createClient: (_url, _key, options) => options,
  })
  expect(factory({ 'x-bridge-client-portal-token': 'buyer-link' }).global.fetch).toBeTypeOf('function')
  expect(factory({ 'x-bridge-seller-portal-token': 'seller-link' }).global.fetch).toBeUndefined()
  expect(factory({ 'x-bridge-onboarding-token': 'onboarding-link' }).global.fetch).toBeUndefined()
})
