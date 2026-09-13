import { assertEdgeFunctionSuccess, invokeEdgeFunction, isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const WEBSITE_BRAND_PUBLICATION_FUNCTION = 'website-brand-publication'
const WEBSITE_DOMAIN_MANAGEMENT_FUNCTION = 'website-domain-management'

function text(value) {
  return String(value || '').trim()
}

function latest(items = []) {
  return [...items].sort((left, right) => String(right.updated_at || right.created_at || '').localeCompare(String(left.updated_at || left.created_at || '')))[0] || null
}

export async function getWebsiteWorkspaceOverview(organisationId, { leadWindowDays = 30 } = {}) {
  const safeOrganisationId = text(organisationId)
  if (!safeOrganisationId || !isSupabaseConfigured || !supabase) {
    return { mode: 'unconfigured', pilot: null, productionRelease: null, productionDarkLaunch: null, site: null, domains: [], pages: [], publishedRevision: null, publicationEvents: [], managementEvents: [], publicationReadiness: null, analytics: null, analyticsError: '', websiteLeads: [], websiteLeadsError: '', websiteSubmissions: [], websiteSubmissionsError: '', blogPosts: [], draftBlogPosts: [], publishedBlogPosts: [], blogPostsError: '' }
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
    return { mode: 'pilot_unavailable', pilot: null, productionRelease, productionDarkLaunch, site: null, domains: [], pages: [], publishedRevision: null, publicationEvents: [], managementEvents: [], publicationReadiness: null, analytics: null, analyticsError: '', websiteLeads: [], websiteLeadsError: '', websiteSubmissions: [], websiteSubmissionsError: '', blogPosts: [], draftBlogPosts: [], publishedBlogPosts: [], blogPostsError: '' }
  }
  if (pilotResult.data && pilotResult.data.status !== 'active' && !productionAccess) {
    return { mode: 'pilot_paused', pilot: pilotResult.data, productionRelease, productionDarkLaunch, site: null, domains: [], pages: [], publishedRevision: null, publicationEvents: [], managementEvents: [], publicationReadiness: null, analytics: null, analyticsError: '', websiteLeads: [], websiteLeadsError: '', websiteSubmissions: [], websiteSubmissionsError: '', blogPosts: [], draftBlogPosts: [], publishedBlogPosts: [], blogPostsError: '' }
  }

  const siteResult = await supabase
    .from('website_sites')
    .select('id, preview_slug, status, template_key, published_revision_id, updated_at')
    .eq('organisation_id', safeOrganisationId)
    .maybeSingle()
  if (siteResult.error) throw siteResult.error
  if (!siteResult.data) return { mode: 'ready_to_create', pilot: pilotResult.data, productionRelease, productionDarkLaunch, site: null, domains: [], pages: [], publishedRevision: null, publicationEvents: [], managementEvents: [], publicationReadiness: null, analytics: null, analyticsError: '', websiteLeads: [], websiteLeadsError: '', websiteSubmissions: [], websiteSubmissionsError: '', blogPosts: [], draftBlogPosts: [], publishedBlogPosts: [], blogPostsError: '' }

  const site = siteResult.data
  const [domainsResult, revisionsResult, pagesResult, eventsResult, managementEventsResult, analyticsResult, leadsResult, blogPostsResult, mediaAssetsResult, websiteListingsResult] = await Promise.all([
    supabase.from('website_domains').select('id, hostname, domain_kind, status, is_primary, dns_instructions, verified_at, created_at, updated_at').eq('website_site_id', site.id).order('created_at'),
    supabase.from('website_site_revisions').select('id, revision_number, status, brand_json, source_revision_id, content_fingerprint, published_at, published_by, archived_at, updated_at').eq('website_site_id', site.id).order('revision_number', { ascending: false }),
    supabase.from('website_pages').select('id, slug, page_kind, title, seo_title, seo_description, social_image_url, content_blocks, revision_id, updated_at').eq('website_site_id', site.id).order('page_kind').order('slug'),
    supabase.from('website_publication_events').select('id, action, from_revision_id, source_revision_id, to_revision_id, content_fingerprint, metadata_json, created_at').eq('website_site_id', site.id).order('created_at', { ascending: false }).limit(12),
    supabase.from('website_management_events').select('id, action, metadata_json, created_at').eq('website_site_id', site.id).order('created_at', { ascending: false }).limit(12),
    supabase.rpc('website_dashboard_analytics', { p_website_site_id: site.id, p_days: 30 }),
    supabase.rpc('website_workspace_leads', { p_website_site_id: site.id, p_days: Math.max(1, Math.min(Number(leadWindowDays) || 30, 90)) }),
    supabase.from('website_blog_posts').select('id, website_site_id, revision_id, title, slug, summary, cover_image_url, cover_image_alt, body, content_blocks, author_name, status, lifecycle_status, scheduled_for, published_at, seo_title, seo_description, created_at, updated_at').eq('website_site_id', site.id).order('updated_at', { ascending: false }),
    supabase.from('website_media_assets').select('id, website_site_id, storage_path, public_url, alt_text, created_at').eq('website_site_id', site.id).order('created_at', { ascending: false }),
    supabase.rpc('website_blog_available_listings', { p_website_site_id: site.id }),
  ])
  if (domainsResult.error) throw domainsResult.error
  if (revisionsResult.error) throw revisionsResult.error
  if (pagesResult.error) throw pagesResult.error
  if (eventsResult.error) throw eventsResult.error
  if (managementEventsResult.error) throw managementEventsResult.error

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
    managementEvents: managementEventsResult.data || [],
    publicationReadiness,
    analytics: analyticsResult.data || null,
    analyticsError: analyticsResult.error?.message || '',
    websiteLeads: leadsResult.data || [],
    websiteLeadsError: leadsResult.error?.message || '',
    websiteSubmissions: leadsResult.data || [],
    websiteSubmissionsError: leadsResult.error?.message || '',
    blogPosts: (blogPostsResult.data || []).filter((post) => post.revision_id === activeRevision?.id),
    draftBlogPosts: (blogPostsResult.data || []).filter((post) => post.revision_id === draftRevision?.id),
    publishedBlogPosts: (blogPostsResult.data || []).filter((post) => post.revision_id === publishedRevision?.id),
    blogPostsError: blogPostsResult.error?.message || '',
    mediaAssets: mediaAssetsResult.data || [],
    mediaAssetsError: mediaAssetsResult.error?.message || '',
    websiteListings: websiteListingsResult.data || [],
    websiteListingsError: websiteListingsResult.error?.message || '',
  }
}

function safeMediaFileName(name) {
  const extension = text(name).split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`
}

export async function uploadWebsiteBlogMedia({ siteId, organisationId, file, altText }) {
  assertWebsiteControlReady(siteId)
  const safeOrganisationId = text(organisationId)
  const safeAltText = text(altText).slice(0, 240)
  if (!safeOrganisationId) throw new Error('An organisation is required to upload website media.')
  if (!(file instanceof File)) throw new Error('Choose an image to upload.')
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error('Upload a JPG, PNG, WebP, or AVIF image.')
  if (file.size > 10 * 1024 * 1024) throw new Error('Images must be 10 MB or smaller.')
  if (!safeAltText) throw new Error('Add alt text describing the image.')
  const storagePath = `organisations/${safeOrganisationId}/${siteId}/${safeMediaFileName(file.name)}`
  const uploadResult = await supabase.storage.from('website-media').upload(storagePath, file, { cacheControl: '3600', contentType: file.type, upsert: false })
  if (uploadResult.error) throw uploadResult.error
  const publicUrlResult = supabase.storage.from('website-media').getPublicUrl(storagePath)
  const publicUrl = text(publicUrlResult.data?.publicUrl)
  if (!publicUrl) throw new Error('The uploaded image could not be prepared for the website.')
  const { data, error } = await supabase.from('website_media_assets').insert({
    organisation_id: safeOrganisationId, website_site_id: siteId, storage_path: storagePath, public_url: publicUrl, alt_text: safeAltText,
  }).select('id, website_site_id, storage_path, public_url, alt_text, created_at').single()
  if (error) {
    await supabase.storage.from('website-media').remove([storagePath])
    throw error
  }
  return data
}

export async function manageWebsiteDomain({ action, siteId, hostname, domainId }) {
  assertWebsiteControlReady(siteId)
  const safeAction = text(action)
  if (!['connect', 'verify', 'make-primary', 'remove'].includes(safeAction)) throw new Error('Choose a valid website domain action.')
  const result = await invokeEdgeFunction(WEBSITE_DOMAIN_MANAGEMENT_FUNCTION, { body: { action: safeAction, siteId, hostname: text(hostname), domainId: text(domainId) } })
  assertEdgeFunctionSuccess(result, 'Website domain management could not be completed.')
  return result.data
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

function blogPostPayload(post) {
  const title = text(post?.title).slice(0, 160)
  const postSlug = slug(post?.slug || title)
  const coverImageUrl = text(post?.coverImageUrl || post?.cover_image_url)
  const coverImageAlt = text(post?.coverImageAlt || post?.cover_image_alt)
  if (!title || !postSlug) throw new Error('An article title and URL slug are required.')
  if (coverImageUrl && !/^https:\/\/[^\s]+$/i.test(coverImageUrl)) throw new Error('Use a secure https URL for the cover image.')
  if (coverImageUrl && !coverImageAlt) throw new Error('Add alt text describing the cover image.')
  const allowedBlockTypes = new Set(['paragraph', 'heading_2', 'heading_3', 'bullet_list', 'numbered_list', 'quote', 'divider', 'image', 'tip', 'listing_card'])
  const content_blocks = (Array.isArray(post?.contentBlocks || post?.content_blocks) ? (post.contentBlocks || post.content_blocks) : [])
    .map((block, index) => ({ id: text(block?.id) || `block-${index + 1}`, type: text(block?.type), text: text(block?.text).slice(0, 10000), assetId: text(block?.assetId || block?.asset_id) || null, listingId: text(block?.listingId || block?.listing_id) || null, caption: text(block?.caption).slice(0, 600), tipRole: text(block?.tipRole || block?.tip_role) === 'seller' ? 'seller' : 'buyer', order: index }))
    .filter((block) => allowedBlockTypes.has(block.type))
  const body = content_blocks.filter((block) => !['divider', 'image', 'listing_card'].includes(block.type)).map((block) => block.text).filter(Boolean).join('\n\n').slice(0, 50000)
  return {
    title,
    slug: postSlug,
    summary: text(post?.summary).slice(0, 600),
    cover_image_url: coverImageUrl || null,
    cover_image_alt: coverImageUrl ? coverImageAlt.slice(0, 240) : null,
    body,
    content_blocks,
    author_name: text(post?.authorName || post?.author_name).slice(0, 160),
    seo_title: text(post?.seoTitle || post?.seo_title).slice(0, 180) || null,
    seo_description: text(post?.seoDescription || post?.seo_description).slice(0, 320) || null,
  }
}

export async function createWebsiteBlogPost({ siteId, revisionId, post }) {
  assertWebsiteControlReady(siteId)
  if (!text(revisionId)) throw new Error('Create an editable website draft before adding an article.')
  const payload = blogPostPayload(post)
  const { data, error } = await supabase.rpc('website_save_draft_blog_post', {
    p_website_site_id: siteId, p_revision_id: revisionId, p_post_id: null,
    p_title: payload.title, p_slug: payload.slug, p_summary: payload.summary,
    p_cover_image_url: payload.cover_image_url, p_cover_image_alt: payload.cover_image_alt,
    p_body: payload.body, p_content_blocks: payload.content_blocks, p_author_name: payload.author_name,
    p_seo_title: payload.seo_title, p_seo_description: payload.seo_description,
  })
  if (error) throw error
  return data
}

export async function updateWebsiteBlogPost({ siteId, revisionId, postId, post }) {
  assertWebsiteControlReady(siteId)
  const safePostId = text(postId)
  if (!safePostId) throw new Error('Choose an article to save.')
  if (!text(revisionId)) throw new Error('Create an editable website draft before changing an article.')
  const payload = blogPostPayload(post)
  const { data, error } = await supabase.rpc('website_save_draft_blog_post', {
    p_website_site_id: siteId, p_revision_id: revisionId, p_post_id: safePostId,
    p_title: payload.title, p_slug: payload.slug, p_summary: payload.summary,
    p_cover_image_url: payload.cover_image_url, p_cover_image_alt: payload.cover_image_alt,
    p_body: payload.body, p_content_blocks: payload.content_blocks, p_author_name: payload.author_name,
    p_seo_title: payload.seo_title, p_seo_description: payload.seo_description,
  })
  if (error) throw error
  return data
}

export async function manageWebsiteBlogPost({ siteId, revisionId, postId, action, scheduledFor = null }) {
  assertWebsiteControlReady(siteId)
  if (!text(revisionId) || !text(postId)) throw new Error('Choose an article in the current website draft.')
  const safeAction = text(action)
  if (!['draft', 'ready_for_review', 'schedule', 'archive', 'duplicate', 'delete'].includes(safeAction)) throw new Error('Choose a valid article action.')
  const { data, error } = await supabase.rpc('website_manage_draft_blog_post', {
    p_website_site_id: siteId, p_revision_id: revisionId, p_post_id: postId, p_action: safeAction,
    p_scheduled_for: safeAction === 'schedule' ? scheduledFor : null,
  })
  if (error) throw error
  return data
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

export async function createWebsiteBlogPage({ siteId, revisionId, title, slug: requestedSlug, intro }) {
  assertWebsiteControlReady(siteId)
  const safeTitle = text(title).slice(0, 160)
  const safeSlug = slug(requestedSlug || safeTitle)
  const safeIntro = text(intro).slice(0, 600)
  if (!text(revisionId) || !safeTitle || !safeSlug) throw new Error('An article title and URL slug are required.')
  const { data, error } = await supabase.rpc('website_save_draft_blog', {
    p_website_site_id: siteId, p_revision_id: revisionId, p_page_id: null, p_slug: safeSlug,
    p_title: safeTitle, p_seo_title: safeTitle, p_seo_description: safeIntro, p_social_image_url: '',
    p_content_blocks: [
      { type: 'hero', eyebrow: 'PROPERTY JOURNAL', heading: safeTitle, body: safeIntro || 'A practical perspective from our property team.', ctaLabel: 'Talk to our team', ctaHref: '/contact' },
      { type: 'rich_text', heading: 'The full story', body: 'Write your article here.' },
    ],
  })
  if (error) throw error
  return data
}

export async function saveWebsiteDraftPage({ siteId, revisionId, pageId, pageKind, slug: pageSlug, title, seoTitle, seoDescription, socialImageUrl, contentBlocks }) {
  assertWebsiteControlReady(siteId)
  if (!text(revisionId)) throw new Error('An editable website draft is required.')
  if (!Array.isArray(contentBlocks)) throw new Error('Structured page content is required.')
  if (text(pageKind) === 'blog') {
    const { data, error } = await supabase.rpc('website_save_draft_blog', { p_website_site_id: siteId, p_revision_id: revisionId, p_page_id: pageId || null, p_slug: slug(pageSlug), p_title: text(title), p_seo_title: text(seoTitle), p_seo_description: text(seoDescription), p_social_image_url: text(socialImageUrl), p_content_blocks: contentBlocks })
    if (error) throw error
    return data
  }
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
