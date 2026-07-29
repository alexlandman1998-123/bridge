import fs from 'node:fs/promises'
import path from 'node:path'
import {
  buildOtpGenerationCoverageAudit,
  formatOtpGenerationCoverageAuditMarkdown,
} from '../src/core/documents/otpGenerationCoverageAudit.js'

function arg(name, fallback = '') {
  const prefix = `--${name}=`
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback
}

function flag(name) {
  return process.argv.includes(`--${name}`)
}

const outputPath = arg('out', 'docs/otp-template-vnext-phase1b-generation-coverage.md')
const jsonPath = arg('json-out', '')
const audit = buildOtpGenerationCoverageAudit()

if (jsonPath) {
  await fs.mkdir(path.dirname(jsonPath), { recursive: true })
  await fs.writeFile(jsonPath, `${JSON.stringify(audit, null, 2)}\n`)
}

if (flag('json')) {
  console.log(JSON.stringify(audit, null, 2))
} else {
  const markdown = formatOtpGenerationCoverageAuditMarkdown(audit)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, markdown)
  console.log(JSON.stringify({
    status: audit.status,
    outputPath,
    variants: audit.documentVariants.map((variant) => variant.key),
    routeDimensionCount: Object.keys(audit.routeDimensions).length,
    buyerBranchCount: audit.buyerOnboarding.branchCount,
    capturedFieldCount: audit.buyerOnboarding.capturedFieldCount,
    itemCount: audit.coverageSummary.itemCount,
    covered: audit.coverageSummary.covered,
    partial: audit.coverageSummary.partial,
    missing: audit.coverageSummary.missing,
    mutatedData: false,
  }, null, 2))
}
