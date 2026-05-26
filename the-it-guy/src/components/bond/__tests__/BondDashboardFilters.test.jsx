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
    const filtersModule = await server.ssrLoadModule('/src/components/bond/BondDashboardFilters.jsx')
    const Filters = filtersModule.default

    const hqMarkup = render(Filters, {
      filters: {
        visibleFilters: {
          region: true,
          unit: true,
          consultant: true,
          processor: true,
          manager: true,
          complianceReviewer: true,
          stage: true,
          financeStatus: true,
          overdue: true,
        },
        options: {
          regions: [{ id: 'region-1', name: 'Gauteng' }],
          units: [{ id: 'unit-1', name: 'Sandton Branch' }],
          consultants: [{ id: 'consultant-1', label: 'Consultant 1' }],
          processors: [{ id: 'processor-1', label: 'Processor 1' }],
          managers: [{ id: 'manager-1', label: 'Manager 1' }],
          complianceReviewers: [{ id: 'compliance-1', label: 'Compliance 1' }],
          stages: [{ value: 'Finance', label: 'Finance' }],
          financeStatuses: [{ value: 'prepared', label: 'Prepared' }],
          overdue: [{ value: 'overdue', label: 'Overdue only' }],
        },
      },
      values: {},
      onChange: () => {},
    })
    assert.match(hqMarkup, /Region/)
    assert.match(hqMarkup, /Branch \/ Team/)
    assert.match(hqMarkup, /Consultant/)
    assert.match(hqMarkup, /Processor/)

    const assignedMarkup = render(Filters, {
      filters: {
        visibleFilters: {
          region: false,
          unit: false,
          consultant: false,
          processor: false,
          manager: false,
          complianceReviewer: false,
          stage: false,
          financeStatus: false,
          overdue: false,
        },
        options: {},
      },
      values: {},
      onChange: () => {},
    })
    assert.match(assignedMarkup, /No additional filters available/)

    console.log('BondDashboardFilters component tests passed')
  } finally {
    await server.close()
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
