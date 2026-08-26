import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import {
  appRoot,
  loadPrivatePropertyEnv,
  parsePrivatePropertyArgs,
  writePrivatePropertyReport,
} from './private-property-cli-utils.mjs'
import {
  normalizePrivatePropertyText,
} from '../server/services/privatePropertyClient.js'
import {
  upsertPrivatePropertyAgencyConfig,
} from '../server/services/privatePropertyAgencyConfigService.js'

function firstText(...values) {
  for (const value of values) {
    const text = normalizePrivatePropertyText(value)
    if (text) return text
  }
  return ''
}

async function run() {
  const options = parsePrivatePropertyArgs(process.argv.slice(2), {
    organisationId: '',
    branchId: '',
    environment: 'sandbox',
    vendorName: 'Arch9',
    branchGuid: '',
    usernameSecretName: '',
    passwordSecretName: '',
    baseUrl: '',
    enabled: 'false',
    status: 'pending',
    goLiveApprovedAt: '',
    notes: '',
    output: '',
  })
  const env = loadPrivatePropertyEnv()
  const supabaseUrl = firstText(env.SUPABASE_URL, env.VITE_SUPABASE_URL)
  const serviceRoleKey = firstText(env.SUPABASE_SERVICE_ROLE_KEY)
  const missing = []
  if (!supabaseUrl) missing.push('SUPABASE_URL or VITE_SUPABASE_URL')
  if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!options.organisationId) missing.push('--organisation-id')
  if (!options.branchGuid) missing.push('--branch-guid')
  if (!options.usernameSecretName) missing.push('--username-secret-name')
  if (!options.passwordSecretName) missing.push('--password-secret-name')
  if (options.environment === 'production' && !options.baseUrl) missing.push('--base-url')

  if (missing.length) {
    const report = {
      phase: 'private-property-go-live-phase1-config-upsert',
      generatedAt: new Date().toISOString(),
      status: 'BLOCKED',
      safety: {
        privatePropertyApiCalled: false,
        databaseWritten: false,
        rawCredentialStored: false,
      },
      missingConfiguration: missing,
      nextStep: 'Provide the missing config values and re-run. Use secret names, not raw credential values.',
    }
    const output = writePrivatePropertyReport(report, options.output, 'private-property-upsert-agency-config.json')
    console.log(JSON.stringify({ status: report.status, output, missingConfiguration: missing }, null, 2))
    process.exitCode = 1
    return
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const result = await upsertPrivatePropertyAgencyConfig({
    client,
    organisationId: options.organisationId,
    branchId: options.branchId,
    environment: options.environment,
    vendorName: options.vendorName,
    branchGuid: options.branchGuid,
    usernameSecretName: options.usernameSecretName,
    passwordSecretName: options.passwordSecretName,
    baseUrl: options.baseUrl,
    enabled: options.enabled,
    status: options.status,
    goLiveApprovedAt: options.goLiveApprovedAt,
    notes: options.notes,
  })

  const report = {
    phase: 'private-property-go-live-phase1-config-upsert',
    generatedAt: new Date().toISOString(),
    status: 'CONFIG_RECORDED',
    action: result.action,
    safety: {
      privatePropertyApiCalled: false,
      databaseWritten: true,
      rawCredentialStored: false,
    },
    config: result.config,
    readiness: result.readiness,
  }
  const output = writePrivatePropertyReport(report, options.output, 'private-property-upsert-agency-config.json')
  console.log(JSON.stringify({
    status: report.status,
    output,
    action: report.action,
    ready: report.readiness.ready,
    blockers: report.readiness.blockers,
    config: report.config,
  }, null, 2))
}

run().catch((error) => {
  console.error(JSON.stringify({
    status: 'FAILED',
    name: error.name || 'Error',
    message: error.message,
    missing: error.missing || undefined,
    code: error.code || null,
    details: error.details || null,
  }, null, 2))
  process.exitCode = 1
})
