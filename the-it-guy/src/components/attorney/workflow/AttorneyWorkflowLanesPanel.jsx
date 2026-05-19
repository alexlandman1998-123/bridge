import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, FileText, MessageSquarePlus } from 'lucide-react'
import {
  addAttorneyTransactionUpdate,
  generateMissingAttorneyDocumentRequests,
  getAttorneyWorkflowOperationsForTransaction,
  requestAttorneyWorkflowLaneDocument,
  reviewAttorneyDocumentRequest,
  updateAttorneyWorkflowLaneStage,
} from '../../../services/attorneyWorkflow/attorneyWorkflowLaneService'
import {
  addAttorneyManualBlocker,
  calculateAttorneyReadinessForOperations,
  getAttorneyManualBlockers,
  resolveAttorneyManualBlocker,
} from '../../../services/attorneyWorkflow/attorneyReadinessEngine'
import Button from '../../ui/Button'
import Field from '../../ui/Field'
import Modal from '../../ui/Modal'

const STATUS_CLASS = {
  completed: 'border-success/30 bg-successSoft text-success',
  in_progress: 'border-info/30 bg-infoSoft text-info',
  blocked: 'border-danger/30 bg-dangerSoft text-danger',
  not_started: 'border-borderDefault bg-mutedBg text-textMuted',
}

const SEVERITY_CLASS = {
  low: 'border-borderSoft bg-surfaceAlt text-textMuted',
  medium: 'border-warning/30 bg-warningSoft text-warning',
  high: 'border-danger/30 bg-dangerSoft text-danger',
  critical: 'border-danger bg-danger text-white',
}

function toTitle(value = '') {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

function formatDate(value) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getLaneIcon(status) {
  if (status === 'completed') return CheckCircle2
  if (status === 'blocked') return AlertTriangle
  return Clock3
}

function buildAssignedLabel(lane) {
  const assignment = lane?.assignment
  if (!assignment) return 'Not assigned'
  const firmName = assignment.firm?.name || assignment.firmName || 'Assigned firm'
  const attorneyName =
    assignment.attorneyUser?.name ||
    assignment.primaryAttorney?.name ||
    assignment.attorneyUser?.email ||
    assignment.primaryAttorney?.email ||
    'Attorney pending'
  return `${firmName} / ${attorneyName}`
}

function getDefaultUpdateVisibility(permissions = {}) {
  if (permissions.canAddInternalNote) return 'internal'
  if (permissions.canAddSharedUpdate) return 'professional_shared'
  if (permissions.canPublishClientVisibleUpdate) return 'client_visible'
  return 'internal'
}

function flattenUpdateOptions(updateOptions = {}) {
  return (updateOptions.groups || []).flatMap((group) => group.options || [])
}

function getFirstUpdateOption(updateOptions = {}) {
  return flattenUpdateOptions(updateOptions)[0] || null
}

function visibilityLabel(value) {
  if (value === 'client_visible') return 'Client Visible'
  if (value === 'professional_shared') return 'Professional Shared'
  return 'Internal'
}

function readinessTone(value = 0) {
  if (value >= 80) return 'bg-success'
  if (value >= 60) return 'bg-info'
  if (value >= 40) return 'bg-warning'
  return 'bg-danger'
}

function timelineFilterMatches(item, filter) {
  if (!filter || filter === 'all') return true
  if (['transfer', 'bond', 'cancellation'].includes(filter)) return item.laneKey === filter
  if (filter === 'documents') return item.category === 'documents' || item.source === 'document_request'
  if (filter === 'signing') return item.category === 'signing' || String(item.type || '').includes('signing')
  return item.visibility === filter
}

function AttorneyWorkflowLanesPanel({ transactionId, onChanged }) {
  const [state, setState] = useState({ loading: true, error: '', operations: null })
  const [stageDraft, setStageDraft] = useState(null)
  const [noteDraft, setNoteDraft] = useState(null)
  const [documentDraft, setDocumentDraft] = useState(null)
  const [reviewDraft, setReviewDraft] = useState(null)
  const [blockerDraft, setBlockerDraft] = useState(null)
  const [readiness, setReadiness] = useState(null)
  const [timelineFilter, setTimelineFilter] = useState('all')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!transactionId) return
    setState((previous) => ({ ...previous, loading: true, error: '' }))
    try {
      const operations = await getAttorneyWorkflowOperationsForTransaction(transactionId)
      const manualBlockers = await getAttorneyManualBlockers(transactionId).catch(() => [])
      setReadiness(calculateAttorneyReadinessForOperations(operations, manualBlockers))
      setState({ loading: false, error: '', operations })
    } catch (error) {
      setState({
        loading: false,
        error: error?.message || 'Unable to load attorney workflow lanes.',
        operations: null,
      })
      setReadiness(null)
    }
  }, [transactionId])

  useEffect(() => {
    void load()
  }, [load])

  const orderedLanes = useMemo(() => {
    const lanes = state.operations?.lanes || []
    const editableRoles = new Set(
      lanes
        .filter((lane) => lane.permissions?.canUpdateStage || lane.permissions?.canRequestDocuments || lane.permissions?.canAddInternalNote)
        .map((lane) => lane.attorneyRole),
    )
    if (!editableRoles.size) return lanes
    return [...lanes].sort((left, right) => {
      const leftAssigned = editableRoles.has(left.attorneyRole) ? 0 : 1
      const rightAssigned = editableRoles.has(right.attorneyRole) ? 0 : 1
      return leftAssigned - rightAssigned
    })
  }, [state.operations?.lanes])

  async function refreshAfterChange(nextOperations = null) {
    if (nextOperations) {
      const manualBlockers = await getAttorneyManualBlockers(transactionId).catch(() => [])
      setReadiness(calculateAttorneyReadinessForOperations(nextOperations, manualBlockers))
      setState({ loading: false, error: '', operations: nextOperations })
    } else {
      await load()
    }
    await onChanged?.()
  }

  async function handleStageSubmit(event) {
    event.preventDefault()
    if (!stageDraft) return
    setSaving(true)
    setState((previous) => ({ ...previous, error: '' }))
    try {
      const next = await updateAttorneyWorkflowLaneStage({
        transactionId,
        laneKey: stageDraft.laneKey,
        stageKey: stageDraft.stageKey,
        laneStatus: stageDraft.laneStatus,
        note: stageDraft.note,
        visibility: 'internal',
      })
      setStageDraft(null)
      await refreshAfterChange(next)
    } catch (error) {
      setState((previous) => ({ ...previous, error: error?.message || 'Unable to update attorney workflow.' }))
    } finally {
      setSaving(false)
    }
  }

  async function handleNoteSubmit(event) {
    event.preventDefault()
    if (!noteDraft) return
    setSaving(true)
    setState((previous) => ({ ...previous, error: '' }))
    try {
      const next = await addAttorneyTransactionUpdate({
        transactionId,
        laneKey: noteDraft.laneKey,
        updateType: noteDraft.updateType,
        visibility: noteDraft.visibility,
        message: noteDraft.message,
      })
      setNoteDraft(null)
      await refreshAfterChange(next)
    } catch (error) {
      setState((previous) => ({ ...previous, error: error?.message || 'Unable to save attorney update.' }))
    } finally {
      setSaving(false)
    }
  }

  async function handleBlockerSubmit(event) {
    event.preventDefault()
    if (!blockerDraft) return
    setSaving(true)
    setState((previous) => ({ ...previous, error: '' }))
    try {
      const next = await addAttorneyManualBlocker({
        transactionId,
        laneKey: blockerDraft.laneKey,
        title: blockerDraft.title,
        description: blockerDraft.description,
        severity: blockerDraft.severity,
        owner: blockerDraft.owner,
        visibility: blockerDraft.visibility,
        dueDate: blockerDraft.dueDate,
      })
      setBlockerDraft(null)
      setReadiness(next)
      await refreshAfterChange()
    } catch (error) {
      setState((previous) => ({ ...previous, error: error?.message || 'Unable to add blocker.' }))
    } finally {
      setSaving(false)
    }
  }

  async function handleResolveBlocker(blockerId) {
    setSaving(true)
    setState((previous) => ({ ...previous, error: '' }))
    try {
      const next = await resolveAttorneyManualBlocker({ transactionId, blockerId })
      setReadiness(next)
      await refreshAfterChange()
    } catch (error) {
      setState((previous) => ({ ...previous, error: error?.message || 'Unable to resolve blocker.' }))
    } finally {
      setSaving(false)
    }
  }

  async function handleDocumentSubmit(event) {
    event.preventDefault()
    if (!documentDraft) return
    setSaving(true)
    setState((previous) => ({ ...previous, error: '' }))
    try {
      const next = await requestAttorneyWorkflowLaneDocument({
        transactionId,
        laneKey: documentDraft.laneKey,
        title: documentDraft.title,
        description: documentDraft.description,
        requestedFrom: documentDraft.requestedFrom,
      })
      setDocumentDraft(null)
      await refreshAfterChange(next)
    } catch (error) {
      setState((previous) => ({ ...previous, error: error?.message || 'Unable to request document.' }))
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerateLaneRequests(laneKey) {
    setSaving(true)
    setState((previous) => ({ ...previous, error: '' }))
    try {
      const next = await generateMissingAttorneyDocumentRequests(transactionId, { laneKey })
      await refreshAfterChange(next)
    } catch (error) {
      setState((previous) => ({ ...previous, error: error?.message || 'Unable to generate document requests.' }))
    } finally {
      setSaving(false)
    }
  }

  async function handleReviewSubmit(event) {
    event.preventDefault()
    if (!reviewDraft) return
    setSaving(true)
    setState((previous) => ({ ...previous, error: '' }))
    try {
      const next = await reviewAttorneyDocumentRequest({
        transactionId,
        requestId: reviewDraft.requestId,
        laneKey: reviewDraft.laneKey,
        decision: reviewDraft.decision,
        reason: reviewDraft.reason,
      })
      setReviewDraft(null)
      await refreshAfterChange(next)
    } catch (error) {
      setState((previous) => ({ ...previous, error: error?.message || 'Unable to review document.' }))
    } finally {
      setSaving(false)
    }
  }

  if (state.loading) {
    return (
      <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
        <p className="rounded-control border border-dashed border-borderSoft bg-surfaceAlt px-4 py-3 text-sm text-textMuted">
          Loading attorney workflow lanes…
        </p>
      </section>
    )
  }

  const filteredTimeline = (state.operations?.legalTimeline || []).filter((item) => timelineFilterMatches(item, timelineFilter)).slice(0, 30)

  return (
    <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-section-title font-semibold text-textStrong">Attorney Operations</h3>
          <p className="mt-1 text-secondary text-textMuted">
            Role-aware transfer, bond, and cancellation lanes for this transaction.
          </p>
        </div>
        {state.operations?.missingRequiredRoles?.length ? (
          <span className="rounded-full border border-warning/30 bg-warningSoft px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-warning">
            Missing required assignment
          </span>
        ) : (
          <span className="rounded-full border border-success/30 bg-successSoft px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-success">
            Legal roles resolved
          </span>
        )}
      </div>

      {state.error ? (
        <p className="mb-4 rounded-control border border-danger/30 bg-dangerSoft px-4 py-3 text-sm text-danger">{state.error}</p>
      ) : null}

      {orderedLanes.length ? (
        <div className="grid gap-4">
          {readiness ? (
            <div className="rounded-[18px] border border-borderSoft bg-surfaceAlt/70 p-4">
              <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                <div className="rounded-[16px] border border-borderSoft bg-surface p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <span className="text-label font-semibold uppercase text-textMuted">Readiness Summary</span>
                      <h4 className="mt-1 text-2xl font-semibold text-textStrong">{readiness.overallReadiness}% ready</h4>
                      <p className="mt-1 text-sm text-textMuted">
                        Lodgement {readiness.lodgementReadiness}% • Registration {readiness.registrationReadiness}%
                      </p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                      readiness.atRisk ? 'border-danger/30 bg-dangerSoft text-danger' : 'border-success/30 bg-successSoft text-success'
                    }`}>
                      {readiness.atRisk ? 'At Risk' : readiness.readyForLodgement ? 'Ready for Lodgement' : 'In Progress'}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {Object.entries(readiness.lanes || {}).filter(([, item]) => item.required).map(([role, item]) => (
                      <div key={role} className="rounded-control border border-borderSoft bg-surfaceAlt px-3 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-textStrong">{toTitle(role.replace('_attorney', ''))}</span>
                          <span className="text-xs text-textMuted">{item.readiness}%</span>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-[#e8edf4]">
                          <div className={`h-1.5 rounded-full ${readinessTone(item.readiness)}`} style={{ width: `${Math.max(0, Math.min(100, item.readiness || 0))}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[16px] border border-borderSoft bg-surface p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-label font-semibold uppercase text-textMuted">Next Action</span>
                      <p className="mt-1 text-sm font-semibold text-textStrong">
                        {readiness.nextActions?.[0]?.label || 'No urgent attorney action right now.'}
                      </p>
                    </div>
                    {orderedLanes.some((lane) => lane.permissions?.canAddInternalNote || lane.permissions?.canUpdateStage) ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setBlockerDraft({
                          laneKey: orderedLanes[0]?.laneKey || 'transfer',
                          title: '',
                          description: '',
                          severity: 'medium',
                          owner: 'attorney',
                          visibility: 'internal',
                          dueDate: '',
                        })}
                      >
                        Add Blocker
                      </Button>
                    ) : null}
                  </div>
                  {readiness.lodgement?.missing?.length ? (
                    <p className="mt-3 rounded-control border border-warning/30 bg-warningSoft px-3 py-2 text-xs text-warning">
                      Lodgement blockers: {readiness.lodgement.missing.slice(0, 2).join(' • ')}
                    </p>
                  ) : null}
                </div>
              </div>

              {readiness.blockers?.length ? (
                <div className="mt-4 rounded-[16px] border border-borderSoft bg-surface p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-label font-semibold uppercase text-textMuted">Active Blockers</span>
                    <span className="text-xs text-textMuted">{readiness.blockers.length} open</span>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {readiness.blockers.slice(0, 8).map((item) => (
                      <div key={item.id} className="flex flex-col gap-2 rounded-control border border-borderSoft bg-surfaceAlt px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${SEVERITY_CLASS[item.severity] || SEVERITY_CLASS.medium}`}>
                              {item.severity}
                            </span>
                            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-textMuted">{toTitle(item.laneKey)}</span>
                          </div>
                          <p className="mt-1 text-sm font-semibold text-textStrong">{item.label}</p>
                          <p className="mt-0.5 text-xs text-textMuted">{item.recommendedAction}</p>
                        </div>
                        {item.manual ? (
                          <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={() => void handleResolveBlocker(item.id)}>
                            Resolve
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {orderedLanes.map((lane) => {
            const Icon = getLaneIcon(lane.laneStatus)
            return (
              <article key={lane.id} className="rounded-[18px] border border-borderSoft bg-surfaceAlt/70 p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`inline-flex size-10 items-center justify-center rounded-[14px] border ${STATUS_CLASS[lane.laneStatus] || STATUS_CLASS.not_started}`}>
                        <Icon size={18} />
                      </span>
                      <div>
                        <h4 className="text-base font-semibold text-textStrong">{lane.label}</h4>
                        <p className="mt-1 text-sm text-textMuted">{buildAssignedLabel(lane)}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <div className="rounded-control border border-borderSoft bg-surface px-4 py-3">
                        <span className="text-label font-semibold uppercase text-textMuted">Current Stage</span>
                        <strong className="mt-1 block text-sm text-textStrong">{lane.currentStageLabel}</strong>
                      </div>
                      <div className="rounded-control border border-borderSoft bg-surface px-4 py-3">
                        <span className="text-label font-semibold uppercase text-textMuted">Status</span>
                        <strong className="mt-1 block text-sm text-textStrong">{toTitle(lane.laneStatus)}</strong>
                      </div>
                      <div className="rounded-control border border-borderSoft bg-surface px-4 py-3">
                        <span className="text-label font-semibold uppercase text-textMuted">Documents</span>
                        <strong className="mt-1 block text-sm text-textStrong">
                          {lane.documentSummary?.missing || 0} missing • {lane.documentSummary?.uploaded || 0} to review
                        </strong>
                      </div>
                      <div className="rounded-control border border-borderSoft bg-surface px-4 py-3">
                        <span className="text-label font-semibold uppercase text-textMuted">Last Updated</span>
                        <strong className="mt-1 block text-sm text-textStrong">{formatDate(lane.updatedAt)}</strong>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-helper font-semibold text-textMuted">{lane.summary.completionPercent}% complete</span>
                        <span className="text-helper text-textMuted">Next: {lane.summary.nextAction}</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-[#e8edf4]">
                        <div className="h-2 rounded-full bg-[#244966]" style={{ width: `${Math.max(0, Math.min(100, lane.summary.completionPercent))}%` }} />
                      </div>
                    </div>

                    {lane.updates?.length ? (
                      <div className="mt-4 rounded-control border border-borderSoft bg-surface px-4 py-3">
                        <span className="text-label font-semibold uppercase text-textMuted">Recent Legal Update</span>
                        <p className="mt-1 text-sm text-textStrong">{lane.updates[0].message}</p>
                      </div>
                    ) : null}

                    {lane.documentRequirements?.length ? (
                      <div className="mt-4 rounded-[16px] border border-borderSoft bg-surface px-4 py-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <span className="text-label font-semibold uppercase text-textMuted">{lane.label} Documents</span>
                            <p className="mt-1 text-xs text-textMuted">
                              {lane.documentSummary.missing} missing • {lane.documentSummary.requested} requested • {lane.documentSummary.rejected} rejected • {lane.documentSummary.complete} complete
                            </p>
                          </div>
                          {lane.permissions?.canRequestDocuments && lane.documentSummary?.missing ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={saving}
                              onClick={() => void handleGenerateLaneRequests(lane.laneKey)}
                            >
                              Generate Missing Requests
                            </Button>
                          ) : null}
                        </div>
                        <div className="mt-3 grid gap-2">
                          {lane.documentRequirements.slice(0, 8).map((requirement) => (
                            <div key={requirement.id} className="flex flex-col gap-2 rounded-control border border-borderSoft bg-surfaceAlt px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-textStrong">{requirement.label}</p>
                                <p className="mt-0.5 text-xs text-textMuted">
                                  {toTitle(requirement.category)} • From {toTitle(requirement.requiredFrom)} • {toTitle(requirement.status)}
                                </p>
                              </div>
                              {lane.permissions?.canReviewDocuments && requirement.requestId ? (
                                <div className="flex shrink-0 flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => setReviewDraft({ laneKey: lane.laneKey, requestId: requirement.requestId, decision: 'approved', reason: '', title: requirement.label })}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => setReviewDraft({ laneKey: lane.laneKey, requestId: requirement.requestId, decision: 'rejected', reason: '', title: requirement.label })}
                                  >
                                    Reject
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                        {lane.signingRequirements?.length ? (
                          <div className="mt-3 rounded-control border border-dashed border-borderSoft bg-surfaceAlt px-3 py-2">
                            <span className="text-label font-semibold uppercase text-textMuted">Signing Requirements</span>
                            <p className="mt-1 text-xs text-textMuted">
                              {lane.signingRequirements.map((item) => item.label).join(' • ')}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2 xl:w-[220px]">
                    {lane.permissions?.canUpdateStage ||
                    lane.permissions?.canAddInternalNote ||
                    lane.permissions?.canAddSharedUpdate ||
                    lane.permissions?.canPublishClientVisibleUpdate ||
                    lane.permissions?.canRequestDocuments ||
                    lane.permissions?.canManageSigning ? (
                      <>
                        {lane.permissions?.canUpdateStage ? (
                          <Button
                            type="button"
                            className="w-full"
                            onClick={() =>
                              setStageDraft({
                                laneKey: lane.laneKey,
                                stageKey: lane.currentStage || lane.steps[0]?.stepKey || '',
                                laneStatus: lane.laneStatus === 'blocked' ? 'blocked' : 'in_progress',
                                note: '',
                                stages: lane.steps,
                                currentStage: lane.currentStage,
                              })
                            }
                          >
                            Update Stage
                          </Button>
                        ) : null}
                        {lane.permissions?.canAddInternalNote ||
                        lane.permissions?.canAddSharedUpdate ||
                        lane.permissions?.canPublishClientVisibleUpdate ? (
                          <>
                            <Button
                              type="button"
                              variant="secondary"
                              className="w-full"
                              onClick={() => {
                                const firstOption = getFirstUpdateOption(lane.updateOptions)
                                setNoteDraft({
                                  mode: 'update',
                                  laneKey: lane.laneKey,
                                  permissions: lane.permissions,
                                  updateOptions: lane.updateOptions,
                                  updateType: firstOption?.id || '',
                                  visibility: firstOption?.defaultVisibility || getDefaultUpdateVisibility(lane.permissions),
                                  message: '',
                                })
                              }}
                            >
                              <MessageSquarePlus size={16} />
                              Add Update
                            </Button>
                            {lane.permissions?.canAddInternalNote ? (
                              <Button
                                type="button"
                                variant="secondary"
                                className="w-full"
                                onClick={() =>
                                  setNoteDraft({
                                    mode: 'internal_note',
                                    laneKey: lane.laneKey,
                                    permissions: lane.permissions,
                                    updateOptions: lane.updateOptions,
                                    updateType: 'internal_note',
                                    visibility: 'internal',
                                    message: '',
                                  })
                                }
                              >
                                Internal Note
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                        {lane.permissions?.canRequestDocuments ? (
                          <Button
                            type="button"
                            variant="secondary"
                            className="w-full"
                            onClick={() => setDocumentDraft({ laneKey: lane.laneKey, title: '', description: '', requestedFrom: 'client' })}
                          >
                            <FileText size={16} />
                            Request Document
                          </Button>
                        ) : null}
                        {lane.permissions?.canManageSigning ? (
                          <Button asChild type="button" variant="secondary" className="w-full">
                            <Link to={`/transactions/${transactionId}/legal/mandate`}>
                              <ExternalLink size={16} />
                              Open Signing Packets
                            </Link>
                          </Button>
                        ) : null}
                      </>
                    ) : (
                      <span className="rounded-control border border-borderSoft bg-surface px-4 py-3 text-sm text-textMuted">
                        Workflow actions are unavailable for this account.
                      </span>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <p className="rounded-control border border-dashed border-borderSoft bg-surfaceAlt px-4 py-3 text-sm text-textMuted">
          No attorney workflow lanes are required for this transaction yet.
        </p>
      )}

      {state.operations?.legalTimeline?.length ? (
        <div className="mt-5 rounded-[18px] border border-borderSoft bg-surfaceAlt/70 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h4 className="text-base font-semibold text-textStrong">Legal Activity Timeline</h4>
              <p className="mt-1 text-sm text-textMuted">Lane changes, attorney notes, document actions, and client-safe legal updates.</p>
            </div>
            <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
              {(state.operations.timelineFilters || ['all']).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    timelineFilter === filter
                      ? 'border-[#244966] bg-[#244966] text-white'
                      : 'border-borderSoft bg-surface text-textMuted hover:border-[#244966]/40 hover:text-textStrong'
                  }`}
                  onClick={() => setTimelineFilter(filter)}
                >
                  {filter === 'all' ? 'All' : toTitle(filter)}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            {filteredTimeline.length ? (
              filteredTimeline.map((item) => (
                <article key={item.id} className="rounded-control border border-borderSoft bg-surface px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-surfaceAlt px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-textMuted">
                          {toTitle(item.laneKey)}
                        </span>
                        <span className="rounded-full border border-borderSoft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-textMuted">
                          {visibilityLabel(item.visibility)}
                        </span>
                      </div>
                      <h5 className="mt-2 text-sm font-semibold text-textStrong">{item.title}</h5>
                      {item.message ? <p className="mt-1 text-sm text-textMuted">{item.message}</p> : null}
                    </div>
                    <span className="shrink-0 text-xs text-textMuted">{formatDate(item.timestamp)}</span>
                  </div>
                </article>
              ))
            ) : (
              <p className="rounded-control border border-dashed border-borderSoft bg-surface px-4 py-3 text-sm text-textMuted">
                No timeline entries match this filter.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {stageDraft ? (
        <Modal open title="Update Attorney Lane Stage" onClose={() => setStageDraft(null)}>
          <form onSubmit={handleStageSubmit} className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium text-textStrong">
              Stage
              <Field
                as="select"
                value={stageDraft.stageKey}
                onChange={(event) => setStageDraft((previous) => ({ ...previous, stageKey: event.target.value }))}
              >
                {stageDraft.stages.map((stage) => (
                  <option key={stage.stepKey} value={stage.stepKey}>
                    {stage.stepLabel}
                  </option>
                ))}
              </Field>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-textStrong">
              Lane Status
              <Field
                as="select"
                value={stageDraft.laneStatus}
                onChange={(event) => setStageDraft((previous) => ({ ...previous, laneStatus: event.target.value }))}
              >
                <option value="in_progress">In progress</option>
                <option value="blocked">Blocked</option>
                <option value="completed">Complete</option>
              </Field>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-textStrong">
              Note / regression reason
              <Field
                as="textarea"
                rows={4}
                value={stageDraft.note}
                onChange={(event) => setStageDraft((previous) => ({ ...previous, note: event.target.value }))}
                placeholder="Add context for the stage change. Required when moving backwards."
              />
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setStageDraft(null)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !stageDraft.stageKey}>
                {saving ? 'Saving…' : 'Save Stage'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {noteDraft ? (
        <Modal open title={noteDraft.mode === 'internal_note' ? 'Add Internal Attorney Note' : 'Add Attorney Update'} onClose={() => setNoteDraft(null)}>
          <form onSubmit={handleNoteSubmit} className="grid gap-4">
            {noteDraft.mode !== 'internal_note' ? (
              <label className="grid gap-1.5 text-sm font-medium text-textStrong">
                Update Type
                <Field
                  as="select"
                  value={noteDraft.updateType}
                  onChange={(event) => {
                    const selected = flattenUpdateOptions(noteDraft.updateOptions).find((option) => option.id === event.target.value)
                    setNoteDraft((previous) => ({
                      ...previous,
                      updateType: event.target.value,
                      visibility: selected?.defaultVisibility || previous.visibility,
                    }))
                  }}
                >
                  {(noteDraft.updateOptions?.groups || []).map((group) => (
                    <optgroup key={group.category || group.label} label={group.label}>
                      {(group.options || []).map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Field>
              </label>
            ) : null}
            <label className="grid gap-1.5 text-sm font-medium text-textStrong">
              Visibility
              <Field
                as="select"
                value={noteDraft.visibility}
                onChange={(event) => setNoteDraft((previous) => ({ ...previous, visibility: event.target.value }))}
                disabled={noteDraft.mode === 'internal_note'}
              >
                {noteDraft.permissions?.canAddInternalNote ? (
                  <option value="internal">Internal Attorney Note</option>
                ) : null}
                {noteDraft.permissions?.canAddSharedUpdate ? (
                  <option value="professional_shared">Shared Professional Update</option>
                ) : null}
                {noteDraft.permissions?.canPublishClientVisibleUpdate ? (
                  <option value="client_visible">Client-Safe Update</option>
                ) : null}
              </Field>
            </label>
            {noteDraft.visibility === 'client_visible' ? (
              <p className="rounded-control border border-warning/30 bg-warningSoft px-4 py-3 text-sm text-warning">
                Client-visible updates may appear in the buyer/seller portal. Keep the message simple and professional.
              </p>
            ) : null}
            <label className="grid gap-1.5 text-sm font-medium text-textStrong">
              Message
              <Field
                as="textarea"
                rows={5}
                value={noteDraft.message}
                onChange={(event) => setNoteDraft((previous) => ({ ...previous, message: event.target.value }))}
                placeholder="Internal is the default. Choose client-safe only when the wording is suitable for the client portal."
              />
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setNoteDraft(null)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !noteDraft.message.trim()}>
                {saving ? 'Saving…' : 'Save Update'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {documentDraft ? (
        <Modal open title="Request Lane Document" onClose={() => setDocumentDraft(null)}>
          <form onSubmit={handleDocumentSubmit} className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium text-textStrong">
              Document
              <Field value={documentDraft.title} onChange={(event) => setDocumentDraft((previous) => ({ ...previous, title: event.target.value }))} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-textStrong">
              Requested From
              <Field
                as="select"
                value={documentDraft.requestedFrom}
                onChange={(event) => setDocumentDraft((previous) => ({ ...previous, requestedFrom: event.target.value }))}
              >
                <option value="client">Client</option>
                <option value="buyer">Buyer</option>
                <option value="seller">Seller</option>
                <option value="attorney">Attorney Team</option>
                <option value="agent">Agent</option>
              </Field>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-textStrong">
              Description
              <Field
                as="textarea"
                rows={4}
                value={documentDraft.description}
                onChange={(event) => setDocumentDraft((previous) => ({ ...previous, description: event.target.value }))}
              />
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDocumentDraft(null)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !documentDraft.title.trim()}>
                {saving ? 'Requesting…' : 'Request Document'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {reviewDraft ? (
        <Modal open title="Review Attorney Document" onClose={() => setReviewDraft(null)}>
          <form onSubmit={handleReviewSubmit} className="grid gap-4">
            <p className="rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3 text-sm text-textMuted">
              {reviewDraft.title}
            </p>
            <label className="grid gap-1.5 text-sm font-medium text-textStrong">
              Decision
              <Field
                as="select"
                value={reviewDraft.decision}
                onChange={(event) => setReviewDraft((previous) => ({ ...previous, decision: event.target.value }))}
              >
                <option value="approved">Approve</option>
                <option value="completed">Mark Complete</option>
                <option value="rejected">Reject</option>
              </Field>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-textStrong">
              Rejection reason / review note
              <Field
                as="textarea"
                rows={4}
                value={reviewDraft.reason}
                onChange={(event) => setReviewDraft((previous) => ({ ...previous, reason: event.target.value }))}
                placeholder="Required when rejecting a document."
              />
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setReviewDraft(null)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || (reviewDraft.decision === 'rejected' && !reviewDraft.reason.trim())}>
                {saving ? 'Saving…' : 'Save Review'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {blockerDraft ? (
        <Modal open title="Add Attorney Blocker" onClose={() => setBlockerDraft(null)}>
          <form onSubmit={handleBlockerSubmit} className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium text-textStrong">
              Lane
              <Field
                as="select"
                value={blockerDraft.laneKey}
                onChange={(event) => setBlockerDraft((previous) => ({ ...previous, laneKey: event.target.value }))}
              >
                {orderedLanes.map((lane) => (
                  <option key={lane.laneKey} value={lane.laneKey}>
                    {lane.label}
                  </option>
                ))}
              </Field>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-textStrong">
              Blocker
              <Field
                value={blockerDraft.title}
                onChange={(event) => setBlockerDraft((previous) => ({ ...previous, title: event.target.value }))}
                placeholder="e.g. Guarantee wording needs review"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-1.5 text-sm font-medium text-textStrong">
                Severity
                <Field
                  as="select"
                  value={blockerDraft.severity}
                  onChange={(event) => setBlockerDraft((previous) => ({ ...previous, severity: event.target.value }))}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Field>
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-textStrong">
                Owner
                <Field
                  as="select"
                  value={blockerDraft.owner}
                  onChange={(event) => setBlockerDraft((previous) => ({ ...previous, owner: event.target.value }))}
                >
                  <option value="attorney">Attorney</option>
                  <option value="buyer">Buyer</option>
                  <option value="seller">Seller</option>
                  <option value="agent">Agent</option>
                  <option value="bank">Bank</option>
                  <option value="management">Management</option>
                </Field>
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-textStrong">
                Due Date
                <Field
                  type="date"
                  value={blockerDraft.dueDate}
                  onChange={(event) => setBlockerDraft((previous) => ({ ...previous, dueDate: event.target.value }))}
                />
              </label>
            </div>
            <label className="grid gap-1.5 text-sm font-medium text-textStrong">
              Visibility
              <Field
                as="select"
                value={blockerDraft.visibility}
                onChange={(event) => setBlockerDraft((previous) => ({ ...previous, visibility: event.target.value }))}
              >
                <option value="internal">Internal</option>
                <option value="professional_shared">Professional Shared</option>
                <option value="client_visible">Client Visible</option>
              </Field>
            </label>
            {blockerDraft.visibility === 'client_visible' ? (
              <p className="rounded-control border border-warning/30 bg-warningSoft px-4 py-3 text-sm text-warning">
                Client-visible blockers must be simple and neutral. Avoid blame language and internal legal commentary.
              </p>
            ) : null}
            <label className="grid gap-1.5 text-sm font-medium text-textStrong">
              Description
              <Field
                as="textarea"
                rows={4}
                value={blockerDraft.description}
                onChange={(event) => setBlockerDraft((previous) => ({ ...previous, description: event.target.value }))}
              />
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setBlockerDraft(null)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !blockerDraft.title.trim()}>
                {saving ? 'Saving…' : 'Add Blocker'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  )
}

export default AttorneyWorkflowLanesPanel
