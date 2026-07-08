import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { createServer } from 'vite'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const componentSource = read('src/components/dashboard/PartnerBusinessDistributionPanel.jsx')
const principalSource = read('src/pages/PrincipalDashboard.jsx')
const agentsSource = read('src/pages/Agents.jsx')

for (const token of [
  'PartnerBusinessDistributionPanel',
  'Attorney Distribution',
  'Bond Originator Distribution',
  'Finance Mix',
  'buildConicGradient',
  'StatChip',
]) {
  assert.ok(componentSource.includes(token), `partner distribution panel should preserve ${token}`)
}

for (const token of [
  "import PartnerBusinessDistributionPanel from '../components/dashboard/PartnerBusinessDistributionPanel'",
  'distribution={data?.partnerBusinessDistribution}',
  'scope="principal"',
]) {
  assert.ok(principalSource.includes(token), `principal dashboard should render partner distribution panel with ${token}`)
}

for (const token of [
  "import PartnerBusinessDistributionPanel from '../components/dashboard/PartnerBusinessDistributionPanel'",
  'distribution={partnerBusinessDistribution}',
  'scope="agent"',
]) {
  assert.ok(agentsSource.includes(token), `agent dashboard should render partner distribution panel with ${token}`)
}

const server = await createServer({
  root,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const panelModule = await server.ssrLoadModule('/src/components/dashboard/PartnerBusinessDistributionPanel.jsx')
  const PartnerBusinessDistributionPanel = panelModule.default
  const markup = ReactDOMServer.renderToStaticMarkup(
    React.createElement(PartnerBusinessDistributionPanel, {
      scope: 'agent',
      distribution: {
        attorneys: {
          totalDeals: 4,
          assignedDeals: 3,
          uniquePartners: 2,
          assignmentCoveragePercent: 75,
          topPartner: { label: 'Smith Attorneys', count: 2 },
          items: [
            { key: 'smith', label: 'Smith Attorneys', count: 2, value: 2, percentage: 50 },
            { key: 'botha', label: 'Botha Conveyancers', count: 1, value: 1, percentage: 25 },
            { key: 'unassigned_attorney', label: 'Unassigned Attorney', count: 1, value: 1, percentage: 25, isUnassigned: true },
          ],
        },
        bondOriginators: {
          totalDeals: 3,
          assignedDeals: 2,
          uniquePartners: 2,
          assignmentCoveragePercent: 67,
          topPartner: { label: 'Originator One', count: 1 },
          items: [
            { key: 'originator-one', label: 'Originator One', count: 1, value: 1, percentage: 33 },
            { key: 'originator-two', label: 'Originator Two', count: 1, value: 1, percentage: 33 },
            { key: 'unassigned_bond_originator', label: 'Unassigned Bond Originator', count: 1, value: 1, percentage: 33, isUnassigned: true },
          ],
        },
        financeMix: {
          totalDeals: 4,
          cashDeals: 1,
          bondDeals: 2,
          hybridDeals: 1,
          items: [
            { key: 'bond', label: 'Bond', count: 2, value: 2, percentage: 50 },
            { key: 'cash', label: 'Cash', count: 1, value: 1, percentage: 25 },
            { key: 'hybrid', label: 'Hybrid', count: 1, value: 1, percentage: 25 },
          ],
        },
        meta: {
          totalTransactions: 4,
        },
      },
    }),
  )

  for (const expectedText of [
    'Partner Business Distribution',
    'Agent distribution',
    'Attorney Distribution',
    'Bond Originator Distribution',
    'Finance Mix',
    'Smith Attorneys',
    'Originator One',
    'Hybrid',
    'Deals Analysed',
    'Attorney Cover',
  ]) {
    assert.ok(markup.includes(expectedText), `rendered partner distribution panel should include "${expectedText}"`)
  }
} finally {
  await server.close()
}

console.log('partner business distribution phase 4 dashboard UI checks passed')
