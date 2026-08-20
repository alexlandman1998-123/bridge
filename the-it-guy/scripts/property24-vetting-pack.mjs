import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  PROPERTY24_VETTING_DEFAULT_REPORTS,
  createProperty24VettingPack,
  normalizeProperty24Text,
  renderProperty24VettingPackMarkdown,
} from '../server/property24/index.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

function parseArgs(argv) {
  const options = {
    listingId: '',
    listingNumber: '',
    output: '',
    markdownOutput: '',
    strict: false,
  }

  for (const arg of argv) {
    if (arg === '--strict') {
      options.strict = true
    } else if (arg.startsWith('--listing-id=')) {
      options.listingId = normalizeProperty24Text(arg.slice('--listing-id='.length))
    } else if (arg.startsWith('--listing-number=')) {
      options.listingNumber = normalizeProperty24Text(arg.slice('--listing-number='.length))
    } else if (arg.startsWith('--output=')) {
      options.output = normalizeProperty24Text(arg.slice('--output='.length))
    } else if (arg.startsWith('--markdown-output=')) {
      options.markdownOutput = normalizeProperty24Text(arg.slice('--markdown-output='.length))
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return options
}

function readJsonReport(reportPath) {
  const absolutePath = path.isAbsolute(reportPath) ? reportPath : path.join(appRoot, reportPath)
  if (!fs.existsSync(absolutePath)) {
    return {
      missing: true,
      path: reportPath,
    }
  }
  try {
    return JSON.parse(fs.readFileSync(absolutePath, 'utf8'))
  } catch (error) {
    return {
      invalid: true,
      path: reportPath,
      error: error.message,
    }
  }
}

function loadReports() {
  return Object.fromEntries(
    Object.entries(PROPERTY24_VETTING_DEFAULT_REPORTS).map(([key, reportPath]) => [
      key,
      readJsonReport(reportPath),
    ]),
  )
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const reports = loadReports()
  const pack = createProperty24VettingPack({
    reports,
    config: {
      listingId: options.listingId,
      listingNumber: options.listingNumber,
      environment: 'exdev',
    },
  })
  const output = options.output || path.join(appRoot, 'outputs', 'property24-vetting-pack.json')
  const markdownOutput = options.markdownOutput || path.join(appRoot, 'outputs', 'property24-vetting-pack.md')
  writeText(output, `${JSON.stringify(pack, null, 2)}\n`)
  writeText(markdownOutput, renderProperty24VettingPackMarkdown(pack))

  console.log(JSON.stringify({
    status: pack.status,
    output,
    markdownOutput,
    summary: pack.summary,
    manualExDevSteps: pack.evidence.filter((item) => ['READY', 'MANUAL_REQUIRED', 'PARTIAL_PASS'].includes(item.status)).map((item) => item.id),
    needsEvidence: pack.evidence.filter((item) => ['NEEDS_EVIDENCE', 'NEEDS_REVIEW'].includes(item.status)).map((item) => item.id),
  }, null, 2))

  if (options.strict && pack.status !== 'READY_FOR_VETTING') process.exitCode = 1
}

run().catch((error) => {
  console.error(JSON.stringify({
    status: 'FAILED',
    name: error.name || 'Error',
    message: error.message,
  }, null, 2))
  process.exitCode = 1
})
