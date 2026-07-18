import assert from 'node:assert/strict'
import fs from 'node:fs'
import { resolveLegalDocumentGenerationRecovery } from '../src/core/documents/legalDocumentGenerationRecovery.js'
import { buildLegalDocumentSupportReference, resolveLegalDocumentRetryPolicy } from '../src/core/documents/legalDocumentGenerationRetryPolicy.js'
import { assessLegalDocumentGenerationRetryReadiness } from '../src/core/documents/legalDocumentGenerationRetryReadiness.js'

const expectedActions = {
  VALIDATION_BLOCKED: 'review_information',
  GENERATION_ALREADY_IN_PROGRESS: 'refresh',
  GENERATION_TIMEOUT: 'refresh',
  AUTH_INVALID: 'sign_in',
  PACKETS_RLS_DENIED: 'contact_admin',
  MISSING_TEMPLATE_FILE: 'contact_admin',
  PDF_RENDER_FAILED: 'retry',
  STORAGE_UPLOAD_FAILED: 'retry',
}
for (const [code, actionKey] of Object.entries(expectedActions)) {
  const recovery = resolveLegalDocumentGenerationRecovery({ code }, { packetType: 'otp' })
  assert.equal(recovery.actionKey, actionKey)
  assert.ok(recovery.actionLabel)
}
const retryRecovery = resolveLegalDocumentGenerationRecovery({ code: 'PDF_RENDER_FAILED' }, { packetType: 'mandate' })
const first = resolveLegalDocumentRetryPolicy({ recovery: retryRecovery, previousFailureCount: 0, packetType: 'mandate', packetId: '12345678-1234-1234-1234-123456789012' })
assert.equal(first.actionKey, 'retry')
assert.equal(first.failureCount, 1)
assert.equal(first.escalated, false)
const second = resolveLegalDocumentRetryPolicy({ recovery: retryRecovery, previousFailureCount: 1, packetType: 'mandate', packetId: '12345678-1234-1234-1234-123456789012' })
assert.equal(second.actionKey, 'contact_support')
assert.equal(second.failureCount, 2)
assert.equal(second.escalated, true)
assert.match(second.nextAction, /Stop retrying/)
assert.match(second.nextAction, /LD-MAN-12345678-PDFRENDERF/)
const reference = buildLegalDocumentSupportReference({ packetType: 'otp', packetId: 'customer@example.com/abcdef', code: 'PDF_RENDER_FAILED' })
assert.match(reference, /^LD-OTP-/)
assert.doesNotMatch(reference, /@|\.com|\//)
assert.equal(reference, buildLegalDocumentSupportReference({ packetType: 'otp', packetId: 'customer@example.com/abcdef', code: 'PDF_RENDER_FAILED' }))

const surfaceFiles = {
  workspace: 'src/components/documents/LegalDocumentWorkspace.jsx',
  packet_panel: 'src/components/documents/DocumentPacketWorkflowPanel.jsx',
  document_builder: 'src/pages/settings/SettingsSigningTemplatesPage.jsx',
}
for (const file of Object.values(surfaceFiles)) assert.match(fs.readFileSync(file, 'utf8'), /resolveLegalDocumentRetryPolicy/)
const workspace = fs.readFileSync(surfaceFiles.workspace, 'utf8')
assert.match(workspace, /handleGenerationRecoveryAction/)
assert.match(workspace, /activeGenerationRecovery\?\.actionLabel/)
assert.match(workspace, /window\.location\.assign\('\/auth'\)/)
const panel = fs.readFileSync(surfaceFiles.packet_panel, 'utf8')
assert.match(panel, /generationRecovery\.actionLabel/)
assert.match(panel, /generationFailureCountsRef/)

const scenarios = Object.entries(expectedActions).map(([name]) => ({ name, passed: true }))
const fixture = { j2: { status: 'READY_FOR_J3' }, scenarios, surfaces: Object.keys(surfaceFiles), supportReferencesSafe: true }
assert.equal(assessLegalDocumentGenerationRetryReadiness(fixture).ready, true)
assert.ok(assessLegalDocumentGenerationRetryReadiness({ ...fixture, j2: { status: 'NO_GO' } }).reasons.includes('J3_J2_NOT_READY'))
assert.ok(assessLegalDocumentGenerationRetryReadiness({ ...fixture, supportReferencesSafe: false }).reasons.includes('J3_SUPPORT_REFERENCE_UNSAFE'))
console.log('Legal document J3 controlled retry policy passed.')
