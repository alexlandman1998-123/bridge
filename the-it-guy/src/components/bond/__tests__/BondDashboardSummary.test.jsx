/* global require, __dirname, process */
const assert = require('node:assert/strict')
const path = require('node:path')
const { createServer } = require('vite')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const PROJECT_ROOT = path.resolve(__dirname, '../../../..')

function render(Component, props) {
  return renderToStaticMarkup(React.createElement(Component, props))
}

;(async () => {
  const server = await createServer({
    root: PROJECT_ROOT,
    logLevel: 'silent',
    server: { middlewareMode: true },
  })

  try {
    const summaryModule = await server.ssrLoadModule('/src/components/bond/BondDashboardSummary.jsx')
    const Summary = summaryModule.default

    const markup = render(Summary, {
      summary: {
        totalApplications: 12,
        myApplications: 4,
        processingQueue: 3,
        missingDocuments: 2,
        bankFeedbackPending: 1,
        submissionReady: 2,
        overdueApplications: 1,
        complianceReview: 1,
        managerEscalations: 1,
        approvedApplications: 5,
        declinedOrBlockedApplications: 2,
      },
    })

    assert.match(markup, /Total Applications/)
    assert.match(markup, />12</)
    assert.match(markup, /My Applications/)
    assert.match(markup, /Processing Queue/)
    assert.match(markup, /Blocked \/ Declined/)

    console.log('BondDashboardSummary component tests passed')
  } finally {
    await server.close()
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
