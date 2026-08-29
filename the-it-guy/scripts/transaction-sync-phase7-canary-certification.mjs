#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { createServer, loadEnv } from 'vite'

export function parsePhase7Args(argv = []) {
  const options = {
    certify: false,
    environment: '',
    transactionId: '',
    receiptLimit: 1000,
    includeDemo: false,
    reason: 'Phase 7 end-to-end transaction sync canary certification.',
  }
  for (const arg of argv) {
    if (arg === '--certify') options.certify = true
    else if (arg === '--include-demo') options.includeDemo = true
    else if (arg === '--confirm-canary-certification') options.confirmCanaryCertification = true
    else if (arg === '--confirm-production') options.confirmProduction = true
    else if (arg.startsWith('--environment=')) options.environment = arg.slice(14).trim().toLowerCase()
    else if (arg.startsWith('--transaction-id=')) options.transactionId = arg.slice(17).trim()
    else if (arg.startsWith('--receipt-limit=')) options.receiptLimit = Math.min(Math.max(Number(arg.slice(16)) || 1000, 1), 5000)
    else if (arg.startsWith('--confirm-project-ref=')) options.confirmProjectRef = arg.slice(22).trim()
    else if (arg.startsWith('--reason=')) options.reason = arg.slice(9).trim()
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

export function assertPhase7Target(options, projectRef) {
  if (!options.environment) throw new Error('Phase 7 requires --environment=<environment>.')
  if (!options.transactionId) throw new Error('Phase 7 requires --transaction-id=<uuid>.')
  if (!options.certify) return
  if (options.confirmCanaryCertification !== true) {
    throw new Error('Certification requires --confirm-canary-certification.')
  }
  if (!options.confirmProjectRef || options.confirmProjectRef !== projectRef) {
    throw new Error(`Certification requires --confirm-project-ref=${projectRef}.`)
  }
  if (options.environment === 'production' && options.confirmProduction !== true) {
    throw new Error('Production certification requires --confirm-production.')
  }
}

async function main() {
  const options = parsePhase7Args(process.argv.slice(2))
  const env = { ...loadEnv(options.environment || 'development', process.cwd(), ''), ...process.env }
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase URL and service-role key are required.')
  const projectRef = new URL(url).hostname.split('.')[0]
  assertPhase7Target(options, projectRef)
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const vite = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
  try {
    const { runTransactionSyncPhase7CanaryCertification } = await vite.ssrLoadModule('/server/services/transactionSyncPhase7CanaryCertificationService.js')
    const report = await runTransactionSyncPhase7CanaryCertification(client, {
      ...options,
      projectRef,
    })
    console.log(JSON.stringify({ projectRef, environment: options.environment, ...report }, null, 2))
    if (!report.releaseReady) process.exitCode = 1
  } finally {
    await vite.close()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`[transaction-sync-phase7] ${error.message}`)
    process.exitCode = 1
  })
}

