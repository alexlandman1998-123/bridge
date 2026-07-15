import fs from 'node:fs'
import path from 'node:path'
import {
  buildOtpCanonicalTemplateManifest,
  validateOtpCanonicalTemplateManifest,
} from '../src/core/documents/otpCanonicalTemplatePreparation.js'

const outputPath = path.resolve(process.argv[2] || 'templates/legal/kingstons-2026-otp-canonical-v1.manifest.json')
const manifest = buildOtpCanonicalTemplateManifest()
const validation = validateOtpCanonicalTemplateManifest(manifest)
if (!validation.valid) throw new Error(validation.errors.join('\n'))
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote ${manifest.fields.length} canonical fields and ${validation.tokenCount} DOCX slots to ${outputPath}`)
