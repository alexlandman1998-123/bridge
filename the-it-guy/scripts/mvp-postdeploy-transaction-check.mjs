const baseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const apiKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '')
const transactionId = process.argv.find((arg) => arg.startsWith('--transaction-id='))?.slice('--transaction-id='.length)

if (!baseUrl || !apiKey || !transactionId) {
  throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY), and --transaction-id are required.')
}

async function read(table, select) {
  const response = await fetch(`${baseUrl}/rest/v1/${table}?transaction_id=eq.${encodeURIComponent(transactionId)}&select=${encodeURIComponent(select)}`, {
    headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
  })
  if (!response.ok) throw new Error(`${table} read failed (${response.status}): ${await response.text()}`)
  return response.json()
}

const [transactionRows, participants, documents, lanes] = await Promise.all([
  fetch(`${baseUrl}/rest/v1/transactions?id=eq.${encodeURIComponent(transactionId)}&select=${encodeURIComponent('id,creation_idempotency_key,routing_profile_json')}`, { headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` } }).then(async (response) => {
    if (!response.ok) throw new Error(`transactions read failed (${response.status}): ${await response.text()}`)
    return response.json()
  }),
  read('transaction_participants', 'id,role_type,transaction_role'),
  read('transaction_required_documents', 'id,document_key,status'),
  read('transaction_workflow_lanes', 'id,lane_type,status'),
])

const transaction = transactionRows[0] || null
const missing = []
if (!transaction?.creation_idempotency_key) missing.push('transaction_idempotency')
if (!transaction?.routing_profile_json) missing.push('routing_profile')
if (!participants.length) missing.push('participants')
if (!documents.length) missing.push('document_requirements')
if (!lanes.length) missing.push('workflow_lanes')

console.log(JSON.stringify({
  version: 'arch9_mvp_postdeploy_transaction_check_v1',
  transactionId,
  passed: missing.length === 0,
  counts: { participants: participants.length, documents: documents.length, workflowLanes: lanes.length },
  missing,
}, null, 2))

if (missing.length) process.exit(1)
