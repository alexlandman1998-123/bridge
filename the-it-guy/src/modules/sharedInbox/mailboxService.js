import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

export const MAILBOX_ACCESS_SCOPES = Object.freeze(['workspace', 'private', 'selected'])
export const MAILBOX_MEMBER_ROLES = Object.freeze(['viewer', 'responder', 'manager'])
const PROVIDERS = new Set(['microsoft_365', 'google_workspace', 'other_email'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const text = value => String(value ?? '').trim()
const fields = 'id,organisation_id,channel,provider_key,address,display_name,access_scope,owner_user_id,connection_status,is_default,created_at,updated_at'
function id(value, label) {
  if (!UUID.test(text(value))) throw new Error(`Choose a valid ${label}.`)
  return text(value)
}
function scope(value) {
  const normalized = text(value).toLowerCase()
  if (!MAILBOX_ACCESS_SCOPES.includes(normalized)) throw new Error('Choose private, selected team members, or the whole workspace.')
  return normalized
}
function client() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured for mailboxes.')
  return supabase
}
function result(response) {
  if (response.error) throw response.error
  return response.data
}

export function buildMailboxInput({ organisationId, actorUserId, providerKey, address, displayName, accessScope = 'private', ownerUserId = actorUserId } = {}) {
  const provider = text(providerKey).toLowerCase()
  if (!PROVIDERS.has(provider)) throw new Error('Choose a supported email provider.')
  if (text(ownerUserId) !== text(actorUserId)) throw new Error('Create the mailbox in your name before transferring ownership.')
  const email = text(address).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid mailbox email address.')
  return {
    organisation_id: id(organisationId, 'organisation'), channel: 'email', provider_key: provider,
    address: email, display_name: text(displayName) || null, access_scope: scope(accessScope),
    owner_user_id: id(ownerUserId, 'mailbox owner'), created_by: id(actorUserId, 'signed-in user'),
    connection_status: 'draft', is_default: false,
  }
}

export function normalizeMailbox(row) {
  return {
    id: row.id, organisationId: row.organisation_id, providerKey: row.provider_key,
    address: row.address, displayName: row.display_name || '', accessScope: row.access_scope,
    ownerUserId: row.owner_user_id || null, connectionStatus: row.connection_status,
    isDefault: row.is_default === true,
  }
}

// Mailbox settings use the foundation schema. The conversation reader retains
// its existing queries and does not depend on the new signature table.
export async function loadMailboxes(organisationId) {
  return (result(await client().from('revo_inbox_channels').select(fields)
    .eq('organisation_id', id(organisationId, 'organisation')).eq('channel', 'email')
    .order('created_at', { ascending: true })) || []).map(normalizeMailbox)
}
export async function createMailbox(input) {
  const payload = buildMailboxInput(input)
  return normalizeMailbox(result(await client().from('revo_inbox_channels').insert(payload).select(fields).single()))
}
export async function updateMailboxAccess({ organisationId, channelId, accessScope, ownerUserId }) {
  const mailbox = result(await client().rpc('shared_inbox_update_mailbox_access', {
    p_organisation_id: id(organisationId, 'organisation'), p_channel_id: id(channelId, 'mailbox'),
    p_access_scope: scope(accessScope), p_owner_user_id: ownerUserId === undefined ? null : id(ownerUserId, 'mailbox owner'),
  }))
  if (!mailbox) throw new Error('Mailbox access could not be changed.')
  return normalizeMailbox(mailbox)
}

export async function loadMailboxMembers({ organisationId, channelId }) {
  return result(await client().from('shared_inbox_mailbox_members').select('user_id,access_role')
    .eq('organisation_id', id(organisationId, 'organisation')).eq('channel_id', id(channelId, 'mailbox'))) || []
}
export async function setMailboxMember({ organisationId, channelId, userId, accessRole }) {
  if (!MAILBOX_MEMBER_ROLES.includes(accessRole)) throw new Error('Choose a viewer, responder, or manager role.')
  result(await client().from('shared_inbox_mailbox_members').upsert({
    organisation_id: id(organisationId, 'organisation'), channel_id: id(channelId, 'mailbox'),
    user_id: id(userId, 'team member'), access_role: accessRole,
  }, { onConflict: 'channel_id,user_id' }))
}
export async function removeMailboxMember({ organisationId, channelId, userId }) {
  const removed = result(await client().from('shared_inbox_mailbox_members').delete()
    .eq('organisation_id', id(organisationId, 'organisation')).eq('channel_id', id(channelId, 'mailbox'))
    .eq('user_id', id(userId, 'team member')).select('user_id'))
  if (!removed?.length) throw new Error('Member access could not be removed. Reload the mailbox and try again.')
}
export async function loadMailboxPermissions({ organisationId, channelId }) {
  return result(await client().rpc('shared_inbox_mailbox_permissions', {
    p_organisation_id: id(organisationId, 'organisation'), p_channel_id: id(channelId, 'mailbox'),
  }))
}

export async function loadEmailMailboxSettings(organisationId) {
  const data = result(await client().rpc('shared_inbox_email_settings', { p_organisation_id: id(organisationId, 'organisation') }))
  if (!data || !Array.isArray(data.mailboxes)) throw new Error('Mailbox settings could not be loaded.')
  return {
    canCreatePrivate: data?.canCreatePrivate === true, canCreateShared: data?.canCreateShared === true,
    mailboxes: (data?.mailboxes || []).map(row => ({ ...normalizeMailbox(row), permissions: row.permissions || {}, connection: row.connection || null })),
  }
}
export async function loadMailboxPeople({ organisationId, channelId }) {
  return result(await client().rpc('shared_inbox_mailbox_people', {
    p_organisation_id: id(organisationId, 'organisation'), p_channel_id: id(channelId, 'mailbox'),
  })) || []
}
export async function loadMailboxSignature({ organisationId, channelId }) {
  return result(await client().from('shared_inbox_mailbox_signatures')
    .select('signature_json,use_for_new,use_for_replies,revision,updated_at')
    .eq('organisation_id', id(organisationId, 'organisation')).eq('channel_id', id(channelId, 'mailbox')).maybeSingle())
}
export async function saveMailboxSignature({ organisationId, channelId, signature, useForNew, useForReplies, revision }) {
  const { normalizeInboxSignature } = await import('../../../../supabase/functions/_shared/inboxSignature.js')
  return result(await client().rpc('shared_inbox_save_mailbox_signature', {
    p_organisation_id: id(organisationId, 'organisation'), p_channel_id: id(channelId, 'mailbox'),
    p_signature: normalizeInboxSignature(signature), p_use_for_new: useForNew === true,
    p_use_for_replies: useForReplies === true, p_revision: revision,
  }))
}

export async function configureImapMailbox({ organisationId, channelId, host, username, password }) {
  if (!/^[a-z0-9][a-z0-9.-]{1,250}\.[a-z]{2,}$/i.test(text(host)) || !text(username) || !password) throw new Error('Enter the IMAP server, username and password.')
  const data = result(await client().functions.invoke('revo-imap-inbox', { body: {
    organisationId: id(organisationId, 'organisation'), channelId: id(channelId, 'mailbox'),
    host: text(host).toLowerCase(), port: 993, username: text(username), password,
  } }))
  if (data?.status !== 'authorizing') throw new Error('The IMAP connection test could not be queued.')
  return data
}
export async function requestMailboxHistory({ organisationId, connectionId, historyDays }) {
  if (![0,7,30,90].includes(historyDays)) throw new Error('Choose a valid history window.')
  return result(await client().rpc('shared_inbox_request_sync', {
    p_organisation_id: id(organisationId, 'organisation'), p_connection_id: id(connectionId, 'connection'), p_history_days: historyDays,
  }))
}
