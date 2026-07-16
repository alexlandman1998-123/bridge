import { CheckCircle2, Clock3, FileCheck2, Loader2, ShieldAlert, TriangleAlert } from 'lucide-react'

const GATE_PRESENTATION = Object.freeze({
  pass: { label: 'Follow-up resolved', classes: 'border-[#b9e1c8] bg-[#eef9f2] text-[#187442]', Icon: CheckCircle2 },
  warning: { label: 'Follow-up still open', classes: 'border-[#efd8aa] bg-[#fff9eb] text-[#91610f]', Icon: TriangleAlert },
  fail: { label: 'Missing or overdue', classes: 'border-[#ecc7c2] bg-[#fff4f3] text-[#9b3127]', Icon: ShieldAlert },
  incomplete: { label: 'Check incomplete', classes: 'border-[#ecc7c2] bg-[#fff4f3] text-[#9b3127]', Icon: ShieldAlert },
})

const STATE_LABELS = Object.freeze({
  notification_missing: 'Notification missing',
  awaiting_acknowledgement: 'Awaiting acknowledgement',
  overdue_unread: 'Overdue unread',
  acknowledged_unresolved: 'Acknowledged, unresolved',
  unroutable: 'Unroutable',
  resolved_after_notification: 'Resolved after notification',
})

function shortId(value = '') {
  const normalized = String(value || '').trim()
  return normalized ? normalized.slice(0, 8) : ''
}

function formatDateTime(value = '') {
  if (!value) return 'No notification recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Notification time unavailable'
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function FollowUpResolutionPanel({ assurance, resolution, onCheck }) {
  if (!assurance?.auditRun) return null
  const report = resolution?.report
  const presentation = report
    ? GATE_PRESENTATION[report.gate?.status] || GATE_PRESENTATION.incomplete
    : null
  const GateIcon = presentation?.Icon || FileCheck2

  const checkResolution = () => {
    void onCheck().catch(() => {})
  }

  return (
    <section className="rounded-[18px] border border-[#dbe5ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]" aria-labelledby="follow-up-resolution-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border ${presentation?.classes || 'border-[#d4e1ea] bg-[#f1f7fc] text-[#45677f]'}`}>
            <GateIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#7c8ea2]">Closed-loop resolution</p>
              {presentation ? <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${presentation.classes}`}>{presentation.label}</span> : null}
            </div>
            <h2 id="follow-up-resolution-title" className="mt-1 text-lg font-semibold text-[#142033]">Did the underlying OTP findings get resolved?</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[#687b90]">Reading a notification is acknowledgement only. A finding closes only when its exact evidence disappears from a fresh operational audit.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={checkResolution}
          disabled={!resolution?.permission?.allowed || resolution?.checking}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-[#b9d2e1] bg-[#f5f9fc] px-4 text-sm font-semibold text-[#48677f] transition hover:border-[#85abc1] hover:bg-[#edf5fa] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {resolution?.checking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileCheck2 className="h-4 w-4" aria-hidden="true" />}
          {resolution?.checking ? 'Checking fresh evidence…' : report ? 'Check status again' : 'Check follow-up status'}
        </button>
      </div>

      {!resolution?.permission?.allowed ? <p className="mt-4 text-xs leading-5 text-[#718397]">{resolution?.permission?.reason}</p> : null}
      {resolution?.error ? <p className="mt-4 rounded-[10px] border border-[#edc9c2] bg-[#fff6f4] px-3 py-2 text-xs leading-5 text-[#923f31]" role="alert">{resolution.error}</p> : null}

      {report ? (
        <div className="mt-5" aria-live="polite">
          <p className={`rounded-[11px] border px-3 py-2 text-sm leading-6 ${presentation.classes}`}>{report.gate?.reason}</p>

          <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            {[
              ['Active', report.summary?.activeFindings || 0],
              ['Missing', report.summary?.missingNotifications || 0],
              ['Awaiting', report.summary?.awaitingAcknowledgement || 0],
              ['Overdue', report.summary?.overdue || 0],
              ['Read, unresolved', report.summary?.acknowledgedUnresolved || 0],
              ['Resolved', report.summary?.resolvedAfterNotification || 0],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[10px] border border-[#e0e8ef] bg-[#f9fbfc] px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#718397]">{label}</dt>
                <dd className="mt-1 text-lg font-semibold text-[#304258]">{value}</dd>
              </div>
            ))}
          </dl>

          {report.current?.length ? (
            <ul className="mt-4 divide-y divide-[#dfe7ed] text-sm" aria-label="Active OTP follow-up findings">
              {report.current.slice(0, 12).map((item) => (
                <li key={item.actionKey} className="grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_190px_minmax(0,1.5fr)]">
                  <span className="font-semibold text-[#304258]">
                    {item.title}
                    {item.canonicalTemplateVersionId ? <small className="mt-1 block font-mono text-[10px] font-normal text-[#8796a6]">Master {shortId(item.canonicalTemplateVersionId)}</small> : null}
                  </span>
                  <span>
                    <span className="block font-semibold text-[#52677e]">{STATE_LABELS[item.resolutionState] || 'Review required'}</span>
                    <span className="mt-1 flex items-center gap-1 text-[10px] text-[#8796a6]"><Clock3 className="h-3 w-3" aria-hidden="true" />{formatDateTime(item.latestNotificationAt)}</span>
                  </span>
                  <span className="text-[#63768a]">{item.detail}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-4 rounded-[11px] border border-[#cfe8d8] bg-[#f4faf6] px-3 py-2 text-sm text-[#236340]">No active governed OTP review finding remains.</p>}

          {report.resolved?.length ? (
            <details className="mt-4 rounded-[11px] border border-[#cfe8d8] bg-[#f8fcf9] px-3 py-2">
              <summary className="cursor-pointer text-sm font-semibold text-[#236340]">Show {report.resolved.length} resolved follow-up item{report.resolved.length === 1 ? '' : 's'}</summary>
              <ul className="mt-3 divide-y divide-[#dcebe1] text-xs leading-5 text-[#63768a]">
                {report.resolved.slice(0, 12).map((item) => (
                  <li key={item.actionId} className="py-2">
                    <span className="font-semibold text-[#40576d]">Packet {item.packetId || 'unknown'}</span>
                    {item.canonicalTemplateVersionId ? <span className="font-mono"> · Master {shortId(item.canonicalTemplateVersionId)}</span> : null}
                    <span> · {item.detail}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <p className="mt-4 text-xs leading-5 text-[#7a8b9d]">This check is read-only. It cannot mark notifications read, send reminders, approve or edit an OTP, release signing, activate a version or trigger recovery.</p>
        </div>
      ) : (
        <p className="mt-5 rounded-[11px] border border-[#dce6ee] bg-[#f8fafc] px-3 py-2 text-xs leading-5 text-[#63768a]">Run this after review notifications are sent or after evidence is repaired. Bridge will generate a fresh audit before classifying any finding.</p>
      )}
    </section>
  )
}
