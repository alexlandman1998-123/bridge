import { writeFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { buildAttorneyOrganisationDriftReport } from '../src/core/organisations/attorneyOrganisationContract.js'

const includeValues = process.argv.includes('--include-values')
const failOnDrift = process.argv.includes('--fail-on-drift')
const outputArg = process.argv.find((arg) => arg.startsWith('--output='))
const outputPath = outputArg ? outputArg.slice('--output='.length).trim() : ''

function normalizeText(value) {
  return String(value || '').trim()
}

function getConfig() {
  const supabaseUrl = normalizeText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizeText(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for the read-only drift report.')
  }
  return { supabaseUrl, serviceRoleKey }
}

function createReadOnlyClient() {
  const { supabaseUrl, serviceRoleKey } = getConfig()
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

async function selectRows(client, table, columns) {
  const response = await client.from(table).select(columns)
  if (response.error) throw response.error
  return response.data || []
}

async function selectRowsWithLegacyFallback(client, table, columns, legacyColumns) {
  const response = await client.from(table).select(columns)
  if (!response.error) return { rows: response.data || [], environmentIssues: [] }
  if (String(response.error.code || '') !== '42703') throw response.error

  const fallback = await client.from(table).select(legacyColumns)
  if (fallback.error) throw fallback.error
  return {
    rows: fallback.data || [],
    environmentIssues: [{
      kind: 'missing_expected_columns',
      table,
      code: response.error.code,
      message: response.error.message,
      usedLegacyFallback: true,
    }],
  }
}

async function run() {
  const client = createReadOnlyClient()
  const [firms, organisationResult, brandingResult] = await Promise.all([
    selectRows(
      client,
      'attorney_firms',
      'id, organisation_id, name, registration_number, vat_number, website, email, phone, address_line_1, address_line_2, city, province, postal_code, country, logo_url, primary_colour, secondary_colour, is_active, updated_at',
    ),
    selectRowsWithLegacyFallback(
      client,
      'organisations',
      'id, name, display_name, legal_name, registration_number, vat_number, type, company_email, company_phone, website, address_line_1, address_line_2, city, province, postal_code, country, logo_url, logo_bucket, logo_path, logo_dark_url, logo_dark_bucket, logo_dark_path, primary_colour, secondary_colour, updated_at',
      'id, name, display_name, legal_name, registration_number, type, company_email, company_phone, website, address_line_1, address_line_2, city, province, postal_code, country, logo_url, updated_at',
    ),
    selectRowsWithLegacyFallback(
      client,
      'attorney_firm_branding',
      'firm_id, logo_url, logo_bucket, logo_path, logo_dark_url, logo_dark_bucket, logo_dark_path, primary_colour, secondary_colour, updated_at',
      'firm_id, logo_url, logo_dark_url, primary_colour, secondary_colour, updated_at',
    ),
  ])

  const report = buildAttorneyOrganisationDriftReport({
    firms,
    organisations: organisationResult.rows,
    brandingRows: brandingResult.rows,
    environmentIssues: [...organisationResult.environmentIssues, ...brandingResult.environmentIssues],
    includeValues,
  })
  const serialized = `${JSON.stringify(report, null, 2)}\n`

  if (outputPath) {
    await writeFile(outputPath, serialized, 'utf8')
    console.log(`Wrote read-only attorney organisation drift report to ${outputPath}`)
    console.log(JSON.stringify(report.summary, null, 2))
  } else {
    console.log(serialized.trimEnd())
  }

  if (failOnDrift && report.summary.withDrift > 0) process.exitCode = 1
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
