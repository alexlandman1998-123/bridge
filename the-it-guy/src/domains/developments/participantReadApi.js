// Extracted read path; queries, filters, mapping and cache behaviour are preserved.
import { requireClient, isMissingSchemaError, isMissingColumnError, isMissingTableError } from '../../lib/api/shared/readHelpers.js'
import { normalizeEmailAddress } from './profileNormalization.js'
import { normalizeRoleType } from '../../core/transactions/permissions'

export const STAKEHOLDER_STATUS_VALUES = ['draft', 'invited', 'active', 'removed']

export const STAKEHOLDER_STATUS_ALIASES = {
  pending: 'invited',
  pending_assignment: 'invited',
  pending_invite: 'invited',
  pending_invitation: 'invited',
  pending_acceptance: 'invited',
  awaiting_acceptance: 'invited',
  awaiting_response: 'invited',
  invitation_pending: 'invited',
  sent: 'invited',
  requested: 'invited',
  selected: 'invited',
  not_started: 'invited',
  accepted: 'active',
  connected: 'active',
  assigned: 'active',
  consultant_assigned: 'active',
  staff_assigned: 'active',
  inactive: 'removed',
  revoked: 'removed',
  declined: 'removed',
  rejected: 'removed',
  expired: 'removed',
  cancelled: 'removed',
  canceled: 'removed',
  archived: 'removed',
  deleted: 'removed',
}

export const DEVELOPMENT_TEAM_ROLE_MAP = {
  agents: {
    roleType: 'agent',
    nameFields: ['name', 'contactName'],
    emailFields: ['email', 'contactEmail'],
    organisationFields: ['company', 'agency'],
  },
  conveyancers: {
    roleType: 'attorney',
    nameFields: ['firmName', 'name', 'contactName'],
    emailFields: ['email', 'contactEmail'],
    organisationFields: ['firmName', 'company'],
  },
  bondOriginators: {
    roleType: 'bond_originator',
    nameFields: ['name', 'contactName'],
    emailFields: ['email', 'contactEmail'],
    organisationFields: ['company', 'name'],
  },
  developers: {
    roleType: 'developer',
    nameFields: ['name', 'contactName'],
    emailFields: ['email', 'contactEmail'],
    organisationFields: ['company', 'organisation', 'organisationName'],
  },
}

export function normalizeStakeholderStatus(value, fallback = 'draft') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (STAKEHOLDER_STATUS_ALIASES[normalized]) {
    return STAKEHOLDER_STATUS_ALIASES[normalized]
  }
  return STAKEHOLDER_STATUS_VALUES.includes(normalized) ? normalized : fallback
}

export async function fetchDevelopmentParticipants(developmentId, { roleType = null } = {}) {
  const client = requireClient()
  if (!developmentId) {
    return []
  }

  const participants = await resolveDevelopmentParticipantsByIdentity(client, {
    developmentIds: [developmentId],
    roleType,
  })

  return participants.filter((row) => row.developmentId === developmentId)
}

export async function fetchAssignedDevelopmentIdsForRole({
  userId = null,
  participantEmail = '',
  roleType = 'agent',
} = {}) {
  const client = requireClient()
  const rows = await resolveDevelopmentParticipantsByIdentity(client, {
    userId,
    participantEmail,
    roleType,
  })

  return [...new Set((rows || []).map((row) => row.developmentId).filter(Boolean))]
}

export function normalizeDevelopmentParticipantRoleType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (
    ['attorney', 'conveyancer', 'transfer_conveyancer', 'buyer_attorney', 'seller_attorney', 'tuckers'].includes(
      normalized,
    )
  ) {
    return 'attorney'
  }

  if (['developer', 'internal_admin', 'agent', 'bond_originator', 'client'].includes(normalized)) {
    return normalized
  }

  return normalized
}

export function normalizeDevelopmentParticipantRow(row = {}) {
  const roleType = normalizeDevelopmentParticipantRoleType(row.role_type)
  return {
    id: row.id || null,
    developmentId: row.development_id || null,
    userId: row.user_id || null,
    roleType,
    participantName: String(row.participant_name || '').trim(),
    participantEmail: normalizeEmailAddress(row.participant_email),
    organisationName: String(row.organisation_name || '').trim(),
    isPrimary: Boolean(row.is_primary),
    assignmentSource: String(row.assignment_source || 'development_default')
      .trim()
      .toLowerCase(),
    isActive: row.is_active !== false,
  }
}

export function resolveTeamValue(item, keys = []) {
  for (const key of keys) {
    const value = String(item?.[key] || '').trim()
    if (value) {
      return value
    }
  }

  return ''
}

export function normalizeStakeholderTeamParticipant(member, teamKey) {
  const definition = DEVELOPMENT_TEAM_ROLE_MAP[teamKey]
  if (!definition || !member || typeof member !== 'object') {
    return null
  }

  const participantName = resolveTeamValue(member, definition.nameFields)
  const participantEmail = normalizeEmailAddress(resolveTeamValue(member, definition.emailFields))
  const organisationName = resolveTeamValue(member, definition.organisationFields)

  if (!participantName && !participantEmail) {
    return null
  }

  return {
    developmentId: null,
    userId: null,
    roleType: definition.roleType,
    participantName,
    participantEmail,
    organisationName,
    isPrimary: false,
    assignmentSource: 'development_default',
    isActive: true,
  }
}

export async function fetchFirmIdsForUser(client, userId = null) {
  if (!userId) {
    return []
  }

  const firmIds = new Set()

  const profileQuery = await client.from('profiles').select('id, firm_id').eq('id', userId).maybeSingle()

  if (!profileQuery.error && profileQuery.data?.firm_id) {
    firmIds.add(profileQuery.data.firm_id)
  } else if (profileQuery.error && !isMissingSchemaError(profileQuery.error)) {
    throw profileQuery.error
  }

  let membershipsQuery = await client
    .from('firm_memberships')
    .select('firm_id, status, accepted_at')
    .eq('user_id', userId)

  if (
    membershipsQuery.error &&
    (isMissingColumnError(membershipsQuery.error, 'status') ||
      isMissingColumnError(membershipsQuery.error, 'accepted_at'))
  ) {
    membershipsQuery = await client.from('firm_memberships').select('firm_id').eq('user_id', userId)
  }

  if (membershipsQuery.error) {
    if (
      isMissingTableError(membershipsQuery.error, 'firm_memberships') ||
      isMissingSchemaError(membershipsQuery.error)
    ) {
      return [...firmIds]
    }
    throw membershipsQuery.error
  }

  for (const row of membershipsQuery.data || []) {
    if (!row?.firm_id) continue
    if (row?.status && normalizeStakeholderStatus(row.status, 'active') !== 'active') continue
    firmIds.add(row.firm_id)
  }

  return [...firmIds]
}

export async function fetchDevelopmentParticipantsByIdentity(
  client,
  { userId = null, participantEmail = '', roleType = null, developmentIds = [] } = {},
) {
  const normalizedRole = roleType ? normalizeRoleType(roleType) : null
  const normalizedEmail = normalizeEmailAddress(participantEmail)
  const rows = []

  const appendRows = async (queryBuilder, { userIdFilter = null, participantEmailFilter = '' } = {}) => {
    let query = queryBuilder.select(
      'id, development_id, user_id, role_type, participant_name, participant_email, organisation_name, is_primary, assignment_source, is_active',
    )

    if (userIdFilter) {
      query = query.eq('user_id', userIdFilter)
    }
    if (participantEmailFilter) {
      query = query.eq('participant_email', participantEmailFilter)
    }
    if (developmentIds.length) {
      query = query.in('development_id', developmentIds)
    }

    let result = await query
    if (
      result.error &&
      (isMissingColumnError(result.error, 'user_id') ||
        isMissingColumnError(result.error, 'organisation_name') ||
        isMissingColumnError(result.error, 'is_primary') ||
        isMissingColumnError(result.error, 'assignment_source') ||
        isMissingColumnError(result.error, 'is_active'))
    ) {
      let fallbackQuery = queryBuilder.select('id, development_id, role_type, participant_name, participant_email')
      if (userIdFilter) {
        fallbackQuery = fallbackQuery.eq('user_id', userIdFilter)
      }
      if (participantEmailFilter) {
        fallbackQuery = fallbackQuery.eq('participant_email', participantEmailFilter)
      }
      if (developmentIds.length) {
        fallbackQuery = fallbackQuery.in('development_id', developmentIds)
      }
      result = await fallbackQuery
    }

    if (result.error) {
      if (isMissingTableError(result.error, 'development_participants') || isMissingSchemaError(result.error)) {
        return
      }
      throw result.error
    }

    rows.push(...(result.data || []).map((item) => normalizeDevelopmentParticipantRow(item)))
  }

  if (userId) {
    try {
      await appendRows(client.from('development_participants'), {
        userIdFilter: userId,
      })
    } catch (error) {
      if (!isMissingColumnError(error, 'user_id')) {
        throw error
      }
    }
  }

  if (normalizedEmail) {
    await appendRows(client.from('development_participants'), {
      participantEmailFilter: normalizedEmail,
    })
  } else if (!userId) {
    await appendRows(client.from('development_participants'))
  }

  if (userId && (!normalizedRole || normalizedRole === 'attorney')) {
    const firmIds = await fetchFirmIdsForUser(client, userId)
    if (firmIds.length) {
      let byFirmQuery = client
        .from('development_participants')
        .select(
          'id, development_id, user_id, role_type, participant_name, participant_email, organisation_name, is_primary, assignment_source, is_active',
        )
        .in('firm_id', firmIds)

      if (developmentIds.length) {
        byFirmQuery = byFirmQuery.in('development_id', developmentIds)
      }
      if (normalizedRole) {
        byFirmQuery = byFirmQuery.eq('role_type', normalizedRole)
      }

      const byFirmResult = await byFirmQuery
      if (byFirmResult.error) {
        const missingFirmColumns =
          isMissingColumnError(byFirmResult.error, 'firm_id') ||
          isMissingColumnError(byFirmResult.error, 'user_id') ||
          isMissingColumnError(byFirmResult.error, 'organisation_name') ||
          isMissingColumnError(byFirmResult.error, 'is_primary') ||
          isMissingColumnError(byFirmResult.error, 'assignment_source') ||
          isMissingColumnError(byFirmResult.error, 'is_active')
        if (
          !missingFirmColumns &&
          !isMissingTableError(byFirmResult.error, 'development_participants') &&
          !isMissingSchemaError(byFirmResult.error)
        ) {
          throw byFirmResult.error
        }
      } else {
        rows.push(...(byFirmResult.data || []).map((item) => normalizeDevelopmentParticipantRow(item)))
      }

      let configQuery = client
        .from('development_attorney_configs')
        .select(
          'development_id, attorney_firm_id, attorney_firm_name, primary_contact_name, primary_contact_email, is_active',
        )
        .in('attorney_firm_id', firmIds)

      if (developmentIds.length) {
        configQuery = configQuery.in('development_id', developmentIds)
      }

      const configResult = await configQuery
      if (!configResult.error) {
        for (const row of configResult.data || []) {
          if (!row?.development_id || row?.is_active === false) continue
          rows.push(
            normalizeDevelopmentParticipantRow({
              id: null,
              development_id: row.development_id,
              user_id: null,
              role_type: 'attorney',
              participant_name: row.primary_contact_name || row.attorney_firm_name || '',
              participant_email: normalizeEmailAddress(row.primary_contact_email) || '',
              organisation_name: row.attorney_firm_name || '',
              is_primary: true,
              assignment_source: 'development_default',
              is_active: true,
            }),
          )
        }
      } else if (
        !isMissingTableError(configResult.error, 'development_attorney_configs') &&
        !isMissingSchemaError(configResult.error)
      ) {
        throw configResult.error
      }
    }
  }

  const dedupedByKey = new Map()
  for (const row of rows) {
    if (!row.developmentId || !row.isActive) {
      continue
    }

    const comparableRole = normalizeDevelopmentParticipantRoleType(row.roleType)
    if (normalizedRole && comparableRole !== normalizedRole) {
      continue
    }

    const key = [
      row.developmentId,
      comparableRole || 'unknown',
      row.userId || '',
      row.participantEmail || '',
      row.participantName || '',
    ].join(':')

    if (!dedupedByKey.has(key)) {
      dedupedByKey.set(key, {
        ...row,
        roleType: comparableRole || row.roleType,
      })
    }
  }

  return [...dedupedByKey.values()]
}

export async function fetchFallbackDevelopmentParticipantsBySettings(
  client,
  { participantEmail = '', roleType = null, developmentIds = [] } = {},
) {
  const normalizedEmail = normalizeEmailAddress(participantEmail)
  const normalizedRole = roleType ? normalizeRoleType(roleType) : null
  const mappedTeamKeys = Object.keys(DEVELOPMENT_TEAM_ROLE_MAP).filter((teamKey) => {
    if (!normalizedRole) {
      return true
    }
    return DEVELOPMENT_TEAM_ROLE_MAP[teamKey].roleType === normalizedRole
  })

  if (!mappedTeamKeys.length) {
    return []
  }

  let settingsQuery = client.from('development_settings').select('development_id, stakeholder_teams')

  if (developmentIds.length) {
    settingsQuery = settingsQuery.in('development_id', developmentIds)
  }

  const settingsResult = await settingsQuery
  if (settingsResult.error) {
    if (
      isMissingTableError(settingsResult.error, 'development_settings') ||
      isMissingColumnError(settingsResult.error, 'stakeholder_teams') ||
      isMissingSchemaError(settingsResult.error)
    ) {
      return []
    }
    throw settingsResult.error
  }

  const fallbackRows = []
  for (const row of settingsResult.data || []) {
    const teams = row?.stakeholder_teams && typeof row.stakeholder_teams === 'object' ? row.stakeholder_teams : {}
    for (const teamKey of mappedTeamKeys) {
      const teamList = Array.isArray(teams?.[teamKey]) ? teams[teamKey] : []
      for (const member of teamList) {
        const normalizedMember = normalizeStakeholderTeamParticipant(member, teamKey)
        if (!normalizedMember) {
          continue
        }

        if (normalizedEmail && normalizedMember.participantEmail !== normalizedEmail) {
          continue
        }

        fallbackRows.push({
          ...normalizedMember,
          developmentId: row.development_id || null,
          assignmentSource: 'development_default',
        })
      }
    }
  }

  if (normalizedRole === 'attorney' || !normalizedRole) {
    let attorneyConfigQuery = client
      .from('development_attorney_configs')
      .select('development_id, attorney_firm_name, primary_contact_name, primary_contact_email, is_active')

    if (developmentIds.length) {
      attorneyConfigQuery = attorneyConfigQuery.in('development_id', developmentIds)
    }

    const attorneyResult = await attorneyConfigQuery
    if (
      !attorneyResult.error ||
      !(
        isMissingTableError(attorneyResult.error, 'development_attorney_configs') ||
        isMissingSchemaError(attorneyResult.error)
      )
    ) {
      if (attorneyResult.error) {
        throw attorneyResult.error
      }

      for (const row of attorneyResult.data || []) {
        const email = normalizeEmailAddress(row?.primary_contact_email)
        if (!email || row?.is_active === false) {
          continue
        }

        if (normalizedEmail && email !== normalizedEmail) {
          continue
        }

        fallbackRows.push({
          id: null,
          developmentId: row.development_id || null,
          userId: null,
          roleType: 'attorney',
          participantName: String(row?.primary_contact_name || row?.attorney_firm_name || '').trim(),
          participantEmail: email,
          organisationName: String(row?.attorney_firm_name || '').trim(),
          isPrimary: true,
          assignmentSource: 'development_default',
          isActive: true,
        })
      }
    }
  }

  const deduped = new Map()
  for (const row of fallbackRows) {
    if (!row.developmentId) {
      continue
    }

    const comparableRole = normalizeDevelopmentParticipantRoleType(row.roleType)
    const key = `${row.developmentId}:${comparableRole}:${row.participantEmail}`
    if (!deduped.has(key)) {
      deduped.set(key, { ...row, roleType: comparableRole })
    }
  }

  return [...deduped.values()]
}

export async function resolveDevelopmentParticipantsByIdentity(
  client,
  { userId = null, participantEmail = '', roleType = null, developmentIds = [] } = {},
) {
  const tableRows = await fetchDevelopmentParticipantsByIdentity(client, {
    userId,
    participantEmail,
    roleType,
    developmentIds,
  })

  const keyByRow = (row) =>
    [
      row.developmentId || '',
      row.roleType || '',
      row.userId || '',
      row.participantEmail || '',
      row.participantName || '',
      row.assignmentSource || '',
    ].join(':')

  const deduped = new Map(tableRows.map((row) => [keyByRow(row), row]))
  const fallbackRows = await fetchFallbackDevelopmentParticipantsBySettings(client, {
    participantEmail,
    roleType,
    developmentIds,
  })

  for (const row of fallbackRows) {
    const key = keyByRow(row)
    if (!deduped.has(key)) {
      deduped.set(key, row)
    }
  }

  return [...deduped.values()]
}
