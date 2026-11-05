import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, UploadCloud } from 'lucide-react'
import OnboardingProgressLayout from './OnboardingProgressLayout'
import './agency-workspace-onboarding.css'
import { updateUserProfile } from '../../lib/profileApi'
import { uploadAccountAvatar, uploadOrganisationBrandingAsset } from '../../lib/settingsApi'
import { applyAgencyBrandingUpload } from '../../lib/agencyOnboarding'
import { createWorkspaceFromIntent } from '../../services/workspaceService'
import { SIGNUP_WORKSPACE_ACTIONS } from '../../constants/signupIntents'

function Field({ label, hint, children }) {
  return <label className="setup-field"><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>
}

export default function CompanyOnboardingForm({ profile, authState, intent, initialForm, draftStorageKey, refreshAuthState, configuration }) {
  const { steps, logoVariants, createDraft, restoreDraft, validateStep, buildSubmission, workspaceType, className, title, businessTypes } = configuration
  const navigate = useNavigate()
  const [draft, setDraft] = useState(() => {
    const fallback = createDraft(profile, initialForm, intent)
    try { return restoreDraft(window.localStorage.getItem(draftStorageKey), fallback) } catch { return fallback }
  })
  const [saving, setSaving] = useState(false)
  const [uploadingTarget, setUploadingTarget] = useState('')
  const [error, setError] = useState('')
  const [draftSavedAt, setDraftSavedAt] = useState('')
  const completedRef = useRef(false)
  const busy = saving || Boolean(uploadingTarget)
  const verifiedEmail = authState.user?.email || profile?.email || ''
  const { personalDetails, companyDetails, branding } = draft
  const stepIndex = Math.max(0, steps.findIndex((step) => step.key === draft.currentStepKey))
  const currentStep = steps[stepIndex]
  const isFinalStep = stepIndex === steps.length - 1
  const colour = (key) => /^#[0-9a-f]{6}$/i.test(branding.brandColours[key] || '') ? branding.brandColours[key] : key === 'primary' ? '#166b50' : '#152621'

  useEffect(() => {
    if (!draftStorageKey || saving || completedRef.current) return undefined
    const timeout = window.setTimeout(() => {
      try {
        const savedAt = new Date().toISOString()
        window.localStorage.setItem(draftStorageKey, JSON.stringify({ ...draft, savedAt }))
        setDraftSavedAt(new Date(savedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }))
      } catch { /* Draft storage must never block onboarding. */ }
    }, 900)
    return () => window.clearTimeout(timeout)
  }, [draft, draftStorageKey, saving])

  function update(section, field, value) {
    setDraft((previous) => ({ ...previous, [section]: { ...previous[section], [field]: value } }))
    setError('')
  }

  function updateColour(key, value) {
    setDraft((previous) => ({ ...previous, branding: { ...previous.branding, brandColours: { ...previous.branding.brandColours, [key]: value } } }))
    setError('')
  }

  function selectStep(index) {
    if (busy) return
    for (let position = 0; position < index; position += 1) {
      const step = steps[position]
      const message = validateStep(step.key, draft)
      if (message) {
        setDraft((previous) => ({ ...previous, currentStepKey: step.key }))
        setError(message)
        return
      }
    }
    setError('')
    setDraft((previous) => ({ ...previous, currentStepKey: steps[index].key }))
  }

  async function uploadLogo(file, asset) {
    if (!file || busy) return
    setUploadingTarget(asset.key)
    setError('')
    try {
      const uploaded = await uploadOrganisationBrandingAsset({ file, variant: asset.variant })
      setDraft((previous) => ({ ...previous, branding: applyAgencyBrandingUpload(previous.branding, asset.key, uploaded, file.name) }))
    } catch (failure) { setError(failure?.message || 'Your logo could not be uploaded. Try again or continue without it.') }
    finally { setUploadingTarget('') }
  }

  async function uploadPhoto(file) {
    if (!file || busy) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Choose a JPG, PNG or WebP image smaller than 5 MB.')
      return
    }
    setUploadingTarget('photo')
    setError('')
    try {
      const uploaded = await uploadAccountAvatar({ file })
      update('personalDetails', 'avatarUrl', uploaded.resolvedUrl || uploaded.publicUrl)
    } catch (failure) { setError(failure?.message || 'Your photo could not be uploaded. Try again or continue without it.') }
    finally { setUploadingTarget('') }
  }

  async function complete() {
    if (busy) return
    for (const step of steps) {
      const message = validateStep(step.key, draft)
      if (message) { selectStep(steps.indexOf(step)); setError(message); return }
    }
    if (intent?.workspace_type !== workspaceType || intent?.workspace_action !== SIGNUP_WORKSPACE_ACTIONS.createWorkspace) {
      setError('Use your invitation or request access to join an existing company.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await updateUserProfile({ userId: authState.user?.id, firstName: personalDetails.firstName.trim(), lastName: personalDetails.lastName.trim(), avatarUrl: personalDetails.avatarUrl })
      await createWorkspaceFromIntent(intent, authState.user, buildSubmission(draft, verifiedEmail, intent))
      completedRef.current = true
      try { window.localStorage.removeItem(draftStorageKey) } catch { /* Completion does not depend on local storage. */ }
      refreshAuthState?.()
      navigate('/dashboard', { replace: true })
    } catch (failure) { setError(failure?.message || 'Your company could not be set up. Please try again.') }
    finally { setSaving(false) }
  }

  function submit(event) {
    event.preventDefault()
    if (busy) return
    const message = validateStep(currentStep.key, draft)
    if (message) { setError(message); return }
    if (isFinalStep) void complete()
    else selectStep(stepIndex + 1)
  }

  return (
    <div className="setup-module-shell">
      <OnboardingProgressLayout title={title} className={`agency-workspace-onboarding company-workspace-onboarding ${className}`} steps={steps} activeStep={currentStep.key} onStepChange={selectStep} stepNavigationDisabled={busy}>
        <form className="agency-setup-shell" onSubmit={submit}>
          <section className="agency-setup-main">
            <div className="agency-setup-card">
              <header className="setup-section-header"><div><h2>{currentStep.key === 'personal' ? 'Your details' : currentStep.key === 'company' ? 'Company details' : 'Make it yours'}</h2></div></header>
              {currentStep.key === 'personal' ? <>
                <div className="agency-signup-photo">
                  <div className="agency-signup-avatar">{personalDetails.avatarUrl ? <img src={personalDetails.avatarUrl} alt="Your profile" /> : <span aria-hidden="true">{[personalDetails.firstName, personalDetails.lastName].map((part) => part?.[0] || '').join('') || 'You'}</span>}</div>
                  <div>
                    <label className="setup-secondary-button agency-signup-upload">{uploadingTarget === 'photo' ? 'Uploading…' : personalDetails.avatarUrl ? 'Change profile photo' : 'Add profile photo'}<input type="file" aria-label="Profile photo (optional)" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { void uploadPhoto(event.target.files?.[0]); event.target.value = '' }} /></label>
                    <p>Optional · JPG, PNG or WebP, up to 5 MB</p>
                  </div>
                </div>
                <div className="setup-field-grid">
                  <Field label="First name"><input className="setup-input" autoComplete="given-name" required value={personalDetails.firstName} onChange={(event) => update('personalDetails', 'firstName', event.target.value)} /></Field>
                  <Field label="Surname"><input className="setup-input" autoComplete="family-name" required value={personalDetails.lastName} onChange={(event) => update('personalDetails', 'lastName', event.target.value)} /></Field>
                  <Field label="Email" hint="Already verified"><input className="setup-input" type="email" autoComplete="email" readOnly value={verifiedEmail} /></Field>
                </div>
              </> : currentStep.key === 'company' ? <div className="setup-field-grid">
                {businessTypes ? <Field label="Business type"><select className="setup-input" value={companyDetails.workspaceKind} onChange={(event) => update('companyDetails', 'workspaceKind', event.target.value)}>{businessTypes.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}</select></Field> : null}
                <Field label="Company name"><input className="setup-input" autoComplete="organization" required value={companyDetails.name} onChange={(event) => update('companyDetails', 'name', event.target.value)} /></Field>
                <Field label="Company registration number (optional)"><input className="setup-input" value={companyDetails.registrationNumber || ''} onChange={(event) => update('companyDetails', 'registrationNumber', event.target.value)} /></Field>
              </div> : <>
                <div className="agency-signup-logo-options">
                  {logoVariants.map((asset) => <div className="agency-signup-logo-option" key={asset.key}>
                    <div className={`agency-signup-logo-preview${asset.key === 'logoDark' ? ' is-dark' : ''}${asset.key === 'logoIcon' ? ' is-icon' : ''}`}>{branding[asset.key] ? <img src={branding[asset.key]} alt={`${asset.label} preview`} /> : <Building2 size={28} aria-hidden="true" />}</div>
                    <div className="agency-signup-logo-caption"><strong>{asset.label}</strong><span>{asset.description}</span></div>
                    <label className="setup-secondary-button agency-signup-upload"><UploadCloud size={14} />{uploadingTarget === asset.key ? 'Uploading…' : branding[asset.key] ? 'Change' : 'Upload'}<input type="file" aria-label={`${asset.label} (optional)`} accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={busy} onChange={(event) => { void uploadLogo(event.target.files?.[0], asset); event.target.value = '' }} /></label>
                  </div>)}
                </div>
                <div className="setup-field-grid">{['primary', 'secondary'].map((key) => {
                  const label = key === 'primary' ? 'Primary colour' : 'Secondary colour'
                  return <Field label={`${label} (optional)`} key={key}><div className="setup-colour-field"><input type="color" aria-label={`Choose ${label.toLowerCase()}`} value={colour(key)} onChange={(event) => updateColour(key, event.target.value)} /><input className="setup-input" aria-label={`${label} hex`} maxLength={7} pattern="#[0-9a-fA-F]{6}" title="Use a six-digit hex colour" value={branding.brandColours[key]} onChange={(event) => updateColour(key, event.target.value)} /></div></Field>
                })}</div>
                <div className="agency-signup-colour-preview" style={{ '--agency-colour': colour('primary') }} aria-label="Your branding preview">{branding.logoIcon ? <img src={branding.logoIcon} alt="Company icon preview" /> : <Building2 size={24} />}<strong>{companyDetails.name || 'Your company'}</strong><span className="company-signup-secondary-swatch" aria-label="Secondary colour preview" style={{ background: colour('secondary') }} /></div>
              </>}
            </div>
            {error ? <p className="setup-message error" role="alert">{error}</p> : draftSavedAt ? <p className="setup-message success">Draft saved {draftSavedAt}.</p> : null}
            <div className="agency-setup-actions">
              <button type="button" className="setup-secondary-button" disabled={busy || stepIndex === 0} onClick={() => selectStep(stepIndex - 1)}>Back</button>
              <div className="agency-signup-final-actions">
                {isFinalStep ? <button type="button" className="agency-signup-skip" disabled={busy} onClick={() => void complete()}>Skip for now</button> : null}
                <button type="submit" className="setup-primary-button" disabled={busy}>{saving ? 'Opening your workspace…' : isFinalStep ? 'Open my workspace' : <>Continue <ArrowRight size={16} /></>}</button>
              </div>
            </div>
          </section>
        </form>
      </OnboardingProgressLayout>
    </div>
  )
}
