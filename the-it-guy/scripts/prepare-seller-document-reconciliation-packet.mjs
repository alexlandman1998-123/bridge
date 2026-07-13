import fs from 'node:fs'
import path from 'node:path'
import {
  buildSellerDocumentRequirementReconciliationGate,
  buildSellerDocumentRequirementReconciliationReviewPacket,
  renderSellerDocumentRequirementReconciliationRunbook,
} from '../src/services/sellerDocumentRequirementsService.js'
import {
  runNodeSellerDocumentRequirementReconciliation,
} from './seller-document-reconciliation-node.mjs'

function parseCsv(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseArgs(argv = []) {
  const options = {
    organisationId: '',
    listingIds: [],
    limit: 100,
    inputPath: process.env.SELLER_DOCUMENT_RECONCILIATION_INPUT || '',
    outputDir: process.env.SELLER_DOCUMENT_RECONCILIATION_OUTPUT_DIR || '',
    format: String(process.env.SELLER_DOCUMENT_RECONCILIATION_FORMAT || 'json').trim().toLowerCase(),
    failOnBlocked: process.env.SELLER_DOCUMENT_RECONCILIATION_FAIL_ON_BLOCKED === 'true',
    failOnWarning: process.env.SELLER_DOCUMENT_RECONCILIATION_FAIL_ON_WARNING === 'true',
    failOnSyncNeeded: true,
    failOnManualReview: true,
    failOnLoadFailed: true,
  }

  for (const arg of argv) {
    if (arg === '--apply') {
      throw new Error('Seller document reconciliation review packets are dry-run only. Use reconcile:seller-documents for reviewed apply.')
    } else if (arg === '--markdown' || arg === '--format=markdown' || arg === '--format=md') {
      options.format = 'markdown'
    } else if (arg === '--json' || arg === '--format=json') {
      options.format = 'json'
    } else if (arg === '--fail-on-blocked') {
      options.failOnBlocked = true
    } else if (arg === '--fail-on-warning') {
      options.failOnWarning = true
    } else if (arg === '--warn-on-sync-needed') {
      options.failOnSyncNeeded = false
    } else if (arg === '--warn-on-manual-review') {
      options.failOnManualReview = false
    } else if (arg === '--warn-on-load-failed') {
      options.failOnLoadFailed = false
    } else if (arg.startsWith('--organisation-id=')) {
      options.organisationId = arg.slice('--organisation-id='.length).trim()
    } else if (arg.startsWith('--org-id=')) {
      options.organisationId = arg.slice('--org-id='.length).trim()
    } else if (arg.startsWith('--listing-id=')) {
      options.listingIds.push(...parseCsv(arg.slice('--listing-id='.length)))
    } else if (arg.startsWith('--listing-ids=')) {
      options.listingIds.push(...parseCsv(arg.slice('--listing-ids='.length)))
    } else if (arg.startsWith('--limit=')) {
      options.limit = Number(arg.slice('--limit='.length)) || options.limit
    } else if (arg.startsWith('--input=')) {
      options.inputPath = arg.slice('--input='.length).trim()
    } else if (arg.startsWith('--output-dir=')) {
      options.outputDir = arg.slice('--output-dir='.length).trim()
    }
  }

  return options
}

function readInputReport(inputPath = '') {
  if (!inputPath) return null
  const resolvedPath = path.resolve(process.cwd(), inputPath)
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Seller document reconciliation input does not exist: ${resolvedPath}`)
  }
  const payload = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'))
  const report = payload.reconciliationReport || payload.report || payload
  return {
    source: `file:${resolvedPath}`,
    report,
  }
}

async function loadReconciliationReport(options = {}) {
  const input = readInputReport(options.inputPath)
  if (input) return input
  if (!options.organisationId && !options.listingIds.length) {
    throw new Error('Usage: npm run prepare:seller-documents -- --organisation-id=<uuid> [--limit=100] [--output-dir=<dir>] [--markdown]')
  }
  const report = await runNodeSellerDocumentRequirementReconciliation({
    organisationId: options.organisationId,
    listingIds: options.listingIds,
    limit: options.limit,
    dryRun: true,
  })
  return {
    source: options.organisationId ? `organisation:${options.organisationId}` : `listings:${options.listingIds.join(',')}`,
    report,
  }
}

function writeArtifact(outputDir, fileName, content) {
  fs.writeFileSync(path.join(outputDir, fileName), content)
}

function writeArtifacts(packet, runbook, outputDir = '') {
  if (!outputDir) return
  const resolvedOutputDir = path.resolve(process.cwd(), outputDir)
  fs.mkdirSync(resolvedOutputDir, { recursive: true })

  writeArtifact(resolvedOutputDir, 'seller-document-reconciliation-packet.json', `${JSON.stringify(packet, null, 2)}\n`)
  writeArtifact(resolvedOutputDir, 'seller-document-reconciliation-report.json', `${JSON.stringify(packet.reconciliationReport || {}, null, 2)}\n`)
  writeArtifact(resolvedOutputDir, 'seller-document-reconciliation-syncable.json', `${JSON.stringify(packet.repairPlan?.rows || [], null, 2)}\n`)
  writeArtifact(resolvedOutputDir, 'seller-document-reconciliation-manual-review.json', `${JSON.stringify(packet.manualReview?.rows || [], null, 2)}\n`)
  writeArtifact(resolvedOutputDir, 'seller-document-reconciliation-runbook.md', `${runbook}\n`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const { source, report } = await loadReconciliationReport(options)
  const gate = report.gate || buildSellerDocumentRequirementReconciliationGate(report, {
    failOnSyncNeeded: options.failOnSyncNeeded,
    failOnManualReview: options.failOnManualReview,
    failOnLoadFailed: options.failOnLoadFailed,
  })
  const packet = buildSellerDocumentRequirementReconciliationReviewPacket(report, {
    gate,
    source,
    organisationId: options.organisationId,
    listingIds: options.listingIds,
    outputDir: options.outputDir,
  })
  const runbook = renderSellerDocumentRequirementReconciliationRunbook(packet)
  writeArtifacts(packet, runbook, options.outputDir)

  process.stdout.write(options.format === 'markdown' || options.format === 'md' ? `${runbook}\n` : `${JSON.stringify(packet, null, 2)}\n`)
  if ((options.failOnBlocked && packet.gate?.exitCode) || (options.failOnWarning && packet.status !== 'ready')) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('Seller document reconciliation review packet failed:', error?.message || error)
  process.exitCode = 1
})
