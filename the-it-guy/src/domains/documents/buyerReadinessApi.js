// documents owns these operations and their existing recovery behavior.
import { ensureTransactionRequiredDocuments } from './requirementActions.js'
import { logTransactionEventIfPossible } from '../transactions/eventActions.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { requireClient } from '../../lib/api/shared/readHelpers.js'
import { resolvePurchaserTypeFromFormData } from '../../lib/purchaserPersonas'
import { canProgressTransactionStage as canProgressTransactionStageForBuyerRequirements, getBuyerFicaReadiness as getBuyerFicaReadinessFromProfile, getBuyerFinanceReadiness as getBuyerFinanceReadinessFromProfile, getBuyerRequirementProfile, getMissingBuyerRequirements as getMissingBuyerRequirementsFromProfile, getTransferReadinessFromBuyerDocs as getTransferReadinessFromBuyerDocsFromProfile } from '../../lib/buyerRequirementEngine'
import { normalizeFinanceType } from '../../core/transactions/financeType'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { syncCanonicalRequiredDocumentsForTransactionContext } from '../../services/documents/documentRequestCanonicalTransactionSyncService'
import { runCanonicalDocumentRequestRecalculationBatch } from '../../services/documents/documentRequestCanonicalAdminRecalculationService.js'
import { fetchTransactionById } from '../transactions/detailReadApi.js'

export async function getMissingBuyerRequirements(transactionId) {
  if (!transactionId) {
    return {
      profile: null,
      missing: [],
      missingCritical: [],
      totalRequired: 0,
      totalMissing: 0,
      totalMissingCritical: 0,
      hasOutstanding: false,
    }
  }

  const detail = await fetchTransactionById(transactionId)
  if (!detail) {
    return {
      profile: null,
      missing: [],
      missingCritical: [],
      totalRequired: 0,
      totalMissing: 0,
      totalMissingCritical: 0,
      hasOutstanding: false,
    }
  }

  const profile =
    detail.buyerRequirementProfile ||
    getBuyerRequirementProfile({
      transaction: detail.transaction,
      onboardingFormData: detail.onboardingFormData,
      requiredDocumentChecklist: detail.requiredDocumentChecklist || [],
    })

  return getMissingBuyerRequirementsFromProfile(profile, detail.requiredDocumentChecklist || [])
}

export async function getMissingBuyerDocuments(transactionId) {
  return getMissingBuyerRequirements(transactionId)
}

export async function getBuyerFicaReadiness(transactionId) {
  if (!transactionId) {
    return {
      ready: false,
      totalRequired: 0,
      totalMissing: 0,
      missing: [],
      blockers: ['Transaction id is required.'],
    }
  }

  const detail = await fetchTransactionById(transactionId)
  if (!detail) {
    return {
      ready: false,
      totalRequired: 0,
      totalMissing: 0,
      missing: [],
      blockers: ['Transaction not found.'],
    }
  }

  const profile =
    detail.buyerRequirementProfile ||
    getBuyerRequirementProfile({
      transaction: detail.transaction,
      onboardingFormData: detail.onboardingFormData,
      requiredDocumentChecklist: detail.requiredDocumentChecklist || [],
    })

  return getBuyerFicaReadinessFromProfile(
    {
      ...profile,
      onboardingStatus: detail?.onboarding?.status || detail?.onboardingFormData?.status || null,
    },
    detail.requiredDocumentChecklist || [],
  )
}

export async function getBuyerFinanceReadiness(transactionId) {
  if (!transactionId) {
    return {
      ready: false,
      financeType: 'unknown',
      totalRequired: 0,
      totalMissing: 0,
      missing: [],
      requiresFinancePack: false,
      requiresProofOfFunds: false,
      proofOfFundsOutstanding: false,
      bondPackOutstanding: false,
      blockers: ['Transaction id is required.'],
    }
  }

  const detail = await fetchTransactionById(transactionId)
  if (!detail) {
    return {
      ready: false,
      financeType: 'unknown',
      totalRequired: 0,
      totalMissing: 0,
      missing: [],
      requiresFinancePack: false,
      requiresProofOfFunds: false,
      proofOfFundsOutstanding: false,
      bondPackOutstanding: false,
      blockers: ['Transaction not found.'],
    }
  }

  const profile =
    detail.buyerRequirementProfile ||
    getBuyerRequirementProfile({
      transaction: detail.transaction,
      onboardingFormData: detail.onboardingFormData,
      requiredDocumentChecklist: detail.requiredDocumentChecklist || [],
    })

  return getBuyerFinanceReadinessFromProfile(profile, detail.requiredDocumentChecklist || [])
}

export async function getTransferReadinessFromBuyerDocs(transactionId) {
  if (!transactionId) {
    return {
      ready: false,
      onboardingCompleted: false,
      blockers: ['Transaction id is required.'],
      missingCriticalCount: 0,
      missingCount: 0,
      fica: {
        ready: false,
        totalRequired: 0,
        totalMissing: 0,
        missing: [],
        blockers: [],
      },
      finance: {
        ready: false,
        financeType: 'unknown',
        totalRequired: 0,
        totalMissing: 0,
        missing: [],
        requiresFinancePack: false,
        requiresProofOfFunds: false,
        proofOfFundsOutstanding: false,
        bondPackOutstanding: false,
        blockers: [],
      },
    }
  }

  const detail = await fetchTransactionById(transactionId)
  if (!detail) {
    return {
      ready: false,
      onboardingCompleted: false,
      blockers: ['Transaction not found.'],
      missingCriticalCount: 0,
      missingCount: 0,
      fica: {
        ready: false,
        totalRequired: 0,
        totalMissing: 0,
        missing: [],
        blockers: [],
      },
      finance: {
        ready: false,
        financeType: 'unknown',
        totalRequired: 0,
        totalMissing: 0,
        missing: [],
        requiresFinancePack: false,
        requiresProofOfFunds: false,
        proofOfFundsOutstanding: false,
        bondPackOutstanding: false,
        blockers: [],
      },
    }
  }

  const profile =
    detail.buyerRequirementProfile ||
    getBuyerRequirementProfile({
      transaction: detail.transaction,
      onboardingFormData: detail.onboardingFormData,
      requiredDocumentChecklist: detail.requiredDocumentChecklist || [],
    })

  return getTransferReadinessFromBuyerDocsFromProfile(
    {
      ...profile,
      onboardingStatus: detail?.onboarding?.status || detail?.onboardingFormData?.status || null,
      onboarding: detail?.onboarding || null,
    },
    detail.requiredDocumentChecklist || [],
  )
}

export async function generateBuyerDocumentRequirements(transactionId) {
  if (!transactionId) return []
  const client = requireClient()
  const detail = await fetchTransactionById(transactionId)
  if (!detail?.transaction) {
    return []
  }

  const transaction = detail.transaction || {}
  const onboardingFormData = detail.onboardingFormData?.formData || detail.onboardingFormData || {}
  const normalizedFinanceType = normalizeFinanceType(
    onboardingFormData?.purchase_finance_type || transaction?.finance_type || 'cash',
  )
  const purchaserType = resolvePurchaserTypeFromFormData(onboardingFormData, {
    purchaserType: transaction?.purchaser_type,
    transaction,
  })

  const requiredDocuments = await ensureTransactionRequiredDocuments(client, {
    transactionId,
    purchaserType,
    financeType: normalizedFinanceType,
    reservationRequired:
      onboardingFormData?.reservation_required === true ||
      String(onboardingFormData?.reservation_required || '')
        .trim()
        .toLowerCase() === 'yes',
    cashAmount: onboardingFormData?.cash_amount ?? transaction?.cash_amount ?? null,
    bondAmount: onboardingFormData?.bond_amount ?? transaction?.bond_amount ?? null,
    formData: onboardingFormData,
  })

  try {
    await logTransactionEventIfPossible(client, {
      transactionId,
      eventType: 'buyer_requirements_generated',
      eventData: {
        buyerType: purchaserType,
        financeType: normalizedFinanceType,
        totalRequirements: requiredDocuments.length,
      },
    })
  } catch (eventError) {
    console.warn('[buyer-requirements] failed to log generation event', eventError)
  }

  return requiredDocuments
}

export async function syncBuyerDocumentRequirements(transactionId) {
  const requiredDocuments = await generateBuyerDocumentRequirements(transactionId)

  if (transactionId) {
    try {
      await logTransactionEventIfPossible(requireClient(), {
        transactionId,
        eventType: 'buyer_requirements_updated',
        eventData: {
          totalRequirements: requiredDocuments.length,
        },
      })
    } catch (eventError) {
      console.warn('[buyer-requirements] failed to log sync event', eventError)
    }
  }

  return requiredDocuments
}

export async function syncTransactionCanonicalDocumentRequestRequirements(transactionId, options = {}) {
  if (!transactionId) {
    throw new Error('Transaction id is required.')
  }

  const client = requireClient()
  const activeProfile = await resolveActiveProfileContext(client)
  const actorRole = normalizeRoleType(options.actorRole || activeProfile.role || 'developer')
  if (!['developer', 'internal_admin', 'admin', 'platform_admin', 'attorney'].includes(actorRole)) {
    throw new Error('You do not have permission to sync canonical document request requirements.')
  }

  const detail = await fetchTransactionById(transactionId)
  if (!detail?.transaction) {
    return {
      skipped: true,
      reason: 'transaction_not_found',
      transactionId,
      rows: [],
      synced: 0,
      persistedRows: [],
    }
  }

  const onboardingFormData = detail.onboardingFormData?.formData || detail.onboardingFormData?.form_data || detail.onboardingFormData || {}
  const result = await syncCanonicalRequiredDocumentsForTransactionContext({
    client,
    transactionId,
    transaction: detail.transaction,
    onboardingFormData,
    sellerFormData:
      options.sellerFormData ||
      options.seller_form_data ||
      detail.sellerOnboardingFormData ||
      detail.seller_onboarding_form_data ||
      {},
    listing: options.listing || detail.listing || detail.unit?.listing || {},
    unit: detail.unit || null,
    explicitScenario: options.scenario || options.canonicalDocumentRequestScenario || null,
    audience: options.audience || 'auto',
    requestPendingPolicy: options.requestPendingPolicy === true,
    includePendingPolicyRows: options.includePendingPolicyRows === true,
    dryRun: options.dryRun === true,
  })

  if (options.dryRun !== true) {
    try {
      await logTransactionEventIfPossible(client, {
        transactionId,
        eventType: 'canonical_document_request_requirements_synced',
        createdBy: activeProfile.userId || null,
        createdByRole: actorRole,
        eventData: {
          source: 'document_request_phase7_required_document_sync',
          synced: result.synced || 0,
          rows: result.rows?.length || 0,
          derivedAudience: result.derivedAudience || result.audience || '',
          requestedAudience: result.requestedAudience || options.audience || 'auto',
          skipped: result.skipped === true,
          reason: result.reason || null,
          pendingPolicySkipped: result.skippedPendingPolicyKeys || [],
        },
      })
    } catch (eventError) {
      console.warn('[document-request-canonical-sync] failed to log sync event', eventError)
    }
  }

  return result
}

export async function runCanonicalDocumentRequestRequirementRecalculation({
  transactionIds = [],
  transactionId = '',
  commit = false,
  dryRun = undefined,
  allowLargeBatch = false,
  maxTransactions = undefined,
  ...options
} = {}) {
  const requestedTransactionIds = Array.isArray(transactionIds)
    ? [...transactionIds]
    : [transactionIds]
  if (transactionId) requestedTransactionIds.push(transactionId)

  return runCanonicalDocumentRequestRecalculationBatch({
    transactionIds: requestedTransactionIds,
    syncTransaction: syncTransactionCanonicalDocumentRequestRequirements,
    options: {
      ...options,
      commit,
      dryRun,
      allowLargeBatch,
      ...(maxTransactions ? { maxTransactions } : {}),
    },
  })
}

export async function canProgressTransactionStage(transactionId, targetStage) {
  if (!transactionId) {
    return {
      canProgress: false,
      blockingRequirements: [],
      warnings: ['Transaction id is required.'],
      profile: null,
    }
  }

  const detail = await fetchTransactionById(transactionId)
  if (!detail) {
    return {
      canProgress: false,
      blockingRequirements: [],
      warnings: ['Transaction not found.'],
      profile: null,
    }
  }

  const profile =
    detail.buyerRequirementProfile ||
    getBuyerRequirementProfile({
      transaction: detail.transaction,
      onboardingFormData: detail.onboardingFormData,
      requiredDocumentChecklist: detail.requiredDocumentChecklist || [],
    })

  return canProgressTransactionStageForBuyerRequirements({
    targetStage,
    requirementProfile: profile,
    requiredDocumentChecklist: detail.requiredDocumentChecklist || [],
  })
}
