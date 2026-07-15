import fs from 'node:fs'
import { runCanonicalOtpReferenceMatrix } from '../src/core/documents/otpCanonicalReferenceMatrix.js'

const outputUrl = new URL('../templates/legal/kingstons-2026-otp-canonical-v1.certification.json', import.meta.url)
const matrix = runCanonicalOtpReferenceMatrix({
  template: {
    document_model: 'single_master_document',
    template_storage_path: 'templates/legal/kingstons-2026-otp-canonical-v1.docx',
    template_file_name: 'kingstons-2026-otp-canonical-v1.docx',
  },
})

if (!matrix.canPublish) throw new Error(matrix.blockingMessages.join('\n') || 'Canonical OTP reference matrix failed.')
const report = {
  ...matrix,
  certifiedAt: new Date().toISOString(),
  scenarios: matrix.scenarios.map(({ key, label, capabilities, passed, resolvedTokenCount, tokenCount, issues }) => ({
    key, label, capabilities, passed, resolvedTokenCount, tokenCount, issues,
  })),
}
fs.writeFileSync(outputUrl, `${JSON.stringify(report, null, 2)}\n`)
console.log(`Saved ${outputUrl.pathname}`)
