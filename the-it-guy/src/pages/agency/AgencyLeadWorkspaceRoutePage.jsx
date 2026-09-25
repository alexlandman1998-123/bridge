import { useLocation } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import LeadWorkspaceRouteLoadingShell from '../../components/leads/LeadWorkspaceRouteLoadingShell'
import { loadAgencyLeadWorkspace } from './agencyLeadWorkspaceLoader'

const AgencyPipelinePage = lazy(loadAgencyLeadWorkspace)

export default function AgencyLeadWorkspaceRoutePage() {
  const location = useLocation()

  return (
    <Suspense
      fallback={<LeadWorkspaceRouteLoadingShell loadStage="workspace_chunk_loading" />}
    >
      <AgencyPipelinePage
        key={`lead-workspace:${location.pathname}`}
        initialViewMode="leads"
      />
    </Suspense>
  )
}
