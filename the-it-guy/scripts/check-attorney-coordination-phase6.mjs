#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { assertAttorneyStagingTarget } from './lib/attorney-staging-safety.mjs'
import { buildAttorneyCoordinationPhase6Decision } from '../src/services/attorneyCoordinationAcceptancePhase6.js'

const text = (value) => String(value || '').trim()
const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''
const evidencePath = resolve(option('--evidence') || 'output/attorney-coordination/phase6-evidence.json')
const reportPath = resolve(option('--report') || 'output/attorney-coordination/phase6-report.json')
const url = text(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
const serviceKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY)
const schema = { stagingSafe: false, delegationTable: false, delegationAttribution: false, sharedProgressAttribution: false }
const diagnostics = []

try {
  assertAttorneyStagingTarget({
    supabaseUrl: url,
    expectedProjectRef: process.env.SUPABASE_STAGING_PROJECT_REF,
    productionProjectRef: process.env.VITE_PRODUCTION_SUPABASE_PROJECT_REF,
    environment: process.env.ATTORNEY_RELEASE_ENVIRONMENT || 'staging',
  })
  schema.stagingSafe = true
} catch (error) {
  diagnostics.push({ check: 'staging_target', passed: false, message: error.message })
}

if (schema.stagingSafe && serviceKey) {
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const delegation = await client.from('attorney_lane_delegations').select('id, transaction_id, attorney_role, delegate_user_id, capabilities, status, starts_at, expires_at').limit(1)
  schema.delegationTable = !delegation.error
  diagnostics.push({ check: 'delegation_table', passed: !delegation.error, message: delegation.error?.message || 'available' })

  const attribution = await client.from('transaction_events').select('id, event_data').not('event_data->attorneyActionAttribution', 'is', null).limit(1)
  schema.delegationAttribution = !attribution.error
  diagnostics.push({ check: 'event_attribution_shape', passed: !attribution.error, message: attribution.error?.message || 'queryable' })

  const progress = await client.from('transaction_shared_progress').select('id, attorney_action_attribution').limit(1)
  schema.sharedProgressAttribution = !progress.error
  diagnostics.push({ check: 'shared_progress_attribution', passed: !progress.error, message: progress.error?.message || 'available' })
} else if (!serviceKey) {
  diagnostics.push({ check: 'staging_read_credentials', passed: false, message: 'SUPABASE_SERVICE_ROLE_KEY is required for this read-only schema probe.' })
}

const evidence = existsSync(evidencePath) ? JSON.parse(readFileSync(evidencePath, 'utf8')) : null
const decision = buildAttorneyCoordinationPhase6Decision({ schema, evidence })
const reportCore = {
  phase: 6,
  mode: 'read_only_acceptance_gate',
  generatedAt: new Date().toISOString(),
  productionMutated: false,
  schema,
  diagnostics,
  evidencePath: existsSync(evidencePath) ? evidencePath : null,
  evidenceFingerprint: evidence ? createHash('sha256').update(JSON.stringify(evidence)).digest('hex') : null,
  ...decision,
}
const report = { ...reportCore, reportFingerprint: createHash('sha256').update(JSON.stringify(reportCore)).digest('hex') }
mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ ...report, reportPath }, null, 2))
if (decision.status !== 'PASSED') process.exitCode = 1
