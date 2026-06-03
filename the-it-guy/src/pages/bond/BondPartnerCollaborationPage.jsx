import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileWarning,
  Inbox,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  StickyNote,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  addInternalNote,
  BOND_PARTNER_REQUEST_STATUSES,
  getPartnerInbox,
  getPartnerOperationsDashboard,
  replyToPartnerRequest,
  reviewPartnerDocument,
  resolveSupportTicket,
  escalatePartnerRequest,
} from '../../services/bondPartnerCollaborationService'

const CATEGORY_TABS = Object.freeze([
  { key: 'rows', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'awaitingResponse', label: 'Awaiting Response' },
  { key: 'documentsUploaded', label: 'Documents Uploaded' },
  { key: 'supportTickets', label: 'Support Tickets' },
  { key: 'escalations', label: 'Escalations' },
  { key: 'resolved', label: 'Resolved' },
])

function normalizeText(value) {
  return String(value || '').trim()
}

function resolveWorkspaceId(workspaceContext = {}) {
  return normalizeText(
    workspaceContext.workspaceId ||
      workspaceContext.currentWorkspace?.id ||
      workspaceContext.workspace?.id ||
      workspaceContext.currentMembership?.workspaceId ||
      workspaceContext.currentMembership?.organisation_id ||
      workspaceContext.currentMembership?.organisationId,
  )
}

function formatDate(value) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function statusLabel(value = '') {
  return normalizeText(value).replace(/_/g, ' ') || 'New'
}

function MetricCard({ label, value, description, icon: Icon }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
        </div>
        {Icon ? <Icon className="h-5 w-5 text-slate-500" aria-hidden="true" /> : null}
      </div>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </article>
  )
}

function PriorityBadge({ priority = 'normal' }) {
  const normalized = normalizeText(priority).toLowerCase()
  const className = normalized === 'urgent'
    ? 'bg-red-50 text-red-700 ring-red-200'
    : normalized === 'high'
      ? 'bg-amber-50 text-amber-700 ring-amber-200'
      : 'bg-slate-100 text-slate-700 ring-slate-200'
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ring-1 ${className}`}>{normalized || 'normal'}</span>
}

function SlaBadge({ sla = {} }) {
  const className = sla.breached
    ? 'bg-red-50 text-red-700 ring-red-200'
    : sla.statusLabel === 'At Risk'
      ? 'bg-amber-50 text-amber-700 ring-amber-200'
      : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${className}`}>{sla.statusLabel || 'On Track'}</span>
}

function RequestWorkspace({ request, onReply, onInternalNote, onAccept, onReject, onResolve, onEscalate }) {
  if (!request) {
    return (
      <section className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
        <Inbox className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
        <h2 className="mt-3 text-base font-semibold text-slate-950">No partner request selected</h2>
        <p className="mt-1 text-sm text-slate-500">Select a queue item to review the conversation, documents, audit trail, and next action.</p>
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">{request.partnerName} · {request.applicationReference}</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{request.title}</h2>
            <p className="mt-2 text-sm text-slate-500">{request.applicationBuyer} · {request.applicationProperty}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={request.priority} />
            <SlaBadge sla={request.sla} />
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold capitalize text-slate-700">{statusLabel(request.status)}</span>
          </div>
        </div>
      </div>
      <div className="grid gap-4 p-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Overview</h3>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs font-medium text-slate-500">Owner</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-950">{request.ownerName}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs font-medium text-slate-500">SLA Due</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-950">{formatDate(request.dueAt)}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs font-medium text-slate-500">Request Type</dt>
                <dd className="mt-1 text-sm font-semibold capitalize text-slate-950">{statusLabel(request.requestType)}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs font-medium text-slate-500">Created</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-950">{formatDate(request.createdAt)}</dd>
              </div>
            </dl>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Conversation</h3>
            <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{request.message || 'No message content captured.'}</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Audit</h3>
            <p className="mt-2 text-sm text-slate-500">Created from {request.sourceKey || 'internal source'} and tracked against the partner, application, owner, SLA, and status.</p>
          </div>
        </div>
        <div className="space-y-3">
          <button type="button" onClick={() => onReply(request)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            Reply
          </button>
          <button type="button" onClick={() => onInternalNote(request)} className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
            <StickyNote className="h-4 w-4" aria-hidden="true" />
            Internal Note
          </button>
          {request.requestType === 'document_review' ? (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => onAccept(request)} className="flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                Accept
              </button>
              <button type="button" onClick={() => onReject(request)} className="flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
                <FileWarning className="h-4 w-4" aria-hidden="true" />
                Reject
              </button>
            </div>
          ) : null}
          <button type="button" onClick={() => onResolve(request)} disabled={request.status === BOND_PARTNER_REQUEST_STATUSES.resolved} className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Resolve
          </button>
          <button type="button" onClick={() => onEscalate(request)} className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Escalate
          </button>
        </div>
      </div>
    </section>
  )
}

export default function BondPartnerCollaborationPage() {
  const workspaceContext = useWorkspace()
  const workspaceId = resolveWorkspaceId(workspaceContext)
  const [activeCategory, setActiveCategory] = useState('rows')
  const [selectedRequestId, setSelectedRequestId] = useState('')
  const [notice, setNotice] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const options = useMemo(() => ({ workspaceId, refreshKey }), [workspaceId, refreshKey])
  const inbox = useMemo(() => getPartnerInbox(workspaceContext, options), [workspaceContext, options])
  const dashboard = useMemo(() => getPartnerOperationsDashboard(workspaceContext, options), [workspaceContext, options])
  const visibleRows = activeCategory === 'rows' ? inbox.rows : inbox.categories[activeCategory] || []
  const selectedRequest = inbox.rows.find((row) => row.id === selectedRequestId) || visibleRows[0] || null

  function refresh(message = '') {
    setNotice(message)
    setRefreshKey((value) => value + 1)
  }

  function handleAction(action) {
    try {
      action()
    } catch (error) {
      setNotice(String(error?.message || 'Could not update partner request.'))
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Bond Originator</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Partner Inbox</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">Manage partner comments, uploaded documents, support tickets, escalations, SLA risk, and internal response ownership.</p>
          </div>
          <button type="button" onClick={() => refresh('Partner inbox refreshed.')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </button>
        </header>

        <nav className="flex flex-wrap gap-2 text-sm font-semibold text-slate-600" aria-label="Bond operations">
          {['Dashboard', 'Applications', 'Partner Inbox', 'Support', 'Reports'].map((item) => (
            <span key={item} className={`rounded-lg px-3 py-2 ${item === 'Partner Inbox' ? 'bg-slate-950 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{item}</span>
          ))}
        </nav>

        {notice ? <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">{notice}</div> : null}

        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-950">Partner Operations Dashboard</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard label="Open Requests" value={dashboard.metrics.openRequests} description="Assigned partner work waiting on internal action." icon={Inbox} />
            <MetricCard label="Waiting Documents" value={dashboard.metrics.waitingDocuments} description="Uploaded documents needing review." icon={FileCheck2} />
            <MetricCard label="SLA Breaches" value={dashboard.metrics.slaBreaches} description="Requests past their response target." icon={AlertTriangle} />
            <MetricCard label="Avg Response" value={`${dashboard.metrics.averageResponseTime}h`} description="Average elapsed time across open requests." icon={Clock3} />
            <MetricCard label="Resolved Today" value={dashboard.metrics.resolvedToday} description="Partner requests completed today." icon={ShieldCheck} />
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <div className="flex flex-wrap gap-2">
                {CATEGORY_TABS.map((tab) => {
                  const count = tab.key === 'rows' ? inbox.rows.length : (inbox.categories[tab.key] || []).length
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveCategory(tab.key)}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold ${activeCategory === tab.key ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-700'}`}
                    >
                      {tab.label} · {count}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Partner</th>
                    <th className="px-4 py-3">Application</th>
                    <th className="px-4 py-3">Request Type</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Owner</th>
                    <th className="px-4 py-3">SLA Due</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleRows.map((row) => (
                    <tr key={row.id} className={selectedRequest?.id === row.id ? 'bg-slate-50' : 'bg-white'}>
                      <td className="px-4 py-3 font-semibold text-slate-950">{row.partnerName}</td>
                      <td className="px-4 py-3 text-slate-600">{row.applicationReference}</td>
                      <td className="px-4 py-3 capitalize text-slate-600">{statusLabel(row.requestType)}</td>
                      <td className="px-4 py-3"><PriorityBadge priority={row.priority} /></td>
                      <td className="px-4 py-3 text-slate-600">{row.ownerName}</td>
                      <td className="px-4 py-3"><SlaBadge sla={row.sla} /></td>
                      <td className="px-4 py-3 capitalize text-slate-600">{statusLabel(row.status)}</td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setSelectedRequestId(row.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">Open</button>
                      </td>
                    </tr>
                  ))}
                  {!visibleRows.length ? (
                    <tr>
                      <td colSpan="8" className="px-4 py-10 text-center text-sm text-slate-500">No partner requests in this queue yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <RequestWorkspace
            request={selectedRequest}
            onReply={(request) => handleAction(() => {
              replyToPartnerRequest(request.id, { message: 'Thanks for the update. We are reviewing this now.' }, workspaceContext, options)
              refresh('Reply recorded and partner-visible response queued.')
            })}
            onInternalNote={(request) => handleAction(() => {
              addInternalNote(request.id, { note: 'Internal context captured for branch oversight.' }, workspaceContext, options)
              refresh('Internal note saved. It is hidden from the partner portal.')
            })}
            onAccept={(request) => handleAction(() => {
              reviewPartnerDocument(request.id, 'accepted', workspaceContext, options)
              refresh('Document accepted and request resolved.')
            })}
            onReject={(request) => handleAction(() => {
              reviewPartnerDocument(request.id, 'rejected', workspaceContext, options)
              refresh('Document rejected and partner replacement requested.')
            })}
            onResolve={(request) => handleAction(() => {
              resolveSupportTicket(request.id, { resolution: 'Resolved by internal operations.' }, workspaceContext, options)
              refresh('Partner request resolved.')
            })}
            onEscalate={(request) => handleAction(() => {
              escalatePartnerRequest(request.id, { reason: 'Manual escalation from Partner Inbox.' }, workspaceContext, options)
              refresh('Partner request escalated to management oversight.')
            })}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-950">Branch Oversight</h2>
            <div className="mt-3 space-y-2">
              {dashboard.branches.slice(0, 4).map((row) => (
                <div key={row.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm">
                  <span className="font-medium text-slate-700">{row.name}</span>
                  <span className="text-slate-500">{row.openRequests} open · {row.breaches} breaches</span>
                </div>
              ))}
              {!dashboard.branches.length ? <p className="text-sm text-slate-500">No branch request volume yet.</p> : null}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-950">Consultant Load</h2>
            <div className="mt-3 space-y-2">
              {dashboard.consultants.slice(0, 4).map((row) => (
                <div key={row.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm">
                  <span className="font-medium text-slate-700">{row.name}</span>
                  <span className="text-slate-500">{row.openRequests} open · {row.responseTime}h</span>
                </div>
              ))}
              {!dashboard.consultants.length ? <p className="text-sm text-slate-500">No consultant workload yet.</p> : null}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-950">Partner Health</h2>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{dashboard.health.health}</p>
            <p className="mt-2 text-sm text-slate-500">Escalation rate {dashboard.health.escalationRate}% · document completion {dashboard.health.documentCompletionRate}%</p>
          </div>
        </section>
      </div>
    </main>
  )
}
