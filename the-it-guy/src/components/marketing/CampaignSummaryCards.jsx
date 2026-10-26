import { CalendarClock, Mail, Radio, Send } from 'lucide-react'
import { buildCampaignAnalytics } from '../../services/marketingCampaignAnalytics'
import { campaignDemoSummary } from '../../services/campaignDemoAnalytics'

export default function CampaignSummaryCards({ workspace }) {
  const analytics = buildCampaignAnalytics(workspace)
  const demo = campaignDemoSummary(workspace.campaigns)
  const cards = [
    {
      label: 'Active campaigns',
      value: workspace.campaigns.filter(
        (campaign) => campaign.status === 'active',
      ).length,
      detail: 'Running campaign plans',
      Icon: Radio,
    },
    {
      label: 'Scheduled campaigns',
      value: workspace.campaigns.filter(
        (campaign) => campaign.status === 'scheduled',
      ).length,
      detail: 'Plans awaiting their start',
      Icon: CalendarClock,
    },
    {
      label: 'Messages delivered',
      value: demo?.delivered ?? analytics.delivered,
      demo: Boolean(demo),
      detail: demo
        ? `Demo data · ${demo.count} mock ${demo.count === 1 ? 'campaign' : 'campaigns'}`
        : 'Linked email and WhatsApp activity',
      Icon: Send,
    },
    {
      label: 'Email clicks',
      value: demo?.clicks ?? analytics.channels[0].engaged,
      demo: Boolean(demo),
      detail: demo
        ? `Demo data · ${demo.count} mock ${demo.count === 1 ? 'campaign' : 'campaigns'}`
        : 'Recorded clicks from linked emails',
      Icon: Mail,
    },
  ]
  return (
    <section className="mc-summary-cards" aria-label="Campaign snapshot">
      <dl>
        {cards.map((card) => (
          <div className="mc-summary-card" key={card.label}>
            <dt>
              <span>
                {card.label}
                {card.demo && (
                  <span className="mc-summary-demo-badge">Demo</span>
                )}
              </span>
              <span className="mc-summary-icon">
                <card.Icon size={17} strokeWidth={1.6} aria-hidden="true" />
              </span>
            </dt>
            <dd>
              <strong>
                {card.value === null ? '—' : card.value.toLocaleString()}
              </strong>
              <small>
                {card.value === null ? 'Results not available' : card.detail}
              </small>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
