import { Activity } from 'lucide-react'
import { formatDate, titleize } from '../commercialFormatters'
import CommercialEmptyState from '../components/CommercialEmptyState'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialRecentActivity } from '../services/commercialApi'

function CommercialActivityPage() {
  const { data, loading, error } = useCommercialData(getCommercialRecentActivity, [])
  const activity = Array.isArray(data) ? data : []

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">Activity</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Commercial activity across requirements, deals, documents, Heads of Terms, leases, and vacancies.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
          <Activity size={14} /> Timeline
        </span>
      </div>

      <div className="mt-5 grid gap-3">
        {loading ? (
          <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
        ) : error ? (
          <CommercialEmptyState title="Activity could not be loaded" description={error} />
        ) : activity.length ? activity.map((item) => (
          <article key={item.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 md:grid-cols-[minmax(0,1fr)_180px_140px] md:items-center">
            <div>
              <p className="text-sm font-semibold text-[#102236]">{item.title || titleize(item.activity_type)}</p>
              <p className="mt-1 text-xs text-slate-500">{item.body || 'Commercial activity update'}</p>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{titleize(item.entity_type)}</p>
            <p className="text-sm text-slate-500">{formatDate(item.created_at)}</p>
          </article>
        )) : (
          <CommercialEmptyState
            title="No commercial activity yet"
            description="Stage changes, notes, documents, HOT updates, and commercial workflow events will appear here."
          />
        )}
      </div>
    </section>
  )
}

export default CommercialActivityPage
