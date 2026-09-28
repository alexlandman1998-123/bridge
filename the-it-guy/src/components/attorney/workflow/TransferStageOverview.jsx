import { useState } from 'react'
import { ArrowRight, Check, CheckCircle2, ChevronRight, Circle, MoreVertical } from 'lucide-react'
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

export default function TransferStageOverview({ phases = [], selectedPhase = null, onSelectStage, onOpenStage, onUpdateTask, onSaveMatterNumber, canUpdate = false }) {
  const [selectedKeys, setSelectedKeys] = useState([])
  const [dialog, setDialog] = useState(null)
  const [reason, setReason] = useState('')
  const [matterNumber, setMatterNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [menuKey, setMenuKey] = useState('')
  if (!selectedPhase) return <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600" role="status">No transfer stages are available for this matter yet.</section>

  const stageIndex = phases.findIndex((phase) => phase.key === selectedPhase.key)
  const nextPhase = phases[stageIndex + 1] || null
  const outstanding = selectedPhase.tasks.filter((task) => !isAttorneyTaskResolved(task.status))
  const selectable = outstanding.filter((task) => !hardBlocked(task))
  const selected = selectable.filter((task) => selectedKeys.includes(task.key))
  const stageComplete = outstanding.length === 0
  const stageBlocked = outstanding.some(hardBlocked)
  const allSelected = selectable.length > 0 && selected.length === selectable.length
  const needsMatterNumber = dialog?.kind === 'task' && dialog.status === 'completed' && dialog.tasks[0]?.key === 'matter_opened' &&
    dialog.tasks[0]?.dataRequirements?.some((requirement) => requirement.required !== false && !requirement.complete && /matter number/i.test(requirement.label || requirement.id || ''))

  function openDialog(kind, tasks, status = 'completed') {
    setDialog({ kind, tasks, status })
    setReason('')
    setMatterNumber('')
    setError('')
    setMenuKey('')
  }

  async function saveTasks(tasks, status, kind, explanation = '') {
    if (!tasks.length || !onUpdateTask || busy) return
    setBusy(true)
    setError('')
    const groupId = globalThis.crypto?.randomUUID?.() || String(Date.now())
    const keys = tasks.map((task) => task.key)
    let savedCount = 0
    try {
      if (needsMatterNumber && tasks[0]?.key === 'matter_opened') {
        if (!matterNumber.trim() || !onSaveMatterNumber) throw new Error('Enter a matter number before completing this task.')
        await onSaveMatterNumber(matterNumber.trim())
      }
      for (const task of tasks) {
        const note = [
          kind === 'stage' ? 'Manual stage override.' : kind === 'bulk' ? 'Manual bulk task completion.' : 'Manual task status update.',
          explanation.trim() ? `Reason: ${explanation.trim()}` : '',
          task.completionReadiness?.canComplete === false && status === 'completed' ? 'Outstanding requirements reviewed during manual completion.' : '',
        ].filter(Boolean).join('\n')
        const saved = await onUpdateTask(task, status, note, {
          commandType: 'manual_workflow_override',
          completionMethod: status === 'completed' ? 'manual' : '',
          overrideScope: kind,
          overrideGroupId: groupId,
          overrideReason: explanation.trim(),
          overrideTaskKeys: keys,
        })
        if (saved !== true) throw new Error(`${task.label} could not be updated. Refresh the matter before trying again.`)
        savedCount += 1
      }
      setSelectedKeys((current) => current.filter((key) => !keys.includes(key)))
      setDialog(null)
    } catch (saveError) {
      setDialog(null)
      setError(`${savedCount ? `${savedCount} of ${tasks.length} tasks saved. ` : ''}${saveError?.message || 'The task could not be updated.'}`)
    } finally {
      setBusy(false)
    }
  }

  function quickComplete(task) {
    if (hardBlocked(task)) return onOpenStage?.(selectedPhase.key, task.key)
    const needsReason = task.completionReadiness?.canComplete === false ||
      isAttorneyAttestedMilestone('transfer', task.key) || requiresAttorneyEvidenceDecision('transfer', task.key)
    if (needsReason) openDialog('task', [task])
    else void saveTasks([task], 'completed', 'task')
  }

  return <section className="grid items-start gap-4 xl:grid-cols-[minmax(260px,316px)_minmax(0,1fr)]" aria-label="Transfer stage overview">
    <nav className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_8px_26px_rgba(15,23,42,0.035)] xl:sticky xl:top-24" aria-label="Transfer stages">
      <div className="px-3 pb-4 pt-3"><h2 className="text-xs font-bold uppercase tracking-[0.1em] text-emerald-800">Matter workflow</h2><p className="mt-1 text-sm text-slate-500">{phases.length} stages to completion</p></div>
      <ol className="flex gap-2 overflow-x-auto xl:block xl:space-y-2 xl:overflow-visible">{phases.map((phase, index) => {
        const active = phase.key === selectedPhase.key
        return <li key={phase.key} className="min-w-[230px] flex-1 xl:min-w-0"><button type="button" onClick={() => { setSelectedKeys([]); onSelectStage?.(phase.key) }} aria-current={active ? 'step' : undefined} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${active ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
          <span className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full text-base font-semibold ${phase.status === 'completed' ? 'bg-emerald-700 text-white' : active ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-600'}`}>{phase.status === 'completed' ? <Check size={19} /> : String(index + 1).padStart(2, '0')}</span>
          <span className="min-w-0 flex-1"><strong className="block text-sm font-semibold leading-5 text-slate-950">{phase.label}</strong><span className="mt-1 block text-xs text-slate-600">{phase.completed} / {phase.total} complete{phase.notApplicable ? ` · ${phase.notApplicable} N/A` : ''}</span><span className="mt-3 flex items-center gap-3"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"><span className="block h-full rounded-full bg-emerald-700" style={{ width: `${phase.percent}%` }} /></span><span className="whitespace-nowrap rounded-full bg-white/80 px-2 py-1 text-xs text-slate-600">{stageTasksLeft(phase)} left</span></span></span><ChevronRight size={16} className="shrink-0 text-slate-500" />
        </button></li>
      })}</ol>
    </nav>

    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-[0_8px_26px_rgba(15,23,42,0.035)]">
      <header className="px-5 pb-6 pt-7 sm:px-7"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><span className="text-xs font-bold uppercase tracking-[0.1em] text-emerald-800">Stage {stageIndex + 1} of {phases.length}</span><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{selectedPhase.label}</h1></div>
        {canUpdate ? <div className="flex items-center gap-2"><Button type="button" variant="secondary" disabled={busy || stageComplete || stageBlocked} onClick={() => openDialog('stage', outstanding)}><Check size={17} /> Mark stage complete</Button><div className="relative"><button type="button" className="inline-flex size-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="Stage options" aria-expanded={menuKey === 'stage'} onClick={() => setMenuKey(menuKey === 'stage' ? '' : 'stage')}><MoreVertical size={18} /></button>{menuKey === 'stage' ? <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"><button type="button" className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50" disabled={stageComplete || stageBlocked} onClick={() => openDialog('stage', outstanding)}>Override stage</button></div> : null}</div></div> : null}
      </div>{selectedPhase.description ? <p className="mt-3 text-sm leading-6 text-slate-600">{selectedPhase.description}</p> : null}{selectedPhase.total ? <div className="mt-6 flex flex-wrap items-center gap-4"><span className="h-2 min-w-32 flex-1 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={selectedPhase.completed} aria-valuemin={0} aria-valuemax={selectedPhase.total} aria-label="Stage progress"><span className="block h-full rounded-full bg-emerald-700" style={{ width: `${selectedPhase.percent}%` }} /></span><span className="text-sm font-semibold text-slate-600">{selectedPhase.completed} of {selectedPhase.total} complete · {selectedPhase.percent}%</span></div> : <p className="mt-6 text-sm text-slate-600">No applicable tasks in this stage</p>}
      {stageComplete ? <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-800"><CheckCircle2 size={16} /> Stage complete</p> : null}
      {stageBlocked ? <p className="mt-3 text-xs text-slate-600">A required legal check must be completed in its task workspace before this stage can be overridden.</p> : null}</header>
      <div className="mx-5 border-t border-slate-200 sm:mx-7" />
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-7"><div className="flex flex-wrap items-center gap-3">{canUpdate ? <label className="inline-flex min-h-9 items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={allSelected} disabled={!selectable.length || busy} onChange={() => setSelectedKeys(allSelected ? [] : selectable.map((task) => task.key))} className="size-4 accent-emerald-700" /> Select tasks</label> : null}{canUpdate ? <Button type="button" variant="secondary" size="sm" disabled={!selected.length || busy} onClick={() => openDialog('bulk', selected)}><CheckCircle2 size={15} /> Mark selected complete</Button> : null}</div>{canUpdate ? <div className="flex items-center gap-2 text-xs text-slate-600"><span>Imported matter?</span><Button type="button" variant="secondary" size="sm" disabled={stageComplete || stageBlocked || busy} onClick={() => openDialog('stage', outstanding)}>Override stage</Button></div> : null}</div>
      {error ? <p role="alert" className="mx-5 mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 sm:mx-7">{error}</p> : null}
      <ol className="mx-5 mb-6 divide-y divide-slate-200 rounded-xl border border-slate-200 sm:mx-7">{selectedPhase.tasks.map((task, index) => {
        const resolved = isAttorneyTaskResolved(task.status)
        const complete = isAttorneyTaskCompleted(task.status)
        const blocked = hardBlocked(task)
        return <li key={task.key} className={complete ? 'bg-emerald-50/45' : ''}><div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:flex-nowrap sm:px-5">
          {canUpdate ? <input type="checkbox" checked={selectedKeys.includes(task.key)} disabled={resolved || blocked || busy} onChange={() => setSelectedKeys((current) => current.includes(task.key) ? current.filter((key) => key !== task.key) : [...current, task.key])} aria-label={`Select ${task.label}`} className="size-4 shrink-0 accent-emerald-700" /> : null}
          {complete ? <span className="inline-flex size-7 items-center justify-center rounded-full bg-emerald-600 text-white"><Check size={17} /></span> : task.status === 'not_applicable' ? <span className="inline-flex size-7 items-center justify-center rounded-full bg-slate-200 text-slate-600">–</span> : <Circle size={27} className="text-slate-400" />}
          <div className="min-w-[180px] flex-1"><strong className="block text-sm font-semibold text-slate-950">{index + 1}. {task.label}</strong>{task.description ? <p className="mt-1 text-xs leading-5 text-slate-500">{task.description}</p> : null}{!complete ? <span className="mt-1 block text-xs text-slate-500">{task.status === 'not_applicable' ? 'Not applicable' : task.status === 'in_progress' ? 'In progress' : 'Not started'}</span> : null}</div>
          {complete ? <span className="text-xs text-slate-600">Completed{dateLabel(task.completedAt || task.updatedAt) ? ` · ${dateLabel(task.completedAt || task.updatedAt)}` : ''}</span> : null}
          {resolved ? <Button type="button" variant="secondary" size="sm" onClick={() => onOpenStage?.(selectedPhase.key, task.key)}>View</Button> : blocked || !canUpdate ? <Button type="button" variant="secondary" size="sm" onClick={() => onOpenStage?.(selectedPhase.key, task.key)}>Open</Button> : <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => quickComplete(task)}>Mark complete</Button>}
          {canUpdate ? <div className="relative"><button type="button" className="inline-flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label={`Options for ${task.label}`} aria-expanded={menuKey === task.key} onClick={() => setMenuKey(menuKey === task.key ? '' : task.key)}><MoreVertical size={17} /></button>{menuKey === task.key ? <div className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">{!resolved ? <button type="button" className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50" disabled={blocked} onClick={() => openDialog('task', [task])}>Mark as complete</button> : null}{task.status !== 'not_applicable' && task.operationalContract?.allowedActions?.some((action) => action.status === 'not_applicable') ? <button type="button" className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => openDialog('task', [task], 'not_applicable')}>Mark as not applicable</button> : null}{resolved ? <button type="button" className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => openDialog('task', [task], 'not_started')}>Reopen task</button> : null}</div> : null}</div> : null}
        </div></li>
      })}</ol>
      {nextPhase ? <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 px-5 py-5 sm:px-7"><div className="flex items-center gap-3"><span className="inline-flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-800"><ArrowRight size={22} /></span><div><span className="text-xs font-bold uppercase tracking-[0.08em] text-emerald-800">Next step</span><h2 className="mt-1 text-sm font-semibold text-slate-950">{nextPhase.label}</h2><p className="mt-1 text-xs text-slate-500">{stageComplete ? 'Continue to the next stage.' : 'Complete this stage to proceed.'}</p></div></div><Button type="button" disabled={!stageComplete || !getTransferStageEntryTask(nextPhase)} onClick={() => { onSelectStage?.(nextPhase.key); if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Continue to {nextPhase.label} <ArrowRight size={16} /></Button></div> : null}
    </div>
    <Modal open={Boolean(dialog)} title={dialog?.kind === 'stage' ? 'Mark stage complete?' : dialog?.kind === 'bulk' ? `Mark ${dialog.tasks.length} selected tasks as complete?` : dialog?.status === 'not_applicable' ? 'Mark task as not applicable?' : dialog?.status === 'not_started' ? 'Reopen task?' : 'Mark task complete?'} onClose={busy ? undefined : () => setDialog(null)} footer={<div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button><Button type="button" disabled={busy || (needsMatterNumber && !matterNumber.trim()) || ((dialog?.status === 'not_applicable' || dialog?.status === 'not_started') && !reason.trim())} onClick={() => void saveTasks(dialog.tasks, dialog.status, dialog.kind, reason)}>{busy ? 'Saving…' : dialog?.status === 'not_started' ? 'Reopen task' : dialog?.status === 'not_applicable' ? 'Mark not applicable' : dialog?.kind === 'stage' ? 'Mark stage complete' : 'Save & complete'}</Button></div>}>{dialog ? <div className="space-y-4 text-sm text-slate-700"><p>{dialog.kind === 'stage' ? `${dialog.tasks.length} tasks are currently incomplete. Completing this stage manually will mark them as completed.` : dialog.kind === 'bulk' ? `${dialog.tasks.length} selected tasks will be marked complete.` : dialog.tasks[0]?.label}</p>{dialog.tasks.some((task) => task.completionReadiness?.canComplete === false) && dialog.status === 'completed' ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">Some task information or evidence is still outstanding. Add a reason if completing the work manually.</p> : null}{needsMatterNumber ? <label className="block font-medium text-slate-700">Matter number *<input value={matterNumber} onChange={(event) => setMatterNumber(event.target.value)} placeholder="Enter the firm matter number" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-700" /></label> : null}<label className="block font-medium text-slate-700">Reason {['not_applicable', 'not_started'].includes(dialog.status) ? '*' : '(optional)'}<textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Imported matter already progressed beyond this stage." className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-700" /></label><p className="text-xs text-slate-500">The task outcome, reason, and completing user are saved in the matter history.</p></div> : null}</Modal>
  </section>
}
