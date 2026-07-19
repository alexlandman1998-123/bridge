const baseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const anonKey = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '')

if (!baseUrl || !anonKey) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required for deployment-contract verification.')
}

const response = await fetch(`${baseUrl}/rest/v1/rpc/bridge_create_mvp_transaction`, {
  method: 'POST',
  headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
  body: '{}',
})
const body = await response.text()
const rpcMissing = response.status === 404 || /could not find the function|PGRST202/i.test(body)

console.log(JSON.stringify({
  version: 'arch9_mvp_deployment_contract_check_v1',
  passed: !rpcMissing,
  rpc: 'bridge_create_mvp_transaction',
  httpStatus: response.status,
  result: rpcMissing ? 'missing' : 'deployed',
  note: 'A non-2xx result is expected with an anonymous request; this check only confirms the protected RPC is deployed.',
}, null, 2))

if (rpcMissing) process.exit(1)
