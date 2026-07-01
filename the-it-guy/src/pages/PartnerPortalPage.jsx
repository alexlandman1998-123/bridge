import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  FileText,
  HelpCircle,
  MessageSquare,
  ShieldCheck,
  Upload,
  UserCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  addPartnerComment,
  activatePartnerPortalOnboarding,
  createPartnerSupportTicket,
  getPartnerActivity,
  getPartnerApplication,
  getPartnerApplications,
  getPartnerDashboard,
  uploadPartnerDocument,
} from '../services/bondPartnerPortalService'

const NAV_ITEMS = Object.freeze([
  { key: 'dashboard', label: 'Dashboard', icon: Building2 },
  { key: 'applications', label: 'Applications', icon: FileText },
  { key: 'documents', label: 'Documents', icon: Upload },
  { key: 'activity', label: 'Activity', icon: Clock3 },
  { key: 'support', label: 'Support', icon: HelpCircle },
  { key: 'profile', label: 'Profile', icon: UserCircle },
])

function normalizeText(value) {
  return String(value || '').trim()
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`
}

function formatDays(value) {
  const number = Number(value || 0)
  return number ? `${number} days` : 'Tracking'
}

function StatusPill({ status = 'Active' }) {
  const normalized = normalizeText(status).toLowerCase()
  const tone = normalized.includes('approved') || normalized.includes('complete') || normalized.includes('received')
    ? 'border-[#bbedd0] bg-[#ecfdf3] text-[#1f7a4d]'
    : normalized.includes('declined') || normalized.includes('overdue')
      ? 'border-[#f5c2c2] bg-[#fff5f5] text-[#a73535]'
      : normalized.includes('pending') || normalized.includes('requested')
        ? 'border-[#fed7aa] bg-[#fff7ed] text-[#b45309]'
        : 'border-[#cfe2f7] bg-[#eef6ff] text-[#24518a]'
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>{status}</span>
}

function MetricCard({ label = '', value = '', detail = '' }) {
  return (
    <article className="rounded-[18px] border border-[#dbe5f0] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#71869d]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#142132]">{value}</p>
      {detail ? <p className="mt-1 text-sm text-[#60758d]">{detail}</p> : null}
    </article>
  )
}

function Section({ title = '', eyebrow = '', action = null, children = null }) {
  return (
    <section className="rounded-[22px] border border-[#dbe5f0] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          {eyebrow ? <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#71869d]">{eyebrow}</p> : null}
          <h2 className="mt-1 text-lg font-semibold text-[#142132]">{title}</h2>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function EmptyState({ title = '', description = '' }) {
  return (
    <div className="rounded-[18px] border border-dashed border-[#d8e2ec] bg-[#fbfdff] p-4">
      <p className="text-sm font-semibold text-[#142132]">{title}</p>
      <p className="mt-1 text-sm leading-6 text-[#60758d]">{description}</p>
    </div>
  )
}

function PartnerPortalShell({ view = 'dashboard', setView = () => {}, dashboard = null, accepting = false, onAcceptOnboarding = () => {}, children = null }) {
  const pendingOnboarding = normalizeText(dashboard?.assignment?.assignmentStatus).toLowerCase() === 'pending_onboarding'
  return (
    <main className="min-h-screen bg-[#f4f8fb] text-[#142132]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[#dbe5f0] bg-white px-4 py-5 lg:block">
        <p className="text-xl font-semibold tracking-[-0.02em] text-[#143250]">Arch9</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#71869d]">Partner Portal</p>
        <nav className="mt-8 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = view === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setView(item.key)}
                className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-sm font-semibold transition ${active ? 'bg-[#143250] text-white' : 'text-[#31475d] hover:bg-[#f4f8fb]'}`}
              >
                <Icon size={16} />
                {item.label}
              </button>
            )
          })}
        </nav>
      </aside>
      <section className="lg:pl-64">
        <header className="border-b border-[#dbe5f0] bg-white px-5 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#71869d]">External Collaboration</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-[#142132]">{dashboard?.greeting || 'Partner Portal'}</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[#60758d]">Submit buyers, track finance progress, upload requested documents, and communicate with the assigned consultant.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {pendingOnboarding ? (
                <button type="button" onClick={onAcceptOnboarding} disabled={accepting} className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[#143250] bg-[#143250] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                  <CheckCircle2 size={16} /> {accepting ? 'Accepting' : 'Accept assignment'}
                </button>
              ) : null}
              <div className="rounded-[16px] border border-[#dbe5f0] bg-[#fbfdff] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#71869d]">Assigned Consultant</p>
                <p className="mt-1 text-sm font-semibold text-[#142132]">{dashboard?.consultantContact?.name || 'Assigned Consultant'}</p>
                <p className="mt-1 text-xs text-[#60758d]">{dashboard?.consultantContact?.email || 'Contact appears once an application is assigned'}</p>
              </div>
            </div>
          </div>
          <div className="mt-5 flex gap-2 overflow-x-auto lg:hidden">
            {NAV_ITEMS.map((item) => (
              <button key={item.key} type="button" onClick={() => setView(item.key)} className={`shrink-0 rounded-full border px-3 py-2 text-sm font-semibold ${view === item.key ? 'border-[#143250] bg-[#143250] text-white' : 'border-[#dbe5f0] bg-white text-[#31475d]'}`}>
                {item.label}
              </button>
            ))}
          </div>
        </header>
        <div className="space-y-5 px-5 py-5">{children}</div>
      </section>
    </main>
  )
}

function DashboardView({ dashboard = null, applications = [], openApplication = () => {} }) {
  const cards = dashboard?.summaryCards || {}
  const performance = dashboard?.performance || {}
  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Applications Submitted" value={cards.applicationsSubmitted || 0} />
        <MetricCard label="Active Applications" value={cards.activeApplications || 0} />
        <MetricCard label="Approvals" value={cards.approvals || 0} />
        <MetricCard label="Pending Documents" value={cards.pendingDocuments || 0} />
        <MetricCard label="Average Turnaround" value={formatDays(cards.averageTurnaround)} />
      </section>
      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
        <Section title="Application Status Breakdown" eyebrow="Finance Progress">
          <div className="space-y-3">
            {(dashboard?.statusBreakdown || []).map((row) => (
              <div key={row.key} className="grid grid-cols-[150px_1fr_44px] items-center gap-3">
                <span className="text-sm font-semibold text-[#31475d]">{row.label}</span>
                <span className="h-2 overflow-hidden rounded-full bg-[#edf3f8]">
                  <span className="block h-full rounded-full bg-[#24518a]" style={{ width: `${Math.min(100, Number(row.count || 0) * 20)}%` }} />
                </span>
                <span className="text-right text-sm font-semibold text-[#142132]">{row.count || 0}</span>
              </div>
            ))}
          </div>
        </Section>
        <Section title={performance.title || 'Partner Performance'} eyebrow="Performance">
          <div className="grid gap-3">
            {Object.entries(performance.metrics || {}).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between rounded-[14px] border border-[#e1e9f2] bg-[#fbfdff] px-3 py-2">
                <span className="text-sm font-semibold capitalize text-[#60758d]">{key.replace(/([A-Z])/g, ' $1')}</span>
                <span className="text-sm font-semibold text-[#142132]">{String(key).toLowerCase().includes('rate') ? formatPercent(value) : value}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
      <Section title="Recent Applications" eyebrow="Self Service">
        {applications.length ? (
          <div className="divide-y divide-[#edf2f7] overflow-hidden rounded-[18px] border border-[#e1e9f2]">
            {applications.slice(0, 5).map((row) => (
              <button key={row.id} type="button" onClick={() => openApplication(row.id)} className="flex w-full flex-col gap-2 bg-white px-4 py-4 text-left transition hover:bg-[#fbfdff] md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#142132]">{row.buyer}</p>
                  <p className="mt-1 text-xs text-[#71869d]">{row.property} · {row.reference}</p>
                </div>
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#24518a]">Open <ArrowRight size={14} /></span>
              </button>
            ))}
          </div>
        ) : <EmptyState title="No applications yet" description="Applications submitted by your organisation will appear here." />}
      </Section>
    </>
  )
}

function ApplicationsView({ applications = [], filter = 'all', setFilter = () => {}, openApplication = () => {} }) {
  const filters = [
    ['all', 'All'],
    ['active', 'Active'],
    ['approved', 'Approved'],
    ['declined', 'Declined'],
    ['pending_documents', 'Pending Documents'],
  ]
  return (
    <Section
      title="Applications"
      eyebrow="Buyer Finance"
      action={(
        <div className="flex flex-wrap gap-2">
          {filters.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === key ? 'border-[#143250] bg-[#143250] text-white' : 'border-[#dbe5f0] bg-white text-[#31475d]'}`}>{label}</button>
          ))}
        </div>
      )}
    >
      {applications.length ? (
        <div className="overflow-x-auto rounded-[18px] border border-[#e1e9f2]">
          <table className="min-w-[960px] border-collapse bg-white">
            <thead>
              <tr>
                {['Buyer', 'Property', 'Reference', 'Consultant', 'Status', 'Bank', 'Submitted Date', 'Last Activity', 'Action'].map((label) => (
                  <th key={label} className="bg-[#f8fbff] px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-[#71869d]">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {applications.map((row) => (
                <tr key={row.id} className="border-t border-[#edf2f7]">
                  <td className="px-4 py-4 text-sm font-semibold text-[#142132]">{row.buyer}</td>
                  <td className="px-4 py-4 text-sm text-[#31475d]">{row.property}</td>
                  <td className="px-4 py-4 text-sm text-[#31475d]">{row.reference}</td>
                  <td className="px-4 py-4 text-sm text-[#31475d]">{row.consultant}</td>
                  <td className="px-4 py-4"><StatusPill status={row.financeStageLabel || row.status} /></td>
                  <td className="px-4 py-4 text-sm text-[#31475d]">{row.bank}</td>
                  <td className="px-4 py-4 text-sm text-[#60758d]">{row.submittedDate || 'Not submitted'}</td>
                  <td className="px-4 py-4 text-sm text-[#60758d]">{row.lastActivity}</td>
                  <td className="px-4 py-4">
                    <button type="button" onClick={() => openApplication(row.id)} className="rounded-[10px] border border-[#dbe5f0] px-3 py-1.5 text-xs font-semibold text-[#24518a]">Open</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="No applications found" description="Try another filter or check back once buyers are submitted." />}
    </Section>
  )
}

function ApplicationWorkspace({ application = null, onUpload = () => {}, onComment = () => {} }) {
  const [message, setMessage] = useState('')
  if (!application) return <EmptyState title="Select an application" description="Open an application to view progress, documents, and communication." />
  return (
    <div className="space-y-5">
      <Section title={`${application.buyer} · ${application.reference}`} eyebrow={application.property}>
        <div className="grid gap-3 md:grid-cols-6">
          {(application.statusRail || []).map((stage) => (
            <div key={stage.key} className="rounded-[14px] border border-[#e1e9f2] bg-[#fbfdff] p-3">
              <CheckCircle2 size={18} className={stage.status === 'complete' ? 'text-[#1f7a4d]' : stage.status === 'active' ? 'text-[#24518a]' : 'text-[#9aaabd]'} />
              <p className="mt-2 text-sm font-semibold text-[#142132]">{stage.label}</p>
              <p className="mt-1 text-xs capitalize text-[#60758d]">{stage.status}</p>
            </div>
          ))}
        </div>
      </Section>
      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Section title="Application Summary" eyebrow="Visible to Partner">
          <div className="grid gap-3 md:grid-cols-2">
            <MetricCard label="Consultant" value={application.summary.consultant} />
            <MetricCard label="Branch" value={application.summary.branch} />
            <MetricCard label="Submitted Date" value={application.summary.submittedDate || 'Not submitted'} />
            <MetricCard label="Last Updated" value={application.summary.lastUpdated} />
          </div>
        </Section>
        <Section title="Finance Progress" eyebrow="Bank Progress">
          <div className="grid gap-2">
            {Object.entries(application.financeProgress || {}).map(([key, value]) => (
              <div key={key} className="flex justify-between rounded-[12px] border border-[#e1e9f2] bg-[#fbfdff] px-3 py-2 text-sm">
                <span className="font-semibold capitalize text-[#60758d]">{key.replace(/([A-Z])/g, ' $1')}</span>
                <span className="font-semibold text-[#142132]">{Array.isArray(value) ? value.join(', ') || 'None yet' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
      <Section title="Outstanding Documents" eyebrow="Document Requests">
        {application.documents?.outstandingDocuments?.length ? (
          <div className="space-y-3">
            {application.documents.outstandingDocuments.map((request) => (
              <div key={request.id} className="flex flex-col gap-3 rounded-[16px] border border-[#e1e9f2] bg-[#fbfdff] p-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#142132]">{request.documentName}</p>
                  <p className="mt-1 text-xs text-[#60758d]">Requested by {request.requestedBy} · Due {request.dueDate || 'when available'}</p>
                </div>
                <button type="button" onClick={() => onUpload(application.id, request)} className="inline-flex items-center gap-2 rounded-[10px] border border-[#143250] bg-[#143250] px-3 py-2 text-sm font-semibold text-white">
                  <Upload size={14} /> Upload
                </button>
              </div>
            ))}
          </div>
        ) : <EmptyState title="No outstanding documents" description="Any requested payslips, bank statements, or proofs of address will appear here." />}
      </Section>
      <Section title="Communication Timeline" eyebrow="Secure Thread">
        <div className="space-y-3">
          {(application.comments || []).map((comment) => (
            <div key={comment.id} className="rounded-[14px] border border-[#e1e9f2] bg-[#fbfdff] p-3">
              <p className="text-sm font-semibold text-[#142132]">{comment.authorName}</p>
              <p className="mt-1 text-sm text-[#60758d]">{comment.message}</p>
            </div>
          ))}
          <div className="flex gap-2">
            <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Send a secure update to the consultant" className="h-11 flex-1 rounded-[12px] border border-[#dbe5f0] px-3 text-sm outline-none focus:border-[#9fb8d1]" />
            <button type="button" onClick={() => { onComment(application.id, message); setMessage('') }} className="inline-flex items-center gap-2 rounded-[12px] border border-[#143250] bg-[#143250] px-4 text-sm font-semibold text-white">
              <MessageSquare size={14} /> Send
            </button>
          </div>
        </div>
      </Section>
    </div>
  )
}

function DocumentsView({ applications = [], openApplication = () => {} }) {
  return (
    <Section title="Documents" eyebrow="Missing Documents">
      {applications.length ? (
        <div className="grid gap-3">
          {applications.map((row) => (
            <button key={row.id} type="button" onClick={() => openApplication(row.id)} className="flex flex-col gap-2 rounded-[16px] border border-[#e1e9f2] bg-[#fbfdff] p-4 text-left transition hover:bg-white md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#142132]">{row.buyer}</p>
                <p className="mt-1 text-xs text-[#60758d]">{row.reference} · {row.financeStageLabel}</p>
              </div>
              <StatusPill status={row.financeStageLabel} />
            </button>
          ))}
        </div>
      ) : <EmptyState title="No document queue" description="Outstanding document requests will appear here." />}
    </Section>
  )
}

function ActivityView({ rows = [] }) {
  return (
    <Section title="Activity Feed" eyebrow="Progress Updates">
      {rows.length ? (
        <div className="divide-y divide-[#edf2f7] overflow-hidden rounded-[18px] border border-[#e1e9f2]">
          {rows.map((row) => (
            <div key={row.id} className="bg-white px-4 py-4">
              <p className="text-sm font-semibold text-[#142132]">{row.title || row.eventType}</p>
              <p className="mt-1 text-xs text-[#60758d]">{row.createdAt}</p>
            </div>
          ))}
        </div>
      ) : <EmptyState title="No activity yet" description="Document uploads, bank feedback, quote approvals, and instructions will appear here." />}
    </Section>
  )
}

function SupportView({ onCreate = () => {} }) {
  const [values, setValues] = useState({ type: 'General Query', subject: '', message: '' })
  return (
    <Section title="Support Centre" eyebrow="Partner Help">
      <div className="grid gap-4 md:grid-cols-3">
        {['General Query', 'Application Query', 'Document Issue', 'Escalation'].map((type) => (
          <button key={type} type="button" onClick={() => setValues((previous) => ({ ...previous, type }))} className={`rounded-[14px] border px-4 py-3 text-left text-sm font-semibold ${values.type === type ? 'border-[#143250] bg-[#eef6ff] text-[#143250]' : 'border-[#dbe5f0] bg-[#fbfdff] text-[#31475d]'}`}>{type}</button>
        ))}
      </div>
      <div className="mt-4 grid gap-3">
        <input value={values.subject} onChange={(event) => setValues((previous) => ({ ...previous, subject: event.target.value }))} placeholder="Subject" className="h-11 rounded-[12px] border border-[#dbe5f0] px-3 text-sm outline-none focus:border-[#9fb8d1]" />
        <textarea value={values.message} onChange={(event) => setValues((previous) => ({ ...previous, message: event.target.value }))} rows={4} placeholder="Describe what you need help with" className="rounded-[12px] border border-[#dbe5f0] px-3 py-3 text-sm outline-none focus:border-[#9fb8d1]" />
        <button type="button" onClick={() => onCreate(values)} className="inline-flex w-fit items-center gap-2 rounded-[12px] border border-[#143250] bg-[#143250] px-4 py-2.5 text-sm font-semibold text-white">
          <HelpCircle size={14} /> Create Support Ticket
        </button>
      </div>
    </Section>
  )
}

function ProfileView({ dashboard = null }) {
  return (
    <Section title="Profile" eyebrow="Partner Access">
      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard label="Partner" value={dashboard?.partner?.name || 'Partner'} />
        <MetricCard label="Partner Type" value={dashboard?.partner?.type || 'Partner'} />
        <MetricCard label="Portal User" value={dashboard?.user?.name || 'Partner user'} />
        <MetricCard label="Access Scope" value="Own applications only" />
      </div>
      <div className="mt-4 rounded-[16px] border border-[#bbedd0] bg-[#ecfdf3] p-4">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#1f7a4d]"><ShieldCheck size={16} /> Internal CRM data, other partners, workloads, and branch operations are hidden from this portal.</p>
      </div>
    </Section>
  )
}

export default function PartnerPortalPage() {
  const { token = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [state, setState] = useState({ loading: true, error: '', dashboard: null, applications: [], activity: [], selectedApplication: null, notice: '' })
  const [filter, setFilter] = useState('all')
  const [accepting, setAccepting] = useState(false)
  const view = normalizeText(searchParams.get('view') || 'dashboard')
  const context = useMemo(() => ({ token }), [token])
  const options = useMemo(() => ({ token, workspaceId: 'partner-portal' }), [token])

  const loadPortal = useCallback(async () => {
    try {
      const [dashboard, applications, activity] = await Promise.all([
        getPartnerDashboard(context, options),
        getPartnerApplications(context, { ...options, filter }),
        getPartnerActivity(context, options),
      ])
      const selectedApplicationId = normalizeText(searchParams.get('applicationId'))
      const selectedApplication = selectedApplicationId
        ? await getPartnerApplication(selectedApplicationId, context, options).catch(() => null)
        : null
      setState((previous) => ({ ...previous, loading: false, error: '', dashboard, applications, activity, selectedApplication }))
    } catch (error) {
      setState((previous) => ({ ...previous, loading: false, error: String(error?.message || 'Partner portal could not be loaded.') }))
    }
  }, [context, filter, options, searchParams])

  useEffect(() => {
    loadPortal()
  }, [loadPortal])

  function setView(nextView) {
    setSearchParams({ view: nextView })
  }

  async function openApplication(applicationId = '') {
    try {
      const selectedApplication = await getPartnerApplication(applicationId, context, options)
      setState((previous) => ({ ...previous, selectedApplication }))
      setSearchParams({ view: 'application', applicationId })
    } catch (error) {
      setState((previous) => ({ ...previous, notice: String(error?.message || 'Application could not be opened.') }))
    }
  }

  async function handleUpload(applicationId = '', request = {}) {
    try {
      await uploadPartnerDocument(applicationId, {
        name: request.documentName || 'Uploaded document',
        documentType: request.documentName || 'document',
        requestId: request.id,
      }, context, options)
      setState((previous) => ({ ...previous, notice: 'Document uploaded and consultant notified.' }))
      await openApplication(applicationId)
      await loadPortal()
    } catch (error) {
      setState((previous) => ({ ...previous, notice: String(error?.message || 'Document could not be uploaded.') }))
    }
  }

  async function handleComment(applicationId = '', message = '') {
    if (!normalizeText(message)) return
    try {
      await addPartnerComment(applicationId, { message }, context, options)
      setState((previous) => ({ ...previous, notice: 'Comment added to the secure thread.' }))
      await openApplication(applicationId)
    } catch (error) {
      setState((previous) => ({ ...previous, notice: String(error?.message || 'Comment could not be added.') }))
    }
  }

  async function handleSupport(values = {}) {
    try {
      await createPartnerSupportTicket(values, context, options)
      setState((previous) => ({ ...previous, notice: 'Support ticket created.' }))
      await loadPortal()
    } catch (error) {
      setState((previous) => ({ ...previous, notice: String(error?.message || 'Support ticket could not be created.') }))
    }
  }

  async function handleAcceptOnboarding() {
    setAccepting(true)
    try {
      await activatePartnerPortalOnboarding({ token }, options)
      setState((previous) => ({ ...previous, notice: 'Assignment accepted.' }))
      await loadPortal()
    } catch (error) {
      setState((previous) => ({ ...previous, notice: String(error?.message || 'Assignment could not be accepted.') }))
    } finally {
      setAccepting(false)
    }
  }

  if (state.loading) {
    return <main className="min-h-screen bg-[#f4f8fb] p-8 text-sm font-semibold text-[#31475d]">Loading partner portal...</main>
  }

  if (state.error) {
    return (
      <main className="min-h-screen bg-[#f4f8fb] p-8">
        <section className="mx-auto max-w-xl rounded-[22px] border border-[#f1d0d0] bg-white p-6 text-[#9f2a2a]">
          <p className="text-lg font-semibold">Partner portal unavailable</p>
          <p className="mt-2 text-sm">{state.error}</p>
        </section>
      </main>
    )
  }

  return (
    <PartnerPortalShell view={view} setView={setView} dashboard={state.dashboard} accepting={accepting} onAcceptOnboarding={handleAcceptOnboarding}>
      {state.notice ? <div className="rounded-[14px] border border-[#bbedd0] bg-[#ecfdf3] px-4 py-3 text-sm font-semibold text-[#1f7a4d]">{state.notice}</div> : null}
      {view === 'dashboard' ? <DashboardView dashboard={state.dashboard} applications={state.applications} openApplication={openApplication} /> : null}
      {view === 'applications' ? <ApplicationsView applications={state.applications} filter={filter} setFilter={setFilter} openApplication={openApplication} /> : null}
      {view === 'application' ? <ApplicationWorkspace application={state.selectedApplication} onUpload={handleUpload} onComment={handleComment} /> : null}
      {view === 'documents' ? <DocumentsView applications={state.applications} openApplication={openApplication} /> : null}
      {view === 'activity' ? <ActivityView rows={state.activity} /> : null}
      {view === 'support' ? <SupportView onCreate={handleSupport} /> : null}
      {view === 'profile' ? <ProfileView dashboard={state.dashboard} /> : null}
    </PartnerPortalShell>
  )
}
