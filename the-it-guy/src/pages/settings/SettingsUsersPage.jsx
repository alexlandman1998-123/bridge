import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import { useWorkspace } from '../../context/WorkspaceContext'
import { PERMISSIONS } from '../../auth/permissions/permissionRegistry'
import {
  assignOrganisationUserCommissionProfile,
  deactivateOrganisationUser,
  fetchOrganisationSettings,
  inviteOrganisationUser,
  listOrganisationCommissionStructures,
  listOrganisationUserCommissionProfiles,
  listOrganisationUsers,
  updateOrganisationUserRole,
} from '../../lib/settingsApi'
import {
  SettingsBanner,
  SettingsEmptyState,
  SettingsLoadingState,
  SettingsPageHeader,
  SettingsSectionCard,
  settingsActionRowClass,
  settingsFieldClass,
  settingsFieldSpanClass,
  settingsGridClass,
  settingsPageClass,
  settingsTableClass,
} from './settingsUi'

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

export default function SettingsUsersPage() {
  const { can } = useWorkspace()
  const [, setMembershipRole] = useState('viewer')
  const canEdit = can(PERMISSIONS.manageUsers)
  const [users, setUsers] = useState([])
  const [commissionStructures, setCommissionStructures] = useState([])
  const [commissionProfiles, setCommissionProfiles] = useState([])
  const [inviteForm, setInviteForm] = useState({ firstName: '', lastName: '', email: '', role: 'agent', commissionStructureId: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

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
      const [response, context, structureRows, profileRows] = await Promise.all([
        listOrganisationUsers(),
        fetchOrganisationSettings(),
        listOrganisationCommissionStructures(),
        listOrganisationUserCommissionProfiles(),
      ])
      setUsers(response)
      setMembershipRole(context.membershipRole || 'viewer')
      setCommissionStructures(Array.isArray(structureRows) ? structureRows : [])
      setCommissionProfiles(Array.isArray(profileRows) ? profileRows : [])
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  async function handleInvite(event) {
    event.preventDefault()
    if (!canEdit) return
    try {
      setSaving(true)
      setError('')
      const invitedUser = await inviteOrganisationUser(inviteForm)
      const commissionStructureId = String(inviteForm.commissionStructureId || '').trim()
      if (commissionStructureId) {
        await assignOrganisationUserCommissionProfile({
          organisationUserId: invitedUser?.id || '',
          userId: invitedUser?.userId || '',
          email: invitedUser?.email || inviteForm.email || '',
          commissionStructureId,
        })
      }
      setInviteForm({ firstName: '', lastName: '', email: '', role: 'agent', commissionStructureId: '' })
      await loadUsers()
      setMessage('User invite saved.')
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

      <SettingsSectionCard title="Invite User" description="Add a team member and assign their initial role.">
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
            <Field
              as="select"
              value={inviteForm.role}
              disabled={!canEdit}
              onChange={(event) => setInviteForm((previous) => ({ ...previous, role: event.target.value }))}
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
                ))}
              </Field>
            </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Commission Structure (Optional)</span>
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
              <Button type="submit" disabled={saving}>
                {saving ? 'Inviting…' : 'Invite User'}
              </Button>
            </div>
          ) : null}
        </form>
      </SettingsSectionCard>

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
                    {canEdit ? (
                      <Field as="select" value={userRow.role} className="py-2.5" onChange={(event) => handleRoleChange(userRow.id, event.target.value)}>
                        {ROLE_OPTIONS.map((option) => (
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
                    <span className="inline-flex rounded-full border border-[#d7e3ef] bg-white px-3 py-1 text-xs font-semibold capitalize text-[#51657b]">
                      {userRow.status}
                    </span>
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
