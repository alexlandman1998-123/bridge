import { useEffect } from 'react'
import LeadWorkspaceLoadingShell from '../../pages/agency/LeadWorkspaceLoadingShell'
import { recordLeadWorkspaceLoadStage } from '../../services/observability/leadWorkspaceLoadingTrace'

export default function LeadWorkspaceRouteLoadingShell({ label = '', loadStage = '', testId = 'lead-workspace-route-loading-shell' }) {
  useEffect(() => {
    if (loadStage) recordLeadWorkspaceLoadStage(loadStage)
  }, [loadStage])

  return <LeadWorkspaceLoadingShell loadStage={loadStage} testId={testId} ariaLabel={label} />
}
