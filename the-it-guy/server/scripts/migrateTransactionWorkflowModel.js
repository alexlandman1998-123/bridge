/* global process */
import { createServer } from 'vite'

function parseArgs(argv = []) {
  const parsed = {
    transactionId: '',
    limit: 100,
    offset: 0,
    dryRun: false,
    validateOnly: false,
  }

  for (const arg of argv) {
    if (arg === '--dry-run') parsed.dryRun = true
    else if (arg === '--validate-only') parsed.validateOnly = true
    else if (arg.startsWith('--transaction-id=')) parsed.transactionId = arg.slice('--transaction-id='.length)
    else if (arg.startsWith('--limit=')) parsed.limit = Math.max(1, Number(arg.slice('--limit='.length)) || 100)
    else if (arg.startsWith('--offset=')) parsed.offset = Math.max(0, Number(arg.slice('--offset='.length)) || 0)
  }

  return parsed
}

const options = parseArgs(process.argv.slice(2))
const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { supabase, isSupabaseConfigured } = await server.ssrLoadModule('/src/lib/supabaseClient.js')
  const { runTransactionWorkflowMigration } = await server.ssrLoadModule('/server/services/transactionWorkflowMigrationService.js')

  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Set the local environment before running the workflow model migration.')
  }

  const result = await runTransactionWorkflowMigration({
    client: supabase,
    transactionId: options.transactionId,
    limit: options.limit,
    offset: options.offset,
    dryRun: options.dryRun,
    validateOnly: options.validateOnly,
    source: 'migration_script',
  })

  if (!result.transactionsProcessed) {
    console.log('No transactions found for workflow model migration.')
    process.exit(0)
  }

  for (const row of result.rows) {
    const validation = row.validation || {}
    if (row.error) {
      console.error('[failed]', row.transactionId, row.error)
      continue
    }
    if (options.dryRun) {
      console.log('[dry-run]', row.transactionId, validation.legacyParentStage, validation.rollupStage, validation.comparisonStatus)
      continue
    }
    if (options.validateOnly) {
      console.log('[validated]', row.transactionId, validation.legacyParentStage, validation.rollupStage, validation.comparisonStatus)
      continue
    }
    console.log('[migrated]', row.transactionId, validation.legacyParentStage, validation.rollupStage, validation.comparisonStatus)
  }

  console.log(
    `Workflow model migration complete. processed=${result.transactionsProcessed} failed=${result.failedCount} dryRun=${options.dryRun} validateOnly=${options.validateOnly} mismatches=${result.report.summary.mismatchedTransactions}`,
  )
} finally {
  await server.close()
}
