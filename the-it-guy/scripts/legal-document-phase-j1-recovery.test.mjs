import assert from 'node:assert/strict'
import fs from 'node:fs'
import { formatLegalDocumentGenerationRecovery, resolveLegalDocumentGenerationRecovery } from '../src/core/documents/legalDocumentGenerationRecovery.js'
import { assessLegalDocumentGenerationRecoveryReadiness } from '../src/core/documents/legalDocumentGenerationRecoveryReadiness.js'

const secret = 'postgres provider stack trace customer@example.com'
const cases = [
  ['GENERATION_ALREADY_IN_PROGRESS', 'Generation already running'],
  ['GENERATION_TIMEOUT', 'Generation is taking longer than expected'],
  ['VALIDATION_BLOCKED', 'Information needed'],
  ['AUTH_INVALID', 'Sign-in needs attention'],
  ['PACKETS_RLS_DENIED', 'Access needs attention'],
  ['MISSING_TEMPLATE_FILE', 'Template setup needs attention'],
  ['STORAGE_UPLOAD_FAILED', 'Draft could not be saved'],
  ['PDF_RENDER_FAILED', 'Draft could not be assembled'],
  ['UNKNOWN_PROVIDER_FAILURE', 'Generation did not complete'],
]
for (const packetType of ['otp', 'mandate']) {
  for (const [code, expectedLabel] of cases) {
    const error = Object.assign(new Error(secret), { code })
    const recovery = resolveLegalDocumentGenerationRecovery(error, { packetType })
    const formatted = formatLegalDocumentGenerationRecovery(error, { packetType })
    assert.equal(recovery.label, expectedLabel)
    assert.ok(recovery.message)
    assert.ok(recovery.nextAction)
    assert.match(formatted, /Next step:/)
    assert.doesNotMatch(formatted, /stack trace|customer@example\.com|postgres provider/i)
    assert.match(formatted, packetType === 'otp' ? /OTP/i : /mandate/i)
  }
}

const fixtureCases = cases.slice(0, 8).map(() => ({ safe: true, actionable: true, packetSpecific: true }))
const fixture = { i3: { status: 'READY_FOR_J1' }, cases: fixtureCases, surfaces: ['workspace', 'packet_panel', 'agency_pipeline', 'unit_detail', 'document_builder'], busyReleaseCovered: true }
assert.equal(assessLegalDocumentGenerationRecoveryReadiness(fixture).ready, true)
assert.ok(assessLegalDocumentGenerationRecoveryReadiness({ ...fixture, i3: { status: 'NO_GO' } }).reasons.includes('J1_I3_NOT_READY'))
assert.ok(assessLegalDocumentGenerationRecoveryReadiness({ ...fixture, surfaces: ['workspace'] }).reasons.includes('J1_GENERATION_SURFACE_UNCOVERED'))
assert.ok(assessLegalDocumentGenerationRecoveryReadiness({ ...fixture, busyReleaseCovered: false }).reasons.includes('J1_BUSY_STATE_RELEASE_UNPROVEN'))

const sources = [
  'src/components/documents/LegalDocumentWorkspace.jsx',
  'src/components/documents/DocumentPacketWorkflowPanel.jsx',
  'src/pages/agency/AgencyPipelinePage.jsx',
  'src/pages/UnitDetail.jsx',
  'src/pages/settings/SettingsSigningTemplatesPage.jsx',
].map((file) => fs.readFileSync(file, 'utf8'))
for (const source of sources) assert.match(source, /LegalDocumentGenerationRecovery/)
assert.match(sources[0], /finally[\s\S]*setActionBusy\(false\)/)
assert.match(sources[1], /finally[\s\S]*setLoadingAction\(''\)/)
assert.match(sources[2], /finally[\s\S]*setIsMandateGenerating\(false\)/)
assert.match(sources[3], /finally[\s\S]*setSalesActionLoading\(''\)/)
assert.match(sources[4], /finally[\s\S]*setPacketActionId\(''\)/)
console.log('Legal document J1 generation recovery contract passed.')
