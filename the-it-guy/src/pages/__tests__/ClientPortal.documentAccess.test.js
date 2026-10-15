import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Exercise the page's actual handler with synthetic browser/session transport.
// No portal credentials, customer files or network requests are used.
const source = readFileSync(new URL('../ClientPortal.jsx', import.meta.url), 'utf8')
const start = source.indexOf('  async function handleOpenPortalDocument(document)')
const end = source.indexOf('\n  useEffect(', start)
assert.ok(start >= 0 && end > start)
const signedStart = source.indexOf('  async function handleOpenFinalSignedPortalDocument(')
assert.ok(signedStart >= 0 && signedStart < start)

function fixture({ blocked = false, workspace = 'seller', sign = async () => 'https://storage.invalid/fresh' } = {}) {
  const calls = [], errors = []
  const tab = { closed: false, opener: 'parent', location: { replace: url => calls.push(['navigate', url]) } }
  const scope = {
    effectiveWorkspace: workspace, token: 'synthetic-token', sellerPortalAccessToken: 'synthetic-session',
    isDemoMode: false,
    setError() {}, setOpeningDocumentPath() {}, setDocumentActionError(message) { if (message) errors.push(message) },
    openPortalDocumentWindow() { calls.push(['open']); return blocked ? null : tab },
    window: { open() { calls.push(['late-open']); return null } },
    writePortalDocumentWindowMessage(_tab, message) { calls.push(['message', message.message]) },
    createSellerClientPortalDocumentSignedUrl: async args => { calls.push(['sign-seller', args]); return sign() },
    createClientPortalDocumentSignedUrl: async args => { calls.push(['sign-buyer', args]); return sign() },
    resolveSellerClientPortalFinalSignedDocumentAccess: async args => { calls.push(['final-seller', args]); return sign() },
    resolveClientPortalFinalSignedDocumentAccess: async args => { calls.push(['final-buyer', args]); return sign() },
    recordPortalDocumentAccess() { calls.push(['access']) },
  }
  const action = Function('scope', `with(scope) { return (${source.slice(start, end)}) }`)(scope)
  const signedAction = Function('scope', `with(scope) { return (${source.slice(signedStart, start)}) }`)(scope)
  scope.handleOpenFinalSignedPortalDocument = signedAction
  return { action, signedAction, calls, errors, tab }
}

test('opens the tab synchronously before signing and navigates that tab only after success', async () => {
  let finish
  const f = fixture({ sign: () => new Promise(resolve => { finish = resolve }) })
  const pending = f.action({ file_path: 'synthetic/proof.pdf' })
  assert.deepEqual(f.calls.map(call => call[0]), ['open', 'sign-seller'])
  assert.equal(f.tab.opener, null)
  finish('https://storage.invalid/fresh')
  await pending
  assert.deepEqual(f.calls.at(-2), ['navigate', 'https://storage.invalid/fresh'])
  assert.deepEqual(f.calls.at(-1), ['access'])
  assert.deepEqual(f.errors, [])
})

test('reports a blocked tab without signing or claiming document access', async () => {
  const f = fixture({ blocked: true })
  await f.action({ file_path: 'synthetic/proof.pdf' })
  assert.deepEqual(f.calls, [['open']])
  assert.match(f.errors[0], /allow.*(tab|pop)/i)
})

test('shows a signing failure and allows the same document to be retried', async () => {
  let attempts = 0
  const f = fixture({ sign: async () => { if (++attempts === 1) throw new Error('Access unavailable'); return 'https://storage.invalid/retry' } })
  await f.action({ file_path: 'synthetic/proof.pdf' })
  assert.match(f.errors[0], /Access unavailable/)
  assert.equal(f.calls.some(call => call[0] === 'access'), false)
  await f.action({ file_path: 'synthetic/proof.pdf' })
  assert.ok(f.calls.some(call => call[0] === 'navigate' && call[1].endsWith('/retry')))
})

test('does not open another tab or record access if the user closes the pending tab', async () => {
  let finish
  const f = fixture({ sign: () => new Promise(resolve => { finish = resolve }) })
  const pending = f.action({ file_path: 'synthetic/proof.pdf' })
  f.tab.closed = true
  finish('https://storage.invalid/fresh')
  await pending
  assert.equal(f.calls.some(call => ['navigate', 'access', 'late-open'].includes(call[0])), false)
  assert.match(f.errors[0], /closed/i)
})

test('buyer downloads retain their token and persisted bucket in the fresh-link request', async () => {
  const f = fixture({ workspace: 'buyer' })
  await f.action({ file_path: 'synthetic/proof.pdf', file_bucket: 'buyer-documents', url: 'https://storage.invalid/expired' })
  assert.equal(f.calls.find(call => call[0] === 'sign-buyer')[1].fileBucket, 'buyer-documents')
  assert.equal(f.calls.find(call => call[0] === 'sign-buyer')[1].token, 'synthetic-token')
  assert.deepEqual(f.calls.find(call => call[0] === 'navigate'), ['navigate', 'https://storage.invalid/fresh'])
})

test('final signed downloads report a blocked tab before resolving access', async () => {
  const f = fixture({ blocked: true })
  await f.signedAction({ packetId: 'packet', packetVersionId: 'version' })
  assert.deepEqual(f.calls, [['open']])
  assert.match(f.errors[0], /allow.*(tab|pop)/i)
})

for (const workspace of ['buyer', 'seller']) {
  test(`${workspace} final signed downloads preopen a tab and preserve secure access arguments`, async () => {
    let finish
    const f = fixture({ workspace, sign: () => new Promise(resolve => { finish = resolve }) })
    const pending = f.action({ canonicalFinalArtifact: true, packet_id: 'packet', packet_version_id: 'version', id: 'signed-file' })
    assert.deepEqual(f.calls.map(call => call[0]), ['open', `final-${workspace}`])
    assert.equal(f.tab.opener, null)
    assert.deepEqual(f.calls[1][1], { token: 'synthetic-token', ...(workspace === 'seller' ? { accessToken: 'synthetic-session' } : {}),
      packetId: 'packet', packetVersionId: 'version', documentId: '', download: true })
    finish({ available: true, finalArtifact: { downloadUrl: 'https://storage.invalid/final' } })
    await pending
    assert.deepEqual(f.calls.slice(-2), [['navigate', 'https://storage.invalid/final'], ['access']])
    assert.deepEqual(f.errors, [])
  })
}

test('unpublished final artifacts show an error without recording access', async () => {
  const f = fixture({ sign: async () => ({ available: false, message: 'Secure publication is pending' }) })
  await f.signedAction({ documentId: 'signed-file' })
  assert.match(f.errors[0], /publication is pending/)
  assert.ok(f.calls.some(call => call[0] === 'message'))
  assert.equal(f.calls.some(call => ['access', 'navigate', 'late-open'].includes(call[0])), false)
})

test('closing a pending signed-document tab prevents navigation and false access records', async () => {
  let finish
  const f = fixture({ sign: () => new Promise(resolve => { finish = resolve }) })
  const pending = f.signedAction({ documentId: 'signed-file' })
  f.tab.closed = true
  finish({ available: true, finalArtifact: { downloadUrl: 'https://storage.invalid/final' } })
  await pending
  assert.equal(f.calls.some(call => ['access', 'navigate', 'late-open'].includes(call[0])), false)
  assert.match(f.errors[0], /closed/i)
})
