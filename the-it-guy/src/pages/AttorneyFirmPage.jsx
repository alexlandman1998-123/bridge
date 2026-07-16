import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  Mail,
  MapPin,
  Plus,
  Search,
  ShieldUser,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PERMISSIONS } from '../auth/permissions/permissionRegistry'
import { useWorkspace } from '../context/WorkspaceContext'
import { inviteOrganisationUser, listOrganisationCommissionStructures, listOrganisationUsers } from '../lib/settingsApi'
import { createBranch, getBranches } from '../services/agencyBranchService'

const ATTORNEY_ROLE_OPTIONS = [
  { value: 'attorney', label: 'Attorney / Conveyancer' },
  { value: 'assistant', label: 'Legal Assistant' },
  { value: 'branch_manager', label: 'Branch Manager' },
  { value: 'admin', label: 'Firm Admin' },
  { value: 'owner', label: 'Firm Owner' },
  { value: 'viewer', label: 'Viewer' },
]

const DEFAULT_INVITE = {
  firstName: '',
  lastName: '',
  email: '',
  role: 'attorney',
  branchId: '',
}

const DEFAULT_BRANCH = {
  name: '',
  city: '',
  managerName: '',
  email: '',
}

function classNames(...values) {
  return values.filter(Boolean).join(' ')
}

function normalize(value = '') {
  return String(value || '').trim().toLowerCase()
}

function formatRoleLabel(value = '') {
  const normalized = normalize(value)
  return ATTORNEY_ROLE_OPTIONS.find((option) => option.value === normalized)?.label || normalized.replaceAll('_', ' ') || 'Viewer'
}

function formatStatusLabel(value = '') {
  const normalized = normalize(value || 'invited')
  if (normalized === 'active') return 'Active'
  if (normalized === 'invited') return 'Invite sent'
  if (normalized === 'pending') return 'Pending'
  if (normalized === 'deactivated') return 'Inactive'
  return normalized.replaceAll('_', ' ') || 'Unknown'
}

function formatDate(value = '') {
  if (!value) return 'Not tracked'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not tracked'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getUserName(user = {}) {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.fullName || user.email || 'Invited member'
}

function getInitials(user = {}) {
  const source = getUserName(user)
  return source
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'FM'
}

function StatTile({ icon, label, value, helper }) {
  const Icon = icon

  return (
    <article className="min-h-[112px] rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-600">{label}</p>
          <strong className="mt-2 block text-3xl font-semibold tracking-tight text-slate-950">{value}</strong>
        </div>
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0f3558] text-white">
          <Icon size={18} />
        </span>
      </div>
      {helper ? <p className="mt-2 truncate text-xs font-semibold text-slate-500">{helper}</p> : null}
    </article>
  )
}

function Notice({ tone = 'info', children }) {
  const classes = tone === 'error'
    ? 'border-red-200 bg-red-50 text-red-700'
    : tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-slate-200 bg-white text-slate-600'

  return (
    <p className={classNames('rounded-lg border px-4 py-3 text-sm font-semibold shadow-sm', classes)}>
      {children}
    </p>
  )
}

function InviteMemberPanel({ branches, canInvite, draft, setDraft, saving, onSubmit }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-[#00614f]">
          <UserPlus size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-950">Add a firm member</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Send an invite, choose their role, and optionally place them in a branch.</p>
        </div>
      </div>

      <form className="mt-5 grid min-w-0 gap-3" onSubmit={onSubmit}>
        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <label className="grid min-w-0 gap-1.5">
            <span className="text-xs font-semibold text-slate-600">First name</span>
            <input className="h-10 min-w-0 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50" value={draft.firstName} onChange={(event) => setDraft((previous) => ({ ...previous, firstName: event.target.value }))} />
          </label>
          <label className="grid min-w-0 gap-1.5">
            <span className="text-xs font-semibold text-slate-600">Last name</span>
            <input className="h-10 min-w-0 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50" value={draft.lastName} onChange={(event) => setDraft((previous) => ({ ...previous, lastName: event.target.value }))} />
          </label>
        </div>

        <label className="grid min-w-0 gap-1.5">
          <span className="text-xs font-semibold text-slate-600">Email address</span>
          <input className="h-10 min-w-0 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50" type="email" value={draft.email} onChange={(event) => setDraft((previous) => ({ ...previous, email: event.target.value }))} placeholder="name@firm.co.za" />
        </label>

        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <label className="grid min-w-0 gap-1.5">
            <span className="text-xs font-semibold text-slate-600">Role</span>
            <select className="h-10 min-w-0 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50" value={draft.role} onChange={(event) => setDraft((previous) => ({ ...previous, role: event.target.value }))}>
              {ATTORNEY_ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="grid min-w-0 gap-1.5">
            <span className="text-xs font-semibold text-slate-600">Branch</span>
            <select className="h-10 min-w-0 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50" value={draft.branchId} onChange={(event) => setDraft((previous) => ({ ...previous, branchId: event.target.value }))}>
              <option value="">No branch</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
        </div>

        <button type="submit" disabled={!canInvite || saving} className="mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#0f3558] px-4 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(15,53,88,0.18)] transition hover:bg-[#173f66] disabled:cursor-not-allowed disabled:bg-slate-300">
          <UserPlus size={17} />
          {saving ? 'Sending invite...' : 'Invite member'}
        </button>
        {!canInvite ? <p className="text-xs font-semibold text-slate-500">Only firm administrators can invite new members.</p> : null}
      </form>
    </section>
  )
}

function UsersPanel({ users, branches, searchTerm, setSearchTerm, canInvite, inviteDraft, setInviteDraft, savingInvite, onInvite }) {
  const branchById = useMemo(() => new Map(branches.map((branch) => [branch.id, branch])), [branches])
  const filteredUsers = useMemo(() => {
    const query = normalize(searchTerm)
    if (!query) return users
    return users.filter((user) => [
      getUserName(user),
      user.email,
      user.role,
      user.status,
      branchById.get(user.branchId || user.branch_id)?.name,
    ].some((value) => normalize(value).includes(query)))
  }, [branchById, searchTerm, users])

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Firm members</h2>
            <p className="mt-1 text-sm text-slate-500">Everyone with access to this attorney firm workspace.</p>
          </div>
          <label className="relative w-full md:w-[280px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search members" />
          </label>
        </div>

        <div className="mt-5 grid gap-3">
          {filteredUsers.length ? filteredUsers.map((user) => {
            const status = normalize(user.status || 'invited')
            const branchName = branchById.get(user.branchId || user.branch_id)?.name || 'No branch'
            return (
              <article key={user.id || user.email} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-[1fr_auto] md:items-center">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#0f3558] text-sm font-semibold text-white">{getInitials(user)}</span>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-slate-950">{getUserName(user)}</h3>
                    <p className="mt-1 flex items-center gap-2 truncate text-sm text-slate-500"><Mail size={14} /> {user.email || 'No email'}</p>
                    <p className="mt-1 flex items-center gap-2 truncate text-sm text-slate-500"><MapPin size={14} /> {branchName}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <span className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">{formatRoleLabel(user.role)}</span>
                  <span className={classNames(
                    'rounded-lg border px-3 py-1 text-xs font-semibold',
                    status === 'active'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : status === 'invited'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-slate-200 bg-white text-slate-600',
                  )}>
                    {formatStatusLabel(user.status)}
                  </span>
                  <span className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">Last active: {formatDate(user.lastActiveAt)}</span>
                </div>
              </article>
            )
          }) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <Users className="mx-auto size-8 text-slate-400" />
              <h3 className="mt-3 text-base font-semibold text-slate-950">No members found</h3>
              <p className="mt-1 text-sm text-slate-500">Invite your first firm member or clear the search.</p>
            </div>
          )}
        </div>
      </section>

      <InviteMemberPanel branches={branches} canInvite={canInvite} draft={inviteDraft} setDraft={setInviteDraft} saving={savingInvite} onSubmit={onInvite} />
    </section>
  )
}

function BranchesPanel({ branches, canManageBranches, branchDraft, setBranchDraft, savingBranch, onCreateBranch, onOpenBranch }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Firm branches</h2>
          <p className="mt-1 text-sm text-slate-500">Keep office locations simple so staff and matters can be grouped clearly.</p>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {branches.length ? branches.map((branch) => (
            <button key={branch.id || branch.name} type="button" onClick={() => onOpenBranch(branch.id)} className="group rounded-lg border border-slate-200 bg-slate-50/60 p-4 text-left transition hover:border-[#9fb5ca] hover:bg-white hover:shadow-sm focus:outline-none focus:ring-4 focus:ring-blue-50">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">{branch.name}</h3>
                  <p className="mt-1 flex items-center gap-2 text-sm text-slate-500"><MapPin size={14} /> {branch.location || 'Location pending'}</p>
                </div>
                {branch.isHeadOffice ? <span className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Head office</span> : null}
              </div>
              <div className="mt-4 grid gap-2 text-sm text-slate-600">
                <span>Manager: {branch.principalName || branch.managerName || 'Not assigned'}</span>
                <span>Members: {branch.kpis?.activeMembers || branch.members?.length || 0}</span>
                {branch.email ? <span>Email: {branch.email}</span> : null}
                <span className="mt-1 inline-flex items-center gap-1 font-semibold text-[#0f3558]">Open branch <ArrowRight size={14} className="transition group-hover:translate-x-0.5" /></span>
              </div>
            </button>
          )) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center lg:col-span-2">
              <Building2 className="mx-auto size-8 text-slate-400" />
              <h3 className="mt-3 text-base font-semibold text-slate-950">No branches yet</h3>
              <p className="mt-1 text-sm text-slate-500">Create a head office or branch to organise firm members.</p>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Building2 size={20} />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Add a branch</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Start with the branch name. The rest can be filled in later.</p>
          </div>
        </div>

        <form className="mt-5 grid gap-3" onSubmit={onCreateBranch}>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-slate-600">Branch name</span>
            <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50" value={branchDraft.name} onChange={(event) => setBranchDraft((previous) => ({ ...previous, name: event.target.value }))} placeholder="Head Office" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-slate-600">City</span>
            <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50" value={branchDraft.city} onChange={(event) => setBranchDraft((previous) => ({ ...previous, city: event.target.value }))} placeholder="Johannesburg" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-slate-600">Manager name</span>
            <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50" value={branchDraft.managerName} onChange={(event) => setBranchDraft((previous) => ({ ...previous, managerName: event.target.value }))} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-slate-600">Branch email</span>
            <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50" type="email" value={branchDraft.email} onChange={(event) => setBranchDraft((previous) => ({ ...previous, email: event.target.value }))} />
          </label>
          <button type="submit" disabled={!canManageBranches || savingBranch} className="mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#0f3558] px-4 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(15,53,88,0.18)] transition hover:bg-[#173f66] disabled:cursor-not-allowed disabled:bg-slate-300">
            <Plus size={17} />
            {savingBranch ? 'Creating branch...' : 'Add branch'}
          </button>
          {!canManageBranches ? <p className="text-xs font-semibold text-slate-500">Only firm administrators with branch access can create branches.</p> : null}
        </form>
      </section>
    </section>
  )
}

function AttorneyBranchWorkspace({ branch, loading, onBack }) {
  if (loading) return <Notice>Loading branch workspace...</Notice>

  if (!branch) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <Building2 className="mx-auto size-9 text-slate-400" />
        <h1 className="mt-3 text-xl font-semibold text-slate-950">Branch not found</h1>
        <p className="mt-2 text-sm text-slate-500">This branch is unavailable or outside your firm access.</p>
        <button type="button" onClick={onBack} className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-[#0f3558] px-4 text-sm font-semibold text-white">
          <ArrowLeft size={16} /> Back to branches
        </button>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-[#0f3558]">
        <ArrowLeft size={16} /> Back to branches
      </button>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Building2 size={20} /></span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{branch.name}</h1>
                {branch.isHeadOffice ? <span className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Head office</span> : null}
              </div>
              <p className="mt-2 flex items-center gap-2 text-sm text-slate-500"><MapPin size={15} /> {branch.location || 'Location pending'}</p>
            </div>
          </div>
          <span className={classNames('rounded-lg border px-3 py-1.5 text-xs font-semibold', branch.isActive === false ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-emerald-200 bg-emerald-50 text-emerald-700')}>
            {branch.isActive === false ? 'Inactive' : 'Active'}
          </span>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <StatTile icon={Users} label="Members" value={branch.kpis?.activeMembers || branch.members?.length || 0} helper="Assigned to this branch" />
        <StatTile icon={ShieldUser} label="Manager" value={branch.principalName || branch.managerName || 'Not assigned'} helper="Branch lead" />
        <StatTile icon={Building2} label="Active matters" value={branch.kpis?.activeTransactions || branch.transactions?.length || 0} helper="Matters linked to this branch" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Branch details</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div><dt className="font-semibold text-slate-500">Manager</dt><dd className="mt-1 text-slate-800">{branch.principalName || branch.managerName || 'Not assigned'}</dd></div>
            <div><dt className="font-semibold text-slate-500">Email</dt><dd className="mt-1 text-slate-800">{branch.email || 'Not provided'}</dd></div>
            <div><dt className="font-semibold text-slate-500">Phone</dt><dd className="mt-1 text-slate-800">{branch.phone || 'Not provided'}</dd></div>
          </dl>
        </article>
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Branch members</h2>
          <div className="mt-4 grid gap-2">
            {branch.members?.length ? branch.members.map((member) => (
              <div key={member.id || member.email} className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-3">
                <p className="font-semibold text-slate-900">{getUserName(member)}</p>
                <p className="mt-1 text-sm text-slate-500">{member.email || formatRoleLabel(member.role)}</p>
              </div>
            )) : <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">No members are assigned to this branch yet.</p>}
          </div>
        </article>
      </section>
    </div>
  )
}

function FinanceIntro({ commissionStructures }) {
  const activeStructures = commissionStructures.filter((item) => item.isActive !== false)
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold text-slate-950">Firm finance</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Manage billing, commission structures, and financial reporting from the finance workspace.</p>
        </div>
        <Link to="/financials" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#0f3558] px-4 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(15,53,88,0.18)] transition hover:bg-[#173f66]">
          <Wallet size={17} />
          Open Finance
        </Link>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <StatTile icon={Wallet} label="Commission structures" value={activeStructures.length} helper="Configured for the firm" />
        <StatTile icon={CheckCircle2} label="Default structure" value={activeStructures.find((item) => item.isDefault)?.name || 'Not set'} helper="Used when no profile is assigned" />
        <StatTile icon={Clock3} label="Finance workspace" value="Ready" helper="Reports and tables live in Finance" />
      </div>
    </section>
  )
}

export default function AttorneyFirmPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { branchId = '' } = useParams()
  const workspaceContext = useWorkspace()
  const activeTab = searchParams.get('tab') === 'branches' ? 'branches' : 'users'
  const isDevAuthBypass = workspaceContext.currentMembership?.source === 'dev_auth_bypass'
  const canManageUsers = typeof workspaceContext.can === 'function' && (
    workspaceContext.can(PERMISSIONS.manageUsers) ||
    workspaceContext.can(PERMISSIONS.inviteUsers) ||
    workspaceContext.can(PERMISSIONS.manageAttorneyTeam)
  )
  const canManageBranches = typeof workspaceContext.can === 'function' && workspaceContext.can(PERMISSIONS.manageBranches)

  const [users, setUsers] = useState([])
  const [branches, setBranches] = useState([])
  const [commissionStructures, setCommissionStructures] = useState([])
  const [inviteDraft, setInviteDraft] = useState(DEFAULT_INVITE)
  const [branchDraft, setBranchDraft] = useState(DEFAULT_BRANCH)
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingInvite, setSavingInvite] = useState(false)
  const [savingBranch, setSavingBranch] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [branchMessage, setBranchMessage] = useState('')

  const loadFirm = useCallback(async () => {
    setLoading(true)
    setError('')
    setBranchMessage('')
    if (isDevAuthBypass) {
      setUsers([])
      setBranches([])
      setCommissionStructures([])
      setLoading(false)
      return
    }

    try {
      const [userResult, branchResult, financeResult] = await Promise.allSettled([
        listOrganisationUsers(),
        getBranches(),
        listOrganisationCommissionStructures(),
      ])

      if (userResult.status === 'fulfilled') {
        setUsers(userResult.value || [])
      } else {
        throw userResult.reason
      }

      if (branchResult.status === 'fulfilled') {
        setBranches(branchResult.value || [])
      } else {
        setBranches([])
        setBranchMessage(branchResult.reason?.message || 'Branches could not be loaded yet.')
      }

      if (financeResult.status === 'fulfilled') {
        setCommissionStructures(financeResult.value || [])
      } else {
        setCommissionStructures([])
      }
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load firm members.')
    } finally {
      setLoading(false)
    }
  }, [isDevAuthBypass])

  useEffect(() => {
    // The request lifecycle owns the related loading, error, and result state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFirm()
  }, [loadFirm])

  const stats = useMemo(() => {
    const activeUsers = users.filter((user) => normalize(user.status) === 'active')
    const invitedUsers = users.filter((user) => ['invited', 'pending'].includes(normalize(user.status)))
    const admins = users.filter((user) => ['owner', 'super_admin', 'admin', 'principal', 'partner', 'branch_manager'].includes(normalize(user.role)))
    return {
      activeUsers: activeUsers.length,
      invitedUsers: invitedUsers.length,
      admins: admins.length,
      branches: branches.length,
    }
  }, [branches.length, users])

  async function handleInvite(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!normalize(inviteDraft.email)) {
      setError('Email address is required before sending an invite.')
      return
    }

    try {
      setSavingInvite(true)
      await inviteOrganisationUser(inviteDraft)
      setInviteDraft(DEFAULT_INVITE)
      setMessage(`Invite sent to ${inviteDraft.email}.`)
      await loadFirm()
    } catch (inviteError) {
      setError(inviteError?.message || 'Unable to invite this member.')
    } finally {
      setSavingInvite(false)
    }
  }

  async function handleCreateBranch(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!normalize(branchDraft.name)) {
      setError('Branch name is required.')
      return
    }

    try {
      setSavingBranch(true)
      await createBranch(branchDraft)
      setBranchDraft(DEFAULT_BRANCH)
      setMessage(`${branchDraft.name} was added.`)
      await loadFirm()
    } catch (branchError) {
      setError(branchError?.message || 'Unable to create this branch.')
    } finally {
      setSavingBranch(false)
    }
  }

  return (
    <main className="w-full max-w-none bg-[#f7f9fb] px-0 py-3">
      <div className="w-full max-w-none space-y-4 px-2 md:px-3 xl:px-4">
        {error ? <Notice tone="error">{error}</Notice> : null}
        {message ? <Notice tone="success">{message}</Notice> : null}
        {branchMessage ? <Notice>{branchMessage}</Notice> : null}
        {branchId ? (
          <AttorneyBranchWorkspace branch={branches.find((branch) => String(branch.id) === branchId)} loading={loading} onBack={() => navigate('/users?tab=branches')} />
        ) : (
          <>
            {loading ? <Notice>Loading firm workspace...</Notice> : null}

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StatTile icon={Users} label="Active members" value={stats.activeUsers} helper="Can access the firm" />
              <StatTile icon={UserPlus} label="Pending invites" value={stats.invitedUsers} helper="Waiting to accept" />
              <StatTile icon={Building2} label="Branches" value={stats.branches} helper="Firm locations" />
              <StatTile icon={ShieldUser} label="Admins" value={stats.admins} helper="Can manage access" />
            </section>

            {activeTab === 'branches' ? (
              <BranchesPanel
                branches={branches}
                canManageBranches={canManageBranches}
                branchDraft={branchDraft}
                setBranchDraft={setBranchDraft}
                savingBranch={savingBranch}
                onCreateBranch={handleCreateBranch}
                onOpenBranch={(id) => navigate(`/users/branches/${encodeURIComponent(id)}`)}
              />
            ) : (
              <>
                <UsersPanel
                  users={users}
                  branches={branches}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                  canInvite={canManageUsers}
                  inviteDraft={inviteDraft}
                  setInviteDraft={setInviteDraft}
                  savingInvite={savingInvite}
                  onInvite={handleInvite}
                />
                <FinanceIntro commissionStructures={commissionStructures} />
              </>
            )}
          </>
        )}
      </div>
    </main>
  )
}
