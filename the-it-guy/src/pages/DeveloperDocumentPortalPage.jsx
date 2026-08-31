import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileText,
  Loader2,
  LockKeyhole,
  RefreshCw,
  UploadCloud,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  createDeveloperPortalDocumentUrl,
  fetchDeveloperDocumentPortal,
  uploadDeveloperDocumentPortalFile,
} from '../services/developerDocumentPortalService'

const COMPLETE_STATUSES = new Set(['uploaded', 'under_review', 'approved', 'completed', 'waived'])

function statusMeta(value = '') {
  const status = String(value || 'pending').toLowerCase()
  if (status === 'approved' || status === 'completed') {
    return { label: 'Verified', classes: 'border-emerald-200 bg-emerald-50 text-emerald-700', Icon: CheckCircle2 }
  }
  if (status === 'uploaded' || status === 'under_review') {
    return { label: 'Received · review pending', classes: 'border-sky-200 bg-sky-50 text-sky-700', Icon: Clock3 }
  }
  if (status === 'rejected') {
    return { label: 'Please replace', classes: 'border-rose-200 bg-rose-50 text-rose-700', Icon: AlertCircle }
  }
  return { label: 'Outstanding', classes: 'border-amber-200 bg-amber-50 text-amber-700', Icon: AlertCircle }
}

function sectionLabel(value = '') {
  const section = String(value || '').toLowerCase()
  if (section === 'seller_documents') return 'Developer entity & authority'
  if (section === 'transfer_documents') return 'Transfer & registration'
  if (section === 'bond_cancellation_documents') return 'Existing bond & cancellation'
  if (section === 'registration_documents') return 'Registration documents'
  return 'Development sale pack'
}

function expiryLabel(value) {
  if (!value) return 'No expiry'
  return `Link expires ${new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

function LoadingState() {
  return (
    <main className="min-h-screen bg-[#f4f7f6] px-5 py-16 text-[#142132]">
      <div className="mx-auto flex max-w-xl items-center justify-center gap-3 rounded-3xl border border-[#dce6e2] bg-white px-6 py-10 shadow-sm">
        <Loader2 className="animate-spin text-[#137a5c]" size={22} />
        <span className="font-medium">Opening your secure document portal…</span>
      </div>
    </main>
  )
}

export default function DeveloperDocumentPortalPage() {
  const { token = '' } = useParams()
  const inputRefs = useRef(new Map())
  const [workspace, setWorkspace] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploadingKey, setUploadingKey] = useState('')
  const [message, setMessage] = useState('')

  const loadPortal = useCallback(async ({ quiet = false } = {}) => {
    try {
      if (!quiet) setLoading(true)
      setError('')
      const payload = await fetchDeveloperDocumentPortal(token)
      setWorkspace(payload)
    } catch (loadError) {
      setError(loadError?.message || 'This developer document link is unavailable.')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadPortal()
  }, [loadPortal])

  const groupedRequirements = useMemo(() => {
    const groups = new Map()
    for (const requirement of workspace?.requirements || []) {
      const label = sectionLabel(requirement.section)
      if (!groups.has(label)) groups.set(label, [])
      groups.get(label).push(requirement)
    }
    return [...groups.entries()]
  }, [workspace?.requirements])

  async function handleFileSelected(requirement, file) {
    if (!file || !workspace) return
    const key = requirement?.id || 'general'
    try {
      setUploadingKey(key)
      setError('')
      setMessage('')
      await uploadDeveloperDocumentPortalFile({
        token,
        portalId: workspace.portal.id,
        transactionId: workspace.transaction.id,
        requirementId: requirement?.id || null,
        category: requirement?.category || sectionLabel(requirement?.section),
        file,
      })
      setMessage(`${file.name} was uploaded successfully.`)
      await loadPortal({ quiet: true })
    } catch (uploadError) {
      setError(uploadError?.message || 'The document could not be uploaded.')
    } finally {
      setUploadingKey('')
      const input = inputRefs.current.get(key)
      if (input) input.value = ''
    }
  }

  async function handleOpenDocument(document) {
    try {
      setError('')
      const url = await createDeveloperPortalDocumentUrl({ token, filePath: document.filePath })
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } catch (openError) {
      setError(openError?.message || 'The document could not be opened.')
    }
  }

  if (loading) return <LoadingState />

  if (error && !workspace) {
    return (
      <main className="min-h-screen bg-[#f4f7f6] px-5 py-16 text-[#142132]">
        <section className="mx-auto max-w-xl rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto text-rose-600" size={34} />
          <h1 className="mt-4 text-2xl font-semibold tracking-[-0.03em]">Document portal unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-[#66758b]">{error}</p>
          <button type="button" onClick={() => void loadPortal()} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#137a5c] px-4 py-2.5 text-sm font-semibold text-white">
            <RefreshCw size={15} /> Try again
          </button>
        </section>
      </main>
    )
  }

  const developmentName = workspace?.development?.name || 'Development'
  const unitNumber = workspace?.unit?.unitNumber
  const propertyLabel = unitNumber ? `${developmentName} · Unit ${unitNumber}` : developmentName

  return (
    <main className="min-h-screen bg-[#f4f7f6] text-[#142132]">
      <header className="border-b border-[#dce6e2] bg-[#0b3329] px-5 py-5 text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10"><Building2 size={21} /></span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">Arch9 secure workspace</p>
              <h1 className="text-xl font-semibold tracking-[-0.03em]">Developer document portal</h1>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 text-sm text-emerald-100"><LockKeyhole size={15} /> {expiryLabel(workspace?.portal?.expiresAt)}</span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-5 py-8">
        <section className="rounded-3xl border border-[#dce6e2] bg-white p-6 shadow-[0_14px_35px_rgba(16,41,34,0.06)] sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium text-[#137a5c]">{workspace?.development?.developerName || developmentName}</p>
              <h2 className="mt-1 text-3xl font-semibold tracking-[-0.045em]">{propertyLabel}</h2>
              <p className="mt-2 text-sm text-[#66758b]">Reference: {workspace?.transaction?.reference || 'Developer sale'} · {workspace?.transaction?.stage || 'In progress'}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                ['Required', workspace?.summary?.required || 0],
                ['Received', workspace?.summary?.received || 0],
                ['Outstanding', workspace?.summary?.outstanding || 0],
              ].map(([label, value]) => (
                <div key={label} className="min-w-[92px] rounded-2xl border border-[#e3ebe8] bg-[#f8faf9] px-4 py-3 text-center">
                  <strong className="block text-xl">{value}</strong><span className="text-xs text-[#66758b]">{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-[#e7eeeb]"><div className="h-full rounded-full bg-[#18a477] transition-all" style={{ width: `${workspace?.summary?.progress || 0}%` }} /></div>
          <p className="mt-2 text-right text-xs font-medium text-[#66758b]">{workspace?.summary?.progress || 0}% complete</p>
        </section>

        {message ? <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 size={17} />{message}</div> : null}
        {error ? <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><AlertCircle size={17} />{error}</div> : null}

        <section className="space-y-5">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.03em]">Documents requested from the developer</h2>
            <p className="mt-1 text-sm text-[#66758b]">Upload the sale-pack, authority, property and transfer documents requested for this developer sale. Buyer documents are not shown here.</p>
          </div>

          <div className="flex flex-col gap-4 rounded-3xl border border-[#bfd8cf] bg-[#f1f8f5] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold text-[#174f3f]">Upload another developer document</h3>
              <p className="mt-1 text-sm text-[#527568]">Use this for development plans, sale-pack annexures, authority records, property schedules or any additional file requested by the transaction team.</p>
            </div>
            <div className="shrink-0">
              <input ref={(node) => { if (node) inputRefs.current.set('general', node) }} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" onChange={(event) => void handleFileSelected(null, event.target.files?.[0])} />
              <button type="button" disabled={uploadingKey === 'general'} onClick={() => inputRefs.current.get('general')?.click()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#137a5c] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0e684d] disabled:opacity-60 sm:w-auto">
                {uploadingKey === 'general' ? <Loader2 className="animate-spin" size={16} /> : <UploadCloud size={16} />}
                {uploadingKey === 'general' ? 'Uploading…' : 'Upload document'}
              </button>
            </div>
          </div>

          {groupedRequirements.map(([label, requirements]) => (
            <article key={label} className="overflow-hidden rounded-3xl border border-[#dce6e2] bg-white shadow-[0_10px_28px_rgba(16,41,34,0.04)]">
              <div className="border-b border-[#e5ece9] bg-[#f8faf9] px-5 py-4 sm:px-6"><h3 className="font-semibold">{label}</h3><p className="mt-1 text-xs text-[#748398]">{requirements.length} document{requirements.length === 1 ? '' : 's'}</p></div>
              <div className="divide-y divide-[#e8eeec]">
                {requirements.map((requirement) => {
                  const meta = statusMeta(requirement.status)
                  const complete = COMPLETE_STATUSES.has(String(requirement.status || '').toLowerCase())
                  const busy = uploadingKey === requirement.id
                  return (
                    <div key={requirement.id} className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                      <div className="flex min-w-0 gap-3">
                        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eff5f2] text-[#137a5c]"><FileText size={18} /></span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2"><h4 className="font-medium">{requirement.name}</h4>{requirement.blocking ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[0.68rem] font-semibold text-rose-700">Blocking</span> : null}</div>
                          {requirement.description ? <p className="mt-1 max-w-2xl text-sm leading-6 text-[#66758b]">{requirement.description}</p> : null}
                          <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.classes}`}><meta.Icon size={13} />{meta.label}</span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        <input ref={(node) => { if (node) inputRefs.current.set(requirement.id, node) }} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" onChange={(event) => void handleFileSelected(requirement, event.target.files?.[0])} />
                        <button type="button" disabled={busy} onClick={() => inputRefs.current.get(requirement.id)?.click()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#cfdcd7] bg-white px-4 py-2.5 text-sm font-semibold text-[#215a49] transition hover:border-[#91b9aa] hover:bg-[#f5faf8] disabled:opacity-60 sm:w-auto">
                          {busy ? <Loader2 className="animate-spin" size={16} /> : complete ? <RefreshCw size={15} /> : <UploadCloud size={16} />}
                          {busy ? 'Uploading…' : complete ? 'Replace' : 'Upload'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </article>
          ))}

          {!groupedRequirements.length ? (
            <div className="rounded-3xl border border-dashed border-[#bfd1ca] bg-white px-6 py-10 text-center"><FileCheck2 className="mx-auto text-[#137a5c]" size={30} /><h3 className="mt-3 font-semibold">No developer documents are outstanding</h3><p className="mt-1 text-sm text-[#66758b]">The transaction team has not requested any developer documents for this sale.</p></div>
          ) : null}
        </section>

        {workspace?.documents?.length ? (
          <section className="rounded-3xl border border-[#dce6e2] bg-white p-6 shadow-[0_10px_28px_rgba(16,41,34,0.04)]">
            <h2 className="text-lg font-semibold tracking-[-0.025em]">Uploads from this portal</h2>
            <div className="mt-4 divide-y divide-[#e8eeec]">
              {workspace.documents.map((document) => (
                <button key={document.id} type="button" onClick={() => void handleOpenDocument(document)} className="flex w-full items-center justify-between gap-4 py-3 text-left hover:text-[#137a5c]">
                  <span className="flex min-w-0 items-center gap-3"><FileText className="shrink-0" size={17} /><span className="truncate text-sm font-medium">{document.name}</span></span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-[#748398]">{new Date(document.createdAt).toLocaleDateString('en-ZA')}<ExternalLink size={14} /></span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <footer className="pb-8 text-center text-xs leading-5 text-[#748398]">This link is scoped to developer documents for this transaction. It does not provide access to buyer onboarding, finance details, workflow controls, or the private-seller portal.</footer>
      </div>
    </main>
  )
}
