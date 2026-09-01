import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function getServerSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('The public websites service is not configured with server-only Supabase credentials.')
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
