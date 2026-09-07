import { useEffect, useMemo, useState } from 'react'
import Button from '../ui/Button'
import {
  linkReusableBuyerProfileToTransaction,
  listTransactionBuyerPartyHistory,
  listReusableBuyerProfiles,
  listTransactionBuyerParties,
  updateTransactionBuyerParty,
  removeTransactionBuyerParty,
} from '../../services/buyerProfileReuseService'
import { buildBuyerPartyReadiness } from '../../core/transactions/buyerPartyReadiness'
import { buildBuyerPartyActionQueue } from '../../core/transactions/buyerPartyActionQueue'

const roleLabel = (party = {}) => party?.buyer_metadata?.partyRole || (party.is_primary_buyer ? 'primary purchaser' : 'co-purchaser')

export default function TransactionBuyerPartiesPanel({ transactionId, organisationId = '', canEdit = false }) {
  const [parties, setParties] = useState([])
  const [profiles, setProfiles] = useState([])
  const [selectedProfile, setSelectedProfile] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])
  const readiness = useMemo(() => buildBuyerPartyReadiness(parties), [parties])
  const actionQueue = useMemo(() => buildBuyerPartyActionQueue(parties), [parties])

  const refresh = async () => {
    const rows = await listTransactionBuyerParties({ transactionId })
    setParties(rows)
  }

  useEffect(() => {
    if (!transactionId) return
    let active = true
    Promise.all([
      listTransactionBuyerParties({ transactionId }),
      listReusableBuyerProfiles({ organisationId: organisationId || null }),
    ]).then(([rows, buyerProfiles]) => {
      if (!active) return
      setParties(rows)
      setProfiles(buyerProfiles)
      return listTransactionBuyerPartyHistory({ transactionId })
    }).then((events) => {
      if (events && active) setHistory(events)
    }).catch((loadError) => active && setError(loadError.message || 'Buyer parties could not be loaded.'))
    return () => { active = false }
  }, [organisationId, transactionId])

  async function save(party, patch) {
    setBusy(true); setError('')
    try {
      await updateTransactionBuyerParty({
        transactionId,
        participantId: party.id,
        ownershipPercentage: patch.ownership_percentage ?? party.ownership_percentage,
        signingRequired: patch.signing_required ?? party.signing_required,
        partyRole: patch.partyRole ?? roleLabel(party),
      })
      await refresh()
      setHistory(await listTransactionBuyerPartyHistory({ transactionId }))
    } catch (saveError) { setError(saveError.message || 'Buyer party could not be saved.') } finally { setBusy(false) }
  }

  async function addProfile() {
    if (!selectedProfile) return
    setBusy(true); setError('')
    try {
      await linkReusableBuyerProfileToTransaction({ transactionId, buyerId: selectedProfile })
      setSelectedProfile('')
      await refresh()
      setHistory(await listTransactionBuyerPartyHistory({ transactionId }))
    } catch (saveError) { setError(saveError.message || 'Buyer profile could not be linked.') } finally { setBusy(false) }
  }

  async function remove(party) {
    if (!window.confirm(`Remove ${party.participant_name || 'this buyer'} from this transaction? Their profile and documents will be retained.`)) return
    setBusy(true); setError('')
    try { await removeTransactionBuyerParty({ transactionId, participantId: party.id }); await refresh(); setHistory(await listTransactionBuyerPartyHistory({ transactionId })) }
    catch (removeError) { setError(removeError.message || 'Buyer party could not be removed.') } finally { setBusy(false) }
  }

  return <section className="rounded-[16px] border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-950">Buyer parties</h3><p className="mt-1 text-xs text-slate-500">Each purchaser retains their own role, signing requirement, and reused-profile record.</p></div></div>
    {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
    <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${readiness.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
      <strong>{readiness.ready ? 'Buyer-party ready' : 'Buyer-party follow-up required'}</strong>
      <span className="ml-2">{readiness.ready ? `${readiness.activeBuyerCount} buyer party${readiness.activeBuyerCount === 1 ? '' : 'ies'} ready for the next step.` : readiness.issues.join(' ')}</span>
    </div>
    <div className="mt-3 grid gap-3">
      {parties.map((party) => <article key={party.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-slate-900">{party.participant_name || 'Buyer'}</strong><span className="rounded-full bg-emerald-50 px-2 py-1 text-[0.65rem] font-semibold text-emerald-700">{roleLabel(party)}</span></div>
        <p className="mt-1 text-xs text-slate-500">{party.participant_email || party.participant_phone || 'Contact details pending'} · {party.buyer_onboarding_status || 'not started'}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="text-xs font-medium text-slate-600">Role<input disabled={!canEdit || busy} defaultValue={roleLabel(party)} onBlur={(event) => save(party, { partyRole: event.target.value })} className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1.5" /></label>
          <label className="text-xs font-medium text-slate-600">Ownership %<input disabled={!canEdit || busy} type="number" min="0" max="100" step="0.01" defaultValue={party.ownership_percentage ?? ''} onBlur={(event) => save(party, { ownership_percentage: event.target.value })} className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1.5" /></label>
          <label className="mt-6 flex items-center gap-2 text-xs font-medium text-slate-600"><input disabled={!canEdit || busy} type="checkbox" defaultChecked={party.signing_required !== false} onChange={(event) => save(party, { signing_required: event.target.checked })} />Requires signature</label>
        </div>
        {canEdit && !party.is_primary_buyer ? <div className="mt-3"><Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => remove(party)}>Remove from transaction</Button></div> : null}
      </article>)}
    </div>
    {actionQueue.outstandingCount ? <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3"><h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Buyer follow-up queue · {actionQueue.outstandingCount}</h4><div className="mt-2 space-y-2">{actionQueue.actions.map((action) => <div key={action.key} className="text-xs text-slate-600"><strong className="text-slate-800">{action.title}</strong><span className="ml-2">{action.detail}</span></div>)}</div></div> : null}
    {canEdit ? <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3"><select value={selectedProfile} onChange={(event) => setSelectedProfile(event.target.value)} className="min-w-[15rem] rounded border border-slate-200 bg-white px-2 py-2 text-sm"><option value="">Link an existing buyer profile…</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.email ? ` — ${profile.email}` : ''}</option>)}</select><Button type="button" size="sm" disabled={!selectedProfile || busy} onClick={addProfile}>Add buyer</Button></div> : null}
    {history.length ? <div className="mt-4 border-t border-slate-100 pt-3"><h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent buyer-party changes</h4><div className="mt-2 space-y-1 text-xs text-slate-500">{history.slice(0, 5).map((event) => <p key={event.id}>{event.event_type.replace(/([A-Z])/g, ' $1').trim()} · {new Date(event.created_at).toLocaleString()}</p>)}</div></div> : null}
  </section>
}
