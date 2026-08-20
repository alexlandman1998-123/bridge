import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { normalizeProperty24PreviewText } from '../server/services/property24Arch9ListingPreviewService.js'
import { summarizeProperty24Payload } from '../server/services/property24Client.js'
import { recordProperty24ListingSync } from '../server/services/property24ListingSyncService.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

function parseArgs(argv) {
  const options = {
    input: path.join(appRoot, 'outputs', 'property24-publish-listing.json'),
    listingId: '',
    agencyId: '',
    listingNumber: '',
    environment: 'exdev',
    isOnPortal: null,
    output: '',
  }

  for (const arg of argv) {
    if (arg.startsWith('--input=')) {
      options.input = normalizeProperty24PreviewText(arg.slice('--input='.length))
    } else if (arg.startsWith('--listing-id=')) {
      options.listingId = normalizeProperty24PreviewText(arg.slice('--listing-id='.length))
    } else if (arg.startsWith('--agency-id=')) {
      options.agencyId = normalizeProperty24PreviewText(arg.slice('--agency-id='.length))
    } else if (arg.startsWith('--listing-number=')) {
      options.listingNumber = normalizeProperty24PreviewText(arg.slice('--listing-number='.length))
    } else if (arg.startsWith('--environment=')) {
      options.environment = normalizeProperty24PreviewText(arg.slice('--environment='.length))
    } else if (arg.startsWith('--is-on-portal=')) {
      options.isOnPortal = arg.slice('--is-on-portal='.length).toLowerCase() === 'true'
    } else if (arg.startsWith('--output=')) {
      options.output = normalizeProperty24PreviewText(arg.slice('--output='.length))
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return options
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, '')]
      }),
  )
}

function loadEnv() {
  const files = ['.env', '.env.local', '.env.staging.local', '.env.property24.local']
  const fromFiles = files.reduce((merged, file) => ({ ...merged, ...parseEnvFile(path.join(appRoot, file)) }), {})
  const processOverrides = Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeProperty24PreviewText(value)))
  return { ...fromFiles, ...processOverrides }
}

function readReport(input) {
  if (!input || !fs.existsSync(input)) return {}
  return JSON.parse(fs.readFileSync(input, 'utf8'))
}

function writeReport(report, outputArg) {
  const output = outputArg || path.join(appRoot, 'outputs', 'property24-record-listing-sync.json')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  return output
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const env = loadEnv()
  const sourceReport = readReport(options.input)
  const property24Data = sourceReport.property24Response?.data || {}
  const listingId = normalizeProperty24PreviewText(options.listingId || sourceReport.listingId)
  const agencyId = normalizeProperty24PreviewText(options.agencyId || sourceReport.preview?.summary?.agencyId || env.PROPERTY24_DEFAULT_AGENCY_ID || '31382')
  const listingNumber = normalizeProperty24PreviewText(options.listingNumber || property24Data.listingNumber)
  const isOnPortal = options.isOnPortal ?? Boolean(sourceReport.portalCheck?.data ?? property24Data.isOnPortal)
  const supabaseUrl = normalizeProperty24PreviewText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizeProperty24PreviewText(env.SUPABASE_SERVICE_ROLE_KEY)

  const missing = []
  if (!supabaseUrl) missing.push('SUPABASE_URL or VITE_SUPABASE_URL')
  if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!listingId) missing.push('--listing-id or report.listingId')
  if (!agencyId) missing.push('--agency-id or PROPERTY24_DEFAULT_AGENCY_ID')
  if (!listingNumber) missing.push('--listing-number or report.property24Response.data.listingNumber')

  if (missing.length) {
    const report = {
      phase: 'property24-record-listing-sync',
      generatedAt: new Date().toISOString(),
      status: 'BLOCKED',
      missingConfiguration: missing,
    }
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output, missingConfiguration: missing }, null, 2))
    process.exitCode = 1
    return
  }

  const client = createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const result = await recordProperty24ListingSync({
    client,
    listingId,
    agencyId,
    listingNumber,
    environment: options.environment,
    isOnPortal,
    reasons: Array.isArray(property24Data.reasons) ? property24Data.reasons : [],
    responseSummary: summarizeProperty24Payload(property24Data),
    payloadSummary: sourceReport.preview?.summary || {},
    allowPublishWithoutMandate: true,
    publishWithoutMandateReason: 'Property24 ExDev publish accepted before mandate evidence upload.',
  })

  const report = {
    phase: 'property24-record-listing-sync',
    generatedAt: new Date().toISOString(),
    status: result.statusUpdateWarning ? 'RECORDED_WITH_LISTING_WARNING' : 'RECORDED',
    listingId,
    databaseWrite: {
      table: 'property24_listing_syncs',
      privateListingId: result.sync.private_listing_id,
      listingNumber: result.sync.listing_number,
      isOnPortal: result.sync.is_on_portal,
      property24Status: result.listing.property24_status,
      property24Reference: result.listing.property24_reference,
      ...(result.statusUpdateWarning ? { statusUpdateWarning: result.statusUpdateWarning } : {}),
    },
  }
  const output = writeReport(report, options.output)
  console.log(JSON.stringify({ status: report.status, output, databaseWrite: report.databaseWrite }, null, 2))
}

run().catch((error) => {
  console.error(JSON.stringify({
    status: 'FAILED',
    name: error.name || 'Error',
    message: error.message,
    code: error.code || null,
    details: error.details || null,
    hint: error.hint || null,
  }, null, 2))
  process.exitCode = 1
})
