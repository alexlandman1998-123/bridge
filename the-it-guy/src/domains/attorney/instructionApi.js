// attorney owns these operations and their existing recovery behavior.
import { updateRecordByIdWithMissingColumnFallback } from '../../lib/api/shared/schemaCompatibility.js'
import { logTransactionEventIfPossible } from '../transactions/eventActions.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { fetchTransactionRowById } from '../transactions/workspaceReadApi.js'
import { normalizeNullableUuid, normalizeNullableText, requireClient, isMissingTableError, normalizeTextValue } from '../../lib/api/shared/readHelpers.js'
import { normalizeEmailAddress } from '../developments/profileNormalization.js'
import { invokeEdgeFunction } from '../../lib/supabaseClient'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { syncAttorneyIncomingInstructionStatus } from '../../services/attorneyIncomingMatterInstructionSync'
import { acceptAttorneyIncomingInstruction as acceptAttorneyIncomingInstructionService, declineAttorneyIncomingInstruction as declineAttorneyIncomingInstructionService } from '../../services/attorneyIncomingMatterInstructionActions'
import { ATTORNEY_INCOMING_INSTRUCTION_STATUSES } from '../../core/transactions/attorneyIncomingMatterContract'
import { notifyRolesForTransaction, normalizeTransactionRoleplayerRoleType, fetchTransactionRolePlayersIfPossible } from '../bond/financeRead.js'
import { prepareFirmFirstTransferRoleplayer, insertRecordWithMissingColumnFallback, propagateTransactionRoleplayersIfPossible } from '../transactions/creationApi.js'
import { normalizeTransactionRoleplayerSelection, upsertTransactionRoleplayerSelection, isTransactionSignedOtpReadyForRoleplayerReplay } from '../access/roleplayerPersistence.js'
import { fetchTransactionById } from '../transactions/detailReadApi.js'
import { getCurrentSupabaseUserId } from '../access/currentUser.js'

function normalizeAttorneyDirectoryMatterRole(value = '') {
  const normalized = normalizeTransactionRoleplayerRoleType(value)
  if (
    [
      'transfer_attorney',
      'bond_originator',
      'bond_attorney',
      'cancellation_attorney',
      'developer_contact',
      'agent',
      'other',
    ].includes(normalized)
  ) {
    return normalized
  }
  const broadRole = normalizeTextValue(value).toLowerCase()
  if (['representative', 'investor', 'estate_agent', 'estate agent'].includes(broadRole)) return 'agent'
  if (['organisation', 'organization', 'tenant', 'company', 'trust', 'compliance', 'prospect'].includes(broadRole))
    return 'other'
  return ''
}

function normalizeAttorneyDirectoryPartySelection(party = {}) {
  const roleType = normalizeAttorneyDirectoryMatterRole(party.matterRoleType || party.roleType || party.role)
  if (!roleType) return null
  const name = normalizeNullableText(party.name || party.contactPerson || party.companyName)
  const partyType = normalizeTextValue(party.type || party.partyType).toLowerCase()
  const organisationLike = ['company', 'trust', 'organisation', 'organization'].includes(partyType)
  const companyName = normalizeNullableText(
    party.companyName || party.organisationName || party.organizationName || (organisationLike ? name : ''),
  )
  const contactPerson = normalizeNullableText(party.contactPerson || (organisationLike ? '' : name) || companyName)
  const email = normalizeNullableText(party.email || party.emailAddress)?.toLowerCase() || null
  const phone = normalizeNullableText(party.phone || party.phoneNumber)

  if (!companyName && !contactPerson && !email) return null

  return {
    roleType,
    companyName,
    contactPerson,
    email,
    phone,
    selectionSource: 'manual',
    assignmentStatus: 'active',
    activationTrigger: 'immediate',
    snapshot: {
      source: 'attorney_party_directory',
      localPartyId: normalizeTextValue(party.id || party.localPartyId),
      partyDirectoryRole: normalizeTextValue(party.role),
      partyType,
      notes: normalizeNullableText(party.notes),
      matterReference: normalizeNullableText(party.matterReference),
      roleType,
      companyName,
      contactPerson,
      email,
      activationTrigger: 'immediate',
    },
  }
}

export async function reassignDeclinedTransferAttorneyInstruction({
  transactionId,
  replacement = {},
  reason = '',
  actorRole = null,
  client: providedClient = null,
} = {}) {
  const normalizedTransactionId = normalizeNullableUuid(transactionId)
  if (!normalizedTransactionId) throw new Error('Transaction is required.')

  const client = providedClient || requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  const normalizedActorRole = normalizeRoleType(actorRole || actorProfile.role || 'agent')
  if (!['agent', 'agency_admin', 'developer', 'internal_admin', 'admin'].includes(normalizedActorRole)) {
    throw new Error('Your role does not have permission to reassign the transfer attorney.')
  }

  const transaction = await fetchTransactionRowById(client, normalizedTransactionId)
  if (!transaction?.id) throw new Error('Transaction not found.')
  if (!isTransactionSignedOtpReadyForRoleplayerReplay(transaction)) {
    throw new Error('A replacement transfer instruction can only be issued after the signed OTP is received.')
  }

  const assignmentQuery = await client
    .from('transaction_attorney_assignments')
    .select('id, attorney_role, assignment_type, matter_type, instruction_status, assignment_status, status')
    .eq('transaction_id', normalizedTransactionId)
  if (assignmentQuery.error && !isMissingTableError(assignmentQuery.error, 'transaction_attorney_assignments')) {
    throw assignmentQuery.error
  }
  const declinedTransferAssignment = (assignmentQuery.data || []).find((assignment) => {
    const transfer =
      assignment.attorney_role === 'transfer_attorney' ||
      ['transfer', 'transfer_and_bond'].includes(assignment.assignment_type || assignment.matter_type)
    return (
      transfer &&
      ['declined', 'removed'].includes(
        normalizeTextValue(
          assignment.instruction_status || assignment.assignment_status || assignment.status,
        ).toLowerCase(),
      )
    )
  })
  if (!declinedTransferAssignment) {
    throw new Error('This transaction does not have a declined transfer instruction to reassign.')
  }

  const normalizedReplacement = normalizeTransactionRoleplayerSelection({
    ...replacement,
    roleType: 'transfer_attorney',
    selectionSource: 'agent_reassignment',
    assignmentStatus: 'selected',
    activationTrigger: 'appointed_firm_staff_assignment',
  })
  if (!normalizedReplacement) throw new Error('Select a valid replacement transfer attorney firm.')
  const selection = prepareFirmFirstTransferRoleplayer({
    ...normalizedReplacement,
    snapshot: {
      ...(normalizedReplacement.snapshot || {}),
      source: 'declined_transfer_firm_reassignment',
      replacementReason: normalizeNullableText(reason),
      previousAssignmentId: declinedTransferAssignment.id || null,
    },
  })

  const existingRoleplayers = await fetchTransactionRolePlayersIfPossible(client, normalizedTransactionId)
  const existingActiveTransferAttorney = existingRoleplayers.find((roleplayer) => {
    const status = normalizeTextValue(roleplayer.assignmentStatus || roleplayer.status).toLowerCase()
    return roleplayer.roleType === 'transfer_attorney' && !['removed', 'declined', 'rejected'].includes(status)
  })
  if (existingActiveTransferAttorney) {
    throw new Error('This transaction already has an open transfer attorney firm nomination.')
  }
  const sameDeclinedAttorney = existingRoleplayers.some((roleplayer) => {
    const removed = ['removed', 'declined', 'rejected'].includes(
      normalizeTextValue(roleplayer.assignmentStatus || roleplayer.status).toLowerCase(),
    )
    if (!removed || roleplayer.roleType !== 'transfer_attorney') return false
    return (
      (selection.organisationId && selection.organisationId === roleplayer.organisationId) ||
      (selection.email && selection.email === normalizeEmailAddress(roleplayer.emailAddress))
    )
  })
  if (sameDeclinedAttorney) {
    throw new Error('Choose a different transfer attorney firm from the firm that declined the instruction.')
  }

  const savedRows = await upsertTransactionRoleplayerSelection(client, {
    transactionId: normalizedTransactionId,
    selection,
    actorProfile,
  })
  if (!savedRows?.length) throw new Error('Unable to save the replacement transfer attorney.')

  const nowIso = new Date().toISOString()
  await updateRecordByIdWithMissingColumnFallback(
    client,
    'transactions',
    normalizedTransactionId,
    {
      attorney: selection.companyName || selection.contactPerson || null,
      assigned_attorney_email: null,
      current_main_stage: 'ATT',
      attorney_stage: 'instruction_sent',
      next_action:
        'Replacement transfer firm nominated. Awaiting firm acceptance and internal primary attorney assignment.',
      comment:
        normalizeNullableText(reason) ||
        'Replacement transfer attorney firm nominated after the original firm declined.',
      last_meaningful_activity_at: nowIso,
      updated_at: nowIso,
    },
    'id',
  )

  await propagateTransactionRoleplayersIfPossible(client, {
    transactionId: normalizedTransactionId,
    transaction: {
      ...transaction,
      attorney: selection.companyName || selection.contactPerson || null,
      assigned_attorney_email: null,
    },
    rolePlayers: [
      {
        roleType: 'transfer_attorney',
        selectionSource: 'agent_reassignment',
        assignmentStatus: 'selected',
        activationTrigger: 'appointed_firm_staff_assignment',
        partnerOrganisationId: selection.organisationId || null,
        partnerRelationshipId: selection.relationshipId || null,
        partnerName: selection.companyName || selection.contactPerson || null,
        contactPerson: selection.contactPerson || selection.companyName || null,
        email: selection.email || null,
        phone: selection.phone || null,
        userId: null,
        firmFirstAllocation: true,
        preferredAttorneyUserId: selection.preferredAttorneyUserId || null,
        snapshot: {
          ...(selection.snapshot || {}),
          source: 'declined_transfer_firm_reassignment',
          replacementReason: normalizeNullableText(reason),
          previousAssignmentId: declinedTransferAssignment.id || null,
        },
      },
    ],
    actorProfile,
    actorRole: normalizedActorRole,
    buyerId: transaction.buyer_id || null,
    financeType: transaction.finance_type || 'cash',
  })

  await syncAttorneyIncomingInstructionStatus(client, {
    transactionId: normalizedTransactionId,
    status: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance,
    occurredAt: nowIso,
    source: 'declined_transfer_instruction_reassignment',
  })

  if (transaction.listing_id && transaction.organisation_id) {
    await insertRecordWithMissingColumnFallback(
      client,
      'private_listing_role_players',
      {
        organisation_id: transaction.organisation_id,
        private_listing_id: transaction.listing_id,
        role_type: 'transfer_attorney',
        partner_organisation_id: selection.organisationId || null,
        company_name: selection.companyName || selection.contactPerson,
        contact_person: selection.contactPerson || selection.companyName || null,
        email_address: selection.email || null,
        phone_number: selection.phone || null,
        selection_source: 'agency_recommended',
        allocation_status: 'instructed',
        selected_by: actorProfile.userId || null,
        selected_at: nowIso,
        transaction_id: normalizedTransactionId,
        instructed_at: nowIso,
        instruction_source: 'declined_transfer_instruction_reassignment',
        metadata: {
          replacementReason: normalizeNullableText(reason),
          previousAssignmentId: declinedTransferAssignment.id || null,
          replacementSelectionSource: 'agent_reassignment',
        },
        created_at: nowIso,
        updated_at: nowIso,
      },
      'id',
    )
  }

  await logTransactionEventIfPossible(client, {
    transactionId: normalizedTransactionId,
    eventType: 'transfer_attorney_firm_renominated',
    createdBy: actorProfile.userId || null,
    createdByRole: normalizedActorRole,
    eventData: {
      source: 'declined_transfer_instruction_reassignment',
      previousAssignmentId: declinedTransferAssignment.id || null,
      replacementOrganisationId: selection.organisationId || null,
      replacementName: selection.companyName || selection.contactPerson || null,
      replacementEmail: selection.email || null,
      allocationState: 'awaiting_firm_acceptance',
      reason: normalizeNullableText(reason),
    },
  })

  try {
    await notifyRolesForTransaction(client, {
      transactionId: normalizedTransactionId,
      roleTypes: ['attorney', 'agent', 'seller'],
      title: 'Replacement transfer firm nominated',
      message: `${selection.companyName || selection.contactPerson || 'The replacement firm'} must accept the nomination and allocate a primary attorney.`,
      notificationType: 'lane_handoff',
      eventType: 'TransactionUpdated',
      eventData: {
        source: 'declined_transfer_instruction_reassignment',
        replacementName: selection.companyName || selection.contactPerson || null,
      },
      dedupePrefix: 'replacement-transfer-instruction',
      excludeUserId: actorProfile.userId || null,
    })
    await sendRoleplayerHandoffEmailForOnboarding(client, {
      transactionId: normalizedTransactionId,
    })
  } catch (notificationError) {
    console.warn('Replacement transfer instruction notification skipped', notificationError)
  }

  if (providedClient) {
    return fetchTransactionRowById(client, normalizedTransactionId)
  }
  return fetchTransactionById(normalizedTransactionId)
}

export async function saveAttorneyMatterParty({ transactionId, party = {}, actorRole = 'attorney' } = {}) {
  const normalizedTransactionId = normalizeNullableUuid(transactionId)
  if (!normalizedTransactionId)
    throw new Error('A linked matter is required before this party can be saved to the matter.')

  const selection = normalizeAttorneyDirectoryPartySelection(party)
  if (!selection) {
    throw new Error('This party role cannot be saved as a matter role-player yet.')
  }

  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  const normalizedActorRole = normalizeRoleType(actorRole || actorProfile.role || 'attorney')
  if (!['attorney', 'agency_admin', 'developer', 'internal_admin', 'admin'].includes(normalizedActorRole)) {
    throw new Error('Your role does not have permission to link parties to matters.')
  }

  const transaction = await fetchTransactionRowById(client, normalizedTransactionId)
  if (!transaction?.id) {
    throw new Error('Matter not found.')
  }

  const savedRows = await upsertTransactionRoleplayerSelection(client, {
    transactionId: normalizedTransactionId,
    selection,
    actorProfile,
  })
  if (!Array.isArray(savedRows) || !savedRows.length) {
    throw new Error(`Unable to save ${selection.roleType.replaceAll('_', ' ')} to this matter.`)
  }

  await logTransactionEventIfPossible(client, {
    transactionId: normalizedTransactionId,
    eventType: 'attorney_party_linked',
    createdBy: actorProfile.userId || null,
    createdByRole: normalizedActorRole,
    eventData: {
      source: 'attorney_party_directory',
      roleType: selection.roleType,
      partyDirectoryRole: party.role || null,
      partnerName: selection.companyName || selection.contactPerson || null,
      email: selection.email || null,
      localPartyId: party.id || party.localPartyId || null,
    },
  })

  return {
    transactionId: normalizedTransactionId,
    rolePlayerId: savedRows[0]?.id || null,
    roleType: selection.roleType,
    partnerName: selection.companyName || selection.contactPerson || '',
  }
}

export async function sendRoleplayerHandoffEmailForOnboarding(client, { transactionId } = {}) {
  const normalizedTransactionId = normalizeNullableUuid(transactionId)
  if (!normalizedTransactionId) {
    return { skipped: true, reason: 'missing_transaction' }
  }

  const { data, error } = await invokeEdgeFunction('send-email', {
    client,
    body: {
      type: 'transaction_roleplayer_handoff',
      transactionId: normalizedTransactionId,
      resend: false,
    },
  })

  if (error) throw error
  if (data?.ok === false || data?.error) {
    throw new Error(data?.error || data?.message || 'Unable to send transaction roleplayer handoff emails.')
  }
  return (
    data || {
      ok: true,
      type: 'transaction_roleplayer_handoff',
      transactionId: normalizedTransactionId,
    }
  )
}

export async function acceptAttorneyIncomingMatterInstruction({
  assignmentId = '',
  transactionId = '',
  note = '',
} = {}) {
  const client = requireClient()
  const actorUserId = await getCurrentSupabaseUserId(client)
  const result = await acceptAttorneyIncomingInstructionService(client, {
    assignmentId,
    transactionId,
    actorUserId,
    note,
    source: 'attorney_incoming_queue',
  })
  if (result?.transactionId && !result?.alreadyAccepted) {
    try {
      const transferInstructionAcceptedFallback = {
        roleTypes: ['agent', 'developer', 'seller'],
        title: 'Transfer instruction accepted',
        message: 'The transferring attorney accepted the instruction and the active transfer matter has started.',
        notificationType: 'lane_handoff',
        eventType: 'TransactionUpdated',
        eventData: {
          source: 'attorney_incoming_queue',
          decision: 'accepted',
          assignmentId: result.assignment?.id || assignmentId || null,
        },
        dedupePrefix: 'transfer-instruction-accepted',
      }
      await notifyRolesForTransaction(client, {
        transactionId: result.transactionId,
        roleTypes: result.responseNotification?.roleTypes || transferInstructionAcceptedFallback.roleTypes,
        title: result.responseNotification?.title || transferInstructionAcceptedFallback.title,
        message: result.responseNotification?.message || transferInstructionAcceptedFallback.message,
        notificationType: result.responseNotification?.notificationType || transferInstructionAcceptedFallback.notificationType,
        eventType: result.responseNotification?.eventType || transferInstructionAcceptedFallback.eventType,
        eventData: result.responseNotification?.eventData || transferInstructionAcceptedFallback.eventData,
        dedupePrefix: result.responseNotification?.dedupePrefix || transferInstructionAcceptedFallback.dedupePrefix,
        excludeUserId: actorUserId || null,
      })
    } catch (notificationError) {
      console.warn('Transfer instruction acceptance notification skipped', notificationError)
    }
  }
  return result
}

export async function declineAttorneyIncomingMatterInstruction({
  assignmentId = '',
  transactionId = '',
  reason = '',
} = {}) {
  const client = requireClient()
  const actorUserId = await getCurrentSupabaseUserId(client)
  const result = await declineAttorneyIncomingInstructionService(client, {
    assignmentId,
    transactionId,
    actorUserId,
    reason,
    source: 'attorney_incoming_queue',
  })
  if (result?.transactionId && !result?.alreadyDeclined) {
    try {
      const transferAttorneyReassignmentFallback = {
        roleTypes: ['agent', 'developer'],
        title: 'Transfer attorney reassignment required',
        message: reason
          ? `The transferring attorney declined the instruction: ${reason}`
          : 'The transferring attorney declined the instruction. Select a replacement attorney.',
        notificationType: 'lane_handoff',
        eventType: 'TransactionUpdated',
        eventData: {
          source: 'attorney_incoming_queue',
          decision: 'declined',
          reason: normalizeNullableText(reason),
          assignmentId: result.assignment?.id || assignmentId || null,
        },
        dedupePrefix: 'transfer-instruction-declined',
      }
      await notifyRolesForTransaction(client, {
        transactionId: result.transactionId,
        roleTypes: result.responseNotification?.roleTypes || transferAttorneyReassignmentFallback.roleTypes,
        title: result.responseNotification?.title || transferAttorneyReassignmentFallback.title,
        message: result.responseNotification?.message || transferAttorneyReassignmentFallback.message,
        notificationType: result.responseNotification?.notificationType || transferAttorneyReassignmentFallback.notificationType,
        eventType: result.responseNotification?.eventType || transferAttorneyReassignmentFallback.eventType,
        eventData: result.responseNotification?.eventData || transferAttorneyReassignmentFallback.eventData,
        dedupePrefix: result.responseNotification?.dedupePrefix || transferAttorneyReassignmentFallback.dedupePrefix,
        excludeUserId: actorUserId || null,
      })
    } catch (notificationError) {
      console.warn('Transfer instruction decline notification skipped', notificationError)
    }
  }
  return result
}
