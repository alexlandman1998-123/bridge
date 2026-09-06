import { useEffect, useState } from 'react'
import { Building2, ImageUp, RotateCcw, Save } from 'lucide-react'
import { uploadOrganisationBrandingAsset } from '../../lib/settingsApi'

const EMPTY_BRAND = {
  name: '',
  logoLightUrl: '',
  logoDarkUrl: '',
  primaryColor: '#125b50',
  secondaryColor: '#e7bc71',
  accentColor: '#e7bc71',
  phone: '',
  email: '',
  website: '',
  whatsappNumber: '',
}

function editableBrand(brand = {}) {
  return Object.fromEntries(Object.keys(EMPTY_BRAND).map((key) => [key, String(brand?.[key] || EMPTY_BRAND[key])]))
}

function LogoPreview({ url, name }) {
  return url
    ? <img src={url} alt={`${name || 'Agency'} logo preview`} />
    : <span><Building2 size={24} aria-hidden="true" /> No logo selected</span>
}

export default function WebsiteBrandEditor({ brand, busy, onSave, onReset }) {
  const [draft, setDraft] = useState(() => editableBrand(brand))
  const [uploading, setUploading] = useState('')
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    setDraft(editableBrand(brand))
  }, [brand])

  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }))
  const uploadLogo = async (file, key) => {
    if (!file) return
    setUploading(key)
    setLocalError('')
    try {
      const upload = await uploadOrganisationBrandingAsset({ file, variant: key === 'logoDarkUrl' ? 'website-dark' : 'website-light' })
      update(key, upload.resolvedUrl || upload.publicUrl || upload.signedUrl || '')
    } catch (error) {
      setLocalError(error?.message || 'Unable to upload the website logo.')
    } finally {
      setUploading('')
    }
  }
  const submit = async (event) => {
    event.preventDefault()
    setLocalError('')
    await onSave(draft)
  }

  return (
    <section className="ww-brand-editor" aria-labelledby="website-brand-heading">
      <div className="ww-brand-heading"><div><span className="md-eyebrow">BRAND</span><h2 id="website-brand-heading">Website identity</h2><p>These values belong to this website draft. Your organisation, document and email branding stay unchanged.</p></div><button className="ww-reset-brand" type="button" disabled={busy || Boolean(uploading)} onClick={onReset}><RotateCcw size={15} aria-hidden="true" /> Reset to organisation branding</button></div>
      {localError ? <p className="ww-error" role="alert">{localError}</p> : null}
      <form onSubmit={submit}>
        <div className="ww-brand-fields">
          <label className="ww-field ww-field-wide"><span>Company display name</span><input value={draft.name} maxLength={160} required onChange={(event) => update('name', event.target.value)} /></label>
          <div className="ww-logo-field"><div className="ww-logo-preview ww-logo-preview-light"><LogoPreview url={draft.logoLightUrl} name={draft.name} /></div><div><strong>Logo for light backgrounds</strong><p>Used in the white website header and footer. Saving creates a permanent website copy.</p><label className="ww-upload-button"><ImageUp size={15} aria-hidden="true" /> {uploading === 'logoLightUrl' ? 'Uploading…' : 'Upload logo'}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={Boolean(uploading) || busy} onChange={(event) => void uploadLogo(event.target.files?.[0], 'logoLightUrl')} /></label></div></div>
          <div className="ww-logo-field ww-logo-field-dark"><div className="ww-logo-preview ww-logo-preview-dark"><LogoPreview url={draft.logoDarkUrl} name={draft.name} /></div><div><strong>Logo for dark backgrounds</strong><p>Used over the primary colour. Saving creates a permanent website copy.</p><label className="ww-upload-button"><ImageUp size={15} aria-hidden="true" /> {uploading === 'logoDarkUrl' ? 'Uploading…' : 'Upload logo'}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={Boolean(uploading) || busy} onChange={(event) => void uploadLogo(event.target.files?.[0], 'logoDarkUrl')} /></label></div></div>
          {[
            ['primaryColor', 'Primary colour'],
            ['secondaryColor', 'Secondary colour'],
            ['accentColor', 'Accent colour'],
          ].map(([key, label]) => <label className="ww-field ww-colour-field" key={key}><span>{label}</span><div><input aria-label={`${label} picker`} type="color" value={draft[key]} onChange={(event) => update(key, event.target.value)} /><input aria-label={`${label} hex value`} value={draft[key]} pattern="#[0-9a-fA-F]{6}" maxLength={7} required onChange={(event) => update(key, event.target.value)} /></div></label>)}
          <label className="ww-field"><span>Contact email</span><input type="email" value={draft.email} maxLength={254} onChange={(event) => update('email', event.target.value)} /></label>
          <label className="ww-field"><span>Contact phone</span><input type="tel" value={draft.phone} maxLength={64} onChange={(event) => update('phone', event.target.value)} /></label>
          <label className="ww-field"><span>WhatsApp number</span><input type="tel" value={draft.whatsappNumber} maxLength={64} onChange={(event) => update('whatsappNumber', event.target.value)} /></label>
          <label className="ww-field ww-field-wide"><span>Company website</span><input type="url" value={draft.website} maxLength={2048} onChange={(event) => update('website', event.target.value)} placeholder="https://…" /></label>
        </div>
        <div className="ww-live-preview" style={{ '--website-primary': draft.primaryColor, '--website-secondary': draft.secondaryColor, '--website-accent': draft.accentColor }}>
          <div className="ww-live-preview-bar"><div className="ww-live-logo"><LogoPreview url={draft.logoLightUrl} name={draft.name} /></div><span>Properties</span><span>About</span><b>Contact</b></div>
          <div className="ww-live-preview-hero"><div className="ww-live-dark-logo"><LogoPreview url={draft.logoDarkUrl || draft.logoLightUrl} name={draft.name} /></div><small>PROPERTY, SIMPLIFIED</small><strong>Find the place that feels like home.</strong><button type="button">Explore properties</button></div>
          <p>Live draft preview · Changes remain private until published.</p>
        </div>
        <div className="ww-brand-actions"><p>Save updates this draft only. Publishing remains a separate action.</p><button className="ww-publish" type="submit" disabled={busy || Boolean(uploading)}><Save size={15} aria-hidden="true" /> {busy ? 'Saving…' : 'Save brand draft'}</button></div>
      </form>
    </section>
  )
}
