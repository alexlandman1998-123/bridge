import { Check, Clock3, UserPlus } from 'lucide-react'
import { useId, useState } from 'react'
import './development-partner-setup.css'

function PartnerLogo({ partner, Icon }) {
  const [failedUrl, setFailedUrl] = useState('')
  const LogoIcon = Icon
  const initials = partner?.name && /^[A-Z]{2,5}$/.test(partner.name) ? partner.name : partner?.name?.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  return <span className="development-partner-logo">{partner?.logoUrl && partner.logoUrl !== failedUrl
    ? <img src={partner.logoUrl} alt="" onError={() => setFailedUrl(partner.logoUrl)} />
    : partner?.name ? <strong>{initials}</strong> : <LogoIcon size={24} aria-hidden="true" />}</span>
}

export default function DevelopmentPartnerSetupCard({ title, roleLabel, Icon, options = [], selectedKey = '', mode = 'later', draft = {}, onModeChange, onPartnerChange, onDraftChange, loading, error }) {
  const id = useId()
  const partner = options.find((option) => option.key === selectedKey) || options[0]
  return <section className="development-sales-card" aria-labelledby={`${id}-heading`}>
    <div className="development-sales-heading"><Icon size={20} aria-hidden="true" /><h4 id={`${id}-heading`}>{title}</h4><span>Optional</span></div>
    <div className="development-partner-choices" role="radiogroup" aria-label={`${title} setup`}>
      {[
        { key: 'existing', label: partner?.name || `Choose ${roleLabel}`, hint: partner?.preferred ? 'Preferred partner' : 'Existing partner', disabled: !partner, visual: <PartnerLogo partner={partner} Icon={Icon} /> },
        { key: 'invite', label: `Invite new ${roleLabel}`, hint: 'Send an invitation', visual: <span className="development-partner-action-icon"><UserPlus size={23} aria-hidden="true" /></span> },
        { key: 'later', label: 'Sort out later', hint: 'Choose when ready', visual: <span className="development-partner-action-icon"><Clock3 size={23} aria-hidden="true" /></span> },
      ].map((option) => <label key={option.key} className={`development-partner-choice${mode === option.key ? ' is-selected' : ''}${option.disabled ? ' is-disabled' : ''}`}>
        <input type="radio" name={`${id}-choice`} aria-label={option.key === 'existing' ? `Use ${partner?.name || 'existing partner'} as ${roleLabel}` : `${option.label}${option.key === 'later' ? ` for ${roleLabel}` : ''}`} checked={mode === option.key} disabled={option.disabled} onChange={() => onModeChange(option.key, partner)} />
        {option.visual}<strong>{option.label}</strong><span>{option.hint}</span>
        {mode === option.key ? <Check size={15} className="development-partner-choice-check" aria-hidden="true" /> : null}
      </label>)}
    </div>
    {loading ? <p className="development-create-hint" role="status">Loading {roleLabel} partners…</p> : null}
    {error ? <p className="development-partner-error" role="alert">{error} You can invite a partner or sort it out later.</p> : null}
    {!loading && !error && !partner ? <p className="development-create-hint">No saved {roleLabel} partners yet.</p> : null}
    {mode === 'existing' && options.length > 1 ? <label>Choose {roleLabel}<select value={partner?.key || ''} onChange={(event) => onPartnerChange(options.find((option) => option.key === event.target.value))}>{options.map((option) => <option key={option.key} value={option.key}>{option.name}</option>)}</select></label> : null}
    {mode === 'existing' && partner?.email ? <p className="development-create-hint">{partner.email}</p> : null}
    {mode === 'invite' ? <div className="development-partner-invite">
      <div className="development-create-fields">
        <label>{title} company name<input value={draft.companyName || ''} onChange={(event) => onDraftChange('companyName', event.target.value)} placeholder={roleLabel === 'attorney' ? 'Firm name' : 'Company name'} /></label>
        <label>{title} invitation email<input type="email" value={draft.email || ''} onChange={(event) => onDraftChange('email', event.target.value)} placeholder="contact@company.com" /></label>
      </div>
      <p className="development-create-hint">Invitation sent when you save this development. Access starts after acceptance.</p>
    </div> : null}
  </section>
}
