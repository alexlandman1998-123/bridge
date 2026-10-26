import { createHash } from 'node:crypto'
import { FILE_LIMIT, MESSAGE_FILE_LIMIT, ReceiveError, fail, readBytes } from './common.mjs'
import { googleProvider } from './providers/google.mjs'
import { microsoftProvider } from './providers/microsoft.mjs'
import { imapProvider } from './providers/imap.mjs'
const hash = value => createHash('sha256').update(value).digest('hex')
export async function rpc(db, name, args) {
  const { data, error } = await db.rpc(name, args)
  if (error) { if (String(error.message).includes('outgoing_lease_lost')) fail('outgoing_lease_lost'); if (String(error.message).includes('mailbox_lease_lost')) fail('mailbox_lease_lost'); fail('receiving_storage_failed') }
  return data
}
export async function accessToken(connection, secret, rotate, { env = process.env, fetcher = fetch } = {}) {
  if (secret.access_token && Number(secret.expires_at) > Date.now() + 60000) return secret.access_token
  if (!secret.refresh_token) fail('oauth_access_revoked')
  const google = connection.provider_key === 'google_workspace'
  const id = env[google ? 'REVO_GOOGLE_CLIENT_ID' : 'REVO_MICROSOFT_CLIENT_ID'], clientSecret = env[google ? 'REVO_GOOGLE_CLIENT_SECRET' : 'REVO_MICROSOFT_CLIENT_SECRET']
  if (!id || !clientSecret) fail('oauth_server_configuration_missing')
  const url = google ? 'https://oauth2.googleapis.com/token' : `https://login.microsoftonline.com/${encodeURIComponent(env.REVO_MICROSOFT_TENANT_ID || 'organizations')}/oauth2/v2.0/token`
  let response
  try { response = await fetcher(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000), headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: id, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: secret.refresh_token }) }) }
  catch { fail('provider_unavailable') }
  const token = JSON.parse((await readBytes(response, 65536)).toString('utf8'))
  if (!response.ok || !token.access_token) fail(token.error === 'invalid_grant' ? 'oauth_access_revoked' : 'oauth_refresh_failed')
  const updated = { ...secret, ...token, refresh_token: token.refresh_token || secret.refresh_token, expires_at: Date.now() + Number(token.expires_in || 3600) * 1000 }
  await rotate(updated)
  return updated.access_token
}
export async function openProvider(connection, secret, rotate, dependencies) {
  if (connection.provider_key === 'other_email') return imapProvider(connection, secret, dependencies)
  const token = await accessToken(connection, secret, rotate, dependencies)
  if (connection.provider_key === 'google_workspace') return googleProvider(connection, token, dependencies?.fetcher)
  if (connection.provider_key === 'microsoft_365') return microsoftProvider(connection, token, dependencies?.fetcher)
  fail('provider_not_supported')
}
export async function receiveOne(db, { providerFactory = openProvider, log = console.info, now = Date.now } = {}) {
  const job = await rpc(db, 'shared_inbox_claim_mailbox')
  if (!job) return false
  const { connection, token, runId } = job, args = { p_connection: connection.id, p_token: token }
  let provider, pending = false
  const renew = () => rpc(db, 'shared_inbox_renew_mailbox', args)
  const commit = (message, checkpoint) => rpc(db, 'shared_inbox_commit_received', { ...args, p_message: message, p_checkpoint: checkpoint })
  try {
    const secret = await rpc(db, 'revo_read_inbox_connection_credential', { p_connection_id: connection.id })
    provider = await providerFactory(connection, secret, updated => rpc(db, 'shared_inbox_rotate_mailbox_credential', { ...args, p_secret: updated }))
    await provider.verify?.()
    let checkpoint = job.checkpoint || {}
    // UIDVALIDITY changes invalidate even a persisted, unfinished page.
    if (provider.validity && checkpoint.pending?.some(ref => ref.validity !== provider.validity)) checkpoint = {}
    if (!checkpoint.pending?.length) {
      const plan = await provider.plan(checkpoint.cursor)
      checkpoint = { cursor: checkpoint.cursor || {}, pending: plan.refs, next: plan.next, more: plan.more }
      if (!plan.refs.length) checkpoint = { cursor: plan.next, pending: [], more: plan.more }
      await commit(null, checkpoint)
    }
    const started = now(); let processed = 0
    while (checkpoint.pending?.length && processed < 10 && now() - started < 90000) {
      await renew()
      const message = await provider.read(checkpoint.pending[0])
      if (message) {
        let total = 0
        const manifest = []
        for (const file of message.attachments || []) {
          await renew()
          let state = file.state || 'available', bytes, objectPath = null
          if (state === 'available' && file.size > FILE_LIMIT) state = 'too_large'
          if (state === 'available' && total + file.size > MESSAGE_FILE_LIMIT) state = 'too_large'
          if (state === 'available') {
            bytes = await file.load()
            if (bytes.length > FILE_LIMIT || total + bytes.length > MESSAGE_FILE_LIMIT) state = 'too_large'
            else {
              total += bytes.length
              objectPath = `${connection.organisation_id}/${connection.channel_id}/${hash(message.providerId)}/${hash(Buffer.concat([Buffer.from(file.id),bytes]))}`
              await renew()
              const uploaded = await db.storage.from('shared-inbox-attachments').upload(objectPath, bytes, { contentType: 'application/octet-stream', upsert: false })
              if (uploaded.error && String(uploaded.error.statusCode) !== '409') fail('attachment_storage_failed')
            }
          }
          manifest.push({ id: file.id, filename: file.filename, contentType: file.contentType, size: state === 'available' ? bytes.length : file.size, contentId: file.contentId, isInline: file.isInline, state, objectPath })
        }
        message.attachments = manifest
      }
      const remaining = checkpoint.pending.slice(1)
      const next = remaining.length ? { ...checkpoint, pending: remaining } : { cursor: checkpoint.next, pending: [], more: checkpoint.more }
      await commit(message || { skipped: true }, next)
      checkpoint = next; processed++
    }
    pending = Boolean(checkpoint.pending?.length || checkpoint.more)
    await rpc(db, 'shared_inbox_finish_mailbox', { ...args, p_pending: pending, p_error: null, p_retry_seconds: 60 })
    log(JSON.stringify({ runId, status: 'completed', processed, pending }))
  } catch (error) {
    const code = error instanceof ReceiveError ? error.code : 'receiving_failed'
    try { await rpc(db, 'shared_inbox_finish_mailbox', { ...args, p_pending: true, p_error: code, p_retry_seconds: error.retrySeconds || Math.min(3600, 30 * 2 ** Math.min(6, connection.sync_attempt_count || 0)) }) } catch { /* A newer lease or a disconnect owns the mailbox now. */ }
    log(JSON.stringify({ runId, status: 'failed', code }))
  } finally { try { await provider?.close() } catch { /* Never log provider errors or credentials. */ } }
  return true
}
