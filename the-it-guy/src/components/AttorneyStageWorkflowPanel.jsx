import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronRight, Circle, Clock3 } from 'lucide-react'
import { getAttorneyWorkflowStageConfig } from '../core/transactions/attorneyWorkflowConfig'
import { getWorkflowChecklistUploadConfig, getWorkflowStepChecklistTemplate } from '../core/transactions/workflowChecklistConfig'
import { buildWorkflowStepComment, parseWorkflowStepComment, SUBPROCESS_STEP_STATUSES, uploadDocument } from '../lib/api'
import Modal from './ui/Modal'

const STAGE_STATUS_META = {
  completed: {
    label: 'Completed',
    tone: 'completed',
    icon: CheckCircle2,
  },
  in_progress: {
    label: 'In Progress',
    tone: 'in_progress',
    icon: Clock3,
  },
  blocked: {
    label: 'Blocked',
    tone: 'blocked',
    icon: Clock3,
  },
  pending: {
    label: 'Pending',
    tone: 'pending',
    icon: Circle,
  },
}

const STEP_STATUS_META = {
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

function normalizeStatus(status) {
  if (!status || !SUBPROCESS_STEP_STATUSES.includes(status)) {
    return 'not_started'
  }

  return status
}

function normalizeWorkflowRichText(value) {
  const input = String(value || '').trim()
  if (!input) {
    return ''
  }

  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
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

function buildInitialDrafts(process) {
  const drafts = {}
  for (const step of process?.steps || []) {
    if (!step.id) {
      continue
    }

    const parsedComment = parseWorkflowStepComment(step.comment)
    drafts[step.id] = {
      status: normalizeStatus(step.status),
      comment: normalizeWorkflowRichText(parsedComment.note || ''),
      checklist: parsedComment.checklist || {},
      completedAt: toDateInputValue(step.completed_at),
      shareToDiscussion: false,
    }
  }

  return drafts
}

function normalizeComparisonValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function findChecklistVaultDocument(documents = [], stepKey, checklistItem) {
  if (!checklistItem?.documentUpload) {
    return null
  }

  const expectedCategory = normalizeComparisonValue(checklistItem.documentUpload.category || checklistItem.label)
  const expectedStageKey = normalizeComparisonValue(stepKey)

  return (
    documents.find((document) => {
      const category = normalizeComparisonValue(document?.category || document?.document_type)
      const stage = normalizeComparisonValue(document?.stage_key)
      return category === expectedCategory && stage === expectedStageKey
    }) ||
    documents.find((document) => {
      const category = normalizeComparisonValue(document?.category || document?.document_type)
      return category === expectedCategory
    }) ||
    null
  )
}

function buildEffectiveChecklist(step, draftChecklist = {}, documents = []) {
  const template = getWorkflowStepChecklistTemplate('attorney', step?.step_key)
  return template.reduce(
    (accumulator, item) => {
      const matchedDocument = findChecklistVaultDocument(documents, step?.step_key, item)
      accumulator[item.key] = Boolean(draftChecklist[item.key] || matchedDocument)
      return accumulator
    },
    { ...(draftChecklist || {}) },
  )
}

function getChecklistItems(step, draftChecklist = {}, documents = []) {
  const template = getWorkflowStepChecklistTemplate('attorney', step?.step_key)
  const effectiveChecklist = buildEffectiveChecklist(step, draftChecklist, documents)
  return template.map((item) => {
    const matchedDocument = findChecklistVaultDocument(documents, step?.step_key, item)

    return {
      ...item,
      checked: Boolean(effectiveChecklist[item.key]),
      matchedDocument,
      trackedFromVault: Boolean(matchedDocument && item.documentUpload),
    }
  })
}

function groupChecklistItems(stepChecklistItems = []) {
  const SECTION_LABELS = {
    documents_received: 'Documents Received',
    attorney_verification: 'Attorney Verification',
  }

  const groups = stepChecklistItems.reduce((accumulator, item) => {
    const sectionKey = item.section || 'general'
    if (!accumulator[sectionKey]) {
      accumulator[sectionKey] = {
        key: sectionKey,
        label: SECTION_LABELS[sectionKey] || 'Checklist',
        items: [],
      }
    }
    accumulator[sectionKey].items.push(item)
    return accumulator
  }, {})

  return Object.values(groups)
}

function deriveStageStatus(steps) {
  if (!steps.length) {
    return 'pending'
  }

  if (steps.every((step) => normalizeStatus(step.status) === 'completed')) {
    return 'completed'
  }

  if (steps.some((step) => normalizeStatus(step.status) === 'blocked')) {
    return 'blocked'
  }

  if (steps.some((step) => ['completed', 'in_progress'].includes(normalizeStatus(step.status)))) {
    return 'in_progress'
  }

  return 'pending'
}

function deriveStageProgress(steps) {
  const total = steps.length
  const completed = steps.filter((step) => normalizeStatus(step.status) === 'completed').length
  return {
    total,
    completed,
    percent: total ? Math.round((completed / total) * 100) : 0,
  }
}

function deriveStageDate(steps) {
  const completedDates = steps
    .map((step) => step.completed_at)
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())

  return completedDates[0]?.toISOString() || ''
}

function deriveNextItem(steps) {
  const nextStep = steps.find((step) => normalizeStatus(step.status) !== 'completed')
  return nextStep?.step_label || 'All required items complete'
}

function buildStages(process) {
  const stepsByKey = new Map((process?.steps || []).map((step) => [step.step_key, step]))

  return getAttorneyWorkflowStageConfig().map((stage, index) => {
    const groups = stage.groups
      .map((group) => {
        const seen = new Set()
        const steps = group.stepKeys
          .map((stepKey) => stepsByKey.get(stepKey))
          .filter(Boolean)
          .filter((step) => {
            const stepIdentity = step.id || step.step_key
            if (!stepIdentity || seen.has(stepIdentity)) {
              return false
            }
            seen.add(stepIdentity)
            return true
          })

        return {
          ...group,
          steps,
        }
      })
      .filter((group) => group.steps.length)

    const steps = groups.flatMap((group) => group.steps)
    const progress = deriveStageProgress(steps)
    const status = deriveStageStatus(steps)

    return {
      ...stage,
      index: index + 1,
      groups,
      steps,
      progress,
      status,
      latestCompletedAt: deriveStageDate(steps),
      nextItem: deriveNextItem(steps),
    }
  })
}

function getAdjacentStage(stages, currentStageKey, direction) {
  const currentIndex = stages.findIndex((stage) => stage.key === currentStageKey)
  if (currentIndex === -1) {
    return null
  }

  const nextIndex = direction === 'previous' ? currentIndex - 1 : currentIndex + 1
  return stages[nextIndex] || null
}

function getNextIncompleteStep(stage, currentStepId) {
  const orderedSteps = stage.groups.flatMap((group) => group.steps)
  const currentIndex = orderedSteps.findIndex((step) => step.id === currentStepId)
  if (currentIndex === -1) {
    return null
  }

  return orderedSteps.slice(currentIndex + 1).find((step) => normalizeStatus(step.status) !== 'completed') || null
}

function getFirstOpenStep(stage, drafts = {}) {
  return stage.groups
    .flatMap((group) => group.steps)
    .find((step) => normalizeStatus((drafts[step.id] || {}).status || step.status) !== 'completed') || null
}

function applyStepDraftToProcess(process, stepId, draft) {
  if (!process) {
    return process
  }

  return {
    ...process,
    steps: (process.steps || []).map((step) =>
      step.id === stepId
        ? {
            ...step,
            status: normalizeStatus(draft.status),
            comment: buildWorkflowStepComment({
              note: draft.comment || '',
              checklist: draft.checklist || {},
            }),
            completed_at:
              normalizeStatus(draft.status) === 'completed'
                ? draft.completedAt || step.completed_at || new Date().toISOString()
                : draft.completedAt || null,
          }
        : step,
    ),
  }
}

function AttorneyStageWorkflowPanel({
  subprocesses = [],
  documents = [],
  saving = false,
  disabled = false,
  onSaveStep,
  onDocumentUploaded,
  onOpenDocuments,
  onStageOpen,
}) {
  const attorneyProcess = useMemo(
    () => subprocesses.find((process) => process?.process_type === 'attorney') || null,
    [subprocesses],
  )
  const [localProcess, setLocalProcess] = useState(attorneyProcess)
  const [selectedStageKey, setSelectedStageKey] = useState('')
  const [drafts, setDrafts] = useState({})
  const [stageBanner, setStageBanner] = useState(null)
  const [uploadingItemKey, setUploadingItemKey] = useState('')
  const [uploadFiles, setUploadFiles] = useState({})

  useEffect(() => {
    setLocalProcess(attorneyProcess)
    setDrafts(buildInitialDrafts(attorneyProcess))
  }, [attorneyProcess])

  const stages = useMemo(() => buildStages(localProcess), [localProcess])

  const workflowCounts = useMemo(() => {
    const steps = localProcess?.steps || []
    return {
      completed: steps.filter((step) => normalizeStatus(step.status) === 'completed').length,
      total: steps.length,
      active: steps.filter((step) => normalizeStatus(step.status) === 'in_progress').length,
      blocked: steps.filter((step) => normalizeStatus(step.status) === 'blocked').length,
    }
  }, [localProcess])

  const selectedStage = useMemo(
    () => stages.find((stage) => stage.key === selectedStageKey) || null,
    [selectedStageKey, stages],
  )
  const previousStage = useMemo(() => getAdjacentStage(stages, selectedStageKey, 'previous'), [stages, selectedStageKey])
  const nextStage = useMemo(() => getAdjacentStage(stages, selectedStageKey, 'next'), [stages, selectedStageKey])

  function updateDraft(stepId, patch) {
    setDrafts((previous) => ({
      ...previous,
      [stepId]: {
        ...(previous[stepId] || {}),
        ...patch,
      },
    }))
  }

  function getChecklistUploadState(stepId, checklistKey) {
    return uploadFiles[`${stepId}:${checklistKey}`] || null
  }

  function setChecklistUploadState(stepId, checklistKey, value) {
    const compositeKey = `${stepId}:${checklistKey}`
    setUploadFiles((previous) => {
      if (!value) {
        const next = { ...previous }
        delete next[compositeKey]
        return next
      }
      return {
        ...previous,
        [compositeKey]: value,
      }
    })
  }

  async function handleSaveStep(step, options = {}) {
    const draft = drafts[step.id] || {}
    const effectiveDraft = {
      ...draft,
      checklist: buildEffectiveChecklist(step, draft.checklist || {}, documents),
    }
    const nextProcess = applyStepDraftToProcess(localProcess, step.id, effectiveDraft)
    const refreshedStages = buildStages(nextProcess)
    const currentStage = refreshedStages.find((stage) => stage.key === selectedStageKey)

    setLocalProcess(nextProcess)
    setDrafts((previous) => ({
      ...previous,
      [step.id]: {
        ...previous[step.id],
        checklist: effectiveDraft.checklist,
        shareToDiscussion: false,
      },
    }))

    await onSaveStep?.({
      transactionId: localProcess?.transaction_id,
      subprocessId: localProcess?.id,
      stepId: step.id,
      stepLabel: step.step_label,
      status: normalizeStatus(effectiveDraft.status),
      comment: buildWorkflowStepComment({
        note: effectiveDraft.comment || '',
        checklist: effectiveDraft.checklist || {},
      }),
      userComment: effectiveDraft.comment || '',
      shareToDiscussion: Boolean(effectiveDraft.shareToDiscussion),
      completedAt: effectiveDraft.completedAt || null,
    })

    if (!currentStage) {
      return
    }

    if (currentStage.status === 'completed') {
      const nextIncompleteStage = refreshedStages.find(
        (stage) => stage.index > currentStage.index && stage.steps.length && stage.status !== 'completed',
      )
      if (nextIncompleteStage) {
        const nextOpenStep = getFirstOpenStep(nextIncompleteStage, drafts)
        if (nextOpenStep && normalizeStatus((drafts[nextOpenStep.id] || {}).status || nextOpenStep.status) === 'not_started') {
          const nextDraft = {
            ...(drafts[nextOpenStep.id] || {}),
            status: 'in_progress',
            comment: (drafts[nextOpenStep.id] || {}).comment || parseWorkflowStepComment(nextOpenStep.comment).note || '',
            checklist: (drafts[nextOpenStep.id] || {}).checklist || parseWorkflowStepComment(nextOpenStep.comment).checklist || {},
            completedAt: '',
            shareToDiscussion: false,
          }

          setLocalProcess((previous) => applyStepDraftToProcess(previous, nextOpenStep.id, nextDraft))
          setDrafts((previous) => ({
            ...previous,
            [nextOpenStep.id]: nextDraft,
          }))

          await onSaveStep?.({
            transactionId: localProcess?.transaction_id,
            subprocessId: localProcess?.id,
            stepId: nextOpenStep.id,
            stepLabel: nextOpenStep.step_label,
            status: 'in_progress',
            comment: buildWorkflowStepComment({
              note: nextDraft.comment || '',
              checklist: nextDraft.checklist || {},
            }),
            userComment: '',
            shareToDiscussion: false,
            completedAt: null,
          })
        }

        setStageBanner({
          tone: 'success',
          title: `${currentStage.label} complete`,
          body: `Workflow advanced to ${nextIncompleteStage.label} and opened the next live step.`,
        })
        setSelectedStageKey(nextIncompleteStage.key)
      } else {
        setStageBanner({
          tone: 'success',
          title: `${currentStage.label} complete`,
          body: 'All attorney workflow stages are now complete.',
        })
      }
      return
    }

    if (options.advance) {
      const nextStep = getNextIncompleteStep(currentStage, step.id)
      if (nextStep) {
        setStageBanner({
          tone: 'neutral',
          title: 'Step saved',
          body: `Continue with ${nextStep.step_label}.`,
        })
      } else if (nextStage) {
        setStageBanner({
          tone: 'neutral',
          title: 'Step saved',
          body: `No more open items in ${currentStage.label}. Move to ${nextStage.label}.`,
        })
      } else {
        setStageBanner({
          tone: 'neutral',
          title: 'Step saved',
          body: 'No further open stages remain after this one.',
        })
      }
    }
  }

  async function handleUploadChecklistDocument(step, checklistItem) {
    const uploadConfig = getWorkflowChecklistUploadConfig('attorney', step.step_key, checklistItem.key)
    const selectedFile = getChecklistUploadState(step.id, checklistItem.key)

    if (!uploadConfig || !selectedFile || !localProcess?.transaction_id || String(localProcess.transaction_id).startsWith('mock-trx-')) {
      return
    }

    try {
      setUploadingItemKey(`${step.id}:${checklistItem.key}`)
      setStageBanner(null)

      await uploadDocument({
        transactionId: localProcess.transaction_id,
        file: selectedFile,
        category: uploadConfig.category || checklistItem.label,
        stageKey: step.step_key || null,
        isClientVisible: false,
      })

      setChecklistUploadState(step.id, checklistItem.key, null)
      setDrafts((previous) => {
        const currentDraft = previous[step.id] || {
          status: normalizeStatus(step.status),
          comment: parseWorkflowStepComment(step.comment).note || '',
          checklist: parseWorkflowStepComment(step.comment).checklist || {},
          completedAt: toDateInputValue(step.completed_at),
          shareToDiscussion: false,
        }
        const nextChecklist = {
          ...(currentDraft.checklist || {}),
          [checklistItem.key]: true,
        }
        const nextChecklistItems = getChecklistItems(step, nextChecklist, [
          ...documents,
          {
            category: uploadConfig.category || checklistItem.label,
            document_type: uploadConfig.category || checklistItem.label,
            stage_key: step.step_key || null,
            name: selectedFile.name,
          },
        ])
        const nextCompleted = nextChecklistItems.every((entry) => entry.checked)

        return {
          ...previous,
          [step.id]: {
            ...currentDraft,
            checklist: nextChecklist,
            status: nextCompleted ? 'completed' : currentDraft.status === 'not_started' ? 'in_progress' : currentDraft.status,
            completedAt: nextCompleted && !currentDraft.completedAt ? new Date().toISOString().slice(0, 10) : currentDraft.completedAt,
          },
        }
      })
      setStageBanner({
        tone: 'success',
        title: 'Document uploaded',
        body: `${selectedFile.name} was saved to the transaction document vault.`,
      })
      await onDocumentUploaded?.()
    } catch (error) {
      setStageBanner({
        tone: 'neutral',
        title: 'Upload failed',
        body: error.message || 'Unable to upload the document.',
      })
    } finally {
      setUploadingItemKey('')
    }
  }

  if (!localProcess) {
    return (
      <div className="panel-section attorney-stage-workflow-panel">
        <div className="section-header">
          <div className="section-header-copy">
            <h3>Attorney Workflow</h3>
            <p>No attorney workflow is available for this matter yet.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid h-full min-w-0 gap-3">
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-full border border-[#d8e2ee] bg-[#f8fbff] px-3 py-1 text-[0.8rem] font-semibold text-[#35546c]">
          {workflowCounts.completed} / {workflowCounts.total} completed
        </span>
        <span className="inline-flex items-center rounded-full border border-[#d8e2ee] bg-white px-3 py-1 text-[0.8rem] font-semibold text-[#5f7287]">{workflowCounts.active} active</span>
        {workflowCounts.blocked ? (
          <span className="inline-flex items-center rounded-full border border-[#f3d7a8] bg-[#fff8ed] px-3 py-1 text-[0.8rem] font-semibold text-[#9a5b0f]">
            {workflowCounts.blocked} blocked
          </span>
        ) : null}
      </div>

      <ul className="grid gap-3">
        {stages.map((stage) => {
          const statusMeta = STAGE_STATUS_META[stage.status] || STAGE_STATUS_META.pending
          const StatusIcon = statusMeta.icon

          return (
            <li key={stage.key}>
              <button
                type="button"
                className="w-full rounded-[18px] border border-[#d8e2ee] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] px-4 py-4 text-left text-[#182538] shadow-[0_14px_28px_rgba(15,23,42,0.05)] transition hover:-translate-y-[1px] hover:border-[#bfd2e7] hover:shadow-[0_18px_34px_rgba(15,23,42,0.08)]"
                onClick={() => {
                  if (onStageOpen) {
                    onStageOpen(stage)
                    return
                  }
                  setSelectedStageKey(stage.key)
                }}
                disabled={disabled || !stage.steps.length}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`workflow-status-icon ${statusMeta.tone}`}>
                      <StatusIcon size={13} />
                    </span>
                    <span className="grid min-w-0 gap-1">
                      <strong className="text-[0.98rem] leading-[1.3]">{stage.label}</strong>
                      <em className="text-[0.84rem] not-italic leading-[1.45] text-[#6e7d90]">{stage.nextItem}</em>
                    </span>
                  </div>
                  <span className={`workflow-status-pill ${statusMeta.tone}`}>{statusMeta.label}</span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2.5">
                  <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-2.5 py-1 text-[0.78rem] font-semibold text-[#35546c]">
                    {stage.progress.completed}/{stage.progress.total} ({stage.progress.percent}%)
                  </span>
                  <span className="inline-flex items-center rounded-full border border-[#e0e8f1] bg-white px-2.5 py-1 text-[0.76rem] font-semibold text-[#6b7d93]">
                    Updated {formatStepDate(stage.latestCompletedAt)}
                  </span>
                  <span className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#dbe5ef] bg-white text-[#6f8196]" aria-hidden>
                    <ChevronRight size={13} />
                  </span>
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      {!onStageOpen ? (
        <Modal
          open={Boolean(selectedStage)}
          onClose={() => setSelectedStageKey('')}
          title={selectedStage?.label || 'Attorney Workflow Stage'}
          subtitle={selectedStage?.description || 'Update legal checklist progress and workflow notes.'}
          className="max-w-5xl"
          footer={
            selectedStage ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => previousStage && setSelectedStageKey(previousStage.key)}
                  disabled={!previousStage}
                >
                  Previous Stage
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => nextStage && setSelectedStageKey(nextStage.key)}
                  disabled={!nextStage}
                >
                  Next Stage
                </button>
                <button type="button" className="ghost-button ml-auto" onClick={() => setSelectedStageKey('')}>
                  Close
                </button>
              </div>
            ) : null
          }
        >
          {selectedStage ? (
            <div className="grid gap-4">
              {stageBanner ? (
                <div className={`workflow-stage-banner ${stageBanner.tone}`}>
                  <strong>{stageBanner.title}</strong>
                  <span>{stageBanner.body}</span>
                </div>
              ) : null}

              {selectedStage.groups.map((group) => (
                <section key={group.key} className="attorney-stage-group">
                  <header className="attorney-stage-group-header">
                    <h5>{group.label}</h5>
                    <span>
                      {group.steps.filter((step) => normalizeStatus((drafts[step.id] || {}).status || step.status) === 'completed').length}/
                      {group.steps.length}
                    </span>
                  </header>

                  <div className="attorney-stage-group-steps">
                    {group.steps.map((step) => {
                      const parsedComment = parseWorkflowStepComment(step.comment)
                      const parsedCommentNote = normalizeWorkflowRichText(parsedComment.note || '')
                      const draft = drafts[step.id] || {
                        status: normalizeStatus(step.status),
                        comment: parsedCommentNote,
                        checklist: parsedComment.checklist || {},
                        completedAt: toDateInputValue(step.completed_at),
                        shareToDiscussion: false,
                      }
                      const status = normalizeStatus(draft.status)
                      const statusMeta = STEP_STATUS_META[status] || STEP_STATUS_META.not_started
                      const StepIcon = statusMeta.icon
                      const checklistItems = getChecklistItems(step, draft.checklist || {}, documents)
                      const checklistGroups = groupChecklistItems(checklistItems)

                      return (
                        <article key={step.id || step.step_key} className={`attorney-stage-step-card ${statusMeta.tone}`}>
                          <div className="attorney-stage-step-header">
                            <div className="attorney-stage-step-title">
                              <span className={`workflow-status-icon ${statusMeta.tone}`}>
                                <StepIcon size={13} />
                              </span>
                              <div>
                                <strong>{step.step_label}</strong>
                                <em>{parsedCommentNote || 'Add operational detail and mark work as complete.'}</em>
                              </div>
                            </div>
                            <span className={`workflow-status-pill ${statusMeta.tone}`}>{statusMeta.label}</span>
                          </div>

                          <div className="workflow-step-editor-grid">
                            <label>
                              Status
                              <select
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
                                disabled={disabled || !step.id}
                              >
                                {SUBPROCESS_STEP_STATUSES.map((value) => (
                                  <option value={value} key={value}>
                                    {value.replaceAll('_', ' ')}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label>
                              Completed Date
                              <input
                                type="date"
                                value={draft.completedAt}
                                onChange={(event) => updateDraft(step.id, { completedAt: event.target.value })}
                                disabled={disabled || !step.id}
                              />
                            </label>
                          </div>

                          {checklistItems.length ? (
                            <div className="workflow-step-checklist">
                              <span className="workflow-step-checklist-label">Checklist</span>
                              <div className="workflow-step-checklist-sections">
                                {checklistGroups.map((group) => (
                                  <section key={group.key} className="workflow-step-checklist-section">
                                    <header className="workflow-step-checklist-section-header">
                                      <strong>{group.label}</strong>
                                    </header>
                                    <div className="workflow-step-checklist-items">
                                      {group.items.map((item) => (
                                        <div key={item.key} className="workflow-step-checklist-item workflow-step-checklist-item-rich">
                                          <label className="workflow-step-checklist-main">
                                            <input
                                              type="checkbox"
                                              checked={item.checked}
                                              disabled={disabled || !step.id || item.trackedFromVault}
                                              onChange={(event) => {
                                                const nextChecklist = {
                                                  ...(draft.checklist || {}),
                                                  [item.key]: event.target.checked,
                                                }
                                                const nextCompleted = getChecklistItems(step, nextChecklist, documents).every((entry) =>
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
                                            />
                                            <span>{item.label}</span>
                                          </label>

                                          {getWorkflowChecklistUploadConfig('attorney', step.step_key, item.key) ? (
                                            <div className="workflow-step-upload-row">
                                              {item.matchedDocument ? (
                                                <>
                                                  <span className="workflow-step-upload-state uploaded">
                                                    Uploaded
                                                  </span>
                                                  <button
                                                    type="button"
                                                    className="ghost-button"
                                                    onClick={() => {
                                                      onOpenDocuments?.()
                                                      setSelectedStageKey('')
                                                    }}
                                                  >
                                                    Open in Document Vault
                                                  </button>
                                                  <span className="workflow-step-upload-meta">
                                                    {item.matchedDocument.name || item.matchedDocument.category || 'Uploaded file'}
                                                  </span>
                                                </>
                                              ) : (
                                                <>
                                                  <input
                                                    type="file"
                                                    onChange={(event) => {
                                                      const [file] = Array.from(event.target.files || [])
                                                      setChecklistUploadState(step.id, item.key, file || null)
                                                    }}
                                                    disabled={disabled || !step.id}
                                                  />
                                                  <button
                                                    type="button"
                                                    className="ghost-button"
                                                    onClick={() => void handleUploadChecklistDocument(step, item)}
                                                    disabled={
                                                      disabled ||
                                                      !step.id ||
                                                      String(localProcess?.transaction_id || '').startsWith('mock-trx-') ||
                                                      !getChecklistUploadState(step.id, item.key) ||
                                                      uploadingItemKey === `${step.id}:${item.key}`
                                                    }
                                                  >
                                                    {uploadingItemKey === `${step.id}:${item.key}` ? 'Uploading…' : 'Upload to Vault'}
                                                  </button>
                                                  <span className="workflow-step-upload-meta">
                                                    {getChecklistUploadState(step.id, item.key)?.name || 'No file selected'}
                                                  </span>
                                                </>
                                              )}
                                            </div>
                                          ) : null}
                                        </div>
                                      ))}
                                    </div>
                                  </section>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <label className="workflow-step-editor-comment">
                            Step Note
                            <textarea
                              rows={3}
                              value={draft.comment}
                              placeholder="Add short operational context"
                              onChange={(event) => updateDraft(step.id, { comment: event.target.value })}
                              disabled={disabled || !step.id}
                            />
                          </label>

                          <div className="attorney-stage-step-footer">
                            <label className="workflow-step-share-toggle">
                              <input
                                type="checkbox"
                                checked={Boolean(draft.shareToDiscussion)}
                                onChange={(event) => updateDraft(step.id, { shareToDiscussion: event.target.checked })}
                                disabled={disabled || !step.id || !draft.comment.trim()}
                              />
                              <span>Share this note to the transaction updates feed</span>
                            </label>

                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => void handleSaveStep(step)}
                              disabled={saving || disabled || !step.id}
                            >
                              Save Step
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => void handleSaveStep(step, { advance: true })}
                              disabled={saving || disabled || !step.id}
                            >
                              Save & Next
                            </button>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  )
}

export default AttorneyStageWorkflowPanel
