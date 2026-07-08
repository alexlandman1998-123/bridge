import { Building2, Globe2, Hash, Landmark, Mail, MapPin, Phone, ShieldCheck } from 'lucide-react'

function getFirmInitials(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'A9'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

function PremiumField({ label, icon: Icon, error = '', children, className = '' }) {
  return (
    <label className={`attorney-premium-field ${error ? 'has-error' : ''} ${className}`}>
      <span>
        {Icon ? <Icon size={14} aria-hidden="true" /> : null}
        {label}
      </span>
      {children}
      {error ? <small className="attorney-field-error">{error}</small> : null}
    </label>
  )
}

function FirmInfoStep({ values, errors = {}, onChange }) {
  const getError = (field) => errors[field] || ''
  const firmName = values.name || 'Your Attorney Firm'
  const firmInitials = getFirmInitials(firmName)

  return (
    <div className="attorney-step-flow">
      <div className="attorney-step-hero">
        <div className="attorney-step-hero-copy">
          <span className="attorney-step-kicker">
            <ShieldCheck size={14} aria-hidden="true" />
            Firm identity
          </span>
          <h3>Build the legal profile clients will recognise.</h3>
          <p>
            Capture the firm record once, then use it across matters, letterheads, signatures, and client-facing portals.
          </p>
        </div>
        <div className="attorney-firm-identity-card" aria-label="Firm identity preview">
          <span className="attorney-firm-monogram">{firmInitials}</span>
          <strong>{firmName}</strong>
          <em>{values.website || 'Client portal domain pending'}</em>
        </div>
      </div>

      <section className="attorney-step-section">
        <div className="attorney-step-section-head">
          <span>01</span>
          <div>
            <h4>Legal Profile</h4>
            <p>Core identifiers used for firm records and compliance references.</p>
          </div>
        </div>
        <div className="attorney-step-grid">
          <PremiumField label="Firm Name *" icon={Building2} error={getError('name')} className="is-wide">
            <input value={values.name || ''} onChange={(event) => onChange('name', event.target.value)} required />
          </PremiumField>
          <PremiumField label="Registration Number" icon={Hash}>
            <input value={values.registrationNumber || ''} onChange={(event) => onChange('registrationNumber', event.target.value)} />
          </PremiumField>
          <PremiumField label="VAT Number" icon={Landmark}>
            <input value={values.vatNumber || ''} onChange={(event) => onChange('vatNumber', event.target.value)} />
          </PremiumField>
        </div>
      </section>

      <section className="attorney-step-section">
        <div className="attorney-step-section-head">
          <span>02</span>
          <div>
            <h4>Client Contact Surface</h4>
            <p>Details that appear on communication templates and external workspace touchpoints.</p>
          </div>
        </div>
        <div className="attorney-step-grid is-three">
          <PremiumField label="Firm Email" icon={Mail} error={getError('email')}>
            <input type="email" value={values.email || ''} onChange={(event) => onChange('email', event.target.value)} />
          </PremiumField>
          <PremiumField label="Firm Phone" icon={Phone}>
            <input value={values.phone || ''} onChange={(event) => onChange('phone', event.target.value)} />
          </PremiumField>
          <PremiumField label="Website" icon={Globe2} error={getError('website')}>
            <input value={values.website || ''} onChange={(event) => onChange('website', event.target.value)} placeholder="www.yourfirm.co.za" />
          </PremiumField>
        </div>
      </section>

      <section className="attorney-step-section">
        <div className="attorney-step-section-head">
          <span>03</span>
          <div>
            <h4>Office Location</h4>
            <p>The address used for firm profile, letterhead, and operational context.</p>
          </div>
        </div>
        <div className="attorney-step-grid">
          <PremiumField label="Address Line 1" icon={MapPin} className="is-wide">
            <input value={values.addressLine1 || ''} onChange={(event) => onChange('addressLine1', event.target.value)} />
          </PremiumField>
          <PremiumField label="Address Line 2" icon={MapPin} className="is-wide">
            <input value={values.addressLine2 || ''} onChange={(event) => onChange('addressLine2', event.target.value)} />
          </PremiumField>
          <PremiumField label="City">
            <input value={values.city || ''} onChange={(event) => onChange('city', event.target.value)} />
          </PremiumField>
          <PremiumField label="Province">
            <input value={values.province || ''} onChange={(event) => onChange('province', event.target.value)} />
          </PremiumField>
          <PremiumField label="Postal Code">
            <input value={values.postalCode || ''} onChange={(event) => onChange('postalCode', event.target.value)} />
          </PremiumField>
          <PremiumField label="Country">
            <input value={values.country || ''} onChange={(event) => onChange('country', event.target.value)} />
          </PremiumField>
        </div>
      </section>
    </div>
  )
}

export default FirmInfoStep
