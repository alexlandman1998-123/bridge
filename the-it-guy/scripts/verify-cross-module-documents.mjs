import fs from 'node:fs'
import path from 'node:path'
import {
  buildCrossModuleDocumentConsistencyAudit,
  buildCrossModuleDocumentConsistencyGate,
  buildCrossModuleDocumentConsistencyGateCommands,
  fetchCrossModuleDocumentConsistencySnapshot,
  renderCrossModuleDocumentConsistencyGateMarkdown,
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
    limit: Number(process.env.CROSS_MODULE_DOCUMENT_CONSISTENCY_LIMIT || 100) || 100,
    markdown: false,
    staticContract: false,
    failOnCritical: true,
    failOnWarning: false,
    failOnQueryWarning: false,
    failOnEmpty: false,
  }

  for (const arg of argv) {
    if (arg === '--markdown' || arg === '--format=markdown' || arg === '--format=md') options.markdown = true
    else if (arg === '--json' || arg === '--format=json') options.markdown = false
    else if (arg === '--static' || arg === '--static-contract') options.staticContract = true
    else if (arg === '--allow-critical') options.failOnCritical = false
    else if (arg === '--fail-on-warning') options.failOnWarning = true
    else if (arg === '--warn-on-warning') options.failOnWarning = false
    else if (arg === '--fail-on-query-warning') options.failOnQueryWarning = true
    else if (arg === '--warn-on-query-warning') options.failOnQueryWarning = false
    else if (arg === '--fail-on-empty') options.failOnEmpty = true
    else if (arg === '--warn-on-empty') options.failOnEmpty = false
    else if (arg.startsWith('--organisation-id=')) options.organisationId = arg.slice('--organisation-id='.length).trim()
    else if (arg.startsWith('--org-id=')) options.organisationId = arg.slice('--org-id='.length).trim()
    else if (arg.startsWith('--listing-id=')) options.listingIds.push(...parseCsv(arg.slice('--listing-id='.length)))
    else if (arg.startsWith('--listing-ids=')) options.listingIds.push(...parseCsv(arg.slice('--listing-ids='.length)))
    else if (arg.startsWith('--transaction-id=')) options.transactionIds.push(...parseCsv(arg.slice('--transaction-id='.length)))
    else if (arg.startsWith('--transaction-ids=')) options.transactionIds.push(...parseCsv(arg.slice('--transaction-ids='.length)))
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.slice('--limit='.length)) || options.limit
    else if (arg.startsWith('--input=')) options.inputPath = arg.slice('--input='.length).trim()
  }

  options.listingIds = [...new Set(options.listingIds)]
  options.transactionIds = [...new Set(options.transactionIds)]
  return options
}

function readInputAudit(inputPath = '') {
  if (!inputPath) return null
  const resolvedPath = path.resolve(process.cwd(), inputPath)
  if (!fs.existsSync(resolvedPath)) throw new Error(`Cross-module document consistency input does not exist: ${resolvedPath}`)
  const payload = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'))
  return payload.audit || payload.consistencyReport || payload.report || payload
}

async function loadAudit(options = {}) {
  const inputAudit = readInputAudit(options.inputPath)
  if (inputAudit) return { source: `file:${path.resolve(process.cwd(), options.inputPath)}`, audit: inputAudit }

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
    throw new Error('Usage: npm run verify:cross-module-documents -- --organisation-id=<uuid> [--limit=100] [--markdown]')
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

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const { source, audit } = await loadAudit(options)
  const gate = buildCrossModuleDocumentConsistencyGate(audit, {
    failOnCritical: options.failOnCritical,
    failOnWarning: options.failOnWarning,
    failOnQueryWarning: options.failOnQueryWarning,
    failOnEmpty: options.failOnEmpty,
  })
  const payload = {
    contractVersion: gate.contractVersion,
    phase: gate.phase,
    source,
    generatedAt: gate.generatedAt,
    mutatedData: false,
    gate,
    summary: gate.summary,
    operatorCommands: buildCrossModuleDocumentConsistencyGateCommands(options),
    consistencyReport: audit,
  }

  process.stdout.write(options.markdown
    ? `${renderCrossModuleDocumentConsistencyGateMarkdown({ audit, gate, options })}\n`
    : `${JSON.stringify(payload, null, 2)}\n`)
  if (gate.exitCode) process.exitCode = gate.exitCode
}

main().catch((error) => {
  console.error('Cross-module document consistency verification failed:', error?.message || error)
  process.exitCode = 1
})
