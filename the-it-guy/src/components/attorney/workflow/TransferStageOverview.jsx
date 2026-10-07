import './attorney-stage-workspace.css'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, MoreVertical, X } from 'lucide-react'
import Button from '../../ui/Button.jsx'
import Modal from '../../ui/Modal.jsx'
import { getTransferStageEntryTask } from '../../../core/transactions/transferWorkspaceNavigation.js'
import { isAttorneyTaskCompleted, isAttorneyTaskResolved } from '../../../core/transactions/attorneyTaskOutcomes.js'
import { isAttorneyAttestedMilestone, requiresAttorneyEvidenceDecision } from '../../../core/transactions/attorneyTaskOperationalContract.js'

const hardBlocked = (task) => task.taxLodgementReadiness?.ready === false || task.lodgementReview?.ready === false || task.closureReview?.ready === false
const dateLabel = (value) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}
const stageTasksLeft = (phase) => phase.tasks.filter((task) => !isAttorneyTaskResolved(task.status)).length

export default function TransferStageOverview({ phases = [], selectedPhase = null, workflowKey = 'transfer', onSelectStage, onOpenStage, onUpdateTask, onSaveMatterNumber, canUpdate = false, selectedTaskKey = '', taskPanel = null, onCloseTask, navigationBusy = false, writesPaused = false, onBusyChange, onDirtyChange }) {
  const [selectedKeys, setSelectedKeys] = useState([])
  const [dialog, setDialog] = useState(null)
  const [reason, setReason] = useState('')
  const [matterNumber, setMatterNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [menuKey, setMenuKey] = useState('')
  const panelOpen = Boolean(taskPanel)
  const pendingRef = useRef(false)
  const menuTriggerRef = useRef(null)
  const liveRef = useRef(null)
  liveRef.current = { canUpdate, selectedPhase, workflowKey, onBusyChange, onDirtyChange }
  const locked = navigationBusy || busy
  const writeLocked = locked || writesPaused || !canUpdate
  const contextKey = `${workflowKey}:${selectedPhase?.key || ''}`
  useEffect(() => {
    setSelectedKeys([])
    setDialog(null)
    setReason('')
    setMatterNumber('')
    setError('')
    setMenuKey('')
  }, [contextKey])
  useEffect(() => {
    onDirtyChange?.(Boolean(dialog && (reason.trim() || matterNumber.trim() || dialog.savedKeys?.length || (dialog.kind === 'selection' && selectedKeys.length))))
  }, [dialog, reason, matterNumber, selectedKeys, onDirtyChange])
  const stageDraftDirty = Boolean(dialog && (reason.trim() || matterNumber.trim() || dialog.savedKeys?.length || (dialog.kind === 'selection' && selectedKeys.length)))
  useEffect(() => {
    if (!stageDraftDirty && !busy) return undefined
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [stageDraftDirty, busy])
  useEffect(() => () => {
    liveRef.current.onDirtyChange?.(false)
    liveRef.current.onBusyChange?.(false)
  }, [])

  // A saved button can become disabled and leave browser focus on the page body.
  useEffect(() => {
    if (!panelOpen || locked || !onCloseTask) return undefined
    const returnFromPage = event => {
      if (event.key !== 'Escape' || event.defaultPrevented ||
        (event.target !== document.body && event.target !== document.documentElement) ||
        document.querySelector('[role="dialog"][aria-modal="true"]')) return
      event.preventDefault()
      onCloseTask?.()
    }
    document.addEventListener('keydown', returnFromPage)
    return () => document.removeEventListener('keydown', returnFromPage)
  }, [panelOpen, locked, onCloseTask])

  function handleEscape(event) {
    if (event.key !== 'Escape' || event.defaultPrevented || event.target.closest?.('[role="dialog"]')) return
    if (menuKey) {
      event.preventDefault()
      setMenuKey('')
      menuTriggerRef.current?.focus()
    } else if (panelOpen && !locked && onCloseTask) {
      event.preventDefault()
      onCloseTask?.()
    }
  }
  const panelRef = useRef(null)
  const taskButtonsRef = useRef(new Map())
  const previousPanelRef = useRef(false)
  const returnTaskRef = useRef('')
  const returnScrollRef = useRef(0)
  useEffect(() => {
    if (panelOpen) {
      returnTaskRef.current = selectedTaskKey
      panelRef.current?.focus({ preventScroll: true })
      if (window.matchMedia?.('(max-width: 1279px)').matches) panelRef.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
    } else if (previousPanelRef.current) {
      taskButtonsRef.current.get(returnTaskRef.current)?.focus({ preventScroll: true })
      window.scrollTo({ top: returnScrollRef.current, behavior: 'instant' })
    }
    previousPanelRef.current = panelOpen
  }, [panelOpen, selectedTaskKey])

  function openTask(stageKey, taskKey) {
    const scrollTop = typeof window !== 'undefined' ? window.scrollY : 0
    const accepted = onOpenStage?.(stageKey, taskKey)
    if (accepted === false) return false
    if (!panelOpen) returnScrollRef.current = scrollTop
    returnTaskRef.current = taskKey
    return accepted
  }
  if (!selectedPhase) return <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600" role="status">No workflow stages are available for this matter yet.</section>

  const stageIndex = phases.findIndex((phase) => phase.key === selectedPhase.key)
  const nextPhase = phases.slice(stageIndex + 1).find((phase) => phase.tasks.length > 0) || null
  const outstanding = selectedPhase.tasks.filter((task) => !isAttorneyTaskResolved(task.status))
  const selectable = outstanding.filter((task) => task.operationalContract && !hardBlocked(task))
  const selected = selectable.filter((task) => selectedKeys.includes(task.key))
  const stageComplete = selectedPhase.total > 0 && outstanding.length === 0
  const stageBlocked = outstanding.some((task) => !task.operationalContract || hardBlocked(task))
  const allSelected = selectable.length > 0 && selected.length === selectable.length
  const dialogTasksLeft = dialog?.tasks.filter(task => !dialog.savedKeys.includes(task.key)).length || 0
  const needsMatterNumber = dialog?.kind === 'task' && dialog.status === 'completed' && dialog.tasks[0]?.key === 'matter_opened' &&
    dialog.tasks[0]?.dataRequirements?.some((requirement) => requirement.required !== false && !requirement.complete && /matter number/i.test(requirement.label || requirement.id || ''))

  function openDialog(kind, tasks, status = 'completed') {
    if (writeLocked) return
    if (kind === 'selection') setSelectedKeys([])
    setDialog({ kind, tasks, status, contextKey, groupId: globalThis.crypto?.randomUUID?.() || String(Date.now()), savedKeys: [], originalKeys: tasks.map(task => task.key) })
    setReason('')
    setMatterNumber('')
    setError('')
    setMenuKey('')
  }

  async function saveTasks(tasks, status, kind, explanation = '') {
    if (!tasks.length || !onUpdateTask || writeLocked || pendingRef.current) return
    const operation = dialog || { kind, tasks, status, contextKey,
      groupId: globalThis.crypto?.randomUUID?.() || String(Date.now()), savedKeys: [], originalKeys: tasks.map(task => task.key) }
    const savedKeys = [...operation.savedKeys]
    const remaining = tasks.filter(task => !savedKeys.includes(task.key))
    pendingRef.current = true
    setBusy(true)
    liveRef.current.onBusyChange?.(true)
    setError('')
    function currentTask(task) {
      const live = liveRef.current
      if (!live.canUpdate || `${live.workflowKey}:${live.selectedPhase?.key || ''}` !== operation.contextKey) {
        throw new Error('Your access or selected stage changed. Review the current matter before saving.')
      }
      const current = live.selectedPhase.tasks.find(item => item.key === task.key)
      if (!current?.operationalContract || (status === 'completed' && hardBlocked(current))) {
        throw new Error('A required legal check must be completed in the task workspace before this task can be updated.')
      }
      if (status === 'not_applicable' && !current.operationalContract.allowedActions?.some(action => action.status === status)) {
        throw new Error('This task cannot be marked not applicable.')
      }
      return current
    }
    try {
      remaining.forEach(currentTask)
      if (needsMatterNumber && remaining[0]?.key === 'matter_opened') {
        if (!matterNumber.trim() || !onSaveMatterNumber) throw new Error('Enter a matter number before completing this task.')
        await onSaveMatterNumber(matterNumber.trim())
      }
      for (const task of remaining) {
        const current = currentTask(task)
        const note = [
          kind === 'stage' ? 'Manual stage override.' : kind === 'bulk' ? 'Manual bulk task completion.' : 'Manual task status update.',
          explanation.trim() ? `Reason: ${explanation.trim()}` : '',
          current.completionReadiness?.canComplete === false && status === 'completed' ? 'Outstanding requirements reviewed during manual completion.' : '',
        ].filter(Boolean).join('\n')
        const saved = await onUpdateTask(current, status, note, {
          commandType: 'manual_workflow_override',
          completionMethod: status === 'completed' ? 'manual' : '',
          overrideScope: kind,
          overrideGroupId: operation.groupId,
          overrideReason: explanation.trim(),
          overrideTaskKeys: operation.originalKeys,
        })
        if (saved !== true) throw new Error(`${current.label} could not be updated. Retry when the matter is available.`)
        savedKeys.push(task.key)
      }
      setSelectedKeys(current => current.filter(key => !operation.originalKeys.includes(key)))
      setDialog(null)
    } catch (saveError) {
      setDialog({ ...operation, savedKeys })
      setError(`${savedKeys.length ? `${savedKeys.length} of ${operation.originalKeys.length} tasks saved. Retry saves only the remaining tasks. ` : ''}${saveError?.message || 'The task could not be updated.'}`)
    } finally {
      pendingRef.current = false
      setBusy(false)
      liveRef.current.onBusyChange?.(false)
    }
  }

  function quickComplete(task) {
    if (writeLocked) return
    if (hardBlocked(task)) return onOpenStage?.(selectedPhase.key, task.key)
    const needsReason = task.completionReadiness?.canComplete === false ||
      isAttorneyAttestedMilestone(workflowKey, task.key) || requiresAttorneyEvidenceDecision(workflowKey, task.key)
    if (needsReason) openDialog('task', [task])
    else void saveTasks([task], 'completed', 'task')
  }

  return <section className="grid min-w-0 grid-cols-1 items-start gap-4" aria-label={`${workflowKey} stage overview`} onKeyDown={handleEscape}>
    <nav className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_8px_26px_rgba(15,23,42,0.035)]" aria-label={`${workflowKey === 'transfer' ? 'Transfer' : workflowKey === 'bond' ? 'Bond registration' : 'Cancellation'} stages`}>
      <div className="px-3 pb-3 pt-1"><h2 className="text-xs font-bold uppercase tracking-[0.1em] text-emerald-800">Matter workflow</h2><p className="mt-1 text-xs text-slate-500">{phases.length} stages to completion</p></div>
      <ol className={`legal-workflow-stage-grid ${panelOpen ? 'is-task-open' : ''}`} style={{ '--legal-workflow-stage-count': phases.length || 1 }}>{phases.map((phase, index) => {
        const active = phase.key === selectedPhase.key
        return <li key={phase.key} className="min-w-0"><button type="button" disabled={locked} onClick={() => { if (onSelectStage?.(phase.key) !== false) setSelectedKeys([]) }} aria-current={active ? 'step' : undefined} className={`legal-workflow-stage-card flex w-full items-center gap-3 rounded-xl border px-3 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${active ? 'border-emerald-600 bg-white' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
          <span className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full text-base font-semibold ${phase.status === 'completed' ? 'bg-emerald-700 text-white' : active ? 'bg-emerald-100 text-emerald-900' : 'border border-slate-200 bg-white text-slate-600'}`}>{phase.status === 'completed' ? <Check size={19} /> : String(index + 1).padStart(2, '0')}</span>
          <span className="min-w-0 flex-1"><strong className="block text-sm font-semibold leading-5 text-slate-950">{phase.label}</strong><span className="mt-1 block text-xs text-slate-600">{phase.total > 0 ? `${phase.completed} / ${phase.total} complete${phase.notApplicable ? ` · ${phase.notApplicable} N/A` : ''}` : 'Not applicable'}</span>{phase.total > 0 ? <span className="legal-workflow-stage-progress mt-3 flex items-center gap-3"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"><span className="block h-full rounded-full bg-emerald-700" style={{ width: `${phase.percent}%` }} /></span><span className="whitespace-nowrap rounded-full bg-white/80 px-2 py-1 text-xs text-slate-600">{stageTasksLeft(phase)} left</span></span> : null}</span><ChevronRight size={16} className="shrink-0 text-slate-500" />
        </button></li>
      })}</ol>
    </nav>

    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-[0_8px_26px_rgba(15,23,42,0.035)]">
      <header className="px-5 py-5 sm:px-7"><div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between"><div className="min-w-0 flex-1"><span className="text-xs font-bold uppercase tracking-[0.1em] text-emerald-800">Stage {stageIndex + 1} of {phases.length}</span><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{selectedPhase.label}</h1></div>
        {canUpdate && selectedPhase.total > 0 ? <div className="relative flex flex-wrap items-center gap-2"><Button type="button" variant="secondary" size="sm" className="px-3 text-xs sm:px-4 sm:text-sm" disabled={writeLocked || !outstanding.length || stageBlocked} onClick={() => openDialog('stage', outstanding)}><Check size={17} /> Mark stage complete</Button><div className="sm:relative"><button type="button" className="inline-flex size-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" disabled={writeLocked} aria-label="Stage options" aria-expanded={menuKey === 'stage'} onClick={(event) => { menuTriggerRef.current = event.currentTarget; setMenuKey(menuKey === 'stage' ? '' : 'stage') }}><MoreVertical size={18} /></button>{menuKey === 'stage' ? <div className="absolute left-0 top-full z-10 mt-1 w-52 rounded-lg border border-slate-200 bg-white p-1 shadow-lg sm:left-auto sm:right-0 sm:top-auto"><button type="button" className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50" disabled={writeLocked || !selectable.length} onClick={() => openDialog('selection', selectable)}>Complete selected tasks</button><button type="button" className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50" disabled={writeLocked || !outstanding.length || stageBlocked} onClick={() => openDialog('stage', outstanding)}>Override stage</button></div> : null}</div></div> : null}
      </div>{selectedPhase.total ? <div className="mt-4 flex flex-wrap items-center gap-3"><span className="h-1.5 min-w-32 flex-1 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={selectedPhase.completed} aria-valuemin={0} aria-valuemax={selectedPhase.total} aria-label="Stage progress"><span className="block h-full rounded-full bg-emerald-700" style={{ width: `${selectedPhase.percent}%` }} /></span><span className="text-xs font-semibold text-slate-600">{selectedPhase.completed} of {selectedPhase.total} tasks complete · {selectedPhase.percent}%</span></div> : <p className="mt-4 text-sm text-slate-600">Not applicable for this matter. No work is required in this stage.</p>}
      {stageComplete ? <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-800"><CheckCircle2 size={16} /> Stage complete</p> : null}
      {stageBlocked ? <p className="mt-3 text-xs text-slate-600">{outstanding.some(task => !task.operationalContract) ? 'This stage contains saved tasks whose editing rules are unavailable. Review their recorded work before updating the workflow.' : 'A required legal check must be completed in its task workspace before this stage can be overridden.'}</p> : null}</header>
      <div className="mx-5 border-t border-slate-200 sm:mx-7" />
      <div className={`legal-stage-work-area ${panelOpen ? 'has-task-panel' : ''}`}><div className="legal-stage-task-list">
      {selectedPhase.total > 0 && !panelOpen ? <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-7"><div className="flex flex-wrap items-center gap-3">{canUpdate ? <label className="inline-flex min-h-9 items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={allSelected} disabled={!selectable.length || writeLocked} onChange={() => setSelectedKeys(allSelected ? [] : selectable.map((task) => task.key))} className="size-4 accent-emerald-700" /> Select tasks</label> : null}{canUpdate ? <Button type="button" variant="secondary" size="sm" disabled={!selected.length || writeLocked} onClick={() => openDialog('bulk', selected)}><CheckCircle2 size={15} /> Mark selected complete</Button> : null}</div>{canUpdate ? <div className="flex items-center gap-2 text-xs text-slate-600"><span>Imported matter?</span><Button type="button" variant="secondary" size="sm" disabled={!outstanding.length || stageBlocked || writeLocked} onClick={() => openDialog('stage', outstanding)}>Override stage</Button></div> : null}</div> : null}
      {error && !dialog ? <p role="alert" className="mx-5 mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 sm:mx-7">{error}</p> : null}
      {selectedPhase.tasks.length > 0 ? <ol className="mx-5 mb-6 divide-y divide-slate-200 rounded-xl border border-slate-200 sm:mx-7">{selectedPhase.tasks.map((task, index) => {
        const resolved = isAttorneyTaskResolved(task.status)
        const complete = isAttorneyTaskCompleted(task.status)
        const blocked = hardBlocked(task)
        if (panelOpen) return <li key={task.key}>
          <button type="button" ref={(node) => { if (node) taskButtonsRef.current.set(task.key, node); else taskButtonsRef.current.delete(task.key) }} disabled={locked} aria-label={`Open task: ${task.label}`} aria-current={selectedTaskKey === task.key ? 'step' : undefined} className="legal-stage-task-row" onClick={() => openTask(selectedPhase.key, task.key)}>
            <span className={`legal-stage-task-number ${complete ? 'is-complete' : ''}`}>{complete ? <Check size={16} aria-hidden="true" /> : index + 1}</span>
            <span className="min-w-0 flex-1"><strong className="block text-sm font-semibold leading-5">{task.label}</strong><span className="mt-1 block text-xs text-slate-600">{task.statusLabel || (task.status === 'completed_externally' ? 'Completed externally' : complete ? 'Completed' : task.status === 'not_applicable' ? 'Not applicable' : task.displayStatus === 'blocked' ? 'Blocked' : task.displayStatus === 'waiting' ? 'Waiting' : task.displayStatus === 'in_progress' ? 'In progress' : 'Not started')}</span>{task.checklistProgress && task.operationalContract ? <span className="mt-1 block text-xs text-slate-500">{task.checklistProgress.completed} of {task.checklistProgress.total} checks confirmed</span> : null}</span>
            <ChevronRight size={16} className="shrink-0" aria-hidden="true" />
          </button>
        </li>
        return <li key={task.key} className={`group relative ${menuKey === task.key ? 'z-20' : ''} ${complete ? 'bg-emerald-50/45' : ''}`}>
          <button type="button" className="absolute inset-0 z-0 w-full cursor-pointer text-left transition-colors hover:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700" ref={(node) => { if (node) taskButtonsRef.current.set(task.key, node); else taskButtonsRef.current.delete(task.key) }} disabled={locked} aria-label={`Open task: ${task.label}`} onClick={() => openTask(selectedPhase.key, task.key)} />
          <div className="pointer-events-none relative z-10 flex flex-wrap items-center gap-3 px-4 py-4 sm:flex-nowrap sm:px-5">
          {canUpdate && task.operationalContract && !resolved ? <input type="checkbox" checked={selectedKeys.includes(task.key)} disabled={blocked || writeLocked} onChange={() => setSelectedKeys((current) => current.includes(task.key) ? current.filter((key) => key !== task.key) : [...current, task.key])} aria-label={`Select ${task.label}`} className="pointer-events-auto size-4 shrink-0 accent-emerald-700" /> : null}
          {complete ? <span className="inline-flex size-7 items-center justify-center rounded-full bg-emerald-600 text-white" aria-label="Completed"><Check size={17} /></span> : task.status === 'not_applicable' ? <span className="inline-flex size-7 items-center justify-center rounded-full bg-slate-200 text-slate-600" aria-label="Not applicable">–</span> : null}
          <div className="min-w-[180px] flex-1"><strong className="block text-sm font-semibold text-slate-950 group-hover:text-emerald-800">{index + 1}. {task.label}</strong>{task.description ? <p className="mt-1 text-xs leading-5 text-slate-500">{task.description}</p> : null}{!complete ? <span className="mt-1 block text-xs text-slate-500">{task.statusLabel || (task.status === 'not_applicable' ? 'Not applicable' : task.status === 'in_progress' ? 'In progress' : 'Not started')}</span> : null}</div>
          {task.checklistProgress && task.operationalContract ? <div className="w-44 shrink-0 text-xs" aria-label={`Checklist progress for ${task.label}`}><span className="block font-semibold text-slate-700">Task checklist</span><span className="mt-1 block text-slate-500">{task.status === 'not_applicable' ? 'Not applicable' : `${task.checklistProgress.completed} of ${task.checklistProgress.total} items confirmed`}</span></div> : null}
          {complete ? <span className="text-xs text-slate-600">{task.status === 'completed_externally' ? 'Completed externally' : 'Completed'}{dateLabel(task.completedAt || task.updatedAt) ? ` · ${dateLabel(task.completedAt || task.updatedAt)}` : ''}</span> : null}
          <div className="flex shrink-0 items-center gap-1.5"><div className="pointer-events-auto">
            {resolved ? <Button type="button" variant="secondary" size="sm" disabled={locked} onClick={() => openTask(selectedPhase.key, task.key)}>View</Button> : blocked || !canUpdate || !task.operationalContract ? <Button type="button" variant="secondary" size="sm" disabled={locked} onClick={() => openTask(selectedPhase.key, task.key)}>Open</Button> : <Button type="button" variant="secondary" size="sm" disabled={writeLocked} onClick={() => quickComplete(task)}>Mark complete</Button>}
          </div>
          {canUpdate && task.operationalContract ? <div className="pointer-events-auto relative"><button type="button" className="inline-flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" disabled={writeLocked} aria-label={`Options for ${task.label}`} aria-expanded={menuKey === task.key} onClick={(event) => { menuTriggerRef.current = event.currentTarget; setMenuKey(menuKey === task.key ? '' : task.key) }}><MoreVertical size={17} /></button>{menuKey === task.key ? <div className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">{!resolved ? <button type="button" className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50" disabled={blocked || writeLocked} onClick={() => openDialog('task', [task])}>Mark as complete</button> : null}{task.status !== 'not_applicable' && task.operationalContract?.allowedActions?.some((action) => action.status === 'not_applicable') ? <button type="button" className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50" disabled={writeLocked} onClick={() => openDialog('task', [task], 'not_applicable')}>Mark as not applicable</button> : null}{resolved ? <button type="button" className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50" disabled={writeLocked} onClick={() => openDialog('task', [task], 'not_started')}>Reopen task</button> : null}</div> : null}</div> : null}
          <ChevronRight size={18} className="shrink-0 text-slate-500 transition-colors group-hover:text-emerald-700" aria-hidden="true" /></div>
        </div></li>
      })}</ol> : null}
      </div>
      {panelOpen ? <section ref={panelRef} tabIndex={-1} className="legal-stage-task-panel" aria-label="Task workspace">
        <label className="legal-stage-task-picker"><span className="mb-2 block text-xs font-semibold text-slate-600">Choose a task in {selectedPhase.label}</span><select value={selectedTaskKey} disabled={locked} onChange={(event) => openTask(selectedPhase.key, event.target.value)} className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-950">{selectedPhase.tasks.map((task, index) => <option key={task.key} value={task.key}>{index + 1}. {task.label} · {task.statusLabel || (task.status || 'not_started').replaceAll('_', ' ')}</option>)}</select></label>
        {onCloseTask ? <div className="legal-stage-panel-return"><button type="button" className="legal-task-back" disabled={locked} onClick={onCloseTask}><ArrowLeft size={16} aria-hidden="true" /> Back to {selectedPhase.label}</button><button type="button" className="legal-stage-panel-close" disabled={locked} aria-label="Close task panel" onClick={onCloseTask}><X size={18} aria-hidden="true" /></button></div> : null}
        {taskPanel}
      </section> : null}</div>
      {nextPhase && !panelOpen ? <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 px-5 py-5 sm:px-7"><div className="flex items-center gap-3"><span className="inline-flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-800"><ArrowRight size={22} /></span><div><span className="text-xs font-bold uppercase tracking-[0.08em] text-emerald-800">Next step</span><h2 className="mt-1 text-sm font-semibold text-slate-950">{nextPhase.label}</h2><p className="mt-1 text-xs text-slate-500">{stageComplete || selectedPhase.status === 'not_applicable' ? 'Continue to the next stage.' : 'Complete this stage to proceed.'}</p></div></div><Button type="button" disabled={locked || (!stageComplete && selectedPhase.status !== 'not_applicable') || !getTransferStageEntryTask(nextPhase)} onClick={() => { if (onSelectStage?.(nextPhase.key) === false) return; if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Continue to {nextPhase.label} <ArrowRight size={16} /></Button></div> : null}
    </div>
    <Modal
      open={Boolean(dialog)}
      title={dialog?.kind === 'selection' ? 'Complete selected tasks' : dialog?.kind === 'stage' ? 'Mark stage complete?' : dialog?.kind === 'bulk' ? `Mark ${dialogTasksLeft} selected tasks as complete?` : dialog?.status === 'not_applicable' ? 'Mark task as not applicable?' : dialog?.status === 'not_started' ? 'Reopen task?' : 'Mark task complete?'}
      onClose={busy ? undefined : () => setDialog(null)}
      footer={<div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button>
        {dialog?.kind === 'selection'
          ? <Button type="button" disabled={writeLocked || !selected.length} onClick={() => openDialog('bulk', selected)}>Review completion</Button>
          : <Button type="button" disabled={writeLocked || (needsMatterNumber && !matterNumber.trim()) || ((dialog?.status === 'not_applicable' || dialog?.status === 'not_started') && !reason.trim())} onClick={() => void saveTasks(dialog.tasks, dialog.status, dialog.kind, reason)}>{busy ? 'Saving…' : dialog?.status === 'not_started' ? 'Reopen task' : dialog?.status === 'not_applicable' ? 'Mark not applicable' : dialog?.kind === 'stage' ? 'Mark stage complete' : 'Save & complete'}</Button>}
      </div>}
    >{dialog ? <div className="space-y-4 text-sm text-slate-700">
      {error ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-rose-800">{error}</p> : null}
      {!canUpdate ? <p role="status">Your access is now read-only. Your note is kept here for review.</p> : null}
      {dialog.kind === 'selection' ? <>
        <p>Choose the unfinished tasks to complete in this stage.</p>
        <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={allSelected} disabled={writeLocked} onChange={() => setSelectedKeys(allSelected ? [] : selectable.map(task => task.key))} className="size-4 accent-emerald-700" /> Select all available tasks</label>
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">{selectable.map(task => <li key={task.key}><label className="flex items-start gap-3 p-3"><input type="checkbox" checked={selectedKeys.includes(task.key)} disabled={writeLocked} onChange={() => setSelectedKeys(current => current.includes(task.key) ? current.filter(key => key !== task.key) : [...current, task.key])} className="mt-0.5 size-4 shrink-0 accent-emerald-700" /><span>{task.label}</span></label></li>)}</ul>
      </> : <>
        <p>{dialog.kind === 'stage' ? `${dialogTasksLeft} tasks are currently incomplete. Completing this stage manually will mark them as completed.` : dialog.kind === 'bulk' ? `${dialogTasksLeft} selected tasks will be marked complete.` : dialog.tasks[0]?.label}</p>
        {dialog.tasks.some(task => task.completionReadiness?.canComplete === false) && dialog.status === 'completed' ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">Some task information or evidence is still outstanding. Add a reason if completing the work manually.</p> : null}
        {needsMatterNumber ? <label className="block font-medium text-slate-700">Matter number *<input disabled={busy} value={matterNumber} onChange={event => setMatterNumber(event.target.value)} placeholder="Enter the firm matter number" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-700" /></label> : null}
        <label className="block font-medium text-slate-700">Reason {['not_applicable', 'not_started'].includes(dialog.status) ? '*' : '(optional)'}<textarea disabled={busy} rows={3} value={reason} onChange={event => setReason(event.target.value)} placeholder="Imported matter already progressed beyond this stage." className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-700" /></label>
        <p className="text-xs text-slate-500">The task outcome, reason, and completing user are saved in the matter history.</p>
      </>}
    </div> : null}</Modal>
  </section>
}
