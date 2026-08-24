import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import {
  buildRentalListingOperationalReport,
  formatRentalListingOperationalReportMarkdown,
} from '../the-it-guy/src/services/rentals/rentalListingOperationalReportModel.js'
import {
  buildRentalListingReleaseGate,
} from '../the-it-guy/src/services/rentals/rentalListingReleaseGateModel.js'

const repoRoot = process.cwd()
const DEFAULT_JSON_OUTPUT = path.join(repoRoot, 'docs', 'rental-listing-phase9-operational-release.json')
const DEFAULT_MARKDOWN_OUTPUT = path.join(repoRoot, 'docs', 'rental-listing-phase9-operational-release.md')

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    json: false,
    write: false,
    output: DEFAULT_JSON_OUTPUT,
    markdownOutput: DEFAULT_MARKDOWN_OUTPUT,
    environment: 'staging_candidate',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--json') options.json = true
    else if (arg === '--write') options.write = true
    else if (arg === '--output') options.output = path.resolve(repoRoot, argv[++index])
    else if (arg.startsWith('--output=')) options.output = path.resolve(repoRoot, arg.slice('--output='.length))
    else if (arg === '--markdown-output') options.markdownOutput = path.resolve(repoRoot, argv[++index])
    else if (arg.startsWith('--markdown-output=')) options.markdownOutput = path.resolve(repoRoot, arg.slice('--markdown-output='.length))
    else if (arg === '--environment') options.environment = argv[++index] || options.environment
    else if (arg.startsWith('--environment=')) options.environment = arg.slice('--environment='.length) || options.environment
  }
  return options
}

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function collectSourceFiles(directory) {
  if (!fs.existsSync(directory)) return []
  const entries = fs.readdirSync(directory, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectSourceFiles(absolutePath)
    return /\.(js|jsx|ts|tsx)$/.test(entry.name) ? [absolutePath] : []
  })
}

function rentalSourceText() {
  const roots = [
    path.join(repoRoot, 'the-it-guy', 'src', 'pages', 'rentals'),
    path.join(repoRoot, 'the-it-guy', 'src', 'services', 'rentals'),
  ]
  return roots
    .flatMap(collectSourceFiles)
    .map((filePath) => `${filePath}\n${readFile(filePath)}`)
    .join('\n\n')
}

function sourceGuards() {
  const source = rentalSourceText()
  const liveProperty24WritePatterns = [
    /callProperty24ListingAction\s*\(/,
    /property24\/listings\/[^'"]+\/publish/,
    /publishProperty24Listing\s*\(/,
    /server\/property24\/publishService/,
  ]
  const deferredAccountingPatterns = [
    /rentCollection/i,
    /collectRent/i,
    /arrearsLedger/i,
    /landlordPayout/i,
    /rentalAccounting/i,
    /processPayout/i,
  ]
  return {
    noLiveProperty24Write: liveProperty24WritePatterns.every((pattern) => !pattern.test(source)),
    noDeferredAccounting: deferredAccountingPatterns.every((pattern) => !pattern.test(source)),
  }
}

function currentCommit() {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  if (result.status !== 0) return ''
  return String(result.stdout || '').trim()
}

function writeReport(report, options) {
  fs.mkdirSync(path.dirname(options.output), { recursive: true })
  fs.mkdirSync(path.dirname(options.markdownOutput), { recursive: true })
  fs.writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`)
  fs.writeFileSync(options.markdownOutput, formatRentalListingOperationalReportMarkdown(report))
  return {
    json: path.relative(repoRoot, options.output),
    markdown: path.relative(repoRoot, options.markdownOutput),
  }
}

export function buildReport(options = parseArgs()) {
  const gate = buildRentalListingReleaseGate({
    sourceGuards: sourceGuards(),
  })
  return buildRentalListingOperationalReport({
    gate,
    environment: options.environment,
    commit: currentCommit(),
  })
}

async function main() {
  const options = parseArgs()
  const report = buildReport(options)
  const outputs = options.write ? writeReport(report, options) : null
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ...report, outputs }, null, 2)}\n`)
    return
  }
  if (outputs) {
    console.log(`Rental listing operational release report written: ${outputs.markdown}`)
  } else {
    console.log(`Rental listing operational release report: ${report.status} (${report.decision})`)
  }
}

main().catch((error) => {
  console.error(`Rental listing operational release report failed: ${error.message}`)
  process.exitCode = 1
})
