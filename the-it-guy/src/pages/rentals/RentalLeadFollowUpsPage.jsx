import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ClipboardList, Loader2, Plus } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { listRentalLeads } from '../../services/rentals/rentalLeadService'
import { completeRentalLeadFollowUp, createRentalLeadFollowUp, listRentalLeadFollowUps } from '../../services/rentals/rentalLeadFollowUpService'
import { buildRentalLeadFollowUpDraft, getRentalLeadFollowUpState, RENTAL_LEAD_FOLLOW_UP_PRIORITIES } from '../../services/rentals/rentalLeadFollowUpModel'
import { resolveRentalWorkspaceScope } from '../../services/rentals/rentalWorkspaceScope'

const INITIAL_FORM = Object.freeze({ leadId: '', title: '', description: '', dueDate: '', priority: 'Medium' })
const dateLabel = (value) => value ? new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'No due date'

export default function RentalLeadFollowUpsPage() {
  const workspace = useWorkspace()
  const scope = useMemo(() => resolveRentalWorkspaceScope(workspace), [workspace])
  const actor = useMemo(() => ({ id: scope.assignedAgentId, userId: scope.assignedAgentId, email: workspace?.profile?.email || workspace?.user?.email || '', name: workspace?.profile?.fullName || workspace?.profile?.name || '' }), [scope.assignedAgentId, workspace?.profile?.email, workspace?.profile?.fullName, workspace?.profile?.name, workspace?.user?.email])
  const [leads, setLeads] = useState([])
  const [tasks, setTasks] = useState([])
  const [form, setForm] = useState({ ...INITIAL_FORM })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [completingId, setCompletingId] = useState('')
  const [error, setError] = useState('')
  const options = useMemo(() => ({ assignedAgentId: scope.assignedAgentId, branchId: scope.branchId, scopeLevel: scope.scopeLevel, includeAllOrganisationLeads: scope.scopeLevel === 'organisation' }), [scope])

  const load = useCallback(async () => {
    if (!scope.organisationId) { setLeads([]); setTasks([]); setLoading(false); return }
    try {
      setLoading(true); setError('')
      const [loadedLeads, loadedTasks] = await Promise.all([listRentalLeads(scope.organisationId, options), listRentalLeadFollowUps(scope.organisationId, options)])
      setLeads(loadedLeads); setTasks(loadedTasks)
    } catch (loadError) { setError(loadError?.message || 'Unable to load rental follow-ups.') } finally { setLoading(false) }
  }, [options, scope.organisationId])
  useEffect(() => { void load() }, [load])

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const chooseLead = (leadId) => {
    const lead = leads.find((item) => item.id === leadId)
    update('leadId', leadId)
    if (lead) setForm((current) => ({ ...current, ...buildRentalLeadFollowUpDraft(lead), leadId }))
  }
  const submit = async (event) => {
    event.preventDefault()
    const lead = leads.find((item) => item.id === form.leadId)
    if (!lead) { setError('Choose a rental lead.'); return }
    try {
      setSaving(true); setError('')
      const task = await createRentalLeadFollowUp(lead, form, { organisationId: scope.organisationId, actor, assignedAgent: actor })
      setTasks((current) => [{ ...task, lead }, ...current])
      setForm({ ...INITIAL_FORM })
    } catch (saveError) { setError(saveError?.message || 'Unable to create follow-up.') } finally { setSaving(false) }
  }
  const complete = async (task) => {
    try {
      setCompletingId(task.taskId); setError('')
      await completeRentalLeadFollowUp(task, { organisationId: scope.organisationId, actor })
      setTasks((current) => current.map((item) => item.taskId === task.taskId ? { ...item, status: 'Completed' } : item))
    } catch (completeError) { setError(completeError?.message || 'Unable to complete follow-up.') } finally { setCompletingId('') }
  }
  const counts = tasks.reduce((result, task) => ({ ...result, [getRentalLeadFollowUpState(task)]: result[getRentalLeadFollowUpState(task)] + 1 }), { overdue: 0, open: 0, completed: 0 })

  return <section className="page-content"><div className="ui-section-stack"><header className="ui-toolbar"><div className="ui-toolbar-group"><ClipboardList size={20} /><div><p className="text-xs font-semibold uppercase text-[#607891]">Rental pipeline</p><h1 className="text-2xl font-semibold text-[#18324b]">Lead Follow-ups</h1></div></div></header>{error ? <p className="rounded-[12px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{error}</p> : null}<div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"><form onSubmit={submit} className="ui-panel ui-panel-body grid gap-4"><h2 className="text-lg font-semibold text-[#18324b]">Create follow-up</h2><label className="form-field"><span>Rental lead</span><select required value={form.leadId} onChange={(event) => chooseLead(event.target.value)}><option value="">Choose a lead</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name} · {lead.role} · {lead.nextAction}</option>)}</select></label><label className="form-field"><span>Follow-up</span><input required value={form.title} onChange={(event) => update('title', event.target.value)} /></label><label className="form-field"><span>Due date and time</span><input required type="datetime-local" value={form.dueDate} onChange={(event) => update('dueDate', event.target.value)} /></label><label className="form-field"><span>Priority</span><select value={form.priority} onChange={(event) => update('priority', event.target.value)}>{RENTAL_LEAD_FOLLOW_UP_PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></label><label className="form-field"><span>Internal note</span><textarea rows={3} value={form.description} onChange={(event) => update('description', event.target.value)} /></label><button disabled={saving} className="ui-pill-button ui-pill-button-active">{saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}Create follow-up</button></form><section className="ui-panel ui-panel-body"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-[#18324b]">Assigned work queue</h2><p className="mt-1 text-sm text-[#607891]">{counts.overdue} overdue · {counts.open} open · {counts.completed} completed</p></div></div><div className="mt-4 grid gap-3">{loading ? <p className="py-8 text-center text-sm text-[#607891]"><Loader2 className="mr-2 inline animate-spin" size={15} />Loading follow-ups…</p> : tasks.length ? tasks.map((task) => { const state = getRentalLeadFollowUpState(task); return <article key={task.taskId} className="rounded-[12px] border border-[#dbe6f2] p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[#18324b]">{task.title}</p><p className="mt-1 text-sm text-[#607891]">{task.lead?.name || 'Rental lead'} · {task.lead?.role || 'lead'}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${state === 'overdue' ? 'bg-[#fff1f1] text-[#b42318]' : state === 'completed' ? 'bg-[#effaf3] text-[#26724c]' : 'bg-[#fff9ec] text-[#8a641d]'}`}>{state}</span></div>{task.description ? <p className="mt-3 text-sm text-[#50677e]">{task.description}</p> : null}<div className="mt-3 flex items-center justify-between gap-3 text-xs text-[#607891]"><span>Due {dateLabel(task.dueDate)}</span>{state !== 'completed' ? <button type="button" disabled={completingId === task.taskId} onClick={() => void complete(task)} className="inline-flex items-center gap-1 font-semibold text-[#1f4f78] disabled:opacity-60">{completingId === task.taskId ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}Complete</button> : null}</div></article> }) : <p className="py-8 text-center text-sm text-[#607891]">No rental follow-ups are assigned in this scope.</p>}</div></section></div></div></section>
}
