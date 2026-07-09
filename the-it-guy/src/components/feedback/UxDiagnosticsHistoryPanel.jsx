import { AlertTriangle, CheckCircle2, Clipboard, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  clearStoredUxDiagnosticSnapshots,
  copyUxDiagnosticBundle,
  copyUxDiagnosticSnapshot,
  getStoredUxDiagnosticSnapshots,
  removeStoredUxDiagnosticSnapshot,
  summarizeUxDiagnosticSnapshots,
  UX_DIAGNOSTICS_STORAGE_KEY,
} from '../../services/observability/uxDiagnostics'

function formatDiagnosticTime(value = '') {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'
  return date.toLocaleString()
}

function getSeverityClass(severity = '') {
  const normalized = String(severity || '').toLowerCase()
  if (normalized === 'critical' || normalized === 'error') return 'border-[#f2c8c4] bg-[#fff5f4] text-[#9f1c1c]'
  if (normalized === 'high' || normalized === 'warning') return 'border-[#f5d3a4] bg-[#fff8ec] text-[#8a4b10]'
  if (normalized === 'low' || normalized === 'info') return 'border-[#d7e7f7] bg-[#f5f9ff] text-[#27567a]'
  return 'border-[#d9eadf] bg-[#f5fbf7] text-[#1f7a5a]'
}

function getStatusCopy(status = '') {
  if (status === 'copied_latest') return 'Latest diagnostics copied.'
  if (status === 'copied_bundle') return 'Diagnostics bundle copied.'
  if (status === 'copy_failed') return 'Diagnostics are ready locally, but clipboard access failed.'
  if (status === 'removed') return 'Diagnostic entry removed.'
  if (status === 'cleared') return 'Diagnostic history cleared.'
  if (status === 'refreshed') return 'Diagnostic history refreshed.'
  return ''
}

export default function UxDiagnosticsHistoryPanel({
  title = 'Recent diagnostics',
  description = 'Issue packets saved on this device for support follow-up.',
  emptyMessage = 'No diagnostics saved on this device.',
  limit = 5,
  compact = false,
}) {
  const [snapshots, setSnapshots] = useState(() => getStoredUxDiagnosticSnapshots())
  const [busy, setBusy] = useState('')
  const [status, setStatus] = useState('')
  const summary = useMemo(() => summarizeUxDiagnosticSnapshots(snapshots), [snapshots])
  const rows = snapshots.slice(0, limit)
  const statusCopy = getStatusCopy(status)

  function refresh(statusKey = '') {
    setSnapshots(getStoredUxDiagnosticSnapshots())
    if (statusKey) setStatus(statusKey)
  }

  useEffect(() => {
    function handleStorage(event) {
      if (!event.key || event.key === UX_DIAGNOSTICS_STORAGE_KEY) {
        setSnapshots(getStoredUxDiagnosticSnapshots())
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  async function copyLatest() {
    const snapshot = snapshots[0]
    if (!snapshot) return
    setBusy('copy_latest')
    try {
      const result = await copyUxDiagnosticSnapshot(snapshot)
      setStatus(result.copied ? 'copied_latest' : 'copy_failed')
    } catch {
      setStatus('copy_failed')
    } finally {
      setBusy('')
    }
  }

  async function copyBundle() {
    if (!snapshots.length) return
    setBusy('copy_bundle')
    try {
      const result = await copyUxDiagnosticBundle(snapshots)
      setStatus(result.copied ? 'copied_bundle' : 'copy_failed')
    } catch {
      setStatus('copy_failed')
    } finally {
      setBusy('')
    }
  }

  function removeSnapshot(reference) {
    setSnapshots(removeStoredUxDiagnosticSnapshot(reference))
    setStatus('removed')
  }

  function clearHistory() {
    if (typeof window !== 'undefined' && !window.confirm('Clear diagnostics saved on this device?')) return
    setSnapshots(clearStoredUxDiagnosticSnapshots())
    setStatus('cleared')
  }

  return (
    <section className={`grid gap-4 ${compact ? '' : 'rounded-[14px] border border-[#dde4ee] bg-white p-4'}`} data-ux-diagnostics-history>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#31485e]">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-[#60758d]">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="header-secondary-cta inline-flex items-center gap-2" onClick={() => refresh('refreshed')}>
            <RefreshCw size={15} strokeWidth={1.8} />
            Refresh
          </button>
          <button type="button" className="header-secondary-cta inline-flex items-center gap-2" onClick={copyLatest} disabled={!snapshots.length || Boolean(busy)}>
            <Clipboard size={15} strokeWidth={1.8} />
            {busy === 'copy_latest' ? 'Copying...' : 'Copy latest'}
          </button>
          <button type="button" className="header-secondary-cta inline-flex items-center gap-2" onClick={copyBundle} disabled={!snapshots.length || Boolean(busy)}>
            <Clipboard size={15} strokeWidth={1.8} />
            {busy === 'copy_bundle' ? 'Copying...' : 'Copy all'}
          </button>
          <button type="button" className="header-secondary-cta inline-flex items-center gap-2" onClick={clearHistory} disabled={!snapshots.length || Boolean(busy)}>
            <Trash2 size={15} strokeWidth={1.8} />
            Clear
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-[12px] border border-[#dde4ee] bg-[#f9fbfe] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#60758d]">Saved</p>
          <strong className="mt-1 block text-2xl text-[#142132]">{summary.total}</strong>
        </div>
        <div className="rounded-[12px] border border-[#dde4ee] bg-[#f9fbfe] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#60758d]">Latest</p>
          <strong className="mt-1 block truncate text-sm text-[#142132]">{summary.latestReference || 'None'}</strong>
        </div>
        <div className={`rounded-[12px] border px-4 py-3 ${summary.hasCritical ? 'border-[#f2c8c4] bg-[#fff5f4]' : 'border-[#d9eadf] bg-[#f5fbf7]'}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#60758d]">Attention</p>
          <strong className={`mt-1 flex items-center gap-2 text-sm ${summary.hasCritical ? 'text-[#9f1c1c]' : 'text-[#1f7a5a]'}`}>
            {summary.hasCritical ? <AlertTriangle size={16} strokeWidth={1.8} /> : <CheckCircle2 size={16} strokeWidth={1.8} />}
            {summary.hasCritical ? 'Critical reports saved' : 'No critical reports'}
          </strong>
        </div>
      </div>

      {rows.length ? (
        <div className="overflow-hidden rounded-[14px] border border-[#dde4ee] bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[#f7f9fc] text-xs uppercase tracking-[0.08em] text-[#60758d]">
              <tr>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Saved</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1f6]">
              {rows.map((snapshot) => (
                <tr key={snapshot.reference}>
                  <td className="px-4 py-3 font-semibold text-[#142132]">{snapshot.reference}</td>
                  <td className="px-4 py-3 text-[#31485e]">{snapshot.source || 'unknown'}</td>
                  <td className="max-w-[260px] truncate px-4 py-3 text-[#60758d]">{snapshot.route || 'Not recorded'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${getSeverityClass(snapshot.severity)}`}>
                      {snapshot.severity || 'medium'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#60758d]">{formatDiagnosticTime(snapshot.timestamp)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="rounded-[10px] border border-[#d7e0ea] bg-white px-3 py-2 text-xs font-semibold text-[#10243a]" onClick={() => copyUxDiagnosticSnapshot(snapshot).then((result) => setStatus(result.copied ? 'copied_latest' : 'copy_failed')).catch(() => setStatus('copy_failed'))}>
                        Copy
                      </button>
                      <button type="button" className="rounded-[10px] border border-[#f2c8c4] bg-[#fff5f4] px-3 py-2 text-xs font-semibold text-[#9f1c1c]" onClick={() => removeSnapshot(snapshot.reference)}>
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-white px-4 py-8 text-center text-sm text-[#60758d]">
          {emptyMessage}
        </p>
      )}

      {statusCopy ? <p className="text-sm font-semibold text-[#60758d]">{statusCopy}</p> : null}
    </section>
  )
}
