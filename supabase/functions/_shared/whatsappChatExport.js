// WhatsApp text exports contain local wall-clock times, not provider message IDs.
export const CHAT_EXPORT_MAX_BYTES = 1024 * 1024
export const CHAT_EXPORT_MAX_MESSAGES = 500
const clean = value => String(value ?? '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim()

function timestamp(date, time, order, offset) {
  const parts = date.split(/[/.\-]/).map(Number)
  let year, month, day
  if (String(date).split(/[/.\-]/)[0].length === 4) [year, month, day] = parts
  else { year = parts[2]; [day, month] = order === 'DMY' ? parts : [parts[1], parts[0]] }
  if (year < 100) year += year >= 70 ? 1900 : 2000
  const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(time)
  if (!clock) throw Error('Unsupported export time. Use an unmodified WhatsApp text export.')
  let hour = Number(clock[1]); const minute = Number(clock[2]), second = Number(clock[3] || 0)
  if (clock[4]) { if (hour < 1 || hour > 12) throw Error('Invalid export time.'); hour = hour % 12 + (clock[4].toUpperCase() === 'PM' ? 12 : 0) }
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (year < 2000 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59 || local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day) throw Error('Invalid export date. Check the day/month order.')
  const zone = /^([+-])(\d{2}):(\d{2})$/.exec(offset)
  if (!zone || Number(zone[2]) > 14 || Number(zone[3]) > 59 || (Number(zone[2]) === 14 && Number(zone[3]) !== 0)) throw Error('Enter a UTC offset such as +02:00.')
  const minutes = (Number(zone[2]) * 60 + Number(zone[3])) * (zone[1] === '+' ? 1 : -1)
  return { at: new Date(local.getTime() - minutes * 60000).toISOString(), precision: clock[3] === undefined ? 'minute' : 'second' }
}

export function parseWhatsAppChatExport(source, { dateOrder = 'DMY', utcOffset = '+02:00' } = {}) {
  if (typeof source !== 'string' || new TextEncoder().encode(source).length > CHAT_EXPORT_MAX_BYTES) throw Error('Choose a text export smaller than 1 MB.')
  if (!['DMY', 'MDY'].includes(dateOrder)) throw Error('Choose the export’s day/month order.')
  if (source.includes('\0')) throw Error('This is not a WhatsApp text export.')
  const records = []; let current = null, skipped = 0
  for (const original of source.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = original.replace(/^[\u200e\u200f\u202a-\u202e\u2066-\u2069]+/, '').replace(/[\u00a0\u202f]/g, ' ')
    const match = /^(?:\[(\d{1,4}[/.\-]\d{1,2}[/.\-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\]\s*|(\d{1,4}[/.\-]\d{1,2}[/.\-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\s+-\s+)(.*)$/i.exec(line)
    if (!match) {
      if (current) current.body += `\n${original}`
      else if (line.trim()) throw Error('Unrecognised export header. Choose the original WhatsApp .txt file.')
      continue
    }
    const stamp = timestamp(match[1] || match[3], match[2] || match[4], dateOrder, utcOffset)
    const author = /^([^:\n]{1,160}): (.*)$/.exec(match[5])
    current = null
    if (!author) { skipped++; continue }
    current = { ...stamp, author: clean(author[1]), body: author[2] }; records.push(current)
    if (records.length > CHAT_EXPORT_MAX_MESSAGES) throw Error('This pilot accepts up to 500 messages per export. No messages were imported.')
  }
  for (const row of records) {
    row.body = row.body.trimEnd()
    if (!row.author || !row.body || row.body.length > 16000) throw Error('An exported message is empty or exceeds 16,000 characters.')
    // Text-only pilot: do not imply missing attachments have been imported.
    if (/^(?:<[^>]*(?:omitted|attached)[^>]*>|.*\((?:file attached|media omitted)\)|(?:image|video|audio|sticker|document) omitted)$/i.test(clean(row.body))) row.body = `[Attachment not imported] ${row.body}`
  }
  const participants = [...new Set(records.map(row => row.author))]
  if (!records.length) throw Error('No messages found in this WhatsApp export.')
  if (participants.length > 2) throw Error('This pilot imports one-to-one chats only. Group chats are not supported.')
  return { messages: records, participants, skipped, firstAt: records.reduce((a, r) => r.at < a ? r.at : a, records[0].at), lastAt: records.reduce((a, r) => r.at > a ? r.at : a, records[0].at) }
}

export function prepareWhatsAppChatImport(source, options = {}) {
  const parsed = parseWhatsAppChatExport(source, options)
  if (!parsed.participants.includes(options.businessAuthor)) throw Error('Choose which participant represents your business.')
  const occurrences = new Map()
  const messages = parsed.messages.map(row => {
    const direction = row.author === options.businessAuthor ? 'outbound' : 'inbound'
    const key = JSON.stringify([row.at, direction, row.body])
    const occurrence = (occurrences.get(key) || 0) + 1; occurrences.set(key, occurrence)
    return { ...row, direction, occurrence }
  })
  return { ...parsed, messages }
}
