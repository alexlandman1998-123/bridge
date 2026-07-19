import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  buildPilotDocumentFallback,
  findLatestSignableGeneratedVersion,
  isPilotDocumentFallbackVersion,
} from '../src/core/documents/pilotDocumentFallback.js'
import { assessSigningEnvelope } from '../src/core/documents/signingEnvelopeAssurance.js'
import { resolveSigningOperationalStatus } from '../src/core/documents/signingOperationalStatus.js'

const fallback = buildPilotDocumentFallback({ packetType: 'mandate', failureCode: 'PDF_RENDER_FAILED' })
const pilotVersion = {
  id: 'pilot-v1',
  render_status: 'generated',
  validation_summary_json: { generationStatus: 'preview_only', previewOnly: true, pilotFallback: fallback },
}
assert.equal(isPilotDocumentFallbackVersion(pilotVersion), true)
assert.equal(findLatestSignableGeneratedVersion([pilotVersion]), null)

const signing = resolveSigningOperationalStatus({ packetType: 'mandate', packet: { status: 'generated' }, versions: [pilotVersion] })
assert.equal(signing.state, 'pilot_review_required')

const envelope = assessSigningEnvelope({
  packet: { id: 'packet-1', organisation_id: 'org-1', current_version_number: 1, packet_type: 'mandate', status: 'signing_prep' },
  version: { ...pilotVersion, packet_id: 'packet-1', organisation_id: 'org-1', version_number: 1 },
})
assert.ok(envelope.reasons.includes('E3_PILOT_FALLBACK_NOT_SIGNABLE'))

const packetService = fs.readFileSync('src/core/documents/packetService.js', 'utf8')
assert.match(packetService, /PILOT_FALLBACK_REVIEW_REQUIRED/)
assert.match(packetService, /pilotFallback/)
console.log('pilot-document-fallback: passed')
