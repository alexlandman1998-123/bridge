import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AGENCY_CRM_UPDATED_EVENT } from '../../lib/agencyCrmUpdateBus'
import { loadAgentNeedsAttentionRecords } from '../../services/agentNeedsAttentionService'
import { buildAgentNeedsAttention } from './agentNeedsAttentionModel'
import { EmptyWorkspaceState, WorkspaceCard } from './AgentWorkspaceUi'

export default function AgentNeedsAttention({ agent }) {
  const organisationId = String(agent.organisationId || agent.organisation_id || '').trim()
  const identity = [organisationId, agent.userId || agent.user_id || agent.id, agent.organisationUserId, agent.email].join(':')
  const [refresh, setRefresh] = useState(0)
  const [state, setState] = useState({ identity: '', loading: true, records: null, error: '' })
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let cancelled = false
    loadAgentNeedsAttentionRecords(organisationId).then((records) => {
      if (!cancelled) setState({ identity, refresh, loading: false, records, error: '' })
    }).catch(() => {
      if (!cancelled) setState({ identity, refresh, loading: false, records: null, error: 'Unable to load new leads and follow-ups. Please retry.' })
    })
    return () => { cancelled = true }
  }, [identity, organisationId, refresh])

  useEffect(() => {
    const refreshRecords = (event) => {
      if (event?.detail?.organisationId && event.detail.organisationId !== organisationId) return
      setNow(new Date())
      setRefresh((value) => value + 1)
    }
    const interval = window.setInterval(() => setNow(new Date()), 60_000)
    window.addEventListener('focus', refreshRecords)
    window.addEventListener(AGENCY_CRM_UPDATED_EVENT, refreshRecords)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshRecords)
      window.removeEventListener(AGENCY_CRM_UPDATED_EVENT, refreshRecords)
    }
  }, [organisationId])

  const loading = state.identity !== identity || state.refresh !== refresh || state.loading
  const items = !loading && state.records ? buildAgentNeedsAttention({ agent, ...state.records, now }) : []
  return (
    <WorkspaceCard title="Needs attention" actionLabel={loading ? '' : state.error ? 'Retry' : 'Refresh'} onAction={() => { setNow(new Date()); setRefresh((value) => value + 1) }}>
      <p className="mb-4 text-sm text-[#60758d]">New leads and follow-ups due today or overdue. Showing the five most urgent.</p>
      {loading ? <p role="status" className="py-5 text-sm text-[#60758d]">Loading next actions…</p> : state.error ? (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{state.error}</p>
      ) : items.length ? (
        <ol className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="min-w-0 rounded-xl border border-[#e4ebf5] bg-[#fbfcfe] p-3">
              <p className="break-words text-sm font-semibold text-[#10243a]">{item.name}</p>
              {item.property ? <p className="mt-0.5 break-words text-xs text-[#60758d]">{item.property}</p> : null}
              <p className="mt-1 break-words text-sm text-[#526981]">{item.reason}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs">
                  <p className={`font-semibold ${item.overdue ? 'text-[#b42318]' : 'text-[#526981]'}`}>{item.dueDate && !item.overdue ? `Due ${item.dueLabel}` : item.dueLabel}</p>
                  {item.receivedLabel ? <p className="mt-1 text-[#60758d]">{item.receivedLabel}</p> : null}
                </div>
                <Link to={item.href} aria-label={`${item.actionLabel} for ${item.name}`} className="inline-flex min-h-10 items-center rounded-xl border border-[#d9e3ef] bg-white px-3 text-xs font-semibold text-[#1769d1] transition hover:border-[#1769d1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769d1]">{item.actionLabel}</Link>
              </div>
            </li>
          ))}
        </ol>
      ) : <EmptyWorkspaceState>No new leads awaiting contact or follow-ups due for this agent.</EmptyWorkspaceState>}
    </WorkspaceCard>
  )
}
