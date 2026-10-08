import test from 'node:test'
import assert from 'node:assert/strict'
import { runRecoverableDocumentUpload, isDefiniteUploadSaveRejection } from '../documentUploadRecovery.js'
import { refreshAfterSavedDocumentUpload } from '../documentUploadLifecycle.js'

function fixture({ saveFailure = null, committed = true, readable = true, followUpFails = false } = {}) {
  const scope = ['diagnostic', crypto.randomUUID()]
  const file = new File(['%PDF-1.4 diagnostic'], 'identity.pdf', { type: 'application/pdf', lastModified: 1 })
  const state = { uploads: 0, saves: 0, deletes: 0, reads: 0, row: null, readable, saveFailure, committed }
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'actor' } } }) } }
  const action = (inputFile = file, inputScope = scope) => runRecoverableDocumentUpload({ client, scope: inputScope, file: inputFile,
    run: async attempt => {
      const path = attempt.path('transaction-test/identity.pdf')
      await attempt.upload(async () => { state.uploads++; return 'documents' })
      const saved = await attempt.persist({
        save: async () => {
          state.saves++
          await Promise.resolve()
          if (state.committed) state.row = { id: crypto.randomUUID(), file_path: path }
          if (state.saveFailure) throw state.saveFailure
          return { data: state.row }
        },
        read: async () => {
          state.reads++
          if (!state.readable) throw new Error('Read unavailable')
          return state.row ? { data: state.row } : null
        },
        cleanup: async () => { state.deletes++ },
      })
      if (followUpFails) throw new Error('Notification or preview failed')
      return { ...saved.data, saved: true }
    },
  })
  return { action, state, scope, file }
}

test('commit followed by a lost reply recovers the exact row without deleting bytes', async () => {
  const f = fixture({ saveFailure: new TypeError('Failed to fetch') })
  const saved = await f.action()
  assert.equal(saved.id, f.state.row.id)
  assert.equal(f.state.uploads, 1)
  assert.equal(f.state.saves, 1)
  assert.equal(f.state.deletes, 0)
  const retry = await f.action()
  assert.equal(retry.id, saved.id)
  assert.equal(f.state.uploads, 1)
  assert.equal(f.state.saves, 1)
})

test('an uncertain write and unavailable read retain the object and block a duplicate mutation', async () => {
  const f = fixture({ saveFailure: new TypeError('Connection reset'), readable: false })
  await assert.rejects(f.action(), { code: 'document_save_unconfirmed' })
  await assert.rejects(f.action(), { code: 'document_save_unconfirmed' })
  assert.equal(f.state.uploads, 1)
  assert.equal(f.state.saves, 1)
  assert.equal(f.state.deletes, 0)
  f.state.readable = true
  assert.equal((await f.action()).id, f.state.row.id)
  assert.equal(f.state.saves, 1)
})

test('an empty read after a timed-out write is not permission to issue a second write', async () => {
  const f = fixture({ saveFailure: new Error('Timeout'), committed: false })
  await assert.rejects(f.action(), { code: 'document_save_unconfirmed' })
  await assert.rejects(f.action(), { code: 'document_save_unconfirmed' })
  assert.equal(f.state.saves, 1)
  assert.equal(f.state.deletes, 0)
  // The earlier request can finish later; a subsequent read recovers it.
  f.state.row = { id: 'late-commit', file_path: 'transaction-test/retained.pdf' }
  assert.equal((await f.action()).id, 'late-commit')
})

test('repeated clicks and simultaneous retries share one upload and one record', async () => {
  const f = fixture()
  const results = await Promise.all(Array.from({ length: 12 }, () => f.action()))
  assert.equal(new Set(results.map(row => row.id)).size, 1)
  assert.equal(f.state.uploads, 1)
  assert.equal(f.state.saves, 1)
})

test('a definite database rejection can clean up an unlinked first upload', async () => {
  const error = Object.assign(new Error('Requirement mismatch'), { code: '23514' })
  const f = fixture({ saveFailure: error, committed: false })
  await assert.rejects(f.action(), error)
  assert.equal(f.state.deletes, 1)
  f.state.saveFailure = null
  f.state.committed = true
  assert.ok((await f.action()).id)
  assert.equal(f.state.uploads, 2)
})

test('uniqueness and missing returned rows are uncertain unless an exact saved record is readable', async () => {
  for (const code of ['23505', 'PGRST116', '08006', '57014', 'XX000', 'PGRST000']) {
    const f = fixture({ saveFailure: Object.assign(new Error('Unknown outcome'), { code }), committed: false })
    await assert.rejects(f.action(), { code: 'document_save_unconfirmed' })
    assert.equal(f.state.deletes, 0, code)
  }
  assert.equal(isDefiniteUploadSaveRejection({ code: 'document_save_unconfirmed', cause: { code: '42501' } }), false)
})

test('failed follow-up work returns a durable saved receipt with a separate warning', async () => {
  const f = fixture({ followUpFails: true })
  const saved = await f.action()
  assert.equal(saved.id, f.state.row.id)
  assert.equal(saved.saved, true)
  assert.equal(saved.postUploadProcessing, 'pending')
  assert.match(saved.persistenceWarnings[0], /Document saved/)
  assert.equal(f.state.deletes, 0)
})

test('same file metadata with different contents and different audiences create separate attempts', async () => {
  const f = fixture()
  await f.action()
  const changed = new File(['%PDF-1.4 DIFFERENT!'], f.file.name, { type: f.file.type, lastModified: 1 })
  await f.action(changed)
  await f.action(f.file, [...f.scope, 'another-audience'])
  assert.equal(f.state.uploads, 3)
  assert.equal(f.state.saves, 3)
})

test('reload recovery stores only references and rechecks access instead of caching document rows or tokens', async () => {
  const storage = new Map()
  globalThis.localStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
  try {
    const f = fixture({ saveFailure: new Error('Lost response'), readable: false })
    f.scope.push('secret-portal-capability')
    await assert.rejects(f.action(), { code: 'document_save_unconfirmed' })
    const serialized = JSON.stringify([...storage])
    assert.ok(!serialized.includes('secret-portal-capability'))
    assert.ok(!serialized.includes(f.state.row.id))
    assert.ok(!serialized.includes('%PDF'))
    f.state.readable = true
    const reloaded = await import(`../documentUploadRecovery.js?reload=${crypto.randomUUID()}`)
    const saved = await reloaded.runRecoverableDocumentUpload({ client: { auth: { getUser: async () => ({ data: { user: { id: 'actor' } } }) } }, scope: f.scope, file: f.file,
      run: async attempt => {
        await attempt.upload(() => { throw new Error('Reload must retain the existing object') })
        const result = await attempt.persist({ save: () => { throw new Error('Reload must not duplicate the write') }, read: async () => ({ data: f.state.row }) })
        return result.data
      },
    })
    assert.equal(saved.id, f.state.row.id)
    f.state.readable = false
    await assert.rejects(f.action(), { code: 'document_save_unconfirmed' })
    assert.equal(f.state.uploads, 1)
  } finally { delete globalThis.localStorage }
})

test('a page refresh failure after saving preserves the upload result and displays a separate warning', async () => {
  const saved = { id: 'saved-document', saved: true }
  let warning = ''
  assert.equal(await refreshAfterSavedDocumentUpload(saved, async () => { throw new Error('Offline') }, value => { warning = value }), saved)
  assert.match(warning, /Document saved/)
  assert.match(warning, /list could not be refreshed/)
})

test('a lost Storage response reconciles the configured fallback bucket without sending bytes twice', async () => {
  const file = new File(['storage-recovery'], 'storage-recovery.pdf', { type: 'application/pdf' })
  let uploads = 0, saves = 0
  const lookups = []
  const client = { storage: { from: bucket => ({ createSignedUrl: async path => {
    lookups.push([bucket, path])
    return bucket === 'configured-private-documents' ? { data: { signedUrl: 'https://example.test/object' } } : { error: new Error('Missing bucket') }
  } }) } }
  // Use the same operation scope for both requests; the signed lookup proves
  // the original exact path exists before a metadata command is allowed.
  const scope = ['fallback-storage', crypto.randomUUID()]
  const retry = () => runRecoverableDocumentUpload({ client, scope, file, storageBuckets: ['documents', 'configured-private-documents'], run: async attempt => {
    const path = attempt.path('record/storage-recovery.pdf')
    await attempt.upload(async () => { uploads++; throw new TypeError('Storage response lost') })
    saves++
    return path
  } })
  await assert.rejects(retry(), { code: 'document_save_unconfirmed' })
  assert.match(await retry(), /^record\//)
  assert.equal(uploads, 1)
  assert.equal(saves, 1)
  assert.equal(lookups[1][0], 'configured-private-documents')
  assert.equal(lookups[0][1], lookups[1][1])
})

test('wrapped Storage permission rejection allows a fresh attempt once access is repaired', async () => {
  const file = new File(['permission-recovery'], 'permission.pdf', { type: 'application/pdf' })
  const scope = ['permission-recovery', crypto.randomUUID()]
  const action = upload => runRecoverableDocumentUpload({ scope, file, run: async attempt => {
    attempt.path('record/permission.pdf')
    return attempt.upload(upload)
  } })
  const rejected = Object.assign(new Error('Storage access unavailable'), { cause: { status: 403 } })
  await assert.rejects(action(async () => { throw rejected }), rejected)
  assert.equal(await action(async () => 'documents'), 'documents')
  const nestedUnique = fixture({ saveFailure: Object.assign(new Error('Wrapped conflict'), { cause: { code: '23505' } }), committed: false })
  await assert.rejects(nestedUnique.action(), { code: 'document_save_unconfirmed' })
  assert.equal(nestedUnique.state.deletes, 0)
})

test('an interrupted Storage upload can resume at the same path after exact absence is confirmed', async () => {
  const file = new File(['resume-original-path'], 'resume.pdf', { type: 'application/pdf' })
  const scope = ['resume-storage', crypto.randomUUID()]
  let sent = 0
  const paths = []
  const client = { storage: { from: () => ({ createSignedUrl: async () => ({ error: { statusCode: 404, message: 'Object not found' } }) }) } }
  const action = () => runRecoverableDocumentUpload({ client, scope, file, run: async attempt => {
    const path = attempt.path(`record/${crypto.randomUUID()}-resume.pdf`)
    paths.push(path)
    return attempt.upload(async () => {
      if (++sent === 1) throw new TypeError('Disconnected before upload finished')
      return 'documents'
    })
  } })
  await assert.rejects(action(), { code: 'document_save_unconfirmed' })
  assert.equal(await action(), 'documents')
  assert.equal(sent, 2)
  assert.equal(paths[0], paths[1])
})

test('a failed actor lookup cannot change a signed-in retry identity; anonymous token portals still work', async () => {
  const file = new File(['actor-check'], 'actor.pdf', { type: 'application/pdf' })
  let calls = 0
  const run = async () => { calls++; return 'verified' }
  const failure = new TypeError('Identity lookup unavailable')
  await assert.rejects(runRecoverableDocumentUpload({ client: { auth: { getUser: async () => ({ error: failure }) } }, scope: ['actor-check'], file, run }), failure)
  assert.equal(calls, 0)
  const result = await runRecoverableDocumentUpload({ client: { auth: { getUser: async () => ({ error: { name: 'AuthSessionMissingError' }, data: { user: null } }) } }, scope: ['token-portal-check'], file, run })
  assert.equal(result, 'verified')
  assert.equal(calls, 1)
})
