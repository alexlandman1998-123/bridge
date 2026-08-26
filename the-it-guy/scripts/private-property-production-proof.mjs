import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { normalizePrivatePropertyText } from '../server/services/privatePropertyClient.js'
import {
  runPrivatePropertyProductionProof,
} from '../server/services/privatePropertyProductionProofService.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

function parseArgs(argv) {
  const options = {
    listingId: '',
    launchReport: '',
    productionMonitorReport: '',
    acceptedBy: '',
    supportContact: '',
    rollbackOwner: '',
    escalationContact: '',
    output: '',
  }

  for (const arg of argv) {
    if (arg.startsWith('--listing-id=')) {
      options.listingId = normalizePrivatePropertyText(arg.slice('--listing-id='.length))
    } else if (arg.startsWith('--launch-report=')) {
      options.launchReport = normalizePrivatePropertyText(arg.slice('--launch-report='.length))
    } else if (arg.startsWith('--production-monitor-report=')) {
      options.productionMonitorReport = normalizePrivatePropertyText(arg.slice('--production-monitor-report='.length))
    } else if (arg.startsWith('--accepted-by=')) {
      options.acceptedBy = normalizePrivatePropertyText(arg.slice('--accepted-by='.length))
    } else if (arg.startsWith('--support-contact=')) {
      options.supportContact = normalizePrivatePropertyText(arg.slice('--support-contact='.length))
    } else if (arg.startsWith('--rollback-owner=')) {
      options.rollbackOwner = normalizePrivatePropertyText(arg.slice('--rollback-owner='.length))
    } else if (arg.startsWith('--escalation-contact=')) {
      options.escalationContact = normalizePrivatePropertyText(arg.slice('--escalation-contact='.length))
    } else if (arg.startsWith('--output=')) {
      options.output = normalizePrivatePropertyText(arg.slice('--output='.length))
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

function readJsonFile(filePath) {
  const normalizedPath = normalizePrivatePropertyText(filePath)
  if (!normalizedPath) return null
  const absolutePath = path.isAbsolute(normalizedPath) ? normalizedPath : path.join(process.cwd(), normalizedPath)
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'))
}

function writeReport(report, outputArg) {
  const output = outputArg || path.join(appRoot, 'outputs', 'private-property-production-proof.json')
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
      phase: 'private-property-go-live-phase8-production-proof',
      generatedAt: new Date().toISOString(),
      listingId: options.listingId,
      environment: 'production',
      status: 'BLOCKED',
      live: false,
      safety: {
        privatePropertyApiCalled: false,
        databaseWritten: false,
        rawCredentialsStored: false,
        listingPublished: false,
      },
      blockers: missing.map((item) => `missing_configuration:${item}`),
      missingConfiguration: missing,
      nextStep: 'Add the missing values, then re-run the production proof gate.',
    }
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, live: false, output, blockers: report.blockers }, null, 2))
    process.exitCode = 1
    return
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const report = await runPrivatePropertyProductionProof({
    client,
    listingId: options.listingId,
    launchReport: readJsonFile(options.launchReport),
    productionMonitorReport: readJsonFile(options.productionMonitorReport),
    evidence: {
      acceptedBy: options.acceptedBy,
      supportContact: options.supportContact,
      rollbackOwner: options.rollbackOwner,
      escalationContact: options.escalationContact,
    },
  })
  const output = writeReport(report, options.output)
  console.log(JSON.stringify({
    status: report.status,
    live: report.live,
    output,
    blockers: report.blockers,
    warnings: report.warnings,
    nextStep: report.nextStep,
  }, null, 2))
  if (!report.live) process.exitCode = 1
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
