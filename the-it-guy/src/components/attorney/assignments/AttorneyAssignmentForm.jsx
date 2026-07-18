import { useEffect, useMemo, useState } from 'react'
import { getAttorneyFirmDepartments } from '../../../services/attorneyFirms'
import {
  ATTORNEY_ASSIGNMENT_STATUSES,
  createTransactionAttorneyAssignment,
  getAssignableAttorneyFirmMembers,
  updateTransactionAttorneyAssignment,
} from '../../../services/transactionAttorneyAssignments'
import AttorneyFirmSelector from './AttorneyFirmSelector'
import AttorneyMemberSelector from './AttorneyMemberSelector'

function toStatusLabel(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'pending') return 'Pending'
  if (normalized === 'active') return 'Active'
  if (normalized === 'paused') return 'Paused'
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'removed') return 'Removed'
  return value
}

function assignmentRoleLabel(assignmentType, roleName) {
  if (assignmentType === 'bond') return roleName === 'secretary' ? 'Bond Secretary' : 'Primary Bond Attorney'
  if (assignmentType === 'cancellation') return roleName === 'secretary' ? 'Cancellation Secretary' : 'Primary Cancellation Attorney'
  return roleName === 'secretary' ? 'Transfer Secretary' : 'Primary Transfer Attorney'
}

function AttorneyAssignmentForm({
  transactionId,
  assignmentType,
  firms = [],
  initialAssignment = null,
  isPrimaryDefault = true,
  onSaved,
  onCancel,
}) {
  const [form, setForm] = useState({
    firmId: initialAssignment?.firmId || '',
    departmentId: initialAssignment?.departmentId || '',
    primaryAttorneyId: initialAssignment?.attorneyUserId || initialAssignment?.primaryAttorneyId || '',
    secretaryId: initialAssignment?.secretaryId || '',
    adminHandlerId: initialAssignment?.adminHandlerId || '',
    status: initialAssignment?.status || 'active',
    isPrimary: initialAssignment?.isPrimary ?? isPrimaryDefault,
  })
  const [departments, setDepartments] = useState([])
  const [assignableMembers, setAssignableMembers] = useState({
    primaryAttorneys: [],
    supportingAttorneys: [],
    secretaries: [],
    adminHandlers: [],
  })
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function hydrateFirmData() {
      if (!form.firmId) {
        if (!active) return
        setDepartments([])
        setAssignableMembers({ primaryAttorneys: [], supportingAttorneys: [], secretaries: [], adminHandlers: [] })
        return
      }

      setLoadingMembers(true)
      try {
        const [firmDepartments, roleMembers] = await Promise.all([
          getAttorneyFirmDepartments(form.firmId),
          getAssignableAttorneyFirmMembers(form.firmId, assignmentType),
        ])

        if (!active) return

        const filteredDepartments = (firmDepartments || []).filter((department) => {
          if (!department.isActive) return false
          const departmentType = String(department.departmentType || '').toLowerCase()
          if (assignmentType === 'transfer') {
            return ['transfer', 'management'].includes(departmentType)
          }
          if (assignmentType === 'bond') {
            return ['bond', 'management'].includes(departmentType)
          }
          if (assignmentType === 'cancellation') {
            return ['transfer', 'admin', 'management'].includes(departmentType)
          }
          return true
        })

        setDepartments(filteredDepartments)
        setAssignableMembers({
          primaryAttorneys: roleMembers.primaryAttorneys || [],
          supportingAttorneys: roleMembers.supportingAttorneys || [],
          secretaries: roleMembers.secretaries || [],
          adminHandlers: roleMembers.adminHandlers || [],
        })
      } catch (firmLoadError) {
        if (!active) return
        setError(firmLoadError?.message || 'Unable to load firm members for assignment.')
      } finally {
        if (active) setLoadingMembers(false)
      }
    }

    void hydrateFirmData()

    return () => {
      active = false
    }
  }, [assignmentType, form.firmId])

  const statusOptions = useMemo(() => ATTORNEY_ASSIGNMENT_STATUSES.filter((status) => status !== 'removed'), [])

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        transactionId,
        assignmentType,
        firmId: form.firmId,
        departmentId: form.departmentId || null,
        primaryAttorneyId: form.primaryAttorneyId || null,
        secretaryId: form.secretaryId || null,
        adminHandlerId: form.adminHandlerId || null,
        status: form.status,
        isPrimary: form.isPrimary,
      }

      const result = initialAssignment?.id
        ? await updateTransactionAttorneyAssignment(initialAssignment.id, payload)
        : await createTransactionAttorneyAssignment(payload)

      onSaved?.(result)
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save attorney assignment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-control border border-borderSoft bg-surfaceAlt p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <AttorneyFirmSelector
          firms={firms}
          value={form.firmId}
          onChange={(firmId) =>
            setForm((previous) => ({
              ...previous,
              firmId,
              departmentId: '',
              primaryAttorneyId: '',
              secretaryId: '',
              adminHandlerId: '',
            }))
          }
          disabled={saving}
        />

        <label className="flex flex-col gap-1.5">
          <span className="text-label font-semibold uppercase text-textMuted">Department</span>
          <select
            className="input"
            value={form.departmentId}
            onChange={(event) => setForm((previous) => ({ ...previous, departmentId: event.target.value }))}
            disabled={saving || !form.firmId || loadingMembers}
          >
            <option value="">Select department</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>

        <AttorneyMemberSelector
          label={form.isPrimary ? assignmentRoleLabel(assignmentType) : `Supporting ${assignmentRoleLabel(assignmentType).replace('Primary ', '')}`}
          options={form.isPrimary ? assignableMembers.primaryAttorneys : assignableMembers.supportingAttorneys}
          value={form.primaryAttorneyId}
          onChange={(primaryAttorneyId) => setForm((previous) => ({ ...previous, primaryAttorneyId }))}
          disabled={saving || !form.firmId || loadingMembers}
          optional={false}
        />

        <label className="flex flex-col gap-1.5">
          <span className="text-label font-semibold uppercase text-textMuted">Assignment Type</span>
          <select
            className="input"
            value={form.isPrimary ? 'primary' : 'supporting'}
            onChange={(event) => setForm((previous) => ({ ...previous, isPrimary: event.target.value === 'primary', primaryAttorneyId: '' }))}
            disabled={saving || Boolean(initialAssignment?.id && initialAssignment.isPrimary)}
          >
            <option value="primary">Primary attorney</option>
            <option value="supporting">Supporting attorney</option>
          </select>
        </label>

        <AttorneyMemberSelector
          label={assignmentRoleLabel(assignmentType, 'secretary')}
          options={assignableMembers.secretaries}
          value={form.secretaryId}
          onChange={(secretaryId) => setForm((previous) => ({ ...previous, secretaryId }))}
          disabled={saving || !form.firmId || loadingMembers}
        />

        <AttorneyMemberSelector
          label="Admin Handler"
          options={assignableMembers.adminHandlers}
          value={form.adminHandlerId}
          onChange={(adminHandlerId) => setForm((previous) => ({ ...previous, adminHandlerId }))}
          disabled={saving || !form.firmId || loadingMembers}
        />

        <label className="flex flex-col gap-1.5">
          <span className="text-label font-semibold uppercase text-textMuted">Status</span>
          <select
            className="input"
            value={form.status}
            onChange={(event) => setForm((previous) => ({ ...previous, status: event.target.value }))}
            disabled={saving}
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {toStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" className="header-primary-cta" disabled={saving || loadingMembers}>
          {saving
            ? 'Saving…'
            : initialAssignment?.id
              ? 'Update Assignment'
              : assignmentType === 'bond'
                ? 'Assign Bond Attorney'
                : assignmentType === 'cancellation'
                  ? 'Assign Cancellation Attorney'
                  : 'Assign Transfer Attorney'}
        </button>
        <button type="button" className="header-secondary-cta" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export default AttorneyAssignmentForm
