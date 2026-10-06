import { ArrowUpRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import { resolveMobileRoleCategory } from '../../config/mobileShell.js'
import { MobileEmptyState, MobileErrorState, MobileLoadingState } from '../../components/mobile-shell/MobileShellStates.jsx'
import MobileCreateSheet, { MobileDraftCard } from '../../components/mobile-shell/MobileCreateSheet.jsx'
import { getOfflineDrafts } from '../../services/mobileProductivityService.js'
import MobileDeveloperLeadWorkspace from '../../components/mobile-shell/MobileDeveloperLeadWorkspace.jsx'
import '../../components/mobile-shell/mobile-transactions.css'

export default function MobileDeveloperLeadsPage() {
  const workspace = useWorkspace()
  const organisationContext = useOptionalOrganisation()
  const developerOrgId = organisationContext?.organisation?.id || workspace.currentWorkspace?.organisationId || workspace.currentWorkspace?.id || ''
  const developer = resolveMobileRoleCategory(workspace) === 'developer'
  const { leadId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [result, setResult] = useState(null)
  const [retry, setRetry] = useState(0)
  const [drafts, setDrafts] = useState(() => getOfflineDrafts())
  useEffect(() => {
    if (!developer || organisationContext?.loading || !developerOrgId) return undefined
    let active = true
    import('../../services/developerLeadService.js').then(({ listDeveloperLeadIntake }) => listDeveloperLeadIntake({ developerOrgId }))
      .then((leads) => { if (active) setResult({ orgId: developerOrgId, leads }) })
      .catch((error) => { if (active) setResult({ orgId: developerOrgId, error: error.message || 'Unable to load developer leads.' }) })
    return () => { active = false }
  }, [developer, developerOrgId, organisationContext?.loading, retry])
  if (!developer) return <Navigate to="/mobile/leads" replace />
  if (!developerOrgId || organisationContext?.loading || !result || result.orgId !== developerOrgId) return <MobileLoadingState label="Loading developer leads" />
  if (result.error) return <MobileErrorState body={result.error} onRetry={() => { setResult(null); setRetry((value) => value + 1) }} />
  const leads = result.leads || []
  const selected = leads.find((lead) => lead.developerLeadId === leadId)
  if (leadId && !selected) return <MobileEmptyState title="Lead not found." body="This lead is not available in your current workspace." actionLabel="All leads" onAction={() => navigate('/mobile/developer/leads')} />
  const title = (lead) => lead.buyerFullName || lead.publicReference || 'Buyer lead'
  return (
    <div className="mobile-transactions">
      {!selected && <section className="mobile-transactions-intro"><h1>Leads</h1><p>{leads.length} leads in your development pipeline</p></section>}
      {selected ? <MobileDeveloperLeadWorkspace lead={selected} /> : <section className="mobile-transactions-list" aria-label="Developer leads">
        {drafts.filter((draft) => draft.module === 'lead' && draft.payload?.developerOrgId === developerOrgId).map((draft) => <MobileDraftCard key={draft.id} draft={draft} />)}
        {leads.length ? leads.map((lead) => <button type="button" className="mobile-property-deal mobile-developer-lead" key={lead.developerLeadId} onClick={() => navigate(`/mobile/developer/leads/${encodeURIComponent(lead.developerLeadId)}`)}><span className="mobile-property-deal-body"><span className="mobile-lead-status">{lead.leadStatus?.replaceAll('_', ' ')}</span><span className="mobile-property-deal-title">{title(lead)}</span><span className="mobile-portfolio-empty">{lead.unitTypeInterest || lead.protectedSummary || lead.leadSource?.replaceAll('_', ' ')}</span>{lead.nextActionNote && <span className="mobile-property-deal-action"><span className="mobile-property-deal-label">Next action</span>{lead.nextActionNote}</span>}<span className="mobile-property-deal-footer"><span>Open lead</span><ArrowUpRight size={18} aria-hidden="true" /></span></span></button>) : <MobileEmptyState title="No leads yet." body="Buyer enquiries and introduced leads will appear here." />}
      </section>}
      <MobileCreateSheet open={params.get('create') === 'lead'} type="lead" route="/mobile/developer/leads" copyOverrides={{ body: 'Capture buyer contact details for your development pipeline.' }} draftContext={{ developerOrgId }} onClose={() => { const next = new URLSearchParams(params); next.delete('create'); setParams(next) }} onSaved={() => setDrafts(getOfflineDrafts())} />
    </div>
  )
}
