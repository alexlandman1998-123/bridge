#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const MAX_MEDIA = 50
const MAX_BYTES = 15 * 1024 * 1024
const SOURCE_BUCKETS = new Set(['documents', 'listing-media', 'organisation-branding'])
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])

function option(name) {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || '' : ''
}

function text(value) { return String(value || '').trim() }
function fail(message) { throw new Error(message) }

function storageSource(rawUrl, projectUrl) {
  try {
    const source = new URL(rawUrl)
    const project = new URL(projectUrl)
    const match = source.pathname.match(/^\/storage\/v1\/object\/(authenticated|public|sign)\/([^/]+)\/(.+)$/i)
    if (source.origin !== project.origin || !match) return null
    const bucket = decodeURIComponent(match[2])
    const path = match[3].split('/').map(decodeURIComponent).join('/')
    if (!SOURCE_BUCKETS.has(bucket) || !path || path.split('/').some((part) => !part || part === '.' || part === '..')) return null
    return { bucket, path }
  } catch { return null }
}

function contentType(blob, media) {
  const direct = text(blob.type).split(';')[0].toLowerCase()
  if (direct) return direct
  const extension = storageSource(media.file_url, process.env.VITE_SUPABASE_URL)?.path.split('.').pop()?.toLowerCase()
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', pdf: 'application/pdf' })[extension] || ''
}

function extensionFor(type) { return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'application/pdf': 'pdf' })[type] || '' }

function isSupported(mediaType, type) {
  return IMAGE_TYPES.has(type) || (mediaType === 'floor_plan' && type === 'application/pdf')
}

async function query(query, label) {
  const { data, error, count } = await query
  if (error) fail(`${label}: ${error.message}`)
  return { data: data || [], count }
}

async function copyMedia({ db, sourceUrl, organisationId, siteId, listingId, media }) {
  const source = storageSource(media.file_url, sourceUrl)
  if (!source) fail('media is not in an approved project storage bucket')
  const download = await db.storage.from(source.bucket).download(source.path)
  if (download.error || !download.data) fail(`could not read source media: ${download.error?.message || 'unknown error'}`)
  const bytes = await download.data.arrayBuffer()
  if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) fail('media must be between 1 byte and 15 MB')
  const type = contentType(download.data, media)
  if (!isSupported(media.media_type, type)) fail(`unsupported ${media.media_type} content type: ${type || 'unknown'}`)
  const fingerprint = createHash('sha256').update(Buffer.from(bytes)).digest('hex')
  const extension = extensionFor(type)
  if (!extension) fail(`no storage extension for ${type}`)
  const storagePath = `organisations/${organisationId}/websites/${siteId}/listings/${listingId}/${media.id}/${fingerprint}.${extension}`
  const upload = await db.storage.from('listing-media').upload(storagePath, new Uint8Array(bytes), { contentType: type, cacheControl: '31536000', upsert: false })
  const duplicate = Number(upload.error?.statusCode || 0) === 409 || /already exists|duplicate/i.test(text(upload.error?.message))
  if (upload.error && !duplicate) fail(`could not store durable media: ${upload.error.message}`)
  const publicUrl = db.storage.from('listing-media').getPublicUrl(storagePath).data.publicUrl
  return { source_media_id: media.id, source_bucket: source.bucket, source_path: source.path, source_fingerprint: fingerprint, storage_path: storagePath, public_url: publicUrl, content_type: type, byte_size: bytes.byteLength, created: !upload.error }
}

async function copyListingMedia(args, media) {
  const copied = new Array(media.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(5, media.length) }, async () => {
    while (next < media.length) {
      const index = next++
      copied[index] = await copyMedia({ ...args, media: media[index] })
    }
  }))
  return copied
}

function readiness(row, projection, media, sourceUrl) {
  if (!projection || projection.status !== 'Published') return 'missing a Published public listing projection'
  if (!text(projection.title) || !['Sale', 'Rental'].includes(text(projection.listing_type)) || Number(projection.asking_price || 0) <= 0) return 'has incomplete public listing details'
  if (!media.length) return 'has no public image or floor plan'
  if (media.length > MAX_MEDIA) return `has ${media.length} images/floor plans; the website limit is ${MAX_MEDIA}`
  if (media.some((item) => !storageSource(item.file_url, sourceUrl))) return 'has media outside an approved project storage bucket'
  return ''
}

const organisationId = option('--organisation-id')
const actorUserId = option('--actor-user-id')
const actorEmail = option('--actor-email')
const apply = process.argv.includes('--apply')
const limit = Number(option('--limit') || 0)
const sourceUrl = text(process.env.VITE_SUPABASE_URL)
const serviceRoleKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY)
if (!organisationId || !actorUserId || !actorEmail) fail('Usage: node --env-file=.env.production.local scripts/publish-property24-listings-to-website.mjs --organisation-id <uuid> --actor-user-id <uuid> --actor-email <email> [--apply]')
if (!sourceUrl || !serviceRoleKey) fail('Production Supabase credentials are unavailable.')

const db = createClient(sourceUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const [{ data: organisations }, { data: members }, { data: sites }] = await Promise.all([
  query(db.from('organisations').select('id,name,display_name').eq('id', organisationId), 'Organisation lookup failed'),
  query(db.from('organisation_users').select('user_id,email,status,membership_status').eq('organisation_id', organisationId).eq('user_id', actorUserId), 'Actor membership lookup failed'),
  query(db.from('website_sites').select('id,status').eq('organisation_id', organisationId), 'Website lookup failed'),
])
if (organisations.length !== 1) fail('Expected exactly one organisation.')
if (sites.length !== 1 || sites[0].status !== 'published') fail('A single published organisation website is required.')
const actor = members.find((member) => text(member.email).toLowerCase() === actorEmail.toLowerCase() && ['active', 'accepted'].includes(text(member.membership_status || member.status).toLowerCase()))
if (!actor) fail('The selected publication actor is not an active member of this organisation.')

const { data: listings } = await query(db.from('private_listings').select('id,property24_reference').eq('organisation_id', organisationId).ilike('property24_status', 'published'), 'Property24 listing lookup failed')
const ids = listings.map((listing) => listing.id)
const [{ data: projections }, { data: media }, { data: channels }] = await Promise.all([
  query(db.from('listing_publication_data').select('listing_id,status,title,property_type,listing_type,asking_price,suburb').in('listing_id', ids), 'Publication projection lookup failed'),
  query(db.from('listing_media').select('id,listing_id,media_type,file_url,caption,sort_order').in('listing_id', ids).in('media_type', ['image', 'floor_plan']).order('sort_order'), 'Listing media lookup failed'),
  query(db.from('website_listing_publications').select('listing_id,status').eq('website_site_id', sites[0].id).in('listing_id', ids), 'Website publication lookup failed'),
])
const projectionByListing = new Map(projections.map((item) => [item.listing_id, item]))
const mediaByListing = Map.groupBy(media.filter((item) => /^https:\/\//i.test(text(item.file_url))), (item) => item.listing_id)
const channelByListing = new Map(channels.map((item) => [item.listing_id, item]))
const candidates = listings.filter((listing) => channelByListing.get(listing.id)?.status !== 'published')
const blocked = candidates.map((listing) => ({ reference: listing.property24_reference, reason: readiness(listing, projectionByListing.get(listing.id), mediaByListing.get(listing.id) || [], sourceUrl) })).filter((item) => item.reason)
const eligible = candidates.filter((listing) => !readiness(listing, projectionByListing.get(listing.id), mediaByListing.get(listing.id) || [], sourceUrl))
const selected = limit > 0 ? eligible.slice(0, limit) : eligible
if (!apply) {
  console.log(JSON.stringify({ mode: 'preview', organisation: organisations[0].display_name || organisations[0].name, property24Published: listings.length, alreadyWebsitePublished: listings.length - candidates.length, eligible: eligible.map((item) => item.property24_reference), selected: selected.map((item) => item.property24_reference), blocked }, null, 2))
  process.exit(0)
}

const published = []
const failed = []
for (const listing of selected) {
  const assets = []
  try {
    assets.push(...await copyListingMedia({ db, sourceUrl, organisationId, siteId: sites[0].id, listingId: listing.id }, mediaByListing.get(listing.id) || []))
    const registered = await db.rpc('website_register_listing_media_assets', { p_listing_id: listing.id, p_actor_id: actorUserId, p_actor_email: actorEmail, p_assets: assets.map(({ created, ...asset }) => asset) })
    if (registered.error) fail(registered.error.message)
    const committed = await db.rpc('website_commit_listing_publication', { p_listing_id: listing.id, p_action: 'publish', p_actor_id: actorUserId, p_actor_email: actorEmail })
    if (committed.error) fail(committed.error.message)
    published.push(listing.property24_reference)
  } catch (error) {
    const created = assets.filter((asset) => asset.created).map((asset) => asset.storage_path)
    if (created.length) await db.storage.from('listing-media').remove(created)
    failed.push({ reference: listing.property24_reference, reason: error instanceof Error ? error.message : String(error) })
  }
}
const verification = selected.length ? await query(db.from('website_listing_publications').select('listing_id,status').eq('website_site_id', sites[0].id).in('listing_id', selected.map((listing) => listing.id)).eq('status', 'published'), 'Published listing verification failed') : { data: [] }
console.log(JSON.stringify({ mode: 'apply', published, blocked, failed, verifiedPublishedCount: verification.data.length }, null, 2))
