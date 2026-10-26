import { inboxSignatureText, renderInboxSignature } from './inboxSignature.js'
export const OUTGOING_FILE_LIMIT = 10485760, OUTGOING_TOTAL_LIMIT = 20971520
export const OUTGOING_STATES = {queued:'Queued',preparing:'Preparing email',submitting:'Awaiting provider confirmation',accepted:'Accepted by provider',failed:'Not sent',uncertain:'Confirmation unavailable — check your provider’s Sent folder',cancelled:'Cancelled'}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')
export function outgoingRecipients(value) {
  const rows = Array.isArray(value) ? value : String(value || '').split(/[,;]/)
  const values = [...new Set(rows.map(address => String(address).trim()).filter(Boolean))]
  if(values.length > 50 || values.some(address => address.length>254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(address))) throw new Error('Enter valid email addresses separated by commas.')
  return values
}
export function normalizeOutgoing(input) {
  const to=outgoingRecipients(input.to),cc=outgoingRecipients(input.cc),bcc=outgoingRecipients(input.bcc)
  if(!to.length || to.length+cc.length+bcc.length>50) throw new Error('Choose at least one To address and no more than 50 recipients in total.')
  const subject=String(input.subject || '').trim(),body=String(input.body || '')
  if(!subject || subject.length>500 || [...subject].some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127)) throw new Error('Enter a subject of up to 500 characters on one line.')
  if(!body.trim() || new TextEncoder().encode(body).length>100000 || body.includes('\0')) throw new Error('Write a message of up to 100,000 bytes.')
  const attachmentIds=Array.isArray(input.attachmentIds)?input.attachmentIds:[]
  if(attachmentIds.length>10 || new Set(attachmentIds).size!==attachmentIds.length || attachmentIds.some(id=>!uuid.test(String(id)))) throw new Error('Choose up to 10 valid attachments.')
  if(input.conversationId && !uuid.test(input.conversationId)) throw new Error('Choose a valid conversation.')
  if(input.replyMessageId&&!uuid.test(input.replyMessageId))throw new Error('Choose a valid reply message.')
  const signatureRevision=Number(input.signatureRevision || 0)
  if(!Number.isSafeInteger(signatureRevision)||signatureRevision<0)throw new Error('Reload the mailbox signature.')
  return {to,cc,bcc,subject,body,attachmentIds,conversationId:input.conversationId||null,replyMessageId:input.replyMessageId||null,useSignature:input.useSignature===true,signatureRevision}
}
export function outgoingBody(payload, signature) {
  const html=`<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#243746">${escape(payload.body).replaceAll('\n','<br>')}</div>`
  return payload.useSignature ? {text:`${payload.body}\n\n-- \n${inboxSignatureText(signature)}`,html:`${html}<br><br>${renderInboxSignature(signature)}`} : {text:payload.body,html}
}
