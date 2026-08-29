#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { createServer, loadEnv } from 'vite'

export function parsePhase6Args(argv = []) {
  const options = {
    mode: 'plan',
    environment: '',
    transactionId: '',
    limit: 25,
    offset: 0,
    receiptLimit: 1000,
    includeDemo: false,
    reason: 'Phase 6 controlled transaction sync metadata recovery.',
  }
  for (const arg of argv) {
    if (arg === '--apply') options.mode = 'apply'
    else if (arg === '--include-demo') options.includeDemo = true
    else if (arg === '--confirm-controlled-recovery') options.confirmControlledRecovery = true
    else if (arg === '--confirm-production') options.confirmProduction = true
    else if (arg.startsWith('--environment=')) options.environment = arg.slice(14).trim().toLowerCase()
    else if (arg.startsWith('--transaction-id=')) options.transactionId = arg.slice(17).trim()
    else if (arg.startsWith('--limit=')) options.limit = Math.min(Math.max(Number(arg.slice(8)) || 25, 1), 1000)
    else if (arg.startsWith('--offset=')) options.offset = Math.max(Number(arg.slice(9)) || 0, 0)
    else if (arg.startsWith('--receipt-limit=')) options.receiptLimit = Math.min(Math.max(Number(arg.slice(16)) || 1000, 1), 5000)
    else if (arg.startsWith('--confirm-project-ref=')) options.confirmProjectRef = arg.slice(22).trim()
    else if (arg.startsWith('--reason=')) options.reason = arg.slice(9).trim()
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

export function assertPhase6Target(options, projectRef) {
  if (!options.environment) throw new Error('Phase 6 requires --environment=<environment>.')
  if (options.mode !== 'apply') return
  if (options.confirmControlledRecovery !== true) {
    throw new Error('Apply requires --confirm-controlled-recovery.')
  }
  if (!options.confirmProjectRef || options.confirmProjectRef !== projectRef) {
    throw new Error(`Apply requires --confirm-project-ref=${projectRef}.`)
  }
  if (options.environment === 'production' && options.confirmProduction !== true) {
    throw new Error('Production apply requires --confirm-production.')
  }
}

async function main() {
  const options = parsePhase6Args(process.argv.slice(2))
  const env = { ...loadEnv(options.environment || 'development', process.cwd(), ''), ...process.env }
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase URL and service-role key are required.')
  const projectRef = new URL(url).hostname.split('.')[0]
  assertPhase6Target(options, projectRef)
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const vite = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
  try {
    const { runTransactionSyncPhase6ControlledRecovery } = await vite.ssrLoadModule('/server/services/transactionSyncPhase6ControlledRecoveryService.js')
    const report = await runTransactionSyncPhase6ControlledRecovery(client, options)
    console.log(JSON.stringify({ projectRef, environment: options.environment, ...report }, null, 2))
    if (report.failedCount || report.blockedCount || !report.releaseReady) process.exitCode = 1
  } finally {
    await vite.close()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`[transaction-sync-phase6] ${error.message}`)
    process.exitCode = 1
  })
}

