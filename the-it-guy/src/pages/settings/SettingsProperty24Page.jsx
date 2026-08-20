import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Clock3,
  KeyRound,
  Link2,
  PlugZap,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  UserPlus,
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
const MUTED_PANEL_CLASS = 'rounded-[14px] border border-[#dfe8f1] bg-[#f9fbfe] px-4 py-3'

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

function findProperty24AgentById(agents = [], agentId = '') {
  const normalizedAgentId = normalizeProperty24SettingsText(agentId)
  return agents.find((agent) => normalizeProperty24SettingsText(agent.property24AgentId) === normalizedAgentId) || null
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

function SetupStep({ ready, title, description }) {
  return (
    <div className={`rounded-[14px] border px-4 py-3 ${
      ready
        ? 'border-[#ccead8] bg-[#f2fbf5]'
        : 'border-[#e2eaf2] bg-white'
    }`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          ready ? 'bg-[#1f7a45] text-white' : 'bg-[#eef3f7] text-[#6b7d93]'
        }`}>
          {ready ? <CheckCircle2 className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[#17233a]">{title}</span>
          <span className="mt-1 block text-sm leading-5 text-[#6b7d93]">{description}</span>
        </span>
      </div>
    </div>
  )
}

function ConnectionToggle({ checked, onChange }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border px-4 text-sm font-semibold transition ${
        checked
          ? 'border-[#0f7f4f] bg-[#0f7f4f] text-white shadow-[0_8px_16px_rgba(15,127,79,0.2)] hover:bg-[#0d6f45]'
          : 'border-[#d9e3ef] bg-white text-[#24364b] hover:bg-[#f7fafc]'
      }`}
      onClick={() => onChange(!checked)}
    >
      <PlugZap className="h-4 w-4" />
      {checked ? 'Property24 enabled' : 'Enable Property24'}
    </button>
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

function formatHealthDate(value = '') {
  if (!value) return 'Not yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not yet'
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function getHealthTone(status = '') {
  const normalized = String(status || '').toUpperCase()
  if (normalized === 'OK') return 'border-[#ccead8] bg-[#f2fbf5] text-[#1f7a45]'
  if (normalized === 'BLOCKED') return 'border-[#f3c7c7] bg-[#fff5f5] text-[#b42318]'
  return 'border-[#f3d9a8] bg-[#fff8ec] text-[#a16207]'
}

function HealthMetric({ label, value }) {
  return (
    <div className="rounded-[12px] border border-[#e3ebf3] bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase text-[#6b7d93]">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[#17233a]">{value}</p>
    </div>
  )
}

export default function SettingsProperty24Page() {
  const { refreshOrganisation } = useOrganisation()
  const { currentWorkspace } = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [healthLoading, setHealthLoading] = useState(false)
  const [creatingAgentKey, setCreatingAgentKey] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [healthError, setHealthError] = useState('')
  const [property24Health, setProperty24Health] = useState(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
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
        void loadProperty24Health({
          organisationId: organisationContext.organisation?.id,
          settingsSnapshot: nextSettings,
        })
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
  const serverCredentialsReady = true
  const healthSummary = property24Health?.summary || {}
  const healthChecks = property24Health?.checks || []

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

  function chooseProperty24Agent(agent, property24AgentId) {
    const property24Agent = findProperty24AgentById(settings.property24Agents, property24AgentId)
    updateMapping(agent, {
      property24AgentId,
      property24Name: property24Agent?.fullName || '',
      property24Email: property24Agent?.email || '',
      sourceReference: property24Agent?.sourceReference || '',
      matchMethod: property24Agent ? 'manual' : 'none',
      matchStatus: property24Agent ? 'mapped' : 'unmapped',
      confidence: property24Agent ? 1 : 0,
    })
  }

  function acceptSuggestedMapping(agent, mapping = {}) {
    updateMapping(agent, {
      ...mapping,
      matchMethod: mapping.matchMethod === 'none' ? 'manual' : mapping.matchMethod,
      matchStatus: 'mapped',
      confidence: 1,
    })
  }

  async function loadProperty24Health({ organisationId = context?.organisation?.id, settingsSnapshot = settings } = {}) {
    if (!organisationId) return
    setHealthLoading(true)
    setHealthError('')
    try {
      const sessionResult = await supabase.auth.getSession()
      const accessToken = sessionResult.data?.session?.access_token
      if (!accessToken) throw new Error('Sign in again before checking Property24 health.')
      const response = await fetch('/api/property24/settings/health', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organisationId,
          settings: settingsSnapshot,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || 'Property24 health check failed.')
      setProperty24Health(payload.health || null)
    } catch (loadHealthError) {
      setHealthError(loadHealthError.message || 'Property24 health check failed.')
    } finally {
      setHealthLoading(false)
    }
  }

  async function createProperty24Agent(agent, mapping = {}) {
    if (!settings.agencyId || !context?.organisation?.id) {
      setError('Add the Property24 agency ID before creating agents.')
      return
    }
    const agentKey = agent.userId || agent.id || agent.email
    setCreatingAgentKey(agentKey)
    setError('')
    setSuccess('')
    try {
      const sessionResult = await supabase.auth.getSession()
      const accessToken = sessionResult.data?.session?.access_token
      if (!accessToken) throw new Error('Sign in again before creating a Property24 agent.')
      const response = await fetch('/api/property24/settings/agents-create', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organisationId: context.organisation.id,
          agencyId: settings.agencyId,
          sourceReference: mapping.sourceReference,
          agent: {
            firstName: agent.firstName,
            lastName: agent.lastName,
            fullName: agent.fullName,
            email: agent.email,
            mobile: agent.mobile || agent.phone,
            phone: agent.phone,
            jobTitle: agent.jobTitle || 'Agent',
          },
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (Array.isArray(payload.missingFields) && payload.missingFields.length) {
          throw new Error(`Cannot create Property24 agent yet. Missing: ${payload.missingFields.join(', ')}.`)
        }
        throw new Error(payload.message || 'Property24 agent creation failed.')
      }
      const createdAgent = normalizeProperty24AgentRow(payload.agent || {
        property24AgentId: payload.property24AgentId,
        fullName: agent.fullName,
        email: agent.email,
        mobile: agent.mobile || agent.phone,
        sourceReference: mapping.sourceReference,
      })
      updateSettings({
        property24Agents: [...settings.property24Agents, createdAgent],
        agentMappings: agentCandidates.map((candidate) => {
          const candidateKey = candidate.userId || candidate.id || candidate.email
          const existing = mappingLookup.get(candidateKey) || mappingLookup.get(normalizeEmail(candidate.email)) || {}
          if (candidateKey !== agentKey) return toMappingPatch(candidate, existing)
          return toMappingPatch(candidate, {
            ...existing,
            property24AgentId: createdAgent.property24AgentId,
            property24Name: createdAgent.fullName,
            property24Email: createdAgent.email,
            sourceReference: createdAgent.sourceReference || mapping.sourceReference,
            matchMethod: 'created',
            matchStatus: 'mapped',
            confidence: 1,
          })
        }),
        lastAgentSyncAt: new Date().toISOString(),
      })
      setSuccess(`Created Property24 agent for ${agent.fullName || agent.email}.`)
    } catch (createError) {
      setError(createError.message || 'Property24 agent creation failed.')
    } finally {
      setCreatingAgentKey('')
    }
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
      void loadProperty24Health({ settingsSnapshot: nextProperty24 })
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

      <SettingsSectionCard title="Connection Setup" description="Connect the agency once, then map the agents who can publish listings.">
        <div className="grid gap-3 lg:grid-cols-4">
          <SetupStep
            ready={settings.enabled}
            title="Connection"
            description={settings.enabled ? 'Property24 publishing is enabled.' : 'Turn Property24 on for this agency.'}
          />
          <SetupStep
            ready={Boolean(settings.agencyId)}
            title="Agency ID"
            description={settings.agencyId ? `Agency ${settings.agencyId} is saved here.` : 'Enter the Property24 agency number.'}
          />
          <SetupStep
            ready={serverCredentialsReady}
            title="Credentials"
            description="Managed securely on the server."
          />
          <SetupStep
            ready={readiness.mappingsReady}
            title="Agent Mapping"
            description={`${readiness.mappedCount}/${readiness.candidateCount} publishing agents mapped.`}
          />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <Field label="Property24 Agency ID">
            <input
              className={INPUT_CLASS}
              value={settings.agencyId}
              onChange={(event) => updateSettings({ agencyId: event.target.value })}
              placeholder="31382"
            />
          </Field>
          <ConnectionToggle checked={settings.enabled} onChange={(enabled) => updateSettings({ enabled })} />
        </div>

        <div className={`${MUTED_PANEL_CLASS} mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between`}>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#0f7f4f]">
              <KeyRound className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#24364b]">Property24 login details stay server-side</p>
              <p className="mt-1 text-sm leading-5 text-[#6b7d93]">Principals only manage the agency number and agent links here.</p>
            </div>
          </div>
          <StatusPill ready={serverCredentialsReady} label="Server managed" />
        </div>

        <div className="mt-4">
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS}
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            <Settings2 className="h-4 w-4" />
            {advancedOpen ? 'Hide advanced settings' : 'Advanced settings'}
          </button>
          {advancedOpen ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
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
              <Field label="Source Reference Prefix">
                <input
                  className={INPUT_CLASS}
                  value={settings.sourceReferencePrefix}
                  onChange={(event) => updateSettings({ sourceReferencePrefix: event.target.value })}
                  placeholder="ARCH9"
                />
              </Field>
            </div>
          ) : null}
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Operational Health"
        description="Live readiness, listing tracking, and lead import checks for this Property24 connection."
        actions={
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS}
            onClick={() => loadProperty24Health()}
            disabled={healthLoading}
          >
            <RefreshCw className={`h-4 w-4 ${healthLoading ? 'animate-spin' : ''}`} />
            {healthLoading ? 'Checking...' : 'Refresh'}
          </button>
        }
      >
        {healthError ? <SettingsBanner>{healthError}</SettingsBanner> : null}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className={`${MUTED_PANEL_CLASS} flex flex-col justify-between gap-4`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#24364b]">Property24 status</p>
                <p className="mt-1 text-sm leading-5 text-[#6b7d93]">
                  {property24Health ? `Last checked ${formatHealthDate(property24Health.generatedAt)}` : 'Run a health check after saving setup.'}
                </p>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${getHealthTone(property24Health?.status)}`}>
                {property24Health?.status === 'OK' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
                {property24Health?.status || 'Not checked'}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <HealthMetric label="Listings tracked" value={healthSummary.trackedListingCount ?? 0} />
              <HealthMetric label="On portal" value={healthSummary.onPortalListingCount ?? 0} />
              <HealthMetric label="Leads imported" value={healthSummary.processedLeadImportCount ?? 0} />
              <HealthMetric label="Needs review" value={(healthSummary.failedLeadImportCount || 0) + (healthSummary.failedListingSyncCount || 0)} />
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-[#6b7d93]">
              <span className="inline-flex items-center gap-2">
                <Clock3 className="h-4 w-4" />
                Latest lead: {formatHealthDate(healthSummary.latestLeadImportAt)}
              </span>
              <span className="inline-flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Latest listing sync: {formatHealthDate(healthSummary.latestListingSyncAt)}
              </span>
            </div>
          </div>

          <div className="grid gap-2">
            {healthChecks.length ? healthChecks.map((check) => (
              <div key={check.key} className="flex items-start gap-3 rounded-[12px] border border-[#e3ebf3] bg-white px-4 py-3">
                <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${getHealthTone(check.status)}`}>
                  {check.status === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[#17233a]">{check.label}</span>
                  <span className="mt-1 block text-sm leading-5 text-[#6b7d93]">{check.detail}</span>
                </span>
              </div>
            )) : (
              <SettingsEmptyState
                title="No health report yet"
                description="Refresh the health check once the agency setup has been saved."
              />
            )}
          </div>
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

      <SettingsSectionCard title="Agent Mapping" description="Review each publishing agent before listings can go live on Property24.">
        {agentCandidates.length ? (
          <div className="grid gap-3">
            {agentCandidates.map((agent) => {
              const agentKey = agent.userId || agent.id || agent.email
              const mapping = mappingLookup.get(agentKey) || mappingLookup.get(normalizeEmail(agent.email)) || toMappingPatch(agent)
              const mapped = Boolean(mapping.property24AgentId)
              const matchedAgent = findProperty24AgentById(settings.property24Agents, mapping.property24AgentId)
              const matchLabel = mapped
                ? mapping.matchMethod === 'email'
                  ? 'Matched by email'
                  : mapping.matchMethod === 'source_reference'
                    ? 'Matched by source reference'
                    : mapping.matchMethod === 'created'
                      ? 'Created from Arch9'
                      : 'Manually selected'
                : 'Needs review'
              const creating = creatingAgentKey === agentKey

              return (
                <article key={agentKey} className="rounded-[14px] border border-[#dfe7ee] bg-white p-4">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] lg:items-center">
                    <div className="min-w-0 rounded-[12px] border border-[#e8eef5] bg-[#f9fbfe] p-4">
                      <p className="text-xs font-semibold uppercase text-[#6b7d93]">Arch9 Agent</p>
                      <p className="mt-1 truncate text-base font-semibold text-[#17233a]">{agent.fullName || agent.email}</p>
                      <p className="mt-1 truncate text-sm text-[#6b7d93]">{agent.email || 'No email saved'}</p>
                      <p className="mt-1 truncate text-xs text-[#8a98a8]">{agent.mobile || agent.phone || 'No mobile number saved'}</p>
                    </div>

                    <div className="hidden justify-center lg:flex">
                      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${
                        mapped ? 'bg-[#e9f8ef] text-[#1f7a45]' : 'bg-[#fff8ec] text-[#a16207]'
                      }`}>
                        <Link2 className="h-4 w-4" />
                      </span>
                    </div>

                    <div className="min-w-0 rounded-[12px] border border-[#e8eef5] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase text-[#6b7d93]">Property24 Agent</p>
                          <p className="mt-1 truncate text-base font-semibold text-[#17233a]">
                            {matchedAgent?.fullName || mapping.property24Name || (mapped ? `Agent ${mapping.property24AgentId}` : 'Not linked yet')}
                          </p>
                          <p className="mt-1 truncate text-sm text-[#6b7d93]">
                            {matchedAgent?.email || mapping.property24Email || 'Choose or create an agent'}
                          </p>
                        </div>
                        <StatusPill ready={mapped} label={matchLabel} />
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <Field label="Choose Property24 Agent">
                          <select
                            className={INPUT_CLASS}
                            value={mapping.property24AgentId}
                            onChange={(event) => chooseProperty24Agent(agent, event.target.value)}
                          >
                            <option value="">Select agent</option>
                            {settings.property24Agents.map((property24Agent) => (
                              <option key={property24Agent.rowId || property24Agent.property24AgentId} value={property24Agent.property24AgentId}>
                                {property24Agent.fullName || property24Agent.email || property24Agent.property24AgentId}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Source Reference">
                          <input
                            className={INPUT_CLASS}
                            value={mapping.sourceReference}
                            onChange={(event) => updateMapping(agent, { sourceReference: event.target.value, matchMethod: 'manual' })}
                            placeholder={`${settings.sourceReferencePrefix}-${agent.userId || agent.id || 'agent'}`}
                          />
                        </Field>
                      </div>

                      <div className="mt-4 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          className={SECONDARY_BUTTON_CLASS}
                          onClick={() => acceptSuggestedMapping(agent, mapping)}
                          disabled={!mapped}
                        >
                          <CheckCircle2 className="h-4 w-4" /> Accept match
                        </button>
                        <button
                          type="button"
                          className={SECONDARY_BUTTON_CLASS}
                          onClick={() => createProperty24Agent(agent, mapping)}
                          disabled={creating || !settings.agencyId || mapped}
                        >
                          <UserPlus className="h-4 w-4" /> {creating ? 'Creating...' : 'Create Property24 agent'}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <SettingsEmptyState
            title="No publishing agents found"
            description="Add agents to this organisation before mapping them to Property24."
          />
        )}
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
