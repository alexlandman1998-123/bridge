import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuthSession } from '../context/AuthSessionContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { buildPartnerInviteAutoAcceptPath, readPendingPartnerInvitePath } from '../lib/pendingPartnerInvite'
import AttorneyOnboardingLayout from '../components/attorney/onboarding/AttorneyOnboardingLayout'
import FirmInfoStep from '../components/attorney/onboarding/FirmInfoStep'
import BrandingStep from '../components/attorney/onboarding/BrandingStep'
import DepartmentsStep from '../components/attorney/onboarding/DepartmentsStep'
import TeamInvitesStep from '../components/attorney/onboarding/TeamInvitesStep'
import WorkspacePreviewStep from '../components/attorney/onboarding/WorkspacePreviewStep'
import {
  ONBOARDING_STEPS,
  DEFAULT_FIRM_INFORMATION,
  DEFAULT_BRANDING,
  DEFAULT_DEPARTMENTS,
  buildBrandingFromFirm,
  buildDraftPayload,
  buildDraftStorageKey,
  buildFirmInformationFromFirm,
  buildOnboardingGuidance,
  buildSelectedDepartmentsFromRows,
  createEmptyInvite,
  formatSavedTime,
  getActiveDepartmentTypes,
  getValidationErrorsForStep,
  hasValidationErrors,
  normalizeHexColour,
  parseDraftPayload,
} from '../components/attorney/onboarding/attorneyOnboardingGuidance'
import { normalizeInviteForRole } from '../components/attorney/onboarding/teamInviteUtils'
import ReviewConfirmStep from '../components/attorney/onboarding/ReviewConfirmStep'
import {
  completeAttorneyFirmOnboarding,
  getAttorneyFirmDepartments,
  getCurrentUserPrimaryAttorneyFirm,
  resolveAttorneyOnboardingErrorMessage,
  uploadAttorneyFirmBrandingAsset,
} from '../services/attorneyFirms'
import { normalizeWebsite } from '../services/attorneyFirmServiceShared'

const ATTORNEY_ONBOARDING_LOAD_TIMEOUT_MS = 15000

function withAttorneyOnboardingTimeout(task, message, timeoutMs = ATTORNEY_ONBOARDING_LOAD_TIMEOUT_MS) {
  let timeoutId = null
  return Promise.race([
    task,
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
    }),
  ]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })
}

function AttorneyOnboardingPage() {
  const navigate = useNavigate()
  const { authState } = useAuthSession()
  const { role, profile } = useWorkspace()
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
  const [draftHydrated, setDraftHydrated] = useState(false)

  const activeDepartmentTypes = useMemo(() => getActiveDepartmentTypes(selectedDepartments), [selectedDepartments])
  const draftStorageKey = useMemo(() => buildDraftStorageKey(profile?.id), [profile?.id])
  const onboardingGuidance = useMemo(
    () => buildOnboardingGuidance({ firmInformation, branding, activeDepartmentTypes, invites }),
    [firmInformation, branding, activeDepartmentTypes, invites],
  )
  const previewSnapshot = useMemo(() => ({
    firmInformation,
    branding,
    activeDepartmentTypes,
    invites,
  }), [firmInformation, branding, activeDepartmentTypes, invites])
  const draftSnapshot = useMemo(() => ({
    currentStepIndex,
    firmInformation,
    branding,
    selectedDepartments,
    invites,
  }), [currentStepIndex, firmInformation, branding, selectedDepartments, invites])

  function openAttorneyDashboard() {
    authState.refreshAuthState?.()
    const pendingPartnerInvitePath = readPendingPartnerInvitePath()
    const target = pendingPartnerInvitePath
      ? buildPartnerInviteAutoAcceptPath(pendingPartnerInvitePath)
      : '/attorney/dashboard'
    if (typeof window !== 'undefined') {
      window.location.replace(target)
      return
    }
    navigate(target, { replace: true })
  }

  useEffect(() => {
    let active = true

    async function loadCurrentFirm() {
      setFirmLoading(true)
      try {
        const firm = await withAttorneyOnboardingTimeout(
          getCurrentUserPrimaryAttorneyFirm(),
          'Attorney firm lookup is taking too long.',
        )
        if (!active) return
        setExistingFirm(firm)
        if (firm?.id) {
          setFirmInformation((previous) => ({
            ...previous,
            ...buildFirmInformationFromFirm(firm),
          }))
          setBranding((previous) => ({
            ...previous,
            ...buildBrandingFromFirm(firm),
          }))
          try {
            const departments = await withAttorneyOnboardingTimeout(
              getAttorneyFirmDepartments(firm.id),
              'Attorney firm departments are taking too long to load.',
            )
            if (!active) return
            setSelectedDepartments(buildSelectedDepartmentsFromRows(departments))
          } catch (departmentLoadError) {
            console.warn('[Attorney Onboarding] existing firm departments could not be loaded; using defaults.', departmentLoadError)
            if (!active) return
            setSelectedDepartments(DEFAULT_DEPARTMENTS)
          }
        }
      } catch (loadError) {
        if (!active) return
        console.warn('[Attorney Onboarding] firm lookup failed; opening setup form.', loadError)
        setExistingFirm(null)
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
    setDraftHydrated(false)
    try {
      const raw = window.localStorage.getItem(draftStorageKey)
      if (raw) {
        const parsed = parseDraftPayload(raw)
        if (parsed) {
          setFirmInformation((previous) => ({ ...previous, ...parsed.firmInformation }))
          setBranding((previous) => ({ ...previous, ...parsed.branding }))
          setSelectedDepartments((previous) => ({ ...previous, ...parsed.selectedDepartments }))
          setInvites(parsed.invites)
          setCurrentStepIndex(parsed.currentStepIndex)
          setDraftSavedAt(formatSavedTime(parsed.savedAt))
        }
      }
    } catch {
      // Ignore malformed draft payloads and continue with defaults.
    } finally {
      setDraftHydrated(true)
    }
  }, [draftStorageKey])

  useEffect(() => {
    if (typeof window === 'undefined' || !draftHydrated || submitting) return undefined
    const timeoutId = window.setTimeout(() => {
      const savedAt = new Date().toISOString()
      try {
        const payload = buildDraftPayload({ ...draftSnapshot, savedAt })
        window.localStorage.setItem(draftStorageKey, JSON.stringify(payload))
        setDraftSavedAt(formatSavedTime(savedAt))
      } catch {
        // Draft autosave should never block setup.
      }
    }, 900)

    return () => window.clearTimeout(timeoutId)
  }, [draftHydrated, draftSnapshot, draftStorageKey, submitting])

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
    const savedAt = new Date().toISOString()
    const payload = buildDraftPayload({ ...draftSnapshot, savedAt })
    window.localStorage.setItem(draftStorageKey, JSON.stringify(payload))
    setDraftSavedAt(formatSavedTime(savedAt))
  }

  function validateStep(stepKey, { commitErrors = true } = {}) {
    const errors = getValidationErrorsForStep(stepKey, {
      firmInformation,
      branding,
      invites,
      activeDepartmentTypes,
    })
    if (commitErrors) setStepErrors(stepKey, errors)
    return !hasValidationErrors(errors)
  }

  function validateStepsBefore(targetIndex) {
    const boundedTargetIndex = Math.max(0, Math.min(targetIndex, ONBOARDING_STEPS.length - 1))
    let firstInvalidIndex = -1

    for (let index = 0; index < boundedTargetIndex; index += 1) {
      const stepKey = ONBOARDING_STEPS[index]?.key
      if (stepKey && !validateStep(stepKey)) {
        firstInvalidIndex = index
        break
      }
    }

    if (firstInvalidIndex >= 0) {
      setCurrentStepIndex(firstInvalidIndex)
      setSubmitError('Complete the highlighted setup item before jumping ahead.')
      return false
    }

    return true
  }

  function handleNext() {
    setSubmitError('')
    const targetIndex = Math.min(currentStepIndex + 1, ONBOARDING_STEPS.length - 1)
    if (!validateStepsBefore(targetIndex)) return
    setCurrentStepIndex(targetIndex)
  }

  function handleBack() {
    setSubmitError('')
    setCurrentStepIndex((previous) => Math.max(previous - 1, 0))
  }

  function handleStepSelect(targetIndex) {
    const boundedTargetIndex = Math.max(0, Math.min(targetIndex, ONBOARDING_STEPS.length - 1))
    if (boundedTargetIndex === currentStepIndex) return
    setSubmitError('')
    if (boundedTargetIndex < currentStepIndex || validateStepsBefore(boundedTargetIndex)) {
      setCurrentStepIndex(boundedTargetIndex)
    }
  }

  function handleReviewStepRequest(stepKey) {
    const targetIndex = ONBOARDING_STEPS.findIndex((step) => step.key === stepKey)
    if (targetIndex < 0) return
    setSubmitError('')
    setCurrentStepIndex(targetIndex)
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame?.(() => {
        document.querySelector('.attorney-setup-workbench')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      })
    }
  }

  async function handleConfirm() {
    setSubmitError('')
    const setupReady = validateStepsBefore(ONBOARDING_STEPS.length - 1)
    if (!setupReady) return

    const currentActivationGuard = onboardingGuidance.activationDossier?.activationGuard
    if (currentActivationGuard && !currentActivationGuard.canActivate) {
      if (currentActivationGuard.stepKey) handleReviewStepRequest(currentActivationGuard.stepKey)
      setSubmitError(currentActivationGuard.message || 'Resolve required setup items before activating the workspace.')
      return
    }

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

      await completeAttorneyFirmOnboarding(onboardingPayload)
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(draftStorageKey)
      }
      openAttorneyDashboard()
    } catch (submitFailure) {
      setSubmitError(resolveAttorneyOnboardingErrorMessage(submitFailure))
    } finally {
      setSubmitting(false)
    }
  }

  const currentStep = ONBOARDING_STEPS[currentStepIndex]
  const activationGuard = onboardingGuidance.activationDossier?.activationGuard
  const isFinalStep = currentStepIndex === ONBOARDING_STEPS.length - 1
  const finalActivationBlocked = Boolean(isFinalStep && activationGuard && !activationGuard.canActivate)
  const activationBlockedMessage = finalActivationBlocked ? activationGuard.message : ''
  const readinessPercent = typeof onboardingGuidance.readiness?.percent === 'number' ? onboardingGuidance.readiness.percent : 0
  const nextStep = ONBOARDING_STEPS[Math.min(currentStepIndex + 1, ONBOARDING_STEPS.length - 1)]
  const nextStepLabel = nextStep?.key === 'review_confirm'
    ? 'Review Setup'
    : nextStep?.key === 'workspace_preview'
      ? 'Preview Workspace'
      : 'Continue'

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
  } else if (currentStep.key === 'review_confirm') {
    stepContent = (
      <ReviewConfirmStep
        firmInformation={firmInformation}
        branding={branding}
        activeDepartmentTypes={activeDepartmentTypes}
        invites={invites}
        activationDossier={onboardingGuidance.activationDossier}
        onNavigateToStep={handleReviewStepRequest}
      />
    )
  } else {
    stepContent = (
      <WorkspacePreviewStep
        preview={previewSnapshot}
        readiness={onboardingGuidance.readiness}
        progressPercent={readinessPercent}
        activationGuard={activationGuard}
        onNavigateToStep={handleReviewStepRequest}
      />
    )
  }

  if (role !== 'attorney') {
    return <Navigate to="/dashboard" replace />
  }

  if (firmLoading) {
    return (
      <section className="page">
        <div className="ui-panel" style={{ padding: '1rem' }}>
          <p className="status-message" style={{ margin: 0 }}>Loading attorney onboarding workspace...</p>
        </div>
      </section>
    )
  }

  return (
    <AttorneyOnboardingLayout
      steps={ONBOARDING_STEPS}
      currentStepIndex={currentStepIndex}
      subtitle={
        existingFirm?.id
          ? 'We found your firm setup in progress. Review the details and confirm setup to finish onboarding.'
          : 'Create and configure your attorney firm workspace before opening operations.'
      }
      onBack={handleBack}
      onNext={handleNext}
      onConfirm={handleConfirm}
      onSaveDraft={saveDraft}
      onStepSelect={handleStepSelect}
      canBack={currentStepIndex > 0}
      canNext={!submitting && !finalActivationBlocked}
      confirmLabel={finalActivationBlocked ? 'Activation Blocked' : 'Activate Workspace'}
      confirmDisabledReason={activationBlockedMessage}
      isFinalStep={isFinalStep}
      isSubmitting={submitting}
      errorMessage={submitError}
      draftSavedAt={draftSavedAt}
      nextLabel={nextStepLabel}
      readiness={onboardingGuidance.readiness}
      stepStatuses={onboardingGuidance.stepStatuses}
    >
      {stepContent}
    </AttorneyOnboardingLayout>
  )
}

export default AttorneyOnboardingPage
