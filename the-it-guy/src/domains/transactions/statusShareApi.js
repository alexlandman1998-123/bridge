// transactions owns these operations and their existing recovery behavior.
import { logTransactionEventIfPossible } from './eventActions.js'
import { normalizeStage, normalizeMainStage } from '../../core/transactions/legacyReadModel.js'
import { requireClient, isMissingTableError, isMissingColumnError } from '../../lib/api/shared/readHelpers.js'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { requireScopedClient } from './contactSupport.js'
import { ensureTransactionSubprocesses } from './subprocessApi.js'
import { loadSharedDiscussion } from '../bond/financeRead.js'
import { fetchTokenScopedTransactionJourneySnapshot } from '../clientPortal/journeyRead.js'

function requireStatusTokenClient(token) {
  return requireScopedClient({
    'x-bridge-status-token': String(token || '').trim(),
  })
}

function generateStatusLinkToken() {
  return `status${crypto.randomUUID().replaceAll('-', '')}`
}

export async function getOrCreateTransactionStatusLink({ transactionId, createdByRole = 'developer' }) {
  const client = requireClient()

  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const { data: existing, error: existingError } = await client
    .from('transaction_status_links')
    .select('id, transaction_id, token, is_active, created_by_role, created_at, updated_at')
    .eq('transaction_id', transactionId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) {
    if (isMissingTableError(existingError, 'transaction_status_links')) {
      throw new Error('Transaction status links are not set up yet. Run sql/schema.sql first.')
    }

    throw existingError
  }

  if (existing) {
    return existing
  }

  const { data, error } = await client
    .from('transaction_status_links')
    .insert({
      transaction_id: transactionId,
      token: generateStatusLinkToken(),
      is_active: true,
      created_by_role: normalizeRoleType(createdByRole),
    })
    .select('id, transaction_id, token, is_active, created_by_role, created_at, updated_at')
    .single()

  if (error && error.code === '23505') {
    const conflict = await client
      .from('transaction_status_links')
      .select('id, transaction_id, token, is_active, created_by_role, created_at, updated_at')
      .eq('transaction_id', transactionId)
      .eq('is_active', true)
      .maybeSingle()

    if (conflict.error) {
      throw conflict.error
    }

    return conflict.data
  }

  if (error) {
    if (isMissingTableError(error, 'transaction_status_links')) {
      throw new Error('Transaction status links are not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'StatusLinkCreated',
    createdByRole: normalizeRoleType(createdByRole),
    eventData: {
      statusLinkId: data?.id || null,
      token: data?.token || null,
      isActive: data?.is_active ?? true,
    },
  })

  return data
}

async function resolveTransactionStatusLinkByToken(client, token) {
  const normalizedToken = String(token || '').trim()
  if (!normalizedToken) {
    throw new Error('Status token is required.')
  }

  const { data, error } = await client
    .from('transaction_status_links')
    .select('id, transaction_id, token, is_active, created_by_role, created_at, updated_at')
    .eq('token', normalizedToken)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'transaction_status_links')) {
      throw new Error('Transaction status links are not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }

  if (!data) {
    throw new Error('Status link is invalid or inactive.')
  }

  return data
}

export async function fetchTransactionStatusByToken(token) {
  const client = requireStatusTokenClient(token)
  const link = await resolveTransactionStatusLinkByToken(client, token)

  let transactionQuery = await client
    .from('transactions')
    .select(
      'id, development_id, unit_id, buyer_id, finance_type, finance_managed_by, purchaser_type, stage, current_main_stage, current_sub_stage_summary, attorney, bond_originator, next_action, comment, updated_at, created_at',
    )
    .eq('id', link.transaction_id)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'finance_managed_by') ||
      isMissingColumnError(transactionQuery.error, 'current_sub_stage_summary') ||
      isMissingColumnError(transactionQuery.error, 'purchaser_type') ||
      isMissingColumnError(transactionQuery.error, 'comment'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select(
        'id, development_id, unit_id, buyer_id, finance_type, stage, current_main_stage, attorney, bond_originator, next_action, updated_at, created_at',
      )
      .eq('id', link.transaction_id)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    throw transactionQuery.error
  }

  const transaction = transactionQuery.data
  if (!transaction) {
    throw new Error('Transaction not found.')
  }
  const transactionJourneySnapshotPromise = fetchTokenScopedTransactionJourneySnapshot(client, transaction.id)

  const [unitQuery, buyerQuery] = await Promise.all([
    client
      .from('units')
      .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
      .eq('id', transaction.unit_id)
      .maybeSingle(),
    transaction.buyer_id
      ? client.from('buyers').select('id, name, phone, email').eq('id', transaction.buyer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (unitQuery.error) {
    throw unitQuery.error
  }

  if (buyerQuery.error) {
    throw buyerQuery.error
  }

  const discussion = await loadSharedDiscussion(client, {
    transactionId: transaction.id,
    unitId: transaction.unit_id,
    viewer: 'external',
    includeLegacy: true,
    limit: 8,
  })

  const latestDiscussion = discussion[0] || null

  const subprocesses = await ensureTransactionSubprocesses(client, transaction.id, {
    createIfMissing: false,
  })
  const financeSummary = subprocesses.find((item) => item.process_type === 'finance')?.summary || null
  const transferSummary =
    subprocesses.find((item) => item.process_type === 'transfer')?.summary ||
    subprocesses.find((item) => item.process_type === 'attorney')?.summary ||
    null
  const bondSummary = subprocesses.find((item) => item.process_type === 'bond')?.summary || null
  const stage = normalizeStage(transaction.stage, unitQuery.data?.status)
  const mainStage = normalizeMainStage(transaction.current_main_stage, stage)
  const transactionJourneySnapshot = await transactionJourneySnapshotPromise

  return {
    link,
    transaction,
    unit: unitQuery.data || null,
    buyer: buyerQuery.data || null,
    subprocesses,
    stage,
    mainStage,
    financeSummary,
    attorneySummary: transferSummary,
    transferSummary,
    bondSummary,
    transactionJourneySnapshot,
    discussion,
    latestDiscussion,
    latestStatusComment:
      latestDiscussion?.commentBody ||
      latestDiscussion?.commentText ||
      transaction.comment ||
      transaction.next_action ||
      '',
    nextStep:
      transaction.next_action ||
      financeSummary?.waitingStep?.comment ||
      transferSummary?.waitingStep?.comment ||
      bondSummary?.waitingStep?.comment ||
      financeSummary?.waitingStep?.step_label ||
      transferSummary?.waitingStep?.step_label ||
      bondSummary?.waitingStep?.step_label ||
      'No next action set.',
    updatedAt: transaction.updated_at || transaction.created_at || null,
  }
}
