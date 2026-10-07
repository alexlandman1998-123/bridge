import { ArrowUpRight, Building2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import { resolveMobileRoleCategory } from '../../config/mobileShell.js'
import { MobileEmptyState, MobileErrorState, MobileLoadingState } from '../../components/mobile-shell/MobileShellStates.jsx'
import MobileCreateSheet, { MobileDraftCard } from '../../components/mobile-shell/MobileCreateSheet.jsx'
import { getOfflineDrafts } from '../../services/mobileProductivityService.js'
import MobileDeveloperLeadWorkspace from '../../components/mobile-shell/MobileDeveloperLeadWorkspace.jsx'
import LeadSourceLogo from '../../components/mobile-shell/LeadSourceLogo.jsx'
import { getMobileBrandStyle } from '../../components/mobile-shell/mobileBrandStyle.js'
import { JOURNEY_ENTITY_TYPES } from '../../core/journey/journeyStagePolicy.js'
import { getDeveloperLeadPrimaryAction } from '../../core/developerLeads/developerLeadWorkspaceModel.js'
import { maskDeveloperLeadForDeveloper } from '../../core/developerLeads/developerLeadContract.js'
import '../../components/mobile-shell/mobile-transactions.css'
import './mobile-developer-leads.css'

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
  const [journeyResult, setJourneyResult] = useState(null)
  const [journeyRetry, setJourneyRetry] = useState(0)
  const [developmentResult, setDevelopmentResult] = useState(null)
  const [actionResult, setActionResult] = useState(null)
  const [drafts, setDrafts] = useState(() => getOfflineDrafts())
  const selected = result?.orgId === developerOrgId ? result.leads?.find((lead) => lead.developerLeadId === leadId) : null
  const selectedId = selected?.developerLeadId || ''
  const developmentId = selected?.primaryDevelopmentId || ''
  const actionScope = `${developerOrgId}:${selectedId}`
  const scopeRef = useRef(actionScope)
  const activeActionRef = useRef(null)
  const journeyKey = `${developerOrgId}:${selectedId}:${journeyRetry}`
  const brandStyle = getMobileBrandStyle(organisationContext, workspace)
  useEffect(() => {
    scopeRef.current = actionScope
    return () => { scopeRef.current = '' }
  }, [actionScope])
  useEffect(() => {
    if (!developer || organisationContext?.loading || !developerOrgId) return undefined
    let active = true
    import('../../services/developerLeadService.js').then(({ listDeveloperLeadIntake }) => listDeveloperLeadIntake({ developerOrgId }))
      .then((leads) => { if (active) setResult({ orgId: developerOrgId, leads }) })
      .catch((error) => { if (active) setResult({ orgId: developerOrgId, error: error.message || 'Unable to load developer leads.' }) })
    return () => { active = false }
  }, [developer, developerOrgId, organisationContext?.loading, retry])
  useEffect(() => {
    if (!developer || !developerOrgId || !selectedId || organisationContext?.loading) return undefined
    let active = true
    import('../../services/journeyStageOverrideService.js').then(({ fetchJourneyStageOverrides }) => fetchJourneyStageOverrides({ organisationId: developerOrgId, entityType: JOURNEY_ENTITY_TYPES.developerLead, entityId: selectedId }))
      .then((overrides) => { if (active) setJourneyResult({ key: journeyKey, overrides }) })
      .catch(() => { if (active) setJourneyResult({ key: journeyKey, error: 'Journey unavailable' }) })
    return () => { active = false }
  }, [developer, developerOrgId, selectedId, organisationContext?.loading, journeyKey])
  useEffect(() => {
    if (!developer || !developerOrgId || !developmentId || organisationContext?.loading || developmentResult?.orgId === developerOrgId) return undefined
    let active = true
    import('../../lib/api.js').then(({ fetchDevelopmentOptions }) => fetchDevelopmentOptions({ organisationId: developerOrgId }))
      .then((items) => { if (active) setDevelopmentResult({ orgId: developerOrgId, items }) })
      .catch(() => { if (active) setDevelopmentResult({ orgId: developerOrgId, items: [] }) })
    return () => { active = false }
  }, [developer, developerOrgId, developmentId, organisationContext?.loading, developmentResult?.orgId])

  async function handleLeadAction(action) {
    if (!developer || !developerOrgId || !selectedId || activeActionRef.current?.scope === actionScope || (actionResult?.scope === actionScope && actionResult.refreshRequired)) return false
    const authorizedLead = maskDeveloperLeadForDeveloper(selected)
    const primaryAction = getDeveloperLeadPrimaryAction(authorizedLead)
    if (action.key === 'copy_onboarding' ? authorizedLead.accessProfile.requiresHandoverBeforePrivateDetails
      : action.key === 'save_unit' ? primaryAction.key !== 'select_unit' || !action.preferredUnitId
        : action.key !== primaryAction.key || primaryAction.disabled) return false
    const token = { scope: actionScope }
    activeActionRef.current = token
    setActionResult({ scope: actionScope, pending: action.key })
    let mutationCompleted = false
    try {
      let message = ''
      let onboardingUrl = ''
      if (action.key === 'update_status' || action.key === 'save_unit') {
        const { updateDeveloperLeadWorkspaceSetup } = await import('../../services/developerLeadService.js')
        await updateDeveloperLeadWorkspaceSetup({ developerOrgId, developerLeadId: selectedId,
          ...(action.key === 'save_unit' ? { preferredUnitId: action.preferredUnitId } : { leadStatus: primaryAction.status, previousLeadStatus: authorizedLead.leadStatus, activityNote: primaryAction.detail }),
        })
        message = action.key === 'save_unit' ? 'Preferred unit saved.' : 'Lead status updated.'
      } else if (action.key === 'request_handover') {
        const { requestAgencyLeadHandover } = await import('../../services/developerLeadService.js')
        await requestAgencyLeadHandover({ developerOrgId, developerLeadId: selectedId })
        message = 'Agency handover requested.'
      } else if (action.key === 'send_onboarding' || action.key === 'copy_onboarding') {
        const { convertDeveloperLeadToTransactionAndSendOnboarding } = await import('../../services/developerLeadConversionService.js')
        const copyOnly = action.key === 'copy_onboarding'
        const response = await convertDeveloperLeadToTransactionAndSendOnboarding({ developerOrgId, lead: authorizedLead, sendBuyerOnboarding: !copyOnly, ...(copyOnly ? { manualBuyerOnboardingDelivery: true } : {}) })
        onboardingUrl = response.onboardingUrl || ''
        let copied = false
        if (copyOnly && onboardingUrl && navigator.clipboard?.writeText) {
          try { await navigator.clipboard.writeText(onboardingUrl); copied = true } catch { /* The link remains available below. */ }
        }
        message = copyOnly ? copied ? 'Buyer onboarding link copied.' : onboardingUrl ? 'Buyer onboarding link is ready below.' : 'Buyer onboarding context is ready, but no link was returned.'
          : response.onboardingEmail?.sent ? 'Buyer onboarding email sent.' : 'Buyer onboarding link is ready, but email delivery needs attention.'
        window.dispatchEvent(new CustomEvent('itg:transaction-created', { detail: response }))
      } else return false
      mutationCompleted = true
      window.dispatchEvent(new Event('itg:developer-leads-changed'))
      const { listDeveloperLeadIntake } = await import('../../services/developerLeadService.js')
      const leads = await listDeveloperLeadIntake({ developerOrgId })
      if (!scopeRef.current.startsWith(`${developerOrgId}:`)) return false
      setResult({ orgId: developerOrgId, leads })
      if (scopeRef.current !== actionScope) return false
      setJourneyRetry((value) => value + 1)
      setActionResult({ scope: actionScope, message, onboardingUrl })
      return true
    } catch (error) {
      if (scopeRef.current === actionScope) setActionResult({ scope: actionScope, refreshRequired: mutationCompleted, error: mutationCompleted ? 'The change was saved, but the updated lead could not be loaded. Refresh this page before trying again.' : error.message || 'The lead action could not be completed.' })
      return false
    } finally {
      if (activeActionRef.current === token) activeActionRef.current = null
    }
  }
  if (!developer) return <Navigate to="/mobile/leads" replace />
  if (!developerOrgId || organisationContext?.loading || !result || result.orgId !== developerOrgId) return <MobileLoadingState label="Loading developer leads" />
  if (result.error) return <MobileErrorState body={result.error} onRetry={() => { setResult(null); setRetry((value) => value + 1) }} />
  const leads = result.leads || []
  if (leadId && !selected) return <MobileEmptyState title="Lead not found." body="This lead is not available in your current workspace." actionLabel="All leads" onAction={() => navigate('/mobile/developer/leads')} />
  const title = (lead) => lead.buyerFullName || lead.publicReference || 'Buyer lead'
  return (
    <div className="mobile-transactions mobile-developer-leads" style={brandStyle}>
      {!selected && <section className="mobile-transactions-intro"><h1>Leads</h1><p>{leads.length} leads in your development pipeline</p></section>}
      {selected ? <MobileDeveloperLeadWorkspace key={`${developerOrgId}:${selectedId}`} lead={selected} brandStyle={brandStyle}
        development={developmentResult?.orgId === developerOrgId ? developmentResult.items.find((item) => item.id === developmentId) : null}
        actionState={actionResult?.scope === actionScope ? actionResult : {}} onAction={handleLeadAction}
        journeyOverrides={journeyResult?.key === journeyKey ? journeyResult.overrides : []} journeyLoading={journeyResult?.key !== journeyKey} journeyError={journeyResult?.key === journeyKey ? journeyResult.error : ''} onRetryJourney={() => setJourneyRetry((value) => value + 1)} /> : <section className="mobile-transactions-list" aria-label="Developer leads">
        {drafts.filter((draft) => draft.module === 'lead' && draft.payload?.developerOrgId === developerOrgId).map((draft) => <MobileDraftCard key={draft.id} draft={draft} />)}
        {leads.length ? leads.map((lead) => <button type="button" className="mobile-property-deal mobile-developer-lead" key={lead.developerLeadId} onClick={() => navigate(`/mobile/developer/leads/${encodeURIComponent(lead.developerLeadId)}`)}>
          <span className="mobile-property-deal-body">
            <span className="mobile-developer-lead-top">
              <span className="mobile-lead-status" data-status={lead.leadStatus}>{lead.leadStatus?.replaceAll('_', ' ') || 'Status not recorded'}</span>
              <LeadSourceLogo source={lead.leadSource} className="mobile-developer-lead-source" />
            </span>
            <span className="mobile-property-deal-title">{title(lead)}</span>
            {(lead.unitTypeInterest || lead.protectedSummary) && <span className="mobile-developer-lead-interest"><Building2 size={15} aria-hidden="true" /><span>{lead.unitTypeInterest || lead.protectedSummary}</span></span>}
            {lead.nextActionNote && <span className="mobile-property-deal-action"><span className="mobile-property-deal-label">Next action</span>{lead.nextActionNote}</span>}
            <span className="mobile-property-deal-footer"><span>Open lead</span><span className="mobile-developer-lead-open"><ArrowUpRight size={17} aria-hidden="true" /></span></span>
          </span>
        </button>) : <MobileEmptyState title="No leads yet." body="Buyer enquiries and introduced leads will appear here." />}
      </section>}
      <MobileCreateSheet open={params.get('create') === 'lead'} type="lead" route="/mobile/developer/leads" copyOverrides={{ body: 'Capture buyer contact details for your development pipeline.' }} draftContext={{ developerOrgId }} onClose={() => { const next = new URLSearchParams(params); next.delete('create'); setParams(next) }} onSaved={() => setDrafts(getOfflineDrafts())} />
    </div>
  )
}
