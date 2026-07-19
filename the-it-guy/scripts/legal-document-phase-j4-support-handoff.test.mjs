import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildLegalDocumentGenerationSupportEvent, recordLegalDocumentGenerationSupportHandoff } from '../src/core/documents/legalDocumentGenerationSupportHandoff.js'
import { assessLegalDocumentGenerationSupportReadiness } from '../src/core/documents/legalDocumentGenerationSupportReadiness.js'

const policy = { supportReference: 'LD-OTP-12345678-PDFRENDERF', code: 'PDF_RENDER_FAILED', failureCount: 2, actionKey: 'contact_support', diagnostics: { issueCodes: ['template_source_missing'], resultAmbiguous: true }, rawError: 'customer@example.com postgres stack trace' }
const payload = buildLegalDocumentGenerationSupportEvent({ policy, packetType: 'otp', surface: 'workspace' })
assert.deepEqual(Object.keys(payload).sort(), ['contract', 'diagnosticIssueCodes', 'escalationType', 'failureCode', 'failureCount', 'packetType', 'rawDetailsIncluded', 'resultAmbiguous', 'supportReference', 'surface'].sort())
assert.equal(payload.contract, 'j4-v1')
assert.equal(payload.rawDetailsIncluded, false)
assert.deepEqual(payload.diagnosticIssueCodes, ['TEMPLATE_SOURCE_MISSING'])
assert.equal(payload.resultAmbiguous, true)
assert.doesNotMatch(JSON.stringify(payload), /customer@example\.com|postgres stack trace/)

let writeArgs = null
const recorded = await recordLegalDocumentGenerationSupportHandoff({ appendEvent: async (args) => { writeArgs = args; return { id: 'event-1' } }, packetId: 'packet-1', organisationId: 'org-1', policy, packetType: 'otp', surface: 'workspace' })
assert.equal(recorded.recorded, true)
assert.equal(writeArgs.eventType, 'legal_generation_support_handoff')
assert.equal(writeArgs.eventPayload.contract, 'j4-v1')
const denied = await recordLegalDocumentGenerationSupportHandoff({ appendEvent: async () => null, packetId: 'packet-1', policy, packetType: 'otp', surface: 'workspace' })
assert.deepEqual({ recorded: denied.recorded, reason: denied.reason }, { recorded: false, reason: 'EVENT_NOT_WRITTEN' })
const failed = await recordLegalDocumentGenerationSupportHandoff({ appendEvent: async () => { throw new Error('database secret') }, packetId: 'packet-1', policy, packetType: 'otp', surface: 'workspace' })
assert.deepEqual({ recorded: failed.recorded, reason: failed.reason }, { recorded: false, reason: 'EVENT_WRITE_FAILED' })
const unsaved = await recordLegalDocumentGenerationSupportHandoff({ appendEvent: async () => ({ id: 'bad' }), packetId: '', policy, packetType: 'otp', surface: 'workspace' })
assert.equal(unsaved.reason, 'PACKET_NOT_PERSISTED')
const missingReference = await recordLegalDocumentGenerationSupportHandoff({ appendEvent: async () => ({ id: 'bad' }), packetId: 'packet-1', policy: {}, packetType: 'otp', surface: 'workspace' })
assert.equal(missingReference.reason, 'REFERENCE_MISSING')

const surfaceFiles = {
  workspace: 'src/components/documents/LegalDocumentWorkspace.jsx',
  packet_panel: 'src/components/documents/DocumentPacketWorkflowPanel.jsx',
  document_builder: 'src/pages/settings/SettingsSigningTemplatesPage.jsx',
}
for (const file of Object.values(surfaceFiles)) assert.match(fs.readFileSync(file, 'utf8'), /recordLegalDocumentGenerationSupportHandoff/)
for (const file of [surfaceFiles.workspace, surfaceFiles.packet_panel]) assert.match(fs.readFileSync(file, 'utf8'), /recordedGenerationHandoffsRef/)
assert.match(fs.readFileSync(surfaceFiles.document_builder, 'utf8'), /recordedDocumentGenerationHandoffsRef/)
const scenarios = ['recorded', 'denied', 'failed', 'unsaved', 'missing_reference'].map((name) => ({ name, passed: true }))
const fixture = { j3: { status: 'READY_FOR_J4' }, scenarios, surfaces: Object.keys(surfaceFiles), payloadSafe: true, failureNonBlocking: true, dedupeCovered: true }
assert.equal(assessLegalDocumentGenerationSupportReadiness(fixture).ready, true)
assert.ok(assessLegalDocumentGenerationSupportReadiness({ ...fixture, j3: { status: 'NO_GO' } }).reasons.includes('J4_J3_NOT_READY'))
assert.ok(assessLegalDocumentGenerationSupportReadiness({ ...fixture, payloadSafe: false }).reasons.includes('J4_HANDOFF_PAYLOAD_UNSAFE'))
console.log('Legal document J4 durable support handoff passed.')
