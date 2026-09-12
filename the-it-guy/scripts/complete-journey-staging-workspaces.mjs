// Staging-only fixture repair. No mail, production access, or matter writes.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createServer } from 'vite'

const env = Object.fromEntries(readFileSync('.env.staging.local', 'utf8').split(/\r?\n/)
  .filter(line => /^[A-Z_]+=/.test(line)).map(line => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')]
  }))
assert.equal(env.VITE_SUPABASE_URL, 'https://vaszuxjeoajeuhlcnzzf.supabase.co', 'Staging only')
const apply = process.argv.includes('--apply')
const fixture = 'journey-cross-role-staging-v1'
const matter = 'b27fc192-b5ff-471b-9da5-902409f78116'
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options)
const read = async query => { const result = await query; if (result.error) throw new Error(result.error.message); return result.data }
const before = await read(admin.from('transaction_participants').select('*').eq('transaction_id', matter).order('id'))
assert.equal((await read(admin.from('transactions').select('is_demo_data').eq('id', matter).single())).is_demo_data, true)

for (const role of ['agent', 'developer']) {
  const email = `journey.${role}.staging@example.test`
  const profile = await read(admin.from('profiles').select('id,role,first_name,last_name').eq('email', email).single())
  const auth = await admin.auth.admin.getUserById(profile.id)
  assert.equal(auth.data.user?.app_metadata?.fixture, fixture, 'Do not modify unrelated users')
  assert.equal(profile.role, role)
  const type = role === 'agent' ? 'agency' : 'developer_company'
  const name = `Journey ${role} staging — verification only`
  let org = await read(admin.from('organisations').select('id,is_demo_data,type,settings_json').contains('settings_json', { fixture, testRole: role }).maybeSingle())
  const memberships = await read(admin.from('organisation_users').select('id,organisation_id').eq('user_id', profile.id))
  assert.ok(memberships.every(row => row.organisation_id === org?.id), 'Unexpected existing workspace; manual review required')
  if (!apply) { console.log(JSON.stringify({ role, mode: 'preview', isolatedWorkspaceExists: Boolean(org), memberships: memberships.length, namesPresent: Boolean(profile.first_name && profile.last_name) })); continue }
  if (!org) org = await read(admin.from('organisations').insert({ name, display_name: name, type, workspace_kind: type,
    organization_type: role === 'agent' ? 'agency' : 'developer', status: 'active', is_demo_data: true,
    discovery_visibility: 'hidden', automatic_lead_acknowledgement_enabled: false,
    settings_json: { fixture, testRole: role } }).select('id,is_demo_data,type,settings_json').single())
  assert.equal(org.is_demo_data, true)
  assert.equal(org.type, type)
  const settings = await read(admin.from('organisation_settings').select('id').eq('organisation_id', org.id).maybeSingle())
  if (!settings) await read(admin.from('organisation_settings').insert({ organisation_id: org.id, is_demo_data: true, settings_json: { fixture } }))
  let branch = null
  if (role === 'agent') {
    branch = await read(admin.from('organisation_branches').select('id,is_demo_data').eq('organisation_id', org.id).eq('is_default', true).maybeSingle())
    if (!branch) branch = await read(admin.from('organisation_branches').insert({ organisation_id: org.id, name: 'Staging verification', is_default: true, is_head_office: true, is_active: true, is_demo_data: true, metadata_json: { fixture } }).select('id,is_demo_data').single())
    assert.equal(branch.is_demo_data, true)
  }
  if (!memberships.length) await read(admin.from('organisation_users').insert({ organisation_id: org.id, user_id: profile.id, email,
    first_name: 'Journey', last_name: `${role} staging`, role: role === 'agent' ? 'agent' : 'viewer',
    workspace_role: role === 'agent' ? 'agent' : 'viewer', organisation_role: role === 'agent' ? 'agent' : 'viewer',
    app_role: role, workspace_type: type, status: 'active', membership_status: 'active', branch_id: branch?.id || null,
    primary_branch_id: branch?.id || null, branch_scope: 'own', is_demo_data: true, scope_metadata: { fixture },
    accepted_at: new Date().toISOString() }))
  await read(admin.from('profiles').update({ first_name: 'Journey', last_name: `${role} staging`, company_name: name, onboarding_completed: true }).eq('id', profile.id))
  console.log(JSON.stringify({ role, setup: 'ready', isolatedWorkspace: org.id, productionChanges: 0, invitationsSent: 0 }))
}
assert.deepEqual(await read(admin.from('transaction_participants').select('*').eq('transaction_id', matter).order('id')), before, 'Matter access must remain unchanged')

if (apply) {
  for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_KEY']) process.env[key] = env[key]
  const server = await createServer({ configFile: false, envFile: false, logLevel: 'silent', server: { middlewareMode: true } })
  try {
    const { supabase } = await server.ssrLoadModule('/src/lib/supabaseClient.js')
    const { validateOnboardingCompletion } = await server.ssrLoadModule('/src/services/onboarding/onboardingValidation.js')
    const { fetchSharedMatterJourney } = await server.ssrLoadModule('/src/services/sharedMatterJourneyReader.js')
    let baseline
    for (const role of ['agent', 'developer']) {
      const generated = await admin.auth.admin.generateLink({ type: 'magiclink', email: `journey.${role}.staging@example.test` })
      if (generated.error) throw new Error(generated.error.message)
      const login = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: generated.data.properties.hashed_token })
      if (login.error) throw new Error(login.error.message)
      const validation = await validateOnboardingCompletion(login.data.user.id, { appRole: role })
      assert.equal(validation.ok, true, `${role}: ${validation.reason}`)
      const journey = await fetchSharedMatterJourney(supabase, matter, { audience: role })
      assert.equal(journey.status, 'ready')
      const outcomes = journey.snapshot.lanes.map(l => [l.key, l.phases.map(p => [p.key, p.tasks.map(t => [t.id,t.status])])])
      if (baseline) assert.deepEqual(outcomes, baseline); else baseline = outcomes
      console.log(JSON.stringify({ role, applicationOnboardingValidation: 'PASS', journeyRead: 'PASS' }))
      await supabase.auth.signOut({ scope: 'local' })
    }
  } finally { await server.close() }
}
process.exit(0)
