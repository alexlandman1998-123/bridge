#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { HISTORICAL_TRANSACTION_CLASSIFIER_VERSION } from './lib/historicalTransactionClassifier.mjs'

const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
const scriptPath = fileURLToPath(import.meta.url)

function readEnv(fileName) {
  const target = path.resolve(process.cwd(), fileName)
  if (!fs.existsSync(target)) return {}
  return Object.fromEntries(
    fs.readFileSync(target, 'utf8').split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=')
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, '')]
      }),
  )
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    report: '',
    apply: false,
    confirmCount: null,
    reason: '',
    operator: '',
    output: '',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--report') args.report = argv[++index] || ''
    else if (token === '--apply') args.apply = true
    else if (token === '--confirm-count') args.confirmCount = Number(argv[++index])
    else if (token === '--reason') args.reason = argv[++index] || ''
    else if (token === '--operator') args.operator = argv[++index] || ''
    else if (token === '--output') args.output = argv[++index] || ''
    else if (['--delete', '--hard-delete', '--truncate'].includes(token)) {
      throw new Error(`${token} is not supported. Quarantine is a reversible soft operation.`)
    } else throw new Error(`Unknown argument: ${token}`)
  }
  return args
}

function canonicalReportPayload(report) {
  return {
    classifierVersion: report.classifierVersion,
    rows: report.rows,
  }
}

function digestReport(report) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalReportPayload(report))).digest('hex')
}

function validateReport(report) {
  if (!report || typeof report !== 'object') throw new Error('Classification report must be a JSON object.')
  if (report.classifierVersion !== HISTORICAL_TRANSACTION_CLASSIFIER_VERSION) {
    throw new Error(`Unsupported classifier version: ${report.classifierVersion || 'missing'}`)
  }
  if (report.environment !== 'production' || report.mode !== 'read_only' || report.mutatedData !== false) {
    throw new Error('The quarantine source must be an unmodified read-only production classification report.')
  }
  if (!Array.isArray(report.rows) || report.rows.length < 1 || report.rows.length > 500) {
    throw new Error('The classification report must contain between 1 and 500 rows.')
  }
  const ids = new Set()
  for (const row of report.rows) {
    if (row?.classification !== 'seed' || row?.confidence !== 'high') {
      throw new Error('Quarantine reports may contain only high-confidence seed classifications.')
    }
    if (!row.transactionId || ids.has(row.transactionId)) {
      throw new Error('Every classification row must have a unique transaction ID.')
    }
    ids.add(row.transactionId)
  }
  const summary = report.summary?.classification || {}
  if (Number(summary.real || 0) !== 0 || Number(summary.ambiguous || 0) !== 0 || Number(summary.seed || 0) !== report.rows.length) {
    throw new Error('Report summary does not match its all-seed classification rows.')
  }
  return report
}

function guardProduction(env) {
  const url = String(env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim()
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || new URL(url).hostname !== `${PRODUCTION_PROJECT_REF}.supabase.co`) {
    throw new Error('Refusing to quarantine outside the canonical production Supabase project.')
  }
  if (!serviceKey) throw new Error('A production service-role key is required.')
  return { url, serviceKey }
}

function validateApplyConfirmation(args, count) {
  if (!args.apply) return
  if (!Number.isInteger(args.confirmCount) || args.confirmCount !== count) {
    throw new Error(`--confirm-count must exactly match the ${count} classified seed transactions.`)
  }
  if (String(args.reason || '').trim().length < 8) throw new Error('--reason must explain the quarantine operation.')
  if (String(args.operator || '').trim().length < 3) throw new Error('--operator must identify the responsible operator or change.')
}

async function fetchCurrentState(client, ids) {
  const rows = []
  for (let offset = 0; offset < ids.length; offset += 200) {
    const result = await client
      .from('transactions')
      .select('id, is_active, is_demo_data, quarantined_at, quarantine_batch_id')
      .in('id', ids.slice(offset, offset + 200))
    if (result.error) throw new Error(`Failed to preflight transaction state: ${result.error.message}`)
    rows.push(...(result.data || []))
  }
  return rows
}

export async function runSeedTransactionQuarantine({ client, report, args, now = new Date().toISOString() }) {
  validateReport(report)
  validateApplyConfirmation(args, report.rows.length)
  const reportDigest = digestReport(report)
  const ids = report.rows.map((row) => row.transactionId)
  const currentRows = await fetchCurrentState(client, ids)
  if (currentRows.length !== ids.length) throw new Error('At least one classified transaction no longer exists.')

  const preflight = {
    classifiedCount: ids.length,
    currentlyActiveCount: currentRows.filter((row) => row.is_active !== false).length,
    currentlyInactiveCount: currentRows.filter((row) => row.is_active === false).length,
    alreadyQuarantinedCount: currentRows.filter((row) => Boolean(row.quarantined_at || row.quarantine_batch_id)).length,
  }
  if (!args.apply) {
    return {
      mode: 'dry_run',
      mutatedData: false,
      classifierVersion: report.classifierVersion,
      reportDigest,
      preflight,
    }
  }

  const classificationRows = report.rows.map((row) => ({
    transactionId: row.transactionId,
    classification: row.classification,
    confidence: row.confidence,
    issues: row.issues || [],
    evidence: row.evidence || {},
    scope: row.scope || {},
  }))
  const result = await client.rpc('bridge_quarantine_seed_transactions', {
    p_classification_rows: classificationRows,
    p_classifier_version: report.classifierVersion,
    p_report_digest: reportDigest,
    p_reason: String(args.reason).trim(),
    p_operator_identifier: String(args.operator).trim(),
    p_expected_count: report.rows.length,
  })
  if (result.error) throw new Error(`Quarantine RPC failed: ${result.error.message}`)

  return {
    mode: 'apply',
    mutatedData: true,
    appliedAt: now,
    classifierVersion: report.classifierVersion,
    reportDigest,
    preflight,
    result: result.data,
  }
}

async function main() {
  const args = parseArgs()
  if (!args.report) throw new Error('--report is required.')
  const reportPath = path.resolve(process.cwd(), args.report)
  const report = validateReport(JSON.parse(fs.readFileSync(reportPath, 'utf8')))
  const env = {
    ...readEnv('.env'),
    ...readEnv('.env.production.local'),
    ...readEnv('.env.local'),
    ...process.env,
  }
  const credentials = guardProduction(env)
  const client = createClient(credentials.url, credentials.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const receipt = await runSeedTransactionQuarantine({ client, report, args })
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`
  if (args.output) {
    const outputPath = path.resolve(process.cwd(), args.output)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, serialized, 'utf8')
    process.stdout.write(`${JSON.stringify({ ...receipt, outputPath }, null, 2)}\n`)
    return
  }
  process.stdout.write(serialized)
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === scriptPath) await main()

export const __seedTransactionQuarantineTestUtils = Object.freeze({
  digestReport,
  guardProduction,
  parseArgs,
  validateApplyConfirmation,
  validateReport,
})
