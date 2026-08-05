import { readFile, writeFile } from 'node:fs/promises'

import {
  buildOtpCommercialTermsPersistencePhase24Audit,
} from '../src/core/documents/otpCommercialTermsPersistencePhase24.js'
import {
  buildOtpCommercialTermsReviewPhase25Audit,
  formatOtpCommercialTermsReviewPhase25Markdown,
} from '../src/core/documents/otpCommercialTermsReviewPhase25.js'

const checkedAt = process.env.OTP_COMMERCIAL_TERMS_REVIEW_REPORT_TIME || new Date().toISOString()
const migrationSql = await readFile(new URL('../../supabase/migrations/202608050010_otp_commercial_terms_persistence.sql', import.meta.url), 'utf8')
const serviceSource = await readFile(new URL('../src/services/documents/otpCommercialTermsPersistenceService.js', import.meta.url), 'utf8')
const reviewComponentSource = await readFile(new URL('../src/components/documents/OtpCommercialTermsReviewPanel.jsx', import.meta.url), 'utf8')

const phase24Audit = buildOtpCommercialTermsPersistencePhase24Audit({
  checkedAt,
  migrationSql,
  serviceSource,
})
const report = buildOtpCommercialTermsReviewPhase25Audit({
  checkedAt,
  phase24Audit,
  reviewComponentSource,
})
const outputUrl = new URL('../docs/otp-commercial-terms-phase25-review-ui.md', import.meta.url)

await writeFile(outputUrl, formatOtpCommercialTermsReviewPhase25Markdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
