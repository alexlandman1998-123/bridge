/* global require, __dirname, process */
const assert = require('node:assert/strict')
const path = require('node:path')
const { createServer } = require('vite')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { MemoryRouter } = require('react-router-dom')

const PROJECT_ROOT = path.resolve(__dirname, '../../../..')

function render(Component, props) {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(Component, props),
    ),
  )
}

const developments = [
  {
    id: 'dev-high',
    name: 'Harbour Point',
    developerName: 'Aurum Developments',
    location: 'Sea Point',
    status: 'Active',
    pipelineValue: 24_900_000,
    pipelineValueLabel: 'R 24 900 000',
    activeApplications: 12,
    awaitingDocs: 4,
    approvalRate: 58,
    registeredThisMonth: 4,
    riskLevel: 'medium',
    branchName: 'Atlantic Branch',
    consultantName: 'Nandi Clarke',
    lastActivityAt: new Date().toISOString(),
    href: '/bond/developments/dev-high',
    transactionsHref: '/bond/applications?developmentId=dev-high',
    reportsHref: '/bond/reports?developmentId=dev-high',
  },
  {
    id: 'dev-empty-decisions',
    name: 'Orchard Gate',
    developerName: 'Developer not linked',
    location: 'Location pending',
    status: 'Active',
    pipelineValue: 7_500_000,
    pipelineValueLabel: 'R 7 500 000',
    activeApplications: 3,
    awaitingDocs: 0,
    approvalRate: null,
    registeredThisMonth: 0,
    riskLevel: 'low',
    branchName: null,
    consultantName: null,
    lastActivityAt: null,
    href: '/bond/developments/dev-empty-decisions',
    transactionsHref: '/bond/applications?developmentId=dev-empty-decisions',
    reportsHref: '/bond/reports?developmentId=dev-empty-decisions',
  },
]

async function main() {
  const server = await createServer({
    root: PROJECT_ROOT,
    logLevel: 'silent',
    server: { middlewareMode: true },
  })

  try {
    const module = await server.ssrLoadModule('/src/pages/bond/BondDevelopmentsPage.jsx')
    const utils = await server.ssrLoadModule('/src/pages/bond/bondDevelopmentsPortfolioUtils.js')

    const summaryMarkup = render(module.PortfolioSummary, {
      summary: {
        totalPipelineValue: 32_400_000,
        activeApplications: 15,
        approvalRate: null,
        registeredThisMonth: 4,
        commissionForecast: null,
        developmentsAtRisk: 1,
      },
    })
    assert.match(summaryMarkup, /Total Pipeline Value/)
    assert.match(summaryMarkup, /R 32\s400\s000/)
    assert.match(summaryMarkup, /Active Applications/)
    assert.match(summaryMarkup, /No decision data/)
    assert.match(summaryMarkup, /Not configured/)
    assert.doesNotMatch(summaryMarkup, /Approval Rate[\s\S]*0%/)

    const tableMarkup = render(module.PortfolioTable, { developments })
    assert.match(tableMarkup, /Harbour Point/)
    assert.match(tableMarkup, /Aurum Developments/)
    assert.match(tableMarkup, /12 active/)
    assert.match(tableMarkup, /4 awaiting docs/)
    assert.match(tableMarkup, /58%/)
    assert.match(tableMarkup, /Developer not linked/)
    assert.match(tableMarkup, /Location pending/)
    assert.match(tableMarkup, />—</)
    assert.match(tableMarkup, /Applications/)
    assert.match(tableMarkup, /Reports/)

    const searchRows = utils.filterAndSortDevelopments(developments, {
      search: 'orchard',
      status: 'all',
      developer: 'all',
      branch: 'all',
      risk: 'all',
      sort: 'Last Activity',
    })
    assert.deepEqual(searchRows.map((row) => row.id), ['dev-empty-decisions'])

    const riskRows = utils.filterAndSortDevelopments(developments, {
      search: '',
      status: 'all',
      developer: 'all',
      branch: 'all',
      risk: 'medium',
      sort: 'Last Activity',
    })
    assert.deepEqual(riskRows.map((row) => row.id), ['dev-high'])

    console.log('bond developments portfolio render tests passed')
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    await server.close()
  }
}

main()
