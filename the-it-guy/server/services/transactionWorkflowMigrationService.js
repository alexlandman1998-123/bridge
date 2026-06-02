import {
  requireClient,
  isMissingColumnError,
  isMissingTableError,
} from '../../src/services/attorneyFirmServiceShared.js'
import { resolveTransactionRollup } from './transactionWorkflowRollup.js'
import {
  getWorkflowStateForTransaction,
  persistTransactionRollup,
  syncTransactionWorkflowModel,
} from './transactionWorkflowModelService.js'
import { syncTransactionCompatibilityFields } from './transactionStageCompatibilityService.js'
import {
  buildTransactionRollupValidation,
  buildTransactionRollupValidationFallback,
  buildTransactionRollupValidationReport,
  persistTransactionRollupValidation,
} from './transactionRollupValidationService.js'

const TRANSACTION_SELECT =
  'id, finance_type, current_main_stage, stage, onboarding_status, seller_onboarding_status, lifecycle_state, seller_has_existing_bond, existing_bond, cancellation_required, updated_at, created_at, completed_at, cancelled_at'

const TRANSACTION_SELECT_FALLBACK =
  'id, finance_type, current_main_stage, stage, onboarding_status, seller_onboarding_status, lifecycle_state, updated_at, created_at, completed_at, cancelled_at'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

async function fetchTransactions(client, options = {}) {
  if (options.transactionId) {
    const single = await client
      .from('transactions')
      .select(TRANSACTION_SELECT)
      .eq('id', options.transactionId)
      .maybeSingle()

    if (!single.error) return single.data ? [single.data] : []

    if (isMissingColumnError(single.error, 'seller_has_existing_bond')) {
      const fallback = await client
        .from('transactions')
        .select(TRANSACTION_SELECT_FALLBACK)
        .eq('id', options.transactionId)
        .maybeSingle()
      if (!fallback.error) return fallback.data ? [fallback.data] : []
    }

    if (isMissingTableError(single.error, 'transactions')) return []
    throw single.error
  }

  let query = client
    .from('transactions')
    .select(TRANSACTION_SELECT)
    .order('created_at', { ascending: true })

  if (Number.isFinite(options.offset) && Number.isFinite(options.limit)) {
    query = query.range(options.offset, options.offset + options.limit - 1)
  } else if (Number.isFinite(options.limit)) {
    query = query.limit(options.limit)
  }

  const result = await query
  if (!result.error) return result.data || []

  if (isMissingColumnError(result.error, 'seller_has_existing_bond')) {
    let fallback = client
      .from('transactions')
      .select(TRANSACTION_SELECT_FALLBACK)
      .order('created_at', { ascending: true })
    if (Number.isFinite(options.offset) && Number.isFinite(options.limit)) {
      fallback = fallback.range(options.offset, options.offset + options.limit - 1)
    } else if (Number.isFinite(options.limit)) {
      fallback = fallback.limit(options.limit)
    }
    const retried = await fallback
    if (!retried.error) return retried.data || []
  }

  if (isMissingTableError(result.error, 'transactions')) return []
  throw result.error
}

async function processSingleTransaction(transaction = {}, options = {}) {
  const client = options.client || requireClient()
  const transactionId = normalizeText(transaction.id)
  const source = options.source || 'phase16_migration'

  if (!transactionId) {
    throw new Error('Transaction id is required.')
  }

  if (options.validateOnly) {
    const state = await getWorkflowStateForTransaction(transactionId, {
      client,
      transaction,
    })
    const rollup = await resolveTransactionRollup(transactionId, {
      client,
      transaction,
      normalizedState: state?.instances?.length ? state : null,
      preferLegacy: !state?.instances?.length,
    })
    const validation = buildTransactionRollupValidation({
      transaction,
      rollup,
      state,
      source,
    })
    const persistedValidation =
      options.persistValidation === false
        ? validation
        : await persistTransactionRollupValidation(validation, { client })

    return {
      transactionId,
      transaction,
      legacyRollup: rollup,
      canonicalRollup: rollup,
      validation: persistedValidation,
      compatibility: null,
      dryRun: false,
      validateOnly: true,
    }
  }

  const legacyRollup = await resolveTransactionRollup(transactionId, {
    client,
    transaction,
    preferLegacy: true,
  })

  if (options.dryRun) {
    const validation = buildTransactionRollupValidation({
      transaction,
      rollup: legacyRollup,
      state: {},
      source: `${source}_dry_run`,
    })

    return {
      transactionId,
      transaction,
      legacyRollup,
      canonicalRollup: legacyRollup,
      validation,
      compatibility: null,
      dryRun: true,
      validateOnly: false,
    }
  }

  const synced = await syncTransactionWorkflowModel(transactionId, legacyRollup, {
    client,
    transaction,
    reasonCode: 'PHASE16_BACKFILL',
    triggerType: 'migration',
    triggerId: transactionId,
    triggerSource: source,
    createdBy: options.createdBy || null,
  })

  const state = await getWorkflowStateForTransaction(transactionId, {
    client,
    transaction,
  })

  const canonicalRollup = await resolveTransactionRollup(transactionId, {
    client,
    transaction,
    normalizedState: state,
  })

  await persistTransactionRollup(transactionId, canonicalRollup, {
    client,
    previousRollup: synced.persistedRollup || state.rollup || null,
    reasonCode: 'PHASE16_CANONICAL_BACKFILL',
    triggerType: 'migration',
    triggerId: transactionId,
    triggerSource: source,
    createdBy: options.createdBy || null,
  })

  const compatibility = await syncTransactionCompatibilityFields(transactionId, canonicalRollup, {
    client,
    transaction,
    createdBy: options.createdBy || null,
    source,
  })

  const validation = buildTransactionRollupValidation({
    transaction,
    rollup: canonicalRollup,
    state,
    source,
  })
  const persistedValidation =
    options.persistValidation === false
      ? validation
      : await persistTransactionRollupValidation(validation, { client })

  return {
    transactionId,
    transaction,
    legacyRollup,
    canonicalRollup,
    validation: persistedValidation,
    compatibility,
    dryRun: false,
    validateOnly: false,
  }
}

export async function runTransactionWorkflowMigration(options = {}) {
  const client = options.client || requireClient()
  const transactions = await fetchTransactions(client, {
    transactionId: options.transactionId || '',
    limit: normalizeNumber(options.limit, 100),
    offset: normalizeNumber(options.offset, 0),
  })

  const rows = []
  const failures = []

  for (const transaction of transactions) {
    try {
      rows.push(await processSingleTransaction(transaction, options))
    } catch (error) {
      const fallbackValidation = buildTransactionRollupValidationFallback({
        transaction,
        error,
        source: options.source || 'phase16_migration',
      })
      const persistedValidation =
        options.persistValidation === false || options.dryRun
          ? fallbackValidation
          : await persistTransactionRollupValidation(fallbackValidation, { client })

      rows.push({
        transactionId: transaction.id,
        transaction,
        legacyRollup: null,
        canonicalRollup: null,
        validation: persistedValidation,
        compatibility: null,
        dryRun: options.dryRun === true,
        validateOnly: options.validateOnly === true,
        error: normalizeText(error?.message || error),
      })
      failures.push({
        transactionId: transaction.id,
        message: normalizeText(error?.message || error),
      })
    }
  }

  return {
    transactionsProcessed: rows.length,
    failedCount: failures.length,
    failures,
    report: buildTransactionRollupValidationReport(
      rows.map((row) => row.validation).filter(Boolean),
      {
        source: options.source || 'phase16_migration',
        dryRun: options.dryRun === true,
        validateOnly: options.validateOnly === true,
      },
    ),
    rows,
  }
}
