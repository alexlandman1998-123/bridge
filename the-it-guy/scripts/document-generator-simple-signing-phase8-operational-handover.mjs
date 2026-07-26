import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const PHASE = 'document-generator-simple-signing-ui-phase-8'
const PHASE7_SCRIPT = 'scripts/document-generator-simple-signing-phase7-live-observation.mjs'
const DEFAULT_INPUT = 'test-results/document-generator-simple-signing-phase7/live-observation-report.json'
const DEFAULT_OUTPUT = 'test-results/document-generator-simple-signing-phase8/operational-handover-decision.json'
const EXPECTED_APP_URL = 'https://app.arch9.co.za'
const DEFAULT_MAX_AGE_MINUTES = 24 * 60

function argValue(name, fallback = '') {
  const prefix = `${name}=`
  const inline = process.argv.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || fallback : fallback
}

function numericArg(name, fallback) {
  const value = argValue(name, '')
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative number.`)
  return parsed
}

const shouldWrite = process.argv.includes('--write')
const refreshLiveObservation = process.argv.includes('--refresh-live-observation')
const inputPath = argValue('--input', DEFAULT_INPUT)
const outputPath = argValue('--output', DEFAULT_OUTPUT)
const maxAgeMinutes = numericArg('--max-age-minutes', DEFAULT_MAX_AGE_MINUTES)

function addBlocker(blockers, code, detail) {
  blockers.push(detail ? { code, detail } : { code })
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function refreshObservation() {
  const run = spawnSync(process.execPath, [PHASE7_SCRIPT, '--live', '--write', '--report', inputPath], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 20 * 1024 * 1024,
  })
  if (run.status !== 0) {
    return {
      ok: false,
      detail: String(run.stderr || run.stdout || 'Phase 7 live observation failed.').slice(0, 2000),
    }
  }
  return { ok: true }
}

function ageMinutes(isoDate) {
  const observed = Date.parse(isoDate || '')
  if (!Number.isFinite(observed)) return null
  return Math.max(0, Math.round((Date.now() - observed) / 60_000))
}

function assertEqual(blockers, actual, expected, code, detail) {
  if (actual !== expected) addBlocker(blockers, code, `${detail}: expected ${expected}, got ${actual ?? 'missing'}`)
}

function reportTextContainsSensitiveToken(report) {
  const text = JSON.stringify(report)
  const signerUrls = text.match(/https:\/\/app\.arch9\.co\.za\/sign\/[^"\\\s]+/g) || []
  return signerUrls.some((url) => url !== `${EXPECTED_APP_URL}/sign/[redacted-token]`)
}

function evaluateReport(report) {
  const blockers = []
  const observedAgeMinutes = ageMinutes(report?.observedAt)
  const allowedCalls = Array.isArray(report?.evidence?.allowedCalls) ? report.evidence.allowedCalls : []

  assertEqual(blockers, report?.phase, 'document-generator-simple-signing-ui-phase-7', 'PHASE8_INPUT_PHASE_INVALID', 'input phase')
  assertEqual(blockers, report?.status, 'healthy', 'PHASE8_PHASE7_REPORT_NOT_HEALTHY', 'phase 7 status')
  assertEqual(blockers, report?.decision, 'keep_live', 'PHASE8_PHASE7_DECISION_NOT_KEEP_LIVE', 'phase 7 decision')
  assertEqual(blockers, report?.production?.appUrl, EXPECTED_APP_URL, 'PHASE8_APP_URL_MISMATCH', 'appUrl')
  assertEqual(blockers, report?.production?.route, '/sign/:token', 'PHASE8_ROUTE_MISMATCH', 'route')
  assertEqual(blockers, report?.production?.observedUrl, `${EXPECTED_APP_URL}/sign/[redacted-token]`, 'PHASE8_TOKEN_REDACTION_MISSING', 'observedUrl')
  assertEqual(blockers, report?.production?.releaseManifest?.reachable, true, 'PHASE8_RELEASE_MANIFEST_UNREACHABLE', 'release manifest reachable')
  assertEqual(blockers, report?.production?.releaseManifest?.httpStatus, 200, 'PHASE8_RELEASE_MANIFEST_HTTP_INVALID', 'release manifest httpStatus')

  assertEqual(blockers, report?.controls?.readOnly, true, 'PHASE8_OBSERVATION_NOT_READ_ONLY', 'readOnly')
  assertEqual(blockers, report?.controls?.invokesSigningAction, false, 'PHASE8_SIGNING_ACTION_WAS_INVOKED', 'invokesSigningAction')
  assertEqual(blockers, report?.controls?.sendsRealCustomerEmails, false, 'PHASE8_EMAIL_WAS_SENT', 'sendsRealCustomerEmails')
  assertEqual(blockers, report?.controls?.generatesFinalArtifacts, false, 'PHASE8_FINAL_ARTIFACT_WAS_GENERATED', 'generatesFinalArtifacts')
  assertEqual(blockers, report?.controls?.resolvesFinalArtifactAccess, false, 'PHASE8_FINAL_ACCESS_WAS_RESOLVED', 'resolvesFinalArtifactAccess')
  assertEqual(blockers, report?.controls?.controlledTokenRedacted, true, 'PHASE8_CONTROLLED_TOKEN_NOT_REDACTED', 'controlledTokenRedacted')

  assertEqual(blockers, report?.evidence?.shellVisible, true, 'PHASE8_SIMPLE_SHELL_NOT_VISIBLE', 'shellVisible')
  assertEqual(blockers, report?.evidence?.oldSurfaceCount, 0, 'PHASE8_OLD_SIGNER_SURFACE_VISIBLE', 'oldSurfaceCount')
  assertEqual(blockers, report?.evidence?.forbiddenCallCount, 0, 'PHASE8_FORBIDDEN_CALLS_OCCURRED', 'forbiddenCallCount')

  if (observedAgeMinutes === null) addBlocker(blockers, 'PHASE8_OBSERVATION_TIMESTAMP_INVALID', report?.observedAt || 'missing')
  else if (observedAgeMinutes > maxAgeMinutes) addBlocker(blockers, 'PHASE8_OBSERVATION_STALE', `${observedAgeMinutes} minutes old`)
  if ((report?.blockers || []).length) addBlocker(blockers, 'PHASE8_PHASE7_BLOCKERS_PRESENT', `${report.blockers.length} blockers`)
  if (reportTextContainsSensitiveToken(report)) addBlocker(blockers, 'PHASE8_REPORT_STORES_SIGNING_TOKEN')

  const horizontalOverflowPx = Number(report?.evidence?.horizontalOverflowPx)
  if (!Number.isFinite(horizontalOverflowPx) || horizontalOverflowPx > 2) {
    addBlocker(blockers, 'PHASE8_HORIZONTAL_OVERFLOW', String(report?.evidence?.horizontalOverflowPx ?? 'missing'))
  }
  if (!allowedCalls.some((call) => call?.functionName === 'resolve-signer-token')) {
    addBlocker(blockers, 'PHASE8_SIGNER_TOKEN_RESOLUTION_MISSING')
  }
  for (const call of allowedCalls) {
    if (call?.functionName !== 'resolve-signer-token') {
      addBlocker(blockers, 'PHASE8_UNEXPECTED_ALLOWED_CALL', call?.functionName || 'missing')
    }
  }

  return { blockers, observedAgeMinutes, allowedCalls }
}

if (refreshLiveObservation) {
  const refresh = refreshObservation()
  if (!refresh.ok) {
    const report = {
      phase: PHASE,
      status: 'NO_GO',
      decision: 'rollback_or_investigate_signer_route',
      generatedAt: new Date().toISOString(),
      input: { path: inputPath, refreshedLiveObservation: false },
      blockers: [{ code: 'PHASE8_LIVE_OBSERVATION_REFRESH_FAILED', detail: refresh.detail }],
    }
    const output = `${JSON.stringify(report, null, 2)}\n`
    if (shouldWrite) {
      fs.mkdirSync(outputPath.split('/').slice(0, -1).join('/') || '.', { recursive: true })
      fs.writeFileSync(outputPath, output)
    }
    process.stdout.write(output)
    process.exit(1)
  }
}

const inputReport = readJson(inputPath)
const assessment = evaluateReport(inputReport)
const blockers = [...new Map(assessment.blockers.map((blocker) => [`${blocker.code}:${blocker.detail || ''}`, blocker])).values()]
const go = blockers.length === 0
const report = {
  phase: PHASE,
  status: go ? 'GO' : 'NO_GO',
  decision: go ? 'keep_live' : 'rollback_or_investigate_signer_route',
  generatedAt: new Date().toISOString(),
  input: {
    path: inputPath,
    phase: inputReport.phase || null,
    status: inputReport.status || null,
    observedAt: inputReport.observedAt || null,
    observedAgeMinutes: assessment.observedAgeMinutes,
    maxAgeMinutes,
    refreshedLiveObservation: refreshLiveObservation,
  },
  production: inputReport.production || null,
  operationalState: {
    customerUseBlocked: !go,
    signerRouteProblemDetected: !go,
    documentGeneratorBackendProblemDetected: false,
    smokeTestDeliveryControlled: inputReport.controls?.sendsRealCustomerEmails === false,
    shellVisible: inputReport.evidence?.shellVisible === true,
    forbiddenCallCount: inputReport.evidence?.forbiddenCallCount ?? null,
  },
  controls: {
    noSigningActionRequired: inputReport.controls?.invokesSigningAction === false,
    noEmailSendRequired: inputReport.controls?.sendsRealCustomerEmails === false,
    noFinalArtifactGenerationRequired: inputReport.controls?.generatesFinalArtifacts === false,
    noFinalArtifactAccessRequired: inputReport.controls?.resolvesFinalArtifactAccess === false,
    controlledTokenRedacted: inputReport.controls?.controlledTokenRedacted === true,
  },
  runbook: {
    ifGo: [
      'Keep app.arch9.co.za live for the simplified signer UI.',
      'Run Phase 7 after any signer portal, signing shell, document preview, or Edge Function contract change.',
      'Use the Phase 8 decision report as the operational handover evidence.',
    ],
    ifNoGo: [
      'Rollback by redeploying the previous production frontend artifact if the signer route regressed.',
      'Preserve the Phase 7 observation report and screenshot.',
      'Do not keep retrying with customer signing tokens.',
    ],
  },
  blockers,
}

const output = `${JSON.stringify(report, null, 2)}\n`
if (shouldWrite) {
  fs.mkdirSync(outputPath.split('/').slice(0, -1).join('/') || '.', { recursive: true })
  fs.writeFileSync(outputPath, output)
}
process.stdout.write(output)
if (!go) process.exitCode = 1
