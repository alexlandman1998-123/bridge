import { useEffect, useRef, useState } from 'react'
import { UserRound } from 'lucide-react'
import Button from '../ui/Button.jsx'
import ListingSellerInformationEditor from '../listings/ListingSellerInformationEditor.jsx'
import {
  addListingSellerProfileDraftPerson, hasListingSellerProfileBranchDetailsToDiscard,
  removeListingSellerProfileDraftPerson, selectListingSellerProfileBranch,
  updateListingSellerProfileDraftField, updateListingSellerProfileDraftPerson,
} from '../../lib/listingSellerProfileBuilderModel.js'
import { buildTransactionSellerCapture, sellerCaptureDraft } from '../../core/transactions/transactionSellerCapture.js'
import { loadTransactionSellerCapture, saveTransactionSellerCapture } from '../../services/transactionSellerCaptureService.js'

export default function TransactionSellerCapturePanel({ transactionId, canEdit = false, onSaved, onEditBond, loadCapture = loadTransactionSellerCapture, saveCapture = saveTransactionSellerCapture, portalToken = '', onBack }) {
  const [context, setContext] = useState(null)
  const [draft, setDraft] = useState(null)
  const [baseline, setBaseline] = useState('')
  const [primaryId, setPrimaryId] = useState('')
  const [baselinePrimaryId, setBaselinePrimaryId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loadKey, setLoadKey] = useState(0)
  const pending = useRef(null)
  const inFlight = useRef(false)
  const generation = useRef(0)
  const dirty = Boolean(draft && (JSON.stringify(draft) !== baseline || primaryId !== baselinePrimaryId))

  useEffect(() => {
    let active = true
    generation.current += 1; inFlight.current = false; pending.current = null
    setBusy(false); setLoading(true); setError(''); setMessage(''); setContext(null); setDraft(null)
    loadCapture({ transactionId, token: portalToken }).then(result => {
      if (!active) return
      const next = result.captureDraft || sellerCaptureDraft(result)
      const activeRoster = result.roster.filter(person => !person.removedAt)
      setContext(result); setDraft(next); setBaseline(JSON.stringify(next))
      const initialPrimary = result.revision.participantId || (activeRoster.length ? '' : crypto.randomUUID())
      setPrimaryId(initialPrimary); setBaselinePrimaryId(initialPrimary)
    }).catch(failure => { if (active) setError(failure.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false; generation.current += 1 }
  }, [transactionId, loadKey, portalToken, loadCapture])

  useEffect(() => {
    if (!dirty) return undefined
    const preventUnload = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', preventUnload)
    return () => window.removeEventListener('beforeunload', preventUnload)
  }, [dirty])

  function change(field, value) {
    if (busy || !canEdit) return
    if (field === 'branch' && hasListingSellerProfileBranchDetailsToDiscard(draft, value)
      && !window.confirm('Changing the legal owner type clears details that belong to the current type. Continue?')) return
    setDraft(previous => field === 'branch' ? selectListingSellerProfileBranch(previous, value) : updateListingSellerProfileDraftField(previous, field, value))
    pending.current = null; setError(''); setMessage('')
  }

  async function save(event) {
    event.preventDefault()
    if (!canEdit || inFlight.current || !context || !draft) return
    if (!draft.branch) { setError('Choose the legal owner type. The remaining details can be completed later.'); return }
    if (context.authority !== 'listing' && !primaryId) { setError('Choose which existing seller is the primary contact.'); return }
    const currentGeneration = generation.current
    inFlight.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const signature = JSON.stringify({ draft, primaryId })
      if (pending.current?.signature !== signature) pending.current = {
        signature, mutationId: crypto.randomUUID(), profile: context.authority === 'listing' ? null : buildTransactionSellerCapture(draft, context, primaryId),
      }
      const result = await saveCapture({ transactionId, token: portalToken, context, draft, ...pending.current })
      if (currentGeneration !== generation.current) return
      const next = result.captureDraft || sellerCaptureDraft(result)
      setContext(result); setDraft(next); setBaseline(JSON.stringify(next)); setBaselinePrimaryId(primaryId); pending.current = null
      setMessage(portalToken ? 'Seller details saved. Your agent can see the updated information.' : context.authority === 'listing' ? 'Seller details saved to the linked listing.' : 'Seller details saved to this transaction.')
      window.dispatchEvent(new CustomEvent('deal-setup:updated', { detail: { transactionId } }))
      try { await onSaved?.(result) }
      catch { if (currentGeneration === generation.current) setMessage('Seller details saved. Refresh the transaction to update its summary.') }
    } catch (failure) { if (currentGeneration === generation.current) setError(failure.message) }
    finally { if (currentGeneration === generation.current) { inFlight.current = false; setBusy(false) } }
  }

  if (loading) return <p role="status" className="p-5 text-sm text-textMuted">Loading seller details…</p>
  if (!draft) return <div className="space-y-3 p-5"><p role="alert" className="text-sm text-danger">{error}</p><Button type="button" variant="secondary" onClick={() => setLoadKey(value => value + 1)}>Retry loading seller details</Button></div>
  const activeRoster = context.roster.filter(person => !person.removedAt)
  return <section aria-label={portalToken ? 'Seller information' : 'Manual seller capture'} className="space-y-5">
    <header className="flex items-start gap-3"><span className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><UserRound size={21} aria-hidden="true" /></span><div><h3 className="text-section-title font-semibold text-textStrong">Seller details</h3><p className="mt-1 text-sm text-textMuted">{portalToken ? 'Review your details and save the information you have for your agent.' : context.authority === 'listing' ? 'Current seller details from the linked listing profile.' : context.profile?.people?.length ? 'Saved seller information for this transaction.' : 'Capture the information you have for this backfilled transaction.'}</p>{!portalToken ? <p className="mt-1 text-xs text-textMuted">Saved without sending onboarding. Missing details can be completed later.</p> : null}</div></header>
    {context.authority !== 'listing' && !context.revision.participantId && activeRoster.length ? <label className="grid gap-2 text-sm font-medium text-textMuted">Primary seller contact<select className="ui-input" disabled={!canEdit || busy} value={primaryId} onChange={event => {
      const person = activeRoster.find(entry => entry.id === event.target.value)
      setPrimaryId(event.target.value); pending.current = null
      if (person) setDraft(previous => ({ ...previous, primaryContactName: person.name || '', email: person.email || '', phone: person.phone || '' }))
    }}><option value="">Choose the existing seller…</option>{activeRoster.map(person => <option key={person.id} value={person.id}>{person.name || person.email || 'Unnamed seller'}</option>)}</select></label> : null}
    <ListingSellerInformationEditor draft={draft} saving={!canEdit || busy} showConsent={false} showPropertyAndMandate={false} emailLabel={portalToken ? 'Email' : 'Email (optional for manual capture)'}
      onChange={change} onSubmit={save}
      onAddPerson={(key, role) => { setDraft(previous => addListingSellerProfileDraftPerson(previous, key, role)); pending.current = null }}
      onUpdatePerson={(key, index, field, value) => { setDraft(previous => updateListingSellerProfileDraftPerson(previous, key, index, field, value)); pending.current = null }}
      onRemovePerson={(key, index) => { setDraft(previous => removeListingSellerProfileDraftPerson(previous, key, index)); pending.current = null }} />
    {error ? <p role="alert" className="rounded-control bg-dangerSoft px-4 py-3 text-sm text-danger">{error}</p> : null}
    {message ? <p role="status" className="text-sm text-success">{message}</p> : null}
    <footer className="flex flex-wrap justify-end gap-2 border-t border-borderSoft pt-4">
      {onBack ? <Button type="button" variant="secondary" disabled={busy} onClick={() => { if (dirty && !window.confirm('Discard unsaved seller changes?')) return; onBack() }}>Back</Button> : null}
      {onEditBond && canEdit && context.authority !== 'listing' ? <Button type="button" variant="secondary" disabled={busy || dirty} onClick={onEditBond}>Seller bond details</Button> : null}
      {error ? <Button type="button" variant="secondary" disabled={busy} onClick={() => setLoadKey(value => value + 1)}>Reload saved profile (discard my entries)</Button> : null}
      {canEdit ? <Button type="submit" form="listing-seller-information-editor-form" disabled={busy || (!dirty && !pending.current)}>{busy ? 'Saving…' : portalToken ? 'Save my details' : 'Save seller details'}</Button> : null}
    </footer>
  </section>
}
