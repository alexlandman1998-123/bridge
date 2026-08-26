import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { normalizePrivatePropertyText } from '../server/services/privatePropertyClient.js'
import {
  upsertPrivatePropertyAgentMapping,
} from '../server/services/privatePropertyAgentMappingService.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

function parseArgs(argv) {
  const options = {
    organisationId: '',
    branchId: '',
    agencyConfigId: '',
    organisationUserId: '',
    arch9UserId: '',
    environment: 'sandbox',
    privatePropertyAgentId: '',
    sourceReference: '',
    email: '',
    firstName: '',
    lastName: '',
    mobile: '',
    imageUrl: '',
    defaultForBranch: false,
    defaultForOrganisation: false,
    matchType: '',
    confidence: '1',
    status: 'active',
    lastSyncedAt: '',
    lastVerifiedAt: '',
    notes: '',
    output: '',
  }

  for (const arg of argv) {
    if (arg === '--default-for-branch') {
      options.defaultForBranch = true
    } else if (arg === '--default-for-organisation' || arg === '--default-for-organization') {
      options.defaultForOrganisation = true
    } else if (arg.startsWith('--organisation-id=')) {
      options.organisationId = normalizePrivatePropertyText(arg.slice('--organisation-id='.length))
    } else if (arg.startsWith('--organization-id=')) {
      options.organisationId = normalizePrivatePropertyText(arg.slice('--organization-id='.length))
    } else if (arg.startsWith('--branch-id=')) {
      options.branchId = normalizePrivatePropertyText(arg.slice('--branch-id='.length))
    } else if (arg.startsWith('--agency-config-id=')) {
      options.agencyConfigId = normalizePrivatePropertyText(arg.slice('--agency-config-id='.length))
    } else if (arg.startsWith('--organisation-user-id=')) {
      options.organisationUserId = normalizePrivatePropertyText(arg.slice('--organisation-user-id='.length))
    } else if (arg.startsWith('--organization-user-id=')) {
      options.organisationUserId = normalizePrivatePropertyText(arg.slice('--organization-user-id='.length))
    } else if (arg.startsWith('--arch9-user-id=')) {
      options.arch9UserId = normalizePrivatePropertyText(arg.slice('--arch9-user-id='.length))
    } else if (arg.startsWith('--environment=')) {
      options.environment = normalizePrivatePropertyText(arg.slice('--environment='.length))
    } else if (arg.startsWith('--private-property-agent-id=')) {
      options.privatePropertyAgentId = normalizePrivatePropertyText(arg.slice('--private-property-agent-id='.length))
    } else if (arg.startsWith('--agent-id=')) {
      options.privatePropertyAgentId = normalizePrivatePropertyText(arg.slice('--agent-id='.length))
    } else if (arg.startsWith('--source-reference=')) {
      options.sourceReference = normalizePrivatePropertyText(arg.slice('--source-reference='.length))
    } else if (arg.startsWith('--email=')) {
      options.email = normalizePrivatePropertyText(arg.slice('--email='.length))
    } else if (arg.startsWith('--first-name=')) {
      options.firstName = normalizePrivatePropertyText(arg.slice('--first-name='.length))
    } else if (arg.startsWith('--last-name=')) {
      options.lastName = normalizePrivatePropertyText(arg.slice('--last-name='.length))
    } else if (arg.startsWith('--mobile=')) {
      options.mobile = normalizePrivatePropertyText(arg.slice('--mobile='.length))
    } else if (arg.startsWith('--image-url=')) {
      options.imageUrl = normalizePrivatePropertyText(arg.slice('--image-url='.length))
    } else if (arg.startsWith('--match-type=')) {
      options.matchType = normalizePrivatePropertyText(arg.slice('--match-type='.length))
    } else if (arg.startsWith('--confidence=')) {
      options.confidence = normalizePrivatePropertyText(arg.slice('--confidence='.length))
    } else if (arg.startsWith('--status=')) {
      options.status = normalizePrivatePropertyText(arg.slice('--status='.length))
    } else if (arg.startsWith('--last-synced-at=')) {
      options.lastSyncedAt = normalizePrivatePropertyText(arg.slice('--last-synced-at='.length))
    } else if (arg.startsWith('--last-verified-at=')) {
      options.lastVerifiedAt = normalizePrivatePropertyText(arg.slice('--last-verified-at='.length))
    } else if (arg.startsWith('--notes=')) {
      options.notes = normalizePrivatePropertyText(arg.slice('--notes='.length))
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

function writeReport(report, outputArg) {
  const output = outputArg || path.join(appRoot, 'outputs', 'private-property-agent-mapping.json')
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

  if (missing.length) {
    const report = {
      phase: 'private-property-go-live-phase2-agent-mapping',
      generatedAt: new Date().toISOString(),
      safety: {
        privatePropertyApiCalled: false,
        rawCredentialsStored: false,
      },
      status: 'BLOCKED',
      missingConfiguration: missing,
      nextStep: 'Add the missing Supabase backend values, then run this command again.',
    }
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output, missingConfiguration: missing }, null, 2))
    process.exitCode = 1
    return
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const result = await upsertPrivatePropertyAgentMapping({
    client,
    organisationId: options.organisationId,
    branchId: options.branchId,
    agencyConfigId: options.agencyConfigId,
    organisationUserId: options.organisationUserId,
    arch9UserId: options.arch9UserId,
    environment: options.environment,
    privatePropertyAgentId: options.privatePropertyAgentId,
    sourceReference: options.sourceReference,
    email: options.email,
    firstName: options.firstName,
    lastName: options.lastName,
    mobile: options.mobile,
    imageUrl: options.imageUrl,
    isDefaultForBranch: options.defaultForBranch,
    isDefaultForOrganisation: options.defaultForOrganisation,
    matchType: options.matchType,
    confidence: options.confidence,
    status: options.status,
    lastSyncedAt: options.lastSyncedAt,
    lastVerifiedAt: options.lastVerifiedAt,
    notes: options.notes,
  })

  const report = {
    phase: 'private-property-go-live-phase2-agent-mapping',
    generatedAt: new Date().toISOString(),
    safety: {
      privatePropertyApiCalled: false,
      rawCredentialsStored: false,
    },
    status: result.readiness.ready ? 'READY' : 'BLOCKED',
    action: result.action,
    mapping: result.mapping,
    readiness: result.readiness,
    nextStep: result.readiness.ready
      ? 'Run Private Property preview/publish against a real listing without passing --agent-id manually.'
      : 'Resolve the mapping blockers before using this agent for live syndication.',
  }
  const output = writeReport(report, options.output)
  console.log(JSON.stringify({
    status: report.status,
    output,
    action: report.action,
    mapping: report.mapping,
    blockers: report.readiness.blockers,
    warnings: report.readiness.warnings,
  }, null, 2))
}

run().catch((error) => {
  console.error(JSON.stringify({
    status: 'FAILED',
    name: error.name || 'Error',
    message: error.message,
    missing: error.missing || [],
    code: error.code || null,
    details: error.details || null,
    hint: error.hint || null,
  }, null, 2))
  process.exitCode = 1
})
