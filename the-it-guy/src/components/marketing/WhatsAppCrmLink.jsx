import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../ui/Button'
import { metaIntegrationRequest } from '../../services/metaIntegrationService'

const label = kind => ({ buyer: 'Buyer', seller: 'Seller', recruitment: 'Recruitment' }[kind] || 'CRM')
const keyFor = record => `${record.kind}:${record.recordId}`

export default function WhatsAppCrmLink({ organisationId, accessScope, conversationId, assignmentVersion }) {
  const scope = `${accessScope}:${conversationId}:${assignmentVersion}`
  const generation = useRef(0), lock = useRef(false)
  const activeScope = useRef(scope)
  activeScope.current = scope
  const [state, setState] = useState({ scope: '', loading: true }), [choice, setChoice] = useState('')
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  const invalidate = useCallback(() => { generation.current++ }, [])
  const data = state.scope === scope ? state : { loading: true }
  const refresh = useCallback(async () => {
    const current = ++generation.current
    try {
      const context = await metaIntegrationRequest(organisationId, 'crm_context', { conversationId })
      if (generation.current === current) setState({ ...context, scope, loading: false })
    } catch (error) { if (generation.current === current) setState({ scope, loading: false, error: error.message }) }
  }, [organisationId, conversationId, scope])
  useEffect(() => {
    setChoice(''); setBusy(false); setNotice(''); void refresh()
    const timer = window.setInterval(() => { if (!document.hidden && !lock.current) void refresh() }, 15000)
    return () => { invalidate(); window.clearInterval(timer) }
  }, [refresh, invalidate])
  const candidates = data.candidates || []
  const selected = candidates.find(record => keyFor(record) === choice)
  useEffect(() => { setChoice('') }, [data.version])
  async function save(unlink = false) {
    if (lock.current || data.loading || data.error || (!unlink && !selected)) return
    lock.current = true; setBusy(true); setNotice('')
    const current = generation.current
    try {
      await metaIntegrationRequest(organisationId, unlink ? 'unlink_crm' : 'link_crm', {
        conversationId, linkVersion: data.version, assignmentVersion: data.assignmentVersion,
        ...(!unlink ? { kind: selected.kind, recordId: selected.recordId } : {}),
      })
      if (generation.current !== current) return
      setChoice(''); await refresh(); if (activeScope.current === scope) setNotice(unlink ? 'CRM link removed.' : 'CRM record linked.')
    } catch (error) {
      if (generation.current === current) { await refresh(); if (activeScope.current === scope) setNotice(error.message) }
    } finally { lock.current = false; if (activeScope.current === scope) setBusy(false) }
  }
  return <section aria-label="Linked CRM record" className="space-y-3 border-b bg-slate-50 px-4 py-3 text-sm">
    <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">CRM record</h3><Button size="sm" variant="ghost" disabled={busy} onClick={() => void refresh()}>Refresh CRM matches</Button></div>
    {data.loading ? <p role="status">Finding matching CRM records…</p> : data.error ? <p role="alert" className="text-red-800">{data.error}</p> : <>
      {data.linked ? <div><Link className="font-semibold text-blue-800 underline" to={data.linked.path}>{label(data.linked.kind)} · {data.linked.name || 'Open record'}</Link>{!data.linked.phoneMatches && <p className="mt-1 text-amber-900">This record’s phone has changed. Review the link before continuing.</p>}</div> : <p>{data.linkedUnavailable ? 'The linked CRM record is no longer available to you.' : 'No CRM record linked.'}</p>}
      {candidates.length ? <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void save() }}>
        <label className="grid min-w-0 flex-1 gap-1 font-semibold">{candidates.length > 1 ? 'Multiple records match. Choose the correct record.' : 'Matching CRM record'}<select className="min-w-0 rounded-lg border bg-white px-2 py-2 font-normal" value={selected ? choice : ''} disabled={busy} onChange={event => setChoice(event.target.value)}><option value="">Choose a CRM record</option>{candidates.map(record => <option key={keyFor(record)} value={keyFor(record)}>{label(record.kind)} · {record.name || 'Unnamed record'} · {record.phone} · {record.recordId.slice(-8)}</option>)}</select></label>
        <Button type="submit" size="sm" disabled={busy || !selected || (data.linked && keyFor(data.linked) === choice)}>Link record</Button>
      </form> : <p className="text-slate-600">No matching records available. Check the phone number in the CRM, then refresh.</p>}
      {selected && <p><Link className="font-semibold text-blue-800 underline" to={selected.path} target="_blank" rel="noreferrer">Review selected {label(selected.kind)} record</Link></p>}
      {data.truncated && <p>Showing the first 50 matches. Review duplicate CRM records before linking.</p>}
      {(data.linked || data.linkedUnavailable) && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save(true)}>Remove CRM link</Button>}
      {data.campaigns?.length > 0 && <p className="text-xs text-slate-600">Replied to campaign: {data.campaigns.map(campaign => campaign.name).join(', ')}</p>}
      <p className="text-xs text-slate-500">Linking preserves the records and their access permissions.</p>
    </>}
    {notice && <p role="status">{notice}</p>}
  </section>
}

export function WhatsAppCrmConversations({ organisationId, accessScope, kind, recordId, onSelect }) {
  const scope = `${accessScope}:${kind}:${recordId}`
  const generation = useRef(0)
  const [state, setState] = useState({ scope: '', loading: true }), [retry, setRetry] = useState(0)
  const invalidate = useCallback(() => { generation.current++ }, [])
  const data = state.scope === scope ? state : { loading: true }
  useEffect(() => {
    const current = ++generation.current
    metaIntegrationRequest(organisationId, 'crm_conversations', { kind, recordId })
      .then(result => { if (generation.current === current) setState({ ...result, scope, loading: false }) })
      .catch(error => { if (generation.current === current) setState({ scope, loading: false, error: error.message }) })
    return invalidate
  }, [organisationId, kind, recordId, scope, retry, invalidate])
  return <section aria-label="CRM WhatsApp conversations" className="space-y-3 rounded-xl border bg-white p-4 text-sm">
    {data.loading ? <p role="status">Finding conversations for this CRM record…</p> : data.error ? <p role="alert">{data.error}</p> : <>
      <Link className="font-semibold text-blue-800 underline" to={data.record.path}>{label(data.record.kind)} · {data.record.name}</Link>
      <p>Choose a conversation. You can link the record after opening it.</p>
      {data.conversations.length ? <ul className="space-y-2">{data.conversations.map(thread => <li key={thread.id}><button className="w-full rounded-lg border p-3 text-left hover:bg-slate-50" onClick={() => onSelect(thread.id)}>{thread.contact_name || thread.contact_phone} · {thread.display_phone_number || 'WhatsApp number'} · {thread.status}{thread.linked ? ' · Linked to this record' : ' · Matching phone'}{thread.last_message_at && <span className="mt-1 block text-xs text-slate-500">{new Date(thread.last_message_at).toLocaleString()}</span>}</button></li>)}</ul> : <p>No conversations available for this record. A conversation appears after a message is received and assigned to you. Agency management can check the agency queue.</p>}
    </>}
    <Button variant="ghost" size="sm" onClick={() => setRetry(value => value + 1)}>Refresh conversations</Button>
  </section>
}
