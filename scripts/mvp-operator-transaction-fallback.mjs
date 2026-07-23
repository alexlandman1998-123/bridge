import { readFileSync } from 'node:fs'

const payloadPath = process.argv.find((argument) => argument.startsWith('--payload='))?.slice('--payload='.length)
const reason = process.argv.find((argument) => argument.startsWith('--reason='))?.slice('--reason='.length)?.trim()
const baseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '')
const anonKey = String(process.env.SUPABASE_ANON_KEY || '')
const operatorJwt = String(process.env.SUPABASE_OPERATOR_JWT || '')

if (!payloadPath || !reason || !baseUrl || !anonKey || !operatorJwt) {
  throw new Error(
    'SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_OPERATOR_JWT, --payload=<accepted-offer-payload.json>, and --reason=<incident-reference> are required.',
  )
}

const payload = JSON.parse(readFileSync(payloadPath, 'utf8'))
const response = await fetch(`${baseUrl}/rest/v1/rpc/bridge_create_mvp_transaction_operator_fallback`, {
  method: 'POST',
  headers: {
    apikey: anonKey,
    Authorization: `Bearer ${operatorJwt}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ p_payload: payload, p_reason: reason }),
})

const body = await response.text()
if (!response.ok) throw new Error(`Controlled transaction fallback failed (${response.status}): ${body}`)

const result = JSON.parse(body)
if (!result?.transaction?.id || !result?.manual_fallback?.audit_id) {
  throw new Error('Controlled transaction fallback returned without a transaction id and persistent audit id.')
}

console.log(JSON.stringify(result, null, 2))
