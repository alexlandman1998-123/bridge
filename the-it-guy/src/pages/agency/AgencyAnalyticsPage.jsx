import { ArrowRightLeft, Banknote, Building2, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import SummaryCards from '../../components/SummaryCards'
import { getBranches } from '../../services/agencyBranchService'

const PANEL_CLASS =
  'rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]'

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R 0'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatPercent(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) return '0%'
  return `${Math.round(amount)}%`
}

export default function AgencyAnalyticsPage() {
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadBranches = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await getBranches()
      setBranches(Array.isArray(rows) ? rows : [])
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load agency analytics right now.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBranches()
  }, [loadBranches])

  const totals = useMemo(() => {
    return branches.reduce(
      (accumulator, branch) => {
        accumulator.branches += 1
        accumulator.activeAgents += Number(branch?.kpis?.activeAgents || 0)
        accumulator.activeListings += Number(branch?.kpis?.activeListings || 0)
        accumulator.activeTransactions += Number(branch?.kpis?.activeTransactions || 0)
        accumulator.pipelineValue += Number(branch?.kpis?.pipelineValue || 0)
        accumulator.registeredDeals += Number(branch?.kpis?.registeredDeals || 0)
        accumulator.conversionPool += Number(branch?.kpis?.conversionRate || 0)
        return accumulator
      },
      {
        branches: 0,
        activeAgents: 0,
        activeListings: 0,
        activeTransactions: 0,
        pipelineValue: 0,
        registeredDeals: 0,
        conversionPool: 0,
      },
    )
  }, [branches])

  const averageConversion = totals.branches ? totals.conversionPool / totals.branches : 0
  const branchRows = useMemo(
    () =>
      [...branches].sort(
        (left, right) =>
          Number(right?.kpis?.pipelineValue || 0) - Number(left?.kpis?.pipelineValue || 0),
      ),
    [branches],
  )

  const summaryItems = useMemo(
    () => [
      { label: 'Active Branches', value: totals.branches, icon: Building2 },
      { label: 'Active Agents', value: totals.activeAgents, icon: Users },
      { label: 'Active Transactions', value: totals.activeTransactions, icon: ArrowRightLeft },
      { label: 'Pipeline Value', value: formatCurrency(totals.pipelineValue), icon: Banknote },
    ],
    [totals.activeAgents, totals.activeTransactions, totals.branches, totals.pipelineValue],
  )

  return (
    <section className="flex flex-col gap-6">
      <header className={PANEL_CLASS}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h1 className="text-[1.35rem] font-semibold tracking-[-0.03em] text-[#142132]">
              Agency Analytics
            </h1>
            <p className="mt-1 text-[0.92rem] text-[#6b7d93]">
              Cross-branch performance for principals across listings, transactions, and conversion health.
            </p>
          </div>
          <Link
            to="/dashboard"
            className="inline-flex h-[42px] items-center justify-center rounded-[14px] border border-[#dce6f2] bg-white px-4 text-sm font-semibold text-[#35546c] shadow-[0_8px_20px_rgba(15,23,42,0.05)]"
          >
            Back to Dashboard
          </Link>
        </div>
      </header>

      {error ? (
        <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="rounded-[16px] border border-[#dde4ee] bg-white px-5 py-4 text-sm text-[#6b7d93]">
          Loading agency analytics...
        </p>
      ) : null}

      {!loading ? (
        <>
          <section className={PANEL_CLASS}>
            <SummaryCards items={summaryItems} />
          </section>

          <section className={`grid gap-4 xl:grid-cols-3`}>
            <article className={PANEL_CLASS}>
              <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">
                Listings Performance
              </p>
              <p className="mt-2 text-[2rem] font-semibold leading-none tracking-[-0.04em] text-[#102236] tabular-nums">
                {totals.activeListings}
              </p>
              <p className="mt-2 text-[0.84rem] text-[#5f738a]">Active listings across all accessible branches.</p>
            </article>

            <article className={PANEL_CLASS}>
              <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">
                Registered Deals
              </p>
              <p className="mt-2 text-[2rem] font-semibold leading-none tracking-[-0.04em] text-[#102236] tabular-nums">
                {totals.registeredDeals}
              </p>
              <p className="mt-2 text-[0.84rem] text-[#5f738a]">Completed transactions captured from branch pipelines.</p>
            </article>

            <article className={PANEL_CLASS}>
              <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">
                Avg Branch Conversion
              </p>
              <p className="mt-2 text-[2rem] font-semibold leading-none tracking-[-0.04em] text-[#102236] tabular-nums">
                {formatPercent(averageConversion)}
              </p>
              <p className="mt-2 text-[0.84rem] text-[#5f738a]">Average of branch-level conversion rates.</p>
            </article>
          </section>

          <section className={PANEL_CLASS}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-[1.02rem] font-semibold tracking-[-0.02em] text-[#142132]">
                Branch Performance Snapshot
              </h2>
              <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]">
                {branchRows.length} branches
              </span>
            </div>

            {branchRows.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-[880px] w-full text-left">
                  <thead>
                    <tr className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">
                      <th className="px-3 py-2">Branch</th>
                      <th className="px-3 py-2">Location</th>
                      <th className="px-3 py-2">Agents</th>
                      <th className="px-3 py-2">Listings</th>
                      <th className="px-3 py-2">Transactions</th>
                      <th className="px-3 py-2">Pipeline</th>
                      <th className="px-3 py-2">Conversion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchRows.map((branch) => (
                      <tr key={branch.id} className="border-t border-[#e6edf6] text-[0.85rem] text-[#24384d]">
                        <td className="px-3 py-2.5 font-semibold text-[#142132]">{branch.name}</td>
                        <td className="px-3 py-2.5 text-[#5f738a]">{branch.location || 'Location pending'}</td>
                        <td className="px-3 py-2.5">{Number(branch?.kpis?.activeAgents || 0)}</td>
                        <td className="px-3 py-2.5">{Number(branch?.kpis?.activeListings || 0)}</td>
                        <td className="px-3 py-2.5">{Number(branch?.kpis?.activeTransactions || 0)}</td>
                        <td className="px-3 py-2.5">{formatCurrency(branch?.kpis?.pipelineValue || 0)}</td>
                        <td className="px-3 py-2.5">{formatPercent(branch?.kpis?.conversionRate || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-[14px] border border-dashed border-[#d3ddea] bg-[#fbfdff] px-4 py-8 text-center">
                <p className="text-[0.9rem] font-medium text-[#33475d]">No branch analytics yet.</p>
                <p className="mt-1 text-[0.82rem] text-[#6f8298]">
                  Create branch data and activity to populate agency analytics.
                </p>
              </div>
            )}
          </section>
        </>
      ) : null}
    </section>
  )
}
