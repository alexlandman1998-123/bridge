/* global PORTAL_HANDLER_SOURCE */
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import SellerPortalPasswordGate from '../../src/components/client-portal/SellerPortalPasswordGate.jsx'
// Exercise the production handlers without mounting unrelated portal workspaces.
const makeHandlers = Function('scope', `with(scope){${PORTAL_HANDLER_SOURCE};return {normal:handleOpenPortalDocument,signed:handleOpenFinalSignedPortalDocument};}`)
function App() {
  const [workspace, setWorkspace] = useState('buyer'), [error, setError] = useState(''), [blocked, setBlocked] = useState(false)
  const [denied, setDenied] = useState(false), [slow, setSlow] = useState(false), [signs, setSigns] = useState(0), [accesses, setAccesses] = useState(0)
  const [mode, setMode] = useState('create'), [feedback, setFeedback] = useState(''), [notice, setNotice] = useState('')
  const [form, setForm] = useState({ password: '', confirmPassword: '', termsAccepted: false })
  const sign = async () => {
    setSigns(value => value + 1)
    const data = await (await fetch('/sign', { method: 'POST', body: JSON.stringify({ denied, slow }) })).json()
    if (data.error) throw new Error(data.error)
    return data.url
  }
  const scope = { effectiveWorkspace: workspace, token: 'synthetic-link', sellerPortalAccessToken: 'synthetic-session', isDemoMode: false,
    setError() {}, setDocumentActionError: setError, setOpeningDocumentPath() {},
    createSellerClientPortalDocumentSignedUrl: sign, createClientPortalDocumentSignedUrl: sign,
    resolveSellerClientPortalFinalSignedDocumentAccess: async () => ({ available: true, finalArtifact: { downloadUrl: await sign() } }),
    resolveClientPortalFinalSignedDocumentAccess: async () => ({ available: true, finalArtifact: { downloadUrl: await sign() } }),
    recordPortalDocumentAccess: () => setAccesses(value => value + 1), window: blocked ? { open: () => null } : window,
  }
  const handlers = makeHandlers(scope)
  return <><h1>Local buyer and seller portal acceptance</h1><p>Synthetic local transport. No live customer access or messages.</p>
    <section aria-label="Document acceptance">
      <label>Workspace<select aria-label="Workspace" value={workspace} onChange={event => setWorkspace(event.target.value)}><option>buyer</option><option>seller</option></select></label>
      <label><input type="checkbox" checked={blocked} onChange={event => setBlocked(event.target.checked)} />Simulate blocked tab</label>
      <label><input type="checkbox" checked={denied} onChange={event => setDenied(event.target.checked)} />Expired document access</label>
      <label><input type="checkbox" checked={slow} onChange={event => setSlow(event.target.checked)} />Slow signing response</label>
      <button onClick={() => handlers.normal({ file_path: 'synthetic/proof.pdf', file_bucket: 'buyer-documents' })}>Open document</button>
      <button onClick={() => handlers.signed({ packetId: 'packet', packetVersionId: 'version' })}>Open final signed document</button>
      <output aria-label="Delivery metrics">{JSON.stringify({ signs, accesses })}</output>{error ? <p role="alert">{error}</p> : null}
    </section>
    <label>Password mode<select aria-label="Password mode" value={mode} onChange={event => { setMode(event.target.value); setFeedback(''); setNotice('') }}><option value="create">Create</option><option value="signin">Sign in</option><option value="recovery">Recovery</option></select></label>
    <SellerPortalPasswordGate form={form} feedback={feedback} notice={notice} authState={{ passwordSet: mode !== 'create', tokenKind: mode === 'recovery' ? 'recovery' : 'invite', propertyTitle: 'Local fixture home', branding: { agencyName: 'Fixture Agency' } }}
      onChange={(field, value) => setForm(previous => ({ ...previous, [field]: value }))}
      onRequestRecovery={() => setNotice('If this account is eligible, a secure recovery link will be sent. Synthetic response; delivery disabled.')}
      onSubmit={event => { event.preventDefault(); setFeedback(mode !== 'signin' && form.password !== form.confirmPassword ? 'Passwords do not match.' : 'Synthetic authentication boundary: no live login or password change was attempted.') }} />
  </>
}
createRoot(document.getElementById('root')).render(<App />)
