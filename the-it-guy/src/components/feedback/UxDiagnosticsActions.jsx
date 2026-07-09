import { CheckCircle2, Clipboard, Send } from 'lucide-react'
import { useState } from 'react'
import {
  buildUxDiagnosticSnapshot,
  copyUxDiagnosticSnapshot,
  recordUxFrictionEvent,
  storeUxDiagnosticSnapshot,
} from '../../services/observability/uxDiagnostics'

function getStatusCopy(status = '', reference = '') {
  if (status === 'copied') return `Diagnostics copied. Reference ${reference}.`
  if (status === 'reported') return `Issue reported. Reference ${reference}.`
  if (status === 'copy_failed') return `Diagnostics prepared. Reference ${reference}.`
  if (status === 'report_failed') return `Report saved locally. Reference ${reference}.`
  return ''
}

export default function UxDiagnosticsActions({
  source = 'unknown',
  category = 'ux_friction',
  severity = 'medium',
  message = '',
  userId = '',
  workspaceId = '',
  userRole = '',
  workspaceType = '',
  metadata = {},
  compact = false,
}) {
  const [status, setStatus] = useState('')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState('')
  const statusCopy = getStatusCopy(status, reference)

  function buildSnapshot() {
    return buildUxDiagnosticSnapshot({
      source,
      category,
      severity,
      message,
      userRole,
      workspaceType,
      metadata,
    })
  }

  async function handleCopy() {
    const snapshot = storeUxDiagnosticSnapshot(buildSnapshot())
    setReference(snapshot.reference)
    setBusy('copy')
    try {
      const result = await copyUxDiagnosticSnapshot(snapshot)
      setStatus(result.copied ? 'copied' : 'copy_failed')
    } catch {
      setStatus('copy_failed')
    } finally {
      setBusy('')
    }
  }

  async function handleReport() {
    setBusy('report')
    try {
      const result = await recordUxFrictionEvent({
        source,
        category,
        severity,
        message,
        userId,
        workspaceId,
        userRole,
        workspaceType,
        metadata,
      })
      setReference(result.snapshot.reference)
      setStatus('reported')
    } catch {
      const snapshot = storeUxDiagnosticSnapshot(buildSnapshot())
      setReference(snapshot.reference)
      setStatus('report_failed')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className={compact ? 'mt-3' : 'mt-5'} data-ux-diagnostics-actions>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#d7e0ea] bg-white px-3 text-xs font-semibold text-[#10243a]"
          onClick={handleCopy}
          disabled={Boolean(busy)}
        >
          {status === 'copied' ? <CheckCircle2 className="h-4 w-4 text-[#1f7a5a]" /> : <Clipboard className="h-4 w-4 text-[#60758d]" />}
          {busy === 'copy' ? 'Copying...' : 'Copy diagnostics'}
        </button>
        <button
          type="button"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#d9eadf] bg-[#f5fbf7] px-3 text-xs font-semibold text-[#1f7a5a]"
          onClick={handleReport}
          disabled={Boolean(busy)}
        >
          {status === 'reported' ? <CheckCircle2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          {busy === 'report' ? 'Reporting...' : 'Report issue'}
        </button>
      </div>
      {statusCopy ? (
        <p className="mt-2 text-center text-xs font-semibold text-[#60758d]">{statusCopy}</p>
      ) : null}
    </div>
  )
}
