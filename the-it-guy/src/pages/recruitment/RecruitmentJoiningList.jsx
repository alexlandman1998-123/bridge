import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listJoiningRecruitmentLeads } from '../../services/recruitmentService'
import { isClosedRecruitmentLead, stageLabel } from './recruitmentModel'
import { recruitmentNextAction, recruitmentReturnTo } from './recruitmentEntryModel'

const invitationLabels={access_accepted:'Access accepted — verify activation',access_expired:'Access invitation expired',access_revoked:'Access invitation revoked',email_failed:'Invitation email failed',email_uncertain:'Email result uncertain',email_provider_accepted:'Email accepted by provider',access_prepared:'Access link prepared',application_prepared:'Application link prepared',application_submitted:'Application submitted',application_expired:'Application link expired',application_revoked:'Application link revoked',not_prepared:'No invitation prepared'}

export default function RecruitmentJoiningList({ organisationId, branchId = '', search = '', refresh = 0, returnTo, limitedBranch = false, commercialOnly = false }) {
  const [loaded, setLoaded] = useState({ scope: '', rows: [], error: '' }), [retry, setRetry] = useState(0)
  const scope = JSON.stringify([organisationId, branchId, refresh, retry, limitedBranch, commercialOnly])
  const validOrganisation = Boolean(organisationId && organisationId !== 'all')
  const loading = validOrganisation && loaded.scope !== scope
  const rows = loaded.scope === scope ? loaded.rows : []
  const error = loaded.scope === scope ? loaded.error : ''
  useEffect(() => {
    let active = true
    if (!organisationId || organisationId === 'all') return () => { active = false }
    listJoiningRecruitmentLeads(organisationId, branchId, ...((limitedBranch || commercialOnly) ? [{limitedBranch,commercialOnly}] : []))
      .then((result) => { if (active) setLoaded({ scope, rows: result.filter((lead) => !isClosedRecruitmentLead(lead) && (!branchId || lead.joining_branch_id === branchId)), error: '' }) })
      .catch((failure) => { if (active) setLoaded({ scope, rows: [], error: failure.message || 'Joining records could not be loaded.' }) })
    return () => { active = false }
  }, [organisationId, branchId, scope, limitedBranch, commercialOnly])
  const query = search.trim().toLowerCase()
  const visible = rows.filter((lead) => [lead.name, lead.email, lead.phone].some((value) => String(value || '').toLowerCase().includes(query)))
  return <section aria-label="Joining" className="rounded-2xl border border-[#dbe7f2] bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-[#20364c]">Joining</h2><p className="mt-1 text-sm text-[#60758b]">Applicants progressing through Recruitment. They are separate from active agents.</p></div><button type="button" className="text-sm font-semibold text-[#315b7a]" disabled={loading} onClick={() => setRetry((value) => value + 1)}>Refresh joining</button></div>
    {loading ? <p role="status" className="mt-4 text-sm text-[#60758b]">Loading joining records…</p> : error ? <p role="alert" className="mt-4 text-sm text-[#9f3028]">{error}</p> : !organisationId || organisationId === 'all' ? <p className="mt-4 text-sm text-[#60758b]">Choose an agency to see joining progress.</p> : <>
      <p className="mt-4 text-xs text-[#60758b]">{visible.length} joining{query ? ' matching this search' : ''}</p>
      {!visible.length ? <p className="mt-3 text-sm text-[#60758b]">No joining records{query ? ' match this search' : branchId ? ' for this branch' : ''}.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="text-xs text-[#7890a8]"><tr><th className="py-3 pr-4">Applicant</th><th className="py-3 pr-4">Recruitment stage</th><th className="py-3 pr-4">Next action</th><th className="py-3">Record</th></tr></thead><tbody>{visible.map((lead) => <tr key={lead.id} className="border-t border-[#edf2f7]"><td className="py-4 pr-4"><p className="font-semibold text-[#20364c]">{lead.name}</p><p className="mt-1 text-xs text-[#60758b]">{limitedBranch ? 'Branch enquiry' : lead.email || lead.phone || 'Contact pending'}</p></td><td className="py-4 pr-4 text-[#405b75]">{stageLabel(lead.status)}{lead.invitation_state && <p className="mt-1 text-xs text-[#60758b]">{invitationLabels[lead.invitation_state] || 'Check invitation status'}</p>}</td><td className="py-4 pr-4 text-[#405b75]">{limitedBranch && lead.activation_state !== 'awaiting_acceptance' ? 'Principal to continue' : recruitmentNextAction(lead)}</td><td className="py-4">{limitedBranch ? <span className="text-[#60758b]">Principal review</span> : <Link className="font-semibold text-[#315b7a]" aria-label={`Open recruitment record for ${lead.name}`} to={`/agency/recruitment/${encodeURIComponent(lead.id)}`} state={{returnTo:recruitmentReturnTo(returnTo)}}>Open record</Link>}</td></tr>)}</tbody></table></div>}
    </>}
  </section>
}
