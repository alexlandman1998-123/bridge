import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, Target } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_STATUSES,
  channelProgress,
  linkedActivities,
} from '../../services/marketingCampaignService'
import { buildCampaignAnalytics } from '../../services/marketingCampaignAnalytics'
import CampaignPlatformLogo from './CampaignPlatformLogo'
import { campaignDemoMetrics } from '../../services/campaignDemoAnalytics'

const missing = 'Not connected'
const count = (value) => (value === null ? missing : value.toLocaleString())
const date = (value) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null

function CampaignCard({ campaign, workspace }) {
  const demo = campaignDemoMetrics(campaign)
  const money = (value) =>
    `ZAR ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const analytics = buildCampaignAnalytics({
    ...workspace,
    campaigns: [campaign],
  })
  const progress = (campaign.planned_channels || []).map((channel) => ({
    channel,
    status: channelProgress(workspace, campaign, channel),
  }))
  const attention = progress.find((item) =>
    ['Needs attention', 'Unavailable'].includes(item.status),
  )
  const upcoming = progress
    .flatMap(({ channel }) =>
      linkedActivities(workspace, campaign, channel).map(({ activity }) => ({
        ...activity,
        channel,
      })),
    )
    .filter(
      (activity) =>
        activity.status === 'scheduled' &&
        activity.scheduled_for &&
        Number.isFinite(Date.parse(activity.scheduled_for)),
    )
    .sort(
      (a, b) => Date.parse(a.scheduled_for) - Date.parse(b.scheduled_for),
    )[0]
  const next = attention
    ? `Review ${CAMPAIGN_CHANNELS[attention.channel]} activity`
    : upcoming
      ? `${CAMPAIGN_CHANNELS[upcoming.channel]} · ${new Date(upcoming.scheduled_for).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
      : campaign.status === 'draft'
        ? 'Review your plan and schedule the first activity'
        : 'Plan or link your next channel activity'
  const delivered = demo?.delivered ?? analytics.delivered
  const clicks = demo?.clicks ?? analytics.channels[0].engaged
  const reads = demo?.reads ?? analytics.channels[1].engaged
  const budget = demo
    ? money(demo.budget)
    : campaign.planned_budget != null &&
        Number.isFinite(Number(campaign.planned_budget))
      ? `${campaign.budget_currency || 'ZAR'} ${Number(campaign.planned_budget).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : missing
  return (
    <Link
      className="mc-current-card"
      to={`?section=campaigns&view=detail&id=${encodeURIComponent(campaign.id)}`}
      aria-label={`Open campaign: ${campaign.name}`}
    >
      <div className="mc-current-card-top">
        <div className="mc-current-card-heading">
          <strong className="mc-current-name">{campaign.name}</strong>
          <span className={`mc-status mc-status-${campaign.status}`}>
            {CAMPAIGN_STATUSES[campaign.status] || campaign.status}
          </span>
        </div>
        <span className="mc-current-dates">
          <CalendarDays size={14} aria-hidden="true" />
          {date(campaign.start_date) || 'Start date to confirm'}
          {campaign.end_date
            ? ` – ${date(campaign.end_date)}`
            : campaign.start_date
              ? ' · Ongoing'
              : ''}
          {demo && (
            <span className="mc-current-demo-badge">Demo analytics</span>
          )}
        </span>
      </div>
      <div className="mc-current-objective">
        <span>
          <Target size={14} aria-hidden="true" /> Objective
        </span>
        <p>{campaign.objective}</p>
      </div>
      <div className="mc-current-platforms" aria-label="Platform activity">
        {progress.map(({ channel, status }) => (
          <span key={channel}>
            <CampaignPlatformLogo channel={channel} />
            <span>
              {CAMPAIGN_CHANNELS[channel]}
              <small>{status}</small>
            </span>
          </span>
        ))}
      </div>
      <dl className="mc-current-budget">
        <div>
          <dt>Planned budget</dt>
          <dd
            className={
              budget === missing ? 'mc-current-unconnected' : undefined
            }
          >
            {budget}
          </dd>
        </div>
        <div>
          <dt>Spend</dt>
          <dd className={demo ? undefined : 'mc-current-unconnected'}>
            {demo ? money(demo.spend) : missing}
          </dd>
        </div>
        <div>
          <dt>Remaining</dt>
          <dd className={demo ? undefined : 'mc-current-unconnected'}>
            {demo ? money(demo.remaining) : missing}
          </dd>
        </div>
      </dl>
      <dl className="mc-current-results">
        <div>
          <dt>Leads</dt>
          <dd className={demo ? undefined : 'mc-current-unconnected'}>
            {demo ? count(demo.leads) : missing}
          </dd>
        </div>
        <div>
          <dt>Views</dt>
          <dd className={demo ? undefined : 'mc-current-unconnected'}>
            {demo ? count(demo.views) : missing}
          </dd>
        </div>
        <div>
          <dt>Email clicks</dt>
          <dd
            className={clicks === null ? 'mc-current-unconnected' : undefined}
          >
            {count(clicks)}
          </dd>
        </div>
        <div>
          <dt>Delivered</dt>
          <dd
            className={
              delivered === null ? 'mc-current-unconnected' : undefined
            }
          >
            {count(delivered)}
          </dd>
        </div>
        <div>
          <dt>WhatsApp reads</dt>
          <dd className={reads === null ? 'mc-current-unconnected' : undefined}>
            {count(reads)}
          </dd>
        </div>
      </dl>
      <div className="mc-current-next">
        <span>
          <small>{attention ? 'Needs attention' : 'Next action'}</small>
          <strong>{next}</strong>
        </span>
        <ArrowRight size={18} aria-hidden="true" />
      </div>
    </Link>
  )
}

function CampaignCarousel({ campaigns, workspace }) {
  const track = useRef(null)
  const [position, setPosition] = useState({ index: 0, visible: 2 })
  const measure = useCallback(() => {
    const element = track.current
    const card = element?.firstElementChild
    if (!card) return
    const step = card.getBoundingClientRect().width + 20
    const visible = Math.max(
      1,
      Math.floor((element.clientWidth + 20) / step + 0.01),
    )
    const index = Math.max(
      0,
      Math.min(
        campaigns.length - visible,
        Math.round(element.scrollLeft / step),
      ),
    )
    setPosition((previous) =>
      previous.index === index && previous.visible === visible
        ? previous
        : { index, visible },
    )
  }, [campaigns.length])
  useEffect(() => {
    measure()
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (track.current) observer?.observe(track.current)
    return () => observer?.disconnect()
  }, [measure])
  function move(direction) {
    const element = track.current
    const step = element.firstElementChild.getBoundingClientRect().width + 20
    element.scrollBy({
      left: direction * step,
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    })
  }
  const last = Math.min(campaigns.length, position.index + position.visible)
  return (
    <>
      <div
        className="mc-current-track"
        ref={track}
        id="mc-current-track"
        onScroll={measure}
        role="group"
        aria-label="Current campaign cards"
        tabIndex={0}
      >
        {campaigns.map((campaign) => (
          <CampaignCard
            key={campaign.id}
            campaign={campaign}
            workspace={workspace}
          />
        ))}
      </div>
      {campaigns.length > position.visible && (
        <footer className="mc-current-controls">
          <div>
            <button
              className="mc-button"
              aria-label="Previous campaigns"
              aria-controls="mc-current-track"
              disabled={position.index === 0}
              onClick={() => move(-1)}
            >
              <ArrowLeft size={17} />
            </button>
            <button
              className="mc-button"
              aria-label="Next campaigns"
              aria-controls="mc-current-track"
              disabled={last >= campaigns.length}
              onClick={() => move(1)}
            >
              <ArrowRight size={17} />
            </button>
          </div>
        </footer>
      )}
    </>
  )
}

export default function CurrentCampaigns({ workspace, onCreate }) {
  const campaigns = workspace.campaigns.filter((campaign) =>
    ['active', 'scheduled'].includes(campaign.status),
  )
  return (
    <section className="mc-current" aria-label="Current campaigns">
      {campaigns.length ? (
        <CampaignCarousel
          key={campaigns.map((campaign) => campaign.id).join(',')}
          campaigns={campaigns}
          workspace={workspace}
        />
      ) : (
        <div className="mc-current-empty">
          <Target size={24} aria-hidden="true" />
          <h3>No active or scheduled campaigns</h3>
          <p>Your campaigns will appear here once active or scheduled.</p>
          <button className="mc-button" onClick={onCreate}>
            Create campaign
          </button>
        </div>
      )}
    </section>
  )
}
