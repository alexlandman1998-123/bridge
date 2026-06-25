import { useEffect, useMemo, useState } from 'react'
import AttorneyFirmRolePlayerCard from '../branding/AttorneyFirmRolePlayerCard'
import { useWorkspace } from '../../../context/WorkspaceContext'
import useAttorneyPermissions from '../../../hooks/useAttorneyPermissions'
import { recordAuditEvent } from '../../../lib/activityAudit'
import {
  getTransactionAttorneyAssignments,
  listAttorneyFirmsForAssignment,
  removeTransactionAttorneyAssignment,
} from '../../../services/transactionAttorneyAssignments'
import { resolveAttorneyWorkflowForTransaction } from '../../../services/attorneyWorkflow/attorneyWorkflowService'
import AttorneyAssignmentForm from './AttorneyAssignmentForm'
import AttorneyAssignmentSummaryCard from './AttorneyAssignmentSummaryCard'

function AttorneyAssignmentSection({ transactionId, financeType = 'cash', transaction = {} }) {
  const { role: appRole } = useWorkspace()
  const permissionState = useAttorneyPermissions()
  const [firms, setFirms] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeForm, setActiveForm] = useState({ type: '', assignmentId: '' })
  const [busy, setBusy] = useState(false)

  const isAttorneyViewer = appRole === 'attorney'
  const canViewInternalWorkflowWarnings = ['attorney', 'developer', 'principal', 'agent'].includes(String(appRole || '').toLowerCase())
  const canCreateAssignments = isAttorneyViewer && permissionState.hasPermission('can_create_attorney_assignments')
  const canUpdateAssignments = isAttorneyViewer && permissionState.hasPermission('can_update_attorney_assignments')
  const canRemoveAssignments = isAttorneyViewer && permissionState.hasPermission('can_remove_attorney_assignments')

  const transferAssignments = useMemo(
    () => assignments.filter((item) => item.attorneyRole === 'transfer_attorney' || item.assignmentType === 'transfer' || item.assignmentType === 'transfer_and_bond'),
    [assignments],
  )

  const bondAssignments = useMemo(
    () => assignments.filter((item) => item.attorneyRole === 'bond_attorney' || item.assignmentType === 'bond' || item.assignmentType === 'transfer_and_bond'),
    [assignments],
  )

  const cancellationAssignments = useMemo(
    () => assignments.filter((item) => item.attorneyRole === 'cancellation_attorney' || item.assignmentType === 'cancellation'),
    [assignments],
  )

  const transferAssignment = useMemo(() => transferAssignments.find((item) => item.isPrimary !== false) || transferAssignments[0] || null, [transferAssignments])
  const bondAssignment = useMemo(() => bondAssignments.find((item) => item.isPrimary !== false) || bondAssignments[0] || null, [bondAssignments])
  const cancellationAssignment = useMemo(
    () => cancellationAssignments.find((item) => item.isPrimary !== false) || cancellationAssignments[0] || null,
    [cancellationAssignments],
  )

  const workflow = useMemo(
    () => resolveAttorneyWorkflowForTransaction(
      {
        ...transaction,
        id: transaction?.id || transactionId,
        finance_type: transaction?.finance_type || financeType,
      },
      assignments,
    ),
    [assignments, financeType, transaction, transactionId],
  )
  const showBondAssignment = Boolean(workflow.lanes.bond.required || bondAssignments.length)
  const cancellationRequired = Boolean(workflow.lanes.cancellation.required)
  const showCancellationAssignment = Boolean(cancellationRequired || cancellationAssignment)
  const laneCards = [
    workflow.lanes.transfer,
    workflow.lanes.bond,
    workflow.lanes.cancellation,
  ]

  useEffect(() => {
    let active = true

    async function load() {
      if (!transactionId) return
      setLoading(true)
      setError('')
      try {
        const [nextFirms, nextAssignments] = await Promise.all([
          listAttorneyFirmsForAssignment(),
          getTransactionAttorneyAssignments(transactionId),
        ])

        if (!active) return
        setFirms(nextFirms)
        setAssignments(nextAssignments)
      } catch (loadError) {
        if (!active) return
        setError(loadError?.message || 'Unable to load attorney assignments for this transaction.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [transactionId])

  async function handleRemove(assignment) {
    if (!assignment?.id) return
    const confirmed = window.confirm('Remove this attorney assignment?')
    if (!confirmed) return

    setBusy(true)
    setError('')
    try {
      await removeTransactionAttorneyAssignment(assignment.id)
      recordAuditEvent('management_assignment_action', {
        action: 'removed_attorney_assignment',
        transactionId,
        assignmentId: assignment.id,
        assignmentType: assignment.assignmentType,
      })
      const nextAssignments = await getTransactionAttorneyAssignments(transactionId)
      setAssignments(nextAssignments)
    } catch (removeError) {
      setError(removeError?.message || 'Unable to remove assignment.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaved(savedAssignment) {
    const action = savedAssignment?.id === activeForm.assignmentId ? 'reassigned_attorney' : 'assigned_attorney'
    setActiveForm({ type: '', assignmentId: '' })
    recordAuditEvent('management_assignment_action', {
      action,
      transactionId,
      assignmentId: savedAssignment?.id || activeForm.assignmentId || null,
      assignmentType: savedAssignment?.assignmentType || activeForm.type,
    })
    if (action === 'reassigned_attorney') {
      recordAuditEvent('manager_reassigned_attorney', {
        transactionId,
        assignmentId: savedAssignment?.id || activeForm.assignmentId || null,
        assignmentType: savedAssignment?.assignmentType || activeForm.type,
      })
    }
    const nextAssignments = await getTransactionAttorneyAssignments(transactionId)
    setAssignments(nextAssignments)
  }

  function renderAssignmentBlock({ type, assignment, supportingAssignments = [], title, helper }) {
    const isEditing = activeForm.type === type
    const editingAssignment = isEditing && activeForm.assignmentId
      ? [assignment, ...supportingAssignments].find((item) => item?.id === activeForm.assignmentId) || assignment
      : assignment

    return (
      <article className="rounded-control border border-borderSoft bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-textStrong">{title}</h4>
            <p className="mt-1 text-sm text-textMuted">{helper}</p>
          </div>
          {!isEditing && !assignment ? (
            <button
              type="button"
              className="header-secondary-cta"
              onClick={() => setActiveForm({ type, assignmentId: '' })}
              disabled={busy || loading || !canCreateAssignments}
            >
              {type === 'bond'
                ? 'Assign Bond Attorney'
                : type === 'cancellation'
                  ? 'Assign Cancellation Attorney'
                  : 'Assign Transfer Attorney'}
            </button>
          ) : null}
          {!isEditing && assignment && canCreateAssignments ? (
            <button
              type="button"
              className="header-secondary-cta"
              onClick={() => setActiveForm({ type, assignmentId: '', isPrimary: false })}
              disabled={busy || loading}
            >
              Add Supporting
            </button>
          ) : null}
        </div>

        <div className="mt-3">
          {isEditing ? (
            <AttorneyAssignmentForm
              key={`${type}-${editingAssignment?.id || 'new'}-${activeForm.isPrimary === false ? 'supporting' : 'primary'}`}
              transactionId={transactionId}
              assignmentType={type}
              firms={firms}
              initialAssignment={editingAssignment || null}
              isPrimaryDefault={activeForm.isPrimary !== false}
              onSaved={handleSaved}
              onCancel={() => setActiveForm({ type: '', assignmentId: '' })}
            />
          ) : assignment || supportingAssignments.length ? (
            <div className="grid gap-3">
              {[assignment, ...supportingAssignments].filter(Boolean).map((item) => (
                <AttorneyAssignmentSummaryCard
                  key={item.id}
                  assignment={item}
                  busy={busy}
                  onEdit={canUpdateAssignments ? () => setActiveForm({ type, assignmentId: item.id, isPrimary: item.isPrimary !== false }) : null}
                  onRemove={canRemoveAssignments ? () => void handleRemove(item) : null}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-control border border-dashed border-borderSoft bg-surfaceAlt px-4 py-3 text-sm text-textMuted">
              No {type === 'bond' ? 'bond' : type === 'cancellation' ? 'cancellation' : 'transfer'} attorney firm has been assigned to this matter yet.
            </p>
          )}
        </div>
      </article>
    )
  }

  return (
    <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
      <div className="mb-3">
        <h3 className="text-section-title font-semibold text-textStrong">Attorney Assignment</h3>
        <p className="mt-1 text-secondary text-textMuted">
          Assign legal role players and confirm which attorney workflows are required for this matter.
        </p>
      </div>

      {error ? (
        <p className="mb-3 rounded-control border border-danger/30 bg-dangerSoft px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}
      {isAttorneyViewer && permissionState.membership && !permissionState.membership.isActive ? (
        <p className="mb-3 rounded-control border border-borderSoft bg-surfaceAlt px-3 py-2 text-sm text-textMuted">
          You are not an active member of this attorney firm.
        </p>
      ) : null}
      {isAttorneyViewer && permissionState.membership?.isActive && !canCreateAssignments && !canUpdateAssignments && !canRemoveAssignments ? (
        <p className="mb-3 rounded-control border border-borderSoft bg-surfaceAlt px-3 py-2 text-sm text-textMuted">
          Assignment actions are hidden for your role in this workspace.
        </p>
      ) : null}

      {loading ? (
        <p className="rounded-control border border-dashed border-borderSoft bg-surfaceAlt px-4 py-3 text-sm text-textMuted">
          Loading assignment records…
        </p>
      ) : (
        <div className="grid gap-4">
          <section className="rounded-control border border-borderSoft bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-base font-semibold text-textStrong">Resolved Legal Workflow</h4>
                <p className="mt-1 text-sm text-textMuted">
                  Arch9 has evaluated the transaction facts and identified the attorney roles that apply.
                </p>
              </div>
              {workflow.missingRequiredRoles.length ? (
                <span className="rounded-full border border-warning/30 bg-warningSoft px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-warning">
                  {workflow.missingRequiredRoles.length} missing
                </span>
              ) : (
                <span className="rounded-full border border-success/30 bg-successSoft px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-success">
                  Covered
                </span>
              )}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {laneCards.map((lane) => {
                const isMissing = workflow.missingRequiredRoles.includes(lane.role)
                return (
                  <article
                    key={lane.role}
                    className={`rounded-control border px-4 py-3 ${
                      lane.required
                        ? isMissing
                          ? 'border-warning/30 bg-warningSoft/40'
                          : 'border-success/25 bg-successSoft/35'
                        : 'border-borderSoft bg-surfaceAlt'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h5 className="text-sm font-semibold text-textStrong">{lane.label}</h5>
                      <span className="rounded-full border border-borderSoft bg-surface px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-textMuted">
                        {lane.required ? 'Required' : 'Not required'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-textMuted">{lane.reason}</p>
                    {isMissing ? (
                      <p className="mt-2 text-xs font-semibold text-warning">Required but not assigned.</p>
                    ) : null}
                  </article>
                )
              })}
            </div>
            {canViewInternalWorkflowWarnings && workflow.warnings.length ? (
              <div className="mt-3 rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-textMuted">Internal data confidence</p>
                <ul className="mt-2 grid gap-1 text-sm text-textMuted">
                  {[...new Set(workflow.warnings)].slice(0, 4).map((warning) => (
                    <li key={warning}>• {warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="rounded-control border border-borderSoft bg-surface p-4">
            <h4 className="text-base font-semibold text-textStrong">Attorney Role Players</h4>
            <p className="mt-1 text-sm text-textMuted">
              Transfer, bond, and cancellation legal representation currently linked to this transaction.
            </p>
            {transferAssignment || bondAssignment || cancellationAssignment ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {transferAssignment ? (
                  <AttorneyFirmRolePlayerCard
                    rolePlayer={transferAssignment}
                    assignmentLabel="Transfer Attorney"
                    onViewDetails={canUpdateAssignments ? () => setActiveForm({ type: 'transfer', assignmentId: transferAssignment.id }) : null}
                    readOnly={!canUpdateAssignments}
                  />
                ) : (
                  <p className="rounded-control border border-dashed border-borderSoft bg-surfaceAlt px-4 py-3 text-sm text-textMuted">
                    No transfer attorney firm has been assigned to this transaction yet.
                  </p>
                )}
                {showBondAssignment ? (
                  bondAssignment ? (
                    <AttorneyFirmRolePlayerCard
                      rolePlayer={bondAssignment}
                      assignmentLabel="Bond Attorney"
                      onViewDetails={canUpdateAssignments ? () => setActiveForm({ type: 'bond', assignmentId: bondAssignment.id }) : null}
                      readOnly={!canUpdateAssignments}
                    />
                  ) : (
                    <p className="rounded-control border border-dashed border-borderSoft bg-surfaceAlt px-4 py-3 text-sm text-textMuted">
                      No bond attorney firm has been assigned to this transaction yet.
                    </p>
                  )
                ) : null}
                {cancellationAssignment ? (
                  <AttorneyFirmRolePlayerCard
                    rolePlayer={cancellationAssignment}
                    assignmentLabel="Cancellation Attorney"
                    onViewDetails={
                      canUpdateAssignments ? () => setActiveForm({ type: 'cancellation', assignmentId: cancellationAssignment.id }) : null
                    }
                    readOnly={!canUpdateAssignments}
                  />
                ) : cancellationRequired ? (
                  <p className="rounded-control border border-dashed border-borderSoft bg-surfaceAlt px-4 py-3 text-sm text-textMuted">
                    No cancellation attorney firm has been assigned to this transaction yet.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 rounded-control border border-dashed border-borderSoft bg-surfaceAlt px-4 py-3 text-sm text-textMuted">
                No attorney firm has been assigned to this transaction yet.
              </p>
            )}
          </section>

          {renderAssignmentBlock({
            type: 'transfer',
            assignment: transferAssignment,
            supportingAssignments: transferAssignments.filter((item) => item.id !== transferAssignment?.id),
            title: 'Transfer Attorney Assignment',
            helper: workflow.lanes.transfer.reason,
          })}

          {showBondAssignment ? (
            renderAssignmentBlock({
              type: 'bond',
              assignment: bondAssignment,
              supportingAssignments: bondAssignments.filter((item) => item.id !== bondAssignment?.id),
              title: 'Bond Attorney Assignment',
              helper: workflow.lanes.bond.reason,
            })
          ) : (
            <article className="rounded-control border border-borderSoft bg-surface p-4">
              <h4 className="text-base font-semibold text-textStrong">Bond Attorney Assignment</h4>
              <p className="mt-2 text-sm text-textMuted">{workflow.lanes.bond.reason}</p>
            </article>
          )}

          {showCancellationAssignment ? (
            renderAssignmentBlock({
              type: 'cancellation',
              assignment: cancellationAssignment,
              supportingAssignments: cancellationAssignments.filter((item) => item.id !== cancellationAssignment?.id),
              title: 'Cancellation Attorney Assignment',
              helper: workflow.lanes.cancellation.reason,
            })
          ) : (
            <article className="rounded-control border border-borderSoft bg-surface p-4">
              <h4 className="text-base font-semibold text-textStrong">Cancellation Attorney Assignment</h4>
              <p className="mt-2 text-sm text-textMuted">{workflow.lanes.cancellation.reason}</p>
              {canCreateAssignments ? (
                <button
                  type="button"
                  className="header-secondary-cta mt-3"
                  onClick={() => setActiveForm({ type: 'cancellation', assignmentId: '', isPrimary: true })}
                  disabled={busy || loading}
                >
                  Add Cancellation Attorney
                </button>
              ) : null}
            </article>
          )}
        </div>
      )}
    </section>
  )
}

export default AttorneyAssignmentSection
