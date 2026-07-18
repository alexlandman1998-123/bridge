import { useEffect, useState } from 'react'
import { getAssignableAttorneyFirmMembers } from '../../../services/transactionAttorneyAssignments'
import {
  acknowledgeAttorneyFirmAllocationAlert,
  getAttorneyFirmAllocationAlerts,
} from '../../../services/attorneyFirmAllocationAlertsService'
import {
  getTransferFirmAllocationLabel,
  manageTransferFirmAllocation,
  TRANSFER_FIRM_ALLOCATION_STATES,
} from '../../../services/transferFirmAllocationService'

function TransferFirmAllocationActions({ allocation, canManage = false, onChanged }) {
  const [members, setMembers] = useState([])
  const [attorneyUserId, setAttorneyUserId] = useState(allocation?.attorneyUserId || '')
  const [declineReason, setDeclineReason] = useState('')
  const [showDecline, setShowDecline] = useState(false)
  const [busyAction, setBusyAction] = useState('')
  const [error, setError] = useState('')
  const [alerts, setAlerts] = useState([])

  const state = allocation?.allocationState || ''
  const isFirmFirst = allocation?.firmAcceptanceStatus !== 'not_required' || [
    TRANSFER_FIRM_ALLOCATION_STATES.awaitingFirmAcceptance,
    TRANSFER_FIRM_ALLOCATION_STATES.awaitingStaffAssignment,
    TRANSFER_FIRM_ALLOCATION_STATES.staffAssigned,
  ].includes(state)
  const needsMember = state === TRANSFER_FIRM_ALLOCATION_STATES.awaitingStaffAssignment
  const preferredContact = [allocation?.preferredContactName, allocation?.preferredContactEmail].filter(Boolean).join(' · ')

  useEffect(() => {
    let active = true
    if (!needsMember || !allocation?.firmId) return undefined
    getAssignableAttorneyFirmMembers(allocation.firmId, 'transfer')
      .then((result) => {
        if (active) setMembers(result.primaryAttorneys || [])
      })
      .catch((loadError) => {
        if (active) setError(loadError?.message || 'Unable to load eligible firm members.')
      })
    return () => { active = false }
  }, [allocation?.firmId, needsMember])

  useEffect(() => {
    let active = true
    if (!allocation?.transactionId) return undefined
    getAttorneyFirmAllocationAlerts({ transactionId: allocation.transactionId })
      .then((result) => {
        if (active) setAlerts(result.alerts || [])
      })
      .catch(() => {
        if (active) setAlerts([])
      })
    return () => { active = false }
  }, [allocation?.allocationState, allocation?.transactionId])

  if (!allocation || !isFirmFirst || !Object.values(TRANSFER_FIRM_ALLOCATION_STATES).includes(state)) return null

  async function run(action) {
    setBusyAction(action)
    setError('')
    try {
      const result = await manageTransferFirmAllocation({
        assignmentId: allocation.id,
        action,
        attorneyUserId: action === 'assign_primary' ? attorneyUserId : null,
        reason: action === 'decline' ? declineReason : null,
      })
      setShowDecline(false)
      setDeclineReason('')
      await onChanged?.(result)
    } catch (actionError) {
      setError(actionError?.message || 'Unable to update this transfer allocation.')
    } finally {
      setBusyAction('')
    }
  }

  async function acknowledgeAlert(alertId) {
    setBusyAction(`alert:${alertId}`)
    setError('')
    try {
      const updated = await acknowledgeAttorneyFirmAllocationAlert(alertId)
      setAlerts((current) => current.map((alert) => alert.id === alertId ? updated : alert))
    } catch (actionError) {
      setError(actionError?.message || 'Unable to acknowledge this allocation alert.')
    } finally {
      setBusyAction('')
    }
  }

  return (
    <div className="mb-3 rounded-control border border-primary/25 bg-primary/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-textMuted">Firm-first allocation</p>
          <p className="mt-1 text-sm font-semibold text-textStrong">{getTransferFirmAllocationLabel(state)}</p>
          {preferredContact ? (
            <p className="mt-1 text-xs text-textMuted">Agent preference (non-binding): {preferredContact}</p>
          ) : null}
        </div>
        <span className="rounded-full border border-primary/25 bg-surface px-3 py-1 text-xs font-semibold text-primary">
          {getTransferFirmAllocationLabel(state)}
        </span>
      </div>

      {error ? <p className="mt-3 rounded-control border border-danger/30 bg-dangerSoft px-3 py-2 text-sm text-danger">{error}</p> : null}

      {alerts.length ? (
        <div className="mt-3 grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-textMuted">Operational alerts</p>
          {alerts.map((alert) => (
            <div key={alert.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-control border px-3 py-2 text-sm ${alert.severity === 'critical' ? 'border-danger/30 bg-dangerSoft text-danger' : 'border-warning/30 bg-warningSoft text-warning'}`}>
              <span>{String(alert.alertType || '').replaceAll('_', ' ')}</span>
              {canManage && alert.status === 'open' ? (
                <button type="button" className="text-xs font-semibold underline" disabled={Boolean(busyAction)} onClick={() => void acknowledgeAlert(alert.id)}>
                  {busyAction === `alert:${alert.id}` ? 'Acknowledging…' : 'Acknowledge'}
                </button>
              ) : (
                <span className="text-xs font-semibold uppercase">{alert.status}</span>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {canManage && state === TRANSFER_FIRM_ALLOCATION_STATES.awaitingFirmAcceptance ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="header-primary-cta" disabled={Boolean(busyAction)} onClick={() => void run('accept')}>
            {busyAction === 'accept' ? 'Accepting…' : 'Accept for Firm'}
          </button>
          <button type="button" className="header-secondary-cta" disabled={Boolean(busyAction)} onClick={() => setShowDecline(true)}>
            Decline
          </button>
        </div>
      ) : null}

      {canManage && needsMember ? (
        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <label className="flex flex-col gap-1.5">
            <span className="text-label font-semibold uppercase text-textMuted">Primary transfer attorney</span>
            <select className="input" value={attorneyUserId} onChange={(event) => setAttorneyUserId(event.target.value)} disabled={Boolean(busyAction)}>
              <option value="">Select an active firm member</option>
              {members.map((member) => (
                <option key={member.userId || member.id} value={member.userId || member.id}>{member.name || member.email || 'Firm member'}</option>
              ))}
            </select>
          </label>
          <button type="button" className="header-primary-cta self-end" disabled={Boolean(busyAction) || !attorneyUserId} onClick={() => void run('assign_primary')}>
            {busyAction === 'assign_primary' ? 'Assigning…' : 'Assign Primary'}
          </button>
        </div>
      ) : null}

      {canManage && state === TRANSFER_FIRM_ALLOCATION_STATES.staffAssigned ? (
        <div className="mt-3">
          <p className="mb-2 text-sm text-textMuted">Firm acceptance and internal assignment are complete. Activating accepts the transfer instruction and opens the matter.</p>
          <button type="button" className="header-primary-cta" disabled={Boolean(busyAction)} onClick={() => void run('activate')}>
            {busyAction === 'activate' ? 'Activating…' : 'Activate Transfer Matter'}
          </button>
        </div>
      ) : null}

      {showDecline ? (
        <div className="mt-3 grid gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-label font-semibold uppercase text-textMuted">Decline reason</span>
            <textarea className="input min-h-20" value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} placeholder="Explain why the firm cannot take this transfer" />
          </label>
          <div className="flex gap-2">
            <button type="button" className="header-secondary-cta text-danger" disabled={Boolean(busyAction) || !declineReason.trim()} onClick={() => void run('decline')}>
              {busyAction === 'decline' ? 'Declining…' : 'Confirm Decline'}
            </button>
            <button type="button" className="header-secondary-cta" disabled={Boolean(busyAction)} onClick={() => setShowDecline(false)}>Cancel</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default TransferFirmAllocationActions
