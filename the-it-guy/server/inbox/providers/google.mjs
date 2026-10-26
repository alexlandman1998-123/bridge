import { api, headers, bodyMessage, BODY_LIMIT, FILE_LIMIT, fail } from '../common.mjs'
export function googleProvider(connection, token, fetcher) {
  if (connection.connection_kind === 'delegated_shared_mailbox') fail('google_delegation_unsupported')
  const request = api(token, 'https://gmail.googleapis.com', fetcher, '/gmail/v1/users/me/')
  const base = '/gmail/v1/users/me'
  return {
    async plan(cursor = {}) {
      if (!cursor.mode) {
        const profile = await request(`${base}/profile`)
        if (profile.emailAddress?.toLowerCase() !== connection.mailbox_address.toLowerCase()) fail('mailbox_identity_mismatch')
        cursor = { mode: 'initial', historyId: profile.historyId, since: Math.floor(Date.now() / 1000 - connection.initial_history_days * 86400) }
      }
      if (cursor.mode === 'initial') {
        const query = new URLSearchParams({ labelIds: 'INBOX', maxResults: '10' })
        if (connection.initial_history_days) query.set('q', `after:${cursor.since}`)
        if (cursor.page) query.set('pageToken', cursor.page)
        const page = await request(`${base}/messages?${query}`)
        const next = page.nextPageToken ? { ...cursor, page: page.nextPageToken } : { mode: 'history', historyId: cursor.historyId }
        return { refs: (page.messages || []).map(m => m.id), next, more: Boolean(page.nextPageToken) }
      }
      const query = new URLSearchParams({ startHistoryId: cursor.historyId, maxResults: '10' })
      if (cursor.page) query.set('pageToken', cursor.page)
      const page = await request(`${base}/history?${query}`, { allowMissing: true })
      if (!page) return this.plan({}) // Gmail expires history cursors; replay safely.
      const ids = new Set()
      for (const event of page.history || []) {
        for (const group of ['messagesAdded', 'labelsAdded', 'labelsRemoved']) for (const item of event[group] || []) ids.add(item.message.id)
      }
      return { refs: [...ids], next: page.nextPageToken ? { ...cursor, page: page.nextPageToken } : { mode: 'history', historyId: page.historyId || cursor.historyId }, more: Boolean(page.nextPageToken) }
    },
    async read(id) {
      const item = await request(`${base}/messages/${encodeURIComponent(id)}?format=full`, { allowMissing: true })
      if (!item || !item.labelIds?.includes('INBOX')) return null
      const message = await headers(item.payload?.headers)
      const attachments = []; let plain = '', html = '', bodyLimited = false
      async function walk(part) {
        if (!part) return
        if (part.parts) { for (const child of part.parts) await walk(child); return }
        const mime = (part.mimeType || '').toLowerCase(), body = part.body || {}, partId = body.attachmentId || part.partId || 'body'
        const disposition = part.headers?.find(h => h.name.toLowerCase() === 'content-disposition')?.value || ''
        const isBody = !part.filename && !/attachment/i.test(disposition) && ['text/plain', 'text/html'].includes(mime)
        const load = async () => body.data ? Buffer.from(body.data, 'base64url') : Buffer.from((await request(`${base}/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(body.attachmentId)}`)).data || '', 'base64url')
        if (isBody) {
          if (body.size > BODY_LIMIT * 2) { bodyLimited = true; return }
          const bytes = await load(); const contentType = part.headers?.find(h => h.name.toLowerCase() === 'content-type')?.value || ''
          const charset = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] || 'utf-8'
          let value; try { value = new TextDecoder(charset).decode(bytes) } catch { value = bytes.toString('utf8') }
          if (mime === 'text/plain') plain += value; else html += value
        } else {
          if (attachments.length >= 100) fail('message_attachment_limit')
          attachments.push({ id: partId, filename: part.filename || 'attachment', size: body.size || 0, contentType: mime || 'application/octet-stream',
            contentId: part.headers?.find(h => h.name.toLowerCase() === 'content-id')?.value || null, isInline: !part.filename,
            state: body.size > FILE_LIMIT ? 'too_large' : 'available', load })
        }
      }
      await walk(item.payload)
      const result = bodyMessage({ ...message, providerId: id, threadId: item.threadId, receivedAt: new Date(Number(item.internalDate)).toISOString(), isRead: !item.labelIds.includes('UNREAD'), attachments }, plain, html)
      if (bodyLimited) result.contentStatus = 'body_limited'
      return result
    },
    async close() {},
  }
}
