import { createClient } from '@supabase/supabase-js'

import { buildBondApplicationFinanceStabilizationDecision } from '../src/modules/bond/application/workspace/index.js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const requestedWindow = Number(process.argv.find((value) => value.startsWith('--window='))?.split('=')[1] || 10080)
const strict = process.argv.includes('--strict')

if (!supabaseUrl || !serviceRoleKey) {
  console.error('SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const { data, error } = await client.rpc('bridge_bond_application_finance_stabilization', {
  p_window_minutes: requestedWindow,
})

if (error) {
  console.error(JSON.stringify({ decision: 'HOLD', reason: error.message }))
  process.exit(1)
}

const certification = buildBondApplicationFinanceStabilizationDecision(data, { rpcAvailable: true })
console.log(JSON.stringify(certification, null, 2))

if (certification.decision === 'ROLLBACK' || (strict && certification.decision !== 'SIGN_OFF')) process.exitCode = 1
