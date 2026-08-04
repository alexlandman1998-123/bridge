import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const ROUTE = '/api/cron/document-request-canonical-automation'
const SCRIPT = 'scripts/document-request-canonical-phase16-automation.mjs'
const DEFAULT_LIMIT = 5
const MAX_LIMIT = 25
const DEFAULT_TIMEOUT_MS = 240000
const PHASE18_PILOT_TRANSACTION_IDS = Object.freeze([
  '711ec65a-c24c-4184-90e0-d1bddb01dcea',
  '4e639151-3bdb-4919-af34-d6bcbb55fec4',
  '9f46b2ba-1324-4419-b975-cb00818718f0',
  '51b80dff-4d0d-4fe7-80fc-5abebfc9e74f',
  '4a558d8c-4d0e-4d96-a3b1-e9f7e7313fb8',
  '3e611ebb-be0f-46b1-9495-9bf150cd967a',
  '63af1887-4277-4a8c-8dab-5fc4bf80089c',
  'f3de5516-a6c9-4f5d-88ca-d51114c5a84d',
  '88f73094-c2bd-4dd5-b51b-ac0425fe4689',
  '2c5ea588-71f5-4983-a6a5-b4591eecc16b',
])

export const config = {
  maxDuration: 300,
}

function json(response, status, body) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(body))
}

function safeNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function resolveQuery(request) {
  const url = new URL(request.url || ROUTE, 'http://localhost')
  return url.searchParams
}

function sanitizeReport(report = {}) {
  return {
    phase: report.phase,
    generatedAt: report.generatedAt,
    dryRun: report.dryRun,
    commitRequested: report.commitRequested,
    commitExecuted: report.commitExecuted,
    mutatedData: report.mutatedData,
    schedulingEnabled: report.schedulingEnabled,
    readiness: report.readiness,
    summary: report.summary,
    rolloutSummary: report.rollout?.summary || null,
    preflightSummary: report.preflight?.summary || null,
  }
}

async function readReport(outputPath) {
  return JSON.parse(await readFile(outputPath, 'utf8'))
}

function parseTransactionIds(value = '') {
  return String(value || '')
    .split(',')
    .map((transactionId) => transactionId.trim())
    .filter(Boolean)
}

function resolveScheduledTransactionIds() {
  const configured = parseTransactionIds(process.env.DOCUMENT_REQUEST_CANONICAL_AUTOMATION_TRANSACTION_IDS)
  if (configured.length) return configured
  return [...PHASE18_PILOT_TRANSACTION_IDS]
}

export default async function handler(request, response) {
  const startedAt = Date.now()
  const requestId = String(request.headers['x-vercel-id'] || request.headers['x-request-id'] || '').trim() || null
  const logContext = { route: ROUTE, requestId, phase: 'document_request_phase16_automation' }
  console.log(JSON.stringify({ level: 'info', message: 'Document request canonical automation started.', ...logContext }))

  if (!['GET', 'POST'].includes(request.method)) return json(response, 405, { error: 'Method not allowed.' })

  const cronSecret = String(process.env.CRON_SECRET || '').trim()
  const authorization = String(request.headers.authorization || '').trim()
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return json(response, 401, { error: 'Unauthorized.' })
  }

  const query = resolveQuery(request)
  const limit = Math.min(
    Math.max(Math.round(safeNumber(process.env.DOCUMENT_REQUEST_CANONICAL_AUTOMATION_LIMIT || query.get('limit'), DEFAULT_LIMIT)), 1),
    MAX_LIMIT,
  )
  const timeoutMs = Math.min(
    Math.max(Math.round(safeNumber(process.env.DOCUMENT_REQUEST_CANONICAL_AUTOMATION_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)), 1000),
    DEFAULT_TIMEOUT_MS,
  )
  const commitEnabled = String(process.env.DOCUMENT_REQUEST_CANONICAL_AUTOMATION_COMMIT || '').toLowerCase() === 'true'
  const allowLegacyKeys =
    String(process.env.DOCUMENT_REQUEST_CANONICAL_AUTOMATION_ALLOW_LEGACY_KEYS || '').toLowerCase() === 'true'
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const output = path.join(os.tmpdir(), `document-request-phase16-cron-automation-${runId}.json`)
  const rolloutOutput = path.join(os.tmpdir(), `document-request-phase16-cron-rollout-${runId}.json`)
  const portalOutput = path.join(os.tmpdir(), `document-request-phase16-cron-portal-${runId}.json`)
  const args = [
    SCRIPT,
    '--source=cron',
    '--scheduling-enabled',
    `--limit=${limit}`,
    `--timeout-ms=${timeoutMs}`,
    `--output=${output}`,
    `--rollout-output=${rolloutOutput}`,
    `--portal-output=${portalOutput}`,
  ]
  const scheduledTransactionIds = resolveScheduledTransactionIds()
  if (scheduledTransactionIds.length) args.push(`--transaction-ids=${scheduledTransactionIds.join(',')}`)

  if (commitEnabled) args.push('--commit', '--confirm-automation')
  if (allowLegacyKeys) args.push('--allow-legacy-keys')

  try {
    await execFileAsync(process.execPath, args, {
      cwd: process.cwd(),
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 32,
    })
    const report = await readReport(output)
    console.log(JSON.stringify({
      level: 'info',
      message: 'Document request canonical automation completed.',
      ...logContext,
      durationMs: Date.now() - startedAt,
      dryRun: report.dryRun,
      commitExecuted: report.commitExecuted,
      readyForScheduledAutomation: report.readiness?.readyForScheduledAutomation === true,
      blockedReasons: report.readiness?.blockedReasons || [],
    }))
    return json(response, 200, { ok: true, ...sanitizeReport(report) })
  } catch (error) {
    const blockedCommit = error?.code === 2
    const timedOut = error?.signal === 'SIGTERM' || String(error?.message || '').includes('timed out')
    const report = await readReport(output).catch(() => null)
    console.error(JSON.stringify({
      level: blockedCommit ? 'warn' : 'error',
      message: blockedCommit
        ? 'Document request canonical automation blocked before commit.'
        : 'Document request canonical automation failed.',
      ...logContext,
      durationMs: Date.now() - startedAt,
      status: blockedCommit ? 409 : timedOut ? 504 : 502,
      error: error?.message || 'unknown_error',
      blockedReasons: report?.readiness?.blockedReasons || [],
    }))
    return json(response, blockedCommit ? 409 : timedOut ? 504 : 502, {
      ok: false,
      error: blockedCommit ? 'Automation commit blocked by readiness gate.' : 'Document request automation failed.',
      ...(report ? sanitizeReport(report) : {}),
    })
  }
}
