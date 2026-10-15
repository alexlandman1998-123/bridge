import DocumentUploadProgress from '../../../../components/documents/DocumentUploadProgress.jsx'
import { getRentalLeaseSigningWorkspace } from '../../../../services/rentals/rentalLeaseSigningRepository.js'
import { uploadRentalLeaseDocument } from '../../../../services/rentals/rentalLeaseDocumentUploadService.js'
import RentalIncomingInspectionPanel from './RentalIncomingInspectionPanel.jsx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ClipboardCheck, Loader2, PlayCircle } from 'lucide-react'
import { activateRentalTenancy, getRentalTenancyMoveInWorkspace, recordRentalMoveInReadiness, startRentalIncomingInspection } from '../../../../services/rentals/rentalTenancyMoveInRepository.js'

const title = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const money = (value) => `R ${Number(value || 0).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}`

export default function RentalMoveInPanel(props) { return <MoveInWorkspace key={props.tenancyId} {...props} /> }
function MoveInWorkspace({ tenancyId, tenancyStatus, onChanged }) {
  const [workspace, setWorkspace] = useState(null)
  const [savingId, setSavingId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [forms, setForms] = useState({}); const paymentGuard = useRef(false)
  const load = useCallback(async () => { if (!tenancyId) return; try { setError(''); setWorkspace(await getRentalTenancyMoveInWorkspace(tenancyId)) } catch (cause) { setError(cause?.message || 'Unable to load move-in readiness.') } }, [tenancyId])
  useEffect(() => { void load() }, [load])
  const readiness = workspace?.move_in_readiness || {}; const inspection = workspace?.incoming_inspection; const lease = workspace?.lease || {}
  const complete = Boolean(readiness.ready && inspection?.status === 'completed' && ['signed', 'active'].includes(lease.status))
  const blockers = useMemo(() => [!['signed', 'active'].includes(lease.status) ? 'Fully signed lease' : '', !readiness.ready ? 'Verified deposit and first rent' : '', inspection?.status !== 'completed' ? 'Completed incoming inspection and handover' : ''].filter(Boolean), [inspection?.status, lease.status, readiness.ready])
  const updateForm = (id, patch) => setForms((current) => ({ ...current, [id]: { ...(current[id] || {}), ...patch } }))
  const saveReadiness = async (item) => {
    if (paymentGuard.current) return
    paymentGuard.current = true
    const form = forms[item.id] || {}
    try {
      setSavingId(item.id); setError(''); setMessage('')
      let uploaded = form.upload
      if (!uploaded) {
        const currentLease = await getRentalLeaseSigningWorkspace(tenancyId)
        try { uploaded = await uploadRentalLeaseDocument({ workspace: currentLease, file: form.file, receipt: form.receipt, kind: 'move_in_evidence' }, { onProgress: progress => updateForm(item.id, { progress }) }); updateForm(item.id, { upload: uploaded, receipt: null, file: null }) }
        catch (cause) { if (cause.uploadReceipt) updateForm(item.id, { receipt: cause.uploadReceipt }); throw cause }
      }
      await recordRentalMoveInReadiness({ readinessItemId: item.id, status: 'verified', receivedAmount: form.receivedAmount ?? item.received_amount, evidenceLink: `${uploaded.storage_bucket}/${uploaded.storage_path}` })
      setMessage(`${title(item.obligation_type)} readiness recorded.`); await load(); await onChanged?.()
    } catch (cause) { setError(cause?.message || 'Unable to record move-in readiness. Uploaded proof is kept for retry.') }
    finally { paymentGuard.current = false; setSavingId('') }
  }
  const startInspection = async () => { try { setSavingId('inspection'); setError(''); setMessage(''); await startRentalIncomingInspection(tenancyId); setMessage('Incoming inspection started. Upload and complete its checklist below before activation.'); await load() } catch (cause) { setError(cause?.message || 'Unable to start the incoming inspection.') } finally { setSavingId('') } }
  const activate = async () => { if (!window.confirm('Activate this tenancy? This will occupy the unit and close the vacancy.')) return; try { setSavingId('activate'); setError(''); setMessage(''); await activateRentalTenancy(tenancyId); setMessage('Tenancy activated. The unit is now occupied.'); await load(); await onChanged?.() } catch (cause) { setError(cause?.message || 'Unable to activate the tenancy.') } finally { setSavingId('') } }
  if (!workspace && !error) return <section className="mt-5 grid min-h-28 place-items-center rounded-xl border bg-white text-sm text-slate-600"><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading move-in readiness…</span></section>
  return <section className="mt-5 rounded-xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Move-in and activation</h2><p className="mt-1 text-sm text-slate-600">Record actual evidence here. Activation remains a protected, final command.</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${complete ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{tenancyStatus === 'active' ? 'Active tenancy' : complete ? 'Ready to activate' : `${blockers.length} blocker${blockers.length === 1 ? '' : 's'}`}</span></div>{blockers.length ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">Before this tenancy can become active</p><ul className="mt-1 list-disc pl-5">{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div> : null}<div className="mt-5 grid gap-3 sm:grid-cols-2">{workspace?.readinessItems?.map((item) => { const form = forms[item.id] || {}; return <article key={item.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold">{title(item.obligation_type)}</p><p className="mt-1 text-xs text-slate-600">Required {money(item.required_amount)} · received {money(item.received_amount)}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{title(item.status)}</span></div>{!['verified', 'waived'].includes(item.status) ? <div className="mt-3 grid gap-2"><input type="number" min="0" step="0.01" value={form.receivedAmount ?? item.received_amount ?? ''} onChange={(event) => updateForm(item.id, { receivedAmount: event.target.value })} className="rounded border px-2 py-1.5 text-sm" aria-label={`${title(item.obligation_type)} received amount`} /><label className="text-sm">Upload {title(item.obligation_type)} payment evidence<input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" disabled={Boolean(savingId) || Boolean(form.receipt || form.upload)} onChange={event => { updateForm(item.id, { file: event.target.files?.[0] || null }); event.target.value = '' }} className="mt-1 block w-full text-sm" /></label>{form.file ? <p className="text-sm">Selected: {form.file.name}</p> : null}<DocumentUploadProgress progress={form.progress} />{form.receipt || form.upload ? <p className="text-sm text-amber-800">Payment proof saved. Retry its readiness connection.</p> : null}<button type="button" disabled={Boolean(savingId) || (!form.file && !form.receipt && !form.upload)} onClick={() => void saveReadiness(item)} className="w-fit rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-800 disabled:opacity-60">{savingId === item.id ? 'Saving…' : form.receipt || form.upload ? 'Retry payment evidence' : 'Verify evidence'}</button></div> : <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Complete</p>}</article> })}</div><div className="mt-5 flex flex-wrap gap-2 border-t pt-4"><button type="button" disabled={Boolean(savingId) || inspection} onClick={() => void startInspection()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60"><ClipboardCheck className="h-4 w-4" />{savingId === 'inspection' ? 'Starting…' : inspection ? `Incoming inspection ${title(inspection.status)}` : 'Start incoming inspection'}</button><button type="button" disabled={Boolean(savingId) || tenancyStatus === 'active' || !complete} onClick={() => void activate()} className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"><PlayCircle className="h-4 w-4" />{savingId === 'activate' ? 'Activating…' : tenancyStatus === 'active' ? 'Tenancy active' : 'Activate tenancy'}</button></div>{inspection ? <RentalIncomingInspectionPanel key={`${tenancyId}:${inspection.id}`} tenancyId={tenancyId} onChanged={async () => { await load(); await onChanged?.() }} /> : null}{message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}{error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}</section>
}
