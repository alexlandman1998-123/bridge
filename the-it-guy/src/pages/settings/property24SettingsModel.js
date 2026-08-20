const AGENT_ROLE_ALIASES = new Set([
  'agent',
  'estate_agent',
  'sales_agent',
  'principal',
  'agency_principal',
  'owner',
  'branch_manager',
  'manager',
])

export const PROPERTY24_SETTINGS_DEFAULTS = {
  enabled: false,
  environment: 'exdev',
  agencyId: '',
  credentialsMode: 'server_environment',
  sourceReferencePrefix: 'ARCH9',
  defaultExpiryDays: 120,
  lastAgentSyncAt: '',
  property24Agents: [],
  agentMappings: [],
}

export function normalizeProperty24SettingsText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeProperty24SettingsText(value).toLowerCase()
}

export function normalizeProperty24SettingsEmail(value = '') {
  return normalizeLower(value)
}

function normalizePhone(value = '') {
  return normalizeProperty24SettingsText(value).replace(/[^0-9+]+/g, '')
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

export function getArch9AgentKey(agent = {}) {
  return normalizeProperty24SettingsText(agent.userId || agent.user_id || agent.id || agent.email)
}

export function isProperty24AgentCandidate(agent = {}) {
  const status = normalizeLower(agent.membershipStatus || agent.status)
  if (status === 'inactive' || status === 'archived' || status === 'disabled') return false
  const role = normalizeLower(agent.role || agent.workspaceRole || agent.workspace_role || agent.organisationRole || agent.organisation_role)
  return AGENT_ROLE_ALIASES.has(role) || Boolean(normalizeProperty24SettingsEmail(agent.email))
}

export function createSuggestedProperty24SourceReference(agent = {}, prefix = 'ARCH9') {
  const stableValue = normalizeProperty24SettingsText(agent.userId || agent.user_id || agent.id) ||
    normalizeProperty24SettingsEmail(agent.email) ||
    normalizeLower(agent.fullName || agent.full_name || agent.name).replace(/[^a-z0-9]+/g, '-')
  return `${normalizeProperty24SettingsText(prefix) || 'ARCH9'}-${stableValue}`
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .slice(0, 80)
}

export function normalizeProperty24AgentRow(row = {}) {
  const property24AgentId = normalizeProperty24SettingsText(
    row.property24AgentId || row.property24_agent_id || row.agentId || row.id || row.AgentId || row.Id,
  )
  const firstName = normalizeProperty24SettingsText(row.firstName || row.firstname || row.FirstName)
  const lastName = normalizeProperty24SettingsText(row.lastName || row.lastname || row.LastName)
  const fullName = normalizeProperty24SettingsText(row.fullName || row.name || `${firstName} ${lastName}`)
  return {
    rowId: normalizeProperty24SettingsText(row.rowId || property24AgentId || row.email || `property24-agent-${Date.now()}`),
    property24AgentId,
    sourceReference: normalizeProperty24SettingsText(row.sourceReference || row.source_reference || row.SourceReference),
    firstName,
    lastName,
    fullName,
    email: normalizeProperty24SettingsEmail(row.email || row.emailAddress || row.Email || row.EmailAddress),
    mobile: normalizePhone(row.mobile || row.mobileNumber || row.phone || row.phoneNumber || row.Mobile || row.MobileNumber),
    status: normalizeProperty24SettingsText(row.status || row.Status || 'active'),
  }
}

export function normalizeProperty24AgentMapping(row = {}) {
  return {
    arch9UserId: normalizeProperty24SettingsText(row.arch9UserId || row.arch9_user_id || row.userId || row.user_id),
    arch9MembershipId: normalizeProperty24SettingsText(row.arch9MembershipId || row.arch9_membership_id || row.membershipId || row.id),
    arch9Name: normalizeProperty24SettingsText(row.arch9Name || row.arch9_name || row.fullName || row.full_name),
    arch9Email: normalizeProperty24SettingsEmail(row.arch9Email || row.arch9_email || row.email),
    property24AgentId: normalizeProperty24SettingsText(row.property24AgentId || row.property24_agent_id || row.agentId),
    property24Name: normalizeProperty24SettingsText(row.property24Name || row.property24_name),
    property24Email: normalizeProperty24SettingsEmail(row.property24Email || row.property24_email),
    sourceReference: normalizeProperty24SettingsText(row.sourceReference || row.source_reference),
    matchMethod: normalizeProperty24SettingsText(row.matchMethod || row.match_type || 'manual'),
    matchStatus: normalizeProperty24SettingsText(row.matchStatus || row.status || 'needs_review'),
    confidence: Number(row.confidence ?? 0),
  }
}

export function normalizeProperty24Settings(settings = {}) {
  const source = isObject(settings) ? settings : {}
  return {
    ...PROPERTY24_SETTINGS_DEFAULTS,
    ...source,
    enabled: Boolean(source.enabled),
    environment: ['production', 'exdev'].includes(normalizeLower(source.environment)) ? normalizeLower(source.environment) : 'exdev',
    agencyId: normalizeProperty24SettingsText(source.agencyId || source.agency_id),
    credentialsMode: normalizeProperty24SettingsText(source.credentialsMode || source.credentials_mode || 'server_environment'),
    sourceReferencePrefix: normalizeProperty24SettingsText(source.sourceReferencePrefix || source.source_reference_prefix || 'ARCH9'),
    defaultExpiryDays: Math.max(1, Number(source.defaultExpiryDays || source.default_expiry_days || 120) || 120),
    lastAgentSyncAt: normalizeProperty24SettingsText(source.lastAgentSyncAt || source.last_agent_sync_at),
    property24Agents: toArray(source.property24Agents || source.property24_agents).map(normalizeProperty24AgentRow),
    agentMappings: toArray(source.agentMappings || source.agent_mappings).map(normalizeProperty24AgentMapping),
  }
}

function buildExternalLookups(property24Agents = []) {
  return property24Agents.reduce((lookups, agent) => {
    const normalized = normalizeProperty24AgentRow(agent)
    if (normalized.property24AgentId) lookups.byId.set(normalized.property24AgentId, normalized)
    if (normalized.email) lookups.byEmail.set(normalized.email, [...(lookups.byEmail.get(normalized.email) || []), normalized])
    if (normalized.sourceReference) lookups.bySourceReference.set(normalizeLower(normalized.sourceReference), normalized)
    return lookups
  }, { byId: new Map(), byEmail: new Map(), bySourceReference: new Map() })
}

export function createSuggestedProperty24AgentMappings({
  arch9Agents = [],
  property24Agents = [],
  existingMappings = [],
  sourceReferencePrefix = 'ARCH9',
} = {}) {
  const external = buildExternalLookups(property24Agents)
  const existingByAgent = new Map(
    existingMappings
      .map(normalizeProperty24AgentMapping)
      .filter((mapping) => mapping.arch9UserId || mapping.arch9MembershipId || mapping.arch9Email)
      .map((mapping) => [mapping.arch9UserId || mapping.arch9MembershipId || mapping.arch9Email, mapping]),
  )

  return arch9Agents
    .filter(isProperty24AgentCandidate)
    .map((agent) => {
      const agentKey = getArch9AgentKey(agent)
      const email = normalizeProperty24SettingsEmail(agent.email)
      const existing = existingByAgent.get(agentKey) || existingByAgent.get(email) || {}
      const explicit = existing.property24AgentId ? external.byId.get(existing.property24AgentId) : null
      const sourceMatch = existing.sourceReference ? external.bySourceReference.get(normalizeLower(existing.sourceReference)) : null
      const emailMatches = email ? external.byEmail.get(email) || [] : []
      const emailMatch = emailMatches.length === 1 ? emailMatches[0] : null
      const matched = explicit || sourceMatch || emailMatch || null
      const ambiguous = emailMatches.length > 1
      const sourceReference = matched?.sourceReference ||
        existing.sourceReference ||
        createSuggestedProperty24SourceReference(agent, sourceReferencePrefix)

      return normalizeProperty24AgentMapping({
        arch9UserId: normalizeProperty24SettingsText(agent.userId || agent.user_id || agent.id),
        arch9MembershipId: normalizeProperty24SettingsText(agent.id),
        arch9Name: normalizeProperty24SettingsText(agent.fullName || agent.full_name || agent.name || email),
        arch9Email: email,
        property24AgentId: matched?.property24AgentId || existing.property24AgentId || '',
        property24Name: matched?.fullName || existing.property24Name || '',
        property24Email: matched?.email || existing.property24Email || '',
        sourceReference,
        matchMethod: matched
          ? explicit ? 'manual' : sourceMatch ? 'source_reference' : 'email'
          : existing.property24AgentId ? 'manual' : 'none',
        matchStatus: matched || existing.property24AgentId ? 'mapped' : ambiguous ? 'needs_review' : 'unmapped',
        confidence: matched ? (explicit ? 1 : 0.94) : existing.property24AgentId ? 0.8 : 0,
      })
    })
}

export function summarizeProperty24SettingsReadiness({ settings = {}, arch9Agents = [] } = {}) {
  const normalized = normalizeProperty24Settings(settings)
  const candidates = arch9Agents.filter(isProperty24AgentCandidate)
  const mapped = normalized.agentMappings.filter((mapping) => normalizeProperty24SettingsText(mapping.property24AgentId))
  const accountReady = Boolean(normalized.enabled && normalized.agencyId && normalized.environment)
  const mappingsReady = candidates.length > 0 && mapped.length >= candidates.length
  return {
    accountReady,
    mappingsReady,
    ready: accountReady && mappingsReady,
    candidateCount: candidates.length,
    mappedCount: mapped.length,
    unmappedCount: Math.max(candidates.length - mapped.length, 0),
  }
}
