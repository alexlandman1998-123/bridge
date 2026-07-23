import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessGeneratedDraftArtifact, assessPersistedDraftArtifact } from '../src/core/documents/draftArtifactAssurance.js'

const artifact = { renderedFileBucket: 'documents', renderedFilePath: 'packet/draft.docx', renderedFileName: 'draft.docx', renderedMediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', renderedByteLength: 1234, renderedSha256: `sha256:${'a'.repeat(64)}` }
assert.equal(assessGeneratedDraftArtifact({ artifact, packetType: 'mandate' }).ready, true)
assert.ok(assessGeneratedDraftArtifact({ artifact: { ...artifact, renderedSha256: '' } }).reasons.includes('D2_ARTIFACT_DIGEST_INVALID'))
const version = { rendered_file_path: artifact.renderedFilePath, validation_summary_json: { artifact_provenance: { bucket: artifact.renderedFileBucket, path: artifact.renderedFilePath, fileName: artifact.renderedFileName, mediaType: artifact.renderedMediaType, byteLength: artifact.renderedByteLength, sha256: artifact.renderedSha256 } } }
assert.equal(assessPersistedDraftArtifact({ version, packetType: 'mandate' }).ready, true)
assert.ok(assessPersistedDraftArtifact({ version: { ...version, rendered_file_path: 'changed.docx' } }).reasons.includes('D2_VERSION_ARTIFACT_PATH_MISMATCH'))

const canonicalGenerator = fs.readFileSync('../supabase/functions/generate-mandate/index.ts', 'utf8')
const service = fs.readFileSync('src/core/documents/packetService.js', 'utf8')
const verify = fs.readFileSync('scripts/legal-document-phase-d2-verify.mjs', 'utf8')
const a2 = fs.readFileSync('scripts/legal-document-phase-a2-readiness.mjs', 'utf8')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.match(canonicalGenerator, /packetType === "otp"/)
assert.match(canonicalGenerator, /crypto\.subtle\.digest\("SHA-256"/)
assert.match(canonicalGenerator, /byteLength:/)
assert.match(canonicalGenerator, /sha256:/)
assert.match(service, /assertGeneratedDraftArtifact/)
assert.match(service, /artifact_provenance/)
assert.match(verify, /D2_ARTIFACT_DIGEST_MISMATCH/)
assert.match(verify, /\.storage\.from\(stored\.bucket\)\.download\(stored\.path\)/)
assert.match(verify, /mutatedData: false/)
assert.match(a2, /legal-document-phase-d2-verify\.mjs/)
for (const name of ['test:legal-documents-phase-d2', 'verify:legal-documents:phase-d2']) assert.ok(pkg.scripts?.[name])

console.log('Legal document D2 persisted-artifact assurance contract passed.')
