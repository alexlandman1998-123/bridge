import { ArrowUpRight, Building2, Clock3, Network, Search, TrendingUp, Users } from 'lucide-react'
import { Link } from 'react-router-dom'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(Number(value || 0))
}

function formatDate(value) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function toneClasses(tone = '') {
  if (tone === 'healthy') return 'border-[#cdebd8] bg-[#f1fbf6] text-[#17613d]'
  if (tone === 'watch') return 'border-[#f0dfb8] bg-[#fff8ea] text-[#8a5b16]'
  if (tone === 'inactive') return 'border-[#d8e6f7] bg-[#f3f7ff] text-[#1e4d82]'
  return 'border-[#f1c9c5] bg-[#fff5f4] text-[#b42318]'
}

function SectionCard({ title, icon: Icon, children, className = '' }) {
  return (
    <section className={`rounded-[8px] border border-[#dbe5f0] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] ${className}`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-[#10243a]">
        {Icon ? <Icon size={16} /> : null}
        {title}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function MetricMini({ label, value, subtext }) {
  return (
    <div className="rounded-[8px] border border-[#e4ebf4] bg-[#f8fafc] p-3">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">{label}</p>
      <strong className="mt-2 block text-lg font-semibold tracking-[-0.02em] text-[#10243a]">{value}</strong>
      {subtext ? <p className="mt-1 text-xs leading-5 text-[#60758d]">{subtext}</p> : null}
    </div>
  )
}

function SearchResultRow({ result }) {
  return (
    <Link
      to={result.href}
      className="flex items-start justify-between gap-3 rounded-[8px] border border-[#e4ebf4] bg-[#f8fafc] p-3 transition hover:border-[#cfdcec] hover:bg-white"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {result.type === 'staff' ? <Users size={14} className="text-[#52677f]" /> : <Building2 size={14} className="text-[#52677f]" />}
          <p className="truncate text-sm font-semibold text-[#10243a]">{result.title}</p>
        </div>
        <p className="mt-1 text-xs text-[#60758d]">{result.subtitle}</p>
        <p className="mt-1 text-xs text-[#60758d]">{result.detail}</p>
      </div>
      <ArrowUpRight size={14} className="mt-0.5 shrink-0 text-[#7a8ba3]" />
    </Link>
  )
}

function ActivityRow({ item }) {
  return (
    <div className="rounded-[8px] border border-[#e4ebf4] bg-[#f8fafc] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#10243a]">{item.title}</p>
          <p className="mt-1 text-xs leading-5 text-[#60758d]">{item.detail || item.partnerName || 'Partner activity'}</p>
        </div>
        <span className="shrink-0 rounded-full border border-[#e4ebf4] bg-white px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#52677f]">
          {formatDate(item.createdAt)}
        </span>
      </div>
    </div>
  )
}

export default function PartnerNetworkIntelligencePanel({
  intelligence = {},
  searchQuery = '',
  onSearchQueryChange = () => {},
}) {
  const summary = intelligence.summary || {}
  const profiles = Array.isArray(intelligence.partnerProfiles) ? intelligence.partnerProfiles : []
  const selectedProfile = intelligence.selectedProfile || null
  const searchResults = Array.isArray(intelligence.searchResults) ? intelligence.searchResults : []
  const activityFeed = Array.isArray(intelligence.activityFeed) ? intelligence.activityFeed : []
  const executiveHighlights = Array.isArray(intelligence.executiveHighlights) ? intelligence.executiveHighlights : []
  const graphNodes = Array.isArray(intelligence.relationshipGraph?.nodes) ? intelligence.relationshipGraph.nodes : []

  return (
    <div className="space-y-5">
      <SectionCard title="Network Search" icon={Search}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <p className="max-w-3xl text-sm leading-6 text-[#60758d]">
            Search partner organisations, branches, teams, and people across connected partner networks.
          </p>
          <label className="relative min-w-0 lg:w-[340px]">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8ba0b8]" />
            <input
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Search organisations or people"
              className="h-10 w-full rounded-[8px] border border-[#d7e2ee] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#1f4f78] focus:ring-4 focus:ring-[#1f4f78]/10"
            />
          </label>
        </div>

        {searchResults.length ? (
          <div className="mt-4 grid gap-2">
            {searchResults.map((result) => (
              <SearchResultRow key={result.id} result={result} />
            ))}
          </div>
        ) : searchQuery ? (
          <p className="mt-4 rounded-[8px] border border-dashed border-[#dbe5f0] bg-[#f8fafc] px-4 py-5 text-sm text-[#60758d]">No results match that search yet.</p>
        ) : null}
      </SectionCard>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricMini label="Connections" value={formatNumber(summary.totalConnections || 0)} subtext={`${formatNumber(summary.activeConnections || 0)} active`} />
        <MetricMini label="Average Health" value={formatNumber(summary.averageHealthScore || 0)} subtext="Relationship score across partners" />
        <MetricMini label="Visible Staff" value={formatNumber(summary.totalUsers || 0)} subtext="Approved partner users" />
        <MetricMini label="Referral Value" value={`R${formatNumber(summary.referralVolume || 0)}`} subtext={`${formatNumber(summary.recentActivity || 0)} recent events`} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section className="space-y-4">
          <SectionCard title="Partner Directory" icon={Network}>
            <div className="grid gap-3 md:grid-cols-2">
              {profiles.length ? (
                profiles.map((profile) => (
                  <article key={profile.id} className="rounded-[8px] border border-[#e4ebf4] bg-[#f8fafc] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#10243a]">{profile.organisationName}</p>
                        <p className="mt-1 text-xs text-[#60758d]">{[profile.organisationTypeLabel, profile.city, profile.province].filter(Boolean).join(' · ')}</p>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] ${toneClasses(profile.healthTone)}`}>
                        {profile.healthLabel}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <MetricMini label="Users" value={formatNumber(profile.activeUsers || 0)} />
                      <MetricMini label="Transactions" value={formatNumber(profile.transactionVolume || 0)} />
                      <MetricMini label="Branches" value={formatNumber(profile.branchCount || 0)} />
                      <MetricMini label="Referrals" value={formatNumber(profile.referralCount || 0)} />
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7a8ba3]">Connected Since</p>
                        <p className="mt-1 text-sm text-[#40556c]">{formatDate(profile.partnerSince)}</p>
                      </div>
                      <Link
                        to={`/partners/${encodeURIComponent(profile.organisationId)}`}
                        className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#d9e4ef] bg-white px-3 text-sm font-semibold text-[#264563] transition hover:bg-[#f8fafc]"
                      >
                        View profile <ArrowUpRight size={14} />
                      </Link>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-[8px] border border-dashed border-[#dbe5f0] bg-[#f8fafc] p-5 text-sm text-[#60758d]">
                  No connected partner organisations yet.
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Relationship Graph" icon={Building2}>
            <div className="grid gap-3 md:grid-cols-2">
              {graphNodes.length ? (
                graphNodes.map((node) => (
                  <div key={node.id} className="rounded-[8px] border border-[#e4ebf4] bg-[#f8fafc] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#10243a]">{node.label}</p>
                        <p className="mt-1 text-xs text-[#60758d]">Relationship {node.id}</p>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] ${toneClasses(node.status === 'Healthy' ? 'healthy' : node.status === 'Watch' ? 'watch' : node.status === 'Inactive' ? 'inactive' : 'dormant')}`}>
                        {node.score}/100
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs text-[#60758d]">
                      <Users size={14} />
                      <span>{node.active ? 'Active relationship' : 'Dormant relationship'}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-[8px] border border-dashed border-[#dbe5f0] bg-[#f8fafc] p-5 text-sm text-[#60758d]">
                  Relationship graph will populate as connected partners are approved.
                </p>
              )}
            </div>
          </SectionCard>
        </section>

        <section className="space-y-4">
          <SectionCard title="Network Health" icon={TrendingUp}>
            <div className="grid gap-2">
              <MetricMini label="Top Partner" value={summary.topProfile?.organisationName || 'None yet'} subtext={summary.topProfile ? `${summary.topProfile.healthScore}/100` : 'No active profile'} />
              <MetricMini label="Fastest Partner" value={summary.fastestProfile?.organisationName || 'None yet'} subtext={summary.fastestProfile ? `${summary.fastestProfile.turnaroundDays || 0} day turnaround` : 'No activity yet'} />
              <MetricMini label="Most Active Consultant" value={summary.busiestConsultant?.name || 'None yet'} subtext={summary.busiestConsultant ? summary.busiestConsultant.organisationName : 'No staff loaded'} />
            </div>
            {executiveHighlights.length ? (
              <div className="mt-4 space-y-2">
                {executiveHighlights.map((item) => (
                  <div key={item.label} className="rounded-[8px] border border-[#e4ebf4] bg-[#f8fafc] p-3">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">{item.label}</p>
                    <p className="mt-1 text-sm font-semibold text-[#10243a]">{item.value}</p>
                    <p className="mt-1 text-xs text-[#60758d]">{item.detail}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Partner Activity Feed" icon={Clock3}>
            <div className="space-y-2">
              {activityFeed.length ? (
                activityFeed.slice(0, 10).map((item) => <ActivityRow key={item.id} item={item} />)
              ) : (
                <p className="rounded-[8px] border border-dashed border-[#dbe5f0] bg-[#f8fafc] p-5 text-sm text-[#60758d]">No activity recorded yet.</p>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Selected Partner" icon={Building2}>
            {selectedProfile ? (
              <div className="space-y-3">
                <div className="rounded-[8px] border border-[#e4ebf4] bg-[#f8fafc] p-3">
                  <p className="text-sm font-semibold text-[#10243a]">{selectedProfile.organisationName}</p>
                  <p className="mt-1 text-xs text-[#60758d]">{selectedProfile.summaryLine}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <MetricMini label="Health" value={`${selectedProfile.healthScore}/100`} />
                  <MetricMini label="Staff" value={formatNumber(selectedProfile.activeUsers || 0)} />
                </div>
                <div className="space-y-2">
                  {(selectedProfile.staffDirectory || []).slice(0, 6).map((person) => (
                    <div key={person.userId || person.id || person.name} className="rounded-[8px] border border-[#e4ebf4] bg-white p-2.5">
                      <p className="text-sm font-semibold text-[#10243a]">{normalizeText(person.name || person.fullName)}</p>
                      <p className="mt-1 text-xs text-[#60758d]">{[person.role, person.branchName, person.regionName, person.teamName].filter(Boolean).join(' · ') || 'Visible partner staff'}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-[8px] border border-dashed border-[#dbe5f0] bg-[#f8fafc] p-5 text-sm text-[#60758d]">Select a connected partner to inspect their staff directory and health.</p>
            )}
          </SectionCard>
        </section>
      </div>
    </div>
  )
}

