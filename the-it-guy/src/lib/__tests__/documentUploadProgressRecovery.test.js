import test from 'node:test'
import assert from 'node:assert/strict'
import { runRecoverableDocumentUpload } from '../documentUploadRecovery.js'

function fixture({ stallUpload = false, stallSave = false, stallFollowUp = false, storedOnUpload = true } = {}) {
  const events = [], paths = []
  const file = new File(['durable bytes'], 'mandate.pdf', { type: 'application/pdf' })
  const scope = ['progress-recovery', crypto.randomUUID()]
  const state = { uploads: 0, saves: 0, row: null, stored: false }
  const client = { storage: { from: () => ({ createSignedUrl: async () => state.stored ? { data: { signedUrl: 'https://synthetic.example.test/file' } } : { error: { status: 404 } } }) } }
  const action = (observer = event => events.push(event)) => runRecoverableDocumentUpload({ client, file, scope, onProgress: observer,
    timeouts: { uploading: 5, saving: 5, followUp: 10 },
    run: async attempt => {
      const path = attempt.path('listing/mandate.pdf'); paths.push(path)
      await attempt.upload(async () => { state.uploads++; state.stored = storedOnUpload; if (stallUpload) await new Promise(() => {}); return 'documents' })
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

test('a lost transfer reply recovers verified bytes and reports Uploaded only after durable save', async () => {
  const f = fixture({ stallUpload: true })
  assert.equal((await f.action()).saved, true)
  assert.equal(f.state.uploads, 1)
  assert.equal(f.state.saves, 1)
  const completed = f.events.find(event => event.stage === 'complete')
  assert.equal(completed.document.id, f.state.row.id)
  assert.equal((await f.action()).id, f.state.row.id)
  assert.equal(f.state.uploads, 1)
  assert.equal(f.state.saves, 1)
})

test('an unconfirmed transfer stays incomplete until the exact object can be verified', async () => {
  const f = fixture({ stallUpload: true, storedOnUpload: false })
  await assert.rejects(f.action(), { code: 'document_save_unconfirmed' })
  assert.equal(f.events.some(event => event.stage === 'complete'), false)
  assert.equal(f.state.saves, 0)
  f.state.stored = true
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

test('file preparation and verified actor lookup start together, and retries reuse only immutable file digests', async () => {
  let reads = 0, checks = 0, releaseRead
  let actor = 'first-actor'
  const file = new File(['immutable'], 'identity.pdf', { type: 'application/pdf' })
  const originalRead = file.arrayBuffer.bind(file)
  file.arrayBuffer = async () => { reads++; await new Promise(resolve => { releaseRead = resolve }); return originalRead() }
  const actors = []
  const client = { auth: { getUser: async () => { checks++; return { data: { user: { id: actor } } } } } }
  const options = { client, file, scope: ['parallel-preparation', crypto.randomUUID()], run: async attempt => { actors.push(attempt.fileFingerprint); return { id: 'saved' } } }
  const first = runRecoverableDocumentUpload(options)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(reads, 1)
  assert.equal(checks, 1, 'sign-in starts while file read is pending')
  releaseRead()
  await first
  actor = 'second-actor'
  await runRecoverableDocumentUpload(options)
  assert.equal(reads, 1)
  assert.equal(checks, 2, 'authorisation is always rechecked')
  assert.equal(actors[0], actors[1])
})

test('unreadable files emit failure, and a later retry rereads the file', async () => {
  const file = new File(['recoverable'], 'cloud-file.pdf', { type: 'application/pdf' })
  const originalRead = file.arrayBuffer.bind(file)
  let reads = 0, runs = 0
  const events = []
  file.arrayBuffer = async () => { if (++reads === 1) throw new Error('Download this file from cloud storage first.'); return originalRead() }
  const options = { file, scope: ['read-failure', crypto.randomUUID()], onProgress: event => events.push(event), run: async () => { runs++; return { id: 'saved' } } }
  await assert.rejects(runRecoverableDocumentUpload(options), /cloud storage/)
  assert.equal(events.at(-1).stage, 'failed')
  assert.equal(runs, 0)
  await runRecoverableDocumentUpload(options)
  assert.equal(reads, 2)
  assert.equal(runs, 1)
})

test('a failed identity check terminates the indicator and never starts an upload', async () => {
  const events = []
  await assert.rejects(runRecoverableDocumentUpload({ file: new File(['a'], 'file.pdf'), scope: ['auth-failure'],
    client: { auth: { getUser: async () => ({ error: new Error('Sign in again.') }) } },
    onProgress: event => events.push(event), run: () => assert.fail('must not upload') }), /Sign in again/)
  assert.equal(events.at(-1).stage, 'failed')
})

test('concurrent duplicate clicks finish both indicators with one upload operation', async () => {
  const file = new File(['one upload'], 'duplicate.pdf')
  const events = [[], []]
  let runs = 0, release
  const options = { file, scope: ['duplicate-progress', crypto.randomUUID()], run: async () => { runs++; await new Promise(resolve => { release = resolve }); return { id: 'saved' } } }
  const first = runRecoverableDocumentUpload({ ...options, onProgress: event => events[0].push(event) })
  const second = runRecoverableDocumentUpload({ ...options, onProgress: event => events[1].push(event) })
  while (!release) await new Promise(resolve => setImmediate(resolve))
  release()
  await Promise.all([first, second])
  assert.equal(runs, 1)
  assert.equal(events[0].at(-1).stage, 'complete')
  assert.equal(events[1].at(-1).stage, 'complete')
})

test('uncertain saves retain recovery guidance instead of claiming the file was not attached', async () => {
  const { describeDocumentUploadFailure, refreshAfterSavedDocumentUpload } = await import('../documentUploadLifecycle.js')
  const message = describeDocumentUploadFailure(Object.assign(new Error('Storage network failure'),{code:'document_save_unconfirmed',retained:true}))
  assert.match(message,/check the saved record/)
  assert.doesNotMatch(message,/not attached|not saved/)
  let warning
  const saved={id:'saved',saved:true}
  assert.equal(await refreshAfterSavedDocumentUpload(saved,async()=>{throw new Error('Offline')},value=>{warning=value}),saved)
  assert.match(warning,/Document saved/)
  assert.match(describeDocumentUploadFailure({code:'42501',message:'Permission denied'}),/workspace manager/)
})

test('a timed-out file read stops progress and can be read again on retry', async () => {
  const file=new File(['available after cloud download'],'cloud.pdf')
  const read=file.arrayBuffer.bind(file)
  let calls=0
  file.arrayBuffer=async()=> ++calls===1 ? new Promise(()=>{}) : read()
  const events=[]
  const options={file,scope:['file-read-timeout',crypto.randomUUID()],timeouts:{preparing:10},onProgress:event=>events.push(event),run:async()=>({id:'saved'})}
  await assert.rejects(runRecoverableDocumentUpload(options),/available on this device/)
  assert.equal(events.at(-1).stage,'failed')
  await runRecoverableDocumentUpload(options)
  assert.equal(calls,2)
  assert.equal(events.at(-1).stage,'complete')
})
