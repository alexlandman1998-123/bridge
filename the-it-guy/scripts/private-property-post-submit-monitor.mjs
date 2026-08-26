import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { normalizePrivatePropertyText } from '../server/services/privatePropertyClient.js'
import {
  runPrivatePropertyPostSubmitMonitor,
} from '../server/services/privatePropertyPostSubmitMonitorService.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

function parseArgs(argv) {
  const options = {
    listingId: '',
    environment: 'sandbox',
    continuationKey: '0',
    startDateTime: '',
    recordSync: false,
    output: '',
    propertyId: '',
    suburbId: '',
    streetName: '',
    streetNumber: '',
    complexName: '',
    unitNumber: '',
    town: '',
    province: '',
    category: '',
    listingType: '',
    mandateType: '',
    price: '',
    availableFrom: '',
    listingDate: '',
    photosChanged: true,
    soleMandateExclusiveDays: '',
  }

  for (const arg of argv) {
    if (arg === '--record-sync') {
      options.recordSync = true
    } else if (arg === '--photos-unchanged') {
      options.photosChanged = false
    } else if (arg.startsWith('--listing-id=')) {
      options.listingId = normalizePrivatePropertyText(arg.slice('--listing-id='.length))
    } else if (arg.startsWith('--environment=')) {
      options.environment = normalizePrivatePropertyText(arg.slice('--environment='.length))
    } else if (arg.startsWith('--continuation-key=')) {
      options.continuationKey = normalizePrivatePropertyText(arg.slice('--continuation-key='.length))
    } else if (arg.startsWith('--start-date-time=')) {
      options.startDateTime = normalizePrivatePropertyText(arg.slice('--start-date-time='.length))
    } else if (arg.startsWith('--output=')) {
      options.output = normalizePrivatePropertyText(arg.slice('--output='.length))
    } else if (arg.startsWith('--property-id=')) {
      options.propertyId = normalizePrivatePropertyText(arg.slice('--property-id='.length))
    } else if (arg.startsWith('--suburb-id=')) {
      options.suburbId = normalizePrivatePropertyText(arg.slice('--suburb-id='.length))
    } else if (arg.startsWith('--street-name=')) {
      options.streetName = normalizePrivatePropertyText(arg.slice('--street-name='.length))
    } else if (arg.startsWith('--street-number=')) {
      options.streetNumber = normalizePrivatePropertyText(arg.slice('--street-number='.length))
    } else if (arg.startsWith('--complex-name=')) {
      options.complexName = normalizePrivatePropertyText(arg.slice('--complex-name='.length))
    } else if (arg.startsWith('--unit-number=')) {
      options.unitNumber = normalizePrivatePropertyText(arg.slice('--unit-number='.length))
    } else if (arg.startsWith('--town=')) {
      options.town = normalizePrivatePropertyText(arg.slice('--town='.length))
    } else if (arg.startsWith('--province=')) {
      options.province = normalizePrivatePropertyText(arg.slice('--province='.length))
    } else if (arg.startsWith('--category=')) {
      options.category = normalizePrivatePropertyText(arg.slice('--category='.length))
    } else if (arg.startsWith('--listing-type=')) {
      options.listingType = normalizePrivatePropertyText(arg.slice('--listing-type='.length))
    } else if (arg.startsWith('--mandate-type=')) {
      options.mandateType = normalizePrivatePropertyText(arg.slice('--mandate-type='.length))
    } else if (arg.startsWith('--price=')) {
      options.price = normalizePrivatePropertyText(arg.slice('--price='.length))
    } else if (arg.startsWith('--available-from=')) {
      options.availableFrom = normalizePrivatePropertyText(arg.slice('--available-from='.length))
    } else if (arg.startsWith('--listing-date=')) {
      options.listingDate = normalizePrivatePropertyText(arg.slice('--listing-date='.length))
    } else if (arg.startsWith('--exclusive-days=')) {
      options.soleMandateExclusiveDays = normalizePrivatePropertyText(arg.slice('--exclusive-days='.length))
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
  const files = ['.env', '.env.local', '.env.private-property.local', '../.env.production.local']
  const fromFiles = files.reduce((merged, file) => ({ ...merged, ...parseEnvFile(path.join(appRoot, file)) }), {})
  const processOverrides = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => normalizePrivatePropertyText(value)),
  )
  return { ...fromFiles, ...processOverrides }
}

function createOverrides(options = {}) {
  return {
    propertyId: options.propertyId,
    suburbId: options.suburbId,
    streetName: options.streetName,
    streetNumber: options.streetNumber,
    complexName: options.complexName,
    unitNumber: options.unitNumber,
    town: options.town,
    province: options.province,
    category: options.category,
    listingType: options.listingType,
    mandateType: options.mandateType,
    price: options.price,
    availableFrom: options.availableFrom,
    listingDate: options.listingDate,
    photosChanged: options.photosChanged,
    soleMandateExclusiveDays: options.soleMandateExclusiveDays,
  }
}

function writeReport(report, outputArg) {
  const output = outputArg || path.join(appRoot, 'outputs', 'private-property-post-submit-monitor.json')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  return output
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const env = loadEnv()
  const supabaseUrl = normalizePrivatePropertyText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizePrivatePropertyText(env.SUPABASE_SERVICE_ROLE_KEY)
  const missing = []
  if (!supabaseUrl) missing.push('SUPABASE_URL or VITE_SUPABASE_URL')
  if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!options.listingId) missing.push('--listing-id')

  if (missing.length) {
    const report = {
      phase: 'private-property-go-live-phase5-post-submit-monitor',
      generatedAt: new Date().toISOString(),
      environment: options.environment,
      listingId: options.listingId,
      recordSync: options.recordSync,
      status: 'BLOCKED',
      safety: {
        privatePropertyApiCalled: false,
        databaseWritten: false,
        rawCredentialsStored: false,
      },
      blockers: missing.map((item) => `missing_configuration:${item}`),
      missingConfiguration: missing,
      nextStep: 'Add the missing values, then re-run the post-submit monitor.',
    }
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output, blockers: report.blockers }, null, 2))
    process.exitCode = 1
    return
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const report = await runPrivatePropertyPostSubmitMonitor({
    client,
    listingId: options.listingId,
    environment: options.environment,
    secrets: env,
    overrides: createOverrides(options),
    continuationKey: options.continuationKey,
    startDateTime: options.startDateTime,
    recordSync: options.recordSync,
  })
  const output = writeReport(report, options.output)
  console.log(JSON.stringify({
    status: report.status,
    output,
    apiCalled: report.safety.privatePropertyApiCalled,
    databaseWritten: report.safety.databaseWritten,
    externalStatus: report.externalStatus || null,
    continuationKey: report.eventFeed?.continuationKey || '',
    blockers: report.blockers,
    warnings: report.warnings,
    nextStep: report.nextStep,
  }, null, 2))
  if (report.status === 'BLOCKED' || report.status === 'ATTENTION_REQUIRED') process.exitCode = 1
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
