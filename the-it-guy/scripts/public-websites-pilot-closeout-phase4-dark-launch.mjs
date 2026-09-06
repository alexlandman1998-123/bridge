#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseEnv } from 'node:util'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

export const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
export const STAGING_PROJECT_REF = 'vaszuxjeoajeuhlcnzzf'
export const DARK_LAUNCH_CONFIRMATION = 'AUTHORIZE_KINGSTONS_PRODUCTION_DARK_LAUNCH_NO_DNS'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA = /^[0-9a-f]{40}$/i
const FINGERPRINT = /^[0-9a-f]{32}(?:[0-9a-f]{32})?$/i
const VERCEL_URL = /^https:\/\/[a-z0-9][a-z0-9.-]*\.vercel\.app$/i
const WEBSITE_ROOT = resolve(process.env.PHASE4_VERCEL_WORKDIR || resolve(import.meta.dirname, '../../apps/websites'))

function option(argv, name) {
  const inline = argv.find((value) => value.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] || '' : ''
}

export function parseDarkLaunchArgs(argv = process.argv.slice(2)) {
  const actions = ['prepare', 'seed', 'activate', 'pause', 'resume', 'rollback', 'status'].filter((name) => argv.includes(`--${name}`))
  if (actions.length > 1) throw new Error('Choose only one dark-launch operation.')
  return {
    action: actions[0] || 'status',
    manifestPath: option(argv, '--manifest'),
    stagingEnvPath: option(argv, '--staging-env'),
    productionEnvPath: option(argv, '--production-env'),
    operator: option(argv, '--operator') || process.env.GITHUB_ACTOR || process.env.USER || '',
    reason: option(argv, '--reason'),
    output: option(argv, '--output'),
    baseUrl: option(argv, '--base-url'),
    smokeEmail: option(argv, '--smoke-email') || process.env.WEBSITE_RELEASE_SMOKE_EMAIL || '',
    submitSmokeLead: argv.includes('--submit-smoke-lead'),
    requireActive: argv.includes('--require-active'),
    confirmation: option(argv, '--confirm'),
    help: argv.includes('--help') || argv.includes('-h'),
  }
}

function loadEnvironment(path) {
  if (!path) return {}
  return parseEnv(readFileSync(resolve(path), 'utf8'))
}

function targetFrom(environment, kind) {
  const production = kind === 'production'
  const expectedRef = production ? PRODUCTION_PROJECT_REF : STAGING_PROJECT_REF
  const url = String(environment[production ? 'SUPABASE_PRODUCTION_URL' : 'SUPABASE_STAGING_URL']
    || environment.SUPABASE_URL || environment.VITE_SUPABASE_URL || '').trim()
  const key = String(environment[production ? 'SUPABASE_PRODUCTION_SERVICE_ROLE_KEY' : 'SUPABASE_STAGING_SERVICE_ROLE_KEY']
    || environment.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  let parsed
  try { parsed = new URL(url) } catch { throw new Error(`${kind} Supabase URL is invalid.`) }
  if (parsed.protocol !== 'https:' || parsed.hostname !== `${expectedRef}.supabase.co` || parsed.pathname !== '/' || !key) {
    throw new Error(`${kind} Supabase credentials do not match the pinned ${expectedRef} project.`)
  }
  return { projectRef: expectedRef, url, key }
}

export function assertDarkLaunchTargets({ staging = {}, production = {} }) {
  return { staging: targetFrom(staging, 'staging'), production: targetFrom(production, 'production') }
}

function readJson(path, label) {
  if (!path) throw new Error(`${label} file is required.`)
  try { return JSON.parse(readFileSync(resolve(path), 'utf8')) } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function validateDarkLaunchManifest(value) {
  if (value?.contract !== 'public-websites-pilot-closeout-phase4-dark-launch-v1') throw new Error('Dark-launch manifest contract is invalid.')
  if (!UUID.test(String(value.organisationId || '')) || !UUID.test(String(value.listingId || ''))) throw new Error('Dark launch requires exact organisation and listing UUIDs.')
  if (!SHA.test(String(value.sourceCommit || '')) || !FINGERPRINT.test(String(value.stagingContentFingerprint || ''))) {
    throw new Error('Dark launch requires an exact source commit and reviewed staging content fingerprint.')
  }
  const candidate = String(value.candidateDeploymentUrl || '').replace(/\/$/, '').toLowerCase()
  const rollback = String(value.rollbackDeploymentUrl || '').replace(/\/$/, '').toLowerCase()
  if (!VERCEL_URL.test(candidate) || !VERCEL_URL.test(rollback) || candidate === rollback) {
    throw new Error('Dark launch requires distinct candidate and rollback Vercel deployment URLs.')
  }
  if (String(value.approvedBy || '').trim().length < 2 || String(value.approvalReference || '').trim().length < 2) {
    throw new Error('Dark launch requires approvedBy and approvalReference.')
  }
  if (value.confirmation !== DARK_LAUNCH_CONFIRMATION) throw new Error(`Dark launch requires ${DARK_LAUNCH_CONFIRMATION}.`)
  return { ...value, candidateDeploymentUrl: candidate, rollbackDeploymentUrl: rollback }
}

function client(target) {
  return createClient(target.url, target.key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function one(query, label) {
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(`${label}: ${error.message}`)
  return data || null
}

async function many(query, label) {
  const { data, error } = await query
  if (error) throw new Error(`${label}: ${error.message}`)
  return data || []
}

function parseStorageUrl(value, target) {
  const url = new URL(value)
  if (url.hostname !== new URL(target.url).hostname) throw new Error('Storage asset belongs to another Supabase project.')
  const match = decodeURIComponent(url.pathname).match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/)
  if (!match) throw new Error('Unsupported Supabase Storage URL.')
  return { bucket: match[1], path: match[2] }
}

function extension(contentType) {
  return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg', 'application/pdf': 'pdf' })[contentType] || ''
}

function duplicateStorageError(error) {
  return Number(error?.statusCode || 0) === 409 || /already exists|duplicate/i.test(String(error?.message || ''))
}

async function copyStorageObject({ sourceClient, sourceTarget, destinationClient, destinationBucket, sourceUrl, destinationPath }) {
  const source = parseStorageUrl(sourceUrl, sourceTarget)
  const downloaded = await sourceClient.storage.from(source.bucket).download(source.path)
  if (downloaded.error || !downloaded.data) throw new Error(`Storage download failed: ${downloaded.error?.message || 'missing data'}`)
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer())
  if (!bytes.byteLength || bytes.byteLength > 15 * 1024 * 1024) throw new Error('Storage asset size is outside the dark-launch limit.')
  const contentType = String(downloaded.data.type || '').split(';', 1)[0].toLowerCase()
  const fingerprint = createHash('sha256').update(bytes).digest('hex')
  const suffix = extension(contentType)
  if (!suffix) throw new Error(`Unsupported storage content type: ${contentType || 'missing'}`)
  const path = `${destinationPath}/${fingerprint}.${suffix}`
  const upload = await destinationClient.storage.from(destinationBucket).upload(path, bytes, { contentType, cacheControl: '31536000', upsert: false })
  if (upload.error && !duplicateStorageError(upload.error)) throw new Error(`Storage upload failed: ${upload.error.message}`)
  const publicUrl = destinationClient.storage.from(destinationBucket).getPublicUrl(path).data.publicUrl
  return { sourceBucket: source.bucket, sourcePath: source.path, fingerprint, path, publicUrl, contentType, byteSize: bytes.byteLength, created: !upload.error }
}

async function seedProduction({ staging, production, manifest, operator }) {
  const stage = client(staging)
  const prod = client(production)
  const launch = await one(prod.from('website_production_dark_launches').select('*').eq('organisation_id', manifest.organisationId), 'Prepared dark launch could not be loaded')
  if (!launch || launch.status !== 'prepared' || launch.source_commit !== manifest.sourceCommit || launch.listing_id !== manifest.listingId) {
    throw new Error('Prepare the exact dark launch before seeding production.')
  }
  const existingSite = await one(prod.from('website_sites').select('id,published_revision_id').eq('organisation_id', manifest.organisationId), 'Existing production site check failed')
  if (existingSite) {
    if (launch.website_site_id === existingSite.id) return { reused: true, siteId: existingSite.id, revisionId: existingSite.published_revision_id }
    throw new Error('A production website already exists outside this dark-launch record.')
  }

  const stagingSite = await one(stage.from('website_sites').select('*').eq('organisation_id', manifest.organisationId).eq('status', 'published'), 'Reviewed staging site could not be loaded')
  const stagingRevision = await one(stage.from('website_site_revisions').select('*').eq('id', stagingSite?.published_revision_id || '').eq('status', 'published'), 'Reviewed staging revision could not be loaded')
  if (!stagingSite || !stagingRevision || stagingRevision.content_fingerprint !== manifest.stagingContentFingerprint) {
    throw new Error('Staging content no longer matches the reviewed manifest fingerprint.')
  }
  const pages = await many(stage.from('website_pages').select('*').eq('website_site_id', stagingSite.id).eq('revision_id', stagingRevision.id).order('page_kind'), 'Staging pages could not be loaded')
  const kinds = new Set(pages.map((page) => page.page_kind))
  if (!['home', 'about', 'contact', 'valuation'].every((kind) => kinds.has(kind))) throw new Error('Reviewed staging revision is missing a standard page.')

  const listing = await one(prod.from('private_listings').select('id,organisation_id').eq('id', manifest.listingId).eq('organisation_id', manifest.organisationId), 'Production listing could not be loaded')
  const projection = await one(prod.from('listing_publication_data').select('*').eq('listing_id', manifest.listingId).eq('status', 'Published'), 'Published listing projection could not be loaded')
  const sourceMedia = await many(prod.from('listing_media').select('id,media_type,file_url,caption,sort_order').eq('listing_id', manifest.listingId).in('media_type', ['image', 'floor_plan']).order('sort_order'), 'Production listing media could not be loaded')
  if (!listing || !projection || !sourceMedia.some((item) => item.media_type === 'image')) throw new Error('Production listing is not ready for the website channel.')
  const actor = await one(prod.from('organisation_users').select('user_id,email,membership_status,status').eq('organisation_id', manifest.organisationId).not('user_id', 'is', null).or('membership_status.in.(active,accepted),status.in.(active,accepted)').limit(1), 'Kingstons production actor could not be loaded')
  if (!actor?.user_id) throw new Error('An active Kingstons production actor is required.')

  const siteId = randomUUID()
  const revisionId = randomUUID()
  const uploaded = []
  let siteCreated = false
  try {
    const brand = { ...(stagingRevision.brand_json || {}) }
    const brandAssets = []
    for (const [variant, key] of [['light', 'logoLightUrl'], ['dark', 'logoDarkUrl']]) {
      const sourceUrl = String(brand[key] || brand.logoUrl || '')
      if (!sourceUrl) continue
      const asset = await copyStorageObject({
        sourceClient: stage, sourceTarget: staging, destinationClient: prod,
        destinationBucket: 'organisation-branding', sourceUrl,
        destinationPath: `organisations/${manifest.organisationId}/websites/${siteId}/branding/${variant}`,
      })
      uploaded.push({ bucket: 'organisation-branding', path: asset.path, created: asset.created })
      brand[key] = asset.publicUrl
      brandAssets.push({
        website_site_id: siteId, organisation_id: manifest.organisationId, variant,
        source_bucket: asset.sourceBucket, source_path: asset.sourcePath,
        source_fingerprint: asset.fingerprint, storage_bucket: 'organisation-branding',
        storage_path: asset.path, public_url: asset.publicUrl, content_type: asset.contentType,
        byte_size: asset.byteSize, status: 'active', created_by: actor.user_id, updated_by: actor.user_id,
      })
    }
    brand.logoUrl = brand.logoDarkUrl || brand.logoLightUrl || undefined
    brand.seedSource = 'production_dark_launch'
    brand.updatedAt = new Date().toISOString()
    brand.updatedBy = actor.user_id

    const listingAssets = []
    const mediaJson = []
    for (const media of sourceMedia) {
      const asset = await copyStorageObject({
        sourceClient: prod, sourceTarget: production, destinationClient: prod,
        destinationBucket: 'listing-media', sourceUrl: media.file_url,
        destinationPath: `organisations/${manifest.organisationId}/websites/${siteId}/listings/${manifest.listingId}/${media.id}`,
      })
      uploaded.push({ bucket: 'listing-media', path: asset.path, created: asset.created })
      listingAssets.push({
        website_site_id: siteId, listing_id: manifest.listingId, source_media_id: media.id,
        media_type: media.media_type, source_bucket: asset.sourceBucket, source_path: asset.sourcePath,
        source_fingerprint: asset.fingerprint, storage_bucket: 'listing-media', storage_path: asset.path,
        public_url: asset.publicUrl, content_type: asset.contentType, byte_size: asset.byteSize,
        status: 'active', created_by: actor.user_id, updated_by: actor.user_id,
      })
      mediaJson.push({ media_type: media.media_type, file_url: asset.publicUrl, caption: media.caption, sort_order: media.sort_order })
    }

    const insertedSite = await prod.from('website_sites').insert({
      id: siteId, organisation_id: manifest.organisationId, template_key: 'property-standard-v1', status: 'published',
      preview_slug: `${stagingSite.preview_slug}-production`.slice(0, 63), locale: stagingSite.locale,
      currency_code: stagingSite.currency_code, created_by: actor.user_id,
    })
    if (insertedSite.error) throw insertedSite.error
    siteCreated = true
    const insertedRevision = await prod.from('website_site_revisions').insert({
      id: revisionId, website_site_id: siteId, revision_number: 1, status: 'published', brand_json: brand,
      seo_json: stagingRevision.seo_json, navigation_json: stagingRevision.navigation_json,
      created_by: actor.user_id, published_by: actor.user_id, published_at: new Date().toISOString(),
      content_fingerprint: null,
    })
    if (insertedRevision.error) throw insertedRevision.error
    const insertedPages = await prod.from('website_pages').insert(pages.map((page) => ({
      id: randomUUID(), website_site_id: siteId, revision_id: revisionId, page_kind: page.page_kind,
      slug: page.slug, title: page.title, seo_title: page.seo_title, seo_description: page.seo_description,
      social_image_url: page.social_image_url, content_blocks: page.content_blocks,
    })))
    if (insertedPages.error) throw insertedPages.error
    if (brandAssets.length) {
      const result = await prod.from('website_brand_assets').insert(brandAssets)
      if (result.error) throw result.error
    }
    const listingAssetResult = await prod.from('website_listing_media_assets').insert(listingAssets)
    if (listingAssetResult.error) throw listingAssetResult.error
    const domainResult = await prod.from('website_domains').insert({
      website_site_id: siteId, hostname: new URL(manifest.candidateDeploymentUrl).hostname,
      domain_kind: 'preview', status: 'active', is_primary: true,
      dns_instructions: { environment: 'production-dark-launch', clientDnsRequired: false, emailDnsRequired: false },
    })
    if (domainResult.error) throw domainResult.error
    const publicationJson = Object.fromEntries([
      'listing_id', 'title', 'suburb', 'province', 'property_type', 'listing_type', 'asking_price',
      'bedrooms', 'bathrooms', 'parking_bays', 'floor_size', 'description', 'features', 'amenities',
    ].map((key) => [key, projection[key]]).filter(([, value]) => value !== null && value !== undefined))
    const publicationResult = await prod.from('website_listing_publications').insert({
      website_site_id: siteId, listing_id: manifest.listingId, status: 'published', publication_json: publicationJson,
      media_json: mediaJson, published_at: new Date().toISOString(), last_synced_at: new Date().toISOString(),
      created_by: actor.user_id, updated_by: actor.user_id,
    })
    if (publicationResult.error) throw publicationResult.error
    const siteUpdate = await prod.from('website_sites').update({ published_revision_id: revisionId }).eq('id', siteId).eq('organisation_id', manifest.organisationId)
    if (siteUpdate.error) throw siteUpdate.error
    const binding = await prod.rpc('website_bind_production_dark_launch_content', {
      p_organisation_id: manifest.organisationId,
      p_website_site_id: siteId,
      p_operator: operator,
    })
    if (binding.error) throw binding.error
    return {
      reused: false, siteId, revisionId, pages: pages.length,
      brandAssets: brandAssets.length, listingAssets: listingAssets.length,
      productionContentFingerprint: binding.data?.contentFingerprint,
    }
  } catch (error) {
    if (siteCreated) await prod.from('website_sites').delete().eq('id', siteId).eq('organisation_id', manifest.organisationId)
    for (const bucket of ['organisation-branding', 'listing-media']) {
      const paths = uploaded.filter((item) => item.created && item.bucket === bucket).map((item) => item.path)
      if (paths.length) await prod.storage.from(bucket).remove(paths)
    }
    throw error
  }
}

function protectedStatus(path, baseUrl, request = []) {
  const linked = existsSync(resolve(WEBSITE_ROOT, '.vercel/project.json'))
  if (!linked && (!process.env.VERCEL_TOKEN || !process.env.VERCEL_ORG_ID || !process.env.VERCEL_PROJECT_ID)) return null
  const result = spawnSync('vercel', ['curl', path, '--deployment', baseUrl, '--', '--silent', '--show-error', '--output', '/dev/null', '--write-out', '%{http_code}', ...request], {
    cwd: WEBSITE_ROOT, encoding: 'utf8', env: process.env, timeout: 25_000, maxBuffer: 1024 * 1024,
  })
  if (result.error || result.status !== 0) throw new Error(`Protected preview request failed: ${result.error?.message || result.stderr || result.stdout}`)
  const match = String(result.stdout).match(/([1-5][0-9]{2})\s*$/)
  return match ? Number(match[1]) : null
}

async function submitSmokeLead(prod, manifest, baseUrl, smokeEmail) {
  if (!/^\S+@\S+\.\S+$/.test(smokeEmail)) throw new Error('--smoke-email is required for the internal production enquiry.')
  const site = await one(prod.from('website_sites').select('id,published_revision_id').eq('organisation_id', manifest.organisationId), 'Dark-launch site could not be loaded')
  const page = await one(prod.from('website_pages').select('id').eq('website_site_id', site?.id || '').eq('revision_id', site?.published_revision_id || '').eq('page_kind', 'home'), 'Dark-launch home page could not be loaded')
  const body = JSON.stringify({ type: 'general_enquiry', pageId: page?.id, name: 'Arch9 dark-launch smoke', email: smokeEmail, message: 'Controlled Kingstons production dark-launch routing test', privacyAccepted: true, marketingConsent: false, pageUrl: `${baseUrl}/`, idempotencyKey: `dark-launch:${randomUUID()}` })
  const status = protectedStatus('/api/leads', baseUrl, ['-X', 'POST', '-H', 'content-type: application/json', '--data', body])
  if (status === null) {
    const response = await fetch(new URL('/api/leads', baseUrl), { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error(`Dark-launch enquiry returned HTTP ${response.status}.`)
  } else if (status < 200 || status >= 300) throw new Error(`Dark-launch enquiry returned HTTP ${status}.`)
}

async function collectEvidence(prod, manifest, baseUrl = '') {
  const launch = await one(prod.from('website_production_dark_launches').select('*').eq('organisation_id', manifest.organisationId), 'Dark launch could not be loaded')
  const site = launch?.website_site_id ? await one(prod.from('website_sites').select('id,status,published_revision_id').eq('id', launch.website_site_id), 'Dark-launch site could not be loaded') : null
  const revision = site?.published_revision_id ? await one(prod.from('website_site_revisions').select('content_fingerprint').eq('id', site.published_revision_id), 'Dark-launch revision could not be loaded') : null
  const [pages, domains, publications, brandAssets, listingAssets, events, leads] = site ? await Promise.all([
    many(prod.from('website_pages').select('page_kind').eq('website_site_id', site.id).eq('revision_id', site.published_revision_id), 'Pages could not be loaded'),
    many(prod.from('website_domains').select('hostname,status,domain_kind').eq('website_site_id', site.id), 'Domains could not be loaded'),
    many(prod.from('website_listing_publications').select('listing_id,status,media_json').eq('website_site_id', site.id), 'Listing publication could not be loaded'),
    many(prod.from('website_brand_assets').select('variant,status,public_url').eq('website_site_id', site.id), 'Brand assets could not be loaded'),
    many(prod.from('website_listing_media_assets').select('status,public_url').eq('website_site_id', site.id), 'Listing assets could not be loaded'),
    many(prod.from('website_production_dark_launch_events').select('action,created_at').eq('dark_launch_id', launch.id).order('created_at'), 'Dark-launch events could not be loaded'),
    many(prod.from('website_lead_submissions').select('id,status,lead_id,created_at').eq('website_site_id', site.id), 'Dark-launch leads could not be loaded'),
  ]) : [[], [], [], [], [], [], []]
  const routeChecks = []
  if (baseUrl && launch?.status === 'active') {
    for (const path of ['/', '/properties', '/about', '/contact', '/valuation', '/robots.txt', '/sitemap.xml']) {
      try {
        const status = protectedStatus(path, baseUrl) ?? (await fetch(new URL(path, baseUrl), { redirect: 'manual', signal: AbortSignal.timeout(10_000) })).status
        routeChecks.push({ id: `public:${path}`, passed: status >= 200 && status < 400, evidence: `HTTP ${status}` })
      } catch (error) { routeChecks.push({ id: `public:${path}`, passed: false, evidence: error instanceof Error ? error.message : 'request failed' }) }
    }
  }
  const pageKinds = new Set(pages.map((page) => page.page_kind))
  const checks = [
    { id: 'launch:exact-commit', passed: launch?.source_commit === manifest.sourceCommit, evidence: launch?.source_commit || 'missing' },
    { id: 'launch:production-content-bound', passed: Boolean(launch?.production_content_fingerprint && launch.production_content_fingerprint === revision?.content_fingerprint), evidence: launch?.production_content_fingerprint || 'missing' },
    { id: 'launch:no-client-hostname', passed: Boolean(launch?.preview_hostname?.endsWith('.vercel.app')), evidence: launch?.preview_hostname || 'missing' },
    { id: 'launch:active', passed: launch?.status === 'active', evidence: launch?.status || 'missing' },
    { id: 'site:published', passed: Boolean(site?.status === 'published' && site?.published_revision_id), evidence: site?.status || 'missing' },
    { id: 'pages:standard', passed: ['home', 'about', 'contact', 'valuation'].every((kind) => pageKinds.has(kind)), evidence: [...pageKinds].sort().join(', ') || 'none' },
    { id: 'branding:durable', passed: ['light', 'dark'].every((variant) => brandAssets.some((asset) => asset.variant === variant && asset.status === 'active' && asset.public_url.includes(PRODUCTION_PROJECT_REF))), evidence: `${brandAssets.length} production asset(s)` },
    { id: 'listing:published', passed: publications.some((row) => row.listing_id === manifest.listingId && row.status === 'published' && row.media_json?.length > 0), evidence: `${publications.length} publication(s)` },
    { id: 'listing:durable-media', passed: listingAssets.length > 0 && listingAssets.every((asset) => asset.status === 'active' && asset.public_url.includes(PRODUCTION_PROJECT_REF)), evidence: `${listingAssets.length} production asset(s)` },
    { id: 'leads:routed', passed: leads.some((lead) => lead.status === 'routed' && lead.lead_id), required: false, evidence: `${leads.filter((lead) => lead.status === 'routed' && lead.lead_id).length} routed lead(s)` },
    { id: 'controls:pause-exercised', passed: events.some((event) => event.action === 'paused'), required: false, evidence: events.map((event) => event.action).join(', ') || 'none' },
    { id: 'controls:rollback-exercised', passed: events.some((event) => event.action === 'rolled_back'), required: false, evidence: events.map((event) => event.action).join(', ') || 'none' },
    ...routeChecks,
  ]
  const active = checks.every((check) => check.passed || check.required === false)
  return { contract: 'public-websites-pilot-closeout-phase4-evidence-v1', capturedAt: new Date().toISOString(), target: { projectRef: PRODUCTION_PROJECT_REF, organisationId: manifest.organisationId, hostname: launch?.preview_hostname || null }, status: active ? 'ACTIVE' : 'BLOCKED', active, checks, events }
}

function usage() {
  console.log(`Usage: node scripts/public-websites-pilot-closeout-phase4-dark-launch.mjs --prepare|--seed|--activate|--pause|--resume|--rollback|--status --manifest <json> --production-env <file> [--staging-env <file>] --confirm ${DARK_LAUNCH_CONFIRMATION}`)
}

async function main() {
  const options = parseDarkLaunchArgs()
  if (options.help) return usage()
  const manifest = validateDarkLaunchManifest(readJson(options.manifestPath, 'Dark-launch manifest'))
  const productionEnvironment = { ...process.env, ...loadEnvironment(options.productionEnvPath) }
  const stagingEnvironment = { ...process.env, ...loadEnvironment(options.stagingEnvPath) }
  const production = targetFrom(productionEnvironment, 'production')
  const staging = options.action === 'seed' ? targetFrom(stagingEnvironment, 'staging') : null
  const mutating = options.action !== 'status'
  if (mutating && options.confirmation !== DARK_LAUNCH_CONFIRMATION) throw new Error(`Production dark-launch mutations require --confirm ${DARK_LAUNCH_CONFIRMATION}.`)
  if (mutating && String(options.operator).trim().length < 2) throw new Error('--operator is required for production dark-launch mutations.')
  const prod = client(production)
  if (options.action === 'prepare') {
    const result = await prod.rpc('website_prepare_production_dark_launch', {
      p_organisation_id: manifest.organisationId, p_listing_id: manifest.listingId,
      p_source_commit: manifest.sourceCommit, p_expected_content_fingerprint: manifest.stagingContentFingerprint,
      p_candidate_deployment_url: manifest.candidateDeploymentUrl, p_rollback_deployment_url: manifest.rollbackDeploymentUrl,
      p_approval_reference: manifest.approvalReference, p_approved_by: manifest.approvedBy, p_operator: options.operator,
    })
    if (result.error) throw new Error(`Dark launch preparation failed: ${result.error.message}`)
  }
  if (options.action === 'seed') await seedProduction({ staging, production, manifest, operator: options.operator })
  if (['activate', 'resume'].includes(options.action)) {
    const result = await prod.rpc('website_activate_production_dark_launch', { p_organisation_id: manifest.organisationId, p_source_commit: manifest.sourceCommit, p_candidate_deployment_url: manifest.candidateDeploymentUrl, p_operator: options.operator })
    if (result.error) throw new Error(`Dark launch activation failed: ${result.error.message}`)
    if (options.submitSmokeLead) await submitSmokeLead(prod, manifest, options.baseUrl || manifest.candidateDeploymentUrl, options.smokeEmail)
  }
  if (options.action === 'pause') {
    const result = await prod.rpc('website_pause_production_dark_launch', { p_organisation_id: manifest.organisationId, p_operator: options.operator, p_reason: options.reason })
    if (result.error) throw new Error(`Dark launch pause failed: ${result.error.message}`)
  }
  if (options.action === 'rollback') {
    const result = await prod.rpc('website_rollback_production_dark_launch', { p_organisation_id: manifest.organisationId, p_operator: options.operator, p_reason: options.reason })
    if (result.error) throw new Error(`Dark launch rollback failed: ${result.error.message}`)
  }
  const report = await collectEvidence(prod, manifest, options.baseUrl || '')
  const evidence = { ...report, evidenceFingerprint: createHash('sha256').update(JSON.stringify(report)).digest('hex') }
  const output = `${JSON.stringify(evidence, null, 2)}\n`
  if (options.output) {
    const path = resolve(options.output)
    writeFileSync(path, output, { encoding: 'utf8', mode: 0o400 })
    chmodSync(path, 0o400)
  } else process.stdout.write(output)
  if (options.requireActive && !report.active) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Phase 4 dark launch blocked: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
