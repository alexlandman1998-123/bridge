import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../ui/Button'
import { buyerCaptureDetails } from '../../core/transactions/buyerCaptureDetails.js'
import TransactionBuyerProfileFields from './TransactionBuyerProfileFields.jsx'
import { PURCHASER_TYPE_LABELS } from '../../lib/purchaserPersonas.js'
import { Mail, Phone, UserRound, PenLine, Plus } from 'lucide-react'
import {
  createReusableBuyerProfile,
  linkReusableBuyerProfileToTransaction,
  listReusableBuyerProfiles,
  listTransactionBuyerParties,
  removeTransactionBuyerParty,
  setTransactionPrimaryBuyerParty,
  updateTransactionBuyerParty,
  getReusableBuyerProfile,
  saveReusableBuyerProfile,
  saveBuyerProfileIdentity,
  listReusableBuyerProfileTransactionIds,
} from '../../services/buyerProfileReuseService'
import { syncDealSetupDownstream } from '../../services/dealSetupService'
import { getPrimaryDealSetupBuyer } from '../../core/transactions/dealSetupContract.js'

const displayName = (party = {}) => party.participant_name || party.participant_email || 'Client / Buyer'
const buyerStatus = (party = {}) => {
  if (party.buyer_profile_status === 'completed' || party.buyer_onboarding_status === 'completed') return 'Profile ready'
  if (party.buyer_onboarding_status === 'in_progress') return 'Onboarding in progress'
  return 'Profile still needed'
}

export default function TransactionBuyerPartiesPanel({ transactionId, organisationId = '', purchaserType = 'individual', canEdit = false, embedded = false, onboardingDetails = {}, onboardingBuyerId = '', primaryParticipantId = '', onUpdated }) {
  const navigate = useNavigate()
  const [parties, setParties] = useState([])
  const [profiles, setProfiles] = useState([])
  const [selectedProfile, setSelectedProfile] = useState('')
  const [showCreateBuyer, setShowCreateBuyer] = useState(false)
  const [newBuyer, setNewBuyer] = useState({ name: '', email: '', phone: '' })
  const [captureParty, setCaptureParty] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadKey, setLoadKey] = useState(0)
  const [pendingProfile, setPendingProfile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editingProfile, setEditingProfile] = useState(null)
  const [profileNotice, setProfileNotice] = useState('')
  const primaryBuyer = useMemo(() => getPrimaryDealSetupBuyer(parties), [parties])
  const normalizedPurchaserType = PURCHASER_TYPE_LABELS[purchaserType] ? purchaserType : 'individual'

  const onboardingByParty = useMemo(() => new Map(parties.map(party => [party.id, buyerCaptureDetails(party, { formData: onboardingDetails, buyerId: onboardingBuyerId, primaryParticipantId, purchaserType })])), [parties, onboardingDetails, onboardingBuyerId, primaryParticipantId, purchaserType])
  const onboardingFor = party => onboardingByParty.get(party?.id) || {}

  async function editProfile(buyerId, party) {
    if (!embedded) { navigate(`/buyers/${buyerId}`); return }
    setBusy(true); setError(''); setProfileNotice('')
    try {
      const result = await getReusableBuyerProfile({ buyerId })
      setEditingProfile({ buyer: result.buyer, data: { ...onboardingFor(party), ...(result.profile?.profile_data || {}) } })
    } catch (error) { setError(error.message || 'Could not open party details.') }
    finally { setBusy(false) }
  }

  async function saveProfile(event) {
    event.preventDefault()
    if (busy || !editingProfile) return
    setBusy(true); setError('')
    try {
      const { buyer, data } = editingProfile
      await saveBuyerProfileIdentity({ buyerId: buyer.id, name: buyer.name, email: buyer.email, phone: buyer.phone })
      await saveReusableBuyerProfile({ buyerId: buyer.id, profileData: data })
      setProfileNotice('Buyer details saved.')
      setEditingProfile(null)
      const ids = await listReusableBuyerProfileTransactionIds({ buyerId: buyer.id })
      await Promise.all(ids.map(transactionId => syncDealSetupDownstream({ transactionId })))
      window.dispatchEvent(new CustomEvent('buyer-profile:updated', { detail: { buyerId: buyer.id } }))
      await refresh({ syncDownstream: false })
    } catch (error) { setError(error.message || 'Could not save or refresh party details.') }
    finally { setBusy(false) }
  }

  async function refresh({ syncDownstream = true } = {}) {
    if (syncDownstream) await syncDealSetupDownstream({ transactionId })
    const rows = await listTransactionBuyerParties({ transactionId })
    setParties(rows)
    if (syncDownstream) window.dispatchEvent(new CustomEvent('deal-setup:updated', { detail: { transactionId } }))
    await onUpdated?.()
  }

  useEffect(() => {
    if (!transactionId) return undefined
    let active = true
    setLoading(true); setLoadFailed(false); setError(''); setParties([]); setEditingProfile(null); setShowCreateBuyer(false); setPendingProfile(null)
    Promise.all([
      listTransactionBuyerParties({ transactionId }),
      listReusableBuyerProfiles({ organisationId: organisationId || null }),
    ]).then(([rows, buyerProfiles]) => {
      if (!active) return
      setParties(rows)
      setProfiles(buyerProfiles)
      setLoading(false)
    }).catch((loadError) => { if (active) { setError(loadError.message || 'Buyers could not be loaded.'); setLoadFailed(true); setLoading(false) } })
    return () => { active = false }
  }, [organisationId, transactionId, loadKey])

  async function assignPrimary(party) {
    setBusy(true); setError('')
    try { await setTransactionPrimaryBuyerParty({ transactionId, participantId: party.id }); await refresh() }
    catch (saveError) { setError(saveError.message || 'Primary buyer could not be assigned.') } finally { setBusy(false) }
  }

  async function addProfile() {
    if (!selectedProfile) return
    setBusy(true); setError('')
    try { await linkReusableBuyerProfileToTransaction({ transactionId, buyerId: selectedProfile, isPrimary: !primaryBuyer }); setSelectedProfile(''); await refresh() }
    catch (saveError) { setError(saveError.message || 'Buyer profile could not be linked.') } finally { setBusy(false) }
  }

  async function createAndAddBuyer() {
    setBusy(true); setError('')
    try {
      const profileData = {
        purchaser_type: normalizedPurchaserType,
        ...(newBuyer.profileData || {}),
      }
      const result = pendingProfile || await createReusableBuyerProfile({ ...newBuyer, organisationId, profileData })
      setPendingProfile(result)
      if (!pendingProfile && result.created === false) {
        setProfileNotice('An existing buyer profile matches this email or phone. Link that saved profile, then edit its details if needed. The entries in this capture have not replaced its saved information.')
        return
      }
      await linkReusableBuyerProfileToTransaction({ transactionId, buyerId: result.buyer.id, isPrimary: captureParty ? Boolean(captureParty.is_primary_buyer) : !primaryBuyer, participantId: captureParty?.id })
      const emptyPlaceholder = parties.find((party) =>
        !party.buyer_party_id &&
        displayName(party) === 'Client / Buyer' &&
        !party.participant_email &&
        !party.participant_phone,
      )
      if (emptyPlaceholder && emptyPlaceholder.id !== captureParty?.id) await removeTransactionBuyerParty({ transactionId, participantId: emptyPlaceholder.id })
      setNewBuyer({ name: '', email: '', phone: '' })
      setShowCreateBuyer(false)
      setCaptureParty(null)
      setPendingProfile(null)
      await refresh()
    } catch (saveError) { setError(saveError.message || 'Buyer profile could not be created.') } finally { setBusy(false) }
  }

  async function remove(party) {
    if (!window.confirm(`Remove ${displayName(party)} from this transaction? Their reusable profile and documents will be retained.`)) return
    setBusy(true); setError('')
    try { await removeTransactionBuyerParty({ transactionId, participantId: party.id }); await refresh() }
    catch (removeError) { setError(removeError.message || 'Buyer could not be removed.') } finally { setBusy(false) }
  }

  async function updateSigning(party, signingRequired) {
    setBusy(true); setError('')
    try {
      await updateTransactionBuyerParty({ transactionId, participantId: party.id, ownershipPercentage: party.ownership_percentage, signingRequired, partyRole: party.is_primary_buyer ? 'primary purchaser' : 'co-purchaser' })
      await refresh()
    } catch (saveError) { setError(saveError.message || 'Buyer signing requirement could not be updated.') } finally { setBusy(false) }
  }

  return <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-section-title font-semibold text-textStrong">Buyer details</h3><p className="mt-1 text-secondary text-textMuted">Saved buyer information and manual capture for this transaction.</p></div>
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${primaryBuyer ? 'bg-successSoft text-success' : 'bg-warningSoft text-warning'}`}>{primaryBuyer ? `Primary: ${displayName(primaryBuyer)}` : 'Primary buyer needed'}</span>
    </div>
    {error ? <p role="alert" className="mt-4 rounded-control bg-dangerSoft px-3 py-2 text-sm text-danger">{error}</p> : null}
    {loadFailed ? <Button type="button" variant="secondary" onClick={() => setLoadKey(value => value + 1)}>Retry loading buyers</Button> : null}
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      {loading ? <p role="status" className="text-sm text-textMuted">Loading buyer details…</p> : null}
      {parties.map((party) => <article key={party.id} className="min-w-0 rounded-control border border-borderSoft bg-surfaceAlt p-4 lg:only:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3"><span className="rounded-xl bg-white p-2.5 text-emerald-700"><UserRound size={20} aria-hidden="true" /></span><div className="min-w-0"><h4 className="break-words font-semibold text-textStrong">{displayName(party)}</h4><p className="mt-1 text-xs text-textMuted">{Object.keys(onboardingFor(party)).length ? 'Onboarding details available' : buyerStatus(party)}</p></div></div>
          <div className="flex flex-wrap gap-2">
            {party.is_primary_buyer && primaryBuyer ? <span className="rounded-full bg-successSoft px-3 py-1.5 text-xs font-semibold text-success">Primary buyer</span> : canEdit ? <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => assignPrimary(party)}>Make primary</Button> : null}
            {party.buyer_party_id && canEdit ? <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => editProfile(party.buyer_party_id, party)}><PenLine size={14} aria-hidden="true" /> Edit details</Button> : null}
            {!party.buyer_party_id && canEdit ? <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => { setPendingProfile(null); setCaptureParty(party); setNewBuyer({ name: displayName(party) === 'Client / Buyer' ? '' : displayName(party), email: party.participant_email || '', phone: party.participant_phone || '', profileData: onboardingFor(party) }); setShowCreateBuyer(true) }}>Capture details</Button> : null}
            {canEdit && !party.is_primary_buyer ? <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => remove(party)}>Remove</Button> : null}
          </div>
        </div>
        <dl className="mt-4 grid gap-3 border-t border-borderSoft pt-4 sm:grid-cols-2">
          <div className="min-w-0"><dt className="flex items-center gap-1.5 text-xs text-textMuted"><Mail size={13} aria-hidden="true" /> Email</dt><dd className="mt-1 break-all text-sm text-textStrong">{party.participant_email || 'Not captured'}</dd></div>
          <div><dt className="flex items-center gap-1.5 text-xs text-textMuted"><Phone size={13} aria-hidden="true" /> Phone</dt><dd className="mt-1 text-sm text-textStrong">{party.participant_phone || 'Not captured'}</dd></div>
        </dl>
        {Object.keys(onboardingFor(party)).length ? <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">{[['identity_number', 'ID / passport'], ['residential_address', 'Residential address'], ['tax_number', 'Tax number']].filter(([key]) => onboardingFor(party)[key]).map(([key, label]) => <div key={key}><dt className="text-xs text-textMuted">{label}</dt><dd className="mt-1 break-words text-textStrong">{String(onboardingFor(party)[key])}</dd></div>)}</dl> : null}
        {!party.buyer_party_id ? <p className="mt-3 text-xs text-textMuted">No linked buyer profile. Use manual capture to complete a backfilled transaction.</p> : null}
        {canEdit ? <details className="mt-3 border-t border-borderSoft pt-3"><summary className="cursor-pointer text-sm font-medium text-textMuted">Buyer options</summary><label className="mt-3 flex items-center gap-2 text-sm text-textMuted"><input disabled={busy} type="checkbox" checked={party.signing_required !== false} onChange={(event) => updateSigning(party, event.target.checked)} />This buyer must sign</label></details> : null}
      </article>)}
      {!loading && !error && !parties.length ? <div className="rounded-control bg-surfaceAlt px-4 py-4 text-sm text-textMuted lg:col-span-2"><p className="font-semibold text-textStrong">No buyer details saved</p><p className="mt-1">Capture the buyer manually for a backfilled transaction, or link their existing profile.</p></div> : null}
    </div>
    {canEdit && !loading && !loadFailed ? <div className="mt-5 border-t border-borderSoft pt-4"><div className="flex flex-wrap gap-2"><select value={selectedProfile} onChange={(event) => setSelectedProfile(event.target.value)} className="min-w-[16rem] flex-1 rounded-control border border-borderDefault bg-surface px-3 py-2 text-sm"><option value="">Add an existing buyer profile…</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.email ? ` — ${profile.email}` : ''}</option>)}</select><Button type="button" disabled={!selectedProfile || busy} onClick={addProfile}>{primaryBuyer ? 'Add buyer' : 'Add as primary buyer'}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => { setPendingProfile(null); setCaptureParty(null); setNewBuyer({ name: '', email: '', phone: '' }); setShowCreateBuyer((current) => !current) }}>{showCreateBuyer ? 'Cancel capture' : <><Plus size={15} aria-hidden="true" /> Capture buyer manually</>}</Button></div>{showCreateBuyer ? <div className="mt-4 rounded-control border border-borderSoft bg-surfaceAlt p-4"><div><h4 className="font-semibold text-textStrong">{captureParty ? 'Capture buyer details' : 'Capture a buyer'}</h4><p className="mt-1 text-sm text-textMuted">{PURCHASER_TYPE_LABELS[normalizedPurchaserType]} details can be saved with only the information you have. This saves a buyer profile without sending onboarding or creating a lead.</p></div><div className="mt-4 grid gap-3 md:grid-cols-3"><label className="text-sm font-medium text-textMuted">{normalizedPurchaserType === 'company' ? 'Registered company / CC name' : normalizedPurchaserType === 'trust' ? 'Trust name' : 'Full name'}<input autoComplete="name" disabled={busy || Boolean(pendingProfile)} value={newBuyer.name} onChange={(event) => setNewBuyer((current) => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" placeholder="Required" /></label><label className="text-sm font-medium text-textMuted">Email<input autoComplete="email" disabled={busy || Boolean(pendingProfile)} type="email" value={newBuyer.email} onChange={(event) => setNewBuyer((current) => ({ ...current, email: event.target.value }))} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" placeholder="Optional" /></label><label className="text-sm font-medium text-textMuted">Mobile number<input autoComplete="tel" disabled={busy || Boolean(pendingProfile)} type="tel" value={newBuyer.phone} onChange={(event) => setNewBuyer((current) => ({ ...current, phone: event.target.value }))} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" placeholder="Optional" /></label></div><div className="mt-4"><TransactionBuyerProfileFields value={newBuyer.profileData || {}} purchaserType={normalizedPurchaserType} disabled={busy || Boolean(pendingProfile)} onChange={profileData => setNewBuyer(current => ({ ...current, profileData }))} /></div><div className="mt-4 flex justify-end"><Button type="button" disabled={!newBuyer.name.trim() || busy} onClick={createAndAddBuyer}>{busy ? 'Saving…' : pendingProfile ? pendingProfile.created === false ? 'Link existing buyer profile' : 'Retry linking saved buyer' : captureParty ? 'Save buyer details' : primaryBuyer ? 'Create and add buyer' : 'Create as primary buyer'}</Button></div></div> : null}</div> : null}
    {profileNotice ? <p role="status" className="text-sm text-emerald-800">{profileNotice}</p> : null}
    {editingProfile && canEdit ? <form onSubmit={saveProfile} className="mt-5 space-y-4 rounded-xl border border-slate-200 bg-surfaceAlt p-5">
      <h4 className="font-semibold">Edit buyer details</h4>
      <p className="text-sm text-slate-600">Changes apply to this buyer’s shared profile and linked matters.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {['name', 'email', 'phone'].map(key => <label key={key} className="grid gap-1 text-sm capitalize">{key}<input className="ui-input" disabled={busy} type={key === 'email' ? 'email' : 'text'} value={editingProfile.buyer[key] || ''} onChange={event => setEditingProfile(previous => ({ ...previous, buyer: { ...previous.buyer, [key]: event.target.value } }))} /></label>)}

      </div>
      <TransactionBuyerProfileFields value={editingProfile.data} purchaserType={editingProfile.data.purchaser_type || normalizedPurchaserType} disabled={busy} onChange={data => setEditingProfile(previous => ({ ...previous, data }))} />
      <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setEditingProfile(null)}>Cancel</Button></div>
    </form> : null}
  </section>
}
