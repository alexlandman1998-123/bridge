// Default audit-only. Credentials are read from the process, never report files.
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { auditSharedMatters, repairSharedMatter, RECONCILIATION_CONFIRMATION } from '../src/services/sharedMatterReconciliationService.js'
const [mode, endpoint, ...args] = process.argv.slice(2)
if (!['audit', 'repair'].includes(mode) || !endpoint) throw new Error('Usage: audit <https://project.supabase.co> <matter-id> ... OR repair <endpoint> <report.json> <confirmation> <selected-matter-id> ...')
const url = new URL(endpoint)
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Supply the exact HTTPS project origin.')
const projectOrigin = url.origin
const key = process.env.SUPABASE_ANON_KEY, token = process.env.RECONCILIATION_ACCESS_TOKEN
if (!key || !token) throw new Error('Set SUPABASE_ANON_KEY and RECONCILIATION_ACCESS_TOKEN to an authorised professional session. Never use a service-role token.')
const client = { async rpc(name, body) {
  const response = await fetch(`${projectOrigin}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) return { error: { status: response.status } }
  return { data: await response.json() }
} }
if (mode === 'audit') {
  const reports = await auditSharedMatters(client, args)
  console.log(JSON.stringify({ schemaVersion: 1, projectOrigin, auditedAt: new Date().toISOString(), entries: reports.map(report => ({ commandId: randomUUID(), report })) }, null, 2))
} else {
  const [path, confirmation, ...selected] = args
  if (confirmation !== RECONCILIATION_CONFIRMATION || !selected.length || selected.length > 10 || new Set(selected).size !== selected.length) throw new Error('Explicit confirmation and 1–10 unique selected matter IDs are required.')
  const input = JSON.parse(readFileSync(path, 'utf8'))
  if (input.schemaVersion !== 1 || input.projectOrigin !== projectOrigin || !Array.isArray(input.entries)) throw new Error('Report does not belong to this project.')
  const entries = selected.map(id => {
    const found = input.entries.filter(e => e.report?.transactionId === id)
    if (found.length !== 1 || found[0].report.decision !== 'repairable') throw new Error(`No single repairable report for ${id}.`)
    return found[0]
  })
  // Each matter commits independently. Emit its receipt immediately; stop on
  // failure. Replaying this same report retains the idempotency command IDs.
  for (const entry of entries) console.log(JSON.stringify(await repairSharedMatter(client, entry.report, entry.commandId, confirmation)))
}
