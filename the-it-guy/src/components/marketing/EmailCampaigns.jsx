import { useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  Info,
  Mail,
  MailCheck,
  MailOpen,
  MousePointerClick,
  MoreHorizontal,
  Search,
  Send,
  UsersRound,
} from 'lucide-react'
import {
  emailCampaignDraft,
  emailCampaignForm,
  emailCampaignInfo,
  emailCampaignNextSteps,
  emailCampaignStats,
  emailCampaignSteps,
  emailCampaignTabs,
  emailCampaigns,
} from '../../data/emailCampaigns'

const statIcons = { campaigns: Send, recipients: UsersRound, opened: MailOpen, clicked: MousePointerClick }
const nextStepIcons = { audience: UsersRound, content: Mail, review: CheckCircle2 }

export function EmailCampaignStats() {
  return (
    <section className="wa-stats" aria-label="Email campaign performance">
      {emailCampaignStats.map((stat) => {
        const Icon = statIcons[stat.id]
        return (
          <article className={`wa-stat email-stat email-stat-${stat.id}`} key={stat.id}>
            <span className="wa-stat-icon"><Icon size={19} /></span>
            <span className="wa-stat-copy"><strong>{stat.value}</strong><span>{stat.label}</span><small>{stat.detail}</small></span>
          </article>
        )
      })}
    </section>
  )
}

export function EmailCampaignFilters() {
  return (
    <section className="wa-filter-row" aria-label="Campaign filters">
      <label className="wa-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search campaigns</span><input type="search" placeholder="Search campaigns..." /></label>
      <button className="wa-filter-control" type="button">All statuses <ChevronDown size={15} /></button>
      <button className="wa-filter-control" type="button">Last 30 days <CalendarDays size={16} /></button>
    </section>
  )
}

function CampaignThumbnail({ campaign }) {
  if (campaign.thumbnailType === 'market-update') {
    return <div className="wa-campaign-thumbnail email-newsletter-thumbnail" aria-label="April Market Update email artwork"><small>HOME SEEKERS</small><strong>Market<br />update</strong><span>APR 2026</span></div>
  }
  return <img className="wa-campaign-thumbnail" src={campaign.thumbnail} alt={campaign.thumbnailAlt || ''} />
}

export function EmailCampaignCard({ campaign }) {
  return (
    <article className="wa-campaign-card">
      <CampaignThumbnail campaign={campaign} />
      <div className="wa-campaign-main">
        <div className="wa-campaign-heading">
          <div><h3>{campaign.name}</h3><p>Sent to <strong>{campaign.audience}</strong></p></div>
          <span className="wa-status wa-status-sent">{campaign.status}</span>
        </div>
        <p className="wa-sent-time"><CalendarDays size={13} /> Sent {campaign.sentAt}</p>
        <dl className="wa-metrics">
          <div><dt>Recipients</dt><dd>{campaign.recipients}</dd></div>
          <div><dt>Opened</dt><dd>{campaign.opened} <span>({campaign.openRate})</span></dd></div>
          <div><dt>Clicked</dt><dd>{campaign.clicked} <span>({campaign.clickRate})</span></dd></div>
          <div><dt>Replies</dt><dd>{campaign.replies}</dd></div>
        </dl>
      </div>
      <button className="wa-more" type="button" aria-label={`More options for ${campaign.name}`}><MoreHorizontal size={18} /></button>
    </article>
  )
}

function EmailDraftCard({ onContinue }) {
  return (
    <article className="wa-draft-card email-draft-card">
      <span className="wa-draft-icon"><FileText size={22} /></span>
      <div><h3>{emailCampaignDraft.name}</h3><p><Clock3 size={13} /> {emailCampaignDraft.updatedAt}</p></div>
      <span className="wa-status email-status-draft">{emailCampaignDraft.status}</span>
      <button className="wa-secondary-button" type="button" onClick={onContinue}>Continue</button>
    </article>
  )
}

export function EmailCampaignOverview({ onCreateCampaign }) {
  const [activeTab, setActiveTab] = useState(emailCampaignTabs[0])
  return (
    <div className="wa-page email-page">
      <EmailCampaignStats />
      <section className="wa-campaigns-panel">
        <div className="wa-panel-toolbar">
          <div className="wa-tabs" role="tablist" aria-label="Campaign status">
            {emailCampaignTabs.map((tab) => <button className={activeTab === tab ? 'wa-tab-active' : ''} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)} key={tab}>{tab}</button>)}
          </div>
          <button className="wa-primary-button" type="button" onClick={onCreateCampaign}>Create Campaign <ChevronRight size={16} /></button>
        </div>
        <div className="wa-campaigns-content">
          <EmailCampaignFilters />
          <div className="wa-campaign-list">
            {emailCampaigns.map((campaign) => <EmailCampaignCard campaign={campaign} key={campaign.id} />)}
            <EmailDraftCard onContinue={onCreateCampaign} />
          </div>
          <footer className="wa-list-footer"><span>Showing 1–3 of 14 campaigns</span><div aria-label="Pagination">{[1, 2, 3, 4].map((page) => <button type="button" className={`wa-page-number ${page === 1 ? 'wa-page-number-active' : ''}`} key={page}>{page}</button>)}</div></footer>
        </div>
      </section>
    </div>
  )
}

export function EmailCampaignStepHeader({ activeStep }) {
  return (
    <ol className="wa-step-header" aria-label="Email campaign creation steps">
      {emailCampaignSteps.map((step) => (
        <li className={activeStep === step.id ? 'wa-step-active' : activeStep > step.id ? 'wa-step-complete' : ''} key={step.id}>
          <span className="wa-step-number">{activeStep > step.id ? <Check size={14} /> : step.id}</span>
          <span className="wa-step-copy"><strong>{step.label}</strong><small>{step.detail}</small></span>
        </li>
      ))}
    </ol>
  )
}

function EmailChoiceCard({ checked, name, title, detail, onChange }) {
  return <label className={`wa-choice-card ${checked ? 'wa-choice-card-selected' : ''}`}><input type="radio" name={name} checked={checked} onChange={onChange} /><span><strong>{title}</strong><small>{detail}</small></span></label>
}

export function EmailCampaignDetailsForm({ onNext }) {
  const [campaignName, setCampaignName] = useState(emailCampaignForm.defaultName)
  const [replyToEmail, setReplyToEmail] = useState(emailCampaignForm.replyToEmail)
  const [campaignType, setCampaignType] = useState('marketing')
  const [schedule, setSchedule] = useState('now')
  return (
    <section className="wa-form-card">
      <div className="wa-card-heading"><span>Step 1 of 4</span><h2>Campaign details</h2><p>Set up the essentials for your email campaign.</p></div>
      <div className="wa-form-fields">
        <label className="wa-field-label"><span>Campaign name</span><span className="wa-input-shell"><input value={campaignName} maxLength={100} onChange={(event) => setCampaignName(event.target.value)} /><small>{campaignName.length}/100</small></span></label>
        <label className="wa-field-label"><span>Email sender (from)</span><span className="wa-sender-select"><span className="wa-sender-icon email-sender-icon"><Mail size={17} /></span><span><strong>{emailCampaignForm.senderName}</strong><small>{emailCampaignForm.senderEmail}</small></span><ChevronDown size={16} /></span></label>
        <label className="wa-field-label"><span>Reply-to email</span><span className="wa-input-shell"><input type="email" value={replyToEmail} onChange={(event) => setReplyToEmail(event.target.value)} /></span></label>
        <fieldset className="wa-fieldset"><legend>Campaign type</legend><div className="wa-choice-grid">{emailCampaignForm.campaignTypes.map((type) => <EmailChoiceCard name="email-campaign-type" title={type.title} detail={type.detail} checked={campaignType === type.id} onChange={() => setCampaignType(type.id)} key={type.id} />)}</div></fieldset>
        <fieldset className="wa-fieldset"><legend>Schedule</legend><div className="wa-radio-row"><label><input type="radio" name="email-schedule" checked={schedule === 'now'} onChange={() => setSchedule('now')} /> Send now</label><label><input type="radio" name="email-schedule" checked={schedule === 'later'} onChange={() => setSchedule('later')} /> Schedule for later</label></div></fieldset>
      </div>
      <div className="wa-form-footer"><button className="wa-primary-button" type="button" onClick={onNext}>Next <ChevronRight size={16} /></button></div>
    </section>
  )
}

export function EmailCampaignInfoPanel() {
  return (
    <aside className="wa-info-panel email-info-panel">
      <div className="wa-info-heading"><span><Info size={16} /></span><p>{emailCampaignInfo.title}</p></div>
      <span className="wa-info-icon email-info-icon"><MailCheck size={27} /></span>
      <h2>{emailCampaignInfo.heading}</h2>
      <p>{emailCampaignInfo.description}</p>
      <ul>{emailCampaignInfo.checklist.map((point) => <li key={point}><Check size={14} /> {point}</li>)}</ul>
    </aside>
  )
}

export function EmailCampaignNextSteps() {
  return <section className="wa-next-steps">{emailCampaignNextSteps.map((step) => { const Icon = nextStepIcons[step.id]; return <div key={step.id}><span className="wa-next-steps-icon"><Icon size={17} /></span><p><strong>{step.title}</strong><small>{step.detail}</small></p></div> })}</section>
}

function EmailPlaceholderStep({ activeStep, onBack, onNext }) {
  const step = emailCampaignSteps[activeStep - 1]
  const Icon = activeStep === 2 ? UsersRound : activeStep === 3 ? Mail : CheckCircle2
  return (
    <section className="wa-form-card wa-placeholder-card"><span className="wa-placeholder-icon"><Icon size={26} /></span><span>Step {activeStep} of 4</span><h2>{step.label}</h2><p>This step is a static preview. Audience selection, email design and campaign delivery will be added in a future release.</p><div className="wa-placeholder-actions"><button className="wa-secondary-button" type="button" onClick={onBack}><ArrowLeft size={15} /> Back</button>{activeStep < 4 ? <button className="wa-primary-button" type="button" onClick={onNext}>Next <ChevronRight size={16} /></button> : null}</div></section>
  )
}

export function CreateEmailCampaign({ onBack }) {
  const [activeStep, setActiveStep] = useState(1)
  return (
    <div className="wa-page wa-create-page email-page">
      <button className="wa-back-link" type="button" onClick={onBack}><ArrowLeft size={15} /> Email Campaigns</button>
      <EmailCampaignStepHeader activeStep={activeStep} />
      <div className="wa-create-grid">{activeStep === 1 ? <EmailCampaignDetailsForm onNext={() => setActiveStep(2)} /> : <EmailPlaceholderStep activeStep={activeStep} onBack={() => setActiveStep((step) => Math.max(1, step - 1))} onNext={() => setActiveStep((step) => Math.min(4, step + 1))} />}<EmailCampaignInfoPanel /></div>
      <EmailCampaignNextSteps />
    </div>
  )
}
