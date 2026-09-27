import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
import {
  getTransferStageEntryTask,
  getNextTransferStageTask,
  readTransferWorkspaceNavigation,
  resolveTransferWorkspaceNavigation,
  writeTransferWorkspaceNavigation,
} from '../src/core/transactions/transferWorkspaceNavigation.js'

const phases = [
  { key: 'instruction', label: 'Instruction & File Opening', description: 'Open the matter.', status: 'in_progress', completed: 0, total: 2, percent: 0, hasCurrentTask: true, tasks: [
    { key: 'instruction_received', label: 'Instruction Received', status: 'not_started', displayStatus: 'not_started', statusLabel: 'Not Started' },
    { key: 'matter_opened', label: 'File Opened', status: 'completed', displayStatus: 'completed', statusLabel: 'Completed' },
  ] },
  { key: 'lodgement_registration', label: 'Lodgement & Registration', status: 'not_started', completed: 0, total: 1, percent: 0, tasks: [
    { key: 'lodgement_ready', label: 'Lodgement Ready', status: 'not_started', displayStatus: 'not_started', statusLabel: 'Not Started' },
  ] },
]

const deepLink = writeTransferWorkspaceNavigation('?source=matter', {
  view: 'workspace', stageKey: 'instruction', taskKey: 'instruction_received',
})
assert.equal(deepLink, '?source=matter&transferView=workspace&transferStage=instruction&transferTask=instruction_received')
const parsed = readTransferWorkspaceNavigation(deepLink)
assert.equal(parsed.active, true)
assert.equal(resolveTransferWorkspaceNavigation(parsed, phases).task.key, 'instruction_received')
assert.equal(writeTransferWorkspaceNavigation(deepLink, { view: 'overview', stageKey: 'instruction' }), '?source=matter&transferView=overview&transferStage=instruction')
assert.equal(writeTransferWorkspaceNavigation(deepLink), '?source=matter')
assert.equal(resolveTransferWorkspaceNavigation(readTransferWorkspaceNavigation('?transferView=workspace&transferStage=missing&transferTask=missing'), phases).view, 'overview')
assert.equal(resolveTransferWorkspaceNavigation(readTransferWorkspaceNavigation('?transferView=workspace&transferStage=instruction&transferTask=lodgement_ready'), phases).view, 'overview')
assert.equal(getTransferStageEntryTask(phases[0]).key, 'instruction_received')
assert.equal(getTransferStageEntryTask({ tasks: [{ key: 'done', status: 'completed' }] }).key, 'done')
assert.equal(getTransferStageEntryTask({ tasks: [{ key: 'not_needed', status: 'not_applicable' }] }).key, 'not_needed')
assert.equal(getNextTransferStageTask(phases[0], 'instruction_received').key, 'matter_opened')
assert.equal(getNextTransferStageTask(phases[0], 'matter_opened'), null)

const server = await createServer({ configFile: false, envFile: false, logLevel: 'silent', esbuild: { jsx: 'automatic' }, server: { middlewareMode: true } })
try {
  const { default: TransferStageOverview } = await server.ssrLoadModule('/src/components/attorney/workflow/TransferStageOverview.jsx')
  const { default: TransferStageTaskNavigation } = await server.ssrLoadModule('/src/components/attorney/workflow/TransferStageTaskNavigation.jsx')
  const { default: LegalTaskWorkbench } = await server.ssrLoadModule('/src/components/attorney/workflow/LegalTaskWorkbench.jsx')
  const html = renderToStaticMarkup(createElement(TransferStageOverview, { phases, selectedPhase: phases[0] }))
  assert.match(html, /Transfer stages/)
  assert.match(html, /Instruction &amp; File Opening/)
  assert.match(html, /Instruction Received/)
  assert.match(html, /Open stage workspace/)
  assert.match(html, /Stage progress/)
  assert.doesNotMatch(html, /Save answers|Complete task|Yes<\/button>/)
  assert.doesNotMatch(html, /View all tasks|Show fewer tasks|Collapse workflow stages/)
  const newPhase = { ...phases[0], status: 'not_started', tasks: phases[0].tasks.map((task) => ({ ...task, status: 'not_started', displayStatus: 'not_started', statusLabel: 'Not Started' })) }
  assert.match(renderToStaticMarkup(createElement(TransferStageOverview, { phases: [newPhase], selectedPhase: newPhase })), /0 of 2 complete/)
  const partialPhase = { ...phases[0], completed: 1, percent: 50 }
  assert.match(renderToStaticMarkup(createElement(TransferStageOverview, { phases: [partialPhase], selectedPhase: partialPhase })), /1 of 2 complete/)
  const completedPhase = { ...phases[0], status: 'completed', completed: 2, percent: 100, tasks: phases[0].tasks.map((task) => ({ ...task, status: 'completed', displayStatus: 'completed', statusLabel: 'Completed' })) }
  const completedHtml = renderToStaticMarkup(createElement(TransferStageOverview, { phases: [completedPhase], selectedPhase: completedPhase }))
  assert.match(completedHtml, /2 of 2 complete/)
  assert.match(completedHtml, /Open stage workspace/, 'completed stages remain reviewable')
  const notApplicablePhase = { ...phases[0], status: 'not_applicable', completed: 0, total: 0, percent: 0, tasks: phases[0].tasks.map((task) => ({ ...task, status: 'not_applicable', displayStatus: 'not_applicable', statusLabel: 'Not applicable' })) }
  const notApplicableHtml = renderToStaticMarkup(createElement(TransferStageOverview, { phases: [notApplicablePhase], selectedPhase: notApplicablePhase }))
  assert.match(notApplicableHtml, /No applicable tasks in this stage/)
  assert.match(notApplicableHtml, /Open stage workspace/, 'not applicable stages remain reviewable')
  assert.doesNotMatch(notApplicableHtml, /role="progressbar"/, 'zero applicable tasks do not expose a meaningless progress range')
  const attentionPhase = { ...phases[0], tasks: [
    { ...phases[0].tasks[0], status: 'blocked', displayStatus: 'blocked', isOverdue: true, missingDocumentCount: 2 },
    phases[0].tasks[1],
  ] }
  const attentionHtml = renderToStaticMarkup(createElement(TransferStageOverview, { phases: [attentionPhase], selectedPhase: attentionPhase }))
  assert.match(attentionHtml, /1 task needs attention/, 'one blocked task with several issues counts once')
  const stageTasksHtml = renderToStaticMarkup(createElement(TransferStageTaskNavigation, { phase: phases[0], selectedTaskKey: 'instruction_received' }))
  assert.match(stageTasksHtml, /Choose the work to review/)
  assert.match(stageTasksHtml, /Instruction Received/)
  assert.doesNotMatch(stageTasksHtml, /Lodgement Ready/)
  const focusedHtml = renderToStaticMarkup(createElement(LegalTaskWorkbench, {
    model: {
      taskKey: 'instruction_received', taskLabel: 'Instruction Received', taskDescription: 'Review the instruction.',
      workflowLabel: 'Transfer Attorney', phaseLabel: phases[0].label, status: 'not_started',
      documents: [], notes: [], activity: [], confirmationRows: [], confirmationRequirements: [],
      outstandingRequirements: [], requirementActions: {}, contextualActions: [], outcomeActions: [],
      followUpActions: [], canMarkInProgress: false, completeAction: null, requirementsSatisfied: true,
    },
    phases: [phases[0]], selectedPhaseKey: 'instruction', selectedTaskKey: 'instruction_received', focusedStage: true,
  }))
  assert.match(focusedHtml, /Choose the work to review/)
  assert.doesNotMatch(focusedHtml, /Collapse workflow stages|Expand workflow stages/)
  const readOnlyHtml = renderToStaticMarkup(createElement(LegalTaskWorkbench, {
    model: {
      taskKey: 'instruction_received', taskLabel: 'Instruction Received', workflowLabel: 'Transfer Attorney',
      phaseLabel: phases[0].label, status: 'not_started', readOnly: true, documents: [], notes: [], activity: [],
      confirmationRows: [], confirmationRequirements: [], outstandingRequirements: [], requirementActions: {},
      contextualActions: [{ id: 'edit', label: 'Edit matter' }], outcomeActions: [{ id: 'blocked', label: 'Mark blocked' }],
      followUpActions: [], canMarkInProgress: true, completeAction: { id: 'complete', label: 'Complete task' },
      canComplete: true, requirementsSatisfied: true,
    },
    phases: [phases[0]], selectedPhaseKey: 'instruction', selectedTaskKey: 'instruction_received', focusedStage: true,
  }))
  assert.match(readOnlyHtml, /Read-only workflow/)
  assert.doesNotMatch(readOnlyHtml, /Complete task|Mark in progress|Mark blocked|Edit matter/, 'read-only review hides write controls even if actions are supplied')
  const browser = new JSDOM('<div id="root"></div>', { url: 'https://test.invalid' })
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement }
  globalThis.window = browser.window
  globalThis.document = browser.window.document
  globalThis.HTMLElement = browser.window.HTMLElement
  try {
    const { render, fireEvent, cleanup } = await import('@testing-library/react')
    const selections = []
    const openings = []
    const view = render(createElement(TransferStageOverview, {
      phases,
      selectedPhase: phases[0],
      onSelectStage: (stageKey) => selections.push(stageKey),
      onOpenStage: (stageKey, taskKey) => openings.push([stageKey, taskKey]),
    }))
    fireEvent.click(view.getByRole('button', { name: /Lodgement & Registration/ }))
    fireEvent.click(view.getByRole('button', { name: /Open stage workspace/ }))
    assert.deepEqual(selections, ['lodgement_registration'])
    assert.deepEqual(openings, [['instruction', 'instruction_received']])
    cleanup()
    const taskSelections = []
    const stageTasks = render(createElement(TransferStageTaskNavigation, {
      phase: phases[0], selectedTaskKey: 'instruction_received', onSelectTask: (taskKey) => taskSelections.push(taskKey),
    }))
    fireEvent.click(stageTasks.getByRole('button', { name: /File Opened/ }))
    assert.deepEqual(taskSelections, ['matter_opened'])
    cleanup()
  } finally {
    Object.assign(globalThis, previous)
    browser.window.close()
  }
  console.log('Attorney Transfer navigation: deep links, fallback, stage selection and read-only overview passed')
} finally {
  await server.close()
}
