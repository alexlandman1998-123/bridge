import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  Infinity as InfinityIcon,
  LayoutGrid,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  Network,
  Plus,
  Search,
  Share2,
  Copy,
  Target,
  UsersRound,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_GOALS,
  CAMPAIGN_STATUSES,
  channelProgress,
  linkedActivities,
  linkMarketingActivity,
  loadMarketingCampaigns,
  saveMarketingCampaign,
  unlinkMarketingActivity,
} from '../../services/marketingCampaignService'
import '../../pages/MarketingCampaigns.css'
import {
  campaignTemplates,
  displayTemplate,
  templateFromCampaign,
} from '../../services/marketingCampaignTemplates'
import {
  loadCampaignTemplates,
  saveCampaignTemplate,
} from '../../services/marketingCampaignTemplateService'
import CampaignTemplateLibrary from './CampaignTemplateLibrary'
import { campaignShopTemplates } from '../../services/marketingCampaignCatalogue'
import PlatformLogo from './CampaignPlatformLogo'
import CampaignTemplatePreview from './CampaignTemplatePreview'
import CampaignAnalytics from './CampaignAnalytics'
import CampaignSetup from './CampaignSetup'
import CurrentCampaigns from './CurrentCampaigns'
import CampaignSummaryCards from './CampaignSummaryCards'
import { PROPERTY_CAMPAIGNS } from '../../services/listingCampaignContract'
import { GENERAL_CAMPAIGNS } from '../../services/generalCampaignModel'
const GeneralCampaignBuilder = lazy(() => import('./GeneralCampaignBuilder'))
const ListingCampaignBuilder = lazy(() => import('./ListingCampaignBuilder'))
const CampaignAssets = lazy(() => import('./CampaignAssets'))
const JustListedCampaignBuilder = lazy(
  () => import('./JustListedCampaignBuilder'),
)

const icons = {
  email: Mail,
  whatsapp: MessageCircle,
  meta: Network,
  social: Share2,
}
const runMode = (campaign) =>
  campaign.end_date ? 'bounded' : campaign.start_date ? 'ongoing' : 'undecided'
const runLabels = {
  bounded: 'Time-bound',
  ongoing: 'Ongoing',
  undecided: 'Dates to confirm',
}
function dateAfter(days, from) {
  const value = from ? new Date(`${from}T12:00:00`) : new Date()
  value.setDate(value.getDate() + days)
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}
const tabs = {
  overview: 'Overview',
  audience: 'Audience & offer',
  activity: 'Channel activity',
  assets: 'Assets & drafts',
  results: 'Results',
}
const date = (value) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : ''
const period = (campaign) =>
  campaign.start_date
    ? `${date(campaign.start_date)}${campaign.end_date ? ` – ${date(campaign.end_date)}` : ' onwards'}`
    : campaign.end_date
      ? `Until ${date(campaign.end_date)}`
      : 'Dates to be confirmed'
const channelUrl = (channel, id) =>
  `/marketing?section=${channel}&view=detail&id=${encodeURIComponent(id)}`
function Status({ value }) {
  return (
    <span className={`mc-status mc-status-${value}`}>
      {CAMPAIGN_STATUSES[value] || value}
    </span>
  )
}
function Cover({ url }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="mc-cover">
      {url && !failed ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <Megaphone size={27} aria-hidden="true" />
      )}
    </div>
  )
}
function Channel({ channel, progress }) {
  const Icon = icons[channel]
  return (
    <span className={`mc-channel mc-channel-${channel}`}>
      <Icon size={15} aria-hidden="true" />
      <strong>{CAMPAIGN_CHANNELS[channel]}</strong>
      <span>{progress}</span>
    </span>
  )
}
function Empty({ title, children }) {
  return (
    <div className="mc-empty">
      <Target size={30} aria-hidden="true" />
      <h2>{title}</h2>
      {children}
    </div>
  )
}

function CampaignForm({
  campaign,
  template,
  templateMode = false,
  canShare = false,
  visibilityLocked = false,
  onSave,
  onCancel,
}) {
  const [mode, setMode] = useState(() =>
    campaign ? runMode(campaign) : template?.mode || 'bounded',
  )
  const [form, setForm] = useState(
    () =>
      campaign || {
        id: crypto.randomUUID(),
        name: template?.name || '',
        goal: template?.goal || 'seller_leads',
        objective: template?.objective || CAMPAIGN_GOALS.seller_leads,
        audience: template?.audience || '',
        offer: template?.offer || '',
        area: template?.area || '',
        start_date: dateAfter(0),
        end_date:
          template?.mode === 'ongoing'
            ? ''
            : dateAfter(template?.duration_days || 30),
        status: 'draft',
        planned_channels: template?.channels || ['email'],
        cover_url: template?.cover_url || '',
        visibility: template?.visibility || 'personal',
        duration_days: template?.duration_days || 30,
        ...(template?.channel_content
          ? { channel_content: structuredClone(template.channel_content) }
          : {}),
      },
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const field = (key) => ({
    value: form[key] || '',
    onChange: (event) =>
      setForm((previous) => ({ ...previous, [key]: event.target.value })),
  })
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onSave(templateMode ? { ...form, mode } : form)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <form className="mc-form mc-panel" onSubmit={submit}>
      <div className="mc-section-heading">
        <Target size={21} />
        <div>
          <h2>
            {templateMode
              ? 'Design your campaign template'
              : campaign
                ? 'Edit campaign'
                : 'Start with a clear goal'}
          </h2>
          <p>
            Bring your audience, offer and channels together in one campaign.
          </p>
        </div>
      </div>
      <fieldset disabled={busy}>
        <div className="mc-fields">
          <label className="mc-span">
            How should this campaign run?
            <select
              value={mode}
              onChange={(event) => {
                const next = event.target.value
                setMode(next)
                setForm((previous) => ({
                  ...previous,
                  start_date:
                    next === 'undecided'
                      ? ''
                      : previous.start_date || dateAfter(0),
                  end_date:
                    next === 'bounded'
                      ? previous.end_date || dateAfter(30, previous.start_date)
                      : '',
                }))
              }}
            >
              <option value="bounded">
                Time-bound — work towards an end date
              </option>
              <option value="ongoing">
                Ongoing — continue without an end date
              </option>
              {campaign && !templateMode && (
                <option value="undecided">Dates to confirm</option>
              )}
            </select>
          </label>
          <label className="mc-span">
            {templateMode ? 'Template name' : 'Campaign name'}
            <input
              required
              maxLength={120}
              placeholder="e.g. Summer seller valuations"
              {...field('name')}
            />
          </label>
          <label>
            Goal
            <select
              value={form.goal}
              onChange={(event) => {
                const goal = event.target.value
                setForm((previous) => ({
                  ...previous,
                  goal,
                  objective: Object.values(CAMPAIGN_GOALS).includes(
                    previous.objective,
                  )
                    ? CAMPAIGN_GOALS[goal]
                    : previous.objective,
                }))
              }}
            >
              {Object.entries(CAMPAIGN_GOALS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Area
            <input
              maxLength={120}
              placeholder="e.g. Southern Suburbs"
              {...field('area')}
            />
          </label>
          <label className="mc-span">
            Objective
            <input
              required
              maxLength={240}
              placeholder="What do you want this campaign to achieve?"
              {...field('objective')}
            />
          </label>
          <label>
            Audience
            <textarea
              rows={3}
              maxLength={600}
              placeholder="Who are you trying to reach?"
              {...field('audience')}
            />
          </label>
          <label>
            Offer
            <textarea
              rows={3}
              maxLength={600}
              placeholder="What will encourage them to respond?"
              {...field('offer')}
            />
          </label>
          {!templateMode && (
            <label className="mc-span">
              Planned budget (ZAR)
              <input
                type="number"
                aria-label="Planned budget (ZAR)"
                aria-describedby="mc-budget-help"
                min="0"
                max="9999999999.99"
                step="0.01"
                value={form.planned_budget ?? ''}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    planned_budget: event.target.value,
                    budget_currency: 'ZAR',
                  }))
                }
                placeholder="Optional planned amount"
              />
              <small id="mc-budget-help">
                Manually entered plan. Spend and remaining budget need a
                connected spending source.
              </small>
            </label>
          )}
          {templateMode ? (
            <>
              <label>
                Who can use this template?
                <select disabled={visibilityLocked} {...field('visibility')}>
                  <option value="personal">Only me</option>
                  {canShare && (
                    <option value="agency">Everyone in this agency</option>
                  )}
                </select>
              </label>
              {mode === 'bounded' && (
                <label>
                  Campaign duration (days)
                  <input
                    type="number"
                    min="1"
                    max="366"
                    required
                    {...field('duration_days')}
                  />
                </label>
              )}
            </>
          ) : (
            <>
              {' '}
              <label>
                Start date
                <input
                  type="date"
                  required={mode !== 'undecided'}
                  disabled={mode === 'undecided'}
                  {...field('start_date')}
                />
              </label>
              {mode === 'bounded' && (
                <label>
                  End date
                  <input
                    type="date"
                    required
                    min={form.start_date || undefined}
                    {...field('end_date')}
                  />
                </label>
              )}
            </>
          )}
          {campaign && !templateMode && (
            <label>
              Plan status
              <select {...field('status')}>
                {Object.entries(CAMPAIGN_STATUSES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="mc-span">
            Cover image URL <span className="mc-optional">Optional</span>
            <input
              type="url"
              maxLength={2048}
              placeholder="https://…"
              {...field('cover_url')}
            />
          </label>
        </div>
        <div className="mc-channel-field">
          <h3>Channels</h3>
          <div className="mc-channel-options">
            {Object.entries(CAMPAIGN_CHANNELS).map(([key, label]) => {
              const Icon = icons[key]
              return (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={form.planned_channels.includes(key)}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        channel_content: previous.channel_content
                          ? Object.fromEntries(
                              Object.entries(previous.channel_content).filter(
                                ([channel]) =>
                                  event.target.checked || channel !== key,
                              ),
                            )
                          : undefined,
                        planned_channels: event.target.checked
                          ? [...previous.planned_channels, key]
                          : previous.planned_channels.filter(
                              (channel) => channel !== key,
                            ),
                      }))
                    }
                  />
                  <Icon size={18} />
                  {label}
                  {['meta', 'social'].includes(key) && (
                    <small>Planning only</small>
                  )}
                </label>
              )
            })}
          </div>
        </div>
        <section
          className="mc-content-drafts"
          aria-labelledby="mc-drafts-heading"
        >
          <h3 id="mc-drafts-heading">Channel draft content</h3>
          <p className="mc-note">
            Optional copy and suggested timing for each tool. Replace
            placeholders before using it. This content is a draft; it does not
            create or schedule a send.
          </p>
          {form.planned_channels.map((channel) => (
            <details
              key={channel}
              className="mc-draft-editor"
              open={!!form.channel_content?.[channel]?.body || undefined}
            >
              <summary>{CAMPAIGN_CHANNELS[channel]} draft</summary>
              <div className="mc-fields">
                {[
                  ['title', 'Headline or subject', 240],
                  ['body', 'Draft message', 12000],
                  ['timing', 'Suggested timing', 240],
                ].map(([key, label, limit]) => (
                  <label key={key} className="mc-span">
                    {CAMPAIGN_CHANNELS[channel]} {label.toLowerCase()}
                    {key === 'body' ? (
                      <textarea
                        rows={5}
                        maxLength={limit}
                        value={form.channel_content?.[channel]?.[key] || ''}
                        onChange={(event) =>
                          setForm((previous) => ({
                            ...previous,
                            channel_content: {
                              ...previous.channel_content,
                              [channel]: {
                                ...previous.channel_content?.[channel],
                                [key]: event.target.value,
                              },
                            },
                          }))
                        }
                      />
                    ) : (
                      <input
                        maxLength={limit}
                        value={form.channel_content?.[channel]?.[key] || ''}
                        onChange={(event) =>
                          setForm((previous) => ({
                            ...previous,
                            channel_content: {
                              ...previous.channel_content,
                              [channel]: {
                                ...previous.channel_content?.[channel],
                                [key]: event.target.value,
                              },
                            },
                          }))
                        }
                      />
                    )}
                  </label>
                ))}
              </div>
            </details>
          ))}
        </section>
        <p className="mc-note">
          {mode === 'ongoing' &&
            'This plan has no end date. Recurring schedules and birthday triggers are not automated yet. '}
          Saving a plan or changing its status does not schedule or send
          messages. Each channel keeps its own sending controls.
        </p>
        {error && (
          <p role="alert" className="mc-error">
            {error}
          </p>
        )}
        <footer className="mc-form-actions">
          <button className="mc-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="mc-button mc-primary" type="submit">
            {busy
              ? 'Saving…'
              : templateMode
                ? 'Save template'
                : campaign
                  ? 'Save changes'
                  : 'Create campaign'}
          </button>
        </footer>
      </fieldset>
    </form>
  )
}

function ActivityPanel({ campaign, workspace, canEdit, onLink, onUnlink }) {
  const [selected, setSelected] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function act(callback) {
    setBusy(true)
    setError('')
    try {
      await callback()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mc-activity-stack">
      {error && (
        <p className="mc-error" role="alert">
          {error}
        </p>
      )}
      {campaign.planned_channels.map((channel) => {
        const Icon = icons[channel]
        const links = linkedActivities(workspace, campaign, channel)
        const assigned = new Set(
          workspace.activities
            .filter((link) => link.channel === channel)
            .map((link) => link[`${channel}_campaign_id`]),
        )
        const options = (workspace.channels[channel]?.data || []).filter(
          (activity) => !assigned.has(activity.id),
        )
        return (
          <section className="mc-panel" key={channel}>
            <div className="mc-channel-heading">
              <div>
                <Icon size={21} />
                <h2>{CAMPAIGN_CHANNELS[channel]}</h2>
              </div>
              <span className="mc-pill">
                {channelProgress(workspace, campaign, channel)}
              </span>
            </div>
            {campaign.channel_content?.[channel] && (
              <div className="mc-channel-draft">
                <h3>
                  {campaign.channel_content[channel].title || 'Draft content'}
                </h3>
                <p>{campaign.channel_content[channel].body}</p>
                {campaign.channel_content[channel].timing && (
                  <small>
                    Suggested timing: {campaign.channel_content[channel].timing}
                  </small>
                )}
                <p className="mc-note">
                  Review this draft in the channel tool before sending or
                  publishing.
                </p>
              </div>
            )}
            {['meta', 'social'].includes(channel) ? (
              <p className="mc-note">
                {channel === 'social'
                  ? 'Organic social is included in this plan. Use the draft content in your social publishing tool; posting is not connected yet.'
                  : 'Meta is included in this campaign plan. Publishing and linking Meta ads will be added later.'}
              </p>
            ) : (
              <>
                {workspace.channels[channel]?.error && (
                  <p role="status" className="mc-note">
                    {CAMPAIGN_CHANNELS[channel]} activity is currently
                    unavailable. Refresh to try again.
                  </p>
                )}
                {!links.length && (
                  <p className="mc-note">
                    No {CAMPAIGN_CHANNELS[channel]} activity linked yet.
                  </p>
                )}
                {links.map(({ link, activity }) => (
                  <div className="mc-activity-row" key={link.id}>
                    <div>
                      <strong>
                        {activity?.name || 'Activity unavailable'}
                      </strong>
                      <span>
                        {activity
                          ? (
                              activity.display_status || activity.status
                            ).replaceAll('_', ' ')
                          : 'This activity is not available under your channel permissions.'}
                      </span>
                    </div>
                    <div>
                      {activity && (
                        <Link
                          className="mc-button"
                          to={channelUrl(channel, activity.id)}
                        >
                          Open <ArrowRight size={14} />
                        </Link>
                      )}
                      {canEdit && (
                        <button
                          className="mc-text-button"
                          disabled={busy}
                          onClick={() => act(() => onUnlink(link.id))}
                        >
                          Unlink
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {canEdit && !workspace.channels[channel]?.error && (
                  <div className="mc-link-activity">
                    <label htmlFor={`mc-link-${channel}`}>
                      Link existing {CAMPAIGN_CHANNELS[channel]} campaign
                      <select
                        id={`mc-link-${channel}`}
                        disabled={busy}
                        value={selected[channel] || ''}
                        onChange={(event) =>
                          setSelected((previous) => ({
                            ...previous,
                            [channel]: event.target.value,
                          }))
                        }
                      >
                        <option value="">
                          {options.length
                            ? 'Choose channel activity'
                            : 'No unlinked activity available'}
                        </option>
                        {options.map((activity) => (
                          <option key={activity.id} value={activity.id}>
                            {activity.name} ·{' '}
                            {(
                              activity.display_status || activity.status
                            ).replaceAll('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="mc-button"
                      disabled={
                        busy ||
                        !options.some(
                          (option) => option.id === selected[channel],
                        )
                      }
                      onClick={() =>
                        act(async () => {
                          await onLink(channel, selected[channel])
                          setSelected((previous) => ({
                            ...previous,
                            [channel]: '',
                          }))
                        })
                      }
                    >
                      <Plus size={16} />
                      Link activity
                    </button>
                    <Link
                      className="mc-text-button"
                      to={`/marketing?section=${channel}&view=create`}
                    >
                      Create in {CAMPAIGN_CHANNELS[channel]}{' '}
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                )}
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}
function Results({ workspace, campaign }) {
  return (
    <div className="mc-panel">
      <h2>Channel results</h2>
      <p className="mc-note">
        Recorded message activity from linked sends. Campaign lead attribution
        is not available yet.
      </p>
      {campaign.planned_channels
        .filter((channel) => !['meta', 'social'].includes(channel))
        .map((channel) => {
          const links = linkedActivities(workspace, campaign, channel)
          const unavailable =
            workspace.channels[channel]?.error ||
            workspace.channels[channel]?.metricsError ||
            links.some((row) => !row.activity)
          const measures =
            channel === 'email'
              ? { delivered: 'Delivered', opened: 'Opened', clicked: 'Clicked' }
              : { delivered: 'Delivered', read: 'Read', failed: 'Failed' }
          return (
            <section className="mc-result-section" key={channel}>
              <h3>{CAMPAIGN_CHANNELS[channel]}</h3>
              {!links.length ? (
                <p className="mc-note">Link activity to see results here.</p>
              ) : unavailable ? (
                <p className="mc-note">
                  Results are unavailable under your current connection or
                  permissions.
                </p>
              ) : (
                <div className="mc-result-grid">
                  {Object.entries(measures).map(([key, label]) => (
                    <div key={key}>
                      <span>{label}</span>
                      <strong>
                        {links.some((row) => row.activity[key] == null)
                          ? '—'
                          : links
                              .reduce(
                                (sum, row) => sum + Number(row.activity[key]),
                                0,
                              )
                              .toLocaleString()}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )
        })}
      {campaign.planned_channels.some((channel) =>
        ['meta', 'social'].includes(channel),
      ) && (
        <p className="mc-note">
          Meta and organic social results will appear once those tools can be
          connected.
        </p>
      )}
    </div>
  )
}
function Detail({
  campaign,
  workspace,
  tab,
  onTab,
  onEdit,
  onLink,
  onUnlink,
  canEdit,
  onSaveTemplate,
  onRefresh,
}) {
  return (
    <>
      <header className="mc-detail-heading">
        <div className="mc-detail-title">
          <Cover key={campaign.cover_url} url={campaign.cover_url} />
          <div>
            <div className="mc-eyebrow">{CAMPAIGN_GOALS[campaign.goal]}</div>
            <h1>{campaign.name}</h1>
            <Status value={campaign.status} />
          </div>
        </div>
        <div className="mc-heading-actions">
          <button className="mc-button" onClick={onSaveTemplate}>
            <Copy size={16} /> Save as template
          </button>
          {canEdit && (
            <button className="mc-button" onClick={onEdit}>
              Edit campaign
            </button>
          )}
        </div>
      </header>
      <nav className="mc-tabs" aria-label="Campaign sections">
        {Object.entries(tabs)
          .filter(([key]) => key !== 'assets' || campaign.listing_builder || campaign.campaign_builder)
          .map(([key, label]) => (
            <button
              key={key}
              aria-current={tab === key ? 'page' : undefined}
              onClick={() => onTab(key)}
            >
              {label}
            </button>
          ))}
      </nav>
      {tab === 'overview' && (
        <div className="mc-overview-grid">
          <section className="mc-panel">
            <div className="mc-section-heading">
              <Target size={21} />
              <h2>Campaign objective</h2>
            </div>
            <p className="mc-objective">{campaign.objective}</p>
            <dl className="mc-facts">
              <div>
                <dt>
                  <MapPin size={15} />
                  Area
                </dt>
                <dd>{campaign.area || 'Not specified'}</dd>
              </div>
              <div>
                <dt>
                  <CalendarDays size={15} />
                  Dates
                </dt>
                <dd>{period(campaign)}</dd>
              </div>
              <div>
                <dt>
                  <UsersRound size={15} />
                  Audience
                </dt>
                <dd>{campaign.audience || 'Not specified'}</dd>
              </div>
            </dl>
          </section>
          <section className="mc-panel">
            <h2>Channel progress</h2>
            <div className="mc-channel-summary">
              {campaign.planned_channels.map((channel) => (
                <Channel
                  key={channel}
                  channel={channel}
                  progress={channelProgress(workspace, campaign, channel)}
                />
              ))}
            </div>
            <button
              className="mc-text-button"
              onClick={() => onTab('activity')}
            >
              Manage channel activity <ArrowRight size={16} />
            </button>
            <p className="mc-note">
              Plan status is managed separately from individual sends.
            </p>
          </section>
        </div>
      )}
      {tab === 'audience' && (
        <div className="mc-overview-grid">
          <section className="mc-panel">
            <h2>Audience</h2>
            <p className="mc-objective">
              {campaign.audience || 'Describe who this campaign should reach.'}
            </p>
            <p className="mc-note">{campaign.area || 'No area specified'}</p>
          </section>
          <section className="mc-panel">
            <h2>Offer</h2>
            <p className="mc-objective">
              {campaign.offer ||
                'Add an offer that gives your audience a reason to respond.'}
            </p>
          </section>
        </div>
      )}
      {tab === 'activity' && (
        <ActivityPanel
          key={campaign.id}
          campaign={campaign}
          workspace={workspace}
          canEdit={canEdit}
          onLink={onLink}
          onUnlink={onUnlink}
        />
      )}
      {tab === 'assets' && (campaign.listing_builder || campaign.campaign_builder) && (
        <Suspense fallback={<p role="status">Opening campaign assets…</p>}>
          <CampaignAssets
            key={`${campaign.id}:${campaign.revision}`}
            campaign={campaign}
            organisationId={campaign.organisation_id}
            userId={workspace.userId}
            canEdit={canEdit}
            activities={workspace.activities}
            onEdit={onEdit}
            onLinked={onRefresh}
          />
        </Suspense>
      )}
      {tab === 'results' && (
        <Results workspace={workspace} campaign={campaign} />
      )}
    </>
  )
}

function CampaignDashboardCard({ campaign, workspace, filter }) {
  const mode = runMode(campaign)
  const activity = campaign.planned_channels.flatMap((channel) =>
    linkedActivities(workspace, campaign, channel),
  )
  const available = activity
    .filter((item) => item.activity)
    .map((item) => item.activity)
  const upcoming = available
    .filter((item) => item.status === 'scheduled' && item.scheduled_for)
    .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))[0]
  const attention = campaign.planned_channels.some((channel) =>
    ['Needs attention', 'Unavailable'].includes(
      channelProgress(workspace, campaign, channel),
    ),
  )
  const target = `?section=campaigns&view=detail&id=${campaign.id}${filter !== 'all' ? `&filter=${filter}` : ''}`
  return (
    <article className="mc-campaign-card">
      <div className="mc-card-top">
        <div className="mc-card-badges">
          <Status value={campaign.status} />
          <span className="mc-pill">
            {mode === 'ongoing' ? (
              <InfinityIcon size={14} />
            ) : (
              <CalendarDays size={14} />
            )}
            {runLabels[mode]}
          </span>
        </div>
      </div>
      <div className="mc-dashboard-title">
        <Cover key={campaign.cover_url} url={campaign.cover_url} />
        <div>
          <h2>
            <Link to={target}>{campaign.name}</Link>
          </h2>
          <p>
            {CAMPAIGN_GOALS[campaign.goal]}
            {campaign.area ? ` · ${campaign.area}` : ''}
          </p>
        </div>
      </div>
      <p className="mc-card-objective">{campaign.objective}</p>
      <div className="mc-dashboard-metrics">
        <div>
          <strong>{available.length}</strong>
          <span>Linked activities</span>
        </div>
        <div>
          <strong>{campaign.planned_channels.length}</strong>
          <span>Planned channels</span>
        </div>
        <div className="mc-dashboard-period">
          <CalendarDays size={16} />
          <span>{period(campaign)}</span>
        </div>
      </div>
      <div className="mc-dashboard-channels">
        {campaign.planned_channels.map((channel) => {
          const links = linkedActivities(workspace, campaign, channel)
          return (
            <Link
              key={channel}
              to={`${target}&tab=activity`}
              className="mc-dashboard-channel"
            >
              <PlatformLogo channel={channel} />
              <strong>{CAMPAIGN_CHANNELS[channel]}</strong>
              <span>
                {['meta', 'social'].includes(channel)
                  ? 'Planning only'
                  : links.length
                    ? `${links.length} linked ${links.length === 1 ? 'activity' : 'activities'}`
                    : 'No activity linked'}
              </span>
              <span className="mc-pill">
                {channelProgress(workspace, campaign, channel)}
              </span>
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          )
        })}
      </div>
      <div className="mc-dashboard-next">
        <Clock3 size={16} aria-hidden="true" />
        <span>
          {attention
            ? 'Channel activity needs attention'
            : upcoming
              ? `Next: ${upcoming.name} · ${new Date(upcoming.scheduled_for).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
              : available.length
                ? 'Open channel activity to review your plan'
                : 'Link channel activity to put your plan in motion'}
        </span>
      </div>
      <Link className="mc-card-open" to={target}>
        Open campaign <ArrowRight size={17} />
      </Link>
    </article>
  )
}

export default function MarketingCampaigns() {
  const { currentWorkspace, currentMembership } = useWorkspace()
  const organisationId =
    currentWorkspace?.organisationId ||
    currentWorkspace?.organisation_id ||
    currentWorkspace?.raw?.organisation_id ||
    currentMembership?.organisationId ||
    currentMembership?.organisation_id ||
    currentWorkspace?.id ||
    ''
  // Remount all form and mutation state when the agency changes.
  return (
    <CampaignWorkspace key={organisationId} organisationId={organisationId} />
  )
}
function CampaignWorkspace({ organisationId }) {
  const [params, setParams] = useSearchParams()
  const [state, setState] = useState({ loading: true, data: null, error: '' })
  const [search, setSearch] = useState('')
  const [modeFilter, setModeFilter] = useState('all')
  const templatesRef = useRef(null)
  const templateGeneration = useRef(0)
  const [templateState, setTemplateState] = useState({
    loading: true,
    data: [],
    error: '',
  })
  const [templateNotice, setTemplateNotice] = useState('')
  const generation = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  async function refreshTemplates() {
    const request = ++templateGeneration.current
    setTemplateState((previous) => ({ ...previous, loading: true }))
    try {
      const data = await loadCampaignTemplates(organisationId)
      if (mounted.current && request === templateGeneration.current)
        setTemplateState({ loading: false, data, error: '' })
    } catch (error) {
      if (mounted.current && request === templateGeneration.current)
        setTemplateState((previous) => ({
          ...previous,
          loading: false,
          error: error.message,
        }))
    }
  }
  useEffect(() => {
    if (organisationId) refreshTemplates()
  }, [organisationId]) // eslint-disable-line react-hooks/exhaustive-deps
  async function refresh() {
    const request = ++generation.current
    try {
      const data = await loadMarketingCampaigns(organisationId)
      if (mounted.current && request === generation.current)
        setState({ loading: false, data, error: '' })
    } catch (error) {
      if (mounted.current && request === generation.current)
        setState((previous) => ({
          ...previous,
          loading: false,
          error: error.message,
        }))
    }
  }
  useEffect(() => {
    if (organisationId) refresh()
    else setState({ loading: false, data: null, error: '' })
  }, [organisationId]) // eslint-disable-line react-hooks/exhaustive-deps
  const view = params.get('view')
  const filter = ['draft', 'scheduled', 'active', 'completed'].includes(
    params.get('filter'),
  )
    ? params.get('filter')
    : 'all'
  const tab = Object.hasOwn(tabs, params.get('tab'))
    ? params.get('tab')
    : 'overview'
  const workspace = state.data
  const campaign = workspace?.campaigns.find(
    (row) => row.id === params.get('id'),
  )
  const existingTemplate = templateState.data.find(
    (item) => item.id === params.get('id'),
  )
  const selectedTemplate = params.get('template')?.startsWith('saved:')
    ? templateState.data.find(
        (item) => item.id === params.get('template').slice(6),
      )
    : null
  const starter = selectedTemplate
    ? displayTemplate(selectedTemplate)
    : campaignTemplates.find((item) => item.id === params.get('template'))
  const templateSource = params.get('source')
    ? workspace?.campaigns.find((item) => item.id === params.get('source'))
    : null
  async function saveTemplate(form) {
    const saved = await saveCampaignTemplate(
      organisationId,
      form,
      view === 'template-edit' ? existingTemplate : null,
    )
    if (!mounted.current) return
    ++templateGeneration.current
    setTemplateState((previous) => ({
      ...previous,
      loading: false,
      data: [saved, ...previous.data.filter((item) => item.id !== saved.id)],
      error: '',
    }))
    setTemplateNotice(
      'Template saved. Dates, recipients, linked sends and results were not copied.',
    )
    navigate({ view: 'templates', library: saved.visibility })
  }
  const canEdit =
    campaign &&
    (workspace.canManage || campaign.created_by === workspace.userId)
  function navigate(fields = {}) {
    if (mounted.current)
      setParams({
        section: 'campaigns',
        ...(filter !== 'all' ? { filter } : {}),
        ...fields,
      })
  }
  async function save(form) {
    const saved = await saveMarketingCampaign(
      organisationId,
      form,
      view === 'edit' ? campaign : null,
    )
    if (!mounted.current) return
    // Keep the saved record available even if the subsequent refresh fails.
    setState((previous) => ({
      ...previous,
      data: {
        ...previous.data,
        campaigns: [
          saved,
          ...previous.data.campaigns.filter((row) => row.id !== saved.id),
        ],
      },
    }))
    navigate({ view: 'detail', id: saved.id })
    await refresh()
  }
  async function changeLink(action) {
    await action()
    if (mounted.current) await refresh()
  }
  if (!organisationId)
    return (
      <div className="mc-workspace">
        <Empty title="Choose an agency workspace">
          <p>Campaigns belong to your agency.</p>
        </Empty>
      </div>
    )
  if (state.loading)
    return (
      <div className="mc-workspace" role="status">
        Loading campaigns…
      </div>
    )
  if (!workspace)
    return (
      <div className="mc-workspace">
        <Empty title="Campaigns unavailable">
          <p role="alert">{state.error}</p>
          <button className="mc-button" onClick={refresh}>
            Try again
          </button>
        </Empty>
      </div>
    )
  const filtered = workspace.campaigns.filter(
    (row) =>
      (filter === 'all' || row.status === filter) &&
      (modeFilter === 'all' || runMode(row) === modeFilter) &&
      `${row.name} ${row.objective} ${row.area}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  )
  return (
    <main className="mc-workspace">
      {state.error && (
        <div role="alert" className="mc-error">
          {state.error}{' '}
          <button className="mc-text-button" onClick={refresh}>
            Refresh
          </button>
        </div>
      )}
      {view && (
        <button
          className="mc-back"
          onClick={() =>
            navigate(
              ['template-create', 'template-edit'].includes(view)
                ? { view: 'templates' }
                : {},
            )
          }
        >
          <ArrowLeft size={16} />
          {['template-create', 'template-edit'].includes(view)
            ? 'All templates'
            : 'All campaigns'}
        </button>
      )}
      {view === 'setup' ? (
        <CampaignSetup
          key={`${organisationId}:${workspace.userId}`}
          organisationId={organisationId}
          userId={workspace.userId}
          canManage={workspace.canManage}
        />
      ) : (view === 'create' && Object.hasOwn(GENERAL_CAMPAIGNS, params.get('template'))) ||
        (view === 'edit' && canEdit && campaign?.campaign_builder) ? (
        <Suspense fallback={<p role="status">Opening campaign builder…</p>}>
          <GeneralCampaignBuilder
            key={`${organisationId}:${workspace.userId}:${view}:${campaign?.id || params.get('template')}:${campaign?.revision || 0}`}
            template={params.get('template')}
            campaign={view === 'edit' ? campaign : undefined}
            organisationId={organisationId}
            userId={workspace.userId}
            onSave={save}
            onCancel={() => navigate(view === 'edit' ? { view: 'detail', id: campaign.id } : {})}
            onSetup={() => navigate({ view: 'setup' })}
          />
        </Suspense>
      ) : (view === 'create' &&
          Object.hasOwn(PROPERTY_CAMPAIGNS, params.get('template'))) ||
        (view === 'edit' &&
          canEdit &&
          campaign?.listing_builder?.version === 2) ? (
        <Suspense
          fallback={<p role="status">Opening property campaign builder…</p>}
        >
          <ListingCampaignBuilder
            key={`${organisationId}:${workspace.userId}:${view}:${campaign?.id || params.get('template')}:${campaign?.revision || 0}`}
            template={params.get('template')}
            campaign={view === 'edit' ? campaign : undefined}
            organisationId={organisationId}
            userId={workspace.userId}
            onSave={save}
            onCancel={() =>
              navigate(
                view === 'edit' ? { view: 'detail', id: campaign.id } : {},
              )
            }
            onSetup={() => navigate({ view: 'setup' })}
          />
        </Suspense>
      ) : (view === 'create' && params.get('template') === 'new-listing') ||
        (view === 'edit' && canEdit && campaign?.listing_builder) ? (
        <Suspense fallback={<p role="status">Opening campaign builder…</p>}>
          <JustListedCampaignBuilder
            key={`${organisationId}:${workspace.userId}:${view}:${campaign?.id || 'new'}:${campaign?.revision || 0}`}
            organisationId={organisationId}
            userId={workspace.userId}
            campaign={view === 'edit' ? campaign : undefined}
            onSave={save}
            onCancel={() =>
              navigate(
                view === 'edit' ? { view: 'detail', id: campaign.id } : {},
              )
            }
            onSetup={() => navigate({ view: 'setup' })}
          />
        </Suspense>
      ) : view === 'templates' ? (
        <>
          {templateNotice && (
            <p className="mc-template-notice" role="status">
              {templateNotice}
            </p>
          )}
          <CampaignTemplateLibrary
            key={params.get('library') || 'ready'}
            initialFilter={params.get('library') || 'ready'}
            saved={templateState.data}
            loading={templateState.loading}
            error={templateState.error}
            onRetry={refreshTemplates}
            userId={workspace.userId}
            canShare={workspace.canManage}
            onUse={(template, ready) =>
              navigate({
                view: 'create',
                template: ready ? template.id : `saved:${template.id}`,
              })
            }
            onCreate={(template) =>
              navigate({
                view: 'template-create',
                ...(template ? { template: template.id } : {}),
              })
            }
            onEdit={(id) => navigate({ view: 'template-edit', id })}
          />
          <CampaignSetup
            key={`${organisationId}:${workspace.userId}`}
            organisationId={organisationId}
            userId={workspace.userId}
            canManage={workspace.canManage}
          />
        </>
      ) : ['template-create', 'template-edit'].includes(view) ? (
        view === 'template-edit' && templateState.loading ? (
          <p role="status">Loading template…</p>
        ) : view === 'template-edit' &&
          (!existingTemplate ||
            !(existingTemplate.visibility === 'agency'
              ? workspace.canManage
              : existingTemplate.created_by === workspace.userId)) ? (
          <Empty title="Template unavailable">
            <p>Choose an available template from the library.</p>
          </Empty>
        ) : (
          <CampaignForm
            key={`${view}:${existingTemplate?.id || templateSource?.id || starter?.id || 'blank'}`}
            templateMode
            canShare={workspace.canManage}
            visibilityLocked={
              view === 'template-edit' &&
              existingTemplate?.created_by !== workspace.userId
            }
            template={
              view === 'template-edit'
                ? displayTemplate(existingTemplate)
                : templateSource
                  ? templateFromCampaign(templateSource)
                  : starter
            }
            onSave={saveTemplate}
            onCancel={() => navigate({ view: 'templates' })}
          />
        )
      ) : view === 'create' &&
        params.get('template')?.startsWith('saved:') &&
        !selectedTemplate ? (
        templateState.loading ? (
          <p role="status">Loading template…</p>
        ) : (
          <Empty title="Template unavailable">
            <p>
              {templateState.error ||
                'This template is no longer available to you.'}
            </p>
            <button
              className="mc-button"
              onClick={() => navigate({ view: 'templates' })}
            >
              Browse templates
            </button>
          </Empty>
        )
      ) : view === 'create' ? (
        <CampaignForm
          key={`create:${params.get('template') || 'blank'}`}
          template={starter}
          onSave={save}
          onCancel={() => navigate()}
        />
      ) : ['detail', 'edit'].includes(view) ? (
        !campaign ? (
          <Empty title="Campaign not found">
            <p>It may no longer be available in this agency workspace.</p>
          </Empty>
        ) : view === 'edit' ? (
          canEdit ? (
            <CampaignForm
              key={`${campaign.id}:${campaign.revision}`}
              campaign={campaign}
              onSave={save}
              onCancel={() => navigate({ view: 'detail', id: campaign.id })}
            />
          ) : (
            <Empty title="You have view access">
              <p>
                The campaign owner or an agency administrator can edit this
                campaign.
              </p>
            </Empty>
          )
        ) : (
          <Detail
            campaign={campaign}
            workspace={workspace}
            tab={tab}
            canEdit={canEdit}
            onSaveTemplate={() =>
              navigate({ view: 'template-create', source: campaign.id })
            }
            onTab={(next) =>
              navigate({ view: 'detail', id: campaign.id, tab: next })
            }
            onEdit={() => navigate({ view: 'edit', id: campaign.id })}
            onRefresh={refresh}
            onLink={(channel, id) =>
              changeLink(() =>
                linkMarketingActivity(organisationId, campaign.id, channel, id),
              )
            }
            onUnlink={(id) =>
              changeLink(() =>
                unlinkMarketingActivity(organisationId, campaign.id, id),
              )
            }
          />
        )
      ) : (
        <>
          <header className="mc-page-heading">
            <div>
              <h1>Campaigns</h1>
            </div>
            <div className="mc-heading-actions">
              <button
                className="mc-button mc-primary"
                onClick={() => navigate({ view: 'create' })}
              >
                <Plus size={19} /> Create campaign
              </button>
            </div>
          </header>
          <CampaignSummaryCards workspace={workspace} />
          <CurrentCampaigns
            workspace={workspace}
            onCreate={() => navigate({ view: 'create' })}
          />
          <CampaignSetup
            key={`${organisationId}:${workspace.userId}`}
            organisationId={organisationId}
            userId={workspace.userId}
            canManage={workspace.canManage}
          />
          <section
            className="mc-template-section"
            aria-labelledby="mc-template-heading"
            ref={templatesRef}
          >
            <header className="mc-template-heading">
              <div className="mc-template-intro">
                <span className="mc-template-eyebrow">
                  <LayoutGrid size={14} aria-hidden="true" /> THE PLAYBOOK
                  COLLECTION
                </span>
                <h2 id="mc-template-heading">Campaign templates</h2>
              </div>
              <div className="mc-template-actions">
                <button
                  className="mc-text-button"
                  onClick={() => navigate({ view: 'template-create' })}
                >
                  <Plus size={16} /> Create template
                </button>
                <button
                  className="mc-button"
                  aria-label="Browse templates"
                  onClick={() => navigate({ view: 'templates' })}
                >
                  Browse templates{' '}
                  <span className="mc-template-count">
                    {campaignShopTemplates.length}
                  </span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </header>
            <div className="mc-template-grid">
              {campaignTemplates.slice(0, 4).map((template) => {
                return (
                  <article className="mc-template" key={template.id}>
                    <div className="mc-template-creative">
                      <CampaignTemplatePreview type={template.id} />
                    </div>
                    <div className="mc-template-body">
                      <div className="mc-template-meta">
                        <span>{runLabels[template.mode]}</span>
                        <span>{template.channels.length} channels</span>
                      </div>
                      <h3>{template.title}</h3>
                      <p>{template.description}</p>
                      <div
                        className="mc-template-tools"
                        aria-label="Suggested channels"
                      >
                        {template.channels.map((channel) => (
                          <span key={channel} className="mc-platform-badge">
                            <PlatformLogo channel={channel} />
                            {CAMPAIGN_CHANNELS[channel]}
                          </span>
                        ))}
                      </div>
                      <button
                        className="mc-text-button"
                        aria-label={`Use template: ${template.title}`}
                        onClick={() =>
                          navigate({ view: 'create', template: template.id })
                        }
                      >
                        Use template <ArrowRight size={16} />
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
          <section
            className="mc-your-campaigns"
            aria-labelledby="mc-campaigns-heading"
          >
            <div className="mc-campaign-heading">
              <h2 id="mc-campaigns-heading">
                Your campaigns{' '}
                <span className="mc-pill">{workspace.campaigns.length}</span>
              </h2>
              <nav aria-label="Campaign run mode" className="mc-mode-filters">
                {[
                  ['all', 'All'],
                  ['bounded', 'Time-bound'],
                  ['ongoing', 'Ongoing'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={modeFilter === value}
                    onClick={() => setModeFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <label className="mc-search">
                <Search size={17} />
                <input
                  aria-label="Search campaigns"
                  placeholder="Search campaigns…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
            </div>
            <div className="mc-list-controls">
              <nav aria-label="Filter campaigns">
                {['all', 'active', 'scheduled', 'draft', 'completed'].map(
                  (status) => (
                    <button
                      key={status}
                      aria-pressed={filter === status}
                      onClick={() =>
                        navigate(
                          status === 'all'
                            ? { filter: 'all' }
                            : { filter: status },
                        )
                      }
                    >
                      {status === 'all'
                        ? 'All campaigns'
                        : status === 'draft'
                          ? 'Drafts'
                          : CAMPAIGN_STATUSES[status]}
                    </button>
                  ),
                )}
              </nav>
            </div>
            {!filtered.length ? (
              <Empty
                title={
                  workspace.campaigns.length
                    ? 'No matching campaigns'
                    : 'Give your marketing a direction'
                }
              >
                <p>
                  {workspace.campaigns.length
                    ? 'Try a different filter or search.'
                    : 'Create a campaign, define the goal and bring your channels together.'}
                </p>
                {!workspace.campaigns.length && (
                  <button
                    className="mc-button mc-primary"
                    onClick={() => navigate({ view: 'create' })}
                  >
                    <Plus size={17} />
                    Create your first campaign
                  </button>
                )}
              </Empty>
            ) : (
              <div className="mc-campaign-grid">
                {filtered.map((row) => (
                  <CampaignDashboardCard
                    key={row.id}
                    campaign={row}
                    workspace={workspace}
                    filter={filter}
                  />
                ))}
              </div>
            )}
          </section>
          <CampaignAnalytics workspace={workspace} />
        </>
      )}
    </main>
  )
}
