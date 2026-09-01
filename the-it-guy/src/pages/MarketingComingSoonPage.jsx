import { ArrowUpRight, BarChart3, CalendarDays, Check, Globe2, Mail, Megaphone, MessageCircle, Sparkles } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { CreateEmailCampaign, EmailCampaignOverview } from '../components/marketing/EmailCampaigns'
import { ShowDayDetail, ShowDaysOverview } from '../components/marketing/ShowDays'
import { CreateWhatsAppCampaign, WhatsAppCampaignOverview } from '../components/marketing/WhatsAppCampaigns'
import './MarketingComingSoonPage.css'
import './WhatsAppCampaigns.css'
import './EmailCampaigns.css'
import './ShowDays.css'

const campaignChannels = [
  { icon: Mail, title: 'Email', detail: 'Audience building, campaign delivery, and conversion reporting.' },
  { icon: MessageCircle, title: 'WhatsApp', detail: 'Connected business accounts, approved templates, and replies in context.' },
]

const eventTypes = [
  { title: 'Show Days', detail: 'Promote, capture RSVPs, check in attendees, and follow up.' },
  { title: 'Auctions & Launches', detail: 'Event-driven demand generation for your next phase of growth.' },
]

export default function MarketingComingSoonPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const section = searchParams.get('section')
  const campaignView = searchParams.get('view')

  if (section === 'show-days') {
    const openOverview = () => setSearchParams({ section: 'show-days' })
    const openShowDay = (showDayId) => setSearchParams({ section: 'show-days', view: 'detail', id: showDayId })
    return campaignView === 'detail'
      ? <ShowDayDetail onBack={openOverview} />
      : <ShowDaysOverview onOpenShowDay={openShowDay} />
  }

  if (section === 'email') {
    const openOverview = () => setSearchParams({ section: 'email' })
    const openCreateCampaign = () => setSearchParams({ section: 'email', view: 'create' })
    return campaignView === 'create'
      ? <CreateEmailCampaign onBack={openOverview} />
      : <EmailCampaignOverview onCreateCampaign={openCreateCampaign} />
  }

  if (section === 'whatsapp') {
    const openOverview = () => setSearchParams({ section: 'whatsapp' })
    const openCreateCampaign = () => setSearchParams({ section: 'whatsapp', view: 'create' })
    return campaignView === 'create'
      ? <CreateWhatsAppCampaign onBack={openOverview} />
      : <WhatsAppCampaignOverview onCreateCampaign={openCreateCampaign} />
  }

  return (
    <main className="marketing-launch-page">
      <section className="marketing-launch-hero">
        <div className="marketing-launch-orb marketing-launch-orb-one" aria-hidden="true" />
        <div className="marketing-launch-orb marketing-launch-orb-two" aria-hidden="true" />
        <div className="marketing-launch-hero-content">
          <div className="marketing-launch-kicker"><Sparkles size={15} /> Coming soon</div>
          <h1>Marketing that turns attention into opportunity.</h1>
          <p>
            A connected workspace for campaigns, show days, and digital lead capture—built around your listings and pipeline.
          </p>
          <div className="marketing-launch-flow" aria-label="Marketing flow">
            <span>Campaign</span><ArrowUpRight size={14} /><span>Enquiry</span><ArrowUpRight size={14} /><span>Lead</span><ArrowUpRight size={14} /><span>Viewing</span>
          </div>
        </div>
        <div className="marketing-launch-mark" aria-hidden="true"><Megaphone size={42} /></div>
      </section>

      <section className="marketing-launch-content" aria-label="Marketing roadmap">
        <div className="marketing-launch-section-heading">
          <div>
            <span>THE MARKETING WORKSPACE</span>
            <h2>One place to create demand and measure what works.</h2>
          </div>
          <div className="marketing-launch-status"><Check size={14} /> Planned for release</div>
        </div>

        <div className="marketing-launch-grid">
          <article className="marketing-launch-card marketing-launch-card-campaigns">
            <div className="marketing-launch-card-icon"><Megaphone size={19} /></div>
            <span className="marketing-launch-card-label">CAMPAIGNS</span>
            <h3>Reach the right audience, on the right channel.</h3>
            <div className="marketing-launch-channel-list">
              {campaignChannels.map(({ icon: Icon, title, detail }) => (
                <div className="marketing-launch-channel" key={title}>
                  <Icon size={17} /><div><strong>{title}</strong><p>{detail}</p></div>
                </div>
              ))}
            </div>
          </article>

          <article className="marketing-launch-card marketing-launch-card-events">
            <div className="marketing-launch-card-icon"><CalendarDays size={19} /></div>
            <span className="marketing-launch-card-label">EVENTS</span>
            <h3>Make every open house a measurable campaign.</h3>
            <div className="marketing-launch-event-list">
              {eventTypes.map(({ title, detail }) => <div key={title}><strong>{title}</strong><p>{detail}</p></div>)}
            </div>
          </article>

          <article className="marketing-launch-card marketing-launch-card-website">
            <div className="marketing-launch-card-icon"><Globe2 size={19} /></div>
            <span className="marketing-launch-card-label">WEBSITE & LANDING PAGES</span>
            <h3>Convert visits into enquiries automatically.</h3>
            <p>Build branded pages around listings, campaigns, and events—with every enquiry delivered straight to your lead pipeline.</p>
          </article>

          <article className="marketing-launch-card marketing-launch-card-performance">
            <div className="marketing-launch-card-icon"><BarChart3 size={19} /></div>
            <span className="marketing-launch-card-label">MARKETING PERFORMANCE</span>
            <h3>Know what created the next opportunity.</h3>
            <p>Follow the journey from source and campaign through to enquiry, viewing, offer, and conversion.</p>
          </article>
        </div>

        <aside className="marketing-launch-note">
          <span>Private viewings stay with the lead.</span>
          <p>Marketing Events are for one-to-many activity, beginning with Show Days.</p>
        </aside>
      </section>
    </main>
  )
}
