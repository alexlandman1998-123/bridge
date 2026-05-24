import { useEffect, useMemo, useState } from 'react'
import { useAuthSession } from '../context/AuthSessionContext'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  runIntegrityChecks,
  validateTransactionStateById,
  validateUserState,
  validateWorkspaceStateById,
} from '../services/validation/validationEngine'

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

function IssueList({ issues = [] }) {
  if (!issues.length) {
    return <p className="rounded-[14px] border border-[#cfe8d8] bg-[#effaf3] px-4 py-3 text-sm text-[#236340]">No integrity issues detected in this check.</p>
  }
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#dde4ee] bg-white">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-[#f7f9fc] text-xs uppercase tracking-[0.08em] text-[#60758d]">
          <tr>
            <th className="px-4 py-3">Severity</th>
            <th className="px-4 py-3">Issue</th>
            <th className="px-4 py-3">Entity</th>
            <th className="px-4 py-3">Message</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf1f6]">
          {issues.map((issue, index) => (
            <tr key={`${issue.code}-${issue.entityId}-${index}`}>
              <td className="px-4 py-3 font-semibold capitalize">{issue.severity}</td>
              <td className="px-4 py-3">{String(issue.code || '').replace(/_/g, ' ')}</td>
              <td className="px-4 py-3">{issue.entityType || 'system'} {issue.entityId ? `· ${issue.entityId}` : ''}</td>
              <td className="px-4 py-3 text-[#60758d]">{issue.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function PlatformDiagnosticsPage() {
  const { authState } = useAuthSession()
  const { currentWorkspace } = useWorkspace()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [entityType, setEntityType] = useState('user')
  const [entityId, setEntityId] = useState(authState.user?.id || '')
  const [error, setError] = useState('')

  useEffect(() => {
    if (entityType === 'user') setEntityId(authState.user?.id || '')
    if (entityType === 'workspace') setEntityId(currentWorkspace?.id || '')
  }, [authState.user?.id, currentWorkspace?.id, entityType])

  const summary = useMemo(() => result?.summary || result || {}, [result])
  const issues = result?.issues || []

  async function runSelectedCheck() {
    try {
      setLoading(true)
      setError('')
      const safeId = String(entityId || '').trim()
      if (entityType !== 'system' && !safeId) throw new Error('Enter an entity id before running diagnostics.')
      const next =
        entityType === 'system'
          ? await runIntegrityChecks({ createdBy: authState.user?.id || null })
          : entityType === 'workspace'
            ? await validateWorkspaceStateById(safeId)
            : entityType === 'transaction'
              ? await validateTransactionStateById(safeId)
              : await validateUserState(safeId)
      setResult(next)
    } catch (diagnosticError) {
      setError(diagnosticError?.message || 'Diagnostics failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="page">
      <article className="panel card-tier-standard" style={{ display: 'grid', gap: '1.25rem' }}>
        <header className="grid gap-2 border-b border-[#e8eef5] pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#60758d]">Platform Admin</p>
          <h1 className="text-[1.45rem] font-semibold text-[#142132]">Diagnostics & Integrity</h1>
          <p className="max-w-3xl text-sm leading-6 text-[#60758d]">
            Validate users, workspaces, transactions, onboarding state, memberships, and orphaned records without silently repairing production data.
          </p>
        </header>

        <div className="grid gap-3 rounded-[14px] border border-[#dde4ee] bg-[#f9fbfe] p-4 lg:grid-cols-[180px_minmax(0,1fr)_auto]">
          <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
            Check type
            <select className="auth-input" value={entityType} onChange={(event) => setEntityType(event.target.value)}>
              <option value="user">User</option>
              <option value="workspace">Workspace</option>
              <option value="transaction">Transaction</option>
              <option value="system">System</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
            Entity id
            <input className="auth-input" value={entityId} disabled={entityType === 'system'} onChange={(event) => setEntityId(event.target.value)} />
          </label>
          <div className="flex items-end">
            <button type="button" className="header-primary-cta w-full" onClick={runSelectedCheck} disabled={loading}>
              {loading ? 'Checking...' : 'Run check'}
            </button>
          </div>
        </div>

        {error ? <p className="rounded-[12px] border border-[#f2c8c4] bg-[#fff5f4] px-3 py-2 text-sm text-[#9f1c1c]">{error}</p> : null}

        {result ? (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <StatCard label="Status" value={summary.status || 'unknown'} tone={summary.status === 'valid' || result.status === 'valid' ? 'success' : summary.status === 'invalid' ? 'critical' : 'warning'} />
              <StatCard label="Issues" value={summary.issueCount ?? result.issueCount ?? issues.length} />
              <StatCard label="Critical" value={summary.criticalCount ?? result.criticalCount ?? 0} tone={(summary.criticalCount || result.criticalCount) ? 'critical' : 'success'} />
              <StatCard label="Repairs" value={result.repairActions?.length || result.repair?.actions?.length || 0} tone="warning" />
            </div>
            <IssueList issues={issues} />
          </>
        ) : (
          <p className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-white px-4 py-8 text-center text-sm text-[#60758d]">
            Run a diagnostic check to see validation results and repair recommendations.
          </p>
        )}
      </article>
    </section>
  )
}
