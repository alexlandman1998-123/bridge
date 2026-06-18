import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

function formatUserStatusLabel(userRow = {}) {
  if (userRow.isPrincipalClaim) {
    if (userRow.status === 'active') return 'Principal active'
    if (userRow.status === 'pending') return 'Principal claim pending'
    if (userRow.status === 'invited') return 'Principal claim sent'
  }
  return String(userRow.status || 'invited').replaceAll('_', ' ')
}

function formatInviteDate(value = '') {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleDateString()
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
  const { can, currentMembership, currentWorkspace, workspaceRole, workspaceType, profile } = useWorkspace()
  const [membershipRole, setMembershipRole] = useState('viewer')
  const canEdit = can(PERMISSIONS.manageUsers)
  const inviteSectionRef = useRef(null)
  const inviteNavigationState = readInviteNavigationState(location.state)
  const isPrincipalClaimInviteMode = inviteNavigationState.inviteIntent === 'residential_principal_manager'
  const initialInviteRole = resolveInviteRole(inviteNavigationState.inviteRole || inviteNavigationState.role, 'agent')
  const [users, setUsers] = useState([])
  const [commissionStructures, setCommissionStructures] = useState([])
  const [commissionProfiles, setCommissionProfiles] = useState([])
  const [pendingPrincipalClaimInvites, setPendingPrincipalClaimInvites] = useState([])
  const [commercialAccessRequests, setCommercialAccessRequests] = useState([])
  const [commercialAccessManagement, setCommercialAccessManagement] = useState({ organisationModuleStatus: null, users: [], auditEvents: [] })
  const [inviteForm, setInviteForm] = useState({ firstName: '', lastName: '', email: '', role: initialInviteRole, commissionStructureId: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [claimInviteBusyId, setClaimInviteBusyId] = useState('')
  const [reviewingRequestId, setReviewingRequestId] = useState('')
  const [savingCommercialModule, setSavingCommercialModule] = useState(false)
  const [savingCommercialUserId, setSavingCommercialUserId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const authorityActor = useMemo(() => ({
    id: profile?.id || currentMembership?.userId || currentMembership?.user_id || '',
    userId: profile?.id || currentMembership?.userId || currentMembership?.user_id || '',
    email: profile?.email || currentMembership?.email || '',
    role: membershipRole || workspaceRole || currentMembership?.workspaceRole || currentMembership?.role || 'viewer',
    membershipRole: membershipRole || workspaceRole || currentMembership?.workspaceRole || currentMembership?.role || 'viewer',
    branchId: currentMembership?.primaryBranchId || currentMembership?.branchId || currentMembership?.primary_branch_id || currentMembership?.branch_id || '',
  }), [currentMembership, membershipRole, profile, workspaceRole])
  const usesAgencyGovernance = useMemo(() => {
    const type = String(currentWorkspace?.type || workspaceType || '').trim().toLowerCase()
    return !type || ['agency', 'residential'].includes(type)
  }, [currentWorkspace?.type, workspaceType])
  const inviteRoleOptions = useMemo(
    () => (usesAgencyGovernance ? filterAssignableRoleOptions(authorityActor, { invite: true }) : ROLE_OPTIONS),
    [authorityActor, usesAgencyGovernance],
  )
  const principalInviteSelected = usesAgencyGovernance && (isPrincipalClaimInviteMode || isPrincipalInviteRole(inviteForm.role))

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
        canEdit ? listWorkspaceUserInvites({ includeInactive: false }).catch(() => []) : Promise.resolve([]),
        listCommercialAccessRequests({ status: 'pending' }).catch(() => []),
        listCommercialAccessManagementState().catch(() => ({ organisationModuleStatus: null, users: [], auditEvents: [] })),
      ])
      setUsers(response)
      setMembershipRole(context.membershipRole || 'viewer')
      setCommissionStructures(Array.isArray(structureRows) ? structureRows : [])
      setCommissionProfiles(Array.isArray(profileRows) ? profileRows : [])
      setPendingPrincipalClaimInvites(
        (Array.isArray(principalClaimInvites) ? principalClaimInvites : [])
          .filter((invite) => invite?.isPrincipalClaimInvite),
      )
      setCommercialAccessRequests(Array.isArray(commercialRequests) ? commercialRequests : [])
      setCommercialAccessManagement(commercialManagement || { organisationModuleStatus: null, users: [], auditEvents: [] })
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [canEdit])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  useEffect(() => {
    if (!inviteNavigationState.openInvite) return
    if (isPrincipalClaimInviteMode) {
      setInviteForm((previous) => ({ ...previous, role: 'principal' }))
      window.setTimeout(() => {
        inviteSectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      }, 0)
      return
    }
    const nextRole = resolveInviteRole(inviteNavigationState.inviteRole || inviteNavigationState.role, 'principal')
    const allowedRole = inviteRoleOptions.some((option) => option.value === nextRole)
      ? nextRole
      : inviteRoleOptions[0]?.value || 'agent'
    setInviteForm((previous) => ({ ...previous, role: allowedRole }))
    window.setTimeout(() => {
      inviteSectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    }, 0)
  }, [inviteNavigationState.inviteRole, inviteNavigationState.openInvite, inviteNavigationState.role, inviteRoleOptions, isPrincipalClaimInviteMode])

  useEffect(() => {
    if (isPrincipalClaimInviteMode) return
    if (!inviteRoleOptions.length) return
    if (inviteRoleOptions.some((option) => option.value === inviteForm.role)) return
    setInviteForm((previous) => ({ ...previous, role: inviteRoleOptions[0].value }))
  }, [inviteForm.role, inviteRoleOptions, isPrincipalClaimInviteMode])

  async function handleInvite(event) {
    event.preventDefault()
    if (!canEdit) return
    try {
      setSaving(true)
      setError('')
      const selectedCommissionStructure =
        commissionStructureById.get(String(inviteForm.commissionStructureId || '').trim()) ||
        defaultCommissionStructure ||
        null
      const inviteResult = principalInviteSelected
        ? await createPrincipalClaimInvite({
            firstName: inviteForm.firstName,
            lastName: inviteForm.lastName,
            email: inviteForm.email,
            source: inviteNavigationState.inviteSource || (isPrincipalClaimInviteMode ? 'settings_principal_claim_invite' : 'settings_users_principal_role_invite'),
          })
        : await createWorkspaceUserInvite({
            firstName: inviteForm.firstName,
            lastName: inviteForm.lastName,
            email: inviteForm.email,
            role: inviteForm.role,
            branchId: inviteNavigationState.branchId || '',
            branchName: inviteNavigationState.branchName || '',
            commissionStructureId: selectedCommissionStructure?.id || '',
            commissionStructureName: selectedCommissionStructure?.name || '',
            source: inviteNavigationState.inviteSource || 'settings_users_invite',
          })
      setInviteForm({ firstName: '', lastName: '', email: '', role: 'agent', commissionStructureId: '' })
      await loadUsers()
      setMessage(
        inviteResult.reusedExistingInvite
          ? principalInviteSelected ? 'Existing principal claim invite resent.' : 'Existing pending invite resent.'
          : principalInviteSelected ? 'Principal claim invite sent.' : 'User invite sent.',
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
      setError('Principal claim link is not available for this invite.')
      return
    }
    try {
      await navigator.clipboard.writeText(inviteLink)
      setError('')
      setMessage(`Principal claim link copied for ${invite.email}.`)
    } catch {
      setError('Unable to copy the principal claim link from this browser.')
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
      setMessage(`Principal claim resent to ${invite.email}.`)
    } catch (resendError) {
      setError(resendError?.message || 'Unable to resend this principal claim.')
    } finally {
      setClaimInviteBusyId('')
    }
  }

  async function handleRevokePrincipalClaimInvite(invite) {
    if (!canEdit || !invite?.id) return
    const confirmed = window.confirm(`Revoke the pending principal claim for ${invite.email}?`)
    if (!confirmed) return
    try {
      setClaimInviteBusyId(invite.id)
      setError('')
      setMessage('')
      await revokeWorkspaceUserInvite(invite)
      await loadUsers()
      setMessage(`Principal claim revoked for ${invite.email}.`)
    } catch (revokeError) {
      setError(revokeError?.message || 'Unable to revoke this principal claim.')
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

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Users & Permissions"
        title="Organisation users and access"
        description="Invite users, assign roles, and control who can configure platform settings."
      />

      {!canEdit ? (
        <SettingsBanner tone="warning">Read-only for your role. Only Principal-level administrators can manage users and permissions.</SettingsBanner>
      ) : null}

      <div ref={inviteSectionRef}>
      <SettingsSectionCard title="Invite User" description="Add a team member and assign their initial role.">
        {isPrincipalClaimInviteMode ? (
          <SettingsBanner tone="success">
            Principal claim selected from Residential. This sends a claim link for the principal to start organisation onboarding, without granting principal access automatically.
          </SettingsBanner>
        ) : null}
        {!isPrincipalClaimInviteMode && usesAgencyGovernance && isPrincipalInviteRole(inviteForm.role) ? (
          <SettingsBanner tone="success">
            Principal selected. Bridge will send a principal claim link instead of granting principal access immediately.
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
                <Field value="Principal claim invite" disabled />
                <span className="text-xs font-medium text-[#51657b]">
                  The invited principal claims/onboards the organisation first; access approval happens in the claim flow.
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
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Commission Structure (Optional)</span>
            <Field
              as="select"
              value={inviteForm.commissionStructureId}
              disabled={!canEdit || principalInviteSelected}
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
            {principalInviteSelected ? (
              <span className="text-xs font-medium text-[#51657b]">
                Commission is assigned after the principal claim is completed and the membership is active.
              </span>
            ) : null}
          </label>
          {canEdit ? (
            <div className={`${settingsActionRowClass} md:col-span-2`}>
              <Button type="submit" disabled={saving}>
                {saving ? 'Inviting…' : principalInviteSelected ? 'Send Principal Claim' : 'Invite User'}
              </Button>
            </div>
          ) : null}
        </form>
      </SettingsSectionCard>
      </div>

      {canEdit && usesAgencyGovernance ? (
        <SettingsSectionCard
          title="Pending Principal Claims"
          description="Track claim links before the invited principal accepts and completes organisation onboarding."
        >
          {!pendingPrincipalClaimInvites.length ? (
            <SettingsEmptyState
              title="No pending principal claims"
              description="When you invite a principal, their claim link will appear here until they accept or the invite is revoked."
            />
          ) : (
            <div className="divide-y divide-[#e9eff5] overflow-hidden rounded-2xl border border-[#e4ebf3] bg-white">
              {pendingPrincipalClaimInvites.map((invite) => {
                const busy = claimInviteBusyId === invite.id
                return (
                  <div key={invite.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr_1fr] lg:items-center">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[#162334]">{invite.name || invite.email}</p>
                      <p className="break-all text-sm text-[#51657b]">{invite.email}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="inline-flex rounded-full border border-[#cde8dc] bg-[#f2fbf5] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#1f7a45]">
                        Principal claim
                      </span>
                      <p className="text-xs text-[#7b8da6]">Sent {formatInviteDate(invite.invitedAt || invite.createdAt)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#8da0b6]">Expires</p>
                      <p className="text-sm text-[#51657b]">{formatInviteDate(invite.expiresAt)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
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
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SettingsSectionCard>
      ) : null}

      {canEdit && commercialAccessRequests.length ? (
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

      {canEdit ? (
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
              <span>Commission Structure</span>
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
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] lg:hidden">Commission Structure</span>
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
                      <span className="block text-xs font-medium text-[#7b8da6]">Principal claim flow</span>
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

      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
      {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}
    </div>
  )
}
