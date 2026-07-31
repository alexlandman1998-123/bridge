import assert from 'node:assert/strict'
import fs from 'node:fs'

const renderer = fs.readFileSync('../supabase/functions/generate-mandate/index.ts', 'utf8')
const finalizer = fs.readFileSync('../supabase/functions/generate-final-signed-document/index.ts', 'utf8')

assert.match(
  renderer,
  /if \(buildPdfConverterUrl\(\) && packetType !== "mandate"\)/,
  'Mandates must use the native PDF path so planned signing fields are saved.',
)
assert.doesNotMatch(
  renderer,
  /if \(normalizedPacketType === "mandate"\) \{\s*addPage\(\);/,
  'Mandate signatures must not unconditionally force a mostly blank page before the signing section.',
)
assert.match(renderer, /const signatureBlockHeight = hasSpouseSigner \? 430 : 260/)
assert.match(renderer, /if \(y - signatureBlockHeight < 84\) \{\s*addPage\(\);/)
assert.match(renderer, /const fieldHeight = 56/)
assert.match(renderer, /height: fieldHeight/)
assert.match(renderer, /const panelHeight = 176/)
assert.match(renderer, /layoutContract: "arch9-mandate-branded-signature-layout-v2"/)
assert.doesNotMatch(renderer, /drawCentered\(targetPage, documentReference/)
assert.doesNotMatch(renderer, /const ref = documentReference/)

assert.match(finalizer, /function extractVersionPlannedSigningFields/)
assert.match(finalizer, /validation_summary_json/)
assert.match(finalizer, /native_pdf_layout/)
assert.match(finalizer, /function applyAuthoritativeSigningLayout/)
assert.match(finalizer, /const signedDateY = y > 58 \? y - 40 : Math\.max\(0, y - 12\)/)
assert.match(finalizer, /Keep digest evidence in the F2 payload only/)
assert.doesNotMatch(finalizer, /drawText\([^)]*SHA-256:/)
assert.match(
  finalizer,
  /const signatureFields = applyAuthoritativeSigningLayout\(\{[\s\S]*fields: requiredFields\.filter\(fieldIsSignatureLike\),[\s\S]*\}\);/,
  'Final signed PDFs must embed signature assets using the rendered planned field coordinates.',
)

console.log('Mandate signature layout regression contract passed.')
