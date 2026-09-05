import fs from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const OUTPUT_PATH = 'output/bond-application-portal-phase0-boundary-audit.json'
const REQUIRED_FILES = [
  'src/App.jsx',
  'src/pages/ClientPortal.jsx',
  'src/lib/api.js',
  'src/lib/buyerBondApplicationLink.js',
  'src/modules/bond/application/index.js',
  'docs/bond-application-portal-phase0-boundary-audit.md',
]

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function check(filePath, token, label) {
  const contents = read(filePath)
  return { label, filePath, token, ok: contents.includes(token) }
}

function parseArgs(argv = process.argv.slice(2)) {
  const outputArg = argv.find((arg) => arg.startsWith('--output='))
  return { output: outputArg ? outputArg.slice('--output='.length) : OUTPUT_PATH }
}

async function main() {
  const options = parseArgs()
  const missingFiles = REQUIRED_FILES.filter((filePath) => !fs.existsSync(filePath))
  const checks = missingFiles.length ? [] : [
    check('src/App.jsx', 'path="/client/:token/bond-application"', 'legacy bond route remains explicitly identified'),
    check('src/App.jsx', '<BondApplicationPortal />', 'bond route has a dedicated portal target'),
    check('src/pages/ClientPortal.jsx', 'saveClientPortalOnboardingDraft', 'embedded draft persistence is identified'),
    check('src/pages/ClientPortal.jsx', 'reconcileClientPortalBondDocumentRequirements', 'embedded canonical-document reconciliation is identified'),
    check('src/pages/ClientPortal.jsx', 'prepareClientPortalBondApplicationSubmission', 'embedded submission preparation is identified'),
    check('src/lib/api.js', 'fetchClientPortalNormalizedBondApplication', 'isolated application read API exists'),
    check('src/lib/api.js', 'reconcileClientPortalBondDocumentRequirements', 'isolated document reconciliation API exists'),
    check('src/lib/api.js', 'prepareClientPortalBondApplicationSubmission', 'isolated submission API exists'),
    check('src/lib/buyerBondApplicationLink.js', 'resolveBuyerBondApplicationLink', 'buyer navigation seam exists'),
    check('docs/bond-application-portal-phase0-boundary-audit.md', '## Freeze rules', 'legacy-surface freeze is documented'),
  ]
  const failedChecks = checks.filter((item) => !item.ok)
  const report = {
    version: 'bond-application-portal-phase0-boundary-audit-v1',
    generatedAt: new Date().toISOString(),
    mutatedData: false,
    missingFiles,
    checks,
    gate: {
      status: missingFiles.length || failedChecks.length ? 'blocked' : 'phase1_ready',
      ok: missingFiles.length === 0 && failedChecks.length === 0,
      failedChecks,
    },
  }
  await mkdir(path.dirname(options.output), { recursive: true })
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ status: report.gate.status, checks: checks.length, failedChecks: failedChecks.length, output: options.output }))
  if (!report.gate.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error.message || error)
  process.exitCode = 1
})
