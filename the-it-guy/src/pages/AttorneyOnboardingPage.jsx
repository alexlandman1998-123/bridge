import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import AttorneyOnboardingLayout from '../components/attorney/onboarding/AttorneyOnboardingLayout'
import FirmInfoStep from '../components/attorney/onboarding/FirmInfoStep'
import BrandingStep from '../components/attorney/onboarding/BrandingStep'
import DepartmentsStep from '../components/attorney/onboarding/DepartmentsStep'
import TeamInvitesStep, {
  getAllowedDepartmentsForRole,
  normalizeInviteForRole,
} from '../components/attorney/onboarding/TeamInvitesStep'
import ReviewConfirmStep from '../components/attorney/onboarding/ReviewConfirmStep'
import { getCurrentUserPrimaryAttorneyFirm, completeAttorneyFirmOnboarding } from '../services/attorneyFirms'

const ONBOARDING_STEPS = [
  {
    key: 'firm_information',
    label: 'Firm Information',
    description: 'Core profile and contact details.',
  },
  {
    key: 'branding',
    label: 'Branding',
    description: 'Logo and colour identity setup.',
  },
  {
    key: 'departments',
    label: 'Active Departments',
    description: 'Choose transfer, bond, and admin lanes.',
  },
  {
    key: 'team_invites',
    label: 'Invite Team Members',
    description: 'Optional setup of initial staff invites.',
  },
  {
    key: 'review_confirm',
    label: 'Review & Confirm',
    description: 'Verify everything before activation.',
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
  const website = String(value || '').trim()
  if (!website) return true
  try {
    const parsed = new URL(website)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
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
    errors.website = 'Please enter a valid website URL.'
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

function AttorneyOnboardingPage() {
  const navigate = useNavigate()
  const { role, refreshProfile } = useWorkspace()
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

  const activeDepartmentTypes = useMemo(() => getActiveDepartmentTypes(selectedDepartments), [selectedDepartments])

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
        setSubmitError(loadError.message || 'Unable to load attorney firm context.')
      } finally {
        if (active) setFirmLoading(false)
      }
    }

    void loadCurrentFirm()
    return () => {
      active = false
    }
  }, [])

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
        firmInformation,
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

      await completeAttorneyFirmOnboarding(onboardingPayload)
      await refreshProfile()
      navigate('/attorney/dashboard', { replace: true })
    } catch (submitFailure) {
      setSubmitError(submitFailure.message || 'Failed to complete attorney onboarding. Please review your details and try again.')
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
          <p className="status-message" style={{ margin: 0 }}>Loading attorney onboarding workspace…</p>
        </div>
      </section>
    )
  }

  if (existingFirm?.id) {
    return <Navigate to="/attorney/dashboard" replace />
  }

  return (
    <AttorneyOnboardingLayout
      steps={ONBOARDING_STEPS}
      currentStepIndex={currentStepIndex}
      subtitle="Create and configure your attorney firm workspace before opening operations."
      onBack={handleBack}
      onNext={handleNext}
      onConfirm={handleConfirm}
      canBack={currentStepIndex > 0}
      canNext={!submitting}
      isFinalStep={currentStepIndex === ONBOARDING_STEPS.length - 1}
      isSubmitting={submitting}
      errorMessage={submitError}
      nextLabel={currentStepIndex === ONBOARDING_STEPS.length - 2 ? 'Review Setup' : 'Continue'}
    >
      {stepContent}
    </AttorneyOnboardingLayout>
  )
}

export default AttorneyOnboardingPage
