import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const PHASE = 'document-generator-final-mile-phase-8'
const PHASE7_SCRIPT = 'scripts/document-generator-final-mile-phase7-production-observation.mjs'
const DEFAULT_INPUT = 'docs/audits/document-generator-final-mile-phase-7-observation.json'
const DEFAULT_OUTPUT = 'docs/audits/document-generator-final-mile-phase-8-decision.json'
const EXPECTED_RELEASE_ID = '05f5f20d14ee3a6e1ef50b8c180b078cf28a7b77'
const EXPECTED_PROJECT_REF = 'isdowlnollckzvltkasn'
const EXPECTED_APP_URL = 'https://app.arch9.co.za'
const DEFAULT_MAX_AGE_MINUTES = 24 * 60
const EXPECTED_PACKETS = new Map([
  ['otp', 'otp-v2-final-signed.pdf'],
  ['mandate', 'mandate-v2-final-signed.pdf'],
])

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
  const run = spawnSync(process.execPath, [PHASE7_SCRIPT, '--write', '--allow-local-release-drift', '--report', inputPath], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 20 * 1024 * 1024,
  })
  if (run.status !== 0) {
    return {
      ok: false,
      detail: String(run.stderr || run.stdout || 'Phase 7 observation failed.').slice(0, 2000),
    }
  }
  return { ok: true }
}

function ageMinutes(isoDate) {
  const observed = Date.parse(isoDate || '')
  if (!Number.isFinite(observed)) return null
  return Math.max(0, Math.round((Date.now() - observed) / 60_000))
}

function statusCount(packets, key) {
  return packets.filter((packet) => packet.status === key).length
}

function assertEqual(blockers, actual, expected, code, detail) {
  if (actual !== expected) addBlocker(blockers, code, `${detail}: expected ${expected}, got ${actual ?? 'missing'}`)
}

function evaluateReport(report) {
  const blockers = []
  const packets = Array.isArray(report?.packets) ? report.packets : []
  const observedAgeMinutes = ageMinutes(report?.observedAt)

  assertEqual(blockers, report?.phase, 'document-generator-final-mile-phase-7', 'PHASE8_INPUT_PHASE_INVALID', 'input phase')
  assertEqual(blockers, report?.status, 'healthy', 'PHASE8_PHASE7_REPORT_NOT_HEALTHY', 'phase 7 status')
  assertEqual(blockers, report?.mutatedData, false, 'PHASE8_PHASE7_MUTATED_DATA', 'phase 7 mutatedData')
  assertEqual(blockers, report?.production?.appUrl, EXPECTED_APP_URL, 'PHASE8_APP_URL_MISMATCH', 'appUrl')
  assertEqual(blockers, report?.production?.projectRef, EXPECTED_PROJECT_REF, 'PHASE8_PROJECT_REF_MISMATCH', 'projectRef')
  assertEqual(blockers, report?.release?.expectedReleaseId, EXPECTED_RELEASE_ID, 'PHASE8_EXPECTED_RELEASE_MISMATCH', 'expected release')
  assertEqual(blockers, report?.release?.liveReleaseId, EXPECTED_RELEASE_ID, 'PHASE8_LIVE_RELEASE_MISMATCH', 'live release')
  assertEqual(blockers, report?.release?.manifestSupabaseOrigin, 'https://isdowlnollckzvltkasn.supabase.co', 'PHASE8_MANIFEST_SUPABASE_ORIGIN_MISMATCH', 'manifest Supabase origin')
  assertEqual(blockers, report?.controls?.invokesDispatcher, false, 'PHASE8_DISPATCHER_WAS_INVOKED', 'invokesDispatcher')
  assertEqual(blockers, report?.controls?.sendsEmail, false, 'PHASE8_EMAIL_WAS_SENT', 'sendsEmail')
  assertEqual(blockers, report?.controls?.mutatesCustomerData, false, 'PHASE8_CUSTOMER_DATA_MUTATION', 'mutatesCustomerData')
  assertEqual(blockers, report?.controls?.signedDownloadUrlsRedacted, true, 'PHASE8_SIGNED_URL_REDACTION_MISSING', 'signed URL redaction')
  assertEqual(blockers, report?.controls?.recipientEmailsRedacted, true, 'PHASE8_RECIPIENT_EMAIL_REDACTION_MISSING', 'recipient email redaction')

  if (observedAgeMinutes === null) addBlocker(blockers, 'PHASE8_OBSERVATION_TIMESTAMP_INVALID', report?.observedAt || 'missing')
  else if (observedAgeMinutes > maxAgeMinutes) addBlocker(blockers, 'PHASE8_OBSERVATION_STALE', `${observedAgeMinutes} minutes old`)
  if ((report?.blockers || []).length) addBlocker(blockers, 'PHASE8_PHASE7_BLOCKERS_PRESENT', `${report.blockers.length} blockers`)
  if (packets.length !== EXPECTED_PACKETS.size) addBlocker(blockers, 'PHASE8_PACKET_PAIR_INCOMPLETE', `${packets.length} packets observed`)

  for (const [label, expectedFileName] of EXPECTED_PACKETS) {
    const packet = packets.find((candidate) => candidate.label === label)
    if (!packet) {
      addBlocker(blockers, 'PHASE8_PACKET_MISSING', label)
      continue
    }
    assertEqual(blockers, packet.status, 'healthy', 'PHASE8_PACKET_NOT_HEALTHY', label)
    assertEqual(blockers, packet.completion?.ready, true, 'PHASE8_COMPLETION_NOT_READY', label)
    assertEqual(blockers, packet.completion?.stage, 'completed_everywhere', 'PHASE8_COMPLETION_STAGE_NOT_FINAL', label)
    assertEqual(blockers, packet.completion?.deliveryReady, true, 'PHASE8_DELIVERY_NOT_READY', label)
    assertEqual(blockers, packet.completion?.outstandingRecipientCount, 0, 'PHASE8_OUTSTANDING_RECIPIENTS', label)
    assertEqual(blockers, packet.launchChain?.currentVersion, true, 'PHASE8_NOT_CURRENT_VERSION', label)
    assertEqual(blockers, packet.launchChain?.finalArtifactPresent, true, 'PHASE8_FINAL_ARTIFACT_MISSING', label)
    assertEqual(blockers, packet.launchChain?.transactionPublished, true, 'PHASE8_TRANSACTION_PUBLICATION_MISSING', label)
    assertEqual(blockers, packet.launchChain?.surfaceCompleted, true, 'PHASE8_SURFACE_COMPLETION_MISSING', label)
    assertEqual(blockers, packet.access?.httpStatus, 200, 'PHASE8_FINAL_ACCESS_HTTP_INVALID', label)
    assertEqual(blockers, packet.access?.success, true, 'PHASE8_FINAL_ACCESS_FAILED', label)
    assertEqual(blockers, packet.access?.available, true, 'PHASE8_FINAL_ACCESS_UNAVAILABLE', label)
    assertEqual(blockers, packet.access?.hasDownloadUrl, true, 'PHASE8_FINAL_DOWNLOAD_URL_MISSING', label)
    assertEqual(blockers, packet.access?.fileName, expectedFileName, 'PHASE8_FINAL_FILENAME_MISMATCH', label)
    assertEqual(blockers, packet.deliveryEvidence?.missingProviderEvidenceCount, 0, 'PHASE8_PROVIDER_EVIDENCE_MISSING', label)
    assertEqual(blockers, packet.lifecycleTrace?.hasFinalDeliveryCompleted, true, 'PHASE8_FINAL_DELIVERY_TRACE_MISSING', label)
    if (Number(packet.completion?.deliveredRecipientCount) !== Number(packet.completion?.recipientCount)) {
      addBlocker(blockers, 'PHASE8_COMPLETION_DELIVERY_COUNT_MISMATCH', label)
    }
    if (Number(packet.deliveryEvidence?.sentCount) !== Number(packet.completion?.recipientCount)) {
      addBlocker(blockers, 'PHASE8_DELIVERY_EVIDENCE_COUNT_MISMATCH', label)
    }
  }

  return { blockers, observedAgeMinutes, packets }
}

if (refreshLiveObservation) {
  const refresh = refreshObservation()
  if (!refresh.ok) {
    const report = {
      phase: PHASE,
      status: 'NO_GO',
      decision: 'pause_final_mile_and_investigate',
      generatedAt: new Date().toISOString(),
      input: { path: inputPath, refreshedLiveObservation: false },
      blockers: [{ code: 'PHASE8_LIVE_OBSERVATION_REFRESH_FAILED', detail: refresh.detail }],
    }
    const output = `${JSON.stringify(report, null, 2)}\n`
    if (shouldWrite) fs.writeFileSync(outputPath, output)
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
  decision: go ? 'keep_live' : 'pause_final_mile_and_investigate',
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
  release: inputReport.release || null,
  operationalState: {
    customerUseBlocked: !go,
    documentGeneratorProblemDetected: !go,
    smokeTestDeliveryControlled: inputReport.controls?.sendsEmail === false,
    recoveredPacketCount: assessment.packets.length,
    healthyPacketCount: statusCount(assessment.packets, 'healthy'),
  },
  controls: {
    noDispatcherInvocationRequired: inputReport.controls?.invokesDispatcher === false,
    noEmailSendRequired: inputReport.controls?.sendsEmail === false,
    noCustomerDataMutationRequired: inputReport.controls?.mutatesCustomerData === false,
    signedDownloadUrlsRedacted: inputReport.controls?.signedDownloadUrlsRedacted === true,
    recipientEmailsRedacted: inputReport.controls?.recipientEmailsRedacted === true,
  },
  packetSummary: assessment.packets.map((packet) => ({
    label: packet.label,
    status: packet.status,
    stage: packet.completion?.stage || null,
    recipientDelivery: `${packet.completion?.deliveredRecipientCount ?? 0}/${packet.completion?.recipientCount ?? 0}`,
    finalAccess: packet.access?.available === true && packet.access?.hasDownloadUrl === true,
    fileName: packet.access?.fileName || null,
    suppressedDeliveries: packet.deliveryEvidence?.suppressedCount ?? null,
    providerAcceptedDeliveries: packet.deliveryEvidence?.providerAcceptedCount ?? null,
  })),
  runbook: {
    ifGo: [
      'Keep app.arch9.co.za live for the repaired final-mile flow.',
      'Run the Phase 7 observation monitor after any document-generator, finaliser, delivery, storage, or access-control change.',
      'Use the Phase 8 decision report as the handover evidence for operations.',
    ],
    ifNoGo: [
      'Pause final-mile use for affected packets and preserve the Phase 7 observation report.',
      'Do not retry final delivery until the named blocker is understood.',
      'If any blocker involves real provider evidence, confirm whether an actual provider send was attempted before rerunning recovery.',
    ],
  },
  blockers,
}

const output = `${JSON.stringify(report, null, 2)}\n`
if (shouldWrite) fs.writeFileSync(outputPath, output)
process.stdout.write(output)
if (!go) process.exitCode = 1
