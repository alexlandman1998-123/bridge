import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

export async function documentAcceptanceReaders(env, matter, attorney) {
  assert.equal(env.VITE_SUPABASE_URL, 'https://vaszuxjeoajeuhlcnzzf.supabase.co')
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const client = (headers = {}) => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { ...options, global: { headers } })
  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options)
  const read = async (query) => { const result = await query; if (result.error) throw result.error; return result.data }
  const actors = { attorney }
  for (const role of ['agent', 'developer']) {
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: `journey.${role}.staging@example.test` })
    if (link.error) throw link.error
    const actor = client()
    const login = await actor.auth.verifyOtp({ type: 'magiclink', token_hash: link.data.properties.hashed_token })
    if (login.error) throw login.error
    actors[role] = actor
  }
  const portal = await read(admin.from('client_portal_links').select('token').eq('transaction_id', matter).eq('is_active', true).limit(1).single())
  actors.buyer = client({ 'x-bridge-client-portal-token': portal.token })
  const tx = await read(admin.from('transactions').select('listing_id').eq('id', matter).single())
  const seller = await read(admin.from('private_listing_seller_onboarding').select('seller_portal_token').eq('private_listing_id', tx.listing_id).single())
  const session = await read(client().rpc('bridge_verify_private_listing_seller_portal_password', { p_token: seller.seller_portal_token, p_password: env.ATTORNEY_DEMO_PASSWORD }))
  assert.ok(session.accessToken)
  actors.seller = client({ 'x-bridge-seller-portal-token': session.stablePortalToken || seller.seller_portal_token, 'x-bridge-seller-portal-access-token': session.accessToken })
  return async (documentId, expectedStatus) => {
    for (const [role, actor] of Object.entries(actors)) {
      console.log('Checking browser-uploaded evidence', role, expectedStatus)
      const doc = await read(actor.from('documents').select('id,review_status,status,file_path').eq('id', documentId).single())
      assert.equal(doc.review_status || doc.status, expectedStatus, `${role} review outcome differs`)
      const signed = await read(actor.storage.from('documents').createSignedUrl(doc.file_path, 60))
      const response = await fetch(signed.signedUrl)
      assert.ok(response.ok, `${role} cannot open shared evidence`)
      assert.ok((await response.arrayBuffer()).byteLength > 100)
    }
    console.log(`Five-role metadata and stored-file reads: ${expectedStatus} PASS`)
  }
}
