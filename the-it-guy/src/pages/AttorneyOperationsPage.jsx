import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  BarChart3,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileClock,
  FileText,
  Gavel,
  LayoutDashboard,
  Scale,
  Search,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import useAttorneyPermissions from '../hooks/useAttorneyPermissions'
import { getAttorneyOperationalWorkspaceData } from '../services/attorneyOperations'

const MANAGEMENT_ROLES = new Set(['firm_admin', 'director_partner'])

const PIPELINE_STAGES = [
  { key: 'instruction', label: 'Instruction', match: ['instruction', 'attorney preparation', 'avail'] },
  { key: 'fica', label: 'FICA', match: ['fica', 'client documents'] },
  { key: 'drafting', label: 'Drafting', match: ['draft', 'prepared', 'preparation'] },
  { key: 'signing', label: 'Signing', match: ['sign', 'otp'] },
  { key: 'guarantees', label: 'Guarantees', match: ['guarantee', 'finance'] },
  { key: 'lodgement', label: 'Lodgement', match: ['lodgement', 'submitted'] },
  { key: 'registration', label: 'Registration', match: ['registration', 'registered'] },
]

function filterMatterRows(rows = [], { matterType = 'all', status = 'all', member = 'all' }, isManagement) {
  let filtered = [...rows]

  if (matterType !== 'all') filtered = filtered.filter((row) => row.matterType === matterType)
  if (status !== 'all') filtered = filtered.filter((row) => row.status === status)
  if (isManagement && member !== 'all') filtered = filtered.filter((row) => String(row.assignedUserId || '') === String(member))

  return filtered
}

function filterPriorityRows(rows = [], { priority = 'all', matterType = 'all', status = 'all' }, matterByReference = {}) {
  let filtered = [...rows]

  if (priority !== 'all') filtered = filtered.filter((row) => String(row.priority || '').toLowerCase() === String(priority).toLowerCase())
  if (matterType !== 'all') {
    filtered = filtered.filter((row) => matterByReference[row.matterReference]?.matterType === matterType)
  }
  if (status !== 'all') {
    filtered = filtered.filter((row) => matterByReference[row.matterReference]?.status === status)
  }

  return filtered
}

function filterDocumentRows(rows = [], { status = 'all', matterType = 'all' }, matterByReference = {}) {
  let filtered = [...rows]
  if (status !== 'all') filtered = filtered.filter((row) => String(row.status || '').toLowerCase() === String(status).toLowerCase())
  if (matterType !== 'all') filtered = filtered.filter((row) => matterByReference[row.matterReference]?.matterType === matterType)
  return filtered
}

function filterAppointmentRows(rows = [], { status = 'all', matterType = 'all' }, matterByReference = {}) {
  let filtered = [...rows]
  if (status !== 'all') filtered = filtered.filter((row) => String(row.status || '').toLowerCase() === String(status).toLowerCase())
  if (matterType !== 'all') filtered = filtered.filter((row) => matterByReference[row.matterReference]?.matterType === matterType)
  return filtered
}

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
  if (!Number.isFinite(timestamp)) return null
  return Math.max(0, Math.round((Date.now() - timestamp) / 86400000))
}

function normalizeText(value) {
  return String(value || '').trim()
}

function initials(value = '') {
  const text = normalizeText(value)
  if (!text) return 'LA'
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
    row.documentType,
    row.appointmentType,
  ].some((value) => normalizeText(value).toLowerCase().includes(query))
}

function countThisWeek(rows = [], dateKey = 'lastUpdated') {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay() + 1)
  return rows.filter((row) => {
    const timestamp = new Date(row?.[dateKey] || '').getTime()
    return Number.isFinite(timestamp) && timestamp >= start.getTime()
  }).length
}

function MetricCard({ label, value, context, icon: Icon, tone = 'navy', hero = false }) {
  const toneClasses = {
    navy: 'bg-[#f8fbff] text-[#16324f]',
    amber: 'bg-[#fff8ec] text-[#8a4a00]',
    red: 'bg-[#fff4f2] text-[#9f271b]',
    green: 'bg-[#eef9f3] text-[#1e6e45]',
    blue: 'bg-[#eef6ff] text-[#174e82]',
  }

  return (
    <article className={`group rounded-[18px] border border-[#dce7f2] bg-white p-4 shadow-[0_16px_44px_rgba(15,32,54,0.07)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_58px_rgba(15,32,54,0.11)] ${hero ? 'md:col-span-2' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7388a1]">{label}</p>
          <p className="mt-2 text-3xl font-bold leading-none text-[#142132] sm:text-4xl">{value}</p>
        </div>
        {Icon ? (
          <span className={`inline-flex h-10 w-10 items-center justify-center rounded-[14px] ${toneClasses[tone] || toneClasses.navy}`}>
            <Icon size={18} />
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-sm font-medium text-[#63788f]">{context}</p>
    </article>
  )
}

function HeroHeader({ firm, currentUser, data, metrics }) {
  const staffCount = data?.availableFilters?.members?.length || 0
  const departmentsCount = data?.availableFilters?.departments?.length || 0
  const firmName = firm?.name || 'Attorney Firm'

  return (
    <section className="overflow-hidden rounded-[28px] border border-[#d7e2ef] bg-[#101d2e] text-white shadow-[0_28px_80px_rgba(16,29,46,0.22)]">
      <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:p-8">
        <div className="absolute inset-0 opacity-70 [background:radial-gradient(circle_at_18%_12%,rgba(67,118,158,0.35),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_45%)]" />
        <div className="relative flex min-w-0 gap-4">
          <div className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-[22px] border border-white/15 bg-white/10 text-xl font-black shadow-inner sm:flex">
            {initials(firmName)}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9fb6cf]">Legal Operations Command Center</p>
            <h1 className="mt-3 text-3xl font-bold leading-tight tracking-normal text-white sm:text-4xl">Conveyancing Operations</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#d6e1ec] sm:text-base">
              Monitor registrations, signing workflows, staff performance, and transaction bottlenecks across {firmName}.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-[#e8f1f9]">
                <ShieldCheck size={14} /> Operational
              </span>
              <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-[#e8f1f9]">
                {metrics.activeMatters} Active Matters
              </span>
              <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-[#e8f1f9]">
                {staffCount} Staff • {departmentsCount} Departments
              </span>
              <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-[#e8f1f9]">
                {metrics.pendingSignatures} Signing Actions
              </span>
            </div>
          </div>
        </div>

        <div className="relative flex flex-col gap-2 sm:flex-row lg:flex-col">
          <Link to="/new-transaction" className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[14px] bg-white px-5 text-sm font-bold text-[#102236] shadow-[0_18px_38px_rgba(0,0,0,0.22)]">
            <BriefcaseBusiness size={16} /> New Matter
          </Link>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <Link to="/attorney/dashboard" className="inline-flex min-h-[42px] items-center justify-center rounded-[13px] border border-white/15 bg-white/10 px-4 text-sm font-semibold text-white">
              Management
            </Link>
            <Link to="/attorney/scheduling" className="inline-flex min-h-[42px] items-center justify-center rounded-[13px] border border-white/15 bg-white/10 px-4 text-sm font-semibold text-white">
              Scheduling
            </Link>
            <Link to="/reports" className="inline-flex min-h-[42px] items-center justify-center rounded-[13px] border border-white/15 bg-white/10 px-4 text-sm font-semibold text-white">
              Reports
            </Link>
          </div>
        </div>

        <div className="relative grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-3 lg:col-span-2">
          <div>
            <p className="text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-[#9fb6cf]">Firm</p>
            <p className="mt-1 text-lg font-bold text-white">{firmName}</p>
          </div>
          <div>
            <p className="text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-[#9fb6cf]">Current Role</p>
            <p className="mt-1 text-lg font-bold text-white">{currentUser?.roleLabel || 'Attorney User'}</p>
          </div>
          <div>
            <p className="text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-[#9fb6cf]">Daily Load</p>
            <p className="mt-1 text-lg font-bold text-white">{metrics.tasksDueToday} due today</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function FilterToolbar({
  isManagementUser,
  data,
  availableMatterTypes,
  availableStatuses,
  managementFilters,
  setManagementFilters,
  userFilters,
  setUserFilters,
  searchTerm,
  setSearchTerm,
}) {
  return (
    <section className="rounded-[22px] border border-[#d9e4f0] bg-white/90 p-3 shadow-[0_16px_44px_rgba(15,32,54,0.06)] backdrop-blur">
      <div className="grid gap-3 lg:grid-cols-[minmax(260px,1.4fr)_repeat(4,minmax(150px,1fr))]">
        <label className="flex min-h-[48px] items-center gap-3 rounded-[15px] border border-[#d5e1ed] bg-[#f8fbff] px-4">
          <Search size={17} className="text-[#7890a8]" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search matters, clients, blockers..."
            className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-[#17283d] outline-none placeholder:text-[#8ba0b5]"
          />
          <kbd className="hidden rounded-md bg-white px-2 py-1 text-[0.65rem] font-bold text-[#7d91a7] shadow-sm sm:inline">⌘K</kbd>
        </label>

        {isManagementUser ? (
          <>
            <select className="min-h-[48px] rounded-[15px] border border-[#d5e1ed] bg-white px-4 text-sm font-semibold text-[#23384e]" value={managementFilters.department} onChange={(event) => setManagementFilters((prev) => ({ ...prev, department: event.target.value }))}>
              <option value="all">All Departments</option>
              {(data.availableFilters?.departments || []).map((department) => <option key={department.value} value={department.value}>{department.label}</option>)}
            </select>
            <select className="min-h-[48px] rounded-[15px] border border-[#d5e1ed] bg-white px-4 text-sm font-semibold text-[#23384e]" value={managementFilters.member} onChange={(event) => setManagementFilters((prev) => ({ ...prev, member: event.target.value }))}>
              <option value="all">All Staff</option>
              {(data.availableFilters?.members || []).map((member) => <option key={member.value} value={member.value}>{member.label}</option>)}
            </select>
          </>
        ) : (
          <select className="min-h-[48px] rounded-[15px] border border-[#d5e1ed] bg-white px-4 text-sm font-semibold text-[#23384e]" value={userFilters.priority} onChange={(event) => setUserFilters((prev) => ({ ...prev, priority: event.target.value }))}>
            <option value="all">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        )}

        <select className="min-h-[48px] rounded-[15px] border border-[#d5e1ed] bg-white px-4 text-sm font-semibold text-[#23384e]" value={isManagementUser ? managementFilters.matterType : userFilters.matterType} onChange={(event) => {
          if (isManagementUser) setManagementFilters((prev) => ({ ...prev, matterType: event.target.value }))
          else setUserFilters((prev) => ({ ...prev, matterType: event.target.value }))
        }}>
          <option value="all">All Matter Types</option>
          {availableMatterTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <select className="min-h-[48px] rounded-[15px] border border-[#d5e1ed] bg-white px-4 text-sm font-semibold text-[#23384e]" value={isManagementUser ? managementFilters.status : userFilters.status} onChange={(event) => {
          if (isManagementUser) setManagementFilters((prev) => ({ ...prev, status: event.target.value }))
          else setUserFilters((prev) => ({ ...prev, status: event.target.value }))
        }}>
          <option value="all">All Statuses</option>
          {availableStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </div>
    </section>
  )
}

function PipelineVisualization({ rows = [] }) {
  const counts = PIPELINE_STAGES.map((stage) => {
    const count = rows.filter((row) => {
      const stageText = normalizeText(row.currentStage).toLowerCase()
      return stage.match.some((keyword) => stageText.includes(keyword))
    }).length
    return { ...stage, count }
  })
  const max = Math.max(1, ...counts.map((stage) => stage.count))

  return (
    <section className="rounded-[22px] border border-[#d9e4f0] bg-white p-5 shadow-[0_18px_52px_rgba(15,32,54,0.07)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7388a1]">Matter Pipeline</p>
          <h2 className="mt-1 text-xl font-bold text-[#142132]">Conveyancing Flow</h2>
        </div>
        <span className="rounded-full bg-[#eef5fb] px-3 py-1.5 text-xs font-bold text-[#284b68]">{rows.length} matters</span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        {counts.map((stage) => (
          <div key={stage.key} className="rounded-[16px] border border-[#e0e9f3] bg-[#f9fbfe] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-[#314a63]">{stage.label}</p>
              <span className="text-lg font-bold text-[#142132]">{stage.count}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e2ebf4]">
              <div className="h-full rounded-full bg-[#173b5f]" style={{ width: `${Math.max(8, (stage.count / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function PriorityWorkQueue({ rows = [] }) {
  return (
    <section className="rounded-[22px] border border-[#d9e4f0] bg-white p-5 shadow-[0_18px_52px_rgba(15,32,54,0.07)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7388a1]">Priority Work Queue</p>
          <h2 className="mt-1 text-xl font-bold text-[#142132]">Intervention Required</h2>
        </div>
        <span className="rounded-full bg-[#fff4f2] px-3 py-1.5 text-xs font-bold text-[#9f271b]">{rows.length} open</span>
      </div>

      <div className="mt-4 grid gap-3">
        {rows.length ? rows.slice(0, 8).map((row) => {
          const priority = normalizeText(row.priority).toLowerCase()
          const isHigh = priority === 'high'
          return (
            <Link key={row.id} to={row.actionHref || '#'} className="group grid gap-3 rounded-[18px] border border-[#dde7f2] bg-[#fbfdff] p-4 transition hover:-translate-y-0.5 hover:border-[#b9cce0] hover:shadow-[0_18px_42px_rgba(15,32,54,0.08)] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto]">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${isHigh ? 'bg-[#c0392b]' : 'bg-[#d59c35]'}`} />
                  <p className="truncate text-sm font-bold text-[#142132]">{row.matterReference || 'Matter'}</p>
                </div>
                <p className="mt-1 truncate text-sm text-[#63788f]">{row.clientName || 'Unassigned client'}</p>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#23384e]">{row.issue || 'Operational action required'}</p>
                <p className="mt-1 text-xs font-medium text-[#7b8fa6]">Due {formatDate(row.dueDate)} • {row.assignedRole || 'Unassigned'}</p>
              </div>
              <span className="inline-flex items-center justify-between gap-2 rounded-full border border-[#d7e2ef] bg-white px-3 py-2 text-xs font-bold text-[#24465d] md:justify-center">
                Open <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          )
        }) : (
          <div className="rounded-[18px] border border-[#d4ebdd] bg-[#f1faf5] p-5">
            <p className="font-bold text-[#1d6f47]">No matters currently require urgent intervention.</p>
            <p className="mt-1 text-sm text-[#4c7b62]">All registrations, document requests, and signing actions are currently on track.</p>
          </div>
        )}
      </div>
    </section>
  )
}

function MatterQueue({ rows = [] }) {
  return (
    <section className="rounded-[22px] border border-[#d9e4f0] bg-white p-5 shadow-[0_18px_52px_rgba(15,32,54,0.07)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7388a1]">Matter Register</p>
          <h2 className="mt-1 text-xl font-bold text-[#142132]">Active Matters</h2>
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-[18px] border border-[#e0e9f3]">
        {rows.length ? rows.slice(0, 10).map((row, index) => (
          <Link key={row.matterId || row.assignmentId || index} to={row.actionHref || '#'} className="grid gap-3 border-b border-[#edf2f7] bg-white p-4 transition last:border-b-0 hover:bg-[#f8fbff] md:grid-cols-[1.1fr_1fr_1fr_1fr_auto]">
            <div>
              <p className="font-bold text-[#142132]">{row.matterReference || 'Matter'}</p>
              <p className="mt-1 text-sm text-[#63788f]">{row.clientName || 'Unassigned client'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8799ad]">Stage</p>
              <p className="mt-1 text-sm font-semibold text-[#23384e]">{row.currentStage || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8799ad]">Assigned</p>
              <p className="mt-1 text-sm font-semibold text-[#23384e]">{row.assignedAttorneyName || row.assignedRole || 'Unassigned'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8799ad]">Status</p>
              <p className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${row.status === 'Needs Attention' ? 'bg-[#fff4f2] text-[#9f271b]' : row.status === 'On Track' ? 'bg-[#eef9f3] text-[#1e6e45]' : 'bg-[#fff8ec] text-[#8a4a00]'}`}>{row.status || 'Unknown'}</p>
            </div>
            <span className="inline-flex items-center gap-2 self-center text-sm font-bold text-[#24465d]">Open <ArrowRight size={14} /></span>
          </Link>
        )) : (
          <div className="p-5 text-sm font-medium text-[#63788f]">No active matters match the current filters.</div>
        )}
      </div>
    </section>
  )
}

function TransactionActionsCenter({ documents = [], appointments = [], pendingSignatures = 0, allowedDocuments = true, allowedAppointments = true }) {
  const rejectedDocs = documents.filter((row) => normalizeText(row.status).toLowerCase() === 'rejected').length
  const uploadedDocs = documents.filter((row) => normalizeText(row.status).toLowerCase() === 'uploaded').length
  const pendingAppointments = appointments.filter((row) => /pending|requested|proposed|reschedule/i.test(row.status || '')).length
  const rows = [
    { label: 'Pending signatures', value: pendingSignatures, icon: FileClock, href: '/documents' },
    { label: 'Document actions', value: allowedDocuments ? documents.length : '—', icon: FileText, href: '/documents' },
    { label: 'Rejected docs', value: rejectedDocs, icon: AlertTriangle, href: '/documents' },
    { label: 'Uploads to review', value: uploadedDocs, icon: FileCheck2, href: '/documents' },
    { label: 'Signing appointments', value: allowedAppointments ? appointments.length : '—', icon: CalendarClock, href: '/attorney/scheduling' },
    { label: 'Confirmations due', value: pendingAppointments, icon: Clock3, href: '/attorney/scheduling' },
  ]

  return (
    <section className="rounded-[22px] border border-[#d9e4f0] bg-white p-5 shadow-[0_18px_52px_rgba(15,32,54,0.07)]">
      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7388a1]">Transaction Actions Center</p>
      <h2 className="mt-1 text-xl font-bold text-[#142132]">Documents & Signing</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map((row) => {
          const Icon = row.icon
          return (
            <Link key={row.label} to={row.href} className="rounded-[16px] border border-[#e0e9f3] bg-[#f9fbfe] p-4 transition hover:border-[#bdd0e2] hover:bg-white">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-bold text-[#23384e]">{row.label}</p>
                <Icon size={16} className="text-[#55718d]" />
              </div>
              <p className="mt-3 text-2xl font-bold text-[#142132]">{row.value}</p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function StaffCapacity({ members = [], matters = [] }) {
  const rows = members.slice(0, 6).map((member) => {
    const active = matters.filter((matter) => String(matter.assignedUserId || '') === String(member.value)).length
    const atRisk = matters.filter((matter) => String(matter.assignedUserId || '') === String(member.value) && matter.status === 'Needs Attention').length
    return { ...member, active, atRisk }
  })

  return (
    <section className="rounded-[22px] border border-[#d9e4f0] bg-white p-5 shadow-[0_18px_52px_rgba(15,32,54,0.07)]">
      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7388a1]">Staff Operations</p>
      <h2 className="mt-1 text-xl font-bold text-[#142132]">Team Capacity</h2>
      <div className="mt-4 grid gap-3">
        {rows.length ? rows.map((row) => (
          <div key={row.value} className="rounded-[16px] border border-[#e0e9f3] bg-[#fbfdff] p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#173b5f] text-xs font-bold text-white">{initials(row.label)}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[#142132]">{row.label}</p>
                  <p className="text-xs text-[#74879b]">{row.role?.replace(/_/g, ' ') || 'Firm staff'}</p>
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.atRisk ? 'bg-[#fff4f2] text-[#9f271b]' : 'bg-[#eef9f3] text-[#1e6e45]'}`}>
                {row.active} active
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e4edf5]">
              <div className={`h-full rounded-full ${row.atRisk ? 'bg-[#c0392b]' : 'bg-[#173b5f]'}`} style={{ width: `${Math.min(100, Math.max(8, row.active * 14))}%` }} />
            </div>
          </div>
        )) : (
          <div className="rounded-[16px] border border-[#e0e9f3] bg-[#fbfdff] p-4 text-sm font-medium text-[#63788f]">
            Staff capacity will populate once firm members are active.
          </div>
        )}
      </div>
    </section>
  )
}

function RecentActivity({ rows = [] }) {
  return (
    <section className="rounded-[22px] border border-[#d9e4f0] bg-white p-5 shadow-[0_18px_52px_rgba(15,32,54,0.07)]">
      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7388a1]">Recent Activity</p>
      <h2 className="mt-1 text-xl font-bold text-[#142132]">Operational Feed</h2>
      <div className="mt-4 grid gap-3">
        {rows.length ? rows.slice(0, 7).map((row) => (
          <div key={row.id} className="grid grid-cols-[36px_minmax(0,1fr)] gap-3 rounded-[16px] border border-[#e0e9f3] bg-[#fbfdff] p-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#eef5fb] text-[#24465d]">
              <Gavel size={15} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-5 text-[#23384e]">{row.message}</p>
              <p className="mt-1 text-xs font-medium text-[#7b8fa6]">{row.source || 'Operations'} • {formatDateTime(row.occurredAt)}</p>
            </div>
          </div>
        )) : (
          <div className="rounded-[16px] border border-[#d4ebdd] bg-[#f1faf5] p-4">
            <p className="font-bold text-[#1d6f47]">No urgent operational movement yet.</p>
            <p className="mt-1 text-sm text-[#4c7b62]">Matter, document, signing, and registration updates will appear here as the firm works.</p>
          </div>
        )}
      </div>
    </section>
  )
}

function LoadingState({ copy = 'Loading conveyancing operations…' }) {
  return (
    <section className="page">
      <div className="rounded-[22px] border border-[#d9e4f0] bg-white p-6 shadow-[0_18px_52px_rgba(15,32,54,0.07)]">
        <p className="text-sm font-semibold text-[#63788f]">{copy}</p>
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

  const [managementFilters, setManagementFilters] = useState({
    department: 'all',
    member: 'all',
    matterType: 'all',
    status: 'all',
  })

  const [userFilters, setUserFilters] = useState({
    priority: 'all',
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

  const currentRole = data?.currentUser?.role || ''
  const isManagementUser = MANAGEMENT_ROLES.has(currentRole)

  const matterByReference = useMemo(
    () =>
      (data?.matterQueue || []).reduce((accumulator, row) => {
        accumulator[row.matterReference] = row
        return accumulator
      }, {}),
    [data?.matterQueue],
  )

  const managementFilteredMatterRows = useMemo(() => {
    const rows = data?.matterQueue || []
    let filtered = [...rows]

    if (managementFilters.matterType !== 'all') filtered = filtered.filter((row) => row.matterType === managementFilters.matterType)
    if (managementFilters.status !== 'all') filtered = filtered.filter((row) => row.status === managementFilters.status)
    if (managementFilters.department !== 'all') filtered = filtered.filter((row) => row.assignedDepartmentId === managementFilters.department)
    if (managementFilters.member !== 'all') filtered = filtered.filter((row) => String(row.assignedUserId || '') === String(managementFilters.member))

    return filtered
  }, [data?.matterQueue, managementFilters.department, managementFilters.matterType, managementFilters.member, managementFilters.status])

  const activeMatterRows = (
    isManagementUser ? managementFilteredMatterRows : filterMatterRows(data?.matterQueue || [], userFilters, false)
  ).filter((row) => matchesSearch(row, searchTerm))

  const priorityRows = filterPriorityRows(data?.priorityQueue || [], userFilters, matterByReference).filter((row) => matchesSearch(row, searchTerm))
  const documentRows = filterDocumentRows(data?.documentQueue || [], userFilters, matterByReference).filter((row) => matchesSearch(row, searchTerm))
  const appointmentRows = filterAppointmentRows(data?.appointmentQueue || [], userFilters, matterByReference).filter((row) => matchesSearch(row, searchTerm))

  const showDocuments =
    Boolean(data?.permissions?.can_request_documents) ||
    Boolean(data?.permissions?.can_review_documents) ||
    Boolean(data?.permissions?.can_upload_documents)

  const showAppointments = Boolean(data?.permissions?.can_manage_signing_appointments)

  const availableMatterTypes = data?.availableFilters?.matterTypes || []
  const availableStatuses = data?.availableFilters?.statuses || []

  const metrics = useMemo(() => {
    const allMatters = data?.matterQueue || []
    const activeMatters = activeMatterRows.length
    const delayedMatters = activeMatterRows.filter((row) => row.status === 'Needs Attention' || row.flags?.delayed).length
    const pendingSignatures = Number(data?.kpis?.pendingSignatures || 0)
    const registrationsPending = activeMatterRows.filter((row) => {
      const stage = normalizeText(row.currentStage).toLowerCase()
      return stage.includes('lodgement') || stage.includes('registration') || row.flags?.lodgementPending
    }).length
    const avgDays = activeMatterRows.length
      ? Math.round(activeMatterRows.reduce((sum, row) => sum + (daysSince(row.lastUpdated) || 0), 0) / activeMatterRows.length)
      : 0
    const staffCount = data?.availableFilters?.members?.length || 0
    const overloaded = (data?.availableFilters?.members || []).filter((member) => allMatters.filter((row) => String(row.assignedUserId || '') === String(member.value)).length >= 8).length
    const onTrack = activeMatterRows.filter((row) => row.status === 'On Track').length
    const sla = activeMatterRows.length ? Math.round((onTrack / activeMatterRows.length) * 100) : 100
    return {
      activeMatters,
      registrationsPending,
      delayedMatters,
      pendingSignatures,
      avgDays,
      transferMatters: Number(data?.kpis?.transferMatters || 0),
      bondMatters: Number(data?.kpis?.bondMatters || 0),
      lodgementsThisWeek: countThisWeek(activeMatterRows, 'lastUpdated'),
      staffCapacity: staffCount ? `${Math.max(0, staffCount - overloaded)}/${staffCount}` : '0/0',
      sla,
      tasksDueToday: Number(data?.kpis?.tasksDueToday || 0),
      revenuePipeline: 'R 0',
    }
  }, [activeMatterRows, data?.availableFilters?.members, data?.kpis?.bondMatters, data?.kpis?.pendingSignatures, data?.kpis?.tasksDueToday, data?.kpis?.transferMatters, data?.matterQueue])

  if (role !== 'attorney') return <Navigate to="/dashboard" replace />
  if (permissionsState.loading) return <LoadingState copy="Loading attorney permissions…" />

  if (permissionsState.error) {
    return (
      <section className="page">
        <div className="rounded-[22px] border border-[#f1d2ce] bg-white p-6 shadow-[0_18px_52px_rgba(15,32,54,0.07)]">
          <p className="text-sm font-semibold text-[#b42318]">{permissionsState.error}</p>
        </div>
      </section>
    )
  }

  if (permissionsState.membership && !permissionsState.membership.isActive) {
    return (
      <section className="page">
        <div className="rounded-[22px] border border-[#d9e4f0] bg-white p-6 shadow-[0_18px_52px_rgba(15,32,54,0.07)]">
          <h2 className="text-xl font-bold text-[#142132]">Operational access unavailable</h2>
          <p className="mt-2 text-sm font-medium text-[#63788f]">
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
      <section className="page">
        <div className="rounded-[22px] border border-[#d9e4f0] bg-white p-6 shadow-[0_18px_52px_rgba(15,32,54,0.07)]">
          <h2 className="text-xl font-bold text-[#142132]">Operational access unavailable</h2>
          <p className="mt-2 text-sm font-medium text-[#63788f]">
            Your attorney firm membership is not active. Please contact your firm administrator.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="min-h-screen bg-[#f4f7fb] px-4 py-4 sm:px-5 lg:px-7 lg:py-6">
      <div className="mx-auto grid max-w-[1560px] gap-5">
        {error ? (
          <div className="rounded-[18px] border border-[#f1d2ce] bg-[#fff4f3] px-4 py-3 text-sm font-semibold text-[#8e1f15]">
            {error}
          </div>
        ) : null}

        <HeroHeader firm={data.firm} currentUser={data.currentUser} data={data} metrics={metrics} />

        <FilterToolbar
          isManagementUser={isManagementUser}
          data={data}
          availableMatterTypes={availableMatterTypes}
          availableStatuses={availableStatuses}
          managementFilters={managementFilters}
          setManagementFilters={setManagementFilters}
          userFilters={userFilters}
          setUserFilters={setUserFilters}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
        />

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <MetricCard label="Active Matters" value={metrics.activeMatters} context="Open conveyancing matters under firm oversight" icon={BriefcaseBusiness} tone="blue" hero />
          <MetricCard label="Registrations Pending" value={metrics.registrationsPending} context={`${metrics.lodgementsThisWeek} lodgement movements this week`} icon={Scale} tone="navy" />
          <MetricCard label="Matters at Risk" value={metrics.delayedMatters} context={metrics.delayedMatters ? 'Needs partner or ops intervention' : 'No urgent intervention required'} icon={AlertTriangle} tone={metrics.delayedMatters ? 'red' : 'green'} />
          <MetricCard label="Signatures Outstanding" value={metrics.pendingSignatures} context="Seller, buyer, or mandate signatures pending" icon={FileClock} tone="amber" />
          <MetricCard label="Avg Days Active" value={`${metrics.avgDays}d`} context="Based on current active matter movement" icon={Clock3} tone="navy" />
          <MetricCard label="Revenue Pipeline" value={metrics.revenuePipeline} context="Financial pipeline will populate from billing data" icon={Banknote} tone="green" />
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <MetricCard label="Transfer Matters" value={metrics.transferMatters} context="Transfer and mixed transfer matters" icon={Gavel} tone="blue" />
          <MetricCard label="Bond Registrations" value={metrics.bondMatters} context="Bond or transfer + bond instructions" icon={FileCheck2} tone="navy" />
          <MetricCard label="Lodgements This Week" value={metrics.lodgementsThisWeek} context="Recent matter movement captured this week" icon={BarChart3} tone="green" />
          <MetricCard label="Delayed Matters" value={metrics.delayedMatters} context="Operational blockers currently visible" icon={AlertTriangle} tone={metrics.delayedMatters ? 'red' : 'green'} />
          <MetricCard label="Staff Capacity" value={metrics.staffCapacity} context="Available staff below overload threshold" icon={Users} tone="navy" />
          <MetricCard label="SLA Compliance" value={`${metrics.sla}%`} context="Approximate on-track matter ratio" icon={CheckCircle2} tone={metrics.sla >= 80 ? 'green' : 'amber'} />
        </section>

        <PipelineVisualization rows={activeMatterRows} />

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)]">
          <div className="grid gap-5">
            <PriorityWorkQueue rows={priorityRows} />
            <MatterQueue rows={activeMatterRows} />
            <TransactionActionsCenter
              documents={documentRows}
              appointments={appointmentRows}
              pendingSignatures={metrics.pendingSignatures}
              allowedDocuments={showDocuments}
              allowedAppointments={showAppointments}
            />
          </div>
          <aside className="grid content-start gap-5">
            <StaffCapacity members={data.availableFilters?.members || []} matters={activeMatterRows} />
            <RecentActivity rows={data.recentUpdates || []} />
            <section className="rounded-[22px] border border-[#d9e4f0] bg-white p-5 shadow-[0_18px_52px_rgba(15,32,54,0.07)]">
              <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7388a1]">Executive Snapshot</p>
              <h2 className="mt-1 text-xl font-bold text-[#142132]">Operational Intelligence</h2>
              <div className="mt-4 grid gap-3">
                <div className="rounded-[16px] bg-[#f8fbff] p-4">
                  <p className="text-sm font-bold text-[#23384e]">Upcoming signings</p>
                  <p className="mt-1 text-2xl font-bold text-[#142132]">{metrics.pendingSignatures + appointmentRows.length}</p>
                </div>
                <div className="rounded-[16px] bg-[#f8fbff] p-4">
                  <p className="text-sm font-bold text-[#23384e]">Registrations moving</p>
                  <p className="mt-1 text-2xl font-bold text-[#142132]">{metrics.registrationsPending}</p>
                </div>
                <div className="rounded-[16px] bg-[#f8fbff] p-4">
                  <p className="text-sm font-bold text-[#23384e]">Bank / guarantee watch</p>
                  <p className="mt-1 text-2xl font-bold text-[#142132]">{activeMatterRows.filter((row) => row.flags?.guaranteesOutstanding || row.flags?.bankConditionsPending).length}</p>
                </div>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </section>
  )
}

export default AttorneyOperationsPage
