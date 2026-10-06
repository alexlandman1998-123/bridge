import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import { resolveMobileRoleCategory } from '../../config/mobileShell.js'
import MobileTransactionCard from '../../components/mobile-shell/MobileTransactionCard.jsx'
import { MobileEmptyState, MobileErrorState, MobileLoadingState } from '../../components/mobile-shell/MobileShellStates.jsx'
import { getMobileDeveloperTransactionSnapshotAsync } from '../../services/mobileDashboardService.js'

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
  useEffect(() => {
    if (!developer || organisationLoading) return undefined
    let active = true
    getMobileDeveloperTransactionSnapshotAsync({ workspace, organisation, transactionId: workspaceId })
      .then((detail) => { if (active) setResult({ id: workspaceId, workspace, organisation, detail }) })
      .catch((error) => { if (active) setResult({ id: workspaceId, workspace, organisation, error: error.message || 'Unable to load this transaction.' }) })
    return () => { active = false }
  }, [developer, organisationLoading, workspace, organisation, workspaceId, retry])

  if (!developer) return <Navigate to="/mobile/home" replace />
  if (organisationLoading || !result || result.id !== workspaceId || result.workspace !== workspace || result.organisation !== organisation) return <MobileLoadingState label="Loading transaction" />
  if (result.error) return <MobileErrorState body={result.error} onRetry={() => { setResult(null); setRetry((value) => value + 1) }} />
  const detail = result.detail
  if (!detail?.item?.id) return <MobileEmptyState title="Transaction not found." body="This transaction is not available in your current workspace." actionLabel="All transactions" onAction={() => navigate('/mobile/transactions')} />
  const { item } = detail
  const documentSummary = detail.documentSummary
  return (
    <div className="mobile-transactions">
      <button className="mobile-detail-back" type="button" onClick={() => navigate('/mobile/transactions')}><ArrowLeft size={17} aria-hidden="true" />Transactions</button>
      <section className="mobile-transactions-intro"><h1>Transaction</h1><p>{item.reference || 'Saved transaction details'}</p></section>
      <MobileTransactionCard item={item} />
      <section className="mobile-portfolio-section"><h2>Deal details</h2><dl className="mobile-deal-details"><div><dt>Finance</dt><dd>{detail.financeType}</dd></div><div><dt>Next action</dt><dd>{item.nextAction || 'No next action recorded.'}</dd></div>{detail.updatedAt && <div><dt>Updated</dt><dd>{new Date(detail.updatedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</dd></div>}</dl></section>
      <section className="mobile-portfolio-section"><h2>Documents</h2><p className="mobile-portfolio-empty">{documentSummary ? `${documentSummary.uploadedCount || 0} uploaded · ${documentSummary.missingCount || 0} missing of ${documentSummary.totalRequired || 0} required` : 'Document summary is unavailable.'}</p></section>
      {item.developmentId && <button className="mobile-detail-link" type="button" onClick={() => navigate(`/mobile/development/${encodeURIComponent(item.developmentId)}`)}>Open development<ArrowUpRight size={18} aria-hidden="true" /></button>}
    </div>
  )
}
