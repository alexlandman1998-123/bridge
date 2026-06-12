import {
  AlertTriangle,
  Bell,
  Building2,
  CalendarClock,
  CheckCircle2,
  Download,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  MessageCircle,
  Send,
  ShieldCheck,
  Upload,
  Users,
} from 'lucide-react'
import { createElement, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { formatCurrency, formatDate, titleize } from '../commercialFormatters'
import {
  activateCommercialPortalAccess,
  getCommercialPortalDocumentDownloadUrl,
  getCommercialPortalWorkspaceData,
  sendCommercialPortalMessage,
  uploadCommercialPortalDocument,
} from '../services/commercialPortalApi'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'assets', label: 'Assets', icon: Building2 },
  { id: 'transaction', label: 'Transaction', icon: CheckCircle2 },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'timeline', label: 'Timeline', icon: CalendarClock },
  { id: 'messages', label: 'Messages', icon: MessageCircle },
  { id: 'lease', label: 'Lease', icon: Building2 },
]

function StatusPill({ value = 'in_progress' }) {
  const status = String(value || '').toLowerCase()
  const tone = status.includes('complete') || status.includes('active') || status.includes('signed')
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : status.includes('overdue') || status.includes('rejected')
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-sky-200 bg-sky-50 text-sky-700'
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>{titleize(value)}</span>
}

function DetailCard({ label, value, detail, icon }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
          <p className="mt-2 text-lg font-semibold tracking-[-0.035em] text-[#102236]">{value || '-'}</p>
          <p className="mt-1 text-sm text-slate-500">{detail || '-'}</p>
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
          {createElement(icon, { size: 17 })}
        </span>
      </div>
    </article>
  )
}

function LoadingState() {
  return (
    <main className="min-h-screen bg-[#f6f8fb] p-5 text-[#102236]">
      <div className="mx-auto grid max-w-6xl gap-4">
        <div className="h-44 animate-pulse rounded-3xl bg-white" />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-32 animate-pulse rounded-3xl bg-white" />
          <div className="h-32 animate-pulse rounded-3xl bg-white" />
          <div className="h-32 animate-pulse rounded-3xl bg-white" />
        </div>
      </div>
    </main>
  )
}

function ErrorState({ message }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] p-5 text-[#102236]">
      <section className="w-full max-w-md rounded-3xl border border-amber-200 bg-white p-6 text-center shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <AlertTriangle size={22} />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-[-0.04em]">Commercial portal unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{message || 'Request a fresh secure link from your broker.'}</p>
      </section>
    </main>
  )
}

function DocumentUploadForm({ requests = [], token, onUploaded }) {
  const [file, setFile] = useState(null)
  const [category, setCategory] = useState('Supporting Documentation')
  const [documentRequestId, setDocumentRequestId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!file) {
      setError('Choose a document to upload.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await uploadCommercialPortalDocument({ token, file, category, documentRequestId, notes })
      setFile(null)
      setNotes('')
      setDocumentRequestId('')
      onUploaded?.()
    } catch (uploadError) {
      setError(uploadError?.message || 'Document upload failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold text-[#102236]">
          Request
          <select value={documentRequestId} onChange={(event) => setDocumentRequestId(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none">
            <option value="">General upload</option>
            {requests.map((request) => (
              <option key={request.id} value={request.id}>{request.title}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold text-[#102236]">
          Category
          <input value={category} onChange={(event) => setCategory(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none" />
        </label>
      </div>
      <label className="grid gap-1 text-sm font-semibold text-[#102236]">
        Document
        <input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-600" />
      </label>
      <label className="grid gap-1 text-sm font-semibold text-[#102236]">
        Notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none" />
      </label>
      {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}
      <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:opacity-60">
        <Upload size={16} />
        {saving ? 'Uploading...' : 'Upload Document'}
      </button>
    </form>
  )
}

function MessageForm({ token, onSent }) {
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!message.trim()) return
    setSaving(true)
    setError('')
    try {
      await sendCommercialPortalMessage({ token, message })
      setMessage('')
      onSent?.()
    } catch (sendError) {
      setError(sendError?.message || 'Message could not be sent.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
      <label className="grid gap-1 text-sm font-semibold text-[#102236]">
        Message your broker
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none" placeholder="Ask a question or respond to a request..." />
      </label>
      {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}
      <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:opacity-60">
        <Send size={16} />
        {saving ? 'Sending...' : 'Send Message'}
      </button>
    </form>
  )
}

function ActivationPanel({ workspace, token, onActivated }) {
  const [displayName, setDisplayName] = useState(workspace?.contact?.name || '')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (workspace?.access?.acceptedAt || workspace?.access?.passwordSetAt) return null

  async function handleActivate(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await activateCommercialPortalAccess({ token, displayName, password })
      onActivated?.()
    } catch (activationError) {
      setError(activationError?.message || 'Portal activation failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 text-sky-900">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sky-700">
            <LockKeyhole size={18} />
          </div>
          <h2 className="mt-3 text-lg font-semibold tracking-[-0.035em]">Activate Secure Access</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-sky-800">Confirm your portal access for this company/contact. This invitation remains private to the secure link issued by your broker.</p>
        </div>
        <form onSubmit={handleActivate} className="grid w-full gap-3 rounded-2xl bg-white p-4 lg:max-w-xl">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold text-[#102236]">
              Name
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none" />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[#102236]">
              Password
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none" />
            </label>
          </div>
          {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}
          <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? 'Activating...' : 'Activate Portal'}
          </button>
        </form>
      </div>
    </section>
  )
}

function RoleDashboard({ dashboard }) {
  if (!dashboard?.cards?.length) return null
  return (
    <section className={CARD_CLASS}>
      <h2 className="text-lg font-semibold tracking-[-0.035em]">{dashboard.title}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {dashboard.cards.map((card) => (
          <article key={card.label} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{card.label}</p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#102236]">{card.value || '-'}</p>
            <p className="mt-1 text-sm text-slate-500">{card.detail || '-'}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function AssetRows({ title, rows = [], fields = [] }) {
  return (
    <section className={CARD_CLASS}>
      <h2 className="text-lg font-semibold tracking-[-0.035em]">{title}</h2>
      <div className="mt-4 grid gap-3">
        {rows.length ? rows.map((row) => (
          <article key={row.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#102236]">{row.title}</p>
                <p className="mt-1 text-sm text-slate-500">{fields.map((field) => row[field]).filter(Boolean).join(' · ') || '-'}</p>
              </div>
              <StatusPill value={row.status} />
            </div>
          </article>
        )) : <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No records visible for this portal yet.</p>}
      </div>
    </section>
  )
}

function CommercialExternalPortalPage() {
  const { token } = useParams()
  const [workspace, setWorkspace] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('dashboard')

  const visibleTabs = useMemo(() => TABS.filter((tab) => {
    if (tab.id === 'documents') return workspace?.access?.visibility?.documents !== false
    if (tab.id === 'timeline') return workspace?.access?.visibility?.timeline !== false
    if (tab.id === 'messages') return workspace?.access?.visibility?.messages !== false
    if (tab.id === 'lease') return workspace?.access?.visibility?.lease !== false
    return true
  }), [workspace])

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const data = await getCommercialPortalWorkspaceData(token)
      setWorkspace(data)
    } catch (loadError) {
      setError(loadError?.message || 'Commercial portal could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function handleDownload(document) {
    try {
      const url = await getCommercialPortalDocumentDownloadUrl({ token, document })
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } catch (downloadError) {
      setError(downloadError?.message || 'Document download failed.')
    }
  }

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} />
  if (!workspace) return <ErrorState message="Commercial portal data is missing." />

  const summary = workspace.summary || {}

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-4 py-5 text-[#102236] sm:px-6">
      <div className="mx-auto grid max-w-7xl gap-5">
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
          <div className="border-b border-slate-100 bg-[#102b46] px-5 py-5 text-white sm:px-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
                    <ShieldCheck size={14} />
                    Secure Commercial Portal
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">{workspace.access.portalLabel}</span>
                </div>
                <h1 className="mt-4 text-3xl font-semibold tracking-[-0.055em]">{summary.transactionTitle}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">{summary.property} · {summary.unit} · Broker: {summary.broker}</p>
              </div>
              <div className="grid min-w-[230px] gap-2 rounded-2xl bg-white/10 p-4 text-sm">
                <span className="font-semibold">{summary.contactName}</span>
                <span className="text-slate-200">{workspace.contact.email || 'Portal contact'}</span>
                <span className="text-slate-200">Expires {formatDate(workspace.access.expiresAt)}</span>
              </div>
            </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto p-2" aria-label="Commercial portal navigation">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition ${activeTab === tab.id ? 'bg-[#102b46] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {createElement(tab.icon, { size: 15 })}
                {tab.label}
              </button>
            ))}
          </nav>
        </section>

        <ActivationPanel workspace={workspace} token={token} onActivated={refresh} />

        {activeTab === 'dashboard' ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DetailCard label="Status" value={summary.status} detail="Current commercial progress" icon={CheckCircle2} />
              <DetailCard label="Outstanding Documents" value={summary.outstandingDocuments} detail={`${summary.receivedDocuments} documents received`} icon={FileText} />
              <DetailCard label="Company" value={summary.companyName} detail={workspace.access.portalLabel} icon={Users} />
              <DetailCard label="Property" value={summary.property} detail={summary.unit} icon={Building2} />
            </section>
            <RoleDashboard dashboard={workspace.roleDashboard} />
            <section className={CARD_CLASS}>
              <h2 className="text-lg font-semibold tracking-[-0.035em]">Progress</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                {workspace.progress.map((step) => (
                  <article key={step.key} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                    <StatusPill value={step.status} />
                    <p className="mt-3 text-sm font-semibold">{step.label}</p>
                    <p className="mt-1 text-sm text-slate-500">{step.detail}</p>
                  </article>
                ))}
              </div>
            </section>
            <section className="grid gap-4 lg:grid-cols-2">
              <section className={CARD_CLASS}>
                <h2 className="text-lg font-semibold tracking-[-0.035em]">Important Dates</h2>
                <div className="mt-4 grid gap-2">
                  {summary.importantDates.map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] px-4 py-3 text-sm">
                      <span className="font-semibold">{label}</span>
                      <span className="text-slate-500">{value}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className={CARD_CLASS}>
                <h2 className="text-lg font-semibold tracking-[-0.035em]">Updates</h2>
                <div className="mt-4 grid gap-2">
                  {workspace.notifications.length ? workspace.notifications.slice(0, 5).map((notification) => (
                    <article key={notification.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                      <div className="flex items-start gap-3">
                        <Bell size={17} className="mt-0.5 text-sky-500" />
                        <div>
                          <p className="text-sm font-semibold">{notification.title}</p>
                          <p className="mt-1 text-sm text-slate-500">{notification.description || formatDate(notification.createdAt)}</p>
                        </div>
                      </div>
                    </article>
                  )) : <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No portal notifications yet.</p>}
                </div>
              </section>
            </section>
          </>
        ) : null}

        {activeTab === 'assets' ? (
          <section className="grid gap-4 xl:grid-cols-3">
            <AssetRows title="Properties" rows={workspace.properties} fields={['type', 'location']} />
            <AssetRows title="Vacancies" rows={workspace.vacancies} fields={['unit', 'area', 'rental']} />
            <AssetRows title="Listings" rows={workspace.listings} fields={['type', 'category', 'pricing']} />
          </section>
        ) : null}

        {activeTab === 'transaction' ? (
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <section className={CARD_CLASS}>
              <h2 className="text-lg font-semibold tracking-[-0.035em]">Transaction</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {[
                  ['Stage', titleize(workspace.transaction.status)],
                  ['Type', titleize(workspace.transaction.type)],
                  ['Value', formatCurrency(workspace.transaction.value || 0)],
                  ['Expected Close', formatDate(workspace.transaction.expectedCloseDate)],
                  ['Actual Close', formatDate(workspace.transaction.actualCloseDate)],
                  ['Broker', summary.broker],
                ].map(([label, value]) => (
                  <article key={label} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
                    <p className="mt-2 text-sm font-semibold text-[#102236]">{value || '-'}</p>
                  </article>
                ))}
              </div>
            </section>
            <section className={CARD_CLASS}>
              <h2 className="text-lg font-semibold tracking-[-0.035em]">Viewings</h2>
              <div className="mt-4 grid gap-3">
                {workspace.viewings.length ? workspace.viewings.map((viewing) => (
                  <article key={viewing.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#102236]">{formatDate(viewing.date)} {viewing.time || ''}</p>
                        <p className="mt-1 text-sm text-slate-500">{viewing.notes || viewing.feedback || 'Commercial viewing'}</p>
                      </div>
                      <StatusPill value={viewing.status} />
                    </div>
                  </article>
                )) : <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No viewings visible yet.</p>}
              </div>
            </section>
          </section>
        ) : null}

        {activeTab === 'documents' ? (
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
            <section className={CARD_CLASS}>
              <h2 className="text-lg font-semibold tracking-[-0.035em]">Document Requests</h2>
              <div className="mt-4 grid gap-3">
                {workspace.documentRequests.length ? workspace.documentRequests.map((request) => (
                  <article key={request.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold">{request.title}</p>
                        <p className="mt-1 text-sm text-slate-500">{request.category} · Due {formatDate(request.dueDate)}</p>
                        {request.notes ? <p className="mt-2 text-sm text-slate-500">{request.notes}</p> : null}
                      </div>
                      <StatusPill value={request.rawStatus} />
                    </div>
                  </article>
                )) : <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No document requests are outstanding.</p>}
              </div>
              <h2 className="mt-6 text-lg font-semibold tracking-[-0.035em]">Uploaded Documents</h2>
              <div className="mt-4 grid gap-3">
                {workspace.documents.length ? workspace.documents.map((document) => (
                  <article key={document.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold">{document.title}</p>
                        <p className="mt-1 text-sm text-slate-500">{document.category} · {document.status} · {formatDate(document.uploadedAt)}</p>
                      </div>
                      {document.filePath ? (
                        <button type="button" onClick={() => void handleDownload(document)} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-600">
                          <Download size={15} />
                          Download
                        </button>
                      ) : null}
                    </div>
                  </article>
                )) : <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No documents uploaded yet.</p>}
              </div>
            </section>
            <section className={CARD_CLASS}>
              <h2 className="text-lg font-semibold tracking-[-0.035em]">Upload Document</h2>
              <p className="mt-1 text-sm text-slate-500">Upload requested commercial documents directly to your broker.</p>
              <div className="mt-4">
                <DocumentUploadForm requests={workspace.documentRequests} token={token} onUploaded={refresh} />
              </div>
            </section>
          </section>
        ) : null}

        {activeTab === 'timeline' ? (
          <section className={CARD_CLASS}>
            <h2 className="text-lg font-semibold tracking-[-0.035em]">Timeline</h2>
            <div className="mt-4 grid gap-3">
              {workspace.timeline.length ? workspace.timeline.map((item) => (
                <article key={item.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{item.detail}</p>
                  <p className="mt-2 text-xs font-semibold text-slate-400">{formatDate(item.date)}</p>
                </article>
              )) : <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No client-visible timeline events yet.</p>}
            </div>
          </section>
        ) : null}

        {activeTab === 'messages' ? (
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
            <section className={CARD_CLASS}>
              <h2 className="text-lg font-semibold tracking-[-0.035em]">Messages</h2>
              <div className="mt-4 grid gap-3">
                {workspace.messages.length ? workspace.messages.map((message) => (
                  <article key={message.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                    <p className="text-sm font-semibold">{message.senderName}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{message.body}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-400">{formatDate(message.createdAt)}</p>
                  </article>
                )) : <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No messages yet.</p>}
              </div>
            </section>
            <section className={CARD_CLASS}>
              <h2 className="text-lg font-semibold tracking-[-0.035em]">Ask a Question</h2>
              <p className="mt-1 text-sm text-slate-500">Your broker will see this message inside the commercial transaction workspace.</p>
              <div className="mt-4">
                <MessageForm token={token} onSent={refresh} />
              </div>
            </section>
          </section>
        ) : null}

        {activeTab === 'lease' ? (
          <section className={CARD_CLASS}>
            <h2 className="text-lg font-semibold tracking-[-0.035em]">Lease Visibility</h2>
            {workspace.lease ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {Object.entries(workspace.lease).map(([key, value]) => (
                  <article key={key} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{titleize(key)}</p>
                    <p className="mt-2 text-sm font-semibold">{value || '-'}</p>
                  </article>
                ))}
              </div>
            ) : <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Lease visibility is not enabled for this portal.</p>}
            {workspace.renewal ? (
              <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-800">
                <p className="text-sm font-semibold">{workspace.renewal.label}</p>
                <p className="mt-1 text-sm">{workspace.renewal.detail}</p>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  )
}

export default CommercialExternalPortalPage
