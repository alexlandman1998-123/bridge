import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../agencyBranchService.js', import.meta.url), 'utf8')
const implementation = source.slice(source.indexOf('export async function updateBranch('), source.indexOf('export async function archiveBranch(')).replace('export ', '')
let stored = { id: 'branch-a', organisation_id: 'org-a', name: 'Head Office' }
let writeError = null
let authorised = true
const scopes = []
const supabase = { from(table) {
  assert.equal(table, 'organisation_branches')
  let patch
  const filters = {}
  const query = {
    update(value) { patch = value; return query },
    eq(key, value) { filters[key] = value; return query },
    select() { return query },
    async single() {
      scopes.push(filters)
      if (writeError) return { error: writeError }
      assert.deepEqual(filters, { id: 'branch-a', organisation_id: 'org-a' })
      stored = { ...stored, ...patch }
      return { data: { id: stored.id } }
    },
  }
  return query
} }
const read = async () => ({ name: stored.name, address: stored.address || '', coverImageUrl: stored.cover_image_url || '', principalUserId: stored.principal_user_id || '', managerName: stored.manager_name || '' })
const update = new Function('isSupabaseConfigured', 'supabase', 'normalizeText', 'resolveOrganisationContext', 'assertBranchManagementAccess', 'toSlug', 'isMissingTableError', 'recordSecurityAuditEvent', 'getBranch', `${implementation}; return updateBranch`)(true, supabase, value => String(value || '').trim(), async () => ({ organisationId: 'org-a', profile: { id: 'owner' } }), () => { if (!authorised) throw Error('Not authorised') }, value => value, () => false, async () => {}, read)
const cover = 'https://example.supabase.co/storage/v1/object/public/organisation-branding/organisations/org-a/branding/branch-cover.jpg'
await update('branch-a', { name: 'Cape Town', address: '12 Main Road', coverImageUrl: cover, principalUserId: 'manager-b', managerName: 'Second Manager', email: 'branch@example.com', phone: '0210000000' })
assert.deepEqual(await read(), { name: 'Cape Town', address: '12 Main Road', coverImageUrl: cover, principalUserId: 'manager-b', managerName: 'Second Manager' }, 'fresh read must retain every saved branch setting')
assert.equal(stored.email, 'branch@example.com')
assert.equal(stored.phone, '0210000000')
await update('branch-a', { phone: '0211111111' })
assert.equal((await read()).coverImageUrl, cover, 'a later profile edit must retain the uploaded cover')
writeError = Error('Write failed')
await assert.rejects(update('branch-a', { coverImageUrl: 'https://example.com/replacement.jpg' }), /Write failed/)
assert.equal((await read()).coverImageUrl, cover, 'a failed save must preserve the current image')
writeError = null
await update('branch-a', { coverImageUrl: '', principalUserId: '', managerName: '' })
assert.equal((await read()).coverImageUrl, '')
assert.equal((await read()).principalUserId, '')
authorised = false
const writes = scopes.length
await assert.rejects(update('branch-a', { name: 'Denied' }), /Not authorised/)
assert.equal(scopes.length, writes, 'permission failures must never write')
console.log('branch settings persistence: save/read-back, retained cover, failed writes, removal and permission scope passed')
