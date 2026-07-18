import { createClient } from '@supabase/supabase-js'
import { buildAttorneyFirmFirstReadinessReport } from '../src/lib/attorneyFirmFirstReadiness.js'

const args = new Set(process.argv.slice(2))
const strict = args.has('--strict')
const jsonOnly = args.has('--json')
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
const accessToken = process.env.ATTORNEY_FIRM_FIRST_AUDIT_ACCESS_TOKEN || ''
const organisationArg = process.argv.slice(2).find((arg) => arg.startsWith('--organisation-id=')) || ''
const organisationId = organisationArg.split('=').slice(1).join('=').trim()

if (!url || !key) {
  console.error('Supabase URL and anonymous key are required for the firm-first readiness audit.')
  process.exit(2)
}

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
})
let query = client
  .from('transfer_firm_allocation_lifecycle_v2')
  .select('transaction_id,organisation_id,assignment_id,attorney_firm_id,attorney_user_id,allocation_state,firm_acceptance_status,staff_assignment_status,instruction_status,lifecycle_health,lifecycle_issue,required_action,hours_in_allocation_state,replaces_assignment_id,replacement_sequence,lifecycle_updated_at')

if (organisationId) query = query.eq('organisation_id', organisationId)
const result = await query
if (result.error) {
  console.error(`Firm-first readiness audit failed: ${result.error.message}. Use a service-role key or an authenticated audit access token.`)
  process.exit(2)
}

const report = buildAttorneyFirmFirstReadinessReport(result.data || [], { source: 'remote_security_invoker_view' })
if (jsonOnly) {
  console.log(JSON.stringify(report))
} else {
  console.log(JSON.stringify(report, null, 2))
}

if (report.gate.status === 'blocked' || (strict && report.gate.status !== 'pass')) {
  process.exitCode = 1
}
