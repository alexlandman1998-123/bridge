import { createClient } from '@supabase/supabase-js'
import {
  createPublicListingLaunchPlan,
  normalizePublicListingText,
} from '../server/services/publicListingReadinessService.js'

const APPLY = process.argv.includes('--apply')
const VERIFY = process.argv.includes('--verify')
const listingIdArg = process.argv.find((arg) => arg.startsWith('--listing-id='))
const LISTING_ID = normalizePublicListingText(listingIdArg ? listingIdArg.slice('--listing-id='.length) : '')
const publicApiArg = process.argv.find((arg) => arg.startsWith('--public-api='))
const PUBLIC_API_URL = publicApiArg ? publicApiArg.slice('--public-api='.length) : 'https://app.arch9.co.za/api/public/listings'

function getSupabaseConfig() {
  const supabaseUrl = normalizePublicListingText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizePublicListingText(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }
  return { supabaseUrl, serviceRoleKey }
}

function createSupabaseAdminClient() {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig()
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

function createListingSlugFromPublicUrl(publicUrl = '') {
  try {
    const parsed = new URL(publicUrl)
    const parts = parsed.pathname.split('/').map((part) => part.trim()).filter(Boolean)
    const buyIndex = parts.indexOf('buy')
    return buyIndex >= 0 ? parts[buyIndex + 1] || '' : ''
  } catch {
    return ''
  }
}

async function fetchLaunchRows(client, listingId) {
  const listingResult = await client
    .from('private_listings')
    .select([
      'id',
      'listing_status',
      'listing_visibility',
      'bridge_listing_status',
      'bridge_listing_public_url',
      'title',
      'description',
      'address_line_1',
      'formatted_address',
      'street_address',
      'suburb',
      'city',
      'province',
      'property_type',
      'asking_price',
      'created_at',
      'updated_at',
    ].join(', '))
    .eq('id', listingId)
    .maybeSingle()

  if (listingResult.error) throw listingResult.error
  if (!listingResult.data) {
    const error = new Error(`Listing ${listingId} was not found.`)
    error.code = 'listing_not_found'
    throw error
  }

  const publicationResult = await client
    .from('listing_publication_data')
    .select('*')
    .eq('listing_id', listingId)
    .maybeSingle()
  if (publicationResult.error) throw publicationResult.error

  const mediaResult = await client
    .from('listing_media')
    .select('listing_id, media_type, file_url, caption, sort_order, is_cover')
    .eq('listing_id', listingId)
    .order('sort_order', { ascending: true })
  if (mediaResult.error) throw mediaResult.error

  return {
    listing: listingResult.data,
    publication: publicationResult.data || {},
    media: mediaResult.data || [],
  }
}

async function verifyPublicListing(publicUrl) {
  const slug = createListingSlugFromPublicUrl(publicUrl)
  if (!slug) return { ok: false, status: null, message: 'Could not derive a public slug.' }
  const response = await fetch(`${PUBLIC_API_URL}?slug=${encodeURIComponent(slug)}`, {
    headers: { Accept: 'application/json' },
  })
  const payload = await response.json().catch(() => null)
  return {
    ok: response.ok && Boolean(payload?.listing?.slug),
    status: response.status,
    slug,
    publicApiUrl: `${PUBLIC_API_URL}?slug=${encodeURIComponent(slug)}`,
    message: payload?.message || (response.ok ? 'Listing returned by public API.' : 'Listing not returned by public API.'),
  }
}

async function applyLaunchPlan(client, plan) {
  if (!plan.canApply) return { applied: false, reason: 'blocked' }

  const publicationWrite = await client
    .from('listing_publication_data')
    .upsert(plan.publicationPayload, { onConflict: 'listing_id' })
  if (publicationWrite.error) throw publicationWrite.error

  const listingWrite = await client
    .from('private_listings')
    .update(plan.listingPatch)
    .eq('id', plan.listingId)
  if (listingWrite.error) throw listingWrite.error

  return { applied: true }
}

async function run() {
  if (!LISTING_ID) {
    throw new Error('Usage: npm run publish:public-listing -- --listing-id=<uuid> [--apply] [--verify]')
  }

  const client = createSupabaseAdminClient()
  const rows = await fetchLaunchRows(client, LISTING_ID)
  const plan = createPublicListingLaunchPlan(rows)
  const result = {
    mode: APPLY ? 'apply' : 'dry-run',
    listingId: plan.listingId,
    title: plan.title,
    canApply: plan.canApply,
    publicUrl: plan.publicUrl,
    summary: plan.summary,
    applied: false,
    verification: null,
  }

  if (APPLY) {
    const applyResult = await applyLaunchPlan(client, plan)
    result.applied = Boolean(applyResult.applied)
    if (!applyResult.applied) result.applyReason = applyResult.reason
  }

  if (VERIFY || APPLY) {
    result.verification = await verifyPublicListing(plan.publicUrl)
  }

  console.log(JSON.stringify(result, null, 2))

  if (!plan.canApply) process.exitCode = APPLY ? 1 : 0
  if ((VERIFY || APPLY) && result.verification && !result.verification.ok) process.exitCode = APPLY ? 1 : process.exitCode
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
