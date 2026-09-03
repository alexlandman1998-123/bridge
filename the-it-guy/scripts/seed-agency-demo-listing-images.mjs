#!/usr/bin/env node
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  ensureAgencyDemoWorkspace,
  getAgencyDemoAccount,
  getAgencyDemoConfig,
} from './agencyDemoBootstrap.mjs'

const args = new Set(process.argv.slice(2))
const argValue = (name, fallback = '') => {
  const prefix = `${name}=`
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : fallback
}

const ENVIRONMENT = String(argValue('--environment', process.env.AGENCY_DEMO_ENVIRONMENT || 'staging')).trim()
const ACCOUNT = getAgencyDemoAccount(argValue('--account', process.env.AGENCY_DEMO_ACCOUNT || 'home-seekers'))
const ACCOUNT_CONFIG = getAgencyDemoConfig(ACCOUNT)
const TARGET_EMAIL = String(process.env.AGENCY_DEMO_EMAIL || ACCOUNT_CONFIG.email).trim().toLowerCase()
const TARGET_PASSWORD = String(process.env.AGENCY_DEMO_PASSWORD || ACCOUNT_CONFIG.password).trim()
const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
const CAPTION_PREFIX = 'Agency demo cover image'

const LISTING_IMAGES = [
  {
    title: '116 Ridge Road',
    url: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=82',
  },
  {
    title: '117 Ridge Road',
    url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=82',
  },
]

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        const value = line
          .slice(separator + 1)
          .trim()
          .replace(/^['"]|['"]$/g, '')
          .replace(/\\n/g, '')
          .trim()
        return [line.slice(0, separator), value]
      }),
  )
}

const envFileByEnvironment = {
  production: '.env.production.local',
  prod: '.env.production.local',
  staging: '.env.staging.local',
  stage: '.env.staging.local',
}

const env = {
  ...parseEnvFile('.env'),
  ...(ENVIRONMENT === 'production' || ENVIRONMENT === 'prod' ? parseEnvFile('.env.property24.local') : {}),
  ...parseEnvFile(envFileByEnvironment[ENVIRONMENT] || '.env.staging.local'),
  ...process.env,
}

function envValue(...names) {
  for (const name of names) {
    const value = String(env[name] || '').trim()
    if (value) return value
  }
  return ''
}

async function fetchDefinitions() {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/openapi+json',
    },
  })
  if (!response.ok) {
    throw new Error(`Could not fetch Supabase schema: ${response.status} ${await response.text()}`)
  }
  const spec = await response.json()
  return Object.fromEntries(
    Object.entries(spec.definitions || {}).map(([table, schema]) => [
      table,
      new Set(Object.keys(schema.properties || {})),
    ]),
  )
}

const supabaseUrl = envValue('SUPABASE_URL', 'VITE_SUPABASE_URL')
const serviceRoleKey = envValue('SUPABASE_SERVICE_ROLE_KEY')
const projectRef = supabaseUrl.match(/^https:\/\/([^.]+)/)?.[1] || ''

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
}
if (projectRef === PRODUCTION_PROJECT_REF && !args.has('--confirm-production')) {
  throw new Error('Refusing to seed production without --confirm-production.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

async function fetchDemoOrganisationId() {
  const definitions = await fetchDefinitions()
  const context = await ensureAgencyDemoWorkspace(supabase, {
    definitions,
    email: TARGET_EMAIL,
    password: TARGET_PASSWORD,
    account: ACCOUNT,
  })
  return context.organisationId
}

async function main() {
  const organisationId = await fetchDemoOrganisationId()
  const listingTitles = LISTING_IMAGES.map((item) => item.title)
  const listingsResult = await supabase
    .from('private_listings')
    .select('id, title, address_line_1')
    .eq('organisation_id', organisationId)
    .in('title', listingTitles)

  if (listingsResult.error) throw listingsResult.error
  const listings = listingsResult.data || []
  if (!listings.length) {
    console.log(JSON.stringify({
      environment: ENVIRONMENT,
      projectRef,
      targetEmail: TARGET_EMAIL,
      organisationId,
      count: 0,
      listings: [],
      status: 'skipped_no_listings_found',
    }, null, 2))
    return
  }
  const rows = listings
    .map((listing) => {
      const image = LISTING_IMAGES.find((item) => item.title === listing.title)
      if (!image?.url) return null
      return {
        listing_id: listing.id,
        media_type: 'image',
        file_url: image.url,
        caption: `${CAPTION_PREFIX} - ${listing.title}`,
        sort_order: 0,
        is_cover: true,
      }
    })
    .filter(Boolean)

  if (!rows.length) {
    console.log(JSON.stringify({
      environment: ENVIRONMENT,
      projectRef,
      targetEmail: TARGET_EMAIL,
      organisationId,
      count: 0,
      listings: [],
      status: 'skipped_no_matching_listings',
    }, null, 2))
    return
  }

  const listingIds = rows.map((row) => row.listing_id)
  const deleteResult = await supabase
    .from('listing_media')
    .delete()
    .in('listing_id', listingIds)
    .like('caption', `${CAPTION_PREFIX}%`)
  if (deleteResult.error) throw deleteResult.error

  const insertResult = await supabase
    .from('listing_media')
    .insert(rows)
    .select('listing_id, file_url, caption, is_cover')
  if (insertResult.error) throw insertResult.error

  console.log(JSON.stringify({
    environment: ENVIRONMENT,
    projectRef,
    targetEmail: TARGET_EMAIL,
    organisationId,
    count: insertResult.data?.length || 0,
    listings: insertResult.data || [],
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
