import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMediaUploadQueue, retryStorageOperation, settleListingImageUploads } from '../listingMediaUploads.js'

test('retries temporary returned and thrown errors with bounded backoff', async () => {
  const delays = []
  let calls = 0
  const result = await retryStorageOperation(async () => {
    calls += 1
    if (calls === 1) return { error: { statusCode: '544', message: 'The connection to the database timed out' } }
    if (calls === 2) throw new TypeError('Failed to fetch')
    return { data: 'saved' }
  }, { sleep: async (ms) => delays.push(ms), random: () => 0 })
  assert.equal(result.data, 'saved')
  assert.equal(calls, 3)
  assert.deepEqual(delays, [750, 1500])
})

test('exhausted timeouts stop; permissions and invalid files never retry', async () => {
  for (const [error, expectedCalls] of [
    [{ statusCode: 544 }, 3], [{ statusCode: 403 }, 1], [{ statusCode: 400 }, 1],
    [{ statusCode: 413 }, 1], [{ statusCode: 404 }, 1],
  ]) {
    let calls = 0
    await assert.rejects(retryStorageOperation(async () => {
      calls += 1
      return { error }
    }, { sleep: async () => {}, random: () => 0 }), (caught) => caught === error)
    assert.equal(calls, expectedCalls)
  }
})

test('shared queue limits active requests and releases slots after failure', async () => {
  const queue = createMediaUploadQueue(2)
  let active = 0
  let peak = 0
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => queue(async () => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise((resolve) => setImmediate(resolve))
    active -= 1
    if (index === 0) throw new Error('failed')
    return index
  })))
  assert.equal(peak, 2)
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 7)
  assert.equal(await queue(async () => 'next'), 'next')
})

test('partial batch waits for successful uploads and retains them for retry in order', async () => {
  let images = [{ id: 'a', file: true }, { id: 'b', file: true }, { id: 'c', file: true }]
  const calls = []
  const retain = (uploaded, original) => {
    images = images.map((image) => image.id === original.id ? uploaded : image)
  }
  const upload = async (image) => {
    if (!image.file) return image
    calls.push(image.id)
    if (image.id === 'b' && calls.filter((id) => id === 'b').length === 1) throw new Error('timeout')
    await new Promise((resolve) => setImmediate(resolve))
    return { id: image.id, path: `stored/${image.id}` }
  }
  await assert.rejects(settleListingImageUploads(images, upload, retain), (error) => {
    assert.deepEqual(error.uploadedImages.map((image) => image.id), ['a', 'c'])
    return true
  })
  const completed = await settleListingImageUploads(images, upload, retain)
  assert.deepEqual(completed.map((image) => image.id), ['a', 'b', 'c'])
  assert.deepEqual(calls, ['a', 'b', 'c', 'b'])
})
