import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const source = readFileSync(new URL('./roleplayer-document-context-phase12-source-drift-guard.mjs', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts['verify:roleplayer-document-context:source-drift'],
  'node scripts/roleplayer-document-context-phase12-source-drift-guard.mjs',
  'package.json should expose the Phase 12 source drift guard',
)
assert.equal(
  packageJson.scripts['test:roleplayer-document-context-phase12'],
  'node scripts/roleplayer-document-context-phase12.test.mjs',
  'package.json should expose the Phase 12 source drift guard contract test',
)

for (const marker of [
  'roleplayer_document_context_source_drift_guard_v1',
  'roleplayer_document_context_release_receipt_verifier_v1',
  'roleplayer-document-context-phase11-receipt-verifier.mjs',
  'SOURCE_DRIFT_GUARDED',
  'SOURCE_DRIFT_HOLD',
  'phase12_source_file_missing',
  'phase12_source_marker_missing',
  'phase12_package_script_missing',
  'phase11_receipt_verifier_not_verified',
  'src/lib/roleplayerDocumentContext.js',
  'src/lib/propertyDisclosure.js',
  'src/services/sellerDocumentRequirementsService.js',
  'src/services/clientPortalWorkspaceService.js',
  'src/core/documents/mandateDataMapper.js',
  'src/core/documents/packetService.js',
  'src/core/documents/packetWorkflow.js',
  'scripts/verify-roleplayer-document-context.mjs',
  'resolveDocumentBrandingContext',
  'resolveSellerDisclosureDocumentContext',
  'property-disclosure-page--page-break',
  'document-contact-row',
  'agency_website',
  'organisation.physical_address',
  'sourceDigest',
  'guardDigest',
]) {
  assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Phase 12 source drift guard should include ${marker}`)
}

assert.match(source, /phase:\s*'12'/, 'source drift guard should report itself as Phase 12')
assert.match(source, /mutatedData:\s*false/, 'source drift guard must be explicitly read-only')
assert.match(source, /receiptVerifier\.verified !== true/, 'source drift guard must require a verified Phase 11 receipt')
assert.match(source, /missingMarkers = definition\.markers\.filter/, 'source drift guard must inspect source markers')
assert.match(source, /process\.exitCode = 1/, 'source drift guard should fail the process when source drift is detected')

assert.doesNotMatch(source, /writeFileSync|renameSync|createClient/, 'source drift guard should not write files or create a Supabase client')
assert.doesNotMatch(source, /\.from\(|\.insert\(|\.upsert\(|\.delete\(/, 'source drift guard should not mutate application data')

console.log('roleplayer document context phase 12 tests passed')
