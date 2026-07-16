import { AlertTriangle, Check, History, Loader2, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'

const STATUS_COPY = Object.freeze({
  healthy: {
    title: 'Recovery ready',
    detail: 'A verified previous live OTP is retained for controlled restoration.',
    classes: 'border-[#c9e4d3] bg-[#f3faf5] text-[#206f47]',
  },
  degraded: {
    title: 'Recovery needs attention',
    detail: 'The retained version failed one or more recovery checks.',
    classes: 'border-[#ead8b5] bg-[#fffaf0] text-[#805d1e]',
  },
  critical: {
    title: 'Live route needs attention',
    detail: 'The live OTP or its recovery route is not currently safe.',
    classes: 'border-[#edc9c2] bg-[#fff6f4] text-[#923f31]',
  },
  not_governed: {
    title: 'Recovery not available yet',
    detail: 'A recovery version appears after the first governed publication.',
    classes: 'border-[#dce5ed] bg-[#f8fafc] text-[#52677e]',
  },
  not_available: {
    title: 'Recovery checks unavailable',
    detail: 'Open Advanced to inspect the live-version route.',
    classes: 'border-[#dce5ed] bg-[#f8fafc] text-[#52677e]',
  },
})

export function RecoveryStatusCard({ recovery, permission, dirty, onRestore }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState({ type: '', message: '' })
  const status = STATUS_COPY[recovery?.status] || STATUS_COPY.not_available
  const reasonReady = reason.trim().length >= 12

  useEffect(() => {
    if (!dialogOpen || busy) return undefined
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return
      setDialogOpen(false)
      setReason('')
      setFeedback({ type: '', message: '' })
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [busy, dialogOpen])

  if (!recovery) return null

  const closeDialog = () => {
    if (busy) return
    setDialogOpen(false)
    setReason('')
    setFeedback({ type: '', message: '' })
  }

  const restore = async (event) => {
    event.preventDefault()
    if (!reasonReady || busy) return
    try {
      setBusy(true)
      setFeedback({ type: '', message: '' })
      await onRestore(reason.trim())
      setDialogOpen(false)
      setReason('')
      setFeedback({ type: 'success', message: 'The previous OTP version is live again. Existing documents were not changed.' })
    } catch (error) {
      setFeedback({ type: 'error', message: error?.message || 'Unable to restore the previous live OTP.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section className="rounded-[16px] border border-[#dce5ed] bg-white p-4" aria-labelledby="recovery-status-title">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d8e3ea] bg-[#f8fafc] text-[#60758a]">
            <History className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7a8ca0]">Live version safety</p>
            <h2 id="recovery-status-title" className="mt-1 text-sm font-semibold text-[#253b51]">{status.title}</h2>
            <p className="mt-1 text-xs leading-5 text-[#718397]">{status.detail}</p>
          </div>
          {recovery.healthy ? <ShieldCheck className="h-5 w-5 shrink-0 text-[#23804d]" aria-hidden="true" /> : <AlertTriangle className="h-5 w-5 shrink-0 text-[#a27325]" aria-hidden="true" />}
        </div>

        <div className={`mt-4 rounded-[10px] border px-3 py-2.5 text-xs ${status.classes}`}>
          <strong className="block font-semibold">{recovery.restoreVersionLabel || 'Previous live OTP version'}</strong>
          <span className="mt-0.5 block opacity-80">{recovery.canRestore ? 'Verified restoration target' : recovery.blockers?.[0] || 'No verified restoration target'}</span>
        </div>

        {recovery.checks?.length ? (
          <ul className="mt-3 space-y-1.5" aria-label="Recovery checks">
            {recovery.checks.map((check) => (
              <li key={check.key} className="flex items-start gap-2 text-[11px] leading-5 text-[#62768a]">
                {check.passed
                  ? <Check className="mt-1 h-3 w-3 shrink-0 text-[#16804d]" aria-hidden="true" />
                  : <AlertTriangle className="mt-1 h-3 w-3 shrink-0 text-[#a27325]" aria-hidden="true" />}
                <span>{check.label}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {permission?.allowed && recovery.canRestore ? (
          <button
            type="button"
            disabled={dirty}
            onClick={() => {
              setFeedback({ type: '', message: '' })
              setDialogOpen(true)
            }}
            className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-[#d8b5ad] bg-[#fff8f6] px-4 text-sm font-semibold text-[#93483a] transition hover:border-[#c48f84] hover:bg-[#fff3f0] disabled:cursor-not-allowed disabled:border-[#dce4df] disabled:bg-[#f4f7f5] disabled:text-[#829087]"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Restore previous version
          </button>
        ) : null}

        {dirty && permission?.allowed && recovery.canRestore ? <p className="mt-2 text-[11px] leading-5 text-[#806638]">Save or discard draft changes before using recovery.</p> : null}
        {!permission?.allowed ? <p className="mt-3 text-[11px] leading-5 text-[#718397]">{permission?.reason}</p> : null}
        {feedback.message ? <p className={`mt-3 text-[11px] leading-5 ${feedback.type === 'error' ? 'text-[#923f31]' : 'text-[#237047]'}`} role={feedback.type === 'error' ? 'alert' : 'status'}>{feedback.message}</p> : null}
      </section>

      {dialogOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#102033]/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog() }}>
          <section className="w-full max-w-lg rounded-[20px] border border-[#e3d1cc] bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.25)]" role="dialog" aria-modal="true" aria-labelledby="restore-otp-title">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a14b42]">Emergency recovery</p>
                <h2 id="restore-otp-title" className="mt-2 text-xl font-semibold text-[#102033]">Restore the previous live OTP?</h2>
              </div>
              <button type="button" onClick={closeDialog} disabled={busy} aria-label="Close recovery confirmation" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#dce5ed] text-[#65788c] hover:bg-[#f7f9fb] disabled:opacity-50">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-[#65788c]">New OTPs will use <strong className="text-[#33485e]">{recovery.restoreVersionLabel}</strong>. Existing generated and signed documents remain unchanged.</p>

            <form className="mt-5" onSubmit={restore}>
              <label htmlFor="restore-otp-reason" className="block text-sm font-semibold text-[#33485e]">Operational reason</label>
              <textarea
                id="restore-otp-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                autoFocus
                placeholder="Explain why the current live version must be restored…"
                className="mt-2 w-full resize-none rounded-[11px] border border-[#cfdce6] px-3 py-2.5 text-sm leading-6 text-[#263b50] outline-none focus:border-[#a86254] focus:ring-2 focus:ring-[#a86254]/15"
              />
              <p className="mt-1 text-[11px] text-[#7a8ca0]">At least 12 characters. This reason is retained in the recovery audit.</p>
              {feedback.type === 'error' ? <p className="mt-3 rounded-[9px] bg-[#fff4f1] px-3 py-2 text-xs leading-5 text-[#923f31]" role="alert">{feedback.message}</p> : null}
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={closeDialog} disabled={busy} className="inline-flex min-h-10 items-center justify-center rounded-[10px] border border-[#d4dfe7] bg-white px-4 text-sm font-semibold text-[#52677e] disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={!reasonReady || busy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] bg-[#a14b42] px-4 text-sm font-semibold text-white transition hover:bg-[#8e3f37] disabled:cursor-not-allowed disabled:bg-[#d5c6c3]">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
                  {busy ? 'Restoring…' : 'Confirm restoration'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  )
}
