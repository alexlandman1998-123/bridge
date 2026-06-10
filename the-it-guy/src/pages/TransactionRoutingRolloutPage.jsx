import { useEffect, useMemo, useState } from 'react'
import { Play, RefreshCcw, ShieldCheck } from 'lucide-react'
import { runTransactionRoutingProfileBackfill } from '../lib/api'

function StatCard({ label, value, tone = 'neutral' }) {
  const toneClass =
    tone === 'critical'
      ? 'border-[#f2c8c4] bg-[#fff5f4] text-[#9f1c1c]'
      : tone === 'warning'
        ? 'border-[#f5d3a4] bg-[#fff8ec] text-[#8a4b10]'
        : tone === 'success'
          ? 'border-[#cfe8d8] bg-[#effaf3] text-[#236340]'
          : 'border-[#dbe4ee] bg-white text-[#31485e]'
  return (
    <article className={`rounded-[14px] border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] opacity-75">{label}</p>
      <strong className="mt-1 block text-2xl">{value}</strong>
    </article>
  )
}

function parseTransactionIds(value = '') {
  return String(value || '')
    .split(/[\n,]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatReasonCode(value = '') {
  return String(value || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function formatDateTime(value) {
  if (!value) return 'Not generated'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not generated'
  return parsed.toLocaleString()
}

function firstPayloadDecision(payload = {}) {
  const parts = [
    payload.finance_type,
    payload.transaction_type,
    payload.property_tenure,
    payload.vat_treatment,
  ].filter(Boolean)
  return parts.length ? parts.join(' / ') : 'Pending facts'
}

export default function TransactionRoutingRolloutPage() {
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState(null)
  const [organisationId, setOrganisationId] = useState('')
  const [transactionIds, setTransactionIds] = useState('')
  const [limit, setLimit] = useState(200)
  const [includeNeedsFacts, setIncludeNeedsFacts] = useState(false)
  const [lastMode, setLastMode] = useState('dry_run')

  const parsedTransactionIds = useMemo(() => parseTransactionIds(transactionIds), [transactionIds])
  const summary = plan?.summary || {}
  const reasonCounts = summary.reasonCounts || {}
  const operations = Array.isArray(plan?.operations) ? plan.operations : []
  const auditItems = Array.isArray(plan?.auditItems) ? plan.auditItems : []
  const applied = Array.isArray(plan?.applied) ? plan.applied : []
  const skipped = Array.isArray(plan?.skipped) ? plan.skipped : []

  async function runRollout({ dryRun = true } = {}) {
    try {
      if (!dryRun) {
        const confirmed = window.confirm(`Apply ${operations.length || 'the planned'} transaction routing profile updates?`)
        if (!confirmed) return
      }
      if (dryRun) setLoading(true)
      if (!dryRun) setApplying(true)
      setError('')
      const nextPlan = await runTransactionRoutingProfileBackfill({
        organisationId: organisationId.trim(),
        transactionIds: parsedTransactionIds,
        limit,
        includeNeedsFacts,
        dryRun,
      })
      setPlan(nextPlan)
      setLastMode(dryRun ? 'dry_run' : 'applied')
    } catch (rolloutError) {
      setError(rolloutError?.message || 'Transaction routing rollout failed.')
    } finally {
      setLoading(false)
      setApplying(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadInitialDryRun() {
      try {
        setLoading(true)
        setError('')
        const nextPlan = await runTransactionRoutingProfileBackfill({ dryRun: true, limit: 200 })
        if (!cancelled) {
          setPlan(nextPlan)
          setLastMode('dry_run')
        }
      } catch (initialError) {
        if (!cancelled) setError(initialError?.message || 'Transaction routing rollout failed.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadInitialDryRun()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="page">
      <article className="panel card-tier-standard" style={{ display: 'grid', gap: '1.25rem' }}>
        <header className="grid gap-2 border-b border-[#e8eef5] pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#60758d]">Transaction Routing</p>
          <h1 className="text-[1.45rem] font-semibold text-[#142132]">Rollout Console</h1>
          <p className="max-w-3xl text-sm leading-6 text-[#60758d]">
            Audit transaction routing profiles, preview the backfill plan, and apply the generated routing profile only after the dry-run is reviewed.
          </p>
        </header>

        <div className="grid gap-3 rounded-[14px] border border-[#dde4ee] bg-[#f9fbfe] p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_180px_auto]">
          <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
            Organisation id
            <input
              className="auth-input"
              value={organisationId}
              onChange={(event) => setOrganisationId(event.target.value)}
              placeholder="Leave blank for all visible transactions"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
            Transaction ids
            <textarea
              className="auth-input min-h-[42px]"
              value={transactionIds}
              onChange={(event) => setTransactionIds(event.target.value)}
              placeholder="Comma or line separated ids"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
            Batch limit
            <input
              className="auth-input"
              type="number"
              min="1"
              max="1000"
              value={limit}
              onChange={(event) => setLimit(Math.max(1, Math.min(Number(event.target.value) || 200, 1000)))}
            />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm font-semibold text-[#31485e]">
            <input
              type="checkbox"
              checked={includeNeedsFacts}
              onChange={(event) => setIncludeNeedsFacts(event.target.checked)}
            />
            Include fact gaps
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <button type="button" className="header-secondary-cta inline-flex items-center gap-2" onClick={() => void runRollout({ dryRun: true })} disabled={loading || applying}>
              <RefreshCcw size={16} />
              {loading ? 'Refreshing...' : 'Dry-run'}
            </button>
            <button type="button" className="header-primary-cta inline-flex items-center gap-2" onClick={() => void runRollout({ dryRun: false })} disabled={loading || applying || !operations.length}>
              <Play size={16} />
              {applying ? 'Applying...' : 'Apply plan'}
            </button>
          </div>
        </div>

        {error ? <p className="rounded-[12px] border border-[#f2c8c4] bg-[#fff5f4] px-3 py-2 text-sm text-[#9f1c1c]">{error}</p> : null}

        <div className="grid gap-3 md:grid-cols-5">
          <StatCard label="Checked" value={summary.total || 0} />
          <StatCard label="Ready" value={summary.ready || 0} tone="success" />
          <StatCard label="Backfill" value={summary.needs_backfill || 0} tone={summary.needs_backfill ? 'warning' : 'success'} />
          <StatCard label="Need facts" value={summary.needs_facts || 0} tone={summary.needs_facts ? 'critical' : 'success'} />
          <StatCard label="Planned" value={summary.plannedUpdates || 0} tone={summary.plannedUpdates ? 'warning' : 'success'} />
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <StatCard label="Applied" value={summary.appliedUpdates ?? applied.length} tone={applied.length ? 'success' : 'neutral'} />
          <StatCard label="Skipped" value={summary.skippedUpdates ?? skipped.length} tone={skipped.length && lastMode !== 'dry_run' ? 'warning' : 'neutral'} />
          <StatCard label="Destructive ops" value={summary.destructiveOperations || 0} tone={summary.destructiveOperations ? 'critical' : 'success'} />
          <StatCard label="Generated" value={formatDateTime(plan?.generatedAt)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
          <div className="overflow-hidden rounded-[14px] border border-[#dde4ee] bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f7f9fc] text-xs uppercase tracking-[0.08em] text-[#60758d]">
                <tr>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1f6]">
                {Object.keys(reasonCounts).length ? (
                  Object.entries(reasonCounts).map(([reason, count]) => (
                    <tr key={reason}>
                      <td className="px-4 py-3 font-semibold text-[#142132]">{formatReasonCode(reason)}</td>
                      <td className="px-4 py-3 text-[#60758d]">{count}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-5 text-sm text-[#60758d]" colSpan={2}>No routing issues found in this pass.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-[14px] border border-[#dde4ee] bg-[#f9fbfe] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">Rollout guardrails</h2>
                <p className="mt-2 text-sm leading-6 text-[#60758d]">
                  The API defaults to dry-run, reports zero destructive operations, and emits audit/workflow events only when a plan is applied.
                </p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-[999px] border border-[#cfe8d8] bg-[#effaf3] px-3 py-1 text-xs font-semibold text-[#236340]">
                <ShieldCheck size={14} />
                {lastMode === 'applied' ? 'Apply completed' : 'Dry-run active'}
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <StatCard label="Backfillable" value={summary.backfillable || 0} tone={summary.backfillable ? 'warning' : 'success'} />
              <StatCard label="Profiles found" value={summary.withPersistedProfile || 0} />
              <StatCard label="Scoped ids" value={parsedTransactionIds.length || 'Batch'} />
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-[14px] border border-[#dde4ee] bg-white">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="bg-[#f7f9fc] text-xs uppercase tracking-[0.08em] text-[#60758d]">
              <tr>
                <th className="px-4 py-3">Transaction</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Reasons</th>
                <th className="px-4 py-3">Missing facts</th>
                <th className="px-4 py-3">Resolved route</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1f6]">
              {auditItems.length ? (
                auditItems.slice(0, 80).map((item) => (
                  <tr key={item.transactionId || `${item.status}-${item.reasonCodes?.join('-')}`}>
                    <td className="px-4 py-3 font-semibold text-[#142132]">{item.transactionId || 'Unknown'}</td>
                    <td className="px-4 py-3 capitalize text-[#31485e]">{String(item.status || 'unknown').replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-[#60758d]">{(item.reasonCodes || []).map(formatReasonCode).join(', ') || 'None'}</td>
                    <td className="px-4 py-3 text-[#60758d]">{(item.missingFields || []).join(', ') || 'None'}</td>
                    <td className="px-4 py-3 text-[#60758d]">{firstPayloadDecision(item.updatePayload)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-6 text-sm text-[#60758d]" colSpan={5}>
                    Run a dry-run to populate the routing audit.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )
}
