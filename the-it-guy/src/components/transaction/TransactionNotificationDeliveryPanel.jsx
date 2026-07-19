import { AlertTriangle, CheckCircle2, Clock3, Mail, MessageCircle, RefreshCw, Radio } from 'lucide-react'
import Button from '../ui/Button'

const DELIVERY_LABELS = {
  delivered: 'Delivered',
  failed: 'Failed',
  prepared: 'Queued',
  processing: 'Sending',
  queued: 'Queued',
  sent: 'Sent',
  skipped: 'Unavailable',
}

function formatDateTime(value) {
  if (!value) return 'Not attempted yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not attempted yet'
  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function maskRecipient(value) {
  const recipient = String(value || '').trim()
  if (!recipient) return 'Recipient unavailable'
  const [name, domain] = recipient.split('@')
  if (!domain) return `${recipient.slice(0, 4)}${recipient.length > 4 ? '…' : ''}`
  return `${name.slice(0, 2)}${name.length > 2 ? '…' : ''}@${domain}`
}

function deliveryTone(status) {
  if (status === 'failed') return 'border-error/20 bg-error/5 text-error'
  if (status === 'delivered' || status === 'sent') return 'border-success/20 bg-success/5 text-success'
  return 'border-borderDefault bg-surfaceAlt text-textMuted'
}

export default function TransactionNotificationDeliveryPanel({
  deliveries = [],
  summary = {},
  connectionState = 'idle',
  lastRefreshAt = null,
  busyEventId = '',
  feedback = '',
  error = '',
  onResend,
}) {
  const emailDeliveries = deliveries.filter((delivery) => delivery.channel === 'email').slice(0, 8)
  const liveLabel = connectionState === 'live' ? 'Live' : connectionState === 'connecting' ? 'Connecting' : 'Auto-refreshing'

  return (
    <section className="rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]" aria-labelledby="notification-delivery-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="notification-delivery-heading" className="text-sm font-semibold text-textStrong">Notification delivery</h3>
          <p className="mt-1 text-xs text-textMuted">Email status for shared transaction updates.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-borderDefault bg-surfaceAlt px-2.5 py-1 text-[0.68rem] font-semibold text-textMuted">
          <Radio size={11} aria-hidden="true" />
          {liveLabel}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          ['Sent', Number(summary.sent || 0), CheckCircle2],
          ['Queued', Number(summary.queued || 0), Clock3],
          ['Failed', Number(summary.failed || 0), AlertTriangle],
        ].map(([label, count, Icon]) => (
          <div key={label} className="rounded-[10px] border border-borderDefault bg-surfaceAlt px-2 py-3">
            <dt className="flex items-center justify-center gap-1 text-[0.68rem] font-semibold uppercase tracking-wide text-textMuted">
              <Icon size={11} aria-hidden="true" />
              {label}
            </dt>
            <dd className="mt-1 text-lg font-semibold text-textStrong">{count}</dd>
          </div>
        ))}
      </dl>

      {Number(summary.whatsappPending || 0) > 0 ? (
        <div className="mt-3 flex gap-2 rounded-[10px] border border-borderDefault bg-surfaceAlt px-3 py-2 text-xs text-textMuted">
          <MessageCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>WhatsApp is recorded for {summary.whatsappPending} update{Number(summary.whatsappPending) === 1 ? '' : 's'}, but sending remains disabled.</span>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {emailDeliveries.map((delivery) => {
          const canResend = ['failed', 'sent', 'delivered'].includes(delivery.status) && typeof onResend === 'function'
          const isBusy = busyEventId === delivery.id
          return (
            <article key={delivery.id} className="rounded-[10px] border border-borderDefault px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Mail size={13} className="shrink-0 text-textMuted" aria-hidden="true" />
                    <p className="truncate text-xs font-semibold text-textStrong">{maskRecipient(delivery.recipientAddress)}</p>
                  </div>
                  <p className="mt-1 text-[0.68rem] text-textMuted">
                    {formatDateTime(delivery.deliveredAt || delivery.sentAt || delivery.lastAttemptAt || delivery.createdAt)}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-1 text-[0.65rem] font-semibold ${deliveryTone(delivery.status)}`}>
                  {DELIVERY_LABELS[delivery.status] || delivery.status || 'Unknown'}
                </span>
              </div>
              {delivery.error ? <p className="mt-2 text-xs text-error">{delivery.error}</p> : null}
              {canResend ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-3 h-8 w-full px-3 text-xs"
                  disabled={Boolean(busyEventId)}
                  onClick={() => onResend(delivery)}
                >
                  <RefreshCw size={12} className={isBusy ? 'animate-spin' : ''} aria-hidden="true" />
                  {isBusy ? 'Resending…' : 'Resend email'}
                </Button>
              ) : null}
            </article>
          )
        })}
        {!emailDeliveries.length ? (
          <div className="rounded-[10px] border border-dashed border-borderDefault bg-surfaceAlt px-3 py-5 text-center text-xs text-textMuted">
            Delivery records will appear after a shared update is published.
          </div>
        ) : null}
      </div>

      <div aria-live="polite" className="mt-3 text-xs">
        {feedback ? <p className="text-success">{feedback}</p> : null}
        {error ? <p className="text-error">{error}</p> : null}
      </div>
      {lastRefreshAt ? <p className="mt-2 text-[0.65rem] text-textMuted">Last refreshed {formatDateTime(lastRefreshAt)}</p> : null}
    </section>
  )
}
