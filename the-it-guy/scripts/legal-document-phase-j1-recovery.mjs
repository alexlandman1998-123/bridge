import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { formatLegalDocumentGenerationRecovery } from '../src/core/documents/legalDocumentGenerationRecovery.js'
import { assessLegalDocumentGenerationRecoveryReadiness } from '../src/core/documents/legalDocumentGenerationRecoveryReadiness.js'

function runJson(script, timeout = 300_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 })
  try { return JSON.parse(run.stdout) } catch { return null }
}

const i3 = runJson('scripts/legal-document-phase-i3-backpressure.mjs')
const caseCodes = ['GENERATION_ALREADY_IN_PROGRESS', 'GENERATION_TIMEOUT', 'VALIDATION_BLOCKED', 'AUTH_INVALID', 'PACKETS_RLS_DENIED', 'MISSING_TEMPLATE_FILE', 'STORAGE_UPLOAD_FAILED', 'PDF_RENDER_FAILED', 'UNKNOWN_PROVIDER_FAILURE']
const cases = caseCodes.flatMap((code) => ['otp', 'mandate'].map((packetType) => {
  const marker = 'private-provider-detail@example.com'
  const output = formatLegalDocumentGenerationRecovery(Object.assign(new Error(marker), { code }), { packetType })
  return { code, packetType, safe: !output.includes(marker), actionable: output.includes('Next step:'), packetSpecific: packetType === 'otp' ? output.includes('OTP') : output.toLowerCase().includes('mandate') }
}))
const surfaceFiles = {
  workspace: 'src/components/documents/LegalDocumentWorkspace.jsx',
  packet_panel: 'src/components/documents/DocumentPacketWorkflowPanel.jsx',
  agency_pipeline: 'src/pages/agency/AgencyPipelinePage.jsx',
  unit_detail: 'src/pages/UnitDetail.jsx',
  document_builder: 'src/pages/settings/SettingsSigningTemplatesPage.jsx',
}
const surfaces = Object.entries(surfaceFiles).filter(([, file]) => fs.readFileSync(file, 'utf8').includes('LegalDocumentGenerationRecovery')).map(([name]) => name)
const busyReleaseCovered = /finally[\s\S]*setActionBusy\(false\)/.test(fs.readFileSync(surfaceFiles.workspace, 'utf8'))
  && /finally[\s\S]*setLoadingAction\(''\)/.test(fs.readFileSync(surfaceFiles.packet_panel, 'utf8'))
  && /finally[\s\S]*setIsMandateGenerating\(false\)/.test(fs.readFileSync(surfaceFiles.agency_pipeline, 'utf8'))
  && /finally[\s\S]*setSalesActionLoading\(''\)/.test(fs.readFileSync(surfaceFiles.unit_detail, 'utf8'))
  && /finally[\s\S]*setPacketActionId\(''\)/.test(fs.readFileSync(surfaceFiles.document_builder, 'utf8'))
const assessment = assessLegalDocumentGenerationRecoveryReadiness({ i3: i3 || {}, cases, surfaces, busyReleaseCovered })
const solutions = {
  J1_I3_NOT_READY: 'Complete the I3 duplicate-generation gate before certifying user recovery behaviour.',
  J1_RECOVERY_CONTRACT_INCOMPLETE: 'Map every generation failure to safe packet-specific copy and exactly one next step.',
  J1_GENERATION_SURFACE_UNCOVERED: 'Use the shared recovery contract in every mandate and OTP generation entry point.',
  J1_BUSY_STATE_RELEASE_UNPROVEN: 'Release the generation busy state in a finally block on every entry point.',
}
console.log(JSON.stringify({ phase: 'J1', status: assessment.ready ? 'READY_FOR_J2' : 'NO_GO', blockerCount: assessment.reasons.length, blockers: assessment.reasons.map((code) => ({ code, solution: solutions[code] })), evidence: { i3Status: i3?.status || 'UNAVAILABLE', recoveryCaseCount: cases.length, cases, surfaces, busyReleaseCovered }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (!assessment.ready) process.exitCode = 1
