import CommercialExpiryTable from '../components/CommercialExpiryTable'
import CommercialEmptyState from '../components/CommercialEmptyState'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialPrincipalDashboardData } from '../services/commercialDashboardApi'

function CommercialLeaseExpiryWatchPage() {
  const { data, loading, error } = useCommercialData(getCommercialPrincipalDashboardData, [])
  const rows = data?.watchlists?.leaseExpiries || []

  return (
    <div className="grid gap-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
        <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">Lease Expiry Watch</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
          Monitor leases expiring in 0-3, 3-6 and 6-12 month windows, renewal risk, broker ownership, and tenant retention priorities.
        </p>
      </section>

      {loading ? (
        <div className="h-64 animate-pulse rounded-3xl bg-slate-100" />
      ) : error ? (
        <CommercialEmptyState title="Lease expiry watch could not be loaded" description={error} />
      ) : (
        <CommercialExpiryTable rows={rows} />
      )}
    </div>
  )
}

export default CommercialLeaseExpiryWatchPage
