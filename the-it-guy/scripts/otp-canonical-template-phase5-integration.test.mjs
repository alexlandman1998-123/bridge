import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import {
  OTP_CANONICAL_DOCX_SHA256,
  OTP_CANONICAL_MANIFEST_SHA256,
  runCanonicalOtpReferenceMatrix,
} from '../src/core/documents/otpCanonicalReferenceMatrix.js'

const docxUrl = new URL('../templates/legal/kingstons-2026-otp-canonical-v1.docx', import.meta.url)
const manifestUrl = new URL('../templates/legal/kingstons-2026-otp-canonical-v1.manifest.json', import.meta.url)
const sha256 = (url) => crypto.createHash('sha256').update(fs.readFileSync(url)).digest('hex')

assert.equal(sha256(docxUrl), OTP_CANONICAL_DOCX_SHA256)
assert.equal(sha256(manifestUrl), OTP_CANONICAL_MANIFEST_SHA256)

const manifest = JSON.parse(fs.readFileSync(manifestUrl, 'utf8'))
const expectedTokens = new Set(manifest.fields.flatMap((field) => field.slots.map((slot) => slot.token)))
const documentXml = execFileSync('unzip', ['-p', docxUrl.pathname, 'word/document.xml'], { encoding: 'utf8' })
const actualTokens = new Set([...documentXml.matchAll(/\{([a-z0-9_]+)\}/g)].map((match) => match[1]))
assert.deepEqual([...actualTokens].sort(), [...expectedTokens].sort())

const matrix = runCanonicalOtpReferenceMatrix({
  template: {
    document_model: 'single_master_document',
    template_storage_path: 'otp/candidates/kingstons-2026-v1.docx',
    template_file_name: 'kingstons-2026-otp-canonical-v1.docx',
  },
})
assert.equal(matrix.canPublish, true)
assert.equal(matrix.passedCount, 6)
assert.equal(matrix.assetEvidence.tokenCount, actualTokens.size)

const settingsSource = fs.readFileSync(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')
const packetSource = fs.readFileSync(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
assert.match(settingsSource, /runCanonicalOtpReferenceMatrix/)
assert.match(settingsSource, /last_canonical_otp_reference_matrix/)
assert.match(packetSource, /resolveOtpReferenceMatrixGovernance/)

console.log('Canonical OTP Phase 5 integration checks passed.')
