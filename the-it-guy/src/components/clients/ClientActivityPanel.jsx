import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { CLIENT_ACTIVITY_CATEGORIES, CLIENT_INTERACTION_TYPES, clientActivityRecordPath, loadClientActivity, logClientInteraction } from '../../services/clientActivityService'

const formatTime = (value) => new Date(value).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
const actorLabels = { staff: 'Staff action', client: 'Client action', system: 'System', historical: 'Earlier record' }
const localTime = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export default function ClientActivityPanel({ client, onChanged, refreshToken = 0, previewData }) {
  const [category, setCategory] = useState('all')
  const [events, setEvents] = useState([])
  const [cursor, setCursor] = useState(null)
  const [available, setAvailable] = useState(Boolean(client.identityId))
  const [loading, setLoading] = useState(Boolean(client.identityId))
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [type, setType] = useState('call')
  const [detail, setDetail] = useState('')
  const [occurredAt, setOccurredAt] = useState(localTime)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')
  const generation = useRef(0)
  const command = useRef(null)
  const identityId = client.identityId
  const organisationId = client.organisationId
  const currentScope = useRef('')
  currentScope.current = `${organisationId}:${identityId}`

  const refresh = useCallback(async (nextCursor = null) => {
    const request = ++generation.current
    setLoading(true); setError('')
    try {
      const result = previewData
        ? { ...previewData, events: previewData.events.filter(event => category === 'all' || event.category === category) }
        : await loadClientActivity({ identityId, organisationId }, { category, cursor: nextCursor })
      if (request !== generation.current) return
      setAvailable(result.available)
      setEvents((previous) => nextCursor ? [...new Map([...previous, ...result.events].map((event) => [event.id, event])).values()] : result.events)
      setCursor(result.nextCursor)
    } catch (cause) { if (request === generation.current) setError(cause.message || 'Unable to load client activity.') }
    finally { if (request === generation.current) setLoading(false) }
  }, [identityId, organisationId, category, previewData])

  useEffect(() => {
    setEvents([]); setCursor(null)
    void refresh()
    return () => { generation.current += 1 }
  }, [refresh, client.identityVersion, refreshToken])
  useEffect(() => {
    setEditing(false); setSaving(false); setDetail(''); setSaveError(''); setNotice(''); command.current = null
  }, [identityId, organisationId, previewData])

  async function save() {
    if (previewData) return
    const time = new Date(occurredAt)
    if (!Number.isFinite(time.getTime())) { setSaveError('Enter a valid interaction time.'); return }
    const entry = { type, detail, occurredAt: time.toISOString() }
    const fingerprint = JSON.stringify(entry)
    if (command.current?.fingerprint !== fingerprint) command.current = { fingerprint, requestId: crypto.randomUUID() }
    const scope = currentScope.current
    setSaving(true); setSaveError(''); setNotice('')
    let saved = false
    try {
      await logClientInteraction(client, { ...entry, requestId: command.current.requestId })
      saved = true
      if (currentScope.current !== scope) return
      setEditing(false); setDetail(''); command.current = null
      setNotice('Interaction saved. This logs the interaction; it does not send a message.')
      await refresh()
      await onChanged?.(identityId)
    } catch (cause) { if (currentScope.current === scope) setSaveError(saved ? 'The interaction was saved, but the directory could not refresh. Reload to see the latest activity.' : cause.message || 'Unable to save the interaction. You can retry the same entry.') }
    finally { if (currentScope.current === scope) setSaving(false) }
  }

  return <section className="min-w-0 space-y-4 rounded-[18px] border border-[#e1e9f2] bg-white p-4" aria-label="Client activity">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h4 className="font-semibold text-[#17334f]">Client activity</h4><p className="mt-1 text-sm text-[#637890]">Enquiries, interactions and client actions across linked records.</p></div>
      <div className="flex gap-2"><Button variant="ghost" disabled={loading || saving || (!identityId && !previewData)} onClick={() => void refresh()}>Refresh</Button>{available && (identityId || previewData) && !error ? <Button variant="secondary" disabled={saving || loading || Boolean(previewData)} title={previewData ? 'Mock preview is read-only' : undefined} onClick={() => { setEditing(!editing); setOccurredAt(localTime()); setSaveError('') }}>Log interaction</Button> : null}</div>
    </div>
    {!available ? <p className="rounded-xl bg-[#fff9ed] p-3 text-sm text-[#7f5b16]">Client activity is awaiting database setup and a permanent client profile.</p> : null}
    {notice ? <p role="status" className="rounded-xl bg-[#edfdf3] p-3 text-sm text-[#1c7d45]">{notice}</p> : null}
    {saveError ? <p role="alert" className="rounded-xl bg-[#fff5f5] p-3 text-sm text-[#b42318]">{saveError}</p> : null}
    {editing && !previewData ? <form className="grid gap-3 rounded-xl bg-[#f8fbfe] p-3" onSubmit={(event) => { event.preventDefault(); void save() }}>
      <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Interaction type<Field as="select" value={type} disabled={saving} onChange={(event) => setType(event.target.value)}>{CLIENT_INTERACTION_TYPES.map((key) => <option key={key} value={key}>{key.charAt(0).toUpperCase() + key.slice(1)}</option>)}</Field></label>
        <label className="grid gap-1 text-sm">When it happened<Field type="datetime-local" value={occurredAt} disabled={saving} onChange={(event) => setOccurredAt(event.target.value)} required /></label></div>
      <label className="grid gap-1 text-sm">Interaction details<Field as="textarea" rows={3} maxLength={4000} value={detail} disabled={saving} onChange={(event) => setDetail(event.target.value)} required /></label>
      <p className="text-xs leading-5 text-[#637890]">Record a call, meeting or message that took place. Entries remain in the history. Logging an email or message does not send it.</p>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button><Button type="submit" disabled={saving || !detail.trim()}>{saving ? 'Saving…' : 'Save interaction'}</Button></div>
    </form> : null}
    {available ? <label className="grid max-w-xs gap-1 text-sm">Activity filter<Field as="select" value={category} disabled={saving} onChange={(event) => setCategory(event.target.value)}>{CLIENT_ACTIVITY_CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Field></label> : null}
    {error ? <p role="alert" className="rounded-xl bg-[#fff5f5] p-3 text-sm text-[#b42318]">{error}</p> : null}
    {loading && !events.length ? <p role="status" className="text-sm text-[#637890]">Loading client activity…</p> : null}
    {available && !loading && !error && !events.length ? <p className="text-sm text-[#637890]">{category === 'all' ? 'No recorded activity yet.' : 'No activity in this category.'}</p> : null}
    <ol className="space-y-3">{events.map((event) => {
      const path = previewData ? null : clientActivityRecordPath(event)
      return <li key={event.id} className="min-w-0 rounded-xl border border-[#e1e9f2] p-3">
        <div className="flex flex-wrap items-start justify-between gap-2"><h5 className="font-semibold text-[#17334f]">{event.title}</h5><time className="text-xs text-[#637890]" dateTime={event.occurred_at}>{formatTime(event.occurred_at)}</time></div>
        {event.detail ? <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[#40586f]">{event.detail}</p> : null}
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#637890]"><span>{actorLabels[event.actor_kind] || 'Recorded action'}{event.historical ? ' · Historical record' : ''}</span>{event.actor_name ? <span>Recorded by {event.actor_name}</span> : null}{path ? <Link className="text-[#1767b4] underline" to={path}>Open linked record</Link> : null}</div>
      </li>
    })}</ol>
    {cursor ? <div className="flex justify-center"><Button variant="secondary" disabled={loading || saving} onClick={() => void refresh(cursor)}>{loading ? 'Loading…' : 'Load older activity'}</Button></div> : null}
  </section>
}
