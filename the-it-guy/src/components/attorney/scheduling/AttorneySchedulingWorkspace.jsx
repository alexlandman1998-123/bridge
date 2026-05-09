import { useMemo, useState } from 'react'
import TodaySigningQueue from './TodaySigningQueue'
import TransferSigningQueue from './TransferSigningQueue'
import BondSigningQueue from './BondSigningQueue'
import BoardroomSchedule from './BoardroomSchedule'
import RescheduleRequestsPanel from './RescheduleRequestsPanel'
import OperationalAlertsPanel from './OperationalAlertsPanel'
import {
  assignAttorneyAppointmentResource,
  proposeAttorneyAppointmentReschedule,
  resendAttorneyAppointmentCommunication,
  resolveAttorneyAppointmentReschedule,
  updateAttorneyAppointmentOperationalStatus,
  upsertAttorneyAppointmentParticipant,
} from '../../../services/attorneyOperations'
import { getAppointmentTypeTemplate, getAppointmentRequiredPrep } from '../../../services/appointmentTemplateService'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function isPast(dateTimeValue) {
  const value = new Date(dateTimeValue || '').getTime()
  if (!Number.isFinite(value)) return false
  return value < Date.now()
}

function isToday(dateTimeValue) {
  const parsed = new Date(dateTimeValue || '')
  if (Number.isNaN(parsed.getTime())) return false
  const now = new Date()
  return parsed.getFullYear() === now.getFullYear() && parsed.getMonth() === now.getMonth() && parsed.getDate() === now.getDate()
}

function resolveOperationalStatus(row = {}) {
  const status = normalizeLower(row.status)
  if (!status) return 'awaiting_confirmation'
  if (status.includes('cancel')) return 'cancelled'
  if (status.includes('complete')) return 'completed'
  if (status.includes('reschedule')) return 'reschedule_requested'
  if (status.includes('pending') || status.includes('proposed') || status.includes('requested')) return 'awaiting_confirmation'
  if (status.includes('confirm')) return 'confirmed'
  return 'awaiting_confirmation'
}

function readinessLabel(blockers = [], status = '') {
  const normalizedStatus = resolveOperationalStatus({ status })
  if (normalizedStatus === 'cancelled') return 'Cancelled'
  if (normalizedStatus === 'completed') return 'Ready'
  if (blockers.some((item) => item.toLowerCase().includes('document'))) return 'Waiting on Documents'
  if (blockers.some((item) => item.toLowerCase().includes('confirm'))) return 'Waiting on Client'
  if (blockers.some((item) => item.toLowerCase().includes('attorney'))) return 'Waiting on Attorney'
  if (blockers.length) return 'Blocked'
  return 'Ready'
}

function prettifyOperationalStatus(value = '') {
  const normalized = normalizeText(value).replaceAll('_', ' ')
  if (!normalized) return 'Awaiting Confirmation'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function hasOutstandingDocState(status = '') {
  const normalized = normalizeLower(status)
  return ['requested', 'uploaded', 'rejected', 'required', 'under_review'].includes(normalized)
}

function roleCanSeeMatterType(role = '', matterType = '') {
  const normalizedRole = normalizeLower(role)
  const normalizedMatterType = normalizeLower(matterType)
  if (['firm_admin', 'director_partner', 'conveyancing_secretary', 'reception_scheduling'].includes(normalizedRole)) return true
  if (normalizedRole === 'transfer_attorney') return normalizedMatterType.includes('transfer')
  if (normalizedRole === 'bond_attorney') return normalizedMatterType.includes('bond')
  return true
}

function createReadiness(row, documentQueueByTransaction = {}) {
  const blockers = []
  const transactionId = normalizeText(row.transactionId)
  const docs = transactionId ? (documentQueueByTransaction[transactionId] || []) : []
  const pendingDocs = docs.filter((item) => hasOutstandingDocState(item.status))
  if (pendingDocs.length) blockers.push('Required document checks are still pending.')

  const template = getAppointmentTypeTemplate(row.appointmentTypeKey || row.appointmentType)
  const prepChecklist = getAppointmentRequiredPrep(template.type, {
    requirementStatusByKey: {},
    uploadedRequirementKeys: [],
  })
  if (prepChecklist.some((item) => item.completed === false)) {
    blockers.push('Template prep requirements still need confirmation.')
  }

  const status = resolveOperationalStatus(row)
  if (status === 'awaiting_confirmation') {
    blockers.push('Client confirmation is still outstanding.')
  }
  if (!normalizeText(row.assignedAttorneyName) && normalizeLower(row.matterType).includes('transfer')) {
    blockers.push('Transfer attorney allocation missing.')
  }

  if (normalizeLower(row.appointmentTypeKey).includes('transfer')) {
    if (row.flags?.guaranteesOutstanding) blockers.push('Guarantees are still outstanding.')
    if (row.flags?.awaitingFica) blockers.push('FICA documentation is outstanding.')
  }

  if (normalizeLower(row.appointmentTypeKey).includes('bond')) {
    if (row.flags?.bankConditionsPending) blockers.push('Bank conditions are outstanding.')
    if (row.flags?.awaitingFica) blockers.push('Buyer finance/FICA documents are incomplete.')
  }

  if (!normalizeText(row.resourceId) && normalizeLower(row.appointmentTypeKey).includes('signing')) {
    blockers.push('Boardroom/resource is not allocated yet.')
  }

  const label = readinessLabel(blockers, row.status)
  return {
    label,
    blockers,
  }
}

function buildSchedulingRows({ appointmentRows = [], matterRows = [], documentRows = [], role = '' }) {
  const matterByReference = (matterRows || []).reduce((acc, row) => {
    acc[row.matterReference] = row
    return acc
  }, {})

  const documentQueueByTransaction = (documentRows || []).reduce((acc, row) => {
    const key = normalizeText(row.transactionId)
    if (!key) return acc
    if (!acc[key]) acc[key] = []
    acc[key].push(row)
    return acc
  }, {})

  return (appointmentRows || [])
    .map((row) => {
      const matter = matterByReference[row.matterReference] || null
      const operationalStatus = resolveOperationalStatus(row)
      const readiness = createReadiness({
        ...row,
        transactionId: row.transactionId,
        matterType: matter?.matterType || '',
        flags: matter?.flags || {},
        assignedAttorneyName: matter?.assignedRole === 'Primary Attorney' ? matter?.clientName : '',
      }, documentQueueByTransaction)

      const warnings = readiness.blockers
      const transferWarnings = warnings.filter((item) => item.toLowerCase().includes('guarantee') || item.toLowerCase().includes('levy') || item.toLowerCase().includes('fica') || item.toLowerCase().includes('document'))
      const bondWarnings = warnings.filter((item) => item.toLowerCase().includes('bank') || item.toLowerCase().includes('finance') || item.toLowerCase().includes('document'))

      return {
        ...row,
        matterType: matter?.matterType || 'Transfer',
        flags: matter?.flags || {},
        operationalStatus,
        operationalStatusLabel: prettifyOperationalStatus(operationalStatus),
        readiness,
        transferWarnings,
        bondWarnings,
        transactionId: row.transactionId || null,
        requiredDocuments: Array.isArray(row.requiredDocuments) ? row.requiredDocuments : [],
      }
    })
    .filter((row) => roleCanSeeMatterType(role, row.matterType))
}

function sortByDateAscending(rows = []) {
  return [...rows].sort((a, b) => new Date(a.dateTime || 0).getTime() - new Date(b.dateTime || 0).getTime())
}

function filterActive(rows = []) {
  return rows.filter((row) => !['cancelled', 'completed'].includes(row.operationalStatus))
}

function buildOperationalAlerts(rows = []) {
  const alerts = []
  for (const row of rows) {
    if (row.operationalStatus === 'reschedule_requested') {
      alerts.push({
        id: `reschedule-${row.id}`,
        title: `${row.appointmentType} needs reschedule action`,
        description: `${row.matterReference}: reschedule request is pending coordinator decision.`,
      })
    }

    if (row.readiness?.label === 'Blocked') {
      alerts.push({
        id: `blocked-${row.id}`,
        title: `${row.appointmentType} is blocked`,
        description: `${row.matterReference}: ${row.readiness.blockers[0] || 'Operational blocker detected.'}`,
      })
    }

    if (row.operationalStatus === 'awaiting_confirmation' && isPast(row.dateTime)) {
      alerts.push({
        id: `overdue-confirm-${row.id}`,
        title: `Unconfirmed signing is overdue`,
        description: `${row.matterReference}: appointment date passed without confirmation.`,
      })
    }
  }
  return alerts
}

function normalizeStaffOptions(members = []) {
  return (members || [])
    .filter((member) => ['conveyancing_secretary', 'admin_staff', 'reception_scheduling', 'candidate_attorney'].includes(normalizeLower(member.role)))
    .map((member) => ({
      value: member.value,
      label: member.label,
    }))
}

function buildRescheduleRows(appointmentRows = []) {
  return appointmentRows
    .flatMap((appointment) => (Array.isArray(appointment.rescheduleRequests) ? appointment.rescheduleRequests.map((request) => ({
      requestId: request.id,
      appointmentId: appointment.id,
      appointmentType: appointment.appointmentType,
      matterReference: appointment.matterReference,
      clientName: appointment.clientName,
      requestedByRole: request.requestedByRole,
      reason: request.reason,
      preferredStart: request.preferredStart,
      preferredEnd: request.preferredEnd,
      status: request.status,
      appointment,
    })) : []))
    .filter((row) => ['pending', 'proposed'].includes(normalizeLower(row.status)))
}

function AttorneySchedulingWorkspace({
  appointmentRows = [],
  matterRows = [],
  documentRows = [],
  resources = [],
  memberOptions = [],
  currentRole = '',
  onWorkspaceChanged = null,
}) {
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const normalizedRows = useMemo(
    () => buildSchedulingRows({ appointmentRows, matterRows, documentRows, role: currentRole }),
    [appointmentRows, matterRows, documentRows, currentRole],
  )

  const todayRows = useMemo(() => sortByDateAscending(filterActive(normalizedRows).filter((row) => isToday(row.dateTime))), [normalizedRows])
  const upcomingRows = useMemo(() => sortByDateAscending(filterActive(normalizedRows).filter((row) => !isToday(row.dateTime))), [normalizedRows])
  const transferRows = useMemo(() => sortByDateAscending(filterActive(normalizedRows).filter((row) => normalizeLower(row.appointmentTypeKey).includes('transfer'))), [normalizedRows])
  const bondRows = useMemo(() => sortByDateAscending(filterActive(normalizedRows).filter((row) => normalizeLower(row.appointmentTypeKey).includes('bond'))), [normalizedRows])
  const pendingConfirmations = useMemo(
    () => sortByDateAscending(filterActive(normalizedRows).filter((row) => row.operationalStatus === 'awaiting_confirmation')),
    [normalizedRows],
  )

  const rescheduleRows = useMemo(() => buildRescheduleRows(normalizedRows), [normalizedRows])
  const operationalAlerts = useMemo(() => buildOperationalAlerts(normalizedRows), [normalizedRows])

  const metrics = useMemo(() => ({
    todaysAppointments: todayRows.length,
    pendingConfirmations: pendingConfirmations.length,
    blockedSignings: normalizedRows.filter((row) => row.readiness?.label === 'Blocked').length,
    overdueSignings: normalizedRows.filter((row) => row.operationalStatus === 'awaiting_confirmation' && isPast(row.dateTime)).length,
    rescheduleRequests: rescheduleRows.length,
    boardroomUtilisation: resources.length
      ? Math.round((normalizedRows.filter((row) => normalizeText(row.resourceId)).length / Math.max(1, normalizedRows.length)) * 100)
      : 0,
  }), [todayRows.length, pendingConfirmations.length, normalizedRows, rescheduleRows.length, resources.length])

  const staffOptions = useMemo(() => normalizeStaffOptions(memberOptions), [memberOptions])

  async function withBusy(id, callback) {
    setBusyId(id)
    setError('')
    setMessage('')
    try {
      await callback()
      setMessage('Scheduling workspace updated.')
      onWorkspaceChanged?.()
    } catch (actionError) {
      setError(actionError?.message || 'Unable to update scheduling workspace.')
    } finally {
      setBusyId('')
    }
  }

  return (
    <section className="page" style={{ display: 'grid', gap: '1rem' }}>
      {error ? (
        <div className="panel card-tier-standard">
          <p className="status-message" style={{ margin: 0, color: '#b42318' }}>{error}</p>
        </div>
      ) : null}
      {message ? (
        <div className="panel card-tier-standard">
          <p className="status-message" style={{ margin: 0, color: '#067647' }}>{message}</p>
        </div>
      ) : null}

      <section className="panel card-tier-soft" style={{ display: 'grid', gap: '0.65rem' }}>
        <h3 style={{ margin: 0 }}>Scheduling Operations Dashboard</h3>
        <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <div><p className="status-message" style={{ margin: 0 }}>Today&apos;s Appointments</p><p style={{ margin: '0.1rem 0 0 0', fontWeight: 700 }}>{metrics.todaysAppointments}</p></div>
          <div><p className="status-message" style={{ margin: 0 }}>Pending Confirmations</p><p style={{ margin: '0.1rem 0 0 0', fontWeight: 700 }}>{metrics.pendingConfirmations}</p></div>
          <div><p className="status-message" style={{ margin: 0 }}>Blocked Signings</p><p style={{ margin: '0.1rem 0 0 0', fontWeight: 700 }}>{metrics.blockedSignings}</p></div>
          <div><p className="status-message" style={{ margin: 0 }}>Overdue Signings</p><p style={{ margin: '0.1rem 0 0 0', fontWeight: 700 }}>{metrics.overdueSignings}</p></div>
          <div><p className="status-message" style={{ margin: 0 }}>Reschedule Requests</p><p style={{ margin: '0.1rem 0 0 0', fontWeight: 700 }}>{metrics.rescheduleRequests}</p></div>
          <div><p className="status-message" style={{ margin: 0 }}>Boardroom Utilisation</p><p style={{ margin: '0.1rem 0 0 0', fontWeight: 700 }}>{metrics.boardroomUtilisation}%</p></div>
        </div>
      </section>

      {busyId ? (
        <div className="panel card-tier-soft"><p className="status-message" style={{ margin: 0 }}>Processing scheduling action…</p></div>
      ) : null}

      <TodaySigningQueue
        rows={todayRows}
        resources={resources}
        staffOptions={staffOptions}
        onResourceAssign={(row, resourceId) => withBusy(`resource-${row.id}`, async () => {
          await assignAttorneyAppointmentResource(row.id, resourceId || null)
        })}
        onStaffAssign={(row, payload) => withBusy(`staff-${row.id}-${payload?.role || ''}`, async () => {
          const selected = (memberOptions || []).find((item) => String(item.value) === String(payload?.userId || ''))
          await upsertAttorneyAppointmentParticipant(row.id, {
            participantRole: payload.role,
            name: selected?.label || 'Assigned Staff',
            email: '',
          })
        })}
        onMarkCompleted={(row) => withBusy(`complete-${row.id}`, async () => {
          await updateAttorneyAppointmentOperationalStatus(row.id, 'completed', { actorRole: currentRole })
        })}
        onOpenReschedule={(row) => withBusy(`reschedule-${row.id}`, async () => {
          const existing = Array.isArray(row.rescheduleRequests) ? row.rescheduleRequests[0] : null
          if (existing?.id) {
            await proposeAttorneyAppointmentReschedule(existing.id, {
              preferredStart: row.dateTime,
              reason: 'Coordinator requested alternate slot.',
            })
          } else {
            throw new Error('No active reschedule request is available for this appointment.')
          }
        })}
        onResendCommunication={(row, kind) => withBusy(`notify-${row.id}-${kind}`, async () => {
          await resendAttorneyAppointmentCommunication(row.id, kind)
        })}
      />

      <section className="panel card-tier-standard" style={{ display: 'grid', gap: '0.55rem' }}>
        <h3 style={{ margin: 0 }}>Upcoming Signings</h3>
        {!upcomingRows.length ? (
          <p className="status-message" style={{ margin: 0 }}>No upcoming signing appointments.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.35rem' }}>
            {upcomingRows.slice(0, 12).map((row) => (
              <p key={row.id} style={{ margin: 0, fontSize: '0.77rem' }}>{row.appointmentType} · {row.matterReference} · {new Date(row.dateTime || '').toLocaleString('en-ZA')}</p>
            ))}
          </div>
        )}
      </section>

      <TransferSigningQueue rows={transferRows} />
      <BondSigningQueue rows={bondRows} />

      <section className="panel card-tier-standard" style={{ display: 'grid', gap: '0.6rem' }}>
        <h3 style={{ margin: 0 }}>Pending Confirmations</h3>
        {!pendingConfirmations.length ? (
          <p className="status-message" style={{ margin: 0 }}>No pending confirmation appointments.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.45rem' }}>
            {pendingConfirmations.map((row) => (
              <div key={row.id} style={{ border: '1px solid #dce6f2', borderRadius: '10px', padding: '0.48rem 0.55rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <p style={{ margin: 0, fontSize: '0.76rem' }}>{row.appointmentType} · {row.matterReference}</p>
                <button
                  type="button"
                  className="header-secondary-cta"
                  onClick={() => withBusy(`confirm-${row.id}`, async () => {
                    await resendAttorneyAppointmentCommunication(row.id, 'confirmation')
                  })}
                >
                  Resend Confirmation
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <RescheduleRequestsPanel
        rows={rescheduleRows}
        onPropose={(row) => withBusy(`propose-${row.requestId}`, async () => {
          await proposeAttorneyAppointmentReschedule(row.requestId, {
            preferredStart: row.preferredStart || row.appointment?.dateTime,
            reason: 'Attorney scheduling coordination proposal.',
          })
        })}
        onResolve={(row, decision) => withBusy(`resolve-${row.requestId}-${decision}`, async () => {
          await resolveAttorneyAppointmentReschedule(row.requestId, {
            decision,
            reason: decision === 'rejected' ? 'Unable to accommodate requested slot.' : 'Reschedule approved.',
          })
        })}
      />

      <BoardroomSchedule
        resources={resources}
        usageRows={filterActive(normalizedRows)}
        onAssignResource={(row, resourceId) => withBusy(`resource-panel-${row.id}`, async () => {
          await assignAttorneyAppointmentResource(row.id, resourceId || null)
        })}
      />

      <OperationalAlertsPanel rows={operationalAlerts} />
    </section>
  )
}

export default AttorneySchedulingWorkspace
