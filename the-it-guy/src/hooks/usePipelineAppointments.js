import { useEffect, useState } from 'react'
import useAppointmentReconciliation from './useAppointmentReconciliation'
const EMPTY_APPOINTMENTS = Object.freeze([])

// Keep a failed refresh distinct from a verified empty result, and ignore
// responses from an older organisation, lead, calendar range, or actor.
export default function usePipelineAppointments({ organisationId, leadId = '', listingId = '', from = null, to = null, includeAll = false, agentId = '', agentEmail = '', revision = 0, viewerId = '', enabled = true, timeoutMs = 15000, intervalMs = 30000 }) {
  const [state, setState] = useState({ key: '', rows: [], status: 'idle', error: '', hasSnapshot: false })
  const key = JSON.stringify([organisationId, leadId, listingId, from, to, includeAll, agentId, agentEmail, viewerId])
  const { revision: retry, reload } = useAppointmentReconciliation({ enabled: enabled && Boolean(organisationId), scopeKey: key, intervalMs })

  useEffect(() => {
    if (!enabled || !organisationId) return undefined
    let active = true
    let timer
    setState((previous) => ({ key, rows: previous.key === key ? previous.rows : [], status: 'loading', error: '', hasSnapshot: previous.key === key && previous.hasSnapshot }))
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Appointments are taking too long to load. Please retry.')), timeoutMs)
    })
    Promise.race([
      import('../lib/agencyPipelineService').then(({ listAppointmentsAsync }) => active ? listAppointmentsAsync(organisationId, { leadId, listingId, from, to, includeAll, agentId, agentEmail, agentKeys: [agentId, agentEmail] }) : EMPTY_APPOINTMENTS),
      timeout,
    ]).then((rows) => {
      if (!Array.isArray(rows)) throw new Error('Appointment data could not be verified. Please retry.')
      if (active) setState({ key, rows: [...rows], status: 'ready', error: '', hasSnapshot: true })
    }).catch((error) => {
      if (active) setState((previous) => ({ ...previous, status: 'error', error: error?.message || 'Appointments could not be loaded. Please retry.' }))
    }).finally(() => clearTimeout(timer))
    return () => { active = false; clearTimeout(timer) }
  }, [organisationId, leadId, listingId, from, to, includeAll, agentId, agentEmail, revision, enabled, retry, timeoutMs, key])

  return { ...(enabled && state.key === key ? state : { rows: EMPTY_APPOINTMENTS, status: enabled ? 'loading' : 'idle', error: '', hasSnapshot: false }), reconciliationRevision: retry, reload }
}
