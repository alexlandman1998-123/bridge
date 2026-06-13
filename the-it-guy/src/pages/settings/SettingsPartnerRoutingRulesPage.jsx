import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import { useWorkspace } from '../../context/WorkspaceContext'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import {
  fetchOrganisationSettings,
  listDevelopmentSettings,
  listOrganisationPartnerRoutingRules,
  listOrganisationUsers,
  removeOrganisationPartnerRoutingRule,
  saveOrganisationPartnerRoutingRule,
} from '../../lib/settingsApi'
import { getWorkspaceHierarchy } from '../../services/bondWorkspaceHierarchyService'
import { PARTNER_ROUTING_MODES, PARTNER_ROUTING_SOURCE_TYPES, PARTNER_ROUTING_TARGET_TYPES } from '../../constants/bondRoutingContract'
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
} from './settingsUi'

const DEFAULT_ASSIGNMENT_PRIORITY = 500

const SOURCE_SCOPE_OPTIONS = [
  { value: PARTNER_ROUTING_SOURCE_TYPES.organisation, label: 'Organisation' },
  { value: PARTNER_ROUTING_SOURCE_TYPES.branch, label: 'Branch' },
  { value: PARTNER_ROUTING_SOURCE_TYPES.team, label: 'Team' },
  { value: PARTNER_ROUTING_SOURCE_TYPES.development, label: 'Development' },
  { value: PARTNER_ROUTING_SOURCE_TYPES.agent, label: 'Agent' },
]

const TARGET_SCOPE_OPTIONS = [
  { value: PARTNER_ROUTING_TARGET_TYPES.orgQueue, label: 'Organisation queue' },
  { value: PARTNER_ROUTING_TARGET_TYPES.region, label: 'Region' },
  { value: PARTNER_ROUTING_TARGET_TYPES.branch, label: 'Branch' },
  { value: PARTNER_ROUTING_TARGET_TYPES.team, label: 'Team' },
  { value: PARTNER_ROUTING_TARGET_TYPES.consultant, label: 'Consultant' },
]

const ASSIGNMENT_MODE_OPTIONS = Object.entries(PARTNER_ROUTING_MODES).map(([key, value]) => ({
  value,
  label: value
    .split('_')
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(' '),
  key,
}))

const EMPTY_WORKSPACE_HIERARCHY = { regions: [], units: [] }

function createRuleDraft() {
  return {
    ruleName: '',
    isActive: true,
    isDefault: false,
    assignmentMode: PARTNER_ROUTING_MODES.manual,
    assignmentPriority: DEFAULT_ASSIGNMENT_PRIORITY,
    sourceScopeType: PARTNER_ROUTING_SOURCE_TYPES.organisation,
    sourceScopeId: '',
    sourceUserId: '',
    targetScopeType: PARTNER_ROUTING_TARGET_TYPES.orgQueue,
    targetScopeId: '',
    targetRegionId: '',
    targetWorkspaceUnitId: '',
    targetConsultantUserId: '',
    notes: '',
  }
}

function mapLabelById(items = [], id = '', keys = {}) {
  if (!id) return ''
  const item = items.find((entry) => String(entry[keys.id || 'id']) === String(id))
  if (!item) return ''
  return item[keys.label || 'name'] || ''
}

function ruleUserLabel(user = {}) {
  return user.fullName || user.email || user.userId || user.id || ''
}

function formatRuleSource(rule, contexts) {
  const sourceScopeType = String(rule.sourceScopeType || '').trim()
  if (sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.organisation) {
    return 'Organisation'
  }
  if (sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.agent) {
    return `Agent • ${ruleUserLabel(contexts.usersById[String(rule.sourceUserId || '')] || { id: rule.sourceUserId })}`
  }
  if (sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.development) {
    return `Development • ${mapLabelById(contexts.developments, rule.sourceScopeId, { id: 'id', label: 'name' }) || 'Not set'}`
  }
  if (sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.branch || sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.team) {
    return `${sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.team ? 'Team' : 'Branch'} • ${
      mapLabelById(contexts.units, rule.sourceScopeId, { id: 'id', label: 'name' }) || 'Not set'
    }`
  }
  return sourceScopeType || 'Not set'
}

function formatRuleTarget(rule, contexts) {
  const targetScopeType = String(rule.targetScopeType || '').trim()
  if (targetScopeType === PARTNER_ROUTING_TARGET_TYPES.orgQueue) {
    return 'Organisation queue'
  }
  if (targetScopeType === PARTNER_ROUTING_TARGET_TYPES.consultant) {
    return `Consultant • ${ruleUserLabel(
      contexts.usersById[String(rule.targetConsultantUserId || '')] || { id: rule.targetConsultantUserId },
    ) || 'Not set'}`
  }
  if (targetScopeType === PARTNER_ROUTING_TARGET_TYPES.region) {
    return `Region • ${mapLabelById(contexts.regions, rule.targetRegionId, { id: 'id', label: 'name' }) || 'Not set'}`
  }
  if (targetScopeType === PARTNER_ROUTING_TARGET_TYPES.branch || targetScopeType === PARTNER_ROUTING_TARGET_TYPES.team) {
    return `${targetScopeType === PARTNER_ROUTING_TARGET_TYPES.team ? 'Team' : 'Branch'} • ${
      mapLabelById(contexts.units, rule.targetWorkspaceUnitId, { id: 'id', label: 'name' }) || 'Not set'
    }`
  }
  return targetScopeType || 'Not set'
}

export default function SettingsPartnerRoutingRulesPage() {
  const { role, workspace } = useWorkspace()
  const [membershipRole, setMembershipRole] = useState('viewer')
  const canEdit = canManageOrganisationSettings({
    appRole: role,
    membershipRole: normalizeOrganisationMembershipRole(membershipRole),
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingItemId, setSavingItemId] = useState('')
  const [rules, setRules] = useState([])
  const [users, setUsers] = useState([])
  const [developments, setDevelopments] = useState([])
  const [hierarchy, setHierarchy] = useState(EMPTY_WORKSPACE_HIERARCHY)
  const [editingRuleId, setEditingRuleId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceScopeFilter, setSourceScopeFilter] = useState('all')
  const [targetScopeFilter, setTargetScopeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [form, setForm] = useState(createRuleDraft())

  const workspaceHierarchy = useMemo(() => ({
    regions: hierarchy.regions || [],
    units: hierarchy.units || [],
  }), [hierarchy])

  const usersById = useMemo(() => {
    const map = Object.create(null)
    users.forEach((user) => {
      if (user?.id) {
        map[user.id] = user
      }
    })
    return map
  }, [users])

  const contexts = useMemo(
    () => ({
      usersById,
      developments,
      units: workspaceHierarchy.units,
      regions: workspaceHierarchy.regions,
    }),
    [usersById, developments, workspaceHierarchy],
  )

  const loadRules = useCallback(async () => {
    try {
      setLoading(true)
      const [context, nextRules, nextUsers, nextDevelopments, nextHierarchy] = await Promise.all([
        fetchOrganisationSettings(),
        listOrganisationPartnerRoutingRules(),
        listOrganisationUsers(),
        listDevelopmentSettings(),
        getWorkspaceHierarchy(workspace?.id || ''),
      ])

      setMembershipRole(context?.membershipRole || 'viewer')
      setRules(Array.isArray(nextRules) ? nextRules : [])
      setUsers(Array.isArray(nextUsers) ? nextUsers : [])
      setDevelopments(Array.isArray(nextDevelopments) ? nextDevelopments : [])
      setHierarchy({
        regions: Array.isArray(nextHierarchy?.regions) ? nextHierarchy.regions : [],
        units: Array.isArray(nextHierarchy?.units) ? nextHierarchy.units : [],
      })
    } catch (loadError) {
      setError(loadError.message || 'Unable to load partner routing rules.')
    } finally {
      setLoading(false)
    }
  }, [workspace?.id])

  useEffect(() => {
    void loadRules()
  }, [loadRules])

  const filteredRules = useMemo(() => {
    return (rules || [])
      .filter((rule) => {
        if (statusFilter === 'active' && !rule?.isActive) return false
        if (statusFilter === 'inactive' && rule?.isActive) return false
        if (sourceScopeFilter !== 'all' && String(rule?.sourceScopeType || '') !== sourceScopeFilter) return false
        if (targetScopeFilter !== 'all' && String(rule?.targetScopeType || '') !== targetScopeFilter) return false
        if (!searchQuery.trim()) return true

        const query = searchQuery.toLowerCase()
        const haystack = `${rule?.ruleName || ''} ${rule?.notes || ''} ${rule?.sourceScopeId || ''} ${rule?.targetScopeId || ''}`.toLowerCase()
        return haystack.includes(query)
      })
      .slice()
  }, [rules, searchQuery, statusFilter, sourceScopeFilter, targetScopeFilter])

  function updateFormField(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  function resetForm() {
    setEditingRuleId('')
    setForm(createRuleDraft())
  }

  function startEdit(rule = {}) {
    setEditingRuleId(rule?.id || '')
    setForm({
      ruleName: rule?.ruleName || '',
      isActive: Boolean(rule?.isActive),
      isDefault: Boolean(rule?.isDefault),
      assignmentMode: rule?.assignmentMode || PARTNER_ROUTING_MODES.manual,
      assignmentPriority: Number.isFinite(Number(rule?.assignmentPriority))
        ? Number(rule.assignmentPriority)
        : Number.isFinite(Number(rule?.priority))
          ? Number(rule.priority)
          : DEFAULT_ASSIGNMENT_PRIORITY,
      sourceScopeType: rule?.sourceScopeType || PARTNER_ROUTING_SOURCE_TYPES.organisation,
      sourceScopeId: rule?.sourceScopeId || rule?.source_context_id || '',
      sourceUserId: rule?.sourceUserId || rule?.source_user_id || '',
      targetScopeType: rule?.targetScopeType || PARTNER_ROUTING_TARGET_TYPES.orgQueue,
      targetScopeId: rule?.targetScopeId || '',
      targetRegionId: rule?.targetRegionId || rule?.target_region_id || '',
      targetWorkspaceUnitId: rule?.targetWorkspaceUnitId || rule?.target_workspace_unit_id || '',
      targetConsultantUserId: rule?.targetConsultantUserId || rule?.target_user_id || '',
      notes: rule?.notes || '',
    })
  }

  function validateForm() {
    if (!String(form.ruleName || '').trim()) {
      throw new Error('Rule name is required.')
    }
    const priorityValue = Number(form.assignmentPriority)
    if (!Number.isFinite(priorityValue) || priorityValue < 0) {
      throw new Error('Assignment priority must be a non-negative number.')
    }

    if (form.sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.agent) {
      if (!String(form.sourceUserId || '').trim()) {
        throw new Error('Source agent must be selected.')
      }
    } else if (form.sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.development && !String(form.sourceScopeId || '').trim()) {
      throw new Error('Source development must be selected.')
    } else if (
      (form.sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.branch || form.sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.team) &&
      !String(form.sourceScopeId || '').trim()
    ) {
      throw new Error('Source unit must be selected.')
    }

    if (form.targetScopeType === PARTNER_ROUTING_TARGET_TYPES.region) {
      if (!String(form.targetRegionId || '').trim()) {
        throw new Error('Target region must be selected.')
      }
    } else if (
      (form.targetScopeType === PARTNER_ROUTING_TARGET_TYPES.branch || form.targetScopeType === PARTNER_ROUTING_TARGET_TYPES.team) &&
      !String(form.targetWorkspaceUnitId || '').trim()
    ) {
      throw new Error('Target unit must be selected.')
    } else if (form.targetScopeType === PARTNER_ROUTING_TARGET_TYPES.consultant) {
      if (!String(form.targetConsultantUserId || '').trim()) {
        throw new Error('Target consultant must be selected.')
      }
    }
  }

  async function handleSave(event) {
    event.preventDefault()
    if (!canEdit) return
    setError('')
    setMessage('')
    try {
      validateForm()
      setSaving(true)
      const normalizedPayload = {
        id: editingRuleId || undefined,
        ...form,
        assignmentPriority: Number(form.assignmentPriority),
      }
      await saveOrganisationPartnerRoutingRule(normalizedPayload)
      await loadRules()
      setMessage(editingRuleId ? 'Partner routing rule updated.' : 'Partner routing rule added.')
      resetForm()
    } catch (saveError) {
      setError(saveError.message || 'Unable to save partner routing rule.')
    } finally {
      setSaving(false)
      setSavingItemId('')
    }
  }

  async function handleToggleActive(rule) {
    if (!canEdit) return
    try {
      setSavingItemId(rule.id)
      await saveOrganisationPartnerRoutingRule({
        ...rule,
        isActive: !Boolean(rule.isActive),
      })
      await loadRules()
      setMessage(`Partner routing rule ${rule?.isActive ? 'deactivated' : 'activated'}.`)
    } catch (toggleError) {
      setError(toggleError.message || 'Unable to update rule status.')
    } finally {
      setSavingItemId('')
    }
  }

  async function handleRemove(rule) {
    if (!canEdit) return
    if (!confirm('Delete this partner routing rule?')) return
    try {
      setSavingItemId(rule.id)
      await removeOrganisationPartnerRoutingRule(rule.id)
      if (String(editingRuleId) === String(rule.id)) {
        resetForm()
      }
      await loadRules()
      setMessage('Partner routing rule removed.')
    } catch (removeError) {
      setError(removeError.message || 'Unable to remove partner routing rule.')
    } finally {
      setSavingItemId('')
    }
  }

  if (loading) {
    return <SettingsLoadingState label="Loading partner routing rules…" />
  }

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Default Routing"
        title="Manage default partner routes"
        description="Map source scope context to connected partner organisations, preferred people, or partner queues used during intake."
      />

      {!canEdit ? (
        <SettingsBanner tone="warning">
          Read-only for your role. Principal-level administrators can manage partner routing rules.
        </SettingsBanner>
      ) : null}

      <SettingsSectionCard title="Routing Rules" description="Search, filter, and maintain active rule set order.">
        <div className={`${settingsGridClass} mb-4`}>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Search</span>
            <Field value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search rule name or notes" />
          </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Source scope</span>
            <Field as="select" value={sourceScopeFilter} onChange={(event) => setSourceScopeFilter(event.target.value)}>
              <option value="all">All source scopes</option>
              {SOURCE_SCOPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Field>
          </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Target scope</span>
            <Field as="select" value={targetScopeFilter} onChange={(event) => setTargetScopeFilter(event.target.value)}>
              <option value="all">All target scopes</option>
              {TARGET_SCOPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Field>
          </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Status</span>
            <Field as="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All rules</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </Field>
          </label>
        </div>

        {!filteredRules.length ? (
          <SettingsEmptyState
            title="No matching routing rules"
            description="Add your first routing rule below or clear filters to view existing rules."
          />
        ) : (
          <div className="space-y-4">
            {filteredRules.map((rule) => (
              <article key={rule.id} className="rounded-[16px] border border-[#e3eaf3] bg-[#fbfdff] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-[#162334]">{rule.ruleName}</p>
                    <p className="mt-1 text-sm text-[#60748b]">{formatRuleSource(rule, contexts)}</p>
                    <p className="text-sm text-[#60748b]">→ {formatRuleTarget(rule, contexts)}</p>
                    <p className="mt-2 text-xs text-[#6b7d93]">
                      Method: <span className="font-semibold">{rule.assignmentMode}</span> · Priority: {rule.assignmentPriority || 0}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] ${
                        rule.isActive
                          ? 'border-[#cce8d6] bg-[#f1fbf4] text-[#1f7a45]'
                          : 'border-[#f0d4d4] bg-[#fff5f5] text-[#a23b3b]'
                      }`}
                    >
                      {rule.isActive ? 'Active' : 'Inactive'}
                    </span>
                    {rule.isDefault ? (
                      <span className="inline-flex rounded-full border border-[#d8e6f7] bg-[#eef5ff] px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#2b5f93]">
                        Default
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-sm text-[#5f748c]">
                  <p>{rule.notes || 'No notes provided.'}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {canEdit ? <Button type="button" variant="ghost" onClick={() => startEdit(rule)}>Edit</Button> : null}
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => handleToggleActive(rule)}
                      disabled={savingItemId === rule.id}
                    >
                      {savingItemId === rule.id ? 'Updating…' : rule.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  ) : null}
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => handleRemove(rule)}
                      disabled={savingItemId === rule.id}
                    >
                      {savingItemId === rule.id ? 'Removing…' : 'Remove'}
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </SettingsSectionCard>

      <SettingsSectionCard
        title={editingRuleId ? 'Edit Partner Routing Rule' : 'Add Partner Routing Rule'}
        description="Set source scope, target scope, assignment method, priority and notes. Default rules act as fallback when no specific source match is found."
      >
        <form className="space-y-5" onSubmit={handleSave}>
          <div className={settingsGridClass}>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Rule name</span>
              <Field value={form.ruleName} disabled={!canEdit} onChange={(event) => updateFormField('ruleName', event.target.value)} />
            </label>

            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Assignment mode</span>
              <Field
                as="select"
                value={form.assignmentMode}
                disabled={!canEdit}
                onChange={(event) => updateFormField('assignmentMode', event.target.value)}
              >
                {ASSIGNMENT_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Field>
            </label>

            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Assignment priority</span>
              <Field
                type="number"
                min="0"
                value={form.assignmentPriority}
                disabled={!canEdit}
                onChange={(event) => updateFormField('assignmentPriority', event.target.value)}
              />
            </label>

            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Source scope</span>
              <Field
                as="select"
                value={form.sourceScopeType}
                disabled={!canEdit}
                onChange={(event) => {
                  const nextSourceScopeType = event.target.value
                  setForm((previous) => ({
                    ...previous,
                    sourceScopeType: nextSourceScopeType,
                    sourceScopeId: '',
                    sourceUserId: '',
                  }))
                }}
              >
                {SOURCE_SCOPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Field>
            </label>

            {form.sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.agent ? (
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Source agent</span>
                <Field
                  as="select"
                  value={form.sourceUserId}
                  disabled={!canEdit}
                  onChange={(event) => updateFormField('sourceUserId', event.target.value)}
                >
                  <option value="">Select source agent</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {ruleUserLabel(user)}
                    </option>
                  ))}
                </Field>
              </label>
            ) : form.sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.development ? (
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Source development</span>
                <Field
                  as="select"
                  value={form.sourceScopeId}
                  disabled={!canEdit}
                  onChange={(event) => updateFormField('sourceScopeId', event.target.value)}
                >
                  <option value="">Select source development</option>
                  {developments.map((development) => (
                    <option key={development.id} value={development.id}>
                      {development.name}
                    </option>
                  ))}
                </Field>
              </label>
            ) : form.sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.branch ||
              form.sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.team ? (
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">
                  {form.sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.team ? 'Source team' : 'Source branch'}
                </span>
                <Field
                  as="select"
                  value={form.sourceScopeId}
                  disabled={!canEdit}
                  onChange={(event) => updateFormField('sourceScopeId', event.target.value)}
                >
                  <option value="">Select source unit</option>
                  {workspaceHierarchy.units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name || unit.code || unit.id}
                    </option>
                  ))}
                </Field>
              </label>
            ) : (
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Source context</span>
                <Field value="Organisation scope has no additional context" disabled />
              </label>
            )}

            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Target scope</span>
              <Field
                as="select"
                value={form.targetScopeType}
                disabled={!canEdit}
                onChange={(event) => {
                  const nextTargetScopeType = event.target.value
                  setForm((previous) => ({
                    ...previous,
                    targetScopeType: nextTargetScopeType,
                    targetRegionId: '',
                    targetWorkspaceUnitId: '',
                    targetConsultantUserId: '',
                    targetScopeId: '',
                  }))
                }}
              >
                {TARGET_SCOPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Field>
            </label>

            {form.targetScopeType === PARTNER_ROUTING_TARGET_TYPES.region ? (
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Target region</span>
                <Field
                  as="select"
                  value={form.targetRegionId}
                  disabled={!canEdit}
                  onChange={(event) => updateFormField('targetRegionId', event.target.value)}
                >
                  <option value="">Select target region</option>
                  {workspaceHierarchy.regions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name}
                    </option>
                  ))}
                </Field>
              </label>
            ) : form.targetScopeType === PARTNER_ROUTING_TARGET_TYPES.branch ||
              form.targetScopeType === PARTNER_ROUTING_TARGET_TYPES.team ? (
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">
                  {form.targetScopeType === PARTNER_ROUTING_TARGET_TYPES.team ? 'Target team' : 'Target branch'}
                </span>
                <Field
                  as="select"
                  value={form.targetWorkspaceUnitId}
                  disabled={!canEdit}
                  onChange={(event) => updateFormField('targetWorkspaceUnitId', event.target.value)}
                >
                  <option value="">Select target unit</option>
                  {workspaceHierarchy.units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name || unit.code || unit.id}
                    </option>
                  ))}
                </Field>
              </label>
            ) : form.targetScopeType === PARTNER_ROUTING_TARGET_TYPES.consultant ? (
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Target consultant</span>
                <Field
                  as="select"
                  value={form.targetConsultantUserId}
                  disabled={!canEdit}
                  onChange={(event) => updateFormField('targetConsultantUserId', event.target.value)}
                >
                  <option value="">Select target consultant</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {ruleUserLabel(user)}
                    </option>
                  ))}
                </Field>
              </label>
            ) : (
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Target context</span>
                <Field value="Organisation queue has no additional context" disabled />
              </label>
            )}

            <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
              <span className="text-sm font-medium text-[#51657b]">Notes</span>
              <Field as="textarea" rows={3} value={form.notes} disabled={!canEdit} onChange={(event) => updateFormField('notes', event.target.value)} />
            </label>

            <label className="flex items-center gap-3 text-sm font-medium text-[#35546c]">
              <input
                type="checkbox"
                checked={Boolean(form.isActive)}
                disabled={!canEdit}
                onChange={(event) => updateFormField('isActive', event.target.checked)}
              />
              Active
            </label>

            <label className="flex items-center gap-3 text-sm font-medium text-[#35546c]">
              <input
                type="checkbox"
                checked={Boolean(form.isDefault)}
                disabled={!canEdit}
                onChange={(event) => updateFormField('isDefault', event.target.checked)}
              />
              Default rule
            </label>
          </div>

          {canEdit ? (
            <div className={`${settingsActionRowClass} md:col-span-2`}>
              {editingRuleId ? (
                <Button type="button" variant="ghost" onClick={resetForm} disabled={saving}>
                  Cancel Edit
                </Button>
              ) : null}
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : editingRuleId ? 'Save Rule' : 'Add Rule'}
              </Button>
            </div>
          ) : null}
        </form>
      </SettingsSectionCard>

      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
      {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}
    </div>
  )
}
