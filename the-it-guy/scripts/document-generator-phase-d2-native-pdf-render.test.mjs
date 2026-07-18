import assert from 'node:assert/strict'
import fs from 'node:fs'

const edge = fs.readFileSync('../supabase/functions/generate-mandate/index.ts', 'utf8')
const service = fs.readFileSync('src/core/documents/packetService.js', 'utf8')
const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const workspace = fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607180011_server_attested_native_pdf_render_d2.sql', 'utf8')

assert.match(edge, /resolveFrozenNativeRenderInputD2/)
assert.match(edge, /inputAuthority: "database_frozen_revision"/)
assert.match(edge, /\.eq\("render_freeze_id", freezeId\)/)
assert.match(edge, /rawPlaceholders = frozenInput\.placeholders/)
assert.match(edge, /sectionManifest = frozenInput\.sections/)
assert.match(edge, /assertValidPdfBytes\(outputBytes\)/)
assert.match(edge, /contract: "d2-v1"/)
assert.match(edge, /renderAttestation/)
assert.match(service, /native_render_attestation: artifact\.renderAttestation/)
assert.match(api, /verifyServerAttestedNativePdfRender/)
assert.match(workspace, /await verifyServerAttestedNativePdfRender/)
assert.match(migration, /bridge_verify_native_pdf_render_d2/)
assert.match(migration, /native_pdf_verified = true/)
assert.match(migration, /D2_NATIVE_PDF_ATTESTATION_MISMATCH/)

console.log('Document generator Phase D2 server-attested native PDF render contract passed.')
