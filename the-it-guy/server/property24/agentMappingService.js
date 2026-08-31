import { normalizeProperty24Text } from './client.js'

const ALLOWED_MATCH_TYPES = new Set(['manual', 'explicit', 'email', 'source_reference'])

function positiveInteger(value) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

function normalizeMatchType(value = '') {
  const normalized = normalizeProperty24Text(value).toLowerCase()
  return ALLOWED_MATCH_TYPES.has(normalized) ? normalized : 'manual'
}

function mappingError(code, message, status = 400) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

export function buildCanonicalProperty24AgentMappingRow({
  organisationId,
  environment = 'exdev',
  agencyId,
  arch9UserId,
  property24AgentId,
  sourceReference,
  matchType = 'manual',
  confidence = 1,
  status = 'active',
  lastSeenAt = new Date().toISOString(),
} = {}) {
  const row = {
    organisation_id: normalizeProperty24Text(organisationId),
    environment: normalizeProperty24Text(environment).toLowerCase() === 'production' ? 'production' : 'exdev',
    agency_id: positiveInteger(agencyId),
    arch9_user_id: normalizeProperty24Text(arch9UserId) || null,
    property24_agent_id: positiveInteger(property24AgentId),
    source_reference: normalizeProperty24Text(sourceReference),
    match_type: normalizeMatchType(matchType),
    confidence: Math.min(1, Math.max(0, Number(confidence) || 0)),
    status: ['active', 'needs_review', 'inactive'].includes(normalizeProperty24Text(status).toLowerCase())
      ? normalizeProperty24Text(status).toLowerCase()
      : 'active',
    last_seen_at: lastSeenAt,
  }
  const missing = []
  if (!row.organisation_id) missing.push('organisationId')
  if (!row.agency_id) missing.push('agencyId')
  if (!row.arch9_user_id) missing.push('arch9UserId')
  if (!row.property24_agent_id) missing.push('property24AgentId')
  if (!row.source_reference) missing.push('sourceReference')
  if (missing.length) throw mappingError('property24_agent_mapping_incomplete', `Property24 agent mapping is missing: ${missing.join(', ')}.`)
  return row
}

export async function fetchCanonicalProperty24AgentMappings({
  supabase,
  organisationId,
  environment = 'exdev',
  agencyId,
  includeInactive = false,
} = {}) {
  if (!supabase?.from) throw mappingError('supabase_required', 'Supabase client is required.', 500)
  let query = supabase
    .from('property24_agent_mappings')
    .select('*')
    .eq('organisation_id', normalizeProperty24Text(organisationId))
    .eq('environment', normalizeProperty24Text(environment).toLowerCase() === 'production' ? 'production' : 'exdev')
    .eq('agency_id', positiveInteger(agencyId))
  if (!includeInactive) query = query.eq('status', 'active')
  const result = await query
  if (result.error) throw result.error
  return Array.isArray(result.data) ? result.data : []
}

export async function persistCanonicalProperty24AgentMapping({ supabase, ...input } = {}) {
  const row = buildCanonicalProperty24AgentMappingRow(input)
  const existingRows = await fetchCanonicalProperty24AgentMappings({
    supabase,
    organisationId: row.organisation_id,
    environment: row.environment,
    agencyId: row.agency_id,
    includeInactive: true,
  })
  const byUser = existingRows.find((candidate) => (
    normalizeProperty24Text(candidate.arch9_user_id) === row.arch9_user_id && candidate.status === 'active'
  )) || null
  const byProperty24Id = existingRows.find((candidate) => (
    positiveInteger(candidate.property24_agent_id) === row.property24_agent_id && candidate.status === 'active'
  )) || null

  if (byUser && byProperty24Id && byUser.id !== byProperty24Id.id) {
    throw mappingError(
      'property24_agent_mapping_collision',
      `Arch9 agent ${row.arch9_user_id} and Property24 agent ${row.property24_agent_id} are already linked to different active mappings.`,
      409,
    )
  }
  if (byProperty24Id && normalizeProperty24Text(byProperty24Id.arch9_user_id) !== row.arch9_user_id) {
    throw mappingError(
      'property24_agent_mapping_collision',
      `Property24 agent ${row.property24_agent_id} is already linked to another Arch9 agent.`,
      409,
    )
  }

  const existing = byUser || byProperty24Id || existingRows.find((candidate) => (
    normalizeProperty24Text(candidate.arch9_user_id) === row.arch9_user_id ||
    positiveInteger(candidate.property24_agent_id) === row.property24_agent_id
  )) || null
  const write = existing
    ? await supabase.from('property24_agent_mappings').update(row).eq('id', existing.id).select('*').maybeSingle()
    : await supabase.from('property24_agent_mappings').insert(row).select('*').maybeSingle()
  if (write.error) throw write.error
  if (!write.data?.id) throw mappingError('property24_agent_mapping_not_verified', 'The Property24 agent mapping write could not be verified.', 500)
  return write.data
}

export async function persistCanonicalProperty24AgentMappings({ supabase, mappings = [], ...context } = {}) {
  const saved = []
  for (const mapping of mappings) {
    saved.push(await persistCanonicalProperty24AgentMapping({ supabase, ...context, ...mapping }))
  }
  return saved
}

export async function deactivateCanonicalProperty24AgentMapping({
  supabase,
  organisationId,
  environment = 'exdev',
  agencyId,
  arch9UserId,
} = {}) {
  const userId = normalizeProperty24Text(arch9UserId)
  if (!userId) throw mappingError('arch9_agent_id_required', 'Arch9 agent ID is required.')
  const rows = await fetchCanonicalProperty24AgentMappings({
    supabase,
    organisationId,
    environment,
    agencyId,
  })
  const mapping = rows.find((row) => normalizeProperty24Text(row.arch9_user_id) === userId) || null
  if (!mapping) return null
  const result = await supabase
    .from('property24_agent_mappings')
    .update({ status: 'inactive', last_seen_at: new Date().toISOString() })
    .eq('id', mapping.id)
    .select('*')
    .maybeSingle()
  if (result.error) throw result.error
  return result.data || null
}
