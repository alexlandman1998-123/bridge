import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const root = resolve(import.meta.dirname, '..')
const migrationPath = resolve(root, '../supabase/migrations/202607180024_attorney_calendar_phase1_environment_recovery.sql')
const migration = readFileSync(migrationPath, 'utf8')
const liveMode = process.argv.includes('--live')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertIncludes(source, token, label = token) {
  assert(source.includes(token), `Expected ${label}`)
}

for (const token of [
  'grant select, insert, update on table public.profiles to authenticated',
  'profiles_select_authenticated_scope',
  'profiles_insert_own',
  'profiles_update_own',
  'bridge_attorney_can_manage_transaction',
  'bridge_can_access_appointment',
  'appointments_attorney_insert',
  'appointment_participants_attorney_insert',
  'create table if not exists public.appointment_notification_events',
  'create table if not exists public.appointment_reminders',
  'appointment_notification_events_select_scoped',
  'appointment_reminders_select_scoped',
  "notify pgrst, 'reload schema'",
]) {
  assertIncludes(migration, token)
}

assertIncludes(migration, "'reception_scheduling'", 'scheduling role database access')
assertIncludes(migration, 'coalesce(assignment.can_manage_signing, true)', 'assignment signing permission guard')
assertIncludes(migration, 'recipient_id = auth.uid()', 'recipient-owned notification visibility')

if (!liveMode) {
  console.log('attorney calendar Phase 1 migration contract passed')
  process.exit(0)
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY
const email = process.env.ATTORNEY_DEMO_EMAIL || 'attorney.demo@bridgenine.co.za'
const password = process.env.ATTORNEY_DEMO_PASSWORD

assert(url, 'SUPABASE_URL or VITE_SUPABASE_URL is required for live verification')
assert(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY is required for live verification')
assert(anonKey, 'VITE_SUPABASE_ANON_KEY is required for live verification')
assert(password, 'ATTORNEY_DEMO_PASSWORD is required for live verification')

const service = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

for (const table of [
  'profiles',
  'appointments',
  'appointment_participants',
  'appointment_notification_events',
  'appointment_reminders',
]) {
  const result = await service.from(table).select('*', { head: true, count: 'exact' }).limit(1)
  assert(!result.error, `${table} readiness failed: ${result.error?.message || 'unknown error'}`)
}

const actor = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const signIn = await actor.auth.signInWithPassword({ email, password })
assert(!signIn.error, `Attorney demo sign-in failed: ${signIn.error?.message || 'unknown error'}`)
assert(signIn.data?.user?.id, 'Attorney demo sign-in did not return a user')

const profile = await actor
  .from('profiles')
  .select('id, role, system_role, primary_attorney_firm_id, attorney_role')
  .eq('id', signIn.data.user.id)
  .maybeSingle()
assert(!profile.error, `Authenticated profile read failed: ${profile.error?.message || 'unknown error'}`)
assert(profile.data?.id === signIn.data.user.id, 'Authenticated profile row is missing')

const membership = await actor
  .from('attorney_firm_members')
  .select('id, firm_id, role, status')
  .eq('user_id', signIn.data.user.id)
  .eq('status', 'active')
  .limit(1)
assert(!membership.error, `Attorney membership read failed: ${membership.error?.message || 'unknown error'}`)
assert((membership.data || []).length > 0, 'Attorney demo account has no active firm membership')

const appointments = await actor
  .from('appointments')
  .select('appointment_id, transaction_id, status')
  .limit(1)
assert(!appointments.error, `Attorney appointment read failed: ${appointments.error?.message || 'unknown error'}`)

await actor.auth.signOut()
console.log('attorney calendar Phase 1 live readiness passed')
