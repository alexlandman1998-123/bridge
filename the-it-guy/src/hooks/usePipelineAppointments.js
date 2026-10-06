import { useCallback, useEffect, useState } from 'react'
import { listAppointmentsAsync } from '../lib/agencyPipelineService'

// Keep a failed refresh distinct from a verified empty result, and ignore
// responses from an older organisation, lead, calendar range, or actor.
export default function usePipelineAppointments({ organisationId, leadId = '', from = null, to = null, includeAll = false, agentId = '', agentEmail = '', revision = 0, enabled = true, timeoutMs = 15000 }) {
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState({ key: '', rows: [], status: 'idle', error: '' })
  const key = JSON.stringify([organisationId, leadId, from, to, includeAll, agentId, agentEmail])
  const reload = useCallback(() => setRetry((value) => value + 1), [])

  useEffect(() => {
    if (!enabled || !organisationId) return undefined
    let active = true
    let timer
    setState((previous) => ({ key, rows: previous.key === key ? previous.rows : [], status: 'loading', error: '' }))
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Appointments are taking too long to load. Please retry.')), timeoutMs)
    })
    Promise.race([
      listAppointmentsAsync(organisationId, { leadId, from, to, includeAll, agentId, agentEmail, agentKeys: [agentId, agentEmail] }),
      timeout,
    ]).then((rows) => {
      if (!Array.isArray(rows)) throw new Error('Appointment data could not be verified. Please retry.')
      if (active) setState({ key, rows, status: 'ready', error: '' })
    }).catch((error) => {
      if (active) setState((previous) => ({ ...previous, status: 'error', error: error?.message || 'Appointments could not be loaded. Please retry.' }))
    }).finally(() => clearTimeout(timer))
    return () => { active = false; clearTimeout(timer) }
  }, [organisationId, leadId, from, to, includeAll, agentId, agentEmail, revision, enabled, retry, timeoutMs, key])

  return { ...(enabled && state.key === key ? state : { rows: [], status: enabled ? 'loading' : 'idle', error: '' }), reload }
}
