/* global require, __dirname, process */
const assert = require('node:assert/strict')
const path = require('node:path')
const { createServer } = require('vite')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const PROJECT_ROOT = path.resolve(__dirname, '../../../..')

function render(Component, props = {}) {
  return renderToStaticMarkup(React.createElement(Component, props))
}

async function main() {
  const server = await createServer({
    root: PROJECT_ROOT,
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  })

  try {
    const module = await server.ssrLoadModule('/src/components/dashboard/BridgeCommandCenterDashboard.jsx')
    const BridgeCommandCenterDashboard = module.default
    const rawId = '11111111-1111-4111-8111-111111111111'
    const markup = render(BridgeCommandCenterDashboard, {
      profile: { name: 'John Smith', organisationName: 'Bond Originator' },
      rows: [
        {
          transaction: {
            id: rawId,
            stage: 'Finance',
            sales_price: 2100000,
            assigned_agent: 'Sarah Johnson',
            preferred_bank: 'Nedbank',
            updated_at: new Date().toISOString(),
          },
          buyer: { name: 'Client One' },
          unit: { unit_number: '12', price: 2100000 },
          development: { name: 'The Ridge' },
          documentSummary: { missingCount: 2 },
        },
        {
          transaction: {
            stage: 'Registered',
            sales_price: 1800000,
            assigned_agent: 'Mike Williams',
            preferred_bank: 'FNB',
            updated_at: new Date().toISOString(),
          },
          buyer: { name: 'Client Two' },
          unit: { unit_number: '20', price: 1800000 },
          development: { name: 'Harbour Point' },
          documentSummary: { missingCount: 0 },
        },
      ],
    })

    assert.match(markup, /Welcome back, John Smith/)
    assert.match(markup, /Export Report/)
    assert.doesNotMatch(markup, /<select/)
    assert.doesNotMatch(markup, /Preview/)
    assert.doesNotMatch(markup, /Create Application/)

    const kpiOrder = [
      'Active Transactions',
      'Pending Buyer Docs',
      'Bond Approval Rate',
      'Registration Pipeline Value',
      'Avg Days To Registration',
    ]
    for (const label of kpiOrder) {
      assert.match(markup, new RegExp(label))
    }
    assert.ok(kpiOrder.every((label, index) => index === 0 || markup.indexOf(kpiOrder[index - 1]) < markup.indexOf(label)))
    assert.match(markup, /xl:grid-cols-5/)
    assert.match(markup, /docs queue improving/)
    assert.match(markup, /files tracked/)

    assert.match(markup, /Transaction Pipeline/)
    assert.match(markup, /Buyer Leads/)
    assert.match(markup, /OTP Signed/)
    assert.match(markup, /Finance/)
    assert.match(markup, /Attorney/)
    assert.match(markup, /Lodgement/)
    assert.match(markup, /Registered/)
    assert.match(markup, /overall conversion/)

    assert.match(markup, /Registrations Over Time/)
    assert.match(markup, /Bank Approvals Breakdown/)
    assert.match(markup, /xl:grid-cols-2/)
    assert.match(markup, /Attention Required/)
    assert.match(markup, /Recent Activity/)
    assert.match(markup, /Top Performing Agents/)
    assert.match(markup, /xl:grid-cols-3/)
    assert.match(markup, /Active Partner Network/)
    assert.match(markup, /Banks/)
    assert.match(markup, /Attorneys/)
    assert.match(markup, /Agents/)
    assert.match(markup, /Developers/)

    assert.ok(markup.indexOf('Transaction Pipeline') < markup.indexOf('Registrations Over Time'))
    assert.ok(markup.indexOf('Attention Required') < markup.indexOf('Active Partner Network'))
    assert.doesNotMatch(markup, new RegExp(rawId))

    const fallbackMarkup = render(BridgeCommandCenterDashboard, {})
    assert.match(fallbackMarkup, /Welcome back, John/)
    assert.match(fallbackMarkup, /Active Transactions/)
    assert.match(fallbackMarkup, /Registration Pipeline Value/)
    assert.match(fallbackMarkup, /R0/)
    assert.doesNotMatch(fallbackMarkup, /<select/)
    assert.doesNotMatch(fallbackMarkup, /Bond approved by Nedbank/)

    console.log('BridgeCommandCenterDashboard component tests passed')
  } finally {
    await server.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
