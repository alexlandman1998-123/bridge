import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Circle,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  MoreHorizontal,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../../ui/Button.jsx'
import Field from '../../ui/Field.jsx'
import Modal from '../../ui/Modal.jsx'
import TaskConfirmations from './TaskConfirmations.jsx'
import TransferStageTaskNavigation from './TransferStageTaskNavigation.jsx'
import TransferJourneyUpdateComposer from './TransferJourneyUpdateComposer.jsx'
import { isAttorneyTaskResolved } from '../../../core/transactions/attorneyTaskOutcomes.js'
import { getNextTransferStageTask } from '../../../core/transactions/transferWorkspaceNavigation.js'
import { relevantLegalTaskDocuments } from '../../../core/transactions/legalTaskWorkbenchModel.js'

const CLEARANCE_TASK_SCOPE = {
  municipal_rates_clearance_review: ['municipal', 'Municipal rates certificate'],
  body_corporate_levy_clearance_review: ['bodyCorporate', 'Body corporate certificate'],
  hoa_clearance_review: ['hoa', 'HOA certificate'],
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
  const [showAllTasks, setShowAllTasks] = useState(false)
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
    <aside className={`min-h-0 transition-[width] duration-200 xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:self-start ${collapsed ? 'xl:w-[72px]' : ''}`}>
      <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.035)] xl:max-h-[calc(100dvh-7rem)]">
        <div className={`shrink-0 border-b border-slate-200 py-5 ${collapsed ? 'px-2' : 'px-5'}`}>
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
          {!collapsed ? <span className="mt-1 block text-xs font-medium text-slate-500">{Math.max(1, phases.findIndex((phase) => phase.key === selectedPhase?.key) + 1)} of {phases.length} stages</span> : null}
        </div>
        <nav className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${collapsed ? 'p-2' : 'p-3'}`} aria-label={`${workflowLabel} stages`}>
          <ol className="space-y-2">
            {phases.map((phase) => {
              const active = phase.key === selectedPhase?.key
              const expanded = active && expandedPhaseKey === phase.key
              const phaseIndex = phases.findIndex((item) => item.key === phase.key)
              const exception = phaseExceptions.get(phase.key)
              const selectedTaskIndex = Math.max(0, (phase.tasks || []).findIndex((task) => task.key === selectedTaskKey))
              const visiblePhaseTasks = showAllTasks
                ? phase.tasks || []
                : (phase.tasks || []).slice(Math.max(0, selectedTaskIndex - 1), selectedTaskIndex + 2)
              return (
                <li key={phase.key}>
                  <button
                    type="button"
                    className={`relative flex min-h-[84px] w-full items-center gap-3 rounded-xl border py-3 text-left transition ${collapsed ? 'justify-center px-2' : 'px-4'} ${active ? 'border-emerald-200 bg-white text-slate-950 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950'}`}
                    onClick={() => {
                      if (expanded) {
                        onTogglePhase?.(phase.key)
                        return
                      }
                      const nextTaskKey = exception?.primary?.taskKey || phase.currentTask?.key || phase.tasks?.find((task) => !isAttorneyTaskResolved(task.status))?.key || phase.tasks?.[0]?.key
                      if (onSelectTask?.(nextTaskKey) === false) return
                      setShowAllTasks(false)
                      onTogglePhase?.(phase.key)
                    }}
                    aria-current={active ? 'step' : undefined}
                    title={`${phase.label} · ${phase.completed} of ${phase.total} complete`}
                  >
                    <span className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${phase.status === 'completed' ? 'bg-emerald-700 text-white' : active ? 'bg-white text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                      {phase.status === 'completed' ? <CheckCircle2 size={15} /> : phaseIndex + 1}
                    </span>
                    {!collapsed ? <span className="min-w-0 flex-1">
                      <strong className="block text-sm font-semibold leading-5">{phase.label}</strong>
                      <span className="mt-0.5 block text-xs text-slate-500">{phase.completed} of {phase.total} complete</span>
                    </span> : null}
                    {exception && !collapsed ? (
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[0.68rem] font-semibold ${exception.severity === 'critical' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}
                        aria-label={`${exception.count} task exception${exception.count === 1 ? '' : 's'}`}
                      >
                        <AlertTriangle size={12} /> {exception.count}
                      </span>
                    ) : null}
                    {!collapsed ? <ChevronRight size={16} className={`shrink-0 text-slate-500 transition ${expanded ? 'rotate-90' : ''}`} /> : null}
                  </button>
                  {!collapsed && expanded && phase.tasks?.length ? (
                    <ol className="mt-1.5 space-y-1 border-l border-slate-200 pl-3" aria-label={`${phase.label} tasks`}>
                      {visiblePhaseTasks.map((task) => {
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
                              <span className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full border ${taskComplete ? 'border-emerald-600 bg-emerald-600 text-white' : taskActive ? 'border-emerald-600 bg-white text-emerald-700' : 'border-slate-300 bg-white text-slate-400'}`}>
                                {taskComplete ? <CheckCircle2 size={10} /> : <Circle size={7} />}
                              </span>
                              <span className="min-w-0 flex-1 truncate">{task.label}{task.displayStatus === 'not_applicable' ? ' · N/A' : task.displayStatus === 'completed_externally' ? ' · external' : ''}</span>
                            </button>
                          </li>
                        )
                      })}
                      {phase.tasks.length > visiblePhaseTasks.length ? <li><button type="button" className="px-2 py-2 text-xs font-semibold text-emerald-800 hover:underline" onClick={() => setShowAllTasks(true)}>View all {phase.tasks.length} tasks →</button></li> : null}
                      {showAllTasks && phase.tasks.length > 3 ? <li><button type="button" className="px-2 py-2 text-xs font-semibold text-slate-500 hover:underline" onClick={() => setShowAllTasks(false)}>Show fewer tasks</button></li> : null}
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
  focusedStage = false,
  taskMeta = null,
  saving = false,
  error = '',
  successMessage = '',
  onSelectTask,
  onRunAction,
  onOpenDocuments,
  onOpenDocumentLibrary,
  onRequestDocument,
  onOpenRoutingProfile,
  onOpenJourneyPublisher,
  journeyStageKey = '',
  onPublishJourneyUpdate,
  canPublishJourneyUpdate = false,
  onMarkInProgress,
  onQuickComplete,
  onPersistTaskResponses,
  statusDraft = null,
  onStatusDraftChange,
  onSubmitStatusDraft,
  onCloseStatusDraft,
  onUxEvent,
  onReviewDocument,
  onSaveConfirmations,
  onConfirmationDirtyChange,
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
  const [documentAction, setDocumentAction] = useState(null)
  const [documentSearch, setDocumentSearch] = useState('')
  const [documentListLimit, setDocumentListLimit] = useState(40)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewReason, setReviewReason] = useState('')
  const [reviewFeedback, setReviewFeedback] = useState('')
  const [reviewError, setReviewError] = useState('')
  const [utilityError, setUtilityError] = useState('')
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
  const [answersDirty, setAnswersDirty] = useState(false)
  const [journeyUpdateOpen, setJourneyUpdateOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('checklist')
  const [taskOptionsOpen, setTaskOptionsOpen] = useState(false)

  const openJourneyPublisher = () => {
    setJourneyUpdateOpen(true)
    onOpenJourneyPublisher?.()
  }

  useEffect(() => {
    setReviewReason(''); setReviewFeedback(''); setReviewError('')
  }, [previewDocument?.id, model?.taskKey])

  useEffect(() => {
    if (!documentModalOpen) return
    setDocumentSearch('')
    setDocumentListLimit(40)
  }, [documentModalOpen, model?.taskKey])

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
    setDocumentAction(null)
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
    setExpandedPhaseKey(selectedPhaseKey)
  }, [selectedPhaseKey])
  useEffect(() => {
    setActiveTab('checklist')
    setTaskOptionsOpen(false)
  }, [model?.taskKey])

  if (!model || model.empty) return null
  const completionHelpId = `legal-task-completion-help-${model.taskKey}`
  const isBondCancellationConfirmation = [
    'existing_bond_confirmed',
    'cancellation_existing_bond_confirmed',
  ].includes(model.taskKey) || /existing bond.*(cancellation|requirement)|cancellation.*existing bond/i.test(`${model.taskLabel} ${model.taskDescription}`)
  const canEdit = !model.readOnly && !saving
  const attachedDocuments = model.documents.filter(isAttachedDocument)
  const visibleDocuments = documentAction?.id === 'review_document'
    ? relevantLegalTaskDocuments(attachedDocuments, documentAction)
    : attachedDocuments
  const filteredDocuments = documentSearch.trim()
    ? visibleDocuments.filter((document) => `${document.displayName || document.label || document.name || ''} ${document.sourceRequirementKey || ''}`.toLowerCase().includes(documentSearch.trim().toLowerCase()))
    : visibleDocuments
  const missingFocusedDocument = documentAction?.id === 'review_document' && visibleDocuments.length === 0
  const focusedDocumentLabel = documentAction?.reviewOtp ? 'OTP' : documentAction?.requirementLabel || 'document'
  const canUploadDocument = !model.readOnly && Boolean(model.uploadAction && !model.uploadAction.disabled && onOpenDocuments)
  const canRequestDocument = missingFocusedDocument && !model.readOnly && Boolean(model.requestDocumentAction && !model.requestDocumentAction.disabled && onRequestDocument)
  const missingDocumentGuidance = canUploadDocument && canRequestDocument
    ? `Upload the ${focusedDocumentLabel} or request it from the responsible party before reviewing it.`
    : canUploadDocument ? `Upload the ${focusedDocumentLabel} before reviewing it.`
      : canRequestDocument ? `Request the ${focusedDocumentLabel} from the responsible party before reviewing it.`
        : 'Ask the responsible matter team to provide access to the file before reviewing it.'
  const activePhase = phases.find((phase) => phase.key === selectedPhaseKey) || phases[0] || null
  const taskIndex = Math.max(0, (activePhase?.tasks || []).findIndex((task) => task.key === selectedTaskKey))
  const nextStageTask = focusedStage ? getNextTransferStageTask(activePhase, selectedTaskKey) : null
  const followingPhase = phases[phases.findIndex((phase) => phase.key === selectedPhaseKey) + 1] || null
  const continuationTask = nextStageTask || (activePhase?.status === 'completed' ? followingPhase?.tasks?.[0] : null)
  const phaseProgress = activePhase?.total ? Math.round((activePhase.completed / activePhase.total) * 100) : 0
  const primaryAction = Object.values(model.requirementActions || {}).find((action) => action?.id === 'review_document' && !action.disabled)
    || model.primaryAction
    || Object.values(model.requirementActions || {}).find((action) => action && !action.disabled)
  const baseConfirmationItems = isBondCancellationConfirmation && !onSaveConfirmations ? [
    { id: 'existingBond', label: 'Existing bond confirmed' },
    { id: 'cancellationInstruction', label: 'Cancellation instructions confirmed' },
  ] : model.confirmationRows || model.confirmationRequirements || []
  const primaryAlreadyAvailable = baseConfirmationItems.some(item => item.action?.id === primaryAction?.id)
    || (['request_document', 'upload_document', 'open_documents'].includes(primaryAction?.id) && baseConfirmationItems.some(item => item.documentStatus))
    || ['add_note', 'upload_document', 'open_documents'].includes(primaryAction?.id)
    || model.contextualActions?.some(action => action.id === primaryAction?.id)
  const confirmationItems = !model.readOnly && primaryAction?.source === 'work' && !primaryAlreadyAvailable && baseConfirmationItems.length
    ? baseConfirmationItems.map((item, index) => index === 0 ? { ...item, additionalAction: primaryAction } : item)
    : baseConfirmationItems
  function handleAnswersDirtyChange(taskKey, dirty) {
    setAnswersDirty(dirty)
    if (!dirty) setUtilityError((previous) => previous === 'Save your answers before changing the task status.' ? '' : previous)
    onConfirmationDirtyChange?.(taskKey, dirty)
  }
  function openDocumentLibrarySafely() {
    if (onOpenDocumentLibrary?.() === false) return
    setDocumentModalOpen(false)
  }
  async function review(action) {
    if (reviewPending.current) return
    if (!previewDocument || !onReviewDocument) {
      setReviewError('Select a linked document before reviewing it. If review is unavailable, reload the task and try again.')
      return
    }
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
    if (answersDirty && (action?.source === 'status' || action?.id === 'mark_complete' || model.statusActions?.some((item) => item.id === action?.id))) {
      setUtilityError('Save your answers before changing the task status.')
      return
    }
    emitActionEvent(action, placement)
    if (action?.id === 'open_party_capacity') {
      if (!onOpenRoutingProfile) {
        setUtilityError('The party and signatory editor is unavailable. Reload the matter and try again.')
        return
      }
      onOpenRoutingProfile()
      return
    }
    // Document work must remain in the task workspace. The modal can then
    // preview existing files or hand off to the contextual upload dialog.
    if (['open_documents', 'upload_document', 'review_document'].includes(action?.id)) {
      const candidates = relevantLegalTaskDocuments(model.documents, action)
      const target = candidates.find(isAttachedDocument) || candidates[0] || null
      setDocumentAction(action)
      setDocumentTarget(target)
      setPreviewDocument(target && isAttachedDocument(target) ? target : null)
      setDocumentModalOpen(true)
      return
    }
    onRunAction?.(action)
  }

  function runUtilityAction(actionId, callback) {
    emitActionEvent({ id: actionId }, 'secondary')
    setUtilityError('')
    if (typeof callback !== 'function') {
      setUtilityError('This action is unavailable. Reload the task and try again.')
      return
    }
    return Promise.resolve().then(callback).catch(error => {
      setUtilityError(error?.message || 'The action could not be opened. Please try again.')
    })
  }

  async function saveConfirmationRows(responses) {
    const saved = await onSaveConfirmations(responses)
    if (!saved) return false
    if (model.transferExistingBondTask && onSaveBondCancellationDecision) {
      const existingBond = responses.seller_existing_bond_position?.answer
      const cancellationRequired = responses.cancellation_lane_required?.answer
      if (existingBond && cancellationRequired) {
        try {
          await onSaveBondCancellationDecision({ existingBond, cancellationRequired })
        } catch (error) {
          throw new Error(`Answers saved, but the bond and cancellation decision was not updated: ${error?.message || 'Try again.'}`)
        }
      }
    }
    return true
  }

  function renderConfirmationRowDetails(item) {
    if (model.transferMatterOpeningTask && /matter number/i.test(`${item.id} ${item.label}`)) return <div className="space-y-2">
      <label className="grid gap-1.5 text-sm font-semibold text-slate-950">Matter number
        <Field value={matterNumberDraft} disabled={!canEdit || matterNumberBusy} onChange={event => setMatterNumberDraft(event.target.value)} placeholder="Enter the firm matter number" />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-500">Saved to the shared matter record.</span><Button type="button" variant="secondary" size="sm" disabled={!canEdit || matterNumberBusy || !matterNumberDraft.trim()} onClick={() => void saveMatterNumber()}>{matterNumberBusy ? 'Saving…' : 'Save matter number'}</Button></div>
      {matterNumberError ? <p role="alert" className="text-xs text-red-700">{matterNumberError}</p> : null}
    </div>
    if (model.transferMatterOpeningTask && /conveyancer|secretary|allocated/i.test(`${item.id} ${item.label}`)) return <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-slate-600">Add the matter team or confirm the existing allocation.</span>
      <Button type="button" variant="secondary" size="sm" disabled={!canEdit} onClick={() => void openMatterTeam()}>Manage matter team</Button>
    </div>
    if (model.transferOtpSourceTask && item.id === 'source_details_checked') return <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-semibold text-slate-950">Purchase price<Field type="number" min="0" value={sourceDetailsDraft.purchasePrice} disabled={!canEdit || sourceDetailsBusy} onChange={event => setSourceDetailsDraft(current => ({ ...current, purchasePrice: event.target.value }))} placeholder="Enter purchase price" /></label>
        <label className="grid gap-1.5 text-sm font-semibold text-slate-950">Property description<Field value={sourceDetailsDraft.propertyDescription} disabled={!canEdit || sourceDetailsBusy} onChange={event => setSourceDetailsDraft(current => ({ ...current, propertyDescription: event.target.value }))} placeholder="Enter the property description" /></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-500">Saved to the shared transaction record.</span><Button type="button" variant="secondary" size="sm" disabled={!canEdit || sourceDetailsBusy} onClick={() => void saveSourceDetails()}>{sourceDetailsBusy ? 'Saving…' : 'Save source details'}</Button></div>
      {sourceDetailsError ? <p role="alert" className="text-xs text-red-700">{sourceDetailsError}</p> : null}
    </div>
    if (model.transferTitleDeedTask && item.id === 'title_or_ownership_source_checked') return <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-semibold text-slate-950">Title deed / property identifier<Field value={titleDetailsDraft.identifier} disabled={!canEdit || titleDetailsBusy} onChange={event => setTitleDetailsDraft(current => ({ ...current, identifier: event.target.value }))} placeholder="Enter title deed or erf number" /></label>
        <label className="grid gap-1.5 text-sm font-semibold text-slate-950">Property tenure<select className="input" value={titleDetailsDraft.tenure} disabled={!canEdit || titleDetailsBusy} onChange={event => setTitleDetailsDraft(current => ({ ...current, tenure: event.target.value }))}><option value="">Select tenure</option><option value="freehold">Freehold</option><option value="sectional_title">Sectional title</option><option value="estate">Estate</option><option value="other">Other</option></select></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-500">Saved to the shared transaction record.</span><Button type="button" variant="secondary" size="sm" disabled={!canEdit || titleDetailsBusy} onClick={() => void saveTitleDetails()}>{titleDetailsBusy ? 'Saving…' : 'Save ownership details'}</Button></div>
      {titleDetailsError ? <p role="alert" className="text-xs text-red-700">{titleDetailsError}</p> : null}
    </div>
    if (model.transferExistingBondTask && item.id === 'cancellation_lane_required') return <p className="text-xs text-slate-600">Save both answers to update whether the cancellation lane applies to this matter.</p>
    if (model.specialistRouteTask && item.id === confirmationItems[0]?.id) return <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-600">Review the specialist owner, reason, instrument and evidence.</span><Button type="button" variant="secondary" size="sm" disabled={!canEdit} onClick={() => onOpenRoutingProfile?.()}>Open specialist classification</Button></div>
    return null
  }

  return (
    <>
      {focusedStage && activePhase ? <TransferStageTaskNavigation phase={activePhase} selectedTaskKey={selectedTaskKey} onSelectTask={onSelectTask} /> : null}
      <section className={`archline-transfer-workspace grid items-start gap-5 ${focusedStage ? 'mt-5 grid-cols-1' : railCollapsed ? 'xl:grid-cols-[72px_minmax(0,1fr)]' : 'xl:grid-cols-[minmax(340px,360px)_minmax(0,1fr)]'}`}>
      {!focusedStage ? <PhaseNavigator
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
      /> : null}

      <main
        className="min-h-[560px] rounded-2xl border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.035)]"
        aria-busy={saving}
      >
        <div className="flex min-h-[560px] flex-col">
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 px-5 pb-5 pt-6 lg:px-7">
            <div className="min-w-0 flex-1">
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">{focusedStage ? `Task ${taskIndex + 1} of ${activePhase?.tasks?.length || 1}` : `Stage ${phases.findIndex((phase) => phase.key === selectedPhaseKey) + 1} · ${activePhase?.label || model.phaseLabel}`}</span>
              <h2 className="mt-2 min-w-0 text-2xl font-semibold leading-tight tracking-[-0.025em] text-slate-950 sm:text-3xl">{model.taskLabel}</h2>
              {!focusedStage && model.taskDescription ? <p className="mt-2 max-w-2xl text-sm leading-5 text-slate-600">{model.taskDescription}</p> : null}
            </div>
            {focusedStage ? <div className="flex flex-wrap items-center gap-2">
              {onPublishJourneyUpdate ? <Button type="button" variant="secondary" size="sm" disabled={!canPublishJourneyUpdate || !journeyStageKey} onClick={openJourneyPublisher}>Add stage update</Button> : null}
              {!model.readOnly && model.canMarkInProgress ? <Button type="button" variant="secondary" size="sm" disabled={saving || answersDirty} onClick={onMarkInProgress}><Circle size={15} /> Mark in progress</Button> : null}
              {!model.readOnly && model.completeAction ? <Button type="button" size="sm" disabled={saving || answersDirty || !model.canComplete || model.completeAction.disabled} onClick={() => model.requirementsSatisfied && !model.completeAction.requiresNote && onQuickComplete ? void onQuickComplete() : runAction(model.completeAction, 'completion')}><CheckCircle2 size={15} /> Complete task</Button> : null}
              {!model.readOnly ? <div className="relative"><button type="button" className="inline-flex size-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="Task options" aria-expanded={taskOptionsOpen} onClick={() => setTaskOptionsOpen((current) => !current)}><MoreHorizontal size={18} /></button>{taskOptionsOpen ? <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                {model.completeAction ? <button type="button" disabled={model.completeAction.disabled || answersDirty} className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50" onClick={() => { setTaskOptionsOpen(false); runAction({ ...model.completeAction, manualOverride: true }, 'outcome') }}>Mark complete manually</button> : null}
                {(model.outcomeActions || []).map((action) => <button key={action.id} type="button" disabled={action.disabled} className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50" onClick={() => { setTaskOptionsOpen(false); runAction(action, 'outcome') }}>{action.label}</button>)}
              </div> : null}</div> : null}
            </div> : activePhase ? <div className="w-full shrink-0 sm:w-56"><span className="text-xs font-semibold text-slate-600">Stage progress</span><span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-200"><span className="block h-full rounded-full bg-emerald-700" style={{ width: `${phaseProgress}%` }} /></span><span className="mt-1 block text-xs text-slate-500">{activePhase.completed} of {activePhase.total} complete</span>{onPublishJourneyUpdate ? <Button type="button" variant="secondary" size="sm" className="mt-3 w-full" disabled={!canPublishJourneyUpdate || !journeyStageKey} onClick={openJourneyPublisher}>Add stage update</Button> : null}</div> : null}
            {utilityError || error ? <p role="alert" className="w-full text-sm text-red-700">{utilityError || error}</p> : !error && successMessage ? <p role="status" className="w-full text-sm text-emerald-800">{successMessage}</p> : null}
            {focusedStage && model.readOnly ? <p className="w-full text-xs text-slate-600">Read-only workflow. You can review this task and its documents.</p> : null}
            {focusedStage && answersDirty ? <p role="status" className="w-full text-xs text-amber-800">Save your confirmation answers before changing task status or moving to another task.</p> : null}
          </header>

          <div className={focusedStage ? 'grid flex-1 lg:grid-cols-[minmax(0,1fr)_320px]' : 'flex-1'}>
          <div className="min-w-0">
          {focusedStage ? <nav className="flex gap-1 overflow-x-auto border-y border-slate-200 px-5 lg:px-7" aria-label="Task sections">{[
            ['checklist', 'Checklist'], ['details', 'Details'], ['documents', `Documents (${model.documents.length})`], ['notes', `Notes (${model.notes.length})`], ['activity', 'Activity'],
          ].map(([key, label]) => <button key={key} type="button" aria-current={activeTab === key ? 'page' : undefined} onClick={() => setActiveTab(key)} className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-medium transition ${activeTab === key ? 'border-emerald-700 text-emerald-800' : 'border-transparent text-slate-600 hover:text-slate-950'}`}>{label}</button>)}</nav> : null}
          <div className="min-h-0 flex-1 px-5 py-5 lg:px-7">
            <div hidden={focusedStage && activeTab !== 'details'} className="space-y-4">
            {model.stageTwoParties?.length ? <section className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3" aria-label="Parties in this task">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold text-slate-900">People and entities in this review</h3><p className="mt-0.5 text-xs text-slate-600">Evidence and capacity decisions must belong to the named party.</p></div><Button type="button" variant="secondary" size="sm" onClick={() => onOpenRoutingProfile?.()} disabled={!onOpenRoutingProfile}>Review party details</Button></div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">{model.stageTwoParties.map(party => <div key={party.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><strong className="block text-slate-900">{party.name}</strong><span className="text-xs capitalize text-slate-600">{party.entityType.replaceAll('_', ' ')} · {party.status}</span>{party.signatories.length ? <span className="mt-1 block text-xs text-slate-600">Signatories: {party.signatories.join(', ')}</span> : null}{party.staleApproval ? <span role="alert" className="mt-1 block text-xs font-semibold text-amber-800">Previous approval is stale after a party or signatory change. Review again.</span> : party.specialistHold ? <span role="alert" className="mt-1 block text-xs font-semibold text-amber-800">Specialist capacity hold and attorney review required.</span> : null}</div>)}</div>
            </section> : null}
            {model.financialPreparation ? <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-4" aria-label="Financial preparation route">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="text-sm font-semibold text-slate-950">Selected tax and property route</h3><p className="mt-1 text-sm text-slate-700">{model.financialPreparation.route} · {model.financialPreparation.property}</p></div>
                {onOpenRoutingProfile ? <Button type="button" variant="secondary" size="sm" onClick={() => onOpenRoutingProfile(CLEARANCE_TASK_SCOPE[model.taskKey]?.[0] || 'all')}>{CLEARANCE_TASK_SCOPE[model.taskKey] ? `Edit ${CLEARANCE_TASK_SCOPE[model.taskKey][1].toLowerCase()}` : 'Edit tax and clearance facts'}</Button> : null}
              </div>
              {!model.financialPreparation.applicable ? <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">This task is not part of the currently selected route. Review the matter profile and mark the historical task not applicable if appropriate.</p> : null}
              {model.financialPreparation.unknownRoute ? <p role="alert" className="mt-3 text-xs font-medium text-amber-900">The tax route still needs an attorney decision.</p> : null}
              {!model.financialPreparation.unknownRoute && model.financialPreparation.routeUnconfirmed ? <p role="alert" className="mt-3 text-xs font-medium text-amber-900">The selected tax route has not yet been confirmed by an attorney.</p> : null}
              {model.financialPreparation.checks.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{model.financialPreparation.checks.map((item) => <div key={item.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><span className="block font-medium text-slate-600">{item.label}</span><span className={`mt-1 block font-semibold ${item.state === 'ready' ? 'text-emerald-800' : 'text-amber-900'}`}>{item.value}{item.state === 'expired' ? ' · expired' : item.state === 'missing' ? ' · needed' : item.state === 'attention' ? ' · review needed' : ''}</span></div>)}</div> : null}
              {model.taskKey === 'municipal_rates_clearance_review' ? <p className="mt-3 text-xs text-slate-600">Check the certificate’s valid-until date before lodgement. If its issue date is known, the 60-day municipal period is checked here.</p> : null}
              {model.financialPreparation.notApplicable.length ? <details className="mt-3 text-xs text-slate-600"><summary className="w-fit cursor-pointer font-medium">Not applicable to this route</summary><p className="mt-1">{model.financialPreparation.notApplicable.join(' · ')}</p></details> : null}
              <p className="mt-3 text-xs text-slate-600">These values come from the saved matter profile. A Yes answer below does not replace a missing reference, document, or valid clearance date.</p>
            </section> : null}
            {model.securityReview ? <section className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4" aria-label="Payment security and bond evidence">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-950">Funding and payment security</h3><p className="mt-1 text-sm text-slate-700">{model.securityReview.financeLabel} · {model.securityReview.paymentSecurityLabel}</p></div>{onOpenRoutingProfile ? <Button type="button" variant="secondary" size="sm" onClick={onOpenRoutingProfile}>Review security route</Button> : null}</div>
              {!model.securityReview.taskApplicable ? <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">Cash-source review is not part of this funding route. Review the matter profile before recording an outcome on this historical task.</p> : null}
              {['unknown', 'developer'].includes(model.securityReview.financeType) || model.securityReview.paymentSecurity === 'unknown' ? <p role="alert" className="mt-3 text-xs font-medium text-amber-900">Confirm the cash/bond funding split and the agreed purchase-price security.</p> : null}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {model.securityReview.cashApplies ? <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><strong className="block text-slate-900">Cash component</strong><span className={model.securityReview.cashEvidenceCount ? 'mt-1 block text-emerald-800' : 'mt-1 block text-amber-900'}>{model.securityReview.cashEvidenceCount ? `${model.securityReview.cashEvidenceCount} source-of-funds file${model.securityReview.cashEvidenceCount === 1 ? '' : 's'} linked` : 'Source-of-funds evidence outstanding'}</span></div> : null}
                {model.securityReview.paymentSecurity === 'guarantee' ? <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><strong className="block text-slate-900">Guarantee security</strong><span className={model.securityReview.guaranteeEvidenceCount ? 'mt-1 block text-emerald-800' : 'mt-1 block text-amber-900'}>{model.securityReview.guaranteeEvidenceCount ? `${model.securityReview.guaranteeEvidenceCount} guarantee file${model.securityReview.guaranteeEvidenceCount === 1 ? '' : 's'} linked` : 'Guarantee evidence outstanding'}</span></div> : null}
                {model.securityReview.paymentSecurity === 'cleared_trust_funds' ? <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><strong className="block text-slate-900">Cleared trust funds</strong><span className="mt-1 block text-slate-600">Confirm the funds actually cleared before accepting this security.</span></div> : null}
                {model.securityReview.paymentSecurity === 'other' ? <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><strong className="block text-slate-900">Other security</strong><span className="mt-1 block text-amber-900">Review the undertaking or alternative security evidence and record its terms.</span></div> : null}
              </div>
              {model.securityReview.bondApplies ? <details className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><summary className="cursor-pointer font-semibold text-slate-900">Bond application evidence · {model.securityReview.bondReadyCount} of {model.securityReview.bondRows.length} required items ready</summary><p className="mt-2 text-slate-600">Applicant-specific bank evidence is shown for handoff review. It does not replace the bond attorney’s guarantee or wording acceptance.</p>{model.securityReview.bondRows.length ? <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto">{model.securityReview.bondRows.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="min-w-0"><strong className="block text-slate-800">{row.title}</strong><span className="text-slate-500">{row.person}</span></span><span className={row.complete ? 'font-medium text-emerald-800' : 'font-medium text-amber-900'}>{row.statusLabel}</span></li>)}</ul> : <p role="status" className="mt-2 text-amber-900">No bond-application checklist is available yet.</p>}{onOpenDocumentLibrary ? <button type="button" className="mt-2 font-semibold text-emerald-800 hover:underline" onClick={onOpenDocumentLibrary}>Open document library</button> : null}</details> : null}
              {model.securityReview.notApplicable.length ? <p className="mt-3 text-xs text-slate-600">Not applicable: {model.securityReview.notApplicable.join(' · ')}</p> : null}
              <p className="mt-3 text-xs text-slate-600">A confirmation below records the attorney’s review; it does not turn missing cash, bond, or guarantee evidence into an approved file.</p>
            </section> : null}
            {model.lodgementReview ? <section className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4" aria-label="Lodgement and registration readiness">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="text-sm font-semibold text-slate-950">{model.lodgementReview.label} review</h3><p className="mt-1 text-xs text-slate-600">Saved matter plan, attorney lanes, tax decision and lodgement documents.</p></div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${model.lodgementReview.ready ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`} role="status">{model.lodgementReview.ready ? 'Ready for attorney confirmation' : `${model.lodgementReview.issueCount} item${model.lodgementReview.issueCount === 1 ? '' : 's'} to review`}</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">{model.lodgementReview.lanes.map((lane) => <div key={lane.laneKey} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><strong className="block text-slate-900">{lane.label}</strong><span className="mt-1 block text-slate-600">{!lane.available ? 'Status unavailable' : lane.registered ? 'Registered' : lane.lodged ? 'Lodged' : lane.ready ? 'Ready to lodge' : 'Not ready to lodge'}</span></div>)}</div>
              {model.lodgementReview.issueCount ? <details className="mt-3 text-xs" open><summary className="cursor-pointer font-semibold text-amber-900">Unresolved items ({model.lodgementReview.issueCount})</summary><ul className="mt-2 space-y-1 text-slate-700">{model.lodgementReview.issues.slice(0, 8).map((item) => <li key={item.id} className="rounded-md bg-white px-2 py-1">{item.label}</li>)}</ul>{model.lodgementReview.issueCount > 8 ? <p className="mt-2 text-slate-600">+{model.lodgementReview.issueCount - 8} more items. Review the applicable lane before confirming.</p> : null}</details> : <p className="mt-3 text-xs text-emerald-800">No unresolved item was found in the loaded snapshot. Recheck current evidence before recording the milestone.</p>}
              <div className="mt-3 flex flex-wrap gap-3">{onOpenRoutingProfile ? <button type="button" className="text-xs font-semibold text-emerald-800 hover:underline" onClick={onOpenRoutingProfile}>Review matter profile</button> : null}{onOpenDocumentLibrary ? <button type="button" className="text-xs font-semibold text-emerald-800 hover:underline" onClick={onOpenDocumentLibrary}>Open document library</button> : null}</div>
              <p className="mt-3 text-xs text-slate-600">The database rechecks the milestone when it is saved. Another attorney’s update or an expired document can change this result.</p>
            </section> : null}
            {model.closureReview ? <section className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4" aria-label="Post-registration close-out">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-950">Post-registration close-out</h3><p className="mt-1 text-xs text-slate-600">Financial work stays internal; the registration update goes only to selected client portals; file closure is recorded separately.</p></div><span role="status" className={`rounded-full px-3 py-1 text-xs font-semibold ${model.closureReview.ready ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{model.closureReview.ready ? 'Ready for this outcome' : `${model.closureReview.issues.length} item${model.closureReview.issues.length === 1 ? '' : 's'} to review`}</span></div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs"><strong className="block text-slate-900">1 · Financial close-out</strong><p className="mt-1 text-slate-600">{model.closureReview.financial.complete ? 'Final accounts reviewed' : 'Final account review outstanding'}</p><span className="mt-2 inline-block font-semibold text-slate-600">Internal attorney work</span></div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs"><strong className="block text-slate-900">2 · Registration communication</strong><p className="mt-1 text-slate-600">{model.closureReview.communication.published ? `Published to ${model.closureReview.communication.recipients.join(' and ')}` : 'No registration-stage client update found'}</p>{!model.closureReview.communication.published && (onPublishJourneyUpdate || onOpenJourneyPublisher) ? <button type="button" className="mt-2 font-semibold text-emerald-800 hover:underline disabled:cursor-not-allowed disabled:opacity-50" disabled={Boolean(onPublishJourneyUpdate && (!canPublishJourneyUpdate || !journeyStageKey))} onClick={openJourneyPublisher}>Publish registration update</button> : null}</div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs"><strong className="block text-slate-900">3 · Administrative closure</strong><p className="mt-1 text-slate-600">{model.closureReview.administrative.complete ? 'File closed' : 'Closure checklist outstanding'}</p><span className="mt-2 inline-block font-semibold text-slate-600">Professional team only</span></div>
              </div>
              {model.closureReview.issues.length ? <ul className="mt-3 space-y-1 text-xs text-amber-900">{model.closureReview.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}
              <p className="mt-3 text-xs text-slate-600">Saved outcomes remain in the matter history if a task is reopened. A client update is published only to the recipients selected in its composer.</p>
            </section> : null}
            {!model.readOnly && model.contextualActions?.length ? <div className="flex flex-wrap gap-2">{model.contextualActions.map(action => <Button key={action.id} type="button" variant="secondary" disabled={saving || action.disabled} onClick={() => runAction(action, 'task')}>{action.label}</Button>)}</div> : null}
            {!model.stageTwoParties?.length && !model.financialPreparation && !model.securityReview && !model.lodgementReview && !model.closureReview && !model.contextualActions?.length ? <p className="text-sm text-slate-500">Task details and related matter facts appear here when available.</p> : null}
            </div>
            <div hidden={focusedStage && activeTab !== 'checklist'}>
            {onSaveConfirmations ? <TaskConfirmations key={`${model.lane || ''}:${model.taskKey}`} taskKey={model.taskKey} items={confirmationItems} saved={model.confirmations || {}} compact={focusedStage} disabled={!canEdit || model.taskResolved} onSave={saveConfirmationRows} onDirtyChange={handleAnswersDirtyChange} onRunAction={action => runAction(action, 'confirmation')} renderRowDetails={renderConfirmationRowDetails} /> : null}
            {!onSaveConfirmations && isBondCancellationConfirmation ? <section className="rounded-xl border border-slate-200 p-4"><h3 className="text-lg font-semibold text-slate-950">Confirmations</h3>{[['existingBond', 'Existing bond confirmed'], ['cancellationInstruction', 'Cancellation instructions confirmed']].map(([key, label]) => <div key={key} className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3"><span className="text-sm text-slate-800">{label}</span><div className="flex gap-2">{[['yes', 'Yes'], ['no', 'No'], ['not_applicable', 'Not applicable']].map(([value, choice]) => <Button key={value} type="button" variant={taskResponses[key] === value ? 'primary' : 'secondary'} size="sm" disabled={!canEdit} onClick={() => void saveTaskResponses({ ...taskResponses, [key]: value })}>{choice}</Button>)}</div></div>)}</section> : null}
            </div>

            <div hidden={focusedStage && activeTab !== 'documents'}>
            <section className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <h3 className="text-lg font-semibold text-slate-950">Supporting documents</h3>
                <div className="flex flex-wrap gap-2">
                  {attachedDocuments.length ? <Button type="button" variant="secondary" size="sm" onClick={() => { setPreviewDocument(null); setDocumentTarget(null); setDocumentAction(null); setDocumentModalOpen(true) }}>View all ({attachedDocuments.length})</Button> : null}
                  {!model.readOnly && model.uploadAction && !model.uploadAction.disabled ? <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => { setPreviewDocument(null); setDocumentTarget(null); setDocumentAction(null); setDocumentModalOpen(true) }}><Paperclip size={15} /> Upload document</Button> : null}
                </div>
              </div>
              {focusedStage && canUploadDocument ? <div className="m-4 rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-5 text-center text-sm text-slate-600" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) onOpenDocuments?.(null, null, file) }}><p>Drop a file here to prepare an upload</p><button type="button" className="mt-2 font-semibold text-emerald-800 hover:underline" onClick={() => onOpenDocuments?.(null, null, null)}>Choose a file</button></div> : null}
              <div className="divide-y divide-slate-100">
                {attachedDocuments.slice(0, 6).map((document) => <button key={document.id || document.key || document.sourceRequirementKey} type="button" onClick={() => { setPreviewDocument(document); setDocumentAction(null); setDocumentModalOpen(true) }} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50"><FileText size={17} className="shrink-0 text-slate-500" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900">{document.displayName || document.label || document.name || 'Document'}</strong><span className="mt-0.5 block text-xs text-slate-500">Available</span></span><ChevronRight size={16} className="text-slate-400" /></button>)}
                {!attachedDocuments.length ? <p className="px-4 py-3 text-sm text-slate-500">No supporting documents attached yet.</p> : null}
              </div>
            </section>
            </div>
            {focusedStage ? <div hidden={activeTab !== 'notes'} className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-base font-semibold text-slate-950">Task notes</h3><p className="mt-1 text-sm text-slate-500">Notes about this task stay with the matter history.</p></div>{!model.readOnly ? <Button type="button" variant="secondary" size="sm" onClick={() => runAction({ id: 'add_note' }, 'task')}>Add note</Button> : null}</div>{model.notes.length ? model.notes.map((note, index) => <article key={note.id || index} className="border-t border-slate-200 py-3 text-sm"><p className="text-slate-800">{note.message || note.body || note.text || note.title || 'Task note'}</p><p className="mt-1 text-xs text-slate-500">{note.actorName || note.createdByName || note.author || 'Matter team'}{note.createdAt || note.timestamp ? ` · ${new Date(note.createdAt || note.timestamp).toLocaleString('en-ZA')}` : ''}</p></article>) : <p className="text-sm text-slate-500">No task notes yet.</p>}</div> : null}
            {focusedStage ? <div hidden={activeTab !== 'activity'} className="space-y-3"><h3 className="text-base font-semibold text-slate-950">Task activity</h3>{model.activity.length ? model.activity.map((event, index) => <article key={event.id || index} className="border-t border-slate-200 py-3 text-sm"><strong className="text-slate-900">{event.title || event.action || event.eventType || 'Matter update'}</strong><p className="mt-1 text-slate-600">{event.message || event.body || ''}</p><p className="mt-1 text-xs text-slate-500">{event.actorName || event.createdByName || event.author || 'Matter team'}{event.createdAt || event.timestamp ? ` · ${new Date(event.createdAt || event.timestamp).toLocaleString('en-ZA')}` : ''}</p></article>) : <p className="text-sm text-slate-500">No task activity recorded yet.</p>}</div> : null}
          </div>

          {!focusedStage ? <footer className="shrink-0 border-t border-slate-200 bg-slate-50/75 px-5 py-3.5 lg:px-6">
            {error ? <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
            {!error && successMessage ? <p role="status" className="mb-3 text-sm text-emerald-800">{successMessage}</p> : null}
            {!model.readOnly && [...(model.outcomeActions || []), ...(model.followUpActions || [])].length ? (
              <details className="mb-3 text-sm text-slate-700">
                <summary className="w-fit cursor-pointer font-medium">Task outcome options</summary>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[...(model.outcomeActions || []), ...(model.followUpActions || [])].map(action => (
                    <Button key={action.id} type="button" variant="secondary" size="sm" disabled={saving || answersDirty || action.disabled} title={answersDirty ? 'Save answers before changing status' : undefined} onClick={() => runAction(action, 'outcome')}>{action.label}</Button>
                  ))}
                </div>
              </details>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {!model.readOnly && model.canMarkInProgress ? (
                  <Button type="button" variant="secondary" size="sm" disabled={saving || answersDirty} title={answersDirty ? 'Save answers before changing status' : undefined} onClick={onMarkInProgress}>
                    <Circle size={15} /> Mark in progress
                  </Button>
                ) : null}
              </div>
              {!model.readOnly && model.completeAction ? (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={saving || answersDirty || !model.canComplete || model.completeAction.disabled}
                  title={answersDirty ? 'Save answers before completing this task' : undefined}
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
            {nextStageTask ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <span className="min-w-0 text-xs text-slate-600">{answersDirty ? <><strong className="text-amber-800">Unsaved answers.</strong> Save them before continuing.</> : <><strong className="text-slate-800">Up next:</strong> {nextStageTask.label}</>}</span>
              <Button type="button" variant="secondary" size="sm" disabled={saving || answersDirty} title={answersDirty ? 'Save answers before moving to the next task' : undefined} onClick={() => onSelectTask?.(nextStageTask.key)} aria-label={`Next task: ${nextStageTask.label}`}>Next task <ArrowRight size={15} /></Button>
            </div> : null}
          </footer> : null}
          </div>
          {focusedStage ? <aside className="space-y-4 border-t border-slate-200 bg-slate-50/30 p-4 lg:border-l lg:border-t-0" aria-label="Task context">
            <section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-sm font-semibold text-slate-950">Task information</h3><dl className="mt-4 grid grid-cols-[100px_1fr] gap-x-3 gap-y-3 text-xs"><dt className="text-slate-500">Stage</dt><dd className="font-medium text-slate-800">{activePhase?.label || model.phaseLabel}</dd><dt className="text-slate-500">Task order</dt><dd className="font-medium text-slate-800">{taskIndex + 1} of {activePhase?.tasks?.length || 1}</dd><dt className="text-slate-500">Status</dt><dd className="font-medium text-slate-800">{model.statusLabel || model.status}</dd>{taskMeta?.completedByName ? <><dt className="text-slate-500">Completed by</dt><dd className="font-medium text-slate-800">{taskMeta.completedByName}</dd></> : null}{taskMeta?.completedAt ? <><dt className="text-slate-500">Completed on</dt><dd className="font-medium text-slate-800">{new Date(taskMeta.completedAt).toLocaleString('en-ZA')}</dd></> : null}{model.ownerLabel ? <><dt className="text-slate-500">Assigned role</dt><dd className="font-medium text-slate-800">{model.ownerLabel}</dd></> : null}</dl></section>
            {model.taskDescription ? <section className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4"><h3 className="text-sm font-semibold text-slate-950">Task guidance</h3><p className="mt-2 text-sm leading-6 text-slate-600">{model.taskDescription}</p></section> : null}
            {followingPhase || nextStageTask ? <section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-sm font-semibold text-slate-950">Next step</h3><p className="mt-3 text-sm font-semibold text-slate-900">{nextStageTask?.label || followingPhase?.label}</p><p className="mt-1 text-xs text-slate-500">{nextStageTask ? 'Continue to the next task in this stage.' : activePhase?.status === 'completed' ? 'Continue to the next stage.' : 'Complete this stage to continue.'}</p><Button type="button" variant="accent" size="sm" className="mt-4 w-full" disabled={!continuationTask || saving || answersDirty} title={answersDirty ? 'Save answers before continuing' : undefined} onClick={() => onSelectTask?.(continuationTask.key)}>Go to next task <ArrowRight size={15} /></Button></section> : null}
          </aside> : null}
          </div>
        </div>
      </main>
      </section>

      <Modal open={journeyUpdateOpen} title="Client journey stage update" onClose={() => setJourneyUpdateOpen(false)}>
        <TransferJourneyUpdateComposer
          key={journeyStageKey || 'unavailable'}
          stageKey={journeyStageKey}
          compact
          disabled={!canPublishJourneyUpdate || saving}
          onPublish={async (update) => {
            await onPublishJourneyUpdate?.(update)
            setJourneyUpdateOpen(false)
          }}
        />
      </Modal>

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
        title={documentAction?.reviewOtp ? 'Review OTP' : 'Supporting documents'}
        subtitle={model.taskLabel}
        onClose={saving || reviewBusy ? undefined : () => setDocumentModalOpen(false)}
        className="max-w-5xl"
        footer={<div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="secondary" onClick={() => setDocumentModalOpen(false)} disabled={saving || reviewBusy}>Close</Button>
          <div className="flex flex-wrap gap-2">
            {canRequestDocument ? <Button type="button" variant="secondary" disabled={saving || reviewBusy} onClick={() => { setDocumentModalOpen(false); runUtilityAction('request_document', () => onRequestDocument(documentAction?.requirement || null)) }}>Request {focusedDocumentLabel}</Button> : null}
            {canUploadDocument ? <Button type="button" disabled={saving || reviewBusy} onClick={() => { setDocumentModalOpen(false); runUtilityAction('upload_document', () => onOpenDocuments(previewDocument || documentTarget, documentAction?.requirement || null)) }}><Paperclip size={15} /> Upload {focusedDocumentLabel}</Button> : null}
          </div>
        </div>}
      >
        {missingFocusedDocument ? <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong className="block">No {focusedDocumentLabel} is linked to this task yet.</strong><p className="mt-1">{missingDocumentGuidance}</p></div> : null}
        {!model.readOnly && previewDocument && documentUrl(previewDocument) && onReviewDocument ? <div className="mb-4 space-y-2 rounded-xl border border-slate-200 p-3">
          {reviewError ? <p role="alert" className="text-sm text-red-700">{reviewError}</p> : null}
          {reviewFeedback ? <p role="status" className="text-sm text-emerald-800">{reviewFeedback}</p> : null}
          <label className="grid gap-1 text-sm">Review note / correction needed<Field as="textarea" rows={2} disabled={reviewBusy} value={reviewReason} onChange={event => setReviewReason(event.target.value)} /></label>
          <div className="flex gap-2"><Button type="button" disabled={reviewBusy} onClick={() => review('approve')}>Approve document</Button><Button type="button" variant="secondary" disabled={reviewBusy || !reviewReason.trim()} onClick={() => review('reject')}>Request correction</Button></div>
        </div> : null}
        <div className="grid gap-4 lg:grid-cols-[minmax(14rem,0.42fr)_minmax(0,1fr)]">
          <div className="max-h-[52vh] space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
            {visibleDocuments.length > 20 ? <label className="sticky top-0 z-10 block bg-white pb-2 text-xs font-medium text-slate-600">Search supporting documents<input type="search" value={documentSearch} onChange={(event) => { setDocumentSearch(event.target.value); setDocumentListLimit(40) }} placeholder="Search by file name or requirement" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" /></label> : null}
            {filteredDocuments.length ? filteredDocuments.slice(0, documentListLimit).map((document) => <button key={document.id || document.key || document.sourceRequirementKey} type="button" disabled={reviewBusy} onClick={() => setPreviewDocument(document)} className={`w-full rounded-lg px-3 py-3 text-left text-sm transition ${previewDocument === document ? 'bg-emerald-50 text-emerald-950' : 'hover:bg-slate-50 text-slate-700'}`}><strong className="block truncate">{document.displayName || document.label || document.name || 'Document'}</strong><span className="mt-1 block text-xs text-slate-500">Available</span></button>) : <p className="p-3 text-sm text-slate-500">{visibleDocuments.length && documentSearch.trim() ? 'No documents match this search.' : missingFocusedDocument ? `No ${focusedDocumentLabel} attached.` : 'No supporting documents are attached yet.'}</p>}
            {filteredDocuments.length > documentListLimit ? <button type="button" className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50" onClick={() => setDocumentListLimit((current) => current + 40)}>Show more documents ({filteredDocuments.length - documentListLimit} remaining)</button> : null}
          </div>
          <div className="min-h-[18rem] rounded-xl border border-slate-200 bg-slate-50 p-4">
            {previewDocument ? <div className="flex h-full flex-col"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-950">{previewDocument.displayName || previewDocument.label || previewDocument.name || 'Document'}</h3><p className="mt-1 text-xs text-slate-500">{previewDocument.ready ? 'Available for review' : 'Document is still outstanding'}</p></div>{documentUrl(previewDocument) ? <a href={documentUrl(previewDocument)} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-semibold text-emerald-800 hover:text-emerald-950">Download</a> : null}</div>{documentUrl(previewDocument) ? <iframe title={`Preview ${previewDocument.displayName || previewDocument.name || 'document'}`} src={documentUrl(previewDocument)} className="mt-4 min-h-[24rem] w-full rounded-lg border border-slate-200 bg-white" /> : <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-sm text-slate-500"><p>A preview is not available for this file.</p>{onOpenDocumentLibrary ? <Button type="button" variant="secondary" size="sm" onClick={openDocumentLibrarySafely}>Open document register</Button> : null}</div>}</div> : <div className="flex h-full items-center justify-center text-center text-sm text-slate-500">{missingFocusedDocument ? missingDocumentGuidance : 'Choose a document to preview it here.'}</div>}
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
              {saving ? 'Updating…' : statusDraft?.status === 'completed' && model.completeAction?.completionOverrideRequired ? 'Complete anyway' : statusDraft?.actionLabel || 'Update status'}
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
          {statusDraft?.status === 'completed' && !model.requirementsSatisfied && model.outstandingRequirements?.length ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>{model.outstandingRequirements.length} item{model.outstandingRequirements.length === 1 ? '' : 's'} outstanding</strong><ul className="mt-2 list-disc space-y-1 pl-5">{model.outstandingRequirements.slice(0, 6).map((item, index) => <li key={item.id || index}>{item.label || item.description || 'Required task information'}</li>)}</ul><p className="mt-2 text-xs">Completing anyway records the outcome in the matter history.</p></div> : null}
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
                {model.taskKey === 'post_registration_closeout_review'
                  ? 'Final-account notes remain inside the attorney firm. Publish registration news separately to selected clients.'
                  : 'This completion is shared with the professional matter team only.'}
              </p>
            )
          ) : null}
          {statusDraft?.requiresReason || statusDraft?.showReason ? (
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Reason {statusDraft?.requiresReason ? <span className="text-red-600">*</span> : <span className="text-slate-500">(optional)</span>}
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
