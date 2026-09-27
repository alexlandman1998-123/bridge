import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'

function jwtRole(token = '') {
  try {
    const payload = String(token).split('.')[1]
    if (!payload) return ''
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).role || ''
  } catch {
    return ''
  }
}

// Verification snapshots contain protected document metadata. This helper is
// server-side only; never import it into src/ or expose its key in output.
export function createCanonicalVerificationClient(env = {
  ...loadEnv('staging', process.cwd(), ''),
  ...process.env,
}) {
  const url = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim()
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || !key) throw new Error('Staging verification requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  if (jwtRole(key) !== 'service_role' && !key.startsWith('sb_secret_')) {
    throw new Error('Canonical verification requires a server-side Supabase service-role or secret key.')
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
