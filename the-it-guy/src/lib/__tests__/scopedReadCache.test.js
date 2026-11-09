// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { createScopedReadCache, watchScopedReadInvalidation } from '../scopedReadCache.js'
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes }); return { promise, resolve } }

it('joins pending reads, reuses references until expiry, and separates clients and viewers', async () => {
  let time = 0
  const client = {}
  const cache = createScopedReadCache({ scopeKey: 'actor:org', now: () => time })
  const pending = deferred()
  const load = vi.fn(() => pending.promise)
  const options = { client, group: 'reference', key: 'dev', load, maxAgeMs: 10 }
  const first = cache.read(options), second = cache.read(options)
  expect(first).toBe(second)
  await Promise.resolve()
  expect(load).toHaveBeenCalledTimes(1)
  pending.resolve(['original']); await first
  expect(await cache.read(options)).toEqual(['original'])
  expect(load).toHaveBeenCalledTimes(1)
  time = 11
  await cache.read(options)
  await cache.read({ ...options, client: {} })
  await createScopedReadCache({ scopeKey: 'another-actor:org' }).read(options)
  expect(load).toHaveBeenCalledTimes(4)
})

it('never caches failed reads or mutable completed records', async () => {
  const cache = createScopedReadCache(), client = {}
  const load = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue('fresh')
  const options = { client, group: 'lead', key: 'lead', load, maxAgeMs: 0 }
  await expect(cache.read(options)).rejects.toThrow('Offline')
  await cache.read(options); await cache.read(options)
  expect(load).toHaveBeenCalledTimes(3)
})

it('cannot repopulate an invalidated reference with a late result', async () => {
  const cache = createScopedReadCache(), client = {}, pending = deferred()
  const load = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue('new')
  const options = { client, group: 'requirements', key: 'dev', load }
  const old = cache.read(options)
  await Promise.resolve()
  cache.invalidate()
  expect(await cache.read(options)).toBe('new')
  pending.resolve('old'); await old
  expect(await cache.read(options)).toBe('new')
  expect(load).toHaveBeenCalledTimes(2)
})

it('invalidates on business/workspace events and cross-tab requirement changes, then detaches', async () => {
  const cache = createScopedReadCache(), client = {}, windowApi = new EventTarget(), onInvalidate = vi.fn()
  const load = vi.fn(async () => 'data'), options = { client, group: 'reference', key: 'dev', load }
  const stop = watchScopedReadInvalidation(cache, { windowApi, onInvalidate })
  await cache.read(options)
  windowApi.dispatchEvent(new Event('bridge:workspace-scoped-cache-cleared'))
  await cache.read(options)
  const storage = new Event('storage'); storage.key = 'arch9:document-requirements-changed'
  windowApi.dispatchEvent(storage)
  await cache.read(options)
  expect(load).toHaveBeenCalledTimes(3)
  stop(); windowApi.dispatchEvent(new Event('itg:developments-changed'))
  await cache.read(options)
  expect(load).toHaveBeenCalledTimes(3)
  expect(onInvalidate).toHaveBeenCalledTimes(2)
})

it('rejects invalidated mutable reads so an older lead response cannot overwrite a fresh refresh', async () => {
  const cache = createScopedReadCache(), client = {}, pending = deferred()
  const load = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue('new lead')
  const options = { client, group: 'lead', key: 'lead', load, maxAgeMs: 0 }
  const old = cache.read(options)
  await Promise.resolve(); cache.invalidate()
  expect(await cache.read(options)).toBe('new lead')
  pending.resolve('old lead')
  await expect(old).rejects.toMatchObject({ name: 'AbortError' })
})
