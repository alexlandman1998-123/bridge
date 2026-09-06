import { assertEdgeFunctionSuccess, invokeEdgeFunction, isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const WEBSITE_BRAND_PUBLICATION_FUNCTION = 'website-brand-publication'

function text(value) {
  return String(value || '').trim()
}

function latest(items = []) {
  return [...items].sort((left, right) => String(right.updated_at || right.created_at || '').localeCompare(String(left.updated_at || left.created_at || '')))[0] || null
}

export async function getWebsiteWorkspaceOverview(organisationId) {
  const safeOrganisationId = text(organisationId)
  if (!safeOrganisationId || !isSupabaseConfigured || !supabase) {
    return { mode: 'unconfigured', pilot: null, productionRelease: null, productionDarkLaunch: null, site: null, domains: [], pages: [], publishedRevision: null, publicationEvents: [], publicationReadiness: null }
  }

  const [pilotResult, productionReleaseResult, productionDarkLaunchResult] = await Promise.all([
    supabase
      .from('website_pilot_enrolments')
      .select('cohort, status, activated_at, paused_at, completed_at, updated_at')
      .eq('organisation_id', safeOrganisationId)
      .maybeSingle(),
    supabase
      .from('website_production_releases')
      .select('status, target_hostname, source_commit, candidate_deployment_url, approval_reference, approved_at, domain_verified_at, activated_at, paused_at, updated_at')
      .eq('organisation_id', safeOrganisationId)
      .maybeSingle(),
    supabase
      .from('website_production_dark_launches')
      .select('status, source_commit, candidate_deployment_url, rollback_deployment_url, preview_hostname, approval_reference, activated_at, paused_at, rolled_back_at, updated_at')
      .eq('organisation_id', safeOrganisationId)
      .maybeSingle(),
  ])
  if (pilotResult.error) throw pilotResult.error
  if (productionReleaseResult.error) throw productionReleaseResult.error
  if (productionDarkLaunchResult.error) throw productionDarkLaunchResult.error
  const productionRelease = productionReleaseResult.data
  const productionDarkLaunch = productionDarkLaunchResult.data
  const productionAccess = (productionRelease && ['approved', 'active', 'paused'].includes(productionRelease.status))
    || (productionDarkLaunch && ['prepared', 'active', 'paused'].includes(productionDarkLaunch.status))
  if (!pilotResult.data && !productionAccess) {
    return { mode: 'pilot_unavailable', pilot: null, productionRelease, productionDarkLaunch, site: null, domains: [], pages: [], publishedRevision: null, publicationEvents: [], publicationReadiness: null }
  }
  if (pilotResult.data && pilotResult.data.status !== 'active' && !productionAccess) {
    return { mode: 'pilot_paused', pilot: pilotResult.data, productionRelease, productionDarkLaunch, site: null, domains: [], pages: [], publishedRevision: null, publicationEvents: [], publicationReadiness: null }
  }

  const siteResult = await supabase
    .from('website_sites')
    .select('id, preview_slug, status, template_key, published_revision_id, updated_at')
    .eq('organisation_id', safeOrganisationId)
    .maybeSingle()
  if (siteResult.error) throw siteResult.error
  if (!siteResult.data) return { mode: 'ready_to_create', pilot: pilotResult.data, productionRelease, productionDarkLaunch, site: null, domains: [], pages: [], publishedRevision: null, publicationEvents: [], publicationReadiness: null }

  const site = siteResult.data
  const [domainsResult, revisionsResult, pagesResult, eventsResult] = await Promise.all([
    supabase.from('website_domains').select('id, hostname, domain_kind, status, is_primary, updated_at').eq('website_site_id', site.id).order('created_at'),
    supabase.from('website_site_revisions').select('id, revision_number, status, brand_json, source_revision_id, content_fingerprint, published_at, published_by, archived_at, updated_at').eq('website_site_id', site.id).order('revision_number', { ascending: false }),
    supabase.from('website_pages').select('id, slug, page_kind, title, seo_title, seo_description, social_image_url, content_blocks, revision_id, updated_at').eq('website_site_id', site.id).order('page_kind').order('slug'),
    supabase.from('website_publication_events').select('id, action, from_revision_id, source_revision_id, to_revision_id, content_fingerprint, metadata_json, created_at').eq('website_site_id', site.id).order('created_at', { ascending: false }).limit(12),
  ])
  if (domainsResult.error) throw domainsResult.error
  if (revisionsResult.error) throw revisionsResult.error
  if (pagesResult.error) throw pagesResult.error
  if (eventsResult.error) throw eventsResult.error

  const revisions = revisionsResult.data || []
  const draftRevision = latest(revisions.filter((revision) => revision.status === 'draft'))
  const publishedRevision = revisions.find((revision) => revision.id === site.published_revision_id && revision.status === 'published') || null
  const activeRevision = draftRevision || publishedRevision
  let publicationReadiness = null
  if (draftRevision) {
    const readinessResult = await supabase.rpc('website_revision_readiness', {
      p_website_site_id: site.id,
      p_revision_id: draftRevision.id,
    })
    if (readinessResult.error) throw readinessResult.error
    publicationReadiness = readinessResult.data
  }
  return {
    mode: 'connected',
    pilot: pilotResult.data,
    productionRelease,
    productionDarkLaunch,
    site: { id: site.id, previewSlug: text(site.preview_slug), status: text(site.status), templateKey: text(site.template_key), publishedRevisionId: site.published_revision_id || null, updatedAt: site.updated_at || null },
    domains: domainsResult.data || [],
    pages: (pagesResult.data || []).filter((page) => page.revision_id === activeRevision?.id),
    publishedRevision,
    draftRevision,
    draftBrand: draftRevision?.brand_json && typeof draftRevision.brand_json === 'object' ? draftRevision.brand_json : null,
    archivedRevisions: revisions.filter((revision) => revision.status === 'archived'),
    publicationEvents: eventsResult.data || [],
    publicationReadiness,
  }
}

export async function saveWebsiteDraftBrand(siteId, revisionId, brand) {
  assertWebsiteControlReady(siteId)
  if (!text(revisionId)) throw new Error('An editable website draft is required.')
  const result = await invokeEdgeFunction(WEBSITE_BRAND_PUBLICATION_FUNCTION, {
    body: {
      action: 'save',
      siteId,
      revisionId,
      brand: brand && typeof brand === 'object' ? brand : {},
    },
  })
  assertEdgeFunctionSuccess(result, 'Website branding could not be saved.')
  return result.data
}

export async function resetWebsiteDraftBrand(siteId, revisionId) {
  assertWebsiteControlReady(siteId)
  if (!text(revisionId)) throw new Error('An editable website draft is required.')
  const result = await invokeEdgeFunction(WEBSITE_BRAND_PUBLICATION_FUNCTION, {
    body: { action: 'reset', siteId, revisionId },
  })
  assertEdgeFunctionSuccess(result, 'Website branding could not be reset.')
  return result.data
}

export async function createWebsiteSite(organisationId) {
  const safeOrganisationId = text(organisationId)
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured for website setup.')
  if (!safeOrganisationId) throw new Error('An organisation is required to create a website.')

  const result = await invokeEdgeFunction(WEBSITE_BRAND_PUBLICATION_FUNCTION, {
    body: { action: 'create', organisationId: safeOrganisationId },
  })
  assertEdgeFunctionSuccess(result, 'The website setup could not be completed.')
  if (!result.data?.siteId) throw new Error('The website setup did not return a site.')
  return result.data
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
  return saveWebsiteDraftPage({
    siteId,
    revisionId,
    pageId: null,
    pageKind: 'campaign',
    slug: safeSlug,
    title: safeTitle,
    seoTitle: safeTitle,
    seoDescription: safeIntro,
    socialImageUrl: '',
    contentBlocks: campaignBlocks({ heading: safeTitle, intro: safeIntro || 'Explore this focused property collection with our local team.' }),
  })
}

export async function saveWebsiteDraftPage({ siteId, revisionId, pageId, pageKind, slug: pageSlug, title, seoTitle, seoDescription, socialImageUrl, contentBlocks }) {
  assertWebsiteControlReady(siteId)
  if (!text(revisionId)) throw new Error('An editable website draft is required.')
  if (!Array.isArray(contentBlocks)) throw new Error('Structured page content is required.')
  const { data, error } = await supabase.rpc('website_save_draft_page', {
    p_website_site_id: siteId,
    p_revision_id: revisionId,
    p_page_id: pageId || null,
    p_page_kind: text(pageKind),
    p_slug: slug(pageSlug),
    p_title: text(title),
    p_seo_title: text(seoTitle),
    p_seo_description: text(seoDescription),
    p_social_image_url: text(socialImageUrl),
    p_content_blocks: contentBlocks,
  })
  if (error) throw error
  return data
}

export async function deleteWebsiteDraftCampaign({ siteId, revisionId, pageId }) {
  assertWebsiteControlReady(siteId)
  if (!text(revisionId) || !text(pageId)) throw new Error('An editable campaign page is required.')
  const { data, error } = await supabase.rpc('website_delete_draft_campaign', {
    p_website_site_id: siteId,
    p_revision_id: revisionId,
    p_page_id: pageId,
  })
  if (error) throw error
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
  const result = await invokeEdgeFunction(WEBSITE_BRAND_PUBLICATION_FUNCTION, {
    body: { action: 'publish', siteId, revisionId },
  })
  assertEdgeFunctionSuccess(result, 'The website draft could not be published.')
  return result.data
}

export async function rollbackWebsiteRevision(siteId, revisionId) {
  assertWebsiteControlReady(siteId)
  if (!text(revisionId)) throw new Error('An archived revision is required.')
  const { data, error } = await supabase.rpc('website_rollback_revision', { p_website_site_id: siteId, p_revision_id: revisionId })
  if (error) throw error
  return data
}

export async function discardWebsiteDraft(siteId, revisionId) {
  assertWebsiteControlReady(siteId)
  if (!text(revisionId)) throw new Error('An editable website draft is required.')
  const result = await invokeEdgeFunction(WEBSITE_BRAND_PUBLICATION_FUNCTION, {
    body: { action: 'discard', siteId, revisionId },
  })
  assertEdgeFunctionSuccess(result, 'The website draft could not be discarded.')
  return result.data
}
