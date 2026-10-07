import assert from 'node:assert/strict'
import { createElement, useState } from 'react'
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
import { buildLegalTaskWorkbenchModel } from '../src/core/transactions/legalTaskWorkbenchModel.js'
import { normalizeAttorneyWorkflowWorkPacket } from '../src/constants/attorneyWorkflowUsability.js'
import { getAttorneyStageDefinitionsForLane, getAttorneyStageDefinition } from '../src/constants/attorneyWorkflowStages.js'
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

for (const phase of phases) for (const task of phase.tasks) task.operationalContract = getAttorneyStageDefinition(task.key, 'transfer')?.operationalContract

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
  const stageModel = buildTransferWorkspaceViewModel({ workflowKey: laneKey,
    sharedJourneyTasks: getAttorneyStageDefinitionsForLane(laneKey).map(task => ({ key: task.key, status: 'not_started' })),
    stageNavigation: { view: 'overview', stageKey: getLegalWorkspacePhases(laneKey)[1].key },
    selectedTaskKey: stepKey,
  })
  const stageTask = getTransferStageEntryTask(stageModel.phases[1])
  assert.equal(stageModel.selectedTask.key, stageTask.key, 'stage entry overrides a cached task from another stage')
  assert.equal(stageModel.currentPhase.key, stageModel.phases[1].key, 'task content follows the selected stage')
  const completedEntry = buildTransferWorkspaceViewModel({ workflowKey: laneKey,
    sharedJourneyTasks: stageModel.tasks.map(task => ({ key: task.key, phaseKey: task.phaseKey, status: task.key === stageTask.key ? 'completed' : 'not_started' })),
    stageNavigation: { view: 'workspace', stageKey: stageModel.phases[1].key, taskKey: stageTask.key },
  })
  assert.equal(completedEntry.selectedTask.key, stageTask.key, 'completion keeps the open task selected for review')
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

for (const search of ['', '?transferView=overview', '?transferView=overview&transferStage=instruction', '?transferView=workspace&transferStage=missing&transferTask=missing', '?transferView=workspace&transferStage=instruction&transferTask=lodgement_ready']) {
  const resolved = resolveTransferWorkspaceNavigation(readTransferWorkspaceNavigation(search), phases)
  assert.equal(resolved.view, 'workspace', 'default, old overview and invalid links open useful task work')
  assert.equal(resolved.task.key, 'instruction_received')
}
assert.equal(resolveTransferWorkspaceNavigation({ view: 'overview', stageKey: 'closure' }, phases).task.key, 'closure_review', 'a completed stage opens for review')
assert.equal(resolveTransferWorkspaceNavigation({ view: 'overview' }, []).view, 'overview', 'a missing workflow has no phantom task')
assert.equal(resolveTransferWorkspaceNavigation({ stageKey: 'empty' }, [{ key: 'empty', tasks: [] }]).task, null, 'an empty stage remains reviewable without a task')
assert.equal(resolveTransferWorkspaceNavigation({ view: 'workspace', stageKey: 'instruction', taskKey: 'matter_opened' }, phases).task.key, 'matter_opened', 'explicit completed task links retain their selection')
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
  const { default: Modal } = await server.ssrLoadModule('/src/components/ui/Modal.jsx')
  const { default: LegacyLegalTaskReview } = await server.ssrLoadModule('/src/components/attorney/workflow/LegacyLegalTaskReview.jsx')
  const rendered = new JSDOM('<div></div>')
  let coveredTasks = 0
  for (const laneKey of ['transfer', 'bond', 'cancellation']) {
    const definitions = getAttorneyStageDefinitionsForLane(laneKey)
    const savedTasks = definitions.map(task => ({ key: task.key, status: 'not_started',
      phaseKey: getLegalWorkspacePhases(laneKey).find(phase => phase.stageKeys.includes(task.key)).key }))
    for (const definition of definitions) {
      const vm = buildTransferWorkspaceViewModel({ workflowKey: laneKey, sharedJourneyTasks: savedTasks, selectedTaskKey: definition.key })
      assert.equal(vm.selectedTask.key, definition.key)
      const model = buildLegalTaskWorkbenchModel({ task: vm.selectedTask, taskContext: vm.selectedTaskContext,
        workActions: vm.selectedTaskContext.workActions, statusActions: vm.availableActions.primary })
      const panel = createElement(LegalTaskWorkbench, { model, phases: vm.phases, focusedStage: true, embedded: true,
        selectedTaskKey: definition.key, selectedPhaseKey: vm.selectedTask.phaseKey, onSaveConfirmations: async () => true })
      const markup = renderToStaticMarkup(createElement(TransferStageOverview, { phases: vm.phases,
        workflowKey: laneKey, selectedPhase: vm.currentPhase, selectedTaskKey: definition.key, taskPanel: panel }))
      const document = rendered.window.document
      document.body.innerHTML = markup
      assert.equal(document.querySelectorAll('.legal-workflow-stage-grid > li').length, laneKey === 'transfer' ? 6 : 4)
      assert.equal(document.querySelector('[aria-label="Task workspace"] h2').textContent, definition.label)
      assert.equal(document.querySelectorAll('.legal-stage-task-row[aria-current="step"]').length, 1)
      assert.doesNotMatch(document.querySelector('[aria-label="Task workspace"]').textContent, /Transfer Coverage|Lane Command Queue|Outcome Checkpoint/)
      coveredTasks++
    }
    for (const definition of definitions) for (const alias of definition.aliases || []) {
      const vm = buildTransferWorkspaceViewModel({ workflowKey: laneKey, sharedJourneyTasks: [
        { key: 'future_saved_work', label: 'Future saved work', status: 'blocked', phaseKey: 'unknown_phase' },
        { key: alias, label: 'Earlier task', status: 'completed_externally', comment: 'Earlier work retained', phaseKey: getLegalWorkspacePhases(laneKey)[0].key },
      ], selectedTaskKey: alias })
      assert.equal(vm.selectedTask.key, alias, 'an exact saved alias takes precedence over a different blocked task')
      assert.equal(vm.selectedTask.comment, 'Earlier work retained')
      assert.equal(vm.selectedTask.status, 'completed_externally')
      assert.equal(vm.selectedTask.operationalContract, null, 'older tasks do not inherit a newer combined completion contract')
      const legacy = renderToStaticMarkup(createElement(LegacyLegalTaskReview, { task: vm.selectedTask, laneKey }))
      assert.match(legacy, /Earlier work retained/)
      assert.doesNotMatch(legacy, /Complete task|Mark complete|Lane Command Queue/)
      assert.equal(vm.phases.find(phase => phase.key === 'other_saved_tasks').tasks[0].key, 'future_saved_work')
    }
  }
  assert.equal(coveredTasks, 89)
  rendered.window.close()
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
  assert.doesNotMatch(notApplicableHtml, /0 \/ 0 complete/, 'all-not-applicable stage cards have no misleading completion count')
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
    onBackToStages: () => {},
  }))
  assert.match(readOnlyHtml, /Read-only workflow/)
  assert.match(readOnlyHtml, /Back to Instruction &amp; File Opening/, 'read-only tasks retain the stage return path')
  assert.doesNotMatch(readOnlyHtml, /Complete task|Mark in progress|Mark blocked|Edit matter/, 'read-only review hides write controls even if actions are supplied')
  const browser = new JSDOM('<div id="root"></div>', { url: 'https://test.invalid' })
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement }
  globalThis.window = browser.window
  globalThis.document = browser.window.document
  globalThis.HTMLElement = browser.window.HTMLElement
  browser.window.scrollTo = () => {}
  try {
    const { render, fireEvent, cleanup, waitFor, within, act } = await import('@testing-library/react')
    for (const laneKey of ['transfer', 'bond', 'cancellation']) {
      const definitions = new Map(getAttorneyStageDefinitionsForLane(laneKey).map(task => [task.key, task]))
      const lanePhases = getLegalWorkspacePhases(laneKey).map(phase => {
        const task = definitions.get(phase.stageKeys.find(key => definitions.has(key)))
        return { ...phase, status: 'not_started', completed: 0, total: 1, percent: 0,
          tasks: [{ key: task.key, label: task.label, status: 'not_started', displayStatus: 'not_started' }] }
      })
      const openedPhase = lanePhases[Math.min(3, lanePhases.length - 1)]
      let allowDiscard = false
      const prompts = []
      const saved = []
      browser.window.confirm = message => { prompts.push(message); return allowDiscard }
      function WorkflowNavigationHarness() {
        const [navigation, setNavigation] = useState({ active: true, laneKey, view: 'overview', stageKey: openedPhase.key })
        const [dirty, setDirty] = useState(false)
        const resolved = resolveTransferWorkspaceNavigation(navigation, lanePhases)
        function navigate(next) {
          if (dirty && !window.confirm('You have unsaved answers. Leave this task and discard them?')) return false
          setDirty(false)
          setNavigation(readTransferWorkspaceNavigation(writeTransferWorkspaceNavigation('', { ...next, laneKey })))
          return true
        }
        return createElement(TransferStageOverview, {
          phases: lanePhases, workflowKey: laneKey, selectedPhase: resolved.phase,
          selectedTaskKey: resolved.task.key,
          onSelectStage: stageKey => navigate({ view: 'overview', stageKey }),
          onOpenStage: (stageKey, taskKey) => navigate({ view: 'workspace', stageKey, taskKey }),
          taskPanel: createElement(LegalTaskWorkbench, {
            model: { taskKey: resolved.task.key, taskLabel: resolved.task.label, workflowLabel: laneKey,
              phaseLabel: resolved.phase.label, status: 'not_started', readOnly: false, documents: [], notes: [], activity: [],
              confirmationRows: [{ id: 'reviewed', label: 'Evidence reviewed' }], confirmationRequirements: [],
              outstandingRequirements: [], requirementActions: {}, contextualActions: [], outcomeActions: [], followUpActions: [] },
            phases: lanePhases, selectedPhaseKey: resolved.phase.key, selectedTaskKey: resolved.task.key, focusedStage: true, embedded: true,
            onConfirmationDirtyChange: (_taskKey, isDirty) => setDirty(isDirty),
            onSaveConfirmations: async answers => { saved.push(answers); return true },
          }),
        })
      }
      const hierarchy = render(createElement(WorkflowNavigationHarness))
      assert.ok(hierarchy.getByRole('region', { name: 'Task workspace' }), 'opening a stage opens its first task immediately')
      assert.ok(hierarchy.getByRole('heading', { name: openedPhase.tasks[0].label }))
      assert.equal(hierarchy.queryByRole('button', { name: /Back to/ }), null, 'the permanent workspace has no redundant return button')
      const previousPhase = lanePhases[lanePhases.indexOf(openedPhase) - 1]
      const previousStageButton = () => within(hierarchy.getByRole('navigation', { name: /stages$/ })).getByRole('button', { name: new RegExp(previousPhase.label.replace(/[&]/g, '.')) })
      fireEvent.click(hierarchy.getByRole('button', { name: 'Yes' }))
      fireEvent.click(previousStageButton())
      assert.equal(prompts.length, 1)
      assert.equal(hierarchy.getByRole('button', { name: 'Yes' }).getAttribute('aria-pressed'), 'true', 'cancel preserves the draft and task')
      fireEvent.click(hierarchy.getByRole('button', { name: 'Save answers' }))
      await waitFor(() => assert.ok(hierarchy.getByText('Answers saved')))
      assert.equal(saved[0].reviewed.answer, 'yes')
      fireEvent.click(previousStageButton())
      assert.ok(hierarchy.getByRole('heading', { name: previousPhase.tasks[0].label }), 'switching stages opens task details directly')
      assert.equal(prompts.length, 1, 'saved answers switch stages without another warning')
      fireEvent.click(hierarchy.getByRole('button', { name: 'No' }))
      allowDiscard = true
      fireEvent.click(within(hierarchy.getByRole('navigation', { name: /stages$/ })).getByRole('button', { name: new RegExp(openedPhase.label.replace(/[&]/g, '.')) }))
      assert.ok(hierarchy.getByRole('heading', { name: openedPhase.tasks[0].label }), 'confirmed discard opens the chosen stage task')
      cleanup()
    }
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
    assert.deepEqual(selections, ['instruction', 'lodgement_registration', 'closure'], 'clicking a stage opens its item list, including completed stages')
    assert.deepEqual(openings, [
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
      assert.deepEqual(laneOpenings, [], `${workflowKey} stage selection does not skip its item list`)
      assert.deepEqual(laneSelections, [stageKey, 'empty'], `${workflowKey} applicable and empty stages remain reviewable`)
      cleanup()
    }
    const continuationSelections = []
    const continuation = render(createElement(TransferStageOverview, {
      phases: [completedPhase, emptyPhase, phases[1], phases[2]], selectedPhase: completedPhase,
      onOpenStage: (stageKey, taskKey) => openings.push([stageKey, taskKey]),
      onSelectStage: stageKey => continuationSelections.push(stageKey),
    }))
    fireEvent.click(continuation.getByRole('button', { name: /Continue to Lodgement & Registration/ }))
    assert.deepEqual(continuationSelections, ['lodgement_registration'], 'continuing opens the next stage item list')
    cleanup()
    // The same shell stays mounted when opening, switching and closing work.
    for (const laneKey of ['transfer', 'bond', 'cancellation']) {
      let allowDiscard = false
      const prompts = [], scrollReturns = [], saves = []
      browser.window.confirm = message => { prompts.push(message); return allowDiscard }
      browser.window.scrollTo = position => scrollReturns.push(position)
      Object.defineProperty(browser.window, 'scrollY', { configurable: true, value: 84 })
      let refreshMatterNumber, failNumberSave = true
      function SharedPanelHarness() {
        const [navigation, setNavigation] = useState({ active: true, laneKey, view: 'overview', stageKey: getLegalWorkspacePhases(laneKey)[0].key })
        const [dirty, setDirty] = useState(false)
        const [answers, setAnswers] = useState({})
        const [matterNumber, setMatterNumber] = useState('')
        refreshMatterNumber = () => setMatterNumber('Background update')
        const definitions = getAttorneyStageDefinitionsForLane(laneKey)
        const sharedTasks = definitions.map(task => ({ key: task.key, status: 'not_started',
          phaseKey: getLegalWorkspacePhases(laneKey).find(phase => phase.stageKeys.includes(task.key)).key }))
        const vm = buildTransferWorkspaceViewModel({ workflowKey: laneKey, sharedJourneyTasks: sharedTasks,
          stageNavigation: navigation, selectedTaskKey: navigation.taskKey, workflow: { lane: { laneKey, permissions: { canUpdateStage: true },
            steps: sharedTasks.map(task => ({ stepKey: task.key, status: task.status, taskConfirmations: answers[task.key] })) } } })
        const resolved = resolveTransferWorkspaceNavigation(navigation, vm.phases)
        function navigate(next) {
          if (dirty && !window.confirm('Discard unsaved task changes?')) return false
          setDirty(false)
          setNavigation(readTransferWorkspaceNavigation(writeTransferWorkspaceNavigation('', { ...next, laneKey })))
          return true
        }
        const model = buildLegalTaskWorkbenchModel({ task: vm.selectedTask, taskContext: vm.selectedTaskContext,
          workActions: vm.selectedTaskContext.workActions, statusActions: vm.availableActions.primary })
        model.matterNumber = matterNumber
        model.confirmations = answers[vm.selectedTask.key] || {}
        const panel = resolved.view === 'workspace' ? createElement(LegalTaskWorkbench, {
          model, taskMeta: vm.selectedTask, phases: vm.phases, selectedPhaseKey: resolved.phase.key,
          selectedTaskKey: resolved.task.key, focusedStage: true, embedded: true,
          onTaskDirtyChange: (_key, value) => setDirty(value),
          onSelectTask: taskKey => navigate({ view: 'workspace', stageKey: vm.tasks.find(task => task.key === taskKey).phaseKey, taskKey }),
          onSaveConfirmations: async value => { saves.push(value); setAnswers(previous => ({ ...previous, [resolved.task.key]: value })); return true },
          onSaveMatterNumber: async value => { if (failNumberSave) throw new Error('Number save failed'); setMatterNumber(value) },
        }) : null
        return createElement(TransferStageOverview, { phases: vm.phases, workflowKey: laneKey,
          selectedPhase: resolved.phase, selectedTaskKey: resolved.task?.key, taskPanel: panel,
          canUpdate: !dirty, onOpenStage: (stageKey, taskKey) => navigate({ view: 'workspace', stageKey, taskKey }),
          onSelectStage: stageKey => navigate({ view: 'overview', stageKey }),
          })
      }
      const shared = render(createElement(SharedPanelHarness))
      const first = getAttorneyStageDefinitionsForLane(laneKey)[0]
      const panel = shared.getByRole('region', { name: 'Task workspace' })
      assert.ok(document.activeElement === panel, 'opening a task places keyboard focus in its panel')
      assert.ok(shared.getByRole('navigation', { name: /stages$/ }), 'stages stay in the shared shell')
      assert.ok(shared.getByRole('button', { name: `Open task: ${first.label}` }), 'task list stays mounted beside the panel')
      assert.ok(!shared.queryByRole('navigation', { name: /tasks$/ }), 'embedded work does not repeat the task navigator')
      assert.equal(shared.queryByRole('button', { name: 'Close task panel' }), null)
      fireEvent.click(within(panel).getByRole('button', { name: 'Task options' }))
      fireEvent.keyDown(within(panel).getByRole('button', { name: 'Task options' }), { key: 'Escape' })
      assert.equal(within(panel).getByRole('button', { name: 'Task options' }).getAttribute('aria-expanded'), 'false', 'Escape dismisses task options')
      assert.ok(document.activeElement === within(panel).getByRole('button', { name: 'Task options' }))
      const second = shared.getByRole('combobox').options[1].value
      fireEvent.click(within(panel).getAllByRole('button', { name: 'Yes' })[0])
      fireEvent.change(shared.getByRole('combobox'), { target: { value: second } })
      assert.equal(prompts.length, 1)
      assert.equal(within(shared.getByRole('region', { name: 'Task workspace' })).getAllByRole('button', { name: 'Yes' })[0].getAttribute('aria-pressed'), 'true', 'cancelled task switch preserves the answer')
      assert.equal(shared.getByRole('combobox').value, first.key, 'cancelled mobile selection returns to the current task')
      await act(async () => fireEvent.click(within(panel).getByRole('button', { name: 'Save answers' })))
      await waitFor(() => assert.equal(saves.length, 1))
      await waitFor(() => assert.ok(shared.getByText('Answers saved')))
      fireEvent.change(shared.getByRole('combobox'), { target: { value: second } })
      assert.equal(shared.getByRole('combobox').value, second, 'mobile switches tasks directly after saving')
      assert.ok(shared.getByRole('region', { name: 'Task workspace' }), 'switching tasks keeps the workspace open')
      assert.equal(prompts.length, 1, 'saved answers do not prompt again')
      if (laneKey === 'transfer') {
        fireEvent.change(shared.getByPlaceholderText('Enter the firm matter number'), { target: { value: 'MAT-DRAFT' } })
        fireEvent.click(shared.getByRole('button', { name: `Open task: ${first.label}` }))
        assert.equal(shared.getByPlaceholderText('Enter the firm matter number').value, 'MAT-DRAFT', 'cancelled navigation preserves an inline field')
        fireEvent.click(shared.getByRole('button', { name: 'Save matter number' }))
        await waitFor(() => assert.ok(shared.getByRole('alert').textContent.includes('Number save failed')))
        assert.equal(shared.getByPlaceholderText('Enter the firm matter number').value, 'MAT-DRAFT', 'failed save keeps the field draft')
        await act(async () => refreshMatterNumber())
        assert.equal(shared.getByPlaceholderText('Enter the firm matter number').value, 'MAT-DRAFT', 'background refresh does not overwrite unsaved fields')
        failNumberSave = false
        await act(async () => fireEvent.click(shared.getByRole('button', { name: 'Save matter number' })))
        await waitFor(() => assert.ok(!shared.getByRole('button', { name: 'Save matter number' }).disabled))
        fireEvent.click(shared.getByRole('button', { name: `Open task: ${first.label}` }))
        assert.equal(shared.getByRole('combobox').value, first.key)
      }
      cleanup()
    }

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
      selectedTaskKey: bulkPhase.tasks[0].key, taskPanel: createElement('div', null, 'Focused task'),
      onUpdateTask: async (...args) => { bulkUpdates.push(args); return true },
    }))
    assert.ok(bulk.getByRole('button', { name: 'Mark stage complete' }), 'stage actions stay available alongside the open task')
    fireEvent.click(bulk.getByRole('button', { name: 'Stage options' }))
    fireEvent.click(bulk.getByRole('button', { name: 'Complete selected tasks' }))
    assert.ok(bulk.getByRole('button', { name: 'Review completion' }).disabled, 'bulk completion requires an explicit selection')
    fireEvent.click(bulk.getByLabelText('Select all available tasks'))
    fireEvent.click(bulk.getByRole('button', { name: 'Review completion' }))
    assert.equal(bulkUpdates.length, 0, 'selecting tasks does not save before the completion confirmation')
    fireEvent.click(bulk.getByRole('button', { name: 'Save & complete' }))
    await waitFor(() => assert.equal(bulkUpdates.length, 2))
    assert.equal(bulkUpdates[0][3].overrideScope, 'bulk')
    assert.equal(bulkUpdates[0][3].overrideGroupId, bulkUpdates[1][3].overrideGroupId)
    cleanup()
    const stageUpdates = []
    const stage = render(createElement(TransferStageOverview, {
      phases: [bulkPhase], selectedPhase: bulkPhase, canUpdate: true,
      selectedTaskKey: bulkPhase.tasks[0].key, taskPanel: createElement('div', null, 'Focused task'),
      onUpdateTask: async (...args) => { stageUpdates.push(args); return true },
    }))
    fireEvent.click(stage.getByRole('button', { name: 'Mark stage complete' }))
    fireEvent.change(stage.getByPlaceholderText('Imported matter already progressed beyond this stage.'), { target: { value: 'Historical file already progressed' } })
    fireEvent.click(within(stage.getByRole('dialog')).getByRole('button', { name: 'Mark stage complete' }))
    await waitFor(() => assert.equal(stageUpdates.length, 2))
    assert.equal(stageUpdates[0][3].overrideScope, 'stage')
    assert.equal(stageUpdates[0][3].overrideReason, 'Historical file already progressed')
    cleanup()
    // A failed batch keeps its draft and acknowledged receipts in every lane.
    for (const laneKey of ['transfer', 'bond', 'cancellation']) {
      const taskDefinitions = getAttorneyStageDefinitionsForLane(laneKey).slice(0, 2)
      const retryPhase = { ...bulkPhase, tasks: taskDefinitions.map(task => ({ ...task, status: 'not_started' })) }
      const attempts = [], busyStates = [], dirtyStates = []
      let fail = true, finishFirst
      const props = { phases: [retryPhase], selectedPhase: retryPhase, workflowKey: laneKey, canUpdate: true,
        onBusyChange: value => busyStates.push(value), onDirtyChange: value => dirtyStates.push(value),
        onUpdateTask: async (...args) => {
          attempts.push(args)
          if (attempts.length === 1) await new Promise(resolve => { finishFirst = resolve })
          return !(fail && args[0].key === taskDefinitions[1].key)
        } }
      const retry = render(createElement(TransferStageOverview, props))
      fireEvent.click(retry.getByRole('button', { name: 'Mark stage complete' }))
      const note = retry.getByPlaceholderText('Imported matter already progressed beyond this stage.')
      fireEvent.change(note, { target: { value: 'Already signed in the original file' } })
      assert.equal(dirtyStates.at(-1), true, 'stage reasons join the host draft guard')
      const refreshDraft = new browser.window.Event('beforeunload', { cancelable: true })
      browser.window.dispatchEvent(refreshDraft)
      assert.equal(refreshDraft.defaultPrevented, true, 'refresh warns about an unsaved stage reason')
      fireEvent.click(within(retry.getByRole('dialog')).getByRole('button', { name: 'Mark stage complete' }))
      assert.equal(busyStates.at(-1), true, 'the whole batch joins the host save guard')
      assert.ok(within(retry.getByRole('navigation')).getAllByRole('button').every(button => button.disabled))
      assert.ok(note.disabled, 'the reason cannot change during the batch')
      fireEvent.keyDown(note, { key: 'Escape' })
      assert.ok(retry.queryByRole('dialog'), 'Escape cannot dismiss a pending save')
      await act(async () => finishFirst())
      await waitFor(() => assert.match(retry.getByRole('alert').textContent, /1 of 2 tasks saved/))
      assert.equal(note.value, 'Already signed in the original file')
      assert.equal(busyStates.at(-1), false)
      fail = false
      fireEvent.click(within(retry.getByRole('dialog')).getByRole('button', { name: 'Mark stage complete' }))
      await waitFor(() => assert.ok(!retry.queryByRole('dialog')))
      assert.deepEqual(attempts.map(args => args[0].key), [taskDefinitions[0].key, taskDefinitions[1].key, taskDefinitions[1].key], 'retry does not repeat a task already acknowledged')
      assert.equal(new Set(attempts.map(args => args[3].overrideGroupId)).size, 1, 'retry keeps the same audit group')
      assert.ok(attempts.every(args => args[3].overrideReason === 'Already signed in the original file'))
      assert.equal(dirtyStates.at(-1), false)
      const refreshSaved = new browser.window.Event('beforeunload', { cancelable: true })
      browser.window.dispatchEvent(refreshSaved)
      assert.equal(refreshSaved.defaultPrevented, false, 'successful save removes the stage refresh guard')
      cleanup()
    }

    const permissionAttempts = []
    let finishAllowedTask
    const permissionProps = { phases: [bulkPhase], selectedPhase: bulkPhase, canUpdate: true,
      onUpdateTask: async task => { permissionAttempts.push(task.key); await new Promise(resolve => { finishAllowedTask = resolve }); return true } }
    const permissionChange = render(createElement(TransferStageOverview, permissionProps))
    fireEvent.click(permissionChange.getByRole('button', { name: 'Mark stage complete' }))
    fireEvent.change(permissionChange.getByRole('textbox'), { target: { value: 'Keep this reason' } })
    fireEvent.click(within(permissionChange.getByRole('dialog')).getByRole('button', { name: 'Mark stage complete' }))
    permissionChange.rerender(createElement(TransferStageOverview, { ...permissionProps, canUpdate: false }))
    await act(async () => finishAllowedTask())
    await waitFor(() => assert.match(permissionChange.getByRole('alert').textContent, /access or selected stage changed/))
    assert.equal(permissionAttempts.length, 1, 'revoked access stops the remaining batch writes')
    assert.equal(permissionChange.getByRole('textbox').value, 'Keep this reason')
    assert.ok(within(permissionChange.getByRole('dialog')).getByRole('button', { name: 'Mark stage complete' }).disabled)
    assert.match(permissionChange.getByRole('status').textContent, /read-only/)
    cleanup()

    const gateUpdates = []
    const gateProps = { phases: [bulkPhase], selectedPhase: bulkPhase, canUpdate: true,
      onUpdateTask: async task => { gateUpdates.push(task.key); return true } }
    const gateChange = render(createElement(TransferStageOverview, gateProps))
    fireEvent.click(gateChange.getByRole('button', { name: 'Mark stage complete' }))
    const blockedPhase = { ...bulkPhase, tasks: bulkPhase.tasks.map(task => ({ ...task, lodgementReview: { ready: false } })) }
    gateChange.rerender(createElement(TransferStageOverview, { ...gateProps, phases: [blockedPhase], selectedPhase: blockedPhase }))
    fireEvent.click(within(gateChange.getByRole('dialog')).getByRole('button', { name: 'Mark stage complete' }))
    await waitFor(() => assert.match(gateChange.getByRole('alert').textContent, /required legal check/))
    assert.deepEqual(gateUpdates, [], 'a refreshed hard gate cannot be bypassed by a previously opened confirmation')
    cleanup()

    let panelClosed = 0, modalClosed = 0
    const escapeProps = { phases: [bulkPhase], selectedPhase: bulkPhase, selectedTaskKey: bulkPhase.tasks[0].key,
      taskPanel: createElement(Modal, { open: true, title: 'Task document', onClose: () => { modalClosed++ } }, createElement('input', { 'aria-label': 'Document detail' })),
      onCloseTask: () => { panelClosed++ } }
    const nestedEscape = render(createElement(TransferStageOverview, escapeProps))
    fireEvent.keyDown(nestedEscape.getByRole('textbox', { name: 'Document detail' }), { key: 'Escape' })
    assert.equal(modalClosed, 1)
    assert.equal(panelClosed, 0, 'a document modal consumes Escape without closing its task')
    nestedEscape.rerender(createElement(TransferStageOverview, { ...escapeProps, navigationBusy: true, taskPanel: createElement('input', { 'aria-label': 'Task draft' }) }))
    fireEvent.keyDown(nestedEscape.getByRole('textbox', { name: 'Task draft' }), { key: 'Escape' })
    assert.equal(panelClosed, 0, 'a saving task cannot be closed using Escape')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    assert.equal(panelClosed, 0, 'the page-body Escape fallback also respects pending saves')
    nestedEscape.rerender(createElement(TransferStageOverview, { ...escapeProps, taskPanel: createElement('input', { 'aria-label': 'Task draft' }) }))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    assert.equal(panelClosed, 1, 'Escape still returns when a just-saved disabled button releases focus to the body')
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
  console.log('Attorney workflow navigation: stage/item/task return, three lanes, guarded drafts, Escape/focus, partial-save recovery, live access checks and read-only review passed')
} finally {
  await server.close()
}
