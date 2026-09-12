// Removes only this run's disposable, explicitly labelled browser-test evidence.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(readFileSync('.env.staging.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
assert.equal(env.VITE_SUPABASE_URL, 'https://vaszuxjeoajeuhlcnzzf.supabase.co')
assert.ok(process.argv.includes('--apply'))
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const read = async q => { const r = await q; if (r.error) throw r.error; return r.data }
const matter = 'b27fc192-b5ff-471b-9da5-902409f78116'
const names = ['STAGING-TEST-ONLY-document-acceptance.png', 'STAGING-TEST-ONLY-document-acceptance-linked.png']
assert.equal((await read(admin.from('transactions').select('is_demo_data').eq('id', matter).single())).is_demo_data, true)
const docs = await read(admin.from('documents').select('*').eq('transaction_id', matter).in('name', names))
// Review records the latest writer in source_system, so use the exact fixture ID.
const requirements = await read(admin.from('document_requirement_instances').select('*').eq('transaction_id', matter).eq('id', 'c2983504-5d01-421d-b708-7da56c6b7e9c'))
assert.ok(requirements.every(r => r.requirement_level === 'optional'))
assert.ok(requirements.every(r => r.document_definition_key === 'signed_otp' && ['labelled-document-acceptance-v1', 'internal_browser_review'].includes(r.source_system)))
assert.ok(requirements.every(r => !r.satisfied_by_document_id || docs.some(d => d.id === r.satisfied_by_document_id)))
for (const d of docs) {
  assert.ok(d.file_path.startsWith(`transaction-${matter}/`))
  assert.ok(names.some(n => d.file_path.endsWith(`-${n}`)))
  assert.ok(!d.canonical_requirement_instance_id || requirements.some(r => r.id === d.canonical_requirement_instance_id))
}
// Retain a local recovery record before deleting disposable test rows.
writeFileSync('test-results/document-acceptance-cleanup.json', JSON.stringify({ documents: docs, requirements }, null, 2))
for (const r of requirements) {
  await read(admin.from('document_requirement_instances').update({ satisfied_by_document_id: null }).eq('id', r.id).eq('transaction_id', matter))
}
for (const d of docs) {
  await read(admin.from('documents').delete().eq('id', d.id).eq('transaction_id', matter).in('name', names))
  await read(admin.storage.from(d.file_bucket || 'documents').remove([d.file_path]))
}
for (const r of requirements) await read(admin.from('document_requirement_instances').delete().eq('id', r.id).eq('transaction_id', matter))
console.log({ disposableDocumentsRemoved: docs.length, optionalTestRequirementsRemoved: requirements.length, repairedDemoSamplesRetained: 3 })
const interruptedFixture = await read(admin.from('documents').select('id,file_path,metadata').eq('id', '7f7b557e-3762-4c9c-b2b5-c5fa760a89d8').eq('transaction_id', matter).maybeSingle())
if (interruptedFixture) {
  assert.equal(interruptedFixture.metadata.fixture, 'document-storage-acceptance')
  assert.equal(interruptedFixture.file_path, `transaction-${matter}/storage-acceptance-4ff0aac5-938a-4225-901c-c8fd32f44f21.txt`)
  await read(admin.from('documents').delete().eq('id', interruptedFixture.id))
  await read(admin.storage.from('documents').remove([interruptedFixture.file_path]))
  console.log({ interruptedStorageTestRemoved: true })
}
