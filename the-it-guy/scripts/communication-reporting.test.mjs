import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const analyticsSource = await fs.readFile(new URL('../src/services/leadAnalyticsService.js', import.meta.url), 'utf8')
assert.match(analyticsSource, /communication_deliveries/)
assert.match(analyticsSource, /communicationPerformance/)
assert.match(analyticsSource, /communicationInfrastructure/)
assert.match(analyticsSource, /communication_deliveries/)

const reportingSource = await fs.readFile(new URL('../src/pages/AgentReportingPage.jsx', import.meta.url), 'utf8')
for (const copy of ['Communication Performance', 'Communications Sent', 'Delivered', 'Failed', 'Delivery Rate', 'Failure Rate', 'Agent Breakdown', 'Organisation Breakdown', 'Communication Infrastructure', 'Last Failure']) {
  assert.match(reportingSource, new RegExp(copy), `reporting should render ${copy}`)
}
assert.match(reportingSource, /communication_deliveries/)

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const { __leadAnalyticsServiceTestUtils } = await server.ssrLoadModule('/src/services/leadAnalyticsService.js')
  const { buildLeadAnalyticsModel, buildLeadAnalyticsCsvExport } = __leadAnalyticsServiceTestUtils
  const model = buildLeadAnalyticsModel({
    leads: [],
    communicationDeliveries: [
      { status: 'sent', channel: 'email', sent_by: 'agent-1', branch_id: 'branch-1' },
      { status: 'delivered', channel: 'email', sent_by: 'agent-1', branch_id: 'branch-1' },
      { status: 'failed', channel: 'whatsapp', sent_by: 'agent-2', branch_id: 'branch-2' },
    ],
  })
  assert.equal(model.communicationPerformance.communicationsSent, 3)
  assert.equal(model.communicationPerformance.communicationsDelivered, 1)
  assert.equal(model.communicationPerformance.communicationsFailed, 1)
  assert.match(buildLeadAnalyticsCsvExport('communication_deliveries', model), /communicationsSent/)
} finally {
  await server.close()
}

console.log('communication reporting tests passed')
