import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { createServer } from 'vite'

import {
  buildAgentBondApplicationJourney,
  buildAgentBondApplicationWorkspace,
} from '../src/modules/bond/application/workspace/index.js'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function workspace(overrides = {}) {
  return {
    available: true,
    valid: true,
    lastUpdatedAt: '2026-08-28T18:00:00Z',
    application: {
      id: 'application-1',
      transactionId: 'transaction-1',
      createdAt: '2026-08-20T08:00:00Z',
      participantSummary: { total: 1, ready: 1, outstanding: 0 },
      documentRequirementSummary: { total: 2, satisfied: 2, outstanding: 0 },
    },
    originator: {
      package: { id: 'package-1', packageReadyAt: '2026-08-21T08:00:00Z', originatorRecipientName: 'BetterBond' },
      progressEvents: [],
      documentRequests: [],
      documentRequestSummary: { total: 0, open: 0, awaitingReview: 0 },
      offerCaptures: [],
      grantCaptures: [],
      offerGrantSummary: { offers: { total: 0, accepted: 0 }, grants: { total: 0 } },
    },
    finance: {
      workflow: { id: 'workflow-1', status: 'active', currentStage: 'submitted_to_banks' },
      applications: [{ id: 'bank-application-1', bankName: 'ABSA', status: 'submitted', submittedAt: '2026-08-22T08:00:00Z' }],
      quotes: [],
      decisions: [],
      instruction: null,
      bankOutcomes: [],
    },
    guarantees: { steps: [] },
    ...overrides,
  }
}

{
  const presentation = buildAgentBondApplicationJourney(workspace())
  assert.equal(presentation.available, true)
  assert.equal(presentation.journey.length, 7)
  assert.equal(presentation.journey.find((stage) => stage.key === 'submitted_to_banks')?.state, 'in_progress')
  assert.equal(presentation.activeWaitingKey, 'banks')
  assert.match(presentation.summary, /waiting for bank feedback/i)
}

{
  const presentation = buildAgentBondApplicationJourney({
    available: false,
    valid: true,
    originatorAssigned: true,
    application: null,
    originator: {},
    finance: {},
    guarantees: { steps: [] },
  })
  assert.equal(presentation.available, true)
  assert.equal(presentation.correlated, false)
  assert.equal(presentation.statusLabel, 'Awaiting Application')
  assert.equal(presentation.journey[0].state, 'in_progress')
  assert.match(presentation.summary, /has not been created or linked/i)
}

{
  const packageBackedWorkspace = buildAgentBondApplicationWorkspace({
    transaction: { id: 'transaction-1' },
    bondApplication: null,
    originatorProgress: {
      id: 'package-1',
      transaction_id: 'transaction-1',
      bond_application_id: 'application-1',
      status: 'accepted_by_originator',
      package_ready_at: '2026-08-20T08:00:00Z',
    },
  })
  const presentation = buildAgentBondApplicationJourney(packageBackedWorkspace)
  assert.equal(packageBackedWorkspace.applicationSource, 'originator_package_reference')
  assert.equal(presentation.available, true)
  assert.equal(presentation.journey[0].key, 'application_received')
  assert.equal(presentation.journey[0].state, 'completed')
  assert.equal(presentation.journey[1].key, 'documents_received')
  assert.equal(presentation.journey[1].state, 'in_progress')
}

{
  const base = workspace()
  const presentation = buildAgentBondApplicationJourney(workspace({
    originator: {
      ...base.originator,
      offerCaptures: [{ id: 'offer-1', bankName: 'ABSA', status: 'accepted_by_buyer', publishedAt: '2026-08-23T08:00:00Z' }],
      grantCaptures: [{ id: 'grant-1', bankName: 'ABSA', status: 'published_to_buyer', publishedAt: '2026-08-24T08:00:00Z' }],
    },
  }))
  assert.equal(presentation.activeWaitingKey, 'instruction')
  assert.equal(presentation.journey.find((stage) => stage.key === 'grant_accepted')?.state, 'in_progress')
}

{
  const base = workspace()
  const presentation = buildAgentBondApplicationJourney(workspace({
    originator: {
      ...base.originator,
      offerCaptures: [{ id: 'offer-1', status: 'accepted_by_buyer' }],
      grantCaptures: [{ id: 'grant-1', status: 'buyer_signed' }],
    },
    finance: {
      ...base.finance,
      instruction: { instructionSent: true, instructionSentAt: '2026-08-25T08:00:00Z' },
    },
    guarantees: {
      steps: [
        { id: 'guarantee-1', status: 'completed', completedAt: '2026-08-26T08:00:00Z' },
        { id: 'guarantee-2', status: 'in_progress' },
      ],
    },
  }))
  assert.equal(presentation.activeWaitingKey, 'guarantees')
  assert.match(presentation.waitingSteps.find((step) => step.key === 'guarantees')?.detail || '', /1 of 2/)
}

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const componentModule = await server.ssrLoadModule('/src/components/bond/BondOriginatorAgentProgressView.jsx')
  const markup = ReactDOMServer.renderToStaticMarkup(
    React.createElement(componentModule.default, {
      applicationWorkspace: workspace(),
      transaction: { id: 'transaction-1', bond_originator: 'BetterBond' },
    }),
  )

  for (const label of [
    'Bond application journey',
    'Application Received',
    'Documents Received',
    'Submitted to Banks',
    'Quotes Received',
    'Grant Accepted',
    'Attorney Instruction',
    'Where we are',
    'Waiting on documents',
    'Waiting on banks',
    'Waiting on quotes',
    'Waiting on grant',
    'Waiting on instruction',
    'Waiting on guarantees',
  ]) {
    assert.ok(markup.includes(label), `expected Finance tab markup to include "${label}"`)
  }
  assert.match(markup, /aria-current="step"[^>]*>[\s\S]*?Waiting on banks/)

  const awaitingApplicationMarkup = ReactDOMServer.renderToStaticMarkup(
    React.createElement(componentModule.default, {
      applicationWorkspace: {
        available: false,
        valid: true,
        originatorAssigned: true,
        application: null,
        originator: {},
        finance: {},
        guarantees: { steps: [] },
      },
      transaction: {
        id: 'transaction-awaiting-application',
        bond_originator: 'BetterBond Demo Desk',
        finance_managed_by: 'bond_originator',
      },
    }),
  )
  assert.ok(awaitingApplicationMarkup.includes('Bond application journey'))
  assert.ok(awaitingApplicationMarkup.includes('Awaiting Application'))
  assert.ok(awaitingApplicationMarkup.includes('has not been created or linked'))

  const transactionDetail = fs.readFileSync(path.join(PROJECT_ROOT, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
  assert.match(transactionDetail, /const bondApplicationWorkspace =/)
  assert.match(transactionDetail, /applicationWorkspace=\{bondApplicationWorkspace\}/)
} finally {
  await server.close()
}

console.log('bond application Finance phase 3 checks passed')
