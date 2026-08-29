import { useLocation } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { loadAgencyLeadWorkspace } from './agencyLeadWorkspaceLoader'

const AgencyPipelinePage = lazy(loadAgencyLeadWorkspace)

function LeadWorkspaceSkeleton() {
  return (
    <section className="space-y-5" aria-busy="true" aria-label="Loading lead workspace">
      <div className="rounded-[22px] border border-[#dbe7f2] bg-white p-6 shadow-[0_16px_42px_rgba(15,23,42,0.05)]">
        <div className="h-3 w-32 animate-pulse rounded-full bg-[#dfe8f1]" />
        <div className="mt-4 h-8 w-72 max-w-full animate-pulse rounded-[10px] bg-[#e8eef4]" />
        <div className="mt-6 flex gap-3 overflow-hidden">
          {[0, 1, 2, 3, 4].map((item) => <div key={item} className="h-11 w-32 shrink-0 animate-pulse rounded-[12px] bg-[#f0f4f8]" />)}
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr_0.9fr]">
        {[0, 1, 2].map((item) => (
          <div key={item} className="min-h-72 rounded-[22px] border border-[#dbe7f2] bg-white p-5 shadow-[0_12px_34px_rgba(15,23,42,0.04)]">
            <div className="h-5 w-40 animate-pulse rounded-full bg-[#e3eaf1]" />
            <div className="mt-5 h-36 animate-pulse rounded-[16px] bg-[#f1f5f8]" />
          </div>
        ))}
      </div>
    </section>
  )
}

export default function AgencyLeadWorkspaceRoutePage() {
  const location = useLocation()

  return (
    <Suspense fallback={<LeadWorkspaceSkeleton />}>
      <AgencyPipelinePage
        key={`lead-workspace:${location.pathname}`}
        initialViewMode="leads"
      />
    </Suspense>
  )
}
