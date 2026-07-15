import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  getOtpBaselineHashPayload,
  stableStringify,
  validateOtpAttorneyReview,
  validateOtpLegalBaseline,
} from '../src/core/documents/otpLegalBaseline.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function getArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

async function main() {
  const baselinePath = path.resolve(ROOT, getArg('baseline', 'docs/legal/otp-baseline/current.json'))
  const reviewPath = path.resolve(ROOT, getArg('review', 'docs/legal/otp-baseline/attorney-review.json'))
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'))
  const review = JSON.parse(await readFile(reviewPath, 'utf8'))
  const expectedHash = createHash('sha256')
    .update(stableStringify(getOtpBaselineHashPayload(baseline)))
    .digest('hex')
  const baselineResult = validateOtpLegalBaseline(baseline)
  const reviewResult = validateOtpAttorneyReview(review, baseline)
  const errors = [...baselineResult.errors, ...reviewResult.errors]
  if (expectedHash !== baseline.baselineHash) errors.push('Baseline content has drifted from its recorded hash.')
  if (process.argv.includes('--require-approved') && review.status !== 'approved') {
    errors.push('Attorney review is not approved.')
  }
  if (process.argv.includes('--require-approved') && Number(baseline?.summary?.blockingFindingCount) > 0) {
    errors.push(`Baseline has ${baseline.summary.blockingFindingCount} unresolved blocking finding(s).`)
  }
  if (errors.length) throw new Error(errors.join('\n- '))
  console.log(JSON.stringify({
    ok: true,
    baselineHash: baseline.baselineHash,
    templateId: baseline.template.id,
    sections: baseline.summary.sectionCount,
    variables: baseline.summary.variableCount,
    attorneyReviewStatus: review.status,
  }, null, 2))
}

main().catch((error) => {
  console.error(`[OTP baseline verification] ${error.message}`)
  process.exitCode = 1
})
