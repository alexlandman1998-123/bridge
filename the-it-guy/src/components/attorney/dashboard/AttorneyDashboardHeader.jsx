import AttorneyFirmIdentityCard from '../branding/AttorneyFirmIdentityCard'

function AttorneyDashboardHeader({ firm, currentUserRole, activeDepartmentsCount = 0, activeMembersCount = 0 }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Firm Overview</p>
        <h2 className="text-2xl font-semibold text-slate-950">Attorney Management Dashboard</h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          Track active matters, department workload, and key conveyancing milestones across your firm.
        </p>
      </div>

      <div className="grid gap-3">
        <AttorneyFirmIdentityCard
          firm={firm}
          title="Firm Identity"
          subtitle={firm?.email || firm?.phone || ''}
          roleLabel={`Role: ${currentUserRole || '—'}`}
          contactSummary={false}
          compactMode
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Active departments</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{activeDepartmentsCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Active members</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{activeMembersCount}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AttorneyDashboardHeader
