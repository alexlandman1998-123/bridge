import { BarChart3, CalendarDays, Globe2, Mail, Megaphone, MessageCircle } from 'lucide-react'

const capabilities = [
  { icon: Mail, title: 'Email campaigns', detail: 'Build audiences, send campaigns, and follow results.' },
  { icon: MessageCircle, title: 'WhatsApp campaigns', detail: 'Connect business accounts, use approved templates, and manage replies.' },
  { icon: CalendarDays, title: 'Show days', detail: 'Promote open houses, collect RSVPs, and follow up with attendees.' },
  { icon: Globe2, title: 'Website & landing pages', detail: 'Turn listing and campaign traffic into enquiry leads.' },
  { icon: BarChart3, title: 'Marketing performance', detail: 'See which campaigns, events, and sources create results.' },
]

export default function MarketingComingSoonPage() {
  return (
    <section className="page">
      <div className="panel card-tier-standard" style={{ display: 'grid', gap: '1.25rem', maxWidth: '56rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
          <div className="icon-badge" aria-hidden="true"><Megaphone size={22} /></div>
          <div style={{ display: 'grid', gap: '0.35rem' }}>
            <span className="eyebrow">Coming soon</span>
            <h1 style={{ margin: 0 }}>Marketing</h1>
            <p className="status-message" style={{ margin: 0 }}>
              Create demand, capture enquiries, and see what converts—all connected to your listings and leads.
            </p>
          </div>
        </div>

        <div className="stats-grid">
          {capabilities.map(({ icon: Icon, title, detail }) => (
            <article className="stat-card" key={title} style={{ display: 'grid', gap: '0.45rem' }}>
              <Icon size={19} aria-hidden="true" />
              <strong>{title}</strong>
              <span className="status-message">{detail}</span>
            </article>
          ))}
        </div>

        <p className="status-message" style={{ margin: 0 }}>
          Private viewings stay in the individual lead workflow. Marketing Events are for one-to-many activity, starting with Show Days.
        </p>
      </div>
    </section>
  )
}
