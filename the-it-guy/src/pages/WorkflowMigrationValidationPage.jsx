import { useEffect, useMemo, useState } from 'react'
import {
  getTransactionWorkflowMigrationValidation,
  runTransactionWorkflowMigrationBackfill,
} from '../lib/api'
import { USE_WORKFLOW_ROLLUP_OVERVIEW } from '../core/transactions/transactionLifecycle'

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

function formatDateTime(value) {
  if (!value) return 'Never'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Never'
  return parsed.toLocaleString()
}

function formatExceptionCodes(codes = []) {
  if (!codes.length) return 'None'
  return codes.join(', ')
}

export default function WorkflowMigrationValidationPage() {
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState({ summary: null, rows: [] })
  const [transactionId, setTransactionId] = useState('')
  const [limit, setLimit] = useState(100)

  async function loadReport(nextOptions = {}) {
    try {
      setLoading(true)
      setError('')
      const nextReport = await getTransactionWorkflowMigrationValidation({
        limit,
        transactionId: transactionId.trim(),
        ...nextOptions,
      })
      setReport(nextReport)
    } catch (loadError) {
      setError(loadError?.message || 'Workflow migration validation failed.')
    } finally {
      setLoading(false)
    }
  }

  async function runMigration(options = {}) {
    try {
      setRunning(true)
      setError('')
      const result = await runTransactionWorkflowMigrationBackfill({
        limit,
        transactionId: transactionId.trim(),
        ...options,
      })
      setReport(result.report)
    } catch (runError) {
      setError(runError?.message || 'Workflow migration backfill failed.')
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadInitialReport() {
      try {
        setLoading(true)
        setError('')
        const nextReport = await getTransactionWorkflowMigrationValidation({
          limit: 100,
          transactionId: '',
        })
        if (!cancelled) {
          setReport(nextReport)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || 'Workflow migration validation failed.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadInitialReport()
    return () => {
      cancelled = true
    }
  }, [])

  const summary = useMemo(
    () =>
      report.summary || {
        totalTransactions: 0,
        matchingTransactions: 0,
        mismatchedTransactions: 0,
        errorTransactions: 0,
        expectedMappingDifferences: 0,
        missingEvidence: 0,
        missingWorkflowInstances: 0,
        missingWorkflowSteps: 0,
        rollupErrors: 0,
        mismatchCategories: { A: 0, B: 0, C: 0, D: 0 },
      },
    [report.summary],
  )

  return (
    <section className="page">
      <article className="panel card-tier-standard" style={{ display: 'grid', gap: '1.25rem' }}>
        <header className="grid gap-2 border-b border-[#e8eef5] pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#60758d]">Workflow Migration</p>
          <h1 className="text-[1.45rem] font-semibold text-[#142132]">Validation Dashboard</h1>
          <p className="max-w-3xl text-sm leading-6 text-[#60758d]">
            Backfill the canonical workflow model beside the legacy lifecycle, compare the resulting roll-up, and inspect mismatch categories before turning the workflow overview on for broader audiences.
          </p>
        </header>

        <div className="grid gap-3 rounded-[14px] border border-[#dde4ee] bg-[#f9fbfe] p-4 lg:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
          <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
            Transaction id
            <input
              className="auth-input"
              value={transactionId}
              onChange={(event) => setTransactionId(event.target.value)}
              placeholder="Leave blank for batch validation"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
            Batch limit
            <input
              className="auth-input"
              type="number"
              min="1"
              max="500"
              value={limit}
              onChange={(event) => setLimit(Math.max(1, Number(event.target.value) || 100))}
            />
          </label>
          <div className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
            Roll-up flag
            <div className="rounded-[12px] border border-[#dde4ee] bg-white px-3 py-2 text-sm font-medium text-[#31485e]">
              {USE_WORKFLOW_ROLLUP_OVERVIEW ? 'Enabled' : 'Disabled'}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <button type="button" className="header-secondary-cta" onClick={() => void loadReport()} disabled={loading || running}>
              {loading ? 'Refreshing...' : 'Refresh report'}
            </button>
            <button type="button" className="header-secondary-cta" onClick={() => void runMigration({ validateOnly: true })} disabled={loading || running}>
              {running ? 'Running...' : 'Validate current model'}
            </button>
            <button type="button" className="header-secondary-cta" onClick={() => void runMigration()} disabled={loading || running}>
              {running ? 'Backfilling...' : 'Run backfill'}
            </button>
          </div>
        </div>

        {error ? (
          <p className="rounded-[14px] border border-[#f2c8c4] bg-[#fff5f4] px-4 py-3 text-sm text-[#9f1c1c]">{error}</p>
        ) : null}

        <div className="grid gap-3 md:grid-cols-5">
          <StatCard label="Transactions" value={summary.totalTransactions || 0} />
          <StatCard label="Matching" value={summary.matchingTransactions || 0} tone="success" />
          <StatCard label="Mismatched" value={summary.mismatchedTransactions || 0} tone={summary.mismatchedTransactions ? 'warning' : 'success'} />
          <StatCard label="Errors" value={summary.rollupErrors || 0} tone={summary.rollupErrors ? 'critical' : 'success'} />
          <StatCard label="Expected diffs" value={summary.expectedMappingDifferences || 0} tone="neutral" />
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <StatCard label="Missing evidence" value={summary.missingEvidence || 0} tone={summary.missingEvidence ? 'warning' : 'success'} />
          <StatCard label="Missing instances" value={summary.missingWorkflowInstances || 0} tone={summary.missingWorkflowInstances ? 'warning' : 'success'} />
          <StatCard label="Missing steps" value={summary.missingWorkflowSteps || 0} tone={summary.missingWorkflowSteps ? 'warning' : 'success'} />
          <StatCard label="Category C/D" value={`${summary.mismatchCategories?.C || 0} / ${summary.mismatchCategories?.D || 0}`} tone={(summary.mismatchCategories?.C || 0) + (summary.mismatchCategories?.D || 0) ? 'critical' : 'success'} />
        </div>

        <div className="overflow-hidden rounded-[14px] border border-[#dde4ee] bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[#f7f9fc] text-xs uppercase tracking-[0.08em] text-[#60758d]">
              <tr>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Meaning</th>
                <th className="px-4 py-3">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1f6]">
              {[
                ['A', 'Expected stage naming difference'],
                ['B', 'Data issue or missing backfill state'],
                ['C', 'Workflow rule issue'],
                ['D', 'Legacy lifecycle issue'],
              ].map(([category, label]) => (
                <tr key={category}>
                  <td className="px-4 py-3 font-semibold">{category}</td>
                  <td className="px-4 py-3 text-[#31485e]">{label}</td>
                  <td className="px-4 py-3 text-[#60758d]">{summary.mismatchCategories?.[category] || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-[14px] border border-[#dde4ee] bg-white">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-[#f7f9fc] text-xs uppercase tracking-[0.08em] text-[#60758d]">
              <tr>
                <th className="px-4 py-3">Transaction</th>
                <th className="px-4 py-3">Legacy</th>
                <th className="px-4 py-3">Roll-up</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Exceptions</th>
                <th className="px-4 py-3">Compared</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1f6]">
              {(report.rows || []).length ? (
                report.rows.map((row) => (
                  <tr key={row.id || row.transactionId}>
                    <td className="px-4 py-3 font-semibold text-[#142132]">{row.transactionId}</td>
                    <td className="px-4 py-3 text-[#60758d]">
                      <div>{row.legacyStage || 'Unknown'}</div>
                      <div>{row.legacyParentStage || 'SETUP'}</div>
                    </td>
                    <td className="px-4 py-3 text-[#60758d]">
                      <div>{row.rollupStage || 'Unknown'}</div>
                      <div>{row.rollupStatus || 'not_started'}</div>
                    </td>
                    <td className="px-4 py-3">{row.comparisonStatus}</td>
                    <td className="px-4 py-3">{row.mismatchCategory || 'OK'}</td>
                    <td className="px-4 py-3 text-[#60758d]">{row.mismatchReason || 'No differences detected.'}</td>
                    <td className="px-4 py-3 text-[#60758d]">{formatExceptionCodes(row.exceptionCodes || [])}</td>
                    <td className="px-4 py-3 text-[#60758d]">{formatDateTime(row.comparedAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-6 text-sm text-[#60758d]" colSpan={8}>
                    No validation report has been generated yet. Run a validation or backfill pass to populate this dashboard.
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
