import { CheckCircle2, FileText, Image, Monitor, Palette, Trash2, Upload } from 'lucide-react'

function UploadCard({
  title,
  description,
  logoUrl,
  logoName,
  isUploading,
  onUpload,
  onRemove,
  inputId,
  tone = 'light',
  canRemove = Boolean(logoUrl),
}) {
  return (
    <div className={`attorney-brand-upload-card is-${tone}`}>
      <input
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/svg+xml"
        className="attorney-hidden-file-input"
        onChange={(event) => void onUpload?.(event.target.files?.[0] || null)}
      />

      <div className="attorney-brand-upload-preview">
        {logoUrl ? (
          <img src={logoUrl} alt="Firm logo preview" />
        ) : (
          <span>
            <Image size={22} aria-hidden="true" />
          </span>
        )}
      </div>

      <div className="attorney-brand-upload-copy">
        <span className="attorney-step-kicker">{title}</span>
        <strong>{logoName || 'Logo pending'}</strong>
        <p>{description}</p>
      </div>

      <div className="attorney-brand-upload-actions">
        <label
          htmlFor={inputId}
          className={`attorney-inline-action is-primary ${isUploading ? 'is-loading' : ''}`}
          aria-disabled={isUploading ? 'true' : undefined}
        >
          <Upload size={15} aria-hidden="true" />
          {isUploading ? 'Uploading...' : 'Upload'}
        </label>
        {canRemove ? (
          <button type="button" className="attorney-inline-action" onClick={onRemove} disabled={isUploading}>
            <Trash2 size={15} aria-hidden="true" />
            Remove
          </button>
        ) : null}
      </div>
    </div>
  )
}

function ColourCard({ label, description, value, onChange }) {
  return (
    <label className="attorney-colour-card" style={{ '--attorney-colour-card-swatch': value || '#0f4c81' }}>
      <span>
        <Palette size={14} aria-hidden="true" />
        {label}
      </span>
      <strong>{value}</strong>
      <p>{description}</p>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      />
    </label>
  )
}

function BrandingStep({
  values,
  errors = {},
  onChange,
  firmName = '',
  onUploadLightLogo,
  onUploadDarkLogo,
  onRemoveLightLogo,
  onRemoveDarkLogo,
  uploadingTarget = '',
  uploadError = '',
}) {
  const previewName = firmName || 'Your Firm Name'
  const primaryColour = values.primaryColour || '#0f4c81'
  const secondaryColour = values.secondaryColour || '#1e2a44'

  return (
    <div className="attorney-step-flow">
      <div className="attorney-step-hero attorney-brand-hero">
        <div className="attorney-step-hero-copy">
          <span className="attorney-step-kicker">
            <Palette size={14} aria-hidden="true" />
            Brand system
          </span>
          <h3>Make every legal surface feel unmistakably yours.</h3>
          <p>
            Logos and colors feed the document header, email signature, client portal, and matter workspace preview.
          </p>
        </div>
        <div className="attorney-brand-hero-card" style={{ '--brand-primary': primaryColour, '--brand-secondary': secondaryColour }}>
          <span />
          <strong>{previewName}</strong>
          <em>Powered by Arch9</em>
        </div>
      </div>

      {uploadError ? <p className="attorney-step-alert">{uploadError}</p> : null}

      <section className="attorney-step-section">
        <div className="attorney-step-section-head">
          <span>01</span>
          <div>
            <h4>Logo Assets</h4>
            <p>Primary and dark-surface marks keep the firm polished across white documents and dark navigation.</p>
          </div>
        </div>
        <div className="attorney-brand-upload-grid">
          <UploadCard
            title="Primary mark"
            description="Used on documents, portals, and client communication."
            logoUrl={values.logoUrl}
            logoName={values.logoFileName}
            isUploading={uploadingTarget === 'light'}
            onUpload={onUploadLightLogo}
            onRemove={onRemoveLightLogo}
            inputId="attorney-onboarding-logo-light"
          />
          <UploadCard
            title="Dark-surface mark"
            description="Optional alternate for deep navigation and workspace surfaces."
            logoUrl={values.logoDarkUrl || values.logoUrl}
            logoName={values.logoDarkFileName || (values.logoUrl ? 'Using primary mark' : '')}
            isUploading={uploadingTarget === 'dark'}
            onUpload={onUploadDarkLogo}
            onRemove={onRemoveDarkLogo}
            inputId="attorney-onboarding-logo-dark"
            tone="dark"
            canRemove={Boolean(values.logoDarkUrl)}
          />
        </div>
      </section>

      <section className="attorney-step-section">
        <div className="attorney-step-section-head">
          <span>02</span>
          <div>
            <h4>Color Direction</h4>
            <p>Choose the anchor colors that carry status, hierarchy, and branded accents.</p>
          </div>
        </div>
        <div className="attorney-colour-grid">
          <ColourCard
            label="Primary Colour"
            description="Main action, progress, and document rule."
            value={primaryColour}
            onChange={(value) => onChange('primaryColour', value)}
          />
          <ColourCard
            label="Secondary Colour"
            description="Navigation, logo fallback, and executive accents."
            value={secondaryColour}
            onChange={(value) => onChange('secondaryColour', value)}
          />
        </div>
        {errors.primaryColour || errors.secondaryColour ? (
          <p className="attorney-step-alert">{errors.primaryColour || errors.secondaryColour}</p>
        ) : null}
      </section>

      <section className="attorney-step-section">
        <div className="attorney-step-section-head">
          <span>03</span>
          <div>
            <h4>Brand Surfaces</h4>
            <p>A quick confidence check before the brand kit is applied across the workspace.</p>
          </div>
        </div>
        <div className="attorney-brand-surface-grid" style={{ '--brand-primary': primaryColour, '--brand-secondary': secondaryColour }}>
          <article>
            <span>
              <FileText size={15} aria-hidden="true" />
              Letterhead
            </span>
            <strong>{previewName}</strong>
            <div className="attorney-brand-surface-rule" />
          </article>
          <article>
            <span>
              <CheckCircle2 size={15} aria-hidden="true" />
              Email Signature
            </span>
            <strong>{previewName}</strong>
            <p>Conveyancing & Legal Operations</p>
          </article>
          <article>
            <span>
              <Monitor size={15} aria-hidden="true" />
              Client Portal
            </span>
            <strong>Secure matter workspace</strong>
            <p>Branded client-facing experience.</p>
          </article>
        </div>
      </section>
    </div>
  )
}

export default BrandingStep
