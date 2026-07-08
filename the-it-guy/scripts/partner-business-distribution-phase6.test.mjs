import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { createServer } from 'vite'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const serviceSource = read('src/services/partnerBusinessDistributionService.js')
const panelSource = read('src/components/dashboard/PartnerBusinessDistributionPanel.jsx')

for (const token of [
  'unassignedPercent',
  'totalDealValue',
  'assignedDealValue',
  'unassignedDealValue',
  'averageDealValue',
  'topPartnerSharePercent',
  'dominantBucketSharePercent',
]) {
  assert.ok(serviceSource.includes(token), `partner distribution service should preserve ${token}`)
}

for (const token of [
  'formatCurrencyCompact',
  'PanelSummaryMetric',
  'Originator Cover',
  'Hybrid Share',
  'Deal Value',
  'Top Share',
  'Dominant',
]) {
  assert.ok(panelSource.includes(token), `partner distribution panel should preserve ${token}`)
}

const server = await createServer({
  root,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { buildPartnerBusinessDistribution } = await server.ssrLoadModule('/src/services/partnerBusinessDistributionService.js')
  const panelModule = await server.ssrLoadModule('/src/components/dashboard/PartnerBusinessDistributionPanel.jsx')
  const PartnerBusinessDistributionPanel = panelModule.default

  const distribution = buildPartnerBusinessDistribution({
    transactions: [
      { id: 'tx-1', finance_type: 'bond', purchase_price: 2000000 },
      { id: 'tx-2', finance_type: 'cash', purchase_price: 1000000 },
      { id: 'tx-3', finance_type: 'hybrid', purchase_price: 1500000 },
    ],
    rolePlayers: [
      { transaction_id: 'tx-1', role_type: 'transfer_attorney', partner_name: 'North Attorneys' },
      { transaction_id: 'tx-1', role_type: 'bond_originator', partner_name: 'Bond Hub' },
      { transaction_id: 'tx-2', role_type: 'transfer_attorney', partner_name: 'North Attorneys' },
      { transaction_id: 'tx-3', role_type: 'transfer_attorney', partner_name: 'East Transfers' },
      { transaction_id: 'tx-3', role_type: 'bond_originator', partner_name: 'Bond Hub' },
    ],
  })

  assert.equal(distribution.attorneys.totalDealValue, 4500000)
  assert.equal(distribution.attorneys.assignedDealValue, 4500000)
  assert.equal(distribution.attorneys.unassignedPercent, 0)
  assert.equal(distribution.attorneys.topPartnerSharePercent, 67)
  assert.equal(distribution.bondOriginators.assignmentCoveragePercent, 100)
  assert.equal(distribution.financeMix.hybridSharePercent, 33)
  assert.equal(distribution.financeMix.dominantBucketSharePercent, 33)

  const markup = ReactDOMServer.renderToStaticMarkup(
    React.createElement(PartnerBusinessDistributionPanel, {
      scope: 'principal',
      distribution,
    }),
  )

  for (const expectedText of [
    'Originator Cover',
    'Hybrid Share',
    'Deal Value',
    'Unassigned',
    'Top Share',
    'Dominant',
    'Unknown',
    'North Attorneys',
    'Bond Hub',
  ]) {
    assert.ok(markup.includes(expectedText), `rendered partner distribution stats should include "${expectedText}"`)
  }
} finally {
  await server.close()
}

console.log('partner business distribution phase 6 stats checks passed')
