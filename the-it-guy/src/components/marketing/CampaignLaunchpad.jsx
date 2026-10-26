import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, CalendarDays, Check, HeartHandshake, Home, Mail, MessageCircle, RefreshCw, Sparkles, Star, Target, TrendingDown, UsersRound, X } from 'lucide-react'
import { MarketingLink as Link } from './MarketingNavigation.jsx'
import { loadCampaignOpportunities } from '../../services/campaignOpportunityService'
import { campaignOpportunityHref } from '../../services/campaignOpportunityModel'
import { BUSINESS_CAMPAIGN_GOALS, businessCampaignHref } from './campaignBusinessGoals'
import './CampaignLaunchpad.css'

const recipes = [
  { id: 'new_listing', title: 'Introduce a property', label: 'New listing', detail: 'A fresh listing. The right first impression.', icon: Home },
  { id: 'price_reduction', title: 'Share a new price', label: 'Price reduction', detail: 'A verified change. A reason to reconnect.', icon: TrendingDown },
  { id: 'show_day', title: 'Bring buyers through', label: 'Show day', detail: 'An invitation worth opening.', icon: CalendarDays },
]
const goalIcons = { sellers: Target, buyers: UsersRound, brand: Sparkles, nurture: HeartHandshake, advocacy: Star, property: Home }
const emailHref = (objective) => `/marketing?${new URLSearchParams({ section: 'email', view: 'create', ai: '1', objective })}`
const recordedTime = (value) => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  : ''
const money = (value) => typeof value === 'string' ? value : Number(value) > 0 ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(value) : ''

function Opportunity({ item, onDismiss }) {
  const [failedImage, setFailedImage] = useState(false)
  const recipeKey = { 'new-listing': 'new_listing', 'price-reduced': 'price_reduction', 'show-day': 'show_day' }[item.recipe] || item.recipe
  const recipe = recipes.find((recipe) => recipe.id === recipeKey)
  return <article className="cl-opportunity">
    <div className="cl-property-image">
      {item.coverUrl && !failedImage ? <img src={item.coverUrl} alt={item.title} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedImage(true)} /> : <div className="cl-property-placeholder"><Home size={30} strokeWidth={1.2} aria-hidden="true" /><span>{item.area || 'Your agency listing'}</span></div>}
      <span className="cl-property-recipe">{recipe?.label || 'Campaign opportunity'}</span>
      <button type="button" className="cl-dismiss" onClick={() => onDismiss(item.id)} aria-label={`Dismiss suggestion: ${item.title}`} title="Dismiss on this browser"><X size={15} /></button>
    </div>
    <div className="cl-opportunity-copy"><span className="cl-property-area">{item.area || 'Area not recorded'}</span><h3>{item.title}</h3>{money(item.price) && <strong className="cl-property-price">{money(item.price)}</strong>}<p>{item.reason}</p>
      <details className="cl-evidence"><summary>Why this suggestion?</summary><p>{item.sourceLabel}</p>{item.evidence?.map((evidence, index) => <p key={`${evidence.label}:${index}`}><strong>{evidence.label}:</strong> {evidence.value}{recordedTime(evidence.recordedAt) && ` · ${recordedTime(evidence.recordedAt)} SAST`}</p>)}<p>Based on records available to you in Arch9.</p></details>
      <Link to={campaignOpportunityHref({ ...item, recipe: { new_listing: 'new-listing', price_reduction: 'price-reduced', show_day: 'show-day' }[item.recipe] || item.recipe }, { ai: true })}>{item.actionLabel || 'Prepare campaign'}<ArrowRight size={16} aria-hidden="true" /></Link>
    </div>
  </article>
}

export default function CampaignLaunchpad({ organisationId, workspace, onBrowseStudio, refreshedAt }) {
  const [selectedGoalId, setSelectedGoalId] = useState('seller-growth')
  const planRef = useRef(null)
  function chooseGoal(id) {
    setSelectedGoalId(id)
    if (window.innerWidth <= 700) requestAnimationFrame(() => {
      planRef.current?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
      planRef.current?.focus({ preventScroll: true })
    })
  }
  const selectedGoal = BUSINESS_CAMPAIGN_GOALS.find((goal) => goal.id === selectedGoalId) || BUSINESS_CAMPAIGN_GOALS[0]
  const storageKey = `arch9:campaign-opportunities:${organisationId}:${workspace.userId}`
  const [dismissed, setDismissed] = useState(() => {
    try { const value = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(value) ? value.filter((id) => typeof id === 'string').slice(-100) : [] } catch { return [] }
  })
  const [state, setState] = useState({ loading: true, items: [], warnings: [], checkedAt: null, error: '', sourceWorkspace: null })
  const request = useRef(0)
  const load = useCallback(async () => {
    const token = ++request.current
    try {
      const data = await loadCampaignOpportunities(organisationId, workspace.userId, { campaigns: workspace.campaigns, emailCampaigns: workspace.channels?.email?.data || [], emailCampaignsAvailable: !workspace.channels?.email?.error })
      if (token === request.current) setState({ ...data, loading: false, error: '', sourceWorkspace: workspace })
    } catch (error) {
      if (token === request.current) setState({ loading: false, items: [], warnings: [], checkedAt: null, error: error.message || 'Property suggestions could not be checked.', sourceWorkspace: workspace })
    }
  }, [organisationId, workspace])
  useEffect(() => { const generation = request; void load(); return () => { generation.current++ } }, [load, refreshedAt])
  const loading = state.loading || state.sourceWorkspace !== workspace
  const error = state.sourceWorkspace === workspace ? state.error : ''
  function refresh() { setState((old) => ({ ...old, loading: true, error: '' })); void load() }
  function dismiss(ids) {
    setDismissed(ids)
    try { localStorage.setItem(storageKey, JSON.stringify(ids.slice(-100))) } catch { /* Suggestions remain dismissible for this visit. */ }
  }
  const drafts = [
    ...workspace.campaigns.filter((campaign) => campaign.status === 'draft').map((campaign) => ({ ...campaign, resumeHref: `?section=campaigns&view=detail&id=${encodeURIComponent(campaign.id)}&tab=playbook` })),
    ...(workspace.channels?.email?.data || []).filter((campaign) => campaign.status === 'draft').map((campaign) => ({ ...campaign, objective: campaign.subject || 'Continue composing your saved email', area: 'Email draft', resumeHref: `?section=email&view=create&id=${encodeURIComponent(campaign.id)}&ai=1` })),
  ].sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))
  const recent = drafts[0]
  const visible = state.items.filter((item) => !dismissed.includes(item.id)).slice(0, 3)
  return <div className="cl-launchpad">
    <section className="cl-hero" aria-labelledby="cl-hero-heading">
      <div className="cl-hero-copy"><span className="cl-eyebrow"><Sparkles size={14} aria-hidden="true" /> Your business, out in the world</span><h2 id="cl-hero-heading">Build the business.<br/><span>Keep the conversation going.</span></h2><p>Win seller conversations. Meet your next buyer. Stay close to past clients. Turn a business goal into branded marketing, a reviewed audience and a useful next step.</p><div className="cl-hero-actions"><Link className="mc-button mc-primary" to={businessCampaignHref('sellers')}><Target size={17} aria-hidden="true" />Win your next valuation<ArrowRight size={17} aria-hidden="true" /></Link><button type="button" className="cl-studio-link" onClick={onBrowseStudio}>Explore the studio<ArrowRight size={16} aria-hidden="true" /></button></div><ol className="cl-journey" aria-label="Your campaign journey">{['Choose your goal', 'Make it your brand', 'Review your audience', 'Publish & follow up'].map((label, index) => <li key={label}><span>{index + 1}</span>{label}</li>)}</ol></div>
      <aside className="cl-resume"><span className="cl-eyebrow">{recent ? 'Pick up where you left off' : 'Your next move'}</span><span className="cl-resume-icon"><Mail size={23} strokeWidth={1.4} aria-hidden="true" /></span><h3>{recent?.name || 'Start a useful conversation'}</h3><p>{recent?.objective || 'Choose a business goal below. Your saved agency identity and campaign tools do the groundwork.'}</p>{recent ? <><small>{recent.area || 'Agency campaign'}{recordedTime(recent.updated_at) ? ` · Edited ${recordedTime(recent.updated_at)} SAST` : ''}</small><Link to={recent.resumeHref}>Continue draft<ArrowRight size={16} aria-hidden="true" /></Link><span className="cl-resume-count">{drafts.length} {drafts.length === 1 ? 'draft' : 'drafts'} in your workspace</span></> : <span className="cl-manual-note"><Check size={15} aria-hidden="true" /> Manual editing always available</span>}</aside>
    </section>
    <section className="cl-business-goals" aria-labelledby="cl-goals-heading">
      <header className="cl-section-heading"><div><span className="cl-eyebrow">Start with the result you want</span><h2 id="cl-goals-heading">What would you like to grow?</h2><p>Choose a direction. Your agency identity, brand and channel tools stay connected.</p></div></header>
      <div className="cl-goal-grid" role="group" aria-label="Business goals">{BUSINESS_CAMPAIGN_GOALS.map((goal) => <button key={goal.id} type="button" className={`cl-goal-card${selectedGoalId === goal.id ? ' cl-goal-selected' : ''}`} aria-pressed={selectedGoalId === goal.id} onClick={() => chooseGoal(goal.id)}><span className="cl-goal-icon">{createElement(goalIcons[goal.icon], { size: 21, strokeWidth: 1.7, 'aria-hidden': true })}</span><span><strong>{goal.title}</strong><small>{goal.description}</small></span>{selectedGoalId === goal.id && <Check size={16} aria-hidden="true" />}</button>)}</div>
      <div className="cl-goal-plan" ref={planRef} role="region" tabIndex={-1} aria-label={`Plan: ${selectedGoal.title}`}>
        <div className="cl-goal-plan-intro"><span className="cl-eyebrow">Your next campaign</span><h3>{selectedGoal.title}</h3><p>{selectedGoal.outcome}</p><Link className="mc-button mc-primary" to={businessCampaignHref(selectedGoal.approaches[0].template, selectedGoal.id)}>{selectedGoal.action}<ArrowRight size={16} aria-hidden="true" /></Link><small><UsersRound size={14} aria-hidden="true" />{selectedGoal.audience}</small></div>
        <div className="cl-goal-approaches"><h4>Choose your approach</h4>{selectedGoal.approaches.map((approach) => <Link key={approach.template} to={businessCampaignHref(approach.template, selectedGoal.id)}><span><strong>{approach.title}</strong><small>{approach.detail}</small></span><ArrowRight size={16} aria-hidden="true" /></Link>)}</div>
        <p className="cl-goal-connection"><MessageCircle size={16} aria-hidden="true" /><span>One saved campaign holds your brief, branded assets, channel drafts, audience and recorded enquiries. You review each send or publishing handoff.</span></p>
      </div>
    </section>
    <section className="cl-property-shortcuts" aria-labelledby="cl-property-shortcuts-heading"><header className="cl-section-heading"><div><span className="cl-eyebrow">Have a property ready?</span><h2 id="cl-property-shortcuts-heading">Prepare a focused property email</h2><p>A quick route into your listing email studio.</p></div><Link className="cl-studio-link" to={emailHref('new_listing')}><Mail size={15} aria-hidden="true" />Create a property email<ArrowRight size={15} aria-hidden="true" /></Link></header><div className="cl-recipes" aria-label="What would you like to promote?">{recipes.map(({ id, title, label, detail, icon }) => <Link key={id} to={emailHref(id)} aria-label={`${label}: ${title}`}><span className={`cl-recipe-icon cl-recipe-${id}`}>{createElement(icon, { size: 21, strokeWidth: 1.6, 'aria-hidden': true })}</span><span><small>{label}</small><strong>{title}</strong><span>{detail}</span></span><ArrowRight size={17} aria-hidden="true" /></Link>)}</div></section>
    <section className="cl-opportunities" aria-labelledby="cl-opportunities-heading" aria-busy={loading}>
      <header className="cl-section-heading"><div><span className="cl-eyebrow">A useful place to start</span><h2 id="cl-opportunities-heading">Suggested for your agency</h2><p>Small opportunities, grounded in your saved records.</p></div><div className="cl-source-tools">{state.checkedAt && !loading && <small>Checked {recordedTime(state.checkedAt)} SAST</small>}<button type="button" onClick={refresh} disabled={loading} aria-label="Refresh property suggestions"><RefreshCw size={16} aria-hidden="true" /></button></div></header>
      {error && <div className="cl-source-message" role="alert"><p>{error}</p><button type="button" onClick={refresh}>Try again</button></div>}
      {!loading && state.warnings?.length > 0 && <div className="cl-source-message" role="status">{state.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
      {loading ? <div className="cl-opportunity-loading" role="status">Checking your visible listings and public show days…</div> : visible.length ? <div className="cl-opportunity-grid">{visible.map((item) => <Opportunity key={item.id} item={item} onDismiss={(id) => dismiss([...dismissed, id])} />)}</div> : !error && <div className="cl-no-opportunities"><Check size={20} aria-hidden="true" /><div><strong>{dismissed.length ? 'You’ve reviewed the available suggestions' : 'No new suggestions in the available records'}</strong><p>You can create a campaign at any time. Fresh suggestions appear when saved property evidence changes.</p></div></div>}
      {dismissed.length > 0 && <button type="button" className="cl-restore" onClick={() => dismiss([])}>Restore dismissed suggestions on this browser</button>}
    </section>
  </div>
}
