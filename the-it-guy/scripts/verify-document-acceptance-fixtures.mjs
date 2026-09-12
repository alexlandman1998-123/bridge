import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(readFileSync('.env.staging.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
assert.equal(env.VITE_SUPABASE_URL, 'https://vaszuxjeoajeuhlcnzzf.supabase.co')
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const read = async q => { const r = await q; if (r.error) throw r.error; return r.data }
await read(client.auth.signInWithPassword({ email: 'attorney.demo@arch9.co.za', password: env.ATTORNEY_DEMO_PASSWORD }))
for (const id of ['a2ed99d4-8dc8-4fab-b6a2-e3fb688d7888','af2c0c2f-9a5b-463b-ab4b-19c3d3300de6','47053304-45c7-4cbe-bf46-69b12b98b082']) {
  const doc = await read(client.from('documents').select('name,file_path,file_bucket,review_status,metadata').eq('id', id).single())
  assert.equal(doc.metadata.acceptanceFixture, 'labelled-document-acceptance-v1')
  assert.equal(doc.review_status, 'uploaded')
  assert.match(doc.name, /^STAGING TEST ONLY/)
  const signed = await read(client.storage.from(doc.file_bucket).createSignedUrl(doc.file_path, 60))
  const response = await fetch(signed.signedUrl)
  assert.ok(response.ok)
  const bytes = Buffer.from(await response.arrayBuffer())
  assert.deepEqual([...bytes.subarray(0,8)], [137,80,78,71,13,10,26,10])
  console.log({ id, labelledFixtureOpensAsAttorney: true, notApproved: true })
}
