import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Circle,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Save,
  MessageSquarePlus,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../../ui/Button.jsx'
import Field from '../../ui/Field.jsx'
import Modal from '../../ui/Modal.jsx'
import TaskConfirmations from './TaskConfirmations.jsx'
import { isAttorneyTaskResolved } from '../../../core/transactions/attorneyTaskOutcomes.js'

function requirementStatus(item = {}) {
  if (item.complete) return 'Approved'
  if (item.statusLabel) return item.statusLabel
  if (item.status) return String(item.status).replaceAll('_', ' ')
  return item.required === false ? 'Not applicable' : 'Required'
}

function isAttachedDocument(document = {}) {
  return document?.missing !== true && Boolean(
    document?.ready ||
    document?.fileUrl ||
    document?.file_url ||
    document?.signedUrl ||
    document?.signed_url ||
    document?.url ||
    document?.uploadedAt ||
    document?.uploaded_at,
  )
}

function RequirementRow({ item, action = null, saving = false, onRunAction }) {
  const complete = Boolean(item.complete)
  const status = requirementStatus(item)
  const description = typeof item.description === 'string' ? item.description.trim() : ''
  const showDescription = description && !/^[a-z\d]+(?:_[a-z\d]+)+$/i.test(description)
    && description.toLowerCase() !== String(item.label || '').trim().toLowerCase()
  return (
    <li className="flex min-w-0 flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50/70 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
      <span className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white text-slate-400'}`}>
        {complete ? <CheckCircle2 size={14} /> : <Circle size={10} />}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-sm font-semibold leading-5 text-slate-950">{item.label}</strong>
        {showDescription ? (
          <details className="mt-1 text-xs leading-5 text-slate-500">
            <summary className="w-fit cursor-pointer focus-visible:outline-emerald-700">Details</summary>
            <p className="mt-1">{description}</p>
          </details>
        ) : null}
      </span>
      </div>
      <div className="flex shrink-0 items-center gap-3 self-end sm:self-auto">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${complete ? 'bg-emerald-50 text-emerald-700' : item.required === false ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-800'}`}>
          {status}
        </span>
        {!complete && action ? (
          <Button type="button" variant="secondary" size="sm" disabled={saving || action.disabled} onClick={() => onRunAction?.(action, 'requirement')}>
            {action.label}
          </Button>
        ) : null}
      </div>
    </li>
  )
}

function PhaseNavigator({
  phases = [],
  selectedTaskKey = '',
  selectedPhaseKey = '',
  workflowLabel = 'Legal workflow',
  operationalHealth = null,
  collapsed = false,
  expandedPhaseKey = '',
  onToggleCollapsed,
  onTogglePhase,
  onSelectTask,
}) {
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
  return (
    <aside className={`min-h-0 transition-[width] duration-200 xl:sticky xl:top-24 xl:self-start ${collapsed ? 'xl:w-[72px]' : ''}`}>
      <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.035)]">
        <div className={`shrink-0 border-b border-slate-200 bg-slate-50/70 py-4 ${collapsed ? 'px-2' : 'px-4'}`}>
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between gap-3'}`}>
            {!collapsed ? <h2 className="text-base font-semibold text-slate-950">{workflowLabel}</h2> : null}
            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? 'Expand workflow stages' : 'Collapse workflow stages'}
              title={collapsed ? 'Expand workflow stages' : 'Collapse workflow stages'}
            >
              {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            </button>
          </div>
          {!collapsed ? <span className="mt-2 block text-xs font-medium text-slate-500">{Math.max(1, phases.findIndex((phase) => phase.key === selectedPhase?.key) + 1)} of {phases.length}</span> : null}
        </div>
        <nav className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${collapsed ? 'p-2' : 'p-2.5'}`} aria-label={`${workflowLabel} stages`}>
          <ol className="space-y-1.5">
            {phases.map((phase) => {
              const active = phase.key === selectedPhase?.key
              const expanded = active && expandedPhaseKey === phase.key
              const phaseIndex = phases.findIndex((item) => item.key === phase.key)
              const exception = phaseExceptions.get(phase.key)
              return (
                <li key={phase.key}>
                  <button
                    type="button"
                    className={`relative flex min-h-12 w-full items-center gap-3 rounded-xl py-2.5 text-left transition ${collapsed ? 'justify-center px-2' : 'px-3'} ${active ? 'bg-emerald-50 text-emerald-950 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-emerald-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
                    onClick={() => {
                      if (expanded) {
                        onTogglePhase?.(phase.key)
                        return
                      }
                      onTogglePhase?.(phase.key)
                      onSelectTask?.(exception?.primary?.taskKey || phase.currentTask?.key || phase.tasks?.find((task) => !isAttorneyTaskResolved(task.status))?.key || phase.tasks?.[0]?.key)
                    }}
                    aria-current={active ? 'step' : undefined}
                    title={`${phase.label} · ${phase.completed} of ${phase.total} complete`}
                  >
                    <span className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${phase.status === 'completed' ? 'bg-emerald-700 text-white' : active ? 'bg-white text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                      {phase.status === 'completed' ? <CheckCircle2 size={15} /> : phaseIndex + 1}
                    </span>
                    {!collapsed ? <span className="min-w-0 flex-1">
                      <strong className="block text-sm font-semibold leading-5">{phase.label}</strong>
                      <span className="mt-0.5 block text-xs text-slate-500">{phase.completed} / {phase.total} complete{phase.notApplicable ? ` · ${phase.notApplicable} N/A` : ''}</span>
                    </span> : null}
                    {exception && !collapsed ? (
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[0.68rem] font-semibold ${exception.severity === 'critical' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}
                        aria-label={`${exception.count} task exception${exception.count === 1 ? '' : 's'}`}
                      >
                        <AlertTriangle size={12} /> {exception.count}
                      </span>
                    ) : null}
                  </button>
                  {!collapsed && expanded && phase.tasks?.length ? (
                    <ol className="mt-1.5 space-y-1 border-l border-slate-200 pl-3" aria-label={`${phase.label} tasks`}>
                      {phase.tasks.map((task) => {
                        const taskActive = task.key === selectedTaskKey
                        const taskComplete = ['completed', 'completed_externally'].includes(task.displayStatus)
                        return (
                          <li key={task.key}>
                            <button
                              type="button"
                              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${taskActive ? 'bg-emerald-50 font-semibold text-emerald-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
                              aria-current={taskActive ? 'step' : undefined}
                              onClick={() => onSelectTask?.(task.key)}
                            >
                              <span className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full border ${taskComplete ? 'border-emerald-600 bg-emerald-600 text-white' : task.displayStatus === 'in_progress' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-400'}`}>
                                {taskComplete ? <CheckCircle2 size={10} /> : <Circle size={7} />}
                              </span>
                              <span className="min-w-0 flex-1 truncate">{task.label}{task.displayStatus === 'not_applicable' ? ' · N/A' : task.displayStatus === 'completed_externally' ? ' · external' : ''}</span>
                            </button>
                          </li>
                        )
                      })}
                    </ol>
                  ) : null}
                </li>
              )
            })}
          </ol>
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
  error = '',
  successMessage = '',
  onSelectTask,
  onRunAction,
  onOpenDocuments,
  onAddNote,
  onMarkInProgress,
  onPersistTaskResponses,
  statusDraft = null,
  onStatusDraftChange,
  onSubmitStatusDraft,
  onCloseStatusDraft,
  onUxEvent,
  onReviewDocument,
  onSaveConfirmations,
  onSaveMatterNumber,
  onLoadMatterTeam,
  onSaveMatterTeam,
  onSaveSourceDetails,
  onSaveTitleDetails,
  onSaveBondCancellationDecision,
}) {
  const taskTimingRef = useRef({ taskKey: '', startedAt: 0 })
  const uxEventRef = useRef(onUxEvent)
  const [railCollapsed, setRailCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem('arch9:attorney-task-rail:collapsed') === 'true'
    } catch {
      return false
    }
  })
  const [documentModalOpen, setDocumentModalOpen] = useState(false)
  const [previewDocument, setPreviewDocument] = useState(null)
  const [documentTarget, setDocumentTarget] = useState(null)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewReason, setReviewReason] = useState('')
  const [reviewFeedback, setReviewFeedback] = useState('')
  const [reviewError, setReviewError] = useState('')
  const reviewPending = useRef(false)
  const [taskResponses, setTaskResponses] = useState({ existingBond: '', cancellationInstruction: '' })
  const [expandedPhaseKey, setExpandedPhaseKey] = useState(selectedPhaseKey)
  const [matterNumberDraft, setMatterNumberDraft] = useState('')
  const [matterNumberBusy, setMatterNumberBusy] = useState(false)
  const [matterNumberError, setMatterNumberError] = useState('')
  const [teamModalOpen, setTeamModalOpen] = useState(false)
  const [teamLoading, setTeamLoading] = useState(false)
  const [teamSaving, setTeamSaving] = useState(false)
  const [teamError, setTeamError] = useState('')
  const [matterTeam, setMatterTeam] = useState(null)
  const [teamDraft, setTeamDraft] = useState({ firmId: '', attorneyUserId: '', secretaryId: '' })
  const [sourceDetailsDraft, setSourceDetailsDraft] = useState({ purchasePrice: '', propertyDescription: '' })
  const [sourceDetailsBusy, setSourceDetailsBusy] = useState(false)
  const [sourceDetailsError, setSourceDetailsError] = useState('')
  const [titleDetailsDraft, setTitleDetailsDraft] = useState({ identifier: '', tenure: '' })
  const [titleDetailsBusy, setTitleDetailsBusy] = useState(false)
  const [titleDetailsError, setTitleDetailsError] = useState('')
  const [bondDecision, setBondDecision] = useState({ existingBond: '', cancellationRequired: '' })
  const [bondDecisionBusy, setBondDecisionBusy] = useState(false)
  const [bondDecisionError, setBondDecisionError] = useState('')

  useEffect(() => {
    setReviewReason(''); setReviewFeedback(''); setReviewError('')
  }, [previewDocument?.id, model?.taskKey])

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

  useEffect(() => {
    const existingBond = String(model?.note || '').match(/existing bond confirmed:\s*(yes|no|not_applicable)/i)?.[1]?.toLowerCase() || ''
    const cancellationInstruction = String(model?.note || '').match(/cancellation instructions confirmed:\s*(yes|no|not_applicable)/i)?.[1]?.toLowerCase() || ''
    setTaskResponses({ existingBond, cancellationInstruction })
    setPreviewDocument(null)
    setDocumentTarget(null)
    setDocumentModalOpen(false)
  }, [model?.note, model?.taskKey])

  useEffect(() => {
    setMatterNumberDraft(model?.matterNumber || '')
    setMatterNumberError('')
  }, [model?.matterNumber, model?.taskKey])

  useEffect(() => {
    setSourceDetailsDraft({ purchasePrice: model?.sourceDetails?.purchasePrice || '', propertyDescription: model?.sourceDetails?.propertyDescription || '' })
    setSourceDetailsError('')
  }, [model?.sourceDetails?.propertyDescription, model?.sourceDetails?.purchasePrice, model?.taskKey])

  useEffect(() => {
    setTitleDetailsDraft({ identifier: model?.titleDetails?.identifier || '', tenure: model?.titleDetails?.tenure || '' })
    setTitleDetailsError('')
  }, [model?.taskKey, model?.titleDetails?.identifier, model?.titleDetails?.tenure])

  useEffect(() => {
    setBondDecision({ existingBond: '', cancellationRequired: '' })
    setBondDecisionError('')
  }, [model?.taskKey])

  useEffect(() => {
    setExpandedPhaseKey(selectedPhaseKey)
  }, [selectedPhaseKey])

  if (!model || model.empty) return null
  const completionHelpId = `legal-task-completion-help-${model.taskKey}`
  const isBondCancellationConfirmation = [
    'existing_bond_confirmed',
    'cancellation_existing_bond_confirmed',
  ].includes(model.taskKey) || /existing bond.*(cancellation|requirement)|cancellation.*existing bond/i.test(`${model.taskLabel} ${model.taskDescription}`)
  const canEdit = !model.readOnly && !saving
  const attachedDocuments = model.documents.filter(isAttachedDocument)
  const confirmationItems = isBondCancellationConfirmation ? [
    { id: 'existingBond', label: 'Existing bond confirmed' },
    { id: 'cancellationInstruction', label: 'Cancellation instructions confirmed' },
  ] : model.confirmationRequirements || []
  async function review(action) {
    if (reviewPending.current || !previewDocument || !onReviewDocument) return
    reviewPending.current = true
    setReviewBusy(true)
    setReviewFeedback('')
    setReviewError('')
    try {
      const result = await onReviewDocument(previewDocument, action, reviewReason)
      setReviewFeedback(result?.message || 'Review saved.')
      setReviewReason('')
    } catch (error) { setReviewError(error.message || 'Review could not be saved.') }
    finally { reviewPending.current = false; setReviewBusy(false) }
  }

  function toggleRail() {
    setRailCollapsed((current) => {
      const next = !current
      try {
        window.localStorage.setItem('arch9:attorney-task-rail:collapsed', String(next))
      } catch {
        // The preference is non-critical; preserve the in-session preference.
      }
      return next
    })
  }

  async function saveTaskResponses(nextResponses) {
    const previousResponses = taskResponses
    setTaskResponses(nextResponses)
    const responseLines = [
      nextResponses.existingBond ? `Existing bond confirmed: ${nextResponses.existingBond}` : '',
      nextResponses.cancellationInstruction ? `Cancellation instructions confirmed: ${nextResponses.cancellationInstruction}` : '',
    ].filter(Boolean)
    if (!responseLines.length || !onPersistTaskResponses) return
    const saved = await onPersistTaskResponses(responseLines.join('\n'))
    if (saved === false) setTaskResponses(previousResponses)
  }

  async function saveMatterNumber() {
    const next = matterNumberDraft.trim()
    if (!next || !onSaveMatterNumber || matterNumberBusy) return
    setMatterNumberBusy(true)
    setMatterNumberError('')
    try {
      await onSaveMatterNumber(next)
    } catch (error) {
      setMatterNumberError(error?.message || 'Matter number could not be saved.')
    } finally {
      setMatterNumberBusy(false)
    }
  }

  async function openMatterTeam(firmId = '') {
    if (!onLoadMatterTeam || teamLoading) return
    setTeamModalOpen(true)
    setTeamLoading(true)
    setTeamError('')
    try {
      const next = await onLoadMatterTeam(firmId)
      setMatterTeam(next)
      setTeamDraft({
        firmId: next?.assignment?.firmId || next?.firmId || next?.firms?.[0]?.id || '',
        attorneyUserId: next?.assignment?.attorneyUserId || next?.assignment?.primaryAttorneyId || '',
        secretaryId: next?.assignment?.secretaryId || '',
      })
    } catch (error) {
      setTeamError(error?.message || 'Matter team could not be loaded.')
    } finally {
      setTeamLoading(false)
    }
  }

  async function saveMatterTeam() {
    if (!onSaveMatterTeam || teamSaving) return
    setTeamSaving(true)
    setTeamError('')
    try {
      const saved = await onSaveMatterTeam({ ...teamDraft, assignmentId: matterTeam?.assignment?.id || '' })
      setMatterTeam((current) => ({ ...current, assignment: saved }))
      setTeamModalOpen(false)
    } catch (error) {
      setTeamError(error?.message || 'Matter team could not be saved.')
    } finally {
      setTeamSaving(false)
    }
  }

  async function saveSourceDetails() {
    if (!onSaveSourceDetails || sourceDetailsBusy) return
    setSourceDetailsBusy(true)
    setSourceDetailsError('')
    try {
      await onSaveSourceDetails(sourceDetailsDraft)
    } catch (error) {
      setSourceDetailsError(error?.message || 'Source details could not be saved.')
    } finally {
      setSourceDetailsBusy(false)
    }
  }

  async function saveTitleDetails() {
    if (!onSaveTitleDetails || titleDetailsBusy) return
    setTitleDetailsBusy(true)
    setTitleDetailsError('')
    try {
      await onSaveTitleDetails(titleDetailsDraft)
    } catch (error) {
      setTitleDetailsError(error?.message || 'Title details could not be saved.')
    } finally {
      setTitleDetailsBusy(false)
    }
  }

  async function saveBondCancellationDecision() {
    if (!onSaveBondCancellationDecision || bondDecisionBusy) return
    if (!bondDecision.existingBond || !bondDecision.cancellationRequired) {
      setBondDecisionError('Record both the existing bond position and the cancellation decision.')
      return
    }
    setBondDecisionBusy(true)
    setBondDecisionError('')
    try {
      await onSaveBondCancellationDecision(bondDecision)
    } catch (error) {
      setBondDecisionError(error?.message || 'Bond and cancellation decision could not be saved.')
    } finally {
      setBondDecisionBusy(false)
    }
  }

  function documentUrl(document = {}) {
    return document.fileUrl || document.file_url || document.signedUrl || document.signed_url || document.url || ''
  }

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
    // Document work must remain in the task workspace. The modal can then
    // preview existing files or hand off to the contextual upload dialog.
    if (['open_documents', 'upload_document', 'review_document'].includes(action?.id)) {
      const requiredId = String(action.requirementId || action.requirement?.id || '').replace(/^document:/, '')
      const isOtp = (document = {}) => /sales_agreement_or_otp|sales agreement|\botp\b/i.test(`${document.id || ''} ${document.key || ''} ${document.sourceRequirementKey || ''} ${document.displayName || ''} ${document.label || ''} ${document.name || ''}`)
      const target = model.documents.find(document => requiredId && [document.id, document.key, document.sourceRequirementKey].includes(requiredId))
        || (action.reviewOtp ? model.documents.find(isOtp) : null)
        || null
      setDocumentTarget(target)
      setPreviewDocument(target && isAttachedDocument(target) ? target : null)
      setDocumentModalOpen(true)
      return
    }
    onRunAction?.(action)
  }

  function runUtilityAction(actionId, callback) {
    emitActionEvent({ id: actionId }, 'secondary')
    callback?.()
  }

  return (
    <>
      <section className={`archline-transfer-workspace grid items-start gap-4 ${railCollapsed ? 'xl:grid-cols-[72px_minmax(0,1fr)]' : 'xl:grid-cols-[minmax(300px,320px)_minmax(0,1fr)]'}`}>
      <PhaseNavigator
        phases={phases}
        selectedTaskKey={selectedTaskKey}
        selectedPhaseKey={selectedPhaseKey}
        workflowLabel={model.workflowLabel}
        operationalHealth={model.operationalHealth}
        collapsed={railCollapsed}
        expandedPhaseKey={expandedPhaseKey}
        onToggleCollapsed={toggleRail}
        onTogglePhase={(phaseKey) => setExpandedPhaseKey((current) => current === phaseKey ? '' : phaseKey)}
        onSelectTask={onSelectTask}
      />

      <main
        className="min-h-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.035)] xl:h-[calc(100dvh-176px)]"
        aria-busy={saving}
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <header className="shrink-0 px-5 pb-3 pt-5 lg:px-6">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Stage {phases.findIndex((phase) => phase.key === selectedPhaseKey) + 1} · {model.phaseLabel}</span>
            <h2 className="mt-2 min-w-0 text-2xl font-semibold leading-tight tracking-[-0.025em] text-slate-950 sm:text-3xl">{model.taskLabel}</h2>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-slate-200 px-5 py-4 lg:px-6">
            <section className="overflow-hidden rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5">
                <div><h3 className="text-lg font-semibold text-slate-950">Supporting documents</h3><p className="mt-1 text-sm text-slate-500">Review the OTP and any files linked to this task.</p></div>
                {!model.readOnly ? <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => { setPreviewDocument(null); setDocumentTarget(null); setDocumentModalOpen(true) }}><Paperclip size={15} /> Upload document</Button> : null}
              </div>
              <div className="divide-y divide-slate-100">
                {attachedDocuments.slice(0, 6).map((document) => <button key={document.id || document.key || document.sourceRequirementKey} type="button" onClick={() => { setPreviewDocument(document); setDocumentModalOpen(true) }} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50"><FileText size={17} className="shrink-0 text-slate-500" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900">{document.displayName || document.label || document.name || 'Document'}</strong><span className="mt-1 block text-xs text-slate-500">Available</span></span><ChevronRight size={16} className="text-slate-400" /></button>)}
                {!attachedDocuments.length ? <p className="px-4 py-6 text-sm text-slate-500">No supporting documents are attached yet.</p> : null}
              </div>
            </section>

            <section aria-labelledby="legal-task-outstanding-heading" className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5">
                <h3 id="legal-task-outstanding-heading" className="text-lg font-semibold text-slate-950">{model.transferMatterOpeningTask ? 'File setup' : model.transferOtpSourceTask ? 'Source review' : model.transferTitleDeedTask ? 'Ownership review' : model.transferExistingBondTask ? 'Bond and cancellation decision' : 'Required action'}</h3>
                {!model.readOnly ? <span className="text-sm text-slate-500">Complete the relevant items below.</span> : null}
              </div>
              {model.transferMatterOpeningTask ? (
                <div className="divide-y divide-slate-200">
                  <div className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-end lg:justify-between">
                    <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-semibold text-slate-950">Matter number
                      <Field value={matterNumberDraft} disabled={!canEdit || matterNumberBusy} onChange={(event) => setMatterNumberDraft(event.target.value)} placeholder="Enter the firm matter number" />
                      <span className="text-xs font-normal text-slate-500">Saved to the shared matter record.</span>
                    </label>
                    <Button type="button" variant="secondary" disabled={!canEdit || matterNumberBusy || !matterNumberDraft.trim()} onClick={() => void saveMatterNumber()}>{matterNumberBusy ? 'Saving…' : 'Save matter number'}</Button>
                  </div>
                  {matterNumberError ? <p role="alert" className="px-4 pb-3 text-sm text-red-700">{matterNumberError}</p> : null}
                  <div className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div><strong className="block text-sm text-slate-950">Responsible conveyancer or secretary is allocated</strong><p className="mt-1 text-sm text-slate-500">Add the matter team, or confirm that the existing allocation is correct.</p></div>
                    <Button type="button" variant="secondary" disabled={!canEdit} onClick={() => void openMatterTeam()}>Manage matter team</Button>
                  </div>
                </div>
              ) : model.transferOtpSourceTask ? (
                <div className="divide-y divide-slate-200">
                  <div className="grid gap-3 px-4 py-4 lg:grid-cols-2">
                    <label className="grid gap-1.5 text-sm font-semibold text-slate-950">Purchase price
                      <Field type="number" min="0" value={sourceDetailsDraft.purchasePrice} disabled={!canEdit || sourceDetailsBusy} onChange={(event) => setSourceDetailsDraft((current) => ({ ...current, purchasePrice: event.target.value }))} placeholder="Enter purchase price" />
                    </label>
                    <label className="grid gap-1.5 text-sm font-semibold text-slate-950">Property description
                      <Field value={sourceDetailsDraft.propertyDescription} disabled={!canEdit || sourceDetailsBusy} onChange={(event) => setSourceDetailsDraft((current) => ({ ...current, propertyDescription: event.target.value }))} placeholder="Enter the property description" />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-4"><span className="text-xs text-slate-500">Saved to the shared transaction record.</span><Button type="button" variant="secondary" disabled={!canEdit || sourceDetailsBusy} onClick={() => void saveSourceDetails()}>{sourceDetailsBusy ? 'Saving…' : 'Save source details'}</Button></div>
                  {sourceDetailsError ? <p role="alert" className="px-4 pb-3 text-sm text-red-700">{sourceDetailsError}</p> : null}
                </div>
              ) : model.transferTitleDeedTask ? (
                <div className="divide-y divide-slate-200">
                  <div className="grid gap-3 px-4 py-4 lg:grid-cols-2">
                    <label className="grid gap-1.5 text-sm font-semibold text-slate-950">Title deed / property identifier
                      <Field value={titleDetailsDraft.identifier} disabled={!canEdit || titleDetailsBusy} onChange={(event) => setTitleDetailsDraft((current) => ({ ...current, identifier: event.target.value }))} placeholder="Enter title deed or erf number" />
                    </label>
                    <label className="grid gap-1.5 text-sm font-semibold text-slate-950">Property tenure
                      <select className="input" value={titleDetailsDraft.tenure} disabled={!canEdit || titleDetailsBusy} onChange={(event) => setTitleDetailsDraft((current) => ({ ...current, tenure: event.target.value }))}><option value="">Select tenure</option><option value="freehold">Freehold</option><option value="sectional_title">Sectional title</option><option value="estate">Estate</option><option value="other">Other</option></select>
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-4"><span className="text-xs text-slate-500">Saved to the shared transaction record.</span><Button type="button" variant="secondary" disabled={!canEdit || titleDetailsBusy} onClick={() => void saveTitleDetails()}>{titleDetailsBusy ? 'Saving…' : 'Save ownership details'}</Button></div>
                  {titleDetailsError ? <p role="alert" className="px-4 pb-3 text-sm text-red-700">{titleDetailsError}</p> : null}
                </div>
              ) : model.transferExistingBondTask ? (
                <div className="divide-y divide-slate-200">
                  {[
                    ['existingBond', 'Existing bond confirmed', 'Is there an existing mortgage bond registered against the property?'],
                    ['cancellationRequired', 'Cancellation requirement confirmed', 'Is a cancellation attorney required for this matter?'],
                  ].map(([key, label, helper], index) => <div key={key} className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"><div><strong className="block text-sm text-slate-950">{index + 1}. {label}</strong><p className="mt-1 text-sm text-slate-500">{helper}</p></div><div className="flex flex-wrap gap-2">{[['yes', 'Yes'], ['no', 'No'], ['not_applicable', 'Not applicable']].map(([value, choice]) => <Button key={value} type="button" size="sm" variant={bondDecision[key] === value ? 'primary' : 'secondary'} disabled={!canEdit || bondDecisionBusy} onClick={() => setBondDecision((current) => ({ ...current, [key]: value }))}>{choice}</Button>)}</div></div>)}
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"><span className="text-xs text-slate-500">This decision updates whether the cancellation lane applies.</span><Button type="button" variant="secondary" disabled={!canEdit || bondDecisionBusy} onClick={() => void saveBondCancellationDecision()}>{bondDecisionBusy ? 'Saving…' : 'Save decision'}</Button></div>
                  {bondDecisionError ? <p role="alert" className="px-4 pb-3 text-sm text-red-700">{bondDecisionError}</p> : null}
                </div>
              ) : isBondCancellationConfirmation && !onSaveConfirmations ? (
                <div className="divide-y divide-slate-200">
                  {[
                    ['existingBond', 'Existing bond confirmed', 'Is there an existing mortgage bond registered against the property?'],
                    ['cancellationInstruction', 'Cancellation instructions confirmed', 'Have cancellation instructions been received from the seller or bondholder?'],
                  ].map(([key, label, helper], index) => (
                    <div key={key} className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <strong className="block text-sm text-slate-950">{index + 1}. {label}</strong>
                        <p className="mt-1 text-sm text-slate-500">{helper}</p>
                      </div>
                      {!model.readOnly ? <div className="flex flex-wrap gap-2">
                        {[['yes', 'Yes'], ['no', 'No'], ['not_applicable', 'Not applicable']].map(([value, choiceLabel]) => (
                          <button key={value} type="button" disabled={!canEdit} onClick={() => void saveTaskResponses({ ...taskResponses, [key]: value })} className={`min-h-10 rounded-lg border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${taskResponses[key] === value ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-200'} disabled:cursor-not-allowed disabled:opacity-60`}>
                            <span className="mr-2 inline-block size-3 rounded-full border border-current align-[-1px]" />{choiceLabel}
                          </button>
                        ))}
                        <Button type="button" variant="ghost" size="sm" onClick={() => runUtilityAction('add_note', onAddNote)}><MessageSquarePlus size={15} /> Add note</Button>
                      </div> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 bg-white">
                  {model.outstandingRequirements.map((item) => <RequirementRow key={item.id} item={item} action={model.readOnly ? null : model.requirementActions?.[item.id]} saving={saving} onRunAction={runAction} />)}
                  {!model.outstandingRequirements.length ? <li className="flex items-center gap-3 px-4 py-5 text-sm text-emerald-700"><CheckCircle2 size={18} /> All required items are present.</li> : null}
                </ul>
              )}
            </section>

            {onSaveConfirmations ? <TaskConfirmations taskKey={model.taskKey} items={confirmationItems} saved={model.confirmations || {}} disabled={!canEdit || model.taskResolved} onSave={onSaveConfirmations} /> : null}
            {!model.readOnly && model.contextualActions?.length ? <div className="mt-4 flex flex-wrap gap-2">{model.contextualActions.map(action => <Button key={action.id} type="button" variant="secondary" disabled={saving || action.disabled} onClick={() => runAction(action, 'task')}>{action.label}</Button>)}</div> : null}
          </div>

          <footer className="shrink-0 border-t border-slate-200 bg-slate-50/75 px-5 py-3.5 lg:px-6">
            {error ? <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
            {!error && successMessage ? <p role="status" className="mb-3 text-sm text-emerald-800">{successMessage}</p> : null}
            {!model.readOnly && [...(model.outcomeActions || []), ...(model.followUpActions || [])].length ? (
              <details className="mb-3 text-sm text-slate-700">
                <summary className="w-fit cursor-pointer font-medium">Task outcome options</summary>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[...(model.outcomeActions || []), ...(model.followUpActions || [])].map(action => (
                    <Button key={action.id} type="button" variant="secondary" size="sm" disabled={saving || action.disabled} onClick={() => runAction(action, 'outcome')}>{action.label}</Button>
                  ))}
                </div>
              </details>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {!model.readOnly && !model.taskResolved ? (
                  <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={onMarkInProgress}>
                    <Save size={15} /> Save progress
                  </Button>
                ) : null}
                {!model.readOnly && model.uploadAction ? <Button type="button" variant="ghost" size="sm" disabled={saving || model.uploadAction.disabled} onClick={() => { setPreviewDocument(null); setDocumentModalOpen(true) }}>
                  <Paperclip size={15} /> Upload document
                </Button> : null}
              </div>
              {model.completeAction ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={saving || !model.canComplete || model.completeAction.disabled}
                  aria-describedby={!model.requirementsSatisfied ? completionHelpId : undefined}
                  onClick={() => runAction(model.completeAction, 'completion')}
                >
                  <CheckCircle2 size={15} /> Complete task
                </Button>
              ) : null}
            </div>
            {model.readOnly ? <p id={`${completionHelpId}-access`} className="mt-2 text-xs text-slate-600">Read-only workflow. You can review this matter and its supporting documents.</p> : null}
            {!model.requirementsSatisfied ? (
              <details className="mt-2 text-xs text-slate-600">
                <summary id={completionHelpId} className="w-fit cursor-pointer focus-visible:outline-emerald-700">{model.outstandingRequirements.length ? `${model.outstandingRequirements.length} outstanding item${model.outstandingRequirements.length === 1 ? '' : 's'}` : 'Outstanding checks'}</summary>
                <p className="mt-1">Missing evidence remains visible after completion. {model.completeAction?.requiresNote ? 'Add a completion note to explain the outcome.' : 'Review the outstanding items before completing the task.'}</p>
              </details>
            ) : null}
          </footer>
        </div>
      </main>
      </section>

      <Modal
        open={teamModalOpen}
        title="Responsible matter team"
        subtitle="Allocate the conveyancer and secretary for this transfer matter."
        onClose={teamSaving ? undefined : () => setTeamModalOpen(false)}
        footer={<div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={teamSaving} onClick={() => setTeamModalOpen(false)}>Cancel</Button><Button type="button" disabled={teamLoading || teamSaving || !teamDraft.attorneyUserId} onClick={() => void saveMatterTeam()}>{teamSaving ? 'Saving…' : matterTeam?.assignment ? 'Confirm allocation' : 'Save allocation'}</Button></div>}
      >
        {teamLoading ? <p className="text-sm text-slate-500">Loading the firm team…</p> : <div className="grid gap-4">
          {teamError ? <p role="alert" className="text-sm text-red-700">{teamError}</p> : null}
          {!matterTeam?.assignment ? <label className="grid gap-1.5 text-sm font-semibold">Attorney firm<select className="input" value={teamDraft.firmId} onChange={(event) => void openMatterTeam(event.target.value)}><option value="">Select firm</option>{(matterTeam?.firms || []).map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}</select></label> : null}
          <label className="grid gap-1.5 text-sm font-semibold">Responsible conveyancer<select className="input" value={teamDraft.attorneyUserId} onChange={(event) => setTeamDraft((current) => ({ ...current, attorneyUserId: event.target.value }))} disabled={!teamDraft.firmId}><option value="">Select conveyancer</option>{(matterTeam?.members?.primaryAttorneys || []).map((member) => <option key={member.userId} value={member.userId}>{member.label}</option>)}</select></label>
          <label className="grid gap-1.5 text-sm font-semibold">Secretary <span className="font-normal text-slate-500">(optional)</span><select className="input" value={teamDraft.secretaryId} onChange={(event) => setTeamDraft((current) => ({ ...current, secretaryId: event.target.value }))} disabled={!teamDraft.firmId}><option value="">No secretary allocated</option>{(matterTeam?.members?.secretaries || []).map((member) => <option key={member.userId} value={member.userId}>{member.label}</option>)}</select></label>
          {matterTeam?.assignment ? <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">Review the current people above and confirm the allocation if it is correct.</p> : null}
        </div>}
      </Modal>

      <Modal
        open={documentModalOpen}
        title="Supporting documents"
        subtitle={model.taskLabel}
        onClose={saving || reviewBusy ? undefined : () => setDocumentModalOpen(false)}
        className="max-w-5xl"
        footer={<div className="flex flex-wrap justify-between gap-2"><Button type="button" variant="secondary" onClick={() => setDocumentModalOpen(false)} disabled={saving || reviewBusy}>Close</Button>{!model.readOnly ? <Button type="button" disabled={saving || reviewBusy} onClick={() => { setDocumentModalOpen(false); runUtilityAction('upload_document', () => onOpenDocuments?.(previewDocument || documentTarget)) }}><Paperclip size={15} /> Upload document</Button> : null}</div>}
      >
        {!model.readOnly && previewDocument && onReviewDocument ? <div className="mb-4 space-y-2 rounded-xl border border-slate-200 p-3">
          {reviewError ? <p role="alert" className="text-sm text-red-700">{reviewError}</p> : null}
          {reviewFeedback ? <p role="status" className="text-sm text-emerald-800">{reviewFeedback}</p> : null}
          <label className="grid gap-1 text-sm">Review note / correction needed<Field as="textarea" rows={2} disabled={reviewBusy} value={reviewReason} onChange={event => setReviewReason(event.target.value)} /></label>
          <div className="flex gap-2"><Button type="button" disabled={reviewBusy} onClick={() => review('approve')}>Approve document</Button><Button type="button" variant="secondary" disabled={reviewBusy || !reviewReason.trim()} onClick={() => review('reject')}>Request correction</Button></div>
        </div> : null}
        <div className="grid gap-4 lg:grid-cols-[minmax(14rem,0.42fr)_minmax(0,1fr)]">
          <div className="max-h-[52vh] space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
            {attachedDocuments.length ? attachedDocuments.map((document) => <button key={document.id || document.key || document.sourceRequirementKey} type="button" disabled={reviewBusy} onClick={() => setPreviewDocument(document)} className={`w-full rounded-lg px-3 py-3 text-left text-sm transition ${previewDocument === document ? 'bg-emerald-50 text-emerald-950' : 'hover:bg-slate-50 text-slate-700'}`}><strong className="block truncate">{document.displayName || document.label || document.name || 'Document'}</strong><span className="mt-1 block text-xs text-slate-500">Available</span></button>) : <p className="p-3 text-sm text-slate-500">No supporting documents are attached yet.</p>}
          </div>
          <div className="min-h-[18rem] rounded-xl border border-slate-200 bg-slate-50 p-4">
            {previewDocument ? <div className="flex h-full flex-col"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-950">{previewDocument.displayName || previewDocument.label || previewDocument.name || 'Document'}</h3><p className="mt-1 text-xs text-slate-500">{previewDocument.ready ? 'Available for review' : 'Document is still outstanding'}</p></div>{documentUrl(previewDocument) ? <a href={documentUrl(previewDocument)} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-semibold text-emerald-800 hover:text-emerald-950">Download</a> : null}</div>{documentUrl(previewDocument) ? <iframe title={`Preview ${previewDocument.displayName || previewDocument.name || 'document'}`} src={documentUrl(previewDocument)} className="mt-4 min-h-[24rem] w-full rounded-lg border border-slate-200 bg-white" /> : <div className="flex flex-1 items-center justify-center text-center text-sm text-slate-500">A preview is not available for this file. Use Download to open it.</div>}</div> : <div className="flex h-full items-center justify-center text-center text-sm text-slate-500">Choose a document to preview it here.</div>}
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(statusDraft?.open)}
        title={statusDraft?.actionLabel || 'Update task status'}
        onClose={onCloseStatusDraft}
        footer={(
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={saving} onClick={onCloseStatusDraft}>Cancel</Button>
            <Button
              type="submit"
              form="legal-task-workbench-status-form"
              disabled={saving || (statusDraft?.requiresReason && !statusDraft?.reason?.trim()) || (statusDraft?.requiresNote && !statusDraft?.note?.trim()) || (statusDraft?.visibility === 'client_visible' && !statusDraft?.note?.trim())}
            >
              {saving ? 'Updating…' : statusDraft?.actionLabel || 'Update status'}
            </Button>
          </div>
        )}
      >
        <form id="legal-task-workbench-status-form" className="space-y-4" aria-busy={saving} onSubmit={onSubmitStatusDraft}>
          {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
          <div>
            <span className="text-xs font-medium text-slate-500">Task</span>
            <strong className="mt-1 block text-sm font-semibold text-slate-950">{statusDraft?.task?.label || model.taskLabel}</strong>
          </div>
          {statusDraft?.status === 'completed' ? (
            model.clientUpdate?.available ? (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-700"
                  checked={statusDraft?.visibility === 'client_visible'}
                  onChange={(event) => onStatusDraftChange?.({
                    ...statusDraft,
                    visibility: event.target.checked ? 'client_visible' : 'professional_shared',
                  })}
                />
                <span>
                  <strong className="block font-semibold text-slate-900">Also notify {model.clientUpdate.audienceLabel}</strong>
                  <span className="mt-1 block leading-5">Requires a client-safe note. The professional team is updated automatically.</span>
                </span>
              </label>
            ) : (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                This completion is shared with the professional matter team only.
              </p>
            )
          ) : null}
          {statusDraft?.requiresReason ? (
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Reason <span className="text-red-600">*</span>
              <Field
                autoFocus
                value={statusDraft?.reason || ''}
                onChange={(event) => onStatusDraftChange?.({ ...statusDraft, reason: event.target.value })}
                placeholder={statusDraft?.status === 'not_applicable' ? 'Why does this task not apply?' : statusDraft?.status === 'completed_externally' ? 'What was done and where is the evidence held?' : 'What is preventing this task from progressing?'}
              />
            </label>
          ) : null}
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Notes {statusDraft?.requiresNote || statusDraft?.visibility === 'client_visible' ? <span className="text-red-600">*</span> : null}
            <Field
              as="textarea"
              rows={4}
              value={statusDraft?.note || ''}
              onChange={(event) => onStatusDraftChange?.({ ...statusDraft, note: event.target.value })}
              placeholder={statusDraft?.visibility === 'client_visible' ? 'Write a clear, client-safe completion update.' : statusDraft?.requiresNote ? 'Explain why this task is ready to complete despite the outstanding items.' : 'Record the outcome or next follow-up.'}
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
