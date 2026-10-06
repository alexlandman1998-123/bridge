import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer, transformWithEsbuild } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Link, MemoryRouter } from 'react-router-dom'
import * as icons from 'lucide-react'
import { resolveSectionalTitleIdentity } from '../src/services/portalCanonicalFieldFallbacks.js'
const server = await createServer({ configFile: false, envFile: false, logLevel: 'silent', server: { middlewareMode: true } })
try {
  const { buildTransferWorkspaceViewModel } = await server.ssrLoadModule('/src/services/attorneyWorkflow/transferWorkspaceViewModel.js')
  for (const workflowKey of ['transfer', 'bond', 'cancellation']) {
    for (const financeType of ['cash', 'bond', 'hybrid']) {
      const workflow = { facts: { financeType }, lane: { laneKey: workflowKey, steps: [] } }
      let model = buildTransferWorkspaceViewModel({ workflow, workflowKey })
      assert.equal(model.phases.reduce((n, p) => n + p.completed, 0), 0)
      assert.equal(model.phases.flatMap(p => p.tasks).length, model.tasks.length)
      const first = model.tasks[0]
      workflow.lane.steps = [{ stepKey: first.key, status: 'completed_externally' }]
      model = buildTransferWorkspaceViewModel({ workflow, workflowKey })
      assert.equal(model.phases.reduce((n, p) => n + p.completed, 0), 1)
      workflow.lane.steps[0].status = 'not_applicable'
      model = buildTransferWorkspaceViewModel({ workflow, workflowKey })
      assert.equal(model.phases.reduce((n, p) => n + p.notApplicable, 0), 1)
      assert.equal(model.phases.reduce((n, p) => n + p.total, 0), model.tasks.length - 1)
      workflow.lane.steps[0].status = 'not_started'
      model = buildTransferWorkspaceViewModel({ workflow, workflowKey })
      assert.equal(model.phases.reduce((n, p) => n + p.completed, 0), 0)
    }
  }
  const page = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
  const header = page.slice(page.indexOf('function ArchlineMatterHeader('), page.indexOf('function ArchlineMatterHeader(') + 26000)
  const headerMetrics = header.slice(header.indexOf('const metricRows = ['), header.indexOf('].filter((item) => item.value'))
  assert.ok(header.includes('sharedJourneyHeaderPhases(sharedLegalJourney, workflowKey)'))
  assert.ok(header.includes('onSelectWorkflowPhase?.(stage, workflowKey)'))
  assert.doesNotMatch(headerMetrics, /Transfer Stage|Bond Stage|Cancellation Stage/)
  assert.ok(page.includes('mediaLibrary?.coverImageUrl'))
  assert.ok(page.includes('...(!isPrivateMatter ? [resolveDevelopmentCoverImage(development)] : [])'))
  assert.ok(header.includes('absolute inset-0 z-0 h-full w-full object-cover'))
  assert.ok(page.includes('focusRequest={journeyFocusRequest}'))
  assert.match(page, /<ArchlineMatterHeader[\s\S]*?<MatterOverviewQuickFacts[\s\S]*?onOpenDocuments=\{\(party\) => \{ setActiveDocumentLibraryCategory\(party\); openWorkspaceMenu\('documents'\) \}\}/)
  assert.match(page, /documentSourceStatus=\{documentWorkspaceLoad\.status === 'error' \? 'unavailable' : documentDataHydrated \? 'available' : 'loading'\}/)
  const headerStart = page.indexOf('function ArchlineMatterHeader(')
  const headerEnd = page.indexOf('\nfunction getPartyProfilePath', headerStart)
  const compiledHeader = await transformWithEsbuild(page.slice(headerStart, headerEnd), 'matter-header.jsx', { loader: 'jsx', jsx: 'transform' })
  const iconNames = ['CircleDollarSign', 'Landmark', 'Building2', 'Clock3', 'CalendarDays', 'ChevronRight', 'Link2', 'Phone', 'Mail', 'MoreHorizontal', 'Star']
  const Header = new Function('React', 'Link', 'sharedJourneyHeaderPhases', ...iconNames, `${compiledHeader.code}; return ArchlineMatterHeader`)(React, Link, () => [], ...iconNames.map(name => icons[name]))
  const renderHeader = row => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Header, {
    backPath: '/attorney/matters', reference: 'MAT-2026-002127',
    property: '99 Leith Road', propertyType: 'Sectional Title',
    sectionalTitleIdentity: resolveSectionalTitleIdentity(row), showWorkflowProgress: false,
  })))
  const knownProperty = renderHeader({ transaction: {
    property_unit: { unit_number: '004' }, property_development: { name: 'Junoah Estate' },
  } })
  assert.match(knownProperty, /<h1[^>]*>Junoah Estate · Unit 004<\/h1>/)
  assert.match(knownProperty, />99 Leith Road<\/p>/)
  assert.doesNotMatch(knownProperty, /Complex:|Unit: Not captured/)
  assert.match(renderHeader({}), /Complex: Not captured · Unit: Not captured/)
  console.log('PASS: rendered matter header identifies Junoah Estate · Unit 004, retains the street address and only reports genuinely missing property data.')
  console.log('PASS: Work phase semantics across 9 lane/finance combinations; shared-snapshot header and navigation wiring checked.')
} finally { await server.close() }
