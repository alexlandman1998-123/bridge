import {
  runTransactionSyncPhase5OperationalAssurance,
} from './transactionSyncPhase5OperationalAssuranceService.js'

function text(value) {
  return String(value || '').trim()
}

async function requestRecovery(client, transactionId, { apply, reason }) {
  const result = await client.rpc('bridge_reconcile_transaction_sync_metadata_phase6', {
    p_transaction_id: transactionId,
    p_apply: apply === true,
    p_reason: reason,
  })
  if (result.error) throw result.error
  return result.data || null
}

export async function runTransactionSyncPhase6ControlledRecovery(client, options = {}) {
  const mode = options.mode === 'apply' ? 'apply' : 'plan'
  const reason = text(options.reason)
  if (reason.length < 12 || reason.length > 500) {
    throw new Error('A recovery reason between 12 and 500 characters is required.')
  }

  const auditOptions = {
    transactionId: text(options.transactionId),
    limit: options.limit,
    offset: options.offset,
    receiptLimit: options.receiptLimit,
    includeDemo: options.includeDemo === true,
  }
  const before = await runTransactionSyncPhase5OperationalAssurance(client, auditOptions)
  const rows = []
  const failures = [...before.failures]

  for (const assessment of before.rows) {
    try {
      const plan = await requestRecovery(client, assessment.transactionId, {
        apply: false,
        reason,
      })
      let result = plan
      if (mode === 'apply' && ['repairable', 'no_op'].includes(plan?.status)) {
        result = await requestRecovery(client, assessment.transactionId, {
          apply: true,
          reason,
        })
      }
      rows.push({
        transactionId: assessment.transactionId,
        beforeStatus: assessment.status,
        plan,
        result,
      })
    } catch (error) {
      failures.push({ transactionId: assessment.transactionId, message: String(error?.message || error) })
    }
  }

  const after = mode === 'apply'
    ? await runTransactionSyncPhase5OperationalAssurance(client, auditOptions)
    : null
  for (const failure of after?.failures || []) {
    if (!failures.some((item) => item.transactionId === failure.transactionId && item.message === failure.message)) {
      failures.push(failure)
    }
  }
  const blockedCount = rows.filter((row) => row.plan?.status === 'blocked').length
  const repairableCount = rows.filter((row) => row.plan?.status === 'repairable').length
  const repairedCount = rows.filter((row) => row.result?.status === 'repaired').length

  return {
    phase: 6,
    mode,
    generatedAt: new Date().toISOString(),
    transactionsProcessed: before.transactionsProcessed,
    blockedCount,
    repairableCount,
    repairedCount,
    failedCount: failures.length,
    releaseReady: mode === 'apply' ? Boolean(after?.releaseReady) : Boolean(before.releaseReady),
    before,
    after,
    failures,
    rows,
  }
}
