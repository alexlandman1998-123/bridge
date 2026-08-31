import {
  Activity,
  ChevronDown,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Copy,
  Download,
  KeyRound,
  MoreHorizontal,
  PlugZap,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
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
  updateWorkflowSettings,
} from '../../lib/settingsApi'
import {
  createSuggestedProperty24AgentMappings,
  createSuggestedProperty24SourceReference,
  getCanonicalArch9AgentProfile,
  normalizeProperty24AgentRow,
  normalizeProperty24Settings,
  normalizeProperty24SettingsText,
  serializeProperty24SettingsForPersistence,
  summarizeProperty24SettingsReadiness,
} from './property24SettingsModel'
import { runProperty24OrganisationReconciliation } from '../../services/property24ReconciliationService'
import {
  downloadProperty24VettingPackMarkdown,
  runProperty24OrganisationVettingPack,
} from '../../services/property24VettingPackService'
import {
  applyProperty24LiveCutoverAction,
  fetchProperty24LiveCutover,
} from '../../services/property24LiveCutoverService'
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

function formatProperty24ApiError(payload = {}, fallback = 'Property24 agent creation failed.') {
  if (Array.isArray(payload.missingFields) && payload.missingFields.length) {
    return `Cannot create Property24 agent yet. Missing: ${payload.missingFields.join(', ')}.`
  }
  if (Array.isArray(payload.invalidFields) && payload.invalidFields.length) {
    return `Cannot create Property24 agent yet. Check: ${payload.invalidFields.join(', ')}. ${payload.message || ''}`.trim()
  }

  const response = payload.response || {}
  const sample = response.sample || {}
  const details = [
    payload.message,
    payload.errorMessage,
    sample.message,
    sample.Message,
    sample.errorMessage,
    sample.ErrorMessage,
    sample.error,
    sample.Error,
    sample.description,
    sample.Description,
    Array.isArray(sample.errors) ? sample.errors.join(', ') : '',
    Array.isArray(sample.Errors) ? sample.Errors.join(', ') : '',
    response.value,
  ].map(normalizeProperty24SettingsText).filter(Boolean)

  const uniqueDetails = [...new Set(details)]
  if (uniqueDetails.length) return uniqueDetails.join(' ')
  return fallback
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

function ConnectionToggle({ checked, onChange, disabled = false, saving = false }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border px-4 text-sm font-semibold transition ${
        checked
          ? 'border-[#0f7f4f] bg-[#0f7f4f] text-white shadow-[0_8px_16px_rgba(15,127,79,0.2)] hover:bg-[#0d6f45]'
          : 'border-[#d9e3ef] bg-white text-[#24364b] hover:bg-[#f7fafc]'
      }`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <PlugZap className={`h-4 w-4 ${saving ? 'animate-pulse' : ''}`} />
      {saving ? 'Saving...' : checked ? 'Connected' : 'Enable Property24'}
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

function SourceReferenceInput({ value, placeholder, onCommit }) {
  const [draft, setDraft] = useState(value || '')

  useEffect(() => {
    setDraft(value || '')
  }, [value])

  function commitDraft() {
    const normalizedDraft = normalizeProperty24SettingsText(draft)
    if (normalizedDraft !== normalizeProperty24SettingsText(value)) {
      onCommit(normalizedDraft)
    }
  }

  return (
    <input
      className={INPUT_CLASS}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commitDraft}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commitDraft()
          event.currentTarget.blur()
        }
      }}
      placeholder={placeholder}
    />
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

function getVettingEvidenceTone(status = '') {
  const normalized = String(status || '').toUpperCase()
  if (normalized === 'PASS') return getHealthTone('OK')
  if (['NEEDS_EVIDENCE', 'NEEDS_REVIEW'].includes(normalized)) return getHealthTone('BLOCKED')
  return getHealthTone('WARNING')
}

function HealthMetric({ label, value }) {
  return (
    <div className="rounded-[12px] border border-[#e3ebf3] bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase text-[#6b7d93]">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[#17233a]">{value}</p>
    </div>
  )
}

function Property24Logo() {
  return (
    <img src="/lead-sources/property24.png" alt="Property24" className="h-auto w-32 shrink-0 object-contain sm:w-36" />
  )
}

function ConnectionBadge({ connected }) {
  return (
    <span className={`inline-flex min-h-9 items-center gap-2 rounded-[10px] border px-3 text-sm font-semibold ${
      connected
        ? 'border-[#ccead8] bg-[#f2fbf5] text-[#1f7a45]'
        : 'border-[#f3d9a8] bg-[#fff8ec] text-[#a16207]'
    }`}>
      {connected ? <CheckCircle2 className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
      {connected ? 'Connected' : 'Not connected'}
    </span>
  )
}

function SetupStatusItem({ tone = 'neutral', icon, label, value, description }) {
  const toneClasses = {
    success: 'border-[#ccead8] bg-[#f2fbf5] text-[#1f7a45]',
    info: 'border-[#cfe0f3] bg-[#f5f9ff] text-[#27527a]',
    pending: 'border-[#f3d9a8] bg-[#fff8ec] text-[#a16207]',
    neutral: 'border-[#e3ebf3] bg-[#fbfdff] text-[#40546b]',
  }

  return (
    <div className={`flex min-h-[92px] items-start gap-3 rounded-[14px] border px-4 py-3 ${toneClasses[tone] || toneClasses.neutral}`}>
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/70">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold uppercase tracking-[0.04em] opacity-80">{label}</span>
        <span className="mt-1 block text-sm font-semibold text-[#17233a]">{value}</span>
        {description ? <span className="mt-1 block text-xs leading-5 opacity-80">{description}</span> : null}
      </span>
    </div>
  )
}

function getAgentInitials(agent = {}) {
  const source = normalizeProperty24SettingsText(agent.fullName || agent.full_name || agent.email || 'Agent')
  const parts = source.includes('@') ? [source[0]] : source.split(/\s+/).filter(Boolean)
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'A'
}

function AgentAvatar({ agent }) {
  const profile = getCanonicalArch9AgentProfile(agent)
  return (
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#eef7f2] text-sm font-semibold text-[#0f7f4f]">
      {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" /> : getAgentInitials(agent)}
    </span>
  )
}

function AgentConnectionStatus({ connected }) {
  return (
    <span className={`inline-flex items-center gap-2 text-sm font-semibold ${connected ? 'text-[#0f7f4f]' : 'text-[#b65f00]'}`}>
      <span className={`h-2 w-2 rounded-full ${connected ? 'bg-[#0f7f4f]' : 'bg-[#d97706]'}`} />
      {connected ? 'Connected' : 'Not connected'}
    </span>
  )
}

function AgentProfileReadiness({ agent }) {
  const profile = getCanonicalArch9AgentProfile(agent)
  const checks = [
    { key: 'phone', ready: Boolean(profile.phone), label: 'Phone' },
    { key: 'photo', ready: Boolean(profile.avatarUrl), label: 'Photo' },
  ]
  return (
    <span className="mt-2 flex flex-wrap gap-1.5">
      {checks.map((check) => (
        <span
          key={check.key}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${
            check.ready ? 'bg-[#eef8f2] text-[#1f7a45]' : 'bg-[#fff4e8] text-[#a15c00]'
          }`}
        >
          {check.ready ? <CheckCircle2 className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}
          {check.label} {check.ready ? 'ready' : 'missing'}
        </span>
      ))}
    </span>
  )
}

function SyncMetric({ icon, label, value, description }) {
  return (
    <div className="flex min-h-[86px] items-center gap-4 rounded-[12px] border border-[#e3ebf3] bg-[#fbfdff] px-4 py-3">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef7f2] text-[#0f7f4f]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-[#6b7d93]">{label}</span>
        <span className="mt-1 block text-xl font-semibold text-[#17233a]">{value}</span>
        <span className="mt-1 block text-xs leading-5 text-[#6b7d93]">{description}</span>
      </span>
    </div>
  )
}

function formatFriendlySyncDate(value = '') {
  if (!value) return 'Not yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not yet'
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  const time = new Intl.DateTimeFormat('en-ZA', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  if (sameDay) return `Today at ${time}`
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function SettingsProperty24Page() {
  const { refreshOrganisation } = useOrganisation()
  const { currentWorkspace } = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [healthLoading, setHealthLoading] = useState(false)
  const [reconciliationLoading, setReconciliationLoading] = useState(false)
  const [vettingPackLoading, setVettingPackLoading] = useState(false)
  const [liveCutoverLoading, setLiveCutoverLoading] = useState(false)
  const [liveCutoverAction, setLiveCutoverAction] = useState('')
  const [creatingAgentKey, setCreatingAgentKey] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [healthError, setHealthError] = useState('')
  const [reconciliationError, setReconciliationError] = useState('')
  const [vettingPackError, setVettingPackError] = useState('')
  const [liveCutoverError, setLiveCutoverError] = useState('')
  const [property24Health, setProperty24Health] = useState(null)
  const [property24Reconciliation, setProperty24Reconciliation] = useState(null)
  const [property24VettingPack, setProperty24VettingPack] = useState(null)
  const [property24LiveCutover, setProperty24LiveCutover] = useState(null)
  const [liveCutoverReason, setLiveCutoverReason] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [showAllAgents, setShowAllAgents] = useState(false)
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
        const [organisationContext, organisationUsers, sessionResult] = await Promise.all([
          fetchOrganisationSettings({ forceRefresh: true }),
          listOrganisationUsers(),
          supabase.auth.getSession(),
        ])
        if (cancelled) return
        const legacySettings = normalizeProperty24Settings(organisationContext.organisationSettings?.property24)
        let nextSettings = legacySettings
        const accessToken = sessionResult.data?.session?.access_token
        if (accessToken && organisationContext.organisation?.id) {
          try {
            const query = new URLSearchParams({
              organisationId: organisationContext.organisation.id,
              environment: legacySettings.environment,
            })
            const connectionResponse = await fetch(`/api/property24/settings/connection?${query.toString()}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            })
            const connectionPayload = await connectionResponse.json().catch(() => ({}))
            if (connectionResponse.ok && connectionPayload.connection) {
              nextSettings = normalizeProperty24Settings({
                ...legacySettings,
                enabled: connectionPayload.connection.enabled,
                agencyId: connectionPayload.connection.agencyId,
                environment: connectionPayload.connection.environment,
                lastAgentSyncAt: connectionPayload.connection.lastAgentSyncAt || legacySettings.lastAgentSyncAt,
              })
            }
          } catch {
            nextSettings = legacySettings
          }
        }
        if (cancelled) return
        setContext(organisationContext)
        setUsers(organisationUsers)
        setSettings(nextSettings)
        setSavedSettings(nextSettings)
        void loadProperty24Health({
          organisationId: organisationContext.organisation?.id,
        })
        void loadProperty24LiveCutover({
          organisationId: organisationContext.organisation?.id,
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
    () => users.filter((user) => user.email && !['inactive', 'deactivated', 'revoked', 'removed', 'archived', 'disabled'].includes(normalizeEmail(user.status || user.membershipStatus))),
    [users],
  )
  const mappingLookup = useMemo(() => createMappingLookup(settings.agentMappings), [settings.agentMappings])
  const canonicalAgentByProperty24Id = useMemo(() => {
    const candidatesByIdentity = new Map()
    agentCandidates.forEach((agent) => {
      const profile = getCanonicalArch9AgentProfile(agent)
      if (profile.userId) candidatesByIdentity.set(profile.userId, agent)
      if (profile.membershipId) candidatesByIdentity.set(profile.membershipId, agent)
    })
    return new Map(settings.agentMappings
      .map((mapping) => {
        const property24AgentId = normalizeProperty24SettingsText(mapping.property24AgentId)
        const agent = candidatesByIdentity.get(mapping.arch9UserId) || candidatesByIdentity.get(mapping.arch9MembershipId) || null
        return property24AgentId && agent ? [property24AgentId, agent] : null
      })
      .filter(Boolean))
  }, [agentCandidates, settings.agentMappings])
  const readiness = useMemo(
    () => summarizeProperty24SettingsReadiness({ settings, arch9Agents: agentCandidates }),
    [settings, agentCandidates],
  )
  const selectableProperty24Agents = useMemo(
    () => settings.property24Agents.filter((agent) => normalizeProperty24SettingsText(agent.property24AgentId)),
    [settings.property24Agents],
  )
  const property24AgentsMissingIds = useMemo(
    () => settings.property24Agents.filter((agent) => !normalizeProperty24SettingsText(agent.property24AgentId)),
    [settings.property24Agents],
  )
  const visibleAgentCandidates = showAllAgents ? agentCandidates : agentCandidates.slice(0, 6)
  const hiddenAgentCount = Math.max(agentCandidates.length - visibleAgentCandidates.length, 0)
  const dirty = JSON.stringify(settings) !== JSON.stringify(savedSettings)
  const workspaceName = currentWorkspace?.name || context?.organisation?.displayName || context?.organisation?.name || 'Organisation'
  const serverCredentialsReady = true
  const healthSummary = property24Health?.summary || {}
  const healthChecks = property24Health?.checks || []
  const reconciliationView = property24Reconciliation?.view || null
  const vettingPackView = property24VettingPack?.view || null
  const liveCutoverView = property24LiveCutover || null
  const connectionReady = Boolean(settings.enabled && settings.agencyId)
  const latestSyncAt = healthSummary.latestListingSyncAt || healthSummary.latestLeadImportAt || property24Health?.generatedAt
  const isSandboxEnvironment = settings.environment !== 'production'
  const environmentLabel = isSandboxEnvironment ? 'ExDev sandbox' : 'Production'
  const usableProperty24AgentCount = selectableProperty24Agents.length
  const sandboxAgentIdsPending = isSandboxEnvironment && property24AgentsMissingIds.length > 0
  const agentIdStatusValue = sandboxAgentIdsPending
    ? 'Agent IDs pending'
    : usableProperty24AgentCount
      ? `${usableProperty24AgentCount} usable profile${usableProperty24AgentCount === 1 ? '' : 's'}`
      : 'Sync agents to check IDs'
  const agentIdStatusDescription = sandboxAgentIdsPending
    ? 'ExDev returned agent data without usable IDs. Do not enter fake IDs.'
    : usableProperty24AgentCount
      ? 'Profiles with IDs can be connected to Arch9 agents.'
      : 'This does not block sandbox listing payload checks.'
  const agentConnectionLabel = isSandboxEnvironment && !readiness.mappingsReady
    ? 'Agent IDs pending in sandbox'
    : `${readiness.mappedCount} of ${readiness.candidateCount} agents connected`

  function updateSettings(patch) {
    setSuccess('')
    setError('')
    setSettings((current) => normalizeProperty24Settings({ ...current, ...patch }))
  }

  async function persistCanonicalProperty24Connection(nextSettings) {
    const sessionResult = await supabase.auth.getSession()
    const accessToken = sessionResult.data?.session?.access_token
    if (!accessToken) throw new Error('Sign in again before saving the Property24 connection.')
    const response = await fetch('/api/property24/settings/connection', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organisationId: context.organisation.id,
        agencyId: nextSettings.agencyId,
        environment: nextSettings.environment,
        enabled: nextSettings.enabled,
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.message || 'Unable to save the Property24 connection.')
    return payload.connection
  }

  async function applySuggestedMappings(nextProperty24Agents = settings.property24Agents) {
    const suggested = createSuggestedProperty24AgentMappings({
      arch9Agents: agentCandidates,
      property24Agents: nextProperty24Agents,
      existingMappings: settings.agentMappings,
      sourceReferencePrefix: settings.sourceReferencePrefix,
    })
    await persistProperty24Settings({
      ...settings,
      property24Agents: nextProperty24Agents,
      agentMappings: suggested,
    }, 'Auto-matched and saved Property24 agents.')
  }

  function createNextMappingsForAgent(agent, patch) {
    const agentKey = agent.userId || agent.id || agent.email
    return agentCandidates.map((candidate) => {
      const candidateKey = candidate.userId || candidate.id || candidate.email
      const existing = mappingLookup.get(candidateKey) || mappingLookup.get(normalizeEmail(candidate.email)) || {}
      const next = candidateKey === agentKey ? { ...existing, ...patch } : existing
      return toMappingPatch(candidate, next)
    })
  }

  function updateMapping(agent, patch) {
    const nextMappings = createNextMappingsForAgent(agent, patch)
    updateSettings({ agentMappings: nextMappings })
  }

  function getMappingSourceReference(agent, mapping = {}) {
    return mapping.sourceReference || createSuggestedProperty24SourceReference(agent, settings.sourceReferencePrefix)
  }

  async function persistMapping(agent, patch, successMessage) {
    const sessionResult = await supabase.auth.getSession()
    const accessToken = sessionResult.data?.session?.access_token
    if (!accessToken) throw new Error('Sign in again before saving the Property24 agent mapping.')
    const mappingResponse = await fetch('/api/property24/settings/agent-mapping', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organisationId: context.organisation.id,
        arch9UserId: agent.userId || agent.user_id || agent.id,
        arch9MembershipId: agent.id,
        property24AgentId: patch.property24AgentId || '',
        sourceReference: patch.sourceReference || '',
      }),
    })
    const mappingPayload = await mappingResponse.json().catch(() => ({}))
    if (!mappingResponse.ok) throw new Error(mappingPayload.message || 'Unable to save the canonical Property24 agent mapping.')
    const nextMappings = createNextMappingsForAgent(agent, patch)
    await persistProperty24Settings({
      ...settings,
      agentMappings: nextMappings,
    }, successMessage)
  }

  async function chooseProperty24Agent(agent, property24AgentId) {
    const property24Agent = findProperty24AgentById(settings.property24Agents, property24AgentId)
    if (property24AgentId && !property24Agent) {
      setError('That Property24 agent is missing its Property24 ID. Sync agents again or create the agent from Arch9.')
      return
    }
    const patch = {
      property24AgentId,
      property24Name: property24Agent?.fullName || '',
      property24Email: property24Agent?.email || '',
      sourceReference: property24Agent?.sourceReference || '',
      matchMethod: property24Agent ? 'manual' : 'none',
      matchStatus: property24Agent ? 'mapped' : 'unmapped',
      confidence: property24Agent ? 1 : 0,
    }
    await persistMapping(agent, patch, property24Agent ? 'Agent match saved.' : 'Agent match cleared.')
  }

  async function acceptSuggestedMapping(agent, mapping = {}) {
    await persistMapping(agent, {
      ...mapping,
      matchMethod: mapping.matchMethod === 'none' ? 'manual' : mapping.matchMethod,
      matchStatus: 'mapped',
      confidence: 1,
    }, 'Agent match accepted and saved.')
  }

  async function loadProperty24Health({ organisationId = context?.organisation?.id } = {}) {
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

  async function runProperty24Reconciliation() {
    const organisationId = context?.organisation?.id
    if (!organisationId) return
    setReconciliationLoading(true)
    setReconciliationError('')
    try {
      const result = await runProperty24OrganisationReconciliation({
        organisationId,
        includePortalChecks: true,
        limit: 25,
      })
      setProperty24Reconciliation(result)
    } catch (reconciliationFailure) {
      setReconciliationError(reconciliationFailure.message || 'Property24 reconciliation failed.')
    } finally {
      setReconciliationLoading(false)
    }
  }

  async function generateProperty24VettingPack() {
    const organisationId = context?.organisation?.id
    if (!organisationId) return
    setVettingPackLoading(true)
    setVettingPackError('')
    try {
      const result = await runProperty24OrganisationVettingPack({ organisationId })
      setProperty24VettingPack(result)
    } catch (vettingFailure) {
      setVettingPackError(vettingFailure.message || 'Property24 vetting-pack generation failed.')
    } finally {
      setVettingPackLoading(false)
    }
  }

  function downloadVettingPack() {
    try {
      downloadProperty24VettingPackMarkdown(property24VettingPack)
    } catch (downloadFailure) {
      setVettingPackError(downloadFailure.message || 'Unable to download the Property24 vetting pack.')
    }
  }

  async function loadProperty24LiveCutover({ organisationId = context?.organisation?.id } = {}) {
    if (!organisationId) return
    setLiveCutoverLoading(true)
    setLiveCutoverError('')
    try {
      const cutover = await fetchProperty24LiveCutover({ organisationId })
      setProperty24LiveCutover(cutover)
    } catch (cutoverFailure) {
      setLiveCutoverError(cutoverFailure.message || 'Unable to load Property24 production cutover.')
    } finally {
      setLiveCutoverLoading(false)
    }
  }

  async function runLiveCutoverAction(action) {
    const organisationId = context?.organisation?.id
    if (!organisationId) return
    setLiveCutoverAction(action)
    setLiveCutoverError('')
    try {
      const result = await applyProperty24LiveCutoverAction({
        organisationId,
        action,
        reason: liveCutoverReason,
        pilotListingLimit: 3,
      })
      setProperty24LiveCutover(result.cutover)
      setLiveCutoverReason('')
    } catch (cutoverFailure) {
      setLiveCutoverError(cutoverFailure.message || 'Property24 production cutover action failed.')
    } finally {
      setLiveCutoverAction('')
    }
  }

  async function createProperty24Agent(agent, mapping = {}) {
    if (!settings.agencyId || !context?.organisation?.id) {
      setError('Add the Property24 agency ID before creating agents.')
      return
    }
    const agentKey = agent.userId || agent.id || agent.email
    const sourceReference = getMappingSourceReference(agent, mapping)
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
          sourceReference,
          arch9UserId: agent.userId || agent.user_id || agent.id,
          arch9MembershipId: agent.id,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(formatProperty24ApiError(payload))
      }
      const createdAgent = normalizeProperty24AgentRow(payload.agent || {
        property24AgentId: payload.property24AgentId,
        fullName: agent.fullName,
        email: agent.email,
        mobile: agent.mobile || agent.phone,
        sourceReference,
      })
      const nextSettings = {
        ...settings,
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
            sourceReference: createdAgent.sourceReference || sourceReference,
            matchMethod: 'created',
            matchStatus: 'mapped',
            confidence: 1,
          })
        }),
        lastAgentSyncAt: new Date().toISOString(),
      }
      const photoVerified = payload.profileSync?.photo?.verified === true
      await persistProperty24Settings(
        nextSettings,
        photoVerified
          ? `Created and verified the Property24 profile, phone and photo for ${agent.fullName || agent.email}.`
          : `Property24 agent ${payload.property24AgentId} was saved, but profile verification needs attention. Sync agent profiles to retry.`,
      )
      if (Array.isArray(payload.warnings) && payload.warnings.length) {
        setError(payload.warnings.map((warning) => warning.message).filter(Boolean).join(' '))
      }
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
          existingMappings: settings.agentMappings,
          sourceReferencePrefix: settings.sourceReferencePrefix,
          applyProfileUpdates: true,
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
      const nextSettings = {
        ...settings,
        property24Agents: nextAgents,
        agentMappings: [...nextMappings, ...reviewMappings],
        lastAgentSyncAt: payload.generatedAt || new Date().toISOString(),
      }
      const profileSync = payload.profileSync || {}
      const profileSyncMessage = profileSync.applied
        ? ` Synced ${profileSync.syncedCount || 0} canonical profile${profileSync.syncedCount === 1 ? '' : 's'}; ${profileSync.partialCount || 0} partial and ${profileSync.failedCount || 0} failed.`
        : ''
      await persistProperty24Settings(nextSettings, `Synced and saved ${nextAgents.length} Property24 agents.${profileSyncMessage}`)
      const attention = (profileSync.results || [])
        .filter((result) => result.status === 'FAILED' || String(result.status || '').endsWith('_PARTIAL'))
        .map((result) => result.message || result.warnings?.map((warning) => warning.message).filter(Boolean).join(' '))
        .filter(Boolean)
      if (attention.length) setError(attention.join(' '))
    } catch (syncError) {
      setError(syncError.message || 'Property24 agent sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  async function persistProperty24Settings(nextSettings, successMessage = 'Property24 settings saved.') {
    if (!context) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const organisationSettings = context.organisationSettings || {}
      const nextProperty24 = normalizeProperty24Settings(nextSettings)
      const persistedProperty24 = serializeProperty24SettingsForPersistence(nextProperty24)
      const nextSettingsJson = {
        ...organisationSettings,
        property24: persistedProperty24,
      }
      const nextContext = {
        ...context,
        organisationSettings: nextSettingsJson,
      }
      await updateWorkflowSettings({ property24: persistedProperty24 })
      setContext(nextContext)
      setSettings(nextProperty24)
      setSavedSettings(nextProperty24)
      setSuccess(successMessage)
      await refreshOrganisation?.({ forceRefresh: true })
      void loadProperty24Health()
      return nextProperty24
    } catch (saveError) {
      setError(saveError.message || 'Unable to save Property24 settings.')
      return null
    } finally {
      setSaving(false)
    }
  }

  async function saveSettings() {
    try {
      await persistCanonicalProperty24Connection(settings)
      await persistProperty24Settings(settings)
    } catch (saveError) {
      setError(saveError.message || 'Unable to save the Property24 connection.')
    }
  }

  async function saveConnectionSetup(nextEnabled = settings.enabled) {
    const nextProperty24 = normalizeProperty24Settings({
      ...settings,
      enabled: nextEnabled,
      agencyId: settings.agencyId,
    })
    if (nextEnabled && !nextProperty24.agencyId) {
      setError('Enter the Property24 agency ID before enabling Property24.')
      return
    }
    try {
      await persistCanonicalProperty24Connection(nextProperty24)
      await persistProperty24Settings(
        nextProperty24,
        nextEnabled ? 'Property24 connection saved and enabled.' : 'Property24 connection saved.',
      )
    } catch (saveError) {
      setError(saveError.message || 'Unable to save the Property24 connection.')
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
    <div className={`${settingsPageClass} space-y-5`}>
      {error ? <SettingsBanner>{error}</SettingsBanner> : null}
      {success ? <SettingsBanner tone="success">{success}</SettingsBanner> : null}

      <section className="rounded-[16px] border border-[#e1e8ef] bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.035)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Property24Logo />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-[#17233a]">
                {connectionReady ? 'Property24 is connected' : 'Connect Property24'}
              </h2>
              {settings.agencyId ? (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-[#40546b]">
                  Agency ID {settings.agencyId}
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-[#d9e3ef] text-[#60758b] transition hover:bg-[#f7fafc]"
                    onClick={() => navigator.clipboard?.writeText(settings.agencyId)}
                    aria-label="Copy Property24 agency ID"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </p>
              ) : (
                <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Enter the agency ID Property24 gave you.</p>
              )}
            </div>
          </div>

          {connectionReady ? (
            <div className="flex flex-wrap items-center gap-3">
              <ConnectionBadge connected />
              <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={() => setAdvancedOpen(true)}>
                <Settings2 className="h-4 w-4" />
                Manage connection
              </button>
            </div>
          ) : (
            <div className="grid gap-3 sm:min-w-[360px]">
              <Field label="Property24 Agency ID">
                <input
                  className={INPUT_CLASS}
                  value={settings.agencyId}
                  onChange={(event) => updateSettings({ agencyId: event.target.value })}
                  placeholder="31382"
                />
              </Field>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className={SECONDARY_BUTTON_CLASS}
                  onClick={() => saveConnectionSetup(false)}
                  disabled={saving || !settings.agencyId}
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  className={PRIMARY_BUTTON_CLASS}
                  onClick={() => saveConnectionSetup(true)}
                  disabled={saving || !settings.agencyId}
                >
                  <PlugZap className="h-4 w-4" />
                  Enable Property24
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SetupStatusItem
          tone={connectionReady ? 'success' : 'pending'}
          icon={connectionReady ? <CheckCircle2 className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
          label="Agency"
          value={connectionReady ? 'Agency connected' : 'Connect agency first'}
          description={settings.agencyId ? `Agency ID ${settings.agencyId}` : 'Use the agency number Property24 supplied.'}
        />
        <SetupStatusItem
          tone={isSandboxEnvironment ? 'info' : 'success'}
          icon={<Activity className="h-4 w-4" />}
          label="Environment"
          value={environmentLabel}
          description={isSandboxEnvironment ? 'Safe testing mode for Property24 vetting.' : 'Live publishing mode.'}
        />
        <SetupStatusItem
          tone={serverCredentialsReady ? 'success' : 'pending'}
          icon={<KeyRound className="h-4 w-4" />}
          label="Credentials"
          value={serverCredentialsReady ? 'Credentials working' : 'Credentials needed'}
          description="Property24 login details stay server-side."
        />
        <SetupStatusItem
          tone={sandboxAgentIdsPending ? 'info' : usableProperty24AgentCount ? 'success' : 'neutral'}
          icon={sandboxAgentIdsPending ? <Clock3 className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          label="Agent IDs"
          value={agentIdStatusValue}
          description={agentIdStatusDescription}
        />
      </section>

      <section className="rounded-[16px] border border-[#e1e8ef] bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.035)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#17233a]">Connect Agents</h2>
            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
              {isSandboxEnvironment
                ? 'In ExDev, Property24 may not return usable agent IDs yet. Sync agents to check what Property24 provides, but do not enter fake IDs.'
                : 'Connect each Arch9 agent to their Property24 profile. This determines which agent listings are published under.'}
            </p>
            <p className="mt-2 text-sm leading-6 text-[#40546b]">
              Agent names, email addresses, phone numbers and photos are owned by the Arch9 Agent Profile. Property24 settings only stores the external ID and sync reference.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex min-h-10 items-center rounded-[10px] border px-3 text-sm font-semibold ${
              isSandboxEnvironment && !readiness.mappingsReady
                ? 'border-[#cfe0f3] bg-[#f5f9ff] text-[#27527a]'
                : readiness.mappingsReady
                  ? 'border-[#ccead8] bg-[#f2fbf5] text-[#1f7a45]'
                  : 'border-[#f3d9a8] bg-[#fff8ec] text-[#a16207]'
            }`}>
              {agentConnectionLabel}
            </span>
            <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={() => applySuggestedMappings()} disabled={saving}>
              <Wand2 className="h-4 w-4" />
              Auto-match agents
            </button>
          </div>
        </div>

        {property24AgentsMissingIds.length ? (
          <div className="mt-4">
            {isSandboxEnvironment ? (
              <div className="rounded-[14px] border border-[#cfe0f3] bg-[#f5f9ff] px-4 py-3 text-sm leading-6 text-[#27527a]">
                Property24 ExDev returned {property24AgentsMissingIds.length} agent{property24AgentsMissingIds.length === 1 ? '' : 's'} without a usable Property24 ID. This is a sandbox limitation, not something the agency principal must fix. Do not enter fake IDs; continue with agency and listing-payload testing while Property24 confirms the agent ID flow.
              </div>
            ) : (
              <SettingsBanner>
                Property24 returned {property24AgentsMissingIds.length} agent{property24AgentsMissingIds.length === 1 ? '' : 's'} without a Property24 ID. Those agents cannot be selected for publishing until Property24 returns an ID.
              </SettingsBanner>
            )}
          </div>
        ) : null}

        {agentCandidates.length ? (
          <div className="mt-5 overflow-visible rounded-[14px] border border-[#e3ebf3]">
            <div className="hidden grid-cols-[minmax(260px,1fr)_minmax(260px,1fr)_180px_180px] gap-4 border-b border-[#e8eef5] bg-[#fbfdff] px-4 py-3 text-xs font-semibold uppercase text-[#6b7d93] lg:grid">
              <span>Arch9 Agent</span>
              <span>Property24 Profile</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            <div className="divide-y divide-[#edf2f7]">
              {visibleAgentCandidates.map((agent) => {
                const agentKey = agent.userId || agent.id || agent.email
                const canonicalProfile = getCanonicalArch9AgentProfile(agent)
                const profileReady = Boolean(canonicalProfile.email && canonicalProfile.phone && canonicalProfile.avatarUrl)
                const mapping = mappingLookup.get(agentKey) || mappingLookup.get(normalizeEmail(agent.email)) || toMappingPatch(agent)
                const mapped = Boolean(mapping.property24AgentId)
                const matchedAgent = findProperty24AgentById(settings.property24Agents, mapping.property24AgentId)
                const missingIdCandidate = !mapped
                  ? property24AgentsMissingIds.find((property24Agent) => property24Agent.email && property24Agent.email === normalizeEmail(agent.email))
                  : null
                const creating = creatingAgentKey === agentKey

                return (
                  <div key={agentKey} className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(260px,1fr)_minmax(260px,1fr)_180px_180px] lg:items-center">
                    <div className="flex min-w-0 items-center gap-3">
                      <AgentAvatar agent={agent} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#17233a]">{agent.fullName || agent.email}</p>
                        <p className="mt-1 truncate text-sm text-[#6b7d93]">{agent.email || 'No email saved'}</p>
                        <p className="mt-1 truncate text-xs text-[#7d8da0]">{agent.phone || agent.mobile || 'No phone saved on agent profile'}</p>
                        <AgentProfileReadiness agent={agent} />
                      </div>
                    </div>

                    <div className="min-w-0">
                      <select
                        className={`${INPUT_CLASS} w-full`}
                        value={mapping.property24AgentId}
                        onChange={(event) => chooseProperty24Agent(agent, event.target.value)}
                        disabled={saving}
                        aria-label={`Choose Property24 profile for ${agent.fullName || agent.email}`}
                      >
                        <option value="">Select Property24 profile</option>
                        {selectableProperty24Agents.length ? selectableProperty24Agents.map((property24Agent) => {
                          const canonicalAgent = canonicalAgentByProperty24Id.get(property24Agent.property24AgentId)
                          const label = canonicalAgent?.fullName || property24Agent.fullName || canonicalAgent?.email || property24Agent.email || `Agent ${property24Agent.property24AgentId}`
                          const email = canonicalAgent?.email || property24Agent.email
                          return (
                            <option key={property24Agent.rowId || property24Agent.property24AgentId} value={property24Agent.property24AgentId}>
                              {label} {email ? `(${email})` : ''}
                            </option>
                          )
                        }) : (
                          <option value="" disabled>No Property24 profiles with IDs synced</option>
                        )}
                      </select>
                      {!mapped && missingIdCandidate ? (
                        <p className="mt-2 text-xs leading-5 text-[#a16207]">
                          {missingIdCandidate.fullName || missingIdCandidate.email} came back without an ID.
                        </p>
                      ) : null}
                    </div>

                    <AgentConnectionStatus connected={mapped} />

                    <div className="flex items-center gap-2 lg:justify-start">
                      <button
                        type="button"
                        className={mapped ? SECONDARY_BUTTON_CLASS : PRIMARY_BUTTON_CLASS}
                        onClick={() => {
                          if (!mapped) setError('Choose a Property24 profile from the dropdown to connect this agent.')
                        }}
                      >
                        {mapped ? 'Change' : 'Connect'}
                      </button>
                      <details className="relative">
                        <summary className="inline-flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-[10px] border border-[#d9e3ef] bg-white text-[#24364b] transition hover:bg-[#f7fafc] [&::-webkit-details-marker]:hidden">
                          <MoreHorizontal className="h-4 w-4" />
                        </summary>
                        <div className="absolute right-0 z-20 mt-2 w-[250px] rounded-[12px] border border-[#dfe8f1] bg-white p-2 shadow-[0_18px_42px_rgba(15,23,42,0.14)]">
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm font-semibold text-[#24364b] transition hover:bg-[#f7fafc] disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => createProperty24Agent(agent, mapping)}
                            disabled={creating || !settings.agencyId || mapped || !profileReady}
                            title={profileReady ? '' : 'Add a phone number and profile photo on the Arch9 Agent Profile first.'}
                          >
                            <UserPlus className="h-4 w-4" />
                            {creating ? 'Creating...' : "Can't find this agent? Create on Property24"}
                          </button>
                        </div>
                      </details>
                    </div>
                  </div>
                )
              })}
            </div>
            {hiddenAgentCount ? (
              <div className="border-t border-[#edf2f7] px-4 py-3 text-center">
                <button type="button" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0f7f4f]" onClick={() => setShowAllAgents(true)}>
                  View all {agentCandidates.length} agents
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            ) : showAllAgents && agentCandidates.length > 6 ? (
              <div className="border-t border-[#edf2f7] px-4 py-3 text-center">
                <button type="button" className="text-sm font-semibold text-[#0f7f4f]" onClick={() => setShowAllAgents(false)}>
                  Show fewer agents
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-5">
            <SettingsEmptyState
              title="No publishing agents found"
              description="Add agents to this organisation before connecting them to Property24."
            />
          </div>
        )}
      </section>

      <section className="rounded-[16px] border border-[#e1e8ef] bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.035)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#17233a]">Sync Status</h2>
            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Live overview of your Property24 activity.</p>
          </div>
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS}
            onClick={() => loadProperty24Health()}
            disabled={healthLoading}
          >
            <RefreshCw className={`h-4 w-4 ${healthLoading ? 'animate-spin' : ''}`} />
            {healthLoading ? 'Syncing...' : 'Sync now'}
          </button>
        </div>

        {healthError ? <div className="mt-4"><SettingsBanner>{healthError}</SettingsBanner></div> : null}
        {(healthSummary.failedLeadImportCount || healthSummary.failedListingSyncCount) ? (
          <div className="mt-4"><SettingsBanner>Listing sync requires attention.</SettingsBanner></div>
        ) : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <SyncMetric
            icon={<PlugZap className="h-5 w-5" />}
            label="Listings published"
            value={healthSummary.onPortalListingCount ?? 0}
            description={(healthSummary.onPortalListingCount ?? 0) ? `${healthSummary.trackedListingCount ?? 0} listings tracked` : 'No active listings on Property24'}
          />
          <SyncMetric
            icon={<UserPlus className="h-5 w-5" />}
            label="Leads imported"
            value={healthSummary.processedLeadImportCount ?? 0}
            description="Last 24 hours"
          />
          <SyncMetric
            icon={<Clock3 className="h-5 w-5" />}
            label="Last synced"
            value={formatFriendlySyncDate(latestSyncAt)}
            description="Sync running every 15 minutes"
          />
        </div>

        <div className="mt-5 rounded-[14px] border border-[#dfe8f1] bg-[#f9fbfe] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-[#17233a]">Listing reconciliation</h3>
                <span className="rounded-full border border-[#cfe0f3] bg-white px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-[#27527a]">Read only</span>
                {reconciliationView ? (
                  <span className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.05em] ${getHealthTone(reconciliationView.status)}`}>
                    {reconciliationView.status === 'OK' ? 'In sync' : 'Needs review'}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[#6b7d93]">
                Compare this agency’s Arch9 listing records with Property24. This check never publishes, edits or imports anything.
              </p>
            </div>
            <button
              type="button"
              className={SECONDARY_BUTTON_CLASS}
              onClick={runProperty24Reconciliation}
              disabled={reconciliationLoading || !connectionReady}
            >
              <RefreshCw className={`h-4 w-4 ${reconciliationLoading ? 'animate-spin' : ''}`} />
              {reconciliationLoading ? 'Comparing...' : reconciliationView ? 'Run again' : 'Compare listings'}
            </button>
          </div>

          {reconciliationError ? <div className="mt-4"><SettingsBanner>{reconciliationError}</SettingsBanner></div> : null}
          {reconciliationView ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <HealthMetric label="Arch9 tracked" value={reconciliationView.summary.trackedListings} />
                <HealthMetric label="Property24 returned" value={reconciliationView.summary.property24Listings} />
                <HealthMetric label="Matched" value={reconciliationView.summary.matchedListings} />
                <HealthMetric label="Needs review" value={reconciliationView.summary.issueCount} />
              </div>

              {reconciliationView.issues.length ? (
                <div className="overflow-hidden rounded-[12px] border border-[#e3ebf3] bg-white">
                  {reconciliationView.issues.slice(0, 8).map((issue) => (
                    <div key={issue.key} className="border-b border-[#edf2f7] px-4 py-3 last:border-0">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-[#17233a]">{issue.title}</span>
                          <span className="mt-1 block text-sm leading-5 text-[#6b7d93]">{issue.detail}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-[#fff8ec] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.04em] text-[#a16207]">
                          {issue.type.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-[#40546b]">Next: {issue.action}</p>
                    </div>
                  ))}
                  {reconciliationView.issues.length > 8 ? (
                    <div className="border-t border-[#edf2f7] px-4 py-3 text-xs font-semibold text-[#6b7d93]">
                      {reconciliationView.issues.length - 8} more item{reconciliationView.issues.length - 8 === 1 ? '' : 's'} require review.
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-[12px] border border-[#ccead8] bg-[#f2fbf5] px-4 py-3 text-sm text-[#1f7a45]">
                  Arch9 and Property24 agree for the listings returned in this check.
                </div>
              )}
              <p className="text-xs text-[#7a8ca1]">Last compared: {formatHealthDate(reconciliationView.generatedAt)}</p>
            </div>
          ) : (
            <p className="mt-4 rounded-[12px] border border-dashed border-[#d7e2ee] bg-white px-4 py-4 text-sm text-[#6b7d93]">
              Run the comparison after publishing, reassigning an agent, or changing a listing status.
            </p>
          )}
        </div>

        <div className="mt-5 rounded-[14px] border border-[#dfe8f1] bg-[#f9fbfe] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-[#17233a]">ExDev vetting pack</h3>
                <span className="rounded-full border border-[#cfe0f3] bg-white px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-[#27527a]">Phase 6</span>
                <span className="rounded-full border border-[#cfe0f3] bg-white px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-[#27527a]">Read only</span>
                {vettingPackView ? (
                  <span className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.05em] ${getHealthTone(vettingPackView.summary.blockers ? 'BLOCKED' : 'OK')}`}>
                    {vettingPackView.summary.blockers ? 'Needs evidence' : 'Ready'}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[#6b7d93]">
                Run the Property24 read checks and combine them with this agency’s redacted sync, retry and reconciliation evidence. No listing or agent is changed.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {vettingPackView ? (
                <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={downloadVettingPack}>
                  <Download className="h-4 w-4" /> Download report
                </button>
              ) : null}
              <button
                type="button"
                className={SECONDARY_BUTTON_CLASS}
                onClick={generateProperty24VettingPack}
                disabled={vettingPackLoading || !connectionReady || !isSandboxEnvironment}
                title={isSandboxEnvironment ? '' : 'The vetting pack is only available for an ExDev connection.'}
              >
                <RefreshCw className={`h-4 w-4 ${vettingPackLoading ? 'animate-spin' : ''}`} />
                {vettingPackLoading ? 'Generating...' : vettingPackView ? 'Generate again' : 'Generate pack'}
              </button>
            </div>
          </div>

          {vettingPackError ? <div className="mt-4"><SettingsBanner>{vettingPackError}</SettingsBanner></div> : null}
          {!isSandboxEnvironment ? (
            <p className="mt-4 rounded-[12px] border border-[#f3d9a8] bg-[#fff8ec] px-4 py-3 text-sm text-[#8a5710]">
              Phase 6 evidence is locked to ExDev. Production readiness uses the separate live-cutover gate.
            </p>
          ) : vettingPackView ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <HealthMetric label="Passed" value={vettingPackView.summary.passed} />
                <HealthMetric label="Manual ExDev" value={vettingPackView.summary.manual} />
                <HealthMetric label="Needs evidence" value={vettingPackView.summary.blockers} />
                <HealthMetric label="Total checks" value={vettingPackView.summary.total} />
              </div>
              <div className="overflow-hidden rounded-[12px] border border-[#e3ebf3] bg-white">
                {vettingPackView.evidence.slice(0, 12).map((item) => (
                  <div key={item.id} className="border-b border-[#edf2f7] px-4 py-3 last:border-0">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-[#17233a]">{item.label}</span>
                        {item.nextStep ? <span className="mt-1 block text-xs leading-5 text-[#60758b]">Next: {item.nextStep}</span> : null}
                      </span>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.04em] ${getVettingEvidenceTone(item.status)}`}>
                        {item.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#7a8ca1]">
                <span>Credentials, signed image URLs and image bytes are redacted.</span>
                <span>Generated: {formatHealthDate(vettingPackView.generatedAt)}</span>
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-[12px] border border-dashed border-[#d7e2ee] bg-white px-4 py-4 text-sm text-[#6b7d93]">
              Generate this after the listing, agent, update and status workflows have been exercised in ExDev.
            </p>
          )}
        </div>

        <div className="mt-5 rounded-[14px] border border-[#dfe8f1] bg-[#f9fbfe] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-[#17233a]">Production cutover</h3>
                <span className="rounded-full border border-[#cfe0f3] bg-white px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-[#27527a]">Phase 7</span>
                {liveCutoverView ? (
                  <span className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.05em] ${getHealthTone(
                    liveCutoverView.status === 'live' ? 'OK' : liveCutoverView.status === 'paused' || liveCutoverView.status === 'blocked' ? 'BLOCKED' : 'WARNING'
                  )}`}>
                    {liveCutoverView.status}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[#6b7d93]">
                Approve completed ExDev evidence, open a maximum three-listing production pilot, verify it, and only then promote the agency to live.
              </p>
            </div>
            <button
              type="button"
              className={SECONDARY_BUTTON_CLASS}
              onClick={() => loadProperty24LiveCutover()}
              disabled={liveCutoverLoading || Boolean(liveCutoverAction)}
            >
              <RefreshCw className={`h-4 w-4 ${liveCutoverLoading ? 'animate-spin' : ''}`} />
              {liveCutoverLoading ? 'Checking...' : 'Refresh gate'}
            </button>
          </div>

          {liveCutoverError ? <div className="mt-4"><SettingsBanner>{liveCutoverError}</SettingsBanner></div> : null}
          {liveCutoverView ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <HealthMetric label="Gate state" value={liveCutoverView.status} />
                <HealthMetric label="Pilot listings" value={`${liveCutoverView.evidenceSummary?.trackedListingCount || 0}/${liveCutoverView.safety?.pilotListingLimit || 3}`} />
                <HealthMetric label="On portal" value={liveCutoverView.evidenceSummary?.onPortalListingCount || 0} />
                <HealthMetric label="Recent failures" value={liveCutoverView.evidenceSummary?.failedAttemptCount || 0} />
              </div>

              <div className="overflow-hidden rounded-[12px] border border-[#e3ebf3] bg-white">
                {(liveCutoverView.checks || []).map((check) => (
                  <div key={check.key} className="flex flex-col gap-2 border-b border-[#edf2f7] px-4 py-3 last:border-0 sm:flex-row sm:items-start sm:justify-between">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[#17233a]">{check.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-[#60758b]">{check.detail}</span>
                    </span>
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.04em] ${getHealthTone(check.ready ? 'OK' : 'BLOCKED')}`}>
                      {check.ready ? 'Ready' : 'Blocked'}
                    </span>
                  </div>
                ))}
              </div>

              <div className="rounded-[12px] border border-[#f3d9a8] bg-[#fff8ec] px-4 py-3 text-sm leading-6 text-[#8a5710]">
                <span className="inline-flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" /> No bulk publishing</span>
                <p className="mt-1">Pausing stops new production writes. Existing listings are never deleted; rollback uses the listing status workflow.</p>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <label className={FIELD_CLASS}>
                  <span className={LABEL_CLASS}>Decision reason</span>
                  <textarea
                    className={`${INPUT_CLASS} min-h-20 py-3`}
                    value={liveCutoverReason}
                    onChange={(event) => setLiveCutoverReason(event.target.value)}
                    placeholder="Required: record the approval, pilot decision, promotion evidence or pause reason."
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {liveCutoverView.availableActions?.approveExDev ? (
                    <button type="button" className={SECONDARY_BUTTON_CLASS} disabled={liveCutoverReason.trim().length < 10 || Boolean(liveCutoverAction)} onClick={() => runLiveCutoverAction('approve_exdev')}>
                      {liveCutoverAction === 'approve_exdev' ? 'Checking ExDev...' : 'Approve ExDev evidence'}
                    </button>
                  ) : null}
                  {liveCutoverView.availableActions?.startPilot ? (
                    <button type="button" className={PRIMARY_BUTTON_CLASS} disabled={liveCutoverReason.trim().length < 10 || Boolean(liveCutoverAction)} onClick={() => runLiveCutoverAction('start_pilot')}>
                      {liveCutoverAction === 'start_pilot' ? 'Starting...' : 'Start 3-listing pilot'}
                    </button>
                  ) : null}
                  {liveCutoverView.availableActions?.resumePilot ? (
                    <button type="button" className={PRIMARY_BUTTON_CLASS} disabled={liveCutoverReason.trim().length < 10 || Boolean(liveCutoverAction)} onClick={() => runLiveCutoverAction('resume_pilot')}>
                      {liveCutoverAction === 'resume_pilot' ? 'Resuming...' : 'Resume pilot'}
                    </button>
                  ) : null}
                  {liveCutoverView.availableActions?.promoteLive ? (
                    <button type="button" className={PRIMARY_BUTTON_CLASS} disabled={liveCutoverReason.trim().length < 10 || Boolean(liveCutoverAction)} onClick={() => runLiveCutoverAction('promote_live')}>
                      {liveCutoverAction === 'promote_live' ? 'Verifying...' : 'Verify and promote live'}
                    </button>
                  ) : null}
                  {liveCutoverView.availableActions?.pause ? (
                    <button type="button" className={SECONDARY_BUTTON_CLASS} disabled={liveCutoverReason.trim().length < 10 || Boolean(liveCutoverAction)} onClick={() => runLiveCutoverAction('pause')}>
                      {liveCutoverAction === 'pause' ? 'Pausing...' : 'Pause production'}
                    </button>
                  ) : null}
                </div>
              </div>

              {(liveCutoverView.events || []).length ? (
                <div className="rounded-[12px] border border-[#e3ebf3] bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[#60758b]">Recent decisions</p>
                  <div className="mt-2 divide-y divide-[#edf2f7]">
                    {liveCutoverView.events.slice(0, 5).map((event) => (
                      <div key={event.id} className="py-2 text-xs leading-5 text-[#40546b]">
                        <span className="font-semibold">{String(event.action || '').replace(/_/g, ' ')}</span>
                        <span> · {event.previous_status || 'new'} → {event.next_status} · {formatHealthDate(event.created_at)}</span>
                        <p className="text-[#6b7d93]">{event.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 rounded-[12px] border border-dashed border-[#d7e2ee] bg-white px-4 py-4 text-sm text-[#6b7d93]">
              Load the cutover gate to inspect production readiness. No production write occurs during this check.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-[16px] border border-[#e1e8ef] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.035)]">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          <span className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f7fafc] text-[#24364b]">
              <Settings2 className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-base font-semibold text-[#17233a]">Advanced settings</span>
              <span className="mt-1 block text-sm leading-6 text-[#6b7d93]">Diagnostics, API settings and technical configuration.</span>
            </span>
          </span>
          <ChevronDown className={`h-5 w-5 shrink-0 text-[#60758b] transition ${advancedOpen ? 'rotate-180' : ''}`} />
        </button>

        {advancedOpen ? (
          <div className="space-y-6 border-t border-[#edf2f7] px-5 py-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <Field label="Property24 Agency ID">
                <input
                  className={INPUT_CLASS}
                  value={settings.agencyId}
                  onChange={(event) => updateSettings({ agencyId: event.target.value })}
                  placeholder="31382"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={() => saveConnectionSetup(settings.enabled)} disabled={saving || !settings.agencyId}>
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving...' : 'Save connection'}
                </button>
                <ConnectionToggle
                  checked={settings.enabled}
                  disabled={saving || (!settings.enabled && !settings.agencyId)}
                  saving={saving}
                  onChange={(enabled) => saveConnectionSetup(enabled)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Environment">
                <select className={INPUT_CLASS} value={settings.environment} onChange={(event) => updateSettings({ environment: event.target.value })}>
                  <option value="exdev">ExDev</option>
                  <option value="production">Production</option>
                </select>
              </Field>
              <Field label="Source Reference Prefix">
                <input className={INPUT_CLASS} value={settings.sourceReferencePrefix} onChange={(event) => updateSettings({ sourceReferencePrefix: event.target.value })} placeholder="ARCH9" />
              </Field>
            </div>

            <div className={`${MUTED_PANEL_CLASS} flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between`}>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#0f7f4f]">
                  <KeyRound className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#24364b]">Property24 login details stay server-side</p>
                  <p className="mt-1 text-sm leading-5 text-[#6b7d93]">Principals manage the agency number and agent links here.</p>
                </div>
              </div>
              <StatusPill ready={serverCredentialsReady} label="Server credentials configured" />
            </div>

            <SettingsSectionCard
              title="Property24 Agent Records"
              description="Read-only external identifiers. Sync copies the current Arch9 profile phone and photo to Property24 and verifies the result."
              actions={
                <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={syncProperty24Agents} disabled={syncing || saving || !settings.agencyId}>
                  <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing profiles...' : 'Sync agent profiles'}
                </button>
              }
            >
              <div className="overflow-hidden rounded-[14px] border border-[#dfe7ee]">
                <div className="grid grid-cols-[1fr_1.4fr_0.8fr_1fr] gap-4 bg-[#f7fafc] px-4 py-3 text-xs font-semibold uppercase text-[#6b7d93]">
                  <span>Agent ID</span>
                  <span>Source reference</span>
                  <span>Status</span>
                  <span>Last sync</span>
                </div>
                {settings.property24Agents.length ? settings.property24Agents.map((agent, index) => (
                  <div key={agent.rowId || index} className="grid grid-cols-[1fr_1.4fr_0.8fr_1fr] gap-4 border-t border-[#edf2f7] bg-white px-4 py-3 text-sm text-[#40546b]">
                    <span className="font-semibold text-[#17233a]">{agent.property24AgentId || 'Pending from Property24'}</span>
                    <span className="truncate">{agent.sourceReference || 'Not returned'}</span>
                    <span>{agent.status || 'Unknown'}</span>
                    <span>{formatHealthDate(agent.lastSyncedAt || settings.lastAgentSyncAt)}</span>
                  </div>
                )) : (
                  <div className="bg-white px-4 py-8 text-center text-sm text-[#6b7d93]">
                    No Property24 agents synced yet.
                  </div>
                )}
              </div>
            </SettingsSectionCard>

            <SettingsSectionCard title="Agent Mapping References" description="Technical source references used when matching Arch9 agents to Property24 profiles.">
              {agentCandidates.length ? (
                <div className="overflow-hidden rounded-[14px] border border-[#dfe7ee]">
                  <div className="grid grid-cols-[minmax(220px,1fr)_minmax(260px,1fr)] gap-4 bg-[#f7fafc] px-4 py-3 text-xs font-semibold uppercase text-[#6b7d93]">
                    <span>Arch9 Agent</span>
                    <span>Source Reference</span>
                  </div>
                  {agentCandidates.map((agent) => {
                    const agentKey = agent.userId || agent.id || agent.email
                    const mapping = mappingLookup.get(agentKey) || mappingLookup.get(normalizeEmail(agent.email)) || toMappingPatch(agent)
                    return (
                      <div key={`reference-${agentKey}`} className="grid grid-cols-[minmax(220px,1fr)_minmax(260px,1fr)] gap-4 border-t border-[#edf2f7] bg-white px-4 py-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-[#17233a]">{agent.fullName || agent.email}</span>
                          <span className="mt-1 block truncate text-xs text-[#6b7d93]">{agent.email || 'No email saved'}</span>
                        </span>
                        <SourceReferenceInput
                          value={mapping.sourceReference}
                          onCommit={(sourceReference) => updateMapping(agent, { sourceReference, matchMethod: 'manual' })}
                          placeholder={createSuggestedProperty24SourceReference(agent, settings.sourceReferencePrefix)}
                        />
                      </div>
                    )
                  })}
                </div>
              ) : (
                <SettingsEmptyState title="No agent references yet" description="Add organisation agents before editing mapping references." />
              )}
            </SettingsSectionCard>

            <SettingsSectionCard title="Diagnostics" description={`Last health check: ${formatHealthDate(property24Health?.generatedAt)}`}>
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
                  <SettingsEmptyState title="No diagnostics yet" description="Run sync status after saving setup to populate diagnostics." />
                )}
              </div>
            </SettingsSectionCard>
          </div>
        ) : null}
      </section>

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
    </div>
  )
}
