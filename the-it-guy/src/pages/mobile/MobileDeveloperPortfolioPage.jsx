import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import { resolveMobileRoleCategory } from '../../config/mobileShell.js'
import MobileDevelopmentCard from '../../components/mobile-shell/MobileDevelopmentCard.jsx'
import MobileTransactionCard from '../../components/mobile-shell/MobileTransactionCard.jsx'
import { MobileEmptyState, MobileErrorState, MobileLoadingState } from '../../components/mobile-shell/MobileShellStates.jsx'
import { getCachedMobileDashboardSnapshot, getMobileDashboardSnapshotAsync } from '../../services/mobileDashboardService.js'

export default function MobileDeveloperPortfolioPage() {
  const workspace = useWorkspace()
  const organisationContext = useOptionalOrganisation()
  const organisation = organisationContext?.organisation || null
  const organisationLoading = Boolean(organisationContext?.loading)
  const { developmentId } = useParams()
  const navigate = useNavigate()
  const [result, setResult] = useState(() => {
    const snapshot = getCachedMobileDashboardSnapshot({ workspace, organisation, allowStale: true })
    return snapshot ? { workspace, organisation, snapshot } : null
  })
  const [retry, setRetry] = useState(0)
  const developer = resolveMobileRoleCategory(workspace) === 'developer'

  useEffect(() => {
    if (!developer || organisationLoading) return undefined
    let active = true
    getMobileDashboardSnapshotAsync({ workspace, organisation, force: retry > 0 })
      .then((snapshot) => { if (active) setResult({ workspace, organisation, snapshot }) })
      .catch((error) => { if (active) setResult({ workspace, organisation, error: error.message || 'Unable to load developments.' }) })
    return () => { active = false }
  }, [developer, organisation, organisationLoading, retry, workspace])

  if (!developer) return <Navigate to="/mobile/home" replace />
  if (organisationLoading || !result || result.workspace !== workspace || result.organisation !== organisation) return <MobileLoadingState label="Loading developments" />
  if (result.error) return <MobileErrorState body={result.error} onRetry={() => { setResult(null); setRetry((value) => value + 1) }} />

  const { snapshot } = result
  const developments = snapshot.developments || []
  const development = developments.find((item) => item.id === developmentId)
  const transactions = (snapshot.transactions || []).filter((item) => item.developmentId === developmentId)
  const available = (snapshot.units || []).filter((unit) => unit.developmentId === developmentId && unit.available)
  const openTransaction = (item) => navigate(item.to, { state: { mobileWorkspaceItem: item } })

  if (developmentId && !development) return <MobileEmptyState title="Development not found." body="This development is not available in your current workspace." actionLabel="All developments" onAction={() => navigate('/mobile/developments')} />

  return (
    <div className="mobile-transactions mobile-developer-portfolio">
      {developmentId && <button className="mobile-detail-back" type="button" onClick={() => navigate('/mobile/developments')}><ArrowLeft size={17} aria-hidden="true" />Developments</button>}
      <section className="mobile-transactions-intro"><h1>{development ? development.title : 'Developments'}</h1><p>{development ? `${development.registeredUnits} registered units · ${development.activeDeals} active transactions` : `${developments.length} developments in your portfolio`}</p></section>
      {development ? <>
        <MobileDevelopmentCard item={development} />
        <section className="mobile-portfolio-section" aria-label="Active transactions"><h2>Active transactions</h2><div className="mobile-transactions-list">{transactions.length ? transactions.map((item) => <MobileTransactionCard key={item.id} item={item} onOpen={openTransaction} />) : <p className="mobile-portfolio-empty">No active transactions in this development.</p>}</div></section>
        <section className="mobile-portfolio-section" aria-label="Available units"><h2>Available units</h2>{available.length ? available.map((unit) => <article className="mobile-unit-row" key={unit.id}><div><strong>{unit.title}</strong><span>Available</span></div><span>{unit.value > 0 ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(unit.value) : 'Price not set'}</span></article>) : <p className="mobile-portfolio-empty">No available units in this development.</p>}</section>
      </> : <section className="mobile-transactions-list" aria-label="Development portfolio">{developments.length ? developments.map((item) => <MobileDevelopmentCard key={item.id} item={item} onOpen={(chosen) => navigate(chosen.to)} />) : <MobileEmptyState title="Your portfolio starts here." body="Your connected developments will appear here when available." />}</section>}
    </div>
  )
}
