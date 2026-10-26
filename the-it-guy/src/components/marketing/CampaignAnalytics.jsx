import { useState } from 'react'
import {
  ArrowRight,
  ChartNoAxesCombined,
  CircleHelp,
  Layers3,
  Sparkles,
  Target,
  Send,
  MousePointer2,
  MessageCircle,
} from 'lucide-react'
import { MarketingLink as Link } from './MarketingNavigation.jsx'
import { buildCampaignAnalytics } from '../../services/marketingCampaignAnalytics'
import CampaignPlatformLogo from './CampaignPlatformLogo'
const number = (value) => (value === null ? '—' : value.toLocaleString())
const percentage = (value) => (value === null ? '—' : `${value.toFixed(1)}%`)

export default function CampaignAnalytics({ workspace }) {
  const [selected, setSelected] = useState('email')
  const [showReason, setShowReason] = useState(false)
  const analytics = buildCampaignAnalytics(workspace)
  const channel = analytics.channels.find((item) => item.key === selected)
  const recommendation = analytics.recommendation
  const reviewPlan = channel.firstCampaign || workspace.campaigns?.[0]?.id
  const emptyResultsUrl = reviewPlan
    ? `/marketing?section=campaigns&view=detail&id=${encodeURIComponent(reviewPlan)}&tab=activity`
    : '/marketing?section=campaigns&view=templates'
  return (
    <section className="mc-insights" aria-labelledby="mc-insights-heading">
      <header className="mc-insights-heading">
        <span className="mc-insights-heading-icon" aria-hidden="true">
          <ChartNoAxesCombined size={20} strokeWidth={1.7} />
        </span>
        <div className="mc-insights-heading-copy">
          <h2 id="mc-insights-heading">Campaign performance</h2>
        </div>
        <span className="mc-insights-period">All time</span>
      </header>
      <div
        className="mc-insights-summary"
        aria-label="Recorded linked campaign results"
      >
        <div>
          <span><Send size={17} aria-hidden="true" />Delivered messages</span>
          <strong>{number(analytics.delivered)}</strong>
          <small>Across linked email and WhatsApp sends</small>
        </div>
        <div>
          <span><MousePointer2 size={17} aria-hidden="true" />Email clicks</span>
          <strong>{number(analytics.channels[0].engaged)}</strong>
          <small>Recorded recipient clicks</small>
        </div>
        <div>
          <span><MessageCircle size={17} aria-hidden="true" />WhatsApp reads</span>
          <strong>{number(analytics.channels[1].engaged)}</strong>
          <small>Recorded message reads</small>
        </div>
      </div>
      <div className="mc-insights-grid">
        <article className="mc-insight-panel mc-top-campaigns">
          <header>
            <span className="mc-insight-icon">
              <Target size={17} />
            </span>
            <div>
              <h3>Top campaigns</h3>
            </div>
          </header>
          <nav
            className="mc-ranking-tabs"
            aria-label="Rank campaigns by channel"
          >
            {analytics.channels.map((item) => (
              <button
                key={item.key}
                aria-pressed={selected === item.key}
                onClick={() => setSelected(item.key)}
              >
                <CampaignPlatformLogo channel={item.key} />
                {item.name}
              </button>
            ))}
          </nav>
          {channel.rankings.length ? (
            <>
              <div className="mc-ranking-labels">
                <span>Campaign</span>
                <span>{channel.metricLabel}</span>
              </div>
              <ol className="mc-ranking-list">
                {channel.rankings.slice(0, 3).map((item, index) => (
                  <li key={item.id}>
                    <Link to={item.url}>
                      <span className="mc-rank-number">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="mc-rank-copy">
                        <strong>{item.name}</strong>
                        <small>
                          {number(item.engaged)} {channel.actionLabel} /{' '}
                          {number(item.delivered)} delivered
                          {item.delivered < 20 ? ' · Small sample' : ''}
                        </small>
                        <span className="mc-rank-track" aria-hidden="true">
                          <span style={{ width: `${item.rate}%` }} />
                        </span>
                      </span>
                      <strong className="mc-rank-rate">
                        {percentage(item.rate)}
                      </strong>
                      <ArrowRight size={14} />
                    </Link>
                  </li>
                ))}
              </ol>
              <p className="mc-insight-footnote">
                {channel.incomplete && 'Incomplete campaigns are excluded. '}
                Rates use delivered messages. Volume is shown alongside each
                rate.
              </p>
            </>
          ) : (
            <div className="mc-insight-empty">
              <Layers3 size={25} strokeWidth={1.3} />
              <strong>
                {channel.unavailable || channel.incomplete
                  ? 'Results need a complete view.'
                  : 'Your next benchmark starts here.'}
              </strong>
              <p>
                {channel.unavailable || channel.incomplete
                  ? 'Unavailable or incomplete results are excluded from rankings.'
                  : `Link ${selected === 'email' ? 'an email' : 'a WhatsApp'} send with delivered messages to see your top campaigns.`}
              </p>
              <Link to={emptyResultsUrl}>
                {reviewPlan ? 'Review campaign activity' : 'Explore templates'}{' '}
                <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </article>
        <article className="mc-insight-panel mc-channel-performance">
          <header>
            <span className="mc-insight-icon">
              <ChartNoAxesCombined size={17} />
            </span>
            <div>
              <h3>Channel performance</h3>
            </div>
          </header>
          <div className="mc-channel-insight-list">
            {analytics.channels.map((item) => (
              <div className={`mc-channel-insight mc-channel-insight-${item.key}`} key={item.key}>
                <div className="mc-channel-insight-title">
                  <span>
                    <CampaignPlatformLogo channel={item.key} />
                    <strong>{item.name}</strong>
                  </span>
                  <small>
                    {item.unavailable || item.incomplete
                      ? 'Results unavailable'
                      : item.linkedCount
                        ? `${item.linkedCount} linked ${item.linkedCount === 1 ? 'send' : 'sends'}`
                        : 'No linked activity'}
                  </small>
                </div>
                <div className="mc-channel-insight-rate">
                  <strong>{percentage(item.rate)}</strong>
                  <span>{item.metricLabel.toLowerCase()}</span>
                  <small>{number(item.delivered)} delivered</small>
                </div>
                <div className={`mc-channel-insight-bar${item.rate === null ? ' mc-channel-insight-bar-empty' : ''}`} aria-hidden="true">
                  <span style={{ width: `${item.rate ?? 0}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mc-unconnected-platforms">
            {[
              ['meta', 'Meta'],
              ['social', 'Organic social'],
            ].map(([key, label]) => (
              <span key={key}>
                <CampaignPlatformLogo channel={key} />
                <span>
                  {label}
                  <small>Not connected</small>
                </span>
              </span>
            ))}
          </div>
          <p className="mc-insight-footnote">
            Email clicks and WhatsApp reads measure different actions.
          </p>
        </article>
        <article className="mc-insight-panel mc-arch-recommendation">
          <header>
            <span className="mc-arch-orb">
              <Sparkles size={18} />
            </span>
            <div>
              <h3>Arch9 recommends</h3>
            </div>
          </header>
          <span className="mc-recommendation-signal">
            <span />
            {recommendation.signal}
          </span>
          <h4>{recommendation.title}</h4>
          <p className="mc-recommendation-body">{recommendation.body}</p>
          <Link className="mc-recommendation-action" to={recommendation.url}>
            {recommendation.action}
            <ArrowRight size={16} />
          </Link>
          <button
            className="mc-recommendation-why"
            aria-expanded={showReason}
            aria-controls="mc-recommendation-reason"
            onClick={() => setShowReason(!showReason)}
          >
            <CircleHelp size={14} /> Why this recommendation?
          </button>
          {showReason && (
            <p
              id="mc-recommendation-reason"
              className="mc-recommendation-reason"
            >
              {recommendation.reason}
            </p>
          )}
          <footer>
            <span /> Rule-based insight · Recorded activity
          </footer>
        </article>
      </div>
    </section>
  )
}
