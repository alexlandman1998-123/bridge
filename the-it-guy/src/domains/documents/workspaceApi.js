// documents owns these operations and their existing recovery behavior.
import { logTransactionEventIfPossible } from '../transactions/eventActions.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { normalizeNullableText, requireClient, isMissingTableError, isMissingColumnError } from '../../lib/api/shared/readHelpers.js'
import { isAttorneyDocumentActor, reviewAttorneyDocument } from '../../services/documents/attorneyDocumentPersistence.js'
import { updateDocumentClientVisibilityRecord } from './api.js'
import { normalizeRequiredStatus } from '../../core/documents/documentVaultArchitecture'
import { deriveFinanceManagedBy, isBondFinanceType } from '../../core/transactions/financeType'
import { BOND_APPLICATION_PROGRESS_STATUSES, getBondApplicationProgress } from '../../core/transactions/bondIntakeSelectors'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { linkChecklistItemToDocument as linkChecklistItemToDocumentService } from '../../services/transactionOperationalChecklistService'
import { checkAndNotifyBondApplicationReadyForReview, checkAndNotifyBondDocumentsComplete } from '../../services/bondIntakeNotificationService'
import { fetchOnboardingFormDataForTransaction } from '../transactions/participantInfrastructure.js'
import { processWorkflowEvidenceIfPossible, getTransactionFinanceWorkflow, notifyRolesForTransaction } from '../bond/financeRead.js'
import { updateBondHybridFinanceStage } from '../bond/financeWorkflow.js'
import { computeTransactionReadinessSnapshot, notifyAttorneysForBondDocumentsComplete } from './readinessSupport.js'
import { updateReservationFromRequiredDocumentStatusIfNeeded } from './uploadAutomation.js'
import { fetchTransactionById } from '../transactions/detailReadApi.js'
import { normalizeCanonicalUploadActorRole, reconcileAttorneyDocumentEvidence } from './uploadWorkflow.js'

export async function linkChecklistItemToDocument(itemId, documentId) {
  return linkChecklistItemToDocumentService(itemId, documentId)
}

export async function updateTransactionRequiredDocumentStatus({
  transactionId,
  documentKey,
  status = 'missing',
  actorRole = 'developer',
  reviewNotes = '',
}) {
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }
  if (!documentKey) {
    throw new Error('Document key is required.')
  }

  const client = requireClient()
  const now = new Date().toISOString()
  const normalizedInputStatus = String(status || '')
    .trim()
    .toLowerCase()
  const normalizedStatus = normalizeRequiredStatus(
    normalizedInputStatus === 'verified' ? 'accepted' : normalizedInputStatus,
    'missing',
  )
  let isUploaded = ['uploaded', 'under_review', 'accepted'].includes(normalizedStatus)
  const normalizedActorRole = normalizeRoleType(actorRole || 'developer')
  const actorProfile = await resolveActiveProfileContext(client)
  const effectiveActorRole = normalizedActorRole || actorProfile.role || 'developer'
  const effectiveActorUserId = actorProfile.userId || null
  let uploadedDocumentId = null
  const previousReadiness = await computeTransactionReadinessSnapshot(client, transactionId)

  const requirementLookup = await client
    .from('transaction_required_documents')
    .select('id, uploaded_document_id, canonical_requirement_instance_id')
    .eq('transaction_id', transactionId)
    .eq('document_key', documentKey)
    .maybeSingle()

  if (requirementLookup.error) {
    if (!isMissingTableError(requirementLookup.error, 'transaction_required_documents')) {
      if (!isMissingColumnError(requirementLookup.error, 'uploaded_document_id')) {
        throw requirementLookup.error
      }
    }
  } else {
    uploadedDocumentId = requirementLookup.data?.uploaded_document_id || null
  }
  if (uploadedDocumentId && ['rejected', 'reupload_required'].includes(normalizedStatus)) isUploaded = true

  const canonicalRequirementInstanceId = requirementLookup.data?.canonical_requirement_instance_id || null
  if (canonicalRequirementInstanceId && ['accepted', 'approved', 'rejected', 'reupload_required', 'waived'].includes(normalizedStatus)) {
    await reviewCanonicalDocumentRequirement({
      requirementInstanceId: canonicalRequirementInstanceId,
      documentId: uploadedDocumentId,
      action: normalizedStatus === 'waived' ? 'waive' : ['rejected', 'reupload_required'].includes(normalizedStatus) ? 'reject' : 'approve',
      reason: reviewNotes,
    })
  }

  let updateQuery = client
    .from('transaction_required_documents')
    .update({
      status: normalizedStatus,
      is_uploaded: isUploaded,
      uploaded_at: isUploaded ? now : null,
      verified_at: normalizedStatus === 'accepted' ? now : null,
      rejected_at: ['rejected', 'reupload_required'].includes(normalizedStatus) ? now : null,
      updated_at: now,
    })
    .eq('transaction_id', transactionId)
  updateQuery = requirementLookup.data?.id
    ? updateQuery.eq('id', requirementLookup.data.id)
    : updateQuery.eq('document_key', documentKey)
  let updateResult = await updateQuery

  if (
    updateResult.error &&
    (isMissingColumnError(updateResult.error, 'status') ||
      isMissingColumnError(updateResult.error, 'uploaded_at') ||
      isMissingColumnError(updateResult.error, 'verified_at') ||
      isMissingColumnError(updateResult.error, 'rejected_at'))
  ) {
    let fallbackUpdateQuery = client
      .from('transaction_required_documents')
      .update({
        is_uploaded: isUploaded,
        updated_at: now,
      })
      .eq('transaction_id', transactionId)
    fallbackUpdateQuery = requirementLookup.data?.id
      ? fallbackUpdateQuery.eq('id', requirementLookup.data.id)
      : fallbackUpdateQuery.eq('document_key', documentKey)
    updateResult = await fallbackUpdateQuery
  }

  if (updateResult.error) {
    if (isMissingTableError(updateResult.error, 'transaction_required_documents')) {
      throw new Error('Required documents are not set up for this transaction yet.')
    }
    throw updateResult.error
  }

  const reservationSync = await updateReservationFromRequiredDocumentStatusIfNeeded(client, {
    transactionId,
    documentKey,
    requiredDocumentStatus: normalizedStatus,
    documentId: uploadedDocumentId,
    actorUserId: effectiveActorUserId,
    reviewNotes,
  })

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'TransactionUpdated',
    createdBy: effectiveActorUserId,
    createdByRole: effectiveActorRole,
    eventData: {
      source: 'required_document_status_update',
      documentKey,
      status: normalizedStatus,
    },
  })

  await processWorkflowEvidenceIfPossible(client, {
    transactionId,
    evidenceType: uploadedDocumentId ? 'document' : 'document_request',
    evidenceId: uploadedDocumentId || documentKey,
    evidenceKey: documentKey,
    status:
      normalizedStatus === 'accepted'
        ? 'approved'
        : normalizedStatus === 'reupload_required'
          ? 'rejected'
          : normalizedStatus === 'missing'
            ? 'removed'
            : normalizedStatus,
    source: 'required_document_status_update',
    createdBy: effectiveActorUserId,
    payload: {
      reviewNotes,
      actorRole: effectiveActorRole,
    },
  })

  if (reservationSync) {
    if (normalizedStatus === 'accepted') {
      await notifyRolesForTransaction(client, {
        transactionId,
        roleTypes: ['client', 'developer', 'agent', 'attorney'],
        title: 'Reservation deposit verified',
        message: 'Proof of payment was reviewed and verified.',
        notificationType: 'document_uploaded',
        eventType: 'TransactionUpdated',
        eventData: {
          source: 'reservation_deposit_review',
          result: 'approved',
        },
        dedupePrefix: `reservation-pop-approved:${transactionId}`,
        excludeUserId: effectiveActorUserId,
      })
    } else if (normalizedStatus === 'reupload_required') {
      await notifyRolesForTransaction(client, {
        transactionId,
        roleTypes: ['client'],
        title: 'Reservation proof needs reupload',
        message:
          reviewNotes || 'Please upload a clearer proof of payment so the team can verify the reservation deposit.',
        notificationType: 'document_uploaded',
        eventType: 'TransactionUpdated',
        eventData: {
          source: 'reservation_deposit_review',
          result: 'reupload_required',
        },
        dedupePrefix: `reservation-pop-reupload:${transactionId}`,
        excludeUserId: effectiveActorUserId,
      })
    } else if (['uploaded', 'under_review'].includes(normalizedStatus)) {
      await notifyRolesForTransaction(client, {
        transactionId,
        roleTypes: ['developer', 'agent', 'attorney'],
        title: 'Reservation proof uploaded',
        message: 'Proof of payment was uploaded and is awaiting review.',
        notificationType: 'document_uploaded',
        eventType: 'TransactionUpdated',
        eventData: {
          source: 'reservation_deposit_review',
          result: 'uploaded',
        },
        dedupePrefix: `reservation-pop-uploaded:${transactionId}`,
        excludeUserId: effectiveActorUserId,
      })
    }
  }

  const readiness = await computeTransactionReadinessSnapshot(client, transactionId)
  const formDataRow = await fetchOnboardingFormDataForTransaction(client, transactionId, 'individual')
  const formData = formDataRow?.formData || formDataRow?.form_data || formDataRow || {}
  const financeManagedBy = deriveFinanceManagedBy({
    financeType: readiness?.financeType,
    financeManagedBy: readiness?.financeManagedBy || readiness?.finance_managed_by,
    formData,
  })
  if (isBondFinanceType(readiness?.financeType) && financeManagedBy === 'bond_originator') {
    try {
      const bondDocumentsCompleteResult = await checkAndNotifyBondDocumentsComplete({
        transaction: {
          id: transactionId,
          finance_type: readiness?.financeType,
          finance_managed_by: financeManagedBy,
        },
        previousMissingCount: previousReadiness?.missingRequiredDocs,
        readiness,
        actor: { id: effectiveActorUserId, roleType: effectiveActorRole },
        metadata: {
          source: 'required_document_status_update',
          documentKey,
          status: normalizedStatus,
          financeManagedBy,
        },
        client,
      })
      const bondProgress = getBondApplicationProgress({
        transaction: {
          id: transactionId,
          finance_type: readiness?.financeType,
          finance_managed_by: financeManagedBy,
        },
        onboardingFormData: formData,
      })
      await checkAndNotifyBondApplicationReadyForReview({
        transaction: {
          id: transactionId,
          finance_type: readiness?.financeType,
          finance_managed_by: financeManagedBy,
        },
        previousReadyForReview: Boolean(
          previousReadiness?.docsComplete && bondProgress.status === BOND_APPLICATION_PROGRESS_STATUSES.SUBMITTED,
        ),
        currentReadyForReview: Boolean(
          readiness?.docsComplete && bondProgress.status === BOND_APPLICATION_PROGRESS_STATUSES.SUBMITTED,
        ),
        actor: { id: effectiveActorUserId, roleType: effectiveActorRole },
        metadata: {
          source: 'required_document_status_update',
          documentKey,
          status: normalizedStatus,
          financeManagedBy,
        },
        client,
      })
      await notifyAttorneysForBondDocumentsComplete(client, {
        transactionId,
        result: bondDocumentsCompleteResult,
        actor: { id: effectiveActorUserId, roleType: effectiveActorRole },
        metadata: {
          source: 'required_document_status_update',
          documentKey,
          status: normalizedStatus,
        },
      })
    } catch (bondNotificationError) {
      console.warn('Bond document completion notification failed', bondNotificationError)
    }
  }

  return {
    transactionId,
    documentKey,
    status: normalizedStatus,
    updatedAt: now,
  }
}

export async function updateDocumentClientVisibility(documentId, isClientVisible) {
  const client = requireClient()
  return updateDocumentClientVisibilityRecord({
    client,
    documentId,
    isClientVisible,
    isMissingColumnError,
    recordEvent: (event) => logTransactionEventIfPossible(client, event),
  })
}

export async function archiveTransactionDocument(documentId) {
  const client = requireClient()
  if (!documentId) {
    throw new Error('Document id is required.')
  }

  const lookup = await client
    .from('documents')
    .select('id, transaction_id, category, document_type, name')
    .eq('id', documentId)
    .maybeSingle()
  if (lookup.error) {
    throw lookup.error
  }

  if (!lookup.data) {
    throw new Error('Document not found.')
  }

  const now = new Date().toISOString()
  let updateResult = await client
    .from('documents')
    .update({
      archived_at: now,
      visibility_scope: 'internal',
      is_client_visible: false,
      updated_at: now,
    })
    .eq('id', documentId)
    .select('id, transaction_id, archived_at, visibility_scope, is_client_visible')
    .single()

  if (
    updateResult.error &&
    (isMissingColumnError(updateResult.error, 'archived_at') ||
      isMissingColumnError(updateResult.error, 'visibility_scope') ||
      isMissingColumnError(updateResult.error, 'is_client_visible') ||
      isMissingColumnError(updateResult.error, 'updated_at'))
  ) {
    const fallbackPayload = {
      visibility_scope: 'internal',
      is_client_visible: false,
      category: `Archived • ${lookup.data.category || 'General'}`,
    }

    updateResult = await client
      .from('documents')
      .update(fallbackPayload)
      .eq('id', documentId)
      .select('id, transaction_id, visibility_scope, is_client_visible, category')
      .single()

    if (updateResult.error && isMissingColumnError(updateResult.error, 'visibility_scope')) {
      updateResult = await client
        .from('documents')
        .update({
          category: `Archived • ${lookup.data.category || 'General'}`,
        })
        .eq('id', documentId)
        .select('id, transaction_id, category')
        .single()
    }
  }

  if (updateResult.error) {
    throw updateResult.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId: updateResult.data?.transaction_id || lookup.data.transaction_id || null,
    eventType: 'DocumentUpdated',
    eventData: {
      documentId,
      action: 'archived',
      archivedAt: now,
    },
  })

  const archivedEvidenceKey = lookup.data.document_type || lookup.data.category || lookup.data.name || null
  if (archivedEvidenceKey) {
    await processWorkflowEvidenceIfPossible(client, {
      transactionId: updateResult.data?.transaction_id || lookup.data.transaction_id || null,
      evidenceType: 'document',
      evidenceId: documentId,
      evidenceKey: archivedEvidenceKey,
      status: 'removed',
      source: 'archive_transaction_document',
      createdBy: null,
    })
  }

  return {
    id: updateResult.data?.id || documentId,
    transactionId: updateResult.data?.transaction_id || lookup.data.transaction_id || null,
    archivedAt: updateResult.data?.archived_at || now,
  }
}

export async function markFinanceDocumentsReviewed(transactionId, { actorRole = null, notes = '' } = {}) {
  return updateBondHybridFinanceStage(transactionId, 'documents', {
    actorRole,
    notes: notes || 'Finance documents reviewed.',
  })
}

export async function verifyProofOfFunds(transactionId, { actorRole = 'attorney', reviewNotes = '' } = {}) {
  const detail = await fetchTransactionById(transactionId)
  const requirement = (detail?.requiredDocumentChecklist || []).find((item) =>
    ['proof_of_funds', 'proof_of_funds_cash_component'].includes(String(item?.key || '').trim()),
  )
  if (!requirement?.key) {
    throw new Error('Proof of funds requirement was not found for this transaction.')
  }
  return updateTransactionRequiredDocumentStatus({
    transactionId,
    documentKey: requirement.key,
    status: 'accepted',
    actorRole,
    reviewNotes,
  })
}

export async function updateTransactionFinanceBlockerStatus(
  transactionId,
  { blockerStatus = '', nextAction = '', financeOwner = '' } = {},
) {
  const client = requireClient()
  const update = await client
    .from('transaction_finance_workflows')
    .update({
      blocker_status: normalizeNullableText(blockerStatus),
      next_action: normalizeNullableText(nextAction),
      finance_owner: normalizeNullableText(financeOwner),
      updated_at: new Date().toISOString(),
    })
    .eq('transaction_id', transactionId)
  if (update.error) throw update.error
  return getTransactionFinanceWorkflow(transactionId, { client })
}

export async function reviewCanonicalDocumentRequirement({
  requirementInstanceId,
  documentId = null,
  action,
  reason = '',
  notes = '',
  attorneyLaneKey = '',
  commandId = null,
} = {}) {
  const client = requireClient()
  const activeProfile = await resolveActiveProfileContext(client)
  const profileRole = String(activeProfile.role || '').trim().toLowerCase()
  const normalizedAction = String(action || '')
    .trim()
    .toLowerCase()
  if (!requirementInstanceId) throw new Error('A canonical requirement is required for review.')
  if (!['approve', 'reject', 'waive'].includes(normalizedAction)) {
    throw new Error('Unsupported canonical document review action.')
  }

  if (isAttorneyDocumentActor(profileRole)) {
    const saved = await reviewAttorneyDocument(client, {
      requirementInstanceId, documentId, action: normalizedAction, reason: reason || notes,
      actorRole: ['bond', 'cancellation'].includes(attorneyLaneKey)
        ? `${attorneyLaneKey}_attorney` : normalizeCanonicalUploadActorRole(profileRole || 'attorney'),
      commandId,
    })
    if (documentId) {
      void (async () => {
        const lookup = await client.from('documents').select('id, transaction_id, document_type, category, name, uploaded_by_user_id').eq('id', documentId).maybeSingle()
        if (lookup.error) throw lookup.error
        if (lookup.data) await reconcileAttorneyDocumentEvidence(client, {
          document: { ...lookup.data, uploaded_by_user_id: activeProfile.userId },
          status: normalizedAction === 'approve' ? 'approved' : normalizedAction === 'reject' ? 'rejected' : 'removed',
          requirementInstanceId,
        })
      })().catch(() => console.warn('[document-review] Saved review reporting could not refresh'))
    }
    return saved
  }

  const rpc = await client.rpc('bridge_review_canonical_requirement', {
    p_requirement_instance_id: requirementInstanceId,
    p_document_id: documentId || null,
    p_action: normalizedAction,
    p_reason: reason || notes || null,
    p_actor_role: ['attorney', 'conveyancer'].includes(profileRole) && ['bond', 'cancellation'].includes(attorneyLaneKey)
      ? `${attorneyLaneKey}_attorney`
      : normalizeCanonicalUploadActorRole(profileRole || 'attorney'),
    p_actor_user_id: activeProfile.userId || null,
  })

  if (rpc.error) {
    throw rpc.error
  }

  if (documentId) {
    const documentLookup = await client
      .from('documents')
      .select('id, transaction_id, document_type, category, name')
      .eq('id', documentId)
      .maybeSingle()

    if (documentLookup.error && !isMissingTableError(documentLookup.error, 'documents')) {
      throw documentLookup.error
    }

    const reviewedDocument = documentLookup.data || null
    if (reviewedDocument?.transaction_id) {
      const evidenceKey = reviewedDocument.document_type || reviewedDocument.category || reviewedDocument.name || null

      if (evidenceKey) {
        await processWorkflowEvidenceIfPossible(client, {
          transactionId: reviewedDocument.transaction_id,
          evidenceType: 'document',
          evidenceId: reviewedDocument.id,
          evidenceKey,
          status: normalizedAction === 'approve' ? 'approved' : normalizedAction === 'reject' ? 'rejected' : 'removed',
          source: 'canonical_document_review',
          createdBy: activeProfile.userId || null,
          payload: {
            requirementInstanceId,
            reviewAction: normalizedAction,
            reviewResult: rpc.data || null,
          },
        })
      }
    }
  }

  return rpc.data || null
}
