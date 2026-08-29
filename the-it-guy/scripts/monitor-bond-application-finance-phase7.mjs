import { createClient } from '@supabase/supabase-js'

import { buildBondApplicationFinanceOperationalStatus } from '../src/modules/bond/application/workspace/index.js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const requestedWindow = Number(process.argv.find((value) => value.startsWith('--window='))?.split('=')[1] || 60)
const strict = process.argv.includes('--strict')

if (!supabaseUrl || !serviceRoleKey) {
  console.error('SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const { data, error } = await client.rpc('bridge_bond_application_finance_monitor', {
  p_window_minutes: requestedWindow,
})

if (error) {
  console.error(JSON.stringify({ status: 'BLOCKED', reason: error.message }))
  process.exit(1)
}

const report = buildBondApplicationFinanceOperationalStatus(data, { rpcAvailable: true })
console.log(JSON.stringify(report, null, 2))

if (report.status === 'BLOCKED' || (strict && report.status === 'DEGRADED')) process.exitCode = 1
