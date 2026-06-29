import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {}
  const parsed = {}
  for (const rawLine of readFileSync(filePath, 'utf8').split(/\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([^=]+)=(.*)$/)
    if (!match) continue
    parsed[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return parsed
}

function loadEnv() {
  const root = resolve(import.meta.dirname, '..')
  return {
    ...readEnvFile(resolve(root, '.env')),
    ...readEnvFile(resolve(root, '.env.production.local')),
    ...readEnvFile(resolve(root, '.env.staging.local')),
    ...process.env,
  }
}

function required(env, key) {
  const value = String(env[key] || '').trim()
  if (!value) throw new Error(`Missing ${key}`)
  return value
}

function formatError(error) {
  if (!error) return ''
  return [
    error.code,
    error.message,
    error.details,
    error.hint,
  ].filter(Boolean).join(' | ')
}

async function expectStep(label, fn) {
  try {
    const data = await fn()
    return { label, ok: true, data }
  } catch (error) {
    return { label, ok: false, error }
  }
}

async function main() {
  const env = loadEnv()
  const supabaseUrl = required(env, 'SUPABASE_URL') || required(env, 'VITE_SUPABASE_URL')
  const anonKey = required(env, 'VITE_SUPABASE_ANON_KEY')
  const serviceRoleKey = required(env, 'SUPABASE_SERVICE_ROLE_KEY')
  const email = required(env, 'STAGING_INTERNAL_EMAIL')
  const password = required(env, 'STAGING_INTERNAL_PASSWORD')

  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const signIn = await anon.auth.signInWithPassword({ email, password })
  if (signIn.error) throw signIn.error
  const userId = signIn.data.user?.id
  const userEmail = signIn.data.user?.email

  const profileResult = userId
    ? await admin.from('profiles').select('id, email, role').eq('id', userId).maybeSingle()
    : { data: null }
  const membershipResult = userId
    ? await admin
        .from('organisation_users')
        .select('organisation_id, role, app_role, status')
        .eq('user_id', userId)
        .limit(5)
    : { data: [] }

  const stamp = Date.now()
  let developmentId = ''
  const results = []

  try {
    results.push(await expectStep('insert developments', async () => {
      const { data, error } = await anon
        .from('developments')
        .insert({
          name: `RLS Diagnostic Development ${stamp}`,
          planned_units: 1,
          country: 'South Africa',
          status: 'planning',
        })
        .select('id, name')
        .single()
      if (error) throw error
      developmentId = data.id
      return data
    }))

    if (developmentId) {
      results.push(await expectStep('upsert development_profiles', async () => {
        const { data, error } = await anon
          .from('development_profiles')
          .upsert({
            development_id: developmentId,
            code: `DIAG-${stamp}`,
            location: 'Diagnostic Location',
            suburb: 'Diagnostic Suburb',
            city: 'Cape Town',
            province: 'Western Cape',
            country: 'South Africa',
            address: '1 Diagnostic Road',
            formatted_address: '1 Diagnostic Road, Cape Town, South Africa',
            street_address: '1 Diagnostic Road',
            postal_code: '8001',
            description: 'RLS diagnostic profile',
            status: 'planning',
            developer_company: 'Diagnostic Developer',
            plans: [],
            site_plans: [],
            image_links: [],
            supporting_documents: [],
          }, { onConflict: 'development_id' })
          .select('development_id')
          .single()
        if (error) throw error
        return data
      }))

      results.push(await expectStep('insert development_participants', async () => {
        const { data, error } = await anon
          .from('development_participants')
          .insert({
            development_id: developmentId,
            user_id: userId || null,
            role_type: 'developer',
            participant_name: 'Diagnostic Participant',
            participant_email: `participant-${stamp}@example.com`,
            organisation_name: 'Diagnostic Organisation',
            is_primary: true,
            can_view: true,
            can_create_transactions: true,
            assignment_source: 'development_default',
            is_active: true,
          })
          .select('id, development_id, role_type')
          .single()
        if (error) throw error
        return data
      }))

      results.push(await expectStep('insert development_financials', async () => {
        const { data, error } = await anon
          .from('development_financials')
          .insert({
            development_id: developmentId,
            land_cost: 1,
            build_cost: 0,
            professional_fees: 0,
            marketing_cost: 0,
            infrastructure_cost: 0,
            other_costs: 0,
            total_projected_cost: 1,
            projected_gross_sales_value: 2,
            projected_profit: 1,
            target_margin: 50,
            notes: 'RLS diagnostic row',
          })
          .select('id, development_id')
          .single()
        if (error) throw error
        return data
      }))

      results.push(await expectStep('insert development_documents', async () => {
        const { data, error } = await anon
          .from('development_documents')
          .insert({
            development_id: developmentId,
            document_type: 'other',
            title: 'Diagnostic Document',
            description: 'RLS diagnostic document',
            file_url: 'https://example.com/diagnostic.pdf',
            uploaded_at: new Date().toISOString(),
          })
          .select('id, development_id, title')
          .single()
        if (error) throw error
        return data
      }))

      results.push(await expectStep('insert document_requirements', async () => {
        const { data, error } = await anon
          .from('document_requirements')
          .insert({
            development_id: developmentId,
            category_key: `diagnostic_${stamp}`,
            label: 'Diagnostic Requirement',
            sort_order: 999,
          })
          .select('id, development_id, category_key')
          .single()
        if (error) throw error
        return data
      }))

      results.push(await expectStep('upsert development_settings', async () => {
        const { data, error } = await anon
          .from('development_settings')
          .upsert({
            development_id: developmentId,
            client_portal_enabled: true,
            snag_reporting_enabled: true,
            alteration_requests_enabled: false,
            service_reviews_enabled: false,
          }, { onConflict: 'development_id' })
          .select('development_id')
          .single()
        if (error) throw error
        return data
      }))

      results.push(await expectStep('insert units', async () => {
        const { data, error } = await anon
          .from('units')
          .insert({
            development_id: developmentId,
            unit_number: `DIAG-${stamp}`,
            price: 1,
            list_price: 1,
            current_price: 1,
            status: 'Available',
          })
          .select('id, development_id, unit_number')
          .single()
        if (error) throw error
        return data
      }))

      results.push(await expectStep('insert development_attorney_configs', async () => {
        const { data, error } = await anon
          .from('development_attorney_configs')
          .insert({
            development_id: developmentId,
            attorney_firm_name: 'Diagnostic Attorney',
            primary_contact_email: `attorney-${stamp}@example.com`,
          })
          .select('id, development_id')
          .single()
        if (error) throw error
        return data
      }))

      results.push(await expectStep('insert development_bond_configs', async () => {
        const { data, error } = await anon
          .from('development_bond_configs')
          .insert({
            development_id: developmentId,
            bond_originator_name: 'Diagnostic Originator',
            primary_contact_email: `originator-${stamp}@example.com`,
          })
          .select('id, development_id')
          .single()
        if (error) throw error
        return data
      }))
    }
  } finally {
    if (developmentId) {
      await admin.from('developments').delete().eq('id', developmentId)
    }
  }

  console.log(`Signed in as ${userEmail || email}`)
  console.log(`Profile role: ${profileResult.data?.role || 'unknown'}`)
  console.log(`Membership roles: ${(membershipResult.data || []).map((row) => `${row.role || row.app_role}:${row.status}`).join(', ') || 'none'}`)
  console.log('')

  let failed = false
  for (const result of results) {
    if (result.ok) {
      console.log(`PASS ${result.label}`)
    } else {
      failed = true
      console.log(`FAIL ${result.label}`)
      console.log(`     ${formatError(result.error)}`)
    }
  }

  if (failed) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(formatError(error) || error)
  process.exitCode = 1
})
