import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowUpRight, CheckCircle2, Globe2, LayoutTemplate, LockKeyhole, Megaphone, MonitorSmartphone, RefreshCw } from 'lucide-react'
import { useAuthSession } from '../../context/AuthSessionContext'
import { createWebsiteCampaignPage, createWebsiteDraft, getWebsiteWorkspaceOverview, publishWebsiteDraft, rollbackWebsiteRevision } from '../../services/websiteWorkspaceService'
import './WebsiteWorkspace.css'

const readiness = [
  { label: 'Create a preview site', detail: 'A secure PropData preview address is created before any client domain is touched.', status: 'foundation' },
  { label: 'Create pages and campaigns', detail: 'Build structured landing pages from approved content blocks, then share the campaign URL.', status: 'available' },
  { label: 'Publish property stock', detail: 'Only listings explicitly marked published will appear on the public website.', status: 'next' },
  { label: 'Connect the client domain', detail: 'Website records only. Existing email DNS records remain untouched.', status: 'next' },
]

function getOrganisationId(authState) {
  return String(authState?.currentWorkspace?.id || authState?.currentMembership?.workspaceId || authState?.currentMembership?.workspace_id || '').trim()
}

export default function WebsiteWorkspace({ onBack }) {
  const { authState } = useAuthSession()
  const organisationId = useMemo(() => getOrganisationId(authState), [authState])
  const [overview, setOverview] = useState({ mode: 'loading', site: null, domains: [], pages: [], publishedRevision: null })
  const [error, setError] = useState('')
  const [action, setAction] = useState('')
  const [campaignTitle, setCampaignTitle] = useState('')
  const [campaignSlug, setCampaignSlug] = useState('')
  const [campaignIntro, setCampaignIntro] = useState('')

  const refresh = async () => {
    setError('')
    setOverview((current) => ({ ...current, mode: 'loading' }))
    try { setOverview(await getWebsiteWorkspaceOverview(organisationId)) } catch (loadError) { setError('Website settings could not be loaded.'); setOverview({ mode: 'error', site: null, domains: [], pages: [], publishedRevision: null }) }
  }

  useEffect(() => { void refresh() }, [organisationId])
  const primaryDomain = overview.domains.find((domain) => domain.is_primary) || overview.domains.find((domain) => domain.domain_kind === 'preview')
  const hasPublishedSite = overview.site?.status === 'published' && Boolean(overview.publishedRevision)
  const runAction = async (type) => {
    if (!overview.site?.id || action) return
    setAction(type)
    setError('')
    try {
      if (type === 'draft') await createWebsiteDraft(overview.site.id)
      if (type === 'publish' && overview.draftRevision?.id) await publishWebsiteDraft(overview.site.id, overview.draftRevision.id)
      if (type === 'rollback' && overview.archivedRevisions?.[0]?.id) await rollbackWebsiteRevision(overview.site.id, overview.archivedRevisions[0].id)
      await refresh()
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
    } catch (campaignError) { setError(campaignError?.message || 'Campaign page could not be created.') } finally { setAction('') }
  }
  return (
    <div className="wa-page website-workspace">
      <button className="ww-back" type="button" onClick={onBack}><ArrowLeft size={16} /> Marketing overview</button>
      <header className="ww-hero">
        <div><span className="md-eyebrow">WEBSITES</span><h1>Your agency website, powered by PropData.</h1><p>Manage public property pages, campaigns and leads from the same platform that manages your listings.</p></div>
        <span className="ww-status"><CheckCircle2 size={16} /> {overview.mode === 'loading' ? 'Loading website' : hasPublishedSite ? 'Website published' : 'Campaign pages ready'}</span>
      </header>

      <section className="ww-preview-card" aria-label="Website preview status">
        <div className="ww-preview-icon"><MonitorSmartphone size={26} /></div>
        <div><span className="md-eyebrow">NEUTRAL TEMPLATE</span><h2>Property Standard v1</h2><p>A mobile-first property experience is being prepared for your brand. It will always be reviewed on a PropData preview address before a live domain is connected.</p></div>
        <span className="ww-preview-tag">Preview first <ArrowUpRight size={15} /></span>
      </section>

      <section className="ww-operations" aria-label="Website operation status">
        <div className="ww-operations-heading"><div><span className="md-eyebrow">SITE STATUS</span><h2>{overview.mode === 'loading' ? 'Checking your website…' : overview.mode === 'connected' ? 'Your website control centre' : 'Ready for the first website setup'}</h2></div><button className="ww-refresh" type="button" onClick={() => void refresh()}><RefreshCw size={15} /> Refresh</button></div>
        {error && <p className="ww-error" role="status">{error}</p>}
        <div className="ww-operation-grid"><article><small>PUBLICATION</small><strong>{hasPublishedSite ? `Revision ${overview.publishedRevision.revision_number} is live` : 'No published revision yet'}</strong><span>{overview.site?.templateKey || 'Property Standard v1'}</span></article><article><small>DOMAIN</small><strong>{primaryDomain?.hostname || 'Preview domain to be created'}</strong><span>{primaryDomain ? `${primaryDomain.status} · ${primaryDomain.domain_kind}` : 'No email DNS records are needed'}</span></article><article><small>PAGES</small><strong>{overview.pages.length} managed page{overview.pages.length === 1 ? '' : 's'}</strong><span>{overview.pages.filter((page) => page.page_kind === 'campaign').length} campaign page{overview.pages.filter((page) => page.page_kind === 'campaign').length === 1 ? '' : 's'}</span></article></div>
        {overview.mode === 'connected' && <div className="ww-page-list">{overview.pages.slice(0, 6).map((page) => <span key={page.id}><strong>{page.title}</strong><small>/{page.slug || ''} · {page.page_kind}</small></span>)}</div>}
        {overview.mode === 'connected' && <div className="ww-publish-actions"><div><strong>{overview.draftRevision ? `Draft revision ${overview.draftRevision.revision_number} is ready for review.` : 'Create a draft to start a controlled content update.'}</strong><small>Publishing replaces the live revision atomically. The prior live revision is retained for rollback.</small></div>{overview.draftRevision ? <button className="ww-publish" type="button" disabled={Boolean(action)} onClick={() => void runAction('publish')}>{action === 'publish' ? 'Publishing…' : 'Publish draft'}</button> : <button className="ww-publish" type="button" disabled={Boolean(action) || !hasPublishedSite} onClick={() => void runAction('draft')}>{action === 'draft' ? 'Preparing…' : 'Create draft'}</button>}{overview.archivedRevisions?.length > 0 && !overview.draftRevision && <button className="ww-rollback" type="button" disabled={Boolean(action)} onClick={() => void runAction('rollback')}>{action === 'rollback' ? 'Restoring…' : 'Restore previous'}</button>}</div>}
        {overview.mode === 'connected' && overview.draftRevision && <form className="ww-campaign-builder" onSubmit={createCampaign}><div><span className="md-eyebrow">NEW CAMPAIGN PAGE</span><h3>Create a focused landing page.</h3><p>It starts with a hero, selected listings and a CRM-connected enquiry form. You can review it before publishing.</p></div><label>Campaign name<input value={campaignTitle} maxLength={160} required onChange={(event) => setCampaignTitle(event.target.value)} placeholder="Spring viewing collection" /></label><label>Campaign URL<input value={campaignSlug} maxLength={80} onChange={(event) => setCampaignSlug(event.target.value)} placeholder="spring-viewing" /><small>Leave blank to use the campaign name.</small></label><label>Intro<textarea value={campaignIntro} maxLength={600} rows={3} onChange={(event) => setCampaignIntro(event.target.value)} placeholder="A short, clear reason to enquire." /></label><button className="ww-publish" type="submit" disabled={Boolean(action)}>{action === 'campaign' ? 'Creating…' : 'Create campaign page'}</button></form>}
      </section>

      <section className="ww-grid">
        <article className="ww-card"><LayoutTemplate size={21} /><span className="md-eyebrow">TEMPLATE</span><h2>One strong foundation</h2><p>Search, listings, enquiries and SEO are shared. Your colours, pages, campaigns and content remain your own.</p></article>
        <article className="ww-card"><Globe2 size={21} /><span className="md-eyebrow">DOMAINS</span><h2>Safe connection process</h2><p>We will provide only the website DNS records required. Nameservers and email records are never changed.</p></article>
        <article className="ww-card"><LockKeyhole size={21} /><span className="md-eyebrow">CRM</span><h2>Every enquiry stays in iSite</h2><p>Property, campaign and general enquiries are stored in the CRM first, then routed to the right person.</p></article>
        <article className="ww-card"><Megaphone size={21} /><span className="md-eyebrow">CAMPAIGNS</span><h2>Focused landing pages</h2><p>Use approved sections for campaigns—hero, listings, benefits, FAQs and a CRM-connected enquiry form.</p></article>
      </section>

      <section className="ww-readiness"><div><span className="md-eyebrow">LAUNCH PATH</span><h2>Set up safely, then publish.</h2></div><ol>{readiness.map((item, index) => <li key={item.label}><span>{index + 1}</span><div><strong>{item.label}</strong><p>{item.detail}</p></div><small>{item.status === 'next' ? 'Next phase' : 'Available'}</small></li>)}</ol></section>
    </div>
  )
}
