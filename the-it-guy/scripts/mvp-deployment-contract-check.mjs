const baseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const anonKey = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '')
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '')
const apiKey = anonKey || serviceRoleKey
const credentialMode = anonKey ? 'anonymous' : 'service_role'

if (!baseUrl || !apiKey) {
  throw new Error('SUPABASE_URL plus SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY are required for deployment-contract verification.')
}

const response = await fetch(`${baseUrl}/rest/v1/rpc/bridge_create_mvp_transaction`, {
  method: 'POST',
  headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_payload: {} }),
})
const body = await response.text()
const rpcMissing = response.status === 404 || /could not find the function|PGRST202/i.test(body)

console.log(JSON.stringify({
  version: 'arch9_mvp_deployment_contract_check_v2',
  passed: !rpcMissing,
  rpc: 'bridge_create_mvp_transaction',
  rpcParameter: 'p_payload',
  probePayload: { p_payload: {} },
  credentialMode,
  httpStatus: response.status,
  result: rpcMissing ? 'missing' : 'deployed',
  note: 'A non-2xx result can be expected without an end-user JWT; this check only confirms the protected RPC is deployed.',
}, null, 2))

if (rpcMissing) process.exit(1)
