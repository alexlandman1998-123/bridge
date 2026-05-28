import { Image, Trash2, Upload } from 'lucide-react'

function UploadCard({
  title,
  description,
  logoUrl,
  logoName,
  isUploading,
  onUpload,
  onRemove,
  inputId,
}) {
  return (
    <div className="ui-panel-muted" style={{ display: 'grid', gap: '0.7rem', padding: '0.95rem' }}>
      <div style={{ display: 'grid', gap: '0.2rem' }}>
        <strong>{title}</strong>
        <span className="status-message">{description}</span>
      </div>

      <input
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/svg+xml"
        style={{ display: 'none' }}
        onChange={(event) => void onUpload(event.target.files?.[0] || null)}
      />

      <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
        <label htmlFor={inputId} className="ui-button-primary" style={{ cursor: isUploading ? 'wait' : 'pointer', opacity: isUploading ? 0.8 : 1 }}>
          <Upload size={16} aria-hidden="true" />
          {isUploading ? 'Uploading...' : 'Upload Logo'}
        </label>
        {logoUrl ? (
          <button type="button" className="ui-button-secondary" onClick={onRemove} disabled={isUploading}>
            <Trash2 size={16} aria-hidden="true" />
            Remove Logo
          </button>
        ) : null}
      </div>

      <span className="status-message">{logoName ? `Uploaded: ${logoName}` : 'PNG, JPG, or SVG. Up to 8MB.'}</span>

      <div
        style={{
          minHeight: '88px',
          borderRadius: '0.9rem',
          border: '1px dashed rgba(18, 34, 62, 0.2)',
          display: 'grid',
          placeItems: 'center',
          background: '#fff',
          padding: '0.6rem',
        }}
      >
        {logoUrl ? (
          <img src={logoUrl} alt="Firm logo preview" style={{ maxHeight: '72px', maxWidth: '100%', objectFit: 'contain' }} />
        ) : (
          <span className="status-message" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <Image size={16} aria-hidden="true" />
            No logo uploaded yet.
          </span>
        )}
      </div>
    </div>
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

  return (
    <div style={{ display: 'grid', gap: '0.95rem' }}>
      <div style={{ display: 'grid', gap: '0.2rem' }}>
        <h3 style={{ margin: 0 }}>Branding</h3>
        <p className="status-message" style={{ margin: 0 }}>
          Configure your legal identity for client communications, templates, and email signatures.
        </p>
      </div>

      {uploadError ? <p className="status-message" style={{ margin: 0, color: '#b42318' }}>{uploadError}</p> : null}

      <div style={{ display: 'grid', gap: '0.85rem', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <UploadCard
          title="Primary Logo"
          description="Used on client-facing documents and portal views."
          logoUrl={values.logoUrl}
          logoName={values.logoFileName}
          isUploading={uploadingTarget === 'light'}
          onUpload={onUploadLightLogo}
          onRemove={onRemoveLightLogo}
          inputId="attorney-onboarding-logo-light"
        />
        <UploadCard
          title="Dark Surface Logo"
          description="Optional alternate logo for dark backgrounds."
          logoUrl={values.logoDarkUrl || values.logoUrl}
          logoName={values.logoDarkFileName}
          isUploading={uploadingTarget === 'dark'}
          onUpload={onUploadDarkLogo}
          onRemove={onRemoveDarkLogo}
          inputId="attorney-onboarding-logo-dark"
        />
      </div>

      <div style={{ display: 'grid', gap: '0.85rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <label className="form-field">
          <span>Primary Colour</span>
          <span className="attorney-colour-control">
            <input
              type="color"
              className="attorney-colour-swatch"
              value={values.primaryColour}
              onChange={(event) => onChange('primaryColour', event.target.value)}
              aria-label="Primary colour"
            />
            <span className="attorney-colour-value">{values.primaryColour}</span>
          </span>
          {errors.primaryColour ? <small style={{ color: '#b42318' }}>{errors.primaryColour}</small> : null}
        </label>

        <label className="form-field">
          <span>Secondary Colour</span>
          <span className="attorney-colour-control">
            <input
              type="color"
              className="attorney-colour-swatch"
              value={values.secondaryColour}
              onChange={(event) => onChange('secondaryColour', event.target.value)}
              aria-label="Secondary colour"
            />
            <span className="attorney-colour-value">{values.secondaryColour}</span>
          </span>
          {errors.secondaryColour ? <small style={{ color: '#b42318' }}>{errors.secondaryColour}</small> : null}
        </label>
      </div>

      <div
        className="ui-panel-muted"
        style={{
          padding: '1rem',
          borderRadius: '1rem',
          display: 'grid',
          gap: '0.85rem',
          border: `1px solid ${values.secondaryColour || 'rgba(11, 19, 43, 0.15)'}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            {values.logoUrl ? (
              <img
                src={values.logoUrl}
                alt="Firm logo preview"
                style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: '0.6rem', background: '#fff', border: '1px solid rgba(16, 34, 57, 0.12)' }}
              />
            ) : (
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '0.6rem',
                  border: '1px dashed rgba(30, 42, 68, 0.4)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '0.75rem',
                  color: '#68768f',
                }}
              >
                Logo
              </div>
            )}
            <div>
              <p style={{ margin: 0, fontWeight: 700 }}>{previewName}</p>
              <p className="status-message" style={{ margin: 0 }}>Powered by Bridge</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <span
              title="Primary colour"
              style={{ width: 18, height: 18, borderRadius: '999px', background: values.primaryColour || '#0f4c81', border: '1px solid rgba(15, 25, 45, 0.2)' }}
            />
            <span
              title="Secondary colour"
              style={{ width: 18, height: 18, borderRadius: '999px', background: values.secondaryColour || '#1e2a44', border: '1px solid rgba(15, 25, 45, 0.2)' }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gap: '0.65rem' }}>
          <div className="ui-panel" style={{ padding: '0.7rem' }}>
            <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Email signature preview</strong>
            <p className="status-message" style={{ margin: 0 }}>{previewName} | Conveyancing & Legal Operations</p>
          </div>
          <div className="ui-panel" style={{ padding: '0.7rem' }}>
            <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Document header preview</strong>
            <div style={{ height: 6, borderRadius: 999, background: values.primaryColour || '#0f4c81' }} />
          </div>
          <div className="ui-panel" style={{ padding: '0.7rem' }}>
            <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Client portal preview</strong>
            <p className="status-message" style={{ margin: 0 }}>Calm legal workspace branding will be applied after setup.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BrandingStep
