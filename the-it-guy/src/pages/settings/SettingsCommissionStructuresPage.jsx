import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import {
  AgentSplitLevelsCard,
  CommissionHelperNote,
  CommissionOverviewCards,
  CompanyTargetTracker,
  ListingCommissionTable,
  ReferralRulesCard,
  formatCommissionPercent,
} from '../../components/commission/CommissionWidgets'
import { useWorkspace } from '../../context/WorkspaceContext'
import { canManageOrganisationSettings, getWorkspaceAdministratorLabel, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import {
  fetchOrganisationSettings,
  removeOrganisationCommissionStructure,
  saveOrganisationCommissionStructure,
} from '../../lib/settingsApi'
import {
  assignUserCommissionLevel,
  createCommissionLevel,
  getCommissionAssignableUsers,
  getCommissionOverview,
  updateCommissionLevel,
  updateCommissionTarget,
  updateReferralCommissionRule,
} from '../../services/commissionService'
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

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'levels', label: 'Commission Levels' },
  { key: 'targets', label: 'Targets & Trackers' },
  { key: 'overrides', label: 'Overrides' },
  { key: 'templates', label: 'Templates' },
]

function normalizePercentage(value, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(100, Math.max(0, Number(parsed.toFixed(2))))
}

function createLevelDraft(level = {}) {
  const agentPercentage = normalizePercentage(level.agentPercentage, 60)
  return {
    id: level.id || '',
    name: level.name || '',
    agentPercentage,
    monthlyTarget: level.monthlyTarget ?? '',
    annualTarget: level.annualTarget ?? '',
    isDefault: Boolean(level.isDefault),
    isActive: level.isActive !== false,
  }
}

function createStructureDraft(structure = {}) {
  return {
    id: structure.id || '',
    name: structure.name || '',
    listingCommissionType: structure.listingCommissionType || 'percentage',
    listingCommissionPercentage: structure.listingCommissionPercentage ?? 7.5,
    listingCommissionAmount: structure.listingCommissionAmount ?? '',
    agentSplitPercentage: structure.agentSplitPercentage ?? 60,
    allowSalesCommissionOverride: structure.allowSalesCommissionOverride !== false,
    isDefault: Boolean(structure.isDefault),
    isActive: structure.isActive !== false,
    notes: structure.notes || '',
  }
}

function createReferralDraft(rule = {}) {
  return {
    id: rule.id || '',
    name: rule.name || '',
    referralType: rule.referralType || 'custom',
    percentage: rule.percentage ?? 0,
    basis: rule.basis || 'gross_commission',
    isDefault: Boolean(rule.isDefault),
    isActive: rule.isActive !== false,
  }
}

function formatRole(value = '') {
  return String(value || 'viewer').replaceAll('_', ' ')
}

function isAgentLikeRole(role) {
  return ['agent', 'branch_manager', 'admin', 'principal', 'super_admin'].includes(String(role || '').trim().toLowerCase())
}

export default function SettingsCommissionStructuresPage() {
  const { role, currentWorkspace, workspaceType } = useWorkspace()
  const resolvedWorkspaceType = currentWorkspace?.type || workspaceType || ''
  const [membershipRole, setMembershipRole] = useState('viewer')
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [overview, setOverview] = useState(null)
  const [assignmentData, setAssignmentData] = useState({ users: [], levels: [], profiles: [] })
  const [levelDraft, setLevelDraft] = useState(createLevelDraft())
  const [structureDraft, setStructureDraft] = useState(createStructureDraft())
  const [referralDraft, setReferralDraft] = useState(createReferralDraft())
  const [targetDraft, setTargetDraft] = useState({ targetAmount: 500000, startMonth: new Date().toISOString().slice(0, 7) + '-01' })

  const administratorLabel = getWorkspaceAdministratorLabel({ appRole: role, workspaceType: resolvedWorkspaceType })
  const canEdit = canManageOrganisationSettings({
    appRole: role,
    membershipRole: normalizeOrganisationMembershipRole(membershipRole, { appRole: role, workspaceType: resolvedWorkspaceType }),
    workspaceType: resolvedWorkspaceType,
  })

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const context = await fetchOrganisationSettings()
      const nextMembershipRole = normalizeOrganisationMembershipRole(context?.membershipRole || 'viewer', {
        appRole: role,
        workspaceType: context?.organisation?.type || resolvedWorkspaceType,
      })
      setMembershipRole(nextMembershipRole)
      const canManageCommissionSettings = canManageOrganisationSettings({
        appRole: role,
        membershipRole: nextMembershipRole,
        workspaceType: context?.organisation?.type || resolvedWorkspaceType,
      })

      if (!canManageCommissionSettings) {
        setOverview(null)
        setAssignmentData({ users: [], levels: [], profiles: [] })
        return
      }

      const [overviewResult, assignableResult] = await Promise.all([
        getCommissionOverview(),
        getCommissionAssignableUsers(),
      ])
      setOverview(overviewResult)
      setAssignmentData(assignableResult)
      setTargetDraft({
        targetAmount: overviewResult.companyTracker?.targetAmount || 500000,
        startMonth: new Date().toISOString().slice(0, 7) + '-01',
      })
      const firstReferral = overviewResult.referralRules?.[0]
      if (firstReferral) setReferralDraft(createReferralDraft(firstReferral))
      setLevelDraft(createLevelDraft())
      setStructureDraft(createStructureDraft())
    } catch (loadError) {
      setError(loadError.message || 'Unable to load commission settings.')
    } finally {
      setLoading(false)
    }
  }, [role, resolvedWorkspaceType])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const levels = overview?.levels || []
  const structures = overview?.structures || []
  const referralRules = overview?.referralRules || []

  const profileByUserKey = useMemo(() => {
    const map = new Map()
    for (const profile of assignmentData.profiles || []) {
      const organisationUserId = String(profile?.organisation_user_id || profile?.organisationUserId || '').trim()
      const userId = String(profile?.user_id || profile?.userId || '').trim()
      const email = String(profile?.email_address || profile?.email || '').trim().toLowerCase()
      if (organisationUserId) map.set(`org-user:${organisationUserId}`, profile)
      if (userId) map.set(`user:${userId}`, profile)
      if (email) map.set(`email:${email}`, profile)
    }
    return map
  }, [assignmentData.profiles])

  const assignableUsers = useMemo(
    () => (assignmentData.users || []).filter((user) => isAgentLikeRole(user.role)),
    [assignmentData.users],
  )

  function updateLevelDraft(key, value) {
    setLevelDraft((previous) => ({ ...previous, [key]: value }))
  }

  function updateStructureDraft(key, value) {
    setStructureDraft((previous) => ({ ...previous, [key]: value }))
  }

  function updateReferralDraft(key, value) {
    setReferralDraft((previous) => ({ ...previous, [key]: value }))
  }

  async function saveLevel(event) {
    event.preventDefault()
    if (!canEdit) return
    const name = String(levelDraft.name || '').trim()
    if (!name) {
      setError('Level name is required.')
      return
    }
    try {
      setSaving(true)
      setError('')
      setMessage('')
      const agentPercentage = normalizePercentage(levelDraft.agentPercentage, 60)
      const payload = {
        ...levelDraft,
        name,
        agentPercentage,
        agencyPercentage: normalizePercentage(100 - agentPercentage, 40),
        monthlyTarget: levelDraft.monthlyTarget === '' ? null : Number(levelDraft.monthlyTarget),
        annualTarget: levelDraft.annualTarget === '' ? null : Number(levelDraft.annualTarget),
      }
      if (levelDraft.id) await updateCommissionLevel(payload)
      else await createCommissionLevel(payload)
      setMessage(levelDraft.id ? 'Commission level updated.' : 'Commission level created.')
      setLevelDraft(createLevelDraft())
      await loadData()
    } catch (saveError) {
      setError(saveError.message || 'Unable to save commission level.')
    } finally {
      setSaving(false)
    }
  }

  async function saveReferral(event) {
    event.preventDefault()
    if (!canEdit) return
    try {
      setSaving(true)
      setError('')
      setMessage('')
      await updateReferralCommissionRule({
        ...referralDraft,
        percentage: normalizePercentage(referralDraft.percentage, 0),
      })
      setMessage('Referral rule updated.')
      await loadData()
      setActiveTab('overview')
    } catch (saveError) {
      setError(saveError.message || 'Unable to save referral rule.')
    } finally {
      setSaving(false)
    }
  }

  async function saveCompanyTarget(event) {
    event.preventDefault()
    if (!canEdit) return
    try {
      setSaving(true)
      setError('')
      setMessage('')
      await updateCommissionTarget({
        targetType: 'company',
        targetAmount: Number(targetDraft.targetAmount || 0),
        startMonth: targetDraft.startMonth || new Date().toISOString().slice(0, 7) + '-01',
      })
      setMessage('Company commission target updated.')
      await loadData()
    } catch (saveError) {
      setError(saveError.message || 'Unable to save company target.')
    } finally {
      setSaving(false)
    }
  }

  async function saveStructure(event) {
    event.preventDefault()
    if (!canEdit) return
    const name = String(structureDraft.name || '').trim()
    if (!name) {
      setError('Template name is required.')
      return
    }
    try {
      setSaving(true)
      setError('')
      setMessage('')
      const agentSplitPercentage = normalizePercentage(structureDraft.agentSplitPercentage, 60)
      await saveOrganisationCommissionStructure({
        id: structureDraft.id || undefined,
        name,
        listingCommissionType: structureDraft.listingCommissionType,
        listingCommissionPercentage: normalizePercentage(structureDraft.listingCommissionPercentage, 7.5),
        listingCommissionAmount: structureDraft.listingCommissionType === 'fixed' ? Number(structureDraft.listingCommissionAmount || 0) : null,
        agentSplitPercentage,
        agencySplitPercentage: normalizePercentage(100 - agentSplitPercentage, 40),
        allowSalesCommissionOverride: Boolean(structureDraft.allowSalesCommissionOverride),
        isDefault: Boolean(structureDraft.isDefault),
        isActive: Boolean(structureDraft.isActive),
        notes: String(structureDraft.notes || '').trim(),
      })
      setMessage(structureDraft.id ? 'Commission template updated.' : 'Commission template created.')
      setStructureDraft(createStructureDraft())
      await loadData()
    } catch (saveError) {
      setError(saveError.message || 'Unable to save commission template.')
    } finally {
      setSaving(false)
    }
  }

  async function removeStructure(structure) {
    if (!canEdit) return
    try {
      setSaving(true)
      setError('')
      setMessage('')
      await removeOrganisationCommissionStructure(structure.id)
      setMessage('Commission template removed.')
      await loadData()
    } catch (removeError) {
      setError(removeError.message || 'Unable to remove commission template.')
    } finally {
      setSaving(false)
    }
  }

  async function assignLevel(user, commissionLevelId) {
    if (!canEdit) return
    try {
      setSaving(true)
      setError('')
      setMessage('')
      await assignUserCommissionLevel({
        organisationUserId: user.id || '',
        userId: user.userId || user.user_id || '',
        email: user.email || '',
        commissionLevelId,
      })
      setMessage('Agent commission level saved.')
      await loadData()
    } catch (assignError) {
      setError(assignError.message || 'Unable to assign commission level.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <SettingsLoadingState label="Loading commission workspace..." />

  if (!canEdit) {
    return (
      <div className={settingsPageClass}>
        <SettingsPageHeader
          kicker="Commission"
          title="Commission"
          description={`This area is restricted to ${administratorLabel}.`}
        />
        <SettingsBanner tone="warning">
          Access restricted. Only {administratorLabel} can view and manage commission settings.
        </SettingsBanner>
      </div>
    )
  }

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Commission"
        title="Commission"
        description="Manage how your agency earns, splits, refers, and tracks commission."
      />

      <div className="overflow-x-auto border-b border-[#dfe7f0]">
        <div className="flex min-w-max gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 px-0 py-3 text-sm font-semibold transition ${
                activeTab === tab.key
                  ? 'border-[#0f7f4f] text-[#0f7f4f]'
                  : 'border-transparent text-[#52657a] hover:text-[#162334]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' ? (
        <div className="space-y-5">
          <CommissionOverviewCards overview={overview || {}} onSelectTab={setActiveTab} />
          <CommissionHelperNote />
          <ListingCommissionTable rows={overview?.listingRows || []} onEdit={() => setActiveTab('templates')} />
          <div className="grid gap-5 xl:grid-cols-2">
            <AgentSplitLevelsCard levels={levels} onEdit={(level) => {
              setLevelDraft(createLevelDraft(level))
              setActiveTab('levels')
            }} />
            <ReferralRulesCard rules={referralRules} onEdit={(rule) => {
              setReferralDraft(createReferralDraft(rule))
              setActiveTab('overrides')
            }} />
          </div>
          <CompanyTargetTracker tracker={overview?.companyTracker || {}} onEdit={() => setActiveTab('targets')} />
          <details className="rounded-[14px] border border-[#dfe7f0] bg-white px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-[#162334]">Advanced Settings</summary>
            <p className="mt-2 text-sm leading-6 text-[#667085]">
              Overrides, custom structures, VAT notes, and reconciliation-specific controls stay intentionally collapsed for this MVP.
            </p>
          </details>
        </div>
      ) : null}

      {activeTab === 'levels' ? (
        <div className="space-y-5">
          <AgentSplitLevelsCard
            levels={levels}
            onEdit={(level) => setLevelDraft(createLevelDraft(level))}
            onAdd={() => setLevelDraft(createLevelDraft())}
          />
          <SettingsSectionCard
            title={levelDraft.id ? 'Edit Commission Level' : 'Add Commission Level'}
            description="Set agent/agency split percentages and optional personal targets for this level."
          >
            <form className={settingsGridClass} onSubmit={saveLevel}>
              <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
                <span className="text-sm font-medium text-[#51657b]">Level name</span>
                <Field value={levelDraft.name} onChange={(event) => updateLevelDraft('name', event.target.value)} placeholder="Standard" />
              </label>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Agent percentage</span>
                <Field type="number" min="0" max="100" step="0.01" value={levelDraft.agentPercentage} onChange={(event) => updateLevelDraft('agentPercentage', event.target.value)} />
              </label>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Agency percentage</span>
                <Field value={normalizePercentage(100 - normalizePercentage(levelDraft.agentPercentage, 60), 40)} disabled />
              </label>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Monthly target</span>
                <Field type="number" min="0" step="1000" value={levelDraft.monthlyTarget} onChange={(event) => updateLevelDraft('monthlyTarget', event.target.value)} placeholder="Optional" />
              </label>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Annual target</span>
                <Field type="number" min="0" step="1000" value={levelDraft.annualTarget} onChange={(event) => updateLevelDraft('annualTarget', event.target.value)} placeholder="Optional" />
              </label>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Default level</span>
                <Field as="select" value={levelDraft.isDefault ? 'yes' : 'no'} onChange={(event) => updateLevelDraft('isDefault', event.target.value === 'yes')}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </Field>
              </label>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Status</span>
                <Field as="select" value={levelDraft.isActive ? 'active' : 'inactive'} onChange={(event) => updateLevelDraft('isActive', event.target.value === 'active')}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Field>
              </label>
              <div className={`${settingsActionRowClass} md:col-span-2`}>
                {levelDraft.id ? (
                  <Button type="button" variant="ghost" onClick={() => setLevelDraft(createLevelDraft())}>
                    Cancel Edit
                  </Button>
                ) : null}
                <Button type="submit" disabled={saving}>{saving ? 'Saving...' : levelDraft.id ? 'Update Level' : 'Create Level'}</Button>
              </div>
            </form>
          </SettingsSectionCard>
        </div>
      ) : null}

      {activeTab === 'targets' ? (
        <div className="space-y-5">
          <CompanyTargetTracker tracker={overview?.companyTracker || {}} />
          <SettingsSectionCard
            title="Company Monthly Target"
            description="Set the minimum monthly company commission target for the whole agency."
          >
            <form className={settingsGridClass} onSubmit={saveCompanyTarget}>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Monthly company target</span>
                <Field type="number" min="0" step="1000" value={targetDraft.targetAmount} onChange={(event) => setTargetDraft((previous) => ({ ...previous, targetAmount: event.target.value }))} />
              </label>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Start month</span>
                <Field type="date" value={targetDraft.startMonth} onChange={(event) => setTargetDraft((previous) => ({ ...previous, startMonth: event.target.value }))} />
              </label>
              <div className={`${settingsActionRowClass} md:col-span-2`}>
                <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Target'}</Button>
              </div>
            </form>
          </SettingsSectionCard>
        </div>
      ) : null}

      {activeTab === 'overrides' ? (
        <div className="space-y-5">
          <SettingsSectionCard title="Agent Commission Level Assignments" description="Assign a split level to each active agent. Agents can view their level and tracker but cannot edit rules.">
            {!assignableUsers.length ? (
              <SettingsEmptyState title="No active users yet" description="Invite users first, then assign their commission levels." />
            ) : (
              <div className={settingsTableClass}>
                <div className="hidden grid-cols-[1.1fr_1.2fr_0.8fr_1fr_0.7fr] gap-4 border-b border-[#e4ebf3] bg-[#f4f8fb] px-5 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#7b8da6] lg:grid">
                  <span>Name</span>
                  <span>Email</span>
                  <span>Role</span>
                  <span>Commission Level</span>
                  <span>Split</span>
                </div>
                <div className="divide-y divide-[#e9eff5]">
                  {assignableUsers.map((user) => {
                    const profile =
                      profileByUserKey.get(`org-user:${String(user.id || '')}`) ||
                      profileByUserKey.get(`user:${String(user.userId || user.user_id || '')}`) ||
                      profileByUserKey.get(`email:${String(user.email || '').toLowerCase()}`) ||
                      null
                    const assignedLevel = levels.find((level) => String(level.id) === String(profile?.commission_level_id || profile?.commissionLevelId))
                    const effectiveLevel = assignedLevel || levels.find((level) => level.isDefault) || levels[0]
                    return (
                      <div key={user.id || user.email} className="grid gap-3 px-5 py-4 lg:grid-cols-[1.1fr_1.2fr_0.8fr_1fr_0.7fr] lg:items-center lg:gap-4">
                        <strong className="text-sm text-[#162334]">{user.fullName || user.email}</strong>
                        <span className="text-sm text-[#51657b]">{user.email}</span>
                        <span className="text-sm capitalize text-[#51657b]">{formatRole(user.role)}</span>
                        <Field as="select" value={profile?.commission_level_id || ''} className="py-2.5" disabled={saving} onChange={(event) => assignLevel(user, event.target.value)}>
                          <option value="">Use default</option>
                          {levels.filter((level) => level.isActive !== false).map((level) => (
                            <option key={level.id} value={level.id}>{level.name}</option>
                          ))}
                        </Field>
                        <span className="text-sm font-semibold text-[#162334]">
                          {formatCommissionPercent(effectiveLevel?.agentPercentage || 60)} / {formatCommissionPercent(effectiveLevel?.agencyPercentage || 40)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </SettingsSectionCard>

          <SettingsSectionCard title="Referral Rule Editor" description="Keep default referral commission percentages simple and auditable.">
            <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="grid gap-2">
                {referralRules.map((rule) => (
                  <button
                    key={rule.id || rule.referralType}
                    type="button"
                    onClick={() => setReferralDraft(createReferralDraft(rule))}
                    className={`rounded-[12px] border px-3 py-3 text-left text-sm transition ${
                      referralDraft.referralType === rule.referralType
                        ? 'border-[#b9d8c6] bg-[#f2fbf5] text-[#0f7f4f]'
                        : 'border-[#e3ebf4] bg-white text-[#344054] hover:bg-[#fbfdff]'
                    }`}
                  >
                    <span className="font-semibold">{rule.name}</span>
                    <span className="mt-1 block text-xs">{formatCommissionPercent(rule.percentage)} of {String(rule.basis || '').replaceAll('_', ' ')}</span>
                  </button>
                ))}
              </div>
              <form className={settingsGridClass} onSubmit={saveReferral}>
                <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
                  <span className="text-sm font-medium text-[#51657b]">Rule name</span>
                  <Field value={referralDraft.name} onChange={(event) => updateReferralDraft('name', event.target.value)} />
                </label>
                <label className={settingsFieldClass}>
                  <span className="text-sm font-medium text-[#51657b]">Referral percentage</span>
                  <Field type="number" min="0" max="100" step="0.01" value={referralDraft.percentage} onChange={(event) => updateReferralDraft('percentage', event.target.value)} />
                </label>
                <label className={settingsFieldClass}>
                  <span className="text-sm font-medium text-[#51657b]">Basis</span>
                  <Field as="select" value={referralDraft.basis} onChange={(event) => updateReferralDraft('basis', event.target.value)}>
                    <option value="gross_commission">Gross commission</option>
                    <option value="agent_commission">Agent commission</option>
                    <option value="fixed_fee">Fixed fee</option>
                  </Field>
                </label>
                <label className={settingsFieldClass}>
                  <span className="text-sm font-medium text-[#51657b]">Status</span>
                  <Field as="select" value={referralDraft.isActive ? 'active' : 'inactive'} onChange={(event) => updateReferralDraft('isActive', event.target.value === 'active')}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </Field>
                </label>
                <div className={`${settingsActionRowClass} md:col-span-2`}>
                  <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Referral Rule'}</Button>
                </div>
              </form>
            </div>
          </SettingsSectionCard>
        </div>
      ) : null}

      {activeTab === 'templates' ? (
        <div className="space-y-5">
          <SettingsSectionCard title="Commission Templates" description="Reusable legacy templates remain available for transaction snapshots and compatibility.">
            {!structures.length ? (
              <SettingsEmptyState title="No commission templates yet" description="Create a template to standardise listing defaults and split snapshots." />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {structures.map((structure) => (
                  <article key={structure.id} className="rounded-[16px] border border-[#e3eaf3] bg-[#fbfdff] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-[#162334]">{structure.name}</p>
                        <p className="mt-1 text-sm text-[#60748b]">
                          Listing: {structure.listingCommissionType === 'fixed' ? `Fixed R${Number(structure.listingCommissionAmount || 0).toLocaleString('en-ZA')}` : formatCommissionPercent(structure.listingCommissionPercentage || 0)}
                        </p>
                        <p className="mt-1 text-sm text-[#60748b]">
                          Split: Agent {formatCommissionPercent(structure.agentSplitPercentage)} / Agency {formatCommissionPercent(structure.agencySplitPercentage)}
                        </p>
                      </div>
                      {structure.isDefault ? <span className="rounded-full border border-[#d8e6f7] bg-[#eef5ff] px-2.5 py-1 text-xs font-semibold text-[#2b5f93]">Default</span> : null}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button type="button" variant="ghost" onClick={() => setStructureDraft(createStructureDraft(structure))}>Edit</Button>
                      <Button type="button" variant="ghost" onClick={() => removeStructure(structure)}>Remove</Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </SettingsSectionCard>

          <SettingsSectionCard title={structureDraft.id ? 'Edit Template' : 'Add Template'} description="Use templates for listing defaults and transaction commission snapshot compatibility.">
            <form className={settingsGridClass} onSubmit={saveStructure}>
              <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
                <span className="text-sm font-medium text-[#51657b]">Template name</span>
                <Field value={structureDraft.name} onChange={(event) => updateStructureDraft('name', event.target.value)} placeholder="Standard 60/40" />
              </label>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Listing commission type</span>
                <Field as="select" value={structureDraft.listingCommissionType} onChange={(event) => updateStructureDraft('listingCommissionType', event.target.value)}>
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed amount</option>
                </Field>
              </label>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">{structureDraft.listingCommissionType === 'fixed' ? 'Listing commission amount' : 'Listing commission %'}</span>
                <Field
                  type="number"
                  min="0"
                  max={structureDraft.listingCommissionType === 'fixed' ? undefined : '100'}
                  step="0.01"
                  value={structureDraft.listingCommissionType === 'fixed' ? structureDraft.listingCommissionAmount : structureDraft.listingCommissionPercentage}
                  onChange={(event) => updateStructureDraft(structureDraft.listingCommissionType === 'fixed' ? 'listingCommissionAmount' : 'listingCommissionPercentage', event.target.value)}
                />
              </label>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Agent split %</span>
                <Field type="number" min="0" max="100" step="0.01" value={structureDraft.agentSplitPercentage} onChange={(event) => updateStructureDraft('agentSplitPercentage', event.target.value)} />
              </label>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Agency split %</span>
                <Field value={normalizePercentage(100 - normalizePercentage(structureDraft.agentSplitPercentage, 60), 40)} disabled />
              </label>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Default template</span>
                <Field as="select" value={structureDraft.isDefault ? 'yes' : 'no'} onChange={(event) => updateStructureDraft('isDefault', event.target.value === 'yes')}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </Field>
              </label>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Status</span>
                <Field as="select" value={structureDraft.isActive ? 'active' : 'inactive'} onChange={(event) => updateStructureDraft('isActive', event.target.value === 'active')}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Field>
              </label>
              <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
                <span className="text-sm font-medium text-[#51657b]">Notes</span>
                <Field as="textarea" value={structureDraft.notes} onChange={(event) => updateStructureDraft('notes', event.target.value)} />
              </label>
              <div className={`${settingsActionRowClass} md:col-span-2`}>
                {structureDraft.id ? (
                  <Button type="button" variant="ghost" onClick={() => setStructureDraft(createStructureDraft())}>
                    Cancel Edit
                  </Button>
                ) : null}
                <Button type="submit" disabled={saving}>{saving ? 'Saving...' : structureDraft.id ? 'Update Template' : 'Create Template'}</Button>
              </div>
            </form>
          </SettingsSectionCard>
        </div>
      ) : null}

      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
      {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}
    </div>
  )
}
