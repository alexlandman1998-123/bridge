import { createClient } from '@supabase/supabase-js'
import {
  createPublicListingLaunchPlan,
  createPublicListingMediaAttachmentPlan,
  normalizePublicListingText,
} from '../server/services/publicListingReadinessService.js'

const APPLY = process.argv.includes('--apply')
const listingIdArg = process.argv.find((arg) => arg.startsWith('--listing-id='))
const imageUrlArgs = process.argv
  .filter((arg) => arg.startsWith('--image-url='))
  .map((arg) => arg.slice('--image-url='.length))
const captionArg = process.argv.find((arg) => arg.startsWith('--caption='))
const LISTING_ID = normalizePublicListingText(listingIdArg ? listingIdArg.slice('--listing-id='.length) : '')
const CAPTION = normalizePublicListingText(captionArg ? captionArg.slice('--caption='.length) : 'Listing image')

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

async function fetchMediaRows(client, listingId) {
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

async function applyMediaPlan(client, plan) {
  if (!plan.canApply) return { applied: false, reason: 'blocked' }
  const insertResult = await client.from('listing_media').insert(plan.rows)
  if (insertResult.error) throw insertResult.error
  return { applied: true, inserted: plan.rows.length }
}

async function run() {
  if (!LISTING_ID || !imageUrlArgs.length) {
    throw new Error('Usage: npm run attach:public-listing-media -- --listing-id=<uuid> --image-url=<https-url> [--image-url=<https-url>] [--caption="Exterior"] [--apply]')
  }

  const client = createSupabaseAdminClient()
  const rows = await fetchMediaRows(client, LISTING_ID)
  const plan = createPublicListingMediaAttachmentPlan({
    listing: rows.listing,
    existingMedia: rows.media,
    imageUrls: imageUrlArgs,
    caption: CAPTION,
  })

  const result = {
    mode: APPLY ? 'apply' : 'dry-run',
    listingId: plan.listingId,
    title: rows.listing.title,
    canApply: plan.canApply,
    mediaPlan: plan.summary,
    rows: plan.rows,
    applied: false,
    postAttachLaunchPlan: null,
  }

  if (APPLY) {
    const applyResult = await applyMediaPlan(client, plan)
    result.applied = Boolean(applyResult.applied)
    result.inserted = applyResult.inserted || 0
    const refreshedRows = await fetchMediaRows(client, LISTING_ID)
    const launchPlan = createPublicListingLaunchPlan({
      listing: refreshedRows.listing,
      publication: refreshedRows.publication,
      media: refreshedRows.media,
    })
    result.postAttachLaunchPlan = {
      canApply: launchPlan.canApply,
      publicUrl: launchPlan.publicUrl,
      launchBlockers: launchPlan.summary.launchBlockers,
      nextCommand: `npm run publish:public-listing -- --listing-id=${LISTING_ID}`,
    }
  }

  console.log(JSON.stringify(result, null, 2))
  if (!plan.canApply) process.exitCode = APPLY ? 1 : 0
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
