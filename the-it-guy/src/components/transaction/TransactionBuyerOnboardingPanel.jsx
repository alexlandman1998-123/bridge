import { useEffect, useRef, useState } from 'react'
import { Mail, PenLine, ArrowLeft, UserRound, Check } from 'lucide-react'
import Button from '../ui/Button.jsx'
import TransactionBuyerProfileFields from './TransactionBuyerProfileFields.jsx'
import { loadTransactionBuyerCapture, saveTransactionBuyerCapture } from '../../services/transactionBuyerCaptureService.js'

export default function TransactionBuyerOnboardingPanel({ transactionId, organisationId = '', buyers = [], purchaserType = 'individual', canEdit = false, onSendLink, onUpdated }) {
  const [mode, setMode] = useState('choice')
  const [participantId, setParticipantId] = useState('')
  const [context, setContext] = useState(null)
  const [buyer, setBuyer] = useState({ name: '', email: '', phone: '' })
  const [profile, setProfile] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [review, setReview] = useState(false)
  const [profiles, setProfiles] = useState(null)
  const [selectedProfile, setSelectedProfile] = useState('')
  const pending = useRef(null)
  const generation = useRef(0)
  const inFlight = useRef(false)
  const dirty = Boolean(context && (JSON.stringify(buyer) !== JSON.stringify(context.buyer) || JSON.stringify(profile) !== JSON.stringify(context.profile)))
  useEffect(() => {
    generation.current += 1; inFlight.current = false; pending.current = null
    setMode('choice'); setContext(null); setParticipantId(''); setBusy(false); setError(''); setMessage(''); setReview(false); setProfiles(null); setSelectedProfile('')
    return () => { generation.current += 1 }
  }, [transactionId])
  useEffect(() => {
    if (!dirty) return undefined
    const preventUnload = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', preventUnload)
    return () => window.removeEventListener('beforeunload', preventUnload)
  }, [dirty])

  async function open(nextMode, selected = participantId) {
    if (inFlight.current) return
    const current = ++generation.current
    inFlight.current = true; setBusy(true); setError(''); setMessage(''); setReview(false); setMode(nextMode); setContext(null)
    try {
      const result = await loadTransactionBuyerCapture({ transactionId, participantId: selected || null })
      if (current !== generation.current) return
      setContext(result); setBuyer(result.buyer); setProfile(result.profile); pending.current = null
    } catch (loadError) { if (current === generation.current) setError(loadError.message) }
    finally { if (current === generation.current) { inFlight.current = false; setBusy(false) } }
  }
  async function save(event) {
    event.preventDefault()
    if (inFlight.current || !context) return
    const current = generation.current
    inFlight.current = true; setBusy(true); setError(''); setMessage('')
    try {
      let result = context
      if (dirty || !context.participantId || !context.buyerId || context.roster.find(item => item.id === context.participantId)?.buyer_party_id !== context.buyerId) {
        const signature = JSON.stringify({ context, buyer, profile })
        if (pending.current?.signature !== signature) pending.current = { signature, mutationId: crypto.randomUUID() }
        result = await saveTransactionBuyerCapture({ transactionId, context, buyer, profile: { ...profile, purchaser_type: profile.purchaser_type || purchaserType }, mutationId: pending.current.mutationId })
        if (current !== generation.current) return
        setContext(result); setBuyer(result.buyer); setProfile(result.profile); pending.current = null
      }
      if (mode === 'link') {
        if (!result.participantId || !result.buyer.email?.trim()) throw new Error('Save a buyer name and email before preparing their link.')
        setReview(true)
      } else setMessage('Buyer details saved. Onboarding has not been submitted.')
      window.dispatchEvent(new CustomEvent('deal-setup:updated', { detail: { transactionId } }))
      await onUpdated?.()
    } catch (saveError) { if (current === generation.current) setError(saveError.message) }
    finally { if (current === generation.current) { inFlight.current = false; setBusy(false) } }
  }
  async function showProfiles() {
    if (inFlight.current) return
    const current = generation.current
    inFlight.current = true; setBusy(true); setError('')
    try {
      const service = await import('../../services/buyerProfileReuseService.js')
      const rows = await service.listReusableBuyerProfiles({ organisationId })
      if (current === generation.current) setProfiles(rows)
    } catch (loadError) { if (current === generation.current) setError(loadError.message) }
    finally { if (current === generation.current) { inFlight.current = false; setBusy(false) } }
  }
  async function linkProfile() {
    if (!selectedProfile || !context || inFlight.current) return
    if (dirty && !window.confirm('Use the existing buyer profile and discard these unsaved entries?')) return
    const current = generation.current
    inFlight.current = true; setBusy(true); setError('')
    try {
      const service = await import('../../services/buyerProfileReuseService.js')
      await service.linkReusableBuyerProfileToTransaction({ transactionId, buyerId: selectedProfile, participantId: context.participantId || null, isPrimary: !context.roster.length || Boolean(context.roster.find(item => item.id === context.participantId)?.is_primary_buyer) })
      const latest = await loadTransactionBuyerCapture({ transactionId, participantId: context.participantId || null })
      if (current !== generation.current) return
      setContext(latest); setBuyer(latest.buyer); setProfile(latest.profile); setProfiles(null); pending.current = null
      await onUpdated?.()
    } catch (linkError) { if (current === generation.current) setError(linkError.message) }
    finally { if (current === generation.current) { inFlight.current = false; setBusy(false) } }
  }
  async function send() {
    if (inFlight.current || !context || !onSendLink) return
    const current = generation.current
    inFlight.current = true; setBusy(true); setError('')
    try {
      const latest = await loadTransactionBuyerCapture({ transactionId, participantId: context.participantId })
      if (current !== generation.current) return
      if (JSON.stringify(latest.revision) !== JSON.stringify(context.revision)) throw new Error('Buyer details changed. Reload and review the recipient before sending.')
      await onSendLink({ participantId: context.participantId, buyerPartyId: context.buyerId, name: context.buyer.name, email: context.buyer.email, ...(context.roster.find(item => item.id === context.participantId)?.buyer_onboarding_status === 'completed' ? { completed: true } : {}) })
      if (current !== generation.current) return
      setReview(false); setMode('choice'); setMessage(`Onboarding link sent to ${context.buyer.email}.`)
      await onUpdated?.()
    } catch (sendError) { if (current === generation.current) setError(sendError.message) }
    finally { if (current === generation.current) { inFlight.current = false; setBusy(false) } }
  }
  const entityType = profile.purchaser_type || context?.purchaserType || purchaserType
  const isEntity = ['company', 'trust'].includes(entityType)
  const selectedBuyer = buyers.find(item => item.id === participantId) || buyers.find(item => item.is_primary_buyer) || (buyers.length === 1 ? buyers[0] : null)
  return <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
    <div className="flex items-start gap-3"><span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-800"><UserRound size={21} aria-hidden="true" /></span><div><h3 className="text-section-title font-semibold text-textStrong">Buyer onboarding</h3><p className="mt-1 text-sm text-textMuted">Capture the details you have, or let the buyer complete them.</p></div></div>
    {buyers.length > 1 && mode === 'choice' ? <label className="mt-5 block text-sm font-medium text-textMuted">Buyer<select disabled={busy} value={participantId || selectedBuyer?.id || ''} onChange={event => setParticipantId(event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2"><option value="">Choose buyer…</option>{buyers.map(item => <option key={item.id} value={item.id}>{item.participant_name || item.participant_email || 'Buyer'}</option>)}</select></label> : null}
    {mode === 'choice' ? <>
      {selectedBuyer ? <div className="mt-5 rounded-xl bg-surfaceAlt px-4 py-3"><p className="font-semibold text-textStrong">{selectedBuyer.participant_name || 'Buyer'}</p><p className="mt-1 break-all text-sm text-textMuted">{[selectedBuyer.participant_email, selectedBuyer.participant_phone].filter(Boolean).join(' · ') || 'Contact details can be captured below.'}</p></div> : null}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">{[
        ['manual', PenLine, 'Capture manually', 'Record buyer details for a backfilled transaction.'],
        ['link', Mail, 'Send onboarding link', 'Ask the buyer to complete their details securely.'],
      ].map(([key, Icon, title, description]) => <button key={key} type="button" disabled={!canEdit || busy || (key === 'link' && !onSendLink)} onClick={() => void open(key, participantId || selectedBuyer?.id || '')} className="group flex items-start gap-3 rounded-xl border border-borderDefault bg-surface p-5 text-left transition hover:border-emerald-700 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"><span className="rounded-xl bg-surfaceAlt p-2.5 text-emerald-800 group-hover:bg-white"><Icon size={21} aria-hidden="true" /></span><span><span className="block font-semibold text-textStrong">{title}</span><span className="mt-1 block text-sm leading-5 text-textMuted">{description}</span></span></button>)}</div>
    </> : <div className="mt-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h4 className="font-semibold text-textStrong">{mode === 'manual' ? 'Capture buyer details' : review ? 'Confirm recipient' : 'Buyer contact details'}</h4><Button type="button" variant="secondary" disabled={busy} onClick={() => {
        if (dirty && !window.confirm('Discard unsaved buyer changes?')) return
        setMode('choice'); setContext(null); setReview(false); setError('')
      }}><ArrowLeft size={14} aria-hidden="true" /> Back</Button></div>
      {busy && !context ? <p role="status" className="py-4 text-sm text-textMuted">Loading saved buyer details…</p> : null}
      {context && !context.buyerId && !review && organisationId ? <div className="mb-4">
        {profiles === null ? <Button type="button" variant="secondary" disabled={busy} onClick={() => void showProfiles()}>Link an existing buyer profile</Button> : <div className="flex flex-wrap gap-2"><label className="min-w-0 flex-1 text-sm text-textMuted">Existing buyer<select disabled={busy} value={selectedProfile} onChange={event => setSelectedProfile(event.target.value)} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2"><option value="">Choose saved profile…</option>{profiles.map(item => <option key={item.id} value={item.id}>{item.name}{item.email ? ` · ${item.email}` : ''}</option>)}</select></label><Button type="button" disabled={!selectedProfile || busy} onClick={() => void linkProfile()}>Use selected profile</Button></div>}
      </div> : null}
      {context && !review ? <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {!isEntity ? <><label className="text-sm font-medium text-textMuted">Name<input required disabled={busy || !canEdit} value={profile.first_name ?? (profile.last_name ? '' : buyer.name) ?? ''} onChange={event => {
            const first = event.target.value; const last = profile.last_name || ''
            setProfile(previous => ({ ...previous, first_name: first })); setBuyer(previous => ({ ...previous, name: [first, last].filter(Boolean).join(' ') }))
          }} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" /></label><label className="text-sm font-medium text-textMuted">Surname<input disabled={busy || !canEdit} value={profile.last_name || ''} onChange={event => {
            const first = profile.first_name ?? buyer.name; const last = event.target.value
            setProfile(previous => ({ ...previous, first_name: first, last_name: last })); setBuyer(previous => ({ ...previous, name: [first, last].filter(Boolean).join(' ') }))
          }} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" /></label></> : null}
          {(isEntity ? ['name', 'email', 'phone'] : ['email', 'phone']).map(key => <label key={key} className="text-sm font-medium text-textMuted">{({ name: 'Full name / entity name', email: 'Email', phone: 'Phone' })[key]}<input required={key === 'name' || (mode === 'link' && key === 'email')} type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'} disabled={busy || !canEdit} value={buyer[key] || ''} onChange={event => { const value = event.target.value; setBuyer(previous => ({ ...previous, [key]: value })); if (isEntity) setProfile(previous => ({ ...previous, [`${entityType}_${key === 'name' ? 'name' : `contact_${key}`}`]: value })); setMessage('') }} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" /></label>)}
        </div>
        {mode === 'manual' ? <TransactionBuyerProfileFields value={profile} purchaserType={profile.purchaser_type || context.purchaserType || purchaserType} disabled={busy || !canEdit} onChange={next => {
          setProfile(next)
          if (isEntity) setBuyer(previous => ({ ...previous, ...Object.fromEntries(['name', 'email', 'phone'].map(key => [key, `${entityType}_${key === 'name' ? 'name' : `contact_${key}`}`]).filter(([, field]) => next[field] !== profile[field]).map(([key, field]) => [key, next[field] || ''])) }))
        }} /> : <p className="text-sm text-textMuted">Review the recipient before sending. Saved buyer details will appear in their form.</p>}
        <div className="flex justify-end"><Button type="submit" disabled={busy || !canEdit || !buyer.name?.trim()}>{busy ? 'Saving…' : mode === 'link' ? 'Review onboarding link' : 'Save buyer details'}</Button></div>
      </form> : null}
      {context && review ? <div className="rounded-xl border border-borderSoft bg-surfaceAlt p-5"><p className="font-semibold text-textStrong">{context.buyer.name}</p><p className="mt-1 break-all text-sm text-textMuted">{context.buyer.email}</p><div className="mt-5 flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={() => void send()}><Mail size={15} aria-hidden="true" />{busy ? 'Sending…' : 'Send link'}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setReview(false)}>Edit recipient</Button></div></div> : null}
    </div>}
    {error ? <div className="mt-4 space-y-3"><p role="alert" className="rounded-control bg-dangerSoft px-3 py-2 text-sm text-danger">{error}</p>{mode !== 'choice' ? <Button type="button" variant="secondary" disabled={busy} onClick={() => {
      if (dirty && !window.confirm('Discard your entries and load the latest buyer details?')) return
      void open(mode, context?.participantId || participantId || selectedBuyer?.id || '')
    }}>Reload saved details</Button> : null}</div> : null}
    {message ? <p role="status" className="mt-4 flex items-center gap-2 text-sm text-success"><Check size={16} aria-hidden="true" />{message}</p> : null}
  </section>
}
