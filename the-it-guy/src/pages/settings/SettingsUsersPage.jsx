import { useCallback, useEffect, useState } from 'react'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import { useWorkspace } from '../../context/WorkspaceContext'
import { deactivateOrganisationUser, inviteOrganisationUser, listOrganisationUsers, updateOrganisationUserRole } from '../../lib/settingsApi'
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
  { value: 'admin', label: 'Admin' },
  { value: 'developer', label: 'Developer' },
  { value: 'agent', label: 'Agent' },
  { value: 'attorney', label: 'Attorney' },
  { value: 'bond_originator', label: 'Bond Originator' },
  { value: 'viewer', label: 'Viewer' },
]

export default function SettingsUsersPage() {
  const { role } = useWorkspace()
  const canEdit = role === 'developer'
  const [users, setUsers] = useState([])
  const [inviteForm, setInviteForm] = useState({ firstName: '', lastName: '', email: '', role: 'viewer' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true)
      const response = await listOrganisationUsers()
      setUsers(response)
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
      await inviteOrganisationUser(inviteForm)
      setInviteForm({ firstName: '', lastName: '', email: '', role: 'viewer' })
      await loadUsers()
      setMessage('User invite saved.')
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRoleChange(userRowId, nextRole) {
    try {
      setError('')
      await updateOrganisationUserRole(userRowId, nextRole)
      await loadUsers()
    } catch (saveError) {
      setError(saveError.message)
    }
  }

  async function handleDeactivate(userRowId) {
    try {
      setError('')
      await deactivateOrganisationUser(userRowId)
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
        description="Invite users, control role assignments, and manage who can configure the platform."
      />

      {!canEdit ? (
        <SettingsBanner tone="warning">Read-only for your role. Developer admins can manage users and permissions.</SettingsBanner>
      ) : null}

      <SettingsSectionCard title="Invite user" description="Create a role-scoped user record for your organisation.">
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
          {canEdit ? (
            <div className={`${settingsActionRowClass} md:col-span-2`}>
              <Button type="submit" disabled={saving}>
                {saving ? 'Inviting…' : 'Invite User'}
              </Button>
            </div>
          ) : null}
        </form>
      </SettingsSectionCard>

      <SettingsSectionCard title="User list" description="Role-based access only for now. Custom permission matrices can sit on top later.">
        {loading ? <SettingsLoadingState label="Loading users…" /> : null}

        {!loading && !users.length ? (
          <SettingsEmptyState
            title="No users have been invited yet"
            description="Invite your first team member to start assigning roles and access."
          />
        ) : null}

        {!loading && users.length ? (
          <div className={settingsTableClass}>
            <div className="hidden grid-cols-[1.3fr_1.4fr_1fr_0.8fr_0.9fr_0.8fr] gap-4 border-b border-[#e4ebf3] bg-[#f4f8fb] px-5 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7b8da6] lg:grid">
              <span>Name</span>
              <span>Email</span>
              <span>Role</span>
              <span>Status</span>
              <span>Last active</span>
              <span>Actions</span>
            </div>

            <div className="divide-y divide-[#e9eff5]">
              {users.map((userRow) => (
                <div
                  key={userRow.id}
                  className="grid gap-3 px-5 py-4 lg:grid-cols-[1.3fr_1.4fr_1fr_0.8fr_0.9fr_0.8fr] lg:items-center lg:gap-4"
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
              ))}
            </div>
          </div>
        ) : null}
      </SettingsSectionCard>

      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
      {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}
    </div>
  )
}
