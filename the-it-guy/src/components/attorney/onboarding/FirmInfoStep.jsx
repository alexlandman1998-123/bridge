function FirmInfoStep({ values, errors = {}, onChange }) {
  const getError = (field) => errors[field] || ''

  return (
    <div style={{ display: 'grid', gap: '0.85rem' }}>
      <div style={{ display: 'grid', gap: '0.2rem' }}>
        <h3 style={{ margin: 0 }}>Firm Information</h3>
        <p className="status-message" style={{ margin: 0 }}>
          Set up your firm so your team, matters, and client communication stay connected under one organisation.
        </p>
      </div>

      <label className="form-field">
        <span>Firm Name *</span>
        <input value={values.name} onChange={(event) => onChange('name', event.target.value)} required />
        {getError('name') ? <small style={{ color: '#b42318' }}>{getError('name')}</small> : null}
      </label>

      <div style={{ display: 'grid', gap: '0.85rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <label className="form-field">
          <span>Registration Number</span>
          <input value={values.registrationNumber} onChange={(event) => onChange('registrationNumber', event.target.value)} />
        </label>
        <label className="form-field">
          <span>VAT Number</span>
          <input value={values.vatNumber} onChange={(event) => onChange('vatNumber', event.target.value)} />
        </label>
      </div>

      <div style={{ display: 'grid', gap: '0.85rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <label className="form-field">
          <span>Firm Email</span>
          <input type="email" value={values.email} onChange={(event) => onChange('email', event.target.value)} />
          {getError('email') ? <small style={{ color: '#b42318' }}>{getError('email')}</small> : null}
        </label>
        <label className="form-field">
          <span>Firm Phone</span>
          <input value={values.phone} onChange={(event) => onChange('phone', event.target.value)} />
        </label>
        <label className="form-field">
          <span>Website</span>
          <input value={values.website} onChange={(event) => onChange('website', event.target.value)} placeholder="www.yourfirm.com" />
          <small className="status-message">Optional — used on client-facing documents and profiles.</small>
          {getError('website') ? <small style={{ color: '#b42318' }}>{getError('website')}</small> : null}
        </label>
      </div>

      <label className="form-field">
        <span>Address Line 1</span>
        <input value={values.addressLine1} onChange={(event) => onChange('addressLine1', event.target.value)} />
      </label>

      <label className="form-field">
        <span>Address Line 2</span>
        <input value={values.addressLine2} onChange={(event) => onChange('addressLine2', event.target.value)} />
      </label>

      <div style={{ display: 'grid', gap: '0.85rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <label className="form-field">
          <span>City</span>
          <input value={values.city} onChange={(event) => onChange('city', event.target.value)} />
        </label>
        <label className="form-field">
          <span>Province</span>
          <input value={values.province} onChange={(event) => onChange('province', event.target.value)} />
        </label>
        <label className="form-field">
          <span>Postal Code</span>
          <input value={values.postalCode} onChange={(event) => onChange('postalCode', event.target.value)} />
        </label>
        <label className="form-field">
          <span>Country</span>
          <input value={values.country} onChange={(event) => onChange('country', event.target.value)} />
        </label>
      </div>
    </div>
  )
}

export default FirmInfoStep
