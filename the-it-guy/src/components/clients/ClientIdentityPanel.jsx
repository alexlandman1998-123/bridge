import { ArrowUpRight, Building2, Mail, Pencil, Phone, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { findClientDuplicateCandidates } from '../../core/clients/clientIdentity'
import { loadClientMergeHistory, mergeClientIdentities, saveClientIdentity } from '../../services/clientIdentityService'

const lines = (value) => String(value || '').split(/[\n,;]/).map((item) => item.trim()).filter(Boolean)
const primaryFirst = (primary, values = []) => [...new Set([primary, ...values].filter(Boolean))].join('\n')

function ClientSummary({ client, label }) {
  return <section className="rounded-xl border border-[#d7e3ef] bg-[#fbfdff] p-3">
    <p className="text-xs font-semibold text-[#637890]">{label}</p>
    <p className="mt-1 font-semibold text-[#17334f]">{client.name}</p>
    <p className="mt-2 break-all text-sm">{(client.emails || [client.email]).filter(Boolean).join(', ') || 'No email'}</p>
    <p className="mt-1 text-sm">{(client.phones || [client.phone]).filter(Boolean).join(', ') || 'No phone'}</p>
    <p className="mt-2 text-xs text-[#637890]">{client.linkedLeadIds?.length || 0} enquiries · {client.linkedTransactionIds?.length || 0} transactions</p>
  </section>
}

export default function ClientIdentityPanel({ client, clients = [], onChanged }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', emails: '', phones: '' })
  const [search, setSearch] = useState('')
  const [secondaryId, setSecondaryId] = useState('')
  const [keepSecondary, setKeepSecondary] = useState(false)
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [history, setHistory] = useState([])
  const [historyError, setHistoryError] = useState('')

  useEffect(() => {
    setForm({ name: client.name || '', emails: primaryFirst(client.email, client.emails), phones: primaryFirst(client.phone, client.phones) })
    setEditing(false)
    setSecondaryId('')
    setReason('')
    setConfirmed(false)
    setSearch('')
    setError('')
  }, [client.id, client.identityVersion, client.name, client.email, client.phone, client.emails, client.phones])

  useEffect(() => {
    let current = true
    setHistory([])
    setHistoryError('')
    if (client.canManageIdentity) {
      loadClientMergeHistory(client).then((items) => { if (current) setHistory(items) })
        .catch((cause) => { if (current) setHistoryError(cause.message || 'Unable to load merge history.') })
    }
    return () => { current = false }
  }, [client])

  const suggestions = useMemo(() => findClientDuplicateCandidates(client, clients), [client, clients])
  const matches = useMemo(() => clients.filter((other) => other.id !== client.id && other.identityId && other.organisationId === client.organisationId
    && `${other.name} ${other.email} ${(other.emails || []).join(' ')} ${other.phone}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 30), [client, clients, search])
  const secondary = clients.find((other) => other.id === secondaryId && other.organisationId === client.organisationId)

  async function save() {
    setBusy(true); setError(''); setNotice('')
    let saved = false
    try {
      await saveClientIdentity(client, { name: form.name, emails: lines(form.emails), phones: lines(form.phones) })
      saved = true
      await onChanged?.(client.identityId)
      setEditing(false)
      setNotice('Client details saved.')
    } catch (cause) { setError(saved ? 'Client details were saved, but the profile could not refresh. Reload before making another change.' : cause.message || 'Unable to save client details.') } finally { setBusy(false) }
  }

  async function merge() {
    if (!secondary || !confirmed) return
    setBusy(true); setError(''); setNotice('')
    let result
    try {
      result = await mergeClientIdentities(keepSecondary ? secondary : client, keepSecondary ? client : secondary, reason)
      setSecondaryId('')
      await onChanged?.(result.client_id)
      setNotice('Profiles merged. All original enquiries and transactions have been kept.')
    } catch (cause) {
      setError(result ? 'The merge was saved, but the profile could not refresh. Reload before making another change.' : cause.message || 'Unable to merge these profiles.')
    } finally { setBusy(false) }
  }

  const selectSecondary = (id) => { setSecondaryId(id); setKeepSecondary(false); setConfirmed(false); setReason(''); setError('') }

  return <section aria-label="Client contact and records" className="min-w-0 overflow-hidden rounded-2xl border border-[#e0e7e3] bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eff5f1] text-[#49705c]"><UserRound size={18} /></span>
        <div><h3 className="text-base font-semibold tracking-tight text-[#243c2f]">Contact details</h3><p className="mt-0.5 text-xs text-[#63766a]">How to reach this client</p></div>
      </div>
      {client.canManageIdentity && !editing ? <Button variant="ghost" size="sm" className="px-2 text-xs" onClick={() => setEditing(true)} disabled={busy}><Pencil size={13} />Edit contact details</Button> : null}
    </div>
    {notice ? <p role="status" className="mx-5 mt-4 rounded-xl bg-[#edfdf3] p-3 text-sm text-[#1c7d45]">{notice}</p> : null}
    {error ? <p role="alert" className="mx-5 mt-4 rounded-xl bg-[#fff5f5] p-3 text-sm text-[#b42318]">{error}</p> : null}

    {editing ? <div className="grid gap-3 p-5 sm:p-6">
      <label className="grid gap-1 text-sm">Client name<Field value={form.name} maxLength={250} disabled={busy} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <label className="grid gap-1 text-sm">Email addresses<Field as="textarea" rows={3} value={form.emails} disabled={busy} onChange={(event) => setForm({ ...form, emails: event.target.value })} /></label>
      <label className="grid gap-1 text-sm">Phone numbers<Field as="textarea" rows={3} value={form.phones} disabled={busy} onChange={(event) => setForm({ ...form, phones: event.target.value })} /></label>
      <p className="text-xs leading-5 text-[#637890]">Enter one address or number per line. The first is the primary contact detail. Previously recorded details remain alternative contacts for historical matching. Marketing preferences remain attached to each address.</p>
      <div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button><Button disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save contact details'}</Button></div>
    </div> : <dl className="grid min-w-0 gap-6 p-5 text-sm sm:p-6">
      {[
        { label: 'Email addresses', values: primaryFirst(client.email, client.emails).split('\n').filter(Boolean), primary: client.email, icon: <Mail size={15} />, empty: 'No email address', protocol: 'mailto:' },
        { label: 'Phone numbers', values: primaryFirst(client.phone, client.phones).split('\n').filter(Boolean), primary: client.phone, icon: <Phone size={15} />, empty: 'No phone number', protocol: 'tel:' },
      ].map(({ label, values, primary, icon, empty, protocol }) => <div key={label} className="flex min-w-0 items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f5f7f5] text-[#8a9a90]">{icon}</span>
        <div className="min-w-0 flex-1"><dt className="text-xs text-[#63766a]">{label}</dt><dd className="mt-1.5 space-y-2">
          {values.map((value) => <div key={value} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"><a href={`${protocol}${value}`} className="min-w-0 break-all font-medium text-[#334b3e] hover:text-[#176b50] hover:underline">{value}</a>{value === primary ? <span className="rounded bg-[#f0f4f1] px-1.5 py-0.5 text-[10px] font-medium text-[#617568]">Primary</span> : null}</div>)}
          {!values.length ? <span className="text-[#63766a]">{empty}</span> : null}
        </dd></div>
      </div>)}
    </dl>}

    <div className="border-t border-[#edf1ee] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-[#243c2f]">Linked enquiries and records</h3><span className="rounded-full bg-[#f1f5f2] px-2 py-0.5 text-xs font-medium text-[#6d8174]">{client.linkedRecords?.length || 0}</span></div>
      <ul className="mt-4 space-y-2">{(client.linkedRecords || []).map((record) => <li key={`${record.kind}:${record.id}`}>
        <Link aria-label={record.label || record.reference || record.kind} className="group flex min-w-0 items-center gap-3 rounded-xl bg-[#f7f9f7] p-3 transition-colors hover:bg-[#edf4ee] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176b50]" to={record.path}>
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#e5ece6] bg-white text-[#809184]"><Building2 size={18} /></span>
          <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium text-[#334b3e]">{record.label || record.reference || record.kind}</span><span className="mt-0.5 block text-xs capitalize text-[#64776a]">{record.kind === 'lead' ? 'Enquiry' : record.kind}</span></span>
          <ArrowUpRight aria-hidden="true" size={17} className="shrink-0 text-[#99aa9e] group-hover:text-[#176b50]" />
        </Link>
      </li>)}</ul>
      {!client.linkedRecords?.length ? <p className="mt-3 text-sm text-[#63766a]">No linked enquiries or transactions.</p> : null}
    </div>

    <details className="border-t border-[#edf1ee] px-5 py-4 text-xs text-[#63766a] sm:px-6">
      <summary className="cursor-pointer font-medium hover:text-[#354a41]">Profile information</summary>
      <p className="mt-2 break-words leading-5">{!client.identityId ? client.identityAvailable ? 'This contact is shown from the records you can access. An agency owner or principal can review its identity.' : 'Permanent client profiles are awaiting database setup. Existing records remain available.' : `Profile reference: ${client.identityId}`}</p>
      {client.identityId && !client.canManageIdentity ? <p className="mt-2 leading-5">An agency owner or principal can edit contact details and review merges.</p> : null}
    </details>
    {client.canManageIdentity && !editing ? <div className="space-y-3 border-t border-[#edf1ee] p-5 sm:p-6">
      <h5 className="font-semibold text-[#17334f]">Review duplicate profiles</h5>
      {suggestions.filter((candidate) => candidate.client.identityId).map((candidate) => <div key={candidate.client.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f3f8fd] p-3"><div><p className="text-sm font-semibold">{candidate.client.name}</p><p className="text-xs text-[#637890]">{candidate.reasons.join(' · ')}</p></div><Button variant="secondary" disabled={busy} onClick={() => selectSecondary(candidate.client.id)}>Review merge</Button></div>)}
      <details className="text-sm text-[#63766a]">
        <summary className="cursor-pointer font-medium hover:text-[#354a41]">Find another client to review</summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs leading-5">Matching names or phone numbers are suggestions. Confirm both records belong to the same person before merging.</p>
          <label className="grid gap-1 text-sm">Find another client<Field value={search} placeholder="Name, email or phone" disabled={busy} onChange={(event) => setSearch(event.target.value)} /></label>
          {search.trim() ? <ul className="space-y-2">{matches.map((other) => <li key={other.id}><button type="button" disabled={busy} className="w-full rounded-xl border border-[#d7e3ef] p-3 text-left text-sm hover:bg-[#f3f8fd]" onClick={() => selectSecondary(other.id)}>{other.name} · {other.email || other.phone || 'No contact detail'}</button></li>)}{!matches.length ? <li className="text-sm text-[#637890]">No matching clients in this agency.</li> : null}</ul> : null}
        </div>
      </details>
      {secondary ? <div className="space-y-3 rounded-xl border border-[#cfe1f2] p-3">
        <div className="grid gap-3 sm:grid-cols-2"><ClientSummary client={client} label="Current profile" /><ClientSummary client={secondary} label="Other profile" /></div>
        <label className="grid gap-1 text-sm">Keep primary details from<Field as="select" value={keepSecondary ? 'other' : 'current'} disabled={busy} onChange={(event) => setKeepSecondary(event.target.value === 'other')}><option value="current">{client.name} — current profile</option><option value="other">{secondary.name} — other profile</option></Field></label>
        <p className="text-xs leading-5 text-[#637890]">Both profiles’ alternative contacts and linked records will be retained. The previous profile reference will redirect to the retained profile. This merge has no self-service undo; the approval and original associations are recorded.</p>
        <label className="grid gap-1 text-sm">Reason for merging<Field as="textarea" rows={2} maxLength={2000} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} /><span>I have checked that both profiles belong to the same client.</span></label>
        <div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={() => setSecondaryId('')}>Cancel merge</Button><Button disabled={busy || !confirmed || !reason.trim()} onClick={() => void merge()}>{busy ? 'Merging…' : 'Merge profiles'}</Button></div>
      </div> : null}
      {historyError ? <p role="alert" className="text-sm text-[#b42318]">{historyError}</p> : null}
      {history.length ? <details><summary className="cursor-pointer text-sm font-semibold">Merge history ({history.length})</summary><ul className="mt-2 space-y-2">{history.map((item) => <li key={item.id} className="rounded-xl bg-[#f3f8fd] p-3 text-sm"><p>{item.reason}</p><p className="mt-1 text-xs text-[#637890]">{new Date(item.created_at).toLocaleString('en-ZA')} · Approved by {item.actor_id}</p></li>)}</ul></details> : null}
    </div> : null}
  </section>
}
