import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false, envFile: false, logLevel: 'silent', server: { middlewareMode: true },
})

try {
  const { fetchRegistrationJourneyUpdate } = await server.ssrLoadModule('/src/services/attorneyWorkflow/attorneyWorkflowLaneService.js')
  const calls = []
  const rows = [
    { id: 'no-recipient', client_recipients: [], created_at: '2026-09-26T12:00:00Z' },
    { id: 'seller-update', client_recipients: ['seller'], created_at: '2026-09-25T12:00:00Z' },
    { id: 'buyer-update', client_recipients: ['buyer'], created_at: '2026-09-24T12:00:00Z' },
  ]
  const query = {
    select(...args) { calls.push(['select', ...args]); return this },
    eq(...args) { calls.push(['eq', ...args]); return this },
    contains(...args) { calls.push(['contains', ...args]); return this },
    order(...args) { calls.push(['order', ...args]); return this },
    then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject) },
  }
  const client = { from(table) { calls.push(['from', table]); return query } }
  const result = await fetchRegistrationJourneyUpdate(client, 'matter-1')
  assert.deepEqual(result.map(row => row.id), ['seller-update'],
    'the latest client-addressed registration update survives newer rows without recipients')
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'visibility' && call[2] === 'client_visible'))
  assert.ok(calls.some(call => call[0] === 'contains' && call[1] === 'metadata'))
  assert.ok(!calls.some(call => call[0] === 'overlaps'), 'JSONB recipients must not use the Postgres array-overlap operator')
  console.log('Registration journey update read passed for JSONB and legacy array recipients.')
} finally {
  await server.close()
}
