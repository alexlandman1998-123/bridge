import { getMainStageFromDetailedStage } from './stageConfig'
import { normalizeFinanceType } from './financeType'

function normalizeMainStage(mainStage, detailedStage) {
  const normalized = String(mainStage || '')
    .trim()
    .toUpperCase()
  return normalized || getMainStageFromDetailedStage(detailedStage)
}

function normalizeMoney(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

export function mapUnitRowToCanonicalTransaction(row = {}) {
  const transaction = row?.transaction || null
  const unit = row?.unit || null
  const development = row?.development || null
  const buyer = row?.buyer || null
  const detailedStage = transaction?.stage || row?.stage || unit?.status || 'Available'
  const mainStage = normalizeMainStage(transaction?.current_main_stage, detailedStage)

  return {
    id: transaction?.id || null,
    development: {
      id: development?.id || unit?.development_id || null,
      name: development?.name || 'Unknown Development',
    },
    unit: {
      id: unit?.id || transaction?.unit_id || null,
      number: unit?.unit_number || '-',
      phase: unit?.phase || null,
      status: unit?.status || detailedStage,
      price: normalizeMoney(unit?.price),
    },
    buyer: buyer
      ? {
          id: buyer.id || transaction?.buyer_id || null,
          name: buyer.name || 'Unknown Buyer',
          email: buyer.email || null,
          phone: buyer.phone || null,
        }
      : {
          id: transaction?.buyer_id || null,
          name: 'Unassigned',
          email: null,
          phone: null,
        },
    pricing: {
      salesPrice: normalizeMoney(transaction?.purchase_price ?? transaction?.sales_price),
      unitPrice: normalizeMoney(unit?.price),
      currency: 'ZAR',
    },
    finance: {
      type: normalizeFinanceType(transaction?.finance_type || 'cash'),
      managedBy: transaction?.finance_managed_by || 'bond_originator',
      bank: transaction?.bank || null,
      cashAmount: normalizeMoney(transaction?.cash_amount),
      bondAmount: normalizeMoney(transaction?.bond_amount),
      depositAmount: normalizeMoney(transaction?.deposit_amount),
      reservationRequired: Boolean(transaction?.reservation_required),
      reservationAmount: normalizeMoney(transaction?.reservation_amount),
      reservationStatus: transaction?.reservation_status || 'not_required',
    },
    stage: {
      detailed: detailedStage,
      main: mainStage,
      date: transaction?.stage_date || null,
      summary: transaction?.current_sub_stage_summary || null,
      nextAction: transaction?.next_action || null,
      riskStatus: transaction?.risk_status || 'On Track',
    },
    participants: [],
    documents: [],
    discussion: [],
    events: [],
    raw: {
      row,
      transaction,
      unit,
      development,
      buyer,
    },
  }
}

export function mapTransactionDetailToCanonical(detail = {}) {
  if (!detail) {
    return null
  }

  const mapped = mapUnitRowToCanonicalTransaction({
    transaction: detail.transaction,
    unit: detail.unit,
    development: detail.unit?.development || null,
    buyer: detail.buyer,
    stage: detail.stage,
  })

  return {
    ...mapped,
    participants: detail.transactionParticipants || [],
    documents: detail.documents || [],
    discussion: detail.transactionDiscussion || [],
    events: detail.transactionEvents || [],
    onboarding: detail.onboarding || null,
    requiredDocuments: detail.transactionRequiredDocuments || [],
    requiredDocumentChecklist: detail.requiredDocumentChecklist || [],
    documentSummary: detail.documentSummary || { uploadedCount: 0, totalRequired: 0 },
    subprocesses: detail.transactionSubprocesses || [],
    statusLink: detail.transactionStatusLink || null,
    permissions: detail.activeViewerPermissions || null,
    viewerRole: detail.activeViewerRole || null,
    raw: {
      ...mapped.raw,
      detail,
    },
  }
}
