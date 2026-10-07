import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, FileSignature, Loader2 } from 'lucide-react'
import { getRentalLeaseSigningWorkspace, prepareRentalLeaseSigning, recordRentalLeaseSignature, saveRentalLeaseDraft } from '../../../../services/rentals/rentalLeaseSigningRepository.js'
import { downloadRentalLeaseSchedule, rentalLeasePartyLabel, rentalLeaseScheduleSigners } from '../../../../services/rentals/rentalLeaseSchedule.js'

const text = (value) => String(value ?? '').trim()
const title = (value) => text(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const fields = [
  ['lease_start_date', 'Lease start', 'date'], ['lease_end_date', 'Lease end', 'date'], ['occupation_date', 'Occupation date', 'date'],
  ['monthly_rent', 'Monthly rent', 'number'], ['deposit_amount', 'Deposit', 'number'],
  ['tenant_notice_address', 'Tenant notice address'], ['landlord_name', 'Landlord name'], ['landlord_email', 'Landlord email', 'email'],
  ['landlord_notice_address', 'Landlord notice address'], ['agreement_template_reference', 'Agreement template / version reference'],
  ['agreement_document_link', 'Reviewed agreement document link', 'url'],
]
function initialTerms(workspace) {
  const version = workspace.version || {}, saved = version.terms_json || {}, schedule = workspace.projection || {}
  return { ...saved, lease_start_date: version.effective_start_date || '', lease_end_date: version.effective_end_date || '',
    occupation_date: version.occupation_date || '', monthly_rent: version.monthly_rent ?? '', deposit_amount: version.deposit_amount ?? '',
    tenant_notice_address: saved.tenant_notice_address || schedule.tenantNoticeAddress || '' }
}

export default function RentalLeaseSigningPanel({ tenancyId, onChanged }) {
  const [workspace, setWorkspace] = useState(null)
  const [terms, setTerms] = useState({})
  const [dirty, setDirty] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [evidence, setEvidence] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const load = useCallback(async () => {
    if (!tenancyId) return
    const next = await getRentalLeaseSigningWorkspace(tenancyId)
    setWorkspace(next); setTerms(initialTerms(next)); setDirty(!next.version?.terms_json?.application_schedule); setReviewed(false)
  }, [tenancyId])
  useEffect(() => { void load().catch((cause) => setError(cause?.message || 'Unable to load lease signing.')) }, [load])
  const update = (key, value) => { setTerms((current) => ({ ...current, [key]: value })); setDirty(true); setReviewed(false) }
  const action = async (work, success) => {
    try { setSaving(true); setError(''); setMessage(''); await work(); await load(); await onChanged?.(); setMessage(success) }
    catch (cause) { setError(cause?.message || 'Unable to update the lease.') }
    finally { setSaving(false) }
  }
  const saveDraft = () => action(() => saveRentalLeaseDraft({ leaseId: workspace.lease.id, expectedVersion: workspace.version.version_number,
    terms: { ...terms, monthly_rent: Number(terms.monthly_rent), deposit_amount: Number(terms.deposit_amount) } }), 'Lease terms saved as a new draft version. Review its schedule and agreement before preparing signatures.')
  const prepare = () => action(() => prepareRentalLeaseSigning({ leaseId: workspace.lease.id, expectedVersion: workspace.version.version_number,
    signers: rentalLeaseScheduleSigners(workspace.projection, workspace.version.version_number) }), 'Lease signing is prepared. Record signed evidence for every listed person.')
  const record = (signer) => action(() => recordRentalLeaseSignature({ signerId: signer.id, ...evidence[signer.id] }), `${rentalLeasePartyLabel(signer.signer_role)} signature recorded.`)
  if (!workspace && !error) return <section className="grid min-h-28 place-items-center rounded-xl border bg-white text-sm text-slate-600"><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading lease…</span></section>
  const lease = workspace?.lease || {}, schedule = workspace?.projection || {}, canPrepare = lease.status === 'draft'
  const representative = schedule.parties?.some((party) => party.subjectId === 'primary' && party.role === 'tenant_representative')
  return <section className="rounded-xl border bg-white p-5 shadow-sm">
    <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-semibold">Lease terms and signatures</h2><p className="mt-1 text-sm text-slate-600">Review approved applicant details, confirm terms and check the agency agreement. A signed lease is required before move-in activation.</p></div><span className="text-sm font-semibold">{title(lease.status || 'draft')}</span></div>
    {workspace ? <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm"><p className="font-semibold">{schedule.tenant?.name} · {title(schedule.tenant?.type)}</p><p>{schedule.property?.title} · {schedule.property?.address}</p><p className="mt-2 text-slate-600">Application identity and party roles come from the approved submission. Corrections to those facts require application review.</p></div> : null}
    {canPrepare ? <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">{fields.map(([key, label, type = 'text']) => <label key={key} className="text-sm font-medium">{label}<input type={type} value={terms[key] ?? ''} onChange={(event) => update(key, event.target.value)} min={type === 'number' ? 0 : undefined} className="mt-1 block w-full rounded border p-2 font-normal" /></label>)}
        {representative ? <label className="text-sm font-medium">Primary representative authority basis<input value={terms.primary_authority_basis || ''} onChange={(event) => update('primary_authority_basis', event.target.value)} className="mt-1 block w-full rounded border p-2 font-normal" placeholder="Reference to reviewed resolution / authority" /></label> : null}
      </div>
      <button type="button" disabled={saving || !terms.lease_start_date || !terms.lease_end_date || !terms.occupation_date || !terms.monthly_rent} onClick={() => void saveDraft()} className="mt-4 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60">Save lease draft</button>
    </> : null}
    <div className="mt-5 border-t pt-4"><h3 className="text-sm font-semibold">Parties and agreement review</h3>
      <ul className="mt-3 space-y-2">{schedule.parties?.map((party) => <li key={party.subjectId} className="rounded border p-3 text-sm"><b>{rentalLeasePartyLabel(party.role)} · {party.name}</b><p>{party.email || 'Email not provided'} · {party.identityType}: {party.identityNumber || 'Identity missing'}</p>{canPrepare && party.subjectId !== 'primary' ? <label className="mt-2 block">Notice address for {party.name}<input value={terms.party_notice_addresses?.[party.subjectId] ?? party.noticeAddress ?? ''} onChange={(event) => update('party_notice_addresses', { ...terms.party_notice_addresses, [party.subjectId]: event.target.value })} className="mt-1 block w-full rounded border p-2" /></label> : <p>{party.noticeAddress || 'Notice address missing'}</p>}{party.role === 'tenant_representative' ? <p>Authority: {party.authorityBasis || 'Confirmation required'}</p> : null}</li>)}</ul>
      <button type="button" disabled={!workspace?.version?.terms_json?.application_schedule || dirty} onClick={() => downloadRentalLeaseSchedule(schedule, workspace.version.version_number)} className="mt-3 rounded-lg border px-3 py-2 text-sm disabled:opacity-60">Download lease schedule</button>
      {!dirty && /^https?:\/\/\S+$/.test(schedule.agreement?.documentLink || '') ? <a href={schedule.agreement.documentLink} target="_blank" rel="noopener noreferrer" className="ml-3 inline-block text-sm font-semibold text-sky-700 underline">Open reviewed agreement</a> : null}
      {canPrepare ? <><p className="mt-3 text-sm text-slate-600">Use this schedule to check the agency lease and any guarantor agreement. Signing evidence is recorded manually.</p><label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} disabled={dirty || saving} onChange={(event) => setReviewed(event.target.checked)} />I checked this saved version, all parties, representative authority, notice addresses and the referenced agreement.</label><button type="button" disabled={saving || dirty || !reviewed} onClick={() => void prepare()} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"><FileSignature className="h-4 w-4" />Prepare signing</button></> : null}
    </div>
    {!canPrepare ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{workspace?.signers?.map((signer) => {
      const item = evidence[signer.id] || {}, signed = signer.status === 'signed'
      return <article key={signer.id} className="rounded-xl border p-3"><p className="text-sm font-semibold">{rentalLeasePartyLabel(signer.signer_role)} · {signer.signer_name}</p><p className="mt-1 text-xs text-slate-600">{title(signer.status)}</p>{signed ? <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Signed</p> : <div className="mt-3 grid gap-2"><label className="text-sm">Signed document link<input value={item.documentLink || ''} onChange={(event) => setEvidence((current) => ({ ...current, [signer.id]: { ...item, documentLink: event.target.value } }))} className="mt-1 w-full rounded border p-2" /></label><label className="text-sm">Evidence note<input value={item.evidenceNote || ''} onChange={(event) => setEvidence((current) => ({ ...current, [signer.id]: { ...item, evidenceNote: event.target.value } }))} className="mt-1 w-full rounded border p-2" /></label><button type="button" disabled={saving || !text(item.documentLink)} onClick={() => void record(signer)} className="w-fit rounded-lg border px-3 py-1.5 text-sm font-semibold disabled:opacity-60">Record signature</button></div>}</article>
    })}</div> : null}
    {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}{error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
  </section>
}
