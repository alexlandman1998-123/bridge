import { ArrowRight, Layers } from 'lucide-react'
import CampaignPlatformLogo from './CampaignPlatformLogo'
import './CampaignStudioFormats.css'

const formats = [
  {
    id: 'email',
    name: 'Email',
    description: 'Subjects, messages and calls to action for your next send.',
    sample: 'A little local insight.',
    kind: 'Newsletter · Invitations · Follow-ups',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'Personal messages that keep the conversation moving.',
    sample: 'Hello, let’s talk about your next move.',
    kind: 'Introductions · Updates · Check-ins',
  },
  {
    id: 'meta',
    name: 'Meta ads',
    description: 'Headlines and ad copy built around your next offer.',
    sample: 'Your next chapter starts here.',
    kind: 'Lead generation · Listings · Awareness',
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT Ads',
    description: 'Prepare helpful ad copy for people exploring their next move.',
    sample: 'Find a home that fits your plans.',
    kind: 'Property discovery · Valuations · Viewing enquiries',
  },
  {
    id: 'social',
    name: 'Organic social',
    description: 'Captions and stories for a consistent presence.',
    sample: 'At home in your neighbourhood.',
    kind: 'Property posts · Local stories · Personal brand',
  },
]
export default function CampaignStudioFormats({
  onOpenFormat,
  onOpenCampaigns,
}) {
  return (
    <section className="cs-formats" aria-label="Marketing formats">
      <div className="cs-format-grid">
        {formats.map((format) => (
          <button
            type="button"
            key={format.id}
            className={`cs-format cs-format-${format.id}`}
            aria-label={`${format.name} templates`}
            onClick={() => onOpenFormat(format.id)}
          >
            <div className="cs-format-copy">
              <span className="cs-format-icon" aria-hidden="true">
                <CampaignPlatformLogo channel={format.id} />
              </span>
              <h3>{format.name}</h3>
              <p>{format.description}</p>
              <span className="cs-format-open">
                Open workspace <ArrowRight size={17} aria-hidden="true" />
              </span>
            </div>
            <div className="cs-format-art" aria-hidden="true">
              <div className="cs-art-sheet">
                <span className="cs-art-topline" />
                <strong>{format.sample}</strong>
                <span className="cs-art-line" />
                <span className="cs-art-line cs-art-line-short" />
                <span className="cs-art-action" />
              </div>
              <span className="cs-art-orbit" />
            </div>
            <span className="cs-format-kind">{format.kind}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="cs-campaign-format"
        onClick={onOpenCampaigns}
        aria-label="Campaign & Automation Templates"
      >
        <span className="cs-campaign-icon" aria-hidden="true">
          <Layers size={27} />
        </span>
        <span>
          <strong>Campaign &amp; Automation Templates</strong>
          <small>
            Bring your channels together with a complete campaign playbook.
          </small>
        </span>
        <ArrowRight size={22} aria-hidden="true" />
      </button>
    </section>
  )
}
