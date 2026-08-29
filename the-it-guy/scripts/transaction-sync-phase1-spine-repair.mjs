#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { createServer, loadEnv } from 'vite'

export function parsePhase1Args(argv = []) {
  const options = { mode: 'plan', limit: 25, offset: 0, includeDemo: false, transactionId: '', environment: '' }
  for (const arg of argv) {
    if (arg === '--apply') options.mode = 'apply'
    else if (arg === '--include-demo') options.includeDemo = true
    else if (arg === '--confirm-production') options.confirmProduction = true
    else if (arg.startsWith('--transaction-id=')) options.transactionId = arg.slice(17)
    else if (arg.startsWith('--limit=')) options.limit = Math.max(1, Math.min(Number(arg.slice(8)) || 25, 1000))
    else if (arg.startsWith('--offset=')) options.offset = Math.max(0, Number(arg.slice(9)) || 0)
    else if (arg.startsWith('--environment=')) options.environment = arg.slice(14).trim().toLowerCase()
    else if (arg.startsWith('--confirm-project-ref=')) options.confirmProjectRef = arg.slice(22).trim()
  }
  return options
}

export function assertPhase1ApplyGate(options, { projectRef }) {
  if (options.mode !== 'apply') return
  if (!options.environment) throw new Error('Apply requires --environment=<environment>.')
  if (!options.confirmProjectRef || options.confirmProjectRef !== projectRef) {
    throw new Error(`Apply requires --confirm-project-ref=${projectRef}.`)
  }
  if (options.environment === 'production' && options.confirmProduction !== true) {
    throw new Error('Production apply requires --confirm-production.')
  }
}

async function main() {
  const options = parsePhase1Args(process.argv.slice(2))
  const modeName = options.environment || process.env.NODE_ENV || 'development'
  const env = { ...loadEnv(modeName, process.cwd(), ''), ...process.env }
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase URL and service-role key are required.')
  const projectRef = new URL(url).hostname.split('.')[0]
  assertPhase1ApplyGate(options, { projectRef })
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const vite = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
  try {
    const { runTransactionSyncPhase1 } = await vite.ssrLoadModule('/server/services/transactionSyncPhase1SpineRepairService.js')
    const report = await runTransactionSyncPhase1(client, {
      ...options,
      source: `transaction_sync_phase1_${options.mode}`,
    })
    console.log(JSON.stringify({ projectRef, environment: options.environment || 'unspecified', ...report }, null, 2))
    if (report.failedCount || (options.mode === 'apply' && report.remainingGapCount)) process.exitCode = 1
  } finally {
    await vite.close()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`[transaction-sync-phase1] ${error.message}`)
    process.exitCode = 1
  })
}
