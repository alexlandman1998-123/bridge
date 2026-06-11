import { AlertTriangle, BriefcaseBusiness, Building2, CalendarClock, Gavel, RefreshCw, Search, UserRoundCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { listPartnerProspects } from '../../services/transactionPartnerInvitationService'
import { SettingsBanner, SettingsEmptyState, SettingsLoadingState, SettingsPageHeader, SettingsSectionCard, settingsPageClass } from './settingsUi'

const ROLE_TABS = [
  { key: 'attorney', label: 'Transfer Attorneys', icon: Gavel },
  { key: 'bond_originator', label: 'Bond Originators', icon: UserRoundCheck },
  { key: 'developer', label: 'Developers', icon: Building2 },
  { key: 'other', label: 'Other', icon: BriefcaseBusiness },
]

function formatDate(value) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Never'
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function statusClasses(status) {
  if (status === 'joined') return 'bg-[#e8f7ee] text-[#1f7a45] border-[#ccead8]'
  if (status === 'declined') return 'bg-[#fff1f0] text-[#b42318] border-[#f1c9c5]'
  if (status === 'inactive') return 'bg-[#f3f6fa] text-[#60758d] border-[#dce6f0]'
  return 'bg-[#eef4fb] text-[#35546c] border-[#d5e3f1]'
}

function ProspectCard({ prospect }) {
  return (
    <article className="rounded-[18px] border border-[#e3ebf4] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h4 className="truncate text-base font-semibold text-[#162334]">{prospect.companyName}</h4>
          <p className="mt-1 text-sm text-[#60758d]">{prospect.contactName || prospect.email || 'No primary contact captured'}</p>
          {prospect.email ? <p className="mt-1 truncate text-xs font-medium text-[#7b8ba5]">{prospect.email}</p> : null}
        </div>
        <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] ${statusClasses(prospect.status)}`}>
          {prospect.statusLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[14px] border border-[#e6edf5] bg-[#fbfdff] px-3 py-2.5">
          <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#8ba0b8]">Used On</span>
          <strong className="mt-1 block text-lg font-semibold text-[#162334]">{prospect.transactionCount}</strong>
        </div>
        <div className="rounded-[14px] border border-[#e6edf5] bg-[#fbfdff] px-3 py-2.5">
          <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#8ba0b8]">Invites</span>
          <strong className="mt-1 block text-lg font-semibold text-[#162334]">{prospect.invitationCount}</strong>
        </div>
        <div className="rounded-[14px] border border-[#e6edf5] bg-[#fbfdff] px-3 py-2.5">
          <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#8ba0b8]">Accept Rate</span>
          <strong className="mt-1 block text-lg font-semibold text-[#162334]">{prospect.acceptanceRate}%</strong>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-medium text-[#60758d]">
        <span className="inline-flex items-center gap-1 rounded-full border border-[#e4ebf2] bg-[#fbfdff] px-2.5 py-1">
          <CalendarClock size={13} />
          Last used {formatDate(prospect.lastTransactionDate)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-[#e4ebf2] bg-[#fbfdff] px-2.5 py-1">
          First seen {formatDate(prospect.firstSeenDate)}
        </span>
        {prospect.duplicateReviewStatus === 'possible_duplicate' ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[#f3d9a8] bg-[#fff8ec] px-2.5 py-1 text-[#a16207]">
            <AlertTriangle size={13} />
            Possible duplicate
          </span>
        ) : null}
      </div>
    </article>
  )
}

export default function SettingsPartnerProspectsPage() {
  const [prospects, setProspects] = useState([])
  const [activeRole, setActiveRole] = useState('attorney')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadProspects = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const rows = await listPartnerProspects({ limit: 250 })
      setProspects(rows)
    } catch (loadError) {
      setError(loadError.message || 'Partner directory could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProspects()
  }, [loadProspects])

  const summary = useMemo(() => {
    const connected = prospects.filter((item) => item.status === 'joined').length
    const pending = prospects.filter((item) => item.status === 'invited').length
    const mostUsedAttorney = prospects
      .filter((item) => item.roleType === 'attorney')
      .sort((left, right) => right.transactionCount - left.transactionCount)[0]
    const mostUsedOriginator = prospects
      .filter((item) => item.roleType === 'bond_originator')
      .sort((left, right) => right.transactionCount - left.transactionCount)[0]
    return { connected, pending, mostUsedAttorney, mostUsedOriginator }
  }, [prospects])

  const filteredProspects = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return prospects
      .filter((item) => item.roleType === activeRole)
      .filter((item) => {
        if (!needle) return true
        return [item.companyName, item.contactName, item.email, item.phone].some((value) => String(value || '').toLowerCase().includes(needle))
      })
  }, [activeRole, prospects, query])

  if (loading) {
    return <SettingsLoadingState label="Loading partner directory..." />
  }

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Partner Directory"
        title="Reusable partner prospects"
        description="Firms selected or invited during transaction setup become reusable prospects. Prospects are directory records only; transaction access is still granted separately per transaction."
        actions={
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-[14px] border border-[#d9e4ef] bg-white px-4 py-2.5 text-sm font-semibold text-[#35546c] shadow-[0_8px_18px_rgba(15,23,42,0.05)]"
            onClick={() => loadProspects()}
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        }
      />

      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#8ba0b8]">Connected Partners</span>
          <strong className="mt-2 block text-2xl font-semibold text-[#162334]">{summary.connected}</strong>
        </div>
        <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#8ba0b8]">Pending Partners</span>
          <strong className="mt-2 block text-2xl font-semibold text-[#162334]">{summary.pending}</strong>
        </div>
        <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#8ba0b8]">Most Used Attorney</span>
          <strong className="mt-2 block truncate text-lg font-semibold text-[#162334]">{summary.mostUsedAttorney?.companyName || 'None yet'}</strong>
        </div>
        <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#8ba0b8]">Most Used Originator</span>
          <strong className="mt-2 block truncate text-lg font-semibold text-[#162334]">{summary.mostUsedOriginator?.companyName || 'None yet'}</strong>
        </div>
      </section>

      <SettingsSectionCard title="Directory" description="Search firms by category. Duplicate-looking firms are flagged for review but never auto-merged.">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <nav className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Partner prospect categories">
            {ROLE_TABS.map((tab) => {
              const Icon = tab.icon
              const active = activeRole === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  className={`inline-flex items-center justify-center gap-2 rounded-[14px] border px-3 py-2 text-sm font-semibold transition ${
                    active ? 'border-[#142132] bg-[#142132] text-white' : 'border-[#dbe4ef] bg-white text-[#60758d] hover:text-[#162334]'
                  }`}
                  onClick={() => setActiveRole(tab.key)}
                >
                  <Icon size={15} />
                  {tab.label}
                </button>
              )
            })}
          </nav>
          <label className="relative min-w-0 lg:w-80">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8ba0b8]" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search directory"
              className="w-full rounded-[14px] border border-[#dde4ee] bg-white py-2.5 pl-9 pr-3 text-sm font-medium text-[#162334] outline-none focus:border-[#b9c8d8] focus:ring-4 focus:ring-[#eaf1f8]"
            />
          </label>
        </div>

        {filteredProspects.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {filteredProspects.map((prospect) => (
              <ProspectCard key={prospect.id} prospect={prospect} />
            ))}
          </div>
        ) : (
          <SettingsEmptyState
            title="No partner prospects yet"
            description="Prospects appear here after a firm is invited or reused during transaction setup."
          />
        )}
      </SettingsSectionCard>
    </div>
  )
}
