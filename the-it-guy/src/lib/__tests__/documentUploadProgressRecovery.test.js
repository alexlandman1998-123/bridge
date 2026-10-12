import test from 'node:test'
import assert from 'node:assert/strict'
import { runRecoverableDocumentUpload } from '../documentUploadRecovery.js'

function fixture({ stallUpload = false, stallSave = false, stallFollowUp = false } = {}) {
  const events = [], paths = []
  const file = new File(['durable bytes'], 'mandate.pdf', { type: 'application/pdf' })
  const scope = ['progress-recovery', crypto.randomUUID()]
  const state = { uploads: 0, saves: 0, row: null, stored: false }
  const client = { storage: { from: () => ({ createSignedUrl: async () => state.stored ? { data: { signedUrl: 'https://synthetic.example.test/file' } } : { error: { status: 404 } } }) } }
  const action = (observer = event => events.push(event)) => runRecoverableDocumentUpload({ client, file, scope, onProgress: observer,
    timeouts: { uploading: 5, saving: 5, followUp: 10 },
    run: async attempt => {
      const path = attempt.path('listing/mandate.pdf'); paths.push(path)
      await attempt.upload(async () => { state.uploads++; state.stored = true; if (stallUpload) await new Promise(() => {}); return 'documents' })
      const saved = await attempt.persist({ save: async () => { state.saves++; state.row = { id: crypto.randomUUID(), storage_path: path }; if (stallSave) await new Promise(() => {}); return { data: state.row } }, read: async () => ({ data: state.row }) })
      if (stallFollowUp) await new Promise(() => {})
      return { ...saved.data, saved: true }
    } })
  return { action, events, paths, state }
}

test('Uploaded appears at durable save, before a stalled follow-up; retries retain one file and record', async () => {
  const f = fixture({ stallFollowUp: true })
  const result = await f.action()
  assert.deepEqual(f.events.slice(0, 4).map(event => event.stage), ['preparing', 'uploading', 'saving', 'complete'])
  assert.equal(f.events[3].document.id, f.state.row.id)
  assert.equal(result.saved, true)
  assert.equal(result.postUploadProcessing, 'pending')
  assert.equal((await f.action()).documentId, f.state.row.id)
  assert.equal(f.state.uploads, 1)
  assert.equal(f.state.saves, 1)
})

test('a stalled save reply is bounded and recovers the committed record', async () => {
  const f = fixture({ stallSave: true })
  assert.equal((await f.action()).id, f.state.row.id)
  assert.equal(f.state.saves, 1)
})

test('a stalled transfer does not report Uploaded; retry reconciles the same object before saving', async () => {
  const f = fixture({ stallUpload: true })
  await assert.rejects(f.action(), { code: 'document_save_unconfirmed' })
  assert.equal(f.events.some(event => event.stage === 'complete'), false)
  assert.equal(f.state.saves, 0)
  assert.equal((await f.action()).saved, true)
  assert.equal(f.state.uploads, 1)
  assert.equal(f.state.saves, 1)
  assert.equal(f.paths[0], f.paths[1])
})

test('a progress observer failure cannot reject a durable save', async () => {
  const f = fixture()
  assert.equal((await f.action(() => { throw new Error('Display failed') })).saved, true)
})

test('waiting for another tab is bounded before any upload or save', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: {
    request: (_key, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })),
  } } })
  const events = []
  let writes = 0
  try {
    await assert.rejects(runRecoverableDocumentUpload({ client: {}, file: new File(['bytes'], 'lock.pdf'), scope: ['lock-test', crypto.randomUUID()],
      timeouts: { preparing: 100 }, onProgress: event => events.push(event), run: async () => { writes++; },
    }), { code: 'document_upload_busy' })
    assert.equal(writes, 0)
    assert.equal(events.at(-1).stage, 'failed')
    assert.equal(events.some(event => event.stage === 'complete'), false)
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original)
    else delete globalThis.navigator
  }
})
