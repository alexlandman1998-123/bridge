import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Circle, Clock3, Download, FileUp, X } from 'lucide-react'
import { buildWorkflowStepComment, parseWorkflowStepComment, SUBPROCESS_STEP_STATUSES, uploadDocument } from '../lib/api'
import { getWorkflowStepChecklistTemplate } from '../core/transactions/workflowChecklistConfig'

const PROCESS_LABELS = {
  finance: 'Finance Workflow',
  attorney: 'Attorney Workflow',
}

const OWNER_LABELS = {
  bond_originator: 'Bond Originator',
  attorney: 'Attorney',
  internal: 'Internal',
}

const STATUS_META = {
  completed: {
    icon: CheckCircle2,
    label: 'Completed',
    tone: 'completed',
  },
  in_progress: {
    icon: Clock3,
    label: 'In Progress',
    tone: 'in_progress',
  },
  blocked: {
    icon: Clock3,
    label: 'Blocked',
    tone: 'blocked',
  },
  not_started: {
    icon: Circle,
    label: 'Pending',
    tone: 'pending',
  },
}

function toDateInputValue(value) {
  if (!value) {
    return ''
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  return parsed.toISOString().slice(0, 10)
}

function formatStepDate(value) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return date.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function normalizeStatus(status) {
  if (!status || !SUBPROCESS_STEP_STATUSES.includes(status)) {
    return 'not_started'
  }

  return status
}

function buildInitialDrafts(subprocesses = []) {
  const drafts = {}
  for (const process of subprocesses) {
    for (const step of process.steps || []) {
      if (!step.id) {
        continue
      }

      const parsedComment = parseWorkflowStepComment(step.comment)

      drafts[step.id] = {
        status: normalizeStatus(step.status),
        comment: parsedComment.note || '',
        checklist: parsedComment.checklist || {},
        completedAt: toDateInputValue(step.completed_at),
        shareToDiscussion: false,
      }
    }
  }

  return drafts
}

function getProgress(process) {
  const completed = process?.summary?.completedSteps || 0
  const total = process?.summary?.totalSteps || 0
  return `${completed} / ${total}`
}

function getCounts(process) {
  const steps = process?.steps || []
  return {
    inProgress: steps.filter((step) => step.status === 'in_progress').length,
    blocked: steps.filter((step) => step.status === 'blocked').length,
  }
}

function getStepChecklistItems(process, step, draftChecklist = {}) {
  const template = getWorkflowStepChecklistTemplate(process?.process_type, step?.step_key)
  return template.map((item) => ({
    ...item,
    checked: Boolean(draftChecklist[item.key]),
  }))
}

function normalizeComparisonValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function isOtpDocument(document) {
  const haystack = `${document?.name || ''} ${document?.category || ''} ${document?.document_type || ''} ${document?.stage_key || ''}`
  const normalized = normalizeComparisonValue(haystack)
  return normalized.includes('otp') || normalized.includes('offer to purchase')
}

function isSignedOtpDocument(document) {
  const haystack = `${document?.name || ''} ${document?.category || ''} ${document?.document_type || ''}`
  const normalized = normalizeComparisonValue(haystack)
  return isOtpDocument(document) && normalized.includes('signed')
}

function getLatestMatchingDocument(documents = [], matcher) {
  return [...documents]
    .filter((item) => matcher(item))
    .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())[0] || null
}

const TONE_STYLES = {
  completed: {
    icon: 'border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]',
    pill: 'border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]',
    row: 'border-[#dfece5] bg-[#fbfefc]',
  },
  in_progress: {
    icon: 'border-[#d6e5f4] bg-[#eef5fb] text-[#35546c]',
    pill: 'border-[#d6e5f4] bg-[#eef5fb] text-[#35546c]',
    row: 'border-[#e3ebf4] bg-white',
  },
  blocked: {
    icon: 'border-[#f6dec7] bg-[#fff7ed] text-[#b54708]',
    pill: 'border-[#f6dec7] bg-[#fff7ed] text-[#b54708]',
    row: 'border-[#f6e2cd] bg-[#fffdfa]',
  },
  pending: {
    icon: 'border-[#dce5ef] bg-[#f7f9fc] text-[#8aa0b8]',
    pill: 'border-[#dce5ef] bg-[#f7f9fc] text-[#7b8ca2]',
    row: 'border-[#e3ebf4] bg-white',
  },
}

function SubprocessWorkflowPanel({
  subprocesses = [],
  documents = [],
  saving = false,
  disabled = false,
  roleLabel = 'Developer / Internal Admin',
  canEditFinanceWorkflow = true,
  canEditAttorneyWorkflow = false,
  focusMode = 'my_lane',
  focusLane = null,
  allowCollapse = true,
  embedded = false,
  hideSectionHeader = false,
  hideProcessHeading = false,
  onSaveStep,
  onMarkAllComplete,
  onDocumentUploaded,
}) {
  const [expandedStepId, setExpandedStepId] = useState('')
  const [drafts, setDrafts] = useState({})
  const [collapsedByProcess, setCollapsedByProcess] = useState({})
  const [stepUploadFiles, setStepUploadFiles] = useState({})
  const [uploadingStepId, setUploadingStepId] = useState('')
  const [bulkCompletingProcessId, setBulkCompletingProcessId] = useState('')

  const availableProcesses = useMemo(() => {
    const rows = subprocesses
      .filter((item) => item.process_type === 'finance' || item.process_type === 'attorney')
      .sort((a, b) => (a.process_type === 'finance' ? -1 : 1))

    if (focusMode === 'my_lane' && focusLane && focusLane !== 'all') {
      return rows.sort((a, b) => {
        const aOwns = a.process_type === focusLane ? 0 : 1
        const bOwns = b.process_type === focusLane ? 0 : 1
        return aOwns - bOwns
      })
    }

    return rows
  }, [focusLane, focusMode, subprocesses])

  useEffect(() => {
    setDrafts(buildInitialDrafts(availableProcesses))
  }, [availableProcesses])

  useEffect(() => {
    const initialState = {}

    for (const process of availableProcesses) {
      const key = process.id || process.process_type
      const isOwnedLane = focusLane && focusLane !== 'all' && process.process_type === focusLane
      initialState[key] = focusMode === 'my_lane' ? !isOwnedLane : false
    }

    setCollapsedByProcess(initialState)
  }, [availableProcesses, focusLane, focusMode])

  useEffect(() => {
    if (!expandedStepId) {
      return
    }

    const exists = availableProcesses.some((process) => (process.steps || []).some((step) => step.id === expandedStepId))
    if (!exists) {
      setExpandedStepId('')
    }
  }, [availableProcesses, expandedStepId])

  useEffect(() => {
    if (!expandedStepId || typeof document === 'undefined') {
      return undefined
    }

    const previousOverflow = document.body.style.overflow
    const previousPaddingRight = document.body.style.paddingRight
    const scrollbarWidth = Math.max(window.innerWidth - document.documentElement.clientWidth, 0)

    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.paddingRight = previousPaddingRight
    }
  }, [expandedStepId])

  if (!availableProcesses.length) {
    return (
      <div className={embedded ? '' : 'rounded-[22px] border border-[#dde4ee] bg-[#fbfcfe] p-5'}>
        {!hideSectionHeader ? (
          <div className="mb-4">
            <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Operational Workflows</h3>
            <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">No finance or attorney workflows are available yet. Create a transaction first.</p>
          </div>
        ) : null}
      </div>
    )
  }

  function updateDraft(stepId, patch) {
    setDrafts((previous) => ({
      ...previous,
      [stepId]: {
        ...(previous[stepId] || {}),
        ...patch,
      },
    }))
  }

  function toggleProcessCollapsed(process) {
    const key = process.id || process.process_type
    setCollapsedByProcess((previous) => ({
      ...previous,
      [key]: !previous[key],
    }))
  }

  function updateStepUploadFile(stepId, file) {
    setStepUploadFiles((previous) => ({
      ...previous,
      [stepId]: file,
    }))
  }

  async function handleOtpUpload(process, step) {
    const selectedFile = stepUploadFiles[step.id]
    if (!selectedFile || !process?.transaction_id || String(process.transaction_id).startsWith('mock-trx-')) {
      return
    }

    try {
      setUploadingStepId(step.id)
      await uploadDocument({
        transactionId: process.transaction_id,
        file: selectedFile,
        category: 'Signed OTP',
        stageKey: step.step_key || null,
        isClientVisible: false,
      })

      setStepUploadFiles((previous) => {
        const nextState = { ...previous }
        delete nextState[step.id]
        return nextState
      })

      setDrafts((previous) => {
        const currentDraft = previous[step.id] || {
          status: normalizeStatus(step.status),
          comment: parseWorkflowStepComment(step.comment).note || '',
          checklist: parseWorkflowStepComment(step.comment).checklist || {},
          completedAt: toDateInputValue(step.completed_at),
          shareToDiscussion: false,
        }

        return {
          ...previous,
          [step.id]: {
            ...currentDraft,
            checklist: {
              ...(currentDraft.checklist || {}),
              signed_otp_received: true,
            },
            status: currentDraft.status === 'not_started' ? 'in_progress' : currentDraft.status,
          },
        }
      })

      await onDocumentUploaded?.()
    } finally {
      setUploadingStepId('')
    }
  }

  async function handleSave(process, step) {
    const draft = drafts[step.id] || {}

    await onSaveStep?.({
      transactionId: process.transaction_id,
      subprocessId: process.id,
      processType: process.process_type,
      stepId: step.id,
      stepLabel: step.step_label,
      status: normalizeStatus(draft.status),
      comment: buildWorkflowStepComment({
        note: draft.comment || '',
        checklist: draft.checklist || {},
      }),
      userComment: draft.comment || '',
      shareToDiscussion: Boolean(draft.shareToDiscussion),
      completedAt: draft.completedAt || null,
    })

    setExpandedStepId('')
  }

  async function handleMarkAllComplete(process, canEditProcess) {
    const processId = process.id || process.process_type
    const incompleteCount = (process.steps || []).filter((step) => normalizeStatus(step.status) !== 'completed').length

    if (!process.id || !canEditProcess || disabled || saving || !incompleteCount) {
      return
    }

    const confirmed = window.confirm('Mark all items in this workflow as complete?')
    if (!confirmed) {
      return
    }

    try {
      setBulkCompletingProcessId(processId)
      await onMarkAllComplete?.({
        processId: process.id,
        processType: process.process_type,
        processLabel: PROCESS_LABELS[process.process_type] || process.process_type,
        totalSteps: (process.steps || []).length,
        incompleteCount,
      })
    } finally {
      setBulkCompletingProcessId('')
    }
  }

  const selectedStepContext = useMemo(() => {
    if (!expandedStepId) {
      return null
    }

    for (const process of availableProcesses) {
      const step = (process.steps || []).find((item) => item.id === expandedStepId)
      if (step) {
        return { process, step }
      }
    }

    return null
  }, [availableProcesses, expandedStepId])

  return (
    <div className={embedded ? 'space-y-4' : 'rounded-[22px] border border-[#dde4ee] bg-[#fbfcfe] p-5'}>
      {!hideSectionHeader ? (
        <div className="mb-5">
          <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Operational Workflows</h3>
          <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Compact stakeholder checklists for finance and attorney subprocess management.</p>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {availableProcesses.map((process) => {
          const ownerLabel = OWNER_LABELS[process.owner_type] || 'Owner'
          const counts = getCounts(process)
          const canEditProcess =
            process.process_type === 'finance' ? Boolean(canEditFinanceWorkflow) : Boolean(canEditAttorneyWorkflow)
          const processKey = process.id || process.process_type
          const isCollapsed = Boolean(collapsedByProcess[processKey])
          const incompleteCount = (process.steps || []).filter((step) => normalizeStatus(step.status) !== 'completed').length
          const isBulkCompleting = bulkCompletingProcessId === processKey

          return (
            <article key={process.id || process.process_type} className="rounded-[20px] border border-[#e3ebf4] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                {!hideProcessHeading ? (
                  <div className="min-w-0">
                    <h4 className="text-base font-semibold text-[#142132]">{PROCESS_LABELS[process.process_type] || process.process_type}</h4>
                    <span className="mt-1 block text-sm text-[#7c8ea4]">Owner: {ownerLabel}</span>
                  </div>
                ) : <div />}
                <div className="flex flex-wrap items-center gap-2">
                  {canEditProcess ? (
                    <button
                      type="button"
                      className="inline-flex min-h-[34px] items-center justify-center rounded-[12px] border border-[#dde4ee] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c] transition duration-150 ease-out hover:bg-[#eff4f8] disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => void handleMarkAllComplete(process, canEditProcess)}
                      disabled={disabled || saving || isBulkCompleting || !incompleteCount || !process.id}
                    >
                      {isBulkCompleting ? 'Completing…' : 'Mark All as Complete'}
                    </button>
                  ) : null}
                  <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.72rem] font-semibold text-[#66758b]">{getProgress(process)} completed</span>
                  <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.72rem] font-semibold text-[#66758b]">{counts.inProgress} active</span>
                  {counts.blocked ? <span className="inline-flex items-center rounded-full border border-[#f6dec7] bg-[#fff7ed] px-3 py-1 text-[0.72rem] font-semibold text-[#b54708]">{counts.blocked} blocked</span> : null}
                  {allowCollapse ? (
                    <button
                      type="button"
                      className="inline-flex min-h-[34px] items-center justify-center rounded-[12px] border border-transparent bg-transparent px-3 py-1.5 text-xs font-semibold text-[#35546c] transition duration-150 ease-out hover:bg-[#eff4f8]"
                      onClick={() => toggleProcessCollapsed(process)}
                    >
                      {isCollapsed ? 'Expand' : 'Collapse'}
                    </button>
                  ) : null}
                </div>
              </header>

              {!canEditProcess && !isCollapsed ? (
                <p className="mt-3 rounded-[14px] border border-[#dde4ee] bg-[#fbfcfe] px-4 py-3 text-sm text-[#6b7d93]">
                  {roleLabel} can view this lane only.
                </p>
              ) : null}

              {isCollapsed ? (
                <p className="mt-4 text-sm text-[#6b7d93]">
                  {counts.inProgress ? `${counts.inProgress} active step${counts.inProgress === 1 ? '' : 's'}` : 'No active steps'} • {counts.blocked ? `${counts.blocked} blocked` : 'No blocked steps'}
                </p>
              ) : (
                <>
                  <div className="mt-4 grid grid-cols-[minmax(0,1fr)_132px_120px] gap-3 border-b border-[#e8eef5] px-3 pb-3 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#8aa0b8]">
                    <span>Step</span>
                    <span className="text-left">Status</span>
                    <span className="text-right">Date</span>
                  </div>

                  <ul className="mt-2 overflow-hidden rounded-[14px] border border-[#e6edf5] bg-white divide-y divide-[#e8eef5]">
                    {(process.steps || []).map((step) => {
                      const stepStatus = normalizeStatus(step.status)
                      const statusMeta = STATUS_META[stepStatus] || STATUS_META.not_started
                      const toneStyles = TONE_STYLES[statusMeta.tone] || TONE_STYLES.pending
                      const StepIcon = statusMeta.icon
                      const draft = drafts[step.id] || {
                        status: stepStatus,
                        comment: parseWorkflowStepComment(step.comment).note || '',
                        checklist: parseWorkflowStepComment(step.comment).checklist || {},
                        completedAt: toDateInputValue(step.completed_at),
                      }
                      const collapsedComment = (parseWorkflowStepComment(step.comment).note || '').trim()

                      return (
                        <li key={step.id || step.step_key} className="px-3 py-3.5">
                          <button
                            type="button"
                            className="grid w-full grid-cols-[minmax(0,1fr)_132px_120px] items-center gap-3 rounded-[12px] px-1 py-1 text-left transition duration-150 ease-out hover:bg-[#f8fafd]"
                            onClick={() => setExpandedStepId(step.id || '')}
                            disabled={!step.id || disabled || !canEditProcess}
                            aria-expanded={Boolean(step.id) && expandedStepId === step.id}
                          >
                            <div className="flex min-w-0 items-start gap-3">
                              <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${toneStyles.icon}`}>
                                <StepIcon size={13} />
                              </span>
                              <span className="min-w-0">
                                <strong className="block text-sm font-semibold text-[#142132]">{step.step_label}</strong>
                                {collapsedComment ? <em className="mt-1 block truncate text-xs not-italic text-[#7c8ea4]">{collapsedComment}</em> : null}
                              </span>
                            </div>

                            <span className={`inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${toneStyles.pill}`}>
                              {statusMeta.label}
                            </span>
                            <span className="text-right text-sm font-medium text-[#9CA3AF]">{formatStepDate(step.completed_at)}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </article>
          )
        })}
      </div>

      {selectedStepContext ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(15,23,42,0.36)] p-4 no-print" role="presentation" onClick={() => setExpandedStepId('')}>
          <div
            className="flex max-h-[90vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[24px] border border-[#dde4ee] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.2)]"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            {(() => {
              const { process, step } = selectedStepContext
              const draft = drafts[step.id] || {
                status: normalizeStatus(step.status),
                comment: parseWorkflowStepComment(step.comment).note || '',
                checklist: parseWorkflowStepComment(step.comment).checklist || {},
                completedAt: toDateInputValue(step.completed_at),
                shareToDiscussion: false,
              }
              const stepChecklistItems = getStepChecklistItems(process, step, draft.checklist || {})
              const isOtpHandoffStep = process.process_type === 'finance' && step.step_key === 'otp_received'
              const latestOtpDraft = isOtpHandoffStep ? getLatestMatchingDocument(documents, (item) => isOtpDocument(item) && !isSignedOtpDocument(item)) : null
              const latestSignedOtp = isOtpHandoffStep ? getLatestMatchingDocument(documents, isSignedOtpDocument) : null
              const pendingUploadFile = stepUploadFiles[step.id] || null
              const canEditProcess =
                process.process_type === 'finance' ? Boolean(canEditFinanceWorkflow) : Boolean(canEditAttorneyWorkflow)

              return (
                <>
                  <header className="shrink-0 border-b border-[#e8eef5] px-6 pb-4 pt-6">
                    <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#8aa0b8]">{PROCESS_LABELS[process.process_type] || process.process_type}</span>
                      <h4 className="mt-2 text-[1.15rem] font-semibold tracking-[-0.03em] text-[#142132]">{step.step_label}</h4>
                      <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Update this step, capture detailed checklist items, and optionally share the note to the transaction updates feed.</p>
                    </div>
                    <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-[#dde4ee] bg-white text-[#4f647a] transition duration-150 ease-out hover:bg-[#f8fafc]" onClick={() => setExpandedStepId('')} aria-label="Close step editor">
                      <X size={16} />
                    </button>
                    </div>
                  </header>

                  <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                        <span>Status</span>
                        <select
                          className="w-full rounded-[14px] border border-[#dde4ee] bg-white px-4 py-3 text-sm text-[#162334] shadow-[0_10px_24px_rgba(15,23,42,0.06)] outline-none transition duration-150 ease-out focus:border-[rgba(29,78,216,0.35)] focus:ring-4 focus:ring-[rgba(29,78,216,0.1)]"
                          value={draft.status}
                          onChange={(event) => {
                            const nextStatus = normalizeStatus(event.target.value)
                            updateDraft(step.id, {
                              status: nextStatus,
                              completedAt:
                                nextStatus === 'completed' && !draft.completedAt
                                  ? new Date().toISOString().slice(0, 10)
                                  : nextStatus !== 'completed' && draft.status === 'completed'
                                    ? ''
                                    : draft.completedAt,
                            })
                          }}
                          disabled={disabled || !step.id || !canEditProcess}
                        >
                          {SUBPROCESS_STEP_STATUSES.map((status) => (
                            <option value={status} key={status}>
                              {status.replaceAll('_', ' ')}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                        <span>Completed Date</span>
                        <input
                          className="w-full rounded-[14px] border border-[#dde4ee] bg-white px-4 py-3 text-sm text-[#162334] shadow-[0_10px_24px_rgba(15,23,42,0.06)] outline-none transition duration-150 ease-out focus:border-[rgba(29,78,216,0.35)] focus:ring-4 focus:ring-[rgba(29,78,216,0.1)]"
                          type="date"
                          value={draft.completedAt}
                          onChange={(event) => updateDraft(step.id, { completedAt: event.target.value })}
                          disabled={disabled || !step.id || !canEditProcess}
                        />
                      </label>
                    </div>

                    {stepChecklistItems.length ? (
                      <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                        <span className="block text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#8aa0b8]">Checklist</span>
                        <div className="mt-4 space-y-2.5">
                          {stepChecklistItems.map((item) => (
                            <label key={item.key} className="flex items-start gap-3 rounded-[14px] border border-[#e3ebf4] bg-white px-4 py-3.5 text-sm text-[#35546c]">
                              <input
                                type="checkbox"
                                checked={item.checked}
                                onChange={(event) => {
                                  const nextChecklist = {
                                    ...(draft.checklist || {}),
                                    [item.key]: event.target.checked,
                                  }
                                  const nextCompleted = stepChecklistItems.every((entry) =>
                                    entry.key === item.key ? event.target.checked : entry.checked,
                                  )
                                  updateDraft(step.id, {
                                    checklist: nextChecklist,
                                    status: nextCompleted
                                      ? 'completed'
                                      : draft.status === 'completed' && !event.target.checked
                                        ? 'in_progress'
                                        : draft.status,
                                    completedAt:
                                      nextCompleted && !draft.completedAt
                                        ? new Date().toISOString().slice(0, 10)
                                        : !nextCompleted && draft.status === 'completed' && !event.target.checked
                                          ? ''
                                          : draft.completedAt,
                                  })
                                }}
                                disabled={disabled || !step.id || !canEditProcess}
                                className="mt-0.5 h-4 w-4 rounded border-[#cfd9e5]"
                              />
                              <span>{item.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {isOtpHandoffStep ? (
                      <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                        <div className="flex flex-col gap-2 border-b border-[#e3ebf4] pb-4">
                          <span className="text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#8aa0b8]">OTP Handoff</span>
                          <p className="text-sm leading-6 text-[#6b7d93]">
                            Developer / attorney uploads the latest OTP, the client signs it, and the bond originator uploads the signed copy before continuing with the finance file.
                          </p>
                        </div>

                        <div className="mt-4 grid gap-3 lg:grid-cols-3">
                          <article className="rounded-[16px] border border-[#dbe5ef] bg-white p-4">
                            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#8aa0b8]">Developer / Attorney</span>
                            <strong className="mt-2 block text-sm font-semibold text-[#142132]">Latest OTP</strong>
                            <p className="mt-2 text-sm leading-6 text-[#6b7d93]">
                              {latestOtpDraft ? latestOtpDraft.name || latestOtpDraft.category || 'OTP file available' : 'Waiting for the latest OTP to be uploaded to the transaction workspace.'}
                            </p>
                            {latestOtpDraft?.url ? (
                              <a
                                href={latestOtpDraft.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-3 inline-flex min-h-[38px] items-center gap-2 rounded-[12px] border border-[#dbe5ef] bg-white px-3 py-2 text-sm font-semibold text-[#35546c] transition duration-150 ease-out hover:bg-[#f8fafc]"
                              >
                                <Download size={14} />
                                Download OTP
                              </a>
                            ) : null}
                          </article>

                          <article className="rounded-[16px] border border-[#dbe5ef] bg-white p-4">
                            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#8aa0b8]">Client</span>
                            <strong className="mt-2 block text-sm font-semibold text-[#142132]">Sign the OTP</strong>
                            <p className="mt-2 text-sm leading-6 text-[#6b7d93]">
                              Once the buyer signs, the signed copy can be uploaded here so the finance process can continue without chasing the sales team.
                            </p>
                          </article>

                          <article className="rounded-[16px] border border-[#dbe5ef] bg-white p-4">
                            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#8aa0b8]">Bond Originator</span>
                            <strong className="mt-2 block text-sm font-semibold text-[#142132]">Signed OTP</strong>
                            <p className="mt-2 text-sm leading-6 text-[#6b7d93]">
                              {latestSignedOtp ? latestSignedOtp.name || 'Signed OTP uploaded' : 'Upload the signed OTP here, then confirm the step and proceed with the bond file.'}
                            </p>

                            {latestSignedOtp?.url ? (
                              <a
                                href={latestSignedOtp.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-3 inline-flex min-h-[38px] items-center gap-2 rounded-[12px] border border-[#dbe5ef] bg-white px-3 py-2 text-sm font-semibold text-[#35546c] transition duration-150 ease-out hover:bg-[#f8fafc]"
                              >
                                <Download size={14} />
                                Download signed OTP
                              </a>
                            ) : null}

                            <div className="mt-3 grid gap-2">
                              <label className="inline-flex min-h-[42px] cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-dashed border-[#cfd9e5] bg-[#fbfcfe] px-3 py-2 text-sm font-semibold text-[#35546c] transition duration-150 ease-out hover:border-[#bfd3ea] hover:bg-[#f8fafc]">
                                <FileUp size={14} />
                                {pendingUploadFile ? pendingUploadFile.name : 'Choose signed OTP'}
                                <input
                                  type="file"
                                  className="hidden"
                                  onChange={(event) => {
                                    const [file] = Array.from(event.target.files || [])
                                    updateStepUploadFile(step.id, file || null)
                                  }}
                                  disabled={disabled || !step.id || !canEditProcess}
                                />
                              </label>
                              <button
                                type="button"
                                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[12px] border border-transparent bg-[#35546c] px-4 py-2 text-sm font-semibold text-white transition duration-150 ease-out hover:bg-[#2e475c] disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => void handleOtpUpload(process, step)}
                                disabled={
                                  disabled ||
                                  !step.id ||
                                  !canEditProcess ||
                                  !pendingUploadFile ||
                                  String(process?.transaction_id || '').startsWith('mock-trx-') ||
                                  uploadingStepId === step.id
                                }
                              >
                                {uploadingStepId === step.id ? 'Uploading…' : 'Upload signed OTP'}
                              </button>
                            </div>
                          </article>
                        </div>
                      </div>
                    ) : null}

                    <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                      <span>Step Note</span>
                      <textarea
                        className="max-h-[220px] min-h-[120px] w-full resize-y rounded-[14px] border border-[#dde4ee] bg-white px-4 py-3.5 text-sm text-[#162334] shadow-[0_10px_24px_rgba(15,23,42,0.06)] outline-none transition duration-150 ease-out placeholder:text-slate-400 focus:border-[rgba(29,78,216,0.35)] focus:ring-4 focus:ring-[rgba(29,78,216,0.1)]"
                        rows={4}
                        value={draft.comment}
                        placeholder="Add short operational context"
                        onChange={(event) => updateDraft(step.id, { comment: event.target.value })}
                        disabled={disabled || !step.id || !canEditProcess}
                      />
                    </label>

                    <label className="inline-flex items-center gap-2 text-sm font-medium text-[#35546c]">
                      <input
                        type="checkbox"
                        checked={Boolean(draft.shareToDiscussion)}
                        onChange={(event) => updateDraft(step.id, { shareToDiscussion: event.target.checked })}
                        disabled={disabled || !step.id || !canEditProcess || !draft.comment.trim()}
                        className="h-4 w-4 rounded border-[#cfd9e5]"
                      />
                      <span>Share this note to the transaction updates feed</span>
                    </label>
                  </div>

                  <footer className="shrink-0 border-t border-[#e8eef5] px-6 py-4">
                    <div className="flex justify-end gap-3">
                    <button type="button" className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[12px] border border-transparent bg-transparent px-3 py-2 text-sm font-semibold text-[#35546c] transition duration-150 ease-out hover:bg-[#eff4f8]" onClick={() => setExpandedStepId('')}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[12px] border border-transparent bg-[#35546c] px-4 py-2 text-sm font-semibold text-white transition duration-150 ease-out hover:bg-[#2e475c] disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => void handleSave(process, step)}
                      disabled={saving || disabled || !step.id || !canEditProcess}
                    >
                      Save Step
                    </button>
                    </div>
                  </footer>
                </>
              )
            })()}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default SubprocessWorkflowPanel
