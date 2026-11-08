import { Copy, FilePlus2, Link2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import usePortalWorkspaceRefresh from '../../hooks/usePortalWorkspaceRefresh.js'
import BondApplicationHandoff from '../../components/bond/BondApplicationHandoff'
import BondEmptyState from '../../components/bond/BondEmptyState'
import BondPageShell from '../../components/bond/BondPageShell'
import {
  createBondOriginatorWorkspaceDocumentRequest,
  fetchBondApplicationOriginatorActionCentre,
  fetchBondApplicationPortalOriginatorDocumentContinuity,
  fetchBondApplicationSubmissionReadiness,
  fetchBondApplicationExternalSubmissions,
  fetchBondApplicationPortalDeliveryActionCentre,
  issueBondApplicationPortalAccessLinkForOriginator,
  revokeBondApplicationPortalAccessLinkForOriginator,
  sendBondApplicationPortalDeliveryForOriginator,
  assessBondApplicationSubmissionReadiness,
  recordBondApplicationExternalSubmission,
} from '../../lib/api'
import { buildBondApplicationPortalAccessPath } from '../../lib/bondApplicationPortalAccessLink'

const DOCUMENT_TYPES = [
  ['buyer_id_document', 'Buyer ID document'],
  ['buyer_proof_of_address', 'Proof of address'],
  ['bank_statements', 'Bank statements'],
  ['payslips', 'Payslips'],
  ['bond_preapproval', 'Bond pre-approval'],
]

function formatDate(value) {
  const date = new Date(value || '')
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium' }).format(date)
}

function resolveAccessUrl(token = '') {
  const path = buildBondApplicationPortalAccessPath(token)
  if (!path || typeof window === 'undefined') return path
  return `${window.location.origin}${path}`
}

function RequestDocumentForm({ item, onCreated }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [instruction, setInstruction] = useState('')
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0][0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!item?.actions?.canRequestDocuments) return null

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await createBondOriginatorWorkspaceDocumentRequest({
        exportPackageId: item.exportPackageId,
        title,
        buyerInstruction: instruction,
        canonicalDocumentType: documentType,
      })
      setTitle('')
      setInstruction('')
      setOpen(false)
      await onCreated()
    } catch (requestError) {
      setError(String(requestError?.message || 'Could not create the document request.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 border-t border-[#e4edf6] pt-4">
      <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-2 text-sm font-semibold text-[#24518a] hover:text-[#173d68]">
        <FilePlus2 size={16} />
        Request a document
      </button>
      {open ? (
        <form onSubmit={submit} className="mt-3 grid gap-3 rounded-xl bg-[#f7fbff] p-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-[#526d88]">
            Document type
            <select value={documentType} onChange={(event) => setDocumentType(event.target.value)} className="rounded-lg border border-[#dbe5f0] bg-white px-3 py-2 text-sm text-[#17324d]">
              {DOCUMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[#526d88]">
            Request title
            <input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Latest payslip" className="rounded-lg border border-[#dbe5f0] bg-white px-3 py-2 text-sm text-[#17324d]" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[#526d88] sm:col-span-2">
            Buyer instruction
            <textarea required value={instruction} onChange={(event) => setInstruction(event.target.value)} rows={3} placeholder="Explain clearly what is needed and why." className="rounded-lg border border-[#dbe5f0] bg-white px-3 py-2 text-sm text-[#17324d]" />
          </label>
          {error ? <p className="text-sm text-[#a33a3a] sm:col-span-2">{error}</p> : null}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-semibold text-[#526d88]">Cancel</button>
            <button disabled={saving} className="rounded-lg bg-[#24518a] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Creating…' : 'Create request'}</button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

function ExternalSubmissionForm({ item, readiness, onRecorded }) {
  const [open, setOpen] = useState(false)
  const [lenders, setLenders] = useState('')
  const [submittedAt, setSubmittedAt] = useState('')
  const [externalReference, setExternalReference] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const openForm = () => {
    setError(''); setOpen(true)
    setSubmittedAt(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19))
  }

  if (readiness?.status !== 'ready') return null

  const submit = async (event) => {
    event.preventDefault()
    const lenderNames = lenders.split(',').map((value) => value.trim()).filter(Boolean)
    if (!lenderNames.length) {
      setError('Add at least one lender or bank name.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await recordBondApplicationExternalSubmission({ exportPackageId: item.exportPackageId, submittedAt: new Date(submittedAt).toISOString(), lenderNames, externalReference, notes })
      setOpen(false)
      setLenders('')
      setExternalReference('')
      setNotes('')
      await onRecorded()
    } catch (submissionError) {
      setError(String(submissionError?.message || 'Could not record the external submission.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 border-t border-[#e4edf6] pt-4">
      <button type="button" onClick={() => open ? setOpen(false) : void openForm()} className="inline-flex items-center gap-2 text-sm font-semibold text-[#24518a] hover:text-[#173d68]">
        <ShieldCheck size={16} /> Record external submission
      </button>
      {open ? (
        <form onSubmit={submit} className="mt-3 grid gap-3 rounded-xl bg-[#f7fbff] p-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-[#526d88] sm:col-span-2">
            Lender or bank names
            <input required value={lenders} onChange={(event) => setLenders(event.target.value)} placeholder="e.g. Bank A, Bank B" className="rounded-lg border border-[#dbe5f0] bg-white px-3 py-2 text-sm text-[#17324d]" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[#526d88]">
            External reference
            <input value={externalReference} onChange={(event) => setExternalReference(event.target.value)} placeholder="Optional bank reference" className="rounded-lg border border-[#dbe5f0] bg-white px-3 py-2 text-sm text-[#17324d]" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[#526d88]">
            Notes
            <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional internal note" className="rounded-lg border border-[#dbe5f0] bg-white px-3 py-2 text-sm text-[#17324d]" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[#526d88]">When submitted<input required type="datetime-local" step="1" value={submittedAt} onChange={(event) => setSubmittedAt(event.target.value)} className="rounded-lg border border-[#dbe5f0] bg-white px-3 py-2 text-sm text-[#17324d]" /></label>
          <p className="text-sm text-[#17324d]">Record the work completed through your bank channel. No signed application is required in Arch9.</p>
          <p className="text-xs leading-5 text-[#60758d] sm:col-span-2">This records that you submitted externally. The platform does not submit anything to a bank.</p>
          {error ? <p className="text-sm text-[#a33a3a] sm:col-span-2">{error}</p> : null}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-semibold text-[#526d88]">Cancel</button>
            <button disabled={saving} className="rounded-lg bg-[#24518a] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Recording…' : 'Record submission'}</button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

export default function BondApplicationActionCentrePage() {
  const [state, setState] = useState({ loading: true, error: '', data: null, deliveryData: null, documentContinuity: null, readiness: null, externalSubmissions: null })
  const [linkResult, setLinkResult] = useState(null)
  const [busyPackageId, setBusyPackageId] = useState('')

  const loadGeneration = useRef(0)
  const load = useCallback(async ({ background = false } = {}) => {
    const generation = ++loadGeneration.current
    if (!background) setState((current) => ({ ...current, loading: true, error: '' }))
    const names = ['Application actions', 'Email delivery', 'Document updates', 'Submission readiness', 'Submission history']
    const results = await Promise.allSettled([
      fetchBondApplicationOriginatorActionCentre(),
      fetchBondApplicationPortalDeliveryActionCentre(),
      fetchBondApplicationPortalOriginatorDocumentContinuity(),
      fetchBondApplicationSubmissionReadiness(),
      fetchBondApplicationExternalSubmissions(),
    ])
    if (generation !== loadGeneration.current) return false
    const errors = results.flatMap((result, index) => result.status === 'rejected' ? [`${names[index]}: ${result.reason?.message || 'Could not refresh. Please retry.'}`] : [])
    setState((current) => ({
      loading: false,
      error: errors.join(' '),
      data: results[0].status === 'fulfilled' ? results[0].value : current.data,
      deliveryData: results[1].status === 'fulfilled' ? results[1].value : null,
      documentContinuity: results[2].status === 'fulfilled' ? results[2].value : null,
      // Never keep a stale ready result after a failed readiness read.
      readiness: results[3].status === 'fulfilled' ? results[3].value : null,
      externalSubmissions: results[4].status === 'fulfilled' ? results[4].value : null,
    }))
    return errors.length === 0
  }, [])

  useEffect(() => { void load(); return () => { loadGeneration.current += 1 } }, [load])
  usePortalWorkspaceRefresh({ onRefresh: () => load({ background: true }), pollingIntervalMs: 30_000 })

  const issueLink = async (item) => {
    setBusyPackageId(item.exportPackageId)
    try {
      const result = await issueBondApplicationPortalAccessLinkForOriginator({ exportPackageId: item.exportPackageId })
      setLinkResult({ packageId: item.exportPackageId, url: resolveAccessUrl(result?.accessToken), expiresAt: result?.expiresAt })
      await load()
    } catch (error) {
      setState((current) => ({ ...current, error: String(error?.message || 'Could not issue the access link.') }))
    } finally {
      setBusyPackageId('')
    }
  }

  const revokeLink = async (item) => {
    setBusyPackageId(item.exportPackageId)
    try {
      await revokeBondApplicationPortalAccessLinkForOriginator({ accessLinkId: item?.activeAccessLink?.id })
      if (linkResult?.packageId === item.exportPackageId) setLinkResult(null)
      await load()
    } catch (error) {
      setState((current) => ({ ...current, error: String(error?.message || 'Could not revoke the access link.') }))
    } finally {
      setBusyPackageId('')
    }
  }

  const sendEmail = async (item) => {
    setBusyPackageId(item.exportPackageId)
    try {
      await sendBondApplicationPortalDeliveryForOriginator({ exportPackageId: item.exportPackageId })
      setLinkResult(null)
      await load()
    } catch (error) {
      setState((current) => ({ ...current, error: String(error?.message || 'Could not queue the application email.') }))
    } finally {
      setBusyPackageId('')
    }
  }

  const assessReadiness = async (item) => { setBusyPackageId(item.exportPackageId); try { await assessBondApplicationSubmissionReadiness({ exportPackageId: item.exportPackageId }); await load() } catch (error) { setState((current) => ({ ...current, error: String(error?.message || 'Could not assess submission readiness.') })) } finally { setBusyPackageId('') } }

  const copyLink = async () => {
    if (!linkResult?.url) return
    try { await navigator.clipboard.writeText(linkResult.url) } catch { /* The visible one-time link remains selectable. */ }
  }

  const items = Array.isArray(state.data?.items) ? state.data.items : []
  const deliveryByPackageId = new Map((Array.isArray(state.deliveryData?.items) ? state.deliveryData.items : []).map((item) => [item.exportPackageId, item]))
  const continuityByPackageId = new Map((Array.isArray(state.documentContinuity?.items) ? state.documentContinuity.items : []).map((item) => [item.exportPackageId, item]))
  const readinessByPackageId = new Map((Array.isArray(state.readiness?.items) ? state.readiness.items : []).map((item) => [item.exportPackageId, item]))
  const externalSubmissionsByPackageId = new Map((Array.isArray(state.externalSubmissions?.items) ? state.externalSubmissions.items : []).map((item) => [item.exportPackageId, item]))
  return (
    <BondPageShell className="space-y-5">
      <section className="rounded-[22px] border border-[#dce6f2] bg-white p-6 shadow-[0_16px_38px_rgba(15,23,42,0.055)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5c7895]">Buyer application workflow</p>
            <h1 className="mt-2 text-2xl font-semibold text-[#142132]">Application action centre</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758d]">Issue a secure buyer link, request supporting documents, and see the current access state without entering the buyer portal.</p>
          </div>
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-[#dbe5f0] px-3 py-2 text-sm font-semibold text-[#24518a]">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-[#f4f8fc] px-3 py-2 text-xs text-[#526d88]"><ShieldCheck size={16} className="text-[#2f7a54]" /> Track the bank process here. Buyer links can be used for shared documents; signing and bank-service connections are not required.</p>
      </section>

      {state.error ? <section className="rounded-xl border border-[#f0caca] bg-[#fff6f6] p-4 text-sm text-[#9c3535]">{state.error}</section> : null}
      {state.loading ? <BondEmptyState title="Loading your application actions…" description="Checking your assigned originator intake packages." /> : null}
      {!state.loading && !state.error && items.length === 0 ? <BondEmptyState title="No document handoff packages yet" description="Your assigned buyer files are available in Applications. Prepared handoff packages appear here." /> : null}
      <Link to="/bond/applications" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#24518a]">Open assigned applications</Link>

      {items.map((item) => {
        const isBusy = busyPackageId === item.exportPackageId
        const currentResult = linkResult?.packageId === item.exportPackageId ? linkResult : null
        const deliveries = deliveryByPackageId.get(item.exportPackageId)?.deliveries || []
        const continuity = continuityByPackageId.get(item.exportPackageId)?.summary || {}
        const readiness = readinessByPackageId.get(item.exportPackageId)?.assessment || null
        const externalSubmissions = externalSubmissionsByPackageId.get(item.exportPackageId)?.records || []
        return (
          <section key={item.exportPackageId} className="rounded-[20px] border border-[#dce6f2] bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-[#142132]">{item.recipientName || 'Bond application'}</h2>
                <p className="mt-1 text-sm text-[#60758d]">Package {String(item.exportPackageId || '').slice(0, 8)} · {item.packageStatus || 'assigned'}</p>
              </div>
              <span className="rounded-full bg-[#eef5ff] px-3 py-1 text-xs font-semibold text-[#24518a]">{item.documentRequestSummary?.open || 0} open document requests</span>
            </div>

            <div className="mt-4 grid gap-3 rounded-xl border border-[#e4edf6] bg-[#fbfdff] p-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="text-sm font-semibold text-[#17324d]">Buyer application access</p>
                <p className="mt-1 text-sm text-[#60758d]">{item.activeAccessLink ? `Active until ${formatDate(item.activeAccessLink.expiresAt)}` : 'No active buyer link.'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button disabled={isBusy || !item.actions?.canIssueAccessLink} onClick={() => void sendEmail(item)} className="inline-flex items-center gap-2 rounded-lg border border-[#b9d3e9] bg-[#edf7ff] px-3 py-2 text-sm font-semibold text-[#24518a] disabled:opacity-50"><Link2 size={16} />Email link</button>
                <button disabled={isBusy || !item.actions?.canIssueAccessLink} onClick={() => void issueLink(item)} className="inline-flex items-center gap-2 rounded-lg bg-[#24518a] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Link2 size={16} />{item.activeAccessLink ? 'Reissue link' : 'Issue link'}</button>
                {item.activeAccessLink ? <button disabled={isBusy} onClick={() => void revokeLink(item)} className="inline-flex items-center gap-2 rounded-lg border border-[#ebc6c6] px-3 py-2 text-sm font-semibold text-[#9c3535] disabled:opacity-50"><XCircle size={16} />Revoke</button> : null}
              </div>
            </div>
            {currentResult?.url ? <div className="mt-3 rounded-xl border border-[#c9deef] bg-[#f4faff] p-3"><p className="text-xs font-semibold text-[#24518a]">Copy this link now — it is only shown after issuing it.</p><div className="mt-2 flex gap-2"><input readOnly value={currentResult.url} className="min-w-0 flex-1 rounded-lg border border-[#d3e2f0] bg-white px-3 py-2 text-xs text-[#17324d]" /><button onClick={() => void copyLink()} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-[#24518a]"><Copy size={15} />Copy</button></div></div> : null}
            {continuity.total ? <p className="mt-3 text-xs text-[#526d88]">Document continuity: {continuity.linked || 0} linked · {continuity.outstanding || 0} outstanding · {continuity.awaitingReview || 0} awaiting review.</p> : null}
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-[#f8fbfd] px-3 py-3 text-xs text-[#526d88]"><span>Tracker access: {readiness?.label || readiness?.status || 'Refresh to check access'}{readiness?.blockers?.length ? ` · ${readiness.blockers.length} blocker(s)` : ''}. No bank submission is performed.</span><button disabled={isBusy} onClick={() => void assessReadiness(item)} className="rounded-lg border border-[#c9d9e8] bg-white px-3 py-2 text-xs font-semibold text-[#24518a] disabled:opacity-50">Refresh access</button></div>
            {externalSubmissions.length ? <details className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><summary className="cursor-pointer font-semibold">External submission history ({externalSubmissions.length})</summary><ul className="mt-3 space-y-3">{externalSubmissions.map((record) => <li key={record.id} className="border-t border-slate-200 pt-2"><p>{record.lenderNames?.join(', ') || 'Lender not recorded'} · {record.submittedAt ? new Date(record.submittedAt).toLocaleString('en-ZA') : 'Date not recorded'} · {record.status}</p><p>Reference: {record.externalReference || 'Not supplied'}</p><p>Submitted by: {record.submittedBy || 'Not recorded'}</p><p>{record.version ? `Signed version ${record.version.submissionVersion} · Application revision ${record.version.applicationRevision}` : 'Recorded in the bond tracker.'}</p>{record.version?.snapshotHash ? <p className="break-all text-xs">Version fingerprint: {record.version.snapshotHash}</p> : null}{record.notes ? <p>{record.notes}</p> : null}</li>)}</ul></details> : null}
            {deliveries.length ? <div className="mt-3 rounded-xl bg-[#f8fbfd] px-3 py-3 text-xs text-[#526d88]"><p className="font-semibold text-[#17324d]">Delivery history</p><div className="mt-2 space-y-1">{deliveries.slice(0, 3).map((delivery) => <p key={delivery.id}>{delivery.deliveryKind === 'scheduled' ? `Reminder ${delivery.reminderNumber}` : 'Initial email'} · {delivery.status || 'queued'} · {formatDate(delivery.sentAt || delivery.createdAt)}</p>)}</div></div> : null}
            <RequestDocumentForm item={item} onCreated={load} />
            <BondApplicationHandoff item={item} onChanged={load} />
            {readiness?.blockers?.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">{readiness.blockers.map((blocker, index) => <li key={`${blocker.key || blocker.code}-${index}`}>{blocker.message}</li>)}</ul> : null}
            <ExternalSubmissionForm item={item} readiness={readiness} onRecorded={load} />
          </section>
        )
      })}
    </BondPageShell>
  )
}
