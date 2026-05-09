function BrandingStep({ values, errors = {}, onChange, firmName = '' }) {
  return (
    <div style={{ display: 'grid', gap: '0.9rem' }}>
      <div style={{ display: 'grid', gap: '0.2rem' }}>
        <h3 style={{ margin: 0 }}>Branding</h3>
        <p className="status-message" style={{ margin: 0 }}>
          Add optional branding for document identity, settings, and client communication.
        </p>
      </div>

      <label className="form-field">
        <span>Logo URL (or upload placeholder)</span>
        <input value={values.logoUrl} onChange={(event) => onChange('logoUrl', event.target.value)} placeholder="https://" />
      </label>

      <div style={{ display: 'grid', gap: '0.85rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <label className="form-field">
          <span>Primary Colour</span>
          <input type="color" value={values.primaryColour} onChange={(event) => onChange('primaryColour', event.target.value)} />
          {errors.primaryColour ? <small style={{ color: '#b42318' }}>{errors.primaryColour}</small> : null}
        </label>

        <label className="form-field">
          <span>Secondary Colour</span>
          <input type="color" value={values.secondaryColour} onChange={(event) => onChange('secondaryColour', event.target.value)} />
          {errors.secondaryColour ? <small style={{ color: '#b42318' }}>{errors.secondaryColour}</small> : null}
        </label>
      </div>

      <div
        className="panel card-tier-soft"
        style={{
          padding: '1rem',
          borderRadius: '1rem',
          display: 'grid',
          gap: '0.7rem',
          border: `1px solid ${values.secondaryColour || 'rgba(11, 19, 43, 0.15)'}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            {values.logoUrl ? (
              <img
                src={values.logoUrl}
                alt="Firm logo preview"
                style={{ width: 46, height: 46, objectFit: 'contain', borderRadius: '0.5rem', background: '#fff' }}
              />
            ) : (
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: '0.5rem',
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
              <p style={{ margin: 0, fontWeight: 700 }}>{firmName || 'Your Firm Name'}</p>
              <p className="status-message" style={{ margin: 0 }}>Attorney identity preview</p>
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

        <div style={{ height: 6, borderRadius: 999, background: values.primaryColour || '#0f4c81' }} />
      </div>
    </div>
  )
}

export default BrandingStep
