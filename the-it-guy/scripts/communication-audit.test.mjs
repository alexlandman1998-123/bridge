import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const communicationSource = await fs.readFile(new URL('../src/services/leadCommunicationService.js', import.meta.url), 'utf8')
for (const copy of ['Communication Prepared', 'Communication Sent', 'Communication Delivered', 'Communication Failed', 'communication_delivery']) {
  assert.match(communicationSource, new RegExp(copy), `timeline should include ${copy}`)
}
assert.match(communicationSource, /communicationDeliveries = \[\]/)

const leadsPageSource = await fs.readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
for (const copy of ['Communication Status', 'Preferred Channel', 'Email Enabled', 'WhatsApp Enabled', 'Property Alerts', 'Last Successful Delivery', 'Consent Status']) {
  assert.match(leadsPageSource, new RegExp(copy), `lead workspace should render ${copy}`)
}

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const { __leadCommunicationServiceTestUtils } = await server.ssrLoadModule('/src/services/leadCommunicationService.js')
  const timeline = __leadCommunicationServiceTestUtils.buildCommunicationTimeline({
    communications: [],
    communicationDeliveries: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        channel: 'email',
        subject: 'Property update',
        status: 'prepared',
        prepared_at: '2026-06-03T08:00:00.000Z',
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        channel: 'email',
        status: 'delivered',
        delivered_at: '2026-06-03T09:00:00.000Z',
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        channel: 'whatsapp',
        status: 'failed',
        error_message: 'provider failed',
        failed_at: '2026-06-03T10:00:00.000Z',
      },
    ],
  })
  assert.equal(timeline[0].title, 'Communication Failed')
  assert.equal(timeline.some((item) => item.title === 'Communication Prepared'), true)
  assert.equal(timeline.some((item) => item.title === 'Communication Delivered'), true)
} finally {
  await server.close()
}

console.log('communication audit tests passed')
