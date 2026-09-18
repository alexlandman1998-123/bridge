import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpRight, CalendarDays, ChevronRight, FileText, Globe2, GripVertical, ImagePlus, Lightbulb, LockKeyhole, MessageCircle, Pencil, Plus, UserPlus, Users } from 'lucide-react'
import { useAuthSession } from '../../context/AuthSessionContext'
import { createWebsiteBlogPost, createWebsiteDraft, createWebsiteSite, discardWebsiteDraft, getWebsiteWorkspaceOverview, manageWebsiteBlogPost, manageWebsiteDomain, publishWebsiteDraft, resetWebsiteDraftBrand, saveWebsiteDraftBrand, saveWebsiteDraftPage, setWebsiteDraftTemplate, updateWebsiteBlogMedia, updateWebsiteBlogPost, uploadWebsiteBlogMedia } from '../../services/websiteWorkspaceService'
import WebsiteBrandEditor from './WebsiteBrandEditor'
import WebsitePageEditor from './WebsitePageEditor'
import './WebsiteWorkspace.css'

const PUBLICATION_LABELS = {
  draft_created: 'Draft created',
  draft_discarded: 'Draft discarded',
  published: 'Revision published',
  rolled_back: 'Website updated',
}

const MANAGEMENT_LABELS = {
  domain_connected: 'Domain connected',
  domain_verification_requested: 'Domain verification requested',
  domain_verified: 'Domain verified',
  domain_primary_changed: 'Primary domain changed',
  domain_removed: 'Domain removed',
}

function isRepairableBrandBlocker(value) {
  return /^Prepare the (light|dark) website logo as a durable public asset before publishing\.$/i.test(String(value || '').trim())
}

function getOrganisationId(authState) {
  return String(authState?.currentWorkspace?.id || authState?.currentMembership?.workspaceId || authState?.currentMembership?.workspace_id || '').trim()
}

function websiteName(authState, overview) {
  return String(authState?.currentWorkspace?.name || authState?.currentWorkspace?.organisationName || authState?.currentMembership?.workspaceName || overview.site?.previewSlug || 'Your agency website').replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function WebsiteStats({ analytics }) {
  const stats = [
    { label: 'Visits', value: analytics?.visits, icon: Users, trend: '—' },
    { label: 'Enquiries', value: analytics?.submissions, icon: MessageCircle, trend: '—' },
    { label: 'Listing views', value: analytics?.listingViews, icon: FileText, trend: '—' },
    { label: 'Leads created', value: analytics?.leadsCreated, icon: UserPlus, trend: '—' },
  ]
  return <section className="wlo-stats" aria-label="Website performance in the last 30 days">{stats.map(({ label, value, icon: Icon, trend }) => <article key={label}><Icon size={22} /><div><small>{label}</small><strong>{Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '—'}</strong><span>{trend === '—' ? 'vs. last 30 days' : `↑ ${trend} · vs. last 30 days`}</span></div></article>)}</section>
}

function WebsiteLandingPreview({ previewUrl, websiteName: agencyName, primaryDomain, device, setDevice }) {
  return <div className="wlo-preview"><div className="wlo-preview-head"><div className="wwo-device-toggle"><button type="button" className={device === 'desktop' ? 'active' : ''} onClick={() => setDevice('desktop')}>Desktop</button><button type="button" className={device === 'mobile' ? 'active' : ''} onClick={() => setDevice('mobile')}>Mobile</button></div>{previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer">Open live site <ArrowUpRight size={14} /></a>}</div><div className={`wlo-browser ${device}`}>{previewUrl ? <iframe title="Latest published website" src={previewUrl} /> : <div className="wlo-preview-fallback"><Globe2 size={26} /><strong>{agencyName}</strong><span>{primaryDomain?.hostname || 'Managed preview is being prepared'}</span>{previewUrl && <a className="ww-publish" href={previewUrl} target="_blank" rel="noreferrer">Open preview <ArrowUpRight size={14} /></a>}</div>}</div></div>
}

function WebsitePerformance({ analytics }) {
  const daily = Array.isArray(analytics?.dailyTraffic) ? analytics.dailyTraffic : []
  const topPages = Array.isArray(analytics?.topPages) ? analytics.topPages : []
  const max = Math.max(1, ...daily.map((item) => Number(item.pageViews || 0)))
  return <section className="wlo-performance"><div className="wlo-card-heading"><div><h2>Performance</h2><p>Website visits (last 30 days)</p></div><button type="button">View details <ArrowUpRight size={14} /></button></div>{daily.length ? <div className="wlo-performance-body"><div className="wlo-line-chart" aria-label="Daily website visits">{daily.map((item) => <span key={item.date} title={`${item.date}: ${item.pageViews} views`} style={{ height: `${Math.max(6, Number(item.pageViews || 0) * 100 / max)}%` }} />)}</div><ol className="wlo-top-pages">{topPages.slice(0, 5).map((item, index) => <li key={`${item.label}-${index}`}><span>{index + 1}</span><strong>{item.label}</strong><b>{item.views}</b></li>)}</ol></div> : <p className="wlo-compact-empty">Website traffic will appear here once tracking is active.</p>}</section>
}

function WebsiteActivity({ publicationEvents, managementEvents }) {
  const activity = [...(publicationEvents || []).map((event) => ({ id: `p-${event.id}`, title: PUBLICATION_LABELS[event.action] || event.action, detail: 'Website publishing', at: event.created_at, icon: FileText })), ...(managementEvents || []).map((event) => ({ id: `m-${event.id}`, title: MANAGEMENT_LABELS[event.action] || event.action, detail: event.metadata_json?.hostname || 'Website domain', at: event.created_at, icon: Globe2 }))].sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))).slice(0, 3)
  return <section className="wlo-activity"><div className="wlo-card-heading"><h2>Website activity</h2><button type="button">View all activity <ArrowUpRight size={14} /></button></div>{activity.length ? <ol>{activity.map((event) => { const Icon = event.icon; return <li key={event.id}><Icon size={19} /><span><strong>{event.title}</strong><small>{event.detail}</small></span><time>{event.at ? new Date(event.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</time></li> })}</ol> : <p className="wlo-compact-empty">No recent website activity.</p>}</section>
}

function WebsiteSectionHeading({ title, detail, action = null }) {
  return <header className="wlo-section-heading"><div><h2>{title}</h2><p>{detail}</p></div>{action}</header>
}

function WebsiteLeadFilters({ windowDays, onWindowChange }) {
  return <label className="wlo-window-filter">Show<select value={windowDays} onChange={(event) => onWindowChange(Number(event.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label>
}

function WebsiteLeads({ leads = [], error, loading, windowDays, onWindowChange, onOpenListing }) {
  const actionable = leads.filter((lead) => lead.lead_id)
  return <section className="wlo-section-card" aria-label="Website leads"><WebsiteSectionHeading title="Website enquiries" detail={`CRM leads created through this organisation’s public website in the last ${windowDays} days.`} action={<WebsiteLeadFilters windowDays={windowDays} onWindowChange={onWindowChange} />} />{error ? <p className="ww-error">Website leads could not be loaded. Refresh the Website workspace and try again.</p> : null}<div className="wlo-table-wrap"><table className="wlo-table"><thead><tr><th>Person</th><th>Property or page</th><th>Enquiry</th><th>CRM status</th><th>Contact</th><th>Received</th></tr></thead><tbody>{loading ? <tr><td colSpan="6" className="wlo-table-empty">Loading website leads…</td></tr> : actionable.length ? actionable.map((lead) => <tr key={lead.submission_id}><td><strong>{lead.contact_name || 'Website visitor'}</strong><span>{lead.contact_email || lead.contact_phone || 'Contact details pending'}</span></td><td>{lead.listing_id ? <button className="wlo-link-button" type="button" onClick={() => onOpenListing(lead.listing_id)}><strong>{lead.property_title || 'Property listing'}</strong><span>{lead.property_address || 'Open listing'}</span></button> : <><strong>{lead.page_title || lead.property_title || 'Website enquiry'}</strong><span>{lead.page_slug ? `/${lead.page_slug}` : 'General website enquiry'}</span></>}</td><td><span className="wlo-type-pill">{String(lead.submission_type || 'enquiry').replaceAll('_', ' ')}</span></td><td><span className="wlo-status-pill">{lead.lead_status || lead.lead_stage || lead.submission_status || 'Processing'}</span></td><td><div className="wlo-contact-actions">{lead.contact_email ? <a href={`mailto:${lead.contact_email}`}>Email</a> : null}{lead.contact_phone ? <a href={`tel:${lead.contact_phone}`}>Call</a> : null}{!lead.contact_email && !lead.contact_phone ? <span>Contact pending</span> : null}</div></td><td>{lead.submitted_at ? new Date(lead.submitted_at).toLocaleString() : '—'}</td></tr>) : <tr><td colSpan="6" className="wlo-table-empty">No routed website leads in the last {windowDays} days.</td></tr>}</tbody></table></div></section>
}

function WebsiteFormSubmissions({ submissions = [], error, loading, windowDays, onWindowChange }) {
  const failed = submissions.filter((submission) => ['failed', 'blocked'].includes(String(submission.submission_status || '').toLowerCase()))
  return <section className="wlo-section-card" aria-label="Website form submissions"><WebsiteSectionHeading title="Submission delivery" detail={`Every website form receipt and its delivery outcome for the last ${windowDays} days.`} action={<WebsiteLeadFilters windowDays={windowDays} onWindowChange={onWindowChange} />} />{error ? <p className="ww-error">Submission delivery records could not be loaded. Refresh the Website workspace and try again.</p> : null}{failed.length ? <p className="wlo-delivery-alert">{failed.length} submission{failed.length === 1 ? '' : 's'} need{failed.length === 1 ? 's' : ''} attention. Their details remain in this audit view.</p> : null}<div className="wlo-table-wrap"><table className="wlo-table"><thead><tr><th>Form</th><th>Property or page</th><th>Received</th><th>Delivery</th><th>CRM lead</th></tr></thead><tbody>{loading ? <tr><td colSpan="5" className="wlo-table-empty">Loading submission delivery…</td></tr> : submissions.length ? submissions.map((submission) => { const failedDelivery = ['failed', 'blocked'].includes(String(submission.submission_status || '').toLowerCase()); return <tr key={submission.submission_id}><td><strong>{String(submission.submission_type || 'Website enquiry').replaceAll('_', ' ')}</strong><span>Submitted from your public website</span></td><td><strong>{submission.property_title || submission.page_title || 'Website enquiry'}</strong><span>{submission.property_address || (submission.page_slug ? `/${submission.page_slug}` : 'General website enquiry')}</span></td><td>{submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : '—'}</td><td><span className={failedDelivery ? 'wlo-status-pill failed' : 'wlo-status-pill'}>{submission.submission_status || submission.delivery_status || 'Processing'}</span>{submission.delivery_detail ? <span className="wlo-delivery-detail">{submission.delivery_detail}</span> : null}</td><td>{submission.lead_id ? 'Lead created' : failedDelivery ? 'Not created' : 'Awaiting routing'}</td></tr> }) : <tr><td colSpan="5" className="wlo-table-empty">No website form submissions in the last {windowDays} days.</td></tr>}</tbody></table></div></section>
}

function cleanBlogPost(post = {}) {
  return {
    id: post.id || '', title: post.title || '', slug: post.slug || '', summary: post.summary || '', coverImageUrl: post.cover_image_url || '', coverImageAlt: post.cover_image_alt || '', contentBlocks: Array.isArray(post.content_blocks) && post.content_blocks.length ? post.content_blocks : String(post.body || '').split(/\n{2,}/).filter(Boolean).map((text, index) => ({ id: `legacy-${index}`, type: 'paragraph', text, order: index })), authorName: post.author_name || '', seoTitle: post.seo_title || '', seoDescription: post.seo_description || '', status: post.status || 'draft', lifecycleStatus: post.lifecycle_status || post.status || 'draft', scheduledFor: post.scheduled_for || null, publishedAt: post.published_at || null,
  }
}

const BLOG_BLOCK_LABELS = { paragraph: 'Paragraph', heading_2: 'Section heading', heading_3: 'Small heading', bullet_list: 'Bulleted list', numbered_list: 'Numbered list', quote: 'Quote', divider: 'Divider', image: 'Image', tip: 'Practical tip', listing_card: 'Live listing' }

function blogValidationMessage(post, mediaAssets = [], websiteListings = []) {
  const title = String(post?.title || '').trim()
  const slug = String(post?.slug || '').trim()
  const blocks = Array.isArray(post?.contentBlocks) ? post.contentBlocks : []
  if (!title) return 'Add an article title before saving.'
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return 'Use lowercase words and hyphens for the article URL.'
  if (!post?.coverImageUrl) return 'Add a featured image before saving this article.'
  if (post?.coverImageUrl && !String(post?.coverImageAlt || '').trim()) return 'Add alt text for the featured image before saving.'
  if (!blocks.length) return 'Add at least one article block before saving.'
  for (const block of blocks) {
    if (!['divider', 'image', 'listing_card'].includes(block.type) && !String(block.text || '').trim()) return `Complete the ${BLOG_BLOCK_LABELS[block.type] || 'article'} block before saving.`
    if (block.type === 'image') {
      const asset = mediaAssets.find((item) => item.id === block.assetId)
      const imageDescription = String(block.altText || asset?.alt_text || '').trim()
      if (!asset) return 'Choose or upload an image for every image block.'
      if (!imageDescription || imageDescription === 'Image awaiting description') return 'Add an image description for every image block before saving.'
    }
    if (block.type === 'listing_card' && !websiteListings.some((item) => item.listing_id === block.listingId)) return 'Choose a live website listing for every property card.'
  }
  return ''
}

function blogSlugFromTitle(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80)
}

function BlogBlockEditor({ blocks = [], disabled, mediaAssets = [], websiteListings = [], uploading = false, onChange, onUpload, onUpdateMedia }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const [imageActionError, setImageActionError] = useState('')
  const update = (index, patch) => onChange(blocks.map((block, blockIndex) => blockIndex === index ? { ...block, ...patch } : block))
  const add = (type) => {
    const id = `block-${Date.now()}-${blocks.length}`
    const onlyAsset = type === 'image' && mediaAssets.length === 1 ? mediaAssets[0] : null
    const onlyListing = type === 'listing_card' && websiteListings.length === 1 ? websiteListings[0] : null
    onChange([...blocks, { id, type, text: '', order: blocks.length, ...(onlyAsset ? { assetId: onlyAsset.id, altText: onlyAsset.alt_text === 'Image awaiting description' ? '' : onlyAsset.alt_text } : {}), ...(onlyListing ? { listingId: onlyListing.listing_id } : {}) }])
    setMoreOpen(false)
    setImageActionError('')
  }
  const remove = (index) => onChange(blocks.filter((_, blockIndex) => blockIndex !== index).map((block, order) => ({ ...block, order })))
  const move = (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= blocks.length) return
    const reordered = [...blocks]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    onChange(reordered.map((block, order) => ({ ...block, order })))
  }
  const wordCount = blocks.reduce((total, block) => total + String(block.text || '').trim().split(/\s+/).filter(Boolean).length, 0)
  const uploadInlineImage = async (index, file) => {
    if (!file || !onUpload) return
    setImageActionError('')
    const asset = await onUpload(file, 'Image awaiting description')
    if (!asset) { setImageActionError('The image could not be uploaded. Please try again.'); return }
    update(index, { assetId: asset.id, altText: '', caption: '' })
  }
  const saveInlineImageDescription = async (index) => {
    const block = blocks[index]
    const description = String(block?.altText || '').trim()
    if (!block?.assetId || !onUpdateMedia) return
    if (!description) { setImageActionError('Describe the image before saving its description.'); return }
    setImageActionError('')
    const asset = await onUpdateMedia(block.assetId, description)
    if (!asset) { setImageActionError('The image description could not be saved. Please try again.'); return }
    update(index, { altText: asset.alt_text })
  }
  return <section className="wlo-writing-canvas" aria-label="Article content editor">
    <header><div><strong>Write the article</strong><small>Add a section, keep the story in order, and preview it before saving.</small></div><span>{blocks.length} block{blocks.length === 1 ? '' : 's'} · {wordCount} words · {Math.max(1, Math.ceil(wordCount / 200))} min read</span></header>
    <div className="wlo-block-inserter" aria-label="Add article content"><button className="primary" type="button" disabled={disabled} onClick={() => add('paragraph')}><Plus size={14} /> Add text</button><button type="button" disabled={disabled} onClick={() => add('heading_2')}>Add heading</button><button type="button" disabled={disabled} onClick={() => add('image')}><ImagePlus size={14} /> Add image</button><button type="button" disabled={disabled} onClick={() => add('tip')}><Lightbulb size={14} /> Add tip</button><button type="button" disabled={disabled} onClick={() => add('listing_card')}>Add listing</button><div className="wlo-block-more"><button type="button" disabled={disabled} aria-expanded={moreOpen} onClick={() => setMoreOpen((current) => !current)}>More</button>{moreOpen ? <div><button type="button" disabled={disabled} onClick={() => add('heading_3')}>Small heading</button><button type="button" disabled={disabled} onClick={() => add('bullet_list')}>Bulleted list</button><button type="button" disabled={disabled} onClick={() => add('numbered_list')}>Numbered list</button><button type="button" disabled={disabled} onClick={() => add('quote')}>Quote</button><button type="button" disabled={disabled} onClick={() => add('divider')}>Divider</button></div> : null}</div></div>
    <div className="wlo-block-list">{blocks.length ? blocks.map((block, index) => <article className={`wlo-editor-block ${block.type}`} key={block.id}>
      <header><div><GripVertical size={16} aria-hidden="true" /><span>{BLOG_BLOCK_LABELS[block.type] || 'Content block'}</span><select aria-label="Block type" disabled={disabled} value={block.type} onChange={(event) => update(index, { type: event.target.value })}>{Object.entries(BLOG_BLOCK_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>{!disabled ? <div className="wlo-block-actions"><button type="button" aria-label="Move block up" title="Move up" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></button><button type="button" aria-label="Move block down" title="Move down" disabled={index === blocks.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></button><button className="remove" type="button" onClick={() => remove(index)}>Remove</button></div> : null}</header>
      {block.type === 'divider' ? <span className="wlo-block-divider" /> : block.type === 'image' ? <div className="wlo-block-media"><div className="wlo-block-media-actions"><select disabled={disabled} required value={block.assetId || ''} onChange={(event) => { const asset = mediaAssets.find((item) => item.id === event.target.value); update(index, { assetId: event.target.value || null, caption: block.caption || '', altText: asset?.alt_text === 'Image awaiting description' ? '' : asset?.alt_text || '' }) }}><option value="">Select an uploaded image</option>{mediaAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.alt_text || 'Untitled image'}</option>)}</select><label className="wlo-inline-image-upload">Upload image<input disabled={disabled || uploading} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void uploadInlineImage(index, file) }} /></label></div>{block.assetId && mediaAssets.find((asset) => asset.id === block.assetId) ? <><img src={mediaAssets.find((asset) => asset.id === block.assetId).public_url} alt="" /><label>Image description<input disabled={disabled} required maxLength={240} value={block.altText || ''} onChange={(event) => update(index, { altText: event.target.value })} placeholder="Describe this image for visitors who cannot see it" /></label><button type="button" disabled={disabled || uploading || !String(block.altText || '').trim()} onClick={() => void saveInlineImageDescription(index)}>Save image description</button><input disabled={disabled} value={block.caption || ''} maxLength={600} onChange={(event) => update(index, { caption: event.target.value })} placeholder="Add an optional caption" /></> : <small>Upload a new image here, or select one already in the media library.</small>}</div> : block.type === 'listing_card' ? <div className="wlo-block-listing"><select disabled={disabled} required value={block.listingId || ''} onChange={(event) => update(index, { listingId: event.target.value || null })}><option value="">{websiteListings.length ? 'Select a live website listing' : 'No live website listings available'}</option>{websiteListings.map((listing) => <option key={listing.listing_id} value={listing.listing_id}>{listing.title}{listing.suburb ? ` · ${listing.suburb}` : ''}</option>)}</select><small>{websiteListings.length ? 'Only listings already live on this website can be shown in an article.' : 'Publish a listing to this website first, then it will appear here.'}</small></div> : <div className="wlo-block-text">{block.type === 'tip' ? <select disabled={disabled} value={block.tipRole || 'buyer'} onChange={(event) => update(index, { tipRole: event.target.value })}><option value="buyer">Buyer tip</option><option value="seller">Seller tip</option></select> : null}<textarea disabled={disabled} required value={block.text || ''} onChange={(event) => update(index, { text: event.target.value })} placeholder={block.type.includes('heading') ? 'Write a clear section heading' : block.type === 'tip' ? 'Share one practical piece of advice…' : block.type.includes('list') ? 'One item per line' : 'Write your article…'} /></div>}
    </article>) : <button className="wlo-block-empty" type="button" disabled={disabled} onClick={() => add('paragraph')}><Plus size={16} /> Start writing your article</button>}</div>
    {imageActionError ? <p className="ww-error" role="alert">{imageActionError}</p> : null}
  </section>
}

function BlogDraftPreview({ post, websiteListings = [] }) {
  const cover = post.coverImageUrl ? { public_url: post.coverImageUrl, alt_text: post.coverImageAlt } : null
  return <aside className="wlo-blog-preview" aria-label="Draft article preview"><div><span>ARTICLE PREVIEW</span><strong>{post.title || 'Your article title'}</strong><p>{post.summary || 'Your short article introduction will appear here.'}</p></div>{cover ? <img src={cover.public_url} alt="" /> : null}<section><span>BLOG CARD</span><div className="wlo-blog-preview-card">{cover ? <img src={cover.public_url} alt="" /> : null}<strong>{post.title || 'Your article title'}</strong><p>{post.summary || 'Your article summary will appear on the blog page.'}</p></div></section><section className="wlo-seo-preview"><span>SEARCH PREVIEW</span><strong>{post.seoTitle || post.title || 'Your article title'}</strong><small>your-domain.co.za/blog/{post.slug || 'article-url'}</small><p>{post.seoDescription || post.summary || 'Your summary is used when no SEO description is provided.'}</p></section><small>{post.contentBlocks.filter((block) => block.type === 'image').length} inline image{post.contentBlocks.filter((block) => block.type === 'image').length === 1 ? '' : 's'} · {post.contentBlocks.filter((block) => block.type === 'listing_card').length} linked live listing{post.contentBlocks.filter((block) => block.type === 'listing_card').length === 1 ? '' : 's'} · {websiteListings.length} available listing{websiteListings.length === 1 ? '' : 's'}</small></aside>
}

function BlogRenderedPreview({ post, mediaAssets = [], websiteListings = [], device = 'desktop' }) {
  const assetFor = (id) => mediaAssets.find((asset) => asset.id === id)
  const listingFor = (id) => websiteListings.find((listing) => listing.listing_id === id)
  const blocks = Array.isArray(post?.contentBlocks) ? post.contentBlocks : []
  return <article className={`wlo-rendered-preview ${device}`} aria-label="Article website preview"><header><p>PROPERTY JOURNAL</p><small>{post?.authorName || 'Your agency'} · {Math.max(1, Math.ceil(blocks.reduce((total, block) => total + String(block.text || '').trim().split(/\s+/).filter(Boolean).length, 0) / 200))} min read</small><h1>{post?.title || 'Your article title'}</h1><strong>{post?.summary || 'Your article summary will appear here.'}</strong></header>{post?.coverImageUrl ? <img className="hero" src={post.coverImageUrl} alt="" /> : null}<div className="content">{blocks.map((block) => { const asset = block.type === 'image' ? assetFor(block.assetId) : null; const listing = block.type === 'listing_card' ? listingFor(block.listingId) : null; if (block.type === 'heading_2') return <h2 key={block.id}>{block.text}</h2>; if (block.type === 'heading_3') return <h3 key={block.id}>{block.text}</h3>; if (block.type === 'quote') return <blockquote key={block.id}>{block.text}</blockquote>; if (block.type === 'divider') return <hr key={block.id} />; if (block.type === 'bullet_list') return <ul key={block.id}>{String(block.text || '').split('\n').filter(Boolean).map((item) => <li key={item}>{item}</li>)}</ul>; if (block.type === 'numbered_list') return <ol key={block.id}>{String(block.text || '').split('\n').filter(Boolean).map((item) => <li key={item}>{item}</li>)}</ol>; if (block.type === 'image' && asset) return <figure key={block.id}><img src={asset.public_url} alt="" />{block.caption ? <figcaption>{block.caption}</figcaption> : null}</figure>; if (block.type === 'tip') return <aside key={block.id}><b>{block.tipRole === 'seller' ? 'SELLER TIP' : 'BUYER TIP'}</b><p>{block.text}</p></aside>; if (block.type === 'listing_card' && listing) return <section className="listing" key={block.id}><b>FEATURED PROPERTY</b><strong>{listing.title}</strong><span>{listing.suburb || 'View property'}</span></section>; return <p key={block.id}>{block.text}</p> })}</div></article>
}

function BlogSidebarPanel({ label, open, onToggle, children }) {
  return <section className="wlo-blog-sidebar-panel"><button className="wlo-blog-sidebar-toggle" type="button" aria-expanded={open} onClick={onToggle}><span>{label}</span><ChevronRight size={16} aria-hidden="true" /></button>{open ? <div className="wlo-blog-sidebar-content">{children}</div> : null}</section>
}

function WebsiteBlog({ posts = [], draftPosts = [], publishedPosts = [], mediaAssets = [], websiteListings = [], canEdit, error, mediaError, listingError, saving, uploading, updatingMedia, onSave, onUpload, onUpdateMedia, onManage, editorPostId = '', onOpenEditor, onCloseEditor }) {
  const [view, setView] = useState('drafts')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [saveState, setSaveState] = useState('saved')
  const [showPreview, setShowPreview] = useState(false)
  const [previewDevice, setPreviewDevice] = useState('desktop')
  const [scheduledFor, setScheduledFor] = useState('')
  const [editorError, setEditorError] = useState('')
  const [mediaUploadError, setMediaUploadError] = useState('')
  const [mediaUploadNotice, setMediaUploadNotice] = useState('')
  const [publishPanelOpen, setPublishPanelOpen] = useState(true)
  const [featuredImagePanelOpen, setFeaturedImagePanelOpen] = useState(true)
  const [seoPanelOpen, setSeoPanelOpen] = useState(false)
  const [actionsPanelOpen, setActionsPanelOpen] = useState(false)
  const editablePosts = draftPosts.length || canEdit ? draftPosts : posts.filter((post) => post.status === 'draft')
  const livePosts = publishedPosts.length || !canEdit ? publishedPosts : posts.filter((post) => post.status === 'published')
  const allPosts = [...editablePosts, ...livePosts.filter((post) => !editablePosts.some((draft) => draft.id === post.id))]
  const requestedPost = editorPostId === 'new' ? {} : allPosts.find((post) => post.id === editorPostId)
  const visiblePosts = (view === 'all' ? allPosts : view === 'published' ? livePosts : editablePosts).filter((post) => `${post.title} ${post.summary} ${post.slug}`.toLowerCase().includes(query.trim().toLowerCase()))
  const fingerprint = (post) => JSON.stringify({ title: post?.title, slug: post?.slug, summary: post?.summary, coverImageUrl: post?.coverImageUrl, coverImageAlt: post?.coverImageAlt, contentBlocks: post?.contentBlocks, authorName: post?.authorName, seoTitle: post?.seoTitle, seoDescription: post?.seoDescription })
  useEffect(() => {
    if (!editorPostId) { setEditing(null); setSavedSnapshot(''); setShowPreview(false); return }
    const source = editorPostId === 'new' ? cleanBlogPost() : requestedPost
    if (!source) return
    const next = cleanBlogPost(source)
    setEditing(next); setSavedSnapshot(fingerprint(next)); setSaveState('saved'); setShowPreview(false); setScheduledFor(next.scheduledFor ? String(next.scheduledFor).slice(0, 16) : ''); setEditorError(''); setMediaUploadError(''); setMediaUploadNotice(''); setPublishPanelOpen(true); setFeaturedImagePanelOpen(true); setSeoPanelOpen(false); setActionsPanelOpen(false)
  }, [editorPostId, posts, draftPosts, publishedPosts])
  const isDirty = Boolean(editing && fingerprint(editing) !== savedSnapshot)
  const validationMessage = blogValidationMessage(editing, mediaAssets, websiteListings)
  useEffect(() => {
    if (!editing?.id || !isDirty || !canEdit || validationMessage) return undefined
    setSaveState('saving')
    const snapshot = fingerprint(editing)
    const timer = window.setTimeout(() => {
      void onSave(editing).then((saved) => {
        if (saved) { setSavedSnapshot(snapshot); setSaveState('saved') } else setSaveState('failed')
      })
    }, 900)
    return () => window.clearTimeout(timer)
  }, [editing, isDirty, canEdit, onSave, validationMessage])
  useEffect(() => {
    const warn = (event) => { if (isDirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty])
  const openNew = () => { if (canEdit) onOpenEditor?.('new') }
  const openPost = (post) => onOpenEditor?.(post.id)
  const change = (field, value) => { setEditorError(''); setEditing((current) => ({ ...current, [field]: value, ...(field === 'title' && !current.slug ? { slug: blogSlugFromTitle(value) } : {}) })) }
  const chooseCover = (assetId) => { const asset = mediaAssets.find((item) => item.id === assetId); change('coverImageUrl', asset?.public_url || ''); change('coverImageAlt', asset?.alt_text || '') }
  const selectedCoverAsset = mediaAssets.find((asset) => asset.public_url === editing?.coverImageUrl)
  const updateSelectedMediaDescription = async () => {
    if (!selectedCoverAsset || !editing) return
    const altText = editing.coverImageAlt.trim()
    if (!altText) { setMediaUploadNotice(''); setMediaUploadError('Add cover image alt text before updating the media library.'); return }
    setMediaUploadError(''); setMediaUploadNotice('Saving image description…')
    const asset = await onUpdateMedia(selectedCoverAsset.id, altText)
    if (!asset) { setMediaUploadNotice(''); setMediaUploadError('The image description could not be saved. Please try again.'); return }
    setEditing((current) => ({ ...current, coverImageAlt: asset.alt_text }))
    setMediaUploadNotice('Image description saved to the media library.')
  }
  const save = async () => {
    if (!editing) return
    if (validationMessage) { setEditorError(validationMessage); setSaveState('needs-attention'); return }
    setEditorError('')
    setSaveState('saving')
    const saved = await onSave(editing)
    if (saved) {
      const next = cleanBlogPost({ ...editing, ...saved, status: 'draft' })
      setEditing(next); setSavedSnapshot(fingerprint(next)); setSaveState('saved')
      if (!editing.id && saved.id) onOpenEditor?.(saved.id)
    } else setSaveState('failed')
  }
  const manage = async (action, requestedSchedule = '') => {
    if (!editing?.id) return
    const nextSchedule = action === 'schedule' ? requestedSchedule : null
    if (action === 'schedule' && (!nextSchedule || Number.isNaN(new Date(nextSchedule).getTime()) || new Date(nextSchedule) <= new Date())) { setEditorError('Choose a future date and time before scheduling this post.'); return }
    setEditorError('')
    const result = await onManage(editing.id, action, nextSchedule ? new Date(nextSchedule).toISOString() : null)
    if (!result) return
    if (action === 'delete') { onCloseEditor?.(); return }
    setEditing((current) => ({ ...current, lifecycleStatus: result.status || current.lifecycleStatus, scheduledFor: result.scheduledFor || null }))
  }
  if (!editorPostId) return <section className="wlo-section-card wlo-blog-library" aria-label="Website blog"><WebsiteSectionHeading title="Blog & resources" detail="Share useful local insight and build trust with buyers, sellers and landlords." action={<button className="ww-publish" type="button" disabled={!canEdit} onClick={openNew}>Create post</button>} />
    {error ? <p className="ww-error">Blog posts will be available once the Website workspace migration is applied.</p> : null}
    <div className="wlo-blog-library-controls"><input className="wlo-blog-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search posts, topics or keywords…" aria-label="Search blog posts" /><nav className="wlo-blog-tabs" aria-label="Blog post status"><button className={view === 'all' ? 'active' : ''} type="button" onClick={() => setView('all')}>All <b>{allPosts.length}</b></button><button className={view === 'drafts' ? 'active' : ''} type="button" onClick={() => setView('drafts')}>Drafts <b>{editablePosts.length}</b></button><button className={view === 'published' ? 'active' : ''} type="button" onClick={() => setView('published')}>Published <b>{livePosts.length}</b></button></nav></div>
    <div className="wlo-blog-card-grid">{visiblePosts.length ? visiblePosts.map((post) => { const cover = post.cover_image_url || post.coverImageUrl; const state = String(post.lifecycle_status || post.status || 'draft').replaceAll('_', ' '); return <button type="button" key={post.id} className="wlo-blog-card" onClick={() => openPost(post)}>{cover ? <img src={cover} alt="" /> : <div className="wlo-blog-card-placeholder"><FileText size={26} /></div>}<span className="wlo-blog-card-status"><i className={state === 'published' ? 'published' : ''} />{state}</span><div><strong>{post.title || 'Untitled article'}</strong><p>{post.summary || 'Start writing a useful local property story.'}</p><small>{post.author_name || post.authorName || 'Your agency'} · /blog/{post.slug || 'new-post'}</small></div></button> }) : <p className="wlo-table-empty">{query ? 'No articles match your search.' : 'No posts in this view yet.'}</p>}</div>
  </section>

  if (!editing) return <section className="wlo-blog-workspace wlo-blog-editor-loading" aria-live="polite"><button className="wlo-blog-back" type="button" onClick={() => onCloseEditor?.()}><ArrowLeft size={17} /> All posts</button><div><FileText size={24} /><strong>{requestedPost ? 'Loading article editor…' : allPosts.length ? 'This article is no longer available in the current website draft.' : 'Loading article editor…'}</strong><p>{requestedPost || !allPosts.length ? 'Your website content is loading. Please wait a moment.' : 'Return to the post library and choose an article from the current draft.'}</p></div></section>

  return <section className="wlo-blog-workspace" aria-label="Blog post editor"><header className="wlo-blog-topbar"><button className="wlo-blog-back" type="button" onClick={() => { if (!isDirty || window.confirm('You have unsaved local changes. Leave this editor?')) onCloseEditor?.() }}><ArrowLeft size={17} /> All posts</button><p className={saveState}>{saveState === 'saving' ? 'Saving…' : saveState === 'failed' ? 'Unable to save — retry' : saveState === 'needs-attention' ? 'Complete required fields' : 'Saved just now'}</p><div><button className="ww-rollback" type="button" onClick={() => setShowPreview((current) => !current)}>{showPreview ? 'Continue editing' : 'Preview'}</button><select aria-label="Publication status" disabled={!editing?.id || !canEdit} value={editing?.lifecycleStatus || 'draft'} onChange={(event) => { const next = event.target.value; if (next === 'scheduled') setEditorError('Set a future publication date in the Publish panel, then choose Schedule post.'); else if (next === 'ready_for_review') void manage('ready_for_review'); else void manage('draft') }}><option value="draft">Draft</option><option value="ready_for_review">Ready for review</option><option value="scheduled">Scheduled</option></select><button className="ww-publish" type="button" disabled={!canEdit || saving || uploading} onClick={() => void save()}>{saving ? 'Saving…' : 'Save post'}</button></div></header>
    {showPreview ? <div className="wlo-blog-full-preview"><div className="wlo-preview-device-toggle"><button type="button" className={previewDevice === 'desktop' ? 'active' : ''} onClick={() => setPreviewDevice('desktop')}>Desktop</button><button type="button" className={previewDevice === 'mobile' ? 'active' : ''} onClick={() => setPreviewDevice('mobile')}>Mobile</button></div><BlogRenderedPreview post={editing} mediaAssets={mediaAssets} websiteListings={websiteListings} device={previewDevice} /></div> : <form className="wlo-blog-editor-page" onSubmit={(event) => { event.preventDefault(); void save() }}>
      <main className="wlo-blog-editor-canvas"><section className="wlo-title-section" aria-labelledby="article-title-heading"><div><p className="wlo-blog-category">PROPERTY JOURNAL</p><h2 id="article-title-heading">Title</h2><small>Give readers a clear reason to open the article.</small></div><input className="wlo-blog-title" aria-labelledby="article-title-heading" disabled={!canEdit} required maxLength={160} value={editing?.title || ''} onChange={(event) => change('title', event.target.value)} placeholder="Give your article a clear, useful title" /><label className="wlo-blog-slug">your website /blog/<input disabled={!canEdit} required maxLength={80} value={editing?.slug || ''} onChange={(event) => change('slug', event.target.value)} placeholder="article-url" /></label></section>
        {editorError ? <p className="ww-error" role="alert">{editorError}</p> : null}<BlogBlockEditor blocks={editing?.contentBlocks || []} disabled={!canEdit} mediaAssets={mediaAssets} websiteListings={websiteListings} uploading={uploading} onUpload={onUpload} onUpdateMedia={onUpdateMedia} onChange={(contentBlocks) => change('contentBlocks', contentBlocks)} />{listingError ? <small className="ww-error">Live listings: {listingError}</small> : null}
      </main>
      <aside className="wlo-blog-settings"><BlogSidebarPanel label="Publish" open={publishPanelOpen} onToggle={() => setPublishPanelOpen((current) => !current)}><label>Article excerpt<textarea disabled={!canEdit} maxLength={600} value={editing?.summary || ''} onChange={(event) => change('summary', event.target.value)} placeholder="Summarise why someone should read this article." /></label><small>{(editing?.summary || '').length}/600</small><label>Author<input disabled={!canEdit} maxLength={160} value={editing?.authorName || ''} onChange={(event) => change('authorName', event.target.value)} placeholder="Agency team" /></label><label>Status<select disabled={!editing?.id || !canEdit} value={editing?.lifecycleStatus || 'draft'} onChange={(event) => { const next = event.target.value; if (next === 'scheduled') setEditorError('Set a future publication date below, then choose Schedule post.'); else if (next === 'ready_for_review') void manage('ready_for_review'); else void manage('draft') }}><option value="draft">Draft</option><option value="ready_for_review">Ready for review</option><option value="scheduled">Scheduled</option></select></label><label>Publication date and time<input disabled={!editing?.id || !canEdit} type="datetime-local" value={scheduledFor} onChange={(event) => { setEditorError(''); setScheduledFor(event.target.value) }} /></label><button type="button" disabled={!editing?.id || !canEdit} onClick={() => void manage('schedule', scheduledFor)}>Schedule post</button><p>{editing?.scheduledFor ? `Scheduled for ${new Date(editing.scheduledFor).toLocaleString()}` : 'Changes remain private until the website revision is published.'}</p></BlogSidebarPanel><BlogSidebarPanel label="Featured image" open={featuredImagePanelOpen} onToggle={() => setFeaturedImagePanelOpen((current) => !current)}><section className="wlo-cover-image wlo-cover-image-compact" aria-label="Featured image controls"><div className="wlo-cover-image-heading"><div><strong>Featured image</strong><small>Used on the public article and journal card.</small></div>{editing.coverImageUrl ? <img className="wlo-featured-image" src={editing.coverImageUrl} alt="" /> : null}</div><div className="wlo-cover-image-controls"><label>Image from media library<select disabled={!canEdit} value={selectedCoverAsset?.id || ''} onChange={(event) => { chooseCover(event.target.value); setMediaUploadError(''); setMediaUploadNotice('') }}><option value="">{mediaAssets.length ? 'Select an image' : 'No library images yet'}</option>{mediaAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.alt_text || 'Untitled image'}</option>)}</select></label><label>Alt text<input disabled={!canEdit} required={Boolean(editing.coverImageUrl)} maxLength={240} value={editing.coverImageAlt} onChange={(event) => { change('coverImageAlt', event.target.value); setMediaUploadError('') }} placeholder="Describe the image before saving" /></label></div><div className="wlo-cover-actions"><button className="ww-rollback" type="button" disabled={!canEdit || !editing.coverImageUrl} onClick={() => { chooseCover(''); setMediaUploadError(''); setMediaUploadNotice('') }}>Remove</button>{selectedCoverAsset ? <button className="ww-rollback" type="button" disabled={!canEdit || updatingMedia} onClick={() => void updateSelectedMediaDescription()}>{updatingMedia ? 'Saving description…' : 'Save image description'}</button> : null}<label className="wlo-media-upload">Upload image<input disabled={!canEdit || uploading} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const altText = editing.coverImageAlt.trim(); setMediaUploadError(''); setMediaUploadNotice('Uploading image…'); void onUpload(file, altText || 'Image awaiting description', (asset) => { setEditing((current) => ({ ...current, coverImageUrl: asset.public_url, coverImageAlt: altText })); setMediaUploadNotice(altText ? 'Image uploaded and selected.' : 'Image uploaded. Add its alt text before saving the post.'); event.target.value = '' }).then((asset) => { if (!asset) { setMediaUploadNotice(''); setMediaUploadError('The image could not be uploaded. Please try again.') } }) }} /></label></div>{!editing.coverImageUrl ? <p className="wlo-cover-warning" role="status">Choose or upload a featured image before saving.</p> : null}{mediaUploadError || mediaError ? <p className="ww-error" role="status">{mediaUploadError || `Media library: ${mediaError}`}</p> : null}{mediaUploadNotice ? <p className="ww-notice" role="status">{mediaUploadNotice}</p> : null}</section></BlogSidebarPanel><BlogSidebarPanel label="SEO" open={seoPanelOpen} onToggle={() => setSeoPanelOpen((current) => !current)}><label>SEO title<input disabled={!canEdit} maxLength={180} value={editing?.seoTitle || ''} onChange={(event) => change('seoTitle', event.target.value)} placeholder="Optional search title" /></label><label>Meta description<textarea disabled={!canEdit} maxLength={320} value={editing?.seoDescription || ''} onChange={(event) => change('seoDescription', event.target.value)} placeholder="Optional search description" /></label><small>{(editing?.seoDescription || '').length}/320</small><BlogDraftPreview post={editing} websiteListings={websiteListings} /></BlogSidebarPanel>{editing?.id && canEdit ? <BlogSidebarPanel label="Post actions" open={actionsPanelOpen} onToggle={() => setActionsPanelOpen((current) => !current)}><button type="button" onClick={() => void manage('duplicate')}>Duplicate post</button><button type="button" onClick={() => void manage('archive')}>Archive post</button><button className="danger" type="button" onClick={() => { if (window.confirm('Delete this article from the current website draft?')) void manage('delete') }}>Delete post</button></BlogSidebarPanel> : null}</aside>
    </form>}
  </section>
}

function WebsiteAnalytics({ analytics, error }) {
  const daily = Array.isArray(analytics?.dailyTraffic) ? analytics.dailyTraffic : []
  const topPages = Array.isArray(analytics?.topPages) ? analytics.topPages : []
  const topListings = Array.isArray(analytics?.topListings) ? analytics.topListings : []
  const recent = Array.isArray(analytics?.recentSubmissions) ? analytics.recentSubmissions : []
  const max = Math.max(1, ...daily.map((item) => Number(item.pageViews || 0)))
  const metrics = [
    ['Visits', String(analytics?.visits || 0), 'Privacy-conscious session visits'],
    ['Page views', String(analytics?.pageViews || 0), 'First-party page views'],
    ['Listing views', String(analytics?.listingViews || 0), 'Published listing detail views'],
    ['Enquiries', String(analytics?.submissions || 0), 'Completed website submissions'],
    ['Valuation requests', String(analytics?.valuationRequests || 0), 'Website valuation forms'],
    ['Leads created', String(analytics?.leadsCreated || 0), 'CRM leads routed from the site'],
  ]
  return <section className="wwo-analytics" aria-label="Website analytics for the last 30 days"><div className="wwo-analytics-heading"><div><h2>Last 30 days</h2><p>Visits and page views are counted as privacy-conscious aggregates. Arch9 does not store visitor identities, IP addresses or browsing histories.</p></div><span className="wwo-period">Last 30 days</span></div>{error && <p className="ww-error">Website analytics will become available after the dashboard update is applied.</p>}<div className="wwo-metrics">{metrics.map(([label, value, detail]) => <article key={label}><small>{label}</small><strong>{value}</strong><span>{detail}</span></article>)}</div><div className="wwo-analytics-grid"><article className="wwo-chart"><div><strong>Website traffic</strong><small>Daily first-party page views</small></div>{daily.length ? <div className="wwo-bars">{daily.map((item) => <span key={item.date} title={`${item.date}: ${item.pageViews} page views`}><i style={{ height: `${Math.max(5, Number(item.pageViews || 0) * 100 / max)}%` }} /><small>{new Date(`${item.date}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</small></span>)}</div> : <p className="wwo-empty-data">No website traffic has been recorded in this period.</p>}</article><article className="wwo-top-pages"><div><strong>Top pages</strong><small>Ranked by first-party page views</small></div>{topPages.length ? <ol>{topPages.map((item, index) => <li key={`${item.label}-${index}`}><span>{index + 1}</span><strong>{item.label}</strong><b>{item.views}</b></li>)}</ol> : <p className="wwo-empty-data">No page-view data yet.</p>}</article></div><div className="wwo-analytics-grid"><article className="wwo-top-pages"><div><strong>Top listings</strong><small>Ranked by listing-detail views</small></div>{topListings.length ? <ol>{topListings.map((item, index) => <li key={`${item.label}-${index}`}><span>{index + 1}</span><strong>{item.label}</strong><b>{item.views}</b></li>)}</ol> : <p className="wwo-empty-data">No listing-view data yet.</p>}</article><article className="wwo-recent-submissions"><div><strong>Recent website submissions</strong><small>Only submissions recorded by this organisation’s public website are shown.</small></div>{recent.length ? <ol>{recent.slice(0, 4).map((item) => <li key={item.id}><span><strong>{String(item.submissionType || 'website enquiry').replaceAll('_', ' ')}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></span><em>{item.status}</em><b>{item.leadId ? 'CRM lead linked' : 'Processing'}</b></li>)}</ol> : <p className="wwo-empty-data">No recent submissions.</p>}</article></div></section>
}

function WebsiteDomainManager({ siteId, domains, onChanged }) {
  const [hostname, setHostname] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const customDomains = domains.filter((domain) => domain.domain_kind === 'custom')
  const run = async (action, domain) => {
    setBusy(`${action}:${domain?.id || 'new'}`); setError(''); setNotice('')
    try { await manageWebsiteDomain({ action, siteId, hostname: action === 'connect' ? hostname : '', domainId: domain?.id }); setHostname(''); setNotice(action === 'connect' ? 'Domain added. Add the website-only DNS records, then verify it.' : action === 'verify' ? 'Domain verification checked.' : action === 'make-primary' ? 'The verified domain is now primary.' : 'Unconnected domain removed.'); await onChanged() } catch (cause) { setError(cause.message || 'Website domain management could not be completed.') } finally { setBusy('') }
  }
  return <section className="wwo-domain-manager"><div className="wwo-domain-heading"><div><span className="md-eyebrow">DOMAIN MANAGEMENT</span><h2>Connect a website domain safely.</h2><p>Only website records are used. This never changes nameservers, MX, SPF, DKIM, or DMARC records.</p></div></div>{error && <p className="ww-error">{error}</p>}{notice && <p className="ww-notice">{notice}</p>}<form onSubmit={(event) => { event.preventDefault(); void run('connect') }}><label>Domain name<input value={hostname} onChange={(event) => setHostname(event.target.value)} placeholder="www.example.co.za" required /></label><button className="ww-publish" type="submit" disabled={Boolean(busy)}>{busy === 'connect:new' ? 'Adding…' : 'Add domain'}</button></form>{customDomains.length ? <div className="wwo-domain-list">{customDomains.map((domain) => { const records = Array.isArray(domain.dns_instructions?.verification) ? domain.dns_instructions.verification : []; return <article key={domain.id}><div><strong>{domain.hostname}</strong><small>{domain.status}{domain.is_primary ? ' · primary' : ''}</small>{records.length > 0 && <p>Vercel verification records are ready. Add only the records shown by your domain provider; email records remain untouched.</p>}</div><div className="wwo-domain-actions">{domain.status !== 'active' && <button type="button" className="ww-rollback" disabled={Boolean(busy)} onClick={() => void run('verify', domain)}>{busy === `verify:${domain.id}` ? 'Verifying…' : 'Verify'}</button>}{domain.status === 'verified' && <button type="button" className="ww-publish" disabled={Boolean(busy)} onClick={() => void run('make-primary', domain)}>{busy === `make-primary:${domain.id}` ? 'Activating…' : 'Make primary'}</button>}{['pending', 'failed', 'disabled'].includes(domain.status) && !domain.is_primary && <button type="button" className="ww-rollback" disabled={Boolean(busy)} onClick={() => void run('remove', domain)}>{busy === `remove:${domain.id}` ? 'Removing…' : 'Remove'}</button>}</div></article> })}</div> : <p className="wwo-empty-data">No custom domains connected yet. Your managed preview remains available.</p>}</section>
}

function WebsiteReleasePreview({ previewUrl, draftRevision, publishedRevision, publicationReadiness, onManage }) {
  const [device, setDevice] = useState('desktop')
  const blockers = Array.isArray(publicationReadiness?.blockers) ? publicationReadiness.blockers : []
  const publishedAt = publishedRevision?.published_at ? new Date(publishedRevision.published_at).toLocaleString() : 'Not published yet'
  const publisher = publishedRevision?.published_by ? `Publisher ${String(publishedRevision.published_by).slice(0, 8)}` : 'Publisher not recorded'
  return <section className="wwo-release-preview"><div className="wwo-release-heading"><div><span className="md-eyebrow">PREVIEW & PUBLISHING</span><h2>Review the public site before releasing changes.</h2><p>The embedded preview always shows the current public revision. Draft edits remain isolated until the publishing checks pass.</p></div><div className="wwo-device-toggle"><button type="button" className={device === 'desktop' ? 'active' : ''} onClick={() => setDevice('desktop')}>Desktop</button><button type="button" className={device === 'mobile' ? 'active' : ''} onClick={() => setDevice('mobile')}>Mobile</button></div></div><div className="wwo-release-grid"><div className="wwo-preview-frame-wrap"><div className={`wwo-preview-frame ${device}`}>{previewUrl ? <iframe title="Current public website preview" src={previewUrl} /> : <p className="wwo-empty-data">A connected preview URL is required to render the public website.</p>}</div>{previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer">Open public preview <ArrowUpRight size={14} /></a>}</div><div className="wwo-release-status"><article><small>DRAFT</small><strong>{draftRevision ? `Revision ${draftRevision.revision_number}` : 'No active draft'}</strong><span>{draftRevision ? `Updated ${new Date(draftRevision.updated_at).toLocaleString()}` : 'Create website changes to begin.'}</span></article><article><small>PUBLISHED</small><strong>{publishedRevision ? `Revision ${publishedRevision.revision_number}` : 'No published revision'}</strong><span>{publishedAt} · {publisher}</span></article><div className={blockers.length ? 'wwo-blockers blocked' : 'wwo-blockers ready'}><strong>{draftRevision ? blockers.length ? 'Release blockers' : 'Ready to publish' : 'No draft to review'}</strong>{blockers.length ? <ul>{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : <p>{draftRevision ? 'Required website, content and domain checks have passed.' : 'The published site remains unchanged.'}</p>}</div><button type="button" className="ww-publish" onClick={onManage}>{draftRevision ? 'Review website changes' : 'Edit website'}</button></div></div></section>
}

export default function WebsiteWorkspace({ onBack, blogEditorId = '', onOpenBlogEditor, onCloseBlogEditor }) {
  const { authState } = useAuthSession()
  const navigate = useNavigate()
  const organisationId = useMemo(() => getOrganisationId(authState), [authState])
  const [leadWindowDays, setLeadWindowDays] = useState(30)
  const [showEditor, setShowEditor] = useState(false)
  const [editorSection, setEditorSection] = useState('identity')
  const [showDomainManager, setShowDomainManager] = useState(false)
  const [activeSection, setActiveSection] = useState('overview')
  const [previewDevice, setPreviewDevice] = useState('desktop')
  const [overview, setOverview] = useState({ mode: 'loading', pilot: null, productionRelease: null, productionDarkLaunch: null, site: null, domains: [], pages: [], publishedRevision: null, publicationEvents: [], managementEvents: [], publicationReadiness: null, analytics: null, analyticsError: '', websiteLeads: [], websiteLeadsError: '', websiteSubmissions: [], websiteSubmissionsError: '', blogPosts: [], draftBlogPosts: [], publishedBlogPosts: [], blogPostsError: '', mediaAssets: [], mediaAssetsError: '', websiteListings: [], websiteListingsError: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [action, setAction] = useState('')

  const refresh = async () => {
    setError('')
    setOverview((current) => ({ ...current, mode: 'loading' }))
    try { setOverview(await getWebsiteWorkspaceOverview(organisationId, { leadWindowDays })) } catch (loadError) { setError('Website settings could not be loaded.'); setOverview({ mode: 'error', pilot: null, productionRelease: null, productionDarkLaunch: null, site: null, domains: [], pages: [], publishedRevision: null, publicationEvents: [], managementEvents: [], publicationReadiness: null, analytics: null, analyticsError: '', websiteLeads: [], websiteLeadsError: '', websiteSubmissions: [], websiteSubmissionsError: '', blogPosts: [], draftBlogPosts: [], publishedBlogPosts: [], blogPostsError: '', mediaAssets: [], mediaAssetsError: '', websiteListings: [], websiteListingsError: '' }) }
  }

  useEffect(() => { void refresh() }, [organisationId, leadWindowDays])
  useEffect(() => { if (blogEditorId) setActiveSection('blog') }, [blogEditorId])
  const primaryDomain = overview.domains.find((domain) => domain.is_primary) || overview.domains.find((domain) => domain.domain_kind === 'preview')
  const hasPublishedSite = overview.site?.status === 'published' && Boolean(overview.publishedRevision)
  const previewUrl = primaryDomain?.hostname
    ? `https://${primaryDomain.hostname}`
    : overview.productionDarkLaunch?.candidate_deployment_url || overview.productionRelease?.candidate_deployment_url || ''
  const siteState = overview.mode === 'loading'
    ? 'Checking website'
    : hasPublishedSite && primaryDomain?.domain_kind === 'custom'
      ? 'Live'
      : overview.mode === 'connected'
        ? 'Preview'
        : overview.mode === 'ready_to_create'
          ? 'Ready to create'
          : overview.mode === 'pilot_paused'
            ? 'Paused'
            : 'Not available'
  const lastPublished = overview.publishedRevision?.published_at
    ? new Date(overview.publishedRevision.published_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Not published yet'
  const agencyName = websiteName(authState, overview)
  const publicationBlockers = Array.isArray(overview.publicationReadiness?.blockers) ? overview.publicationReadiness.blockers : []
  const publicationReady = overview.publicationReadiness?.ready === true || (publicationBlockers.length > 0 && publicationBlockers.every(isRepairableBrandBlocker))
  const changesReadyCount = Math.max(0, Number(overview.publicationReadiness?.changesReadyCount || 0))
  const websiteIsConnected = overview.mode === 'connected'

  // The website tools are a managed service. Do not expose mock previews,
  // empty editors, or landing-page controls before a real site is connected.
  if (!websiteIsConnected) {
    const isChecking = overview.mode === 'loading'
    return (
      <div className="wa-page website-workspace website-overview">
        <section className="ww-website-access-gate" aria-live="polite">
          <LockKeyhole size={24} />
          <div>
            <span className="md-eyebrow">WEBSITE & LANDING PAGES</span>
            <h1>{isChecking ? 'Checking your website connection…' : 'Connect your website'}</h1>
            <p>{isChecking
              ? 'We are checking whether this workspace has a connected Arch9 website.'
              : 'Website previews, landing pages, analytics and editing are available once your agency website is connected.'}</p>
            {!isChecking ? <p className="ww-website-access-note">Need a custom website? Contact your Arch9 administrator or your usual Arch9 contact person to get connected.</p> : null}
          </div>
        </section>
      </div>
    )
  }
  const createSite = async () => {
    if (!organisationId || action) return
    setAction('create')
    setError('')
    setNotice('')
    try {
      await createWebsiteSite(organisationId)
      await refresh()
      setNotice('Your website draft has been created from your organisation branding.')
    } catch (creationError) {
      setError(creationError?.message || 'Website setup could not be completed.')
    } finally {
      setAction('')
    }
  }
  const selectTemplate = async (templateKey) => {
    if (!overview.site?.id || action || overview.site.status !== 'draft' || overview.site.publishedRevisionId) return
    setAction('template')
    setError('')
    setNotice('')
    try {
      await setWebsiteDraftTemplate(overview.site.id, templateKey)
      await refresh()
      setNotice(templateKey === 'home-seekers-v1' ? 'Home Seekers website template selected. Your edits remain private until publication.' : 'Property Standard website template selected. Your edits remain private until publication.')
    } catch (templateError) {
      setError(templateError?.message || 'Website template could not be updated.')
    } finally {
      setAction('')
    }
  }
  const saveBrand = async (brand) => {
    if (!overview.site?.id || !overview.draftRevision?.id || action) return
    setAction('brand')
    setError('')
    setNotice('')
    try {
      await saveWebsiteDraftBrand(overview.site.id, overview.draftRevision.id, brand)
      await refresh()
      setNotice('Website branding saved to the draft.')
    } catch (brandError) {
      setError(brandError?.message || 'Website branding could not be saved.')
    } finally {
      setAction('')
    }
  }
  const resetBrand = async () => {
    if (!overview.site?.id || !overview.draftRevision?.id || action) return
    setAction('brand-reset')
    setError('')
    setNotice('')
    try {
      await resetWebsiteDraftBrand(overview.site.id, overview.draftRevision.id)
      await refresh()
      setNotice('Website branding reset from the current organisation branding.')
    } catch (brandError) {
      setError(brandError?.message || 'Website branding could not be reset.')
    } finally {
      setAction('')
    }
  }
  const runAction = async (type) => {
    if (!overview.site?.id || action) return
    if (type === 'publish' && !publicationReady) {
      setError('Complete the items shown before publishing your website changes.')
      return
    }
    if (type === 'publish' && !window.confirm('Publish these website changes? They will become visible on your public website.')) return
    if (type === 'discard' && (!overview.draftRevision?.id || !window.confirm('Discard these unpublished website changes? Your live website will not be affected.'))) return
    setAction(type)
    setError('')
    setNotice('')
    try {
      if (type === 'draft') await createWebsiteDraft(overview.site.id)
      if (type === 'publish' && overview.draftRevision?.id) await publishWebsiteDraft(overview.site.id, overview.draftRevision.id)
      if (type === 'discard' && overview.draftRevision?.id) await discardWebsiteDraft(overview.site.id, overview.draftRevision.id)
      await refresh()
      if (type === 'publish') setNotice('Your website changes are now live.')
      if (type === 'discard') setNotice('Your unpublished changes were discarded. Your live website was not changed.')
    } catch (actionError) { setError(actionError?.message || 'Website publishing action could not be completed.') } finally { setAction('') }
  }
  const saveBlog = async (post) => {
    if (!overview.site?.id || !overview.draftRevision?.id || action) return null
    setAction('blog'); setError(''); setNotice('')
    try {
      const saved = post.id
        ? await updateWebsiteBlogPost({ siteId: overview.site.id, revisionId: overview.draftRevision.id, postId: post.id, post })
        : await createWebsiteBlogPost({ siteId: overview.site.id, revisionId: overview.draftRevision.id, post })
      await refresh()
      setNotice('Article saved to the website draft. It will appear publicly only when the full reviewed revision is published.')
      return saved
    } catch (blogError) { setError(blogError?.message || 'Blog post could not be saved.'); return null } finally { setAction('') }
  }
  const uploadBlogMedia = async (file, altText, onUploaded) => {
    if (!overview.site?.id || !organisationId || action) return null
    setAction('blog-media'); setError(''); setNotice('')
    try {
      const asset = await uploadWebsiteBlogMedia({ siteId: overview.site.id, organisationId, file, altText })
      await refresh()
      onUploaded?.(asset)
      setNotice('Image uploaded to this website’s media library.')
      return asset
    } catch (mediaUploadError) { setError(mediaUploadError?.message || 'The website image could not be uploaded.'); return null } finally { setAction('') }
  }
  const updateBlogMedia = async (assetId, altText) => {
    if (!overview.site?.id || action) return null
    setAction('blog-media-meta'); setError(''); setNotice('')
    try {
      const asset = await updateWebsiteBlogMedia({ siteId: overview.site.id, assetId, altText })
      await refresh()
      setNotice('Image description updated in the website media library.')
      return asset
    } catch (mediaUpdateError) { setError(mediaUpdateError?.message || 'The image description could not be updated.'); return null } finally { setAction('') }
  }
  const manageBlog = async (postId, blogAction, scheduledFor) => {
    if (!overview.site?.id || !overview.draftRevision?.id || action) return null
    setAction('blog-manage'); setError(''); setNotice('')
    try {
      const result = await manageWebsiteBlogPost({ siteId: overview.site.id, revisionId: overview.draftRevision.id, postId, action: blogAction, scheduledFor })
      await refresh()
      setNotice(blogAction === 'schedule' ? 'Article scheduling has been saved. It becomes visible after the website revision is published and the scheduled time arrives.' : `Article ${blogAction.replaceAll('_', ' ')}.`)
      return result
    } catch (blogManageError) { setError(blogManageError?.message || 'The article action could not be completed.'); return null } finally { setAction('') }
  }
  const savePage = async (page) => {
    if (!overview.site?.id || !overview.draftRevision?.id || action) return
    setAction('page')
    setError('')
    setNotice('')
    try {
      await saveWebsiteDraftPage({ siteId: overview.site.id, revisionId: overview.draftRevision.id, ...page })
      await refresh()
      setNotice(`${page.title || 'Page'} saved to the website draft.`)
    } catch (pageError) {
      setError(pageError?.message || 'Website page could not be saved.')
    } finally {
      setAction('')
    }
  }
  if (showDomainManager) return <div className="wa-page website-workspace website-overview"><button className="ww-back" type="button" onClick={() => setShowDomainManager(false)}><ArrowLeft size={16} /> Websites</button>{overview.site ? <WebsiteDomainManager siteId={overview.site.id} domains={overview.domains} onChanged={refresh} /> : <p className="ww-error">A website must be created before its domain can be managed.</p>}</div>

  if (!showEditor) return (
    <div className="wa-page website-workspace website-overview">
      <section className="wlo-header"><div><div className="wlo-title"><h1>{agencyName}</h1><span className={hasPublishedSite ? 'live' : 'preview'}><i /> {hasPublishedSite ? 'Live' : 'Preview'}</span></div>{primaryDomain?.hostname && <p>{primaryDomain.hostname}</p>}</div><div className="wlo-header-actions">{previewUrl ? <a className="ww-rollback" href={previewUrl} target="_blank" rel="noreferrer">{hasPublishedSite ? 'Open live site' : 'Open preview'} <ArrowUpRight size={15} /></a> : null}{overview.mode === 'ready_to_create' ? <button className="ww-publish" type="button" disabled={Boolean(action) || !organisationId} onClick={() => void createSite()}>{action === 'create' ? 'Creating…' : 'Create website'}</button> : <button className="ww-publish" type="button" disabled={overview.mode !== 'connected'} onClick={() => setShowEditor(true)}>Edit website</button>}</div></section>
      {error && <p className="ww-error" role="status">{error}</p>}
      {notice && <p className="ww-notice" role="status">{notice}</p>}
      <WebsiteStats analytics={overview.analytics} />
      <nav className="wlo-tabs" aria-label="Website sections">{[{ id: 'overview', label: 'Overview' }, { id: 'leads', label: 'Leads' }, { id: 'analytics', label: 'Analytics' }, { id: 'submissions', label: 'Form submissions' }, { id: 'blog', label: 'Blog' }, { id: 'editor', label: 'Edit website' }].map((section) => <button key={section.id} type="button" className={activeSection === section.id ? 'active' : ''} onClick={() => section.id === 'editor' ? setShowEditor(true) : setActiveSection(section.id)}>{section.label}</button>)}</nav>
      {activeSection === 'overview' ? <><section className="wlo-main-card" id="website-overview"><WebsiteLandingPreview previewUrl={previewUrl} websiteName={agencyName} primaryDomain={primaryDomain} device={previewDevice} setDevice={setPreviewDevice} /><aside className="wlo-status"><h2>Website status</h2><span className={hasPublishedSite ? 'live' : 'preview'}><i /> {hasPublishedSite ? 'Live' : siteState}</span><dl><div><dt>Primary domain</dt><dd>{primaryDomain?.hostname || 'Preview domain pending'}</dd></div><div><dt><CalendarDays size={16} /> Published</dt><dd>{lastPublished}</dd></div></dl><p className={overview.draftRevision ? 'attention' : ''}>{overview.draftRevision ? `${changesReadyCount} change${changesReadyCount === 1 ? '' : 's'} ready for review` : 'No changes awaiting review'}</p><button className="ww-publish" type="button" disabled={overview.mode !== 'connected'} onClick={() => setShowEditor(true)}>{overview.draftRevision ? 'Review changes' : 'Edit website'}</button></aside></section><section className="wlo-lower"><div id="website-performance"><WebsitePerformance analytics={overview.analytics} /></div><div id="website-activity"><WebsiteActivity publicationEvents={overview.publicationEvents} managementEvents={overview.managementEvents} /></div></section><section className="wlo-quick"><h2>Quick actions</h2><div><button type="button" onClick={() => setShowEditor(true)}><Pencil size={24} /><span><strong>Edit website</strong><small>Make content and design changes</small></span><ChevronRight size={19} /></button><button type="button" onClick={() => setShowDomainManager(true)}><Globe2 size={24} /><span><strong>Manage domain</strong><small>View or update domain settings</small></span><ChevronRight size={19} /></button><button type="button" onClick={() => setActiveSection('leads')}><Users size={24} /><span><strong>View enquiries</strong><small>See all website enquiries</small></span><ChevronRight size={19} /></button></div></section></> : null}
      {activeSection === 'leads' ? <WebsiteLeads leads={overview.websiteLeads} error={overview.websiteLeadsError} loading={overview.mode === 'loading'} windowDays={leadWindowDays} onWindowChange={setLeadWindowDays} onOpenListing={(listingId) => navigate(`/agent/listings/${encodeURIComponent(listingId)}`)} /> : null}
      {activeSection === 'analytics' ? <WebsiteAnalytics analytics={overview.analytics} error={overview.analyticsError} /> : null}
      {activeSection === 'submissions' ? <WebsiteFormSubmissions submissions={overview.websiteSubmissions || []} error={overview.websiteSubmissionsError} loading={overview.mode === 'loading'} windowDays={leadWindowDays} onWindowChange={setLeadWindowDays} /> : null}
      {activeSection === 'blog' ? <WebsiteBlog posts={overview.blogPosts} draftPosts={overview.draftBlogPosts} publishedPosts={overview.publishedBlogPosts} mediaAssets={overview.mediaAssets} websiteListings={overview.websiteListings} canEdit={Boolean(overview.draftRevision)} error={overview.blogPostsError} mediaError={overview.mediaAssetsError} listingError={overview.websiteListingsError} saving={action === 'blog'} uploading={action === 'blog-media'} updatingMedia={action === 'blog-media-meta'} onSave={saveBlog} onUpload={uploadBlogMedia} onUpdateMedia={updateBlogMedia} onManage={manageBlog} editorPostId={blogEditorId} onOpenEditor={onOpenBlogEditor} onCloseEditor={onCloseBlogEditor} /> : null}
    </div>
  )

  return (
    <div className="wa-page website-workspace website-editor">
      <header className="wst-header">
        <div><button className="ww-back" type="button" onClick={() => setShowEditor(false)}><ArrowLeft size={16} /> Website overview</button><h1>Edit {agencyName}</h1><p>Update your website identity and core page content. Changes stay private until you publish.</p></div>
        <div className="wst-header-actions">{previewUrl ? <a className="ww-rollback" href={previewUrl} target="_blank" rel="noreferrer">Open {hasPublishedSite ? 'live site' : 'preview'} <ArrowUpRight size={15} /></a> : null}<button className="ww-rollback" type="button" disabled={overview.mode !== 'connected'} onClick={() => setShowDomainManager(true)}><Globe2 size={15} /> Manage domain</button></div>
      </header>

      <section className="ww-operations" aria-label="Website publishing status">
        {error && <p className="ww-error" role="status">{error}</p>}
        {notice && <p className="ww-notice" role="status">{notice}</p>}
        {overview.mode === 'pilot_unavailable' && <div className="ww-pilot-gate"><LockKeyhole size={20} /><div><span className="md-eyebrow">WEBSITE ENROLMENT</span><h3>Website editing is available for enrolled agencies.</h3><p>Ask an Arch9 administrator to enrol this workspace. Existing CRM, listing and branding data is unchanged until its website is created.</p></div></div>}
        {overview.mode === 'pilot_paused' && <div className="ww-pilot-gate paused"><LockKeyhole size={20} /><div><span className="md-eyebrow">PILOT PAUSED</span><h3>Public serving and new enquiries are paused.</h3><p>The website history remains intact while the staging team reviews the pilot evidence.</p></div></div>}
        {overview.productionDarkLaunch?.status === 'prepared' && <div className="ww-pilot-gate"><LockKeyhole size={20} /><div><span className="md-eyebrow">PRODUCTION DARK LAUNCH</span><h3>The production preview is being prepared.</h3><p>No Kingstons domain or email DNS record is connected. Access remains limited to the reviewed Vercel preview.</p></div></div>}
        {overview.productionDarkLaunch?.status === 'active' && <div className="ww-pilot-gate"><LockKeyhole size={20} /><div><span className="md-eyebrow">PRODUCTION DARK LAUNCH ACTIVE</span><h3>The private production preview is available.</h3><p>Listings and internal enquiries use production data, but no client domain or public traffic has been enabled.</p></div></div>}
        {overview.productionDarkLaunch?.status === 'paused' && <div className="ww-pilot-gate paused"><LockKeyhole size={20} /><div><span className="md-eyebrow">DARK LAUNCH PAUSED</span><h3>The production preview and new enquiries are closed.</h3><p>Production content remains intact while access is paused. Kingstons DNS is still unchanged.</p></div></div>}
        {overview.productionRelease?.status === 'approved' && <div className="ww-pilot-gate"><LockKeyhole size={20} /><div><span className="md-eyebrow">PRODUCTION PREPARATION</span><h3>The custom domain is not live yet.</h3><p>Website editing remains available while release approval, website-only DNS verification and safety checks are completed.</p></div></div>}
        {overview.productionRelease?.status === 'paused' && <div className="ww-pilot-gate paused"><LockKeyhole size={20} /><div><span className="md-eyebrow">PRODUCTION PAUSED</span><h3>The live website and new enquiries are paused.</h3><p>The preview, content and CRM history remain available when service resumes.</p></div></div>}
        {overview.mode === 'ready_to_create' && <div className="ww-create-site"><div><span className="md-eyebrow">PROPERTY STANDARD V1</span><h3>Create your agency website.</h3><p>We will prepare a private draft using your organisation name, logos, colours and contact details. About, Contact and Valuation pages are included, together with a managed preview address.</p><small>Your organisation branding is copied as a starting point. Future website edits will not change email or document branding.</small></div><button className="ww-publish" type="button" disabled={Boolean(action) || !organisationId} onClick={() => void createSite()}>{action === 'create' ? 'Creating website…' : 'Create website'}</button></div>}
        {overview.mode === 'connected' && overview.site?.status === 'draft' && !overview.site?.publishedRevisionId && <section className="ww-template-select" aria-label="Website template"><div><span className="md-eyebrow">WEBSITE TEMPLATE</span><h3>Choose the starting design</h3><p>Choose Home Seekers for the dedicated Home Seekers public website. This can be changed only before the first publication.</p></div><label>Template<select value={overview.site.templateKey || 'property-standard-v1'} disabled={Boolean(action)} onChange={(event) => void selectTemplate(event.target.value)}><option value="property-standard-v1">Property Standard</option><option value="home-seekers-v1">Home Seekers</option></select></label></section>}
        {overview.mode === 'connected' && <div className={overview.draftRevision ? `ww-publishing-summary ${publicationReady ? 'ready' : 'blocked'}` : 'ww-editing-entry'}>
          {overview.draftRevision ? <><div className="ww-publishing-copy"><span>{publicationReady ? 'READY TO PUBLISH' : 'ACTION NEEDED'}</span><h3>{publicationReady ? `${changesReadyCount} change${changesReadyCount === 1 ? '' : 's'} ready to publish` : 'Finish these items before publishing'}</h3><p>{publicationReady ? 'Your changes are private now. Publishing makes them visible on your public website.' : 'Your changes are safely saved as private while you complete the items below.'}</p>{!publicationReady && <ul>{publicationBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}{publicationReady && publicationBlockers.length > 0 ? <p className="ww-publishing-note">Your logo assets will be prepared automatically when you publish.</p> : null}</div><div className="ww-editing-entry-actions">{previewUrl ? <a className="ww-rollback" href={previewUrl} target="_blank" rel="noreferrer">View current live site <ArrowUpRight size={14} /></a> : null}<button className="ww-rollback" type="button" disabled={Boolean(action)} onClick={() => void runAction('discard')}>{action === 'discard' ? 'Discarding…' : 'Discard changes'}</button><button className="ww-publish" type="button" disabled={Boolean(action) || !publicationReady} onClick={() => void runAction('publish')}>{action === 'publish' ? 'Publishing…' : 'Publish changes'}</button></div></> : <><div><h3>Ready to make changes</h3><p>Start a private set of changes before updating your website identity or core content.</p></div><button className="ww-publish" type="button" disabled={Boolean(action) || !hasPublishedSite} onClick={() => void runAction('draft')}>{action === 'draft' ? 'Preparing…' : 'Start editing'}</button></>}
        </div>}
      </section>

      {overview.mode === 'connected' && overview.draftRevision && <section className="website-editor-shell" aria-label="Website editor">
        <header><div><h2>What would you like to update?</h2><p>Keep your website focused: update its identity or the content on its core pages.</p></div></header>
        <nav aria-label="Website editing options"><button type="button" className={editorSection === 'identity' ? 'active' : ''} onClick={() => setEditorSection('identity')}><strong>Website identity</strong><span>Logo, colours and contact details</span></button><button type="button" className={editorSection === 'pages' ? 'active' : ''} onClick={() => setEditorSection('pages')}><strong>Core page content</strong><span>Homepage, About, Contact and Valuation</span></button></nav>
      </section>}

      {overview.mode === 'connected' && overview.draftRevision && overview.draftBrand && editorSection === 'identity' && <div className="website-editor-section"><WebsiteBrandEditor brand={overview.draftBrand} busy={action === 'brand' || action === 'brand-reset'} onSave={saveBrand} onReset={() => void resetBrand()} /></div>}

      {overview.mode === 'connected' && overview.draftRevision && editorSection === 'pages' && <div className="website-editor-section"><WebsitePageEditor pages={overview.pages} revisionId={overview.draftRevision.id} busy={action === 'page'} onSave={savePage} /></div>}
    </div>
  )
}
