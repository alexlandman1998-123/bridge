import { personalisePlaybookChannel, playbookForChannels } from '../../services/campaignPlaybookModel'
import Modal from '../ui/Modal'
import { CHANNEL_TEMPLATE_STARTERS } from './channelTemplateStarters'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  Infinity as InfinityIcon,
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
import { useSearchParams } from 'react-router-dom'
import { MarketingLink as Link } from './MarketingNavigation.jsx'
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
import CampaignCreateWizard from './CampaignCreateWizard'
import CampaignGoalFields from './CampaignGoalFields'
import CampaignStudioFormats from './CampaignStudioFormats'
import CampaignPublishingActions from './CampaignPublishingActions'
import { campaignShopTemplates } from '../../services/marketingCampaignCatalogue'
import PlatformLogo from './CampaignPlatformLogo'
import CampaignTemplatePreview from './CampaignTemplatePreview'
import CampaignAnalytics from './CampaignAnalytics'
import MarketingCalendar from './MarketingCalendar'
import CampaignSetup from './CampaignSetup'
import CurrentCampaigns from './CurrentCampaigns'
import CampaignSummaryCards from './CampaignSummaryCards'
import CampaignAttention from './CampaignAttention'
import ChannelTemplateLibrary, { ChannelTemplateEditor } from './ChannelTemplateLibrary'
import { CHANNEL_TEMPLATE_CHANNELS, loadChannelTemplates, saveChannelTemplate, campaignFromChannelTemplate } from '../../services/marketingChannelTemplateService'
import { handoffCampaignDraft, loadCampaignChannelBrief } from '../../services/campaignPackService'
import { CampaignWorkspaceNavigation, CampaignStudioIntro, CampaignAssetLibrary, CampaignAgents } from './CampaignWorkspacePanels'
import { PROPERTY_CAMPAIGNS } from '../../services/listingCampaignContract'
import { GENERAL_CAMPAIGNS } from '../../services/generalCampaignModel'
import { SHOW_CAMPAIGN_WORKSPACE } from '../../lib/featureFlags'
import CampaignLaunchpad from './CampaignLaunchpad'
import CampaignReadiness from './CampaignReadiness'
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
  chatgpt: MessageCircle,
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
const MarketingAudiences = lazy(() => import('./MarketingAudiences'))
const CampaignAudience = lazy(() => import('./MarketingAudiences').then((module) => ({ default: module.CampaignAudience })))
const CampaignPlaybook = lazy(() => import('./CampaignPlaybook'))
const CampaignEnquiries = lazy(() => import('./CampaignEnquiries'))
const CampaignResponseLink = lazy(() => import('./CampaignResponseLink'))
const CampaignOutcomes = lazy(() => import('./CampaignOutcomes'))
const CampaignFacebookPostPanel = lazy(() => import('./CampaignFacebookPostPanel'))
const tabs = {
  overview: 'Overview',
  playbook: 'Playbook',
  audience: 'Audience & offer',
  activity: 'Channel activity',
  enquiries: 'Enquiries & follow-up',
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
const channelUrl = (channel, id, status) =>
  `/marketing?section=${channel}&view=${['email', 'whatsapp'].includes(channel) && status === 'draft' ? 'create' : 'detail'}&id=${encodeURIComponent(id)}`
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
  organisationId,
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
        ...(template?.playbook ? { playbook: structuredClone(template.playbook) } : {}),
        ...(template?.campaign_setup ? { campaign_setup: structuredClone(template.campaign_setup) } : {}),
        name: template?.name || '',
        goal: template?.goal || 'seller_leads',
        objective: template?.objective ?? CAMPAIGN_GOALS.seller_leads,
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
      const prepared = { ...form, ...(form.playbook ? { playbook: playbookForChannels(form.playbook, form.planned_channels) } : {}) }
      await onSave(templateMode ? { ...prepared, mode } : prepared)
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
                : 'Create campaign'}
          </h2>
        </div>
      </div>
      {templateMode && form.playbook && <p className="mc-note">Includes {playbookForChannels(form.playbook, form.planned_channels)?.steps.length || 0} communication steps and {form.playbook.followUp.length} follow-up actions. Removed channels are omitted; replacing every channel starts a fresh playbook. Review routing and personalise the sequence in Playbook after creating the campaign.</p>}
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
          <CampaignGoalFields form={form} setForm={setForm} organisationId={organisationId || campaign?.organisation_id} />
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
                  {['meta', 'social', 'chatgpt'].includes(key) && (
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
                            ...(previous.playbook ? { playbook: personalisePlaybookChannel(previous.playbook, channel, { [key]: event.target.value }) } : {}),
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
                            ...(previous.playbook ? { playbook: personalisePlaybookChannel(previous.playbook, channel, { [key]: event.target.value }) } : {}),
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

function ActivityPanel({ campaign, workspace, canEdit, onLink, onUnlink, onPrepareDraft, onLoadBrief }) {
  const [selected, setSelected] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preparedDraft, setPreparedDraft] = useState(null)
  async function act(callback) {
    setBusy(true)
    setError('')
    setPreparedDraft(null)
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
            {['email', 'whatsapp'].includes(channel) && canEdit && campaign.channel_content?.[channel] && (
              <div className="mc-prepare-email">
                <p>{channel === 'email' ? 'Prepare an editable email draft from your saved subject and message. Review the sender and audience in Email.' : 'Prepare a WhatsApp draft with this wording. Choose a business sender, recipients and an approved template in WhatsApp.'}</p>
                <button className="mc-button mc-primary" disabled={busy || !campaign.channel_content[channel].body?.trim() || (channel === 'email' && !campaign.channel_content.email.title?.trim())} onClick={() => act(async () => {
                  const result = await onPrepareDraft(channel)
                  setPreparedDraft({ ...result, channel })
                })}>{busy ? 'Working…' : `Prepare ${channel === 'email' ? 'email' : 'WhatsApp'} draft`} <ArrowRight size={16} /></button>
              </div>
            )}
            {preparedDraft?.channel === channel && (
              <div className="mc-email-prepared" role="status">
                <p>{preparedDraft.status === 'draft' ? `${CAMPAIGN_CHANNELS[channel]} draft saved and linked to this campaign. Nothing has been sent or scheduled.` : `Existing ${CAMPAIGN_CHANNELS[channel]} activity linked to this campaign.`}</p>
                <Link className="mc-button" to={channelUrl(channel, preparedDraft.id, preparedDraft.status)}>{preparedDraft.status === 'draft' ? `Open ${channel === 'email' ? 'email' : 'WhatsApp'} draft` : `View ${CAMPAIGN_CHANNELS[channel]} activity`} <ArrowRight size={16} /></Link>
              </div>
            )}
            {['meta', 'social', 'chatgpt'].includes(channel) ? (
              canEdit ? <CampaignPublishingActions key={`${campaign.id}:${campaign.revision}:${channel}`} channel={channel} campaign={campaign} onLoadBrief={onLoadBrief}/> : <p className="mc-note">Publishing and results are managed in the channel tool.</p>
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
                          to={channelUrl(channel, activity.id, activity.status)}
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
function Results({ workspace, campaign, onRefresh }) {
  const [refreshing, setRefreshing] = useState(false)
  async function refreshResults() {
    setRefreshing(true)
    try { await onRefresh() } finally { setRefreshing(false) }
  }
  return (
    <div className="mc-panel">
      <div className="mc-panel-heading"><h2>Channel results</h2><button className="mc-button" disabled={refreshing} onClick={() => void refreshResults()}>{refreshing ? 'Refreshing…' : 'Refresh results'}</button></div>
      <p className="mc-note">
        Recorded message activity from linked sends. Campaign lead attribution
        appears in Enquiries & follow-up when a person submits a tracked response form or an agent records an enquiry.
      </p>
      {campaign.planned_channels
        .filter((channel) => !['meta', 'social', 'chatgpt'].includes(channel))
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
        ['meta', 'social', 'chatgpt'].includes(channel),
      ) && (
        <p className="mc-note">
          Facebook publication records are in Channel activity. Social engagement and advertising results require their own reporting connection.
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
  onPrepareDraft,
  onLoadBrief,
  focusLeadId,
  refreshing,
}) {
  return (
    <>
      <div className="mc-detail-shell">
        <header className="mc-detail-heading">
          <div className="mc-detail-title">
            <Cover key={campaign.cover_url} url={campaign.cover_url} />
            <div>
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
        {campaign.copied_from_id && <p className="mc-note">Copied from <Link to={`?section=campaigns&page=agents&view=detail&id=${encodeURIComponent(campaign.copied_from_id)}`}>{workspace.campaigns.find((row) => row.id === campaign.copied_from_id)?.name || 'source campaign'}</Link> · Source revision {campaign.copied_from_revision}. Review the playbook and choose a fresh audience before preparing channel activity.</p>}
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
      </div>
      {tab === 'overview' && (
        <div className="mc-overview-grid">
          <section className="mc-panel">
            <div className="mc-section-heading">
              <Target size={21} />
              <h2>Campaign objective</h2>
            </div>
            <p className="mc-objective">{campaign.objective}</p>
            {campaign.campaign_setup?.target && <p className="mc-note">Target: {campaign.campaign_setup.target}</p>}
            <button type="button" className="mc-text-button" onClick={() => onTab('playbook')}>Open campaign playbook <ArrowRight size={15} /></button>
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
                  progress={channel === 'social' && campaign.campaign_builder ? 'Review post history' : channelProgress(workspace, campaign, channel)}
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
      {tab === 'overview' && SHOW_CAMPAIGN_WORKSPACE && campaign.listing_builder && <CampaignReadiness key={`${campaign.organisation_id}:${workspace.userId}:${campaign.id}:${campaign.revision}`} campaign={campaign} userId={workspace.userId} canEdit={canEdit} onEdit={onEdit} />}
      {tab === 'overview' && <CampaignAttention organisationId={campaign.organisation_id} campaignId={campaign.id} workspace={workspace} onRefresh={onRefresh} refreshing={refreshing} />}
      {tab === 'playbook' && <Suspense fallback={<p role="status">Opening campaign playbook…</p>}><CampaignPlaybook key={`${campaign.organisation_id}:${campaign.id}:${campaign.revision}`} campaign={campaign} workspace={workspace} userId={workspace.userId} canEdit={canEdit} onSaved={onRefresh} onEdit={onEdit} onTab={onTab} /></Suspense>}
      {tab === 'enquiries' && (
        <Suspense fallback={<p role="status">Opening campaign enquiries…</p>}>
          <CampaignEnquiries key={`${campaign.organisation_id}:${campaign.id}:${focusLeadId || ''}`} campaign={campaign} userId={workspace.userId} canEdit={canEdit} focusLeadId={focusLeadId} />
        </Suspense>
      )}
      {tab === 'audience' && (
        <div className="mc-overview-grid">
          <Suspense fallback={<p role="status">Opening campaign audience…</p>}><CampaignAudience key={`${campaign.organisation_id}:${campaign.id}`} campaign={campaign} canEdit={canEdit} /></Suspense>
          <section className="mc-panel">
            <h2>Offer</h2>
            <p className="mc-objective">
              {campaign.offer ||
                'Add an offer that gives your audience a reason to respond.'}
            </p>
          </section>
        </div>
      )}
      {tab === 'audience' && <Suspense fallback={<p role="status">Opening response links…</p>}><CampaignResponseLink key={`${campaign.organisation_id}:${campaign.id}:${campaign.revision}`} campaign={campaign} userId={workspace.userId} canEdit={canEdit} onSaved={onRefresh} onPlaybook={() => onTab('playbook')} /></Suspense>}
      {tab === 'activity' && (
        <ActivityPanel
          key={campaign.id}
          campaign={campaign}
          workspace={workspace}
          canEdit={canEdit}
          onLink={onLink}
          onUnlink={onUnlink}
          onPrepareDraft={onPrepareDraft}
          onLoadBrief={onLoadBrief}
        />
      )}
      {tab === 'activity' && campaign.campaign_builder && campaign.planned_channels.includes('social') && <Suspense fallback={<p role="status">Opening Facebook publishing…</p>}><CampaignFacebookPostPanel key={`${campaign.organisation_id}:${workspace.userId}:${campaign.id}:${campaign.revision}`} organisationId={campaign.organisation_id} userId={workspace.userId} campaign={campaign} canEdit={canEdit} /></Suspense>}
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
        <><Suspense fallback={<p role="status">Loading recorded enquiry outcomes…</p>}><CampaignOutcomes key={`${campaign.organisation_id}:${workspace.userId}:${Boolean(workspace.canManage)}:${campaign.id}`} campaign={campaign} userId={workspace.userId} canManage={workspace.canManage} onEnquiries={() => onTab('enquiries')} /></Suspense><Results workspace={workspace} campaign={campaign} onRefresh={onRefresh} /></>
      )}
    </>
  )
}

function CampaignListRow({ campaign, workspace, filter = 'all', page = 'overview' }) {
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
  const target = `?section=campaigns&page=${page}&view=detail&id=${encodeURIComponent(campaign.id)}${filter !== 'all' ? `&filter=${filter}` : ''}`
  return (
    <article className={`mc-campaign-row mc-campaign-row-${campaign.status}`}>
      <div className="mc-campaign-row-main">
        <div className="mc-campaign-row-identity">
          <Cover key={campaign.cover_url} url={campaign.cover_url} />
          <div>
            <p className="mc-campaign-row-category">
              {CAMPAIGN_GOALS[campaign.goal]}
              {campaign.area ? ` · ${campaign.area}` : ''}
            </p>
            <h2><Link to={target}>{campaign.name}</Link></h2>
            <p className="mc-campaign-row-objective">{campaign.objective}</p>
          </div>
        </div>
        <div className="mc-campaign-row-schedule">
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
          <p><CalendarDays size={14} aria-hidden="true" />{period(campaign)}</p>
        </div>
        <div className="mc-campaign-row-activity">
          <strong>{available.length}</strong><span>Linked activities</span>
        </div>
        <Link className="mc-campaign-row-open" to={target}>
          Open campaign <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </div>
      <div className="mc-campaign-row-footer">
      <div className="mc-campaign-row-channels" aria-label="Planned channels">
        {campaign.planned_channels.map((channel) => {
          const links = linkedActivities(workspace, campaign, channel)
          return (
            <Link
              key={channel}
              to={`${target}&tab=activity`}
              className="mc-campaign-row-channel"
            >
              <PlatformLogo channel={channel} />
              <strong>{CAMPAIGN_CHANNELS[channel]}</strong>
              <span className="mc-campaign-row-channel-detail">
                {['meta', 'social', 'chatgpt'].includes(channel)
                  ? channel === 'social' && campaign.campaign_builder ? 'Facebook & manual sharing' : 'Planning only'
                  : links.length
                    ? `${links.length} linked ${links.length === 1 ? 'activity' : 'activities'}`
                    : 'No activity linked'}
              </span>
              <span className="mc-campaign-row-channel-status">
                {channel === 'social' && campaign.campaign_builder ? 'Review post history' : channelProgress(workspace, campaign, channel)}
              </span>
            </Link>
          )
        })}
      </div>
      <div className={`mc-campaign-row-next${attention ? ' mc-campaign-row-attention' : ''}`}>
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
      </div>
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
  const [audiencesOpen, setAudiencesOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const templatesRef = useRef(null)
  const templateGeneration = useRef(0)
  const [templateState, setTemplateState] = useState({
    loading: true,
    data: [],
    error: '',
  })
  const [templateNotice, setTemplateNotice] = useState('')
  const [editedStarter, setEditedStarter] = useState(null)
  const [channelTemplateState, setChannelTemplateState] = useState({ loading: true, data: [], error: '' })
  const channelTemplateGeneration = useRef(0)
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
  async function refreshChannelTemplates() {
    const request = ++channelTemplateGeneration.current
    setChannelTemplateState((previous) => ({ ...previous, loading: true }))
    try {
      const data = await loadChannelTemplates(organisationId)
      if (mounted.current && request === channelTemplateGeneration.current) setChannelTemplateState({ loading: false, data, error: '' })
    } catch (error) {
      if (mounted.current && request === channelTemplateGeneration.current) setChannelTemplateState((previous) => ({ ...previous, loading: false, error: error.message }))
    }
  }
  useEffect(() => {
    if (organisationId) refreshTemplates()
  }, [organisationId]) // eslint-disable-line react-hooks/exhaustive-deps
  async function refresh() {
    const request = ++generation.current
    setRefreshing(true)
    try {
      const data = await loadMarketingCampaigns(organisationId)
      if (mounted.current && request === generation.current) {
        setState({ loading: false, data, error: '' })
        setLastRefreshed(new Date())
      }
    } catch (error) {
      if (mounted.current && request === generation.current)
        setState((previous) => ({
          ...previous,
          loading: false,
          error: error.message,
        }))
    } finally {
      if (mounted.current && request === generation.current) setRefreshing(false)
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
  const activePage = params.has('channelTemplate') || view === 'templates' || ['template-create', 'template-edit', 'channel-template-create', 'channel-template-edit'].includes(view)
    ? 'studio'
    : ['overview', 'calendar', 'studio', 'analytics', 'assets', 'agents'].includes(params.get('page')) ? params.get('page') : 'overview'
  const selectedFormat = Object.hasOwn(CHANNEL_TEMPLATE_CHANNELS, params.get('format')) ? params.get('format') : null
  const channelCollection = Boolean(selectedFormat) || params.get('collection') === 'channels' || view?.startsWith('channel-template-') || params.has('channelTemplate')
  const studioLanding = !view && activePage === 'studio' && !params.has('collection') && !selectedFormat
  const needsChannelTemplates = Boolean((channelCollection && activePage === 'studio') || view === 'create')
  useEffect(() => {
    if (organisationId && needsChannelTemplates) void refreshChannelTemplates()
  }, [organisationId, needsChannelTemplates]) // eslint-disable-line react-hooks/exhaustive-deps
  const selectedChannelTemplate = channelTemplateState.data.find((item) => item.id === (params.get('channelTemplate') || params.get('id') || params.get('source')))
  const bundledStarter = CHANNEL_TEMPLATE_STARTERS.find((item) => item.id === params.get('starter'))
  const editorTemplate = bundledStarter || selectedChannelTemplate
  let channelStarter = bundledStarter ? campaignFromChannelTemplate(editedStarter?.id === bundledStarter.id && editedStarter.organisationId === organisationId ? editedStarter : bundledStarter) : null
  let channelStarterError = ''
  if (params.has('channelTemplate') && selectedChannelTemplate) {
    try { channelStarter = campaignFromChannelTemplate(selectedChannelTemplate) } catch (error) { channelStarterError = error.message }
  }
  useEffect(() => {
    if (activePage !== 'agents' || view || !workspace?.canManage) return
    const update = () => { if (!document.hidden) void refresh() }
    const timer = window.setInterval(update, 30000)
    window.addEventListener('focus', update)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', update)
    }
  }, [activePage, view, workspace?.canManage, organisationId]) // eslint-disable-line react-hooks/exhaustive-deps
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
  async function saveChannelLibraryTemplate(form) {
    const saved = await saveChannelTemplate(organisationId, form, view === 'channel-template-edit' ? selectedChannelTemplate : null)
    if (!mounted.current) return
    ++channelTemplateGeneration.current
    setChannelTemplateState((previous) => ({ loading: false, error: '', data: [saved, ...previous.data.filter((item) => item.id !== saved.id)] }))
    setTemplateNotice('Channel template saved.')
    navigate({ page: 'studio', collection: 'channels' })
  }
  const canEdit =
    campaign &&
    (workspace.canManage || campaign.created_by === workspace.userId)
  function navigate(fields = {}) {
    if (mounted.current)
      setParams({
        section: 'campaigns',
        page: activePage,
        ...(channelCollection ? { collection: 'channels' } : {}),
        ...(selectedFormat && fields.collection !== 'campaigns' ? { format: selectedFormat } : {}),
        ...(activePage === 'calendar' && params.has('date') ? { date: params.get('date') } : {}),
        ...(filter !== 'all' ? { filter } : {}),
        ...fields,
      })
  }
  async function save(form, options = {}) {
    const persisted = options.persistedCampaign;
    if (persisted && (persisted.organisation_id !== organisationId || persisted.id !== form.id))
      throw new Error('Your saved campaign changed. Reopen it before continuing.');
    const saved = await saveMarketingCampaign(
      organisationId,
      form,
      persisted || (view === 'edit' ? campaign : null),
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
    const requestedTab = Object.hasOwn(tabs, options.tab || '') ? options.tab : null;
    navigate({ view: 'detail', id: saved.id, ...(requestedTab ? { tab: requestedTab } : params.has('channelTemplate') && saved.planned_channels?.includes('email') ? { tab: 'activity' } : view === 'create' ? { tab: 'playbook' } : {}) })
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
    <main className={`mc-workspace${SHOW_CAMPAIGN_WORKSPACE ? ' mc-flagship' : ''}`}>
      {state.error && (
        <div role="alert" className="mc-error">
          {state.error}{' '}
          <button className="mc-text-button" onClick={refresh}>
            Refresh
          </button>
        </div>
      )}
      <header className="mc-page-heading">
        <div><h1>Campaigns</h1></div>
        {(!view || view === 'templates') && <div className="mc-heading-actions"><button className="mc-button" onClick={() => setAudiencesOpen(true)}><UsersRound size={17} />CRM audiences</button><button className="mc-button mc-primary" onClick={() => navigate({ view: 'create' })}><Plus size={19} /> Create campaign</button></div>}
      </header>
      <Modal open={audiencesOpen} title="CRM audiences" onClose={() => setAudiencesOpen(false)} className="ma-library-modal">{audiencesOpen && <Suspense fallback={<p role="status">Opening shared audiences…</p>}><MarketingAudiences key={organisationId} organisationId={organisationId} /></Suspense>}</Modal>
      <CampaignWorkspaceNavigation active={activePage} canManage={workspace.canManage} onNavigate={(fields) => {
        setSearch('')
        setModeFilter('all')
        setParams({ section: 'campaigns', ...fields })
      }} />
      {view && view !== 'create' && (
        <button
          className="mc-back"
          onClick={() =>
            navigate(
              ['template-create', 'template-edit'].includes(view)
                ? { page: 'studio' }
                : { page: activePage },
            )
          }
        >
          <ArrowLeft size={16} />
          {activePage === 'calendar' ? 'Back to Calendar' : activePage === 'studio' ? 'Back to Studio' : activePage === 'assets' ? 'Back to Assets' : activePage === 'agents' ? 'Back to Agents' : 'All campaigns'}
        </button>
      )}
      {!view && activePage === 'calendar' ? (
        <MarketingCalendar organisationId={organisationId} workspace={workspace} onRefresh={refresh} refreshing={refreshing} date={params.get('date')} onDateChange={(date) => navigate({ page: 'calendar', date })} />
      ) : !view && activePage === 'analytics' ? (
        <CampaignAnalytics workspace={workspace} />
      ) : !view && activePage === 'assets' ? (
        <CampaignAssetLibrary workspace={workspace} />
      ) : !view && activePage === 'agents' ? (
        <CampaignAgents
          key={organisationId}
          organisationId={organisationId}
          workspace={workspace}
          refreshing={refreshing}
          lastRefreshed={lastRefreshed}
          onRefresh={refresh}
          onMakeTemplate={(row) => navigate({ view: 'template-create', source: row.id, share: 'agency' })}
          onCopied={(saved) => {
            setState((previous) => ({ ...previous, data: { ...previous.data, campaigns: [saved, ...previous.data.campaigns.filter((row) => row.id !== saved.id)] } }))
            navigate({ page: 'agents', view: 'detail', id: saved.id, tab: 'playbook' })
          }}
          renderCampaign={(row) => <CampaignListRow key={row.id} campaign={row} workspace={workspace} page="agents" />}
        />
      ) : ['channel-template-create', 'channel-template-edit'].includes(view) ? (
        (view === 'channel-template-edit' || params.has('source')) && channelTemplateState.loading ? <p role="status">Loading channel template…</p>
        : (view === 'channel-template-edit' || params.has('source')) && (!selectedChannelTemplate || (view === 'channel-template-edit' && !(selectedChannelTemplate.visibility === 'agency' ? workspace.canManage : selectedChannelTemplate.created_by === workspace.userId))) ? (
          <Empty title="Channel template unavailable"><p>{channelTemplateState.error || 'Choose an available template from the channel library.'}</p><button className="mc-button" onClick={() => navigate({ page: 'studio', collection: 'channels' })}>Back to channel templates</button></Empty>
        ) : <ChannelTemplateEditor key={`${view}:${params.get('id') || params.get('source') || params.get('starter') || 'new'}:${selectedFormat || 'all'}`} template={editorTemplate} onUse={bundledStarter ? (form) => { setEditedStarter({ ...form, id: bundledStarter.id, organisationId }); navigate({ view: 'create', starter: bundledStarter.id }) } : undefined} duplicate={view === 'channel-template-create' && params.has('source')} canShare={workspace.canManage} userId={workspace.userId} initialChannel={selectedFormat ? selectedChannelTemplate?.channel || selectedFormat : undefined} onSave={saveChannelLibraryTemplate} onCancel={() => navigate({ page: 'studio', collection: 'channels' })} />
      ) : view === 'create' && params.has('channelTemplate') && (!channelStarter || channelStarterError) ? (
        channelTemplateState.loading ? <p role="status">Loading channel template…</p> : <Empty title="Channel template unavailable"><p>{channelTemplateState.error || channelStarterError || 'This template is no longer available to you.'}</p><button className="mc-button" onClick={() => navigate({ page: 'studio', collection: 'channels' })}>Back to channel templates</button></Empty>
      ) : view === 'setup' ? (
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
            businessGoalId={params.get('goal') || ''}
            campaign={view === 'edit' ? campaign : undefined}
            organisationId={organisationId}
            userId={workspace.userId}
            onSave={save}
            onCancel={(options) => { navigate(view === 'edit' ? { view: 'detail', id: campaign.id } : {}); if (options?.persistedCampaign) void refresh() }}
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
      ) : view === 'templates' || (!view && activePage === 'studio') ? (
        <>
          <CampaignStudioIntro onCreate={() => navigate({ view: 'create' })} onAllFormats={!studioLanding ? () => setParams({ section: 'campaigns', page: 'studio' }) : undefined} />
          {studioLanding && <CampaignStudioFormats
            onOpenFormat={(format) => navigate({ page: 'studio', collection: 'channels', format })}
            onOpenCampaigns={() => navigate({ page: 'studio', collection: 'campaigns' })}
          />}
          {templateNotice && (
            <p className="mc-template-notice" role="status">
              {templateNotice}
            </p>
          )}
          {!studioLanding && (channelCollection ? <ChannelTemplateLibrary key={selectedFormat || 'all'} fixedChannel={selectedFormat} templates={channelTemplateState.data} loading={channelTemplateState.loading} error={channelTemplateState.error} onRetry={refreshChannelTemplates} userId={workspace.userId} canShare={workspace.canManage} onStart={(template) => { setEditedStarter(null); navigate({ view: 'channel-template-create', starter: template.id }) }} onCreate={() => navigate({ view: 'channel-template-create' })} onEdit={(id) => navigate({ view: 'channel-template-edit', id })} onDuplicate={(template) => navigate({ view: 'channel-template-create', source: template.id })} onUse={(template) => navigate({ view: 'create', channelTemplate: template.id })} /> : <CampaignTemplateLibrary
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
          />)}

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
            organisationId={organisationId}
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
                  ? { ...templateFromCampaign(templateSource), ...(params.get('share') === 'agency' && workspace.canManage ? { visibility: 'agency' } : {}) }
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
        <CampaignCreateWizard
          organisationId={organisationId}
          key={`create:${params.get('template') || params.get('channelTemplate') || params.get('starter') || 'blank'}`}
          template={channelStarter || starter}
          templates={channelTemplateState.data}
          templatesLoading={channelTemplateState.loading}
          templatesError={channelTemplateState.error}
          onRetryTemplates={refreshChannelTemplates}
          onBrowseTemplates={() => navigate({ view: 'templates', collection: 'campaigns' })}
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
            organisationId={organisationId}
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
            focusLeadId={params.get('enquiry')}
            refreshing={refreshing}
            canEdit={canEdit}
            onSaveTemplate={() =>
              navigate({ view: 'template-create', source: campaign.id })
            }
            onTab={(next) =>
              navigate({ view: 'detail', id: campaign.id, tab: next })
            }
            onEdit={() => navigate({ view: 'edit', id: campaign.id })}
            onRefresh={refresh}
            onLoadBrief={(channel) => loadCampaignChannelBrief(organisationId, workspace.userId, campaign, channel)}
            onPrepareDraft={async (channel) => {
              const prepared = await handoffCampaignDraft(organisationId, workspace.userId, campaign, channel)
              if (mounted.current) await refresh()
              return prepared
            }}
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
          {SHOW_CAMPAIGN_WORKSPACE && <><CampaignLaunchpad key={`${organisationId}:${workspace.userId}`} organisationId={organisationId} workspace={workspace} refreshedAt={lastRefreshed} onBrowseStudio={() => navigate({ page: 'studio' })} /><CampaignAttention organisationId={organisationId} workspace={workspace} onRefresh={refresh} refreshing={refreshing} /></>}
          {(!SHOW_CAMPAIGN_WORKSPACE || Object.values(workspace.channels || {}).some((channel) => channel.data?.some((row) => row.delivered != null || row.clicked != null))) && <CampaignSummaryCards workspace={workspace} />}
          {!SHOW_CAMPAIGN_WORKSPACE && <CurrentCampaigns
            workspace={workspace}
            onCreate={() => navigate({ view: 'create' })}
          />}
          {!SHOW_CAMPAIGN_WORKSPACE && <section
            className="mc-template-section"
            aria-labelledby="mc-template-heading"
            ref={templatesRef}
          >
            <header className="mc-template-heading">
              <div className="mc-template-intro">
                <h2 id="mc-template-heading">Campaign &amp; Automation Templates</h2>
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
                      <span className="mc-template-sample-badge">Sample preview</span>
                      <CampaignTemplatePreview type={template.id} />
                    </div>
                    <div className="mc-template-body">
                      <h3>{template.title}</h3>
                      <p>{template.description}</p>
                    </div>
                    <div className="mc-template-details">
                      <span className="mc-template-mode">{runLabels[template.mode]}</span>
                      <div
                        className="mc-template-tools"
                        aria-label="Suggested channels"
                      >
                        {template.channels.map((channel) => (
                          <span key={channel} className="mc-platform-badge" title={CAMPAIGN_CHANNELS[channel]}>
                            <PlatformLogo channel={channel} />
                            <span className="mc-template-channel-name">{CAMPAIGN_CHANNELS[channel]}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="mc-template-footer">
                      <button
                        className="mc-button mc-template-use"
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
          </section>}
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
              <div className="mc-campaign-list">
                {filtered.map((row) => (
                  <CampaignListRow
                    key={row.id}
                    campaign={row}
                    workspace={workspace}
                    filter={filter}
                  />
                ))}
              </div>
            )}
          </section>
          {!SHOW_CAMPAIGN_WORKSPACE && <CampaignAttention organisationId={organisationId} workspace={workspace} onRefresh={refresh} refreshing={refreshing} />}
        </>
      )}
    </main>
  )
}
