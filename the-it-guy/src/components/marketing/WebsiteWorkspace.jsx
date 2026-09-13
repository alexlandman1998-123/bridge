import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, CalendarDays, ChevronRight, FileText, Globe2, LayoutTemplate, LockKeyhole, Megaphone, MessageCircle, Pencil, RefreshCw, UserPlus, Users } from 'lucide-react'
import { useAuthSession } from '../../context/AuthSessionContext'
import { createWebsiteBlogPost, createWebsiteCampaignPage, createWebsiteDraft, createWebsiteSite, deleteWebsiteDraftCampaign, discardWebsiteDraft, getWebsiteWorkspaceOverview, manageWebsiteDomain, publishWebsiteDraft, resetWebsiteDraftBrand, rollbackWebsiteRevision, saveWebsiteDraftBrand, saveWebsiteDraftPage, updateWebsiteBlogPost } from '../../services/websiteWorkspaceService'
import WebsiteBrandEditor from './WebsiteBrandEditor'
import WebsitePageEditor from './WebsitePageEditor'
import './WebsiteWorkspace.css'

const readiness = [
  { label: 'Create a preview site', detail: 'A secure preview address is created before any client domain is touched.', status: 'foundation' },
  { label: 'Apply the agency identity', detail: 'Edit the website logo, colours and contact details without changing organisation-wide branding.', status: 'available' },
  { label: 'Create pages and campaigns', detail: 'Build structured landing pages from approved content blocks, then share the campaign URL.', status: 'available' },
  { label: 'Publish property stock', detail: 'Only listings explicitly published to the agency-website channel appear publicly.', status: 'available' },
  { label: 'Connect the client domain', detail: 'Website records only. Existing email DNS records remain untouched.', status: 'next' },
]

const PUBLICATION_LABELS = {
  draft_created: 'Draft created',
  draft_discarded: 'Draft discarded',
  published: 'Revision published',
  rolled_back: 'Prior revision restored',
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

function WebsiteSectionHeading({ eyebrow, title, detail, action = null }) {
  return <header className="wlo-section-heading"><div><span className="md-eyebrow">{eyebrow}</span><h2>{title}</h2><p>{detail}</p></div>{action}</header>
}

function WebsiteLeadFilters({ windowDays, onWindowChange }) {
  return <label className="wlo-window-filter">Show<select value={windowDays} onChange={(event) => onWindowChange(Number(event.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label>
}

function WebsiteLeads({ leads = [], error, loading, windowDays, onWindowChange, onOpenListing }) {
  const actionable = leads.filter((lead) => lead.lead_id)
  return <section className="wlo-section-card" aria-label="Website leads"><WebsiteSectionHeading eyebrow="WEBSITE LEADS" title="Website enquiries" detail={`CRM leads created through this organisation’s public website in the last ${windowDays} days.`} action={<WebsiteLeadFilters windowDays={windowDays} onWindowChange={onWindowChange} />} />{error ? <p className="ww-error">Website leads could not be loaded. Refresh the Website workspace and try again.</p> : null}<div className="wlo-table-wrap"><table className="wlo-table"><thead><tr><th>Person</th><th>Property or page</th><th>Enquiry</th><th>CRM status</th><th>Contact</th><th>Received</th></tr></thead><tbody>{loading ? <tr><td colSpan="6" className="wlo-table-empty">Loading website leads…</td></tr> : actionable.length ? actionable.map((lead) => <tr key={lead.submission_id}><td><strong>{lead.contact_name || 'Website visitor'}</strong><span>{lead.contact_email || lead.contact_phone || 'Contact details pending'}</span></td><td>{lead.listing_id ? <button className="wlo-link-button" type="button" onClick={() => onOpenListing(lead.listing_id)}><strong>{lead.property_title || 'Property listing'}</strong><span>{lead.property_address || 'Open listing'}</span></button> : <><strong>{lead.page_title || lead.property_title || 'Website enquiry'}</strong><span>{lead.page_slug ? `/${lead.page_slug}` : 'General website enquiry'}</span></>}</td><td><span className="wlo-type-pill">{String(lead.submission_type || 'enquiry').replaceAll('_', ' ')}</span></td><td><span className="wlo-status-pill">{lead.lead_status || lead.lead_stage || lead.submission_status || 'Processing'}</span></td><td><div className="wlo-contact-actions">{lead.contact_email ? <a href={`mailto:${lead.contact_email}`}>Email</a> : null}{lead.contact_phone ? <a href={`tel:${lead.contact_phone}`}>Call</a> : null}{!lead.contact_email && !lead.contact_phone ? <span>Contact pending</span> : null}</div></td><td>{lead.submitted_at ? new Date(lead.submitted_at).toLocaleString() : '—'}</td></tr>) : <tr><td colSpan="6" className="wlo-table-empty">No routed website leads in the last {windowDays} days.</td></tr>}</tbody></table></div></section>
}

function WebsiteFormSubmissions({ submissions = [], error, loading, windowDays, onWindowChange }) {
  const failed = submissions.filter((submission) => ['failed', 'blocked'].includes(String(submission.submission_status || '').toLowerCase()))
  return <section className="wlo-section-card" aria-label="Website form submissions"><WebsiteSectionHeading eyebrow="FORM SUBMISSIONS" title="Submission delivery" detail={`Every website form receipt and its delivery outcome for the last ${windowDays} days.`} action={<WebsiteLeadFilters windowDays={windowDays} onWindowChange={onWindowChange} />} />{error ? <p className="ww-error">Submission delivery records could not be loaded. Refresh the Website workspace and try again.</p> : null}{failed.length ? <p className="wlo-delivery-alert">{failed.length} submission{failed.length === 1 ? '' : 's'} need{failed.length === 1 ? 's' : ''} attention. Their details remain in this audit view.</p> : null}<div className="wlo-table-wrap"><table className="wlo-table"><thead><tr><th>Form</th><th>Property or page</th><th>Received</th><th>Delivery</th><th>CRM lead</th></tr></thead><tbody>{loading ? <tr><td colSpan="5" className="wlo-table-empty">Loading submission delivery…</td></tr> : submissions.length ? submissions.map((submission) => { const failedDelivery = ['failed', 'blocked'].includes(String(submission.submission_status || '').toLowerCase()); return <tr key={submission.submission_id}><td><strong>{String(submission.submission_type || 'Website enquiry').replaceAll('_', ' ')}</strong><span>Submitted from your public website</span></td><td><strong>{submission.property_title || submission.page_title || 'Website enquiry'}</strong><span>{submission.property_address || (submission.page_slug ? `/${submission.page_slug}` : 'General website enquiry')}</span></td><td>{submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : '—'}</td><td><span className={failedDelivery ? 'wlo-status-pill failed' : 'wlo-status-pill'}>{submission.submission_status || submission.delivery_status || 'Processing'}</span>{submission.delivery_detail ? <span className="wlo-delivery-detail">{submission.delivery_detail}</span> : null}</td><td>{submission.lead_id ? 'Lead created' : failedDelivery ? 'Not created' : 'Awaiting routing'}</td></tr> }) : <tr><td colSpan="5" className="wlo-table-empty">No website form submissions in the last {windowDays} days.</td></tr>}</tbody></table></div></section>
}

function cleanBlogPost(post = {}) {
  return {
    id: post.id || '', title: post.title || '', slug: post.slug || '', summary: post.summary || '', coverImageUrl: post.cover_image_url || '', coverImageAlt: post.cover_image_alt || '', body: post.body || '', authorName: post.author_name || '', seoTitle: post.seo_title || '', seoDescription: post.seo_description || '', status: post.status || 'draft', publishedAt: post.published_at || null,
  }
}

function WebsiteBlog({ posts = [], draftPosts = [], publishedPosts = [], canEdit, error, saving, onSave }) {
  const [view, setView] = useState('drafts')
  const [editing, setEditing] = useState(null)
  const editablePosts = draftPosts.length || canEdit ? draftPosts : posts.filter((post) => post.status === 'draft')
  const livePosts = publishedPosts.length || !canEdit ? publishedPosts : posts.filter((post) => post.status === 'published')
  const visiblePosts = view === 'published' ? livePosts : editablePosts
  const openNew = () => { if (canEdit) { setView('drafts'); setEditing(cleanBlogPost()) } }
  const openPost = (post) => setEditing(cleanBlogPost(post))
  const change = (field, value) => setEditing((current) => ({ ...current, [field]: value }))
  const save = async () => {
    if (!editing) return
    const saved = await onSave(editing)
    if (saved) setEditing(cleanBlogPost({ ...editing, ...saved, status: 'draft' }))
  }
  return <section className="wlo-section-card wlo-blog" aria-label="Website blog"><WebsiteSectionHeading eyebrow="WEBSITE BLOG" title="Blog and resources" detail="Article edits are saved into the current website draft and only become public with the approved website revision." action={<button className="ww-publish" type="button" disabled={!canEdit} onClick={openNew}>Create post</button>} />
    {error ? <p className="ww-error">Blog posts will be available once the Website workspace migration is applied.</p> : null}
    <div className="wlo-blog-layout"><div><nav className="wlo-blog-tabs" aria-label="Blog post status"><button className={view === 'drafts' ? 'active' : ''} type="button" onClick={() => setView('drafts')}>Drafts <b>{editablePosts.length}</b></button><button className={view === 'published' ? 'active' : ''} type="button" onClick={() => setView('published')}>Published <b>{livePosts.length}</b></button></nav><div className="wlo-blog-list">{visiblePosts.length ? visiblePosts.map((post) => <button type="button" key={post.id} className={editing?.id === post.id ? 'active' : ''} onClick={() => openPost(post)}><FileText size={18} /><span><strong>{post.title}</strong><small>/blog/{post.slug}{post.published_at ? ` · ${new Date(post.published_at).toLocaleDateString()}` : ' · Draft'}</small></span><ChevronRight size={17} /></button>) : <p className="wlo-table-empty">No {view === 'published' ? 'published' : 'draft'} posts yet.</p>}</div></div>
      {editing ? <form className="wlo-blog-editor" onSubmit={(event) => { event.preventDefault(); void save() }}><div className="wlo-blog-editor-heading"><div><strong>{editing.id ? 'Edit post' : 'New post'}</strong><small>{canEdit ? 'Saved changes are included in the website draft for review and release.' : 'Create a website draft in Studio before editing this published article.'}</small></div><button type="button" className="wlo-editor-close" onClick={() => setEditing(null)}>Close</button></div><label>Title<input disabled={!canEdit} required maxLength={160} value={editing.title} onChange={(event) => change('title', event.target.value)} placeholder="Article title" /></label><label>URL slug<input disabled={!canEdit} required maxLength={80} value={editing.slug} onChange={(event) => change('slug', event.target.value)} placeholder="market-update" /></label><label className="wide">Summary<textarea disabled={!canEdit} maxLength={600} value={editing.summary} onChange={(event) => change('summary', event.target.value)} placeholder="A concise introduction for the blog index and search." /></label><label>Cover image URL<input disabled={!canEdit} type="url" value={editing.coverImageUrl} onChange={(event) => change('coverImageUrl', event.target.value)} placeholder="https://…" /></label><label>Cover image alt text<input disabled={!canEdit} maxLength={240} value={editing.coverImageAlt} onChange={(event) => change('coverImageAlt', event.target.value)} placeholder="Describe the cover image" /></label><label>Author<input disabled={!canEdit} maxLength={160} value={editing.authorName} onChange={(event) => change('authorName', event.target.value)} placeholder="Agency team" /></label><label>SEO title<input disabled={!canEdit} maxLength={180} value={editing.seoTitle} onChange={(event) => change('seoTitle', event.target.value)} placeholder="Optional search title" /></label><label className="wide">Article body<textarea disabled={!canEdit} required maxLength={50000} value={editing.body} onChange={(event) => change('body', event.target.value)} placeholder="Write the article…" /></label><label className="wide">SEO description<textarea disabled={!canEdit} maxLength={320} value={editing.seoDescription} onChange={(event) => change('seoDescription', event.target.value)} placeholder="Optional search description" /></label>{canEdit ? <div className="wlo-blog-editor-actions"><button className="ww-publish" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save to website draft'}</button></div> : null}</form> : <div className="wlo-blog-editor-empty"><Pencil size={24} /><strong>Select a post to edit</strong><span>{canEdit ? 'Or start a new article with its title, summary, image and body.' : 'Create a website draft in Studio before changing or adding articles.'}</span><button className="ww-rollback" type="button" disabled={!canEdit} onClick={openNew}>Create post</button></div>}</div></section>
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
  return <section className="wwo-analytics" aria-label="Website analytics for the last 30 days"><div className="wwo-analytics-heading"><div><span className="md-eyebrow">WEBSITE PERFORMANCE</span><h2>Last 30 days</h2><p>Visits and page views are counted as privacy-conscious aggregates. Arch9 does not store visitor identities, IP addresses or browsing histories.</p></div><span className="wwo-period">Last 30 days</span></div>{error && <p className="ww-error">Website analytics will become available after the dashboard update is applied.</p>}<div className="wwo-metrics">{metrics.map(([label, value, detail]) => <article key={label}><small>{label}</small><strong>{value}</strong><span>{detail}</span></article>)}</div><div className="wwo-analytics-grid"><article className="wwo-chart"><div><strong>Website traffic</strong><small>Daily first-party page views</small></div>{daily.length ? <div className="wwo-bars">{daily.map((item) => <span key={item.date} title={`${item.date}: ${item.pageViews} page views`}><i style={{ height: `${Math.max(5, Number(item.pageViews || 0) * 100 / max)}%` }} /><small>{new Date(`${item.date}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</small></span>)}</div> : <p className="wwo-empty-data">No website traffic has been recorded in this period.</p>}</article><article className="wwo-top-pages"><div><strong>Top pages</strong><small>Ranked by first-party page views</small></div>{topPages.length ? <ol>{topPages.map((item, index) => <li key={`${item.label}-${index}`}><span>{index + 1}</span><strong>{item.label}</strong><b>{item.views}</b></li>)}</ol> : <p className="wwo-empty-data">No page-view data yet.</p>}</article></div><div className="wwo-analytics-grid"><article className="wwo-top-pages"><div><strong>Top listings</strong><small>Ranked by listing-detail views</small></div>{topListings.length ? <ol>{topListings.map((item, index) => <li key={`${item.label}-${index}`}><span>{index + 1}</span><strong>{item.label}</strong><b>{item.views}</b></li>)}</ol> : <p className="wwo-empty-data">No listing-view data yet.</p>}</article><article className="wwo-recent-submissions"><div><strong>Recent website submissions</strong><small>Only submissions recorded by this organisation’s public website are shown.</small></div>{recent.length ? <ol>{recent.slice(0, 4).map((item) => <li key={item.id}><span><strong>{String(item.submissionType || 'website enquiry').replaceAll('_', ' ')}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></span><em>{item.status}</em><b>{item.leadId ? 'CRM lead linked' : 'Processing'}</b></li>)}</ol> : <p className="wwo-empty-data">No recent submissions.</p>}</article></div></section>
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
  return <section className="wwo-release-preview"><div className="wwo-release-heading"><div><span className="md-eyebrow">PREVIEW & PUBLISHING</span><h2>Review the public site before releasing changes.</h2><p>The embedded preview always shows the current public revision. Draft edits remain isolated until the publishing checks pass.</p></div><div className="wwo-device-toggle"><button type="button" className={device === 'desktop' ? 'active' : ''} onClick={() => setDevice('desktop')}>Desktop</button><button type="button" className={device === 'mobile' ? 'active' : ''} onClick={() => setDevice('mobile')}>Mobile</button></div></div><div className="wwo-release-grid"><div className="wwo-preview-frame-wrap"><div className={`wwo-preview-frame ${device}`}>{previewUrl ? <iframe title="Current public website preview" src={previewUrl} /> : <p className="wwo-empty-data">A connected preview URL is required to render the public website.</p>}</div>{previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer">Open public preview <ArrowUpRight size={14} /></a>}</div><div className="wwo-release-status"><article><small>DRAFT</small><strong>{draftRevision ? `Revision ${draftRevision.revision_number}` : 'No active draft'}</strong><span>{draftRevision ? `Updated ${new Date(draftRevision.updated_at).toLocaleString()}` : 'Create a draft in Website Studio to begin.'}</span></article><article><small>PUBLISHED</small><strong>{publishedRevision ? `Revision ${publishedRevision.revision_number}` : 'No published revision'}</strong><span>{publishedAt} · {publisher}</span></article><div className={blockers.length ? 'wwo-blockers blocked' : 'wwo-blockers ready'}><strong>{draftRevision ? blockers.length ? 'Release blockers' : 'Ready to publish' : 'No draft to review'}</strong>{blockers.length ? <ul>{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : <p>{draftRevision ? 'Required website, content and domain checks have passed.' : 'The published site remains unchanged.'}</p>}</div><button type="button" className="ww-publish" onClick={onManage}>{draftRevision ? 'Review draft in Website Studio' : 'Open Website Studio'}</button></div></div></section>
}

function WebsiteOperations({ analytics, analyticsError, domains, publicationEvents, managementEvents, previewUrl, onManage }) {
  const failedForms = (Array.isArray(analytics?.recentSubmissions) ? analytics.recentSubmissions : []).filter((item) => String(item.status || '').toLowerCase() === 'failed')
  const attentionDomains = domains.filter((domain) => domain.domain_kind === 'custom' && ['pending', 'failed', 'disabled'].includes(domain.status))
  const events = [
    ...(publicationEvents || []).map((event) => ({ id: `publication-${event.id}`, label: PUBLICATION_LABELS[event.action] || event.action, at: event.created_at, detail: event.content_fingerprint ? `Revision fingerprint ${event.content_fingerprint.slice(0, 10)}` : 'Recoverable release history' })),
    ...(managementEvents || []).map((event) => ({ id: `management-${event.id}`, label: MANAGEMENT_LABELS[event.action] || event.action, at: event.created_at, detail: event.metadata_json?.hostname || 'Website domain operation' })),
  ].sort((left, right) => String(right.at || '').localeCompare(String(left.at || ''))).slice(0, 8)
  const checks = [
    { label: 'Domain verification', state: attentionDomains.length ? 'Action needed' : 'Clear', detail: attentionDomains.length ? `${attentionDomains.map((domain) => domain.hostname).join(', ')} still needs verification or attention.` : 'No custom domain is awaiting action.' },
    { label: 'Form delivery', state: analyticsError ? 'Unavailable' : failedForms.length ? 'Action needed' : 'Clear', detail: analyticsError ? 'Submission delivery status will appear after the analytics dashboard update is applied.' : failedForms.length ? `${failedForms.length} recent submission${failedForms.length === 1 ? '' : 's'} failed to process.` : 'No failed submissions are recorded in the current 30-day view.' },
    { label: 'Public route', state: previewUrl ? 'Configured' : 'Action needed', detail: previewUrl ? 'A public preview or primary domain is configured. The public site exposes a lightweight /api/health endpoint for external uptime monitoring.' : 'Connect a preview or primary domain before enabling availability monitoring.' },
  ]
  return <section className="wwo-operations" aria-label="Website operations"><div className="wwo-operations-heading"><div><span className="md-eyebrow">OPERATIONS & SAFETY</span><h2>Keep changes controlled and observable.</h2><p>Website administrators can edit content, manage domains and release reviewed revisions. Every release remains recoverable; domain actions and release history are organisation-scoped.</p></div><button type="button" className="ww-rollback" onClick={onManage}>Open release controls</button></div><div className="wwo-health-checks">{checks.map((check) => <article key={check.label}><div><strong>{check.label}</strong><span className={`wwo-health-state ${check.state.toLowerCase().replaceAll(' ', '-')}`}>{check.state}</span></div><p>{check.detail}</p></article>)}</div><div className="wwo-operations-grid"><article className="wwo-activity"><div><strong>Activity history</strong><small>Domain and publication actions</small></div>{events.length ? <ol>{events.map((event) => <li key={event.id}><span><strong>{event.label}</strong><small>{event.detail}</small></span><time>{event.at ? new Date(event.at).toLocaleString() : 'Time unavailable'}</time></li>)}</ol> : <p className="wwo-empty-data">No website operations have been recorded yet.</p>}</article><article className="wwo-recovery"><strong>Safe rollback</strong><p>Restoring a prior revision always creates a new published copy. It does not overwrite history, change listings, or bypass publication controls.</p><button type="button" className="ww-publish" onClick={onManage}>Review recovery points</button></article></div></section>
}

export default function WebsiteWorkspace({ onBack }) {
  const { authState } = useAuthSession()
  const navigate = useNavigate()
  const organisationId = useMemo(() => getOrganisationId(authState), [authState])
  const [leadWindowDays, setLeadWindowDays] = useState(30)
  const [showStudio, setShowStudio] = useState(false)
  const [showDomainManager, setShowDomainManager] = useState(false)
  const [activeSection, setActiveSection] = useState('overview')
  const [previewDevice, setPreviewDevice] = useState('desktop')
  const [overview, setOverview] = useState({ mode: 'loading', pilot: null, productionRelease: null, productionDarkLaunch: null, site: null, domains: [], pages: [], publishedRevision: null, publicationEvents: [], managementEvents: [], publicationReadiness: null, analytics: null, analyticsError: '', websiteLeads: [], websiteLeadsError: '', websiteSubmissions: [], websiteSubmissionsError: '', blogPosts: [], draftBlogPosts: [], publishedBlogPosts: [], blogPostsError: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [action, setAction] = useState('')
  const [campaignTitle, setCampaignTitle] = useState('')
  const [campaignSlug, setCampaignSlug] = useState('')
  const [campaignIntro, setCampaignIntro] = useState('')
  const [rollbackRevisionId, setRollbackRevisionId] = useState('')

  const refresh = async () => {
    setError('')
    setOverview((current) => ({ ...current, mode: 'loading' }))
    try { setOverview(await getWebsiteWorkspaceOverview(organisationId, { leadWindowDays })) } catch (loadError) { setError('Website settings could not be loaded.'); setOverview({ mode: 'error', pilot: null, productionRelease: null, productionDarkLaunch: null, site: null, domains: [], pages: [], publishedRevision: null, publicationEvents: [], managementEvents: [], publicationReadiness: null, analytics: null, analyticsError: '', websiteLeads: [], websiteLeadsError: '', websiteSubmissions: [], websiteSubmissionsError: '', blogPosts: [], draftBlogPosts: [], publishedBlogPosts: [], blogPostsError: '' }) }
  }

  useEffect(() => { void refresh() }, [organisationId, leadWindowDays])
  useEffect(() => {
    if (!overview.archivedRevisions?.some((revision) => revision.id === rollbackRevisionId)) {
      setRollbackRevisionId(overview.archivedRevisions?.[0]?.id || '')
    }
  }, [overview.archivedRevisions, rollbackRevisionId])
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
      setError('Resolve the publication blockers before publishing this draft.')
      return
    }
    if (type === 'publish' && !window.confirm(`Publish revision ${overview.draftRevision?.revision_number}? The current live revision will be retained for recovery.`)) return
    if (type === 'rollback' && (!rollbackRevisionId || !window.confirm('Restore the selected revision as a new published copy? The current live revision will remain in history.'))) return
    if (type === 'discard' && (!overview.draftRevision?.id || !window.confirm(`Discard draft revision ${overview.draftRevision.revision_number}? Saved draft changes will be removed.`))) return
    setAction(type)
    setError('')
    setNotice('')
    try {
      if (type === 'draft') await createWebsiteDraft(overview.site.id)
      if (type === 'publish' && overview.draftRevision?.id) await publishWebsiteDraft(overview.site.id, overview.draftRevision.id)
      if (type === 'rollback' && rollbackRevisionId) await rollbackWebsiteRevision(overview.site.id, rollbackRevisionId)
      if (type === 'discard' && overview.draftRevision?.id) await discardWebsiteDraft(overview.site.id, overview.draftRevision.id)
      await refresh()
      if (type === 'publish') setNotice('The reviewed draft is now live. The previous revision remains available for recovery.')
      if (type === 'rollback') setNotice('The selected revision was restored as a new published copy.')
      if (type === 'discard') setNotice('The draft was discarded. The live website was not changed.')
    } catch (actionError) { setError(actionError?.message || 'Website publishing action could not be completed.') } finally { setAction('') }
  }
  const createCampaign = async (event) => {
    event.preventDefault()
    if (!overview.site?.id || !overview.draftRevision?.id || action) return
    setAction('campaign')
    setError('')
    try {
      await createWebsiteCampaignPage({ siteId: overview.site.id, revisionId: overview.draftRevision.id, title: campaignTitle, slug: campaignSlug, intro: campaignIntro })
      setCampaignTitle('')
      setCampaignSlug('')
      setCampaignIntro('')
      await refresh()
      setNotice('Campaign page created in the current draft.')
    } catch (campaignError) { setError(campaignError?.message || 'Campaign page could not be created.') } finally { setAction('') }
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
  const deleteCampaign = async (page) => {
    if (!overview.site?.id || !overview.draftRevision?.id || action) return
    if (!window.confirm(`Delete the draft campaign “${page.title}”?`)) return
    setAction('page-delete')
    setError('')
    setNotice('')
    try {
      await deleteWebsiteDraftCampaign({ siteId: overview.site.id, revisionId: overview.draftRevision.id, pageId: page.id })
      await refresh()
      setNotice('Campaign page removed from the current draft.')
    } catch (pageError) {
      setError(pageError?.message || 'Campaign page could not be deleted.')
    } finally {
      setAction('')
    }
  }
  if (showDomainManager) return <div className="wa-page website-workspace website-overview"><button className="ww-back" type="button" onClick={() => setShowDomainManager(false)}><ArrowLeft size={16} /> Websites</button>{overview.site ? <WebsiteDomainManager siteId={overview.site.id} domains={overview.domains} onChanged={refresh} /> : <p className="ww-error">A website must be created before its domain can be managed.</p>}</div>

  if (!showStudio) return (
    <div className="wa-page website-workspace website-overview">
      <section className="wlo-header"><div><div className="wlo-title"><h1>{agencyName}</h1><span className={hasPublishedSite ? 'live' : 'preview'}><i /> {hasPublishedSite ? 'Live' : 'Preview'}</span></div>{primaryDomain?.hostname && <p>{primaryDomain.hostname}</p>}</div><div className="wlo-header-actions">{previewUrl ? <a className="ww-rollback" href={previewUrl} target="_blank" rel="noreferrer">{hasPublishedSite ? 'Open live site' : 'Open preview'} <ArrowUpRight size={15} /></a> : null}{overview.mode === 'ready_to_create' ? <button className="ww-publish" type="button" disabled={Boolean(action) || !organisationId} onClick={() => void createSite()}>{action === 'create' ? 'Creating…' : 'Create website'}</button> : <button className="ww-publish" type="button" disabled={overview.mode !== 'connected'} onClick={() => setShowStudio(true)}>Manage website</button>}</div></section>
      {error && <p className="ww-error" role="status">{error}</p>}
      {notice && <p className="ww-notice" role="status">{notice}</p>}
      <WebsiteStats analytics={overview.analytics} />
      <nav className="wlo-tabs" aria-label="Website sections">{[{ id: 'overview', label: 'Overview' }, { id: 'leads', label: 'Leads' }, { id: 'analytics', label: 'Analytics' }, { id: 'submissions', label: 'Form submissions' }, { id: 'blog', label: 'Blog' }, { id: 'studio', label: 'Studio' }].map((section) => <button key={section.id} type="button" className={activeSection === section.id ? 'active' : ''} onClick={() => section.id === 'studio' ? setShowStudio(true) : setActiveSection(section.id)}>{section.label}</button>)}</nav>
      {activeSection === 'overview' ? <><section className="wlo-main-card" id="website-overview"><WebsiteLandingPreview previewUrl={previewUrl} websiteName={agencyName} primaryDomain={primaryDomain} device={previewDevice} setDevice={setPreviewDevice} /><aside className="wlo-status"><h2>Website status</h2><span className={hasPublishedSite ? 'live' : 'preview'}><i /> {hasPublishedSite ? 'Live' : siteState}</span><dl><div><dt>Primary domain</dt><dd>{primaryDomain?.hostname || 'Preview domain pending'}</dd></div><div><dt><CalendarDays size={16} /> Published</dt><dd>{lastPublished}</dd></div></dl><p className={overview.draftRevision ? 'attention' : ''}>{overview.draftRevision ? `${changesReadyCount} change${changesReadyCount === 1 ? '' : 's'} ready for review` : 'No changes awaiting review'}</p><button className="ww-publish" type="button" disabled={overview.mode !== 'connected'} onClick={() => setShowStudio(true)}>{overview.draftRevision ? 'Review changes' : 'Open Website Studio'}</button></aside></section><section className="wlo-lower"><div id="website-performance"><WebsitePerformance analytics={overview.analytics} /></div><div id="website-activity"><WebsiteActivity publicationEvents={overview.publicationEvents} managementEvents={overview.managementEvents} /></div></section><section className="wlo-quick"><h2>Quick actions</h2><div><button type="button" onClick={() => setShowStudio(true)}><Pencil size={24} /><span><strong>Edit website</strong><small>Make content and design changes</small></span><ChevronRight size={19} /></button><button type="button" onClick={() => setShowDomainManager(true)}><Globe2 size={24} /><span><strong>Manage domain</strong><small>View or update domain settings</small></span><ChevronRight size={19} /></button><button type="button" onClick={() => setActiveSection('leads')}><Users size={24} /><span><strong>View enquiries</strong><small>See all website enquiries</small></span><ChevronRight size={19} /></button></div></section></> : null}
      {activeSection === 'leads' ? <WebsiteLeads leads={overview.websiteLeads} error={overview.websiteLeadsError} loading={overview.mode === 'loading'} windowDays={leadWindowDays} onWindowChange={setLeadWindowDays} onOpenListing={(listingId) => navigate(`/agent/listings/${encodeURIComponent(listingId)}`)} /> : null}
      {activeSection === 'analytics' ? <WebsiteAnalytics analytics={overview.analytics} error={overview.analyticsError} /> : null}
      {activeSection === 'submissions' ? <WebsiteFormSubmissions submissions={overview.websiteSubmissions || []} error={overview.websiteSubmissionsError} loading={overview.mode === 'loading'} windowDays={leadWindowDays} onWindowChange={setLeadWindowDays} /> : null}
      {activeSection === 'blog' ? <WebsiteBlog posts={overview.blogPosts} draftPosts={overview.draftBlogPosts} publishedPosts={overview.publishedBlogPosts} canEdit={Boolean(overview.draftRevision)} error={overview.blogPostsError} saving={action === 'blog'} onSave={saveBlog} /> : null}
    </div>
  )

  return (
    <div className="wa-page website-workspace website-studio">
      <header className="wst-header">
        <div><button className="ww-back" type="button" onClick={() => setShowStudio(false)}><ArrowLeft size={16} /> Website overview</button><span className="md-eyebrow">WEBSITE STUDIO</span><h1>Update {agencyName}</h1><p>Make focused brand and page edits in a draft, then review and publish when you are ready.</p></div>
        <div className="wst-header-actions">{previewUrl ? <a className="ww-rollback" href={previewUrl} target="_blank" rel="noreferrer">Open {hasPublishedSite ? 'live site' : 'preview'} <ArrowUpRight size={15} /></a> : null}<button className="ww-rollback" type="button" disabled={overview.mode !== 'connected'} onClick={() => setShowDomainManager(true)}><Globe2 size={15} /> Manage domain</button></div>
      </header>

      <nav className="wst-nav" aria-label="Website Studio sections">
        <a href="#studio-release">Release</a><a href="#studio-brand">Brand</a><a href="#studio-pages">Pages</a><a href="#studio-campaigns">Campaigns</a><a href="#studio-history">History</a>
      </nav>

      <section className="ww-operations" aria-label="Website operation status">
        <div className="ww-operations-heading"><div><span className="md-eyebrow">RELEASE</span><h2>{overview.mode === 'loading' ? 'Checking your website…' : overview.mode === 'connected' ? 'Your website draft' : 'Ready for the first website setup'}</h2><p>Brand, content and campaign updates stay private until you publish this reviewed draft.</p></div><button className="ww-refresh" type="button" onClick={() => void refresh()}><RefreshCw size={15} /> Refresh</button></div>
        {error && <p className="ww-error" role="status">{error}</p>}
        {notice && <p className="ww-notice" role="status">{notice}</p>}
        {overview.mode === 'pilot_unavailable' && <div className="ww-pilot-gate"><LockKeyhole size={20} /><div><span className="md-eyebrow">CONTROLLED PILOT</span><h3>Website Studio is opening with one agency first.</h3><p>This workspace is not enrolled in the staging pilot yet. Existing CRM, listing and branding data is unchanged.</p></div></div>}
        {overview.mode === 'pilot_paused' && <div className="ww-pilot-gate paused"><LockKeyhole size={20} /><div><span className="md-eyebrow">PILOT PAUSED</span><h3>Public serving and new enquiries are paused.</h3><p>The website history remains intact while the staging team reviews the pilot evidence.</p></div></div>}
        {overview.productionDarkLaunch?.status === 'prepared' && <div className="ww-pilot-gate"><LockKeyhole size={20} /><div><span className="md-eyebrow">PRODUCTION DARK LAUNCH</span><h3>The production preview is being prepared.</h3><p>No Kingstons domain or email DNS record is connected. Access remains limited to the reviewed Vercel preview.</p></div></div>}
        {overview.productionDarkLaunch?.status === 'active' && <div className="ww-pilot-gate"><LockKeyhole size={20} /><div><span className="md-eyebrow">PRODUCTION DARK LAUNCH ACTIVE</span><h3>The private production preview is available.</h3><p>Listings and internal enquiries use production data, but no client domain or public traffic has been enabled.</p></div></div>}
        {overview.productionDarkLaunch?.status === 'paused' && <div className="ww-pilot-gate paused"><LockKeyhole size={20} /><div><span className="md-eyebrow">DARK LAUNCH PAUSED</span><h3>The production preview and new enquiries are closed.</h3><p>Production content remains intact for controlled recovery. Kingstons DNS is still unchanged.</p></div></div>}
        {overview.productionRelease?.status === 'approved' && <div className="ww-pilot-gate"><LockKeyhole size={20} /><div><span className="md-eyebrow">PRODUCTION PREPARATION</span><h3>The custom domain is not live yet.</h3><p>Website editing remains available while release approval, website-only DNS verification and the rollback target are checked.</p></div></div>}
        {overview.productionRelease?.status === 'paused' && <div className="ww-pilot-gate paused"><LockKeyhole size={20} /><div><span className="md-eyebrow">PRODUCTION PAUSED</span><h3>The live website and new enquiries are paused.</h3><p>The preview, content revisions and CRM history remain available for controlled recovery.</p></div></div>}
        {overview.mode === 'ready_to_create' && <div className="ww-create-site"><div><span className="md-eyebrow">PROPERTY STANDARD V1</span><h3>Create your agency website.</h3><p>We will prepare a private draft using your organisation name, logos, colours and contact details. About, Contact and Valuation pages are included, together with a managed preview address.</p><small>Your organisation branding is copied as a starting point. Future website edits will not change email or document branding.</small></div><button className="ww-publish" type="button" disabled={Boolean(action) || !organisationId} onClick={() => void createSite()}>{action === 'create' ? 'Creating website…' : 'Create website'}</button></div>}
        <div className="ww-operation-grid"><article><small>PUBLICATION</small><strong>{hasPublishedSite ? `Revision ${overview.publishedRevision.revision_number} is live` : 'No published revision yet'}</strong><span>{overview.site?.templateKey || 'Property Standard v1'}</span></article><article><small>DOMAIN</small><strong>{primaryDomain?.hostname || 'Preview domain to be created'}</strong><span>{primaryDomain ? `${primaryDomain.status} · ${primaryDomain.domain_kind}` : 'No email DNS records are needed'}</span></article><article><small>PAGES</small><strong>{overview.pages.length} managed page{overview.pages.length === 1 ? '' : 's'}</strong><span>{overview.pages.filter((page) => page.page_kind === 'campaign').length} campaign page{overview.pages.filter((page) => page.page_kind === 'campaign').length === 1 ? '' : 's'}</span></article></div>
        {overview.mode === 'connected' && <div className="ww-page-list">{overview.pages.slice(0, 6).map((page) => <span key={page.id}><strong>{page.title}</strong><small>/{page.slug || ''} · {page.page_kind}</small></span>)}</div>}
        {overview.mode === 'connected' && <div className="ww-publication-control" id="studio-release">
          <div className="ww-publish-actions">
            <div>
              <strong>{overview.draftRevision ? `Draft revision ${overview.draftRevision.revision_number} · ${publicationReady ? 'ready to publish' : 'not ready to publish'}` : 'Create a draft to start a controlled content update.'}</strong>
              <small>Publishing switches one exact revision atomically. Historical revisions are never edited during recovery.</small>
            </div>
            {overview.draftRevision ? <>
              <button className="ww-rollback" type="button" disabled={Boolean(action) || !hasPublishedSite} onClick={() => void runAction('discard')}>{action === 'discard' ? 'Discarding…' : 'Discard draft'}</button>
              <button className="ww-publish" type="button" disabled={Boolean(action) || !publicationReady} onClick={() => void runAction('publish')}>{action === 'publish' ? 'Publishing…' : 'Publish reviewed draft'}</button>
            </> : <button className="ww-publish" type="button" disabled={Boolean(action) || !hasPublishedSite} onClick={() => void runAction('draft')}>{action === 'draft' ? 'Preparing…' : 'Create draft'}</button>}
          </div>
          {overview.draftRevision && <div className={publicationReady ? 'ww-release-check ready' : 'ww-release-check blocked'}>
            <strong>{publicationReady ? 'Publication checks passed' : 'Publication blockers'}</strong>
            {publicationReady ? <span>{changesReadyCount} change{changesReadyCount === 1 ? '' : 's'} ready to publish · {overview.publicationReadiness.pageCount} pages · {overview.publicationReadiness.blogPostCount || 0} articles · {overview.publicationReadiness.activeDomainCount} active domain · fingerprint {String(overview.publicationReadiness.contentFingerprint || '').slice(0, 10)}</span> : <ul>{(overview.publicationReadiness?.blockers || []).map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
          </div>}
          {overview.draftRevision && <section className="ww-draft-content-preview" aria-label="Draft content preview"><div><small>DRAFT CONTENT PREVIEW</small><strong>Revision {overview.draftRevision.revision_number}</strong><span>These are the pages and articles that will become public together when this revision is published.</span></div><ul>{overview.pages.map((page) => <li key={page.id}><FileText size={15} /><span><strong>{page.title}</strong><small>/{page.slug || ''} · {page.page_kind}</small></span></li>)}{overview.draftBlogPosts.map((post) => <li key={post.id}><FileText size={15} /><span><strong>{post.title}</strong><small>/blog/{post.slug} · article</small></span></li>)}</ul></section>}
          {!overview.draftRevision && overview.archivedRevisions?.length > 0 && <div className="ww-recovery-control">
            <label>Recovery point<select value={rollbackRevisionId} onChange={(event) => setRollbackRevisionId(event.target.value)}>{overview.archivedRevisions.map((revision) => <option key={revision.id} value={revision.id}>Revision {revision.revision_number}{revision.archived_at ? ` · archived ${new Date(revision.archived_at).toLocaleDateString()}` : ''}</option>)}</select></label>
            <p>Recovery publishes a new copy of this revision. It does not rewrite the selected history or change listing publication state.</p>
            <button className="ww-rollback" type="button" disabled={Boolean(action) || !rollbackRevisionId} onClick={() => void runAction('rollback')}>{action === 'rollback' ? 'Restoring…' : 'Restore selected revision'}</button>
          </div>}
        </div>}
        {overview.mode === 'connected' && overview.draftRevision && <form className="ww-campaign-builder" id="studio-campaigns" onSubmit={createCampaign}><div><span className="md-eyebrow">NEW CAMPAIGN PAGE</span><h3>Create a focused landing page.</h3><p>It starts with a hero, selected listings and a CRM-connected enquiry form. You can review it before publishing.</p></div><label>Campaign name<input value={campaignTitle} maxLength={160} required onChange={(event) => setCampaignTitle(event.target.value)} placeholder="Spring viewing collection" /></label><label>Campaign URL<input value={campaignSlug} maxLength={80} onChange={(event) => setCampaignSlug(event.target.value)} placeholder="spring-viewing" /><small>Leave blank to use the campaign name.</small></label><label>Intro<textarea value={campaignIntro} maxLength={600} rows={3} onChange={(event) => setCampaignIntro(event.target.value)} placeholder="A short, clear reason to enquire." /></label><button className="ww-publish" type="submit" disabled={Boolean(action)}>{action === 'campaign' ? 'Creating…' : 'Create campaign page'}</button></form>}
        {overview.mode === 'connected' && overview.publicationEvents?.length > 0 && <div className="ww-publication-history" id="studio-history"><div><span className="md-eyebrow">PUBLICATION HISTORY</span><strong>Recoverable, tenant-scoped changes</strong></div><ol>{overview.publicationEvents.slice(0, 6).map((event) => <li key={event.id}><span>{PUBLICATION_LABELS[event.action] || event.action}</span><small>{new Date(event.created_at).toLocaleString()}{event.content_fingerprint ? ` · ${event.content_fingerprint.slice(0, 10)}` : ''}</small></li>)}</ol></div>}
      </section>

      {overview.mode === 'connected' && overview.draftRevision && overview.draftBrand && <div id="studio-brand"><WebsiteBrandEditor brand={overview.draftBrand} busy={action === 'brand' || action === 'brand-reset'} onSave={saveBrand} onReset={() => void resetBrand()} /></div>}

      {overview.mode === 'connected' && overview.draftRevision && <div id="studio-pages"><WebsitePageEditor pages={overview.pages} revisionId={overview.draftRevision.id} busy={action === 'page' || action === 'page-delete'} onSave={savePage} onDeleteCampaign={deleteCampaign} /></div>}

      <section className="ww-grid">
        <article className="ww-card"><LayoutTemplate size={21} /><span className="md-eyebrow">TEMPLATE</span><h2>One strong foundation</h2><p>Search, listings, enquiries and SEO are shared. Your colours, pages, campaigns and content remain your own.</p></article>
        <article className="ww-card"><Globe2 size={21} /><span className="md-eyebrow">DOMAINS</span><h2>Safe connection process</h2><p>We will provide only the website DNS records required. Nameservers and email records are never changed.</p></article>
        <article className="ww-card"><LockKeyhole size={21} /><span className="md-eyebrow">CRM</span><h2>Every enquiry stays in Arch9</h2><p>Property, campaign and general enquiries are stored in the CRM first, then routed to the right person.</p></article>
        <article className="ww-card"><Megaphone size={21} /><span className="md-eyebrow">CAMPAIGNS</span><h2>Focused landing pages</h2><p>Use approved sections for campaigns—hero, listings, benefits, FAQs and a CRM-connected enquiry form.</p></article>
      </section>

      <section className="ww-readiness"><div><span className="md-eyebrow">LAUNCH PATH</span><h2>Set up safely, then publish.</h2></div><ol>{readiness.map((item, index) => <li key={item.label}><span>{index + 1}</span><div><strong>{item.label}</strong><p>{item.detail}</p></div><small>{item.status === 'next' ? 'Next phase' : 'Available'}</small></li>)}</ol></section>
    </div>
  )
}
