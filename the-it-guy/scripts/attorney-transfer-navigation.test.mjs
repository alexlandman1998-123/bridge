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
import { normalizeAttorneyWorkflowWorkPacket } from '../src/constants/attorneyWorkflowUsability.js'
import { getAttorneyStageDefinitionsForLane } from '../src/constants/attorneyWorkflowStages.js'
import { projectSharedMatterJourneyRead, sharedJourneyHeaderPhases, sharedJourneyLaneTasks } from '../src/services/sharedMatterJourneyReader.js'
import { buildTransferWorkspaceViewModel, getLegalWorkspacePhases } from '../src/services/attorneyWorkflow/transferWorkspaceViewModel.js'

const phases = [
  { key: 'instruction', label: 'Instruction & File Opening', description: 'Open the matter.', status: 'in_progress', completed: 0, total: 2, percent: 0, hasCurrentTask: true, tasks: [
    { key: 'instruction_received', label: 'Instruction Received', status: 'not_started', displayStatus: 'not_started', statusLabel: 'Not Started' },
    { key: 'matter_opened', label: 'File Opened', status: 'completed', displayStatus: 'completed', statusLabel: 'Completed' },
  ] },
  { key: 'lodgement_registration', label: 'Lodgement & Registration', status: 'not_started', completed: 0, total: 1, percent: 0, tasks: [
    { key: 'lodgement_ready', label: 'Lodgement Ready', status: 'not_started', displayStatus: 'not_started', statusLabel: 'Not Started' },
  ] },
  { key: 'closure', label: 'Post-Registration & Closure', status: 'completed', completed: 1, total: 1, percent: 100, tasks: [
    { key: 'closure_review', label: 'Closure Review', status: 'completed', displayStatus: 'completed', statusLabel: 'Completed' },
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
for (const [laneKey, stepKey, expectedCount] of [
  ['transfer', 'instruction_received', 6],
  ['bond', 'bond_instruction_received', 4],
  ['cancellation', 'cancellation_instruction_received', 4],
]) {
  const laneNavigation = { view: 'workspace', laneKey, stageKey: getLegalWorkspacePhases(laneKey)[0].key, taskKey: stepKey }
  const parsedLane = readTransferWorkspaceNavigation(writeTransferWorkspaceNavigation('', laneNavigation))
  assert.equal(parsedLane.laneKey, laneKey, `${laneKey} deep links preserve the workflow lane`)
  const model = buildTransferWorkspaceViewModel({ workflowKey: laneKey, sharedJourneyTasks: [{ key: stepKey, status: 'not_started' }], workflow: {
    title: laneKey, lane: { laneKey, steps: [{ id: `${laneKey}-step`, stepKey, status: 'not_started' }] },
  } })
  assert.equal(model.phases.length, expectedCount, `${laneKey} displays every defined phase`)
  assert.equal(model.phases[1].status, 'not_applicable', `${laneKey} labels empty phases not applicable`)
  assert.equal(resolveTransferWorkspaceNavigation(parsedLane, model.phases).view, 'workspace', `${laneKey} opens its task workspace`)
}
// A saved task update must move Work and the top journey together, even when
// the lane's older current-stage pointer has not refreshed yet.
for (const laneKey of ['transfer', 'bond', 'cancellation']) {
  const definitions = new Map(getAttorneyStageDefinitionsForLane(laneKey).map(task => [task.key, task]))
  const lanePhases = getLegalWorkspacePhases(laneKey)
  const keys = lanePhases.flatMap(phase => phase.stageKeys).filter(key => definitions.has(key))
  const firstPhaseKeys = lanePhases[0].stageKeys.filter(key => definitions.has(key))
  const outcomes = new Map(keys.map(key => [key, 'not_started']))
  const compare = () => {
    const result = { status: 'ready', snapshot: projectSharedMatterJourneyRead({
      schemaVersion: 1, transactionId: 'local-parity-fixture', revision: 3, planRevision: 3,
      lanes: [{ key: laneKey, phases: lanePhases.map(phase => ({
        key: phase.key, label: phase.label, clientLabel: phase.label,
        tasks: phase.stageKeys.filter(key => definitions.has(key)).map(key => ({
          key, label: definitions.get(key).label, clientLabel: 'Matter update', status: outcomes.get(key), revision: 3,
        })),
      })) }],
    }, { audience: 'attorney' }) }
    const header = sharedJourneyHeaderPhases(result, laneKey)
    const work = buildTransferWorkspaceViewModel({ workflowKey: laneKey,
      workflow: { lane: { laneKey, currentStage: keys[0], steps: [{ stepKey: keys[0], status: 'not_started' }] } },
      sharedJourneyTasks: sharedJourneyLaneTasks(result, laneKey),
    })
    const summary = phase => ({ key: phase.key, completed: phase.completed, total: phase.total,
      notApplicable: phase.notApplicable, status: phase.status,
      current: phase.currentTask?.key || null, hasCurrentTask: phase.hasCurrentTask })
    assert.deepEqual(work.phases.map(summary), header.map(summary), `${laneKey}: header and Work must show identical progress and current task`)
    assert.deepEqual(work.tasks.map(task => [task.key, task.status]),
      result.snapshot.lanes[0].phases.flatMap(phase => phase.tasks.map(task => [task.key, task.status])),
      `${laneKey}: displayed tasks must match the saved journey`)
    return header
  }
  assert.equal(compare()[0].status, 'not_started', 'opening a phase does not start its tasks')
  outcomes.set(keys[0], 'in_progress')
  assert.equal(compare()[0].status, 'in_progress')
  outcomes.set(keys[0], 'completed')
  assert.equal(compare()[0].completed, 1)
  assert.equal(compare()[0].currentTask.key, keys[1], 'completion advances the current task')
  outcomes.set(keys[1], 'waiting'); compare()
  outcomes.set(keys[1], 'blocked'); compare()
  outcomes.set(keys[1], 'not_applicable'); compare()
  firstPhaseKeys.forEach(key => outcomes.set(key, 'completed_externally'))
  const advanced = compare()
  assert.equal(advanced[0].status, 'completed')
  assert.equal(advanced[0].hasCurrentTask, false)
  assert.equal(advanced[1].hasCurrentTask, true, 'finishing the phase advances the top journey')
  outcomes.set(keys[0], 'not_started')
  assert.equal(compare()[0].hasCurrentTask, true, 'reopening work moves the journey back')
  keys.forEach(key => outcomes.set(key, 'completed'))
  assert.ok(compare().every(phase => !phase.hasCurrentTask), 'a finished journey has no pending current task')
}

// Persisted plan tasks can be newer than the local task catalogue. Keep them
// visible in their saved phase rather than silently dropping their progress.
const newerPlanTask = buildTransferWorkspaceViewModel({ sharedJourneyTasks: [
  { key: 'new_authority_review', label: 'Authority review', phaseKey: 'fica_authority', status: 'completed' },
] })
assert.equal(newerPlanTask.tasks.length, 1)
assert.equal(newerPlanTask.tasks[0].label, 'Authority review')
assert.equal(newerPlanTask.tasks[0].phaseKey, 'fica_authority')
assert.equal(newerPlanTask.phases.find(phase => phase.key === 'fica_authority').completed, 1)

assert.equal(resolveTransferWorkspaceNavigation(readTransferWorkspaceNavigation('?transferView=workspace&transferStage=missing&transferTask=missing'), phases).view, 'overview')
assert.equal(resolveTransferWorkspaceNavigation(readTransferWorkspaceNavigation('?transferView=workspace&transferStage=instruction&transferTask=lodgement_ready'), phases).view, 'overview')
assert.equal(getTransferStageEntryTask(phases[0]).key, 'instruction_received')
assert.equal(getTransferStageEntryTask(phases[2]).key, 'closure_review', 'completed stages still open for review')
for (const phase of phases) {
  const entryTask = getTransferStageEntryTask(phase)
  const navigation = readTransferWorkspaceNavigation(writeTransferWorkspaceNavigation('', { view: 'workspace', stageKey: phase.key, taskKey: entryTask.key }))
  assert.equal(resolveTransferWorkspaceNavigation(navigation, phases).view, 'workspace', `${phase.label} opens its task workspace`)
}
assert.equal(getTransferStageEntryTask({ tasks: [{ key: 'done', status: 'completed' }] }).key, 'done')
assert.equal(getTransferStageEntryTask({ tasks: [{ key: 'not_needed', status: 'not_applicable' }] }).key, 'not_needed')
assert.equal(getNextTransferStageTask(phases[0], 'instruction_received').key, 'matter_opened')
assert.equal(getNextTransferStageTask(phases[0], 'matter_opened'), null)
const overridePacket = normalizeAttorneyWorkflowWorkPacket({ laneKey: 'transfer', stageKey: 'instruction_received', completionMethod: 'manual', overrideScope: 'stage', overrideGroupId: 'group-1', overrideReason: 'Historical matter', overrideTaskKeys: ['instruction_received', 'matter_opened'] })
assert.equal(overridePacket.completionMethod, 'manual')
assert.deepEqual(overridePacket.overrideTaskKeys, ['instruction_received', 'matter_opened'])

const server = await createServer({ configFile: false, envFile: false, logLevel: 'silent', esbuild: { jsx: 'automatic' }, server: { middlewareMode: true } })
try {
  const { default: TransferStageOverview } = await server.ssrLoadModule('/src/components/attorney/workflow/TransferStageOverview.jsx')
  const { default: TransferStageTaskNavigation } = await server.ssrLoadModule('/src/components/attorney/workflow/TransferStageTaskNavigation.jsx')
  const { default: LegalTaskWorkbench } = await server.ssrLoadModule('/src/components/attorney/workflow/LegalTaskWorkbench.jsx')
  const html = renderToStaticMarkup(createElement(TransferStageOverview, { phases, selectedPhase: phases[0] }))
  assert.match(html, /Transfer stages/)
  assert.match(html, /Instruction &amp; File Opening/)
  assert.match(html, /Instruction Received/)
  assert.match(html, /Matter workflow/)
  const checklistPhase = { ...phases[0], tasks: phases[0].tasks.map(task => ({ ...task, checklistProgress: { completed: 2, total: 3 } })) }
  const checklistHtml = renderToStaticMarkup(createElement(TransferStageOverview, { phases: [checklistPhase], selectedPhase: checklistPhase }))
  assert.match(checklistHtml, /Task checklist/)
  assert.match(checklistHtml, /2 of 3 items confirmed/)
  assert.match(html, /Complete this stage to proceed/)
  assert.match(html, /Stage progress/)
  assert.doesNotMatch(html, /Open the matter\./, 'stage summaries stay out of the compact header')
  assert.match(html, /aria-label="Open task: Instruction Received"[^>]*class="[^"]*absolute inset-0|class="[^"]*absolute inset-0[^>]*aria-label="Open task: Instruction Received"/, 'the entire task row opens its workspace')
  assert.doesNotMatch(html, /Save answers|Complete task|Yes<\/button>/)
  assert.doesNotMatch(html, /View all tasks|Show fewer tasks|Collapse workflow stages/)
  const newPhase = { ...phases[0], status: 'not_started', tasks: phases[0].tasks.map((task) => ({ ...task, status: 'not_started', displayStatus: 'not_started', statusLabel: 'Not Started' })) }
  assert.match(renderToStaticMarkup(createElement(TransferStageOverview, { phases: [newPhase], selectedPhase: newPhase })), /0 of 2 tasks complete/)
  const partialPhase = { ...phases[0], completed: 1, percent: 50 }
  assert.match(renderToStaticMarkup(createElement(TransferStageOverview, { phases: [partialPhase], selectedPhase: partialPhase })), /1 of 2 tasks complete/)
  const completedPhase = { ...phases[0], status: 'completed', completed: 2, percent: 100, tasks: phases[0].tasks.map((task) => ({ ...task, status: 'completed', displayStatus: 'completed', statusLabel: 'Completed' })) }
  const completedHtml = renderToStaticMarkup(createElement(TransferStageOverview, { phases: [completedPhase], selectedPhase: completedPhase }))
  assert.match(completedHtml, /2 of 2 tasks complete/)
  assert.match(completedHtml, /Stage complete/, 'completed stages remain reviewable')
  assert.match(completedHtml, /View/, 'completed tasks remain reviewable')
  const notApplicablePhase = { ...phases[0], status: 'not_applicable', completed: 0, total: 0, percent: 0, tasks: phases[0].tasks.map((task) => ({ ...task, status: 'not_applicable', displayStatus: 'not_applicable', statusLabel: 'Not applicable' })) }
  const notApplicableHtml = renderToStaticMarkup(createElement(TransferStageOverview, { phases: [notApplicablePhase], selectedPhase: notApplicablePhase }))
  assert.match(notApplicableHtml, /Not applicable/)
  assert.match(notApplicableHtml, /View/, 'not applicable tasks remain reviewable')
  assert.doesNotMatch(notApplicableHtml, /role="progressbar"/, 'zero applicable tasks do not expose a progress range')
  const emptyPhase = { key: 'empty', label: 'No work in this phase', status: 'not_applicable', completed: 0, total: 0, percent: 0, tasks: [] }
  const emptyHtml = renderToStaticMarkup(createElement(TransferStageOverview, { phases: [emptyPhase], selectedPhase: emptyPhase, workflowKey: 'bond', canUpdate: true }))
  assert.match(emptyHtml, /Bond registration stages/)
  assert.match(emptyHtml, /Not applicable/)
  assert.doesNotMatch(emptyHtml, /Stage complete|Select tasks|Override stage/, 'empty phases cannot be marked complete')
  const attentionPhase = { ...phases[0], tasks: [
    { ...phases[0].tasks[0], status: 'blocked', displayStatus: 'blocked', isOverdue: true, missingDocumentCount: 2 },
    phases[0].tasks[1],
  ] }
  const attentionHtml = renderToStaticMarkup(createElement(TransferStageOverview, { phases: [attentionPhase], selectedPhase: attentionPhase }))
  assert.doesNotMatch(attentionHtml, /needs attention/, 'ordinary outstanding work is not shown as a warning')
  const stageTasksHtml = renderToStaticMarkup(createElement(TransferStageTaskNavigation, { phase: phases[0], selectedTaskKey: 'instruction_received' }))
  assert.match(stageTasksHtml, /Choose a task in/)
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
  assert.match(focusedHtml, /Choose a task in/)
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
  browser.window.scrollTo = () => {}
  try {
    const { render, fireEvent, cleanup, waitFor, within } = await import('@testing-library/react')
    const selections = []
    const openings = []
    const view = render(createElement(TransferStageOverview, {
      phases,
      selectedPhase: phases[0],
      onSelectStage: (stageKey) => selections.push(stageKey),
      onOpenStage: (stageKey, taskKey) => openings.push([stageKey, taskKey]),
    }))
    fireEvent.click(view.getByRole('navigation', { name: 'Transfer stages' }).querySelectorAll('button')[0])
    fireEvent.click(view.getByRole('navigation', { name: 'Transfer stages' }).querySelectorAll('button')[1])
    fireEvent.click(view.getByRole('navigation', { name: 'Transfer stages' }).querySelectorAll('button')[2])
    fireEvent.click(view.getByRole('button', { name: 'Open task: Instruction Received' }))
    fireEvent.click(view.getByRole('button', { name: 'Open' }))
    assert.deepEqual(selections, [], 'clicking a stage enters its task workspace')
    assert.deepEqual(openings, [
      ['instruction', 'instruction_received'],
      ['lodgement_registration', 'lodgement_ready'],
      ['closure', 'closure_review'],
      ['instruction', 'instruction_received'],
      ['instruction', 'instruction_received'],
    ])
    cleanup()
    for (const [workflowKey, stageKey, taskKey, navigationName] of [
      ['bond', 'bond_instruction', 'bond_instruction_received', 'Bond registration stages'],
      ['cancellation', 'cancellation_instruction', 'cancellation_instruction_received', 'Cancellation stages'],
    ]) {
      const applicablePhase = { ...phases[0], key: stageKey, tasks: [{ ...phases[0].tasks[0], key: taskKey }] }
      const laneOpenings = []
      const laneSelections = []
      const laneView = render(createElement(TransferStageOverview, {
        workflowKey, phases: [applicablePhase, emptyPhase], selectedPhase: applicablePhase,
        onOpenStage: (...args) => laneOpenings.push(args), onSelectStage: (key) => laneSelections.push(key),
      }))
      const stageButtons = laneView.getByRole('navigation', { name: navigationName }).querySelectorAll('button')
      fireEvent.click(stageButtons[0])
      fireEvent.click(stageButtons[1])
      assert.deepEqual(laneOpenings, [[stageKey, taskKey]], `${workflowKey} stage opens the task workspace`)
      assert.deepEqual(laneSelections, ['empty'], `${workflowKey} empty phase remains reviewable`)
      cleanup()
    }
    const continuation = render(createElement(TransferStageOverview, {
      phases: [completedPhase, emptyPhase, phases[1], phases[2]], selectedPhase: completedPhase,
      onOpenStage: (stageKey, taskKey) => openings.push([stageKey, taskKey]),
    }))
    fireEvent.click(continuation.getByRole('button', { name: /Continue to Lodgement & Registration/ }))
    assert.deepEqual(openings.at(-1), ['lodgement_registration', 'lodgement_ready'], 'continuing opens the next stage workspace')
    cleanup()
    const updates = []
    const controlOpenings = []
    const editable = render(createElement(TransferStageOverview, {
      phases, selectedPhase: phases[0], canUpdate: true,
      onOpenStage: (stageKey, taskKey) => controlOpenings.push([stageKey, taskKey]),
      onUpdateTask: async (...args) => { updates.push(args); return true },
    }))
    fireEvent.click(editable.getByRole('checkbox', { name: 'Select Instruction Received' }))
    fireEvent.click(editable.getByRole('button', { name: 'Options for Instruction Received' }))
    assert.deepEqual(controlOpenings, [], 'task controls do not navigate')
    fireEvent.click(editable.getByRole('button', { name: 'Mark complete' }))
    await waitFor(() => assert.equal(updates.length, 1))
    assert.equal(updates[0][0].key, 'instruction_received')
    assert.equal(updates[0][1], 'completed')
    assert.equal(updates[0][3].completionMethod, 'manual')
    cleanup()
    const bulkPhase = { ...phases[0], tasks: phases[0].tasks.map((task) => ({ ...task, status: 'not_started', displayStatus: 'not_started' })) }
    const bulkUpdates = []
    const bulk = render(createElement(TransferStageOverview, {
      phases: [bulkPhase], selectedPhase: bulkPhase, canUpdate: true,
      onUpdateTask: async (...args) => { bulkUpdates.push(args); return true },
    }))
    fireEvent.click(bulk.getByLabelText('Select tasks'))
    fireEvent.click(bulk.getByRole('button', { name: /Mark selected complete/ }))
    fireEvent.click(bulk.getByRole('button', { name: 'Save & complete' }))
    await waitFor(() => assert.equal(bulkUpdates.length, 2))
    assert.equal(bulkUpdates[0][3].overrideScope, 'bulk')
    assert.equal(bulkUpdates[0][3].overrideGroupId, bulkUpdates[1][3].overrideGroupId)
    cleanup()
    const stageUpdates = []
    const stage = render(createElement(TransferStageOverview, {
      phases: [bulkPhase], selectedPhase: bulkPhase, canUpdate: true,
      onUpdateTask: async (...args) => { stageUpdates.push(args); return true },
    }))
    fireEvent.click(stage.getByRole('button', { name: 'Mark stage complete' }))
    fireEvent.change(stage.getByPlaceholderText('Imported matter already progressed beyond this stage.'), { target: { value: 'Historical file already progressed' } })
    fireEvent.click(within(stage.getByRole('dialog')).getByRole('button', { name: 'Mark stage complete' }))
    await waitFor(() => assert.equal(stageUpdates.length, 2))
    assert.equal(stageUpdates[0][3].overrideScope, 'stage')
    assert.equal(stageUpdates[0][3].overrideReason, 'Historical file already progressed')
    cleanup()
    const taskSelections = []
    const stageTasks = render(createElement(TransferStageTaskNavigation, {
      phase: phases[0], selectedTaskKey: 'instruction_received', onSelectTask: (taskKey) => taskSelections.push(taskKey),
    }))
    fireEvent.click(stageTasks.getByRole('button', { name: /File Opened/ }))
    fireEvent.change(stageTasks.getByRole('combobox'), { target: { value: 'matter_opened' } })
    assert.deepEqual(taskSelections, ['matter_opened', 'matter_opened'])
    cleanup()
  } finally {
    Object.assign(globalThis, previous)
    browser.window.close()
  }
  console.log('Attorney Transfer navigation: deep links, fallback, stage entry and read-only overview passed')
} finally {
  await server.close()
}
