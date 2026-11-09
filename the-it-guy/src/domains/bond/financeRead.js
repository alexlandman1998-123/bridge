// bond owns these operations and their existing recovery behavior.
import { resolveProfileIdsByEmail } from '../developments/configurationActions.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { normalizeStakeholderStatus } from '../developments/participantReadApi.js'
import { normalizeEventType } from '../transactions/activityReadApi.js'
import { normalizeNullableText, requireClient, isMissingTableError, isMissingColumnError, isMissingSchemaError, isPermissionDeniedError, normalizeTextValue } from '../../lib/api/shared/readHelpers.js'
import { normalizeBondHybridWorkflowRow, normalizeBondInstructionRow } from '../transactions/summaryReadApi.js'
import { isBondFinanceType } from '../../core/transactions/financeType'
import { BOND_HYBRID_APPLICATION_STATUS_LABELS, BOND_HYBRID_FINANCE_WORKFLOW_TYPE, BOND_HYBRID_QUOTE_STATUS_LABELS, buildBondHybridFinanceStageSteps, getBondHybridFinanceStageLabel, normalizeBondHybridApplicationStatus, normalizeBondHybridFinanceStage, normalizeBondHybridQuoteStatus, summarizeBondHybridFinanceWorkflow } from '../../core/transactions/bondHybridFinanceWorkflow'
import { BOND_APPLICATION_STATUSES } from '../../modules/bond/application/index.js'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { readMatterConversation } from '../../services/matterConversationService.js'
import { loadWorkflowEvidenceMapper, isMissingFunctionError, normalizeNotificationType, TRANSACTION_DISCUSSION_COLUMNS, TRANSACTION_DISCUSSION_LEGACY_COLUMNS, normalizeDiscussionVisibility, normalizeTransactionCommentRow, createTransactionNotificationIfPossible } from '../transactions/participantInfrastructure.js'

function normalizeLegacyNoteAsDiscussionRow(note, transactionId, visibility = 'internal') {
  return normalizeTransactionCommentRow(
    {
      id: note?.id || null,
      transaction_id: note?.transaction_id || transactionId || null,
      author_name: 'Samlin Team',
      author_role: 'developer',
      comment_text: note?.body || '',
      created_at: note?.created_at || null,
    },
    {
      visibility,
      discussionType: 'operational',
    },
  )
}

function filterDiscussionRowsByViewer(discussion, viewer = 'internal') {
  if (viewer === 'internal') {
    return discussion
  }

  return discussion.filter((item) => {
    const visibility = normalizeDiscussionVisibility(item.visibility)
    if (viewer === 'client') {
      return visibility === 'client_safe'
    }
    return visibility !== 'internal'
  })
}

export async function processWorkflowEvidenceIfPossible(client, payload = {}) {
  if (!payload?.transactionId || !payload?.evidenceKey) {
    return null
  }

  try {
    const { processWorkflowEvidence } = await loadWorkflowEvidenceMapper()
    return await processWorkflowEvidence({
      ...payload,
      client,
    })
  } catch (error) {
    if (
      isMissingTableError(error, 'transaction_workflow_instances') ||
      isMissingTableError(error, 'transaction_workflow_steps') ||
      isMissingTableError(error, 'transaction_workflow_evidence') ||
      isMissingTableError(error, 'transaction_rollups') ||
      isMissingTableError(error, 'transaction_workflow_events') ||
      isMissingSchemaError(error)
    ) {
      console.warn('[workflow-evidence] canonical workflow schema unavailable, skipping evidence processing', {
        transactionId: payload.transactionId,
        evidenceKey: payload.evidenceKey,
        error: error?.message || String(error),
      })
      return null
    }
    throw error
  }
}

function normalizeBondApplicationRow(row = {}, profileById = {}) {
  if (!row) return null
  const createdBy = row.created_by || null
  const updatedBy = row.updated_by || null
  const submittedBy = row.submitted_by || null
  return {
    id: row.id,
    transactionId: row.transaction_id,
    workflowId: row.workflow_id,
    applicationType: row.application_type || 'bank_application',
    bankName: row.bank_name || '',
    status: normalizeBondHybridApplicationStatus(row.status),
    statusLabel: BOND_HYBRID_APPLICATION_STATUS_LABELS[normalizeBondHybridApplicationStatus(row.status)] || 'Pending',
    submittedAt: row.submitted_at || null,
    feedbackReceivedAt: row.feedback_received_at || null,
    referenceNumber: row.reference_number || '',
    applicationReference: row.application_reference || row.reference_number || '',
    bondOriginatorId: row.bond_originator_id || null,
    originatorOrganisationId: row.originator_organisation_id || null,
    notes: row.notes || '',
    submittedBy,
    submittedByName: submittedBy
      ? profileById[submittedBy]?.full_name || profileById[submittedBy]?.email || null
      : null,
    createdBy,
    createdByName: createdBy ? profileById[createdBy]?.full_name || profileById[createdBy]?.email || null : null,
    updatedBy,
    updatedByName: updatedBy ? profileById[updatedBy]?.full_name || profileById[updatedBy]?.email || null : null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function normalizeBondQuoteRow(row = {}, profileById = {}) {
  if (!row) return null
  const quoteStatus = normalizeBondHybridQuoteStatus(row.quote_status)
  const createdBy = row.created_by || null
  const updatedBy = row.updated_by || null
  const uploadedBy = row.uploaded_by || null
  return {
    id: row.id,
    transactionId: row.transaction_id,
    workflowId: row.workflow_id,
    bondApplicationId: row.bond_application_id || null,
    bankName: row.bank_name || '',
    quotedAmount: row.quoted_amount === null || row.quoted_amount === undefined ? null : Number(row.quoted_amount),
    interestRate: row.interest_rate === null || row.interest_rate === undefined ? null : Number(row.interest_rate),
    interestRateType: row.interest_rate_type || null,
    interestRateMargin:
      row.interest_rate_margin === null || row.interest_rate_margin === undefined
        ? null
        : Number(row.interest_rate_margin),
    interestRateDisplay: row.interest_rate_display || null,
    monthlyRepayment:
      row.monthly_repayment === null || row.monthly_repayment === undefined ? null : Number(row.monthly_repayment),
    termMonths: row.term_months === null || row.term_months === undefined ? null : Number(row.term_months),
    quoteStatus,
    quoteStatusLabel: BOND_HYBRID_QUOTE_STATUS_LABELS[quoteStatus] || 'Received',
    quoteReceivedAt: row.quote_received_at || null,
    quoteExpiryAt: row.quote_expiry_at || null,
    validUntil: row.valid_until || null,
    approvedAt: row.approved_at || null,
    quoteDocumentId: row.quote_document_id || null,
    notes: row.notes || '',
    uploadedBy,
    uploadedByName: uploadedBy ? profileById[uploadedBy]?.full_name || profileById[uploadedBy]?.email || null : null,
    createdBy,
    createdByName: createdBy ? profileById[createdBy]?.full_name || profileById[createdBy]?.email || null : null,
    updatedBy,
    updatedByName: updatedBy ? profileById[updatedBy]?.full_name || profileById[updatedBy]?.email || null : null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function normalizeBondOfferDecisionRow(row = {}, profileById = {}) {
  if (!row) return null
  const decidedBy = row.decided_by || null
  return {
    id: row.id,
    transactionId: row.transaction_id,
    bondOfferId: row.bond_offer_id || null,
    decision:
      String(row.decision || '')
        .trim()
        .toLowerCase() || 'declined',
    decidedBy,
    decidedByRole: row.decided_by_role || null,
    supersededAt: row.superseded_at || null,
    decidedByName: decidedBy ? profileById[decidedBy]?.full_name || profileById[decidedBy]?.email || null : null,
    decisionAt: row.decision_at || row.created_at || null,
    notes: row.notes || '',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function normalizeBondBankOutcomeRow(row = {}, profileById = {}) {
  if (!row) return null
  const recordedBy = row.recorded_by || null
  return {
    id: row.id,
    transactionId: row.transaction_id || null,
    workflowId: row.workflow_id || null,
    bondApplicationId: row.bond_application_id || null,
    bankName: row.bank_name || '',
    outcome: row.outcome || 'feedback_received',
    outcomeAt: row.outcome_at || row.created_at || null,
    approvedAmount: row.approved_amount ?? null,
    conditions: row.conditions || '',
    declineReason: row.decline_reason || '',
    notes: row.notes || '',
    recordedBy,
    recordedByName: recordedBy ? profileById[recordedBy]?.full_name || profileById[recordedBy]?.email || null : null,
    createdAt: row.created_at || null,
  }
}

export function normalizeBondHybridWorkflowEventRow(row = {}, profileById = {}) {
  if (!row) return null
  const createdBy = row.created_by || null
  return {
    id: row.id,
    workflowId: row.workflow_id,
    fromStage: row.from_stage || null,
    fromStageLabel: row.from_stage ? getBondHybridFinanceStageLabel(row.from_stage) : null,
    toStage: normalizeBondHybridFinanceStage(row.to_stage),
    toStageLabel: getBondHybridFinanceStageLabel(row.to_stage),
    eventType: row.event_type || 'stage_changed',
    notes: row.notes || '',
    createdBy,
    createdByName: createdBy ? profileById[createdBy]?.full_name || profileById[createdBy]?.email || null : null,
    createdAt: row.created_at || null,
  }
}

async function fetchProfilesByIds(client, ids = []) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))]
  if (!uniqueIds.length) return {}

  const query = await client
    .from('profiles')
    .select('id, email, full_name, first_name, last_name, role')
    .in('id', uniqueIds)

  if (query.error) {
    if (
      isMissingTableError(query.error, 'profiles') ||
      isMissingSchemaError(query.error) ||
      isPermissionDeniedError(query.error)
    ) {
      return {}
    }
    throw query.error
  }

  return (query.data || []).reduce((accumulator, profile) => {
    const fullName =
      normalizeNullableText(profile.full_name) ||
      [profile.first_name, profile.last_name].map(normalizeNullableText).filter(Boolean).join(' ') ||
      normalizeNullableText(profile.email)
    accumulator[profile.id] = {
      ...profile,
      full_name: fullName,
    }
    return accumulator
  }, {})
}

export async function fetchRawBondHybridWorkflow(client, transactionId, { createIfMissing = false } = {}) {
  if (!transactionId) return null

  let query = await client
    .from('transaction_finance_workflows')
    .select(
      'id, transaction_id, workflow_type, current_stage, status, last_updated_by, last_updated_at, completed_at, created_at, updated_at',
    )
    .eq('transaction_id', transactionId)
    .eq('workflow_type', BOND_HYBRID_FINANCE_WORKFLOW_TYPE)
    .maybeSingle()

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_finance_workflows') || isMissingSchemaError(query.error))
      return null
    throw query.error
  }

  if (query.data || !createIfMissing) return query.data || null

  return createOrGetBondHybridFinanceWorkflow(transactionId, { client })
}

function deriveBondOfferStatusFromDecision({
  quote = {},
  acceptedOfferId = '',
  latestDecisionByOfferId = new Map(),
} = {}) {
  const normalizedAcceptedOfferId = String(acceptedOfferId || '').trim()
  const quoteId = String(quote?.id || '').trim()
  const latestDecision = latestDecisionByOfferId.get(quoteId) || null
  const rawStatus = String(quote?.quoteStatus || quote?.quote_status || '')
    .trim()
    .toLowerCase()

  if (normalizedAcceptedOfferId && normalizedAcceptedOfferId === quoteId) {
    return {
      quoteStatus: 'accepted',
      quoteStatusLabel: 'Accepted',
      decisionStatus: 'accepted',
      decisionAt: latestDecision?.decisionAt || quote?.approvedAt || quote?.approved_at || null,
    }
  }

  if (latestDecision?.decision === 'declined' || rawStatus === 'declined_by_buyer' || rawStatus === 'declined') {
    return {
      quoteStatus: 'declined',
      quoteStatusLabel: 'Declined',
      decisionStatus: 'declined',
      decisionAt: latestDecision?.decisionAt || null,
    }
  }

  if (normalizedAcceptedOfferId && normalizedAcceptedOfferId !== quoteId) {
    return {
      quoteStatus: 'not_selected',
      quoteStatusLabel: 'Not Selected',
      decisionStatus: 'not_selected',
      decisionAt: null,
    }
  }

  if (rawStatus === 'approved_by_buyer') {
    return {
      quoteStatus: 'accepted',
      quoteStatusLabel: 'Accepted',
      decisionStatus: 'accepted',
      decisionAt: quote?.approvedAt || quote?.approved_at || null,
    }
  }

  return {
    quoteStatus: rawStatus || 'received',
    quoteStatusLabel: BOND_HYBRID_QUOTE_STATUS_LABELS[normalizeBondHybridQuoteStatus(rawStatus)] || 'Received',
    decisionStatus: latestDecision?.decision || null,
    decisionAt: latestDecision?.decisionAt || null,
  }
}

export async function getTransactionFinanceWorkflow(transactionId, options = {}) {
  const client = options.client || requireClient()
  if (!transactionId) return null

  let workflow = await fetchRawBondHybridWorkflow(client, transactionId, {
    createIfMissing: Boolean(options.createIfMissing),
  })
  if (!workflow) return null

  const [applicationsQuery, quotesQuery, eventsQuery, decisionsQuery, instructionQuery, bankOutcomesQuery] = await Promise.all([
    client
      .from('transaction_bond_applications')
      .select(
        'id, transaction_id, workflow_id, application_type, bank_name, status, submitted_at, feedback_received_at, reference_number, application_reference, bond_originator_id, originator_organisation_id, submitted_by, notes, created_by, updated_by, created_at, updated_at',
      )
      .eq('workflow_id', workflow.id)
      .order('created_at', { ascending: true }),
    client
      .from('transaction_bond_quotes')
      .select(
        'id, transaction_id, workflow_id, bond_application_id, bank_name, quoted_amount, interest_rate, interest_rate_type, interest_rate_margin, interest_rate_display, monthly_repayment, term_months, quote_status, quote_received_at, quote_expiry_at, valid_until, approved_at, quote_document_id, uploaded_by, notes, created_by, updated_by, created_at, updated_at',
      )
      .eq('workflow_id', workflow.id)
      .order('created_at', { ascending: true }),
    client
      .from('transaction_finance_workflow_events')
      .select('id, workflow_id, from_stage, to_stage, event_type, notes, created_by, created_at')
      .eq('workflow_id', workflow.id)
      .order('created_at', { ascending: false })
      .limit(100),
    client
      .from('transaction_bond_offer_decisions')
      .select(
        'id, transaction_id, bond_offer_id, decision, decided_by, decided_by_role, decision_at, notes, superseded_at, created_at, updated_at',
      )
      .eq('transaction_id', transactionId)
      .order('decision_at', { ascending: false }),
    client.from('transaction_bond_instructions').select('*').eq('transaction_id', transactionId).maybeSingle(),
    client
      .from('transaction_bond_bank_outcomes')
      .select('id, transaction_id, workflow_id, bond_application_id, bank_name, outcome, outcome_at, approved_amount, conditions, decline_reason, notes, recorded_by, created_at')
      .eq('workflow_id', workflow.id)
      .order('outcome_at', { ascending: false }),
  ])

  for (const result of [applicationsQuery, quotesQuery, eventsQuery]) {
    if (result.error) {
      if (isMissingSchemaError(result.error)) return null
      throw result.error
    }
  }
  if (
    decisionsQuery.error &&
    !isMissingTableError(decisionsQuery.error, 'transaction_bond_offer_decisions') &&
    !isMissingSchemaError(decisionsQuery.error)
  ) {
    throw decisionsQuery.error
  }
  if (
    instructionQuery.error &&
    !isMissingTableError(instructionQuery.error, 'transaction_bond_instructions') &&
    !isMissingSchemaError(instructionQuery.error)
  ) {
    throw instructionQuery.error
  }
  if (
    bankOutcomesQuery.error &&
    !isMissingTableError(bankOutcomesQuery.error, 'transaction_bond_bank_outcomes') &&
    !isMissingSchemaError(bankOutcomesQuery.error)
  ) {
    throw bankOutcomesQuery.error
  }

  const profileIds = [
    workflow.last_updated_by,
    ...(applicationsQuery.data || []).flatMap((row) => [
      row.created_by,
      row.updated_by,
      row.submitted_by,
      row.bond_originator_id,
    ]),
    ...(quotesQuery.data || []).flatMap((row) => [row.created_by, row.updated_by, row.uploaded_by]),
    ...(eventsQuery.data || []).map((row) => row.created_by),
    ...(decisionsQuery.data || []).map((row) => row.decided_by),
    ...(bankOutcomesQuery.data || []).map((row) => row.recorded_by),
    ...(instructionQuery.data
      ? [
          instructionQuery.data.grant_received_by,
          instructionQuery.data.grant_signed_by,
          instructionQuery.data.grant_submitted_by,
          instructionQuery.data.instruction_sent_by,
        ]
      : []),
  ].filter(Boolean)
  const profileById = await fetchProfilesByIds(client, profileIds)
  const normalizedWorkflow = normalizeBondHybridWorkflowRow(workflow, profileById)
  const applications = (applicationsQuery.data || [])
    .map((row) => normalizeBondApplicationRow(row, profileById))
    .filter(Boolean)
  const baseQuotes = (quotesQuery.data || []).map((row) => normalizeBondQuoteRow(row, profileById)).filter(Boolean)
  const events = (eventsQuery.data || [])
    .map((row) => normalizeBondHybridWorkflowEventRow(row, profileById))
    .filter(Boolean)
  const decisions = (decisionsQuery.data || [])
    .map((row) => normalizeBondOfferDecisionRow(row, profileById))
    .filter(Boolean)
  const bankOutcomes = (bankOutcomesQuery.data || [])
    .map((row) => normalizeBondBankOutcomeRow(row, profileById))
    .filter(Boolean)
  const instruction = normalizeBondInstructionRow(instructionQuery.data || null, profileById)
  const latestDecisionByOfferId = decisions.reduce((accumulator, decision) => {
    const offerId = String(decision?.bondOfferId || '').trim()
    if (!offerId || accumulator.has(offerId)) return accumulator
    accumulator.set(offerId, decision)
    return accumulator
  }, new Map())
  const acceptedDecision = decisions.find((decision) => decision.decision === 'accepted' && !decision.supersededAt) || null
  const acceptedOfferId =
    String(acceptedDecision?.bondOfferId || instruction?.acceptedBondOfferId || '').trim() ||
    String(
      baseQuotes.find((quote) =>
        ['approved_by_buyer', 'accepted'].includes(
          String(quote.quoteStatus || '')
            .trim()
            .toLowerCase(),
        ),
      )?.id || '',
    ).trim()
  const quotes = baseQuotes.map((quote) => {
    const derived = deriveBondOfferStatusFromDecision({
      quote,
      acceptedOfferId,
      latestDecisionByOfferId,
    })
    return {
      ...quote,
      offerStatus: derived.quoteStatus,
      offerStatusLabel: derived.quoteStatusLabel,
      decisionStatus: derived.decisionStatus,
      decisionAt: derived.decisionAt,
      quoteStatus: derived.quoteStatus,
      quoteStatusLabel: derived.quoteStatusLabel,
      approvedAt:
        derived.quoteStatus === 'accepted' ? derived.decisionAt || quote.approvedAt || null : quote.approvedAt,
    }
  })
  const acceptedOffer = acceptedOfferId ? quotes.find((quote) => String(quote.id) === acceptedOfferId) || null : null
  const snapshot = {
    workflow: normalizedWorkflow,
    applications,
    quotes,
    offers: quotes,
    events,
    decisions,
    bankOutcomes,
    acceptedOffer,
    instruction,
  }

  return {
    ...snapshot,
    steps: buildBondHybridFinanceStageSteps(snapshot),
    summary: summarizeBondHybridFinanceWorkflow(snapshot),
  }
}

export async function createOrGetBondHybridFinanceWorkflow(transactionId, options = {}) {
  const client = options.client || requireClient()
  if (!transactionId) throw new Error('Transaction is required.')

  let transactionQuery = await client
    .from('transactions')
    .select('id, finance_type')
    .eq('id', transactionId)
    .maybeSingle()

  if (transactionQuery.error) throw transactionQuery.error
  if (!transactionQuery.data) throw new Error('Transaction was not found.')
  if (!isBondFinanceType(transactionQuery.data.finance_type)) {
    throw new Error('Bond / Hybrid finance workflow only applies to Bond or Hybrid transactions.')
  }

  const activeProfile = await resolveActiveProfileContext(client)
  const insertPayload = {
    transaction_id: transactionId,
    workflow_type: BOND_HYBRID_FINANCE_WORKFLOW_TYPE,
    current_stage: 'intake',
    status: 'active',
    last_updated_by: activeProfile.userId || null,
    last_updated_at: new Date().toISOString(),
  }

  const insert = await client
    .from('transaction_finance_workflows')
    .upsert(insertPayload, { onConflict: 'transaction_id,workflow_type', ignoreDuplicates: true })
    .select(
      'id, transaction_id, workflow_type, current_stage, status, last_updated_by, last_updated_at, completed_at, created_at, updated_at',
    )

  if (insert.error) {
    if (insert.error.code === '23505' || /duplicate key/i.test(String(insert.error.message || ''))) {
      const existing = await client
        .from('transaction_finance_workflows')
        .select(
          'id, transaction_id, workflow_type, current_stage, status, last_updated_by, last_updated_at, completed_at, created_at, updated_at',
        )
        .eq('transaction_id', transactionId)
        .eq('workflow_type', BOND_HYBRID_FINANCE_WORKFLOW_TYPE)
        .maybeSingle()
      if (existing.error) throw existing.error
      return existing.data || null
    }
    if (isMissingTableError(insert.error, 'transaction_finance_workflows') || isMissingSchemaError(insert.error)) {
      return null
    }
    throw insert.error
  }

  if (insert.data?.[0]) return insert.data[0]
  const existing = await client.from('transaction_finance_workflows')
    .select('id, transaction_id, workflow_type, current_stage, status, last_updated_by, last_updated_at, completed_at, created_at, updated_at')
    .eq('transaction_id', transactionId).eq('workflow_type', BOND_HYBRID_FINANCE_WORKFLOW_TYPE).maybeSingle()
  if (existing.error) throw existing.error
  return existing.data || null
}

export async function fetchNotificationTargetsByRole(client, { transactionId, roleTypes = [] } = {}) {
  if (!transactionId || !Array.isArray(roleTypes) || !roleTypes.length) {
    return []
  }

  const normalizeNotificationRoleTarget = (value) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_')

  const requestedRoles = new Set(roleTypes.map(normalizeNotificationRoleTarget).filter(Boolean))
  const attorneyRoleplayerRoles = new Set(['transfer_attorney', 'bond_attorney', 'cancellation_attorney'])
  const roleMatchesRequest = (roleType) => {
    const normalized = normalizeNotificationRoleTarget(roleType)
    if (!normalized) return false
    if (requestedRoles.has(normalized)) return true
    return requestedRoles.has('attorney') && attorneyRoleplayerRoles.has(normalized)
  }
  const notificationRoleForTarget = (roleType) => {
    const normalized = normalizeNotificationRoleTarget(roleType)
    return attorneyRoleplayerRoles.has(normalized) ? 'attorney' : normalizeRoleType(normalized)
  }

  const participantsQuery = await client
    .from('transaction_participants')
    .select('transaction_id, user_id, role_type, participant_email, participant_name, status, removed_at')
    .eq('transaction_id', transactionId)

  let participantRows = []
  if (participantsQuery.error) {
    if (
      !isMissingTableError(participantsQuery.error, 'transaction_participants') &&
      !isPermissionDeniedError(participantsQuery.error)
    ) {
      throw participantsQuery.error
    }
  } else {
    participantRows = participantsQuery.data || []
  }

  const filteredParticipants = participantRows.filter(
    (row) =>
      roleMatchesRequest(row.role_type) &&
      !row.removed_at &&
      normalizeStakeholderStatus(row.status, 'active') === 'active',
  )

  let roleplayerRows = []
  let roleplayersQuery = await client
    .from('transaction_role_players')
    .select(
      'id, transaction_id, role_type, contact_person, partner_name, email_address, status, assignment_status, snapshot_json',
    )
    .eq('transaction_id', transactionId)

  if (
    roleplayersQuery.error &&
    (isMissingColumnError(roleplayersQuery.error, 'contact_person') ||
      isMissingColumnError(roleplayersQuery.error, 'partner_name') ||
      isMissingColumnError(roleplayersQuery.error, 'email_address') ||
      isMissingColumnError(roleplayersQuery.error, 'status') ||
      isMissingColumnError(roleplayersQuery.error, 'assignment_status') ||
      isMissingColumnError(roleplayersQuery.error, 'snapshot_json'))
  ) {
    roleplayersQuery = await client
      .from('transaction_role_players')
      .select('id, transaction_id, role_type')
      .eq('transaction_id', transactionId)
  }

  if (roleplayersQuery.error) {
    if (
      !isMissingTableError(roleplayersQuery.error, 'transaction_role_players') &&
      !isPermissionDeniedError(roleplayersQuery.error)
    ) {
      throw roleplayersQuery.error
    }
  } else {
    roleplayerRows = (roleplayersQuery.data || []).filter((row) => {
      const status = normalizeNotificationRoleTarget(row.assignment_status || row.status || 'selected')
      return roleMatchesRequest(row.role_type) && !['removed', 'declined', 'rejected'].includes(status)
    })
  }

  const missingEmails = [
    ...filteredParticipants.filter((row) => !row.user_id).map((row) => row.participant_email),
    ...roleplayerRows.map((row) => {
      const snapshot = row.snapshot_json && typeof row.snapshot_json === 'object' ? row.snapshot_json : {}
      return row.email_address || snapshot.email || snapshot.assigned_user_email
    }),
  ]
  const profileIdByEmail = await resolveProfileIdsByEmail(client, missingEmails)

  const participantTargets = filteredParticipants
    .map((row) => ({
      transactionId: row.transaction_id || transactionId,
      userId:
        row.user_id ||
        profileIdByEmail[
          String(row.participant_email || '')
            .trim()
            .toLowerCase()
        ] ||
        null,
      roleType: notificationRoleForTarget(row.role_type),
      participantName: row.participant_name || '',
      participantEmail: row.participant_email || '',
    }))
    .filter((row) => row.userId)

  const roleplayerTargets = roleplayerRows
    .map((row) => {
      const snapshot = row.snapshot_json && typeof row.snapshot_json === 'object' ? row.snapshot_json : {}
      const email = String(row.email_address || snapshot.email || snapshot.assigned_user_email || '')
        .trim()
        .toLowerCase()
      const userId = snapshot.assigned_user_id || snapshot.userId || snapshot.user_id || profileIdByEmail[email] || null
      return {
        transactionId: row.transaction_id || transactionId,
        userId,
        roleType: notificationRoleForTarget(row.role_type),
        participantName:
          row.contact_person || snapshot.contactPerson || snapshot.assigned_user_name || row.partner_name || '',
        participantEmail: email,
      }
    })
    .filter((row) => row.userId)

  return Array.from(
    [...participantTargets, ...roleplayerTargets]
      .reduce((targetsByKey, target) => {
        const key = `${target.userId}:${target.roleType}`
        if (!targetsByKey.has(key)) targetsByKey.set(key, target)
        return targetsByKey
      }, new Map())
      .values(),
  )
}

export async function notifyRolesForTransaction(
  client,
  {
    transactionId,
    roleTypes = [],
    title,
    message,
    notificationType = 'readiness_updated',
    eventType = 'TransactionUpdated',
    eventData = {},
    dedupePrefix = 'notify',
    excludeUserId = null,
  } = {},
) {
  const receipt = await client.rpc('bridge_notify_transaction_roles', {
    p_transaction_id: transactionId,
    p_role_types: roleTypes,
    p_notification_type: normalizeNotificationType(notificationType),
    p_title: title || '',
    p_message: message || '',
    p_event_type: normalizeEventType(eventType),
    p_event_data: eventData || {},
    p_dedupe_prefix: dedupePrefix,
    p_exclude_user_id: excludeUserId || null,
  })
  if (!receipt.error) return Array.from({ length: Math.max(0, Number(receipt.data) || 0) }, () => ({ saved: true }))
  if (!isMissingFunctionError(receipt.error, 'bridge_notify_transaction_roles')) throw receipt.error

  const targets = await fetchNotificationTargetsByRole(client, {
    transactionId,
    roleTypes,
  })
  if (!targets.length) {
    return []
  }

  const notifications = []
  for (const target of targets) {
    if (excludeUserId && target.userId === excludeUserId) {
      continue
    }

    const created = await createTransactionNotificationIfPossible(client, {
      transactionId: target.transactionId,
      userId: target.userId,
      roleType: target.roleType,
      notificationType,
      title,
      message,
      eventType,
      eventData: { ...(eventData || {}), recipientRole: target.roleType },
      dedupeKey: `${dedupePrefix}:${target.transactionId}:${target.roleType}:${target.userId}`,
    })

    if (created) {
      notifications.push(created)
    }
  }

  return notifications
}

export function normalizeTransactionRoleplayerRoleType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
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
  return normalizeRoleType(normalized)
}

function normalizeTransactionRolePlayerRow(row = {}) {
  const snapshot = row.snapshot_json && typeof row.snapshot_json === 'object' ? row.snapshot_json : {}
  return {
    id: normalizeTextValue(row.id),
    transactionId: normalizeTextValue(row.transaction_id || row.transactionId),
    roleType: normalizeTransactionRoleplayerRoleType(row.role_type || row.roleType),
    selectionSource: normalizeTextValue(row.selection_source || row.selectionSource || snapshot.selectionSource),
    preferredPartnerId: normalizeTextValue(row.preferred_partner_id || row.preferredPartnerId),
    partnerRelationshipId: normalizeTextValue(
      row.partner_relationship_id || row.partnerRelationshipId || snapshot.relationshipId,
    ),
    organisationId: normalizeTextValue(row.organisation_id || row.organisationId || snapshot.organisationId),
    partnerName: normalizeTextValue(row.partner_name || row.partnerName || snapshot.companyName),
    contactPerson: normalizeTextValue(row.contact_person || row.contactPerson || snapshot.contactPerson),
    emailAddress: normalizeTextValue(row.email_address || row.emailAddress || snapshot.email),
    phoneNumber: normalizeTextValue(row.phone_number || row.phoneNumber),
    status: normalizeTextValue(row.assignment_status || row.status || row.assignmentStatus) || 'selected',
    assignmentStatus: normalizeTextValue(row.assignment_status || row.assignmentStatus || row.status) || 'selected',
    activationTrigger: normalizeTextValue(
      row.activation_trigger || row.activationTrigger || snapshot.activationTrigger,
    ),
    activatedAt: normalizeTextValue(row.activated_at || row.activatedAt),
    notifiedAt: normalizeTextValue(row.notified_at || row.notifiedAt),
    assignedBy: normalizeTextValue(row.assigned_by || row.assignedBy),
    snapshot,
    createdAt: normalizeTextValue(row.created_at || row.createdAt),
    updatedAt: normalizeTextValue(row.updated_at || row.updatedAt),
  }
}

export async function fetchTransactionRolePlayersIfPossible(client, transactionId) {
  if (!transactionId) return []
  let query = await client
    .from('transaction_role_players')
    .select(
      'id, transaction_id, role_type, selection_source, preferred_partner_id, partner_relationship_id, organisation_id, partner_name, contact_person, email_address, phone_number, status, assignment_status, activation_trigger, activated_at, notified_at, assigned_by, snapshot_json, created_at, updated_at',
    )
    .eq('transaction_id', transactionId)

  if (
    query.error &&
    (isMissingColumnError(query.error, 'partner_relationship_id') ||
      isMissingColumnError(query.error, 'organisation_id') ||
      isMissingColumnError(query.error, 'status') ||
      isMissingColumnError(query.error, 'assignment_status') ||
      isMissingColumnError(query.error, 'activation_trigger') ||
      isMissingColumnError(query.error, 'activated_at') ||
      isMissingColumnError(query.error, 'notified_at') ||
      isMissingColumnError(query.error, 'assigned_by'))
  ) {
    query = await client
      .from('transaction_role_players')
      .select(
        'id, transaction_id, role_type, selection_source, preferred_partner_id, partner_name, contact_person, email_address, phone_number, snapshot_json, created_at, updated_at',
      )
      .eq('transaction_id', transactionId)
  }

  if (query.error) {
    if (
      isMissingTableError(query.error, 'transaction_role_players') ||
      isMissingSchemaError(query.error) ||
      isPermissionDeniedError(query.error)
    )
      return []
    throw query.error
  }

  return (query.data || []).map(normalizeTransactionRolePlayerRow)
}

export async function loadSharedDiscussion(
  client,
  { transactionId, unitId = null, viewer = 'internal', includeLegacy = true, limit = null } = {},
) {
  if (!transactionId) {
    return []
  }

  let discussionQuery = await client
    .from('transaction_comments')
    .select(TRANSACTION_DISCUSSION_COLUMNS)
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })
    .limit(limit || 250)

  if (
    discussionQuery.error &&
    [
      'unit_id',
      'development_id',
      'organisation_id',
      'author_user_id',
      'author_organisation_name',
      'visibility_scope',
      'update_type',
      'related_entity_type',
      'related_entity_id',
      'attachment_ids',
      'is_system_generated',
      'updated_at',
    ].some((column) => isMissingColumnError(discussionQuery.error, column))
  ) {
    discussionQuery = await client
      .from('transaction_comments')
      .select(TRANSACTION_DISCUSSION_LEGACY_COLUMNS)
      .eq('transaction_id', transactionId)
      .order('created_at', { ascending: false })
      .limit(limit || 250)
  }

  let rows = []
  if (discussionQuery.error) {
    if (isMissingTableError(discussionQuery.error, 'transaction_comments')) {
      const legacyNotes = includeLegacy ? await fetchTransactionNotesForPortal(client, transactionId, unitId) : []
      return filterDiscussionRowsByViewer(
        legacyNotes.map((note) => normalizeLegacyNoteAsDiscussionRow(note, transactionId, 'shared')),
        viewer,
      )
    }

    throw discussionQuery.error
  }

  rows = (discussionQuery.data || []).map((row) => normalizeTransactionCommentRow(row))

  if (includeLegacy) {
    const legacyNotes = await fetchTransactionNotesForPortal(client, transactionId, unitId)
    const legacyRows = legacyNotes.map((note) => normalizeLegacyNoteAsDiscussionRow(note, transactionId, 'internal'))
    rows = [...rows, ...legacyRows]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, limit || 250)
  }

  const legacyRows = filterDiscussionRowsByViewer(rows, viewer)
  // Historical notes retain their existing audience rules. Do not republish or
  // infer audiences for them. New professional history reads the linked stream.
  if (viewer !== 'internal') return legacyRows
  const conversation = await readMatterConversation({ transactionId, client }).catch(() => null)
  const messages = (conversation?.items || []).filter(item => item.kind === 'message').map(item => ({
    id: item.id, transactionId, authorName: item.authorName, authorRole: item.authorRole,
    authorRoleLabel: item.authorRole, commentText: item.body, commentBody: item.body,
    discussionType: 'operational', visibility: item.audience === 'everyone' ? 'client_visible'
      : item.audience === 'private' ? 'internal' : 'shared',
    createdAt: item.createdAt, updatedAt: item.createdAt, attachmentIds: [], isSystemGenerated: false,
  }))
  return [...messages, ...legacyRows].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit || 250)
}

async function fetchTransactionNotesForPortal(client, transactionId, unitId) {
  if (!transactionId && !unitId) {
    return []
  }

  let notesQuery = await client
    .from('notes')
    .select('id, transaction_id, body, created_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })
    .limit(60)

  if (notesQuery.error && isMissingColumnError(notesQuery.error, 'transaction_id') && unitId) {
    notesQuery = await client
      .from('notes')
      .select('id, unit_id, body, created_at')
      .eq('unit_id', unitId)
      .order('created_at', { ascending: false })
      .limit(60)
  }

  if (notesQuery.error) {
    if (isMissingSchemaError(notesQuery.error)) {
      return []
    }

    throw notesQuery.error
  }

  return (notesQuery.data || []).map((note) => ({
    ...note,
    transaction_id: note.transaction_id || transactionId,
  }))
}

export function mapNormalizedBondApplicationRows(applicationRow, participantRows = [], sectionRows = [], requirementRows = []) {
  if (!applicationRow?.id) return null
  const participants = (participantRows || []).map((row) => ({
    id: row.id,
    participantKey: row.participant_key,
    role: row.role,
    ordinal: row.ordinal || 1,
    personId: row.person_id || null,
    contactId: row.contact_id || null,
    status: row.status,
    invitationStatus: row.invitation_status || null,
    displayName: row.metadata?.displayName || row.metadata?.display_name || '',
    email: row.metadata?.email || '',
    phone: row.metadata?.phone || '',
    reviewContextHash: row.review_context_hash || null,
    reviewedRevision: row.reviewed_revision || null,
    reviewedAt: row.reviewed_at || null,
    readyAt: row.ready_at || null,
    awaitingSignatureAt: row.awaiting_signature_at || null,
    signedAt: row.signed_at || null,
    completedAt: row.completed_at || null,
    declinedAt: row.declined_at || null,
    removedAt: row.removed_at || null,
    metadata: row.metadata || {},
  }))
  const sharedSections = {}
  const participantSections = {}
  ;(sectionRows || []).forEach((row) => {
    if (row.scope === 'application') {
      sharedSections[row.section_key] = row.answers_json || {}
      return
    }
    const participant = participants.find((item) => item.id === row.participant_id)
    if (!participant) return
    participantSections[participant.participantKey] = {
      ...(participantSections[participant.participantKey] || {}),
      [row.section_key]: row.answers_json || {},
    }
  })
  return {
    id: applicationRow.id,
    transactionId: applicationRow.transaction_id,
    onboardingFormDataId: applicationRow.onboarding_form_data_id,
    schemaVersion: applicationRow.schema_version,
    flowVersion: applicationRow.flow_version,
    storageMode: applicationRow.storage_mode,
    status: applicationRow.status,
    revision: applicationRow.revision,
    sourceLegacyHash: applicationRow.source_legacy_hash || '',
    sourceLegacyUpdatedAt: applicationRow.source_legacy_updated_at || null,
    compatibilityProjectionVersion: applicationRow.compatibility_projection_version || null,
    compatibilityProjectionHash: applicationRow.compatibility_projection_hash || null,
    compatibilityProjectedAt: applicationRow.compatibility_projected_at || null,
    activeSubmissionId: applicationRow.active_submission_id || null,
    activeChangeRequestId: applicationRow.active_change_request_id || null,
    revisionBaseSubmissionId: applicationRow.revision_base_submission_id || null,
    lockedAt: applicationRow.locked_at || null,
    submittedAt: applicationRow.submitted_at || null,
    participants,
    sharedSections,
    participantSections,
    documentRequirements: (requirementRows || []).map((row) => ({
      id: row.id,
      participantId: row.participant_id || null,
      requirementKey: row.requirement_key,
      canonicalDocumentType: row.canonical_document_type,
      ruleSetVersion: row.rule_set_version,
      requiredBefore: row.required_before,
      satisfactionMode: row.satisfaction_mode,
      status: row.status,
      source: row.source,
      transactionRequiredDocumentId: row.transaction_required_document_id || null,
      metadata: row.metadata || {},
    })),
    metadata: applicationRow.metadata || {},
  }
}

export async function fetchNormalizedBondApplicationBundle(client, transactionId) {
  const appQuery = await client
    .from('bond_applications')
    .select('*')
    .eq('transaction_id', transactionId)
    .neq('status', BOND_APPLICATION_STATUSES.cancelled)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (appQuery.error) {
    if (isMissingTableError(appQuery.error, 'bond_applications') || isPermissionDeniedError(appQuery.error) || isMissingSchemaError(appQuery.error)) return null
    throw appQuery.error
  }
  if (!appQuery.data?.id) return null
  const [participants, sections, requirements] = await Promise.all([
    client.from('bond_application_participants').select('*').eq('bond_application_id', appQuery.data.id),
    client.from('bond_application_sections').select('*').eq('bond_application_id', appQuery.data.id),
    client.from('bond_application_document_requirements').select('*').eq('bond_application_id', appQuery.data.id),
  ])
  for (const result of [participants, sections, requirements]) {
    if (result.error && !isPermissionDeniedError(result.error) && !isMissingSchemaError(result.error)) throw result.error
  }
  const bundle = mapNormalizedBondApplicationRows(appQuery.data, participants.data || [], sections.data || [], requirements.data || [])
  if (appQuery.data.active_submission_id) {
    const submission = await client.from('transaction_bond_application_submissions').select('*')
      .eq('id', appQuery.data.active_submission_id).eq('transaction_id', transactionId).maybeSingle()
    if (submission.error && !isPermissionDeniedError(submission.error) && !isMissingSchemaError(submission.error)) throw submission.error
    // Missing/inaccessible signing evidence must never imply submission readiness.
    bundle.activeSubmission = submission.data || null
  }
  return bundle
}
