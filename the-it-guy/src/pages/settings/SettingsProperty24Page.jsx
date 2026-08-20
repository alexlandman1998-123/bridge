import {
  CheckCircle2,
  CircleAlert,
  PlugZap,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Wand2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useOrganisation } from '../../context/OrganisationContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { supabase } from '../../lib/supabaseClient'
import {
  fetchOrganisationSettings,
  listOrganisationUsers,
  updateOrganisationSettings,
} from '../../lib/settingsApi'
import {
  createSuggestedProperty24AgentMappings,
  normalizeProperty24AgentRow,
  normalizeProperty24Settings,
  normalizeProperty24SettingsText,
  summarizeProperty24SettingsReadiness,
} from './property24SettingsModel'
import {
  SettingsBanner,
  SettingsEmptyState,
  SettingsLoadingState,
  SettingsSectionCard,
  SettingsStickySaveBar,
  settingsPageClass,
} from './settingsUi'

const INPUT_CLASS = 'h-11 rounded-[12px] border border-[#d8e3ee] bg-white px-3.5 text-sm text-[#17233a] shadow-[0_1px_0_rgba(15,23,42,0.02)] placeholder:text-[#9aa8b8] focus:border-[#0f7f4f] focus:outline-none focus:ring-2 focus:ring-[#dff2e8]'
const LABEL_CLASS = 'text-[0.78rem] font-semibold text-[#43566d]'
const FIELD_CLASS = 'grid gap-1.5'
const SECONDARY_BUTTON_CLASS = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#24364b] transition hover:bg-[#f7fafc] disabled:cursor-not-allowed disabled:opacity-60'
const PRIMARY_BUTTON_CLASS = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-[#0f7f4f] bg-[#0f7f4f] px-4 text-sm font-semibold text-white shadow-[0_8px_16px_rgba(15,127,79,0.2)] transition hover:bg-[#0d6f45] disabled:cursor-not-allowed disabled:border-[#cbd8e5] disabled:bg-[#eef2f6] disabled:text-[#8391a2] disabled:shadow-none'

function normalizeEmail(value = '') {
  return normalizeProperty24SettingsText(value).toLowerCase()
}

function createBlankProperty24Agent() {
  return normalizeProperty24AgentRow({
    rowId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: 'active',
  })
}

function buildOrganisationPayload(context = {}, settingsJson = {}) {
  const organisation = context.organisation || {}
  return {
    name: organisation.name || organisation.displayName || 'Organisation',
    displayName: organisation.displayName || organisation.name || '',
    logoUrl: organisation.logoUrl || organisation.logo_url || '',
    companyEmail: organisation.companyEmail || organisation.company_email || '',
    companyPhone: organisation.companyPhone || organisation.company_phone || '',
    website: organisation.website || '',
    addressLine1: organisation.addressLine1 || organisation.address_line_1 || organisation.address || '',
    addressLine2: organisation.addressLine2 || organisation.address_line_2 || '',
    formattedAddress: organisation.formattedAddress || organisation.formatted_address || '',
    suburb: organisation.suburb || '',
    city: organisation.city || '',
    province: organisation.province || '',
    postalCode: organisation.postalCode || organisation.postal_code || '',
    country: organisation.country || 'South Africa',
    latitude: organisation.latitude ?? null,
    longitude: organisation.longitude ?? null,
    googlePlaceId: organisation.googlePlaceId || organisation.google_place_id || '',
    supportEmail: organisation.supportEmail || organisation.support_email || '',
    supportPhone: organisation.supportPhone || organisation.support_phone || '',
    primaryContactPerson: organisation.primaryContactPerson || organisation.primary_contact_person || '',
    settingsJson,
  }
}

function toMappingPatch(agent = {}, mapping = {}) {
  return {
    arch9UserId: agent.userId || agent.user_id || agent.id || mapping.arch9UserId || '',
    arch9MembershipId: agent.id || mapping.arch9MembershipId || '',
    arch9Name: agent.fullName || agent.full_name || mapping.arch9Name || agent.email || '',
    arch9Email: normalizeEmail(agent.email || mapping.arch9Email),
    property24AgentId: mapping.property24AgentId || '',
    property24Name: mapping.property24Name || '',
    property24Email: normalizeEmail(mapping.property24Email),
    sourceReference: mapping.sourceReference || '',
    matchMethod: mapping.matchMethod || 'manual',
    matchStatus: mapping.property24AgentId ? 'mapped' : 'unmapped',
    confidence: mapping.property24AgentId ? Number(mapping.confidence || 0.8) : 0,
  }
}

function createMappingLookup(mappings = []) {
  return new Map(
    mappings.map((mapping) => [
      mapping.arch9UserId || mapping.arch9MembershipId || mapping.arch9Email,
      mapping,
    ]),
  )
}

function StatusPill({ ready, label }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
      ready
        ? 'border-[#ccead8] bg-[#f2fbf5] text-[#1f7a45]'
        : 'border-[#f3d9a8] bg-[#fff8ec] text-[#a16207]'
    }`}>
      {ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
      {label}
    </span>
  )
}

function Field({ label, children }) {
  return (
    <label className={FIELD_CLASS}>
      <span className={LABEL_CLASS}>{label}</span>
      {children}
    </label>
  )
}

export default function SettingsProperty24Page() {
  const { refreshOrganisation } = useOrganisation()
  const { currentWorkspace } = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [context, setContext] = useState(null)
  const [users, setUsers] = useState([])
  const [settings, setSettings] = useState(() => normalizeProperty24Settings())
  const [savedSettings, setSavedSettings] = useState(() => normalizeProperty24Settings())

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [organisationContext, organisationUsers] = await Promise.all([
          fetchOrganisationSettings({ forceRefresh: true }),
          listOrganisationUsers(),
        ])
        if (cancelled) return
        const nextSettings = normalizeProperty24Settings(organisationContext.organisationSettings?.property24)
        setContext(organisationContext)
        setUsers(organisationUsers)
        setSettings(nextSettings)
        setSavedSettings(nextSettings)
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Unable to load Property24 settings.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const agentCandidates = useMemo(
    () => users.filter((user) => user.email && !['inactive', 'archived', 'disabled'].includes(normalizeEmail(user.status || user.membershipStatus))),
    [users],
  )
  const mappingLookup = useMemo(() => createMappingLookup(settings.agentMappings), [settings.agentMappings])
  const readiness = useMemo(
    () => summarizeProperty24SettingsReadiness({ settings, arch9Agents: agentCandidates }),
    [settings, agentCandidates],
  )
  const dirty = JSON.stringify(settings) !== JSON.stringify(savedSettings)
  const workspaceName = currentWorkspace?.name || context?.organisation?.displayName || context?.organisation?.name || 'Organisation'

  function updateSettings(patch) {
    setSuccess('')
    setError('')
    setSettings((current) => normalizeProperty24Settings({ ...current, ...patch }))
  }

  function updateProperty24Agent(index, patch) {
    const nextAgents = settings.property24Agents.map((agent, agentIndex) => (
      agentIndex === index ? normalizeProperty24AgentRow({ ...agent, ...patch }) : agent
    ))
    updateSettings({ property24Agents: nextAgents })
  }

  function removeProperty24Agent(index) {
    updateSettings({ property24Agents: settings.property24Agents.filter((_, agentIndex) => agentIndex !== index) })
  }

  function addProperty24Agent() {
    updateSettings({ property24Agents: [...settings.property24Agents, createBlankProperty24Agent()] })
  }

  function applySuggestedMappings(nextProperty24Agents = settings.property24Agents) {
    const suggested = createSuggestedProperty24AgentMappings({
      arch9Agents: agentCandidates,
      property24Agents: nextProperty24Agents,
      existingMappings: settings.agentMappings,
      sourceReferencePrefix: settings.sourceReferencePrefix,
    })
    updateSettings({ property24Agents: nextProperty24Agents, agentMappings: suggested })
  }

  function updateMapping(agent, patch) {
    const agentKey = agent.userId || agent.id || agent.email
    const nextMappings = agentCandidates.map((candidate) => {
      const candidateKey = candidate.userId || candidate.id || candidate.email
      const existing = mappingLookup.get(candidateKey) || mappingLookup.get(normalizeEmail(candidate.email)) || {}
      const next = candidateKey === agentKey ? { ...existing, ...patch } : existing
      return toMappingPatch(candidate, next)
    })
    updateSettings({ agentMappings: nextMappings })
  }

  async function syncProperty24Agents() {
    if (!settings.agencyId || !context?.organisation?.id) {
      setError('Add the Property24 agency ID before syncing agents.')
      return
    }
    setSyncing(true)
    setError('')
    setSuccess('')
    try {
      const sessionResult = await supabase.auth.getSession()
      const accessToken = sessionResult.data?.session?.access_token
      if (!accessToken) throw new Error('Sign in again before syncing Property24 agents.')
      const response = await fetch('/api/property24/settings/agents-sync', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organisationId: context.organisation.id,
          agencyId: settings.agencyId,
          existingMappings: settings.agentMappings,
          sourceReferencePrefix: settings.sourceReferencePrefix,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.message || 'Property24 agent sync failed.')
      }
      const nextAgents = (payload.property24Agents || []).map(normalizeProperty24AgentRow)
      const nextMappings = (payload.agentPlan?.mappings || []).map((row) => toMappingPatch(row.arch9Agent, {
        property24AgentId: row.property24Agent?.property24AgentId,
        property24Name: row.property24Agent?.fullName,
        property24Email: row.property24Agent?.email,
        sourceReference: row.sourceReference,
        matchMethod: row.matchType,
        matchStatus: 'mapped',
        confidence: row.confidence,
      }))
      const reviewMappings = (payload.agentPlan?.needsReview || []).map((row) => toMappingPatch(row.arch9Agent, {
        sourceReference: row.suggestedSourceReference,
        matchMethod: 'none',
        matchStatus: row.status || 'unmapped',
      }))
      updateSettings({
        property24Agents: nextAgents,
        agentMappings: [...nextMappings, ...reviewMappings],
        lastAgentSyncAt: payload.generatedAt || new Date().toISOString(),
      })
      setSuccess(`Synced ${nextAgents.length} Property24 agents.`)
    } catch (syncError) {
      setError(syncError.message || 'Property24 agent sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  async function saveSettings() {
    if (!context) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const organisationSettings = context.organisationSettings || {}
      const nextProperty24 = normalizeProperty24Settings(settings)
      const nextSettingsJson = {
        ...organisationSettings,
        property24: nextProperty24,
      }
      const result = await updateOrganisationSettings(buildOrganisationPayload(context, nextSettingsJson))
      const nextContext = {
        ...context,
        ...result,
        organisationSettings: nextSettingsJson,
      }
      setContext(nextContext)
      setSettings(nextProperty24)
      setSavedSettings(nextProperty24)
      setSuccess('Property24 settings saved.')
      await refreshOrganisation?.({ forceRefresh: true })
    } catch (saveError) {
      setError(saveError.message || 'Unable to save Property24 settings.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <SettingsLoadingState label="Loading Property24 settings..." />

  if (!context?.organisation?.id) {
    return (
      <div className={settingsPageClass}>
        <SettingsEmptyState
          title="Organisation required"
          description="Complete organisation setup before connecting Property24."
        />
      </div>
    )
  }

  return (
    <div className={`${settingsPageClass} space-y-6`}>
      <header className="flex flex-col gap-4 border-b border-[#e2eaf2] pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#0f7f4f]">
            <PlugZap className="h-4 w-4" />
            {workspaceName}
          </div>
          <h1 className="text-2xl font-semibold text-[#142132]">Property24</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill ready={readiness.accountReady} label={readiness.accountReady ? 'Account ready' : 'Account incomplete'} />
          <StatusPill ready={readiness.mappingsReady} label={`${readiness.mappedCount}/${readiness.candidateCount} agents mapped`} />
        </div>
      </header>

      {error ? <SettingsBanner>{error}</SettingsBanner> : null}
      {success ? <SettingsBanner tone="success">{success}</SettingsBanner> : null}

      <SettingsSectionCard title="Agency Account" description="Property24 identifies the publishing agency from this account setup.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex min-h-[44px] items-center gap-3 rounded-[12px] border border-[#d8e3ee] bg-white px-3.5">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-[#c8d4e2] text-[#0f7f4f] focus:ring-[#0f7f4f]"
              checked={settings.enabled}
              onChange={(event) => updateSettings({ enabled: event.target.checked })}
            />
            <span className="text-sm font-semibold text-[#24364b]">Enabled</span>
          </label>
          <Field label="Environment">
            <select
              className={INPUT_CLASS}
              value={settings.environment}
              onChange={(event) => updateSettings({ environment: event.target.value })}
            >
              <option value="exdev">ExDev</option>
              <option value="production">Production</option>
            </select>
          </Field>
          <Field label="Property24 Agency ID">
            <input
              className={INPUT_CLASS}
              value={settings.agencyId}
              onChange={(event) => updateSettings({ agencyId: event.target.value })}
              placeholder="31382"
            />
          </Field>
          <Field label="Source Prefix">
            <input
              className={INPUT_CLASS}
              value={settings.sourceReferencePrefix}
              onChange={(event) => updateSettings({ sourceReferencePrefix: event.target.value })}
              placeholder="ARCH9"
            />
          </Field>
        </div>
        <div className="mt-4 rounded-[12px] border border-[#dfe8f1] bg-[#f9fbfe] px-4 py-3 text-sm leading-6 text-[#52657b]">
          Credentials mode: <span className="font-semibold text-[#26384e]">server environment</span>. Property24 passwords are not stored in this settings screen.
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Property24 Agents"
        description="Agents fetched from Property24 are used to match Arch9 users by email or source reference."
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={addProperty24Agent}>
              <Plus className="h-4 w-4" /> Add
            </button>
            <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={() => applySuggestedMappings()}>
              <Wand2 className="h-4 w-4" /> Auto-match
            </button>
            <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={syncProperty24Agents} disabled={syncing || !settings.agencyId}>
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing...' : 'Sync agents'}
            </button>
          </div>
        }
      >
        <div className="overflow-hidden rounded-[14px] border border-[#dfe7ee]">
          <div className="grid grid-cols-[1fr_1fr_1fr_44px] gap-0 bg-[#f7fafc] px-4 py-3 text-xs font-semibold uppercase text-[#6b7d93]">
            <span>Agent ID</span>
            <span>Name</span>
            <span>Email</span>
            <span />
          </div>
          {settings.property24Agents.length ? settings.property24Agents.map((agent, index) => (
            <div key={agent.rowId || index} className="grid grid-cols-[1fr_1fr_1fr_44px] gap-3 border-t border-[#edf2f7] bg-white px-4 py-3">
              <input className={INPUT_CLASS} value={agent.property24AgentId} onChange={(event) => updateProperty24Agent(index, { property24AgentId: event.target.value })} />
              <input className={INPUT_CLASS} value={agent.fullName} onChange={(event) => updateProperty24Agent(index, { fullName: event.target.value })} />
              <input className={INPUT_CLASS} value={agent.email} onChange={(event) => updateProperty24Agent(index, { email: event.target.value })} />
              <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-[#ead1d1] text-[#b42318] transition hover:bg-[#fff5f5]" onClick={() => removeProperty24Agent(index)} aria-label="Remove Property24 agent">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )) : (
            <div className="bg-white px-4 py-8 text-center text-sm text-[#6b7d93]">
              No Property24 agents synced yet.
            </div>
          )}
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard title="Agent Mapping" description="Every Arch9 agent who publishes listings needs one Property24 agent ID.">
        <div className="overflow-hidden rounded-[14px] border border-[#dfe7ee]">
          <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-0 bg-[#f7fafc] px-4 py-3 text-xs font-semibold uppercase text-[#6b7d93]">
            <span>Arch9 Agent</span>
            <span>Property24 Agent ID</span>
            <span>Source Reference</span>
            <span>Status</span>
          </div>
          {agentCandidates.length ? agentCandidates.map((agent) => {
            const agentKey = agent.userId || agent.id || agent.email
            const mapping = mappingLookup.get(agentKey) || mappingLookup.get(normalizeEmail(agent.email)) || toMappingPatch(agent)
            const mapped = Boolean(mapping.property24AgentId)
            return (
              <div key={agentKey} className="grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-3 border-t border-[#edf2f7] bg-white px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#17233a]">{agent.fullName || agent.email}</p>
                  <p className="truncate text-xs text-[#6b7d93]">{agent.email}</p>
                </div>
                <input
                  className={INPUT_CLASS}
                  value={mapping.property24AgentId}
                  onChange={(event) => updateMapping(agent, { property24AgentId: event.target.value, matchMethod: 'manual' })}
                  placeholder="Property24 ID"
                />
                <input
                  className={INPUT_CLASS}
                  value={mapping.sourceReference}
                  onChange={(event) => updateMapping(agent, { sourceReference: event.target.value, matchMethod: 'manual' })}
                  placeholder={`${settings.sourceReferencePrefix}-${agent.userId || agent.id || 'agent'}`}
                />
                <div className="flex items-center">
                  <StatusPill ready={mapped} label={mapped ? `Mapped${mapping.matchMethod ? ` by ${mapping.matchMethod}` : ''}` : 'Needs mapping'} />
                </div>
              </div>
            )
          }) : (
            <div className="bg-white px-4 py-8 text-center text-sm text-[#6b7d93]">
              No Arch9 agents found for this organisation.
            </div>
          )}
        </div>
      </SettingsSectionCard>

      <SettingsStickySaveBar
        dirty={dirty}
        saving={saving}
        message="You have unsaved Property24 changes"
        saveLabel="Save Property24 setup"
        onDiscard={() => {
          setSettings(savedSettings)
          setError('')
          setSuccess('')
        }}
        onSave={saveSettings}
      />

      <div className="flex justify-end">
        <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={saveSettings} disabled={saving || !dirty}>
          <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
