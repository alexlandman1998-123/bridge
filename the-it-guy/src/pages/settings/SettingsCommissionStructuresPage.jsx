import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import { useWorkspace } from '../../context/WorkspaceContext'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import {
  assignOrganisationUserCommissionProfile,
  fetchOrganisationSettings,
  listOrganisationCommissionStructures,
  listOrganisationUserCommissionProfiles,
  listOrganisationUsers,
  removeOrganisationCommissionStructure,
  saveOrganisationCommissionStructure,
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

function createStructureDraft() {
  return {
    name: '',
    agentSplitPercentage: 70,
    agencySplitPercentage: 30,
    isDefault: false,
    isActive: true,
    notes: '',
  }
}

function normalizePercentage(value, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(100, Math.max(0, Number(parsed.toFixed(2))))
}

function formatPercent(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '0%'
  return `${numeric.toFixed(2).replace(/\.00$/, '')}%`
}

function isAgentLikeRole(role) {
  const value = String(role || '').trim().toLowerCase()
  return ['agent', 'branch_manager', 'admin', 'principal', 'super_admin'].includes(value)
}

export default function SettingsCommissionStructuresPage() {
  const { role } = useWorkspace()
  const [membershipRole, setMembershipRole] = useState('viewer')
  const canEdit = canManageOrganisationSettings({
    appRole: role,
    membershipRole: normalizeOrganisationMembershipRole(membershipRole),
  })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editingId, setEditingId] = useState('')
  const [structures, setStructures] = useState([])
  const [users, setUsers] = useState([])
  const [profiles, setProfiles] = useState([])
  const [draft, setDraft] = useState(createStructureDraft())

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const context = await fetchOrganisationSettings()
      const nextMembershipRole = context?.membershipRole || 'viewer'
      const canManageCommissionSettings = canManageOrganisationSettings({
        appRole: role,
        membershipRole: normalizeOrganisationMembershipRole(nextMembershipRole),
      })
      setMembershipRole(context?.membershipRole || 'viewer')
      if (!canManageCommissionSettings) {
        setStructures([])
        setUsers([])
        setProfiles([])
        return
      }

      const [structureRows, userRows, profileRows] = await Promise.all([
        listOrganisationCommissionStructures(),
        listOrganisationUsers(),
        listOrganisationUserCommissionProfiles(),
      ])
      setStructures(Array.isArray(structureRows) ? structureRows : [])
      setUsers(Array.isArray(userRows) ? userRows : [])
      setProfiles(Array.isArray(profileRows) ? profileRows : [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load commission structures.')
    } finally {
      setLoading(false)
    }
  }, [role])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const structureMap = useMemo(
    () => new Map(structures.map((item) => [String(item.id || ''), item])),
    [structures],
  )
  const defaultStructure = useMemo(
    () => structures.find((item) => item.isDefault && item.isActive) || null,
    [structures],
  )
  const profileByUserKey = useMemo(() => {
    const map = new Map()
    for (const profile of profiles) {
      const organisationUserId = String(profile?.organisationUserId || '').trim()
      const userId = String(profile?.userId || '').trim()
      const email = String(profile?.email || '').trim().toLowerCase()
      if (organisationUserId) map.set(`org-user:${organisationUserId}`, profile)
      if (userId) map.set(`user:${userId}`, profile)
      if (email) map.set(`email:${email}`, profile)
    }
    return map
  }, [profiles])

  const commissionAssignableUsers = useMemo(
    () =>
      users.filter((user) => user?.status !== 'deactivated').filter((user) => isAgentLikeRole(user?.role)),
    [users],
  )

  function updateDraft(key, value) {
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  function updateAgentSplit(value) {
    const agentSplit = normalizePercentage(value, 0)
    setDraft((previous) => ({
      ...previous,
      agentSplitPercentage: agentSplit,
      agencySplitPercentage: normalizePercentage(100 - agentSplit, 0),
    }))
  }

  function startEdit(structure) {
    setEditingId(structure.id)
    setDraft({
      name: structure.name || '',
      agentSplitPercentage: normalizePercentage(structure.agentSplitPercentage, 70),
      agencySplitPercentage: normalizePercentage(structure.agencySplitPercentage, 30),
      isDefault: Boolean(structure.isDefault),
      isActive: Boolean(structure.isActive),
      notes: structure.notes || '',
    })
  }

  function resetForm() {
    setEditingId('')
    setDraft(createStructureDraft())
  }

  async function handleSave(event) {
    event.preventDefault()
    if (!canEdit) return

    const name = String(draft.name || '').trim()
    if (!name) {
      setError('Structure name is required.')
      return
    }

    try {
      setSaving(true)
      setError('')
      setMessage('')
      await saveOrganisationCommissionStructure({
        id: editingId || undefined,
        name,
        agentSplitPercentage: normalizePercentage(draft.agentSplitPercentage, 0),
        agencySplitPercentage: normalizePercentage(100 - normalizePercentage(draft.agentSplitPercentage, 0), 0),
        isDefault: Boolean(draft.isDefault),
        isActive: Boolean(draft.isActive),
        notes: String(draft.notes || '').trim(),
      })
      await loadData()
      setMessage(editingId ? 'Commission structure updated.' : 'Commission structure created.')
      resetForm()
    } catch (saveError) {
      setError(saveError.message || 'Unable to save commission structure.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(structure) {
    if (!canEdit) return
    try {
      setError('')
      setMessage('')
      await removeOrganisationCommissionStructure(structure.id)
      if (String(editingId) === String(structure.id)) {
        resetForm()
      }
      await loadData()
      setMessage('Commission structure removed.')
    } catch (removeError) {
      setError(removeError.message || 'Unable to remove commission structure.')
    }
  }

  async function handleAssign(user, structureId) {
    if (!canEdit) return
    try {
      setError('')
      setMessage('')
      await assignOrganisationUserCommissionProfile({
        organisationUserId: user.id || '',
        userId: user.userId || '',
        email: user.email || '',
        commissionStructureId: structureId || '',
      })
      await loadData()
      setMessage('Agent commission assignment saved.')
    } catch (assignError) {
      setError(assignError.message || 'Unable to assign commission structure.')
    }
  }

  if (loading) {
    return <SettingsLoadingState label="Loading commission structures…" />
  }

  if (!canEdit) {
    return (
      <div className={settingsPageClass}>
        <SettingsPageHeader
          kicker="Commission Structures"
          title="Agency commission governance"
          description="This area is restricted to Principal and Super Admin roles."
        />
        <SettingsBanner tone="warning">
          Access restricted. Only Principal-level administrators can view and manage commission structures.
        </SettingsBanner>
      </div>
    )
  }

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Commission Structures"
        title="Agency commission governance"
        description="Define how gross commission is split between the agency and each agent, then assign structures by user."
      />

      <SettingsSectionCard title="Structure Directory" description="Create reusable split templates and set a default for new members.">
        {!structures.length ? (
          <SettingsEmptyState
            title="No commission structures yet"
            description="Create your first split model to standardise agent and agency commission calculations."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {structures.map((structure) => (
              <article key={structure.id} className="rounded-[16px] border border-[#e3eaf3] bg-[#fbfdff] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-[#162334]">{structure.name}</p>
                    <p className="mt-1 text-sm text-[#60748b]">
                      Agent {formatPercent(structure.agentSplitPercentage)} • Agency {formatPercent(structure.agencySplitPercentage)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] ${
                        structure.isActive
                          ? 'border-[#cce8d6] bg-[#f1fbf4] text-[#1f7a45]'
                          : 'border-[#f0d4d4] bg-[#fff5f5] text-[#a23b3b]'
                      }`}
                    >
                      {structure.isActive ? 'Active' : 'Inactive'}
                    </span>
                    {structure.isDefault ? (
                      <span className="inline-flex rounded-full border border-[#d8e6f7] bg-[#eef5ff] px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#2b5f93]">
                        Default
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="mt-3 text-sm text-[#5f748c]">
                  Assigned agents: <span className="font-semibold text-[#233247]">{structure.assignedAgentsCount || 0}</span>
                </p>
                {structure.notes ? <p className="mt-1 text-sm text-[#5f748c]">{structure.notes}</p> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  {canEdit ? (
                    <Button type="button" variant="ghost" onClick={() => startEdit(structure)}>
                      Edit
                    </Button>
                  ) : null}
                  {canEdit ? (
                    <Button type="button" variant="ghost" onClick={() => handleRemove(structure)}>
                      Remove
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </SettingsSectionCard>

      <SettingsSectionCard
        title={editingId ? 'Edit Commission Structure' : 'Add Commission Structure'}
        description="Set the agent split percentage. Agency split is calculated automatically."
      >
        <form className={settingsGridClass} onSubmit={handleSave}>
          <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
            <span className="text-sm font-medium text-[#51657b]">Structure name</span>
            <Field value={draft.name} disabled={!canEdit} onChange={(event) => updateDraft('name', event.target.value)} placeholder="Standard Agent 60/40" />
          </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Agent split %</span>
            <Field
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={draft.agentSplitPercentage}
              disabled={!canEdit}
              onChange={(event) => updateAgentSplit(event.target.value)}
            />
          </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Agency split %</span>
            <Field value={normalizePercentage(100 - normalizePercentage(draft.agentSplitPercentage, 0), 0)} disabled />
          </label>
          <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
            <span className="text-sm font-medium text-[#51657b]">Notes</span>
            <Field as="textarea" value={draft.notes} disabled={!canEdit} onChange={(event) => updateDraft('notes', event.target.value)} />
          </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Default structure</span>
            <Field
              as="select"
              value={draft.isDefault ? 'yes' : 'no'}
              disabled={!canEdit}
              onChange={(event) => updateDraft('isDefault', event.target.value === 'yes')}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Field>
          </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Status</span>
            <Field
              as="select"
              value={draft.isActive ? 'active' : 'inactive'}
              disabled={!canEdit}
              onChange={(event) => updateDraft('isActive', event.target.value === 'active')}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Field>
          </label>
          {canEdit ? (
            <div className={`${settingsActionRowClass} md:col-span-2`}>
              {editingId ? (
                <Button type="button" variant="ghost" onClick={resetForm}>
                  Cancel Edit
                </Button>
              ) : null}
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Update Structure' : 'Create Structure'}
              </Button>
            </div>
          ) : null}
        </form>
      </SettingsSectionCard>

      <SettingsSectionCard title="Agent Assignments" description="Assign a commission structure to each agent/member profile.">
        {!commissionAssignableUsers.length ? (
          <SettingsEmptyState title="No active users yet" description="Invite users first, then assign their commission structures." />
        ) : (
          <div className={settingsTableClass}>
            <div className="hidden grid-cols-[1.2fr_1.2fr_0.9fr_1.2fr_0.8fr] gap-4 border-b border-[#e4ebf3] bg-[#f4f8fb] px-5 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7b8da6] lg:grid">
              <span>Name</span>
              <span>Email</span>
              <span>Role</span>
              <span>Commission Structure</span>
              <span>Status</span>
            </div>
            <div className="divide-y divide-[#e9eff5]">
              {commissionAssignableUsers.map((user) => {
                const profileByOrgUserId = profileByUserKey.get(`org-user:${String(user.id || '')}`)
                const profileByUserId = profileByUserKey.get(`user:${String(user.userId || '')}`)
                const profileByEmail = profileByUserKey.get(`email:${String(user.email || '').trim().toLowerCase()}`)
                const profile = profileByOrgUserId || profileByUserId || profileByEmail || null
                const assignedStructure = profile?.commissionStructureId
                  ? structureMap.get(String(profile.commissionStructureId))
                  : null
                const isUsingDefault = !assignedStructure && Boolean(defaultStructure)
                const statusLabel = assignedStructure
                  ? 'Assigned'
                  : isUsingDefault
                    ? 'Default'
                    : 'Unassigned'
                return (
                  <div
                    key={user.id}
                    className="grid gap-3 px-5 py-4 lg:grid-cols-[1.2fr_1.2fr_0.9fr_1.2fr_0.8fr] lg:items-center lg:gap-4"
                  >
                    <div className="space-y-1">
                      <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] lg:hidden">Name</span>
                      <strong className="text-sm text-[#162334]">{user.fullName}</strong>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] lg:hidden">Email</span>
                      <span className="text-sm text-[#51657b]">{user.email}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] lg:hidden">Role</span>
                      <span className="text-sm capitalize text-[#51657b]">{String(user.role || 'viewer').replaceAll('_', ' ')}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] lg:hidden">Commission Structure</span>
                      {canEdit ? (
                        <Field
                          as="select"
                          value={profile?.commissionStructureId || ''}
                          className="py-2.5"
                          onChange={(event) => handleAssign(user, event.target.value)}
                        >
                          <option value="">Use default / unassigned</option>
                          {structures
                            .filter((structure) => structure.isActive)
                            .map((structure) => (
                              <option key={structure.id} value={structure.id}>
                                {structure.name} ({formatPercent(structure.agentSplitPercentage)} / {formatPercent(structure.agencySplitPercentage)})
                              </option>
                            ))}
                        </Field>
                      ) : (
                        <span className="text-sm text-[#51657b]">
                          {assignedStructure?.name || (isUsingDefault ? `${defaultStructure?.name || 'Default structure'} (Default)` : 'Unassigned')}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] lg:hidden">Status</span>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                          statusLabel === 'Assigned'
                            ? 'border-[#d5e2ef] bg-white text-[#51657b]'
                            : statusLabel === 'Default'
                              ? 'border-[#d8e6f7] bg-[#eef5ff] text-[#2b5f93]'
                              : 'border-[#f3d9a8] bg-[#fff8ec] text-[#a16207]'
                        }`}
                      >
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </SettingsSectionCard>

      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
      {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}
    </div>
  )
}
