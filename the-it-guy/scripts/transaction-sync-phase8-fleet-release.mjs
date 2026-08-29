#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { createServer, loadEnv } from 'vite'

export function parsePhase8Args(argv = []) {
  const options = {
    recordRelease: false,
    environment: '',
    pageSize: 50,
    receiptLimit: 1000,
    canaryMaxAgeHours: 24,
    includeDemo: false,
    reason: 'Phase 8 complete-fleet transaction synchronization release gate.',
  }
  for (const arg of argv) {
    if (arg === '--record-release') options.recordRelease = true
    else if (arg === '--include-demo') options.includeDemo = true
    else if (arg === '--confirm-fleet-release') options.confirmFleetRelease = true
    else if (arg === '--confirm-production') options.confirmProduction = true
    else if (arg.startsWith('--environment=')) options.environment = arg.slice(14).trim().toLowerCase()
    else if (arg.startsWith('--page-size=')) options.pageSize = Math.min(Math.max(Number(arg.slice(12)) || 50, 1), 250)
    else if (arg.startsWith('--receipt-limit=')) options.receiptLimit = Math.min(Math.max(Number(arg.slice(16)) || 1000, 1), 5000)
    else if (arg.startsWith('--canary-max-age-hours=')) options.canaryMaxAgeHours = Math.min(Math.max(Number(arg.slice(23)) || 24, 1), 168)
    else if (arg.startsWith('--confirm-project-ref=')) options.confirmProjectRef = arg.slice(22).trim()
    else if (arg.startsWith('--reason=')) options.reason = arg.slice(9).trim()
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

export function assertPhase8Target(options, projectRef) {
  if (!options.environment) throw new Error('Phase 8 requires --environment=<environment>.')
  if (!options.recordRelease) return
  if (options.confirmFleetRelease !== true) throw new Error('Recording requires --confirm-fleet-release.')
  if (!options.confirmProjectRef || options.confirmProjectRef !== projectRef) {
    throw new Error(`Recording requires --confirm-project-ref=${projectRef}.`)
  }
  if (options.environment === 'production' && options.confirmProduction !== true) {
    throw new Error('Production recording requires --confirm-production.')
  }
}

async function main() {
  const options = parsePhase8Args(process.argv.slice(2))
  const env = { ...loadEnv(options.environment || 'development', process.cwd(), ''), ...process.env }
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase URL and service-role key are required.')
  const projectRef = new URL(url).hostname.split('.')[0]
  assertPhase8Target(options, projectRef)
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const vite = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
  try {
    const { runTransactionSyncPhase8FleetRelease } = await vite.ssrLoadModule('/server/services/transactionSyncPhase8FleetReleaseService.js')
    const report = await runTransactionSyncPhase8FleetRelease(client, { ...options, projectRef })
    console.log(JSON.stringify({ projectRef, environment: options.environment, ...report }, null, 2))
    if (!report.releaseReady) process.exitCode = 1
  } finally {
    await vite.close()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`[transaction-sync-phase8] ${error.message}`)
    process.exitCode = 1
  })
}

