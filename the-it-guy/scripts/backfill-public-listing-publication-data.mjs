import { createClient } from '@supabase/supabase-js'
import {
  buildPublicListingPublicationPayload,
  buildPublicListingUrl,
  fetchPublicListingReadinessRows,
  getPublicListingBackfillBlockers,
  normalizePublicListingText,
} from '../server/services/publicListingReadinessService.js'

const APPLY = process.argv.includes('--apply')

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

function groupRowsByListingId(rows = []) {
  return rows.reduce((map, row) => {
    const listingId = normalizePublicListingText(row.listing_id)
    if (!listingId) return map
    if (!map.has(listingId)) map.set(listingId, [])
    map.get(listingId).push(row)
    return map
  }, new Map())
}

async function run() {
  const client = createSupabaseAdminClient()
  const { listings, publications, media } = await fetchPublicListingReadinessRows(client)
  const publicationsByListingId = new Map((publications || []).map((row) => [normalizePublicListingText(row.listing_id), row]))
  const mediaByListingId = groupRowsByListingId(media)
  const candidates = listings.filter((listing) => (
    normalizePublicListingText(listing.bridge_listing_status).toLowerCase() === 'published' &&
      normalizePublicListingText(listing.listing_visibility).toLowerCase() === 'active_market'
  ))
  const publishable = []
  const skipped = []

  for (const listing of candidates) {
    const publication = publicationsByListingId.get(normalizePublicListingText(listing.id)) || {}
    const listingMedia = mediaByListingId.get(normalizePublicListingText(listing.id)) || []
    const blockers = getPublicListingBackfillBlockers({ listing, publication, media: listingMedia })
    if (blockers.length) {
      skipped.push({ id: listing.id, title: listing.title, blockers })
      continue
    }

    const payload = buildPublicListingPublicationPayload(listing, publication)
    const publicUrl = buildPublicListingUrl(listing, payload)
    publishable.push({ listing, payload, publicUrl, mediaCount: listingMedia.length })
  }

  if (APPLY) {
    for (const item of publishable) {
      const publicationWrite = await client
        .from('listing_publication_data')
        .upsert(item.payload, { onConflict: 'listing_id' })
      if (publicationWrite.error) throw publicationWrite.error

      const listingWrite = await client
        .from('private_listings')
        .update({
          bridge_listing_public_url: item.publicUrl,
          listing_visibility: 'active_market',
          bridge_listing_status: 'published',
        })
        .eq('id', item.listing.id)
      if (listingWrite.error) throw listingWrite.error
    }
  }

  const summary = {
    mode: APPLY ? 'apply' : 'dry-run',
    scanned: candidates.length,
    publishable: publishable.length,
    applied: APPLY ? publishable.length : 0,
    skipped: skipped.length,
    skippedReasons: skipped.reduce((acc, item) => {
      for (const blocker of item.blockers) acc[blocker] = (acc[blocker] || 0) + 1
      return acc
    }, {}),
    samplePublishable: publishable.slice(0, 5).map((item) => ({
      id: item.listing.id,
      title: item.payload.title,
      publicUrl: item.publicUrl,
      mediaCount: item.mediaCount,
    })),
    sampleSkipped: skipped.slice(0, 8),
  }

  console.log(JSON.stringify(summary, null, 2))
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
