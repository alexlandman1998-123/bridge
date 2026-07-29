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
assert.match(renderer, /const signatureBlockHeight = hasSpouseSigner \? 360 : 220/)
assert.match(renderer, /if \(y - signatureBlockHeight < 84\) \{\s*addPage\(\);/)
assert.match(renderer, /const fieldHeight = 56/)
assert.match(renderer, /height: fieldHeight/)

assert.match(finalizer, /function extractVersionPlannedSigningFields/)
assert.match(finalizer, /validation_summary_json/)
assert.match(finalizer, /native_pdf_layout/)
assert.match(finalizer, /function applyAuthoritativeSigningLayout/)
assert.match(
  finalizer,
  /const signatureFields = applyAuthoritativeSigningLayout\(\{[\s\S]*fields: requiredFields\.filter\(fieldIsSignatureLike\),[\s\S]*\}\);/,
  'Final signed PDFs must embed signature assets using the rendered planned field coordinates.',
)

console.log('Mandate signature layout regression contract passed.')
