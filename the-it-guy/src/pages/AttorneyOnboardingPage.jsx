import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import AttorneyOnboardingLayout from '../components/attorney/onboarding/AttorneyOnboardingLayout'
import FirmInfoStep from '../components/attorney/onboarding/FirmInfoStep'
import BrandingStep from '../components/attorney/onboarding/BrandingStep'
import DepartmentsStep from '../components/attorney/onboarding/DepartmentsStep'
import TeamInvitesStep from '../components/attorney/onboarding/TeamInvitesStep'
import {
  getAllowedDepartmentsForRole,
  normalizeInviteForRole,
} from '../components/attorney/onboarding/teamInviteUtils'
import ReviewConfirmStep from '../components/attorney/onboarding/ReviewConfirmStep'
import {
  completeAttorneyFirmOnboarding,
  getCurrentUserPrimaryAttorneyFirm,
  resolveAttorneyOnboardingErrorMessage,
  uploadAttorneyFirmBrandingAsset,
} from '../services/attorneyFirms'
import { normalizeWebsite } from '../services/attorneyFirmServiceShared'

const ONBOARDING_STEPS = [
  {
    key: 'firm_information',
    label: 'Firm Information',
    description: 'Core profile and contact details.',
  },
  {
    key: 'branding',
    label: 'Branding',
    description: 'Logo, colours, and identity preview.',
  },
  {
    key: 'departments',
    label: 'Active Departments',
    description: 'Choose transfer, bond, admin, and management lanes.',
  },
  {
    key: 'team_invites',
    label: 'Invite Team Members',
    description: 'Optional setup of initial staff invites.',
  },
  {
    key: 'review_confirm',
    label: 'Review & Confirm',
    description: 'Verify setup before activation.',
  },
]

const DEFAULT_FIRM_INFORMATION = {
  name: '',
  registrationNumber: '',
  vatNumber: '',
  email: '',
  phone: '',
  website: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  province: '',
  postalCode: '',
  country: 'South Africa',
}

const DEFAULT_BRANDING = {
  logoUrl: '',
  logoFileName: '',
  logoBucket: '',
  logoPath: '',
  logoDarkUrl: '',
  logoDarkFileName: '',
  logoDarkBucket: '',
  logoDarkPath: '',
  primaryColour: '#0f4c81',
  secondaryColour: '#1e2a44',
}

const DEFAULT_DEPARTMENTS = {
  transfer: true,
  bond: true,
  admin: true,
  management: true,
}

function buildInviteId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `invite-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

function createEmptyInvite(defaultDepartmentType = '') {
  return {
    id: buildInviteId(),
    email: '',
    role: '',
    departmentType: defaultDepartmentType,
  }
}

function isValidEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  if (!email) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isValidWebsite(value) {
  return !value || Boolean(normalizeWebsite(value))
}

function normalizeHexColour(value, fallback) {
  const normalized = String(value || '').trim()
  if (!normalized) return fallback
  const match = normalized.match(/^#([0-9a-fA-F]{6})$/)
  return match ? `#${match[1]}`.toLowerCase() : fallback
}

function getActiveDepartmentTypes(selectedDepartments = {}) {
  return ['transfer', 'bond', 'admin', 'management'].filter((type) => Boolean(selectedDepartments[type]))
}

function validateFirmInformation(values) {
  const errors = {}
  if (!String(values.name || '').trim()) {
    errors.name = 'Firm name is required.'
  }
  if (values.email && !isValidEmail(values.email)) {
    errors.email = 'Please enter a valid email address.'
  }
  if (values.website && !isValidWebsite(values.website)) {
    errors.website = 'Please enter a valid domain, such as bridge9.co.za.'
  }
  return errors
}

function validateBranding(values) {
  const errors = {}
  if (values.primaryColour && !/^#[0-9a-fA-F]{6}$/.test(values.primaryColour)) {
    errors.primaryColour = 'Use a valid hex colour.'
  }
  if (values.secondaryColour && !/^#[0-9a-fA-F]{6}$/.test(values.secondaryColour)) {
    errors.secondaryColour = 'Use a valid hex colour.'
  }
  return errors
}

function validateInvites(invites = [], activeDepartmentTypes = []) {
  const errors = {}
  const emailSeen = new Set()

  for (const invite of invites) {
    const rowErrors = {}
    const normalizedEmail = String(invite.email || '').trim().toLowerCase()

    if (!normalizedEmail) {
      rowErrors.email = 'Email is required.'
    } else if (!isValidEmail(normalizedEmail)) {
      rowErrors.email = 'Please enter a valid email address.'
    } else if (emailSeen.has(normalizedEmail)) {
      rowErrors.email = 'Duplicate invitation email.'
    } else {
      emailSeen.add(normalizedEmail)
    }

    if (!invite.role) {
      rowErrors.role = 'Role is required.'
    } else if (invite.role === 'firm_admin') {
      rowErrors.role = 'Firm admin invitations are not allowed during onboarding.'
    }

    const allowedDepartments = getAllowedDepartmentsForRole(invite.role, activeDepartmentTypes)
    if (!invite.departmentType) {
      rowErrors.departmentType = 'Department is required.'
    } else if (!allowedDepartments.includes(invite.departmentType)) {
      rowErrors.departmentType = 'Selected department is not valid for this role.'
    }

    if (Object.keys(rowErrors).length) {
      errors[invite.id] = rowErrors
    }
  }

  return errors
}

function formatSavedTime(iso = '') {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function buildDraftStorageKey(profileId = '') {
  return `itg:attorney-onboarding-draft:${String(profileId || 'anonymous').trim() || 'anonymous'}`
}

function AttorneyOnboardingPage() {
  const navigate = useNavigate()
  const { role, profile, refreshProfile } = useWorkspace()
  const [firmLoading, setFirmLoading] = useState(true)
  const [existingFirm, setExistingFirm] = useState(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [firmInformation, setFirmInformation] = useState(DEFAULT_FIRM_INFORMATION)
  const [branding, setBranding] = useState(DEFAULT_BRANDING)
  const [selectedDepartments, setSelectedDepartments] = useState(DEFAULT_DEPARTMENTS)
  const [invites, setInvites] = useState([])
  const [errorsByStep, setErrorsByStep] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [uploadingLogoTarget, setUploadingLogoTarget] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [draftSavedAt, setDraftSavedAt] = useState('')
  const [completedOnboarding, setCompletedOnboarding] = useState(null)

  const activeDepartmentTypes = useMemo(() => getActiveDepartmentTypes(selectedDepartments), [selectedDepartments])
  const draftStorageKey = useMemo(() => buildDraftStorageKey(profile?.id), [profile?.id])

  useEffect(() => {
    let active = true

    async function loadCurrentFirm() {
      setFirmLoading(true)
      try {
        const firm = await getCurrentUserPrimaryAttorneyFirm()
        if (!active) return
        setExistingFirm(firm)
      } catch (loadError) {
        if (!active) return
        setSubmitError(resolveAttorneyOnboardingErrorMessage(loadError))
      } finally {
        if (active) setFirmLoading(false)
      }
    }

    void loadCurrentFirm()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(draftStorageKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed?.firmInformation && typeof parsed.firmInformation === 'object') {
        setFirmInformation((previous) => ({ ...previous, ...parsed.firmInformation }))
      }
      if (parsed?.branding && typeof parsed.branding === 'object') {
        setBranding((previous) => ({ ...previous, ...parsed.branding }))
      }
      if (parsed?.selectedDepartments && typeof parsed.selectedDepartments === 'object') {
        setSelectedDepartments((previous) => ({ ...previous, ...parsed.selectedDepartments, management: true }))
      }
      if (Array.isArray(parsed?.invites)) {
        setInvites(parsed.invites.map((invite) => ({
          id: invite.id || buildInviteId(),
          email: String(invite.email || ''),
          role: String(invite.role || ''),
          departmentType: String(invite.departmentType || ''),
        })))
      }
      if (typeof parsed?.currentStepIndex === 'number') {
        setCurrentStepIndex(Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, parsed.currentStepIndex)))
      }
      setDraftSavedAt(formatSavedTime(parsed?.savedAt))
    } catch {
      // Ignore malformed draft payloads and continue with defaults.
    }
  }, [draftStorageKey])

  function setStepErrors(stepKey, errors) {
    setErrorsByStep((previous) => ({
      ...previous,
      [stepKey]: errors,
    }))
  }

  function updateFirmInformation(field, value) {
    setFirmInformation((previous) => ({ ...previous, [field]: value }))
    setStepErrors('firm_information', {})
  }

  function updateBranding(field, value) {
    setBranding((previous) => ({ ...previous, [field]: value }))
    setStepErrors('branding', {})
  }

  async function handleLogoUpload(file, target = 'light') {
    if (!file) return
    setUploadError('')
    setSubmitError('')
    setUploadingLogoTarget(target)
    try {
      const upload = await uploadAttorneyFirmBrandingAsset({ file, variant: target === 'dark' ? 'logo-dark' : 'logo-light' })
      setBranding((previous) => ({
        ...previous,
        ...(target === 'dark'
          ? {
              logoDarkUrl: upload.resolvedUrl || upload.publicUrl || upload.signedUrl || '',
              logoDarkFileName: upload.fileName || '',
              logoDarkBucket: upload.bucket || '',
              logoDarkPath: upload.path || '',
            }
          : {
              logoUrl: upload.resolvedUrl || upload.publicUrl || upload.signedUrl || '',
              logoFileName: upload.fileName || '',
              logoBucket: upload.bucket || '',
              logoPath: upload.path || '',
            }),
      }))
    } catch (error) {
      setUploadError(error?.message || 'Unable to upload logo right now. Please retry.')
    } finally {
      setUploadingLogoTarget('')
    }
  }

  function removeLogo(target = 'light') {
    if (target === 'dark') {
      setBranding((previous) => ({
        ...previous,
        logoDarkUrl: '',
        logoDarkFileName: '',
        logoDarkBucket: '',
        logoDarkPath: '',
      }))
      return
    }

    setBranding((previous) => ({
      ...previous,
      logoUrl: '',
      logoFileName: '',
      logoBucket: '',
      logoPath: '',
    }))
  }

  function toggleDepartment(type) {
    if (type === 'management') return
    setSelectedDepartments((previous) => ({
      ...previous,
      [type]: !previous[type],
      management: true,
    }))
    setStepErrors('departments', {})
  }

  function addInvite() {
    const defaultDepartmentType = activeDepartmentTypes[0] || 'management'
    setInvites((previous) => [...previous, createEmptyInvite(defaultDepartmentType)])
    setStepErrors('team_invites', {})
  }

  function removeInvite(inviteId) {
    setInvites((previous) => previous.filter((invite) => invite.id !== inviteId))
    setStepErrors('team_invites', {})
  }

  function updateInvite(inviteId, field, value) {
    setInvites((previous) =>
      previous.map((invite) => {
        if (invite.id !== inviteId) return invite
        const updatedInvite = {
          ...invite,
          [field]: value,
        }

        if (field === 'role') {
          return normalizeInviteForRole(updatedInvite, activeDepartmentTypes)
        }

        return updatedInvite
      }),
    )
    setStepErrors('team_invites', {})
  }

  function saveDraft() {
    if (typeof window === 'undefined') return
    const payload = {
      currentStepIndex,
      firmInformation,
      branding,
      selectedDepartments,
      invites,
      savedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(draftStorageKey, JSON.stringify(payload))
    setDraftSavedAt(formatSavedTime(payload.savedAt))
  }

  function validateCurrentStep() {
    const stepKey = ONBOARDING_STEPS[currentStepIndex]?.key

    if (stepKey === 'firm_information') {
      const errors = validateFirmInformation(firmInformation)
      setStepErrors(stepKey, errors)
      return Object.keys(errors).length === 0
    }

    if (stepKey === 'branding') {
      const errors = validateBranding(branding)
      setStepErrors(stepKey, errors)
      return Object.keys(errors).length === 0
    }

    if (stepKey === 'team_invites') {
      const errors = validateInvites(invites, activeDepartmentTypes)
      setStepErrors(stepKey, errors)
      return Object.keys(errors).length === 0
    }

    setStepErrors(stepKey, {})
    return true
  }

  function handleNext() {
    setSubmitError('')
    if (!validateCurrentStep()) {
      return
    }
    setCurrentStepIndex((previous) => Math.min(previous + 1, ONBOARDING_STEPS.length - 1))
  }

  function handleBack() {
    setSubmitError('')
    setCurrentStepIndex((previous) => Math.max(previous - 1, 0))
  }

  async function handleConfirm() {
    setSubmitError('')
    const validStep = validateCurrentStep()
    if (!validStep) return

    setSubmitting(true)
    try {
      const onboardingPayload = {
        firmInformation: {
          ...firmInformation,
          website: normalizeWebsite(firmInformation.website),
        },
        branding: {
          ...branding,
          primaryColour: normalizeHexColour(branding.primaryColour, DEFAULT_BRANDING.primaryColour),
          secondaryColour: normalizeHexColour(branding.secondaryColour, DEFAULT_BRANDING.secondaryColour),
        },
        activeDepartmentTypes,
        invites: invites.map((invite) => ({
          email: String(invite.email || '').trim().toLowerCase(),
          role: invite.role,
          departmentType: invite.departmentType,
        })),
      }

      const completion = await completeAttorneyFirmOnboarding(onboardingPayload)
      await refreshProfile()
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(draftStorageKey)
      }
      setCompletedOnboarding(completion)
    } catch (submitFailure) {
      setSubmitError(resolveAttorneyOnboardingErrorMessage(submitFailure))
    } finally {
      setSubmitting(false)
    }
  }

  const currentStep = ONBOARDING_STEPS[currentStepIndex]

  let stepContent = null
  if (currentStep.key === 'firm_information') {
    stepContent = (
      <FirmInfoStep values={firmInformation} errors={errorsByStep.firm_information || {}} onChange={updateFirmInformation} />
    )
  } else if (currentStep.key === 'branding') {
    stepContent = (
      <BrandingStep
        values={branding}
        errors={errorsByStep.branding || {}}
        onChange={updateBranding}
        firmName={firmInformation.name}
        onUploadLightLogo={(file) => handleLogoUpload(file, 'light')}
        onUploadDarkLogo={(file) => handleLogoUpload(file, 'dark')}
        onRemoveLightLogo={() => removeLogo('light')}
        onRemoveDarkLogo={() => removeLogo('dark')}
        uploadingTarget={uploadingLogoTarget}
        uploadError={uploadError}
      />
    )
  } else if (currentStep.key === 'departments') {
    stepContent = (
      <DepartmentsStep selectedDepartments={selectedDepartments} onToggleDepartment={toggleDepartment} />
    )
  } else if (currentStep.key === 'team_invites') {
    stepContent = (
      <TeamInvitesStep
        invites={invites}
        activeDepartmentTypes={activeDepartmentTypes}
        onAddInvite={addInvite}
        onRemoveInvite={removeInvite}
        onUpdateInvite={updateInvite}
        errors={errorsByStep.team_invites || {}}
      />
    )
  } else {
    stepContent = (
      <ReviewConfirmStep
        firmInformation={firmInformation}
        branding={branding}
        activeDepartmentTypes={activeDepartmentTypes}
        invites={invites}
      />
    )
  }

  if (role !== 'attorney') {
    return <Navigate to="/dashboard" replace />
  }

  if (firmLoading) {
    return (
      <section className="page">
        <div className="panel card-tier-standard">
          <p className="status-message" style={{ margin: 0 }}>Loading attorney onboarding workspace...</p>
        </div>
      </section>
    )
  }

  if (existingFirm?.id) {
    return <Navigate to="/attorney/dashboard" replace />
  }

  if (completedOnboarding?.firm?.id) {
    return (
      <section className="page" style={{ maxWidth: '1040px' }}>
        <div className="panel card-tier-standard" style={{ display: 'grid', gap: '1rem' }}>
          <h2 style={{ margin: 0 }}>Firm setup complete</h2>
          <p className="status-message" style={{ margin: 0 }}>
            {completedOnboarding.firm.name} is ready. Your legal workspace, branding, and departments are now active.
          </p>
          {Array.isArray(completedOnboarding.inviteWarnings) && completedOnboarding.inviteWarnings.length ? (
            <div className="panel card-tier-soft" style={{ display: 'grid', gap: '0.35rem', padding: '0.85rem' }}>
              <strong>Invite follow-ups</strong>
              {completedOnboarding.inviteWarnings.map((warning) => (
                <p key={warning} className="status-message" style={{ margin: 0 }}>{warning}</p>
              ))}
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button type="button" className="header-primary-cta" onClick={() => navigate('/attorney/dashboard', { replace: true })}>
              Open Attorney Dashboard
            </button>
            <button type="button" className="header-secondary-cta" onClick={() => navigate('/transactions')}>
              Create First Transaction
            </button>
            <button type="button" className="header-secondary-cta" onClick={() => navigate('/settings/organisation')}>
              Invite More Team Members
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <AttorneyOnboardingLayout
      steps={ONBOARDING_STEPS}
      currentStepIndex={currentStepIndex}
      subtitle="Create and configure your attorney firm workspace before opening operations."
      onBack={handleBack}
      onNext={handleNext}
      onConfirm={handleConfirm}
      onSaveDraft={saveDraft}
      canBack={currentStepIndex > 0}
      canNext={!submitting}
      isFinalStep={currentStepIndex === ONBOARDING_STEPS.length - 1}
      isSubmitting={submitting}
      errorMessage={submitError}
      draftSavedAt={draftSavedAt}
      nextLabel={currentStepIndex === ONBOARDING_STEPS.length - 2 ? 'Review Setup' : 'Continue'}
    >
      {stepContent}
    </AttorneyOnboardingLayout>
  )
}

export default AttorneyOnboardingPage
