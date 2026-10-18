import { isUuid, text } from '../_shared/metaIntegrationCore.js'
import { normalizePhone } from '../_shared/whatsappCampaign.js'

const kinds = new Set(['buyer', 'seller', 'recruitment'])
async function result(query) {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data
}
function recordView(record) {
  const { kind, recordId, name, phone, source } = record
  return { kind, recordId, name, phone, source, path: kind === 'recruitment' ? `/agency/recruitment/${recordId}` : `/pipeline/leads/${recordId}` }
}

export async function handleCrmLink({ db, actor, org, action, payload, conversation }) {
  // Using the user's client is essential: inbox management is not permission to
  // read every CRM record (in particular, Recruitment). Never fall back to db.
  if (!actor.userDb) throw new Error('CRM access is unavailable. Sign in again.')
  const records = fields => result(actor.userDb.rpc('whatsapp_crm_records', { p_org: org, ...fields }))
  const request = (operation, fields = {}) => result(db.rpc('whatsapp_crm_link_request', {
    p_org: org, p_actor: actor.userId, p_action: operation, ...fields,
  }))
  async function visibleRecord(kind, id) {
    const rows = await records({ p_record: id, p_kind: kind })
    const row = rows.find(record => record.recordId === id && (!kind || record.kind === kind))
    if (!row) throw new Error('CRM record is unavailable in this workspace.')
    return row
  }
  if (action === 'crm_conversations') {
    const kind = text(payload.kind), recordId = text(payload.recordId)
    if (!kinds.has(kind) || !isUuid(recordId)) throw new Error('Choose a Buyer, Seller or Recruitment record.')
    const record = await visibleRecord(kind, recordId)
    const data = await request('record_threads', { p_kind: kind, p_record: recordId })
    await visibleRecord(kind, recordId)
    return { ...data, record: recordView(record) }
  }
  const thread = await conversation(org, actor, payload.conversationId)
  if (action === 'link_crm' || action === 'unlink_crm') {
    const kind = text(payload.kind), recordId = text(payload.recordId)
    let recordStamp = null
    if (!Number.isInteger(payload.linkVersion) || !Number.isInteger(payload.assignmentVersion)) throw new Error('Refresh the conversation before linking.')
    if (action === 'link_crm') {
      if (!kinds.has(kind) || !isUuid(recordId)) throw new Error('Choose a matching CRM record.')
      const record = await visibleRecord(kind, recordId)
      recordStamp = record.accessStamp
      if (!normalizePhone(record.phone) || normalizePhone(record.phone) !== thread.contact_phone) throw new Error('The CRM phone no longer matches this conversation.')
    }
    return request(action === 'link_crm' ? 'link' : 'unlink', {
      p_conversation: thread.id, p_kind: kind || null, p_record: recordId || null,
      p_version: payload.linkVersion, p_assignment_version: payload.assignmentVersion,
      p_record_stamp: recordStamp,
    })
  }
  const state = await request('context', { p_conversation: thread.id })
  const linkedId = state.leadId || state.recruitmentLeadId
  const [matches, linkedRecords] = await Promise.all([
    records({ p_phone: thread.contact_phone }),
    linkedId ? records({ p_record: linkedId, p_kind: state.recruitmentLeadId ? 'recruitment' : null }) : [],
  ])
  const linked = linkedRecords.find(record => record.recordId === linkedId)
  // Access may have been removed while the CRM query was in flight.
  await conversation(org, actor, thread.id)
  return {
    version: state.version, assignmentVersion: thread.assignment_version,
    linked: linked ? { ...recordView(linked), phoneMatches: normalizePhone(linked.phone) === thread.contact_phone } : null,
    linkedUnavailable: Boolean(linkedId && !linked), candidates: matches.slice(0, 50).map(recordView),
    truncated: matches.length > 50, campaigns: state.campaigns || [],
  }
}
