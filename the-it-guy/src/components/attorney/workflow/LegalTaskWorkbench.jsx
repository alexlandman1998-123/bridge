import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  FileText,
  MessageSquarePlus,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../../ui/Button.jsx'
import Field from '../../ui/Field.jsx'
import Modal from '../../ui/Modal.jsx'

const TASK_TYPE_COPY = Object.freeze({
  capture_information: {
    heading: 'Information needed',
    helper: 'Capture the facts required to progress this task.',
  },
  collect_documents: {
    heading: 'Documents needed',
    helper: 'Collect the outstanding evidence and keep it linked to this task.',
  },
  review_evidence: {
    heading: 'Evidence to review',
    helper: 'Review the available evidence and resolve any remaining gaps.',
  },
  request_external_action: {
    heading: 'Request requirements',
    helper: 'Send or follow up on the request needed to progress this task.',
  },
  schedule_action: {
    heading: 'Scheduling requirements',
    helper: 'Confirm the people, documents, and timing needed for this appointment.',
  },
  confirm_milestone: {
    heading: 'Completion checks',
    helper: 'Confirm the evidence required for this legal milestone.',
  },
})

function formatDueDate(value = '') {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function statusTone(status = '') {
  if (status === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (status === 'blocked') return 'border-red-200 bg-red-50 text-red-800'
  if (status === 'waiting') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (status === 'in_progress') return 'border-blue-200 bg-blue-50 text-blue-800'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function RequirementRow({ item }) {
  const complete = Boolean(item.complete)
  return (
    <li className="flex min-w-0 items-start gap-3 py-3">
      <span className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white text-slate-400'}`}>
        {complete ? <CheckCircle2 size={14} /> : <Circle size={10} />}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-sm font-semibold leading-5 text-slate-950">{item.label}</strong>
        {item.description ? <span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span> : null}
      </span>
      <span className={`shrink-0 text-xs font-semibold ${complete ? 'text-emerald-700' : item.required === false ? 'text-slate-500' : 'text-amber-700'}`}>
        {complete ? 'Complete' : item.required === false ? 'Optional' : 'Required'}
      </span>
    </li>
  )
}

function Disclosure({ title, count = null, children, defaultOpen = false }) {
  return (
    <details className="group border-t border-slate-200" open={defaultOpen}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
        <span>{title}{typeof count === 'number' ? <span className="ml-2 text-xs font-medium text-slate-400">{count}</span> : null}</span>
        <ChevronRight size={16} className="shrink-0 text-slate-400 transition group-open:rotate-90" />
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  )
}

function PhaseNavigator({ phases = [], selectedTaskKey = '', selectedPhaseKey = '', workflowLabel = 'Legal workflow', operationalHealth = null, onSelectTask }) {
  const [showFullWorkflow, setShowFullWorkflow] = useState(false)
  const selectedPhase = phases.find((phase) => phase.key === selectedPhaseKey) || phases[0] || null
  const phaseExceptions = useMemo(() => {
    const grouped = new Map()
    for (const exception of operationalHealth?.exceptions || []) {
      const current = grouped.get(exception.phaseKey) || { count: 0, severity: 'attention', primary: null }
      const critical = current.severity === 'critical' || exception.severity === 'critical'
      grouped.set(exception.phaseKey, {
        count: current.count + 1,
        severity: critical ? 'critical' : 'attention',
        primary: current.primary || exception,
      })
    }
    return grouped
  }, [operationalHealth?.exceptions])
  const visiblePhases = showFullWorkflow
    ? phases
    : phases.filter((phase) => phase.key === selectedPhase?.key || phaseExceptions.has(phase.key))

  return (
    <aside className="min-h-0 max-h-[52dvh] md:max-h-[58dvh] xl:max-h-none">
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.04)]">
        <div className="shrink-0 border-b border-slate-200 px-4 py-4">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{workflowLabel}</span>
          <div className="mt-1 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-950">{showFullWorkflow ? 'Full workflow' : 'Current checkpoint'}</h2>
            <span className="text-xs font-medium text-slate-500">{selectedPhase?.completed || 0} of {selectedPhase?.total || 0}</span>
          </div>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3" aria-label={`${workflowLabel} checkpoints`}>
          <ol className="space-y-1">
            {visiblePhases.map((phase) => {
              const active = phase.key === selectedPhase?.key
              const phaseIndex = phases.findIndex((item) => item.key === phase.key)
              const exception = phaseExceptions.get(phase.key)
              return (
                <li key={phase.key}>
                  <button
                    type="button"
                    className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${active ? 'bg-emerald-50 text-emerald-950 ring-1 ring-emerald-200' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
                    onClick={() => onSelectTask?.(exception?.primary?.taskKey || phase.currentTask?.key || phase.tasks?.[0]?.key)}
                    aria-current={active ? 'step' : undefined}
                  >
                    <span className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${phase.status === 'completed' ? 'bg-emerald-700 text-white' : active ? 'bg-white text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                      {phase.status === 'completed' ? <CheckCircle2 size={15} /> : phaseIndex + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm font-semibold leading-5">{phase.label}</strong>
                      <span className="mt-0.5 block text-xs text-slate-500">{phase.completed} of {phase.total} complete</span>
                    </span>
                    {exception ? (
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[0.68rem] font-semibold ${exception.severity === 'critical' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}
                        aria-label={`${exception.count} task exception${exception.count === 1 ? '' : 's'}`}
                      >
                        <AlertTriangle size={12} /> {exception.count}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ol>
          {selectedPhase?.tasks?.length ? (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <span className="px-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">This checkpoint</span>
              <div className="mt-2 space-y-1">
                {selectedPhase.tasks.map((task) => {
                  const active = task.key === selectedTaskKey
                  return (
                    <button
                      key={task.key}
                      type="button"
                      className={`flex min-h-11 w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${active ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
                      onClick={() => onSelectTask?.(task.key)}
                      aria-current={active ? 'step' : undefined}
                    >
                      <span className={`mt-1 size-2 shrink-0 rounded-full ${task.displayStatus === 'completed' ? 'bg-emerald-400' : task.displayStatus === 'blocked' ? 'bg-red-400' : task.displayStatus === 'waiting' ? 'bg-amber-400' : active ? 'bg-white' : 'bg-slate-300'}`} />
                      <span className="min-w-0 leading-5">{task.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
          {phases.length > 1 ? (
            <button
              type="button"
              className="mt-4 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              aria-expanded={showFullWorkflow}
              onClick={() => setShowFullWorkflow((current) => !current)}
            >
              {showFullWorkflow ? 'Show current checkpoint' : `View full workflow (${phases.length})`}
              <ChevronDown size={15} className={`transition ${showFullWorkflow ? 'rotate-180' : ''}`} />
            </button>
          ) : null}
        </nav>
      </section>
    </aside>
  )
}

export default function LegalTaskWorkbench({
  model,
  phases = [],
  selectedTaskKey = '',
  selectedPhaseKey = '',
  saving = false,
  onSelectTask,
  onRunAction,
  onOpenDocuments,
  onAddNote,
  statusDraft = null,
  onStatusDraftChange,
  onSubmitStatusDraft,
  onCloseStatusDraft,
  onUxEvent,
}) {
  const taskTimingRef = useRef({ taskKey: '', startedAt: 0 })
  const uxEventRef = useRef(onUxEvent)

  useEffect(() => {
    uxEventRef.current = onUxEvent
  }, [onUxEvent])

  useEffect(() => {
    if (!model || model.empty) return
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    taskTimingRef.current = { taskKey: model.taskKey, startedAt }
    uxEventRef.current?.({
      eventName: 'task_viewed',
      lane: model.lane,
      taskType: model.taskType,
      status: model.status,
      placement: 'task_view',
      outcome: 'success',
    })
  }, [model?.empty, model?.lane, model?.status, model?.taskKey, model?.taskType])

  if (!model || model.empty) return null
  const taskCopy = TASK_TYPE_COPY[model.taskType] || TASK_TYPE_COPY.confirm_milestone
  const primaryAction = model.primaryAction
  const completeActionIsPrimary = primaryAction?.id === model.completeAction?.id
  const dueDateLabel = formatDueDate(model.dueDate)

  function emitActionEvent(action = {}, placement = 'secondary') {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const isCompletion = action.id === 'mark_complete'
    uxEventRef.current?.({
      eventName: isCompletion ? 'completion_clicked' : placement === 'primary' ? 'primary_action_clicked' : 'secondary_action_clicked',
      lane: model.lane,
      taskType: model.taskType,
      status: model.status,
      actionId: action.id,
      placement: isCompletion ? 'completion' : placement,
      elapsedMs: Math.max(0, now - taskTimingRef.current.startedAt),
      outcome: 'started',
    })
  }

  function runAction(action, placement) {
    emitActionEvent(action, placement)
    onRunAction?.(action)
  }

  function runUtilityAction(actionId, callback) {
    emitActionEvent({ id: actionId }, 'secondary')
    callback?.()
  }

  return (
    <>
      <section className="archline-transfer-workspace grid gap-4 xl:sticky xl:top-24 xl:h-[calc(100dvh-120px)] xl:grid-cols-[minmax(280px,330px)_minmax(0,1fr)] xl:overflow-hidden">
      <PhaseNavigator
        phases={phases}
        selectedTaskKey={selectedTaskKey}
        selectedPhaseKey={selectedPhaseKey}
        workflowLabel={model.workflowLabel}
        operationalHealth={model.operationalHealth}
        onSelectTask={onSelectTask}
      />

      <main className="min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.04)]">
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <header className="shrink-0 border-b border-slate-200 px-5 py-5 lg:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 max-w-3xl">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Current legal task</span>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <h2 className="min-w-0 text-2xl font-semibold leading-tight tracking-[-0.02em] text-slate-950">{model.taskLabel}</h2>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(model.status)}`}>{model.statusLabel}</span>
                </div>
                <div className="mt-3 max-w-2xl">
                  <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-slate-400">Objective</span>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{model.taskDescription}</p>
                </div>
              </div>
              {dueDateLabel || model.showOwner ? (
                <div className="grid shrink-0 gap-1 text-xs text-slate-500 sm:text-right">
                  {dueDateLabel ? (
                    <span className="inline-flex items-center gap-2 font-semibold text-slate-700 sm:justify-end"><CalendarDays size={14} /> Due {dueDateLabel}</span>
                  ) : null}
                  {model.showOwner ? (
                    <span className="inline-flex items-center gap-2 sm:justify-end"><UserRound size={14} /> {model.ownerLabel}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 lg:px-6">
            {model.attentionItems.length ? (
              <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4" aria-label="Task attention required">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-amber-950">Attention required</h3>
                    <ul className="mt-2 space-y-2">
                      {model.attentionItems.map((item) => (
                        <li key={item.id} className="text-sm leading-5 text-amber-900">
                          <strong>{item.label}</strong>{item.description ? <span className="block text-xs text-amber-800">{item.description}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            ) : null}

            {primaryAction ? (
              <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 lg:p-5">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-emerald-700">Next action</span>
                <h3 className="mt-2 text-lg font-semibold text-emerald-950">{primaryAction.label}</h3>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-emerald-800">{primaryAction.description || model.completionMessage}</p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-4"
                  disabled={saving || primaryAction.disabled}
                  title={primaryAction.disabled ? primaryAction.description : ''}
                  onClick={() => runAction(primaryAction, 'primary')}
                >
                  {primaryAction.source === 'status' ? <CheckCircle2 size={15} /> : <ChevronRight size={15} />}
                  {primaryAction.label}
                </Button>
              </section>
            ) : null}

            <section className="mt-5" aria-labelledby="legal-task-outstanding-heading">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 id="legal-task-outstanding-heading" className="text-sm font-semibold text-slate-950">{taskCopy.heading}</h3>
                  <p className="mt-1 text-sm text-slate-500">{taskCopy.helper}</p>
                </div>
                <span className="text-xs font-semibold text-slate-500">{model.outstandingRequirements.length} outstanding</span>
              </div>
              <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 px-4">
                {model.outstandingRequirements.map((item) => <RequirementRow key={item.id} item={item} />)}
                {!model.outstandingRequirements.length ? (
                  <li className="flex items-center gap-3 py-5 text-sm text-emerald-700">
                    <CheckCircle2 size={18} /> All required items are present.
                  </li>
                ) : null}
              </ul>
            </section>

            <section className="mt-5 rounded-xl border border-slate-200 px-4">
              {model.confirmationRequirements.length ? (
                <Disclosure title="Checks confirmed on completion" count={model.confirmationRequirements.length}>
                  <ul className="divide-y divide-slate-100">
                    {model.confirmationRequirements.map((item) => <RequirementRow key={item.id} item={{ ...item, required: false }} />)}
                  </ul>
                </Disclosure>
              ) : null}
              {model.completedRequirements.length ? (
                <Disclosure title="Completed requirements" count={model.completedRequirements.length}>
                  <ul className="divide-y divide-slate-100">
                    {model.completedRequirements.map((item) => <RequirementRow key={item.id} item={item} />)}
                  </ul>
                </Disclosure>
              ) : null}
              <Disclosure title="Documents" count={model.documents.length}>
                {model.documents.length ? (
                  <div className="space-y-2">
                    {model.documents.slice(0, 6).map((document) => (
                      <div key={document.id || document.key || document.sourceRequirementKey} className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-3 text-sm">
                        <FileText size={16} className="mt-0.5 shrink-0 text-slate-500" />
                        <span className="min-w-0 flex-1">
                          <strong className="block font-semibold text-slate-900">{document.displayName || document.label || document.name || 'Document'}</strong>
                          <span className="mt-0.5 block text-xs text-slate-500">{document.ready ? 'Available' : 'Outstanding'}</span>
                        </span>
                      </div>
                    ))}
                    <Button type="button" variant="ghost" size="sm" onClick={() => runUtilityAction('open_documents', onOpenDocuments)}>Open document register</Button>
                  </div>
                ) : <p className="text-sm text-slate-500">No documents are linked to this task.</p>}
              </Disclosure>
              <Disclosure title="Notes and activity" count={model.notes.length + model.activity.length}>
                <div className="space-y-3">
                  {[...model.notes, ...model.activity].slice(0, 4).map((item, index) => (
                    <article key={item.id || index} className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-700">
                      <strong className="block text-slate-950">{item.title || item.label || 'Matter update'}</strong>
                      <p className="mt-1 leading-5">{item.body || item.message || 'Activity recorded.'}</p>
                    </article>
                  ))}
                  {!model.notes.length && !model.activity.length ? <p className="text-sm text-slate-500">No task activity has been recorded.</p> : null}
                  <Button type="button" variant="ghost" size="sm" onClick={() => runUtilityAction('add_note', onAddNote)}><MessageSquarePlus size={15} /> Add note</Button>
                </div>
              </Disclosure>
            </section>
          </div>

          <footer className="shrink-0 border-t border-slate-200 bg-white px-5 py-4 lg:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap gap-2">
                {model.secondaryActions.map((action) => (
                  <Button
                    key={`${action.source}:${action.id}`}
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={saving || action.disabled}
                    title={action.disabled ? action.description : ''}
                    onClick={() => runAction(action, 'secondary')}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
              {!completeActionIsPrimary && model.completeAction ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={saving || !model.canComplete || model.completeAction.disabled}
                  title={!model.canComplete ? model.completionMessage : ''}
                  onClick={() => runAction(model.completeAction, 'completion')}
                >
                  <CheckCircle2 size={15} /> Complete task
                </Button>
              ) : null}
            </div>
            {!model.canComplete ? <p className="mt-2 text-xs text-slate-500">{model.completionMessage}</p> : null}
          </footer>
        </div>
      </main>
      </section>

      <Modal
        open={Boolean(statusDraft?.open)}
        title={statusDraft?.actionLabel || 'Update task status'}
        onClose={onCloseStatusDraft}
        footer={(
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onCloseStatusDraft}>Cancel</Button>
            <Button
              type="submit"
              form="legal-task-workbench-status-form"
              disabled={saving || (statusDraft?.requiresReason && !statusDraft?.reason?.trim()) || (statusDraft?.requiresNote && !statusDraft?.note?.trim())}
            >
              {saving ? 'Updating…' : 'Update status'}
            </Button>
          </div>
        )}
      >
        <form id="legal-task-workbench-status-form" className="space-y-4" onSubmit={onSubmitStatusDraft}>
          <div>
            <span className="text-xs font-medium text-slate-500">Task</span>
            <strong className="mt-1 block text-sm font-semibold text-slate-950">{statusDraft?.task?.label || model.taskLabel}</strong>
          </div>
          {model.clientUpdate?.visible ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {model.clientUpdate.label}. Keep the status note clear and client-safe.
            </p>
          ) : null}
          {statusDraft?.requiresReason ? (
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Reason <span className="text-red-600">*</span>
              <Field
                value={statusDraft?.reason || ''}
                onChange={(event) => onStatusDraftChange?.({ ...statusDraft, reason: event.target.value })}
                placeholder="What is preventing this task from progressing?"
              />
            </label>
          ) : null}
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Notes {statusDraft?.requiresNote ? <span className="text-red-600">*</span> : null}
            <Field
              as="textarea"
              rows={4}
              value={statusDraft?.note || ''}
              onChange={(event) => onStatusDraftChange?.({ ...statusDraft, note: event.target.value })}
              placeholder="Record the outcome or next follow-up."
            />
          </label>
          {['blocked', 'waiting'].includes(statusDraft?.status) ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Follow-up date
                <Field
                  type="date"
                  value={statusDraft?.followUpDate || ''}
                  onChange={(event) => onStatusDraftChange?.({ ...statusDraft, followUpDate: event.target.value })}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Linked document
                <Field
                  as="select"
                  value={statusDraft?.linkedDocumentKey || ''}
                  onChange={(event) => onStatusDraftChange?.({ ...statusDraft, linkedDocumentKey: event.target.value })}
                >
                  <option value="">No linked document</option>
                  {model.documents.map((document) => {
                    const documentKey = document.id || document.key || document.sourceRequirementKey
                    return <option key={documentKey} value={documentKey}>{document.displayName || document.label || document.name || document.sourceRequirementKey}</option>
                  })}
                </Field>
              </label>
            </div>
          ) : null}
        </form>
      </Modal>
    </>
  )
}
