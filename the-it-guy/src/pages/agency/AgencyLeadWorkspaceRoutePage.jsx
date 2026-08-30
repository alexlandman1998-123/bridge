import { useLocation } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import LeadsRouteShell from '../../components/leads/LeadsRouteShell'
import { loadAgencyLeadWorkspace } from './agencyLeadWorkspaceLoader'
import { resolveAgencyLeadWorkspaceTab } from './agencyLeadWorkspaceRouteState'

const AgencyPipelinePage = lazy(loadAgencyLeadWorkspace)

export default function AgencyLeadWorkspaceRoutePage() {
  const location = useLocation()
  const activeTab = resolveAgencyLeadWorkspaceTab(location.search)

  return (
    <Suspense fallback={<LeadsRouteShell detail label={`Loading ${activeTab.replaceAll('_', ' ')}`} />}>
      <AgencyPipelinePage
        key={`lead-workspace:${location.pathname}`}
        initialViewMode="leads"
      />
    </Suspense>
  )
}
