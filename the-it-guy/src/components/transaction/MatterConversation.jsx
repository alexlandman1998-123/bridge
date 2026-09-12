import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { readMatterConversation, postMatterMessage } from '../../services/matterConversationService'
import useTransactionLiveRefresh from '../../hooks/useTransactionLiveRefresh'

export const MatterConversationAccess = createContext(null)
const audiences = { everyone: 'Everyone on this matter', professionals: 'Professionals only',
  buyer: 'Buyer + professionals', seller: 'Seller + professionals', private: 'Private — only me' }

export default function MatterConversation({ transactionId, revision = 0, requirePortal = false }) {
  const access = useContext(MatterConversationAccess)
  const token = access?.token || '', sellerSession = access?.sellerSession || ''
  const scope = `${transactionId}:${token}:${sellerSession}`
  const currentScope = useRef(scope)
  const active = useRef(true)
  currentScope.current = scope
  const sequence = useRef(0), pendingMessage = useRef(null)
  const reading = useRef(null)
  const [loaded, setLoaded] = useState(null)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [audience, setAudience] = useState('')
  const [saving, setSaving] = useState(false)
  const data = loaded?.scope === scope ? loaded.data : null
  const refresh = useCallback(() => {
    if (!active.current) return false
    if (reading.current?.scope === scope) return reading.current.promise
    const request = ++sequence.current
    const promise = (async () => {
    try {
      if (requirePortal && !token) throw new Error('Portal credentials required.')
      const result = await readMatterConversation({ transactionId, token, sellerSession })
      if (!active.current || currentScope.current !== scope || request !== sequence.current) return false
      setLoaded({ scope, data: result }); setError('')
      return true
    } catch {
      if (active.current && currentScope.current === scope && request === sequence.current) {
        setLoaded(null)
        setError('Conversation unavailable. Please retry.')
      }
      return false
    }
    })().finally(() => { if (reading.current?.promise === promise) reading.current = null })
    reading.current = { scope, promise }
    return promise
  }, [scope, transactionId, token, sellerSession, requirePortal])
  useEffect(() => {
    active.current = true
    setDraft(''); setAudience(''); setSaving(false); pendingMessage.current = null
    return () => { active.current = false; sequence.current++ }
  }, [scope])
  useEffect(() => { void refresh() }, [refresh, revision])
  const live = useTransactionLiveRefresh({ transactionId, onRefresh: refresh, scopeKey: scope,
    enabled: !requirePortal || Boolean(token), realtime: false, refreshOnMount: false, pollingIntervalMs: 15_000 })
  const selectedAudience = data?.audiences.includes(audience) ? audience : data?.audiences[0] || ''
  async function send(event) {
    event.preventDefault()
    if (saving || !data || !draft.trim()) return
    const body = draft.trim()
    if (!pendingMessage.current || pendingMessage.current.body !== body || pendingMessage.current.audience !== selectedAudience) {
      pendingMessage.current = { commandId: crypto.randomUUID(), body, audience: selectedAudience }
    }
    const message = pendingMessage.current
    setSaving(true); setError('')
    try {
      await postMatterMessage({ transactionId, token, sellerSession, ...message })
      if (!active.current || currentScope.current !== scope) return
      setDraft(''); pendingMessage.current = null
      // A read begun before the post cannot prove that the new message is visible.
      await reading.current?.promise
      await refresh()
    } catch {
      if (active.current && currentScope.current === scope) setError('Sending could not be confirmed. Retry the unchanged message safely.')
    } finally { if (active.current && currentScope.current === scope) setSaving(false) }
  }
  return <section aria-label="Matter conversation" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-slate-900">Matter updates & conversation</h2>
      <span role="status" className="text-xs text-slate-500">{live.connectionState === 'offline' ? 'Offline — reconnecting when available' : 'Updates checked every 15 seconds'}</span></div>
    {error ? <p role="alert" className="text-sm text-amber-800">{error} <button type="button" onClick={() => void refresh()} className="underline">Retry</button></p> : null}
    {!data && !error ? <p role="status" className="text-sm text-slate-500">Loading conversation…</p> : null}
    {data ? <>
      {data.audiences.length ? <form onSubmit={send} className="space-y-2">
        <label className="block text-sm">Visible to <select value={selectedAudience} disabled={saving} onChange={e => setAudience(e.target.value)} className="ml-2 rounded border border-slate-300 p-2">
          {data.audiences.map(value => <option key={value} value={value}>{audiences[value]}</option>)}</select></label>
        <label className="block text-sm">Message<textarea value={draft} maxLength={4000} disabled={saving} onChange={e => setDraft(e.target.value)} rows={2} className="mt-1 w-full rounded border border-slate-300 p-2" /></label>
        <button disabled={saving || !draft.trim()} className="rounded bg-emerald-800 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? 'Sending…' : 'Post message'}</button>
      </form> : <p className="text-sm text-slate-500">Read-only conversation.</p>}
      <ol className="max-h-96 space-y-3 overflow-y-auto" aria-label="Recent matter updates">
        {data.items.map(item => <li key={item.id} className="border-t border-slate-100 pt-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span>{item.authorName} · {audiences[item.audience]}</span><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></div>
          <p className="mt-1 whitespace-pre-wrap break-words text-slate-800">{item.body}</p>
        </li>)}
        {!data.items.length ? <li className="text-sm text-slate-500">No updates yet. Task changes appear here automatically.</li> : null}
      </ol><p className="text-xs text-slate-500">Latest 100 updates. Posting here does not send email or push notifications.</p>
    </> : null}
  </section>
}
