import { lazy, Suspense, useEffect, useState } from 'react'
import { ArrowUpRight, CheckCheck, Mail, Megaphone, MessageCircle, RefreshCw, Search, Send, UsersRound } from 'lucide-react'
import { useAuthSession } from '../../context/AuthSessionContext'
import { developmentCampaignContext, fetchDevelopmentCampaigns } from '../../services/developmentCampaignService'
import Button from '../ui/Button'
import Field from '../ui/Field'
import '../../pages/EmailCampaigns.css'
import '../../pages/WhatsAppCampaigns.css'
import './development-marketing-campaigns.css'

const EmailBuilder = lazy(() => import('../marketing/EmailCampaigns').then(module => ({ default: module.CreateEmailCampaign })))
const EmailDetail = lazy(() => import('../marketing/EmailCampaigns').then(module => ({ default: module.EmailCampaignDetail })))
const WhatsAppBuilder = lazy(() => import('../marketing/WhatsAppCampaigns').then(module => ({ default: module.CreateWhatsAppCampaign })))
const WhatsAppDetail = lazy(() => import('../marketing/WhatsAppCampaigns').then(module => ({ default: module.WhatsAppCampaignDetail })))
const format = new Intl.NumberFormat('en-ZA')
const value = count => count == null ? '—' : format.format(count)
const activeStatuses = new Set(['draft', 'scheduled', 'sending'])
const channelLabel = channel => channel === 'email' ? 'Email' : 'WhatsApp'
const date = timestamp => { const result = timestamp ? new Date(timestamp) : null; return result && Number.isFinite(result.getTime()) ? result.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date unavailable' }

export default function DevelopmentMarketingCampaigns(props) {
  const { authState } = useAuthSession()
  const organisationId = String(authState?.currentWorkspace?.id || authState?.currentMembership?.workspaceId || authState?.currentMembership?.workspace_id || '')
  return <DevelopmentMarketingCampaignsWorkspace key={organisationId} {...props} organisationId={organisationId} />
}

export function DevelopmentMarketingCampaignsWorkspace({ development, organisationId, organisationUsers = [], canManage = false, loadCampaigns = fetchDevelopmentCampaigns }) {
  const [refresh, setRefresh] = useState(0)
  const [request, setRequest] = useState(null)
  const [editor, setEditor] = useState(null)
  const [tab, setTab] = useState('past')
  const [channel, setChannel] = useState('all')
  const [search, setSearch] = useState('')
  const key = `${organisationId}:${development.id}:${refresh}`
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => loadCampaigns({ organisationId, developmentId: development.id })).then(data => {
      if (!cancelled) setRequest({ key, ...data })
    }).catch(() => { if (!cancelled) setRequest({ key, campaigns: [], errors: ['Campaign history could not be loaded. Refresh to try again.'] }) })
    return () => { cancelled = true }
  }, [organisationId, development.id, key, loadCampaigns])
  const loading = request?.key !== key
  const campaigns = loading ? [] : request.campaigns || []
  const errors = loading ? [] : request.errors || []
  const past = campaigns.filter(campaign => !activeStatuses.has(campaign.status))
  const drafts = campaigns.filter(campaign => activeStatuses.has(campaign.status))
  const rows = (tab === 'past' ? past : drafts).filter(campaign => (channel === 'all' || campaign.channel === channel) && campaign.name.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0))
  function total(metric) { return loading || errors.length || campaigns.some(campaign => campaign[metric] == null) ? null : campaigns.reduce((sum, campaign) => sum + campaign[metric], 0) }
  function back() { setEditor(null); setRefresh(previous => previous + 1) }
  function openCampaign(campaign) { if (canManage) setEditor({ channel: campaign.channel, id: campaign.id, mode: campaign.status === 'draft' ? 'create' : 'detail' }) }
  if (editor) {
    const Builder = editor.channel === 'email' ? EmailBuilder : WhatsAppBuilder
    const Detail = editor.channel === 'email' ? EmailDetail : WhatsAppDetail
    return <section className="development-campaign-editor" aria-label={`${channelLabel(editor.channel)} campaign workspace`}><p className="development-campaign-context">Campaigns · {development.name}</p><Suspense fallback={<p role="status">Opening campaign workspace…</p>}>{editor.mode === 'create' ? <Builder campaignId={editor.id} developmentContext={developmentCampaignContext(development)} onBack={back} /> : <Detail campaignId={editor.id} onBack={back} onEdit={id => setEditor({ channel: editor.channel, id, mode: 'create' })} />}</Suspense></section>
  }
  return <section className="development-marketing-campaigns" aria-label="Development campaigns" aria-busy={loading}>
    <header className="development-campaign-heading"><div><span className="development-campaign-eyebrow">Turn interest into conversations</span><h3>Your next campaign starts here.</h3><p>Reach your audience and follow the results for {development.name}.</p></div><Button type="button" variant="secondary" size="sm" onClick={() => setRefresh(previous => previous + 1)} disabled={loading}><RefreshCw size={15} aria-hidden="true" />Refresh</Button></header>
    <div className="development-campaign-actions">
      <button type="button" className="development-campaign-action is-email" disabled={!canManage} onClick={() => setEditor({ channel: 'email', mode: 'create' })}><span className="development-campaign-action-icon"><Mail size={26} aria-hidden="true" /></span><strong>Email Campaign</strong><small>Tell the story. Spark the next enquiry.</small><ArrowUpRight size={20} aria-hidden="true" /></button>
      <button type="button" className="development-campaign-action is-whatsapp" disabled={!canManage} onClick={() => setEditor({ channel: 'whatsapp', mode: 'create' })}><span className="development-campaign-action-icon"><MessageCircle size={26} aria-hidden="true" /></span><strong>WhatsApp Campaign</strong><small>Start a conversation with your buyers.</small><ArrowUpRight size={20} aria-hidden="true" /></button>
      <button type="button" className="development-campaign-action is-meta" disabled><span className="development-campaign-action-icon"><Megaphone size={26} aria-hidden="true" /></span><strong>Meta Campaign</strong><small>Reach new audiences on Facebook and Instagram.</small><span className="development-campaign-soon">Coming soon</span></button>
    </div>
    {!canManage ? <p className="development-campaign-note">You can review campaigns. Ask a development manager to create a new campaign.</p> : null}
    {errors.length ? <div role="alert" className="development-campaign-error">{errors.map(error => <p key={error}>{error}</p>)}</div> : null}
    <div className="development-campaign-stats" aria-label="Campaign results">{[
      [Send, 'Campaigns sent', loading || errors.length ? null : campaigns.filter(campaign => ['sent', 'partial', 'partially_failed'].includes(campaign.status)).length],
      [UsersRound, 'Recipients', total('recipients')],
      [CheckCheck, 'Delivered', total('delivered')],
    ].map(([icon, label, count]) => { const Icon = icon; return <article key={label}><span><Icon size={17} aria-hidden="true" />{label}</span><strong>{value(count)}</strong></article> })}<article><span><UsersRound size={17} aria-hidden="true" />Leads generated</span><strong className="is-untracked">Not tracked</strong></article></div>
    <article className="development-campaign-history">
      <div className="development-campaign-history-heading"><div><span className="development-campaign-eyebrow">Campaign history</span><h4>See what connected.</h4><p>Campaigns created here are linked to this development.</p></div><span className="development-campaign-count">{loading ? '…' : campaigns.length}</span></div>
      <div className="development-campaign-tabs" aria-label="Campaign history view"><button type="button" aria-pressed={tab === 'past'} onClick={() => setTab('past')}>Past campaigns <span>{past.length}</span></button><button type="button" aria-pressed={tab === 'drafts'} onClick={() => setTab('drafts')}>Drafts & scheduled <span>{drafts.length}</span></button></div>
      <div className="development-campaign-filters"><label className="development-campaign-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search development campaigns" placeholder="Search campaigns" value={search} onChange={event => setSearch(event.target.value)} /></label><Field as="select" aria-label="Campaign channel" value={channel} onChange={event => setChannel(event.target.value)}><option value="all">All channels</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option></Field></div>
      {loading ? <p className="development-campaign-empty" role="status">Loading campaign history…</p> : rows.length ? <div className="development-campaign-table-wrap"><table><thead><tr><th scope="col">Campaign</th><th scope="col">Recipients</th><th scope="col">Delivered</th><th scope="col">Engagement</th><th scope="col">Leads generated</th></tr></thead><tbody>{rows.map(campaign => {
        const agent = organisationUsers.find(user => campaign.createdBy && [user.id, user.userId, user.user_id].includes(campaign.createdBy))
        const name = agent?.fullName || agent?.full_name || agent?.name || [agent?.firstName || agent?.first_name, agent?.lastName || agent?.last_name].filter(Boolean).join(' ')
        return <tr key={`${campaign.channel}:${campaign.id}`}><th scope="row"><button type="button" disabled={!canManage} onClick={() => openCampaign(campaign)}><strong>{campaign.name}{canManage ? <ArrowUpRight size={14} aria-hidden="true" /> : null}</strong><span>{channelLabel(campaign.channel)} · {date(campaign.date)} · {String(campaign.status || 'draft').replaceAll('_', ' ')}</span>{name ? <small>Created by {name}</small> : null}</button></th><td>{value(campaign.recipients)}</td><td>{value(campaign.delivered)}</td><td>{value(campaign.engaged)}<small>{campaign.channel === 'email' ? 'clicked' : 'read'}</small></td><td><span className="development-campaign-untracked">Not tracked</span></td></tr>
      })}</tbody></table></div> : <div className="development-campaign-empty"><Mail size={27} aria-hidden="true" /><strong>{errors.length ? 'History is partially unavailable' : search || channel !== 'all' ? 'No matching campaigns' : tab === 'past' ? 'Your campaign history starts here' : 'No drafts or scheduled campaigns'}</strong><p>{errors.length ? 'Refresh to check for additional campaigns.' : 'Create an email or WhatsApp campaign for this development to see it here.'}</p></div>}
      <p className="development-campaign-footnote">Delivery, email clicks and WhatsApp reads come from campaign results. Leads generated will appear once campaign-to-lead attribution is connected.</p>
    </article>
  </section>
}
