import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Copy, RefreshCw, Search, UsersRound } from 'lucide-react'
import { MarketingLink as Link } from './MarketingNavigation.jsx'
import { getOrganizationProfile } from '../../services/organizationService'
import { CAMPAIGN_CHANNELS } from '../../services/marketingCampaignService'
import { loadCampaignOverviewEnquiries } from '../../services/campaignEnquiryService'
import { buildCampaignAgentOversight } from '../../services/campaignAgentModel'
import { AGENCY_CRM_UPDATED_EVENT, getAgencyCrmUpdateDetail } from '../../lib/agencyCrmUpdateBus'
import CampaignPlatformLogo from './CampaignPlatformLogo'
import CampaignCopyDialog from './CampaignCopyDialog'
import './CampaignWorkspacePanels.css'
import './CampaignAgents.css'

const count = (value) => value === null ? '—' : value
const reuseLabels = { enquiries: 'Recorded enquiries', email: 'Email click rate', whatsapp: 'WhatsApp read rate' }

export default function CampaignAgents({ organisationId, workspace, renderCampaign, onRefresh, refreshing, lastRefreshed, onMakeTemplate, onCopied }) {
  const [directory, setDirectory] = useState({ loading: true, members: [], error: '' })
  const [enquiries, setEnquiries] = useState({ loading: true, entries: [], warnings: [], error: '' })
  const [retry, setRetry] = useState(0)
  const [search, setSearch] = useState(''), [owner, setOwner] = useState('all'), [status, setStatus] = useState('all')
  const [support, setSupport] = useState('all'), [basis, setBasis] = useState('enquiries'), [copy, setCopy] = useState(null)
  const generation = useRef(0)
  const invalidate = useCallback(() => { generation.current++ }, [])
  const idsKey = JSON.stringify(workspace.campaigns.map((row) => row.id).sort())
  const loadEnquiries = useCallback(async () => {
    if (!workspace.canManage) return
    const request = ++generation.current
    try {
      const data = await loadCampaignOverviewEnquiries({ organisationId, campaignIds: JSON.parse(idsKey), userId: workspace.userId, canManage: true })
      if (request === generation.current) setEnquiries({ ...data, loading: false, error: '' })
    } catch (error) {
      if (request === generation.current) setEnquiries({ loading: false, entries: [], warnings: [], error: error.message || 'Campaign enquiries could not be loaded.' })
    }
  }, [organisationId, idsKey, workspace.userId, workspace.canManage])
  // Synchronise the CRM coaching data with explicit/visible-page workspace refreshes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadEnquiries(); return invalidate }, [loadEnquiries, workspace, retry, invalidate])
  useEffect(() => {
    if (!workspace.canManage) return
    let current = true
    getOrganizationProfile(organisationId).then((data) => {
      if (current) setDirectory({ loading: false, members: data.members || [], error: '' })
    }).catch(() => { if (current) setDirectory({ loading: false, members: [], error: 'Agent names are unavailable. Campaigns are still shown by owner.' }) })
    return () => { current = false }
  }, [organisationId, workspace.canManage, retry])
  useEffect(() => {
    const changed = (event) => { if (getAgencyCrmUpdateDetail(event).organisationId === organisationId) void loadEnquiries() }
    window.addEventListener(AGENCY_CRM_UPDATED_EVENT, changed)
    return () => window.removeEventListener(AGENCY_CRM_UPDATED_EVENT, changed)
  }, [organisationId, loadEnquiries])
  const model = useMemo(() => workspace.canManage ? buildCampaignAgentOversight(workspace, directory.members, enquiries, lastRefreshed || new Date()) : null, [workspace, directory.members, enquiries, lastRefreshed])
  if (!workspace.canManage) return <section className="mc-panel"><h2>Agency manager access required</h2><p>The Agents view is available to principals and agency administrators.</p></section>
  const term = search.trim().toLowerCase()
  const matches = (campaign, name) => `${name} ${campaign.name} ${campaign.objective || ''} ${campaign.area || ''}`.toLowerCase().includes(term)
  const filteredAgents = model.agents.filter((agent) => (status === 'all' || agent.counts[status] > 0) && (!term || agent.name.toLowerCase().includes(term) || agent.plans.some((campaign) => matches(campaign, agent.name))) && (support === 'all' || (support === 'support' ? agent.supportCount > 0 : support === 'untouched' ? agent.untouched > 0 : support === 'overdue' ? agent.overdue > 0 : agent.counts.active === 0)))
  const selected = model.agents.find((agent) => agent.id === owner)
  const campaigns = selected?.plans.filter((campaign) => (status === 'all' || campaign.status === status) && matches(campaign, selected.name)) || []
  const candidates = model.reuse[basis] || []
  const reuseActions = (campaign) => <div className="mc-agent-reuse-actions"><button type="button" className="mc-button" disabled={directory.loading || !model.agents.some((agent) => agent.canReceive && agent.id !== campaign.created_by)} onClick={() => setCopy(campaign)}><Copy size={14} />Copy to another agent</button><button type="button" className="mc-text-button" onClick={() => onMakeTemplate?.(campaign)}>Make agency template<ArrowRight size={14} /></button></div>
  return <section className="mc-agents-workspace" aria-labelledby="mc-agents-heading" aria-busy={refreshing}>
    <header className="mc-panel-heading"><div><h2 id="mc-agents-heading">Agent campaigns</h2></div><div className="mc-agent-refresh"><button className="mc-button" disabled={refreshing} onClick={onRefresh}><RefreshCw size={16}/>{refreshing ? 'Refreshing…' : 'Refresh campaigns'}</button><small>Refreshes every 30 seconds while this page is visible.</small></div></header>
    <div className="mc-agent-summary"><div><strong>{model.agents.filter((agent) => agent.id !== 'unassigned').length}</strong><span>Agents</span></div><div><strong>{workspace.campaigns.filter((campaign) => campaign.status === 'active').length}</strong><span>Active campaigns</span></div><div><strong>{count(model.totalUntouched)}</strong><span>Untouched enquiries</span></div><div><strong>{model.supportAgents}{!model.attention.enquiriesAvailable || model.attention.warnings.length ? '+' : ''}</strong><span>Owners with work to review</span></div></div>
    <div className="mc-agent-controls">
      <label>Agent<select aria-label="Filter campaigns by agent" value={owner} onChange={(event) => setOwner(event.target.value)}><option value="all">All agents</option>{model.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
      <label>Status<select aria-label="Agent campaign status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="scheduled">Scheduled</option><option value="draft">Drafts</option><option value="completed">Completed</option></select></label>
      <label>Coaching focus<select aria-label="Agent coaching focus" value={support} onChange={(event) => { setSupport(event.target.value); setOwner('all') }}><option value="all">All agents</option><option value="support">Work to review</option><option value="untouched">Untouched enquiries</option><option value="overdue">Overdue follow-ups</option><option value="inactive">No active campaigns</option></select></label>
      <label className="mc-search"><Search size={16}/><input aria-label="Search agent campaigns" placeholder="Search agents or campaigns…" value={search} onChange={(event) => setSearch(event.target.value)}/></label>
    </div>
    {directory.loading && <p className="mc-note" role="status">Loading agent names…</p>}
    {directory.error && <p className="mc-error" role="alert">{directory.error} <button className="mc-text-button" onClick={() => { setDirectory({ loading: true, members: [], error: '' }); setRetry((value) => value + 1) }}>Retry names</button></p>}
    {enquiries.loading ? <p className="mc-note" role="status">Checking CRM enquiries and follow-ups…</p> : enquiries.error && <p className="mc-agent-source-note" role="status">{enquiries.error} Campaign activity remains available. <button className="mc-text-button" onClick={() => void loadEnquiries()}>Retry enquiries</button></p>}
    {model.attention.warnings.map((warning) => <p key={warning} className="mc-agent-source-note" role="status">{warning}</p>)}
    {lastRefreshed && <p className="mc-agent-refreshed">Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
    {owner === 'all' ? <div className="mc-agent-card-grid">{filteredAgents.map((agent) => <button type="button" className="mc-agent-card" key={agent.id} aria-label={`View campaigns for ${agent.name}`} onClick={() => setOwner(agent.id)}>
      <div className="mc-agent-card-identity"><span className="mc-agent-card-avatar" aria-hidden="true">{agent.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span><div><h3>{agent.name}</h3><span>{agent.member?.organizationRoleLabel || 'Agency member'}{agent.id === workspace.userId ? ' · You' : ''}</span></div></div>
      <dl className="mc-agent-card-totals"><div><dt>Campaigns</dt><dd>{agent.plans.length}</dd></div><div><dt><span className="mc-agent-active-dot"/>Active now</dt><dd>{agent.counts.active}</dd></div></dl>
      <dl className="mc-agent-card-statuses"><div><dt>Scheduled</dt><dd>{agent.counts.scheduled}</dd></div><div><dt>Drafts</dt><dd>{agent.counts.draft}</dd></div><div><dt>Completed</dt><dd>{agent.counts.completed}</dd></div></dl>
      <dl className={`mc-agent-coaching-stats${agent.work.length ? ' mc-agent-needs-support' : ''}`}><div><dt>Open enquiries</dt><dd>{model.enquiriesAvailable ? agent.entries.length : '—'}</dd></div><div><dt>Untouched</dt><dd>{count(agent.untouched)}</dd></div><div><dt>Overdue</dt><dd>{count(agent.overdue)}</dd></div></dl>
      <div className="mc-agent-card-channels">{agent.channels.length ? <><span className="mc-agent-card-platforms">{agent.channels.map((channel) => <span key={channel} title={CAMPAIGN_CHANNELS[channel]}><CampaignPlatformLogo channel={channel}/></span>)}</span><span>{agent.channels.length} planned {agent.channels.length === 1 ? 'channel' : 'channels'}</span></> : <span>No campaigns yet</span>}</div>
      <div className="mc-agent-card-open"><span>{agent.work.length ? `${agent.work.length} item${agent.work.length === 1 ? '' : 's'} to review` : 'View campaigns'}</span><ArrowRight size={17} aria-hidden="true"/></div>
    </button>)}</div> : <section className="mc-agent-group">
      <button type="button" className="mc-agent-back" onClick={() => setOwner('all')}><ArrowLeft size={16}/>All agents</button>
      <header><span className="mc-agent-avatar" aria-hidden="true">{model.ownerName(owner).slice(0, 1).toUpperCase()}</span><h3>{model.ownerName(owner)}</h3><span className="mc-pill">{selected?.plans.length || 0} total campaigns</span></header>
      {Boolean(selected?.work.length) && <section className="mc-agent-coaching" aria-label="Agent work to review"><h3>Work to review</h3><p>Enquiries follow the current CRM owner; campaign plans follow their creator.</p><ul>{selected.work.slice(0, 8).map((item) => <li key={item.id}><div><span>{item.label}</span><strong>{item.title}</strong><small>{item.detail} · {item.campaignName}</small></div><Link to={item.href}>{item.action}<ArrowRight size={14}/></Link></li>)}</ul>{selected.work.length > 8 && <p>{selected.work.length - 8} more items appear in the campaign workspaces.</p>}</section>}
      <div className="mc-campaign-list">{campaigns.map((campaign) => <div key={campaign.id} className="mc-agent-campaign-with-actions">{renderCampaign(campaign)}{reuseActions(campaign)}</div>)}</div>
      {!campaigns.length && <div className="mc-empty"><UsersRound size={30}/><h3>No matching agent campaigns</h3><p>{selected?.plans.length ? 'Try another status or search.' : 'This agent has no campaigns yet.'}</p></div>}
    </section>}
    {owner === 'all' && !filteredAgents.length && !directory.loading && !(directory.error && !model.agents.length) && <div className="mc-empty"><UsersRound size={30}/><h3>No matching agents</h3><p>Try another coaching focus, status or search.</p></div>}
    <section className="mc-agent-reuse" aria-labelledby="mc-agent-reuse-heading"><header><div><h3 id="mc-agent-reuse-heading">Campaigns to reuse</h3><p>Compare recorded enquiries or engagement within one channel.</p></div><label>Compare by<select aria-label="Compare reusable campaigns by" value={basis} onChange={(event) => setBasis(event.target.value)}>{Object.entries(reuseLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label></header>
      {candidates.length ? <ol>{candidates.slice(0, 5).map((row) => <li key={row.campaign.id}><div className="mc-agent-reuse-result"><Link to={model.workUrl(row.campaign.id, basis === 'enquiries' ? 'enquiries' : 'results')}>{row.campaign.name}</Link><span>{model.ownerName(row.campaign.created_by)}{row.campaign.area ? ` · ${row.campaign.area}` : ''}</span></div><div className="mc-agent-reuse-metric"><strong>{basis === 'enquiries' ? row.count : `${row.rate.toFixed(1)}%`}</strong><span>{basis === 'enquiries' ? 'recorded enquiries' : `${row.count} ${basis === 'email' ? 'clicks' : 'reads'} / ${row.delivered} delivered`}</span></div>{reuseActions(row.campaign)}</li>)}</ol> : <p className="mc-agent-reuse-empty">{basis === 'enquiries' ? model.enquiriesAvailable ? 'Record campaign enquiries to find plans worth repeating.' : 'Enquiry comparisons are unavailable until the CRM source can be loaded.' : 'A comparison needs complete results from at least 20 delivered messages and recorded engagement in this channel.'}</p>}
      <p className="mc-agent-reuse-note">Email clicks and WhatsApp reads measure different actions. Only campaigns, enquiries and results available to your account are shown.</p>
    </section>
    {copy && <CampaignCopyDialog key={copy.id} organisationId={organisationId} source={copy} members={directory.members} onClose={() => setCopy(null)} onCopied={(saved) => { setCopy(null); onCopied?.(saved) }} />}
  </section>
}
