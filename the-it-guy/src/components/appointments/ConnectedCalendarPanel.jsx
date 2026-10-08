import { useEffect, useRef, useState } from 'react'
import useAppointmentReconciliation from '../../hooks/useAppointmentReconciliation'
import { readCalendarProviderStatus, startCalendarProviderConnection, disconnectCalendarProvider, actOnCalendarProviderEvent } from '../../services/calendarProviderService'

const labels = { google: 'Google', outlook: 'Outlook' }
const statuses = { queued: 'Waiting to sync', processing: 'Syncing…', synced: 'Synced', removed: 'Connected copy removed', failed: 'Sync needs attention', needs_review: 'Outside change needs review', paused: 'Sync paused', suppressed: 'Schedule needs review' }
async function deadline(promise) {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Calendar action is taking too long. Check status before retrying.')), 15000) })]) }
  finally { clearTimeout(timer) }
}
const button = 'min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50'

function ScopedPanel({ organisationId, appointmentId, viewerKey }) {
  const [data, setData] = useState(null)
  const [readError, setReadError] = useState('')
  const [actionError, setActionError] = useState('')
  const error = [actionError, readError].filter(Boolean).join(' ')
  const [busy, setBusy] = useState(false)
  const [disconnecting, setDisconnecting] = useState(null)
  const active = useRef(false)
  const pending = useRef(false)
  const { revision, reload } = useAppointmentReconciliation({ scopeKey: `${organisationId}:${viewerKey}:${appointmentId}` })
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    let current = true, timer
    Promise.race([readCalendarProviderStatus(organisationId, appointmentId), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Calendar status is taking too long. Retry.')), 15000) })])
      .then(result => { if (current) { setData(result); setReadError('') } })
      .catch(failure => { if (current) setReadError(failure.message || 'Calendar status could not be verified.') })
      .finally(() => clearTimeout(timer))
    return () => { current = false; clearTimeout(timer) }
  }, [organisationId, appointmentId, revision])

  async function run(operation) {
    if (pending.current) return
    pending.current = true; setBusy(true); setActionError('')
    try { await deadline(operation()); if (active.current) { setDisconnecting(null); reload() } }
    catch (failure) { if (active.current) setActionError(failure.message || 'Calendar action could not be verified. Retry.') }
    finally { pending.current = false; if (active.current) setBusy(false) }
  }
  async function connect(provider) {
    const url = await deadline(startCalendarProviderConnection(organisationId, provider, `${window.location.pathname}${window.location.search}`))
    if (active.current) window.location.assign(url)
  }
  function eventAction(provider, action, event) {
    return run(() => actOnCalendarProviderEvent({ organisationId, appointmentId, provider, action, reviewToken: event.reviewToken }))
  }
  const callbackResult = new URLSearchParams(window.location.search).get('calendar_provider')
  return <details className="rounded-xl border border-slate-200 bg-slate-50 p-3" open={Boolean(appointmentId)}>
    <summary className="min-h-[44px] cursor-pointer font-semibold">Your connected calendar</summary>
    <div className="grid gap-3 text-sm">
      <p>Connect your own Google or Outlook calendar to keep personal appointment copies up to date. Invitations and reminders are managed in Arch9. Existing manual copies are not linked; remove them yourself to avoid duplicates.</p>
      {callbackResult === 'failed' ? <p role="alert">Calendar authorization was unsuccessful. Reconnect and check the selected account and permissions.</p> : callbackResult === 'cancelled' ? <p>Calendar authorization was cancelled.</p> : null}
      {error ? <p role="alert">{error} <button type="button" className={button} onClick={reload} disabled={busy}>Retry status</button></p> : null}
      {!data ? <p>Checking connections…</p> : Object.entries(labels).map(([provider, label]) => {
        const connection = data.connections.find(row => row.provider === provider)
        const event = data.events.find(row => row.provider === provider && row.appointmentId === appointmentId)
        return <section key={provider} aria-label={`${label} calendar connection`} className="grid gap-2 border-t border-slate-200 pt-3">
          <p className="font-semibold">{label} · {connection?.status === 'connected' ? 'Connected' : connection?.status === 'needs_reconnect' ? 'Reconnect required' : 'Disconnected'}</p>
          {connection?.accountLabel ? <p>{connection.accountLabel}</p> : null}
          {connection?.status !== 'connected' ? <button type="button" className={button} disabled={busy} onClick={() => void run(() => connect(provider))}>{connection?.accountLabel ? `Reconnect ${label}` : `Connect ${label}`}</button> : <>
            <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy} onClick={() => setDisconnecting(connection.id)}>Disconnect {label}</button></div>
            {disconnecting === connection.id ? <div role="group" aria-label={`Confirm disconnect ${label}`}>
              <p>Disconnecting stops updates. Existing provider copies remain as manual copies. You can reconnect the same account later.</p>
              <button type="button" className={button} disabled={busy} onClick={() => void run(() => disconnectCalendarProvider(connection.id))}>Confirm disconnect</button>{' '}
              <button type="button" className={button} disabled={busy} onClick={() => setDisconnecting(null)}>Keep connected</button>
            </div> : null}
          </>}
          {appointmentId ? event ? <>
            <p role="status">{event.lastError === 'schedule_needs_review' ? 'Saved schedule needs review' : statuses[event.status] || 'Status needs verification'}{event.status === 'synced' && event.lastSyncedAt ? ` · Last checked ${new Date(event.lastSyncedAt).toLocaleString()}` : ''}</p>
            {event.lastError === 'schedule_needs_review' ? <p>Review the saved start, end and timezone in the appointment editor before syncing.</p> : event.status === 'needs_review' ? <div className="grid gap-2">
              <p>{event.observed?.deleted ? 'The connected copy was deleted outside Arch9.' : 'The connected copy changed outside Arch9.'} The Arch9 appointment is unchanged.</p>
              {event.observed?.title ? <p>Outside title: {event.observed.title}</p> : null}
              {event.observed?.start ? <p>Outside start: {event.observed.start}</p> : null}
              {event.observed?.reason === 'provider_has_guests' ? <p>The outside copy has guests. Remove those guests in the provider before restoring, or stop syncing this copy.</p> : null}
              {event.observed?.reason === 'provider_has_online_meeting' ? <p>The outside copy has an online meeting. Remove that meeting in Outlook before restoring, or stop syncing this copy.</p> : null}
              {event.observed?.reason === 'provider_copy_is_recurring' ? <p>The outside copy became a recurring series. Change it back to a single appointment in the provider before restoring, or stop syncing this copy.</p> : null}
              <p>Use the appointment’s edit or cancel actions to change the Arch9 booking.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={button} disabled={busy || connection?.status !== 'connected'} onClick={() => void eventAction(provider, 'restore', event)}>Restore Arch9 copy</button>
                <button type="button" className={button} disabled={busy || connection?.status !== 'connected'} onClick={() => void eventAction(provider, 'pause', event)}>Stop syncing this copy</button>
              </div>
            </div> : event.status === 'suppressed' ? <p>Review the saved schedule and use the appointment editor to reissue this booking.</p> : connection?.status === 'connected' && ['failed', 'paused'].includes(event.status) ? <button type="button" className={button} disabled={busy} onClick={() => void eventAction(provider, 'sync', event)}>{event.status === 'paused' ? 'Resume sync' : 'Retry sync'}</button> : null}
          </> : <p>No connected copy for this appointment. Eligible appointments are queued automatically.</p> : null}
        </section>
      })}
    </div>
  </details>
}
export default function ConnectedCalendarPanel({ organisationId, appointmentId = null, viewerKey = '' }) {
  if (!organisationId || !viewerKey) return null
  return <ScopedPanel key={`${organisationId}:${viewerKey}:${appointmentId}`} organisationId={organisationId} appointmentId={appointmentId} viewerKey={viewerKey} />
}
