import { createHash, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { createHomeSeekersSignupResponse } from './homeSeekersRecruitmentSignupApi.js'
import { HOME_SEEKERS_ORGANISATION_ID as org } from './homeSeekersWebsiteBridge.js'

const actions = ['resume', 'open_account', 'sign_in', 'send_verification', 'verify_email', 'sign_out', 'prepare_document', 'commit_document', 'download_document', 'prepare_photo', 'commit_photo']
const reply = (status, body) => ({ status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }, body })
const cookieName = `a9_recruitment_${org.replaceAll('-', '')}`
function sessionHash(value) {
  const raw = String(value || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1)
  return /^[a-f0-9]{64}$/.test(raw || '') ? createHash('sha256').update(raw).digest('hex') : null
}
async function withPhoto(db, tokenHash, applicant) {
  if (!applicant?.applicationSubmitted) return applicant
  const result = await db.rpc('recruitment_applicant_setup_photo', { p_organisation_id: org, p_token_hash: tokenHash })
  if (result.error) throw result.error
  if (!result.data?.path) return { ...applicant, photo: null }
  const signed = await db.storage.from('recruitment-profile-photos').createSignedUrl(result.data.path, 300)
  if (signed.error || !signed.data?.signedUrl) throw new Error('Photo unavailable')
  return { ...applicant, photo: { name: result.data.name, url: signed.data.signedUrl } }
}

export async function createRecruitmentApplicantSetupResponse({ method = 'POST', headers = {}, body = {}, env = process.env, client, authClient, preview = env.VERCEL_ENV === 'preview' } = {}) {
  if (method !== 'POST') return reply(405, { error: 'Use POST for applicant access.' })
  if (!body || !actions.includes(body.action)) return reply(400, { error: 'Invalid applicant request.' })
  if (headers.origin) {
    try { if (new URL(headers.origin).host.toLowerCase() !== String(headers.host || '').toLowerCase()) return reply(403, { error: 'Open your Home Seekers My Profile page to continue.' }) }
    catch { return reply(403, { error: 'Invalid applicant request.' }) }
  }
  if (preview) return reply(503, { error: 'Applicant access is unavailable in this preview. No details or files have been sent.' })
  let db = client
  try {
    if (!db) {
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return reply(503, { error: 'Applicant access is temporarily unavailable.' })
      db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    }
    const tokenHash = sessionHash(headers.cookie)
    if (body.action === 'open_account') {
      const bearer = /^Bearer (.+)$/.exec(headers.authorization || '')?.[1]
      if (!bearer) return reply(401, { error: 'Log in to open My Profile.' })
      const checked = await (authClient || db.auth).getUser(bearer)
      if (checked.error || !checked.data?.user?.id || !checked.data.user.email_confirmed_at || checked.data.user.is_anonymous) return reply(401, { error: 'Log in again to open My Profile.' })
      const receipt = await db.rpc('recruitment_applicant_account_receipt', { p_user_id: checked.data.user.id })
      if (receipt.error) throw receipt.error
      if (!receipt.data) return reply(409, { error: 'No recruitment application is available for this account.' })
      const opaque = randomBytes(32).toString('hex'), hash = createHash('sha256').update(opaque).digest('hex')
      const opened = await db.rpc('recruitment_open_applicant_session', { p_organisation_id: org, p_user_id: checked.data.user.id, p_token_hash: hash, p_submission_key: receipt.data })
      if (opened.error || opened.data !== true) throw new Error('Session unavailable')
      const resumed = await db.rpc('recruitment_resume_applicant', { p_organisation_id: org, p_token_hash: hash })
      if (resumed.error || resumed.data?.emailVerification !== 'verified') throw new Error('Session unavailable')
      const result = reply(200, { applicant: await withPhoto(db, hash, resumed.data) })
      const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(String(headers.host || ''))
      result.headers['Set-Cookie'] = `${cookieName}=${opaque}; Path=/api/; HttpOnly; SameSite=Lax; Max-Age=604800${local ? '' : '; Secure'}`
      return result
    }
    if (['prepare_photo', 'commit_photo'].includes(body.action)) {
      if (!tokenHash) return reply(401, { error: 'Log in again to update your profile picture.' })
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.requestId || '')) return reply(400, { error: 'Choose a profile picture.' })
      const args = { p_organisation_id: org, p_token_hash: tokenHash, p_request_id: body.requestId }
      if (body.action === 'prepare_photo') args.p_photo = Object.fromEntries(['name', 'size', 'mimeType'].map(key => [key, body.photo?.[key]]))
      const result = await db.rpc(body.action === 'prepare_photo' ? 'recruitment_prepare_applicant_photo' : 'recruitment_commit_applicant_photo', args)
      if (result.error) return reply(422, { error: 'Choose a JPG or PNG up to 2 MB. If the file was uploaded, retry to confirm it.' })
      if (result.data?.unavailable) return reply(401, { error: 'Your session expired or your profile is locked. Log in again.' })
      if (body.action === 'prepare_photo') {
        if (result.data?.committed) return reply(200, { committed: true })
        if (!result.data?.path) throw new Error('Upload unavailable')
        const signed = await db.storage.from('recruitment-profile-photos').createSignedUploadUrl(result.data.path, { upsert: false })
        if (signed.error || !signed.data?.signedUrl) throw new Error('Upload unavailable')
        return reply(200, { uploadUrl: signed.data.signedUrl })
      }
      if (!result.data?.saved) throw new Error('Upload unavailable')
      const resumed = await db.rpc('recruitment_resume_applicant', { p_organisation_id: org, p_token_hash: tokenHash })
      if (resumed.error || !resumed.data) throw new Error('Session unavailable')
      return reply(200, { saved: true, applicant: await withPhoto(db, tokenHash, resumed.data) })
    }
    const response = await createHomeSeekersSignupResponse({ method, headers, body, env, client: db, authClient, preview: false })
    if (response.status === 200 && response.body.applicant) {
      const hash = sessionHash(response.headers?.['Set-Cookie']) || tokenHash
      if (!hash) throw new Error('Session unavailable')
      response.body.applicant = await withPhoto(db, hash, response.body.applicant)
    }
    return response
  } catch { return reply(503, { error: 'My Profile is temporarily unavailable. Please retry.' }) }
}
