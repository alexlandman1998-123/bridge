import { Suspense, lazy } from 'react'
import { loadAgencyLeadWorkspace } from './agencyLeadWorkspaceLoader'
import LeadsRouteShell from '../../components/leads/LeadsRouteShell'

const AgencyPipelinePage = lazy(loadAgencyLeadWorkspace)

export default function AgencyLeadWorkspaceRoutePage() {
  return (
    <Suspense fallback={<LeadsRouteShell detail />}>
      <AgencyPipelinePage
        initialViewMode="leads"
      />
    </Suspense>
  )
}
