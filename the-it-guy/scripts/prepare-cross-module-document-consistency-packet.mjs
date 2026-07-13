import fs from 'node:fs'
import path from 'node:path'
import {
  buildCrossModuleDocumentConsistencyAudit,
  buildCrossModuleDocumentConsistencyGate,
  buildCrossModuleDocumentConsistencyReviewPacket,
  fetchCrossModuleDocumentConsistencySnapshot,
  renderCrossModuleDocumentConsistencyReviewRunbook,
} from '../src/services/documents/crossModuleDocumentConsistencyService.js'
import { isSupabaseConfigured, supabase } from '../src/lib/supabaseClient.js'

function parseCsv(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseArgs(argv = []) {
  const options = {
    organisationId: process.env.CROSS_MODULE_DOCUMENT_ORGANISATION_ID || '',
    listingIds: parseCsv(process.env.CROSS_MODULE_DOCUMENT_LISTING_IDS || ''),
    transactionIds: parseCsv(process.env.CROSS_MODULE_DOCUMENT_TRANSACTION_IDS || ''),
    inputPath: process.env.CROSS_MODULE_DOCUMENT_CONSISTENCY_INPUT || '',
    outputDir: process.env.CROSS_MODULE_DOCUMENT_CONSISTENCY_OUTPUT_DIR || '',
    limit: Number(process.env.CROSS_MODULE_DOCUMENT_CONSISTENCY_LIMIT || 100) || 100,
    format: String(process.env.CROSS_MODULE_DOCUMENT_CONSISTENCY_FORMAT || 'json').trim().toLowerCase(),
    staticContract: false,
    failOnBlocked: process.env.CROSS_MODULE_DOCUMENT_CONSISTENCY_FAIL_ON_BLOCKED === 'true',
    failOnWarning: process.env.CROSS_MODULE_DOCUMENT_CONSISTENCY_FAIL_ON_WARNING === 'true',
    failOnCritical: true,
    failOnQueryWarning: false,
    failOnEmpty: false,
  }

  for (const arg of argv) {
    if (arg === '--apply') {
      throw new Error('Cross-module document consistency review packets are dry-run only. Fix source rows through the owning module after review.')
    } else if (arg === '--markdown' || arg === '--format=markdown' || arg === '--format=md') {
      options.format = 'markdown'
    } else if (arg === '--json' || arg === '--format=json') {
      options.format = 'json'
    } else if (arg === '--static' || arg === '--static-contract') {
      options.staticContract = true
    } else if (arg === '--fail-on-blocked') {
      options.failOnBlocked = true
    } else if (arg === '--fail-on-warning') {
      options.failOnWarning = true
    } else if (arg === '--allow-critical') {
      options.failOnCritical = false
    } else if (arg === '--fail-on-query-warning') {
      options.failOnQueryWarning = true
    } else if (arg === '--warn-on-query-warning') {
      options.failOnQueryWarning = false
    } else if (arg === '--fail-on-empty') {
      options.failOnEmpty = true
    } else if (arg === '--warn-on-empty') {
      options.failOnEmpty = false
    } else if (arg.startsWith('--organisation-id=')) {
      options.organisationId = arg.slice('--organisation-id='.length).trim()
    } else if (arg.startsWith('--org-id=')) {
      options.organisationId = arg.slice('--org-id='.length).trim()
    } else if (arg.startsWith('--listing-id=')) {
      options.listingIds.push(...parseCsv(arg.slice('--listing-id='.length)))
    } else if (arg.startsWith('--listing-ids=')) {
      options.listingIds.push(...parseCsv(arg.slice('--listing-ids='.length)))
    } else if (arg.startsWith('--transaction-id=')) {
      options.transactionIds.push(...parseCsv(arg.slice('--transaction-id='.length)))
    } else if (arg.startsWith('--transaction-ids=')) {
      options.transactionIds.push(...parseCsv(arg.slice('--transaction-ids='.length)))
    } else if (arg.startsWith('--limit=')) {
      options.limit = Number(arg.slice('--limit='.length)) || options.limit
    } else if (arg.startsWith('--input=')) {
      options.inputPath = arg.slice('--input='.length).trim()
    } else if (arg.startsWith('--output-dir=')) {
      options.outputDir = arg.slice('--output-dir='.length).trim()
    }
  }

  options.listingIds = [...new Set(options.listingIds)]
  options.transactionIds = [...new Set(options.transactionIds)]
  return options
}

function readInputAudit(inputPath = '') {
  if (!inputPath) return null
  const resolvedPath = path.resolve(process.cwd(), inputPath)
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Cross-module document consistency input does not exist: ${resolvedPath}`)
  }
  const payload = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'))
  const audit = payload.audit || payload.consistencyReport || payload.report || payload
  return {
    source: `file:${resolvedPath}`,
    audit,
  }
}

async function loadConsistencyAudit(options = {}) {
  const input = readInputAudit(options.inputPath)
  if (input) return input

  if (options.staticContract) {
    return {
      source: 'static_contract',
      audit: {
        ...buildCrossModuleDocumentConsistencyAudit(),
        source: 'static_contract',
      },
    }
  }

  if (!options.organisationId && !options.listingIds.length && !options.transactionIds.length) {
    throw new Error('Usage: npm run prepare:cross-module-documents -- --organisation-id=<uuid> [--limit=100] [--output-dir=<dir>] [--markdown]')
  }
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.')
  }

  const audit = await fetchCrossModuleDocumentConsistencySnapshot({
    client: supabase,
    organisationId: options.organisationId,
    listingIds: options.listingIds,
    transactionIds: options.transactionIds,
    limit: options.limit,
  })
  return {
    source: options.organisationId
      ? `organisation:${options.organisationId}`
      : options.listingIds.length
        ? `listings:${options.listingIds.join(',')}`
        : `transactions:${options.transactionIds.join(',')}`,
    audit,
  }
}

function writeArtifact(outputDir, fileName, content) {
  fs.writeFileSync(path.join(outputDir, fileName), content)
}

function writeArtifacts(packet, runbook, outputDir = '') {
  if (!outputDir) return
  const resolvedOutputDir = path.resolve(process.cwd(), outputDir)
  fs.mkdirSync(resolvedOutputDir, { recursive: true })

  writeArtifact(resolvedOutputDir, 'cross-module-document-consistency-packet.json', `${JSON.stringify(packet, null, 2)}\n`)
  writeArtifact(resolvedOutputDir, 'cross-module-document-consistency-audit.json', `${JSON.stringify(packet.consistencyReport || {}, null, 2)}\n`)
  writeArtifact(resolvedOutputDir, 'cross-module-document-consistency-canonical-mismatches.json', `${JSON.stringify(packet.repairPlan?.canonicalMismatches || [], null, 2)}\n`)
  writeArtifact(resolvedOutputDir, 'cross-module-document-consistency-map-coverage.json', `${JSON.stringify(packet.repairPlan?.mapCoverage || [], null, 2)}\n`)
  writeArtifact(resolvedOutputDir, 'cross-module-document-consistency-module-warnings.json', `${JSON.stringify(packet.repairPlan?.moduleWarnings || [], null, 2)}\n`)
  writeArtifact(resolvedOutputDir, 'cross-module-document-consistency-query-warnings.json', `${JSON.stringify(packet.repairPlan?.queryWarnings || [], null, 2)}\n`)
  writeArtifact(resolvedOutputDir, 'cross-module-document-consistency-runbook.md', `${runbook}\n`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const { source, audit } = await loadConsistencyAudit(options)
  const gate = audit.gate || buildCrossModuleDocumentConsistencyGate(audit, {
    failOnCritical: options.failOnCritical,
    failOnQueryWarning: options.failOnQueryWarning,
    failOnEmpty: options.failOnEmpty,
  })
  const packet = buildCrossModuleDocumentConsistencyReviewPacket(audit, {
    gate,
    source,
    organisationId: options.organisationId,
    listingIds: options.listingIds,
    transactionIds: options.transactionIds,
    outputDir: options.outputDir,
  })
  const runbook = renderCrossModuleDocumentConsistencyReviewRunbook(packet)
  writeArtifacts(packet, runbook, options.outputDir)

  process.stdout.write(options.format === 'markdown' || options.format === 'md' ? `${runbook}\n` : `${JSON.stringify(packet, null, 2)}\n`)
  if ((options.failOnBlocked && packet.gate?.exitCode) || (options.failOnWarning && packet.status !== 'ready')) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('Cross-module document consistency review packet failed:', error?.message || error)
  process.exitCode = 1
})
