import { useEffect, useState } from 'react'
import { ArrowRight, Eye, EyeOff, Home, ShieldCheck } from 'lucide-react'
import { getSellerPortalActivationTermsConfig } from '../../lib/sellerPortalActivationTerms.js'
import { resolveOnboardingBranding } from '../../lib/onboardingBranding.js'
import './seller-portal-password.css'

function brandColour(value, fallback) {
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value || '') ? value : fallback
}

function readableBrandText(hex) {
  const full = hex.length === 4 ? hex.slice(1).split('').map((char) => char + char).join('') : hex.slice(1)
  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(full.slice(offset, offset + 2), 16) / 255
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
  })
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
  return luminance > .179 ? '#142132' : '#ffffff'
}

export default function SellerPortalPasswordGate({
  token = '', authState = {}, form, feedback = '', notice = '', saving = false,
  recoveryRequesting = false, termsConfig, onChange, onRequestRecovery, onSubmit,
}) {
  const [showPassword, setShowPassword] = useState(false)
  const [publicBrand, setPublicBrand] = useState(null)
  const [failedLogo, setFailedLogo] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setPublicBrand(null)
    if (token) {
      fetch(`/api/public/seller-onboarding-branding?token=${encodeURIComponent(token)}`, {
        headers: { Accept: 'application/json' }, signal: controller.signal,
      }).then((response) => response.ok ? response.json() : null)
        .then((payload) => {
          if (!controller.signal.aborted && payload?.branding) setPublicBrand({ token, branding: payload.branding })
        }).catch(() => {})
    }
    return () => controller.abort()
  }, [token])
  const brand = resolveOnboardingBranding(publicBrand?.token === token ? publicBrand.branding : null, authState.branding)
  const agencyName = brand.organisationName || 'Your agency'
  const primary = brandColour(brand.primaryColour, '#193641')
  const secondary = brandColour(brand.secondaryColour, primary)
  const introText = readableBrandText(primary)
  const buttonText = readableBrandText(secondary)
  const logo = brand.logoDarkUrl || brand.logoLightUrl || brand.logoIconUrl
  const brandStyle = { '--seller-brand-primary': primary, '--seller-brand-secondary': secondary,
    '--seller-brand-intro-text': introText, '--seller-brand-button-text': buttonText,
    '--seller-brand-detail': introText === '#ffffff' ? primary : '#142132' }

  const passwordSet = Boolean(authState.passwordSet)
  const recoveryMode = authState.tokenKind === 'recovery'
  const creating = !passwordSet || recoveryMode
  const terms = termsConfig || getSellerPortalActivationTermsConfig()
  const title = recoveryMode ? 'Choose a new password' : passwordSet ? 'Sign in to your portal' : 'Create your password'
  const description = recoveryMode
    ? 'Reset your password to get back to your property journey. This link can only be used once.'
    : passwordSet
      ? authState.sessionExpired ? 'Your session has ended. Sign in to pick up where you left off.' : 'Enter your password to continue to your property.'
      : 'Create a password to keep your property details and documents secure.'

  return (
    <main className="seller-access-page" style={brandStyle}>
      <section className="seller-access-card" aria-labelledby="seller-access-title">
        <header className="seller-access-brand">
          {logo && failedLogo !== logo ? <img className="seller-access-agency-logo" src={logo} alt={`${agencyName} logo`} onError={() => setFailedLogo(logo)} />
            : <span className="seller-access-agency-name">{agencyName}</span>}
          <span className="seller-access-brand-divider" /><span className="seller-access-portal-label">Seller portal</span>
        </header>
        <div className="seller-access-form-panel">
          <h1 id="seller-access-title">{title}</h1>
          <p className="seller-access-description">{description}</p>
          {authState.propertyTitle || authState.sellerEmail ? (
            <div className="seller-access-property"><Home size={18} aria-hidden="true" /><div>
              {authState.propertyTitle ? <strong>{authState.propertyTitle}</strong> : null}
              {authState.sellerEmail ? <span>{authState.sellerEmail}</span> : null}
            </div></div>
          ) : null}
          <form onSubmit={onSubmit} className="seller-access-form" aria-busy={saving}>
            <div className="seller-access-field">
              <label htmlFor="seller-access-password">{creating ? 'Create password' : 'Password'}</label>
              <div className="seller-access-input-wrap">
                <input id="seller-access-password" type={showPassword ? 'text' : 'password'} value={form.password}
                  onChange={(event) => onChange('password', event.target.value)}
                  autoComplete={creating ? 'new-password' : 'current-password'} required minLength={8}
                  disabled={saving} aria-describedby={creating ? 'seller-access-password-hint' : undefined}
                  placeholder={creating ? 'Choose a password' : 'Enter your password'} />
                <button type="button" className="seller-access-reveal" aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {creating ? <p id="seller-access-password-hint" className="seller-access-hint">Use at least 8 characters.</p> : null}
            </div>
            {creating ? <div className="seller-access-field">
              <label htmlFor="seller-access-confirm">Confirm password</label>
              <input id="seller-access-confirm" type={showPassword ? 'text' : 'password'} value={form.confirmPassword}
                onChange={(event) => onChange('confirmPassword', event.target.value)} autoComplete="new-password"
                required minLength={8} disabled={saving} placeholder="Enter your password again" />
            </div> : null}
            {!passwordSet && !recoveryMode ? <div className="seller-access-consent">
              <label className="seller-access-checkbox"><input type="checkbox" checked={Boolean(form.termsAccepted)}
                onChange={(event) => onChange('termsAccepted', event.target.checked)} disabled={saving} />
                <span>I accept the Arch9 terms and conditions and consent to the processing of my personal information as described below.</span>
              </label>
              <details className="seller-access-terms"><summary>Read terms and privacy consent</summary>
                <div><strong>{terms.sellerTermsTitle}</strong><p>{terms.sellerTermsBody}</p><p>{terms.popiBody}</p></div>
              </details>
            </div> : null}
            {feedback ? <p className="seller-access-feedback" role="alert">{feedback}</p> : null}
            {notice ? <p className="seller-access-notice" role="status">{notice}</p> : null}
            <button type="submit" className="seller-access-submit" disabled={saving}>
              {saving ? 'Please wait…' : recoveryMode ? 'Save new password' : passwordSet ? 'Open seller portal' : 'Create password & continue'}
              {!saving ? <ArrowRight size={18} aria-hidden="true" /> : null}
            </button>
            {passwordSet && !recoveryMode ? <button type="button" className="seller-access-recovery"
              disabled={recoveryRequesting || saving} onClick={onRequestRecovery}>
              {recoveryRequesting ? 'Requesting secure reset…' : 'Forgot your password?'}
            </button> : null}
          </form>
        </div>
      </section>
      <footer className="seller-access-footer"><ShieldCheck size={14} aria-hidden="true" /> Your property details are protected</footer>
    </main>
  )
}
