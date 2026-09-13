import { REVO_ORGANISATION_ID } from '../revoExtensionRegistry.js'
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient.js'

export const REVO_INBOX_CONNECTION_STATUSES = Object.freeze(['draft', 'authorizing', 'connected', 'expired', 'error', 'disconnected'])
export const REVO_INBOX_CONNECTION_KINDS = Object.freeze(['individual_mailbox', 'delegated_shared_mailbox'])
export const REVO_INBOX_OAUTH_PROVIDERS = Object.freeze(['microsoft_365', 'google_workspace'])

function text(value = '') {
  return String(value ?? '').trim()
}

function uuid(value = '') {
  const normalized = text(value)
  const parts = normalized.split('-')
  return parts.length === 5
    && [8, 4, 4, 4, 12].every((length, index) => parts[index].length === length)
    && parts.every((part) => /^[0-9a-f]+$/i.test(part))
}

function requireRevoOrganisation(organisationId) {
  if (text(organisationId) !== REVO_ORGANISATION_ID) throw new Error('Provider connections are only available for the Revo workspace.')
  return REVO_ORGANISATION_ID
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured for Revo provider connections.')
  return supabase
}

export function buildRevoInboxConnectionIntent({ organisationId, channelId, providerKey, connectionKind, mailboxAddress, actorUserId } = {}) {
  const provider = text(providerKey).toLowerCase()
  const kind = text(connectionKind).toLowerCase()
  if (!uuid(channelId)) throw new Error('Choose a valid Revo inbox channel.')
  if (!REVO_INBOX_OAUTH_PROVIDERS.includes(provider)) throw new Error('Choose Microsoft 365 or Google Workspace.')
  if (!REVO_INBOX_CONNECTION_KINDS.includes(kind)) throw new Error('Choose an individual or delegated shared mailbox connection.')
  if (!text(mailboxAddress)) throw new Error('Enter the mailbox address to connect.')
  if (!uuid(actorUserId)) throw new Error('A signed-in Revo administrator is required to start a provider connection.')
  return Object.freeze({
    organisationId: requireRevoOrganisation(organisationId),
    channelId: text(channelId),
    providerKey: provider,
    connectionKind: kind,
    mailboxAddress: text(mailboxAddress).toLowerCase(),
    actorUserId: text(actorUserId),
    status: 'authorizing',
  })
}

export function normalizeRevoInboxProviderConnection(row = {}) {
  const status = text(row.status).toLowerCase()
  return Object.freeze({
    id: text(row.id),
    organisationId: text(row.organisation_id),
    channelId: text(row.channel_id),
    providerKey: text(row.provider_key),
    connectionKind: text(row.connection_kind),
    mailboxAddress: text(row.mailbox_address),
    status: REVO_INBOX_CONNECTION_STATUSES.includes(status) ? status : 'error',
    grantedScopes: Array.isArray(row.granted_scopes) ? row.granted_scopes.map(text).filter(Boolean) : [],
    connectedBy: text(row.connected_by),
    connectedAt: row.connected_at || null,
    lastVerifiedAt: row.last_verified_at || null,
    lastSyncAt: row.last_sync_at || null,
    lastErrorCode: text(row.last_error_code),
    disconnectedAt: row.disconnected_at || null,
  })
}

export async function loadRevoInboxProviderConnections(organisationId) {
  const client = requireClient()
  const { data, error } = await client
    .from('revo_inbox_provider_connections')
    .select('id, organisation_id, channel_id, provider_key, connection_kind, mailbox_address, status, granted_scopes, connected_by, connected_at, last_verified_at, last_sync_at, last_error_code, disconnected_at')
    .eq('organisation_id', requireRevoOrganisation(organisationId))
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data || []).map(normalizeRevoInboxProviderConnection)
}

export async function startRevoMicrosoftInboxAuthorization(input = {}) {
  const client = requireClient()
  const intent = buildRevoInboxConnectionIntent({ ...input, providerKey: 'microsoft_365' })
  const { data, error } = await client.functions.invoke('revo-microsoft-inbox', {
    body: {
      action: 'start_authorization',
      organisationId: intent.organisationId,
      channelId: intent.channelId,
      connectionKind: intent.connectionKind,
      mailboxAddress: intent.mailboxAddress,
      returnUrl: text(input.returnUrl),
    },
  })
  if (error) throw error
  const authorizationUrl = text(data?.authorizationUrl)
  if (!authorizationUrl.startsWith('https://login.microsoftonline.com/')) throw new Error('Microsoft did not return a valid authorization URL.')
  return authorizationUrl
}

export async function startRevoGoogleWorkspaceInboxAuthorization(input = {}) {
  const client = requireClient()
  const intent = buildRevoInboxConnectionIntent({ ...input, providerKey: 'google_workspace' })
  const { data, error } = await client.functions.invoke('revo-google-workspace-inbox', {
    body: {
      action: 'start_authorization',
      organisationId: intent.organisationId,
      channelId: intent.channelId,
      connectionKind: intent.connectionKind,
      mailboxAddress: intent.mailboxAddress,
      returnUrl: text(input.returnUrl),
    },
  })
  if (error) throw error
  const authorizationUrl = text(data?.authorizationUrl)
  if (!authorizationUrl.startsWith('https://accounts.google.com/o/oauth2/v2/auth?')) throw new Error('Google did not return a valid authorization URL.')
  return authorizationUrl
}

export async function manageRevoInboxProviderConnection({ organisationId, connectionId, action } = {}) {
  const permittedActions = ['health_check', 'disconnect']
  if (!uuid(connectionId) || !permittedActions.includes(text(action))) throw new Error('Choose a valid Revo mailbox connection action.')
  const client = requireClient()
  const { data, error } = await client.functions.invoke('revo-inbox-connection-lifecycle', {
    body: { organisationId: requireRevoOrganisation(organisationId), connectionId: text(connectionId), action: text(action) },
  })
  if (error) throw error
  if (!REVO_INBOX_CONNECTION_STATUSES.includes(text(data?.status))) throw new Error('The mailbox connection returned an invalid lifecycle status.')
  return text(data.status)
}

export async function syncRevoInboxProviderConnection({ organisationId, connectionId } = {}) {
  if (!uuid(connectionId)) throw new Error('Choose a valid Revo mailbox connection to sync.')
  const client = requireClient()
  const { data, error } = await client.functions.invoke('revo-inbox-sync', {
    body: { organisationId: requireRevoOrganisation(organisationId), connectionId: text(connectionId) },
  })
  if (error) throw error
  if (text(data?.status) !== 'completed') throw new Error('The provider inbox sync did not complete.')
  return Object.freeze({ imported: Number(data.imported || 0), skipped: Number(data.skipped || 0) })
}
