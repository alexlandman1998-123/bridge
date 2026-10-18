import { useCallback, useEffect, useRef, useState } from 'react'
import { metaIntegrationRequest } from '../services/metaIntegrationService'

const empty = { rows: [], loading: true, loadingOlder: false, error: '', nextCursor: null, olderLoaded: false }
export default function useWhatsAppHistory({ organisationId, accessScope, conversationId = '', search = '', thread = false }) {
  const scope = `${accessScope}:${thread ? conversationId : search}`
  const [state, setState] = useState({ ...empty, scope: '' })
  const snapshot = useRef(state), generation = useRef(0), active = useRef(scope), pending = useRef(null)
  snapshot.current = state; active.current = scope
  const invalidate = useCallback(() => { generation.current++ }, [])
  const load = useCallback(async (older = false) => {
    if (!organisationId || (thread && !conversationId) || pending.current?.scope === scope) return
    const previous = snapshot.current.scope === scope ? snapshot.current : empty
    if (older && !previous.nextCursor) return
    const token = { scope }; pending.current = token
    const current = ++generation.current
    setState({ ...previous, scope, loading: !previous.rows.length, loadingOlder: older, error: '' })
    try {
      const fields = {
        ...(thread ? { conversationId } : { search, knownIds: previous.rows.map(row => row.id).slice(0,1000) }),
        ...(older ? { cursor: previous.nextCursor } : {}),
      }
      let data = await metaIntegrationRequest(organisationId, thread ? 'message_page' : 'inbox_page', fields)
      if (current !== generation.current || active.current !== scope) return
      const contentChanged = thread && previous.conversation && data.conversation && Number(previous.conversation.content_version || 0) !== Number(data.conversation.content_version || 0)
      if (contentChanged && older) {
        data = await metaIntegrationRequest(organisationId,'message_page',{conversationId})
        if (current !== generation.current || active.current !== scope) return
      }
      const incoming = data[thread ? 'messages' : 'conversations'] || []
      const visible = new Set(data.visibleIds || [])
      // Keep each access check bounded without discarding history beyond 1,000 chats.
      if (!thread) for (let offset=1000;offset<previous.rows.length;offset+=1000) {
        const access = await metaIntegrationRequest(organisationId,'inbox_page',{...fields,knownIds:previous.rows.slice(offset,offset+1000).map(row=>row.id)})
        if (current !== generation.current || active.current !== scope) return
        for (const id of access.visibleIds || []) visible.add(id)
      }
      const retained = thread ? contentChanged ? [] : previous.rows : previous.rows.filter(row => visible.has(row.id))
      const merged = new Map(retained.map(row => [row.id, row]))
      // A burst larger than one page must not skip the gap before cached history.
      const gap = !older && previous.olderLoaded && data.nextCursor && incoming.length && !incoming.some(row => merged.has(row.id))
      incoming.forEach(row => merged.set(row.id, row))
      const rows = [...merged.values()].sort((a,b) => String(b.page_at || b.event_at || b.last_message_at).localeCompare(String(a.page_at || a.event_at || a.last_message_at)) || b.id.localeCompare(a.id))
      setState({ ...data, scope, rows, loading: false, loadingOlder: false, error: '', olderLoaded: contentChanged ? false : previous.olderLoaded || older,
        nextCursor: contentChanged || older || !previous.olderLoaded || gap ? data.nextCursor : previous.nextCursor })
      if (thread && !older) window.dispatchEvent(new Event('arch9:whatsapp-read'))
    } catch (error) { if (current === generation.current && active.current === scope) setState({ ...empty, scope, loading: false, error: error.message }) }
    finally { if (pending.current === token) pending.current = null }
  }, [organisationId, thread, conversationId, search, scope])
  const refresh = useCallback(() => load(false), [load])
  const loadOlder = useCallback(() => load(true), [load])
  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { if (!document.hidden) void refresh() }, 15000)
    window.addEventListener('focus', refresh)
    return () => { invalidate(); window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [refresh, invalidate])
  return { ...(state.scope === scope ? state : empty), refresh, loadOlder }
}
