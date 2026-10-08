import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from '../../components/ui/Modal'
import { emptyRecruitmentLead, recruitmentSources, stageLabel, validateRecruitmentLead } from './recruitmentModel'
import { emptyJoiningPlan } from './recruitmentJoiningModel'
import RecruitmentJoiningDetails from './RecruitmentJoiningDetails'
import RecruitmentIntakeLinks from './RecruitmentIntakeLinks'

const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[#dbe4ee] bg-white px-4 text-sm font-semibold text-[#405b75] disabled:opacity-50'
const primary = `${button} !border-[#0f2743] !bg-[#0f2743] !text-white`
const input = 'mt-2 block min-h-11 w-full rounded-[12px] border border-[#dbe6f1] bg-white px-3 py-2 text-sm text-[#142132]'

function Field({ label, value, onChange, type = 'text', multiline = false, required = false, readOnly = false }) {
  return <label className="block text-sm font-semibold text-[#405b75]">{label}{multiline ? <textarea className={input} rows={4} value={value || ''} onChange={(event) => onChange(event.target.value)} /> : <input className={input} type={type} required={required} readOnly={readOnly} maxLength={label === 'Name' ? 120 : 254} value={value || ''} onChange={(event) => onChange(event.target.value)} />}</label>
}

export default function RecruitmentJoiningDialog({ onCreate, onClose, busy: externalBusy = false, organisationId, context = { entryPoint: 'recruitment' }, receipt = false, limitedBranch = false }) {
  const [draft, setDraft] = useState(() => ({ ...emptyRecruitmentLead(), name: context.contact?.name || '', email: context.contact?.email || '', phone: context.contact?.phone || '', joining_json: { ...emptyJoiningPlan(context.entryPoint), branchId: context.branchId || '', role: context.joiningRole || 'agent', businessWorkspaces: context.businessWorkspaces || [], commissionStructureId: context.commissionStructureId || '' } }))
  const [saved, setSaved] = useState(null)
  const [saving, setSaving] = useState(false)
  const busy = externalBusy || saving
  const [error, setError] = useState('')
  const [matchReview, setMatchReview] = useState(null)
  const [reviewedMatches, setReviewedMatches] = useState(false)
  const [existingInviteId, setExistingInviteId] = useState('')
  const submitting = useRef(false)
  const change = (key, value) => {
    setDraft((previous) => ({ ...previous, [key]: value }))
    setMatchReview(null); setReviewedMatches(false); setExistingInviteId('')
  }
  const detail = (key, value) => setDraft((previous) => ({ ...previous, details_json: { ...previous.details_json, [key]: value } }))
  async function submit(event) {
    event.preventDefault()
    if (busy || submitting.current) return
    const validation = validateRecruitmentLead(draft)
    if (validation) { setError(validation); return }
    submitting.current = true
    setError(''); setSaving(true)
    try { const result = await onCreate({ ...draft, joining_json: { ...draft.joining_json, reviewedMatches }, joining_invite_id: existingInviteId || null }); if ((receipt || limitedBranch) && result?.id) setSaved(result) }
    catch (error) {
      setError(error.message || 'The agent lead could not be saved. Please try again.')
      if (error.matches) { setMatchReview(error); setReviewedMatches(false); setExistingInviteId('') }
    }
    finally { submitting.current = false; setSaving(false) }
  }
  return <Modal open title={receipt ? 'Invite new agent' : 'Add Agent Lead'} subtitle={receipt ? 'Save the joining record, then prepare an application link.' : 'Capture the enquiry to start the recruitment journey.'} className="max-w-2xl" onClose={() => { if (!busy && !submitting.current) onClose() }}>
    {saved ? <div className="space-y-5">
      <p role="status" className="rounded-xl bg-[#effaf3] p-4 text-sm text-[#26724c]">Joining record saved for {saved.name}. Workspace access follows recruitment approval and onboarding. {limitedBranch && 'Your principal will arrange the application invitation and review.'}</p>
      {!limitedBranch && <Link className={primary} to={`/agency/recruitment/${encodeURIComponent(saved.id)}`} state={{ returnTo: context.returnTo }}>Open recruitment record</Link>}
      {!limitedBranch && <RecruitmentIntakeLinks organisationId={organisationId} leadId={saved.id} eligible={saved.status === 'lead_received'} title="Application invitation" />}
      <button type="button" className={button} onClick={onClose}>Done</button>
    </div> : <form onSubmit={submit}>
      {error && <p role="alert" className="mb-5 rounded-xl bg-[#fff5f4] p-3 text-sm text-[#9f3028]">{error}</p>}
      {matchReview && <div className="mb-5 space-y-3 text-sm text-[#405b75]">
        <ul className="space-y-2">{matchReview.matches.leads.map((match) => <li key={match.id}><Link className="underline" to={`/agency/recruitment/${encodeURIComponent(match.id)}`} state={{ returnTo: context.returnTo }}>Open recruitment record: {match.name}</Link> · {stageLabel(match.status)}</li>)}
          {matchReview.matches.members.map((match) => <li key={match.id}><Link className="underline" to={match.role === 'commercial_broker' ? `/commercial/brokers/${encodeURIComponent(match.userId || match.id)}` : ['agent','senior_agent','sales_agent','commercial_broker'].includes(match.role) ? `/agency/agents/${encodeURIComponent(match.userId || match.id)}` : '/settings/users'}>Open existing agency member</Link></li>)}
          {matchReview.matches.invites.map((match) => <li key={match.id}>Pending {match.role} invitation · <Link className="underline" to="/settings/users">Manage existing invitations</Link></li>)}</ul>
        {matchReview.outcome === 'review_required' && <>
          <label className="flex items-start gap-2"><input type="checkbox" checked={reviewedMatches} onChange={(event) => setReviewedMatches(event.target.checked)} />I reviewed the matches and want to create a separate enquiry. Existing records will be preserved.</label>
          <label className="block font-semibold">Link an existing agent invitation<select className={input} value={existingInviteId} onChange={(event) => setExistingInviteId(event.target.value)}><option value="">Do not link an invitation</option>{matchReview.matches.invites.filter((match) => !match.linkedLeadId && ['agent','senior_agent','sales_agent','commercial_broker'].includes(match.role)).map((match) => <option key={match.id} value={match.id}>{match.role} · {match.type === 'branch_invite' ? 'Branch invitation' : 'Agency invitation'}</option>)}</select></label>
        </>}
      </div>}
      <fieldset disabled={busy} className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" required value={draft.name} onChange={(value) => change('name', value)} />
        <Field label="Email" type="email" value={draft.email} onChange={(value) => change('email', value)} />
        <Field label="Phone" type="tel" value={draft.phone} onChange={(value) => change('phone', value)} />
        {!limitedBranch && <><Field label="Preferred area" value={draft.area} onChange={(value) => change('area', value)} />
        <label className="text-sm font-semibold text-[#405b75]">Source<select className={input} value={draft.source} onChange={(event) => change('source', event.target.value)}>{recruitmentSources.map((source) => <option key={source}>{source}</option>)}</select></label>
        {draft.source === 'Referral' && <Field label="Referred by" value={draft.details_json.referredBy} onChange={(value) => detail('referredBy', value)} />}
        <div className="sm:col-span-2"><Field multiline label="Recruitment notes" value={draft.details_json.notes} onChange={(value) => detail('notes', value)} /></div>
        <RecruitmentJoiningDetails lead={draft} draft={draft} organisationId={organisationId} onChange={(value) => change('joining_json', value)} /></>}
      </fieldset>
      {limitedBranch && <p className="mt-4 text-sm text-[#60758b]">This enquiry is assigned to your branch. Application evidence, joining choices and approval are managed by your principal.</p>}
      <p className="mt-4 text-xs text-[#7890a8]">Provide an email address or phone number. New leads start at Lead Received.</p>
      <div className="mt-6 flex justify-end gap-3"><button type="button" className={button} disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className={primary} disabled={busy || matchReview?.outcome === 'existing_member' || (matchReview?.outcome === 'review_required' && !reviewedMatches)}>{busy ? 'Saving…' : 'Create Agent Lead'}</button></div>
    </form>}
  </Modal>
}
