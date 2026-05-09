import { useEffect, useMemo, useState } from 'react'
import AttorneyFirmRolePlayerCard from '../branding/AttorneyFirmRolePlayerCard'
import { useWorkspace } from '../../../context/WorkspaceContext'
import useAttorneyPermissions from '../../../hooks/useAttorneyPermissions'
import {
  getTransactionAttorneyAssignments,
  listAttorneyFirmsForAssignment,
  removeTransactionAttorneyAssignment,
} from '../../../services/transactionAttorneyAssignments'
import AttorneyAssignmentForm from './AttorneyAssignmentForm'
import AttorneyAssignmentSummaryCard from './AttorneyAssignmentSummaryCard'

function AttorneyAssignmentSection({ transactionId, financeType = 'cash' }) {
  const { role: appRole } = useWorkspace()
  const permissionState = useAttorneyPermissions()
  const [firms, setFirms] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeForm, setActiveForm] = useState({ type: '', assignmentId: '' })
  const [busy, setBusy] = useState(false)

  const normalizedFinanceType = String(financeType || '').trim().toLowerCase()
  const showBondAssignment = normalizedFinanceType !== 'cash'
  const isAttorneyViewer = appRole === 'attorney'
  const canCreateAssignments = !isAttorneyViewer || permissionState.hasPermission('can_create_attorney_assignments')
  const canUpdateAssignments = !isAttorneyViewer || permissionState.hasPermission('can_update_attorney_assignments')
  const canRemoveAssignments = !isAttorneyViewer || permissionState.hasPermission('can_remove_attorney_assignments')

  const transferAssignment = useMemo(
    () => assignments.find((item) => item.assignmentType === 'transfer' || item.assignmentType === 'transfer_and_bond') || null,
    [assignments],
  )

  const bondAssignment = useMemo(
    () => assignments.find((item) => item.assignmentType === 'bond' || item.assignmentType === 'transfer_and_bond') || null,
    [assignments],
  )

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
      const nextAssignments = await getTransactionAttorneyAssignments(transactionId)
      setAssignments(nextAssignments)
    } catch (removeError) {
      setError(removeError?.message || 'Unable to remove assignment.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaved() {
    setActiveForm({ type: '', assignmentId: '' })
    const nextAssignments = await getTransactionAttorneyAssignments(transactionId)
    setAssignments(nextAssignments)
  }

  function renderAssignmentBlock({ type, assignment, title, helper }) {
    const isEditing = activeForm.type === type

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
              {type === 'bond' ? 'Assign Bond Attorney' : 'Assign Transfer Attorney'}
            </button>
          ) : null}
        </div>

        <div className="mt-3">
          {isEditing ? (
            <AttorneyAssignmentForm
              transactionId={transactionId}
              assignmentType={type}
              firms={firms}
              initialAssignment={assignment || null}
              onSaved={handleSaved}
              onCancel={() => setActiveForm({ type: '', assignmentId: '' })}
            />
          ) : assignment ? (
            <AttorneyAssignmentSummaryCard
              assignment={assignment}
              busy={busy}
              onEdit={canUpdateAssignments ? () => setActiveForm({ type, assignmentId: assignment.id }) : null}
              onRemove={canRemoveAssignments ? () => void handleRemove(assignment) : null}
            />
          ) : (
            <p className="rounded-control border border-dashed border-borderSoft bg-surfaceAlt px-4 py-3 text-sm text-textMuted">
              No {type === 'bond' ? 'bond' : 'transfer'} attorney firm has been assigned to this matter yet.
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
          Assign transfer and bond attorney firms, departments, and responsible users for this matter.
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
            <h4 className="text-base font-semibold text-textStrong">Attorney Role Players</h4>
            <p className="mt-1 text-sm text-textMuted">
              Transfer and bond legal representation currently linked to this transaction.
            </p>
            {transferAssignment || bondAssignment ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
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
            title: 'Transfer Attorney Assignment',
            helper: 'Select the firm, transfer department, and responsible users for transfer work.',
          })}

          {showBondAssignment ? (
            renderAssignmentBlock({
              type: 'bond',
              assignment: bondAssignment,
              title: 'Bond Attorney Assignment',
              helper: 'Select the firm, bond department, and responsible users for bond work.',
            })
          ) : (
            <article className="rounded-control border border-borderSoft bg-surface p-4">
              <h4 className="text-base font-semibold text-textStrong">Bond Attorney Assignment</h4>
              <p className="mt-2 text-sm text-textMuted">
                Finance type is cash. Bond attorney assignment is optional and can be added later if finance type changes.
              </p>
            </article>
          )}
        </div>
      )}
    </section>
  )
}

export default AttorneyAssignmentSection
