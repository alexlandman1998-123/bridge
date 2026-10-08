import { ArrowLeft, Building2, ChevronRight, MapPin, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import { resolveMobileRoleCategory } from '../../config/mobileShell.js'
import DeveloperOverviewJourney from '../../components/transaction/DeveloperOverviewJourney.jsx'
import SharedLegalJourney from '../../components/transaction/SharedLegalJourney.jsx'
import { MobileEmptyState, MobileErrorState, MobileLoadingState } from '../../components/mobile-shell/MobileShellStates.jsx'
import { getMobileDeveloperTransactionJourneyAsync } from '../../services/mobileDashboardService.js'
import useTransactionLiveRefresh from '../../hooks/useTransactionLiveRefresh.js'
import '../../components/mobile-shell/mobile-transactions.css'
import './mobile-developer-workspace.css'

const TABS = [{ id: 'journey', label: 'Journey' }, { id: 'details', label: 'Deal details' }]

function WorkspaceNotice({ children, onRetry }) {
  return <div className="mobile-workspace-notice"><p>{children}</p><button type="button" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" />Retry</button></div>
}

export default function MobileDeveloperTransactionPage() {
  const workspace = useWorkspace()
  const organisationContext = useOptionalOrganisation()
  const organisation = organisationContext?.organisation || null
  const organisationLoading = Boolean(organisationContext?.loading)
  const developer = resolveMobileRoleCategory(workspace) === 'developer'
  const { workspaceId } = useParams()
  const navigate = useNavigate()
  const [result, setResult] = useState(null)
  const [retry, setRetry] = useState(0)
  const [view, setView] = useState(null)
  const activeTab = view?.id === workspaceId ? view.tab : 'journey'
  const tabPrefix = useId()
  const scopeRef = useRef(null)
  const requestRef = useRef(0)
  useEffect(() => {
    scopeRef.current = { id: workspaceId, workspace, organisation }
    return () => { scopeRef.current = null; requestRef.current += 1 }
  }, [workspace, organisation, workspaceId])
  const loadWorkspace = useCallback(async ({ background = false } = {}) => {
    if (!developer || organisationLoading || !workspaceId) return false
    const scope = scopeRef.current
    const request = ++requestRef.current
    try {
      const detail = await getMobileDeveloperTransactionJourneyAsync({ workspace, organisation, transactionId: workspaceId })
      if (scopeRef.current !== scope || requestRef.current !== request) return false
      // A failed background journey read must not replace known completion with
      // unavailable milestones. The live queue will retry this read.
      if (background && detail?.item?.id && !detail.journeyAvailable) return false
      setResult({ id: workspaceId, workspace, organisation, detail })
      return true
    } catch (error) {
      if (scopeRef.current !== scope || requestRef.current !== request) return false
      if (!background) setResult({ id: workspaceId, workspace, organisation, error: error.message || 'Unable to load this transaction.' })
      return false
    }
  }, [developer, organisationLoading, workspace, organisation, workspaceId])
  useEffect(() => {
    // The loader sets snapshot state only after its awaited read completes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWorkspace()
  }, [loadWorkspace, retry])
  const currentResult = result?.id === workspaceId && result.workspace === workspace && result.organisation === organisation
  const liveState = useTransactionLiveRefresh({
    transactionId: workspaceId,
    scopeKey: organisation?.id || workspace.currentWorkspace?.organisationId || workspace.currentWorkspace?.id || '',
    enabled: Boolean(developer && !organisationLoading && currentResult && result.detail?.item?.id),
    includeNotifications: false,
    pollingIntervalMs: 15_000,
    refreshOnMount: false,
    onRefresh: () => loadWorkspace({ background: true }),
  })

  if (!developer) return <Navigate to="/mobile/home" replace />
  if (organisationLoading || !result || result.id !== workspaceId || result.workspace !== workspace || result.organisation !== organisation) return <MobileLoadingState label="Loading transaction" />
  if (result.error) return <MobileErrorState body={result.error} onRetry={() => { setResult(null); setRetry((value) => value + 1) }} />
  const detail = result.detail
  if (!detail?.item?.id) return <MobileEmptyState title="Transaction not found." body="This transaction is not available in your current workspace." actionLabel="All transactions" onAction={() => navigate('/mobile/transactions')} />
  const { item } = detail
  const refresh = () => { setResult(null); setRetry((value) => value + 1) }
  const selectTab = (tab) => setView({ id: workspaceId, tab })
  const updated = detail.updatedAt ? new Date(detail.updatedAt) : null
  const updatedLabel = updated && Number.isFinite(updated.getTime()) ? updated.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' }) : 'Not recorded'
  const price = item.valueRaw !== null && item.valueRaw !== undefined && Number.isFinite(Number(item.valueRaw))
    ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(Number(item.valueRaw)) : 'Not recorded'
  function onTabKeyDown(event) {
    const index = TABS.findIndex((tab) => tab.id === activeTab)
    const next = { ArrowRight: (index + 1) % TABS.length, ArrowLeft: (index + TABS.length - 1) % TABS.length, Home: 0, End: TABS.length - 1 }[event.key]
    if (next === undefined) return
    event.preventDefault()
    selectTab(TABS[next].id)
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus()
  }
  return (
    <div className="mobile-transactions mobile-developer-workspace">
      <div className="mobile-workspace-toolbar"><button className="mobile-detail-back" type="button" onClick={() => navigate('/mobile/transactions')}><ArrowLeft size={17} aria-hidden="true" />Transactions</button><button type="button" aria-label="Refresh workspace" onClick={refresh}><RefreshCw size={16} aria-hidden="true" /></button></div>
      {liveState?.lastErrorMessage && <WorkspaceNotice onRetry={refresh}>The latest progress could not be refreshed. Showing the last loaded progress while updates retry.</WorkspaceNotice>}
      <header className="mobile-workspace-identity">
        <div className="mobile-workspace-identity-top"><span className="mobile-workspace-unit"><Building2 size={15} aria-hidden="true" />{item.unitLabel || 'Property'}</span>{item.stage && <span className="mobile-workspace-stage">{item.stage}</span>}</div>
        <h1>{item.propertyTitle || item.title}</h1>
        {item.location && <p className="mobile-workspace-location"><MapPin size={15} aria-hidden="true" />{item.location}</p>}
        {item.reference && <p className="mobile-workspace-reference">{item.reference}</p>}
      </header>
      <section className="mobile-workspace-next-action" aria-label="Next action"><span className="mobile-workspace-eyebrow">Next action</span><p>{item.nextAction || 'No next action recorded.'}</p></section>
      <div className="mobile-workspace-tabs" role="tablist" aria-label="Transaction workspace">
        {TABS.map((tab) => <button key={tab.id} id={`${tabPrefix}-${tab.id}-tab`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`${tabPrefix}-${tab.id}-panel`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => selectTab(tab.id)} onKeyDown={onTabKeyDown}>{tab.label}</button>)}
      </div>
      {TABS.map((tab) => <div key={tab.id} id={`${tabPrefix}-${tab.id}-panel`} role="tabpanel" aria-labelledby={`${tabPrefix}-${tab.id}-tab`} tabIndex={0} hidden={activeTab !== tab.id}>
        {tab.id === 'journey' && <div className="mobile-workspace-journey">
          <DeveloperOverviewJourney model={detail.journey} vertical title="Transaction progress" />
          {!detail.journeyAvailable && <WorkspaceNotice onRetry={refresh}>Progress could not be loaded. Retry to see the latest milestones.</WorkspaceNotice>}
          {detail.journey?.legalJourney?.status === 'ready' ? <><SharedLegalJourney result={detail.journey.legalJourney} />{detail.journey.legalJourney.planRequired && <p className="mobile-workspace-empty">Saved legal tasks are shown. Milestones need a confirmed workflow plan.</p>}</> : detail.journeyAvailable && <WorkspaceNotice onRetry={refresh}>Legal progress is not available yet.</WorkspaceNotice>}
        </div>}
        {tab.id === 'details' && <section className="mobile-workspace-card" aria-label="Deal details">
          <div className="mobile-workspace-panel-heading"><span className="mobile-workspace-icon"><Building2 size={21} aria-hidden="true" /></span><div><h2>Deal details</h2><p>The saved deal at a glance</p></div></div>
          <dl className="mobile-workspace-facts"><div className="mobile-workspace-price"><dt>Deal value</dt><dd>{price}</dd></div><div><dt>Buyer</dt><dd>{item.eyebrow || 'Not recorded'}</dd></div><div><dt>Finance</dt><dd>{detail.financeType || 'Not recorded'}</dd></div><div><dt>Last updated</dt><dd>{updatedLabel}</dd></div></dl>
          {item.developmentId && <button className="mobile-workspace-development" type="button" onClick={() => navigate(`/mobile/development/${encodeURIComponent(item.developmentId)}`)}><Building2 size={18} aria-hidden="true" /><span>Open development</span><ChevronRight size={18} aria-hidden="true" /></button>}
        </section>}
      </div>)}
    </div>
  )
}
