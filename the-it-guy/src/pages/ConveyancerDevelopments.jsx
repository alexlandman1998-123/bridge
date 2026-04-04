import {
  ArrowRight,
  Building2,
  FileCheck2,
  Landmark,
  MapPin,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import SearchInput from '../components/ui/SearchInput'
import SectionHeader from '../components/ui/SectionHeader'
import { buildAttorneyDemoRows, buildBondDemoRows } from '../core/transactions/attorneyMockData'
import { getAttorneyOperationalState } from '../core/transactions/attorneySelectors'
import { useWorkspace } from '../context/WorkspaceContext'
import { fetchDevelopmentOptions, fetchDevelopmentsData, fetchTransactionsByParticipant } from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabaseClient'

function formatRelativeDate(value) {
  if (!value) return 'No recent activity'
  const delta = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(delta) || delta < 0) return 'Updated today'
  const days = Math.floor(delta / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'Updated today'
  if (days === 1) return 'Updated 1 day ago'
  if (days < 30) return `Updated ${days} days ago`
  const months = Math.floor(days / 30)
  if (months === 1) return 'Updated 1 month ago'
  return `Updated ${months} months ago`
}

function summarizeAttention(blockedTransactions, activeTransactions) {
  if (blockedTransactions >= 2) {
    return {
      status: 'needs_attention',
      label: 'Needs Attention',
      lines: [`${blockedTransactions} files currently blocked or stale`, 'Immediate file follow-up required'],
    }
  }

  if (blockedTransactions === 1) {
    return {
      status: 'some_issues',
      label: 'Some Issues Pending',
      lines: ['1 file needs active follow-up', `${activeTransactions} live files in the workspace`],
    }
  }

  return {
    status: 'running_smoothly',
    label: 'Running Smoothly',
    lines: [`${activeTransactions} live files in the workspace`, 'No critical issues currently flagged'],
  }
}

function ConveyancerDevelopments() {
  const navigate = useNavigate()
  const { profile, role } = useWorkspace()
  const isBondRole = role === 'bond_originator'
  const [rows, setRows] = useState([])
  const [developmentOptions, setDevelopmentOptions] = useState([])
  const [portfolioFallback, setPortfolioFallback] = useState({ rows: [], developments: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured || !profile?.id) {
      setLoading(false)
      return
    }

    try {
      setError('')
      setLoading(true)
      const [transactionRows, options, fallback] = await Promise.all([
        fetchTransactionsByParticipant({ userId: profile.id, roleType: isBondRole ? 'bond_originator' : 'attorney' }),
        fetchDevelopmentOptions(),
        fetchDevelopmentsData().catch(() => ({ rows: [], developments: [] })),
      ])
      setRows(transactionRows || [])
      setDevelopmentOptions(options || [])
      setPortfolioFallback({
        rows: fallback?.rows || [],
        developments: fallback?.developments || [],
      })
    } catch (loadError) {
      setError(loadError.message || 'Unable to load developments.')
    } finally {
      setLoading(false)
    }
  }, [isBondRole, profile?.id])

  useEffect(() => {
    void loadData()
  }, [loadData])

  function buildCardsFromRows(sourceRows = [], sourceOptions = []) {
    const byId = new Map()

    for (const row of sourceRows) {
      const developmentId = row?.development?.id || row?.unit?.development_id
      if (!developmentId) continue

      if (!byId.has(developmentId)) {
        byId.set(developmentId, {
          id: developmentId,
          name: row?.development?.name || 'Standalone Development',
          location: row?.development?.location || 'Location pending',
          activeTransactions: 0,
          registeredTransactions: 0,
          lodgedTransactions: 0,
          blockedTransactions: 0,
          lastActivityAt: null,
        })
      }

      const item = byId.get(developmentId)
      const state = getAttorneyOperationalState(row)
      item.activeTransactions += state.transferStage === 'registered' ? 0 : 1
      item.registeredTransactions += state.transferStage === 'registered' ? 1 : 0
      item.lodgedTransactions += state.transferStage === 'lodged_at_deeds_office' ? 1 : 0
      item.blockedTransactions +=
        state.transferStage !== 'registered' &&
        (!state.documentReadiness.ready || !state.financeStatus.ready || !state.clearanceStatus.ready || state.daysSinceUpdate >= 10)
          ? 1
          : 0

      const updatedAt = row?.transaction?.updated_at || row?.transaction?.created_at || row?.unit?.updated_at || row?.unit?.created_at || null
      if (!item.lastActivityAt || new Date(updatedAt || 0) > new Date(item.lastActivityAt || 0)) {
        item.lastActivityAt = updatedAt
      }
    }

    for (const option of sourceOptions) {
      if (!byId.has(option.id)) {
        byId.set(option.id, {
          id: option.id,
          name: option.name,
          location: option.location || 'Location pending',
          activeTransactions: 0,
          registeredTransactions: 0,
          lodgedTransactions: 0,
          blockedTransactions: 0,
          lastActivityAt: null,
        })
      }
    }

    return Array.from(byId.values())
      .filter((item) => item.activeTransactions > 0 || item.registeredTransactions > 0)
      .map((item) => {
        const attention = summarizeAttention(item.blockedTransactions, item.activeTransactions)
        return {
          id: item.id,
          name: item.name,
          location: item.location,
          lifecycleStatus: 'active',
          lifecycleLabel: 'Active',
          totalUnits: item.activeTransactions + item.registeredTransactions,
          activeTransactionsCount: item.activeTransactions,
          registeredTransactionsCount: item.registeredTransactions,
          attentionStatus: attention.status,
          attentionLabel: attention.label,
          attentionLines: attention.lines,
          assignedAttorneyName: isBondRole ? 'Bridge Finance' : 'Bridge Conveyancing',
          lastUpdatedAt: item.lastActivityAt,
          lastUpdatedLabel: formatRelativeDate(item.lastActivityAt),
          primaryCtaUrl: `/developments/${item.id}`,
        }
      })
      .sort((left, right) => {
        if (right.activeTransactionsCount !== left.activeTransactionsCount) {
          return right.activeTransactionsCount - left.activeTransactionsCount
        }
        return left.name.localeCompare(right.name)
      })
  }

  const scopedRows = useMemo(
    () =>
      isBondRole
        ? buildBondDemoRows(rows || [], { minRows: 6 })
        : buildAttorneyDemoRows(rows || [], { ensureDevelopment: true, ensurePrivate: true }),
    [isBondRole, rows],
  )
  const liveCards = useMemo(() => buildCardsFromRows(scopedRows, developmentOptions), [developmentOptions, scopedRows])
  const fallbackCards = useMemo(
    () => buildCardsFromRows(portfolioFallback.rows, portfolioFallback.developments),
    [portfolioFallback.developments, portfolioFallback.rows],
  )

  const developmentCards = useMemo(() => {
    if (liveCards.length) return liveCards
    if (fallbackCards.length) return fallbackCards
    return buildCardsFromRows(
      isBondRole ? buildBondDemoRows([], { minRows: 4 }) : buildAttorneyDemoRows([], { ensureDevelopment: true, ensurePrivate: false }),
      developmentOptions,
    )
  }, [developmentOptions, fallbackCards, isBondRole, liveCards])

  const filteredCards = useMemo(() => {
    const query = String(search || '').trim().toLowerCase()
    if (!query) return developmentCards
    return developmentCards.filter((item) =>
      [item.name, item.location, item.assignedAttorneyName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    )
  }, [developmentCards, search])

  const metrics = useMemo(
    () => ({
      activeDevelopments: developmentCards.filter((item) => item.activeTransactionsCount > 0).length,
      activeFiles: developmentCards.reduce((sum, item) => sum + item.activeTransactionsCount, 0),
      lodged: developmentCards.reduce((sum, item) => sum + Math.min(item.activeTransactionsCount, 1), 0),
      blocked: developmentCards.reduce((sum, item) => sum + (item.attentionStatus === 'needs_attention' ? 1 : 0), 0),
    }),
    [developmentCards],
  )

  const summaryItems = useMemo(
    () => [
      {
        label: 'Active Developments',
        value: metrics.activeDevelopments,
        meta: `${filteredCards.length} visible in current view`,
        accent: 'from-[#edf4fb] via-[#f4f8fd] to-[#ffffff]',
        iconWrap: 'bg-[#e4eef9] text-[#48647e]',
        icon: Building2,
      },
      {
        label: 'Active Files',
        value: metrics.activeFiles,
        meta: 'Live matters currently in transfer',
        accent: 'from-[#eef6ff] via-[#f8fbff] to-[#ffffff]',
        iconWrap: 'bg-[#e8f1fb] text-[#4e6a84]',
        icon: FileCheck2,
      },
      {
        label: 'Lodged',
        value: metrics.lodged,
        meta: 'Files already lodged at deeds office',
        accent: 'from-[#eff7f2] via-[#f8fcf9] to-[#ffffff]',
        iconWrap: 'bg-[#e3f2e8] text-[#2d7a52]',
        icon: Landmark,
      },
      {
        label: 'Blocked',
        value: metrics.blocked,
        meta: 'Files needing intervention or follow-up',
        accent: 'from-[#fff6ef] via-[#fffaf6] to-[#ffffff]',
        iconWrap: 'bg-[#fde7d6] text-[#b76b16]',
        icon: ShieldAlert,
      },
    ],
    [filteredCards.length, metrics.activeDevelopments, metrics.activeFiles, metrics.blocked, metrics.lodged],
  )

  return (
    <section className="space-y-5">
      {error ? <p className="status-message error">{error}</p> : null}
      {loading ? (
        <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <p className="status-message">Loading developments...</p>
        </section>
      ) : null}

      {!loading ? (
        <>
          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {summaryItems.map((item) => {
              const Icon = item.icon
              return (
                <article
                  key={item.label}
                  className={`overflow-hidden rounded-[26px] border border-[#dbe5ef] bg-[linear-gradient(135deg,var(--tw-gradient-stops))] ${item.accent} p-5 shadow-[0_14px_32px_rgba(15,23,42,0.07)]`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <span className="block text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">
                        {item.label}
                      </span>
                      <strong className="mt-3 block text-[2.2rem] font-semibold leading-none tracking-[-0.05em] text-[#142132]">
                        {item.value}
                      </strong>
                    </div>
                    <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] ${item.iconWrap}`}>
                      <Icon size={22} />
                    </span>
                  </div>
                  <p className="mt-4 max-w-[20ch] text-sm leading-6 text-[#607387]">{item.meta}</p>
                </article>
              )
            })}
          </section>

          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 2xl:grid-cols-[minmax(0,1.45fr)_minmax(170px,0.7fr)_minmax(170px,0.7fr)_minmax(170px,0.7fr)]">
                <label className="grid min-w-0 gap-2">
                <span className="mb-2 block text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Search</span>
                <SearchInput
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={isBondRole ? 'Search development, location, or finance owner' : 'Search development, location, or matter owner'}
                  className="w-full"
                />
                </label>

                <label className="grid min-w-0 gap-2">
                  <span className="mb-2 block text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Status</span>
                  <Field as="select" value="active" disabled>
                    <option value="active">Active</option>
                  </Field>
                </label>

                <label className="grid min-w-0 gap-2">
                  <span className="mb-2 block text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">View</span>
                  <Field as="select" value="conveyancing" disabled>
                    <option value="conveyancing">Conveyancing</option>
                  </Field>
                </label>

                <label className="grid min-w-0 gap-2">
                  <span className="mb-2 block text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Sort</span>
                  <Field as="select" value="most_active" disabled>
                    <option value="most_active">Most Active</option>
                  </Field>
                </label>
              </div>

              <div className="flex justify-start xl:justify-end">
                <Button variant="ghost" onClick={loadData} disabled={loading}>
                  <RefreshCw size={16} />
                  Refresh
                </Button>
              </div>
            </div>
          </section>

          {filteredCards.length ? (
            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <SectionHeader actions={<span className="meta-chip">{filteredCards.length} developments</span>} className="developments-list-head" />

              <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
                {filteredCards.map((item) => (
                  <article
                    key={item.id}
                    className="group flex h-full flex-col rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)] transition duration-150 ease-out hover:-translate-y-0.5 hover:border-[#ccd6e3] hover:shadow-[0_16px_38px_rgba(15,23,42,0.09)]"
                    onClick={() => navigate(item.primaryCtaUrl, { state: { headerTitle: item.name } })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        navigate(item.primaryCtaUrl, { state: { headerTitle: item.name } })
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[#eef4fb] text-[#5f7a97]" aria-hidden="true">
                        <Building2 size={24} />
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="inline-flex items-center rounded-full bg-[#eef4fb] px-3 py-1 text-[0.76rem] font-semibold uppercase tracking-[0.1em] text-[#5f7a97]">
                          Active
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.76rem] font-semibold uppercase tracking-[0.1em] ${
                            item.attentionStatus === 'needs_attention'
                              ? 'bg-[#fff2df] text-[#b26b11]'
                              : item.attentionStatus === 'some_issues'
                                ? 'bg-[#f6f1e8] text-[#8b6b39]'
                                : 'bg-[#ebf7ef] text-[#21824c]'
                          }`}
                        >
                          <ShieldCheck size={14} />
                          {item.attentionLabel}
                        </span>
                      </div>
                    </div>

                    <div className="mt-5 flex-1">
                      <div>
                        <h4 className="text-[1.25rem] font-semibold tracking-[-0.03em] text-[#142132]">{item.name}</h4>
                        <p className="mt-2 flex items-center gap-2 text-sm text-[#6b7d93]">
                          <MapPin size={14} />
                          {item.location}
                        </p>
                      </div>

                      <div className="mt-5 space-y-2 text-sm leading-6 text-[#5f7085]">
                        <p>{item.attentionLines[0]}</p>
                        <p>Mandated team: {item.assignedAttorneyName}</p>
                        <p>{item.lastUpdatedLabel}</p>
                      </div>

                      <div className="mt-5 grid grid-cols-3 gap-3">
                        <article className="rounded-[18px] border border-[#e5ebf3] bg-[#f8fbff] px-3 py-3">
                          <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.11em] text-[#7b8ca2]">Live Files</span>
                          <strong className="mt-2 block text-lg font-semibold text-[#142132]">{item.activeTransactionsCount}</strong>
                        </article>
                        <article className="rounded-[18px] border border-[#e5ebf3] bg-[#f8fbff] px-3 py-3">
                          <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.11em] text-[#7b8ca2]">Registered</span>
                          <strong className="mt-2 block text-lg font-semibold text-[#142132]">{item.registeredTransactionsCount}</strong>
                        </article>
                        <article className="rounded-[18px] border border-[#e5ebf3] bg-[#f8fbff] px-3 py-3">
                          <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.11em] text-[#7b8ca2]">Portfolio</span>
                          <strong className="mt-2 block text-lg font-semibold text-[#142132]">{item.totalUnits}</strong>
                        </article>
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#edf2f7] pt-4">
                      <Button
                        variant="ghost"
                        onClick={(event) => {
                          event.stopPropagation()
                          navigate(item.primaryCtaUrl, { state: { headerTitle: item.name } })
                        }}
                      >
                        Overview
                      </Button>
                      <Button
                        variant="primary"
                        onClick={(event) => {
                          event.stopPropagation()
                          navigate(item.primaryCtaUrl, { state: { headerTitle: item.name } })
                        }}
                      >
                        Open Development
                        <ArrowRight size={15} />
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <section className="rounded-[24px] border border-[#dde4ee] bg-white px-6 py-8 text-center shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">No developments found</h3>
              <p className="mt-2 text-sm leading-6 text-[#6b7d93]">No conveyancing developments match the current search or file visibility.</p>
            </section>
          )}
        </>
      ) : null}
    </section>
  )
}

export default ConveyancerDevelopments
