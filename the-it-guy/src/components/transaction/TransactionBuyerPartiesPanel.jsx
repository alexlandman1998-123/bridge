import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../ui/Button'
import {
  createReusableBuyerProfile,
  linkReusableBuyerProfileToTransaction,
  listReusableBuyerProfiles,
  listTransactionBuyerParties,
  removeTransactionBuyerParty,
  setTransactionPrimaryBuyerParty,
  updateTransactionBuyerParty,
} from '../../services/buyerProfileReuseService'

const displayName = (party = {}) => party.participant_name || party.participant_email || 'Client / Buyer'
const BUYER_PROFILE_FIELDS = {
  individual: [
    ['identity_number', 'ID / passport number'],
    ['tax_number', 'Income tax number'],
    ['physical_address', 'Physical address'],
  ],
  married_coc: [
    ['identity_number', 'Primary buyer ID / passport number'],
    ['tax_number', 'Primary buyer income tax number'],
    ['spouse_full_name', 'Spouse full name'],
    ['spouse_identity_number', 'Spouse ID / passport number'],
    ['marital_regime', 'Marriage regime'],
  ],
  company: [
    ['company_registration_number', 'Company / CC registration number'],
    ['tax_number', 'Income tax number'],
    ['vat_number', 'VAT number'],
    ['authorised_signatory_name', 'Authorised signatory name'],
    ['authorised_signatory_identity_number', 'Authorised signatory ID / passport number'],
  ],
  trust: [
    ['master_reference_number', 'Master’s Office reference number'],
    ['tax_number', 'Trust income tax number'],
    ['primary_trustee_name', 'Primary trustee name'],
    ['primary_trustee_identity_number', 'Primary trustee ID / passport number'],
  ],
}
const BUYER_TYPE_LABELS = { individual: 'Individual', married_coc: 'Married purchaser', company: 'Company / CC', trust: 'Trust' }
const buyerStatus = (party = {}) => {
  if (party.buyer_profile_status === 'completed' || party.buyer_onboarding_status === 'completed') return 'Profile ready'
  if (party.buyer_onboarding_status === 'in_progress') return 'Onboarding in progress'
  return 'Profile still needed'
}

export default function TransactionBuyerPartiesPanel({ transactionId, organisationId = '', purchaserType = 'individual', canEdit = false, onUpdated }) {
  const navigate = useNavigate()
  const [parties, setParties] = useState([])
  const [profiles, setProfiles] = useState([])
  const [selectedProfile, setSelectedProfile] = useState('')
  const [showCreateBuyer, setShowCreateBuyer] = useState(false)
  const [newBuyer, setNewBuyer] = useState({ name: '', email: '', phone: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const primaryBuyer = useMemo(() => parties.find((party) => party.is_primary_buyer) || null, [parties])
  const normalizedPurchaserType = BUYER_PROFILE_FIELDS[purchaserType] ? purchaserType : 'individual'
  const profileFields = BUYER_PROFILE_FIELDS[normalizedPurchaserType]

  async function refresh() {
    const rows = await listTransactionBuyerParties({ transactionId })
    setParties(rows)
    await onUpdated?.()
  }

  useEffect(() => {
    if (!transactionId) return undefined
    let active = true
    Promise.all([
      listTransactionBuyerParties({ transactionId }),
      listReusableBuyerProfiles({ organisationId: organisationId || null }),
    ]).then(([rows, buyerProfiles]) => {
      if (!active) return
      setParties(rows)
      setProfiles(buyerProfiles)
    }).catch((loadError) => active && setError(loadError.message || 'Buyers could not be loaded.'))
    return () => { active = false }
  }, [organisationId, transactionId])

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
        ...Object.fromEntries(profileFields.map(([key]) => [key, String(newBuyer[key] || '').trim()]).filter(([, value]) => value)),
      }
      const result = await createReusableBuyerProfile({ ...newBuyer, organisationId, profileData })
      await linkReusableBuyerProfileToTransaction({ transactionId, buyerId: result.buyer.id, isPrimary: !primaryBuyer })
      const emptyPlaceholder = parties.find((party) =>
        !party.buyer_party_id &&
        displayName(party) === 'Client / Buyer' &&
        !party.participant_email &&
        !party.participant_phone,
      )
      if (emptyPlaceholder) await removeTransactionBuyerParty({ transactionId, participantId: emptyPlaceholder.id })
      setNewBuyer({ name: '', email: '', phone: '' })
      setShowCreateBuyer(false)
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
      <div><p className="text-xs font-semibold uppercase tracking-wide text-textMuted">Step 2</p><h3 className="mt-1 text-section-title font-semibold text-textStrong">Buyers</h3><p className="mt-1 text-secondary text-textMuted">Choose who is buying, then nominate one primary contact.</p></div>
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${primaryBuyer ? 'bg-successSoft text-success' : 'bg-warningSoft text-warning'}`}>{primaryBuyer ? `Primary: ${displayName(primaryBuyer)}` : 'Primary buyer needed'}</span>
    </div>
    {error ? <p className="mt-4 rounded-control bg-dangerSoft px-3 py-2 text-sm text-danger">{error}</p> : null}
    <div className="mt-4 space-y-3">
      {parties.map((party) => <article key={party.id} className="rounded-control border border-borderSoft bg-surfaceAlt p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h4 className="font-semibold text-textStrong">{displayName(party)}</h4><p className="mt-1 text-sm text-textMuted">{party.participant_email || party.participant_phone || 'Contact details still needed'}</p><p className="mt-2 text-xs text-textMuted">{buyerStatus(party)}{party.signing_required === false ? ' · Signature not required' : ' · Signature required'}</p></div>
          <div className="flex flex-wrap gap-2">
            {party.is_primary_buyer ? <span className="rounded-full bg-successSoft px-3 py-1.5 text-xs font-semibold text-success">Primary buyer</span> : canEdit ? <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => assignPrimary(party)}>Make primary</Button> : null}
            {party.buyer_party_id ? <Button type="button" size="sm" variant="secondary" onClick={() => navigate(`/buyers/${party.buyer_party_id}`)}>Edit profile</Button> : null}
            {canEdit && !party.is_primary_buyer ? <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => remove(party)}>Remove</Button> : null}
          </div>
        </div>
        {canEdit ? <details className="mt-3 border-t border-borderSoft pt-3"><summary className="cursor-pointer text-sm font-medium text-textMuted">Buyer options</summary><label className="mt-3 flex items-center gap-2 text-sm text-textMuted"><input disabled={busy} type="checkbox" checked={party.signing_required !== false} onChange={(event) => updateSigning(party, event.target.checked)} />This buyer must sign</label></details> : null}
      </article>)}
      {!parties.length ? <p className="rounded-control bg-surfaceAlt px-4 py-3 text-sm text-textMuted">Add a buyer profile to begin.</p> : null}
    </div>
    {canEdit ? <div className="mt-5 border-t border-borderSoft pt-4"><div className="flex flex-wrap gap-2"><select value={selectedProfile} onChange={(event) => setSelectedProfile(event.target.value)} className="min-w-[16rem] flex-1 rounded-control border border-borderDefault bg-surface px-3 py-2 text-sm"><option value="">Add an existing buyer profile…</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.email ? ` — ${profile.email}` : ''}</option>)}</select><Button type="button" disabled={!selectedProfile || busy} onClick={addProfile}>{primaryBuyer ? 'Add buyer' : 'Add as primary buyer'}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setShowCreateBuyer((current) => !current)}>{showCreateBuyer ? 'Cancel' : 'Create new buyer'}</Button></div>{showCreateBuyer ? <div className="mt-4 rounded-control border border-borderSoft bg-surfaceAlt p-4"><div><h4 className="font-semibold text-textStrong">Create reusable buyer profile</h4><p className="mt-1 text-sm text-textMuted">{BUYER_TYPE_LABELS[normalizedPurchaserType]} details are saved once and reused on future transactions. Fields can be completed later, but identity and tax details are needed before FICA is complete.</p></div><div className="mt-4 grid gap-3 md:grid-cols-3"><label className="text-sm font-medium text-textMuted">{normalizedPurchaserType === 'company' ? 'Registered company / CC name' : normalizedPurchaserType === 'trust' ? 'Trust name' : 'Full name'}<input autoComplete="name" disabled={busy} value={newBuyer.name} onChange={(event) => setNewBuyer((current) => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" placeholder="Required" /></label><label className="text-sm font-medium text-textMuted">Email<input autoComplete="email" disabled={busy} type="email" value={newBuyer.email} onChange={(event) => setNewBuyer((current) => ({ ...current, email: event.target.value }))} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" placeholder="Optional" /></label><label className="text-sm font-medium text-textMuted">Mobile number<input autoComplete="tel" disabled={busy} type="tel" value={newBuyer.phone} onChange={(event) => setNewBuyer((current) => ({ ...current, phone: event.target.value }))} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" placeholder="Optional" /></label>{profileFields.map(([key, label]) => <label key={key} className="text-sm font-medium text-textMuted">{label}<input disabled={busy} value={newBuyer[key] || ''} onChange={(event) => setNewBuyer((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 w-full rounded-control border border-borderDefault bg-surface p-2" placeholder="Capture now or complete later" /></label>)}</div><div className="mt-4 flex justify-end"><Button type="button" disabled={!newBuyer.name.trim() || busy} onClick={createAndAddBuyer}>{busy ? 'Creating…' : primaryBuyer ? 'Create and add buyer' : 'Create as primary buyer'}</Button></div></div> : null}</div> : null}
  </section>
}
