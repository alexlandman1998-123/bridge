import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const source = readFileSync(new URL('../ClientPortal.jsx', import.meta.url), 'utf8')
function fixture(kind) {
  const markers = {
    required: ['  async function handleUploadRequiredDocument(', '  function handleDocumentCentreUpload('],
    reservation: ['  async function handleUploadReservationDepositProof(', '  function recordPortalDocumentAccess('],
    account: ['  const handleUploadMatterAccountProof = useCallback(', '  const handleUploadMatterRequestDocument = useCallback('],
    request: ['  const handleUploadMatterRequestDocument = useCallback(', '  // Pending work belongs to one link/workspace/session.'],
  }
  const [begin, end] = markers[kind]
  let body = source.slice(source.indexOf(begin), source.indexOf(end, source.indexOf(begin) + begin.length))
  if (kind === 'account' || kind === 'request') body = body.slice(body.indexOf('useCallback(') + 'useCallback('.length, body.lastIndexOf('}, [') + 1)
  const mutations = []
  let resolve, reject, started = false
  const saved = new Promise((yes, no) => { resolve = yes; reject = no })
  const upload = () => { started = true; return saved }
  const scope = {
    portalLoadScopeRef: { current: 'portal-a:buyer:' }, token: 'portal-a', portalDataWorkspace: 'buyer', sellerPortalAccessToken: '', effectiveWorkspace: 'buyer', isDemoMode: false,
    isBondStatementHandoff: () => false, normalizeDocumentKey: value => String(value || ''),
    uploadClientPortalDocument: upload, uploadClientPortalMatterFinancialProof: upload, uploadClientPortalMatterFinancialRequestDocument: upload,
    applyUploadedPortalDocument: value => mutations.push(['document', value]), loadPortal: () => { mutations.push(['reload']); return Promise.resolve() },
    fetchClientPortalMatterFinancialAccounts: () => { mutations.push(['account-read']); return Promise.resolve({ accounts: [] }) },
    reservationProofRequirement: { key: 'reservation_proof' },
  }
  for (const setter of ['setUploadingDocumentKey','setError','setReservationProofUploadFeedback','setUploadingMatterProofAccountId','setMatterProofUploadFeedback','setMatterAccountsState','setUploadingMatterRequestId','setMatterRequestUploadFeedback']) {
    scope[setter] = value => mutations.push([setter,value])
  }
  return { action: Function('scope', `with(scope) { return (${body.trim()}); }`)(scope), scope, mutations, resolve, reject, started: () => started }
}
for (const kind of ['required', 'reservation', 'account', 'request']) {
  for (const failure of [false, true]) {
    test(`${kind} upload ${failure ? 'failure' : 'success'} from an old portal cannot mutate the new portal`, async () => {
      const f = fixture(kind), file = new File(['fixture'], 'fixture.pdf', { type: 'application/pdf' })
      const pending = kind === 'required' ? f.action('identity', file) : kind === 'reservation' ? f.action(file) : f.action({ account: { id: 'account-a' }, request: { id: 'request-a' }, file })
      assert.equal(f.started(), true)
      f.scope.portalLoadScopeRef.current = 'portal-b:buyer:'
      const before = f.mutations.length
      if (failure) f.reject(new Error('Old request failed'))
      else f.resolve({ id: 'old-private-document' })
      await pending
      assert.equal(f.mutations.length, before)
    })
  }
}

for (const kind of ['required', 'reservation', 'account', 'request']) {
  test(`${kind}: a stale upload callback cannot adopt the next portal scope`, async () => {
    const f = fixture(kind), file = new File(['fixture'], 'fixture.pdf')
    f.scope.portalLoadScopeRef.current = 'portal-b:buyer:'
    const result = kind === 'required' ? await f.action('identity', file) : kind === 'reservation' ? await f.action(file) : await f.action({ account: { id: 'account-a' }, request: { id: 'request-a' }, file })
    assert.equal(f.started(), false); assert.equal(result.scopeChanged, true)
    assert.deepEqual(f.mutations, [])
  })
}

for (const kind of ['account', 'request']) {
  test(`${kind}: a financial read completing after navigation cannot expose the old account snapshot`, async () => {
    const f = fixture(kind), file = new File(['fixture'], 'fixture.pdf')
    let finishRead, startedRead = false
    f.scope.fetchClientPortalMatterFinancialAccounts = () => { startedRead = true; return new Promise(resolve => { finishRead = resolve }) }
    const pending = f.action({ account: { id: 'account-a' }, request: { id: 'request-a' }, file })
    f.resolve({ id: 'saved-document' })
    await Promise.resolve()
    assert.equal(startedRead, true)
    f.scope.portalLoadScopeRef.current = 'portal-b:buyer:'
    const before = f.mutations.length
    finishRead({ accounts: [{ id: 'old-private-account' }] })
    await pending
    assert.equal(f.mutations.length, before)
  })
}
