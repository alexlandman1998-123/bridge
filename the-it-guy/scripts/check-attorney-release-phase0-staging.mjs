import { createClient } from '@supabase/supabase-js'
import { ATTORNEY_RELEASE_ROLES } from '../src/constants/attorneyReleaseReadinessPhase0.js'
import { inspectAttorneyStagingTarget } from './lib/attorney-staging-safety.mjs'

const text = (value) => String(value || '').trim()
const url = text(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
const anonKey = text(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY)
const serviceKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY)
const admin = url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null
const blockers = []
const actors = []
const safety = inspectAttorneyStagingTarget({
  supabaseUrl: url,
  expectedProjectRef: process.env.SUPABASE_STAGING_PROJECT_REF,
  productionProjectRef: process.env.VITE_PRODUCTION_SUPABASE_PROJECT_REF,
  environment: 'staging',
  recoveryConfirmation: process.env.SUPABASE_STAGING_RECOVERY_CONFIRMED,
  requireRecovery: true,
})
blockers.push(...safety.blockers)
if (!url) blockers.push({ code: 'SUPABASE_URL_MISSING', remedy: 'Configure SUPABASE_URL for staging.' })
if (!anonKey) blockers.push({ code: 'SUPABASE_ANON_KEY_MISSING', remedy: 'Configure the staging anonymous key.' })
const safeToConnect = safety.safe

for (const role of ATTORNEY_RELEASE_ROLES) {
  const email = text(process.env[`${role.envPrefix}_EMAIL`]) || `${role.key}.attorney.uat@arch9.co.za`
  const password = text(process.env[`${role.envPrefix}_PASSWORD`] || process.env.ATTORNEY_DEMO_PASSWORD)
  const result = { role: role.transactionRole, configured: Boolean(email && password), authenticated: false }
  if (!result.configured) blockers.push({ code: `${role.envPrefix}_CREDENTIALS_MISSING`, remedy: `Configure ${role.envPrefix}_EMAIL and ${role.envPrefix}_PASSWORD.` })
  else if (url && anonKey && safeToConnect) {
    const actor = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const auth = await actor.auth.signInWithPassword({ email, password })
    result.authenticated = Boolean(auth.data?.user?.id && !auth.error)
    result.userId = auth.data?.user?.id || null
    if (!result.authenticated) blockers.push({ code: `${role.envPrefix}_AUTH_FAILED`, remedy: `Repair the managed ${role.label} staging actor.` })
    if (result.userId && admin) {
      const membership = await admin.from('organisation_users').select('organisation_id,workspace_type,status').eq('user_id', result.userId).eq('workspace_type', 'attorney_firm').in('status', ['active', 'invited']).limit(1)
      result.activeAttorneyMembership = Boolean(membership.data?.[0]?.organisation_id && !membership.error)
      if (!result.activeAttorneyMembership) blockers.push({ code: `${role.envPrefix}_MEMBERSHIP_MISSING`, remedy: `Assign the managed ${role.label} actor to an active attorney-firm membership.` })
      const assignments = await admin
        .from('transaction_attorney_assignments')
        .select('id,attorney_role')
        .or(`attorney_user_id.eq.${result.userId},assigned_user_id.eq.${result.userId}`)
        .eq('is_demo_data', true)
      result.roleAssignmentCount = (assignments.data || []).filter((item) => item.attorney_role === role.transactionRole).length
      result.otherRoleAssignmentCount = (assignments.data || []).filter((item) => item.attorney_role !== role.transactionRole).length
      if (assignments.error || result.roleAssignmentCount < 1) blockers.push({ code: `${role.envPrefix}_ASSIGNMENT_MISSING`, remedy: `Assign the managed ${role.label} actor to its seeded workflow lanes.` })
      if (result.otherRoleAssignmentCount > 0) blockers.push({ code: `${role.envPrefix}_CROSS_ROLE_ASSIGNMENT`, remedy: `Remove seeded assignments outside the ${role.label} role.` })
    } else result.activeAttorneyMembership = false
    await actor.auth.signOut().catch(() => {})
  }
  actors.push(result)
}

let fixture = { checked: false, ready: false }
if (admin && safeToConnect) {
  const manifest = await admin.from('demo_seed_manifests').select('demo_key,status,expected_records').eq('environment', 'staging').eq('demo_key', 'attorney-demo-full-workflows-v1').maybeSingle()
  fixture = { checked: true, ready: Boolean(manifest.data && !manifest.error), status: manifest.data?.status || null, expectedTransactions: Number(manifest.data?.expected_records?.transactions || 0) }
  if (!fixture.ready || fixture.expectedTransactions < 1) blockers.push({ code: 'ATTORNEY_FIXTURE_MANIFEST_MISSING', remedy: 'Run the deterministic attorney demo seeder against staging.' })
} else blockers.push({ code: 'FIXTURE_CHECK_UNAVAILABLE', remedy: 'Configure SUPABASE_SERVICE_ROLE_KEY to verify the staging fixture manifest.' })

const report = { phase: 0, status: blockers.length ? 'NO_GO' : 'GO', safety: { safe: safety.safe, projectRef: safety.projectRef }, actors, fixture, blockers }
console.log(JSON.stringify(report, null, 2))
if (blockers.length) process.exitCode = 1
