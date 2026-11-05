import { prepareWhatsAppChatImport } from '../_shared/whatsappChatExport.js'

export async function handleChatImport({ db, actor, org, payload, hash }) {
  if (!actor.isAdmin) throw Error('An organisation administrator must import chat history.')
  const phone = String(payload.contactPhone || '').replace(/[\s()+.-]/g, '')
  if (!/^[1-9][0-9]{6,14}$/.test(phone)) throw Error('Enter the customer’s full international WhatsApp number, including country code.')
  const parsed = prepareWhatsAppChatImport(payload.source, { dateOrder: payload.dateOrder, utcOffset: payload.utcOffset, businessAuthor: payload.businessAuthor })
  const messages = await Promise.all(parsed.messages.map(async row => ({
    at: row.at, body: row.body, direction: row.direction, precision: row.precision, occurrence: row.occurrence,
    key: await hash(JSON.stringify([payload.senderId, phone, row.direction, row.at, row.body, row.occurrence])),
  })))
  const { data, error } = await db.rpc('whatsapp_manual_chat_import', {
    p_org: org, p_actor: actor.userId, p_sender: payload.senderId, p_contact: phone,
    p_name: String(payload.contactName || '').trim().slice(0, 160), p_fingerprint: await hash(payload.source),
    p_options: { dateOrder: payload.dateOrder, utcOffset: payload.utcOffset, businessAuthor: payload.businessAuthor }, p_messages: messages,
  })
  if (error) throw Error(error.message)
  return data
}
