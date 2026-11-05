import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight, Scale, UploadCloud } from 'lucide-react'
import { useAuthSession } from '../context/AuthSessionContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { SIGNUP_WORKSPACE_ACTIONS } from '../constants/signupIntents'
import { buildPartnerInviteAutoAcceptPath, readPendingPartnerInvitePath } from '../lib/pendingPartnerInvite'
import { updateUserProfile } from '../lib/profileApi'
import { uploadAccountAvatar } from '../lib/settingsApi'
import OnboardingProgressLayout from '../components/onboarding/OnboardingProgressLayout'
import '../components/onboarding/agency-workspace-onboarding.css'
import {
  DEFAULT_DEPARTMENTS,
  buildDraftStorageKey,
  buildSelectedDepartmentsFromRows,
  getActiveDepartmentTypes,
} from '../components/attorney/onboarding/attorneyOnboardingGuidance'
import {
  ATTORNEY_SIGNUP_STEPS,
  ATTORNEY_LOGO_VARIANTS,
  ATTORNEY_SIGNUP_COLOURS,
  createAttorneySignupDraft,
  restoreAttorneySignupDraft,
  validateAttorneySignupStep,
  buildAttorneySignupPayload,
  applyAttorneyLogoUpload,
} from '../components/attorney/onboarding/attorneyQuickStart'
import {
  completeAttorneyFirmOnboarding,
  getAttorneyFirmDepartments,
  getCurrentUserPrimaryAttorneyFirm,
  getAttorneyQuickStartDetails,
  resolveAttorneyOnboardingErrorMessage,
  uploadAttorneyFirmBrandingAsset,
} from '../services/attorneyFirms'

const ATTORNEY_ONBOARDING_LOAD_TIMEOUT_MS = 15000
function withAttorneyOnboardingTimeout(task, message) {
  let timeoutId
  return Promise.race([
    task,
    new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error(message)), ATTORNEY_ONBOARDING_LOAD_TIMEOUT_MS) }),
  ]).finally(() => clearTimeout(timeoutId))
}

function Field({ label, hint, children }) {
  return <label className="setup-field"><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>
}

function Heading({ children }) {
  return <header className="setup-section-header"><div><h2>{children}</h2></div></header>
}

export default function AttorneyOnboardingPage() {
  const navigate = useNavigate()
  const { authState } = useAuthSession()
  const { role, profile, signupIntent } = useWorkspace()
  const userId = authState.user?.id || profile?.id
  const intent = signupIntent || authState.signupIntent
  const isJoinPath = [SIGNUP_WORKSPACE_ACTIONS.joinOrRequestWorkspace, SIGNUP_WORKSPACE_ACTIONS.acceptInvite].includes(intent?.workspace_action)
  const verifiedEmail = authState.user?.email || profile?.email || ''
  const draftStorageKey = useMemo(() => userId ? buildDraftStorageKey(userId) : '', [userId])
  const [draft, setDraft] = useState(() => createAttorneySignupDraft(profile))
  const [firmLoading, setFirmLoading] = useState(true)
  const [firmLookupFailed, setFirmLookupFailed] = useState(false)
  const [existingFirm, setExistingFirm] = useState(null)
  const [selectedDepartments, setSelectedDepartments] = useState(DEFAULT_DEPARTMENTS)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [uploadingTarget, setUploadingTarget] = useState('')
  const [draftSavedAt, setDraftSavedAt] = useState('')
  const completedRef = useRef(false)
  const hydratedUserRef = useRef('')
  const activeDepartmentTypes = getActiveDepartmentTypes(selectedDepartments)
  const stepIndex = Math.max(0, ATTORNEY_SIGNUP_STEPS.findIndex((step) => step.key === draft.currentStepKey))
  const currentStep = ATTORNEY_SIGNUP_STEPS[stepIndex]
  const isFinalStep = stepIndex === ATTORNEY_SIGNUP_STEPS.length - 1
  const busy = submitting || Boolean(uploadingTarget)
  const { personalDetails, firmInformation, branding } = draft

  useEffect(() => {
    if (role !== 'attorney' || isJoinPath || hydratedUserRef.current === userId) return
    let active = true
    async function load() {
      setFirmLoading(true)
      setFirmLookupFailed(false)
      let fallback = createAttorneySignupDraft(profile)
      try {
        const firm = await withAttorneyOnboardingTimeout(getCurrentUserPrimaryAttorneyFirm(), 'Firm lookup is taking too long. Please refresh and try again.')
        if (!active) return
        setExistingFirm(firm)
        fallback = createAttorneySignupDraft(profile, firm)
        if (firm?.id) {
          const [departmentResult, extraResult] = await Promise.allSettled([
            withAttorneyOnboardingTimeout(getAttorneyFirmDepartments(firm.id), 'Department lookup timed out.'),
            withAttorneyOnboardingTimeout(getAttorneyQuickStartDetails(firm.organisationId), 'Firm details lookup timed out.'),
          ])
          if (!active) return
          if (departmentResult.status === 'rejected') throw departmentResult.reason
          if (extraResult.status === 'rejected') throw extraResult.reason
          if (departmentResult.status === 'fulfilled') setSelectedDepartments(buildSelectedDepartmentsFromRows(departmentResult.value))
          if (extraResult.status === 'fulfilled') {
            const extra = extraResult.value
            fallback.firmInformation.lpcNumber = extra?.lpcNumber || ''
            for (const key of ['logoIconUrl', 'logoIconBucket', 'logoIconPath', 'logoIconFileName']) {
              fallback.branding[key] = extra?.branding?.[key] || ''
            }
          }
        }
      } catch (loadError) {
        if (!active) return
        setError(loadError?.message || 'Your saved firm could not be loaded. Please refresh before continuing.')
        setFirmLookupFailed(true)
        // A failed lookup must not offer creation of a possibly duplicate firm.
        return
      } finally {
        if (active) setFirmLoading(false)
      }
      if (!active) return
      let saved = null
      try { saved = draftStorageKey ? window.localStorage.getItem(draftStorageKey) : null } catch { /* A blocked draft store must not block setup. */ }
      setDraft(saved ? restoreAttorneySignupDraft(saved, fallback) : fallback)
      hydratedUserRef.current = userId
    }
    void load()
    return () => { active = false }
  }, [profile, role, isJoinPath, draftStorageKey, userId])

  useEffect(() => {
    if (firmLoading || firmLookupFailed || submitting || !draftStorageKey || completedRef.current) return undefined
    const timeoutId = window.setTimeout(() => {
      try {
        const savedAt = new Date().toISOString()
        window.localStorage.setItem(draftStorageKey, JSON.stringify({ ...draft, savedAt }))
        setDraftSavedAt(new Date(savedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }))
      } catch { /* Autosave must never block onboarding. */ }
    }, 900)
    return () => window.clearTimeout(timeoutId)
  }, [draft, draftStorageKey, firmLoading, firmLookupFailed, submitting])

  function update(section, field, value) {
    setDraft((previous) => ({ ...previous, [section]: { ...previous[section], [field]: value } }))
    setError('')
  }

  function selectStep(index) {
    if (busy) return
    for (let position = 0; position < index; position += 1) {
      const message = validateAttorneySignupStep(ATTORNEY_SIGNUP_STEPS[position].key, draft)
      if (message) {
        setDraft((previous) => ({ ...previous, currentStepKey: ATTORNEY_SIGNUP_STEPS[position].key }))
        setError(message)
        return
      }
    }
    setError('')
    setDraft((previous) => ({ ...previous, currentStepKey: ATTORNEY_SIGNUP_STEPS[index].key }))
  }

  async function uploadLogo(file, asset) {
    if (!file || busy) return
    setUploadingTarget(asset.key)
    setError('')
    try {
      const uploaded = await uploadAttorneyFirmBrandingAsset({ file, variant: asset.variant })
      setDraft((previous) => ({ ...previous, branding: applyAttorneyLogoUpload(previous.branding, asset, uploaded, file.name) }))
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

  function openAttorneyDashboard() {
    authState.refreshAuthState?.()
    const pendingPartnerInvitePath = readPendingPartnerInvitePath(authState.signupIntent)
    const target = pendingPartnerInvitePath
      ? buildPartnerInviteAutoAcceptPath(pendingPartnerInvitePath)
      : '/attorney/dashboard'
    if (typeof window !== 'undefined') { window.location.replace(target); return }
    navigate(target, { replace: true })
  }

  async function handleConfirm() {
    if (busy) return
    for (const step of ATTORNEY_SIGNUP_STEPS) {
      const message = validateAttorneySignupStep(step.key, draft)
      if (message) { selectStep(ATTORNEY_SIGNUP_STEPS.indexOf(step)); setError(message); return }
    }
    setSubmitting(true)
    setError('')
    try {
      await updateUserProfile({ userId, firstName: personalDetails.firstName.trim(), lastName: personalDetails.lastName.trim(), avatarUrl: personalDetails.avatarUrl })
      const onboardingPayload = buildAttorneySignupPayload(draft, verifiedEmail, activeDepartmentTypes)
      await completeAttorneyFirmOnboarding(onboardingPayload)
      completedRef.current = true
      try { window.localStorage.removeItem(draftStorageKey) } catch { /* Completion does not depend on local storage access. */ }
      openAttorneyDashboard()
    } catch (failure) { setError(resolveAttorneyOnboardingErrorMessage(failure)) }
    finally { setSubmitting(false) }
  }

  function submit(event) {
    event.preventDefault()
    if (busy) return
    const message = validateAttorneySignupStep(currentStep.key, draft)
    if (message) { setError(message); return }
    if (isFinalStep) void handleConfirm()
    else selectStep(stepIndex + 1)
  }

  if (role !== 'attorney') return <Navigate to="/dashboard" replace />
  if (isJoinPath) return <Navigate to="/setup" replace />
  if (existingFirm?.createdBy && existingFirm.createdBy !== userId) return <Navigate to="/attorney/dashboard" replace />

  return (
    <div className="setup-module-shell">
      <OnboardingProgressLayout title="Set up your firm workspace" className="agency-workspace-onboarding attorney-workspace-onboarding" steps={ATTORNEY_SIGNUP_STEPS} activeStep={currentStep.key} onStepChange={selectStep} stepNavigationDisabled={busy || firmLoading}>
        {firmLoading ? <p className="setup-message" role="status">Loading your firm…</p> : firmLookupFailed ? (
          <div className="agency-setup-card">
            <p className="setup-message error" role="alert">{error}</p>
            <button type="button" className="setup-secondary-button" onClick={() => window.location.reload()}>Reload setup</button>
          </div>
        ) : (
          <form className="agency-setup-shell" onSubmit={submit}>
            <section className="agency-setup-main">
              <div className="agency-setup-card">
                {currentStep.key === 'personal' ? <>
                  <Heading>Your details</Heading>
                  <div className="agency-signup-photo">
                    <div className="agency-signup-avatar">{personalDetails.avatarUrl ? <img src={personalDetails.avatarUrl} alt="Your profile" /> : <span aria-hidden="true">{[personalDetails.firstName, personalDetails.lastName].map((part) => part?.[0] || '').join('') || 'You'}</span>}</div>
                    <div>
                      <label className="setup-secondary-button agency-signup-upload">
                        {uploadingTarget === 'photo' ? 'Uploading…' : personalDetails.avatarUrl ? 'Change profile photo' : 'Add profile photo'}
                        <input type="file" aria-label="Profile photo (optional)" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { void uploadPhoto(event.target.files?.[0]); event.target.value = '' }} />
                      </label>
                      <p>Optional · JPG, PNG or WebP, up to 5 MB</p>
                    </div>
                  </div>
                  <div className="setup-field-grid">
                    <Field label="First name"><input className="setup-input" autoComplete="given-name" required value={personalDetails.firstName} onChange={(event) => update('personalDetails', 'firstName', event.target.value)} /></Field>
                    <Field label="Surname"><input className="setup-input" autoComplete="family-name" required value={personalDetails.lastName} onChange={(event) => update('personalDetails', 'lastName', event.target.value)} /></Field>
                    <Field label="Email" hint="Already verified"><input className="setup-input" type="email" autoComplete="email" readOnly value={verifiedEmail} /></Field>
                  </div>
                </> : currentStep.key === 'firm_information' ? <>
                  <Heading>Firm details</Heading>
                  <div className="setup-field-grid">
                    <Field label="Firm name"><input className="setup-input" autoComplete="organization" required value={firmInformation.name} onChange={(event) => update('firmInformation', 'name', event.target.value)} /></Field>
                    <Field label="Company registration number (optional)"><input className="setup-input" value={firmInformation.registrationNumber || ''} onChange={(event) => update('firmInformation', 'registrationNumber', event.target.value)} /></Field>
                    <Field label="LPC number (optional)"><input className="setup-input" value={firmInformation.lpcNumber || ''} onChange={(event) => update('firmInformation', 'lpcNumber', event.target.value)} /></Field>
                  </div>
                </> : <>
                  <Heading>Make it yours</Heading>
                  <div className="agency-signup-logo-options">
                    {ATTORNEY_LOGO_VARIANTS.map((asset) => <div className="agency-signup-logo-option" key={asset.key}>
                      <div className={`agency-signup-logo-preview${asset.key === 'logoDarkUrl' ? ' is-dark' : ''}${asset.key === 'logoIconUrl' ? ' is-icon' : ''}`}>{branding[asset.key] ? <img src={branding[asset.key]} alt={`${asset.label} preview`} /> : <Scale size={28} aria-hidden="true" />}</div>
                      <div className="agency-signup-logo-caption"><strong>{asset.label}</strong><span>{asset.description}</span></div>
                      <label className="setup-secondary-button agency-signup-upload"><UploadCloud size={14} />{uploadingTarget === asset.key ? 'Uploading…' : branding[asset.key] ? 'Change' : 'Upload'}<input type="file" aria-label={`${asset.label} (optional)`} accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={busy} onChange={(event) => { void uploadLogo(event.target.files?.[0], asset); event.target.value = '' }} /></label>
                    </div>)}
                  </div>
                  <div className="setup-field-grid">
                    {['primaryColour', 'secondaryColour'].map((field) => {
                      const label = field === 'primaryColour' ? 'Primary colour' : 'Secondary colour'
                      const value = /^#[0-9a-f]{6}$/i.test(branding[field] || '') ? branding[field] : ATTORNEY_SIGNUP_COLOURS[field]
                      return <Field label={`${label} (optional)`} key={field}><div className="setup-colour-field"><input type="color" aria-label={`Choose ${label.toLowerCase()}`} value={value} onChange={(event) => update('branding', field, event.target.value)} /><input className="setup-input" aria-label={`${label} hex`} maxLength={7} pattern="#[0-9a-fA-F]{6}" title="Use a six-digit hex colour" value={branding[field]} onChange={(event) => update('branding', field, event.target.value)} /></div></Field>
                    })}
                  </div>
                  <div className="agency-signup-colour-preview" style={{ '--agency-colour': /^#[0-9a-f]{6}$/i.test(branding.primaryColour || '') ? branding.primaryColour : ATTORNEY_SIGNUP_COLOURS.primaryColour }} aria-label="Your branding preview">
                    {branding.logoIconUrl ? <img src={branding.logoIconUrl} alt="Firm icon preview" /> : <Scale size={24} />}
                    <strong>{firmInformation.name || 'Your firm'}</strong>
                    <span className="attorney-signup-secondary-swatch" aria-label="Secondary colour preview" style={{ background: /^#[0-9a-f]{6}$/i.test(branding.secondaryColour || '') ? branding.secondaryColour : ATTORNEY_SIGNUP_COLOURS.secondaryColour }} />
                  </div>
                </>}
              </div>
              {error ? <p className="setup-message error" role="alert">{error}</p> : draftSavedAt ? <p className="setup-message success">Draft saved {draftSavedAt}.</p> : null}
              <div className="agency-setup-actions">
                <button type="button" className="setup-secondary-button" disabled={busy || stepIndex === 0} onClick={() => selectStep(stepIndex - 1)}>Back</button>
                <div className="agency-signup-final-actions">
                  {isFinalStep ? <button type="button" className="agency-signup-skip" disabled={busy} onClick={() => void handleConfirm()}>Skip for now</button> : null}
                  <button type="submit" className="setup-primary-button" disabled={busy}>{submitting ? 'Opening your workspace…' : isFinalStep ? 'Open my workspace' : <>Continue <ArrowRight size={16} /></>}</button>
                </div>
              </div>
            </section>
          </form>
        )}
      </OnboardingProgressLayout>
    </div>
  )
}
