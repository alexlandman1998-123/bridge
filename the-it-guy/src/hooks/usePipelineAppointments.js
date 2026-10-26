import useCalendarRead from './useCalendarRead'
const EMPTY_APPOINTMENTS = Object.freeze([])

export default function usePipelineAppointments({ organisationId, leadId = '', listingId = '', from = null, to = null, includeAll = false, agentId = '', agentEmail = '', revision = 0, viewerId = '', enabled = true, timeoutMs = 15000, intervalMs = 30000 }) {
  const key = JSON.stringify([organisationId, leadId, listingId, from, to, includeAll, agentId, agentEmail, viewerId])
  const source = useCalendarRead({
    scopeKey: key, enabled: enabled && Boolean(organisationId), revision, timeoutMs, intervalMs,
    read: async signal => {
      const { listAppointmentsAsync } = await import('../lib/agencyPipelineService')
      signal.throwIfAborted()
      const rows = await listAppointmentsAsync(organisationId, { leadId, listingId, from, to, includeAll, agentId, agentEmail, agentKeys: [agentId, agentEmail], signal })
      if (!Array.isArray(rows)) throw new Error('Appointment data could not be verified. Please retry.')
      return [...rows]
    },
  })
  return { ...source, rows: source.data || EMPTY_APPOINTMENTS }
}
