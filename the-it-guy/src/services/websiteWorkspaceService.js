import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

function text(value) {
  return String(value || '').trim()
}

function latest(items = []) {
  return [...items].sort((left, right) => String(right.updated_at || right.created_at || '').localeCompare(String(left.updated_at || left.created_at || '')))[0] || null
}

export async function getWebsiteWorkspaceOverview(organisationId) {
  const safeOrganisationId = text(organisationId)
  if (!safeOrganisationId || !isSupabaseConfigured || !supabase) {
    return { mode: 'unconfigured', site: null, domains: [], pages: [], publishedRevision: null }
  }

  const siteResult = await supabase
    .from('website_sites')
    .select('id, preview_slug, status, template_key, updated_at')
    .eq('organisation_id', safeOrganisationId)
    .maybeSingle()
  if (siteResult.error) throw siteResult.error
  if (!siteResult.data) return { mode: 'ready_to_create', site: null, domains: [], pages: [], publishedRevision: null }

  const site = siteResult.data
  const [domainsResult, revisionsResult, pagesResult] = await Promise.all([
    supabase.from('website_domains').select('id, hostname, domain_kind, status, is_primary, updated_at').eq('website_site_id', site.id).order('created_at'),
    supabase.from('website_site_revisions').select('id, revision_number, status, published_at, updated_at').eq('website_site_id', site.id).order('revision_number', { ascending: false }),
    supabase.from('website_pages').select('id, slug, page_kind, title, revision_id, updated_at').eq('website_site_id', site.id).order('updated_at', { ascending: false }),
  ])
  if (domainsResult.error) throw domainsResult.error
  if (revisionsResult.error) throw revisionsResult.error
  if (pagesResult.error) throw pagesResult.error

  const revisions = revisionsResult.data || []
  return {
    mode: 'connected',
    site: { id: site.id, previewSlug: text(site.preview_slug), status: text(site.status), templateKey: text(site.template_key), updatedAt: site.updated_at || null },
    domains: domainsResult.data || [],
    pages: pagesResult.data || [],
    publishedRevision: revisions.find((revision) => revision.status === 'published') || null,
    draftRevision: latest(revisions.filter((revision) => revision.status === 'draft')),
    archivedRevisions: revisions.filter((revision) => revision.status === 'archived'),
  }
}

function assertWebsiteControlReady(siteId) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured for website publishing.')
  if (!text(siteId)) throw new Error('A website site is required.')
}

function slug(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80)
}

function campaignBlocks({ heading, intro }) {
  return [
    { type: 'hero', eyebrow: 'PROPERTY CAMPAIGN', heading, body: intro, ctaLabel: 'Browse properties', ctaHref: '/properties' },
    { type: 'property_collection', heading: 'Featured properties', maxItems: 3 },
    { type: 'lead_form', heading: 'Arrange a viewing', body: 'Tell us what interests you and our team will be in touch.', purpose: 'campaign_enquiry' },
  ]
}

export async function createWebsiteCampaignPage({ siteId, revisionId, title, slug: requestedSlug, intro }) {
  assertWebsiteControlReady(siteId)
  const safeTitle = text(title).slice(0, 160)
  const safeSlug = slug(requestedSlug || safeTitle)
  const safeIntro = text(intro).slice(0, 600)
  if (!text(revisionId) || !safeTitle || !safeSlug) throw new Error('A campaign title and URL slug are required.')
  const { data, error } = await supabase.from('website_pages').insert({
    website_site_id: siteId,
    revision_id: revisionId,
    page_kind: 'campaign',
    slug: safeSlug,
    title: safeTitle,
    seo_title: safeTitle,
    seo_description: safeIntro || null,
    content_blocks: campaignBlocks({ heading: safeTitle, intro: safeIntro || 'Explore this focused property collection with our local team.' }),
  }).select('id, slug, title').single()
  if (error) {
    if (error.code === '23505') throw new Error('That campaign URL is already in use in this draft.')
    throw error
  }
  return data
}

export async function createWebsiteDraft(siteId) {
  assertWebsiteControlReady(siteId)
  const { data, error } = await supabase.rpc('website_create_draft_revision', { p_website_site_id: siteId })
  if (error) throw error
  return data
}

export async function publishWebsiteDraft(siteId, revisionId) {
  assertWebsiteControlReady(siteId)
  if (!text(revisionId)) throw new Error('A draft revision is required.')
  const { data, error } = await supabase.rpc('website_publish_revision', { p_website_site_id: siteId, p_revision_id: revisionId })
  if (error) throw error
  return data
}

export async function rollbackWebsiteRevision(siteId, revisionId) {
  assertWebsiteControlReady(siteId)
  if (!text(revisionId)) throw new Error('An archived revision is required.')
  const { data, error } = await supabase.rpc('website_rollback_revision', { p_website_site_id: siteId, p_revision_id: revisionId })
  if (error) throw error
  return data
}
