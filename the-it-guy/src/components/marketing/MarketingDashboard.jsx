import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Eye,
  Mail,
  Megaphone,
  MessageCircle,
  Plus,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import {
  channelPerformance,
  marketingDashboardStats,
  marketingSources,
  marketingTrend,
  recentMarketingActivity,
  upcomingMarketingEvents,
} from '../../data/marketingDashboard'

const statIcons = { campaigns: Megaphone, reach: UsersRound, engagement: Eye, leads: Sparkles }
const channelIcons = { Email: Mail, WhatsApp: MessageCircle }

function MarketingStats() {
  return (
    <section className="md-stats" aria-label="Marketing performance summary">
      {marketingDashboardStats.map((stat) => {
        const Icon = statIcons[stat.id]
        return (
          <article className={`md-stat md-tone-${stat.tone}`} key={stat.id}>
            <span className="md-stat-icon"><Icon size={19} /></span>
            <span className="md-stat-copy"><strong>{stat.value}</strong><span>{stat.label}</span><small>{stat.change}</small></span>
          </article>
        )
      })}
    </section>
  )
}

function TrendChart() {
  const points = (key) => marketingTrend.map((item, index) => `${index * 25},${100 - item[key]}`).join(' ')
  return (
    <article className="md-card md-trend-card">
      <header className="md-card-header">
        <div><span className="md-eyebrow">PERFORMANCE</span><h2>Campaign engagement</h2><p>Email opens and WhatsApp reads over the last 30 days</p></div>
        <button className="md-period" type="button">Last 30 days <CalendarDays size={15} /></button>
      </header>
      <div className="md-chart-wrap">
        <div className="md-chart-y" aria-hidden="true"><span>80%</span><span>60%</span><span>40%</span><span>20%</span><span>0%</span></div>
        <div className="md-chart">
          <div className="md-chart-grid" aria-hidden="true"><i /><i /><i /><i /><i /></div>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Email and WhatsApp engagement both increased during the last 30 days">
            <defs><linearGradient id="mdGreenArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1a9364" stopOpacity=".2" /><stop offset="1" stopColor="#1a9364" stopOpacity="0" /></linearGradient></defs>
            <polygon points={`0,100 ${points('whatsapp')} 100,100`} fill="url(#mdGreenArea)" />
            <polyline points={points('email')} className="md-line md-line-email" />
            <polyline points={points('whatsapp')} className="md-line md-line-whatsapp" />
          </svg>
          <div className="md-chart-x" aria-hidden="true">{marketingTrend.map((item) => <span key={item.label}>{item.label}</span>)}</div>
        </div>
      </div>
      <div className="md-legend"><span><i className="md-legend-email" /> Email open rate</span><span><i className="md-legend-whatsapp" /> WhatsApp read rate</span></div>
    </article>
  )
}

function ChannelPerformance() {
  return (
    <article className="md-card md-channel-card">
      <header className="md-card-header"><div><span className="md-eyebrow">CHANNELS</span><h2>Channel performance</h2><p>Current month at a glance</p></div></header>
      <div className="md-channel-list">
        {channelPerformance.map((channel) => {
          const Icon = channelIcons[channel.label]
          return (
            <section className={`md-channel md-channel-${channel.id}`} key={channel.id}>
              <div className="md-channel-title"><span><Icon size={17} /></span><strong>{channel.label}</strong></div>
              <dl><div><dt>Sent</dt><dd>{channel.sent}</dd></div><div><dt>Engagement</dt><dd>{channel.engagement}</dd></div><div><dt>Leads</dt><dd>{channel.leads}</dd></div></dl>
              <div className="md-progress" aria-label={`${channel.label} relative performance ${channel.progress}%`}><span style={{ width: `${channel.progress}%` }} /></div>
            </section>
          )
        })}
      </div>
    </article>
  )
}

function RecentCampaigns({ onNavigate }) {
  return (
    <article className="md-card md-recent-card">
      <header className="md-card-header"><div><span className="md-eyebrow">RECENT ACTIVITY</span><h2>Recent campaigns</h2></div><button className="md-text-button" type="button" onClick={() => onNavigate('email')}>View campaigns <ArrowRight size={14} /></button></header>
      <div className="md-table-wrap">
        <table className="md-table">
          <thead><tr><th>Campaign</th><th>Channel</th><th>Sent</th><th>Engagement</th><th>Status</th></tr></thead>
          <tbody>{recentMarketingActivity.map((campaign) => { const Icon = channelIcons[campaign.type]; return <tr key={campaign.id}><td><strong>{campaign.title}</strong><span>{campaign.audience}</span></td><td><span className={`md-type md-type-${campaign.type.toLowerCase()}`}><Icon size={13} /> {campaign.type}</span></td><td>{campaign.date}</td><td><strong>{campaign.engagement}</strong></td><td><span className="md-status">{campaign.status}</span></td></tr> })}</tbody>
        </table>
      </div>
    </article>
  )
}

function UpcomingActivity({ onNavigate }) {
  return (
    <article className="md-card md-upcoming-card">
      <header className="md-card-header"><div><span className="md-eyebrow">UP NEXT</span><h2>Upcoming activity</h2></div></header>
      <div className="md-upcoming-list">
        {upcomingMarketingEvents.map((event) => <button type="button" onClick={() => onNavigate(event.type === 'Show Day' ? 'show-days' : 'launches')} key={event.id}><span className="md-event-date"><CalendarDays size={17} /></span><span className="md-event-copy"><small>{event.type}</small><strong>{event.title}</strong><span>{event.meta}</span></span><span className="md-event-count">{event.registrations}</span><ArrowRight size={15} /></button>)}
      </div>
    </article>
  )
}

function SourceBreakdown() {
  return (
    <article className="md-card md-source-card">
      <header className="md-card-header"><div><span className="md-eyebrow">ATTRIBUTION</span><h2>Leads by source</h2><p>67 marketing-generated leads this month</p></div></header>
      <div className="md-source-total"><span>67</span><small>Total leads</small></div>
      <div className="md-source-list">{marketingSources.map((source) => <div key={source.label}><div><span>{source.label}</span><strong>{source.value}</strong></div><div className={`md-source-bar md-source-${source.tone}`}><span style={{ width: `${source.percentage}%` }} /></div></div>)}</div>
    </article>
  )
}

function QuickActions({ onNavigate }) {
  const actions = [
    { label: 'Email campaign', detail: 'Create an email', icon: Mail, section: 'email' },
    { label: 'WhatsApp campaign', detail: 'Start a message', icon: MessageCircle, section: 'whatsapp' },
    { label: 'Show day', detail: 'Plan an open home', icon: CalendarDays, section: 'show-days' },
    { label: 'Launch', detail: 'Create a launch', icon: Sparkles, section: 'launches' },
  ]
  return <section className="md-quick-actions" aria-label="Quick actions"><div><span className="md-eyebrow">QUICK ACTIONS</span><h2>Create new marketing</h2></div>{actions.map((action) => { const ActionIcon = action.icon; return <button type="button" onClick={() => onNavigate(action.section)} key={action.label}><span><ActionIcon size={16} /></span><span><strong>{action.label}</strong><small>{action.detail}</small></span><Plus size={15} /></button> })}</section>
}

export default function MarketingDashboard({ onNavigate }) {
  return (
    <div className="wa-page marketing-dashboard">
      <div className="md-topline"><div><span className="md-eyebrow">MARKETING OVERVIEW</span><h1>Good morning, Alex</h1><p>Here’s how your marketing is performing across every channel.</p></div><span className="md-demo-label"><BarChart3 size={14} /> This month</span></div>
      <MarketingStats />
      <QuickActions onNavigate={onNavigate} />
      <section className="md-primary-grid"><TrendChart /><ChannelPerformance /></section>
      <section className="md-secondary-grid"><RecentCampaigns onNavigate={onNavigate} /><div className="md-side-stack"><UpcomingActivity onNavigate={onNavigate} /><SourceBreakdown /></div></section>
    </div>
  )
}
