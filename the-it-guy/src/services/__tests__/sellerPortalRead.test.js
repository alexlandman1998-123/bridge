import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSellerPortalRpc, settleOptionalSellerRead } from '../sellerPortalRead'

afterEach(() => vi.useRealTimers())
const reply = (result) => Object.assign(Promise.resolve(result), { abortSignal: vi.fn().mockReturnThis() })

describe('seller portal read recovery', () => {
  it('retries a transient read with the same authenticated arguments', async () => {
    vi.useFakeTimers()
    const args = { p_token: 'link', p_access_token: 'session', p_require_access: true }
    const client = { rpc: vi.fn().mockReturnValueOnce(reply({ error: { code: '57014' } }))
      .mockReturnValueOnce(reply({ data: { listing: { id: 'listing' } } })) }
    const pending = readSellerPortalRpc(client, 'secure_reader', args)
    await vi.runAllTimersAsync()
    expect(await pending).toEqual({ data: { listing: { id: 'listing' } } })
    expect(client.rpc.mock.calls).toEqual([['secure_reader', args], ['secure_reader', args]])
  })

  it.each(['42501', 'PGRST301', 'PGRST202'])('never retries denied access or a missing reader: %s', async code => {
    const error = { code, message: 'denied' }
    const client = { rpc: vi.fn().mockReturnValue(reply({ error })) }
    expect(await readSellerPortalRpc(client, 'secure_reader', {})).toEqual({ error })
    expect(client.rpc).toHaveBeenCalledTimes(1)
  })

  it('aborts hanging requests and stops after one retry', async () => {
    vi.useFakeTimers()
    const signals = []
    const query = { then: () => {}, abortSignal: signal => { signals.push(signal); return query } }
    const client = { rpc: vi.fn(() => query) }
    const pending = readSellerPortalRpc(client, 'secure_reader', {}, { timeoutMs: 50 })
    const rejection = expect(pending).rejects.toMatchObject({ code: '57014' })
    await vi.runAllTimersAsync()
    await rejection
    expect(client.rpc).toHaveBeenCalledTimes(2)
    expect(signals.every(signal => signal.aborted)).toBe(true)
  })

  it('optional branding cannot block portal entry', async () => {
    vi.useFakeTimers()
    const pending = settleOptionalSellerRead(new Promise(() => {}), 50)
    await vi.runAllTimersAsync()
    expect(await pending).toBeNull()
    expect(await settleOptionalSellerRead(Promise.reject(new Error('offline')))).toBeNull()
  })
})
