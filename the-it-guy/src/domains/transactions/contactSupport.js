// transactions owns these operations and their existing recovery behavior.
import { normalizeStakeholderStatus, resolveTeamValue } from '../developments/participantReadApi.js'
import { selectWithoutKnownMissingColumns, registerKnownMissingColumns } from '../../lib/api/shared/schemaReadCompatibility.js'
import { normalizeNullableText, isMissingTableError, isMissingColumnError, isMissingSchemaError, isPermissionDeniedError, normalizeTextValue } from '../../lib/api/shared/readHelpers.js'
import { normalizeEmailAddress } from '../developments/profileNormalization.js'
import { createScopedSupabaseClient } from '../../lib/supabaseClient'
import { normalizeFinanceType } from '../../core/transactions/financeType'
import { normalizeRoleType } from '../../core/transactions/permissions'

export function requireScopedClient(headers = {}) {
  const client = createScopedSupabaseClient(headers)
  if (!client) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_KEY to .env.')
  }
  return client
}

function normalizePhoneValue(value) {
  return String(value || '').trim()
}

function resolvePhoneFromRecord(record, keys = []) {
  for (const key of keys) {
    const value = normalizePhoneValue(record?.[key])
    if (value) {
      return value
    }
  }
  return ''
}

function resolveTeamMemberPhone(member) {
  return resolvePhoneFromRecord(member, [
    'phone',
    'phone_number',
    'phoneNumber',
    'mobile',
    'mobile_number',
    'mobileNumber',
    'contactPhone',
    'contact_phone',
    'contactNumber',
    'telephone',
    'telephone_number',
  ])
}

function isRecoverableProfileLookupError(error) {
  return (
    isMissingSchemaError(error) ||
    isMissingTableError(error, 'profiles') ||
    isPermissionDeniedError(error) ||
    isMissingColumnError(error, 'phone_number') ||
    isMissingColumnError(error, 'email') ||
    isMissingColumnError(error, 'id')
  )
}

async function resolveProfileContactMap(client, { emails = [], userIds = [] } = {}) {
  const byEmail = {}
  const byUserId = {}

  const normalizedEmails = [...new Set((emails || []).map((item) => normalizeEmailAddress(item)).filter(Boolean))]
  if (normalizedEmails.length) {
    const profilesByEmailQuery = await client
      .from('profiles')
      .select('id, email, phone_number, full_name')
      .in('email', normalizedEmails)

    if (profilesByEmailQuery.error) {
      if (!isRecoverableProfileLookupError(profilesByEmailQuery.error)) {
        throw profilesByEmailQuery.error
      }
    } else {
      for (const row of profilesByEmailQuery.data || []) {
        const email = normalizeEmailAddress(row?.email)
        if (!email) continue
        byEmail[email] = {
          userId: row?.id || null,
          phone: normalizePhoneValue(row?.phone_number),
          fullName: normalizeTextValue(row?.full_name),
        }
      }
    }
  }

  const normalizedUserIds = [...new Set((userIds || []).map((item) => normalizeNullableText(item)).filter(Boolean))]
  if (normalizedUserIds.length) {
    const profilesByUserIdQuery = await client
      .from('profiles')
      .select('id, email, phone_number, full_name')
      .in('id', normalizedUserIds)

    if (profilesByUserIdQuery.error) {
      if (!isRecoverableProfileLookupError(profilesByUserIdQuery.error)) {
        throw profilesByUserIdQuery.error
      }
    } else {
      for (const row of profilesByUserIdQuery.data || []) {
        const userId = normalizeNullableText(row?.id)
        if (!userId) continue
        const mapped = {
          userId,
          email: normalizeEmailAddress(row?.email),
          phone: normalizePhoneValue(row?.phone_number),
          fullName: normalizeTextValue(row?.full_name),
        }
        byUserId[userId] = mapped
        if (mapped.email && !byEmail[mapped.email]) {
          byEmail[mapped.email] = mapped
        }
      }
    }
  }

  return { byEmail, byUserId }
}

export async function resolveTransactionWhatsAppContactsWithClient(client, transactionId) {
  const normalizedTransactionId = normalizeNullableText(transactionId)
  if (!normalizedTransactionId) {
    throw new Error('Transaction id is required.')
  }

  const transactionSelectClause =
    'id, development_id, unit_id, buyer_id, finance_type, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, owner_user_id, buyer_phone, client_phone, buyer_mobile, phone, primary_phone'
  const transactionSelectFallbackClause =
    'id, development_id, unit_id, buyer_id, finance_type, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, owner_user_id'
  const transactionSelectLegacyFallbackClause =
    'id, development_id, unit_id, buyer_id, finance_type, attorney, bond_originator'

  let transactionQuery = await client
    .from('transactions')
    .select(selectWithoutKnownMissingColumns(transactionSelectClause))
    .eq('id', normalizedTransactionId)
    .maybeSingle()

  if (transactionQuery.error && isMissingColumnError(transactionQuery.error)) {
    registerKnownMissingColumns(transactionQuery.error, [
      'assigned_agent',
      'assigned_agent_email',
      'assigned_attorney_email',
      'assigned_bond_originator_email',
      'owner_user_id',
      'buyer_phone',
      'client_phone',
      'buyer_mobile',
      'phone',
      'primary_phone',
    ])

    transactionQuery = await client
      .from('transactions')
      .select(selectWithoutKnownMissingColumns(transactionSelectClause))
      .eq('id', normalizedTransactionId)
      .maybeSingle()
  }

  if (transactionQuery.error && isMissingColumnError(transactionQuery.error)) {
    registerKnownMissingColumns(transactionQuery.error)
    transactionQuery = await client
      .from('transactions')
      .select(selectWithoutKnownMissingColumns(transactionSelectFallbackClause))
      .eq('id', normalizedTransactionId)
      .maybeSingle()
  }

  if (transactionQuery.error && isMissingColumnError(transactionQuery.error)) {
    registerKnownMissingColumns(transactionQuery.error)
    transactionQuery = await client
      .from('transactions')
      .select(transactionSelectLegacyFallbackClause)
      .eq('id', normalizedTransactionId)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    throw transactionQuery.error
  }

  const transaction = transactionQuery.data
  if (!transaction) {
    throw new Error('Transaction not found.')
  }

  let participantRows = []
  const participantRowsQuery = await client
    .from('transaction_participants')
    .select('user_id, role_type, participant_name, participant_email, status, removed_at')
    .eq('transaction_id', normalizedTransactionId)

  if (!participantRowsQuery.error) {
    participantRows = (participantRowsQuery.data || []).filter(
      (row) => !row?.removed_at && normalizeStakeholderStatus(row?.status, 'active') === 'active',
    )
  } else if (
    !isMissingSchemaError(participantRowsQuery.error) &&
    !isMissingTableError(participantRowsQuery.error, 'transaction_participants') &&
    !isPermissionDeniedError(participantRowsQuery.error)
  ) {
    throw participantRowsQuery.error
  }

  let ownerUserId = normalizeNullableText(transaction.owner_user_id)
  if (!ownerUserId) {
    const preferredOwner =
      participantRows.find((row) => normalizeRoleType(row?.role_type) === 'developer' && row?.user_id) ||
      participantRows.find((row) => normalizeRoleType(row?.role_type) === 'agent' && row?.user_id) ||
      participantRows.find((row) => row?.user_id) ||
      null
    ownerUserId = normalizeNullableText(preferredOwner?.user_id)
  }

  const [unitResult, developmentResult, buyerResult, developmentSettingsResult] = await Promise.all([
    transaction.unit_id
      ? client
          .from('units')
          .select('id, unit_number, development:developments(name)')
          .eq('id', transaction.unit_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    transaction.development_id
      ? client.from('developments').select('id, name').eq('id', transaction.development_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    transaction.buyer_id
      ? client.from('buyers').select('id, name, email, phone').eq('id', transaction.buyer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    transaction.development_id
      ? client
          .from('development_settings')
          .select('development_id, stakeholder_teams')
          .eq('development_id', transaction.development_id)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (unitResult.error && !isMissingSchemaError(unitResult.error) && !isPermissionDeniedError(unitResult.error)) {
    throw unitResult.error
  }
  if (
    developmentResult.error &&
    !isMissingSchemaError(developmentResult.error) &&
    !isPermissionDeniedError(developmentResult.error)
  ) {
    throw developmentResult.error
  }
  if (buyerResult.error && !isMissingSchemaError(buyerResult.error) && !isPermissionDeniedError(buyerResult.error)) {
    throw buyerResult.error
  }
  if (
    developmentSettingsResult.error &&
    !isMissingSchemaError(developmentSettingsResult.error) &&
    !isMissingTableError(developmentSettingsResult.error, 'development_settings') &&
    !isMissingColumnError(developmentSettingsResult.error, 'stakeholder_teams') &&
    !isPermissionDeniedError(developmentSettingsResult.error)
  ) {
    throw developmentSettingsResult.error
  }

  let attorneyConfigResult = { data: null, error: null }
  if (transaction.development_id) {
    attorneyConfigResult = await client
      .from('development_attorney_configs')
      .select('id, primary_contact_name, primary_contact_email, primary_contact_phone, is_active')
      .eq('development_id', transaction.development_id)
      .eq('is_active', true)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (
      attorneyConfigResult.error &&
      (isMissingColumnError(attorneyConfigResult.error, 'is_active') ||
        isMissingColumnError(attorneyConfigResult.error, 'primary_contact_phone'))
    ) {
      attorneyConfigResult = await client
        .from('development_attorney_configs')
        .select('id, primary_contact_name, primary_contact_email, primary_contact_phone')
        .eq('development_id', transaction.development_id)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()
    }

    if (
      attorneyConfigResult.error &&
      !isMissingSchemaError(attorneyConfigResult.error) &&
      !isMissingTableError(attorneyConfigResult.error, 'development_attorney_configs') &&
      !isMissingColumnError(attorneyConfigResult.error, 'primary_contact_phone') &&
      !isPermissionDeniedError(attorneyConfigResult.error)
    ) {
      throw attorneyConfigResult.error
    }
  }

  const unitData = unitResult.data || null
  const developmentSettings = developmentSettingsResult.data || null
  const stakeholderTeams =
    developmentSettings?.stakeholder_teams && typeof developmentSettings.stakeholder_teams === 'object'
      ? developmentSettings.stakeholder_teams
      : {}
  const agentTeamMembers = Array.isArray(stakeholderTeams?.agents) ? stakeholderTeams.agents : []
  const conveyancerTeamMembers = Array.isArray(stakeholderTeams?.conveyancers) ? stakeholderTeams.conveyancers : []
  const bondOriginatorTeamMembers = Array.isArray(stakeholderTeams?.bondOriginators)
    ? stakeholderTeams.bondOriginators
    : Array.isArray(stakeholderTeams?.bond_originators)
      ? stakeholderTeams.bond_originators
      : []

  const developmentName =
    normalizeTextValue(
      Array.isArray(unitData?.development) ? unitData?.development?.[0]?.name : unitData?.development?.name,
    ) || normalizeTextValue(developmentResult.data?.name)
  const unitNumber = normalizeTextValue(unitData?.unit_number)
  const unitReference = unitNumber ? `Unit ${unitNumber}` : normalizeTextValue(transaction.unit_id)
  const buyer = buyerResult.data || null

  const assignedAgentEmail = normalizeEmailAddress(transaction.assigned_agent_email)
  const assignedAttorneyEmail = normalizeEmailAddress(transaction.assigned_attorney_email)
  const assignedBondOriginatorEmail = normalizeEmailAddress(transaction.assigned_bond_originator_email)
  const participantUserIds = [
    ...new Set(participantRows.map((row) => normalizeNullableText(row?.user_id)).filter(Boolean)),
  ]
  const participantEmails = [
    ...new Set(participantRows.map((row) => normalizeEmailAddress(row?.participant_email)).filter(Boolean)),
  ]

  const profileContactMap = await resolveProfileContactMap(client, {
    emails: [assignedAgentEmail, assignedAttorneyEmail, assignedBondOriginatorEmail, ...participantEmails],
    userIds: [ownerUserId, ...participantUserIds],
  })

  const getParticipantByRole = (roleType) =>
    participantRows.find((row) => normalizeRoleType(row?.role_type) === normalizeRoleType(roleType))
  const resolveProfilePhoneByEmail = (emailValue) =>
    emailValue && profileContactMap.byEmail[emailValue]
      ? normalizePhoneValue(profileContactMap.byEmail[emailValue]?.phone)
      : ''
  const resolveProfilePhoneByUserId = (userIdValue) =>
    userIdValue && profileContactMap.byUserId[userIdValue]
      ? normalizePhoneValue(profileContactMap.byUserId[userIdValue]?.phone)
      : ''

  const agentParticipant = getParticipantByRole('agent')
  const attorneyParticipant = getParticipantByRole('attorney')
  const bondOriginatorParticipant = getParticipantByRole('bond_originator')
  const developerParticipant = getParticipantByRole('developer')

  const agentParticipantEmail = normalizeEmailAddress(agentParticipant?.participant_email)
  const attorneyParticipantEmail = normalizeEmailAddress(attorneyParticipant?.participant_email)
  const bondOriginatorParticipantEmail = normalizeEmailAddress(bondOriginatorParticipant?.participant_email)

  const agentMemberByEmail = agentTeamMembers.find(
    (member) => normalizeEmailAddress(resolveTeamValue(member, ['email', 'contactEmail'])) === assignedAgentEmail,
  )
  const attorneyMemberByEmail = conveyancerTeamMembers.find(
    (member) => normalizeEmailAddress(resolveTeamValue(member, ['email', 'contactEmail'])) === assignedAttorneyEmail,
  )
  const bondMemberByEmail = bondOriginatorTeamMembers.find(
    (member) =>
      normalizeEmailAddress(resolveTeamValue(member, ['email', 'contactEmail'])) === assignedBondOriginatorEmail,
  )

  const clientPhone = normalizePhoneValue(
    buyer?.phone ||
      transaction?.buyer_phone ||
      transaction?.client_phone ||
      transaction?.buyer_mobile ||
      transaction?.phone ||
      transaction?.primary_phone,
  )
  const developerPhone =
    resolveProfilePhoneByUserId(ownerUserId) ||
    resolveProfilePhoneByUserId(normalizeNullableText(developerParticipant?.user_id)) ||
    resolveProfilePhoneByEmail(normalizeEmailAddress(developerParticipant?.participant_email))
  const agentPhone =
    resolveProfilePhoneByEmail(assignedAgentEmail) ||
    resolveProfilePhoneByUserId(normalizeNullableText(agentParticipant?.user_id)) ||
    resolveProfilePhoneByEmail(agentParticipantEmail) ||
    resolveTeamMemberPhone(agentMemberByEmail) ||
    resolveTeamMemberPhone(agentTeamMembers[0])
  const attorneyPhone =
    resolveProfilePhoneByEmail(assignedAttorneyEmail) ||
    resolveProfilePhoneByUserId(normalizeNullableText(attorneyParticipant?.user_id)) ||
    resolveProfilePhoneByEmail(attorneyParticipantEmail) ||
    resolvePhoneFromRecord(attorneyConfigResult.data, ['primary_contact_phone']) ||
    resolveTeamMemberPhone(attorneyMemberByEmail) ||
    resolveTeamMemberPhone(conveyancerTeamMembers[0])
  const bondOriginatorPhone =
    resolveProfilePhoneByEmail(assignedBondOriginatorEmail) ||
    resolveProfilePhoneByUserId(normalizeNullableText(bondOriginatorParticipant?.user_id)) ||
    resolveProfilePhoneByEmail(bondOriginatorParticipantEmail) ||
    resolveTeamMemberPhone(bondMemberByEmail) ||
    resolveTeamMemberPhone(bondOriginatorTeamMembers[0])

  const resolvedContacts = {
    transactionId: normalizedTransactionId,
    financeType: normalizeFinanceType(transaction.finance_type || ''),
    developmentName,
    unitReference,
    client: {
      name: normalizeTextValue(buyer?.name),
      email: normalizeEmailAddress(buyer?.email),
      phone: clientPhone,
    },
    developer: {
      userId: ownerUserId,
      phone: developerPhone,
      fullName:
        normalizeTextValue(profileContactMap.byUserId[ownerUserId]?.fullName) ||
        normalizeTextValue(developerParticipant?.participant_name),
    },
    agent: {
      name:
        normalizeTextValue(transaction.assigned_agent) ||
        normalizeTextValue(agentParticipant?.participant_name) ||
        normalizeTextValue(resolveTeamValue(agentMemberByEmail || agentTeamMembers[0], ['name', 'contactName'])),
      email: assignedAgentEmail || agentParticipantEmail,
      phone: agentPhone,
      fullName:
        normalizeTextValue(profileContactMap.byEmail[assignedAgentEmail]?.fullName) ||
        normalizeTextValue(profileContactMap.byEmail[agentParticipantEmail]?.fullName),
    },
    attorney: {
      name:
        normalizeTextValue(transaction.attorney) ||
        normalizeTextValue(attorneyParticipant?.participant_name) ||
        normalizeTextValue(attorneyConfigResult.data?.primary_contact_name) ||
        normalizeTextValue(
          resolveTeamValue(attorneyMemberByEmail || conveyancerTeamMembers[0], ['firmName', 'name', 'contactName']),
        ),
      email:
        assignedAttorneyEmail ||
        attorneyParticipantEmail ||
        normalizeEmailAddress(attorneyConfigResult.data?.primary_contact_email),
      phone: attorneyPhone,
      fullName:
        normalizeTextValue(profileContactMap.byEmail[assignedAttorneyEmail]?.fullName) ||
        normalizeTextValue(profileContactMap.byEmail[attorneyParticipantEmail]?.fullName) ||
        normalizeTextValue(attorneyConfigResult.data?.primary_contact_name),
    },
    bondOriginator: {
      name:
        normalizeTextValue(transaction.bond_originator) ||
        normalizeTextValue(bondOriginatorParticipant?.participant_name) ||
        normalizeTextValue(
          resolveTeamValue(bondMemberByEmail || bondOriginatorTeamMembers[0], ['name', 'contactName']),
        ),
      email: assignedBondOriginatorEmail || bondOriginatorParticipantEmail,
      phone: bondOriginatorPhone,
      fullName:
        normalizeTextValue(profileContactMap.byEmail[assignedBondOriginatorEmail]?.fullName) ||
        normalizeTextValue(profileContactMap.byEmail[bondOriginatorParticipantEmail]?.fullName),
    },
    agentInvolved: Boolean(transaction.assigned_agent || assignedAgentEmail),
  }

  console.log('[WhatsApp Debug] raw contact sources', {
    transactionId: normalizedTransactionId,
    transactionRow: transaction,
    buyerRow: buyer,
    participantRows,
    developmentSettingsRow: developmentSettings,
    attorneyConfigRow: attorneyConfigResult.data || null,
    profileContactMap,
    resolvedPhones: {
      clientPhone: resolvedContacts.client.phone,
      agentPhone: resolvedContacts.agent.phone,
      developerPhone: resolvedContacts.developer.phone,
      attorneyPhone: resolvedContacts.attorney.phone,
      bondOriginatorPhone: resolvedContacts.bondOriginator.phone,
    },
    clientPhoneCandidates: {
      buyer_phone: normalizePhoneValue(buyer?.phone),
      transaction_buyer_phone: normalizePhoneValue(transaction?.buyer_phone),
      transaction_client_phone: normalizePhoneValue(transaction?.client_phone),
      transaction_buyer_mobile: normalizePhoneValue(transaction?.buyer_mobile),
      transaction_phone: normalizePhoneValue(transaction?.phone),
      transaction_primary_phone: normalizePhoneValue(transaction?.primary_phone),
    },
  })

  return resolvedContacts
}
