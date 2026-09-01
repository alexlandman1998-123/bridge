import { useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Eye,
  FileText,
  Info,
  MessageCircle,
  MoreHorizontal,
  Search,
  Send,
  UsersRound,
} from 'lucide-react'
import {
  whatsappCampaignDraft,
  whatsappCampaignStats,
  whatsappCampaignSteps,
  whatsappCampaigns,
} from '../../data/whatsappCampaigns'

const statIcons = {
  campaigns: Send,
  recipients: UsersRound,
  delivered: CheckCircle2,
  read: Eye,
}

export function WhatsAppCampaignStats() {
  return (
    <section className="wa-stats" aria-label="WhatsApp campaign performance">
      {whatsappCampaignStats.map((stat) => {
        const Icon = statIcons[stat.id]
        return (
          <article className={`wa-stat wa-stat-${stat.id}`} key={stat.id}>
            <span className="wa-stat-icon"><Icon size={19} /></span>
            <span className="wa-stat-copy">
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
              <small>{stat.detail}</small>
            </span>
          </article>
        )
      })}
    </section>
  )
}

export function WhatsAppCampaignFilters() {
  return (
    <section className="wa-filter-row" aria-label="Campaign filters">
      <label className="wa-search">
        <Search size={17} aria-hidden="true" />
        <span className="sr-only">Search campaigns</span>
        <input type="search" placeholder="Search campaigns..." />
      </label>
      <button className="wa-filter-control" type="button">All statuses <ChevronDown size={15} /></button>
      <button className="wa-filter-control" type="button">Last 30 days <CalendarDays size={16} /></button>
    </section>
  )
}

export function WhatsAppCampaignCard({ campaign }) {
  return (
    <article className="wa-campaign-card">
      {campaign.thumbnail ? (
        <img className="wa-campaign-thumbnail" src={campaign.thumbnail} alt={campaign.thumbnailAlt || ''} />
      ) : null}
      <div className="wa-campaign-main">
        <div className="wa-campaign-heading">
          <div>
            <h3>{campaign.name}</h3>
            <p>Sent to <strong>{campaign.audience}</strong></p>
          </div>
          <span className="wa-status wa-status-sent">{campaign.status}</span>
        </div>
        <p className="wa-sent-time"><CalendarDays size={13} /> Sent {campaign.sentAt}</p>
        <dl className="wa-metrics">
          <div><dt>Recipients</dt><dd>{campaign.recipients}</dd></div>
          <div><dt>Delivered</dt><dd>{campaign.delivered} <span>({campaign.deliveredRate})</span></dd></div>
          <div><dt>Read</dt><dd>{campaign.read} <span>({campaign.readRate})</span></dd></div>
          <div><dt>Replies</dt><dd>{campaign.replies}</dd></div>
        </dl>
      </div>
      <button className="wa-more" type="button" aria-label={`More options for ${campaign.name}`}><MoreHorizontal size={18} /></button>
    </article>
  )
}

function WhatsAppCampaignDraft({ onContinue }) {
  return (
    <article className="wa-draft-card">
      <span className="wa-draft-icon"><FileText size={22} /></span>
      <div>
        <h3>{whatsappCampaignDraft.name}</h3>
        <p><Clock3 size={13} /> {whatsappCampaignDraft.updatedAt}</p>
      </div>
      <span className="wa-status wa-status-draft">{whatsappCampaignDraft.status}</span>
      <button className="wa-secondary-button" type="button" onClick={onContinue}>Continue</button>
    </article>
  )
}

export function WhatsAppCampaignOverview({ onCreateCampaign }) {
  const [activeTab, setActiveTab] = useState('All Campaigns')
  const tabs = ['All Campaigns', 'Scheduled', 'Sent', 'Drafts']

  return (
    <div className="wa-page">
      <header className="wa-page-header">
        <div className="wa-title-block">
          <span className="wa-brand-icon"><MessageCircle size={24} /></span>
          <div>
            <h1>WhatsApp Campaigns</h1>
            <p>Create, manage and track your WhatsApp marketing campaigns.</p>
          </div>
        </div>
        <button className="wa-primary-button" type="button" onClick={onCreateCampaign}>Create Campaign <ChevronRight size={16} /></button>
      </header>

      <WhatsAppCampaignStats />

      <section className="wa-campaigns-panel">
        <div className="wa-tabs" role="tablist" aria-label="Campaign status">
          {tabs.map((tab) => (
            <button
              className={activeTab === tab ? 'wa-tab-active' : ''}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              key={tab}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="wa-campaigns-content">
          <WhatsAppCampaignFilters />
          <div className="wa-campaign-list">
            {whatsappCampaigns.map((campaign) => <WhatsAppCampaignCard campaign={campaign} key={campaign.id} />)}
            <WhatsAppCampaignDraft onContinue={onCreateCampaign} />
          </div>
          <footer className="wa-list-footer">
            <span>Showing 1–3 of 12 campaigns</span>
            <div aria-label="Pagination"><button type="button" className="wa-page-number wa-page-number-active">1</button><button type="button" className="wa-page-number">2</button><button type="button" className="wa-page-number">3</button></div>
          </footer>
        </div>
      </section>
    </div>
  )
}

export function CampaignStepHeader({ activeStep }) {
  return (
    <ol className="wa-step-header" aria-label="Campaign creation steps">
      {whatsappCampaignSteps.map((step) => (
        <li className={activeStep === step.id ? 'wa-step-active' : activeStep > step.id ? 'wa-step-complete' : ''} key={step.id}>
          <span className="wa-step-number">{activeStep > step.id ? <Check size={14} /> : step.id}</span>
          <span className="wa-step-copy"><strong>{step.label}</strong><small>{step.detail}</small></span>
        </li>
      ))}
    </ol>
  )
}

function ChoiceCard({ checked, name, title, detail, onChange }) {
  return (
    <label className={`wa-choice-card ${checked ? 'wa-choice-card-selected' : ''}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      <span><strong>{title}</strong><small>{detail}</small></span>
    </label>
  )
}

export function CampaignDetailsForm({ onNext }) {
  const [campaignName, setCampaignName] = useState('New Listing: 3 Bedroom Home in Constantia Park')
  const [campaignType, setCampaignType] = useState('marketing')
  const [schedule, setSchedule] = useState('now')

  return (
    <section className="wa-form-card">
      <div className="wa-card-heading"><span>Step 1 of 4</span><h2>Campaign details</h2><p>Set up the essentials for your campaign.</p></div>
      <div className="wa-form-fields">
        <label className="wa-field-label">
          <span>Campaign name</span>
          <span className="wa-input-shell"><input value={campaignName} maxLength={100} onChange={(event) => setCampaignName(event.target.value)} /><small>{campaignName.length}/100</small></span>
        </label>
        <label className="wa-field-label">
          <span>WhatsApp sender (from)</span>
          <span className="wa-sender-select">
            <span className="wa-sender-icon"><MessageCircle size={18} /></span>
            <span><strong>Home Seekers</strong><small>+27 82 123 4567</small></span>
            <ChevronDown size={16} />
          </span>
        </label>
        <fieldset className="wa-fieldset">
          <legend>Campaign type</legend>
          <div className="wa-choice-grid">
            <ChoiceCard name="campaign-type" title="Marketing / Promotional" detail="Promote listings, offers or company updates" checked={campaignType === 'marketing'} onChange={() => setCampaignType('marketing')} />
            <ChoiceCard name="campaign-type" title="Transactional" detail="Send transaction-related messages and updates" checked={campaignType === 'transactional'} onChange={() => setCampaignType('transactional')} />
          </div>
        </fieldset>
        <fieldset className="wa-fieldset">
          <legend>Schedule</legend>
          <div className="wa-radio-row">
            <label><input type="radio" name="schedule" checked={schedule === 'now'} onChange={() => setSchedule('now')} /> Send now</label>
            <label><input type="radio" name="schedule" checked={schedule === 'later'} onChange={() => setSchedule('later')} /> Schedule for later</label>
          </div>
        </fieldset>
      </div>
      <div className="wa-form-footer"><button className="wa-primary-button" type="button" onClick={onNext}>Next <ChevronRight size={16} /></button></div>
    </section>
  )
}

export function WhatsAppInfoPanel() {
  const points = ['Use approved templates', 'Personalise with variables', 'Track delivery & reads', 'Replies return to your inbox']
  return (
    <aside className="wa-info-panel">
      <div className="wa-info-heading"><span><Info size={16} /></span><p>About WhatsApp campaigns</p></div>
      <span className="wa-info-icon"><MessageCircle size={29} /></span>
      <h2>Reach clients in the moments that matter</h2>
      <p>Send polished campaign messages and keep every reply connected to your Arch9 workspace.</p>
      <ul>{points.map((point) => <li key={point}><Check size={14} /> {point}</li>)}</ul>
    </aside>
  )
}

function PlaceholderStep({ activeStep, onBack, onNext }) {
  const step = whatsappCampaignSteps[activeStep - 1]
  return (
    <section className="wa-form-card wa-placeholder-card">
      <span className="wa-placeholder-icon">{activeStep === 2 ? <UsersRound size={26} /> : activeStep === 3 ? <MessageCircle size={26} /> : <CheckCircle2 size={26} />}</span>
      <span>Step {activeStep} of 4</span>
      <h2>{step.label}</h2>
      <p>This step is a static preview. Audience selection, message templates and sending will be added in a future release.</p>
      <div className="wa-placeholder-actions">
        <button className="wa-secondary-button" type="button" onClick={onBack}><ArrowLeft size={15} /> Back</button>
        {activeStep < 4 ? <button className="wa-primary-button" type="button" onClick={onNext}>Next <ChevronRight size={16} /></button> : null}
      </div>
    </section>
  )
}

export function CreateWhatsAppCampaign({ onBack }) {
  const [activeStep, setActiveStep] = useState(1)
  return (
    <div className="wa-page wa-create-page">
      <button className="wa-back-link" type="button" onClick={onBack}><ArrowLeft size={15} /> WhatsApp Campaigns</button>
      <header className="wa-create-header">
        <div><span>New campaign</span><h1>Create WhatsApp campaign</h1><p>Build a focused campaign for your clients and leads.</p></div>
        <span className="wa-demo-badge">Demo preview</span>
      </header>
      <CampaignStepHeader activeStep={activeStep} />
      <div className="wa-create-grid">
        {activeStep === 1 ? <CampaignDetailsForm onNext={() => setActiveStep(2)} /> : <PlaceholderStep activeStep={activeStep} onBack={() => setActiveStep((step) => Math.max(1, step - 1))} onNext={() => setActiveStep((step) => Math.min(4, step + 1))} />}
        <WhatsAppInfoPanel />
      </div>
      <section className="wa-next-steps">
        <div><span className="wa-next-steps-icon"><CircleUserRound size={17} /></span><p><strong>Select your audience</strong><small>Choose who will receive this campaign</small></p></div>
        <div><span className="wa-next-steps-icon"><MessageCircle size={17} /></span><p><strong>Create your message</strong><small>Build your WhatsApp template and add variables</small></p></div>
        <div><span className="wa-next-steps-icon"><CheckCircle2 size={17} /></span><p><strong>Review and send</strong><small>Review the summary before sending your campaign</small></p></div>
      </section>
    </div>
  )
}
