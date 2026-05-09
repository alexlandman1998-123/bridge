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

function AttorneyAssignmentForm({
  transactionId,
  assignmentType,
  firms = [],
  initialAssignment = null,
  onSaved,
  onCancel,
}) {
  const [form, setForm] = useState({
    firmId: initialAssignment?.firmId || '',
    departmentId: initialAssignment?.departmentId || '',
    primaryAttorneyId: initialAssignment?.primaryAttorneyId || '',
    secretaryId: initialAssignment?.secretaryId || '',
    adminHandlerId: initialAssignment?.adminHandlerId || '',
    status: initialAssignment?.status || 'active',
  })
  const [departments, setDepartments] = useState([])
  const [assignableMembers, setAssignableMembers] = useState({
    primaryAttorneys: [],
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
        setAssignableMembers({ primaryAttorneys: [], secretaries: [], adminHandlers: [] })
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
          return true
        })

        setDepartments(filteredDepartments)
        setAssignableMembers({
          primaryAttorneys: roleMembers.primaryAttorneys || [],
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
          label={assignmentType === 'bond' ? 'Primary Bond Attorney' : 'Primary Transfer Attorney'}
          options={assignableMembers.primaryAttorneys}
          value={form.primaryAttorneyId}
          onChange={(primaryAttorneyId) => setForm((previous) => ({ ...previous, primaryAttorneyId }))}
          disabled={saving || !form.firmId || loadingMembers}
          optional={false}
        />

        <AttorneyMemberSelector
          label={assignmentType === 'bond' ? 'Bond Secretary' : 'Transfer Secretary'}
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
          {saving ? 'Saving…' : initialAssignment?.id ? 'Update Assignment' : assignmentType === 'bond' ? 'Assign Bond Attorney' : 'Assign Transfer Attorney'}
        </button>
        <button type="button" className="header-secondary-cta" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export default AttorneyAssignmentForm
