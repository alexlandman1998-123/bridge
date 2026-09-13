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
      <div className="ww-brand-heading"><div><h2 id="website-brand-heading">Website identity</h2><p>Set the details visitors will recognise. These changes affect this website only—not your documents, emails or Arch9 workspace.</p></div><button className="ww-reset-brand" type="button" disabled={busy || Boolean(uploading)} onClick={onReset}><RotateCcw size={15} aria-hidden="true" /> Use organisation details</button></div>
      {localError ? <p className="ww-error" role="alert">{localError}</p> : null}
      <form onSubmit={submit}>
        <div className="ww-identity-layout">
          <section className="ww-identity-section"><header><h3>Your agency</h3><p>The name shown throughout your public website.</p></header><label className="ww-field"><span>Display name</span><input value={draft.name} maxLength={160} required onChange={(event) => update('name', event.target.value)} /></label></section>

          <section className="ww-identity-section"><header><h3>Logos</h3><p>Use your normal logo on white areas. Add a light version only if your logo needs it on dark backgrounds.</p></header><div className="ww-identity-logos"><div className="ww-identity-logo-card"><div className="ww-logo-preview ww-logo-preview-light"><LogoPreview url={draft.logoLightUrl} name={draft.name} /></div><div><strong>Standard logo</strong><span>Header and footer</span></div><label className="ww-upload-button"><ImageUp size={15} aria-hidden="true" /> {uploading === 'logoLightUrl' ? 'Uploading…' : 'Upload logo'}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={Boolean(uploading) || busy} onChange={(event) => void uploadLogo(event.target.files?.[0], 'logoLightUrl')} /></label></div><div className="ww-identity-logo-card"><div className="ww-logo-preview ww-logo-preview-dark"><LogoPreview url={draft.logoDarkUrl || draft.logoLightUrl} name={draft.name} /></div><div><strong>Dark-background logo</strong><span>Optional; falls back to standard logo</span></div><label className="ww-upload-button"><ImageUp size={15} aria-hidden="true" /> {uploading === 'logoDarkUrl' ? 'Uploading…' : 'Upload alternate logo'}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={Boolean(uploading) || busy} onChange={(event) => void uploadLogo(event.target.files?.[0], 'logoDarkUrl')} /></label></div></div></section>

          <section className="ww-identity-section"><header><h3>Colours</h3><p>Choose the three colours used across your website buttons, links and highlights.</p></header><div className="ww-identity-colours">{[['primaryColor', 'Primary colour'], ['secondaryColor', 'Secondary colour'], ['accentColor', 'Accent colour']].map(([key, label]) => <label className="ww-identity-colour" key={key}><span>{label}</span><div><input aria-label={`${label} picker`} type="color" value={draft[key]} onChange={(event) => update(key, event.target.value)} /><input aria-label={`${label} hex value`} value={draft[key]} pattern="#[0-9a-fA-F]{6}" maxLength={7} required onChange={(event) => update(key, event.target.value)} /></div></label>)}</div></section>

          <section className="ww-identity-section"><header><h3>Contact details</h3><p>These are used on your Contact page and in website enquiries.</p></header><div className="ww-identity-contact"><label className="ww-field"><span>Email address</span><input type="email" value={draft.email} maxLength={254} onChange={(event) => update('email', event.target.value)} /></label><label className="ww-field"><span>Phone number</span><input type="tel" value={draft.phone} maxLength={64} onChange={(event) => update('phone', event.target.value)} /></label><label className="ww-field"><span>WhatsApp number</span><input type="tel" value={draft.whatsappNumber} maxLength={64} onChange={(event) => update('whatsappNumber', event.target.value)} placeholder="e.g. +27 82 123 4567" /></label><label className="ww-field"><span>External website (optional)</span><input type="url" value={draft.website} maxLength={2048} onChange={(event) => update('website', event.target.value)} placeholder="https://…" /></label></div></section>
        </div>
        <div className="ww-brand-actions"><p>Save updates this draft only. Publishing remains a separate action.</p><button className="ww-publish" type="submit" disabled={busy || Boolean(uploading)}><Save size={15} aria-hidden="true" /> {busy ? 'Saving…' : 'Save brand draft'}</button></div>
      </form>
    </section>
  )
}
