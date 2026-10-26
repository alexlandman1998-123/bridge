import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowRight, CalendarDays, Check, ClipboardList, RefreshCw, UsersRound } from 'lucide-react'
import { MarketingLink as Link } from './MarketingNavigation.jsx'
import { AGENCY_CRM_UPDATED_EVENT, getAgencyCrmUpdateDetail } from '../../lib/agencyCrmUpdateBus'
import { loadCampaignOverviewEnquiries } from '../../services/campaignEnquiryService'
import { ATTENTION_FILTERS, buildCampaignAttention } from '../../services/campaignAttentionModel'
import './CampaignAttention.css'

const icons = { enquiries: UsersRound, drafts: ClipboardList, delivery: AlertCircle, upcoming: CalendarDays }
const dateLabel = (item) => item.timestamp
  ? new Date(item.timestamp).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : item.date ? new Date(`${item.date}T12:00:00Z`).toLocaleDateString('en-ZA', { timeZone: 'UTC', day: 'numeric', month: 'short' }) : ''

function AttentionQueue({ organisationId, workspace, campaignId, onRefresh, refreshing = false }) {
  const [state, setState] = useState({ entries: [], warnings: [], loading: true, error: '' })
  const [now, setNow] = useState(() => new Date())
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(false)
  const generation = useRef(0)
  const invalidate = useCallback(() => { generation.current++ }, [])
  const campaignIdsKey = JSON.stringify(workspace.campaigns.filter((row) => !campaignId || row.id === campaignId).map((row) => row.id).sort())
  const load = useCallback(async () => {
    const request = ++generation.current
    setNow(new Date())
    setState({ entries: [], warnings: [], loading: true, error: '' })
    try {
      const data = await loadCampaignOverviewEnquiries({ organisationId, campaignIds: JSON.parse(campaignIdsKey), userId: workspace.userId, canManage: workspace.canManage })
      if (request === generation.current) setState({ ...data, loading: false, error: '' })
    } catch (error) {
      if (request === generation.current) setState({ entries: [], warnings: [], loading: false, error: error.message || 'Campaign enquiries could not be loaded.' })
    }
  }, [organisationId, campaignIdsKey, workspace.userId, workspace.canManage])
  // A workspace refresh updates channel records and then refreshes the CRM queue.
  // Clear previous CRM counts while synchronising with the external data source.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); return invalidate }, [load, workspace, invalidate])
  useEffect(() => {
    const changed = (event) => {
      const detail = getAgencyCrmUpdateDetail(event)
      if (detail.organisationId === organisationId) void load()
    }
    const focused = () => setNow(new Date())
    window.addEventListener(AGENCY_CRM_UPDATED_EVENT, changed)
    window.addEventListener('focus', focused)
    return () => { window.removeEventListener(AGENCY_CRM_UPDATED_EVENT, changed); window.removeEventListener('focus', focused) }
  }, [load, organisationId])
  const model = buildCampaignAttention(workspace, state, { campaignId, now })
  const actionable = model.items.filter((item) => item.category !== 'upcoming').length
  const upcoming = model.items.filter((item) => item.category === 'upcoming').length
  const partial = !model.enquiriesAvailable || model.warnings.length > 0
  const channelsPartial = Boolean(workspace.channels?.email?.error || workspace.channels?.whatsapp?.error)
  const filtered = model.items.filter((item) => filter === 'all' || item.category === filter)
  const visible = expanded ? filtered : filtered.slice(0, 6)
  async function refresh() {
    if (onRefresh) await onRefresh()
    else await load()
  }
  return <section className="mc-attention" aria-label="Campaign work queue" aria-busy={state.loading || refreshing}>
    <header className="mc-attention-header">
      <div className="mc-attention-title"><span className="mc-attention-mark"><ClipboardList size={23} aria-hidden="true" /></span><div><h2>Needs attention <span>{actionable}{partial ? '+' : ''}</span></h2><p>{campaignId ? 'Your next actions for this campaign' : 'Your next actions across campaigns'}</p></div></div>
      <div className="mc-attention-header-actions"><span><CalendarDays size={17} aria-hidden="true" /><strong>{upcoming}{channelsPartial ? '+' : ''}</strong> in the next 7 days</span><button type="button" onClick={() => void refresh()} disabled={state.loading || refreshing} aria-label="Refresh campaign work"><RefreshCw size={16} className={state.loading || refreshing ? 'mc-attention-spinning' : ''} /></button></div>
    </header>
    <div className="mc-attention-filters" role="group" aria-label="Filter campaign work">
      {Object.entries(ATTENTION_FILTERS).map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => { setFilter(key); setExpanded(false) }}>{label}<span>{key === 'enquiries' && !model.enquiriesAvailable ? '—' : model.items.filter((item) => key === 'all' || item.category === key).length}{(key === 'all' && partial) || (channelsPartial && ['drafts', 'delivery', 'upcoming'].includes(key)) ? '+' : ''}</span></button>)}
    </div>
    {(state.loading || state.error || model.warnings.length > 0) && <div className="mc-attention-source-status" role="status">{state.loading ? 'Checking campaign enquiries…' : <>{state.error && <p>{state.error} Drafts and scheduled activity remain available.</p>}{model.warnings.map((warning) => <p key={warning}>{warning}</p>)}</>}</div>}
    {visible.length ? <ul className="mc-attention-list">{visible.map((item) => {
      const Icon = icons[item.category]
      return <li key={item.id} className={`mc-attention-row mc-attention-${item.category}${item.priority === 0 ? ' mc-attention-urgent' : ''}`}>
        <span className="mc-attention-icon"><Icon size={19} aria-hidden="true" /></span>
        <div className="mc-attention-copy"><span className="mc-attention-label">{item.label}</span><h3>{item.title}</h3><p>{item.detail}</p><div className="mc-attention-context"><span>{item.campaignName}{item.campaignNames?.length > 1 ? ` +${item.campaignNames.length - 1} campaign${item.campaignNames.length > 2 ? 's' : ''}` : ''}</span>{item.owner && <span><UsersRound size={12} aria-hidden="true" />{item.owner}</span>}{item.channel && <span>{item.channel === 'email' ? 'Email' : 'WhatsApp'}</span>}</div></div>
        <div className="mc-attention-row-action">{item.date && <time dateTime={item.timestamp || item.date}>{dateLabel(item)}{item.timestamp && <small>SAST</small>}</time>}<Link to={item.href} aria-label={`${item.action}: ${item.title}`}>{item.action}<ArrowRight size={15} aria-hidden="true" /></Link></div>
      </li>
    })}</ul> : !state.loading && <div className="mc-attention-empty"><Check size={24} aria-hidden="true" /><div><h3>{partial ? 'No items in the available activity' : filter === 'all' ? 'You’re up to date' : 'Nothing here needs your attention'}</h3><p>{partial ? 'Some sources still need checking. Refresh to try again.' : filter === 'upcoming' ? 'No campaign starts or linked sends scheduled in the next 7 days.' : 'New work will appear here as your campaigns progress.'}</p></div></div>}
    {filtered.length > 6 && <footer className="mc-attention-footer"><span>Showing {visible.length} of {filtered.length} items</span><button type="button" onClick={() => setExpanded((old) => !old)}>{expanded ? 'Show fewer' : 'Show all work'}<ArrowRight size={14} /></button></footer>}
  </section>
}

export default function CampaignAttention(props) {
  return <AttentionQueue key={`${props.organisationId}:${props.campaignId || 'all'}`} {...props} />
}
