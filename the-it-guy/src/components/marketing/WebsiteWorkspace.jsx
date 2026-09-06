import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowUpRight, CheckCircle2, Globe2, LayoutTemplate, LockKeyhole, Megaphone, MonitorSmartphone, RefreshCw } from 'lucide-react'
import { useAuthSession } from '../../context/AuthSessionContext'
import { createWebsiteCampaignPage, createWebsiteDraft, createWebsiteSite, deleteWebsiteDraftCampaign, discardWebsiteDraft, getWebsiteWorkspaceOverview, publishWebsiteDraft, resetWebsiteDraftBrand, rollbackWebsiteRevision, saveWebsiteDraftBrand, saveWebsiteDraftPage } from '../../services/websiteWorkspaceService'
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

function isRepairableBrandBlocker(value) {
  return /^Prepare the (light|dark) website logo as a durable public asset before publishing\.$/i.test(String(value || '').trim())
}

function getOrganisationId(authState) {
  return String(authState?.currentWorkspace?.id || authState?.currentMembership?.workspaceId || authState?.currentMembership?.workspace_id || '').trim()
}

export default function WebsiteWorkspace({ onBack }) {
  const { authState } = useAuthSession()
  const organisationId = useMemo(() => getOrganisationId(authState), [authState])
  const [overview, setOverview] = useState({ mode: 'loading', pilot: null, productionRelease: null, productionDarkLaunch: null, site: null, domains: [], pages: [], publishedRevision: null, publicationEvents: [], publicationReadiness: null })
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
    try { setOverview(await getWebsiteWorkspaceOverview(organisationId)) } catch (loadError) { setError('Website settings could not be loaded.'); setOverview({ mode: 'error', pilot: null, productionRelease: null, productionDarkLaunch: null, site: null, domains: [], pages: [], publishedRevision: null, publicationEvents: [], publicationReadiness: null }) }
  }

  useEffect(() => { void refresh() }, [organisationId])
  useEffect(() => {
    if (!overview.archivedRevisions?.some((revision) => revision.id === rollbackRevisionId)) {
      setRollbackRevisionId(overview.archivedRevisions?.[0]?.id || '')
    }
  }, [overview.archivedRevisions, rollbackRevisionId])
  const primaryDomain = overview.domains.find((domain) => domain.is_primary) || overview.domains.find((domain) => domain.domain_kind === 'preview')
  const hasPublishedSite = overview.site?.status === 'published' && Boolean(overview.publishedRevision)
  const publicationBlockers = Array.isArray(overview.publicationReadiness?.blockers) ? overview.publicationReadiness.blockers : []
  const publicationReady = overview.publicationReadiness?.ready === true || (publicationBlockers.length > 0 && publicationBlockers.every(isRepairableBrandBlocker))
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
  return (
    <div className="wa-page website-workspace">
      <button className="ww-back" type="button" onClick={onBack}><ArrowLeft size={16} /> Marketing overview</button>

      <section className="ww-preview-card" aria-label="Website preview status">
        <div className="ww-preview-copy">
          <span className="md-eyebrow">WEBSITE STUDIO</span>
          <h2>Build a digital home for your brand.</h2>
          <p>Shape a polished property website, campaign pages and enquiry journeys before anything goes live.</p>
          <div className="ww-preview-meta"><span><MonitorSmartphone size={16} /> Mobile-ready template</span><span><CheckCircle2 size={16} /> {overview.mode === 'loading' ? 'Preparing workspace' : hasPublishedSite ? 'Website published' : overview.mode === 'connected' ? 'Draft created' : overview.mode === 'ready_to_create' ? 'Ready to create' : 'Setup unavailable'}</span></div>
        </div>
        <div className="ww-preview-window" aria-hidden="true">
          <div className="ww-preview-window-bar"><i /><i /><i /><span>yourbrand.co.za</span></div>
          <div className="ww-preview-window-body"><span>YOUR BRAND</span><strong>Find your next place.</strong><small>Beautiful homes. Clear stories. Simple enquiries.</small><b>Explore properties <ArrowUpRight size={14} /></b></div>
        </div>
      </section>

      <section className="ww-operations" aria-label="Website operation status">
        <div className="ww-operations-heading"><div><span className="md-eyebrow">SITE STATUS</span><h2>{overview.mode === 'loading' ? 'Checking your website…' : overview.mode === 'connected' ? 'Your website control centre' : 'Ready for the first website setup'}</h2></div><button className="ww-refresh" type="button" onClick={() => void refresh()}><RefreshCw size={15} /> Refresh</button></div>
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
        {overview.mode === 'connected' && <div className="ww-publication-control">
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
            {publicationReady ? <span>{overview.publicationReadiness.pageCount} pages · {overview.publicationReadiness.activeDomainCount} active domain · fingerprint {String(overview.publicationReadiness.contentFingerprint || '').slice(0, 10)}</span> : <ul>{(overview.publicationReadiness?.blockers || []).map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
          </div>}
          {!overview.draftRevision && overview.archivedRevisions?.length > 0 && <div className="ww-recovery-control">
            <label>Recovery point<select value={rollbackRevisionId} onChange={(event) => setRollbackRevisionId(event.target.value)}>{overview.archivedRevisions.map((revision) => <option key={revision.id} value={revision.id}>Revision {revision.revision_number}{revision.archived_at ? ` · archived ${new Date(revision.archived_at).toLocaleDateString()}` : ''}</option>)}</select></label>
            <p>Recovery publishes a new copy of this revision. It does not rewrite the selected history or change listing publication state.</p>
            <button className="ww-rollback" type="button" disabled={Boolean(action) || !rollbackRevisionId} onClick={() => void runAction('rollback')}>{action === 'rollback' ? 'Restoring…' : 'Restore selected revision'}</button>
          </div>}
        </div>}
        {overview.mode === 'connected' && overview.draftRevision && <form className="ww-campaign-builder" onSubmit={createCampaign}><div><span className="md-eyebrow">NEW CAMPAIGN PAGE</span><h3>Create a focused landing page.</h3><p>It starts with a hero, selected listings and a CRM-connected enquiry form. You can review it before publishing.</p></div><label>Campaign name<input value={campaignTitle} maxLength={160} required onChange={(event) => setCampaignTitle(event.target.value)} placeholder="Spring viewing collection" /></label><label>Campaign URL<input value={campaignSlug} maxLength={80} onChange={(event) => setCampaignSlug(event.target.value)} placeholder="spring-viewing" /><small>Leave blank to use the campaign name.</small></label><label>Intro<textarea value={campaignIntro} maxLength={600} rows={3} onChange={(event) => setCampaignIntro(event.target.value)} placeholder="A short, clear reason to enquire." /></label><button className="ww-publish" type="submit" disabled={Boolean(action)}>{action === 'campaign' ? 'Creating…' : 'Create campaign page'}</button></form>}
        {overview.mode === 'connected' && overview.publicationEvents?.length > 0 && <div className="ww-publication-history"><div><span className="md-eyebrow">PUBLICATION HISTORY</span><strong>Recoverable, tenant-scoped changes</strong></div><ol>{overview.publicationEvents.slice(0, 6).map((event) => <li key={event.id}><span>{PUBLICATION_LABELS[event.action] || event.action}</span><small>{new Date(event.created_at).toLocaleString()}{event.content_fingerprint ? ` · ${event.content_fingerprint.slice(0, 10)}` : ''}</small></li>)}</ol></div>}
      </section>

      {overview.mode === 'connected' && overview.draftRevision && overview.draftBrand && <WebsiteBrandEditor brand={overview.draftBrand} busy={action === 'brand' || action === 'brand-reset'} onSave={saveBrand} onReset={() => void resetBrand()} />}

      {overview.mode === 'connected' && overview.draftRevision && <WebsitePageEditor pages={overview.pages} revisionId={overview.draftRevision.id} busy={action === 'page' || action === 'page-delete'} onSave={savePage} onDeleteCampaign={deleteCampaign} />}

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
