// bond owns these operations and their existing recovery behavior.
import { getOrCreateTransactionOnboardingRecord } from '../onboarding/workflow.js'
import { logTransactionEventIfPossible } from '../transactions/eventActions.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { normalizeNullableUuid, normalizeNullableText, requireClient, isMissingTableError, isMissingColumnError, isMissingSchemaError, isPermissionDeniedError } from '../../lib/api/shared/readHelpers.js'
import { BOND_HYBRID_APPLICATION_STATUS_LABELS, BOND_HYBRID_FINANCE_WORKFLOW_TYPE, BOND_HYBRID_QUOTE_STATUS_LABELS, getBondHybridFinanceStageIndex, getBondHybridFinanceStageLabel, normalizeBondHybridApplicationStatus, normalizeBondHybridFinanceStage, normalizeBondHybridQuoteStatus } from '../../core/transactions/bondHybridFinanceWorkflow'
import { BOND_APPLICATION_PRE_APPROVAL_STATUSES, buildLegacyBondApplicationPersistencePayload, buildPreApprovalConversionPersistencePayload, cloneBondApplicationValue, convertNormalizedPreApprovalToBondApplication, toLegacyBondApplication } from '../../modules/bond/application/index.js'
import { buildBondApplicationState } from '../../modules/bond/application/legacy/bondApplicationLegacyAdapter.js'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { requireClientPortalTokenClient, persistNormalizedCompatibilityProjection } from '../clientPortal/appointmentRead.js'
import { processWorkflowEvidenceIfPossible, normalizeBondHybridWorkflowEventRow, fetchRawBondHybridWorkflow, getTransactionFinanceWorkflow, notifyRolesForTransaction, fetchNormalizedBondApplicationBundle } from './financeRead.js'
import { upsertTransactionLifecycleWorkflow } from '../transactions/workflowEvidence.js'
import { ensureBondApplicationWorkspaceRecord } from '../transactions/creationApi.js'
import { fetchTransactionById } from '../transactions/detailReadApi.js'
import { fetchClientPortalOriginatorFinanceByToken } from '../clientPortal/originatorFinanceRead.js'
import { addTransactionDiscussionComment } from '../transactions/discussionApi.js'

function normalizeBondWorkflowPayloadDate(value) {
  const normalized = normalizeNullableText(value)
  if (!normalized) return null
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function normalizeBondWorkflowPayloadNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeBondWorkflowPayloadInteger(value) {
  const parsed = normalizeBondWorkflowPayloadNumber(value)
  if (parsed === null) return null
  return Math.trunc(parsed)
}

async function insertBondHybridWorkflowEvent(
  client,
  { workflow, fromStage = null, toStage, eventType = 'stage_changed', notes = '', createdBy = null } = {},
) {
  if (!workflow?.id || !toStage) return null
  const payload = {
    workflow_id: workflow.id,
    from_stage: fromStage || null,
    to_stage: normalizeBondHybridFinanceStage(toStage),
    event_type: eventType,
    notes: normalizeNullableText(notes),
    created_by: createdBy || null,
  }

  const insert = await client
    .from('transaction_finance_workflow_events')
    .insert(payload)
    .select('id, workflow_id, from_stage, to_stage, event_type, notes, created_by, created_at')
    .single()

  if (insert.error) {
    if (isMissingTableError(insert.error, 'transaction_finance_workflow_events') || isMissingSchemaError(insert.error))
      return null
    throw insert.error
  }

  return normalizeBondHybridWorkflowEventRow(insert.data)
}

function buildBondHybridWorkflowActivityMessage({ action, bankName = '', fromStage = '', toStage = '' } = {}) {
  if (action === 'application_added') return `Bond application submitted to ${bankName}.`
  if (action === 'application_updated') return `Bond application updated for ${bankName}.`
  if (action === 'quote_added') return `Quote received from ${bankName}.`
  if (action === 'quote_updated') return `Bond quote updated for ${bankName}.`
  if (action === 'quote_approved') return `Buyer approved ${bankName} quote.`
  if (action === 'instruction_sent') return 'Finance instruction sent.'
  if (action === 'stage_changed') return `Bond finance workflow moved to ${getBondHybridFinanceStageLabel(toStage)}.`
  return fromStage && toStage
    ? `Bond finance workflow moved from ${getBondHybridFinanceStageLabel(fromStage)} to ${getBondHybridFinanceStageLabel(toStage)}.`
    : 'Bond finance workflow updated.'
}

async function logBondHybridWorkflowActivity(
  client,
  { transactionId, actorRole, message, eventType = 'BondHybridFinanceWorkflowUpdated', eventData = {} } = {},
) {
  if (!transactionId || !message) return
  const activeProfile = await resolveActiveProfileContext(client)

  await Promise.allSettled([
    addTransactionDiscussionComment({
      transactionId,
      authorName: activeProfile.name || activeProfile.email || null,
      authorRole: actorRole || activeProfile.role || 'bond_originator',
      authorUserId: activeProfile.userId || null,
      commentText: `[system][shared] ${message}`,
      client,
    }),
    logTransactionEventIfPossible(client, {
      transactionId,
      eventType,
      createdBy: activeProfile.userId || null,
      createdByRole: actorRole || activeProfile.role || 'bond_originator',
      eventData: {
        source: 'transaction_finance_workflows',
        message,
        ...eventData,
      },
    }),
  ])
}

async function notifyBondHybridWorkflowRoles(
  client,
  { transactionId, stage, message, eventType = 'BondHybridFinanceWorkflowUpdated' } = {},
) {
  const rolesByStage = {
    submitted_to_banks: ['agent'],
    bank_review: ['agent'],
    quote_received: ['agent'],
    quote_accepted: ['agent', 'attorney'],
    bond_approved: ['agent', 'attorney'],
    grant_received: ['agent', 'attorney'],
    grant_signed: ['agent', 'attorney'],
    grant_submitted: ['agent', 'attorney'],
    instruction_sent: ['agent', 'attorney'],
    complete: ['agent', 'attorney'],
  }
  const roleTypes = rolesByStage[stage] || []
  if (!roleTypes.length) return []

  return notifyRolesForTransaction(client, {
    transactionId,
    roleTypes,
    title: 'Bond Finance Update',
    message,
    notificationType: 'workflow_updated',
    eventType,
    eventData: { workflowType: BOND_HYBRID_FINANCE_WORKFLOW_TYPE, stage },
    dedupePrefix: `bond_hybrid_finance:${stage}`,
  })
}

function assertBondHybridWorkflowEditable(workflow, activeProfile = {}, actorRole = '') {
  if (!workflow || workflow.status !== 'completed') return
  const normalizedRole = normalizeRoleType(actorRole || activeProfile.role || '')
  if (['developer', 'internal_admin'].includes(normalizedRole)) return
  throw new Error('This finance workflow is completed. Only an admin can override completed bond finance workflows.')
}

async function fetchBondInstructionEvidence(client, transactionId) {
  if (!transactionId) return null
  const query = await client
    .from('transaction_bond_instructions')
    .select('*')
    .eq('transaction_id', transactionId)
    .maybeSingle()

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_bond_instructions') || isMissingSchemaError(query.error))
      return null
    throw query.error
  }
  return query.data || null
}

function hasBondGrantDocument(instruction = {}) {
  return Boolean(instruction?.grant_document_id || instruction?.grantDocumentId)
}

function hasSignedBondGrantDocument(instruction = {}) {
  return Boolean(instruction?.signed_grant_document_id || instruction?.signedGrantDocumentId)
}

function hasSubmittedBondGrant(instruction = {}) {
  return Boolean(
    instruction?.grant_submitted ||
    instruction?.grantSubmitted ||
    instruction?.grant_submitted_at ||
    instruction?.grantSubmittedAt,
  )
}

function hasInstructionDocument(instruction = {}) {
  return Boolean(instruction?.instruction_document_id || instruction?.instructionDocumentId)
}

async function assertBondHybridStageRequirements(client, workflow, nextStage) {
  if (!workflow?.id) return
  const normalizedStage = normalizeBondHybridFinanceStage(nextStage)

  if (normalizedStage === 'submitted_to_banks') {
    const query = await client
      .from('transaction_bond_applications')
      .select('id, status')
      .eq('workflow_id', workflow.id)
      .eq('status', 'submitted')
      .limit(1)
    if (query.error) {
      if (isMissingTableError(query.error, 'transaction_bond_applications') || isMissingSchemaError(query.error)) {
        throw new Error('Add at least one submitted bank/lender application before moving to Submitted to Banks.')
      }
      throw query.error
    }
    if (!(query.data || []).length) {
      throw new Error('Add at least one submitted bank/lender application before moving to Submitted to Banks.')
    }
  }

  if (normalizedStage === 'quote_received') {
    const [applicationFeedback, quoteQuery] = await Promise.all([
      client
        .from('transaction_bond_applications')
        .select('id, status')
        .eq('workflow_id', workflow.id)
        .in('status', [
          'feedback_received',
          'quote_received',
          'additional_documents_required',
          'declined',
          'approved',
          'buyer_approved',
        ])
        .limit(1),
      client.from('transaction_bond_quotes').select('id').eq('workflow_id', workflow.id).limit(1),
    ])
    if (applicationFeedback.error && !isMissingTableError(applicationFeedback.error, 'transaction_bond_applications'))
      throw applicationFeedback.error
    if (quoteQuery.error && !isMissingTableError(quoteQuery.error, 'transaction_bond_quotes')) throw quoteQuery.error
    if (!(applicationFeedback.data || []).length && !(quoteQuery.data || []).length) {
      throw new Error('Add bank feedback or at least one quote before moving to Quote Received.')
    }
  }

  if (
    [
      'quote_accepted',
      'bond_approved',
      'grant_received',
      'grant_signed',
      'grant_submitted',
      'instruction_sent',
      'complete',
    ].includes(normalizedStage)
  ) {
    const approvedQuote = await client
      .from('transaction_bond_quotes')
      .select('id')
      .eq('workflow_id', workflow.id)
      .eq('quote_status', 'approved_by_buyer')
      .limit(1)
    if (approvedQuote.error) {
      if (
        isMissingTableError(approvedQuote.error, 'transaction_bond_quotes') ||
        isMissingSchemaError(approvedQuote.error)
      ) {
        throw new Error('Approve one buyer-selected quote before moving to Quote Approved.')
      }
      throw approvedQuote.error
    }
    if (!(approvedQuote.data || []).length) {
      throw new Error('Approve one buyer-selected quote before moving to Quote Approved.')
    }
  }

  if (['grant_received', 'grant_signed', 'grant_submitted', 'instruction_sent', 'complete'].includes(normalizedStage)) {
    const instruction = await fetchBondInstructionEvidence(client, workflow.transaction_id)
    if (!hasBondGrantDocument(instruction)) {
      throw new Error('Attach the bond grant document before moving to Grant Received.')
    }
    if (
      ['grant_signed', 'grant_submitted', 'instruction_sent', 'complete'].includes(normalizedStage) &&
      !hasSignedBondGrantDocument(instruction)
    ) {
      throw new Error('Attach the signed bond grant before moving to Grant Signed.')
    }
    if (
      ['grant_submitted', 'instruction_sent', 'complete'].includes(normalizedStage) &&
      !hasSubmittedBondGrant(instruction)
    ) {
      throw new Error('Submit the signed bond grant before moving to Grant Submitted.')
    }
    if (['instruction_sent', 'complete'].includes(normalizedStage) && !hasInstructionDocument(instruction)) {
      throw new Error('Attach the attorney instruction document before moving to Instruction Issued.')
    }
    if (normalizedStage === 'complete' && instruction?.instruction_sent !== true) {
      throw new Error('Send the attorney instruction before completing the finance workflow.')
    }
  }
}

export async function updateBondHybridFinanceStage(transactionId, nextStage, options = {}) {
  const client = options.client || requireClient()
  const actorRole = options.actorRole || null
  const normalizedNextStage = normalizeBondHybridFinanceStage(nextStage)
  const activeProfile = await resolveActiveProfileContext(client)
  const workflow = await fetchRawBondHybridWorkflow(client, transactionId, {
    createIfMissing: true,
  })
  if (!workflow?.id) throw new Error('Bond / Hybrid finance workflow is not available.')

  assertBondHybridWorkflowEditable(workflow, activeProfile, actorRole)
  await assertBondHybridStageRequirements(client, workflow, normalizedNextStage)

  const fromStage = normalizeBondHybridFinanceStage(workflow.current_stage)
  const isCompleted = normalizedNextStage === 'complete'
  const update = await client
    .from('transaction_finance_workflows')
    .update({
      current_stage: normalizedNextStage,
      status: isCompleted ? 'completed' : 'active',
      completed_at: isCompleted ? new Date().toISOString() : null,
      last_updated_by: activeProfile.userId || null,
      last_updated_at: new Date().toISOString(),
    })
    .eq('id', workflow.id)
    .select(
      'id, transaction_id, workflow_type, current_stage, status, last_updated_by, last_updated_at, completed_at, created_at, updated_at',
    )
    .single()

  if (update.error) throw update.error

  if (fromStage !== normalizedNextStage) {
    await insertBondHybridWorkflowEvent(client, {
      workflow: update.data,
      fromStage,
      toStage: normalizedNextStage,
      eventType: normalizedNextStage === 'instruction_sent' ? 'instruction_sent' : 'stage_changed',
      notes: options.notes || null,
      createdBy: activeProfile.userId || null,
    })
  }

  const stageLabel = getBondHybridFinanceStageLabel(normalizedNextStage)
  const transactionFinanceStatusUpdate = await client
    .from('transactions')
    .update({
      finance_status: stageLabel,
      updated_at: new Date().toISOString(),
    })
    .eq('id', transactionId)
  if (
    transactionFinanceStatusUpdate.error &&
    !isMissingColumnError(transactionFinanceStatusUpdate.error, 'finance_status') &&
    !isMissingSchemaError(transactionFinanceStatusUpdate.error)
  ) {
    throw transactionFinanceStatusUpdate.error
  }

  await upsertTransactionLifecycleWorkflow(client, {
    transactionId,
    currentStage: 'finance',
    preserveLaterStage: true,
    status: 'active',
    actorUserId: activeProfile.userId || null,
    source: 'bond_hybrid_finance_workflow',
    note: isCompleted
      ? 'Bond / hybrid finance workflow reached Complete.'
      : `Bond / hybrid finance workflow moved to ${stageLabel}.`,
  })

  const message = buildBondHybridWorkflowActivityMessage({
    action: normalizedNextStage === 'instruction_sent' ? 'instruction_sent' : 'stage_changed',
    fromStage,
    toStage: normalizedNextStage,
  })
  await logBondHybridWorkflowActivity(client, {
    transactionId,
    actorRole,
    message,
    eventType:
      normalizedNextStage === 'instruction_sent'
        ? 'BondHybridFinanceInstructionSent'
        : 'BondHybridFinanceWorkflowUpdated',
    eventData: {
      workflowId: workflow.id,
      fromStage,
      toStage: normalizedNextStage,
    },
  })
  await notifyBondHybridWorkflowRoles(client, {
    transactionId,
    stage: normalizedNextStage,
    message,
    eventType:
      normalizedNextStage === 'instruction_sent'
        ? 'BondHybridFinanceInstructionSent'
        : 'BondHybridFinanceWorkflowUpdated',
  })

  if (normalizedNextStage === 'instruction_sent') {
    await processWorkflowEvidenceIfPossible(client, {
      transactionId,
      evidenceType: 'external_status',
      evidenceId: workflow.id,
      evidenceKey: 'instruction_sent',
      status: 'instruction_sent',
      source: 'bond_hybrid_finance_workflow',
      createdBy: activeProfile.userId || null,
      payload: {
        workflowId: workflow.id,
        fromStage,
        toStage: normalizedNextStage,
      },
    })
  }

  return getTransactionFinanceWorkflow(transactionId, { client })
}

export async function addBondApplication(transactionId, payload = {}, options = {}) {
  const client = options.client || requireClient()
  const actorRole = options.actorRole || null
  const activeProfile = await resolveActiveProfileContext(client)
  const workflow = await fetchRawBondHybridWorkflow(client, transactionId, {
    createIfMissing: true,
  })
  if (!workflow?.id) throw new Error('Bond / Hybrid finance workflow is not available.')
  assertBondHybridWorkflowEditable(workflow, activeProfile, actorRole)

  const bankName = normalizeNullableText(payload.bankName || payload.bank_name)
  if (!bankName) throw new Error('Bank / lender name is required.')
  const status = normalizeBondHybridApplicationStatus(payload.status || 'submitted')
  const submittedAt =
    normalizeBondWorkflowPayloadDate(payload.submittedAt || payload.submitted_at) ||
    (status === 'submitted' ? new Date().toISOString() : null)
  const feedbackReceivedAt = normalizeBondWorkflowPayloadDate(
    payload.feedbackReceivedAt || payload.feedback_received_at,
  )

  const insert = await client
    .from('transaction_bond_applications')
    .insert({
      transaction_id: transactionId,
      workflow_id: workflow.id,
      application_type: 'bank_application',
      bank_name: bankName,
      status,
      submitted_at: submittedAt,
      feedback_received_at: feedbackReceivedAt,
      reference_number: normalizeNullableText(payload.referenceNumber || payload.reference_number),
      application_reference: normalizeNullableText(
        payload.applicationReference ||
          payload.application_reference ||
          payload.referenceNumber ||
          payload.reference_number,
      ),
      bond_originator_id: normalizeNullableUuid(payload.bondOriginatorId || payload.bond_originator_id) || null,
      originator_organisation_id:
        normalizeNullableUuid(payload.originatorOrganisationId || payload.originator_organisation_id) || null,
      submitted_by: activeProfile.userId || null,
      notes: normalizeNullableText(payload.notes),
      created_by: activeProfile.userId || null,
      updated_by: activeProfile.userId || null,
    })
    .select(
      'id, transaction_id, workflow_id, application_type, bank_name, status, submitted_at, feedback_received_at, reference_number, application_reference, bond_originator_id, originator_organisation_id, submitted_by, notes, created_by, updated_by, created_at, updated_at',
    )
    .single()

  if (insert.error) throw insert.error
  await insertBondHybridWorkflowEvent(client, {
    workflow,
    fromStage: workflow.current_stage,
    toStage: workflow.current_stage,
    eventType: 'bank_submission_added',
    notes: `${bankName}: ${BOND_HYBRID_APPLICATION_STATUS_LABELS[status] || status}`,
    createdBy: activeProfile.userId || null,
  })
  await logBondHybridWorkflowActivity(client, {
    transactionId,
    actorRole,
    message: buildBondHybridWorkflowActivityMessage({
      action: 'application_added',
      bankName,
    }),
    eventType: 'BondHybridFinanceApplicationUpdated',
    eventData: {
      workflowId: workflow.id,
      applicationId: insert.data.id,
      bankName,
      status,
    },
  })

  await processWorkflowEvidenceIfPossible(client, {
    transactionId,
    evidenceType: 'external_status',
    evidenceId: insert.data.id,
    evidenceKey: 'bond_documents_reviewed',
    status: status === 'submitted' ? 'approved' : status,
    source: 'bond_application_added',
    createdBy: activeProfile.userId || null,
    payload: {
      bankName,
      status,
    },
  })
  await processWorkflowEvidenceIfPossible(client, {
    transactionId,
    evidenceType: 'external_status',
    evidenceId: insert.data.id,
    evidenceKey: 'bank_applications_submitted',
    status,
    source: 'bond_application_added',
    createdBy: activeProfile.userId || null,
    payload: {
      bankName,
    },
  })

  if (getBondHybridFinanceStageIndex(workflow.current_stage) < getBondHybridFinanceStageIndex('submitted_to_banks')) {
    await updateBondHybridFinanceStage(transactionId, 'submitted_to_banks', {
      client,
      actorRole,
      notes: `${bankName} application submitted.`,
    })
  }

  return getTransactionFinanceWorkflow(transactionId, { client })
}

function normalizeBondBankOutcome(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  return ['approved', 'declined', 'conditional', 'additional_documents_required', 'withdrawn', 'expired'].includes(normalized)
    ? normalized
    : ''
}

function deriveBondBankOutcome(status = '', outcome = '') {
  const explicit = normalizeBondBankOutcome(outcome)
  if (explicit) return explicit
  const normalizedStatus = normalizeBondHybridApplicationStatus(status)
  if (normalizedStatus === 'approved' || normalizedStatus === 'buyer_approved') return 'approved'
  if (normalizedStatus === 'declined') return 'declined'
  if (normalizedStatus === 'additional_documents_required') return 'additional_documents_required'
  if (normalizedStatus === 'expired') return 'expired'
  return ''
}

async function persistBondBankOutcome(client, application = {}, payload = {}, activeProfile = {}) {
  const outcomePayload = payload.bankOutcome || payload.bank_outcome || payload
  const outcome = deriveBondBankOutcome(application.status, outcomePayload.outcome)
  if (!outcome) return null
  const insert = await client
    .from('transaction_bond_bank_outcomes')
    .insert({
      transaction_id: application.transaction_id,
      workflow_id: application.workflow_id,
      bond_application_id: application.id,
      bank_name: application.bank_name,
      outcome,
      outcome_at: normalizeBondWorkflowPayloadDate(outcomePayload.outcomeAt || outcomePayload.outcome_at) || new Date().toISOString(),
      approved_amount: normalizeBondWorkflowPayloadNumber(outcomePayload.approvedAmount || outcomePayload.approved_amount),
      conditions: normalizeNullableText(outcomePayload.conditions),
      decline_reason: normalizeNullableText(outcomePayload.declineReason || outcomePayload.decline_reason),
      notes: normalizeNullableText(outcomePayload.notes || application.notes),
      recorded_by: activeProfile.userId || null,
    })
    .select('id')
    .single()
  if (insert.error) throw insert.error
  return insert.data || null
}

export async function updateBondApplication(applicationId, payload = {}, options = {}) {
  const client = options.client || requireClient()
  const actorRole = options.actorRole || null
  const activeProfile = await resolveActiveProfileContext(client)
  if (!applicationId) throw new Error('Bond application is required.')

  const existing = await client
    .from('transaction_bond_applications')
    .select('id, transaction_id, workflow_id, application_type, bank_name, status')
    .eq('id', applicationId)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (!existing.data) throw new Error('Bond application was not found.')

  const workflow = await fetchRawBondHybridWorkflow(client, existing.data.transaction_id, {
    createIfMissing: false,
  })
  assertBondHybridWorkflowEditable(workflow, activeProfile, actorRole)

  const nextStatus = payload.status ? normalizeBondHybridApplicationStatus(payload.status) : existing.data.status
  const updatePayload = {
    updated_by: activeProfile.userId || null,
  }
  if (payload.bankName !== undefined || payload.bank_name !== undefined)
    updatePayload.bank_name = normalizeNullableText(payload.bankName || payload.bank_name)
  if (payload.status !== undefined) updatePayload.status = nextStatus
  if (payload.submittedAt !== undefined || payload.submitted_at !== undefined)
    updatePayload.submitted_at = normalizeBondWorkflowPayloadDate(payload.submittedAt || payload.submitted_at)
  if (payload.feedbackReceivedAt !== undefined || payload.feedback_received_at !== undefined)
    updatePayload.feedback_received_at = normalizeBondWorkflowPayloadDate(
      payload.feedbackReceivedAt || payload.feedback_received_at,
    )
  if (payload.referenceNumber !== undefined || payload.reference_number !== undefined)
    updatePayload.reference_number = normalizeNullableText(payload.referenceNumber || payload.reference_number)
  if (payload.applicationReference !== undefined || payload.application_reference !== undefined)
    updatePayload.application_reference = normalizeNullableText(
      payload.applicationReference || payload.application_reference,
    )
  if (payload.notes !== undefined) updatePayload.notes = normalizeNullableText(payload.notes)
  if (payload.bondOriginatorId !== undefined || payload.bond_originator_id !== undefined)
    updatePayload.bond_originator_id = normalizeNullableUuid(payload.bondOriginatorId || payload.bond_originator_id)
  if (payload.originatorOrganisationId !== undefined || payload.originator_organisation_id !== undefined)
    updatePayload.originator_organisation_id = normalizeNullableUuid(
      payload.originatorOrganisationId || payload.originator_organisation_id,
    )
  if (
    [
      'feedback_received',
      'quote_received',
      'additional_documents_required',
      'declined',
      'approved',
      'buyer_approved',
    ].includes(nextStatus) &&
    !updatePayload.feedback_received_at
  ) {
    updatePayload.feedback_received_at = new Date().toISOString()
  }

  const update = await client
    .from('transaction_bond_applications')
    .update(updatePayload)
    .eq('id', applicationId)
    .select(
      'id, transaction_id, workflow_id, application_type, bank_name, status, submitted_at, feedback_received_at, reference_number, application_reference, bond_originator_id, originator_organisation_id, submitted_by, notes, created_by, updated_by, created_at, updated_at',
    )
    .single()
  if (update.error) throw update.error

  await persistBondBankOutcome(client, update.data, payload, activeProfile)

  await insertBondHybridWorkflowEvent(client, {
    workflow,
    fromStage: workflow.current_stage,
    toStage: workflow.current_stage,
    eventType: [
      'feedback_received',
      'quote_received',
      'additional_documents_required',
      'declined',
      'approved',
      'buyer_approved',
    ].includes(nextStatus)
      ? 'bank_feedback_added'
      : 'bank_submission_added',
    notes: `${update.data.bank_name}: ${BOND_HYBRID_APPLICATION_STATUS_LABELS[nextStatus] || nextStatus}`,
    createdBy: activeProfile.userId || null,
  })
  await logBondHybridWorkflowActivity(client, {
    transactionId: existing.data.transaction_id,
    actorRole,
    message: buildBondHybridWorkflowActivityMessage({
      action: 'application_updated',
      bankName: update.data.bank_name,
    }),
    eventType: 'BondHybridFinanceApplicationUpdated',
    eventData: {
      workflowId: workflow.id,
      applicationId,
      bankName: update.data.bank_name,
      status: nextStatus,
    },
  })

  if (nextStatus === 'submitted') {
    await processWorkflowEvidenceIfPossible(client, {
      transactionId: existing.data.transaction_id,
      evidenceType: 'external_status',
      evidenceId: applicationId,
      evidenceKey: 'bond_documents_reviewed',
      status: 'approved',
      source: 'bond_application_updated',
      createdBy: activeProfile.userId || null,
      payload: {
        bankName: update.data.bank_name,
        status: nextStatus,
      },
    })
  }

  if (['submitted', 'feedback_received', 'quote_received', 'approved', 'buyer_approved'].includes(nextStatus)) {
    await processWorkflowEvidenceIfPossible(client, {
      transactionId: existing.data.transaction_id,
      evidenceType: 'external_status',
      evidenceId: applicationId,
      evidenceKey: nextStatus === 'submitted' ? 'bank_applications_submitted' : 'bank_feedback_received',
      status: nextStatus,
      source: 'bond_application_updated',
      createdBy: activeProfile.userId || null,
      payload: {
        bankName: update.data.bank_name,
      },
    })
  }

  return getTransactionFinanceWorkflow(existing.data.transaction_id, {
    client,
  })
}

export async function recordBondBankOutcome(applicationId, payload = {}, options = {}) {
  const outcome = normalizeBondBankOutcome(payload.outcome)
  if (!outcome) throw new Error('Choose a valid bank outcome.')
  const statusByOutcome = {
    approved: 'approved',
    declined: 'declined',
    conditional: 'feedback_received',
    additional_documents_required: 'additional_documents_required',
    withdrawn: 'expired',
    expired: 'expired',
  }
  return updateBondApplication(applicationId, {
    ...payload,
    status: statusByOutcome[outcome],
    bankOutcome: { ...payload, outcome },
  }, options)
}

export async function addBondQuote(transactionId, payload = {}, options = {}) {
  const client = options.client || requireClient()
  const actorRole = options.actorRole || null
  const activeProfile = await resolveActiveProfileContext(client)
  const workflow = await fetchRawBondHybridWorkflow(client, transactionId, {
    createIfMissing: true,
  })
  if (!workflow?.id) throw new Error('Bond / Hybrid finance workflow is not available.')
  assertBondHybridWorkflowEditable(workflow, activeProfile, actorRole)

  const bankName = normalizeNullableText(payload.bankName || payload.bank_name)
  if (!bankName) throw new Error('Bank / lender name is required.')
  const quoteStatus = normalizeBondHybridQuoteStatus(payload.quoteStatus || payload.quote_status || 'received')

  const insert = await client
    .from('transaction_bond_quotes')
    .insert({
      transaction_id: transactionId,
      workflow_id: workflow.id,
      bond_application_id: normalizeNullableText(payload.bondApplicationId || payload.bond_application_id),
      bank_name: bankName,
      quoted_amount: normalizeBondWorkflowPayloadNumber(payload.quotedAmount ?? payload.quoted_amount),
      interest_rate: normalizeBondWorkflowPayloadNumber(payload.interestRate ?? payload.interest_rate),
      interest_rate_type: normalizeNullableText(payload.interestRateType || payload.interest_rate_type),
      interest_rate_margin: normalizeBondWorkflowPayloadNumber(
        payload.interestRateMargin ?? payload.interest_rate_margin,
      ),
      interest_rate_display: normalizeNullableText(payload.interestRateDisplay || payload.interest_rate_display),
      monthly_repayment: normalizeBondWorkflowPayloadNumber(payload.monthlyRepayment ?? payload.monthly_repayment),
      term_months: normalizeBondWorkflowPayloadInteger(payload.termMonths ?? payload.term_months),
      quote_status: quoteStatus,
      quote_received_at:
        normalizeBondWorkflowPayloadDate(payload.quoteReceivedAt || payload.quote_received_at) ||
        new Date().toISOString(),
      quote_expiry_at: normalizeBondWorkflowPayloadDate(payload.quoteExpiryAt || payload.quote_expiry_at),
      valid_until: normalizeNullableText(payload.validUntil || payload.valid_until) || null,
      quote_document_id: normalizeNullableUuid(payload.quoteDocumentId || payload.quote_document_id) || null,
      approved_at: quoteStatus === 'approved_by_buyer' ? new Date().toISOString() : null,
      notes: normalizeNullableText(payload.notes),
      uploaded_by: activeProfile.userId || null,
      created_by: activeProfile.userId || null,
      updated_by: activeProfile.userId || null,
    })
    .select(
      'id, transaction_id, workflow_id, bond_application_id, bank_name, quoted_amount, interest_rate, interest_rate_type, interest_rate_margin, interest_rate_display, monthly_repayment, term_months, quote_status, quote_received_at, quote_expiry_at, valid_until, quote_document_id, uploaded_by, approved_at, notes, created_by, updated_by, created_at, updated_at',
    )
    .single()

  if (insert.error) throw insert.error
  await insertBondHybridWorkflowEvent(client, {
    workflow,
    fromStage: workflow.current_stage,
    toStage: workflow.current_stage,
    eventType: 'quote_added',
    notes: `${bankName}: ${BOND_HYBRID_QUOTE_STATUS_LABELS[quoteStatus] || quoteStatus}`,
    createdBy: activeProfile.userId || null,
  })
  await logBondHybridWorkflowActivity(client, {
    transactionId,
    actorRole,
    message: buildBondHybridWorkflowActivityMessage({
      action: 'quote_added',
      bankName,
    }),
    eventType: 'BondHybridFinanceQuoteUpdated',
    eventData: {
      workflowId: workflow.id,
      quoteId: insert.data.id,
      bankName,
      quoteStatus,
    },
  })

  if (quoteStatus === 'approved_by_buyer') {
    return approveBondQuote(insert.data.id, { client, actorRole })
  }

  if (getBondHybridFinanceStageIndex(workflow.current_stage) < getBondHybridFinanceStageIndex('quote_received')) {
    await updateBondHybridFinanceStage(transactionId, 'quote_received', {
      client,
      actorRole,
      notes: `${bankName} offer received.`,
    })
  }

  return getTransactionFinanceWorkflow(transactionId, { client })
}

export async function updateBondQuote(quoteId, payload = {}, options = {}) {
  const client = options.client || requireClient()
  const actorRole = options.actorRole || null
  const activeProfile = await resolveActiveProfileContext(client)
  if (!quoteId) throw new Error('Bond quote is required.')

  const existing = await client
    .from('transaction_bond_quotes')
    .select('id, transaction_id, workflow_id, bank_name, quote_status')
    .eq('id', quoteId)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (!existing.data) throw new Error('Bond quote was not found.')

  const workflow = await fetchRawBondHybridWorkflow(client, existing.data.transaction_id, {
    createIfMissing: false,
  })
  assertBondHybridWorkflowEditable(workflow, activeProfile, actorRole)
  const quoteStatus =
    payload.quoteStatus || payload.quote_status
      ? normalizeBondHybridQuoteStatus(payload.quoteStatus || payload.quote_status)
      : existing.data.quote_status
  if (quoteStatus === 'approved_by_buyer') {
    return approveBondQuote(quoteId, { client, actorRole })
  }

  const updatePayload = {
    updated_by: activeProfile.userId || null,
  }
  if (payload.bondApplicationId !== undefined || payload.bond_application_id !== undefined)
    updatePayload.bond_application_id = normalizeNullableText(payload.bondApplicationId || payload.bond_application_id)
  if (payload.bankName !== undefined || payload.bank_name !== undefined)
    updatePayload.bank_name = normalizeNullableText(payload.bankName || payload.bank_name)
  if (payload.quotedAmount !== undefined || payload.quoted_amount !== undefined)
    updatePayload.quoted_amount = normalizeBondWorkflowPayloadNumber(payload.quotedAmount ?? payload.quoted_amount)
  if (payload.interestRate !== undefined || payload.interest_rate !== undefined)
    updatePayload.interest_rate = normalizeBondWorkflowPayloadNumber(payload.interestRate ?? payload.interest_rate)
  if (payload.interestRateType !== undefined || payload.interest_rate_type !== undefined)
    updatePayload.interest_rate_type = normalizeNullableText(payload.interestRateType || payload.interest_rate_type)
  if (payload.interestRateMargin !== undefined || payload.interest_rate_margin !== undefined)
    updatePayload.interest_rate_margin = normalizeBondWorkflowPayloadNumber(
      payload.interestRateMargin ?? payload.interest_rate_margin,
    )
  if (payload.interestRateDisplay !== undefined || payload.interest_rate_display !== undefined)
    updatePayload.interest_rate_display = normalizeNullableText(
      payload.interestRateDisplay || payload.interest_rate_display,
    )
  if (payload.monthlyRepayment !== undefined || payload.monthly_repayment !== undefined)
    updatePayload.monthly_repayment = normalizeBondWorkflowPayloadNumber(
      payload.monthlyRepayment ?? payload.monthly_repayment,
    )
  if (payload.termMonths !== undefined || payload.term_months !== undefined)
    updatePayload.term_months = normalizeBondWorkflowPayloadInteger(payload.termMonths ?? payload.term_months)
  if (payload.quoteStatus !== undefined || payload.quote_status !== undefined) updatePayload.quote_status = quoteStatus
  if (payload.quoteReceivedAt !== undefined || payload.quote_received_at !== undefined)
    updatePayload.quote_received_at = normalizeBondWorkflowPayloadDate(
      payload.quoteReceivedAt || payload.quote_received_at,
    )
  if (payload.quoteExpiryAt !== undefined || payload.quote_expiry_at !== undefined)
    updatePayload.quote_expiry_at = normalizeBondWorkflowPayloadDate(payload.quoteExpiryAt || payload.quote_expiry_at)
  if (payload.validUntil !== undefined || payload.valid_until !== undefined)
    updatePayload.valid_until = normalizeNullableText(payload.validUntil || payload.valid_until) || null
  if (payload.quoteDocumentId !== undefined || payload.quote_document_id !== undefined)
    updatePayload.quote_document_id = normalizeNullableUuid(payload.quoteDocumentId || payload.quote_document_id)
  if (payload.notes !== undefined) updatePayload.notes = normalizeNullableText(payload.notes)
  if (quoteStatus !== 'approved_by_buyer') updatePayload.approved_at = null

  const update = await client
    .from('transaction_bond_quotes')
    .update(updatePayload)
    .eq('id', quoteId)
    .select(
      'id, transaction_id, workflow_id, bond_application_id, bank_name, quoted_amount, interest_rate, interest_rate_type, interest_rate_margin, interest_rate_display, monthly_repayment, term_months, quote_status, quote_received_at, quote_expiry_at, valid_until, quote_document_id, approved_at, notes, created_by, updated_by, created_at, updated_at',
    )
    .single()
  if (update.error) throw update.error

  await logBondHybridWorkflowActivity(client, {
    transactionId: existing.data.transaction_id,
    actorRole,
    message: buildBondHybridWorkflowActivityMessage({
      action: 'quote_updated',
      bankName: update.data.bank_name,
    }),
    eventType: 'BondHybridFinanceQuoteUpdated',
    eventData: {
      workflowId: workflow.id,
      quoteId,
      bankName: update.data.bank_name,
      quoteStatus,
    },
  })

  return getTransactionFinanceWorkflow(existing.data.transaction_id, {
    client,
  })
}

export async function approveBondQuote(quoteId, options = {}) {
  return recordBondOfferDecision(quoteId, { ...options, decision: 'accepted' })
}

export async function recordBondOfferDecision(
  quoteId,
  { decision = 'accepted', notes = '', client: providedClient = null, token = '' } = {},
) {
  const client = providedClient || (token ? requireClientPortalTokenClient(token) : requireClient())
  if (!quoteId) throw new Error('Bond offer is required.')
  const normalizedDecision = String(decision || '').trim().toLowerCase()
  if (!['accepted', 'declined'].includes(normalizedDecision)) throw new Error('Decision must be accepted or declined.')
  const result = await client.rpc('bridge_record_bond_offer_decision', {
    p_offer_id: quoteId, p_decision: normalizedDecision, p_notes: normalizeNullableText(notes) || '',
  })
  if (result.error) throw result.error
  // The anonymous portal must not run professional workflow/event writes.
  if (token) return fetchClientPortalOriginatorFinanceByToken(token)
  return getTransactionFinanceWorkflow(result.data.transactionId, { client })
}

export async function declineBondQuote(quoteId, options = {}) {
  return recordBondOfferDecision(quoteId, {
    ...options,
    decision: 'declined',
  })
}

const BOND_GRANT_MILESTONE_STAGES = new Set(['bond_approved', 'grant_received', 'grant_signed', 'grant_submitted'])

function buildGrantMilestoneNotes(stage, notes = '') {
  const explicitNotes = normalizeNullableText(notes)
  if (explicitNotes) return explicitNotes
  const stageLabel = getBondHybridFinanceStageLabel(stage)
  return `${stageLabel} recorded.`
}

export async function recordBondGrantMilestone(transactionId, payload = {}, options = {}) {
  const client = options.client || requireClient()
  const actorRole = options.actorRole || null
  const activeProfile = await resolveActiveProfileContext(client)
  const milestone = normalizeBondHybridFinanceStage(
    payload.stage || payload.milestone || options.stage || 'bond_approved',
  )
  if (!BOND_GRANT_MILESTONE_STAGES.has(milestone)) {
    throw new Error('Bond grant milestone is not valid.')
  }

  const workflow = await fetchRawBondHybridWorkflow(client, transactionId, {
    createIfMissing: true,
  })
  if (!workflow?.id) throw new Error('Bond / Hybrid finance workflow is not available.')
  assertBondHybridWorkflowEditable(workflow, activeProfile, actorRole)

  if (milestone === 'bond_approved') {
    return updateBondHybridFinanceStage(transactionId, 'bond_approved', {
      ...options,
      client,
      notes: buildGrantMilestoneNotes('bond_approved', payload.notes || options.notes),
      actorRole,
    })
  }

  const snapshot = await getTransactionFinanceWorkflow(transactionId, {
    client,
  })
  const existingInstruction = await fetchBondInstructionEvidence(client, transactionId)
  const acceptedOfferId = normalizeNullableUuid(
    payload.acceptedBondOfferId ||
      payload.accepted_bond_offer_id ||
      options.acceptedBondOfferId ||
      options.accepted_bond_offer_id ||
      snapshot?.acceptedOffer?.id ||
      existingInstruction?.accepted_bond_offer_id ||
      snapshot?.instruction?.acceptedBondOfferId,
  )
  const grantDocumentId = normalizeNullableUuid(
    payload.grantDocumentId ||
      payload.grant_document_id ||
      options.grantDocumentId ||
      options.grant_document_id ||
      existingInstruction?.grant_document_id,
  )
  const signedGrantDocumentId = normalizeNullableUuid(
    payload.signedGrantDocumentId ||
      payload.signed_grant_document_id ||
      options.signedGrantDocumentId ||
      options.signed_grant_document_id ||
      existingInstruction?.signed_grant_document_id,
  )

  if (!grantDocumentId) {
    throw new Error('Attach the bond grant document before moving to Grant Received.')
  }
  if (['grant_signed', 'grant_submitted'].includes(milestone) && !signedGrantDocumentId) {
    throw new Error('Attach the signed bond grant before moving to Grant Signed.')
  }

  const now = new Date().toISOString()
  const instructionPayload = {
    transaction_id: transactionId,
    accepted_bond_offer_id: acceptedOfferId,
    notes: buildGrantMilestoneNotes(milestone, payload.notes || options.notes),
  }

  if (['grant_received', 'grant_signed', 'grant_submitted'].includes(milestone)) {
    Object.assign(instructionPayload, {
      grant_received: true,
      grant_received_at: existingInstruction?.grant_received_at || now,
      grant_received_by: existingInstruction?.grant_received_by || activeProfile.userId || null,
      grant_document_id: grantDocumentId,
    })
  }
  if (['grant_signed', 'grant_submitted'].includes(milestone)) {
    Object.assign(instructionPayload, {
      grant_signed: true,
      grant_signed_at: existingInstruction?.grant_signed_at || now,
      grant_signed_by: existingInstruction?.grant_signed_by || activeProfile.userId || null,
      signed_grant_document_id: signedGrantDocumentId,
    })
  }
  if (milestone === 'grant_submitted') {
    Object.assign(instructionPayload, {
      grant_submitted: true,
      grant_submitted_at: existingInstruction?.grant_submitted_at || now,
      grant_submitted_by: activeProfile.userId || null,
    })
  }

  const instructionWrite = existingInstruction?.id
    ? await client.from('transaction_bond_instructions').update(instructionPayload).eq('id', existingInstruction.id)
    : await client.from('transaction_bond_instructions').insert(instructionPayload)

  if (instructionWrite.error && !isMissingTableError(instructionWrite.error, 'transaction_bond_instructions')) {
    throw instructionWrite.error
  }

  return updateBondHybridFinanceStage(transactionId, milestone, {
    ...options,
    client,
    notes: buildGrantMilestoneNotes(milestone, payload.notes || options.notes),
    actorRole,
  })
}

export async function markFinanceInstructionSent(transactionId, options = {}) {
  const client = options.client || requireClient()
  const actorRole = options.actorRole || null
  const activeProfile = await resolveActiveProfileContext(client)
  const workflow = await fetchRawBondHybridWorkflow(client, transactionId, {
    createIfMissing: true,
  })
  if (!workflow?.id) throw new Error('Bond / Hybrid finance workflow is not available.')
  assertBondHybridWorkflowEditable(workflow, activeProfile, actorRole)

  const snapshot = await getTransactionFinanceWorkflow(transactionId, {
    client,
  })
  const acceptedOfferId = normalizeNullableUuid(
    options.acceptedBondOfferId ||
      options.accepted_bond_offer_id ||
      snapshot?.acceptedOffer?.id ||
      snapshot?.instruction?.acceptedBondOfferId,
  )

  const existingInstruction = await client
    .from('transaction_bond_instructions')
    .select('*')
    .eq('transaction_id', transactionId)
    .maybeSingle()

  if (existingInstruction.error && !isMissingTableError(existingInstruction.error, 'transaction_bond_instructions')) {
    throw existingInstruction.error
  }
  const instructionDocumentId =
    normalizeNullableUuid(options.instructionDocumentId || options.instruction_document_id) ||
    existingInstruction.data?.instruction_document_id ||
    null
  if (!instructionDocumentId) {
    throw new Error('Attach the attorney instruction document before marking instruction sent.')
  }

  const instructionPayload = {
    transaction_id: transactionId,
    accepted_bond_offer_id: acceptedOfferId || existingInstruction.data?.accepted_bond_offer_id || null,
    instruction_sent: true,
    instruction_sent_at: new Date().toISOString(),
    instruction_sent_by: activeProfile.userId || null,
    instruction_document_id: instructionDocumentId,
    notes: normalizeNullableText(options.notes || 'Finance instruction sent.'),
  }

  const instructionWrite = existingInstruction.data?.id
    ? await client
        .from('transaction_bond_instructions')
        .update(instructionPayload)
        .eq('id', existingInstruction.data.id)
    : await client.from('transaction_bond_instructions').insert(instructionPayload)

  if (instructionWrite.error && !isMissingTableError(instructionWrite.error, 'transaction_bond_instructions')) {
    throw instructionWrite.error
  }

  return updateBondHybridFinanceStage(transactionId, 'instruction_sent', {
    ...options,
    client,
    notes: options.notes || 'Finance instruction sent.',
    actorRole,
  })
}

export const __transactionBondApplicationClassificationTestUtils = Object.freeze({
  ensureBondApplicationWorkspaceRecord,
})

function normalizePreApprovalCaptureStatus(value = '', fallback = BOND_APPLICATION_PRE_APPROVAL_STATUSES.submitted) {
  const normalized = String(value || '').trim().toLowerCase().replace(/-/g, '_')
  if (['pre_approved', 'accepted', 'approved_by_buyer', 'buyer_approved'].includes(normalized)) {
    return BOND_APPLICATION_PRE_APPROVAL_STATUSES.approved
  }
  if (normalized === 'not_approved' || normalized === 'rejected') return BOND_APPLICATION_PRE_APPROVAL_STATUSES.declined
  if (Object.values(BOND_APPLICATION_PRE_APPROVAL_STATUSES).includes(normalized)) return normalized
  return fallback
}

function mapPreApprovalCaptureStatusToApplicationStatus(status = '') {
  const normalized = normalizePreApprovalCaptureStatus(status, BOND_APPLICATION_PRE_APPROVAL_STATUSES.submitted)
  if (normalized === BOND_APPLICATION_PRE_APPROVAL_STATUSES.approved) return 'approved'
  if (normalized === BOND_APPLICATION_PRE_APPROVAL_STATUSES.declined) return 'declined'
  if (normalized === BOND_APPLICATION_PRE_APPROVAL_STATUSES.expired) return 'expired'
  return 'submitted'
}

function normalizePreApprovalCaptureConditions(value = []) {
  if (Array.isArray(value)) {
    return value
      .map((item) => typeof item === 'string' ? item : item?.label || item?.title || item?.description || '')
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  }
  return String(value || '')
    .split(/\n|;/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function buildPreApprovalCaptureRecord(currentPreApproval = {}, payload = {}, now = new Date().toISOString()) {
  const status = normalizePreApprovalCaptureStatus(payload.outcome || payload.status)
  return {
    ...(currentPreApproval || {}),
    status,
    provider: normalizeNullableText(
      payload.providerName ||
        payload.provider ||
        payload.bankName ||
        payload.bank_name ||
        currentPreApproval?.provider,
    ),
    approvedAmount:
      payload.approvedAmount ??
      payload.approved_amount ??
      payload.quotedAmount ??
      payload.quoted_amount ??
      currentPreApproval?.approvedAmount ??
      null,
    issuedAt:
      normalizeBondWorkflowPayloadDate(payload.issuedAt || payload.issued_at || payload.outcomeAt || payload.outcome_at) ||
      (status === BOND_APPLICATION_PRE_APPROVAL_STATUSES.approved ? now : currentPreApproval?.issuedAt || null),
    expiresAt:
      normalizeBondWorkflowPayloadDate(payload.expiresAt || payload.expires_at || payload.validUntil || payload.valid_until) ||
      currentPreApproval?.expiresAt ||
      null,
    referenceNumber: normalizeNullableText(
      payload.referenceNumber ||
        payload.reference_number ||
        payload.applicationReference ||
        payload.application_reference ||
        currentPreApproval?.referenceNumber,
    ),
    conditions: normalizePreApprovalCaptureConditions(payload.conditions ?? currentPreApproval?.conditions),
    certificateDocumentId:
      normalizeNullableUuid(payload.certificateDocumentId || payload.certificate_document_id) ||
      currentPreApproval?.certificateDocumentId ||
      null,
  }
}

async function persistTransactionPreApprovalState(client, {
  transaction = {},
  onboarding = {},
  preApproval = {},
  now = new Date().toISOString(),
} = {}) {
  const transactionId = normalizeNullableUuid(transaction?.id || transaction?.transaction_id)
  const existingFormData = onboarding?.form_data && typeof onboarding.form_data === 'object' ? onboarding.form_data : {}
  const normalizedApplication = transactionId ? await fetchNormalizedBondApplicationBundle(client, transactionId) : null

  if (normalizedApplication?.id) {
    const nextNormalized = cloneBondApplicationValue(normalizedApplication)
    nextNormalized.revision = Math.max(Number(nextNormalized.revision) || 1, 1) + 1
    nextNormalized.sharedSections = {
      ...(nextNormalized.sharedSections || {}),
      pre_approval: cloneBondApplicationValue(preApproval || {}),
    }
    nextNormalized.metadata = {
      ...(nextNormalized.metadata || {}),
      preApprovalOutcome: {
        status: preApproval.status,
        provider: preApproval.provider,
        capturedAt: now,
      },
    }
    const appUpdate = await client
      .from('bond_applications')
      .update({
        revision: nextNormalized.revision,
        metadata: nextNormalized.metadata || {},
        updated_at: now,
      })
      .eq('id', normalizedApplication.id)
    if (appUpdate.error && !isPermissionDeniedError(appUpdate.error) && !isMissingSchemaError(appUpdate.error)) {
      throw appUpdate.error
    }
    await persistNormalizedApplicationSharedSection(client, normalizedApplication.id, 'pre_approval', nextNormalized.sharedSections.pre_approval)
    return persistNormalizedCompatibilityProjection(client, nextNormalized, existingFormData)
  }

  const applicationState = buildBondApplicationState({
    transaction,
    onboardingFormData: {
      id: onboarding?.id || null,
      formData: existingFormData,
    },
  })
  applicationState.application.preApproval = {
    ...(applicationState.application.preApproval || {}),
    ...(preApproval || {}),
  }
  const legacy = toLegacyBondApplication(applicationState)
  const payload = buildLegacyBondApplicationPersistencePayload({
    existingFormData,
    legacyBondApplication: legacy,
    submitted: false,
    timestamp: now,
  })
  if (onboarding?.id) {
    const update = await client
      .from('onboarding_form_data')
      .update({ form_data: payload.formData, updated_at: now })
      .eq('id', onboarding.id)
    if (update.error && !isPermissionDeniedError(update.error) && !isMissingSchemaError(update.error)) throw update.error
  }
  return { legacy: payload.draftToPersist, formData: payload.formData }
}

async function persistNormalizedApplicationSharedSection(client, normalizedApplicationId, sectionKey, answers = {}) {
  if (!normalizedApplicationId || !sectionKey) return null
  const now = new Date().toISOString()
  const update = await client
    .from('bond_application_sections')
    .update({
      answers_json: answers || {},
      status: 'in_progress',
      updated_at: now,
    })
    .eq('bond_application_id', normalizedApplicationId)
    .eq('section_key', sectionKey)
    .is('participant_id', null)
    .select('id')
    .maybeSingle()

  if (update.error && !isMissingSchemaError(update.error) && !isPermissionDeniedError(update.error)) throw update.error
  if (update.data?.id) return update.data

  const insert = await client
    .from('bond_application_sections')
    .insert({
      bond_application_id: normalizedApplicationId,
      scope: 'application',
      section_key: sectionKey,
      answers_json: answers || {},
      status: 'in_progress',
    })
    .select('id')
    .single()
  if (insert.error) {
    if (insert.error.code === '23505') return null
    if (isMissingSchemaError(insert.error) || isPermissionDeniedError(insert.error)) return null
    throw insert.error
  }
  return insert.data || null
}

async function fetchBondProviderApplicationRow(client, { workflowId = '', applicationId = '', providerName = '' } = {}) {
  const normalizedApplicationId = normalizeNullableUuid(applicationId)
  if (normalizedApplicationId) {
    const query = await client
      .from('transaction_bond_applications')
      .select('id, transaction_id, workflow_id, application_type, bank_name, status')
      .eq('id', normalizedApplicationId)
      .maybeSingle()
    if (query.error) throw query.error
    if (query.data?.id) return query.data
  }
  const bankName = normalizeNullableText(providerName)
  if (!workflowId || !bankName) return null
  const query = await client
    .from('transaction_bond_applications')
    .select('id, transaction_id, workflow_id, application_type, bank_name, status')
    .eq('workflow_id', workflowId)
    .eq('bank_name', bankName)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (query.error) throw query.error
  return query.data || null
}

export async function recordTransactionPreApprovalOutcome(transactionId, payload = {}, options = {}) {
  const client = options.client || requireClient()
  const actorRole = options.actorRole || null
  const activeProfile = await resolveActiveProfileContext(client)
  const normalizedTransactionId = normalizeNullableUuid(transactionId)
  if (!normalizedTransactionId) throw new Error('Transaction is required.')

  const transactionQuery = await client
    .from('transactions')
    .select('id, purchaser_type, finance_type')
    .eq('id', normalizedTransactionId)
    .maybeSingle()
  if (transactionQuery.error) throw transactionQuery.error
  if (!transactionQuery.data?.id) throw new Error('Transaction was not found.')

  const onboarding = await getOrCreateTransactionOnboardingRecord(client, {
    transactionId: normalizedTransactionId,
    purchaserType: transactionQuery.data.purchaser_type || 'individual',
  })
  if (!onboarding?.id) throw new Error('Transaction onboarding is not set up yet.')

  const now = new Date().toISOString()
  const outcomeStatus = normalizePreApprovalCaptureStatus(payload.outcome || payload.status)
  const providerName = normalizeNullableText(payload.providerName || payload.provider || payload.bankName || payload.bank_name)
  if (!providerName) throw new Error('Assessment provider is required.')

  const workflow = await fetchRawBondHybridWorkflow(client, normalizedTransactionId, { createIfMissing: true })
  if (!workflow?.id) throw new Error('Bond / Hybrid finance workflow is not available.')
  assertBondHybridWorkflowEditable(workflow, activeProfile, actorRole)

  const applicationStatus = mapPreApprovalCaptureStatusToApplicationStatus(outcomeStatus)
  const outcomeAt =
    normalizeBondWorkflowPayloadDate(payload.outcomeAt || payload.outcome_at || payload.issuedAt || payload.issued_at) ||
    now
  let applicationRow = await fetchBondProviderApplicationRow(client, {
    workflowId: workflow.id,
    applicationId: payload.applicationId || payload.application_id || payload.bondApplicationId || payload.bond_application_id,
    providerName,
  })

  if (applicationRow?.id) {
    await updateBondApplication(applicationRow.id, {
      status: applicationStatus,
      feedbackReceivedAt: outcomeStatus === BOND_APPLICATION_PRE_APPROVAL_STATUSES.submitted ? null : outcomeAt,
      referenceNumber: payload.referenceNumber || payload.reference_number || payload.applicationReference || payload.application_reference,
      notes: payload.notes,
      bankOutcome: {
        outcome: applicationStatus,
        outcomeAt,
        approvedAmount: payload.approvedAmount || payload.approved_amount || payload.quotedAmount || payload.quoted_amount,
        conditions: normalizePreApprovalCaptureConditions(payload.conditions).join('\n'),
        declineReason: payload.declineReason || payload.decline_reason,
        notes: payload.notes,
      },
    }, { client, actorRole })
  } else {
    await addBondApplication(normalizedTransactionId, {
      bankName: providerName,
      status: applicationStatus,
      submittedAt: payload.submittedAt || payload.submitted_at || outcomeAt,
      feedbackReceivedAt: outcomeStatus === BOND_APPLICATION_PRE_APPROVAL_STATUSES.submitted ? null : outcomeAt,
      referenceNumber: payload.referenceNumber || payload.reference_number || payload.applicationReference || payload.application_reference,
      notes: payload.notes,
    }, { client, actorRole })
    applicationRow = await fetchBondProviderApplicationRow(client, {
      workflowId: workflow.id,
      providerName,
    })
  }

  if (outcomeStatus === BOND_APPLICATION_PRE_APPROVAL_STATUSES.approved) {
    const existingQuote = await client
      .from('transaction_bond_quotes')
      .select('id')
      .eq('workflow_id', workflow.id)
      .eq('bank_name', providerName)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existingQuote.error && !isMissingTableError(existingQuote.error, 'transaction_bond_quotes') && !isMissingSchemaError(existingQuote.error)) {
      throw existingQuote.error
    }
    if (!existingQuote.data?.id) {
      await addBondQuote(normalizedTransactionId, {
        bankName: providerName,
        bondApplicationId: applicationRow?.id || payload.bondApplicationId || payload.bond_application_id,
        quotedAmount: payload.approvedAmount || payload.approved_amount || payload.quotedAmount || payload.quoted_amount,
        interestRate: payload.interestRate || payload.interest_rate,
        interestRateDisplay: payload.interestRateDisplay || payload.interest_rate_display,
        termMonths: payload.termMonths || payload.term_months,
        quoteStatus: 'received',
        quoteReceivedAt: outcomeAt,
        quoteExpiryAt: payload.expiresAt || payload.expires_at || payload.validUntil || payload.valid_until,
        validUntil: payload.validUntil || payload.valid_until || payload.expiresAt || payload.expires_at,
        notes: payload.notes,
      }, { client, actorRole })
    }
  }

  const existingState = buildBondApplicationState({
    transaction: transactionQuery.data,
    onboardingFormData: {
      id: onboarding.id,
      formData: onboarding.form_data || {},
    },
  })
  const preApproval = buildPreApprovalCaptureRecord(existingState.application.preApproval || {}, {
    ...payload,
    providerName,
    outcome: outcomeStatus,
    outcomeAt,
  }, now)
  await persistTransactionPreApprovalState(client, {
    transaction: transactionQuery.data,
    onboarding,
    preApproval,
    now,
  })

  await insertBondHybridWorkflowEvent(client, {
    workflow,
    fromStage: workflow.current_stage,
    toStage: workflow.current_stage,
    eventType: 'pre_approval_outcome_captured',
    notes: `${providerName}: pre-approval ${outcomeStatus}.`,
    createdBy: activeProfile.userId || null,
  })
  await logBondHybridWorkflowActivity(client, {
    transactionId: normalizedTransactionId,
    actorRole,
    message: `${providerName} pre-approval outcome captured: ${outcomeStatus}.`,
    eventType: 'BondApplicationPreApprovalOutcomeCaptured',
    eventData: {
      source: 'bond_application_pre_approval_outcome',
      providerName,
      outcome: outcomeStatus,
      applicationId: applicationRow?.id || null,
    },
  })

  return fetchTransactionById(normalizedTransactionId)
}

export async function convertTransactionPreApprovalToBondApplication(transactionId, options = {}) {
  const client = options.client || requireClient()
  const actorRole = options.actorRole || null
  const activeProfile = await resolveActiveProfileContext(client)
  const normalizedTransactionId = normalizeNullableUuid(transactionId)
  if (!normalizedTransactionId) throw new Error('Transaction is required.')

  const transactionQuery = await client
    .from('transactions')
    .select('id, purchaser_type, finance_type')
    .eq('id', normalizedTransactionId)
    .maybeSingle()
  if (transactionQuery.error) throw transactionQuery.error
  if (!transactionQuery.data?.id) throw new Error('Transaction was not found.')

  const onboarding = await getOrCreateTransactionOnboardingRecord(client, {
    transactionId: normalizedTransactionId,
    purchaserType: transactionQuery.data.purchaser_type || 'individual',
  })
  if (!onboarding?.id) throw new Error('Transaction onboarding is not set up yet.')

  const existingFormData = onboarding.form_data && typeof onboarding.form_data === 'object' ? onboarding.form_data : {}
  const now = new Date().toISOString()
  const workflow = await fetchRawBondHybridWorkflow(client, normalizedTransactionId, { createIfMissing: true })
  if (workflow?.id) {
    assertBondHybridWorkflowEditable(workflow, activeProfile, actorRole)
  }
  const normalizedApplication = await fetchNormalizedBondApplicationBundle(client, normalizedTransactionId)
  let convertedState = null

  if (normalizedApplication?.id) {
    const converted = convertNormalizedPreApprovalToBondApplication({
      normalizedApplication,
      now,
      preserveSelectedBankIds: options.preserveSelectedBankIds === true,
      preApproval: options.preApproval || {},
    })
    convertedState = converted.applicationState
    const appUpdate = await client
      .from('bond_applications')
      .update({
        status: converted.normalizedApplication.status,
        revision: converted.normalizedApplication.revision,
        active_submission_id: null,
        locked_at: null,
        submitted_at: null,
        metadata: converted.normalizedApplication.metadata || {},
        updated_at: now,
      })
      .eq('id', normalizedApplication.id)
    if (appUpdate.error && !isPermissionDeniedError(appUpdate.error) && !isMissingSchemaError(appUpdate.error)) throw appUpdate.error

    for (const sectionKey of ['application_intent', 'pre_approval', 'selected_banks']) {
      await persistNormalizedApplicationSharedSection(
        client,
        normalizedApplication.id,
        sectionKey,
        converted.normalizedApplication.sharedSections?.[sectionKey] || {},
      )
    }
    await persistNormalizedCompatibilityProjection(client, converted.normalizedApplication, existingFormData)
  } else {
    const applicationState = buildBondApplicationState({
      transaction: transactionQuery.data,
      onboardingFormData: {
        id: onboarding.id,
        formData: existingFormData,
      },
    })
    const converted = buildPreApprovalConversionPersistencePayload({
      applicationState,
      existingFormData,
      now,
      preserveSelectedBankIds: options.preserveSelectedBankIds === true,
      preApproval: options.preApproval || {},
    })
    convertedState = converted.applicationState
    const update = await client
      .from('onboarding_form_data')
      .update({ form_data: converted.formData, updated_at: now })
      .eq('id', onboarding.id)
    if (update.error && !isPermissionDeniedError(update.error) && !isMissingSchemaError(update.error)) throw update.error
  }

  const transactionIntentUpdate = await client
    .from('transactions')
    .update({
      bond_application_intent: convertedState?.application?.intent || 'bond_application_with_pre_approval',
      updated_at: now,
    })
    .eq('id', normalizedTransactionId)
  if (
    transactionIntentUpdate.error &&
    !isMissingColumnError(transactionIntentUpdate.error, 'bond_application_intent') &&
    !isMissingSchemaError(transactionIntentUpdate.error) &&
    !isPermissionDeniedError(transactionIntentUpdate.error)
  ) {
    throw transactionIntentUpdate.error
  }

  if (workflow?.id) {
    await insertBondHybridWorkflowEvent(client, {
      workflow,
      fromStage: workflow.current_stage,
      toStage: workflow.current_stage,
      eventType: 'pre_approval_converted',
      notes: 'Pre-approval converted to a full bond application.',
      createdBy: activeProfile.userId || null,
    })
  }
  await logBondHybridWorkflowActivity(client, {
    transactionId: normalizedTransactionId,
    actorRole,
    message: 'Pre-approval converted to a full bond application.',
    eventType: 'BondApplicationPreApprovalConverted',
    eventData: {
      source: 'bond_application_pre_approval_conversion',
      intent: convertedState?.application?.intent || 'bond_application_with_pre_approval',
      convertedAt: now,
    },
  })

  return fetchTransactionById(normalizedTransactionId)
}
