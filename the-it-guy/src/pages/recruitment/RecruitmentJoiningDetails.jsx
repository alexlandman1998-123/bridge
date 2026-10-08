import { useEffect, useState } from 'react'
import { getRecruitmentJoiningConnections, getRecruitmentJoiningOptions } from '../../services/recruitmentService'
import { joiningBusinessAreas, joiningEntryPoints, joiningPlanFor, joiningRoles } from './recruitmentJoiningModel'

const input = 'mt-2 block min-h-11 w-full rounded-xl border border-[#dbe6f1] bg-white px-3 py-2 text-sm text-[#142132]'

export default function RecruitmentJoiningDetails({ lead, draft, organisationId, onChange }) {
  const [options, setOptions] = useState(null)
  const [connections, setConnections] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const plan = joiningPlanFor(draft)
  const locked = Boolean(lead.activated_at || lead.activation_json?.inviteId)
  useEffect(() => {
    let current = true
    setOptions(null); setConnections(null); setError('')
    if (!organisationId) return () => { current = false }
    Promise.all([getRecruitmentJoiningOptions(organisationId), lead.id ? getRecruitmentJoiningConnections(organisationId, lead.id) : Promise.resolve(null)])
      .then(([choices, links]) => { if (current) { setOptions(choices); setConnections(links) } })
      .catch((error) => { if (current) setError(error.message || 'Joining choices could not be loaded. Please retry.') })
    return () => { current = false }
  }, [organisationId, lead.id, lead.version, retry])
  function update(key, value) { onChange({ ...plan, [key]: value }) }
  function select(label, key, choices) {
    return <label className="block text-sm font-semibold text-[#405b75]">{label}<select className={input} value={plan[key]} disabled={!options} onChange={(event) => update(key, event.target.value)}>
      <option value="">Decide later</option>
      {plan[key] && !choices.some((choice) => choice.id === plan[key]) && <option value={plan[key]}>Saved choice — unavailable</option>}
      {choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}
    </select></label>
  }
  return <section aria-label="Joining record" className="md:col-span-2 mt-2 border-t border-[#dbe7f2] pt-5">
    <h3 className="text-lg font-semibold text-[#20364c]">Joining record</h3>
    <p className="mt-2 text-sm text-[#60758b]">Record the intended setup. These choices do not grant access or change an existing agent’s branch or commission.</p>
    <p className="mt-2 text-xs text-[#60758b]">Started from {joiningEntryPoints[plan.origin.entryPoint] || 'Existing record'}{plan.origin.source ? ` · ${plan.origin.source}` : ''}</p>
    {error && <p role="alert" className="mt-3 text-sm text-[#9f3028]">{error} <button type="button" className="underline" onClick={() => setRetry((value) => value + 1)}>Retry joining choices</button></p>}
    <fieldset disabled={locked} className="mt-5 grid gap-5 md:grid-cols-2">
      {select('Intended branch', 'branchId', options?.branches || [])}
      <label className="block text-sm font-semibold text-[#405b75]">Intended role<select className={input} value={plan.role} onChange={(event) => update('role', event.target.value)}>{joiningRoles.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      {select('Intended commission structure', 'commissionStructureId', options?.commissionStructures || [])}
      <label className="block text-sm font-semibold text-[#405b75]">Planned joining date<input className={input} type="date" value={plan.startDate} onChange={(event) => update('startDate', event.target.value)} /></label>
      <fieldset className="md:col-span-2"><legend className="text-sm font-semibold text-[#405b75]">Intended business areas</legend><div className="mt-3 flex flex-wrap gap-4">{joiningBusinessAreas.map(([id, label]) => <label key={id} className="inline-flex items-center gap-2 text-sm text-[#405b75]"><input type="checkbox" checked={plan.businessWorkspaces.includes(id)} onChange={(event) => update('businessWorkspaces', event.target.checked ? [...plan.businessWorkspaces, id] : plan.businessWorkspaces.filter((value) => value !== id))} />{label}</label>)}</div></fieldset>
    </fieldset>
    {locked && <p className="mt-3 text-xs text-[#60758b]">Joining choices are preserved after agent access is prepared. Manage later changes through the agent’s profile.</p>}
    {connections && <div className="mt-5 text-sm text-[#60758b]"><h4 className="font-semibold text-[#20364c]">Related invitations</h4>
      {!connections.applications.length && !connections.workspace.length && <p className="mt-2">No invitations linked yet.</p>}
      <ul className="mt-2 space-y-2">{connections.applications.map((link) => <li key={link.id}>Application invitation · {link.revokedAt ? 'Revoked' : link.submittedAt ? 'Submitted' : new Date(link.expiresAt) <= new Date() ? 'Expired' : 'Available'}</li>)}
        {connections.workspace.map((link) => <li key={link.id}>Workspace invitation · {link.status === 'pending' && link.expiresAt && new Date(link.expiresAt) <= new Date() ? 'Expired' : link.status}</li>)}</ul>
    </div>}
  </section>
}
