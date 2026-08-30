import { useLocation } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { loadAgencyLeadWorkspace } from './agencyLeadWorkspaceLoader'
import LeadWorkspaceHydrationShell from './LeadWorkspaceHydrationShell'

const AgencyPipelinePage = lazy(loadAgencyLeadWorkspace)

export default function AgencyLeadWorkspaceRoutePage() {
  const location = useLocation()

  return (
    <Suspense
      fallback={<LeadWorkspaceHydrationShell search={location.search} />}
    >
      <AgencyPipelinePage
        key={`lead-workspace:${location.pathname}`}
        initialViewMode="leads"
      />
    </Suspense>
  )
}
