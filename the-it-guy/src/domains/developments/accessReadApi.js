// Extracted without changing validation, persistence order or recovery behaviour.
import { requireClient, isMissingColumnError, isMissingSchemaError, isPermissionDeniedError, isMissingTableError } from '../../lib/api/shared/readHelpers.js'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { normalizeEmailAddress } from './profileNormalization.js'

export async function fetchDeveloperAccessOptions() {
  const client = requireClient()
  const options = []

  let profilesQuery = await client
    .from('profiles')
    .select('id, email, full_name, name, company, role')
    .order('full_name', { ascending: true })

  if (
    profilesQuery.error &&
    (isMissingColumnError(profilesQuery.error, 'full_name') ||
      isMissingColumnError(profilesQuery.error, 'name') ||
      isMissingColumnError(profilesQuery.error, 'company') ||
      isMissingColumnError(profilesQuery.error, 'role'))
  ) {
    profilesQuery = await client.from('profiles').select('id, email, name, role').order('name', { ascending: true })
  }

  if (
    profilesQuery.error &&
    (isMissingColumnError(profilesQuery.error, 'name') || isMissingColumnError(profilesQuery.error, 'role'))
  ) {
    profilesQuery = await client.from('profiles').select('id, email')
  }

  if (!profilesQuery.error) {
    for (const row of profilesQuery.data || []) {
      const role = normalizeRoleType(row?.role)
      if (row?.role && role !== 'developer') {
        continue
      }

      const email = normalizeEmailAddress(row?.email)
      const name = String(row?.full_name || row?.name || email || 'Developer').trim()
      const company = String(row?.company || '').trim()
      options.push({
        id: String(row?.id || email || '').trim(),
        userId: row?.id || null,
        email,
        name,
        company,
      })
    }
  } else if (!isMissingSchemaError(profilesQuery.error) && !isPermissionDeniedError(profilesQuery.error)) {
    throw profilesQuery.error
  }

  const participantQuery = await client
    .from('development_participants')
    .select('user_id, participant_name, participant_email, organisation_name, role_type')
    .eq('role_type', 'developer')

  if (!participantQuery.error) {
    for (const row of participantQuery.data || []) {
      const email = normalizeEmailAddress(row?.participant_email)
      const name = String(row?.participant_name || email || 'Developer').trim()
      const company = String(row?.organisation_name || '').trim()
      const id = String(row?.user_id || email || '').trim()
      if (!id) continue
      options.push({
        id,
        userId: row?.user_id || null,
        email,
        name,
        company,
      })
    }
  } else if (
    !isMissingSchemaError(participantQuery.error) &&
    !isMissingTableError(participantQuery.error, 'development_participants') &&
    !isPermissionDeniedError(participantQuery.error)
  ) {
    throw participantQuery.error
  }

  const deduped = new Map()
  for (const option of options) {
    const key = String(option.userId || option.email || option.id || '')
      .trim()
      .toLowerCase()
    if (!key) continue
    if (!deduped.has(key)) {
      deduped.set(key, option)
    }
  }

  return [...deduped.values()].sort((left, right) => {
    const byName = String(left.name || '').localeCompare(String(right.name || ''), undefined, {
      sensitivity: 'base',
    })
    if (byName !== 0) return byName
    return String(left.email || '').localeCompare(String(right.email || ''), undefined, {
      sensitivity: 'base',
    })
  })
}
