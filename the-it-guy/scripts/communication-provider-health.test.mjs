import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const { getCommunicationProviderHealth, getCommunicationProviderHealthRows } = await server.ssrLoadModule('/src/services/communicationProviderService.js')
  const healthy = getCommunicationProviderHealth({
    deliveries: [{ channel: 'email', status: 'delivered' }],
  })
  assert.equal(healthy.email.state, 'healthy')
  assert.equal(healthy.whatsapp.state, 'healthy')

  const degraded = getCommunicationProviderHealth({
    deliveries: [{ channel: 'whatsapp', status: 'failed', failed_at: '2026-06-03T08:42:00.000Z' }],
  })
  assert.equal(degraded.whatsapp.state, 'degraded')
  assert.equal(degraded.whatsapp.lastFailureAt, '2026-06-03T08:42:00.000Z')

  const offline = getCommunicationProviderHealth({
    deliveries: [{ channel: 'email', status: 'sent' }],
    providers: { emailConfigured: false },
  })
  assert.equal(offline.email.state, 'offline')
  assert.equal(getCommunicationProviderHealthRows({ deliveries: [] })[0].displayState, 'Healthy')
} finally {
  await server.close()
}

console.log('communication provider health tests passed')
