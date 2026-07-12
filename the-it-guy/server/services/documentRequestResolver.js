import {
  deriveOnboardingConfiguration,
  normalizePurchaserType,
} from '../../src/lib/purchaserPersonas.js'
import {
  normaliseFinanceType,
  resolveFinanceWorkflowKey,
  toCanonicalTransactionFinanceType,
} from './financeWorkflowResolver.js'
import {
  resolveRequiredAttorneyLanes,
  resolveRequiredAttorneyWorkflowKeys,
} from './attorneyLaneResolver.js'
import {
  canDeriveBuyerBaseline,
  createLegalSupportBoundaryRequirement,
  resolveLegalSupportBoundary,
} from '../../src/core/legal/legalSupportBoundary.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

export function resolveDocumentRequestProfile(transaction = {}, options = {}) {
  const formData = options.formData && typeof options.formData === 'object' ? options.formData : {}
  const supportBoundary = resolveLegalSupportBoundary({ transaction, formData })
  const boundaryRequirement = createLegalSupportBoundaryRequirement(supportBoundary)
  const shouldDeriveBaseline = supportBoundary.automationAllowed || canDeriveBuyerBaseline(supportBoundary)
  const purchaserType = normalizePurchaserType(
    formData.purchaser_type || transaction.purchaser_type || 'individual',
  )
  const workflowFinanceType = normaliseFinanceType(
    formData.purchase_finance_type || transaction.finance_type,
  )
  const canonicalFinanceType = toCanonicalTransactionFinanceType(workflowFinanceType) || 'cash'
  const derived = shouldDeriveBaseline
    ? deriveOnboardingConfiguration(
        {
          ...formData,
          purchaser_type: purchaserType,
          purchase_finance_type: canonicalFinanceType,
        },
        {
          transaction,
          purchaserType,
          financeType: canonicalFinanceType,
        },
      )
    : { requiredDocuments: [] }
  const requiredDocuments = [
    ...(boundaryRequirement ? [boundaryRequirement] : []),
    ...(derived.requiredDocuments || []),
  ]

  const documentKeys = [
    ...new Set(
      requiredDocuments
        .map((item) => normalizeKey(item?.key))
        .filter(Boolean),
    ),
  ]
  const attorneyLanes = resolveRequiredAttorneyLanes(transaction)

  return {
    financeType: workflowFinanceType,
    workflowKey: resolveFinanceWorkflowKey({ finance_type: workflowFinanceType }),
    attorneyLanes,
    requiredAttorneyWorkflowKeys: resolveRequiredAttorneyWorkflowKeys(transaction),
    documentKeys,
    requiredDocuments,
    supportBoundary,
    supportBoundaryStatus: supportBoundary.status,
    automationAllowed: supportBoundary.automationAllowed,
    manualReviewRequired: supportBoundary.manualReviewRequired,
    unsupported: supportBoundary.unsupported,
  }
}

export function resolveDocumentRequestKeysForTransaction(transaction = {}, options = {}) {
  return resolveDocumentRequestProfile(transaction, options).documentKeys
}

export function isDocumentRequestExpectedForTransaction(documentKey, transaction = {}, options = {}) {
  return resolveDocumentRequestKeysForTransaction(transaction, options).includes(normalizeKey(documentKey))
}
