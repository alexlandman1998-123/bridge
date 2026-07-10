import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BriefcaseBusiness, CheckCircle2, ShieldCheck, UserPlus, UsersRound } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import { useWorkspace } from '../../context/WorkspaceContext'
import { PERMISSIONS } from '../../auth/permissions/permissionRegistry'
import {
  assignOrganisationUserCommissionProfile,
  deactivateOrganisationUser,
  fetchOrganisationSettings,
  listOrganisationCommissionStructures,
  listOrganisationUserCommissionProfiles,
  listOrganisationUsers,
  updateOrganisationUserRole,
} from '../../lib/settingsApi'
import {
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
import {
  SettingsBanner,
  SettingsEmptyState,
  SettingsLoadingState,
  SettingsPageHeader,
  SettingsSectionCard,
  SettingsToggleRow,
  settingsActionRowClass,
  settingsFieldClass,
  settingsFieldSpanClass,
  settingsGridClass,
  settingsPageClass,
  settingsTableClass,
} from './settingsUi'
import {
  listCommercialAccessManagementState,
  listCommercialAccessRequests,
  reviewCommercialAccessRequest,
  setCommercialOrganisationModuleEnabled,
  setCommercialUserAccess,
} from '../../modules/commercial/services/commercialApi'

const ROLE_OPTIONS = [
  { value: 'owner', label: 'Organisation Owner' },
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'principal', label: 'Principal' },
  { value: 'admin', label: 'Admin' },
  { value: 'branch_manager', label: 'Branch Manager' },
  { value: 'team_lead', label: 'Team Lead' },
  { value: 'senior_agent', label: 'Senior Agent' },
  { value: 'agent', label: 'Agent' },
  { value: 'assistant', label: 'Assistant' },
  { value: 'transaction_coordinator', label: 'Transaction Coordinator' },
  { value: 'listing_coordinator', label: 'Listing Coordinator' },
  { value: 'admin_coordinator', label: 'Admin Coordinator' },
  { value: 'viewer', label: 'Viewer' },
]

function resolveInviteRole(value = '', fallback = 'agent') {
  const normalized = String(value || '').trim().toLowerCase()
  return ROLE_OPTIONS.some((option) => option.value === normalized) ? normalized : fallback
}

function resolveDefaultTeamInviteRole(options = [], preferredRole = 'branch_manager') {
  const preferred = resolveInviteRole(preferredRole, 'branch_manager')
  return (
    options.find((option) => option.value === preferred)?.value ||
    options.find((option) => option.value === 'branch_manager')?.value ||
    options.find((option) => option.value === 'agent')?.value ||
    options[0]?.value ||
    'agent'
  )
}

function getRoleLevel(value = '') {
  return getAgencyAuthorityLevel(normalizeAgencyAuthorityRole(value))
}

function canAssignOrganisationRole(actor = {}, targetRole = '', { target = {}, invite = false } = {}) {
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

function filterAssignableRoleOptions(actor = {}, { target = null, invite = false } = {}) {
  const currentRole = target?.role || ''
  const options = ROLE_OPTIONS.filter((option) => canAssignOrganisationRole(actor, option.value, { target: target || {}, invite }))
  if (currentRole && !options.some((option) => option.value === currentRole)) {
    const currentOption = ROLE_OPTIONS.find((option) => option.value === currentRole)
    if (currentOption) return [currentOption, ...options]
  }
  return options
}

function readInviteNavigationState(state = {}) {
  return state && typeof state === 'object' && !Array.isArray(state) ? state : {}
}

function isPrincipalInviteRole(role = '') {
  return normalizeAgencyAuthorityRole(role) === 'principal'
}

function resolveInitialInviteMode({ navigationState = {}, inviteRole = '' } = {}) {
  const explicitMode = String(navigationState.inviteMode || navigationState.mode || '').trim().toLowerCase()
  if (explicitMode === 'principal_claim' || explicitMode === 'principal') return 'principal_claim'
  if (explicitMode === 'team' || explicitMode === 'manager') return 'team'
  if (navigationState.inviteIntent === 'residential_principal_manager' && isPrincipalInviteRole(inviteRole)) return 'principal_claim'
  return isPrincipalInviteRole(inviteRole) ? 'principal_claim' : 'team'
}

function formatUserStatusLabel(userRow = {}) {
  if (userRow.isPrincipalClaim) {
    if (userRow.status === 'active') return 'Principal active'
    if (userRow.status === 'pending') return 'Principal invite pending'
    if (userRow.status === 'invited') return 'Principal invite sent'
  }
  return String(userRow.status || 'invited').replaceAll('_', ' ')
}

function formatInviteDate(value = '') {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleDateString()
}

function formatPrincipalClaimStatusLabel(invite = {}) {
  const status = String(invite?.status || '').trim()
  if (status === 'active') return 'Access active'
  if (status === 'pending_invite') return 'Invite pending'
  if (status === 'revoked') return 'Invite revoked'
  if (status === 'expired') return 'Invite expired'
  return status ? status.replaceAll('_', ' ') : 'Principal invite'
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

function formatCommercialAuditAction(action = '') {
  const label = String(action || '')
    .replace(/^commercial_/, '')
    .replaceAll('_', ' ')
    .trim()
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Commercial access update'
}

function getCommercialAuditSubject(event = {}) {
  const metadata = event.metadata || {}
  return (
    metadata.targetEmail ||
    metadata.requesterEmail ||
    metadata.targetUserId ||
    metadata.requesterUserId ||
    event.targetId ||
    'Commercial workspace'
  )
}

export default function SettingsUsersPage() {
  const location = useLocation()
  const { can, role, currentMembership, currentWorkspace, workspaceRole, workspaceType, profile } = useWorkspace()
  const resolvedWorkspaceType = currentWorkspace?.type || workspaceType || ''
  const [membershipRole, setMembershipRole] = useState('viewer')
  const canEdit = can(PERMISSIONS.manageUsers)
  const administratorLabel = getWorkspaceAdministratorLabel({ appRole: role, workspaceType: resolvedWorkspaceType })
  const inviteSectionRef = useRef(null)
  const inviteNavigationState = useMemo(() => readInviteNavigationState(location.state), [location.state])
  const isPrincipalManagerInviteIntent = inviteNavigationState.inviteIntent === 'residential_principal_manager'
  const initialInviteRole = resolveInviteRole(inviteNavigationState.inviteRole || inviteNavigationState.role, 'agent')
  const initialInviteMode = resolveInitialInviteMode({ navigationState: inviteNavigationState, inviteRole: initialInviteRole })
  const [users, setUsers] = useState([])
  const [commissionStructures, setCommissionStructures] = useState([])
  const [commissionProfiles, setCommissionProfiles] = useState([])
  const [pendingPrincipalClaimInvites, setPendingPrincipalClaimInvites] = useState([])
  const [principalClaimInviteHistory, setPrincipalClaimInviteHistory] = useState([])
  const [commercialAccessRequests, setCommercialAccessRequests] = useState([])
  const [commercialAccessManagement, setCommercialAccessManagement] = useState({ organisationModuleStatus: null, users: [], auditEvents: [] })
  const [activePanel, setActivePanel] = useState(inviteNavigationState.openInvite ? 'invite' : 'directory')
  const [inviteMode, setInviteMode] = useState(initialInviteMode)
  const [inviteForm, setInviteForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role: isPrincipalInviteRole(initialInviteRole) ? 'branch_manager' : initialInviteRole,
    commissionStructureId: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [claimInviteBusyId, setClaimInviteBusyId] = useState('')
  const [reviewingRequestId, setReviewingRequestId] = useState('')
  const [savingCommercialModule, setSavingCommercialModule] = useState(false)
  const [savingCommercialUserId, setSavingCommercialUserId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const authorityMembershipRole = useMemo(() => {
    const candidates = [
      membershipRole,
      workspaceRole,
      currentMembership?.workspaceRole,
      currentMembership?.role,
    ].filter(Boolean)
    return candidates.reduce((strongestRole, candidateRole) => (
      getRoleLevel(candidateRole) > getRoleLevel(strongestRole) ? candidateRole : strongestRole
    ), 'viewer')
  }, [currentMembership?.role, currentMembership?.workspaceRole, membershipRole, workspaceRole])
  const authorityActor = useMemo(() => ({
    id: profile?.id || currentMembership?.userId || currentMembership?.user_id || '',
    userId: profile?.id || currentMembership?.userId || currentMembership?.user_id || '',
    email: profile?.email || currentMembership?.email || '',
    role: authorityMembershipRole,
    membershipRole: authorityMembershipRole,
    branchId: currentMembership?.primaryBranchId || currentMembership?.branchId || currentMembership?.primary_branch_id || currentMembership?.branch_id || '',
  }), [authorityMembershipRole, currentMembership, profile])
  const usesAgencyGovernance = useMemo(() => {
    const type = String(currentWorkspace?.type || workspaceType || '').trim().toLowerCase()
    return !type || ['agency', 'residential'].includes(type)
  }, [currentWorkspace?.type, workspaceType])
  const inviteRoleOptions = useMemo(
    () => (usesAgencyGovernance ? filterAssignableRoleOptions(authorityActor, { invite: true }) : ROLE_OPTIONS),
    [authorityActor, usesAgencyGovernance],
  )
  const teamInviteRoleOptions = useMemo(
    () => inviteRoleOptions.filter((option) => !isPrincipalInviteRole(option.value)),
    [inviteRoleOptions],
  )
  const principalInviteAllowed = useMemo(
    () => inviteRoleOptions.some((option) => isPrincipalInviteRole(option.value)),
    [inviteRoleOptions],
  )
  const principalInviteSelected = usesAgencyGovernance && inviteMode === 'principal_claim'
  const teamInviteDisabled = inviteMode === 'team' && teamInviteRoleOptions.length === 0
  const principalInviteDisabled = principalInviteSelected && !principalInviteAllowed

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
      const [response, context, structureRows, profileRows, principalClaimInvites, commercialRequests, commercialManagement] = await Promise.all([
        listOrganisationUsers(),
        fetchOrganisationSettings(),
        listOrganisationCommissionStructures(),
        listOrganisationUserCommissionProfiles(),
        canEdit ? listWorkspaceUserInvites({ includeInactive: true }).catch(() => []) : Promise.resolve([]),
        listCommercialAccessRequests({ status: 'pending' }).catch(() => []),
        listCommercialAccessManagementState().catch(() => ({ organisationModuleStatus: null, users: [], auditEvents: [] })),
      ])
      setUsers(response)
      setMembershipRole(normalizeOrganisationMembershipRole(
        context.membershipRole ||
          workspaceRole ||
          currentMembership?.workspaceRole ||
          currentMembership?.role ||
          'viewer',
        {
        appRole: role,
        workspaceType: context?.organisation?.type || resolvedWorkspaceType,
        },
      ))
      setCommissionStructures(Array.isArray(structureRows) ? structureRows : [])
      setCommissionProfiles(Array.isArray(profileRows) ? profileRows : [])
      const principalClaimInviteRows = (Array.isArray(principalClaimInvites) ? principalClaimInvites : [])
        .filter((invite) => invite?.isPrincipalClaimInvite || isPrincipalInviteRole(invite?.role))
      setPrincipalClaimInviteHistory(principalClaimInviteRows)
      setPendingPrincipalClaimInvites(principalClaimInviteRows.filter((invite) => invite.status === 'pending_invite'))
      setCommercialAccessRequests(Array.isArray(commercialRequests) ? commercialRequests : [])
      setCommercialAccessManagement(commercialManagement || { organisationModuleStatus: null, users: [], auditEvents: [] })
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [canEdit, currentMembership?.role, currentMembership?.workspaceRole, resolvedWorkspaceType, role, workspaceRole])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  useEffect(() => {
    if (!inviteNavigationState.openInvite) return
    setActivePanel('invite')
    if (isPrincipalManagerInviteIntent) {
      const requestedRole = resolveInviteRole(inviteNavigationState.inviteRole || inviteNavigationState.role, 'principal')
      const requestedMode = resolveInitialInviteMode({ navigationState: inviteNavigationState, inviteRole: requestedRole })
      setInviteMode(requestedMode)
      if (requestedMode === 'team') {
        const allowedRole = teamInviteRoleOptions.some((option) => option.value === requestedRole)
          ? requestedRole
          : resolveDefaultTeamInviteRole(teamInviteRoleOptions, requestedRole)
        setInviteForm((previous) => ({ ...previous, role: allowedRole }))
      }
      window.setTimeout(() => {
        inviteSectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      }, 0)
      return
    }
    const nextRole = resolveInviteRole(inviteNavigationState.inviteRole || inviteNavigationState.role, 'principal')
    if (isPrincipalInviteRole(nextRole)) {
      setInviteMode('principal_claim')
    } else {
      setInviteMode('team')
      const allowedRole = teamInviteRoleOptions.some((option) => option.value === nextRole)
        ? nextRole
        : resolveDefaultTeamInviteRole(teamInviteRoleOptions, nextRole)
      setInviteForm((previous) => ({ ...previous, role: allowedRole }))
    }
    window.setTimeout(() => {
      inviteSectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    }, 0)
  }, [
    inviteNavigationState,
    inviteNavigationState.inviteIntent,
    inviteNavigationState.inviteMode,
    inviteNavigationState.mode,
    inviteNavigationState.inviteRole,
    inviteNavigationState.openInvite,
    inviteNavigationState.role,
    isPrincipalManagerInviteIntent,
    teamInviteRoleOptions,
  ])

  useEffect(() => {
    if (inviteMode !== 'team') return
    if (!teamInviteRoleOptions.length) return
    if (teamInviteRoleOptions.some((option) => option.value === inviteForm.role)) return
    setInviteForm((previous) => ({
      ...previous,
      role: resolveDefaultTeamInviteRole(teamInviteRoleOptions, inviteNavigationState.inviteRole || inviteNavigationState.role),
    }))
  }, [inviteForm.role, inviteMode, inviteNavigationState.inviteRole, inviteNavigationState.role, teamInviteRoleOptions])

  function handleInviteModeChange(nextMode) {
    setInviteMode(nextMode)
    if (nextMode === 'team') {
      setInviteForm((previous) => ({
        ...previous,
        role: teamInviteRoleOptions.some((option) => option.value === previous.role)
          ? previous.role
          : resolveDefaultTeamInviteRole(teamInviteRoleOptions, inviteNavigationState.inviteRole || inviteNavigationState.role),
      }))
    }
  }

  async function handleInvite(event) {
    event.preventDefault()
    if (!canEdit) return
    if (teamInviteDisabled) {
      setError('You do not have authority to invite manager or team roles from this workspace.')
      return
    }
    if (principalInviteDisabled) {
      setError('Only the organisation owner can invite another principal.')
      return
    }
    try {
      setSaving(true)
      setError('')
      setMessage('')
      const selectedCommissionStructure =
        commissionStructureById.get(String(inviteForm.commissionStructureId || '').trim()) ||
        defaultCommissionStructure ||
        null
      const inviteResult = await createWorkspaceUserInvite({
        firstName: inviteForm.firstName,
        lastName: inviteForm.lastName,
        email: inviteForm.email,
        role: principalInviteSelected ? 'principal' : inviteForm.role,
        branchId: principalInviteSelected ? '' : inviteNavigationState.branchId || '',
        branchName: principalInviteSelected ? '' : inviteNavigationState.branchName || '',
        commissionStructureId: selectedCommissionStructure?.id || '',
        commissionStructureName: selectedCommissionStructure?.name || '',
        source: inviteNavigationState.inviteSource || (principalInviteSelected ? 'settings_users_principal_invite' : 'settings_users_invite'),
      })
      setInviteForm({
        firstName: '',
        lastName: '',
        email: '',
        role: resolveDefaultTeamInviteRole(teamInviteRoleOptions, inviteNavigationState.inviteRole || inviteNavigationState.role),
        commissionStructureId: '',
      })
      await loadUsers()
      setMessage(
        inviteResult.reusedExistingInvite
          ? principalInviteSelected ? 'Existing principal invite resent.' : 'Existing pending invite resent.'
          : principalInviteSelected ? 'Principal invite sent.' : 'User invite sent.',
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
      await updateOrganisationUserRole(userRowId, nextRole)
      await loadUsers()
    } catch (saveError) {
      setError(saveError.message)
    }
  }

  async function handleDeactivate(userRowId) {
    if (!canEdit) return
    try {
      setError('')
      await deactivateOrganisationUser(userRowId)
      await loadUsers()
    } catch (saveError) {
      setError(saveError.message)
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

  async function handleCommercialAccessReview(requestId, decision) {
    if (!canEdit) return
    try {
      setReviewingRequestId(requestId)
      setError('')
      const result = await reviewCommercialAccessRequest(requestId, { decision })
      await loadUsers()
      const requesterNotified = Number(result?.notificationResult?.notificationCount || 0) > 0
      const requesterEmailed = Number(result?.notificationResult?.emailCount || 0) > 0
      setMessage(
        requesterEmailed
          ? decision === 'approved'
            ? 'Commercial access approved and requester emailed.'
            : 'Commercial access request rejected and requester emailed.'
          : requesterNotified
          ? decision === 'approved'
            ? 'Commercial access approved and requester notified.'
            : 'Commercial access request rejected and requester notified.'
          : decision === 'approved'
            ? 'Commercial access approved.'
            : 'Commercial access request rejected.',
      )
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setReviewingRequestId('')
    }
  }

  async function handleCommercialModuleToggle(enabled) {
    if (!canEdit) return
    try {
      setSavingCommercialModule(true)
      setError('')
      await setCommercialOrganisationModuleEnabled(enabled)
      await loadUsers()
      setMessage(enabled ? 'Commercial module enabled for this organisation.' : 'Commercial module disabled for this organisation.')
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSavingCommercialModule(false)
    }
  }

  async function handleCommercialUserAccessChange(organisationUserId, enabled) {
    if (!canEdit) return
    try {
      setSavingCommercialUserId(organisationUserId)
      setError('')
      await setCommercialUserAccess(organisationUserId, enabled)
      await loadUsers()
      setMessage(enabled ? 'Commercial access granted.' : 'Commercial access removed.')
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSavingCommercialUserId('')
    }
  }

  async function handleCopyPrincipalClaimLink(invite) {
    const inviteLink = invite?.inviteLink || invite?.onboardingUrl || ''
    if (!inviteLink) {
      setError('Principal invite link is not available for this invite.')
      return
    }
    try {
      await navigator.clipboard.writeText(inviteLink)
      setError('')
      setMessage(`Principal invite link copied for ${invite.email}.`)
    } catch {
      setError('Unable to copy the principal invite link from this browser.')
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
      setMessage(`Principal invite resent to ${invite.email}.`)
    } catch (resendError) {
      setError(resendError?.message || 'Unable to resend this principal invite.')
    } finally {
      setClaimInviteBusyId('')
    }
  }

  async function handleRevokePrincipalClaimInvite(invite) {
    if (!canEdit || !invite?.id) return
    const confirmed = window.confirm(`Revoke the pending principal invite for ${invite.email}?`)
    if (!confirmed) return
    try {
      setClaimInviteBusyId(invite.id)
      setError('')
      setMessage('')
      await revokeWorkspaceUserInvite(invite)
      await loadUsers()
      setMessage(`Principal invite revoked for ${invite.email}.`)
    } catch (revokeError) {
      setError(revokeError?.message || 'Unable to revoke this principal invite.')
    } finally {
      setClaimInviteBusyId('')
    }
  }

  const commercialAccessByUserId = useMemo(() => {
    const map = new Map()
    for (const row of commercialAccessManagement.users || []) {
      if (row.organisationUserId) map.set(row.organisationUserId, row)
    }
    return map
  }, [commercialAccessManagement.users])

  const commercialModuleActive = commercialAccessManagement.organisationModuleStatus?.enabled === true
  const commercialAuditEvents = commercialAccessManagement.auditEvents || []
  const activeUserCount = useMemo(
    () => (users || []).filter((userRow) => userRow.status === 'active').length,
    [users],
  )
  const commercialAssignedCount = useMemo(
    () => (commercialAccessManagement.users || []).filter((userRow) => userRow.hasCommercialAccess).length,
    [commercialAccessManagement.users],
  )
  const panelOptions = useMemo(() => ([
    {
      value: 'invite',
      label: 'Invites',
      description: pendingPrincipalClaimInvites.length
        ? `${pendingPrincipalClaimInvites.length} principal invite${pendingPrincipalClaimInvites.length === 1 ? '' : 's'} pending`
        : 'Send manager, team, or principal links',
      icon: UserPlus,
    },
    {
      value: 'directory',
      label: 'Directory',
      description: `${activeUserCount} active user${activeUserCount === 1 ? '' : 's'} in this workspace`,
      icon: UsersRound,
    },
    {
      value: 'commercial',
      label: 'Commercial Access',
      description: commercialAccessRequests.length
        ? `${commercialAccessRequests.length} request${commercialAccessRequests.length === 1 ? '' : 's'} waiting`
        : `${commercialAssignedCount} assigned`,
      icon: BriefcaseBusiness,
    },
  ]), [activeUserCount, commercialAccessRequests.length, commercialAssignedCount, pendingPrincipalClaimInvites.length])

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Users & Permissions"
        title="Users"
        description="Invite people, review principal access links, and manage access for this workspace."
      />

      {!canEdit ? (
        <SettingsBanner tone="warning">Read-only for your role. Only {administratorLabel} can manage users and permissions.</SettingsBanner>
      ) : null}

      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
      {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}

      <div className="grid gap-2 md:grid-cols-3">
        {panelOptions.map((option) => {
          const Icon = option.icon
          const selected = activePanel === option.value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setActivePanel(option.value)}
              className={[
                'grid min-h-[92px] grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-[12px] border p-4 text-left transition',
                selected
                  ? 'border-[#9bc8df] bg-[#f6fbff] shadow-[0_12px_24px_rgba(38,86,116,0.08)]'
                  : 'border-[#e3eaf2] bg-white hover:border-[#c9d8e7] hover:bg-[#f9fbfe]',
              ].join(' ')}
            >
              <span className={[
                'inline-flex h-10 w-10 items-center justify-center rounded-[10px] border',
                selected ? 'border-[#b9dcef] bg-white text-[#23546f]' : 'border-[#dbe6f0] bg-[#f8fafc] text-[#607387]',
              ].join(' ')}>
                <Icon size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#162334]">{option.label}</span>
                <span className="mt-1 block text-sm leading-5 text-[#6b7d93]">{option.description}</span>
              </span>
            </button>
          )
        })}
      </div>

      {activePanel === 'invite' ? (
        <>
      <div ref={inviteSectionRef}>
      <SettingsSectionCard title="Invite User" description="Choose the correct invite path before sending access.">
        {isPrincipalManagerInviteIntent ? (
          <SettingsBanner tone="success">
            Opened from Branches. Use Team / manager for staff access, or Principal when the recipient should receive principal access as soon as they accept.
          </SettingsBanner>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          {[
            {
              value: 'team',
              label: 'Team / manager',
              description: 'For branch managers, agents, assistants, and coordinators. Access is granted when the invite is accepted.',
              icon: ShieldCheck,
            },
            {
              value: 'principal_claim',
              label: 'Principal',
              description: 'For principals who should receive active workspace access immediately after accepting.',
              icon: CheckCircle2,
            },
          ].map((option) => {
            const Icon = option.icon
            const selected = inviteMode === option.value
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                disabled={!canEdit || (option.value === 'principal_claim' && (!usesAgencyGovernance || !principalInviteAllowed))}
                onClick={() => handleInviteModeChange(option.value)}
                className={[
                  'grid min-h-[112px] grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-[12px] border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
                  selected
                    ? 'border-[#91c7ad] bg-[#f3fbf6] shadow-[0_12px_24px_rgba(31,122,69,0.08)]'
                    : 'border-[#e3eaf2] bg-white hover:border-[#c9d8e7] hover:bg-[#f9fbfe]',
                ].join(' ')}
              >
                <span className={[
                  'inline-flex h-10 w-10 items-center justify-center rounded-[10px] border',
                  selected ? 'border-[#c9e8d5] bg-white text-[#1f7a45]' : 'border-[#dbe6f0] bg-[#f8fafc] text-[#607387]',
                ].join(' ')}>
                  <Icon size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[#162334]">{option.label}</span>
                  <span className="mt-1 block text-sm leading-5 text-[#6b7d93]">{option.description}</span>
                </span>
              </button>
            )
          })}
        </div>

        {principalInviteSelected ? (
          <SettingsBanner tone="success">
            Principal invite selected. Arch9 grants active principal access as soon as the invite is accepted.
          </SettingsBanner>
        ) : null}
        {principalInviteDisabled ? (
          <SettingsBanner tone="warning">
            Only the organisation owner can invite another principal.
          </SettingsBanner>
        ) : null}
        {teamInviteDisabled ? (
          <SettingsBanner tone="warning">
            Your role can review users, but it cannot invite manager or team roles in this workspace.
          </SettingsBanner>
        ) : null}
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
                <Field value="Principal" disabled />
                <span className="text-xs font-medium text-[#51657b]">
                  The invited principal receives active workspace access immediately after accepting.
                </span>
              </>
            ) : (
              <>
                <Field
                  as="select"
                  value={inviteForm.role}
                  disabled={!canEdit || teamInviteRoleOptions.length === 0}
                  onChange={(event) => setInviteForm((previous) => ({ ...previous, role: event.target.value }))}
                >
                  {teamInviteRoleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                    ))}
                </Field>
                <span className="text-xs font-medium text-[#51657b]">
                  Manager and team invites create normal pending workspace invites.
                </span>
                {canEdit && !inviteRoleOptions.some((option) => normalizeAgencyAuthorityRole(option.value) === 'principal') ? (
                <span className="text-xs font-medium text-[#8a6a18]">
                  Direct principal and owner role changes are restricted to the organisation owner.
                </span>
              ) : null}
              </>
            )}
            </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Sales Commission Structure (Optional)</span>
            <Field
              as="select"
              value={inviteForm.commissionStructureId}
              disabled={!canEdit}
              onChange={(event) => setInviteForm((previous) => ({ ...previous, commissionStructureId: event.target.value }))}
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
            {!inviteForm.commissionStructureId && !defaultCommissionStructure ? (
              <span className="text-xs font-medium text-[#a16207]">
                No default structure is configured. This user will remain unassigned until you set one.
              </span>
            ) : null}
          </label>
          {canEdit ? (
            <div className={`${settingsActionRowClass} md:col-span-2`}>
              <Button type="submit" disabled={saving || teamInviteDisabled || principalInviteDisabled}>
                {saving ? 'Inviting…' : principalInviteSelected ? 'Send Principal Invite' : 'Invite User'}
              </Button>
            </div>
          ) : null}
        </form>
      </SettingsSectionCard>
      </div>

      {canEdit && usesAgencyGovernance ? (
        <SettingsSectionCard
          title="Principal Invite Activity"
          description="Track principal access links before acceptance, and keep accepted principal invites visible after access is active."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#e4ebf3] bg-white px-4 py-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#8da0b6]">Pending</p>
              <p className="mt-1 text-2xl font-semibold text-[#162334]">{pendingPrincipalClaimInvites.length}</p>
            </div>
            <div className="rounded-2xl border border-[#e4ebf3] bg-white px-4 py-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#8da0b6]">Accepted</p>
              <p className="mt-1 text-2xl font-semibold text-[#162334]">
                {principalClaimInviteHistory.filter((invite) => invite.status === 'active').length}
              </p>
            </div>
            <div className="rounded-2xl border border-[#e4ebf3] bg-white px-4 py-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#8da0b6]">Closed</p>
              <p className="mt-1 text-2xl font-semibold text-[#162334]">
                {principalClaimInviteHistory.filter((invite) => ['revoked', 'expired'].includes(invite.status)).length}
              </p>
            </div>
          </div>

          {principalClaimInviteHistory.some((invite) => invite.status === 'active') ? (
            <SettingsBanner tone="success">
              A principal invite has been accepted. The principal now appears as an active workspace user.
            </SettingsBanner>
          ) : null}

          {!principalClaimInviteHistory.length ? (
            <SettingsEmptyState
              title="No principal invite activity yet"
              description="When you invite a principal, pending links and accepted access history will appear here."
            />
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
                            ? 'Invite accepted and linked to the active principal membership.'
                            : 'Invite closed.'}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SettingsSectionCard>
      ) : null}
        </>
      ) : null}

      {activePanel === 'commercial' && canEdit && commercialAccessRequests.length ? (
        <SettingsSectionCard
          title="Commercial access requests"
          description="Approve agents who asked to use the Commercial workspace. Approval enables Commercial for the organisation if it is not active yet."
        >
          <div className="divide-y divide-[#e9eff5] overflow-hidden rounded-2xl border border-[#e4ebf3] bg-white">
            {commercialAccessRequests.map((request) => (
              <div key={request.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[1.2fr_1.2fr_1fr] lg:items-center">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[#162334]">{request.requesterName || request.requesterEmail}</p>
                  <p className="text-sm text-[#51657b]">{request.requesterEmail}</p>
                </div>
                <div className="space-y-1">
                  <span className="inline-flex rounded-full border border-[#f3d9a8] bg-[#fff8ec] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#a16207]">
                    Pending Commercial access
                  </span>
                  <p className="text-xs text-[#7b8da6]">
                    Requested {request.createdAt ? new Date(request.createdAt).toLocaleDateString() : 'recently'}
                  </p>
                  {request.metadata?.last_nudged_at ? (
                    <p className="text-xs text-[#7b8da6]">
                      Last reminded {new Date(request.metadata.last_nudged_at).toLocaleDateString()}
                      {request.metadata?.nudge_count ? ` · ${request.metadata.nudge_count} reminder${Number(request.metadata.nudge_count) === 1 ? '' : 's'}` : ''}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Button
                    type="button"
                    onClick={() => handleCommercialAccessReview(request.id, 'approved')}
                    disabled={reviewingRequestId === request.id}
                  >
                    {reviewingRequestId === request.id ? 'Reviewing…' : 'Approve'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleCommercialAccessReview(request.id, 'rejected')}
                    disabled={reviewingRequestId === request.id}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </SettingsSectionCard>
      ) : null}

      {activePanel === 'commercial' && canEdit ? (
        <SettingsSectionCard
          title="Commercial module access"
          description="Control whether Commercial is enabled for the organisation and which users can open the Commercial workspace."
        >
          <div className="rounded-2xl border border-[#e4ebf3] bg-white px-5">
            <SettingsToggleRow
              title="Enable Commercial for this organisation"
              description="When disabled, no user can open Commercial even if they have an assigned Commercial membership."
              checked={commercialModuleActive}
              disabled={savingCommercialModule}
              onChange={handleCommercialModuleToggle}
            />
          </div>

          <div className="divide-y divide-[#e9eff5] overflow-hidden rounded-2xl border border-[#e4ebf3] bg-white">
            {(users || []).map((userRow) => {
              const commercialAccess = commercialAccessByUserId.get(userRow.id)
              const hasCommercialAccess = Boolean(commercialAccess?.hasCommercialAccess)
              const savingUser = savingCommercialUserId === userRow.id
              return (
                <div key={`commercial-${userRow.id}`} className="grid gap-3 px-5 py-4 lg:grid-cols-[1.2fr_1fr_1fr] lg:items-center">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-[#162334]">{userRow.fullName || userRow.email}</p>
                    <p className="text-sm text-[#51657b]">{userRow.email}</p>
                  </div>
                  <div className="space-y-1">
                    <span className={[
                      'inline-flex rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em]',
                      hasCommercialAccess ? 'border-[#ccead8] bg-[#f2fbf5] text-[#1f7a45]' : 'border-[#d7e3ef] bg-white text-[#51657b]',
                    ].join(' ')}>
                      {hasCommercialAccess ? 'Commercial assigned' : 'No Commercial access'}
                    </span>
                    {commercialAccess?.source ? (
                      <p className="text-xs text-[#7b8da6]">Source: {commercialAccess.source.replaceAll('_', ' ')}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <Button
                      type="button"
                      variant={hasCommercialAccess ? 'ghost' : 'secondary'}
                      disabled={savingUser || userRow.status === 'deactivated'}
                      onClick={() => handleCommercialUserAccessChange(userRow.id, !hasCommercialAccess)}
                    >
                      {savingUser ? 'Saving…' : hasCommercialAccess ? 'Remove Commercial' : 'Grant Commercial'}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#e4ebf3] bg-white">
            <div className="border-b border-[#e9eff5] px-5 py-4">
              <h3 className="text-sm font-semibold text-[#162334]">Recent Commercial access history</h3>
              <p className="mt-1 text-sm text-[#51657b]">A short audit trail of Commercial requests, approvals, and manual access changes.</p>
            </div>
            {commercialAuditEvents.length ? (
              <div className="divide-y divide-[#e9eff5]">
                {commercialAuditEvents.map((event) => (
                  <div key={event.id || `${event.action}-${event.createdAt}`} className="grid gap-2 px-5 py-4 lg:grid-cols-[1.1fr_1fr_0.8fr] lg:items-center">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[#162334]">{formatCommercialAuditAction(event.action)}</p>
                      <p className="text-sm text-[#51657b]">{getCommercialAuditSubject(event)}</p>
                    </div>
                    <p className="text-sm text-[#51657b]">
                      {event.metadata?.source ? `Source: ${String(event.metadata.source).replaceAll('_', ' ')}` : event.targetType?.replaceAll('_', ' ') || 'Commercial access'}
                    </p>
                    <p className="text-sm text-[#7b8da6] lg:text-right">
                      {event.createdAt ? new Date(event.createdAt).toLocaleString() : 'Recently'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-5">
                <p className="text-sm text-[#51657b]">No Commercial access history yet.</p>
              </div>
            )}
          </div>
        </SettingsSectionCard>
      ) : null}

      {activePanel === 'directory' ? (
      <SettingsSectionCard title="Users" description="Manage role access for the current organisation workspace.">
        {loading ? <SettingsLoadingState label="Loading users…" compact /> : null}

        {!loading && !users.length ? (
          <SettingsEmptyState
            title="No users have been invited yet"
            description="Invite your first team member to start assigning roles and access."
          />
        ) : null}

        {!loading && users.length ? (
          <div className={settingsTableClass}>
            <div className="hidden grid-cols-[1.2fr_1.2fr_0.9fr_1.2fr_0.8fr_0.8fr_0.8fr] gap-4 border-b border-[#e4ebf3] bg-[#f4f8fb] px-5 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7b8da6] lg:grid">
              <span>Name</span>
              <span>Email</span>
              <span>Role</span>
              <span>Sales Commission Structure</span>
              <span>Status</span>
              <span>Last active</span>
              <span>Actions</span>
            </div>

            <div className="divide-y divide-[#e9eff5]">
              {users.map((userRow) => {
                const profileByOrgUserId = commissionProfileByUserKey.get(`org-user:${String(userRow.id || '')}`)
                const profileByUserId = commissionProfileByUserKey.get(`user:${String(userRow.userId || '')}`)
                const profileByEmail = commissionProfileByUserKey.get(`email:${String(userRow.email || '').trim().toLowerCase()}`)
                const commissionProfile = profileByOrgUserId || profileByUserId || profileByEmail || null
                const assignedStructure = commissionProfile?.commissionStructureId
                  ? commissionStructureById.get(String(commissionProfile.commissionStructureId))
                  : null
                const usingDefault = !assignedStructure && defaultCommissionStructure
                const roleOptions = usesAgencyGovernance
                  ? filterAssignableRoleOptions(authorityActor, {
                      target: {
                        id: userRow.id,
                        userId: userRow.userId,
                        email: userRow.email,
                        role: userRow.role,
                        membershipRole: userRow.role,
                        branchId: userRow.branchId || userRow.primaryBranchId || '',
                      },
                    })
                  : ROLE_OPTIONS
                const canChangeRole = canEdit && roleOptions.some((option) => option.value !== userRow.role)
                return (
                <div
                  key={userRow.id}
                  className="grid gap-3 px-5 py-4 lg:grid-cols-[1.2fr_1.2fr_0.9fr_1.2fr_0.8fr_0.8fr_0.8fr] lg:items-center lg:gap-4"
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
                      <Field as="select" value={userRow.role} className="py-2.5" onChange={(event) => handleRoleChange(userRow.id, event.target.value)}>
                        {roleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Field>
                    ) : (
                      <span className="text-sm capitalize text-[#51657b]">{userRow.role.replaceAll('_', ' ')}</span>
                    )}
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
                      <span className="block text-xs font-medium text-[#7b8da6]">Principal invite flow</span>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] lg:hidden">Last active</span>
                    <span className="text-sm text-[#51657b]">
                      {userRow.lastActiveAt ? new Date(userRow.lastActiveAt).toLocaleDateString() : 'Not tracked'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] lg:hidden">Actions</span>
                    {canEdit && userRow.status !== 'deactivated' ? (
                      <Button type="button" variant="ghost" onClick={() => handleDeactivate(userRow.id)}>
                        Deactivate
                      </Button>
                    ) : (
                      <span className="text-sm text-[#8da0b6]">—</span>
                    )}
                  </div>
                </div>
              )})}
            </div>
          </div>
        ) : null}
      </SettingsSectionCard>
      ) : null}
    </div>
  )
}
