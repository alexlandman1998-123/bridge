import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlarmClock, Loader2, RefreshCw } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { getRentalLeadServiceLevelOwner } from '../../services/rentals/rentalLeadServiceLevelModel'
import { getRentalLeadServiceLevelQueue } from '../../services/rentals/rentalLeadServiceLevelService'
import { resolveRentalWorkspaceScope } from '../../services/rentals/rentalWorkspaceScope'

const STATES = ['overdue', 'at_risk', 'on_track']
const label = (value) => ({ overdue: 'Overdue', at_risk: 'Due within 24 hours', on_track: 'On track' }[value] || value)
const dateLabel = (value) => value ? new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'No due date'
const tone = (state) => state === 'overdue' ? 'border-[#f2c6c6] bg-[#fff7f7] text-[#9f3131]' : state === 'at_risk' ? 'border-[#f0dfbd] bg-[#fffaf0] text-[#8a641d]' : 'border-[#dbe6f2] bg-white text-[#42617f]'

export default function RentalLeadServiceLevelsPage() {
  const workspace = useWorkspace()
  const scope = useMemo(() => resolveRentalWorkspaceScope(workspace), [workspace])
  const options = useMemo(() => ({ assignedAgentId: scope.assignedAgentId, branchId: scope.branchId, scopeLevel: scope.scopeLevel, includeAllOrganisationLeads: scope.scopeLevel === 'organisation' }), [scope])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!scope.organisationId) { setSummary(null); setLoading(false); return }
    try { setLoading(true); setError(''); setSummary(await getRentalLeadServiceLevelQueue(scope.organisationId, options)) } catch (loadError) { setError(loadError?.message || 'Unable to load service levels.') } finally { setLoading(false) }
  }, [options, scope.organisationId])
  useEffect(() => { void load() }, [load])

  return <section className="page-content"><div className="ui-section-stack"><header className="ui-toolbar"><div className="ui-toolbar-group"><AlarmClock size={20} /><div><p className="text-xs font-semibold uppercase text-[#607891]">Rental pipeline</p><h1 className="text-2xl font-semibold text-[#18324b]">Service-level queue</h1><p className="mt-1 text-sm text-[#607891]">Follow-up due dates are operational targets. This queue highlights risk; it does not change a lead or send communication.</p></div></div><button type="button" className="ui-pill-button" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}Refresh</button></header>{error ? <p className="rounded-[12px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{error}</p> : null}{loading ? <p className="py-12 text-center text-sm text-[#607891]"><Loader2 className="mr-2 inline animate-spin" size={15} />Loading service levels…</p> : summary ? <><div className="grid gap-4 md:grid-cols-3">{STATES.map((state) => <article key={state} className={`ui-panel ui-panel-body ${tone(state)}`}><p className="text-3xl font-semibold">{summary.counts[state]}</p><p className="mt-1 text-sm">{label(state)}</p></article>)}</div><section className="ui-panel ui-panel-body"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-[#18324b]">Follow-up commitments</h2><p className="mt-1 text-sm text-[#607891]">Ordered by urgency. Complete or re-plan work in the Follow-ups workspace.</p></div><Link className="text-sm font-semibold text-[#1f4f78]" to="/agent/rentals/pipeline/follow-ups">Open follow-ups</Link></div><div className="mt-4 grid gap-3">{summary.queue.filter((task) => task.serviceLevelState !== 'completed').length ? summary.queue.filter((task) => task.serviceLevelState !== 'completed').map((task) => <article key={task.taskId} className={`rounded-[12px] border p-4 ${tone(task.serviceLevelState)}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-[#18324b]">{task.title}</p><p className="mt-1 text-sm text-[#607891]">{task.lead?.name || 'Rental lead'} · {task.lead?.role || 'lead'} · Owner: {getRentalLeadServiceLevelOwner(task)}</p></div><span className="rounded-full border border-current px-2.5 py-1 text-xs font-semibold">{label(task.serviceLevelState)}</span></div><p className="mt-3 text-xs font-semibold text-[#607891]">Due {dateLabel(task.dueDate)} · {task.priority || 'Medium'} priority</p></article>) : <p className="rounded-[10px] border border-dashed border-[#dbe6f2] p-6 text-center text-sm text-[#607891]">No open rental follow-up commitments are visible in this scope.</p>}</div></section></> : <p className="py-12 text-center text-sm text-[#607891]">No service-level data is available in this scope.</p>}</div></section>
}
