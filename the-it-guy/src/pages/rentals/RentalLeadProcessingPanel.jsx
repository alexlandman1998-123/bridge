import { useEffect, useState } from 'react'
import { listOrganisationUsersForWorkspace } from '../../lib/settingsApi'
import { listRentalLeadCommunications, logRentalLeadCommunication } from '../../services/rentals/rentalLeadCommunicationService'
import { createRentalLeadFollowUp, completeRentalLeadFollowUp } from '../../services/rentals/rentalLeadFollowUpService'
import { getRentalLeadFollowUpState } from '../../services/rentals/rentalLeadFollowUpModel'
import { RENTAL_LEAD_LOST_REASONS } from '../../services/rentals/rentalLeadOutcomeModel'
import { recordRentalLeadOutcome } from '../../services/rentals/rentalLeadOutcomeService'
import { assignRentalLead, updateRentalLeadQualification } from '../../services/rentals/rentalLeadService'

const text = (value) => String(value ?? '').trim()
const label = (value) => text(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const dateLabel = (value) => value ? new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'

function initialQualification(lead) {
  return lead.role === 'landlord'
    ? { propertyAddress: lead.propertyAddress || '', propertyType: lead.propertyType || '', expectedMonthlyRent: lead.expectedMonthlyRent ?? '' }
    : { desiredArea: lead.desiredArea || '', monthlyBudget: lead.monthlyBudget ?? '', bedrooms: lead.bedrooms ?? '', occupationDate: lead.occupationDate || '', pets: lead.pets || 'Not captured' }
}

export default function RentalLeadProcessingPanel({ lead, tasks, organisationId, options, actor, onReload }) {
  const [qualification, setQualification] = useState(() => initialQualification(lead))
  const [assigneeId, setAssigneeId] = useState(lead.assignedAgentId || '')
  const [users, setUsers] = useState([])
  const [communications, setCommunications] = useState([])
  const [communication, setCommunication] = useState({ communicationType: 'call', direction: 'outbound', summary: '', outcome: '' })
  const [followUp, setFollowUp] = useState({ title: lead.nextAction || 'Follow up', dueDate: '', description: '' })
  const [outcome, setOutcome] = useState({ status: 'lost', reason: '', note: '', reactivationDate: '' })
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const canAssign = ['organisation', 'branch'].includes(options.scopeLevel)

  useEffect(() => {
    setQualification(initialQualification(lead))
    setAssigneeId(lead.assignedAgentId || '')
  }, [lead])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const [members, history] = await Promise.all([
        canAssign ? listOrganisationUsersForWorkspace({ organisationId }) : Promise.resolve([]),
        listRentalLeadCommunications(organisationId, lead.id, { ...options, includeClosed: true }),
      ])
      if (!cancelled) { setUsers(members); setCommunications(history) }
    }
    void load().catch(() => { if (!cancelled) setError('Could not load the team or communication history.') })
    return () => { cancelled = true }
  }, [canAssign, lead.id, organisationId, options])

  const availableUsers = users.filter((user) => text(user.userId) && ['active', 'accepted'].includes(text(user.status).toLowerCase())
    && (options.scopeLevel !== 'branch' || text(user.branchId) === text(options.branchId)))

  async function run(key, action, success) {
    try {
      setSaving(key); setError(''); setNotice('')
      await action()
      setNotice(success)
      await onReload()
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save this rental lead change.')
    } finally {
      setSaving('')
    }
  }

  const context = { organisationId, actor, scope: { ...options, includeClosed: true } }
  const updateQualification = (key, value) => setQualification((current) => ({ ...current, [key]: value }))

  return <div className="grid gap-6 xl:grid-cols-2">
    {error ? <p className="rounded-[12px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131] xl:col-span-2" role="alert">{error}</p> : null}
    {notice ? <p className="rounded-[12px] border border-[#cfe8dc] bg-[#effaf3] px-4 py-3 text-sm font-semibold text-[#26724c] xl:col-span-2">{notice}</p> : null}

    <section className="ui-panel ui-panel-body">
      <h2 className="text-lg font-semibold text-[#18324b]">{lead.role === 'landlord' ? 'Property qualification' : 'Tenant qualification'}</h2>
      <p className="mt-1 text-sm text-[#607891]">Keep the lead brief current before moving through the journey.</p>
      <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); void run('qualification', () => updateRentalLeadQualification(lead.id, qualification, context), 'Qualification saved.') }}>
        {lead.role === 'landlord' ? <>
          <label className="form-field"><span>Property address</span><input required value={qualification.propertyAddress} onChange={(event) => updateQualification('propertyAddress', event.target.value)} /></label>
          <label className="form-field"><span>Property type</span><input value={qualification.propertyType} onChange={(event) => updateQualification('propertyType', event.target.value)} /></label>
          <label className="form-field"><span>Expected monthly rent</span><input type="number" min="0" value={qualification.expectedMonthlyRent} onChange={(event) => updateQualification('expectedMonthlyRent', event.target.value)} /></label>
        </> : <>
          <label className="form-field"><span>Desired area</span><input required value={qualification.desiredArea} onChange={(event) => updateQualification('desiredArea', event.target.value)} /></label>
          <label className="form-field"><span>Monthly budget</span><input type="number" min="0" value={qualification.monthlyBudget} onChange={(event) => updateQualification('monthlyBudget', event.target.value)} /></label>
          <label className="form-field"><span>Bedrooms</span><input type="number" min="0" step="1" value={qualification.bedrooms} onChange={(event) => updateQualification('bedrooms', event.target.value)} /></label>
          <label className="form-field"><span>Occupation date</span><input type="date" value={qualification.occupationDate} onChange={(event) => updateQualification('occupationDate', event.target.value)} /></label>
          <label className="form-field"><span>Pets</span><select value={qualification.pets} onChange={(event) => updateQualification('pets', event.target.value)}><option>Not captured</option><option>No pets</option><option>Pets subject to approval</option><option>Pet friendly required</option></select></label>
        </>}
        <button className="ui-pill-button ui-pill-button-active justify-self-start" disabled={Boolean(saving)} type="submit">{saving === 'qualification' ? 'Saving…' : 'Save qualification'}</button>
      </form>
    </section>

    <section className="ui-panel ui-panel-body">
      <h2 className="text-lg font-semibold text-[#18324b]">Ownership and outcome</h2>
      <p className="mt-1 text-sm text-[#607891]">Current owner: {lead.assignedAgentName}. Outcome: {label(lead.outcome?.status || 'open')}.</p>
      {canAssign ? <form className="mt-4 grid gap-3 border-b border-[#edf2f7] pb-5" onSubmit={(event) => { event.preventDefault(); void run('assignment', () => assignRentalLead(lead.id, assigneeId, context), 'Owner assigned.') }}>
        <label className="form-field"><span>Assign to</span><select required value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Choose team member</option>{availableUsers.map((user) => <option key={user.userId} value={user.userId}>{user.fullName || user.email}</option>)}</select></label>
        <button className="ui-pill-button justify-self-start" disabled={Boolean(saving) || !assigneeId || assigneeId === lead.assignedAgentId} type="submit">{saving === 'assignment' ? 'Assigning…' : 'Assign owner'}</button>
      </form> : null}
      <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); void run('outcome', () => recordRentalLeadOutcome(lead, outcome, context), 'Outcome saved.') }}>
        <label className="form-field"><span>Record outcome</span><select value={outcome.status} onChange={(event) => setOutcome((current) => ({ ...current, status: event.target.value, reason: '' }))}><option value="lost">Lost</option><option value="withdrawn">Withdrawn</option><option value="nurture">Nurture</option><option value="won">Won</option><option value="open">Reopen</option></select></label>
        {outcome.status === 'lost' ? <label className="form-field"><span>Reason</span><select required value={outcome.reason} onChange={(event) => setOutcome((current) => ({ ...current, reason: event.target.value }))}><option value="">Choose reason</option>{RENTAL_LEAD_LOST_REASONS.map((reason) => <option key={reason} value={reason}>{label(reason)}</option>)}</select></label> : null}
        {outcome.status === 'withdrawn' ? <label className="form-field"><span>Withdrawal reason</span><input required value={outcome.reason} onChange={(event) => setOutcome((current) => ({ ...current, reason: event.target.value }))} /></label> : null}
        {outcome.status === 'nurture' ? <label className="form-field"><span>Reactivate on</span><input required type="date" value={outcome.reactivationDate} onChange={(event) => setOutcome((current) => ({ ...current, reactivationDate: event.target.value }))} /></label> : null}
        <label className="form-field"><span>Internal note</span><textarea rows={2} value={outcome.note} onChange={(event) => setOutcome((current) => ({ ...current, note: event.target.value }))} /></label>
        <button className="ui-pill-button justify-self-start" disabled={Boolean(saving)} type="submit">{saving === 'outcome' ? 'Saving…' : 'Save outcome'}</button>
      </form>
    </section>

    <section className="ui-panel ui-panel-body">
      <h2 className="text-lg font-semibold text-[#18324b]">Contact history</h2>
      <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); void run('communication', async () => { const saved = await logRentalLeadCommunication(lead, communication, context); setCommunication({ communicationType: 'call', direction: 'outbound', summary: '', outcome: '' }); setCommunications((current) => [saved, ...current]) }, 'Contact recorded.') }}>
        <div className="grid gap-3 sm:grid-cols-2"><label className="form-field"><span>Type</span><select value={communication.communicationType} onChange={(event) => setCommunication((current) => ({ ...current, communicationType: event.target.value }))}><option value="call">Call</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="note">Note</option></select></label><label className="form-field"><span>Direction</span><select value={communication.direction} onChange={(event) => setCommunication((current) => ({ ...current, direction: event.target.value }))}><option value="outbound">Outbound</option><option value="inbound">Inbound</option><option value="internal">Internal</option></select></label></div>
        <label className="form-field"><span>Summary</span><textarea required rows={3} value={communication.summary} onChange={(event) => setCommunication((current) => ({ ...current, summary: event.target.value }))} /></label>
        <label className="form-field"><span>Result</span><input value={communication.outcome} onChange={(event) => setCommunication((current) => ({ ...current, outcome: event.target.value }))} placeholder="Reached, voicemail, replied…" /></label>
        <button className="ui-pill-button ui-pill-button-active justify-self-start" disabled={Boolean(saving)} type="submit">{saving === 'communication' ? 'Recording…' : 'Log contact'}</button>
      </form>
      <div className="mt-5 grid gap-3 border-t border-[#edf2f7] pt-4">{communications.slice(0, 8).map((item) => <article key={item.communicationId} className="rounded-[10px] border border-[#dbe6f2] p-3"><div className="flex justify-between gap-2"><strong className="text-sm text-[#20364c]">{label(item.communicationType)} · {label(item.direction)}</strong><span className="text-xs text-[#7890a8]">{dateLabel(item.occurredAt)}</span></div><p className="mt-1 text-sm text-[#607891]">{item.summary || item.message}</p></article>)}{!communications.length ? <p className="text-sm text-[#607891]">No contact has been logged yet.</p> : null}</div>
    </section>

    <section className="ui-panel ui-panel-body">
      <h2 className="text-lg font-semibold text-[#18324b]">Follow-ups</h2>
      <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); void run('followup', () => createRentalLeadFollowUp(lead, followUp, context), 'Follow-up created.') }}>
        <label className="form-field"><span>Next action</span><input required value={followUp.title} onChange={(event) => setFollowUp((current) => ({ ...current, title: event.target.value }))} /></label>
        <label className="form-field"><span>Due</span><input required type="datetime-local" value={followUp.dueDate} onChange={(event) => setFollowUp((current) => ({ ...current, dueDate: event.target.value }))} /></label>
        <label className="form-field"><span>Details</span><textarea rows={2} value={followUp.description} onChange={(event) => setFollowUp((current) => ({ ...current, description: event.target.value }))} /></label>
        <button className="ui-pill-button ui-pill-button-active justify-self-start" disabled={Boolean(saving)} type="submit">{saving === 'followup' ? 'Creating…' : 'Create follow-up'}</button>
      </form>
      <div className="mt-5 grid gap-3 border-t border-[#edf2f7] pt-4">{tasks.map((task) => <article key={task.taskId} className="rounded-[10px] border border-[#dbe6f2] p-3"><div className="flex justify-between gap-2"><strong className="text-sm text-[#20364c]">{task.title}</strong><span className="text-xs text-[#7890a8]">{label(getRentalLeadFollowUpState(task))}</span></div><p className="mt-1 text-xs text-[#607891]">Due {dateLabel(task.dueDate)}</p>{getRentalLeadFollowUpState(task) !== 'completed' ? <button type="button" className="mt-2 text-xs font-semibold text-[#1f4f78]" disabled={Boolean(saving)} onClick={() => void run('followup', () => completeRentalLeadFollowUp(task, context), 'Follow-up completed.')}>Mark complete</button> : null}</article>)}{!tasks.length ? <p className="text-sm text-[#607891]">No follow-ups are linked yet.</p> : null}</div>
    </section>
  </div>
}
