import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { resolveLegalDocumentGenerationRecovery } from '../src/core/documents/legalDocumentGenerationRecovery.js'
import { buildLegalDocumentSupportReference, resolveLegalDocumentRetryPolicy } from '../src/core/documents/legalDocumentGenerationRetryPolicy.js'
import { assessLegalDocumentGenerationRetryReadiness } from '../src/core/documents/legalDocumentGenerationRetryReadiness.js'

function runJson(script, timeout = 300_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 })
  try { return JSON.parse(run.stdout) } catch { return null }
}
const j2 = runJson('scripts/legal-document-phase-j2-reconciliation.mjs')
const definitions = [
  ['validation', 'VALIDATION_BLOCKED', 'review_information'],
  ['duplicate', 'GENERATION_ALREADY_IN_PROGRESS', 'refresh'],
  ['timeout', 'GENERATION_TIMEOUT', 'refresh'],
  ['authentication', 'AUTH_INVALID', 'sign_in'],
  ['access', 'PACKETS_RLS_DENIED', 'contact_admin'],
  ['template', 'MISSING_TEMPLATE_FILE', 'contact_admin'],
  ['first_render_failure', 'PDF_RENDER_FAILED', 'retry'],
  ['repeated_render_failure', 'PDF_RENDER_FAILED', 'contact_support', 1],
]
const scenarios = definitions.map(([name, code, expectedAction, previousFailureCount = 0]) => {
  const recovery = resolveLegalDocumentGenerationRecovery({ code }, { packetType: 'mandate' })
  const policy = resolveLegalDocumentRetryPolicy({ recovery, previousFailureCount, packetType: 'mandate', packetId: 'probe-packet-id' })
  return { name, code, expectedAction, actualAction: policy.actionKey, failureCount: policy.failureCount, supportReference: policy.supportReference, passed: policy.actionKey === expectedAction }
})
const surfaceFiles = { workspace: 'src/components/documents/LegalDocumentWorkspace.jsx', packet_panel: 'src/components/documents/DocumentPacketWorkflowPanel.jsx', document_builder: 'src/pages/settings/SettingsSigningTemplatesPage.jsx' }
const surfaces = Object.entries(surfaceFiles).filter(([, file]) => fs.readFileSync(file, 'utf8').includes('resolveLegalDocumentRetryPolicy')).map(([name]) => name)
const unsafeInput = 'person@example.com/internal/path'
const supportReference = buildLegalDocumentSupportReference({ packetType: 'otp', packetId: unsafeInput, code: 'PDF_RENDER_FAILED' })
const supportReferencesSafe = supportReference.startsWith('LD-OTP-') && !supportReference.includes('@') && !supportReference.includes('.') && !supportReference.includes('/')
const assessment = assessLegalDocumentGenerationRetryReadiness({ j2: j2 || {}, scenarios, surfaces, supportReferencesSafe })
const solutions = {
  J3_J2_NOT_READY: 'Complete J2 ambiguous-result reconciliation and its upstream gates before certifying controlled retries.',
  J3_RETRY_POLICY_INCOMPLETE: 'Map each failure class to review, refresh, sign-in, administrator, one retry, or support escalation.',
  J3_RECOVERY_ACTION_SURFACE_UNCOVERED: 'Use the shared retry policy in the workspace, packet panel, and document builder.',
  J3_SUPPORT_REFERENCE_UNSAFE: 'Generate stable support references without email addresses, paths, or raw backend details.',
}
console.log(JSON.stringify({ phase: 'J3', status: assessment.ready ? 'READY_FOR_J4' : 'NO_GO', blockerCount: assessment.reasons.length, blockers: assessment.reasons.map((code) => ({ code, solution: solutions[code] })), evidence: { j2Status: j2?.status || 'UNAVAILABLE', scenarios, surfaces, supportReference, supportReferencesSafe }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (!assessment.ready) process.exitCode = 1
