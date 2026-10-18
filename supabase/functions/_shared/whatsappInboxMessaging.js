import { templateFields } from './whatsappCampaign.js'

export const INBOX_FILE_LIMIT = 8 * 1024 * 1024
export function inboxTemplateFields(template) {
  const result = templateFields(template)
  if (result.fields.some(field => field.kind === 'video')) result.unsupported.push('Video headers are not supported in this inbox.')
  return result
}
export function decodeInboxAttachment(file) {
  const mimeType = String(file?.mimeType || '')
  if (!['image/jpeg','image/png','application/pdf'].includes(mimeType)) throw new Error('Choose a JPEG, PNG or PDF file.')
  const base64 = String(file?.base64 || '')
  if (!base64 || base64.length > Math.ceil(INBOX_FILE_LIMIT / 3) * 4 || base64.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error('The attachment is invalid or larger than 8 MB.')
  let binary
  try { binary = atob(base64) } catch { throw new Error('The attachment is invalid.') }
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  const limit = mimeType === 'application/pdf' ? INBOX_FILE_LIMIT : 5 * 1024 * 1024
  if (!bytes.length || bytes.length > limit) throw new Error(mimeType === 'application/pdf' ? 'PDF files are limited to 8 MB.' : 'Photos are limited to 5 MB.')
  const valid = mimeType === 'image/jpeg' ? bytes[0]===255 && bytes[1]===216 && bytes[2]===255
    : mimeType === 'image/png' ? [137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value)
    : String.fromCharCode(...bytes.slice(0,5)) === '%PDF-'
  if (!valid) throw new Error('The file contents do not match its format.')
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'pdf'
  const name = String(file?.filename || 'attachment').replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,150).replace(/\.(?:jpg|jpeg|png|pdf)$/i,'') || 'attachment'
  return { bytes, mimeType, filename: `${name}.${extension}` }
}

export async function readMetaIntegrationPayload(request) {
  const max = 12 * 1024 * 1024
  if (Number(request.headers.get('content-length')) > max) throw new Error('Meta integration request is too large.')
  const reader = request.body?.getReader()
  if (!reader) throw new Error('A request body is required.')
  const chunks = []; let size = 0
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > max) throw new Error('Meta integration request is too large.'); chunks.push(value) }
  } finally { await reader.cancel() }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length }
  const payload = JSON.parse(new TextDecoder().decode(bytes))
  if (payload.action !== 'upload_attachment' && size > 50000) throw new Error('Meta integration request is too large.')
  return payload
}
