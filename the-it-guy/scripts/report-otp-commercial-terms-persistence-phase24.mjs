import { readFile, writeFile } from 'node:fs/promises'

import {
  buildOtpCommercialTermsPersistencePhase24Audit,
  formatOtpCommercialTermsPersistencePhase24Markdown,
} from '../src/core/documents/otpCommercialTermsPersistencePhase24.js'

const migrationSql = await readFile(new URL('../../supabase/migrations/202608050010_otp_commercial_terms_persistence.sql', import.meta.url), 'utf8')
const serviceSource = await readFile(new URL('../src/services/documents/otpCommercialTermsPersistenceService.js', import.meta.url), 'utf8')

const report = buildOtpCommercialTermsPersistencePhase24Audit({
  checkedAt: process.env.OTP_COMMERCIAL_TERMS_PERSISTENCE_REPORT_TIME || new Date().toISOString(),
  migrationSql,
  serviceSource,
})
const outputUrl = new URL('../docs/otp-commercial-terms-phase24-persistence.md', import.meta.url)

await writeFile(outputUrl, formatOtpCommercialTermsPersistencePhase24Markdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
