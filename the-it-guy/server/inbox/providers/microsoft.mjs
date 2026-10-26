import { api, headers, bodyMessage, FILE_LIMIT, fail } from '../common.mjs'
export function microsoftProvider(connection, token, fetcher) {
  const account = connection.connection_kind === 'delegated_shared_mailbox' ? `users/${encodeURIComponent(connection.mailbox_address)}` : 'me'
  const base = `/v1.0/${account}`, request = api(token, 'https://graph.microsoft.com', fetcher, `${base}/`)
  return {
    async verify() {
      if (connection.connection_kind === 'delegated_shared_mailbox') { await request(`${base}/mailFolders/inbox?$select=id`); return }
      const profile = await api(token,'https://graph.microsoft.com',fetcher,'/v1.0/')(`${base}?$select=mail,userPrincipalName`)
      if (![profile.mail,profile.userPrincipalName].some(value => String(value || '').toLowerCase() === connection.mailbox_address.toLowerCase())) fail('mailbox_identity_mismatch')
    },
    async plan(cursor = {}) {
      const filter = connection.initial_history_days ? `&$filter=receivedDateTime ge ${new Date(Date.now() - connection.initial_history_days * 86400000).toISOString()}` : ''
      const page = await request(cursor.url || `${base}/mailFolders/inbox/messages/delta?$select=id&$top=10${filter}`, { allowMissing: Boolean(cursor.url), allowExpired: Boolean(cursor.url) })
      if (!page) return this.plan({})
      if (!page['@odata.nextLink'] && !page['@odata.deltaLink']) fail('provider_response_invalid')
      return { refs: (page.value || []).filter(m => !m['@removed']).map(m => m.id), next: { url: page['@odata.nextLink'] || page['@odata.deltaLink'] }, more: Boolean(page['@odata.nextLink']) }
    },
    async read(id) {
      const path = `${base}/messages/${encodeURIComponent(id)}`
      const item = await request(`${path}?$select=id,conversationId,internetMessageId,internetMessageHeaders,subject,from,toRecipients,ccRecipients,receivedDateTime,body,isRead,hasAttachments`, { allowMissing: true })
      if (!item) return null
      const message = await headers(item.internetMessageHeaders)
      const attachments = []
      // Graph can report hasAttachments=false for inline-only messages; enumerate
      // independently so inline files are still available without remote images.
      let next = `${path}/attachments?$select=id,name,contentType,size,isInline,contentId`
      while (next) {
        const page = await request(next)
        for (const file of page.value || []) {
          if (attachments.length >= 100) fail('message_attachment_limit')
          const kind = file['@odata.type']
          attachments.push({ id: file.id, filename: file.name || 'attachment', size: file.size || 0, contentType: file.contentType || 'application/octet-stream', isInline: file.isInline === true, contentId: file.contentId,
            state: kind !== '#microsoft.graph.fileAttachment' ? 'unsupported' : file.size > FILE_LIMIT ? 'too_large' : 'available',
            load: () => request(`${path}/attachments/${encodeURIComponent(file.id)}/$value`, { bytes: true, max: FILE_LIMIT + 1 }) })
        }
        next = page['@odata.nextLink']
      }
      return bodyMessage({ ...message, providerId: id, threadId: item.conversationId, internetMessageId: item.internetMessageId || message.internetMessageId,
        senderAddress: item.from?.emailAddress?.address || message.senderAddress,
        to: [...(item.toRecipients || []), ...(item.ccRecipients || [])].map(v => v.emailAddress?.address).filter(Boolean),
        subject: item.subject || '', receivedAt: item.receivedDateTime, isRead: item.isRead === true, attachments },
      item.body?.contentType?.toLowerCase() === 'text' ? item.body.content : '', item.body?.contentType?.toLowerCase() === 'html' ? item.body.content : '')
    },
    async close() {},
  }
}
