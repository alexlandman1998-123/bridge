import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { buildLegalDocumentGenerationSupportEvent, recordLegalDocumentGenerationSupportHandoff } from '../src/core/documents/legalDocumentGenerationSupportHandoff.js'
import { assessLegalDocumentGenerationSupportReadiness } from '../src/core/documents/legalDocumentGenerationSupportReadiness.js'

function runJson(script, timeout = 300_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 })
  try { return JSON.parse(run.stdout) } catch { return null }
}
const j3 = runJson('scripts/legal-document-phase-j3-retry-policy.mjs')
const policy = { supportReference: 'LD-MAN-PROBEPAC-PDFRENDERF', code: 'PDF_RENDER_FAILED', failureCount: 2, actionKey: 'contact_support', rawError: 'private@example.com provider stack' }
const payload = buildLegalDocumentGenerationSupportEvent({ policy, packetType: 'mandate', surface: 'workspace' })
const payloadText = JSON.stringify(payload)
const payloadSafe = payload.contract === 'j4-v1' && payload.rawDetailsIncluded === false && !payloadText.includes('private@example.com') && !payloadText.includes('provider stack')
const scenarios = []
let eventWrite = null
const recorded = await recordLegalDocumentGenerationSupportHandoff({ appendEvent: async (args) => { eventWrite = args; return { id: 'probe-event' } }, packetId: 'probe-packet', policy, packetType: 'mandate', surface: 'workspace' })
scenarios.push({ name: 'event_contract', passed: recorded.recorded && eventWrite?.eventType === 'legal_generation_support_handoff' && eventWrite?.eventPayload?.contract === 'j4-v1' })
const denied = await recordLegalDocumentGenerationSupportHandoff({ appendEvent: async () => null, packetId: 'probe-packet', policy, packetType: 'mandate', surface: 'workspace' })
scenarios.push({ name: 'rls_denial_non_blocking', passed: !denied.recorded && denied.reason === 'EVENT_NOT_WRITTEN' })
const failed = await recordLegalDocumentGenerationSupportHandoff({ appendEvent: async () => { throw new Error('write failed') }, packetId: 'probe-packet', policy, packetType: 'mandate', surface: 'workspace' })
scenarios.push({ name: 'write_failure_non_blocking', passed: !failed.recorded && failed.reason === 'EVENT_WRITE_FAILED' })
const unsaved = await recordLegalDocumentGenerationSupportHandoff({ appendEvent: async () => ({ id: 'unexpected' }), packetId: '', policy, packetType: 'mandate', surface: 'workspace' })
scenarios.push({ name: 'unsaved_packet_non_blocking', passed: !unsaved.recorded && unsaved.reason === 'PACKET_NOT_PERSISTED' })
scenarios.push({ name: 'payload_whitelist', passed: payloadSafe && Object.keys(payload).length === 8 })
const surfaceFiles = { workspace: 'src/components/documents/LegalDocumentWorkspace.jsx', packet_panel: 'src/components/documents/DocumentPacketWorkflowPanel.jsx', document_builder: 'src/pages/settings/SettingsSigningTemplatesPage.jsx' }
const surfaces = Object.entries(surfaceFiles).filter(([, file]) => fs.readFileSync(file, 'utf8').includes('recordLegalDocumentGenerationSupportHandoff')).map(([name]) => name)
const dedupeCovered = fs.readFileSync(surfaceFiles.workspace, 'utf8').includes('recordedGenerationHandoffsRef') && fs.readFileSync(surfaceFiles.packet_panel, 'utf8').includes('recordedGenerationHandoffsRef') && fs.readFileSync(surfaceFiles.document_builder, 'utf8').includes('recordedDocumentGenerationHandoffsRef')
const failureNonBlocking = scenarios.filter((row) => row.name.includes('non_blocking')).every((row) => row.passed)
const assessment = assessLegalDocumentGenerationSupportReadiness({ j3: j3 || {}, scenarios, surfaces, payloadSafe, failureNonBlocking, dedupeCovered })
const solutions = {
  J4_J3_NOT_READY: 'Complete J3 controlled retry and its upstream gates before certifying durable support handoff.',
  J4_HANDOFF_CONTRACT_INCOMPLETE: 'Record the sanitised j4-v1 support handoff and handle denied, failed, and unsaved cases without blocking users.',
  J4_HANDOFF_SURFACE_UNCOVERED: 'Wire durable handoff recording into the workspace, packet panel, and document builder.',
  J4_HANDOFF_PAYLOAD_UNSAFE: 'Whitelist support-event fields and exclude raw exceptions, email addresses, and provider details.',
  J4_DIAGNOSTIC_FAILURE_BLOCKING: 'Keep reference copying usable when audit-event persistence is unavailable.',
  J4_HANDOFF_DEDUPLICATION_MISSING: 'Deduplicate each support reference per open generation surface.',
}
console.log(JSON.stringify({ phase: 'J4', status: assessment.ready ? 'READY_FOR_K1' : 'NO_GO', blockerCount: assessment.reasons.length, blockers: assessment.reasons.map((code) => ({ code, solution: solutions[code] })), evidence: { j3Status: j3?.status || 'UNAVAILABLE', scenarios, surfaces, payload, payloadSafe, failureNonBlocking, dedupeCovered }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (!assessment.ready) process.exitCode = 1
