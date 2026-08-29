import { serializeJourneyStageOverrideForDatabase } from '../core/journey/journeyStageOverrideContract.js'
import { normalizeJourneyStageOverrideRow } from '../core/journey/journeyStageOverrideState.js'
import { supabase } from '../lib/supabaseClient.js'

let journeyStageOverridesSchemaAvailable = true

function isUnavailableJourneyStageOverridesSchema(error) {
  const code = String(error?.code || '').trim().toUpperCase()
  const message = String(error?.message || error?.details || '').toLowerCase()
  return (
    ['42P01', 'PGRST204', 'PGRST205'].includes(code) ||
    (message.includes('journey_stage_overrides') && /does not exist|schema cache|could not find/i.test(message))
  )
}

function requireClient(client = null) {
  const resolvedClient = client || supabase
  if (!resolvedClient) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_KEY to .env.')
  }
  return resolvedClient
}

function normalizeText(value) {
  return String(value || '').trim()
}

export async function fetchJourneyStageOverrides({
  entityType = '',
  entityId = '',
  organisationId = '',
  client = null,
} = {}) {
  const resolvedClient = requireClient(client)
  const normalizedEntityType = normalizeText(entityType)
  const normalizedEntityId = normalizeText(entityId)
  if (!normalizedEntityType || !normalizedEntityId || !journeyStageOverridesSchemaAvailable) return []

  let query = resolvedClient
    .from('journey_stage_overrides')
    .select(
      'id, organisation_id, entity_type, entity_id, stage_key, action_type, reason, effective_at, actor_user_id, notification_mode, metadata, supersedes_override_id, linked_activity_table, linked_activity_id, created_at',
    )
    .eq('entity_type', normalizedEntityType)
    .eq('entity_id', normalizedEntityId)
    .order('effective_at', { ascending: true })
    .order('created_at', { ascending: true })

  const normalizedOrganisationId = normalizeText(organisationId)
  if (normalizedOrganisationId) {
    query = query.eq('organisation_id', normalizedOrganisationId)
  }

  const result = await query
  if (result.error) {
    if (isUnavailableJourneyStageOverridesSchema(result.error)) {
      journeyStageOverridesSchemaAvailable = false
      return []
    }
    throw result.error
  }

  return (result.data || []).map(normalizeJourneyStageOverrideRow)
}

export async function createJourneyStageOverride(input = {}, { client = null } = {}) {
  const resolvedClient = requireClient(client)
  const serialized = serializeJourneyStageOverrideForDatabase(input)
  if (!serialized.valid) {
    const details = serialized.errors.map((error) => `${error.field}:${error.code}`).join(', ')
    throw new Error(`Journey stage override is invalid${details ? ` (${details})` : ''}.`)
  }

  const result = await resolvedClient
    .from('journey_stage_overrides')
    .insert(serialized.row)
    .select(
      'id, organisation_id, entity_type, entity_id, stage_key, action_type, reason, effective_at, actor_user_id, notification_mode, metadata, supersedes_override_id, linked_activity_table, linked_activity_id, created_at',
    )
    .single()

  if (result.error) {
    throw result.error
  }

  return normalizeJourneyStageOverrideRow(result.data)
}
