import { createElement, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BriefcaseBusiness, Building2, CheckCircle2, Clock, ExternalLink, Mail, MoreVertical, Plus, Search, ShieldCheck, Trash2, UserRoundCheck, Users } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import Button from '../../../components/ui/Button'
import Field from '../../../components/ui/Field'
import Modal from '../../../components/ui/Modal'
import { createWorkspaceUserInvite, listWorkspaceUserInvites, resendWorkspaceUserInvite, revokeWorkspaceUserInvite } from '../../../services/workspaceUserInviteService'
import { formatCurrency, formatDate, formatNumber, titleize } from '../commercialFormatters'
import CommercialEmptyState from '../components/CommercialEmptyState'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialBrokerageData } from '../services/commercialBrokerageApi'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]'
const EMPTY_INVITE_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  mobile: '',
  branchId: '',
  teamId: '',
  role: 'commercial_broker',
  department: 'both',
  assetClasses: [],
}
const NOTICE_TONES = {
  pending: 'border-blue-100 bg-blue-50 text-blue-700',
  success: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  error: 'border-red-100 bg-red-50 text-red-700',
}

const ROLE_OPTIONS = [
  { value: 'principal', label: 'Principal' },
  { value: 'commercial_manager', label: 'Commercial Manager' },
  { value: 'commercial_broker', label: 'Broker' },
  { value: 'assistant', label: 'Assistant' },
]

const DEPARTMENT_OPTIONS = [
  { value: 'sales', label: 'Sales' },
  { value: 'leasing', label: 'Leasing' },
  { value: 'both', label: 'Both' },
]

const ASSET_CLASS_OPTIONS = [
  { value: 'retail', label: 'Retail' },
  { value: 'office', label: 'Office' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'agricultural', label: 'Agricultural' },
  { value: 'mixed_use', label: 'Mixed Use' },
]

const ROLE_PERMISSION_SUMMARY = {
  principal: ['Can View Leads', 'Can Create Leads', 'Can Create Deals', 'Can Manage Listings', 'Can Manage Properties', 'Can View Reports', 'Can Manage Users'],
  commercial_manager: ['Can View Leads', 'Can Create Leads', 'Can Create Deals', 'Can Manage Listings', 'Can Manage Properties', 'Can View Reports'],
  commercial_broker: ['Can View Leads', 'Can Create Leads', 'Can Create Deals', 'Can Manage Listings', 'Can Manage Properties'],
  assistant: ['Can View Leads', 'Can Create Leads', 'Can Manage Listings'],
}

function Metric({ label, value, helper = '', icon = BriefcaseBusiness, tone = 'bg-[#eef5fb] text-[#123b61]' }) {
  return (
    <article className="min-w-0 rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tone}`}>
          {createElement(icon, { size: 18 })}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[0.76rem] font-semibold text-[#60758d]">{label}</p>
          <p className="mt-1 truncate text-[1.45rem] font-semibold leading-none tracking-[-0.035em] text-[#0f2237]">{value}</p>
          {helper ? <p className="mt-1.5 truncate text-xs font-medium text-[#6b7f97]">{helper}</p> : null}
        </div>
      </div>
    </article>
  )
}

function initialsForName(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2) || 'BR').toUpperCase()
}

function normalizeText(value = '') {
  return String(value || '').trim().toLowerCase()
}

function statusTone(status = '') {
  const normalized = normalizeText(status)
  if (normalized.includes('pending') || normalized.includes('invited')) return 'border-amber-200 bg-amber-50 text-amber-700'
  if (normalized.includes('suspended')) return 'border-rose-200 bg-rose-50 text-rose-700'
  if (normalized.includes('inactive') || normalized.includes('disabled') || normalized.includes('archived')) return 'border-slate-200 bg-slate-50 text-slate-500'
  return 'border-emerald-200 bg-emerald-50 text-emerald-700'
}

function roleLabel(value = '') {
  const match = ROLE_OPTIONS.find((option) => option.value === value)
  return match?.label || titleize(value || 'Broker')
}

function departmentLabel(value = '') {
  const match = DEPARTMENT_OPTIONS.find((option) => option.value === value)
  return match?.label || titleize(value || 'Both')
}

function targetWorkspaceRoleForCommercialRole(value = '') {
  if (value === 'principal') return 'principal'
  if (value === 'commercial_manager') return 'branch_manager'
  if (value === 'assistant') return 'assistant'
  return 'commercial_broker'
}

function BrokerActionsMenu({ broker, onDeleteInvite, onResendInvite }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const isPending = normalizeText(broker.status).includes('pending')
  return (
    <div className="relative">
      <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#d9e3ef] bg-white text-[#3d5570] transition hover:bg-[#f7fafc]" aria-label={`More actions for ${broker.name}`} onClick={() => setMenuOpen((previous) => !previous)}>
        <MoreVertical size={16} />
      </button>
      {menuOpen ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-48 rounded-2xl border border-[#dce6f0] bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.15)]">
          {!isPending ? (
            <Link className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f6f9fc]" to={`/commercial/brokers/${encodeURIComponent(broker.id)}`}>
              View
            </Link>
          ) : null}
          <button type="button" className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f6f9fc]" onClick={() => setMenuOpen(false)}>
            Edit
          </button>
          {isPending ? (
            <button
              type="button"
              className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f6f9fc]"
              onClick={() => {
                setMenuOpen(false)
                onResendInvite?.(broker)
              }}
            >
              Resend Invite
            </button>
          ) : (
            <button type="button" className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#9a3412] hover:bg-orange-50" onClick={() => setMenuOpen(false)}>
              Deactivate
            </button>
          )}
          {isPending ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#b42318] hover:bg-red-50"
              onClick={() => {
                setMenuOpen(false)
                onDeleteInvite?.(broker)
              }}
            >
              <Trash2 size={14} />
              Delete invite
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function BrokerDirectoryRow({ broker, onDeleteInvite, onResendInvite }) {
  const isPending = normalizeText(broker.status).includes('pending')
  return (
    <article className="flex min-h-[268px] min-w-0 flex-col rounded-2xl border border-[#dce5f0] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-[#c8d6e5] hover:shadow-[0_16px_34px_rgba(15,23,42,0.08)]">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#d7e2ef] bg-[linear-gradient(135deg,#f8fbff,#eaf2fb)] text-sm font-bold text-[#244e70]">
            {initialsForName(broker.name)}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-[#142132]">{broker.name}</h2>
            <p className="mt-1 truncate text-sm text-[#60758d]">{roleLabel(broker.role || 'commercial_broker')}</p>
            <p className="truncate text-xs font-medium text-[#6f839a]">{broker.branchName || 'HQ / Unassigned'} · {broker.teamName || 'No team'}</p>
          </div>
        </div>
        <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${statusTone(broker.status)}`}>
          {isPending ? 'Invited' : titleize(broker.status || 'active')}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 divide-x divide-[#e4ebf4] border-y border-[#edf2f7] py-3">
        <div className="min-w-0 pr-3">
          <p className="text-[0.68rem] font-medium text-[#72859c]">Pipeline</p>
          <p className="mt-1 truncate text-sm font-semibold text-[#10243a]">{formatCurrency(broker.pipelineValue || 0)}</p>
        </div>
        <div className="min-w-0 px-3">
          <p className="text-[0.68rem] font-medium text-[#72859c]">Deals</p>
          <p className="mt-1 text-sm font-semibold text-[#10243a]">{broker.activeDeals || 0}</p>
        </div>
        <div className="min-w-0 pl-3">
          <p className="text-[0.68rem] font-medium text-[#72859c]">Listings</p>
          <p className="mt-1 text-sm font-semibold text-[#10243a]">{broker.activeListings || 0}</p>
        </div>
      </div>

      <div className="mt-3 space-y-2 text-xs text-[#61778f]">
        <p className="inline-flex min-w-0 max-w-full items-center gap-2">
          <ShieldCheck size={13} className="shrink-0 text-[#8aa0b6]" />
          <span className="truncate">{departmentLabel(broker.department)} · {broker.speciality || 'Sales & Leasing'}</span>
        </p>
        <p className="inline-flex min-w-0 max-w-full items-center gap-2">
          <Mail size={13} className="shrink-0 text-[#8aa0b6]" />
          <span className="truncate">{broker.email || 'No email captured'}</span>
        </p>
        <p className="inline-flex min-w-0 max-w-full items-center gap-2">
          <Building2 size={13} className="shrink-0 text-[#8aa0b6]" />
          <span className="truncate">{broker.activeVacancies || broker.vacanciesManaged || 0} vacancies managed</span>
        </p>
        <p className="inline-flex min-w-0 max-w-full items-center gap-2">
          <Clock size={13} className="shrink-0 text-[#8aa0b6]" />
          <span className="truncate">{broker.lastActivityAt ? formatDate(broker.lastActivityAt) : isPending ? 'Invite sent' : 'No activity yet'}</span>
        </p>
      </div>

      <div className="mt-auto flex items-center gap-2 pt-4">
        {!isPending ? (
          <Link to={`/commercial/brokers/${encodeURIComponent(broker.id)}`} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0f2742] px-3 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(15,39,66,0.18)] transition hover:bg-[#173a5e]">
            View Workspace <ExternalLink size={14} />
          </Link>
        ) : (
          <span className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-[#d9e3ef] bg-[#f8fbff] px-3 text-sm font-semibold text-[#60758d]">Awaiting accept</span>
        )}
        <BrokerActionsMenu broker={broker} onDeleteInvite={onDeleteInvite} onResendInvite={onResendInvite} />
      </div>
    </article>
  )
}

function RecordList({ title, rows = [], getTitle, getMeta }) {
  return (
    <section className={CARD_CLASS}>
      <h2 className="text-base font-semibold text-[#102236]">{title}</h2>
      <div className="mt-4 grid gap-2">
        {rows.length ? rows.slice(0, 6).map((row) => (
          <article key={row.id} className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3">
            <p className="text-sm font-semibold text-[#102236]">{getTitle(row)}</p>
            <p className="mt-1 text-xs text-slate-500">{getMeta(row)}</p>
          </article>
        )) : (
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No assigned records.</p>
        )}
      </div>
    </section>
  )
}

function BrokerProfile({ data, brokerId }) {
  const [activeTab, setActiveTab] = useState('overview')
  const broker = (data?.brokers || []).find((row) => String(row.id) === String(brokerId))
  if (!broker) {
    return <CommercialEmptyState title="Broker not found" description="This broker is not available in the current commercial workspace scope." />
  }
  const profileTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'leads', label: 'Leads' },
    { id: 'deals', label: 'Deals' },
    { id: 'listings', label: 'Listings' },
    { id: 'vacancies', label: 'Vacancies' },
    { id: 'activity', label: 'Activity' },
    { id: 'performance', label: 'Performance' },
  ]

  return (
    <div className="grid gap-5">
      <section className={CARD_CLASS}>
        <Link to="/commercial/brokers" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600"><ArrowLeft size={15} /> Brokers</Link>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">{broker.name}</h1>
            <p className="mt-1 text-sm text-slate-500">{roleLabel(broker.role)} · {broker.branchName} · {broker.teamName || 'No team'} · {departmentLabel(broker.department)}</p>
            <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-500"><Mail size={15} /> {broker.email || 'No email captured'}</p>
          </div>
          <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{titleize(broker.status)}</span>
        </div>
      </section>

      <section className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,170px),1fr))] gap-3">
        <Metric label="Leads" value={broker.leadsAssigned || broker.activeRequirements} />
        <Metric label="Deals" value={broker.activeDeals} />
        <Metric label="Listings" value={broker.activeListings} />
        <Metric label="Vacancies" value={broker.vacanciesManaged} />
        <Metric label="Pipeline Value" value={formatCurrency(broker.pipelineValue || 0)} />
        <Metric label="Commission Forecast" value={formatCurrency(broker.projectedCommission || 0)} />
      </section>

      <section className={`${CARD_CLASS} overflow-x-auto`}>
        <div className="flex min-w-max gap-2">
          {profileTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-10 rounded-xl px-4 text-sm font-semibold transition ${activeTab === tab.id ? 'bg-[#102b46] text-white' : 'border border-slate-200 bg-white text-[#334b63] hover:bg-slate-50'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {activeTab === 'overview' ? (
          <>
            <RecordList title="Summary Activity" rows={[...broker.transactions, ...broker.viewings, ...broker.activity]} getTitle={(row) => row.transaction_name || row.title || row.viewing_date || row.id || 'Commercial activity'} getMeta={(row) => `${titleize(row.status || row.activity_type)} · ${formatDate(row.updated_at || row.created_at || row.viewing_date)}`} />
            <RecordList title="Heads of Terms and Leases" rows={[...broker.headsOfTerms, ...broker.leases]} getTitle={(row) => row.premises_description || row.id || 'Commercial record'} getMeta={(row) => `${titleize(row.status)} · ${formatDate(row.updated_at || row.created_at || row.lease_end_date)}`} />
          </>
        ) : null}
        {activeTab === 'leads' ? <RecordList title="Broker Leads" rows={broker.requirements} getTitle={(row) => row.requirement_name || 'Requirement'} getMeta={(row) => `${titleize(row.stage)} · ${formatNumber(row.min_size_m2, 'm²')} - ${formatNumber(row.max_size_m2, 'm²')}`} /> : null}
        {activeTab === 'deals' ? <RecordList title="Broker Deals" rows={broker.deals} getTitle={(row) => row.deal_name || 'Deal'} getMeta={(row) => `${titleize(row.stage)} · ${formatCurrency(row.deal_value)}`} /> : null}
        {activeTab === 'listings' ? <RecordList title="Broker Listings" rows={broker.listings} getTitle={(row) => row.title || 'Listing'} getMeta={(row) => `${titleize(row.listing_status)} · ${titleize(row.listing_category)} · ${formatCurrency(row.pricing)}`} /> : null}
        {activeTab === 'vacancies' ? <RecordList title="Broker Vacancies" rows={broker.vacancies} getTitle={(row) => row.vacancy_name || 'Vacancy'} getMeta={(row) => row.available_area_m2 ? `${formatNumber(row.available_area_m2, 'm²')} available` : titleize(row.status)} /> : null}
        {activeTab === 'activity' ? <RecordList title="Calls, Emails, Notes and Tasks" rows={broker.activity} getTitle={(row) => row.title || row.activity_type || 'Activity'} getMeta={(row) => `${row.body || 'Activity logged'} · ${formatDate(row.created_at)}`} /> : null}
        {activeTab === 'performance' ? (
          <>
            <Metric label="Viewings Completed" value={broker.viewingsCompleted || 0} />
            <Metric label="Transactions Closed" value={broker.transactionsClosed || 0} />
            <Metric label="Closed Value" value={formatCurrency(broker.valueClosed || 0)} />
            <Metric label="Capacity" value={broker.capacityLabel} />
          </>
        ) : null}
      </section>
    </div>
  )
}

function CommercialBrokersPage() {
  const { brokerId } = useParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [pendingInvites, setPendingInvites] = useState([])
  const [deletingInviteId, setDeletingInviteId] = useState('')
  const [form, setForm] = useState(EMPTY_INVITE_FORM)
  const { data, loading, error, organisationId } = useCommercialData(getCommercialBrokerageData, [refreshKey])
  const brokers = useMemo(() => data?.brokers || [], [data?.brokers])
  const branches = useMemo(() => data?.branchRows || [], [data?.branchRows])
  const teams = useMemo(() => data?.teams || [], [data?.teams])
  const summary = data?.summary || {}

  useEffect(() => {
    let active = true
    async function loadInvites() {
      if (!organisationId) {
        setPendingInvites([])
        return
      }
      try {
        const invites = await listWorkspaceUserInvites({ workspaceId: organisationId })
        if (!active) return
        setPendingInvites(invites.filter((invite) => normalizeText(invite.role).includes('commercial')))
      } catch {
        if (active) setPendingInvites([])
      }
    }
    void loadInvites()
    return () => {
      active = false
    }
  }, [organisationId, refreshKey])

  const pendingBrokerRows = useMemo(() => pendingInvites.map((invite) => ({
    id: invite.id,
    inviteId: invite.inviteId || invite.id,
    inviteToken: invite.inviteToken || invite.token,
    isPendingInvite: true,
    name: invite.name || invite.email || 'Invited Broker',
    email: invite.email,
    role: invite.role || 'commercial_broker',
    status: 'pending_invite',
    branchId: invite.branchId,
    branchName: invite.branchName || (invite.branchId ? 'Assigned branch' : 'HQ / Unassigned'),
    teamId: invite.teamId || invite.targetTeamId || '',
    teamName: invite.teamName || 'No team',
    department: invite.department || invite.metadata?.department || 'both',
    speciality: invite.speciality || 'Sales & Leasing',
    leadsAssigned: 0,
    activeListings: 0,
    activeVacancies: 0,
    vacanciesManaged: 0,
    activeDeals: 0,
    pipelineValue: 0,
    lastActivityAt: invite.invitedAt,
  })), [pendingInvites])

  const directoryRows = useMemo(() => [...brokers, ...pendingBrokerRows], [brokers, pendingBrokerRows])
  const filteredRows = useMemo(() => {
    const query = normalizeText(searchTerm)
    return directoryRows.filter((broker) => {
      const matchesSearch = !query || [broker.name, broker.email, broker.branchName, broker.teamName, broker.role, broker.department, broker.speciality].some((value) => normalizeText(value).includes(query))
      const matchesBranch = branchFilter === 'all' || String(broker.branchId || '') === branchFilter
      const matchesStatus = statusFilter === 'all' || normalizeText(broker.status) === statusFilter
      return matchesSearch && matchesBranch && matchesStatus
    })
  }, [branchFilter, directoryRows, searchTerm, statusFilter])

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function toggleAssetClass(value) {
    setForm((current) => {
      const values = new Set(current.assetClasses || [])
      if (values.has(value)) values.delete(value)
      else values.add(value)
      return { ...current, assetClasses: Array.from(values) }
    })
  }

  function handleInviteBroker(event) {
    event.preventDefault()
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !form.branchId || !form.role) {
      setFormError('First name, last name, email, branch and role are required.')
      return
    }
    const fullName = [form.firstName, form.lastName].map((value) => value.trim()).filter(Boolean).join(' ')
    const inviteDraft = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      name: fullName,
      email: form.email.trim(),
      mobile: form.mobile.trim(),
      branchId: form.branchId,
      teamId: form.teamId,
      role: form.role,
      department: form.department,
      assetClasses: form.assetClasses || [],
    }
    const branch = branches.find((row) => String(row.id) === String(inviteDraft.branchId))
    const team = teams.find((row) => String(row.id) === String(inviteDraft.teamId))
    const optimisticInviteId = `optimistic-commercial-broker-${Date.now()}`

    setSaving(true)
    setFormError('')
    setNotice({
      tone: 'pending',
      message: `Sending invite to ${inviteDraft.email}. You can keep working while Bridge handles the email.`,
    })
    setPendingInvites((current) => [
      {
        id: optimisticInviteId,
        name: inviteDraft.name || inviteDraft.email || 'Invited Broker',
        email: inviteDraft.email,
        role: inviteDraft.role,
        status: 'pending_invite',
        branchId: inviteDraft.branchId,
        branchName: branch?.name || (inviteDraft.branchId ? 'Assigned branch' : 'HQ / Unassigned'),
        teamId: inviteDraft.teamId,
        teamName: team?.name || 'No team',
        department: inviteDraft.department,
        speciality: inviteDraft.assetClasses.length ? inviteDraft.assetClasses.map(titleize).join(', ') : departmentLabel(inviteDraft.department),
        invitedAt: new Date().toISOString(),
      },
      ...current.filter((invite) => normalizeText(invite.email) !== normalizeText(inviteDraft.email)),
    ])
    setModalOpen(false)
    setSaving(false)

    void (async () => {
      try {
        await createWorkspaceUserInvite({
          name: inviteDraft.name,
          firstName: inviteDraft.firstName,
          lastName: inviteDraft.lastName,
          email: inviteDraft.email,
          mobile: inviteDraft.mobile,
          role: targetWorkspaceRoleForCommercialRole(inviteDraft.role),
          roleLabel: roleLabel(inviteDraft.role),
          branchId: inviteDraft.branchId || '',
          branchName: branch?.name || '',
          teamId: inviteDraft.teamId || '',
          source: 'commercial_agency_broker_invite',
          metadata: {
            module: 'commercial',
            module_context: 'commercial',
            platform_role: 'commercial',
            commercial_role: inviteDraft.role,
            commercial_department: inviteDraft.department,
            department: inviteDraft.department,
            asset_classes: inviteDraft.assetClasses,
            permissions: ROLE_PERMISSION_SUMMARY[inviteDraft.role] || ROLE_PERMISSION_SUMMARY.commercial_broker,
            branch_id: inviteDraft.branchId || '',
            team_id: inviteDraft.teamId || '',
          },
        })
        setForm(EMPTY_INVITE_FORM)
        setNotice({
          tone: 'success',
          message: 'Broker invite sent. The broker will appear as active after accepting the email invite.',
        })
        setRefreshKey((value) => value + 1)
      } catch (inviteError) {
        setPendingInvites((current) => current.filter((invite) => invite.id !== optimisticInviteId))
        setForm(inviteDraft)
        setFormError(inviteError?.message || 'Broker invite could not be sent.')
        setNotice({
          tone: 'error',
          message: 'Broker invite could not be sent. The form has been reopened with the details preserved.',
        })
        setModalOpen(true)
      } finally {
        setSaving(false)
      }
    })()
  }

  async function handleDeleteInvite(broker = {}) {
    const inviteId = broker.inviteId || broker.id
    if (!inviteId || deletingInviteId) return

    const confirmed = window.confirm(`Delete the pending invite for ${broker.email || broker.name}? This will invalidate the invite link.`)
    if (!confirmed) return

    setDeletingInviteId(inviteId)
    setNotice({
      tone: 'pending',
      message: `Deleting invite for ${broker.email || broker.name}.`,
    })

    try {
      await revokeWorkspaceUserInvite({ inviteId })
      setPendingInvites((current) => current.filter((invite) => String(invite.inviteId || invite.id) !== String(inviteId)))
      setNotice({
        tone: 'success',
        message: 'Broker invite deleted. The invite link is no longer valid.',
      })
      setRefreshKey((value) => value + 1)
    } catch (deleteError) {
      setNotice({
        tone: 'error',
        message: deleteError?.message || 'Broker invite could not be deleted.',
      })
    } finally {
      setDeletingInviteId('')
    }
  }

  async function handleResendInvite(broker = {}) {
    const inviteId = broker.inviteId || broker.id
    const invite = pendingInvites.find((row) => String(row.inviteId || row.id) === String(inviteId))
    if (!invite) return
    setNotice({ tone: 'pending', message: `Resending invite to ${broker.email || broker.name}.` })
    try {
      await resendWorkspaceUserInvite(invite)
      setNotice({ tone: 'success', message: 'Broker invite resent.' })
    } catch (resendError) {
      setNotice({ tone: 'error', message: resendError?.message || 'Broker invite could not be resent.' })
    }
  }

  if (brokerId) return <BrokerProfile data={data} brokerId={brokerId} />

  const totalPipelineValue = brokers.reduce((sum, row) => sum + row.pipelineValue, 0)
  const projectedCommission = brokers.reduce((sum, row) => sum + (row.projectedCommission || 0), 0)
  const activeDeals = brokers.reduce((sum, row) => sum + row.activeDeals, 0)
  const activeVacancies = brokers.reduce((sum, row) => sum + (row.activeVacancies || row.vacanciesManaged || 0), 0)

  return (
    <div className="grid min-w-0 max-w-full gap-5 overflow-hidden">
      <section className={`${CARD_CLASS} overflow-hidden`}>
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Commercial Agency</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.045em] text-[#102236]">Brokers</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Invite, manage, assign, and report on commercial brokers across branches, teams, leasing, sales, pipeline and commission performance.</p>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2 xl:justify-end">
            <Button type="button" className="shrink-0" onClick={() => { setFormError(''); setModalOpen(true) }}><Plus size={16} /> Add Broker</Button>
            <Link to="/settings/users" className="inline-flex min-h-10 w-fit shrink-0 items-center gap-2 rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-[#102236]">
              <Users size={16} /> User directory
            </Link>
          </div>
        </div>
      </section>

      {error ? <CommercialEmptyState title="Brokers could not be loaded" description={error} /> : null}
      {notice ? (
        <p className={`rounded-3xl border px-5 py-3 text-sm font-semibold ${NOTICE_TONES[notice.tone] || NOTICE_TONES.success}`} aria-live="polite">
          {notice.message}
        </p>
      ) : null}

      <section className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3">
        <Metric label="Total Brokers" value={loading ? '...' : directoryRows.length} helper="Commercial directory" icon={Users} tone="bg-[#edf5ff] text-[#1769d1]" />
        <Metric label="Active Brokers" value={loading ? '...' : summary.activeBrokers || 0} helper={`${summary.inactiveBrokers || 0} inactive`} icon={UserRoundCheck} tone="bg-[#ecfdf3] text-[#16894f]" />
        <Metric label="Leasing Brokers" value={loading ? '...' : summary.leasingBrokers || 0} helper="Leasing or both" icon={Building2} tone="bg-[#eef4ff] text-[#315adf]" />
        <Metric label="Sales Brokers" value={loading ? '...' : summary.salesBrokers || 0} helper="Sales or both" icon={CheckCircle2} tone="bg-[#f3efff] text-[#7657d8]" />
      </section>

      <section className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3">
        <Metric label="Leads Assigned" value={loading ? '...' : summary.activeRequirements || 0} helper="Active requirements" icon={Search} tone="bg-[#f8fbff] text-[#244e70]" />
        <Metric label="Deals Active" value={loading ? '...' : activeDeals} helper="Currently in motion" icon={BriefcaseBusiness} tone="bg-[#f3efff] text-[#7657d8]" />
        <Metric label="Vacancies Managed" value={loading ? '...' : activeVacancies} helper="Broker-owned stock" icon={Building2} tone="bg-[#eef4ff] text-[#315adf]" />
        <Metric label="Commission Pipeline" value={loading ? '...' : formatCurrency(projectedCommission)} helper={formatCurrency(totalPipelineValue)} icon={ExternalLink} tone="bg-[#fff7ed] text-[#c05a10]" />
      </section>

      <section className={`${CARD_CLASS} min-w-0 overflow-hidden`}>
        <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,520px)] xl:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <Field value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search brokers..." className="pl-11" />
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <Field as="select" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
              <option value="all">All branches</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </Field>
            <Field as="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="pending_invite">Pending invite</option>
              <option value="inactive">Inactive</option>
            </Field>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 border-t border-[#edf2f7] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#10243a]">Broker Directory</h2>
            <p className="mt-0.5 text-xs text-[#6d8299]">{filteredRows.length} brokers matching current filters</p>
          </div>
          <Link to="/commercial/brokers/assignments" className="inline-flex w-fit rounded-full border border-[#dbe6f2] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#60758d]">
            Assignment queue
          </Link>
        </div>

        <div className="mt-4 hidden min-w-0 overflow-x-auto rounded-2xl border border-[#dce5f0] lg:block">
          <table className="min-w-[1120px] w-full divide-y divide-[#edf2f7] text-left">
            <thead className="bg-[#f8fbff] text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#6d8299]">
              <tr>
                {['Broker', 'Role', 'Branch', 'Team', 'Speciality', 'Leads', 'Deals', 'Listings', 'Pipeline Value', 'Status', 'Actions'].map((heading) => (
                  <th key={heading} className="px-4 py-3">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f7] bg-white text-sm">
              {loading ? (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-500">Loading brokers...</td></tr>
              ) : filteredRows.map((broker) => {
                const isPending = normalizeText(broker.status).includes('pending')
                return (
                  <tr key={`table-${broker.status}-${broker.id}`} className="align-middle">
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#d7e2ef] bg-[linear-gradient(135deg,#f8fbff,#eaf2fb)] text-xs font-bold text-[#244e70]">
                          {initialsForName(broker.name)}
                        </span>
                        <div className="min-w-0">
                          {isPending ? (
                            <p className="truncate font-semibold text-[#10243a]">{broker.name}</p>
                          ) : (
                            <Link to={`/commercial/brokers/${encodeURIComponent(broker.id)}`} className="truncate font-semibold text-[#10243a] hover:text-blue-700">{broker.name}</Link>
                          )}
                          <p className="truncate text-xs text-[#6d8299]">{broker.email || 'No email captured'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#334b63]">{roleLabel(broker.role || 'commercial_broker')}</td>
                    <td className="px-4 py-3 text-[#334b63]">{broker.branchName || 'HQ / Unassigned'}</td>
                    <td className="px-4 py-3 text-[#334b63]">{broker.teamName || 'No team'}</td>
                    <td className="px-4 py-3 text-[#334b63]">{departmentLabel(broker.department)} · {broker.speciality || 'Sales & Leasing'}</td>
                    <td className="px-4 py-3 font-semibold text-[#10243a]">{broker.leadsAssigned || broker.activeRequirements || 0}</td>
                    <td className="px-4 py-3 font-semibold text-[#10243a]">{broker.activeDeals || 0}</td>
                    <td className="px-4 py-3 font-semibold text-[#10243a]">{broker.activeListings || 0}</td>
                    <td className="px-4 py-3 font-semibold text-[#10243a]">{formatCurrency(broker.pipelineValue || 0)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${statusTone(broker.status)}`}>
                        {isPending ? 'Invited' : titleize(broker.status || 'active')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <BrokerActionsMenu broker={broker} onDeleteInvite={handleDeleteInvite} onResendInvite={handleResendInvite} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4 lg:hidden">
          {loading ? <div className="h-32 animate-pulse rounded-3xl bg-slate-100" /> : filteredRows.map((broker) => (
            <BrokerDirectoryRow
              key={`${broker.status}-${broker.id}`}
              broker={broker}
              onDeleteInvite={handleDeleteInvite}
              onResendInvite={handleResendInvite}
            />
          ))}
        </div>
      </section>

      {!loading && !filteredRows.length ? <CommercialEmptyState title="No commercial brokers found" description="Invite brokers by email, then assign them to commercial branches, requirements, deals, vacancies, and listings." primaryActionLabel="Add Broker" onPrimaryAction={() => { setFormError(''); setModalOpen(true) }} /> : null}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Broker"
        subtitle="Invite a broker to join your commercial workspace."
        className="max-w-5xl"
        footer={(
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="commercial-broker-invite-form" disabled={saving}>{saving ? 'Sending...' : 'Send Invite'}</Button>
          </div>
        )}
      >
        <form id="commercial-broker-invite-form" className="grid gap-4" onSubmit={handleInviteBroker}>
          {formError ? <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{formError}</p> : null}
          <section className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            <h3 className="text-sm font-semibold text-[#102236]">1. Personal Details</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                First Name *
                <Field value={form.firstName} onChange={(event) => updateField('firstName', event.target.value)} placeholder="John" required />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Last Name *
                <Field value={form.lastName} onChange={(event) => updateField('lastName', event.target.value)} placeholder="Smith" required />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Email *
                <Field type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} placeholder="broker@example.com" required />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Mobile Number
                <Field value={form.mobile} onChange={(event) => updateField('mobile', event.target.value)} placeholder="082 123 4567" />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            <h3 className="text-sm font-semibold text-[#102236]">2. Organisation Assignment</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Branch / Office *
                <Field as="select" value={form.branchId} onChange={(event) => {
                  updateField('branchId', event.target.value)
                  updateField('teamId', '')
                }} required>
                  <option value="">Select branch...</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </Field>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Team
                <Field as="select" value={form.teamId} onChange={(event) => updateField('teamId', event.target.value)}>
                  <option value="">No team</option>
                  {teams
                    .filter((team) => !form.branchId || String(team.branchId || team.branch_id || '') === String(form.branchId))
                    .map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </Field>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Role *
                <Field as="select" value={form.role} onChange={(event) => updateField('role', event.target.value)} required>
                  {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Field>
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            <h3 className="text-sm font-semibold text-[#102236]">3. Commercial Specialisation</h3>
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Department *
                <Field as="select" value={form.department} onChange={(event) => updateField('department', event.target.value)} required>
                  {DEPARTMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Field>
              </label>
              <div className="grid gap-2">
                <p className="text-sm font-semibold text-slate-700">Asset Classes</p>
                <div className="flex flex-wrap gap-2">
                  {ASSET_CLASS_OPTIONS.map((option) => {
                    const active = (form.assetClasses || []).includes(option.value)
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleAssetClass(option.value)}
                        className={`min-h-10 rounded-xl border px-3 text-sm font-semibold transition ${active ? 'border-[#0b65d8] bg-blue-50 text-[#0b65d8]' : 'border-slate-200 bg-white text-[#334b63] hover:bg-slate-50'}`}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#102236]">4. Permissions</h3>
                <p className="mt-1 text-xs text-slate-500">Defaults are applied from the selected role. Principals/admins can adjust detailed permission overrides from user settings.</p>
              </div>
              <Link to="/settings/users" className="text-sm font-semibold text-blue-600">User settings</Link>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(ROLE_PERMISSION_SUMMARY[form.role] || ROLE_PERMISSION_SUMMARY.commercial_broker).map((permission) => (
                <span key={permission} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700">
                  <CheckCircle2 size={15} />
                  {permission}
                </span>
              ))}
            </div>
          </section>
        </form>
      </Modal>
    </div>
  )
}

export default CommercialBrokersPage
