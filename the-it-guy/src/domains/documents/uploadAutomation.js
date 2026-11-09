// documents owns these operations and their existing recovery behavior.
import { logTransactionEventIfPossible } from '../transactions/eventActions.js'
import { normalizeNullableText, isMissingTableError, isMissingColumnError, isMissingSchemaError } from '../../lib/api/shared/readHelpers.js'
import { normalizeDevelopmentSettingChoice } from '../developments/configurationApi.js'
import { normalizeRequiredStatus } from '../../core/documents/documentVaultArchitecture'
import { isBondFinanceType } from '../../core/transactions/financeType'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { RESERVATION_STATUSES } from '../shared/constants.js'
import { processWorkflowEvidenceIfPossible, notifyRolesForTransaction } from '../bond/financeRead.js'
import { computeTransactionReadinessSnapshot } from './readinessSupport.js'
import { normalizeDocumentKeyCandidate } from '../clientPortal/tokenHelpers.js'
import { addTransactionDiscussionComment } from '../transactions/discussionApi.js'
import { advanceTransactionMainStageIfNeeded } from '../transactions/participantInfrastructure.js'

export function isFinanceTypeConstraintError(error) {
  if (!error) {
    return false
  }

  const message = String(error.message || '').toLowerCase()
  return (
    error.code === '23514' && (message.includes('transactions_finance_type_check') || message.includes('finance_type'))
  )
}

export function normalizeAlterationChargeTreatment(value) {
  return normalizeDevelopmentSettingChoice(
    value,
    ['included_in_purchase_price', 'separate_invoice', 'no_charge'],
    'included_in_purchase_price',
  )
}

async function upsertTransactionReadinessIfPossible(client, readiness) {
  if (!readiness?.transactionId) {
    return null
  }

  const payload = {
    transaction_id: readiness.transactionId,
    onboarding_status: readiness.onboardingStatus || 'Not Started',
    onboarding_complete: Boolean(readiness.onboardingComplete),
    docs_complete: Boolean(readiness.docsComplete),
    missing_required_docs: Number(readiness.missingRequiredDocs || 0),
    uploaded_required_docs: Number(readiness.uploadedRequiredDocs || 0),
    total_required_docs: Number(readiness.totalRequiredDocs || 0),
    finance_lane_ready: Boolean(readiness.financeLaneReady),
    attorney_lane_ready: Boolean(readiness.attorneyLaneReady),
    stage_ready: Boolean(readiness.stageReady),
    updated_at: new Date().toISOString(),
  }

  const result = await client
    .from('transaction_readiness_states')
    .upsert(payload, { onConflict: 'transaction_id' })
    .select(
      'id, transaction_id, onboarding_status, onboarding_complete, docs_complete, missing_required_docs, uploaded_required_docs, total_required_docs, finance_lane_ready, attorney_lane_ready, stage_ready, updated_at',
    )
    .maybeSingle()

  if (result.error) {
    if (
      isMissingTableError(result.error, 'transaction_readiness_states') ||
      isMissingColumnError(result.error, 'onboarding_complete')
    ) {
      return null
    }
    throw result.error
  }

  return result.data || null
}

async function matchAndMarkRequiredDocumentFromUpload(
  client,
  { transactionId, documentId, documentName, category, requiredDocumentKey = null } = {},
) {
  if (!transactionId || !documentId) {
    return null
  }

  const requiredRowsQuery = await client
    .from('transaction_required_documents')
    .select('id, transaction_id, document_key, document_label, is_uploaded')
    .eq('transaction_id', transactionId)

  if (requiredRowsQuery.error) {
    if (isMissingTableError(requiredRowsQuery.error, 'transaction_required_documents')) {
      return null
    }
    throw requiredRowsQuery.error
  }

  const requiredRows = requiredRowsQuery.data || []
  if (!requiredRows.length) {
    return null
  }

  const explicitKey = normalizeDocumentKeyCandidate(requiredDocumentKey)
  const categoryKey = normalizeDocumentKeyCandidate(category)
  const nameKey = normalizeDocumentKeyCandidate(documentName)

  let matched = requiredRows.find((row) => normalizeDocumentKeyCandidate(row.document_key) === explicitKey)

  if (!matched && categoryKey) {
    matched = requiredRows.find((row) => normalizeDocumentKeyCandidate(row.document_key) === categoryKey)
    if (!matched) {
      matched = requiredRows.find((row) => normalizeDocumentKeyCandidate(row.document_label) === categoryKey)
    }
  }

  if (!matched && nameKey) {
    matched = requiredRows.find((row) => nameKey.includes(normalizeDocumentKeyCandidate(row.document_key)))
    if (!matched) {
      matched = requiredRows.find((row) => nameKey.includes(normalizeDocumentKeyCandidate(row.document_label)))
    }
  }

  if (!matched) {
    return null
  }

  const updateResult = await client
    .from('transaction_required_documents')
    .update({
      is_uploaded: true,
      uploaded_document_id: documentId,
      status: 'uploaded',
      uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', matched.id)
    .select('id, transaction_id, document_key, document_label, is_uploaded, uploaded_document_id, sort_order')
    .single()

  if (updateResult.error) {
    if (isMissingColumnError(updateResult.error, 'status') || isMissingColumnError(updateResult.error, 'uploaded_at')) {
      const legacyUpdateResult = await client
        .from('transaction_required_documents')
        .update({
          is_uploaded: true,
          uploaded_document_id: documentId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', matched.id)
        .select('id, transaction_id, document_key, document_label, is_uploaded, uploaded_document_id, sort_order')
        .single()

      if (legacyUpdateResult.error) {
        if (isMissingTableError(legacyUpdateResult.error, 'transaction_required_documents')) {
          return null
        }
        throw legacyUpdateResult.error
      }

      return legacyUpdateResult.data
    }

    if (isMissingTableError(updateResult.error, 'transaction_required_documents')) {
      return null
    }
    throw updateResult.error
  }

  return updateResult.data
}

export async function runDocumentAutomationIfPossible(
  client,
  {
    transactionId,
    documentId,
    documentName,
    documentType = null,
    category,
    actorRole = null,
    actorUserId = null,
    source = 'internal',
    requiredDocumentKey = null,
  } = {},
) {
  if (!transactionId) {
    return null
  }

  let matchedRequiredDocument = null
  const resolvedEvidenceKey =
    normalizeDocumentKeyCandidate(requiredDocumentKey) ||
    normalizeDocumentKeyCandidate(documentType) ||
    normalizeDocumentKeyCandidate(category) ||
    normalizeDocumentKeyCandidate(documentName)
  if (documentId) {
    matchedRequiredDocument = await matchAndMarkRequiredDocumentFromUpload(client, {
      transactionId,
      documentId,
      documentName,
      category,
      requiredDocumentKey,
    })

    const normalizedDocumentKey = matchedRequiredDocument?.document_key || requiredDocumentKey || null
    const reservationSync = await updateReservationFromRequiredDocumentStatusIfNeeded(client, {
      transactionId,
      documentKey: normalizedDocumentKey,
      requiredDocumentStatus: 'uploaded',
      documentId,
      actorUserId: actorUserId || null,
    })

    if (reservationSync && normalizeRoleType(actorRole) === 'client') {
      const automationMessage = 'Proof of payment received. Transaction progressing to OTP stage.'

      try {
        await updateReservationFromRequiredDocumentStatusIfNeeded(client, {
          transactionId,
          documentKey: normalizedDocumentKey,
          requiredDocumentStatus: 'accepted',
          documentId,
          actorUserId: actorUserId || null,
          reviewNotes: 'Proof of payment auto-verified from client upload.',
        })
      } catch (verificationError) {
        console.warn('Reservation POP auto-verification failed', verificationError)
      }

      try {
        const stageAdvanceResult = await advanceTransactionMainStageIfNeeded(client, {
          transactionId,
          targetMainStage: 'OTP',
          allowedCurrentMainStages: ['AVAIL', 'DEP'],
          nextAction: 'Prepare and upload the Offer to Purchase (OTP) for client signature.',
          comment: automationMessage,
          source: 'reservation_pop_client_upload',
          actorRole: 'client',
        })

        if (stageAdvanceResult.advanced) {
          await addTransactionDiscussionComment({
            transactionId,
            authorName: 'Arch9 System',
            authorRole: 'internal_admin',
            commentText: automationMessage,
            unitId: null,
            client,
          })
        }
      } catch (stageAdvanceError) {
        console.warn('Reservation POP stage progression failed', stageAdvanceError)
      }

      await notifyRolesForTransaction(client, {
        transactionId,
        roleTypes: ['developer', 'agent', 'attorney'],
        title: 'Reservation POP received',
        message: automationMessage,
        notificationType: 'document_uploaded',
        eventType: 'DocumentUploaded',
        eventData: {
          source,
          reservationStatus: 'verified',
          documentId,
          documentKey: normalizedDocumentKey,
        },
        dedupePrefix: `reservation-pop-uploaded:${documentId || normalizedDocumentKey || 'unknown'}`,
        excludeUserId: actorUserId || null,
      })
    }
  }

  if (documentId && resolvedEvidenceKey) {
    await processWorkflowEvidenceIfPossible(client, {
      transactionId,
      evidenceType: 'document',
      evidenceId: documentId,
      evidenceKey: matchedRequiredDocument?.document_key || resolvedEvidenceKey,
      status: 'uploaded',
      source,
      createdBy: actorUserId || null,
      payload: {
        category: normalizeNullableText(category),
        documentName: normalizeNullableText(documentName),
        documentType: normalizeNullableText(documentType),
      },
    })
  }

  const readiness = await computeTransactionReadinessSnapshot(client, transactionId)
  if (!readiness) {
    return null
  }

  await upsertTransactionReadinessIfPossible(client, readiness)

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'TransactionUpdated',
    createdBy: actorUserId || null,
    createdByRole: normalizeRoleType(actorRole),
    eventData: {
      automation: 'ReadinessRecalculated',
      source,
      docsComplete: readiness.docsComplete,
      missingRequiredDocs: readiness.missingRequiredDocs,
      onboardingComplete: readiness.onboardingComplete,
      stageReady: readiness.stageReady,
      financeLaneReady: readiness.financeLaneReady,
      attorneyLaneReady: readiness.attorneyLaneReady,
    },
  })

  if (normalizeRoleType(actorRole) === 'client' && documentId) {
    await notifyRolesForTransaction(client, {
      transactionId,
      roleTypes: ['agent'],
      title: 'Client uploaded a document',
      message: `${documentName || 'A required document'} was uploaded and is ready for review.`,
      notificationType: 'document_uploaded',
      eventType: 'DocumentUploaded',
      eventData: { documentId, source },
      dedupePrefix: `client-doc-upload:${documentId}`,
      excludeUserId: actorUserId || null,
    })
  }

  if (readiness.docsComplete && readiness.onboardingComplete) {
    if (isBondFinanceType(readiness.financeType)) {
      await notifyRolesForTransaction(client, {
        transactionId,
        roleTypes: ['bond_originator'],
        title: 'Finance lane ready',
        message: 'Required onboarding documents are complete. Finance processing can proceed.',
        notificationType: 'lane_handoff',
        eventType: 'TransactionUpdated',
        eventData: { trigger: 'docs_complete_finance' },
        dedupePrefix: 'handoff-finance-ready',
      })
    } else {
      await notifyRolesForTransaction(client, {
        transactionId,
        roleTypes: ['attorney'],
        title: 'Attorney lane ready',
        message: 'Required onboarding documents are complete. Transfer preparation can proceed.',
        notificationType: 'lane_handoff',
        eventType: 'TransactionUpdated',
        eventData: { trigger: 'docs_complete_attorney' },
        dedupePrefix: 'handoff-attorney-ready',
      })
    }
  }

  return readiness
}

export function normalizeReservationStatus(value, { required = false } = {}) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (RESERVATION_STATUSES.includes(normalized)) {
    if (!required && normalized !== 'not_required') {
      return 'not_required'
    }
    return normalized
  }

  if (!required) {
    return 'not_required'
  }

  if (normalized === 'complete' || normalized === 'completed') {
    return 'paid'
  }

  return 'pending'
}

export function isReservationProofDocumentKey(value) {
  return (
    String(value || '')
      .trim()
      .toLowerCase() === 'reservation_deposit_proof'
  )
}

export async function updateReservationFromRequiredDocumentStatusIfNeeded(
  client,
  {
    transactionId,
    documentKey,
    requiredDocumentStatus = 'missing',
    documentId = null,
    actorUserId = null,
    reviewNotes = '',
  } = {},
) {
  if (!transactionId || !isReservationProofDocumentKey(documentKey)) {
    return null
  }

  const nowIso = new Date().toISOString()
  const today = nowIso.slice(0, 10)
  const normalizedRequiredStatus = normalizeRequiredStatus(requiredDocumentStatus, 'missing')
  const reviewNote = normalizeNullableText(reviewNotes)
  const payload = {
    updated_at: nowIso,
  }

  if (normalizedRequiredStatus === 'accepted') {
    payload.reservation_status = 'verified'
    payload.reservation_paid_date = today
    payload.reservation_reviewed_at = nowIso
    payload.reservation_reviewed_by = actorUserId || null
    payload.reservation_review_notes = reviewNote || 'Proof of payment approved.'
  } else if (normalizedRequiredStatus === 'reupload_required') {
    payload.reservation_status = 'rejected'
    payload.reservation_reviewed_at = nowIso
    payload.reservation_reviewed_by = actorUserId || null
    payload.reservation_review_notes = reviewNote || 'Proof of payment rejected and reupload requested.'
  } else if (['uploaded', 'under_review'].includes(normalizedRequiredStatus)) {
    payload.reservation_status = 'paid'
    payload.reservation_paid_date = today
    payload.reservation_proof_uploaded_at = nowIso
    if (documentId) {
      payload.reservation_proof_document = documentId
    }
  } else {
    payload.reservation_status = 'pending'
  }

  let updateResult = await client.from('transactions').update(payload).eq('id', transactionId)

  if (
    updateResult.error &&
    (isMissingColumnError(updateResult.error, 'reservation_status') ||
      isMissingColumnError(updateResult.error, 'reservation_paid_date') ||
      isMissingColumnError(updateResult.error, 'reservation_proof_uploaded_at') ||
      isMissingColumnError(updateResult.error, 'reservation_proof_document') ||
      isMissingColumnError(updateResult.error, 'reservation_reviewed_at') ||
      isMissingColumnError(updateResult.error, 'reservation_reviewed_by') ||
      isMissingColumnError(updateResult.error, 'reservation_review_notes'))
  ) {
    const fallbackPayload = {
      updated_at: nowIso,
    }

    if (normalizedRequiredStatus === 'accepted') {
      fallbackPayload.reservation_status = 'verified'
      fallbackPayload.reservation_paid_date = today
    } else if (normalizedRequiredStatus === 'reupload_required') {
      fallbackPayload.reservation_status = 'rejected'
    } else if (['uploaded', 'under_review'].includes(normalizedRequiredStatus)) {
      fallbackPayload.reservation_status = 'paid'
      fallbackPayload.reservation_paid_date = today
      if (documentId) {
        fallbackPayload.reservation_proof_document = documentId
      }
    } else {
      fallbackPayload.reservation_status = 'pending'
    }

    updateResult = await client.from('transactions').update(fallbackPayload).eq('id', transactionId)
  }

  if (updateResult.error && !isMissingSchemaError(updateResult.error)) {
    throw updateResult.error
  }

  return {
    transactionId,
    documentKey,
    status: normalizedRequiredStatus,
    updatedAt: nowIso,
  }
}
