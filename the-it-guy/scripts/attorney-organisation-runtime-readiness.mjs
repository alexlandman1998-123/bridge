import fs from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { buildAttorneyOrganisationDriftReport } from '../src/core/organisations/attorneyOrganisationContract.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

const REQUIRED_SCHEMA = {
  organisations: [
    'id',
    'vat_number',
    'logo_bucket',
    'logo_path',
    'logo_dark_url',
    'logo_dark_bucket',
    'logo_dark_path',
    'primary_colour',
    'secondary_colour',
  ],
  attorney_firms: ['id', 'organisation_id', 'vat_number'],
  attorney_firm_branding: [
    'firm_id',
    'logo_bucket',
    'logo_path',
    'logo_dark_url',
    'logo_dark_bucket',
    'logo_dark_path',
    'primary_colour',
    'secondary_colour',
  ],
  attorney_firm_members: ['firm_id', 'user_id', 'status'],
  organisation_users: ['organisation_id', 'user_id', 'status'],
}

const REQUIRED_RPCS = [
  'bridge_complete_attorney_firm_onboarding_v2',
  'bridge_reconcile_attorney_firm_organisation',
  'bridge_update_attorney_organisation_identity_v3',
]

function normalizeText(value = '') {
  return String(value || '').trim()
}

function parseArgs(argv) {
  const options = {
    skipNetwork: false,
    failOnBlocked: false,
    outputPath: '',
    expectedProjectRef: '',
  }

  for (const arg of argv) {
    if (arg === '--skip-network') options.skipNetwork = true
    else if (arg === '--fail-on-blocked') options.failOnBlocked = true
    else if (arg.startsWith('--output=')) options.outputPath = normalizeText(arg.slice('--output='.length))
    else if (arg.startsWith('--expected-project-ref=')) options.expectedProjectRef = normalizeText(arg.slice('--expected-project-ref='.length))
    else throw new Error(`Unknown option: ${arg}`)
  }

  return options
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, '')]
      }),
  )
}

function loadEnvironment() {
  return {
    ...parseEnvFile(`${appRoot}/.env`),
    ...parseEnvFile(`${appRoot}/.env.staging.local`),
    ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeText(value))),
  }
}

function projectRefFromUrl(url = '') {
  return normalizeText(url).match(/^https:\/\/([^.]+)/)?.[1] || ''
}

function createReport(options) {
  return {
    phase: 5,
    scope: 'attorney-organisation-runtime-readiness',
    generatedAt: new Date().toISOString(),
    mode: options.skipNetwork ? 'static' : 'read-only-runtime',
    summary: {
      status: 'BLOCKED',
      recommendation: 'Do not release until readiness checks complete.',
      passCount: 0,
      warningCount: 0,
      blockedCount: 0,
      criticalCount: 0,
    },
    findings: [],
    runtime: {
      projectRef: null,
      openApiChecked: false,
      schemaReady: false,
      driftSummary: null,
      membershipSummary: null,
    },
  }
}

function addFinding(report, area, status, title, detail = '') {
  report.findings.push({ area, status, title, ...(detail ? { detail } : {}) })
  if (status === 'PASS') report.summary.passCount += 1
  if (status === 'WARN') report.summary.warningCount += 1
  if (status === 'BLOCKED') report.summary.blockedCount += 1
  if (status === 'CRITICAL') report.summary.criticalCount += 1
}

function finalizeReport(report) {
  if (report.summary.criticalCount > 0) {
    report.summary.status = 'FAILED'
    report.summary.recommendation = 'NO-GO: resolve critical attorney organisation findings.'
  } else if (report.summary.blockedCount > 0) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until blocked live checks are completed.'
  } else if (report.summary.warningCount > 0) {
    report.summary.status = 'READY_WITH_WARNINGS'
    report.summary.recommendation = 'Review warnings before release.'
  } else {
    report.summary.status = 'READY'
    report.summary.recommendation = 'Attorney organisation rollout checks passed.'
  }
  return report
}

function runStaticChecks(report) {
  const requiredSources = [
    {
      path: `${appRoot}/../supabase/migrations/202607150003_attorney_organisation_onboarding_phase2.sql`,
      markers: ['bridge_complete_attorney_firm_onboarding_v2', 'vat_number', 'logo_dark_url'],
    },
    {
      path: `${appRoot}/../supabase/migrations/202607150004_attorney_organisation_reconciliation_phase3.sql`,
      markers: ['bridge_reconcile_attorney_firm_organisation', 'organisations_sync_attorney_identity_to_legacy'],
    },
    {
      path: `${appRoot}/src/core/organisations/attorneyOrganisationSettings.js`,
      markers: ['buildAttorneyOrganisationSettingsInput', 'primaryColour', 'logoDarkUrl'],
    },
    {
      path: `${appRoot}/src/core/organisations/attorneyOrganisationFirmProjection.js`,
      markers: ['projectCanonicalOrganisationOntoAttorneyFirm', 'company_email', 'logo_bucket'],
    },
    {
      path: `${appRoot}/src/services/attorneyFirms.js`,
      markers: ['getCanonicalAttorneyOrganisationRows', 'updateCanonicalAttorneyOrganisationWithRpc'],
    },
    {
      path: `${appRoot}/../supabase/migrations/202607150005_attorney_organisation_canonical_write_phase7.sql`,
      markers: ['bridge_update_attorney_organisation_identity_v3', 'attorneyCanonicalWriteVersion'],
    },
  ]

  const failures = []
  for (const source of requiredSources) {
    if (!fs.existsSync(source.path)) {
      failures.push(`Missing ${source.path.replace(`${appRoot}/`, '')}`)
      continue
    }
    const contents = fs.readFileSync(source.path, 'utf8')
    const missingMarkers = source.markers.filter((marker) => !contents.includes(marker))
    if (missingMarkers.length) failures.push(`${source.path.replace(`${appRoot}/`, '')}: ${missingMarkers.join(', ')}`)
  }

  if (failures.length) addFinding(report, 'Static Contract', 'CRITICAL', 'Required Phase 2–7 contracts are incomplete.', failures.join('; '))
  else addFinding(report, 'Static Contract', 'PASS', 'Required Phase 2–7 contracts are present.')
}

function getSchemas(spec) {
  return spec?.components?.schemas || spec?.definitions || {}
}

function getTableProperties(spec, table) {
  return getSchemas(spec)?.[table]?.properties || {}
}

async function readOpenApi(config) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      Accept: 'application/openapi+json',
    },
  })
  if (!response.ok) throw new Error(`OpenAPI schema request failed with HTTP ${response.status}.`)
  return response.json()
}

async function runSchemaChecks(report, config) {
  try {
    const spec = await readOpenApi(config)
    report.runtime.openApiChecked = true
    const missing = []

    for (const [table, columns] of Object.entries(REQUIRED_SCHEMA)) {
      const properties = getTableProperties(spec, table)
      if (!spec?.paths?.[`/${table}`] && !getSchemas(spec)?.[table]) {
        missing.push(`${table} table`)
        continue
      }
      for (const column of columns) {
        if (!Object.prototype.hasOwnProperty.call(properties, column)) missing.push(`${table}.${column}`)
      }
    }

    for (const rpc of REQUIRED_RPCS) {
      if (!spec?.paths?.[`/rpc/${rpc}`]) missing.push(`rpc/${rpc}`)
    }

    if (missing.length) {
      addFinding(report, 'Database Schema', 'CRITICAL', 'Required attorney organisation schema is not deployed.', missing.join(', '))
      return false
    }

    report.runtime.schemaReady = true
    addFinding(report, 'Database Schema', 'PASS', 'Phase 2 and Phase 3 database contracts are deployed.')
    return true
  } catch (error) {
    addFinding(report, 'Database Schema', 'BLOCKED', 'OpenAPI schema probe could not complete.', error.message)
    return false
  }
}

async function selectRows(client, table, columns) {
  const response = await client.from(table).select(columns)
  if (response.error) throw response.error
  return response.data || []
}

async function selectRowsIn(client, table, columns, filterColumn, values) {
  if (!values.length) return []
  const response = await client.from(table).select(columns).in(filterColumn, values)
  if (response.error) throw response.error
  return response.data || []
}

function buildMembershipParity({ firms = [], firmMembers = [], organisationUsers = [] } = {}) {
  const organisationIdByFirmId = new Map(firms.map((firm) => [firm.id, firm.organisation_id]))
  const organisationMemberships = new Set(
    organisationUsers
      .filter((membership) => membership.status === 'active' && membership.user_id)
      .map((membership) => `${membership.organisation_id}:${membership.user_id}`),
  )
  const activeFirmMembers = firmMembers.filter((membership) => membership.status === 'active' && membership.user_id)
  const missing = activeFirmMembers.filter((membership) => {
    const organisationId = organisationIdByFirmId.get(membership.firm_id)
    return !organisationId || !organisationMemberships.has(`${organisationId}:${membership.user_id}`)
  })

  return {
    activeFirmMembers: activeFirmMembers.length,
    matchedOrganisationMembers: activeFirmMembers.length - missing.length,
    missingOrganisationMembers: missing.length,
  }
}

async function runDataChecks(report, config) {
  const client = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })

  try {
    const firms = await selectRows(client, 'attorney_firms', 'id, organisation_id, name, registration_number, vat_number, website, email, phone, address_line_1, address_line_2, city, province, postal_code, country, logo_url, primary_colour, secondary_colour')
    const firmIds = firms.map((firm) => firm.id).filter(Boolean)
    const organisationIds = [...new Set(firms.map((firm) => firm.organisation_id).filter(Boolean))]
    const [organisations, brandingRows, firmMembers, organisationUsers] = await Promise.all([
      selectRowsIn(client, 'organisations', 'id, name, display_name, legal_name, registration_number, vat_number, type, company_email, company_phone, website, address_line_1, address_line_2, city, province, postal_code, country, logo_url, logo_bucket, logo_path, logo_dark_url, logo_dark_bucket, logo_dark_path, primary_colour, secondary_colour', 'id', organisationIds),
      selectRowsIn(client, 'attorney_firm_branding', 'firm_id, logo_url, logo_bucket, logo_path, logo_dark_url, logo_dark_bucket, logo_dark_path, primary_colour, secondary_colour', 'firm_id', firmIds),
      selectRowsIn(client, 'attorney_firm_members', 'firm_id, user_id, status', 'firm_id', firmIds),
      selectRowsIn(client, 'organisation_users', 'organisation_id, user_id, status', 'organisation_id', organisationIds),
    ])

    const drift = buildAttorneyOrganisationDriftReport({ firms, organisations, brandingRows })
    report.runtime.driftSummary = drift.summary
    if (drift.summary.withDrift > 0) {
      addFinding(
        report,
        'Canonical Drift',
        'CRITICAL',
        'Attorney firms still contain canonical organisation drift.',
        `${drift.summary.withDrift} of ${drift.summary.firms} firms require reconciliation.`,
      )
    } else {
      addFinding(report, 'Canonical Drift', 'PASS', `All ${drift.summary.firms} attorney firms match their canonical organisations.`)
    }

    const membership = buildMembershipParity({ firms, firmMembers, organisationUsers })
    report.runtime.membershipSummary = membership
    if (membership.missingOrganisationMembers > 0) {
      addFinding(
        report,
        'Membership Parity',
        'CRITICAL',
        'Active attorney members are missing backing organisation memberships.',
        `${membership.missingOrganisationMembers} of ${membership.activeFirmMembers} active firm memberships are unmatched.`,
      )
    } else {
      addFinding(report, 'Membership Parity', 'PASS', `All ${membership.activeFirmMembers} active firm memberships have organisation membership parity.`)
    }
  } catch (error) {
    addFinding(report, 'Runtime Data', 'BLOCKED', 'Read-only attorney organisation data probes could not complete.', error.message)
  }
}

export async function runAttorneyOrganisationReadiness(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  const report = createReport(options)
  runStaticChecks(report)

  if (options.skipNetwork) {
    addFinding(report, 'Runtime', 'BLOCKED', 'Live schema and data probes were skipped.', 'Run again without --skip-network before release.')
  } else if (report.summary.criticalCount === 0) {
    const env = loadEnvironment()
    const config = {
      supabaseUrl: normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
      serviceRoleKey: normalizeText(env.SUPABASE_SERVICE_ROLE_KEY),
    }
    const expectedProjectRef = options.expectedProjectRef || normalizeText(env.ATTORNEY_ORGANISATION_EXPECTED_PROJECT_REF)
    const projectRef = projectRefFromUrl(config.supabaseUrl)
    report.runtime.projectRef = projectRef || null

    if (!config.supabaseUrl || !config.serviceRoleKey) {
      addFinding(report, 'Environment', 'BLOCKED', 'Missing read-only runtime configuration.', 'Set SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
    } else if (expectedProjectRef && projectRef !== expectedProjectRef) {
      addFinding(report, 'Environment', 'CRITICAL', 'Readiness target does not match the approved project.', `Expected ${expectedProjectRef}; resolved ${projectRef || 'unknown'}.`)
    } else {
      addFinding(report, 'Environment', expectedProjectRef ? 'PASS' : 'WARN', expectedProjectRef ? 'Readiness target matches the approved project.' : 'No expected project ref was configured.')
      const schemaReady = await runSchemaChecks(report, config)
      if (schemaReady) await runDataChecks(report, config)
    }
  }

  finalizeReport(report)
  const serialized = `${JSON.stringify(report, null, 2)}\n`
  if (options.outputPath) fs.writeFileSync(options.outputPath, serialized, 'utf8')
  else process.stdout.write(serialized)

  if (report.summary.status === 'FAILED' || (options.failOnBlocked && report.summary.status === 'BLOCKED')) {
    process.exitCode = 1
  }
  return report
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  runAttorneyOrganisationReadiness().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

export { buildMembershipParity, parseArgs }
