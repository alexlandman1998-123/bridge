import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { navigateToRecruitment } from '../recruitment/recruitmentEntryModel'
import { ChevronRight, Search, ShieldCheck, UserPlus, Users, X } from 'lucide-react'
import { hasOpenAgencyOperations } from '../../lib/agencyOperationsAccess'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Field from '../../components/ui/Field'
import InlineCommissionStructure from '../../components/commission/InlineCommissionStructure'
import { useWorkspace } from '../../context/WorkspaceContext'
import { PERMISSIONS } from '../../auth/permissions/permissionRegistry'
import { isPlatformAdmin } from '../../auth/permissions/permissionResolver'
import {
  assignOrganisationUserCommissionProfile,
  applySafeOrganisationPermissionIntegrityRepair,
  applySafeOrganisationOwnershipRemediation,
  deactivateOrganisationUser,
  fetchOrganisationSettings,
  getOrganisationOwnershipRemediationReport,
  getOrganisationPermissionIntegrityReport,
  getOrganisationOwnershipHealthReport,
  getOrganisationOwnershipManualReviewQueue,
  getOrganisationOwnershipReleaseReadiness,
  grantOrganisationOwnership,
  listOrganisationCommissionStructures,
  listOrganisationUserCommissionProfiles,
  listOrganisationUsers,
  transferOrganisationOwnership,
  updateOrganisationUserBusinessWorkspaces,
  updateOrganisationUserJobTitle,
  updateOrganisationUserRole,
} from '../../lib/settingsApi'
import { getOrganisationMemberJobTitleLabel, getOrganisationJobTitleLabel, ORGANISATION_JOB_TITLE_OPTIONS } from '../../lib/organisationJobTitles'
import {
  canGovernOrganisationRoleChange,
  getOrganisationRoleOptions,
  getOrganisationRolePermissionSummary,
} from '../../lib/organisationRoleGovernance'
import {
  createPrincipalClaimInvite,
  createWorkspaceUserInvite,
  listWorkspaceUserInvites,
  resendWorkspaceUserInvite,
  revokeWorkspaceUserInvite,
} from '../../services/workspaceUserInviteService'
import {
  AGENCY_AUTHORITY_ACTIONS,
  canPerformAgencyAuthorityAction,
  getAgencyAuthorityLevel,
  normalizeAgencyAuthorityRole,
} from '../../services/agencyAuthorityService'
import { getWorkspaceAdministratorLabel, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import { getOrganisationOwnershipHealth } from '../../lib/organisationMembershipResolution'
import {
  BUSINESS_WORKSPACES,
  BUSINESS_WORKSPACE_OPTIONS,
  normalizeBusinessWorkspaceList,
  resolveOrganisationBusinessWorkspaces,
} from '../../lib/businessWorkspaceAccess'
import {
  SettingsBanner,
  SettingsEmptyState,
  SettingsLoadingState,
  SettingsSectionCard,
  SettingsToggleRow,
  settingsActionRowClass,
  settingsFieldClass,
  settingsFieldSpanClass,
  settingsGridClass,
  settingsPageClass,
  settingsTableClass,
} from './settingsUi'


function resolveInviteRole(value = '', fallback = 'agent', roleOptions = []) {
  const normalized = String(value || '').trim().toLowerCase()
  if (roleOptions.some((option) => option.value === normalized)) return normalized
  if (roleOptions.some((option) => option.value === fallback)) return fallback
  return roleOptions.find((option) => option.value !== 'owner')?.value || 'viewer'
}

function getRoleLevel(value = '') {
  return getAgencyAuthorityLevel(normalizeAgencyAuthorityRole(value))
}

function canAssignOrganisationRole(actor = {}, targetRole = '', { target = {}, invite = false } = {}) {
  if (hasOpenAgencyOperations(actor)) return true
  const normalizedTargetRole = normalizeAgencyAuthorityRole(targetRole)
  if (normalizedTargetRole === 'owner') return false
  if (invite) {
    const action = normalizedTargetRole === 'principal'
      ? AGENCY_AUTHORITY_ACTIONS.invitePrincipal
      : AGENCY_AUTHORITY_ACTIONS.inviteAgent
    if (!canPerformAgencyAuthorityAction(action, actor, { ...target, role: targetRole, membershipRole: targetRole }, target)) return false
    return normalizedTargetRole === 'principal' || getRoleLevel(actor.role || actor.membershipRole) > getRoleLevel(targetRole)
  }
  return canPerformAgencyAuthorityAction(
    AGENCY_AUTHORITY_ACTIONS.promoteUser,
    actor,
    target,
    { nextRole: targetRole },
  )
}

function filterAssignableRoleOptions(actor = {}, { target = null, invite = false, roleOptions = [] } = {}) {
  const currentRole = target?.role || ''
  const options = roleOptions.filter((option) => canAssignOrganisationRole(actor, option.value, { target: target || {}, invite }))
  if (currentRole && !options.some((option) => option.value === currentRole)) {
    const currentOption = roleOptions.find((option) => option.value === currentRole)
    if (currentOption) return [currentOption, ...options]
  }
  return options
}

function filterGovernedRoleOptions(actor = {}, target = {}, roleOptions = []) {
  const currentRole = target?.role || ''
  const options = roleOptions.filter((option) =>
    canGovernOrganisationRoleChange({ actor, target, nextRole: option.value }),
  )
  if (currentRole && !options.some((option) => option.value === currentRole)) {
    const currentOption = roleOptions.find((option) => option.value === currentRole)
    if (currentOption) return [currentOption, ...options]
  }
  return options
}

const BUSINESS_ACCESS_MANAGEMENT_ROLES = new Set([
  'owner',
  'principal',
  'director',
  'partner',
  'admin',
  'admin_staff',
  'manager',
  'hq_manager',
  'branch_manager',
  'branch_admin',
  'regional_manager',
  'team_lead',
  'team_leader',
  'team_manager',
])

function isBusinessAccessManagedByRole(role = '') {
  return BUSINESS_ACCESS_MANAGEMENT_ROLES.has(String(role || '').trim().toLowerCase())
}

function getBusinessWorkspaceAccessOptions(organisationWorkspaceIds = []) {
  const organisationIds = normalizeBusinessWorkspaceList(organisationWorkspaceIds, [BUSINESS_WORKSPACES.sales])
  const options = []
  for (let mask = 1; mask < (1 << organisationIds.length); mask += 1) {
    const ids = organisationIds.filter((_, index) => mask & (1 << index))
    options.push({ value: toBusinessWorkspaceAccessValue(ids), label: ids.map((id) => BUSINESS_WORKSPACE_OPTIONS.find((item) => item.id === id)?.label).join(' & ') })
  }
  return options
}

function resolveUserBusinessWorkspaceIds(userRow = {}, organisationWorkspaceIds = []) {
  const organisationIds = normalizeBusinessWorkspaceList(organisationWorkspaceIds, [BUSINESS_WORKSPACES.sales])
  if (isBusinessAccessManagedByRole(userRow.role || userRow.workspaceRole || userRow.organisationRole)) {
    return organisationIds
  }
  const assignment = userRow.moduleMetadata?.businessWorkspaces ?? userRow.moduleMetadata?.business_workspaces ?? (userRow.explicitBusinessWorkspaces?.length ? userRow.explicitBusinessWorkspaces : null)
  if (assignment != null) return normalizeBusinessWorkspaceList(assignment, []).filter((id) => organisationIds.includes(id))
  const departmentIds = normalizeBusinessWorkspaceList(
    userRow.departmentBusinessWorkspaces ||
      userRow.businessWorkspaces,
    [],
  ).filter((id) => organisationIds.includes(id))
  if (departmentIds.length) return departmentIds
  if (organisationIds.length === 1) return organisationIds
  return organisationIds.includes(BUSINESS_WORKSPACES.sales) ? [BUSINESS_WORKSPACES.sales] : [organisationIds[0]]
}

function getUserBusinessWorkspaceSourceLabel(userRow = {}) {
  if (isBusinessAccessManagedByRole(userRow.role || userRow.workspaceRole || userRow.organisationRole)) return 'Role managed'
  if (normalizeBusinessWorkspaceList(userRow.explicitBusinessWorkspaces, []).length) return 'User assigned'
  if (normalizeBusinessWorkspaceList(userRow.departmentBusinessWorkspaces, []).length) {
    return userRow.departmentUnit?.name || userRow.teamUnit?.name || userRow.workspaceUnit?.name || 'Department inherited'
  }
  return ''
}

function toBusinessWorkspaceAccessValue(workspaceIds = []) {
  const ids = normalizeBusinessWorkspaceList(workspaceIds, [])
  return ids.join('+')
}

function readInviteNavigationState(state = {}) {
  return state && typeof state === 'object' && !Array.isArray(state) ? state : {}
}

function isPrincipalInviteRole(role = '') {
  return normalizeAgencyAuthorityRole(role) === 'principal'
}

function formatUserStatusLabel(userRow = {}) {
  if (userRow.isPrincipalClaim) {
    if (userRow.status === 'active') return 'Principal active'
    if (userRow.status === 'pending') return 'Principal invitation pending'
    if (userRow.status === 'invited') return 'Principal invitation sent'
  }
  return String(userRow.status || 'invited').replaceAll('_', ' ')
}

function RolePermissionSummary({ role, workspaceType }) {
  const summary = getOrganisationRolePermissionSummary(role, workspaceType)
  const scopeText = summary.scopeLabels.join(' · ') || 'No workspace access'
  return (
    <details className="group mt-2">
      <summary className="cursor-pointer list-none text-xs font-semibold text-[#39745a] marker:hidden">
        {summary.permissionCount} permissions · {scopeText}
      </summary>
      <div className="mt-2 rounded-[10px] border border-[#dfe9e3] bg-[#f7fbf8] p-2.5 text-xs leading-5 text-[#526b5d]">
        {summary.capabilities.length ? summary.capabilities.join(' · ') : 'Operational access only; no management permissions.'}
      </div>
    </details>
  )
}

function TeamAccessTable({
  users,
  loading,
  search,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  roleOptions,
  selectedUser,
  onSelectUser,
  onCloseUser,
  workspaceType,
  canEdit,
  canManageJobTitles,
  savingRoleUserId,
  savingJobTitleUserId,
  onRoleChange,
  onJobTitleChange,
}) {
  const [view, setView] = useState('users')
  const visibleUsers = users.filter((user) => {
    const query = search.trim().toLowerCase()
    const matchesSearch = !query || [user.fullName, user.email].some((value) => String(value || '').toLowerCase().includes(query))
    return matchesSearch && (!roleFilter || user.role === roleFilter)
  })

  return (
    <section className="overflow-hidden rounded-[18px] border border-[#e1e8ef] bg-white shadow-[0_12px_34px_rgba(15,35,55,0.05)]">
      <div className="p-5 pb-0"><h2 className="text-lg font-medium text-[#162334]">Your team <span className="ml-2 text-sm font-normal text-[#718198]">{loading ? '' : `${users.length} members`}</span></h2><p className="mt-1 text-sm text-[#718198]">Select a member to manage their role, job title and access.</p></div>
      <div className="mx-5 mt-5 grid grid-cols-2 gap-2 rounded-xl bg-[#f4f7fa] p-1.5" aria-label="Team sections">
        {[['users', 'Team members'], ['roles', 'Roles & permissions']].map(([id, label]) => (
          <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-medium transition ${view === id ? 'bg-white text-[#167653] shadow-sm' : 'text-[#718198] hover:bg-white/60'}`}>{id === 'users' ? <Users size={18} /> : <ShieldCheck size={18} />}{label}</button>
        ))}
      </div>
      {view === 'roles' ? <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">{roleOptions.map((option) => <div key={option.value} className="rounded-xl border border-[#e3eaf1] p-5"><h3 className="text-base font-medium text-[#162334]">{option.label}</h3><RolePermissionSummary role={option.value} workspaceType={workspaceType} /></div>)}</div> : <>
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex w-full max-w-md items-center gap-3 rounded-xl border border-[#dfe7ef] px-3.5 py-2.5 text-[#718198]">
          <Search size={19} />
          <input aria-label="Search team members" value={search} onChange={(event) => onSearchChange(event.target.value)} className="w-full bg-transparent text-sm text-[#162334] outline-none placeholder:text-[#93a1b5]" placeholder="Search team members" />
        </label>
        <select aria-label="Filter by role" value={roleFilter} onChange={(event) => onRoleFilterChange(event.target.value)} className="rounded-xl border border-[#dfe7ef] bg-white px-3.5 py-2.5 text-sm font-medium text-[#344054] outline-none">
          <option value="">All roles</option>
          {roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      {loading ? <SettingsLoadingState label="Loading team members…" compact /> : null}
      {!loading && !visibleUsers.length ? <SettingsEmptyState title="No team members found" description="Try another search or role filter." /> : null}
      {!loading && visibleUsers.length ? (
        <div className="overflow-x-auto px-5 pb-5">
          <div className="min-w-[760px] overflow-hidden rounded-xl border border-[#e3eaf1]">
            <div className="grid grid-cols-[1.45fr_0.72fr_1fr_0.72fr_36px] gap-4 bg-[#f4f7fa] px-4 py-3 text-xs font-semibold text-[#718198]">
              <span>User</span><span>Role</span><span>Access</span><span>Status</span><span className="sr-only">Open</span>
            </div>
            <div className="divide-y divide-[#e7edf4]">
              {visibleUsers.map((user) => {
                const summary = getOrganisationRolePermissionSummary(user.role, workspaceType)
                return (
                  <button key={user.id} type="button" onClick={() => onSelectUser(user)} className="grid w-full grid-cols-[1.45fr_0.72fr_1fr_0.72fr_36px] items-center gap-4 px-4 py-5 text-left transition hover:bg-[#f8fbfa] focus:bg-[#f8fbfa] focus:outline-none">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#edf6f1] text-sm font-medium text-[#167653]">
                        {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" /> : (user.fullName || user.email || '?').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}
                      </span>
                      <span className="min-w-0"><strong className="block truncate text-sm font-medium text-[#162334]">{user.fullName || user.email}</strong><span className="block truncate pt-0.5 text-sm text-[#718198]">{user.email}</span>{user.jobTitle ? <span className="block pt-1 text-xs text-[#718198]">{getOrganisationMemberJobTitleLabel(user)}</span> : null}</span>
                    </span>
                    <span><span className="inline-flex rounded-full border border-[#d9e4ef] bg-[#f7f9fb] px-2.5 py-1 text-xs font-semibold capitalize text-[#51657b]">{String(user.role || 'viewer').replaceAll('_', ' ')}</span></span>
                    <span className="text-sm text-[#637793]">{summary.scopeLabels.join(' · ') || 'No access'}</span>
                    <span><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${user.status === 'active' ? 'border-[#ccead8] bg-[#f2fbf5] text-[#1f7a45]' : 'border-[#f3d9a8] bg-[#fff8ec] text-[#a16207]'}`}>{formatUserStatusLabel(user)}</span></span>
                    <ChevronRight size={19} className="text-[#7c8da4]" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}
      </>}
      {selectedUser ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#132338]/20" role="presentation" onMouseDown={onCloseUser}>
          <aside className="h-full w-full max-w-[430px] overflow-y-auto bg-white p-6 shadow-[-20px_0_45px_rgba(15,35,55,0.16)]" role="dialog" aria-modal="true" aria-label={`${selectedUser.fullName || selectedUser.email} access`} onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#168451]">Team member</p><h2 className="mt-1 text-xl font-semibold text-[#162334]">{selectedUser.fullName || selectedUser.email}</h2><p className="mt-1 text-sm text-[#718198]">{selectedUser.email}</p></div><button type="button" onClick={onCloseUser} className="rounded-lg p-2 text-[#718198] hover:bg-[#f4f7fa]" aria-label="Close member details"><X size={20} /></button></div>
            <div className="mt-7 space-y-5">
              <label className="grid gap-2 text-sm font-semibold text-[#51657b]"><span>Role</span>{canEdit ? <Field as="select" value={selectedUser.role} disabled={savingRoleUserId === selectedUser.id} onChange={(event) => onRoleChange(selectedUser.id, event.target.value)}>{roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Field> : <span className="capitalize text-[#162334]">{String(selectedUser.role || '').replaceAll('_', ' ')}</span>}</label>
              <div className="rounded-xl border border-[#dfe9e3] bg-[#f7fbf8] p-4"><p className="text-sm font-semibold text-[#162334]">Permissions</p><RolePermissionSummary role={selectedUser.role} workspaceType={workspaceType} /></div>
              <label className="grid gap-2 text-sm font-semibold text-[#51657b]"><span>Job title</span>{canManageJobTitles ? <Field as="select" value={selectedUser.jobTitle || ''} disabled={savingJobTitleUserId === selectedUser.id} onChange={(event) => onJobTitleChange(selectedUser.id, event.target.value)}>{ORGANISATION_JOB_TITLE_OPTIONS.map((option) => <option key={option.value || 'unassigned'} value={option.value}>{option.value ? option.label : `Use role title (${getOrganisationMemberJobTitleLabel({ role: selectedUser.role })})`}</option>)}</Field> : <span className="text-[#162334]">{getOrganisationMemberJobTitleLabel(selectedUser)}</span>}<span className="text-xs font-normal text-[#718198]">Uses their role when no separate title is set. Job titles do not change permissions.</span></label>
              <div className="rounded-xl bg-[#f4f7fa] p-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#718198]">Status</p><p className="mt-1 text-sm font-semibold capitalize text-[#162334]">{formatUserStatusLabel(selectedUser)}</p></div>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  )
}

function formatInviteDate(value = '') {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleDateString()
}

function formatPrincipalClaimStatusLabel(invite = {}) {
  const status = String(invite?.status || '').trim()
  if (status === 'active') return 'Accepted'
  if (status === 'pending_invite') return 'Awaiting acceptance'
  if (status === 'revoked') return 'Revoked'
  if (status === 'expired') return 'Expired'
  return status ? status.replaceAll('_', ' ') : 'Principal invitation'
}

function formatPrincipalClaimEventLabel(invite = {}) {
  const status = String(invite?.status || '').trim()
  if (status === 'active') return 'Accepted'
  if (status === 'revoked') return 'Revoked'
  if (status === 'expired') return 'Expired'
  return 'Sent'
}

function getPrincipalClaimStatusClasses(status = '') {
  if (status === 'active') return 'border-[#ccead8] bg-[#f2fbf5] text-[#1f7a45]'
  if (status === 'pending_invite') return 'border-[#f3d9a8] bg-[#fff8ec] text-[#a16207]'
  if (status === 'expired') return 'border-[#d7e3ef] bg-[#f8fbff] text-[#51657b]'
  return 'border-[#f6d4d4] bg-[#fff5f5] text-[#b42318]'
}

export default function SettingsUsersPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [invitePurpose, setInvitePurpose] = useState('new_recruit')
  const {
    can,
    role,
    currentWorkspace,
    isOrganisationOwner,
    isPrimaryOrganisationOwner,
    organisationMembership,
    organisationMembershipRole,
    workspaceRole,
    workspaceType,
    profile,
    retryWorkspaceBootstrap,
  } = useWorkspace()
  const resolvedWorkspaceType = currentWorkspace?.type || workspaceType || ''
  const workspaceRoleOptions = useMemo(
    () => getOrganisationRoleOptions(resolvedWorkspaceType),
    [resolvedWorkspaceType],
  )
  const [membershipRole, setMembershipRole] = useState('viewer')
  const canEdit = can(PERMISSIONS.manageUsers)
  const openAgencyOperations = hasOpenAgencyOperations({ workspaceType: resolvedWorkspaceType, membershipRole, hasActiveMembership: canEdit })
  const canManageOwnership = openAgencyOperations || isPrimaryOrganisationOwner
  const canManageJobTitles = openAgencyOperations || isOrganisationOwner
  const administratorLabel = getWorkspaceAdministratorLabel({ appRole: role, workspaceType: resolvedWorkspaceType })
  const inviteSectionRef = useRef(null)
  const inviteNavigationState = readInviteNavigationState(location.state)
  const isPrincipalClaimInviteMode = inviteNavigationState.inviteIntent === 'residential_principal_manager'
  const initialInviteRole = resolveInviteRole(
    inviteNavigationState.inviteRole || inviteNavigationState.role,
    'agent',
    workspaceRoleOptions,
  )
  const [users, setUsers] = useState([])
  const [commissionStructures, setCommissionStructures] = useState([])
  const [commissionSaving, setCommissionSaving] = useState(false)
  const [commissionProfiles, setCommissionProfiles] = useState([])
  const [pendingPrincipalClaimInvites, setPendingPrincipalClaimInvites] = useState([])
  const [principalClaimInviteHistory, setPrincipalClaimInviteHistory] = useState([])
  const [inviteForm, setInviteForm] = useState({ firstName: '', lastName: '', email: '', role: initialInviteRole, commissionStructureId: '', businessWorkspaces: [BUSINESS_WORKSPACES.sales] })
  const [organisationBusinessWorkspaceIds, setOrganisationBusinessWorkspaceIds] = useState([BUSINESS_WORKSPACES.sales])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [claimInviteBusyId, setClaimInviteBusyId] = useState('')
  const [savingRoleUserId, setSavingRoleUserId] = useState('')
  const [savingJobTitleUserId, setSavingJobTitleUserId] = useState('')
  const [savingBusinessAccessUserId, setSavingBusinessAccessUserId] = useState('')
  const [teamSearch, setTeamSearch] = useState('')
  const [teamRoleFilter, setTeamRoleFilter] = useState('')
  const [selectedTeamUser, setSelectedTeamUser] = useState(null)
  const [showInvitePanel, setShowInvitePanel] = useState(false)
  const [deactivationTarget, setDeactivationTarget] = useState(null)
  const [deactivatingUser, setDeactivatingUser] = useState(false)
  const [ownershipTransferTarget, setOwnershipTransferTarget] = useState(null)
  const [transferringOwnership, setTransferringOwnership] = useState(false)
  const [ownershipRemediationReport, setOwnershipRemediationReport] = useState([])
  const [ownershipManualReviewQueue, setOwnershipManualReviewQueue] = useState([])
  const [serverOwnershipHealth, setServerOwnershipHealth] = useState(null)
  const [ownershipReleaseReadiness, setOwnershipReleaseReadiness] = useState(null)
  const [permissionIntegrityAudit, setPermissionIntegrityAudit] = useState(null)
  const [permissionIntegrityRepairTarget, setPermissionIntegrityRepairTarget] = useState(null)
  const [applyingPermissionIntegrityRepair, setApplyingPermissionIntegrityRepair] = useState(false)
  const [loadingOwnershipRemediation, setLoadingOwnershipRemediation] = useState(false)
  const [ownershipRemediationTarget, setOwnershipRemediationTarget] = useState(null)
  const [applyingOwnershipRemediation, setApplyingOwnershipRemediation] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const authorityActor = useMemo(() => ({
    workspaceType: resolvedWorkspaceType,
    membershipStatus: organisationMembership?.status || (openAgencyOperations ? 'active' : ''),
    id: profile?.id || organisationMembership?.userId || organisationMembership?.user_id || '',
    userId: profile?.id || organisationMembership?.userId || organisationMembership?.user_id || '',
    email: profile?.email || organisationMembership?.email || '',
    role: membershipRole || organisationMembershipRole || workspaceRole || 'viewer',
    membershipRole: membershipRole || organisationMembershipRole || workspaceRole || 'viewer',
    branchId:
      organisationMembership?.primaryBranchId ||
      organisationMembership?.branchId ||
      organisationMembership?.primary_branch_id ||
      organisationMembership?.branch_id ||
      '',
  }), [membershipRole, organisationMembership, organisationMembershipRole, profile, workspaceRole, resolvedWorkspaceType, openAgencyOperations])
  const ownershipHealth = useMemo(
    () => serverOwnershipHealth || getOrganisationOwnershipHealth(users),
    [serverOwnershipHealth, users],
  )
  const canManageOwnershipRemediation = isPlatformAdmin({
    appRole: role,
    profile,
    currentMembership: organisationMembership,
  })
  const usesAgencyGovernance = useMemo(() => {
    const type = String(currentWorkspace?.type || workspaceType || '').trim().toLowerCase()
    return !type || ['agency', 'residential'].includes(type)
  }, [currentWorkspace?.type, workspaceType])
  const inviteRoleOptions = useMemo(
    () => (usesAgencyGovernance
      ? filterAssignableRoleOptions(authorityActor, { invite: true, roleOptions: workspaceRoleOptions })
      : workspaceRoleOptions.filter((option) => option.value !== 'owner')),
    [authorityActor, usesAgencyGovernance, workspaceRoleOptions],
  )
  const principalInviteSelected = usesAgencyGovernance && (isPrincipalClaimInviteMode || isPrincipalInviteRole(inviteForm.role))
  const businessWorkspaceAccessOptions = useMemo(
    () => getBusinessWorkspaceAccessOptions(organisationBusinessWorkspaceIds),
    [organisationBusinessWorkspaceIds],
  )
  const showBusinessWorkspaceAccessControls = Boolean(
    usesAgencyGovernance &&
      organisationBusinessWorkspaceIds.length > 0,
  )

  const loadOwnershipRemediationReport = useCallback(async () => {
    if (!canManageOwnershipRemediation) {
      setOwnershipRemediationReport([])
      setOwnershipManualReviewQueue([])
      setPermissionIntegrityAudit(null)
      return
    }
    try {
      setLoadingOwnershipRemediation(true)
      const [report, readiness, integrityAudit, manualReviewQueue] = await Promise.all([
        getOrganisationOwnershipRemediationReport(),
        getOrganisationOwnershipReleaseReadiness().catch((readinessError) => ({
          status: 'unavailable',
          error: readinessError.message,
        })),
        getOrganisationPermissionIntegrityReport().catch((integrityError) => ({
          unavailable: true,
          error: integrityError.message,
        })),
        getOrganisationOwnershipManualReviewQueue().catch(() => []),
      ])
      setOwnershipRemediationReport(report)
      setOwnershipReleaseReadiness(readiness)
      setPermissionIntegrityAudit(integrityAudit)
      setOwnershipManualReviewQueue(manualReviewQueue)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoadingOwnershipRemediation(false)
    }
  }, [canManageOwnershipRemediation])

  useEffect(() => {
    void loadOwnershipRemediationReport()
  }, [loadOwnershipRemediationReport])

  const commissionStructureById = useMemo(
    () => new Map((commissionStructures || []).map((item) => [String(item.id || ''), item])),
    [commissionStructures],
  )
  const defaultCommissionStructure = useMemo(
    () => (commissionStructures || []).find((item) => item.isDefault && item.isActive) || null,
    [commissionStructures],
  )
  const commissionProfileByUserKey = useMemo(() => {
    const map = new Map()
    for (const profile of commissionProfiles || []) {
      const organisationUserId = String(profile?.organisationUserId || '').trim()
      const userId = String(profile?.userId || '').trim()
      const email = String(profile?.email || '').trim().toLowerCase()
      if (organisationUserId) map.set(`org-user:${organisationUserId}`, profile)
      if (userId) map.set(`user:${userId}`, profile)
      if (email) map.set(`email:${email}`, profile)
    }
    return map
  }, [commissionProfiles])

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true)
      const [response, context, structureRows, profileRows, principalClaimInvites, ownershipHealthReport] = await Promise.all([
        listOrganisationUsers(),
        fetchOrganisationSettings(),
        listOrganisationCommissionStructures(),
        listOrganisationUserCommissionProfiles(),
        canEdit ? listWorkspaceUserInvites({ includeInactive: true }).catch(() => []) : Promise.resolve([]),
        getOrganisationOwnershipHealthReport(currentWorkspace?.id).catch(() => null),
      ])
      setUsers(response)
      setServerOwnershipHealth(ownershipHealthReport)
      const nextOrganisationBusinessWorkspaceIds = resolveOrganisationBusinessWorkspaces({
        currentWorkspace: context?.organisation,
        currentMembership: context?.membership,
      })
      setOrganisationBusinessWorkspaceIds(
        nextOrganisationBusinessWorkspaceIds.length
          ? nextOrganisationBusinessWorkspaceIds
          : [BUSINESS_WORKSPACES.sales],
      )
      setMembershipRole(normalizeOrganisationMembershipRole(context.membershipRole || 'viewer', {
        appRole: role,
        workspaceType: context?.organisation?.type || resolvedWorkspaceType,
      }))
      setCommissionStructures(Array.isArray(structureRows) ? structureRows : [])
      setCommissionProfiles(Array.isArray(profileRows) ? profileRows : [])
      const principalClaimInviteRows = (Array.isArray(principalClaimInvites) ? principalClaimInvites : [])
        .filter((invite) => invite?.isPrincipalClaimInvite)
      setPrincipalClaimInviteHistory(principalClaimInviteRows)
      setPendingPrincipalClaimInvites(principalClaimInviteRows.filter((invite) => invite.status === 'pending_invite'))
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [canEdit, currentWorkspace?.id, resolvedWorkspaceType, role])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  useEffect(() => {
    if (!inviteNavigationState.openInvite) return
    setShowInvitePanel(true)
    if (isPrincipalClaimInviteMode) {
      setInviteForm((previous) => ({ ...previous, role: 'principal' }))
      window.setTimeout(() => {
        inviteSectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      }, 0)
      return
    }
    const nextRole = resolveInviteRole(
      inviteNavigationState.inviteRole || inviteNavigationState.role,
      'principal',
      workspaceRoleOptions,
    )
    const allowedRole = inviteRoleOptions.some((option) => option.value === nextRole)
      ? nextRole
      : inviteRoleOptions[0]?.value || 'agent'
    setInviteForm((previous) => ({ ...previous, role: allowedRole }))
    window.setTimeout(() => {
      inviteSectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    }, 0)
  }, [inviteNavigationState.inviteRole, inviteNavigationState.openInvite, inviteNavigationState.role, inviteRoleOptions, isPrincipalClaimInviteMode, workspaceRoleOptions])

  useEffect(() => {
    if (isPrincipalClaimInviteMode) return
    if (!inviteRoleOptions.length) return
    if (inviteRoleOptions.some((option) => option.value === inviteForm.role)) return
    setInviteForm((previous) => ({ ...previous, role: inviteRoleOptions[0].value }))
  }, [inviteForm.role, inviteRoleOptions, isPrincipalClaimInviteMode])

  useEffect(() => {
    if (!showBusinessWorkspaceAccessControls) return
    setInviteForm((previous) => {
      const currentIds = normalizeBusinessWorkspaceList(previous.businessWorkspaces, [])
        .filter((id) => organisationBusinessWorkspaceIds.includes(id))
      if (currentIds.length) return previous
      return { ...previous, businessWorkspaces: [organisationBusinessWorkspaceIds[0] || BUSINESS_WORKSPACES.sales] }
    })
  }, [organisationBusinessWorkspaceIds, showBusinessWorkspaceAccessControls])

  async function handleInvite(event) {
    event.preventDefault()
    if (!canEdit || commissionSaving) return
    if (usesAgencyGovernance && !principalInviteSelected && ['agent','senior_agent','sales_agent','commercial_broker'].includes(inviteForm.role) && invitePurpose === 'new_recruit') {
      navigateToRecruitment(navigate, {entryPoint:'settings_users',organisationId:currentWorkspace?.organisationId || currentWorkspace?.organisation_id || currentWorkspace?.id,commissionStructureId:inviteForm.commissionStructureId==='__unassigned__' ? '' : inviteForm.commissionStructureId || defaultCommissionStructure?.id || '',branchId:inviteNavigationState.branchId || '',returnTo:'/settings/users',joiningRole:inviteForm.role==='senior_agent' ? 'senior_agent' : inviteForm.role==='commercial_broker' ? 'commercial_broker' : 'agent',businessWorkspaces:inviteForm.role==='commercial_broker' ? ['commercial'] : inviteForm.businessWorkspaces,contact:{name:[inviteForm.firstName,inviteForm.lastName].filter(Boolean).join(' '),email:inviteForm.email}})
      return
    }
    try {
      setSaving(true)
      setError('')
      setMessage('')
      const selectedCommissionStructure =
        inviteForm.commissionStructureId === '__unassigned__' ? null :
        commissionStructureById.get(String(inviteForm.commissionStructureId || '').trim()) ||
        defaultCommissionStructure ||
        null
      const selectedBusinessWorkspaces = normalizeBusinessWorkspaceList(
        inviteForm.businessWorkspaces,
        [BUSINESS_WORKSPACES.sales],
      ).filter((id) => organisationBusinessWorkspaceIds.includes(id))
      const inviteResult = principalInviteSelected
        ? await createPrincipalClaimInvite({
            firstName: inviteForm.firstName,
            lastName: inviteForm.lastName,
            email: inviteForm.email,
            source: inviteNavigationState.inviteSource || (isPrincipalClaimInviteMode ? 'settings_principal_claim_invite' : 'settings_users_principal_role_invite'),
          })
        : await createWorkspaceUserInvite({
            metadata: {access_purpose: 'existing_staff'},
            firstName: inviteForm.firstName,
            lastName: inviteForm.lastName,
            email: inviteForm.email,
            role: inviteForm.role,
            branchId: inviteNavigationState.branchId || '',
            branchName: inviteNavigationState.branchName || '',
            commissionStructureId: selectedCommissionStructure?.id || '',
            commissionStructureName: selectedCommissionStructure?.name || '',
            businessWorkspaces: selectedBusinessWorkspaces.length ? selectedBusinessWorkspaces : [organisationBusinessWorkspaceIds[0] || BUSINESS_WORKSPACES.sales],
            source: inviteNavigationState.inviteSource || 'settings_users_invite',
          })
      setInviteForm({ firstName: '', lastName: '', email: '', role: 'agent', commissionStructureId: '', businessWorkspaces: [BUSINESS_WORKSPACES.sales] })
      await loadUsers()
      setMessage(
        inviteResult.reusedExistingInvite
          ? principalInviteSelected ? 'Existing principal invitation resent.' : 'Existing pending invite resent.'
          : principalInviteSelected ? 'Principal invitation sent.' : 'User invite sent.',
      )
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRoleChange(userRowId, nextRole) {
    if (!canEdit) return
    try {
      setError('')
      setMessage('')
      setSavingRoleUserId(userRowId)
      await updateOrganisationUserRole(userRowId, nextRole)
      await loadUsers()
      setMessage('User role updated.')
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSavingRoleUserId('')
    }
  }

  async function handleJobTitleChange(userRowId, nextJobTitle) {
    if (!canManageJobTitles) return
    try {
      setError('')
      setMessage('')
      setSavingJobTitleUserId(userRowId)
      await updateOrganisationUserJobTitle(userRowId, nextJobTitle)
      await loadUsers()
      setMessage('Job title updated.')
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSavingJobTitleUserId('')
    }
  }

  async function handleBusinessWorkspaceAccessChange(userRow, nextValue) {
    if (!canEdit || !userRow?.id) return
    try {
      setError('')
      setMessage('')
      setSavingBusinessAccessUserId(userRow.id)
      const nextBusinessWorkspaces = normalizeBusinessWorkspaceList(nextValue, [BUSINESS_WORKSPACES.sales])
        .filter((id) => organisationBusinessWorkspaceIds.includes(id))
      await updateOrganisationUserBusinessWorkspaces(userRow.id, nextBusinessWorkspaces)
      await loadUsers()
      retryWorkspaceBootstrap?.()
      setMessage('Business line access updated.')
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSavingBusinessAccessUserId('')
    }
  }

  async function handleOwnershipChange() {
    if (!canManageOwnership || !ownershipTransferTarget?.user?.id) return
    const isPrimaryReassignment = ownershipTransferTarget.action === 'make_primary'
    const targetUser = ownershipTransferTarget.user
    const targetName = targetUser.fullName || targetUser.email || 'the selected member'
    try {
      setTransferringOwnership(true)
      setError('')
      setMessage('')
      if (isPrimaryReassignment) {
        await transferOrganisationOwnership(targetUser.id)
      } else {
        await grantOrganisationOwnership(targetUser.id)
      }
      setOwnershipTransferTarget(null)
      await loadUsers()
      retryWorkspaceBootstrap?.()
      setMessage(isPrimaryReassignment
        ? `${targetName} is now the primary owner. Existing owners keep their ownership.`
        : `${targetName} has been granted organisation owner access.`)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setTransferringOwnership(false)
    }
  }

  async function handleApplyOwnershipRemediation() {
    const target = ownershipRemediationTarget
    if (!canManageOwnershipRemediation || !target?.organisationId) return
    try {
      setApplyingOwnershipRemediation(true)
      setError('')
      setMessage('')
      const result = await applySafeOrganisationOwnershipRemediation(target.organisationId)
      const repairedCount = Array.isArray(result?.repaired) ? result.repaired.length : 0
      setOwnershipRemediationTarget(null)
      await Promise.all([loadUsers(), loadOwnershipRemediationReport()])
      setMessage(repairedCount
        ? `Ownership remediation completed for ${target.organisationName || 'the selected organisation'}.`
        : `No safe ownership remediation was applied for ${target.organisationName || 'the selected organisation'}; refresh the report and review it manually.`)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setApplyingOwnershipRemediation(false)
    }
  }

  async function handleApplyPermissionIntegrityRepair() {
    const target = permissionIntegrityRepairTarget
    if (!canManageOwnershipRemediation || !target?.organisationId) return
    try {
      setApplyingPermissionIntegrityRepair(true)
      setError('')
      setMessage('')
      const result = await applySafeOrganisationPermissionIntegrityRepair(target.organisationId)
      const repairedCount = Array.isArray(result?.repaired) ? result.repaired.length : 0
      setPermissionIntegrityRepairTarget(null)
      await Promise.all([loadUsers(), loadOwnershipRemediationReport()])
      setMessage(repairedCount
        ? `Permission-integrity repair completed for ${target.organisationName || 'the selected organisation'}.`
        : `No safe role-field repair was available for ${target.organisationName || 'the selected organisation'}; review conflicting roles manually.`)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setApplyingPermissionIntegrityRepair(false)
    }
  }

  async function handleDeactivate() {
    if (!canEdit || !deactivationTarget?.id) return
    const targetName = deactivationTarget.fullName || deactivationTarget.email || 'the selected user'
    try {
      setDeactivatingUser(true)
      setError('')
      setMessage('')
      await deactivateOrganisationUser(deactivationTarget.id)
      setDeactivationTarget(null)
      await loadUsers()
      setMessage(`${targetName} has been deactivated.`)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setDeactivatingUser(false)
    }
  }

  async function handleCommissionStructureChange(userRow, structureId) {
    if (!canEdit) return
    try {
      setError('')
      await assignOrganisationUserCommissionProfile({
        organisationUserId: userRow?.id || '',
        userId: userRow?.userId || '',
        email: userRow?.email || '',
        commissionStructureId: structureId || '',
      })
      await loadUsers()
    } catch (saveError) {
      setError(saveError.message)
    }
  }

  async function handleCopyPrincipalClaimLink(invite) {
    const inviteLink = invite?.inviteLink || invite?.onboardingUrl || ''
    if (!inviteLink) {
      setError('Principal invitation link is not available for this invite.')
      return
    }
    try {
      await navigator.clipboard.writeText(inviteLink)
      setError('')
      setMessage(`Principal invitation link copied for ${invite.email}.`)
    } catch {
      setError('Unable to copy the principal invitation link from this browser.')
    }
  }

  async function handleResendPrincipalClaimInvite(invite) {
    if (!canEdit || !invite?.id) return
    try {
      setClaimInviteBusyId(invite.id)
      setError('')
      setMessage('')
      await resendWorkspaceUserInvite(invite)
      await loadUsers()
      setMessage(`Principal invitation resent to ${invite.email}.`)
    } catch (resendError) {
      setError(resendError?.message || 'Unable to resend this principal invitation.')
    } finally {
      setClaimInviteBusyId('')
    }
  }

  async function handleRevokePrincipalClaimInvite(invite) {
    if (!canEdit || !invite?.id) return
    const confirmed = window.confirm(`Revoke the pending principal invitation for ${invite.email}?`)
    if (!confirmed) return
    try {
      setClaimInviteBusyId(invite.id)
      setError('')
      setMessage('')
      await revokeWorkspaceUserInvite(invite)
      await loadUsers()
      setMessage(`Principal invitation revoked for ${invite.email}.`)
    } catch (revokeError) {
      setError(revokeError?.message || 'Unable to revoke this principal invitation.')
    } finally {
      setClaimInviteBusyId('')
    }
  }

  return (
    <div className={settingsPageClass}>
      <div className="flex flex-col gap-4 rounded-[18px] border border-[#e1e8ef] bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-[#718198]">Organisation settings</p>
          <h1 className="mt-2 text-2xl font-medium tracking-[-0.025em] text-[#142132]">Team & access</h1>
          <p className="mt-1 text-base text-[#6b7d93]">Invite your team and manage the access they need.</p>
        </div>
        {canEdit ? <Button type="button" onClick={() => setShowInvitePanel(true)}><UserPlus size={18} className="mr-2" />Invite user</Button> : null}
      </div>

      {!canEdit ? (
        <SettingsBanner tone="warning">Read-only for your role. Only {administratorLabel} can manage users and permissions.</SettingsBanner>
      ) : null}

      {showInvitePanel ? <div className="fixed inset-0 z-50 flex justify-end bg-[#132338]/20" role="presentation" onMouseDown={() => setShowInvitePanel(false)}>
      <div ref={inviteSectionRef} className="h-full w-full max-w-[430px] overflow-y-auto bg-white p-6 shadow-[-20px_0_45px_rgba(15,35,55,0.16)]" role="dialog" aria-modal="true" aria-label="Invite user" onMouseDown={(event) => event.stopPropagation()}>
      <div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold text-[#162334]">Invite user</h2><p className="mt-1 text-sm text-[#718198]">Add a team member and assign their initial role.</p></div><button type="button" onClick={() => setShowInvitePanel(false)} className="rounded-lg p-2 text-[#718198] hover:bg-[#f4f7fa]" aria-label="Close invite"><X size={20} /></button></div>
      <SettingsSectionCard>
        {isPrincipalClaimInviteMode ? (
          <SettingsBanner tone="success">
            Principal invitation selected from Residential. This sends an invitation link for the principal to start organisation onboarding, without granting principal access automatically.
          </SettingsBanner>
        ) : null}
        {!isPrincipalClaimInviteMode && usesAgencyGovernance && isPrincipalInviteRole(inviteForm.role) ? (
          <SettingsBanner tone="success">
            Principal selected. Arch9 will send a principal invitation link instead of granting principal access immediately.
          </SettingsBanner>
        ) : null}
        {usesAgencyGovernance && !principalInviteSelected && ['agent','senior_agent','sales_agent','commercial_broker'].includes(inviteForm.role) && <label className={settingsFieldClass}><span>Invitation purpose</span><select className="min-h-11 rounded-xl border border-[#dbe4ee] px-3" value={invitePurpose} onChange={(event) => setInvitePurpose(event.target.value)}><option value="new_recruit">New agent · Recruitment</option><option value="existing_staff">Existing or returning staff access</option></select><p className="text-sm text-[#718198]">New agents complete Recruitment before access. Branch transfers use the existing staff profile.</p></label>}
        <form className={settingsGridClass} onSubmit={handleInvite}>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">First name</span>
            <Field
              value={inviteForm.firstName}
              disabled={!canEdit}
              onChange={(event) => setInviteForm((previous) => ({ ...previous, firstName: event.target.value }))}
            />
          </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Last name</span>
            <Field
              value={inviteForm.lastName}
              disabled={!canEdit}
              onChange={(event) => setInviteForm((previous) => ({ ...previous, lastName: event.target.value }))}
            />
          </label>
          <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
            <span className="text-sm font-medium text-[#51657b]">Email</span>
            <Field
              value={inviteForm.email}
              disabled={!canEdit}
              onChange={(event) => setInviteForm((previous) => ({ ...previous, email: event.target.value }))}
            />
          </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Role</span>
            {principalInviteSelected ? (
              <>
                <Field value="Principal invitation" disabled />
                <span className="text-xs font-medium text-[#51657b]">
                  The invited principal invitations/onboards the organisation first; access approval happens in the claim flow.
                </span>
              </>
            ) : (
              <>
                <Field
                  as="select"
                  value={inviteForm.role}
                  disabled={!canEdit || inviteRoleOptions.length === 0}
                  onChange={(event) => setInviteForm((previous) => ({ ...previous, role: event.target.value }))}
                >
                  {inviteRoleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                    ))}
                </Field>
                {canEdit && !inviteRoleOptions.some((option) => normalizeAgencyAuthorityRole(option.value) === 'principal') ? (
                <span className="text-xs font-medium text-[#8a6a18]">
                  Principal and owner invites are restricted to the organisation owner.
                </span>
              ) : null}
              </>
            )}
            </label>
          {showBusinessWorkspaceAccessControls && !principalInviteSelected && !isBusinessAccessManagedByRole(inviteForm.role) ? (
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Business Lines</span>
              <Field
                as="select"
                value={toBusinessWorkspaceAccessValue(inviteForm.businessWorkspaces)}
                disabled={!canEdit}
                onChange={(event) => setInviteForm((previous) => ({
                  ...previous,
                  businessWorkspaces: normalizeBusinessWorkspaceList(event.target.value, [BUSINESS_WORKSPACES.sales]),
                }))}
              >
                {businessWorkspaceAccessOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Field>
            </label>
          ) : null}
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Sales Commission Structure (Optional)</span>
            <Field
              as="select"
              value={inviteForm.commissionStructureId}
              disabled={!canEdit || principalInviteSelected}
              onChange={(event) => setInviteForm((previous) => ({ ...previous, commissionStructureId: event.target.value }))}
            >
              <option value="">Use default / unassigned</option>
              {defaultCommissionStructure ? <option value="__unassigned__">Save user without a commission structure</option> : null}
              {commissionStructures
                .filter((item) => item.isActive)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </Field>
            {!inviteForm.commissionStructureId && !defaultCommissionStructure ? (
              <span className="text-xs font-medium text-[#a16207]">
                No default structure is configured. This user will remain unassigned until you set one.
              </span>
            ) : null}
            {principalInviteSelected ? (
              <span className="text-xs font-medium text-[#51657b]">
                Commission is assigned after the principal invitation is completed and the membership is active.
              </span>
            ) : null}
          </label>
          {canEdit && !principalInviteSelected && ['agency', 'residential'].includes(resolvedWorkspaceType) ? (
            <InlineCommissionStructure disabled={saving} onSavingChange={setCommissionSaving} onCreated={(structure) => {
              setCommissionStructures((previous) => [...previous.filter((item) => item.id !== structure.id), structure])
              setInviteForm((previous) => ({ ...previous, commissionStructureId: structure.id }))
            }} />
          ) : null}
          {canEdit ? (
            <div className={`${settingsActionRowClass} md:col-span-2`}>
              <Button type="submit" disabled={saving || commissionSaving}>
                {saving ? 'Inviting…' : principalInviteSelected ? 'Send Principal Claim' : usesAgencyGovernance && ['agent','senior_agent','sales_agent','commercial_broker'].includes(inviteForm.role) && invitePurpose==='new_recruit' ? 'Continue in Recruitment' : 'Invite User'}
              </Button>
            </div>
          ) : null}
        </form>
      </SettingsSectionCard>
      </div></div> : null}

      <TeamAccessTable
        users={users}
        loading={loading}
        search={teamSearch}
        onSearchChange={setTeamSearch}
        roleFilter={teamRoleFilter}
        onRoleFilterChange={setTeamRoleFilter}
        roleOptions={workspaceRoleOptions}
        selectedUser={users.find((user) => user.id === selectedTeamUser?.id) || null}
        onSelectUser={setSelectedTeamUser}
        onCloseUser={() => setSelectedTeamUser(null)}
        workspaceType={resolvedWorkspaceType}
        canEdit={canEdit}
        canManageJobTitles={canManageJobTitles}
        savingRoleUserId={savingRoleUserId}
        savingJobTitleUserId={savingJobTitleUserId}
        onRoleChange={handleRoleChange}
        onJobTitleChange={handleJobTitleChange}
      />

      {canEdit && usesAgencyGovernance ? (
        <details className="rounded-[18px] border border-[#e1e8ef] bg-white p-5">
          <summary className="cursor-pointer text-base font-medium text-[#162334]">Principal invitations <span className="ml-2 text-sm font-normal text-[#718198]">{pendingPrincipalClaimInvites.length} pending · {principalClaimInviteHistory.length} total</span></summary>
          <div className="mt-5 space-y-4">
          {principalClaimInviteHistory.some((invite) => invite.status === 'active') ? (
            <SettingsBanner tone="success">
              A principal has accepted their invitation. The principal now appears as an active workspace user and commission setup can continue.
            </SettingsBanner>
          ) : null}

          {!principalClaimInviteHistory.length ? (
            <p className="text-sm text-[#718198]">No principal invitations yet. Invite a principal to track their onboarding here.</p>
          ) : (
            <div className="divide-y divide-[#e9eff5] overflow-hidden rounded-2xl border border-[#e4ebf3] bg-white">
              {principalClaimInviteHistory.map((invite) => {
                const busy = claimInviteBusyId === invite.id
                const isPending = invite.status === 'pending_invite'
                const statusClasses = getPrincipalClaimStatusClasses(invite.status)
                return (
                  <div key={invite.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr_1fr] lg:items-center">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[#162334]">{invite.name || invite.email}</p>
                      <p className="break-all text-sm text-[#51657b]">{invite.email}</p>
                    </div>
                    <div className="space-y-1">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] ${statusClasses}`}>
                        {formatPrincipalClaimStatusLabel(invite)}
                      </span>
                      <p className="text-xs text-[#7b8da6]">
                        {formatPrincipalClaimEventLabel(invite)} {formatInviteDate(invite.activatedAt || invite.acceptedAt || invite.invitedAt || invite.createdAt)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#8da0b6]">
                        {isPending ? 'Expires' : 'Closed'}
                      </p>
                      <p className="text-sm text-[#51657b]">
                        {isPending
                          ? formatInviteDate(invite.expiresAt)
                          : formatInviteDate(invite.activatedAt || invite.acceptedAt || invite.revokedAt || invite.expiresAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      {isPending ? (
                        <>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => handleCopyPrincipalClaimLink(invite)}
                            disabled={busy}
                          >
                            Copy Link
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleResendPrincipalClaimInvite(invite)}
                            disabled={busy}
                          >
                            {busy ? 'Working...' : 'Resend'}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRevokePrincipalClaimInvite(invite)}
                            disabled={busy}
                          >
                            Revoke
                          </Button>
                        </>
                      ) : (
                        <span className="text-sm text-[#8da0b6]">
                          {invite.status === 'active'
                            ? 'Accepted and linked to the active principal membership.'
                            : 'Invitation closed.'}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          </div>
        </details>
      ) : null}

      {canManageOwnershipRemediation ? (
        <SettingsSectionCard
          title="Organisation ownership remediation"
          description="Platform-admin review queue. Only unambiguous legacy principal-to-owner repairs can be applied here; all other findings remain manual review."
        >
          {loadingOwnershipRemediation ? <SettingsLoadingState label="Loading ownership remediation report…" compact /> : null}
          {!loadingOwnershipRemediation && ownershipReleaseReadiness?.status === 'ready_for_unique_primary_enforcement' ? (
            <SettingsBanner tone="success">
              Release gate passed: all {ownershipReleaseReadiness.organisationCount || 0} organisations have one valid active primary owner. A separately approved uniqueness-enforcement migration may now be scheduled.
            </SettingsBanner>
          ) : null}
          {!loadingOwnershipRemediation && ownershipReleaseReadiness?.status === 'remediation_required' ? (
            <SettingsBanner tone="warning">
              Release gate is blocked by {ownershipReleaseReadiness.blockerCount || 0} organisation{ownershipReleaseReadiness.blockerCount === 1 ? '' : 's'}. Resolve every blocker before scheduling uniqueness enforcement.
            </SettingsBanner>
          ) : null}
          {!loadingOwnershipRemediation && ownershipReleaseReadiness?.status === 'unavailable' ? (
            <SettingsBanner tone="warning">
              The Phase 7 release gate is unavailable. {ownershipReleaseReadiness.error}
            </SettingsBanner>
          ) : null}
          {!loadingOwnershipRemediation && permissionIntegrityAudit?.unavailable ? (
            <SettingsBanner tone="warning">
              Permission-integrity audit is unavailable. {permissionIntegrityAudit.error}
            </SettingsBanner>
          ) : null}
          {!loadingOwnershipRemediation && permissionIntegrityAudit?.summary ? (
            <div className="space-y-3">
              <SettingsBanner tone={
                permissionIntegrityAudit.summary.roleFieldConflictCount ||
                permissionIntegrityAudit.summary.invalidPrimaryOwnerCount ||
                permissionIntegrityAudit.summary.duplicateActiveMembershipGroupCount
                  ? 'warning'
                  : 'success'
              }>
                Permission-integrity audit: {permissionIntegrityAudit.summary.roleFieldIncompleteCount || 0} incomplete role record{permissionIntegrityAudit.summary.roleFieldIncompleteCount === 1 ? '' : 's'}, {permissionIntegrityAudit.summary.roleFieldConflictCount || 0} conflicting role record{permissionIntegrityAudit.summary.roleFieldConflictCount === 1 ? '' : 's'}, and {permissionIntegrityAudit.summary.duplicateActiveMembershipGroupCount || 0} duplicate active-membership group{permissionIntegrityAudit.summary.duplicateActiveMembershipGroupCount === 1 ? '' : 's'}.
              </SettingsBanner>
              {(permissionIntegrityAudit.organisations || [])
                .filter((entry) => entry.roleFieldIncompleteCount > 0 && !entry.roleFieldConflictCount && !entry.invalidPrimaryOwnerCount && !entry.duplicateActiveMembershipGroupCount)
                .map((entry) => (
                  <div key={entry.organisationId} className="flex flex-col gap-3 rounded-xl border border-[#e4ebf3] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm text-[#51657b]">
                      {entry.organisationName || entry.organisationId}: {entry.roleFieldIncompleteCount} safe role-field repair{entry.roleFieldIncompleteCount === 1 ? '' : 's'} available.
                    </span>
                    <Button type="button" variant="secondary" disabled={applyingPermissionIntegrityRepair} onClick={() => setPermissionIntegrityRepairTarget(entry)}>
                      Apply safe role repair
                    </Button>
                  </div>
                ))}
            </div>
          ) : null}
          {!loadingOwnershipRemediation && !ownershipRemediationReport.length ? (
            <SettingsEmptyState
              title="No organisations found"
              description="There are no organisation ownership records available for remediation review."
            />
          ) : null}
          {!loadingOwnershipRemediation && ownershipRemediationReport.length ? (
            <div className="divide-y divide-[#e9eff5] overflow-hidden rounded-2xl border border-[#e4ebf3] bg-white">
              {ownershipRemediationReport.map((entry) => {
                const canApplySafeRepair = entry.resolution === 'safe_repair'
                const isReady = entry.resolution === 'ready'
                const manualReview = ownershipManualReviewQueue.find((item) => item.organisationId === entry.organisationId)
                return (
                  <div key={entry.organisationId} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[#162334]">{entry.organisationName || entry.organisationId}</p>
                      <p className="text-sm text-[#51657b]">
                        {entry.activeOwnerCount} active owners · {entry.activePrimaryCount} active primary records · {entry.activeMemberCount} active members
                      </p>
                      <span className={[
                        'inline-flex rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em]',
                        isReady ? 'border-[#cde8dc] bg-[#f2fbf5] text-[#1f7a45]' : canApplySafeRepair ? 'border-[#f3d9a8] bg-[#fff8ec] text-[#a16207]' : 'border-[#f1c5c5] bg-[#fff5f5] text-[#b42318]',
                      ].join(' ')}>
                        {String(entry.resolution || 'manual_review').replaceAll('_', ' ')}
                      </span>
                    </div>
                    {canApplySafeRepair ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={applyingOwnershipRemediation}
                        onClick={() => setOwnershipRemediationTarget(entry)}
                      >
                        Apply safe repair
                      </Button>
                    ) : (
                      <div className="space-y-1 text-sm text-[#7b8da6]">
                        <span>{isReady ? 'No action needed' : 'Manual review required'}</span>
                        {!isReady && manualReview?.members?.length ? (
                          <p className="max-w-md text-xs text-[#51657b]">
                            Review: {manualReview.members.map((member) => `${member.memberName} (${member.effectiveRole}${member.isPrimaryOwner ? ', primary' : ''})`).join(' · ')}
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : null}
        </SettingsSectionCard>
      ) : null}



      <SettingsSectionCard className="hidden" title="Users" description="Manage role access for the current organisation workspace.">
        {loading ? <SettingsLoadingState label="Loading users…" compact /> : null}

        {!loading && users.length && ownershipHealth.status === 'recovery_required' ? (
          <SettingsBanner tone="error">
            Ownership needs attention: {ownershipHealth.issues.map((issue) => issue.replaceAll('_', ' ')).join(', ')}. {openAgencyOperations ? 'Use Claim ownership or Make primary owner to establish the agency ownership.' : 'A platform administrator must run the ownership remediation before owner controls can be used.'}
          </SettingsBanner>
        ) : null}

        {!loading && users.length && ownershipHealth.status === 'healthy' ? (
          <SettingsBanner tone="success">
            Ownership health is valid: {ownershipHealth.activeOwnerCount} active {ownershipHealth.activeOwnerCount === 1 ? 'owner' : 'owners'}, including one primary owner.
          </SettingsBanner>
        ) : null}

        {!loading && !users.length ? (
          <SettingsEmptyState
            title="No users have been invited yet"
            description="Invite your first team member to start assigning roles and access."
          />
        ) : null}

        {!loading && users.length ? (
          <div className={`${settingsTableClass} overflow-x-auto`}>
            <div className="hidden grid-cols-[1.05fr_1.05fr_1.25fr_0.9fr_0.95fr_1.1fr_0.65fr_0.7fr_0.65fr] gap-4 border-b border-[#e4ebf3] bg-[#f4f8fb] px-5 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7b8da6] lg:grid lg:min-w-[1420px]">
              <span>Name</span>
              <span>Email</span>
              <span>Role</span>
              <span>Job title</span>
              <span>Business Lines</span>
              <span>Sales Commission Structure</span>
              <span>Status</span>
              <span>Last active</span>
              <span>Actions</span>
            </div>

            <div className="divide-y divide-[#e9eff5] lg:min-w-[1420px]">
              {users.map((userRow) => {
                const profileByOrgUserId = commissionProfileByUserKey.get(`org-user:${String(userRow.id || '')}`)
                const profileByUserId = commissionProfileByUserKey.get(`user:${String(userRow.userId || '')}`)
                const profileByEmail = commissionProfileByUserKey.get(`email:${String(userRow.email || '').trim().toLowerCase()}`)
                const commissionProfile = profileByOrgUserId || profileByUserId || profileByEmail || null
                const assignedStructure = commissionProfile?.commissionStructureId
                  ? commissionStructureById.get(String(commissionProfile.commissionStructureId))
                  : null
                const usingDefault = !assignedStructure && defaultCommissionStructure
                const roleTarget = {
                  id: userRow.id,
                  userId: userRow.userId,
                  email: userRow.email,
                  role: userRow.role,
                  membershipRole: userRow.role,
                  branchId: userRow.branchId || userRow.primaryBranchId || '',
                }
                const roleOptions = filterGovernedRoleOptions(authorityActor, roleTarget, workspaceRoleOptions)
                const canChangeRole = canEdit && roleOptions.some((option) => option.value !== userRow.role)
                const isCurrentUser = Boolean(
                  userRow.userId && String(userRow.userId) === String(profile?.id || organisationMembership?.userId || organisationMembership?.user_id || ''),
                )
                const canGrantOwnership = Boolean(
                  canManageOwnership &&
                  (openAgencyOperations || !isCurrentUser) &&
                  userRow.userId &&
                  userRow.status === 'active' &&
                  userRow.role !== 'owner',
                )
                const canReceivePrimaryOwnership = Boolean(
                  canManageOwnership &&
                  (openAgencyOperations || !isCurrentUser) &&
                  userRow.userId &&
                  userRow.status === 'active' &&
                  (openAgencyOperations || userRow.role === 'owner') &&
                  !userRow.isPrimaryOwner,
                )
                const canDeactivateUser = Boolean(
                  canEdit &&
                  !isCurrentUser &&
                  userRow.status !== 'deactivated' &&
                  userRow.role !== 'owner',
                )
                const businessWorkspaceIds = resolveUserBusinessWorkspaceIds(userRow, organisationBusinessWorkspaceIds)
                const businessAccessManagedByRole = isBusinessAccessManagedByRole(userRow.role || userRow.workspaceRole || userRow.organisationRole)
                const businessAccessSourceLabel = getUserBusinessWorkspaceSourceLabel(userRow)
                const canChangeBusinessAccess = Boolean(
                  showBusinessWorkspaceAccessControls &&
                    canEdit &&
                    !businessAccessManagedByRole &&
                    userRow.status !== 'deactivated',
                )
                return (
                <div
                  key={userRow.id}
                  className="grid gap-3 px-5 py-4 lg:grid-cols-[1.05fr_1.05fr_1.25fr_0.9fr_0.95fr_1.1fr_0.65fr_0.7fr_0.65fr] lg:items-center lg:gap-4"
                >
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] lg:hidden">Name</span>
                    <strong className="text-sm text-[#162334]">{userRow.fullName}</strong>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] lg:hidden">Email</span>
                    <span className="text-sm text-[#51657b]">{userRow.email}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] lg:hidden">Role</span>
                    {canChangeRole ? (
                      <Field
                        as="select"
                        value={userRow.role}
                        className="py-2.5"
                        disabled={savingRoleUserId === userRow.id}
                        aria-label={`Role for ${userRow.fullName}`}
                        onChange={(event) => handleRoleChange(userRow.id, event.target.value)}
                      >
                        {roleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Field>
                    ) : (
                      <span className="text-sm capitalize text-[#51657b]">{userRow.role.replaceAll('_', ' ')}</span>
                    )}
                    {userRow.isPrimaryOwner ? (
                      <span className="inline-flex rounded-full border border-[#cde8dc] bg-[#f2fbf5] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#1f7a45]">
                        Primary owner
                      </span>
                    ) : userRow.role === 'owner' ? (
                      <span className="inline-flex rounded-full border border-[#d7e3ef] bg-white px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#51657b]">
                        Organisation owner
                      </span>
                    ) : null}
                    <RolePermissionSummary role={userRow.role} workspaceType={resolvedWorkspaceType} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] lg:hidden">Job title</span>
                    {canManageJobTitles ? (
                      <Field
                        as="select"
                        value={userRow.jobTitle || ''}
                        className="py-2.5"
                        aria-label={`Job title for ${userRow.fullName}`}
                        disabled={savingJobTitleUserId === userRow.id}
                        onChange={(event) => handleJobTitleChange(userRow.id, event.target.value)}
                      >
                        {ORGANISATION_JOB_TITLE_OPTIONS.map((option) => (
                          <option key={option.value || 'unassigned'} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Field>
                    ) : (
                      <span className="text-sm text-[#51657b]">
                        {getOrganisationJobTitleLabel(userRow.jobTitle, 'Not assigned')}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] lg:hidden">Business Lines</span>
                    {canChangeBusinessAccess ? (
                      <Field
                        as="select"
                        value={toBusinessWorkspaceAccessValue(businessWorkspaceIds)}
                        className="py-2.5"
                        disabled={savingBusinessAccessUserId === userRow.id}
                        aria-label={`Business lines for ${userRow.fullName}`}
                        onChange={(event) => handleBusinessWorkspaceAccessChange(userRow, event.target.value)}
                      >
                        {!businessWorkspaceIds.length ? <option value="" disabled>No enabled lines</option> : null}
                        {businessWorkspaceAccessOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Field>
                    ) : (
                      <span className="text-sm text-[#51657b]">
                        {businessWorkspaceIds
                          .map((id) => BUSINESS_WORKSPACE_OPTIONS.find((option) => option.id === id)?.label || id)
                          .join(' & ') || 'No enabled lines'}
                      </span>
                    )}
                    {businessAccessSourceLabel && showBusinessWorkspaceAccessControls ? (
                      <span className="block text-xs font-medium text-[#7b8da6]">{businessAccessSourceLabel}</span>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] lg:hidden">Sales Commission Structure</span>
                    {canEdit ? (
                      <div className="space-y-1">
                        <Field
                          as="select"
                          value={commissionProfile?.commissionStructureId || ''}
                          className="py-2.5"
                          onChange={(event) => handleCommissionStructureChange(userRow, event.target.value)}
                        >
                          <option value="">Use default / unassigned</option>
                          {commissionStructures
                            .filter((item) => item.isActive)
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                        </Field>
                        {!assignedStructure && !usingDefault ? (
                          <span className="inline-flex rounded-full border border-[#f3d9a8] bg-[#fff8ec] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#a16207]">
                            Needs assignment
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <span className="text-sm text-[#51657b]">
                          {assignedStructure?.name || (usingDefault ? `${defaultCommissionStructure?.name || 'Default'} (Default)` : 'Unassigned')}
                        </span>
                        {!assignedStructure && !usingDefault ? (
                          <span className="inline-flex rounded-full border border-[#f3d9a8] bg-[#fff8ec] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#a16207]">
                            Needs assignment
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] lg:hidden">Status</span>
                    <span className={[
                      'inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize',
                      userRow.isPrincipalClaim
                        ? 'border-[#cde8dc] bg-[#f2fbf5] text-[#1f7a45]'
                        : 'border-[#d7e3ef] bg-white text-[#51657b]',
                    ].join(' ')}>
                      {formatUserStatusLabel(userRow)}
                    </span>
                    {userRow.isPrincipalClaim ? (
                      <span className="block text-xs font-medium text-[#7b8da6]">Principal invitation flow</span>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] lg:hidden">Last active</span>
                    <span className="text-sm text-[#51657b]">
                      {userRow.lastActiveAt ? new Date(userRow.lastActiveAt).toLocaleDateString() : 'Not tracked'}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] lg:hidden">Actions</span>
                    {canGrantOwnership ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={transferringOwnership}
                        onClick={() => setOwnershipTransferTarget({ action: isCurrentUser ? 'claim' : 'grant', user: userRow })}
                      >
                        {isCurrentUser ? 'Claim ownership' : 'Grant owner'}
                      </Button>
                    ) : null}
                    {canReceivePrimaryOwnership ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={transferringOwnership}
                        onClick={() => setOwnershipTransferTarget({ action: 'make_primary', user: userRow })}
                      >
                        Make primary owner
                      </Button>
                    ) : null}
                    {canDeactivateUser ? (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={deactivatingUser}
                        onClick={() => setDeactivationTarget(userRow)}
                      >
                        Deactivate
                      </Button>
                    ) : !canGrantOwnership && !canReceivePrimaryOwnership && !canDeactivateUser ? (
                      <span className="text-sm text-[#8da0b6]">—</span>
                    ) : null}
                  </div>
                </div>
              )})}
            </div>
          </div>
        ) : null}
      </SettingsSectionCard>

      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
      {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}

      <ConfirmDialog
        open={Boolean(deactivationTarget)}
        title="Deactivate this user?"
        description={`${deactivationTarget?.fullName || deactivationTarget?.email || 'This user'} will lose access to this workspace. Their account and historical activity will be retained.`}
        confirmLabel="Deactivate user"
        confirming={deactivatingUser}
        variant="destructive"
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivationTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(ownershipTransferTarget)}
        title={ownershipTransferTarget?.action === 'make_primary' ? 'Make this member primary owner?' : ownershipTransferTarget?.action === 'claim' ? 'Claim organisation ownership?' : 'Grant organisation owner access?'}
        description={ownershipTransferTarget?.action === 'make_primary'
          ? `${ownershipTransferTarget?.user?.fullName || ownershipTransferTarget?.user?.email || 'This member'} will become the primary owner. Existing owners will keep their ownership.`
          : `${ownershipTransferTarget?.user?.fullName || ownershipTransferTarget?.user?.email || 'This member'} will become an additional organisation owner. The current primary owner will not change.`}
        confirmLabel={ownershipTransferTarget?.action === 'make_primary' ? 'Make primary owner' : ownershipTransferTarget?.action === 'claim' ? 'Claim ownership' : 'Grant owner'}
        confirming={transferringOwnership}
        onConfirm={handleOwnershipChange}
        onCancel={() => setOwnershipTransferTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(ownershipRemediationTarget)}
        title="Apply safe ownership repair?"
        description={`This will promote the one active primary principal in ${ownershipRemediationTarget?.organisationName || 'the selected organisation'} to owner. It is only available where the server has verified that no other active owner or primary record exists.`}
        confirmLabel="Apply safe repair"
        confirming={applyingOwnershipRemediation}
        onConfirm={handleApplyOwnershipRemediation}
        onCancel={() => setOwnershipRemediationTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(permissionIntegrityRepairTarget)}
        title="Apply safe role-field repair?"
        description={`This will complete only missing role mirrors in ${permissionIntegrityRepairTarget?.organisationName || 'the selected organisation'}. It will not change a member's effective role, resolve conflicting roles, or alter ownership.`}
        confirmLabel="Apply safe role repair"
        confirming={applyingPermissionIntegrityRepair}
        onConfirm={handleApplyPermissionIntegrityRepair}
        onCancel={() => setPermissionIntegrityRepairTarget(null)}
      />
    </div>
  )
}
