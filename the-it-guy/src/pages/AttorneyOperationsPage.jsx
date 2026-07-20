import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileClock,
  FileText,
  Gavel,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import useAttorneyPermissions from '../hooks/useAttorneyPermissions'
import { isAttorneyMatterModuleEnabled } from '../services/attorneyMatterModules'
import { getAttorneyOperationalWorkspaceData } from '../services/attorneyOperations'

const PIPELINE_STAGES = [
  { key: 'instruction', label: 'Instruction', match: ['instruction', 'attorney preparation', 'avail'] },
  { key: 'fica', label: 'FICA', match: ['fica', 'client documents'] },
  { key: 'drafting', label: 'Drafting', match: ['draft', 'prepared', 'preparation'] },
  { key: 'signing', label: 'Signing', match: ['sign', 'otp'] },
  { key: 'guarantees', label: 'Guarantees', match: ['guarantee', 'finance'] },
  { key: 'lodgement', label: 'Lodgement', match: ['lodgement', 'submitted'] },
  { key: 'registration', label: 'Registration', match: ['registration', 'registered'] },
]

function formatDate(value) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return 'No date'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(value) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return 'No time set'
  return date.toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function daysSince(value) {
  const timestamp = new Date(value || '').getTime()
  if (!Number.isFinite(timestamp)) return 0
  return Math.max(0, Math.round((Date.now() - timestamp) / 86400000))
}

function normalizeText(value) {
  return String(value || '').trim()
}

function titleize(value = '') {
  return normalizeText(value)
    .split(/[_\s+-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function initials(value = '') {
  const text = normalizeText(value)
  if (!text) return 'TM'
  return text
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

function matchesSearch(row = {}, searchTerm = '') {
  const query = normalizeText(searchTerm).toLowerCase()
  if (!query) return true
  return [
    row.matterReference,
    row.clientName,
    row.issue,
    row.currentStage,
    row.matterType,
    row.status,
    row.assignedRole,
    row.assignedAttorneyName,
    row.documentType,
    row.appointmentType,
  ].some((value) => normalizeText(value).toLowerCase().includes(query))
}

function rowMatchesPipelineStage(row = {}, stageKey = 'all') {
  if (!stageKey || stageKey === 'all') return true
  const stage = PIPELINE_STAGES.find((item) => item.key === stageKey)
  if (!stage) return true
  const stageText = normalizeText(row.currentStage).toLowerCase()
  return stage.match.some((keyword) => stageText.includes(keyword))
}

function getStatusTone(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized.includes('attention') || normalized.includes('delayed') || normalized.includes('blocked')) {
    return 'bg-red-50 text-red-700 ring-red-100'
  }
  if (normalized.includes('client') || normalized.includes('signature') || normalized.includes('fica')) {
    return 'bg-amber-50 text-amber-700 ring-amber-100'
  }
  if (normalized.includes('track') || normalized.includes('registered')) {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-100'
  }
  return 'bg-slate-50 text-slate-600 ring-slate-100'
}

function getSeverityTone(priority = '') {
  const normalized = normalizeText(priority).toLowerCase()
  if (normalized === 'high') return 'bg-red-500'
  if (normalized === 'medium') return 'bg-amber-500'
  return 'bg-slate-300'
}

function LoadingState({ copy = 'Loading conveyancing operations...' }) {
  return (
    <section className="min-h-screen bg-[#f5f7fb] px-4 py-5">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-sm font-semibold text-slate-500">{copy}</p>
      </div>
    </section>
  )
}

function PageHeader({ currentUser, metrics, lastUpdated }) {
  return (
    <header className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex justify-end">
        <div className="flex flex-col gap-3 lg:items-end">
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
              <ShieldCheck size={13} />
              {currentUser?.roleLabel || 'Attorney user'}
            </span>
            <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
              {metrics.activeMatters} matters
            </span>
            <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
              Updated {formatDateTime(lastUpdated)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/new-transaction" className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#12314f] px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1b4264]">
              <BriefcaseBusiness size={15} />
              New Matter
            </Link>
            <Link to="/reports" className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              Reports
            </Link>
            <Link to="/attorney/scheduling" className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              Scheduling
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}

function FilterToolbar({
  data,
  filters,
  setFilters,
  searchTerm,
  setSearchTerm,
  availableMatterTypes,
  availableStatuses,
}) {
  const selectClass = 'h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50'

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="grid gap-2 xl:grid-cols-[minmax(260px,1.4fr)_repeat(4,minmax(140px,1fr))]">
        <label className="relative block min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search matters, clients, blockers..."
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
          />
        </label>
        <select className={selectClass} value={filters.department} onChange={(event) => setFilters((previous) => ({ ...previous, department: event.target.value }))}>
          <option value="all">All Departments</option>
          {(data.availableFilters?.departments || []).map((department) => (
            <option key={department.value} value={department.value}>{department.label}</option>
          ))}
        </select>
        <select className={selectClass} value={filters.member} onChange={(event) => setFilters((previous) => ({ ...previous, member: event.target.value }))}>
          <option value="all">All Staff</option>
          {(data.availableFilters?.members || []).map((member) => (
            <option key={member.value} value={member.value}>{member.label}</option>
          ))}
        </select>
        <select className={selectClass} value={filters.matterType} onChange={(event) => setFilters((previous) => ({ ...previous, matterType: event.target.value }))}>
          <option value="all">All Matter Types</option>
          {availableMatterTypes.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        <select className={selectClass} value={filters.status} onChange={(event) => setFilters((previous) => ({ ...previous, status: event.target.value }))}>
          <option value="all">All Statuses</option>
          {availableStatuses.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </div>
    </section>
  )
}

function MetricStrip({ metrics }) {
  const items = [
    { label: 'Active Matters', value: metrics.activeMatters, icon: BriefcaseBusiness },
    { label: 'Lodgements Pending', value: metrics.lodgementsPending, icon: Gavel },
    { label: 'Signatures Outstanding', value: metrics.pendingSignatures, icon: FileClock },
    { label: 'Matters at Risk', value: metrics.delayedMatters, icon: AlertTriangle, danger: metrics.delayedMatters > 0 },
    { label: 'Avg Days Active', value: `${metrics.avgDays}d`, icon: Clock3 },
    { label: 'SLA Compliance', value: `${metrics.sla}%`, icon: CheckCircle2 },
  ]

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <article key={item.label} className="min-h-[104px] rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{item.label}</p>
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${item.danger ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600'}`}>
                <Icon size={15} />
              </span>
            </div>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{item.value}</p>
          </article>
        )
      })}
    </section>
  )
}

function PipelineStrip({ rows = [], activeStage, onStageChange }) {
  const counts = PIPELINE_STAGES.map((stage) => {
    const count = rows.filter((row) => rowMatchesPipelineStage(row, stage.key)).length
    return { ...stage, count }
  })
  const max = Math.max(1, ...counts.map((stage) => stage.count))

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Matter Pipeline</h2>
          <p className="mt-1 text-sm text-slate-500">Operational stage distribution across visible matters.</p>
        </div>
        {activeStage !== 'all' ? (
          <button type="button" onClick={() => onStageChange('all')} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
            Clear stage
          </button>
        ) : null}
      </div>
      <div className="mt-4 flex gap-3 overflow-x-auto pb-1 xl:grid xl:grid-cols-7 xl:overflow-visible">
        {counts.map((stage) => {
          const active = activeStage === stage.key
          return (
            <button
              key={stage.key}
              type="button"
              onClick={() => onStageChange(active ? 'all' : stage.key)}
              className={`min-w-[156px] rounded-xl border p-3 text-left transition ${
                active ? 'border-[#12314f] bg-[#f5f8fb] shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-800">{stage.label}</span>
                <span className="text-base font-semibold text-slate-950">{stage.count}</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-[#12314f]" style={{ width: `${Math.max(8, (stage.count / max) * 100)}%` }} />
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function InterventionQueue({ rows = [] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Intervention Required</h2>
          <p className="mt-1 text-sm text-slate-500">Blocked, overdue, stalled, or time-sensitive operational work.</p>
        </div>
        <span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">{rows.length} open</span>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.length ? rows.slice(0, 9).map((row) => (
          <article key={row.id} className="grid gap-3 px-4 py-3 transition hover:bg-slate-50 md:grid-cols-[minmax(150px,0.9fr)_minmax(0,1.4fr)_minmax(130px,0.7fr)_96px] md:items-center">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${getSeverityTone(row.priority)}`} />
                <p className="truncate text-sm font-semibold text-slate-950">{row.matterReference || 'Matter'}</p>
              </div>
              <p className="mt-1 truncate text-xs text-slate-500">{row.clientName || 'Unassigned client'}</p>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">{row.issue || 'Operational action required'}</p>
              <p className="mt-1 truncate text-xs text-slate-500">{row.assignedRole || 'Unassigned'} • {titleize(row.priority || 'normal')}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Due date</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{formatDate(row.dueDate)}</p>
            </div>
            <Link to={row.actionHref || '#'} className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              Open <ArrowRight size={13} />
            </Link>
          </article>
        )) : (
          <div className="px-4 py-8">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
              <p className="text-sm font-semibold text-emerald-800">No urgent interventions right now.</p>
              <p className="mt-1 text-sm text-emerald-700">Documents, signatures, guarantees, and workflow movement are currently under control.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function TeamCapacity({ members = [], matters = [] }) {
  const rows = members.slice(0, 7).map((member) => {
    const active = matters.filter((matter) => String(matter.assignedUserId || '') === String(member.value)).length
    const atRisk = matters.filter((matter) => String(matter.assignedUserId || '') === String(member.value) && (matter.status === 'Needs Attention' || matter.flags?.delayed)).length
    return { ...member, active, atRisk }
  })
  const max = Math.max(1, ...rows.map((row) => row.active))

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">Team Capacity</h2>
        <span className="text-xs font-semibold text-slate-500">{rows.length} active staff</span>
      </div>
      <div className="mt-4 space-y-3">
        {rows.length ? rows.map((row) => (
          <div key={row.value} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[0.65rem] font-bold text-white">{initials(row.label)}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{row.label}</p>
                  <p className="truncate text-xs text-slate-500">{titleize(row.role || 'firm staff')}</p>
                </div>
              </div>
              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.atRisk ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600'}`}>
                {row.active}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${row.atRisk ? 'bg-red-500' : 'bg-[#12314f]'}`} style={{ width: `${Math.max(8, (row.active / max) * 100)}%` }} />
            </div>
          </div>
        )) : (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">Staff capacity will appear once firm members are active.</p>
        )}
      </div>
    </section>
  )
}

function OperationalFeed({ rows = [] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-slate-950">Operational Feed</h2>
      <div className="mt-3 divide-y divide-slate-100">
        {rows.length ? rows.slice(0, 7).map((row) => (
          <div key={row.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
              <BarChart3 size={14} />
            </span>
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-medium leading-5 text-slate-800">{row.message}</p>
              <p className="mt-1 text-xs text-slate-500">{row.source || 'Operations'} • {formatDateTime(row.occurredAt)}</p>
            </div>
          </div>
        )) : (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">Matter, document, signing, and registration updates will appear here.</p>
        )}
      </div>
    </section>
  )
}

function MattersTable({ rows = [] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Active Matters</h2>
          <p className="mt-1 text-sm text-slate-500">Compact operational register for quick matter access.</p>
        </div>
        <span className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">{rows.length} matters</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-slate-50/95 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Matter Ref</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Current Stage</th>
              <th className="px-4 py-3">Assigned Attorney</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Days Active</th>
              <th className="px-4 py-3">Next Action</th>
              <th className="px-4 py-3 text-right">Open</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length ? rows.map((row, index) => {
              const nextAction =
                row.flags?.guaranteesOutstanding ? 'Follow guarantees' :
                  row.flags?.awaitingSignatures ? 'Chase signatures' :
                    row.flags?.awaitingFica ? 'Request FICA' :
                      row.flags?.lodgementPending ? 'Prepare lodgement' :
                        'Review matter'
              return (
                <tr key={row.matterId || row.assignmentId || index} className="transition hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-950">{row.matterReference || 'Matter'}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{row.matterType || 'Transfer'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{row.clientName || 'Unassigned client'}</p>
                    <p className="mt-0.5 max-w-[220px] truncate text-xs text-slate-500">{row.propertyLabel || 'Property pending'}</p>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-700">{row.currentStage || 'Unknown'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{row.assignedAttorneyName || row.assignedRole || 'Unassigned'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${getStatusTone(row.status)}`}>
                      {row.status || 'Unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-700">{daysSince(row.lastUpdated)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{nextAction}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={row.actionHref || '#'} className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-white hover:shadow-sm">
                      Open
                    </Link>
                  </td>
                </tr>
              )
            }) : (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm font-medium text-slate-500">No active matters match the current filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function OperationalIntelligence({ metrics, appointmentRows, matterRows }) {
  const guaranteeWatch = matterRows.filter((row) => row.flags?.guaranteesOutstanding || row.flags?.bankConditionsPending).length
  const delayed = matterRows.filter((row) => row.status === 'Needs Attention' || row.flags?.delayed).length
  const items = [
    { label: 'Upcoming signings', value: appointmentRows.length + metrics.pendingSignatures },
    { label: 'Registrations moving this week', value: metrics.lodgementsThisWeek },
    { label: 'Bank / guarantee watch', value: guaranteeWatch },
    { label: 'Delayed matters', value: delayed },
  ]

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Operational Intelligence</h2>
          <p className="mt-1 text-sm text-slate-500">A concise watchlist for this operating window.</p>
        </div>
        <Link to="/reports" className="text-sm font-semibold text-[#12314f]">View reports</Link>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-sm font-medium text-slate-500">{item.label}</p>
            <p className="mt-2 text-xl font-semibold text-slate-950">{item.value}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function AttorneyOperationsPage() {
  const { role } = useWorkspace()
  const permissionsState = useAttorneyPermissions()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [pipelineStage, setPipelineStage] = useState('all')
  const [filters, setFilters] = useState({
    department: 'all',
    member: 'all',
    matterType: 'all',
    status: 'all',
  })

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError('')
      try {
        const next = await getAttorneyOperationalWorkspaceData()
        if (!active) return
        setData(next)
      } catch (loadError) {
        if (!active) return
        setError(loadError?.message || 'Unable to load attorney operations.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (filters.matterType === 'all') return
    if (isAttorneyMatterModuleEnabled(permissionsState.matterModules, filters.matterType)) return
    setFilters((previous) => ({ ...previous, matterType: 'all' }))
  }, [filters.matterType, permissionsState.matterModules])

  const availableMatterTypes = useMemo(
    () => (data?.availableFilters?.matterTypes || []).filter((option) =>
      option.value === 'all' || isAttorneyMatterModuleEnabled(permissionsState.matterModules, option.value),
    ),
    [data?.availableFilters?.matterTypes, permissionsState.matterModules],
  )
  const availableStatuses = data?.availableFilters?.statuses || []

  const matterByReference = useMemo(
    () =>
      (data?.matterQueue || []).reduce((accumulator, row) => {
        accumulator[row.matterReference] = row
        return accumulator
      }, {}),
    [data?.matterQueue],
  )

  const visibleMatterRows = useMemo(() => {
    let rows = [...(data?.matterQueue || [])].filter((row) => isAttorneyMatterModuleEnabled(permissionsState.matterModules, row.matterType))
    if (filters.matterType !== 'all') rows = rows.filter((row) => row.matterType === filters.matterType)
    if (filters.status !== 'all') rows = rows.filter((row) => row.status === filters.status)
    if (filters.department !== 'all') rows = rows.filter((row) => row.assignedDepartmentId === filters.department)
    if (filters.member !== 'all') rows = rows.filter((row) => String(row.assignedUserId || '') === String(filters.member))
    return rows.filter((row) => matchesSearch(row, searchTerm))
  }, [data?.matterQueue, filters.department, filters.matterType, filters.member, filters.status, permissionsState.matterModules, searchTerm])

  const stageFilteredMatterRows = useMemo(() => {
    let rows = visibleMatterRows.filter((row) => rowMatchesPipelineStage(row, pipelineStage))
    return rows.filter((row) => matchesSearch(row, searchTerm))
  }, [pipelineStage, searchTerm, visibleMatterRows])

  const priorityRows = useMemo(() => {
    const visibleReferences = new Set(stageFilteredMatterRows.map((row) => row.matterReference))
    return (data?.priorityQueue || [])
      .filter((row) => !visibleReferences.size || visibleReferences.has(row.matterReference))
      .filter((row) => {
        const matter = matterByReference[row.matterReference]
        if (!matter) return true
        if (filters.matterType !== 'all' && matter.matterType !== filters.matterType) return false
        if (filters.status !== 'all' && matter.status !== filters.status) return false
        return true
      })
      .filter((row) => matchesSearch(row, searchTerm))
  }, [data?.priorityQueue, filters.matterType, filters.status, matterByReference, searchTerm, stageFilteredMatterRows])

  const appointmentRows = useMemo(
    () => (data?.appointmentQueue || []).filter((row) => matchesSearch(row, searchTerm)),
    [data?.appointmentQueue, searchTerm],
  )

  const metrics = useMemo(() => {
    const activeMatters = stageFilteredMatterRows.length
    const delayedMatters = stageFilteredMatterRows.filter((row) => row.status === 'Needs Attention' || row.flags?.delayed).length
    const pendingSignatures = Number(data?.kpis?.pendingSignatures || 0)
    const lodgementsPending = stageFilteredMatterRows.filter((row) => {
      const stage = normalizeText(row.currentStage).toLowerCase()
      return stage.includes('lodgement') || stage.includes('registration') || row.flags?.lodgementPending
    }).length
    const avgDays = activeMatters
      ? Math.round(stageFilteredMatterRows.reduce((sum, row) => sum + daysSince(row.lastUpdated), 0) / activeMatters)
      : 0
    const onTrack = stageFilteredMatterRows.filter((row) => row.status === 'On Track').length
    const sla = activeMatters ? Math.round((onTrack / activeMatters) * 100) : 100
    const lodgementsThisWeek = stageFilteredMatterRows.filter((row) => {
      const stage = normalizeText(row.currentStage).toLowerCase()
      return stage.includes('lodgement') || stage.includes('registration') || row.flags?.lodgementPending
    }).length

    return {
      activeMatters,
      delayedMatters,
      pendingSignatures,
      lodgementsPending,
      avgDays,
      sla,
      lodgementsThisWeek,
    }
  }, [data?.kpis?.pendingSignatures, stageFilteredMatterRows])

  const lastUpdated = useMemo(() => {
    const latest = [...(data?.matterQueue || []), ...(data?.recentUpdates || [])]
      .map((row) => new Date(row.lastUpdated || row.occurredAt || '').getTime())
      .filter(Number.isFinite)
      .sort((left, right) => right - left)[0]
    return latest ? new Date(latest).toISOString() : new Date().toISOString()
  }, [data?.matterQueue, data?.recentUpdates])

  if (role !== 'attorney') return <Navigate to="/dashboard" replace />
  if (permissionsState.loading) return <LoadingState copy="Loading attorney permissions..." />

  if (permissionsState.error) {
    return (
      <section className="min-h-screen bg-[#f5f7fb] px-4 py-5">
        <div className="rounded-2xl border border-red-200 bg-white p-4 text-sm font-semibold text-red-700 shadow-sm">
          {permissionsState.error}
        </div>
      </section>
    )
  }

  if (permissionsState.membership && !permissionsState.membership.isActive) {
    return (
      <section className="min-h-screen bg-[#f5f7fb] px-4 py-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">Operational access unavailable</h2>
          <p className="mt-2 text-sm text-slate-500">
            {permissionsState.membership.status === 'suspended'
              ? 'Your access to this firm has been suspended. Please contact your firm administrator.'
              : 'You are not an active member of this attorney firm.'}
          </p>
        </div>
      </section>
    )
  }

  if (loading) return <LoadingState />
  if (!data?.firm?.id) return <Navigate to="/attorney/onboarding" replace />

  if (data?.accessBlocked) {
    return (
      <section className="min-h-screen bg-[#f5f7fb] px-4 py-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">Operational access unavailable</h2>
          <p className="mt-2 text-sm text-slate-500">Your attorney firm membership is not active. Please contact your firm administrator.</p>
        </div>
      </section>
    )
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-3 py-4 sm:px-5 lg:px-6">
      <div className="mx-auto grid max-w-[1680px] gap-4">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        <PageHeader firm={data.firm} currentUser={data.currentUser} metrics={metrics} lastUpdated={lastUpdated} />

        <FilterToolbar
          data={data}
          filters={filters}
          setFilters={setFilters}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          availableMatterTypes={availableMatterTypes}
          availableStatuses={availableStatuses}
        />

        <MetricStrip metrics={metrics} />

        <PipelineStrip rows={visibleMatterRows} activeStage={pipelineStage} onStageChange={setPipelineStage} />

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.75fr)]">
          <InterventionQueue rows={priorityRows} />
          <aside className="grid content-start gap-4">
            <TeamCapacity members={data.availableFilters?.members || []} matters={stageFilteredMatterRows} />
            <OperationalFeed rows={data.recentUpdates || []} />
          </aside>
        </section>

        <MattersTable rows={stageFilteredMatterRows} />

        <OperationalIntelligence metrics={metrics} appointmentRows={appointmentRows} matterRows={stageFilteredMatterRows} />
      </div>
    </main>
  )
}

export default AttorneyOperationsPage
