import { lookup } from 'node:dns/promises'
import { isIP, BlockList } from 'node:net'
import { ImapFlow } from 'imapflow'
import { bodyMessage, headers, BODY_LIMIT, FILE_LIMIT, fail } from '../common.mjs'
const blocked = new BlockList()
for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) blocked.addSubnet(address,prefix,'ipv4')
for (const [address, prefix] of [['2001::',32],['2001:db8::',32],['2002::',16]]) blocked.addSubnet(address,prefix,'ipv6')
export function publicAddress(address) {
  const family = isIP(address)
  if (family === 4) return !blocked.check(address,'ipv4')
  // Accept global unicast IPv6 only; mapped IPv4, local, link-local and multicast
  // are excluded before connecting, even if a DNS answer also contains a public IP.
  if (family === 6) return /^[23][0-9a-f]{3}:/i.test(address) && !blocked.check(address,'ipv6')
  return false
}
export async function pinnedHost(host, resolver = lookup) {
  if (!/^[a-z0-9][a-z0-9.-]{1,250}\.[a-z]{2,}$/i.test(host) || isIP(host)) fail('imap_host_blocked')
  let addresses; try { addresses = await resolver(host, { all: true, verbatim: true }) } catch { fail('imap_dns_failed') }
  if (!addresses.length || addresses.some(v => !publicAddress(v.address))) fail('imap_host_blocked')
  return addresses[0].address
}
export async function imapProvider(connection, credential, { resolver, Client = ImapFlow } = {}) {
  if (Number(credential.port) !== 993) fail('imap_host_blocked')
  const host = await pinnedHost(credential.host, resolver)
  const client = new Client({ host, servername: credential.host, port: 993, secure: true,
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' }, auth: { user: credential.username, pass: credential.password },
    logger: false, emitLogs: false, disableAutoIdle: true, connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 45000 })
  client.on('error', () => {})
  let lock
  try { await client.connect(); lock = await client.getMailboxLock('INBOX', { readOnly: true }) }
  catch (error) { client.close(); fail(error.authenticationFailed || /AUTHENTICATION|AUTHORIZATION/i.test(error.responseStatus || error.code || '') ? 'imap_auth_failed' : 'imap_connection_failed') }
  const validity = String(client.mailbox.uidValidity)
  async function download(uid, part, max) {
    const file = await client.download(String(uid), part, { uid: true, maxBytes: max + 1 })
    if (!file?.content) fail('imap_message_unavailable')
    const chunks = []; let size = 0
    for await (const chunk of file.content) { size += chunk.length; if (size > max + 1) { file.content.destroy(); break } chunks.push(chunk) }
    return Buffer.concat(chunks)
  }
  return {
    async plan(cursor = {}) {
      if (cursor.validity !== validity) cursor = { validity, last: 0, initialUpper: Math.max(0, client.mailbox.uidNext - 1) }
      const upper = Math.max(0, client.mailbox.uidNext - 1), start = Number(cursor.last || 0) + 1, end = Math.min(upper, start + 999)
      if (start > upper) return { refs: [], next: cursor, more: false }
      const query = { uid: `${start}:${end}` }
      if (connection.initial_history_days && start <= cursor.initialUpper) {
        query.since = new Date(Date.now() - connection.initial_history_days * 86400000)
      }
      const found = await client.search(query, { uid: true })
      const ids = (found || []).filter(uid => uid >= start && uid <= end).sort((a,b) => a-b)
      const selected = ids.slice(0,10), last = ids.length > 10 ? selected.at(-1) : end
      return { refs: selected.map(uid => ({ uid, validity })), next: { ...cursor, last }, more: last < upper }
    },
    async read(ref) {
      if (ref.validity !== validity) fail('imap_uidvalidity_changed') // next claim resets stale page safely
      const item = await client.fetchOne(String(ref.uid), { envelope: true, bodyStructure: true, flags: true, internalDate: true, headers: ['references'] }, { uid: true })
      if (!item || item.uid !== ref.uid) return null
      const env = item.envelope || {}, parsed = await headers([{ name: 'References', value: item.headers?.toString().replace(/^references:\s*/i,'').trim() || '' }])
      const attachments = []; let plain = '', html = '', bodyLimited = false
      async function walk(part) {
        if (!part) return
        if (part.type.startsWith('multipart/') && part.childNodes) { for (const child of part.childNodes) await walk(child); return }
        const filename = part.dispositionParameters?.filename || part.parameters?.name
        const isBody = ['text/plain','text/html'].includes(part.type) && !filename && part.disposition !== 'attachment'
        if (isBody) {
          const bytes = await download(ref.uid, part.part || '1', BODY_LIMIT)
          if (bytes.length > BODY_LIMIT) bodyLimited = true
          let value; try { value = new TextDecoder(part.parameters?.charset || 'utf-8').decode(bytes.subarray(0,BODY_LIMIT)) } catch { value = bytes.subarray(0,BODY_LIMIT).toString('utf8') }
          if (part.type === 'text/plain') plain += value; else html += value
        } else {
          if (attachments.length >= 100) fail('message_attachment_limit')
          attachments.push({ id: part.part || '1', filename: filename || 'attachment', contentType: part.type, size: part.size || 0, isInline: part.disposition === 'inline', contentId: part.id,
            state: part.size > FILE_LIMIT * 1.4 ? 'too_large' : 'available', load: () => download(ref.uid, part.part || '1', FILE_LIMIT) })
        }
      }
      await walk(item.bodyStructure)
      const result = bodyMessage({ providerId: `${validity}:${ref.uid}`, internetMessageId: env.messageId, inReplyTo: env.inReplyTo, references: parsed.references,
        senderAddress: env.from?.[0]?.address || '', senderName: env.from?.[0]?.name || '', to: [...(env.to || []),...(env.cc || [])].map(v => v.address).filter(Boolean),
        replyTo: (env.replyTo || []).map(v=>v.address).filter(Boolean), subject: env.subject || '', receivedAt: new Date(item.internalDate || env.date || Date.now()).toISOString(), isRead: item.flags?.has('\\Seen') || false, attachments }, plain, html)
      if (bodyLimited) result.contentStatus = 'body_limited'
      return result
    },
    validity,
    async close() { lock?.release(); try { await client.logout() } catch { client.close() } },
  }
}
