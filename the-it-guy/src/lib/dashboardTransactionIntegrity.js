const EXCLUDED_STATUS_TERMS = [
  'registered',
  'closed',
  'completed',
  'cancelled',
  'canceled',
  'lost',
  'archived',
  'deleted',
]

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function getDashboardTransaction(row = {}) {
  return row?.transaction && typeof row.transaction === 'object' ? row.transaction : row
}

export function getDashboardTransactionId(row = {}) {
  const transaction = getDashboardTransaction(row)
  return normalizeText(transaction?.id || row?.id)
}

export function getDashboardTransactionOrganisationId(row = {}) {
  const transaction = getDashboardTransaction(row)
  return normalizeText(transaction?.organisation_id || row?.organisation_id)
}

export function getDashboardTransactionStatusText(row = {}) {
  const transaction = getDashboardTransaction(row)
  return [
    transaction?.lifecycle_state,
    transaction?.status,
    transaction?.current_main_stage,
    row?.mainStage,
    transaction?.stage,
    row?.stage,
    transaction?.operational_state,
    transaction?.attorney_stage,
  ].map(normalizeKey).join(' ')
}

export function getDashboardTransactionPrice(row = {}) {
  const transaction = getDashboardTransaction(row)
  return toNumber(transaction?.purchase_price ?? transaction?.sales_price ?? transaction?.sale_price ?? 0)
}

export function isDashboardTransactionActive(row = {}, { organisationId = '' } = {}) {
  const transaction = getDashboardTransaction(row)
  const transactionId = getDashboardTransactionId(row)
  if (!transactionId) return false

  const requiredOrganisationId = normalizeText(organisationId)
  if (requiredOrganisationId) {
    const rowOrganisationId = getDashboardTransactionOrganisationId(row)
    if (!rowOrganisationId || rowOrganisationId !== requiredOrganisationId) {
      return false
    }
  }

  if (transaction?.is_active === false) return false
  if (transaction?.deleted_at || transaction?.archived_at || transaction?.cancelled_at || transaction?.registered_at || transaction?.completed_at) {
    return false
  }

  const statusText = getDashboardTransactionStatusText(row)
  return !EXCLUDED_STATUS_TERMS.some((term) => statusText.includes(term))
}

export function dedupeDashboardTransactions(rows = []) {
  const byId = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const transactionId = getDashboardTransactionId(row)
    if (!transactionId) continue

    const existing = byId.get(transactionId)
    if (!existing) {
      byId.set(transactionId, row)
      continue
    }

    const existingTransaction = getDashboardTransaction(existing)
    const nextTransaction = getDashboardTransaction(row)
    const existingUpdatedAt = new Date(existingTransaction?.updated_at || existing?.updated_at || 0).getTime()
    const nextUpdatedAt = new Date(nextTransaction?.updated_at || row?.updated_at || 0).getTime()
    if (nextUpdatedAt >= existingUpdatedAt) {
      byId.set(transactionId, row)
    }
  }
  return [...byId.values()]
}

export function getScopedDashboardTransactions(rows = [], { organisationId = '', activeOnly = true } = {}) {
  return dedupeDashboardTransactions(rows).filter((row) => {
    const requiredOrganisationId = normalizeText(organisationId)
    if (requiredOrganisationId && getDashboardTransactionOrganisationId(row) !== requiredOrganisationId) {
      return false
    }
    return activeOnly ? isDashboardTransactionActive(row, { organisationId: requiredOrganisationId }) : true
  })
}

export function getDashboardPipelineValue(rows = []) {
  return dedupeDashboardTransactions(rows).reduce((sum, row) => sum + getDashboardTransactionPrice(row), 0)
}

export function logDashboardPipelineDiagnostics({
  currentOrganisationId = '',
  transactions = [],
  pipelineValue = 0,
  source = 'supabase',
} = {}) {
  if (!import.meta.env.DEV) return

  console.table({
    currentOrganisationId,
    transactionCount: Array.isArray(transactions) ? transactions.length : 0,
    pipelineValue,
    source,
  })
  console.table(
    (Array.isArray(transactions) ? transactions : []).map((row) => {
      const transaction = getDashboardTransaction(row)
      return {
        id: transaction?.id,
        organisation_id: transaction?.organisation_id,
        status: transaction?.status || transaction?.lifecycle_state || transaction?.current_main_stage || transaction?.stage,
        purchase_price: transaction?.purchase_price,
        deleted_at: transaction?.deleted_at,
      }
    }),
  )
}
