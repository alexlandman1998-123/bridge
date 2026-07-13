import { createClient } from '@supabase/supabase-js'
import {
  getSellerMandateContinuityDiagnosticsSnapshot,
  renderSellerMandateContinuityMarkdown,
} from '../src/services/sellerMandateContinuityReportService.js'

const MARKDOWN = process.argv.includes('--markdown')
const FAIL_ON_WARNING = process.argv.includes('--fail-on-warning')
const GATE = process.argv.includes('--gate') || FAIL_ON_WARNING
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
const LIMIT = limitArg ? Number(limitArg.slice('--limit='.length)) : 50

function normalizeText(value = '') {
  return String(value || '').trim()
}

function getSupabaseConfig() {
  const supabaseUrl = normalizeText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizeText(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }
  return { supabaseUrl, serviceRoleKey }
}

function createSupabaseAdminClient() {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig()
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

async function run() {
  const client = createSupabaseAdminClient()
  const report = await getSellerMandateContinuityDiagnosticsSnapshot({
    client,
    limit: LIMIT,
    failOnWarning: FAIL_ON_WARNING,
  })
  const gate = report.gate

  if (MARKDOWN) {
    console.log(renderSellerMandateContinuityMarkdown(report))
  } else {
    console.log(JSON.stringify(report, null, 2))
  }

  if (GATE && gate.exitCode) process.exitCode = gate.exitCode
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
