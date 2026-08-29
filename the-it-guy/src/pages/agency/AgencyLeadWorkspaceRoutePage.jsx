import { useLocation } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { loadAgencyLeadWorkspace } from './agencyLeadWorkspaceLoader'
import AgencyLeadWorkspaceShellPage from './AgencyLeadWorkspaceShellPage'
import { resolveAgencyLeadWorkspaceTab } from './agencyLeadWorkspaceRouteState'

const AgencyPipelinePage = lazy(loadAgencyLeadWorkspace)

export default function AgencyLeadWorkspaceRoutePage() {
  const location = useLocation()
  const activeTab = resolveAgencyLeadWorkspaceTab(location.search)

  return (
    <Suspense fallback={<AgencyLeadWorkspaceShellPage loadingTab={activeTab !== 'overview'} />}>
      <AgencyPipelinePage
        key={`lead-workspace:${location.pathname}`}
        initialViewMode="leads"
      />
    </Suspense>
  )
}
