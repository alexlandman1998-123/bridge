import AddressInput from '../components/location/AddressInput'
import '../components/onboarding/agency-workspace-onboarding.css'
import DeveloperOnboardingForm from '../components/onboarding/DeveloperOnboardingForm'
import BondOnboardingForm from '../components/onboarding/BondOnboardingForm'
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuthSession } from '../context/AuthSessionContext'
import { useWorkspace } from '../context/WorkspaceContext'
import OnboardingProgressLayout from '../components/onboarding/OnboardingProgressLayout'
import { APP_ROLE_LABELS } from '../lib/appRoleMetadata'
import { ONBOARDING_REQUIRED_REASONS, ONBOARDING_STATUSES, ONBOARDING_STEPS } from '../constants/onboardingStatuses'
import { SIGNUP_ONBOARDING_PATHS, SIGNUP_WORKSPACE_ACTIONS } from '../constants/signupIntents'
import { clearStoredSignupIntent } from '../lib/signupIntent'
import { hasCommercialAccessMarker } from '../lib/commercialAccess'
import { WORKSPACE_TYPES } from '../constants/workspaceTypes'
import {
  AGENCY_SIGNUP_STEPS,
  applyAgencyBrandingUpload,
  buildAgencySignupSubmission,
  getAgencySignupDetails,
  validateAgencySignupStep,
  buildDefaultAgencyOnboarding,
  createAgencyBranchDraft,
  mergeAgencyOnboardingDraft,
  normalizeAgencyType,
} from '../lib/agencyOnboarding'
import {
  completeAgencyOnboarding,
  uploadOrganisationBrandingAsset,
  uploadAccountAvatar,
} from '../lib/settingsApi'
import { updateUserProfile } from '../lib/profileApi'
import { fetchAgencyOnboardingSettings } from '../lib/organisationBootstrapApi'
import {
  createWorkspaceFromIntent,
  joinWorkspaceFromInvite,
} from '../services/workspaceService'
import { requestOrganizationMembership, searchOrganizations } from '../services/organizationService'

const AGENCY_LOGO_VARIANTS = [
  { key: 'logoLight', label: 'Light logo', variant: 'light', description: 'For light backgrounds' },
  { key: 'logoDark', label: 'Dark logo', variant: 'dark', description: 'For dark backgrounds' },
  { key: 'logoIcon', label: 'Icon', variant: 'icon', description: 'For compact spaces' },
]
const AGENCY_SETUP_STEPS = AGENCY_SIGNUP_STEPS
const SETUP_DRAFT_SCHEMA_VERSION = 1
const SETUP_DRAFT_STORAGE_PREFIX = 'bridge:post-dashboard-setup-draft'
const RESOLVED_WORKSPACE_STALE_RECOVERY_REASONS = new Set([
  ONBOARDING_REQUIRED_REASONS.noActiveMembership,
  ONBOARDING_REQUIRED_REASONS.onboardingIncomplete,
  ONBOARDING_REQUIRED_REASONS.workspaceMissing,
])
const autoInviteAttemptKeys = new Set()

function normalizeText(value) {
  return String(value || '').trim()
}

function isInviteAlreadyAcceptedError(error) {
  const code = normalizeText(error?.code || error?.reason)
  const message = normalizeText(error?.message).toLowerCase()
  return code === 'already_accepted' || message === 'already_accepted' || message.includes('already been accepted')
}

function isBlockingRecoveryReason(reason = '', hasResolvedWorkspaceMembership = false) {
  const normalized = normalizeText(reason)
  if (!normalized) return false
  return !hasResolvedWorkspaceMembership || !RESOLVED_WORKSPACE_STALE_RECOVERY_REASONS.has(normalized)
}

function getPostInviteDashboardPath({ hasCommercialWorkspaceAccess = false, agencySignupType = '', intent = null, baseRole = '' } = {}) {
  if (hasCommercialWorkspaceAccess || agencySignupType === 'commercial') return '/commercial'
  return getDashboardPath(intent?.app_role || baseRole)
}

function buildSetupDraftStorageKey({ userId = '', profileId = '', intent = null } = {}) {
  const ownerId = normalizeText(userId || profileId)
  if (!ownerId) return ''
  const intentKey = normalizeText(intent?.id || intent?.workspace_type || intent?.app_role || 'workspace')
  return `${SETUP_DRAFT_STORAGE_PREFIX}:${ownerId}:${intentKey}`
}

function loadSetupDraft(storageKey) {
  if (!storageKey || typeof window === 'undefined') return null
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || 'null')
    if (!parsed || parsed.schemaVersion !== SETUP_DRAFT_SCHEMA_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

function saveSetupDraft(storageKey, payload = {}) {
  if (!storageKey || typeof window === 'undefined') return
  window.localStorage.setItem(
    storageKey,
    JSON.stringify({
      schemaVersion: SETUP_DRAFT_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      ...payload,
    }),
  )
}

function clearSetupDraft(storageKey) {
  if (!storageKey || typeof window === 'undefined') return
  window.localStorage.removeItem(storageKey)
}

function getWorkspaceNoun(workspaceType = '') {
  if (workspaceType === WORKSPACE_TYPES.agency) return 'agency'
  if (workspaceType === WORKSPACE_TYPES.developerCompany) return 'developer company'
  if (workspaceType === WORKSPACE_TYPES.attorneyFirm) return 'attorney firm'
  if (workspaceType === WORKSPACE_TYPES.bondOriginator) return 'bond originator business'
  return 'workspace'
}

function getAgencyTypeForSignupIntent(intent = null) {
  const onboardingPath = normalizeText(intent?.onboarding_path)
  if (onboardingPath === SIGNUP_ONBOARDING_PATHS.commercialOwner || onboardingPath === SIGNUP_ONBOARDING_PATHS.commercialBroker) return 'commercial'
  if (onboardingPath === SIGNUP_ONBOARDING_PATHS.mixedAgencyOwner || onboardingPath === SIGNUP_ONBOARDING_PATHS.mixedAgencyOperational) return 'mixed'
  return 'residential'
}

function getAgencySetupTitle(agencyType = '') {
  const normalized = normalizeAgencyType(agencyType)
  if (normalized === 'commercial') return 'Set up your commercial brokerage'
  if (normalized === 'mixed') return 'Set up your mixed agency workspace'
  return 'Set up your agency workspace'
}

function getAgencySetupDescription() {
  return 'Your details, agency details and optional branding.'
}

function getDefaultForm(intent, profile) {
  const workspaceNoun = getWorkspaceNoun(intent?.workspace_type)
  const companyName = normalizeText(profile?.companyName)
  return {
    name: companyName || '',
    legalName: companyName || '',
    registrationNumber: '',
    contactNumber: normalizeText(profile?.phoneNumber),
    businessEmail: normalizeText(profile?.email),
    mainBranchName: intent?.workspace_type === WORKSPACE_TYPES.agency ? 'Main Branch' : 'Main Team',
    province: '',
    city: '',
    operatingArea: '',
    primaryContactName: normalizeText(profile?.fullName),
    workspaceNameForRequest: '',
    requestMessage: `Please approve my access to your ${workspaceNoun} on Arch9.`,
    inviteToken: normalizeText(intent?.invite_token),
  }
}

function getDashboardPath(appRole = '') {
  if (appRole === 'attorney') return '/attorney/dashboard'
  if (appRole === 'client') return '/client-access'
  return '/dashboard'
}

function getAgencyDraftDefaults(intent, profile) {
  const defaultDraft = buildDefaultAgencyOnboarding(profile)
  const companyName = normalizeText(profile?.companyName)
  const signupAgencyType = getAgencyTypeForSignupIntent(intent)
  return mergeAgencyOnboardingDraft(defaultDraft, {
    branding: {
      ...defaultDraft.branding,
      brandColours: { ...defaultDraft.branding.brandColours, primary: '#166b50', secondary: '#152621' },
    },
    agencyInformation: {
      ...defaultDraft.agencyInformation,
      agencyName: companyName || defaultDraft.agencyInformation.agencyName,
      tradingName: companyName || defaultDraft.agencyInformation.tradingName,
      agencyType: signupAgencyType,
      businessFocus: signupAgencyType === 'commercial' ? 'sales_rentals' : defaultDraft.agencyInformation.businessFocus,
      mainOfficeNumber: normalizeText(profile?.phoneNumber) || defaultDraft.agencyInformation.mainOfficeNumber,
      mainEmailAddress: normalizeText(profile?.email) || defaultDraft.agencyInformation.mainEmailAddress,
    },
    principalInformation: {
      ...defaultDraft.principalInformation,
      principalFullName: normalizeText(profile?.fullName) || defaultDraft.principalInformation.principalFullName,
      emailAddress: normalizeText(profile?.email) || defaultDraft.principalInformation.emailAddress,
      phoneNumber: normalizeText(profile?.phoneNumber) || defaultDraft.principalInformation.phoneNumber,
      position: intent?.intended_org_role === 'owner' ? 'Owner / Principal' : 'Principal / Owner',
    },
  }, profile)
}

function firstText(...values) {
  for (const value of values) {
    const normalized = normalizeText(value)
    if (normalized) return normalized
  }
  return ''
}

function getOrganisationName(organisation = {}) {
  return firstText(organisation.displayName, organisation.display_name, organisation.name)
}

function getOrganisationAddress(organisation = {}) {
  return firstText(
    organisation.formattedAddress,
    organisation.formatted_address,
    [
      organisation.addressLine1 || organisation.address_line_1,
      organisation.addressLine2 || organisation.address_line_2,
      organisation.suburb,
      organisation.city,
      organisation.province,
      organisation.postalCode || organisation.postal_code,
    ].map(normalizeText).filter(Boolean).join(', '),
  )
}

function mergeClaimWorkspaceDetailsIntoDraft(draft, claimSettings, profile) {
  const currentDraft = mergeAgencyOnboardingDraft(buildDefaultAgencyOnboarding(profile), draft, profile)
  const persistedDraft = claimSettings?.onboarding && typeof claimSettings.onboarding === 'object'
    ? claimSettings.onboarding
    : {}
  const persistedAgency = persistedDraft.agencyInformation || {}
  const persistedPrincipal = persistedDraft.principalInformation || {}
  const organisation = claimSettings?.organisation || {}
  const organisationName = getOrganisationName(organisation)
  const organisationAddress = getOrganisationAddress(organisation)
  const organisationEmail = firstText(
    organisation.companyEmail,
    organisation.company_email,
    organisation.supportEmail,
    organisation.support_email,
  )
  const organisationPhone = firstText(
    organisation.companyPhone,
    organisation.company_phone,
    organisation.supportPhone,
    organisation.support_phone,
  )
  const organisationWebsite = firstText(organisation.website)
  const organisationProvince = firstText(organisation.province)
  const organisationCountry = firstText(organisation.country, 'South Africa')
  const currentAgency = currentDraft.agencyInformation || {}
  const currentPrincipal = currentDraft.principalInformation || {}
  const currentBranches = currentDraft.branchStructure?.branches || []
  const primaryBranch = currentBranches[0] || createAgencyBranchDraft()
  const primaryBranchLocation = firstText(primaryBranch.officeLocation, organisation.city, organisationProvince, organisationAddress)

  return mergeAgencyOnboardingDraft(currentDraft, {
    agencyInformation: {
      ...currentAgency,
      agencyName: firstText(organisationName, persistedAgency.agencyName, currentAgency.agencyName),
      tradingName: firstText(organisationName, persistedAgency.tradingName, currentAgency.tradingName),
      website: firstText(organisationWebsite, persistedAgency.website, currentAgency.website),
      mainOfficeNumber: firstText(organisationPhone, persistedAgency.mainOfficeNumber, currentAgency.mainOfficeNumber),
      mainEmailAddress: firstText(organisationEmail, persistedAgency.mainEmailAddress, currentAgency.mainEmailAddress),
      physicalAddress: firstText(organisationAddress, persistedAgency.physicalAddress, currentAgency.physicalAddress),
      province: firstText(organisationProvince, persistedAgency.province, currentAgency.province),
      country: firstText(organisationCountry, persistedAgency.country, currentAgency.country),
    },
    principalInformation: {
      ...currentPrincipal,
      principalFullName: firstText(currentPrincipal.principalFullName, persistedPrincipal.principalFullName, profile?.fullName),
      emailAddress: firstText(currentPrincipal.emailAddress, persistedPrincipal.emailAddress, profile?.email),
      phoneNumber: firstText(currentPrincipal.phoneNumber, persistedPrincipal.phoneNumber, profile?.phoneNumber),
      position: firstText(currentPrincipal.position, persistedPrincipal.position, 'Principal / Owner'),
    },
    branchStructure: {
      branches: currentBranches.length
        ? currentBranches.map((branch, index) => index === 0
          ? createAgencyBranchDraft({
              ...branch,
              branchName: firstText(branch.branchName, 'Head Office'),
              officeLocation: primaryBranchLocation,
            })
          : branch)
        : [createAgencyBranchDraft({ officeLocation: primaryBranchLocation })],
    },
  }, profile)
}

function SetupStatusCard({ title, children, tone = 'info' }) {
  const toneClass =
    tone === 'warning'
      ? 'border-[#f5d3a4] bg-[#fff8ec] text-[#8a4b10]'
      : tone === 'error'
        ? 'border-[#f2c8c4] bg-[#fff5f4] text-[#9f1c1c]'
        : tone === 'success'
          ? 'border-[#cfe8d8] bg-[#effaf3] text-[#236340]'
          : 'border-[#dbe8f3] bg-[#f8fbff] text-[#1f3d59]'
  return (
    <div className={`rounded-[14px] border px-4 py-3 text-sm leading-6 ${toneClass}`}>
      <strong className="block text-[#142132]">{title}</strong>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function SetupField({ label, children, hint = '' }) {
  return (
    <label className="setup-field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  )
}

function SetupSectionHeader({ eyebrow, title, copy, icon: Icon }) {
  return (
    <header className="setup-section-header">
      {Icon ? (
        <span className="setup-section-icon">
          <Icon size={18} />
        </span>
      ) : null}
      <div>
        {eyebrow ? <p>{eyebrow}</p> : null}
        <h2>{title}</h2>
        {copy ? <span>{copy}</span> : null}
      </div>
    </header>
  )
}

export default function PostDashboardSetup() {
  const navigate = useNavigate()
  const { authState, refreshAuthState } = useAuthSession()
  const {
    profile,
    baseRole,
    signupIntent,
    activeMemberships,
    pendingMemberships,
    suspendedMemberships,
    currentMembership,
    currentWorkspace,
    onboardingState,
    onboardingRequiredReason,
  } = useWorkspace()
  const intent = signupIntent || null
  const [form, setForm] = useState(() => getDefaultForm(intent, profile))
  const [agencyDraft, setAgencyDraft] = useState(() => getAgencyDraftDefaults(intent, profile))
  const [agencyStepIndex, setAgencyStepIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [request, setRequest] = useState(null)
  const [workspaceMatches, setWorkspaceMatches] = useState([])
  const [selectedWorkspace, setSelectedWorkspace] = useState(null)
  const [searchingWorkspaces, setSearchingWorkspaces] = useState(false)
  const [uploadingLogoTarget, setUploadingLogoTarget] = useState('')
  const [claimWorkspaceSettings, setClaimWorkspaceSettings] = useState(null)
  const [claimWorkspaceLoading, setClaimWorkspaceLoading] = useState(false)
  const autosaveTimerRef = useRef(null)
  const hydratedDraftKeyRef = useRef('')
  const inviteAutoContinueRef = useRef('')
  const workspaceNoun = getWorkspaceNoun(intent?.workspace_type)
  const canCreateWorkspace = intent?.workspace_action === SIGNUP_WORKSPACE_ACTIONS.createWorkspace
  const canClaimExistingWorkspace = intent?.workspace_action === SIGNUP_WORKSPACE_ACTIONS.claimExistingWorkspace
  const canJoinOrRequest = intent?.workspace_action === SIGNUP_WORKSPACE_ACTIONS.joinOrRequestWorkspace
  const canAcceptInvite = intent?.workspace_action === SIGNUP_WORKSPACE_ACTIONS.acceptInvite
  const intendedRole = normalizeText(intent?.intended_org_role)
  const isAgencyPrincipalSetup =
    (canCreateWorkspace || canClaimExistingWorkspace) &&
    intent?.workspace_type === WORKSPACE_TYPES.agency &&
    ['owner', 'principal'].includes(intendedRole)
  const isBondOwnerSetup =
    canCreateWorkspace &&
    intent?.workspace_type === WORKSPACE_TYPES.bondOriginator &&
    ['owner', 'director', 'manager'].includes(intendedRole)
  const isDeveloperCompanySetup =
    canCreateWorkspace &&
    intent?.workspace_type === WORKSPACE_TYPES.developerCompany
  const setupDraftStorageKey = useMemo(
    () => buildSetupDraftStorageKey({ userId: authState.user?.id, profileId: profile?.id, intent }),
    [authState.user?.id, intent, profile?.id],
  )
  const agencyCurrentStep = AGENCY_SETUP_STEPS[agencyStepIndex] || AGENCY_SETUP_STEPS[0]
  const agencySignupType = getAgencyTypeForSignupIntent(intent)
  const agencySetupType = agencyDraft?.agencyInformation?.agencyType || agencySignupType
  const claimedWorkspaceName = getOrganisationName(claimWorkspaceSettings?.organisation)
  const hasCommercialWorkspaceAccess = useMemo(
    () => [currentMembership, ...(activeMemberships || [])].some((membership) => hasCommercialAccessMarker(membership)),
    [activeMemberships, currentMembership],
  )
  const hasActiveMembership = activeMemberships.length > 0
  const hasResolvedWorkspaceMembership = Boolean(
    hasActiveMembership &&
      currentMembership?.id &&
      currentWorkspace?.id,
  )
  const recoveryReasons = [onboardingRequiredReason, onboardingState?.recoveryReason]
    .map((reason) => normalizeText(reason))
    .filter(Boolean)
  const hasBlockingRecoveryReason = recoveryReasons.some((reason) => isBlockingRecoveryReason(reason, hasResolvedWorkspaceMembership))
  const canOpenActiveWorkspace = hasResolvedWorkspaceMembership && !hasBlockingRecoveryReason
  const pageTitle = useMemo(() => {
    if (canClaimExistingWorkspace) return claimedWorkspaceName ? `Claim ${claimedWorkspaceName}` : 'Claim your agency workspace'
    if (isAgencyPrincipalSetup) return getAgencySetupTitle(agencySetupType)
    if (isBondOwnerSetup) return 'Set up your bond originator business'
    if (isDeveloperCompanySetup) return 'Set up your developer command centre'
    if (canCreateWorkspace) return `Create your ${workspaceNoun}`
    if (canAcceptInvite) return 'Accept your workspace invite'
    if (canJoinOrRequest) return `Join a ${workspaceNoun}`
    return 'Workspace setup'
  }, [agencySetupType, canAcceptInvite, canClaimExistingWorkspace, canCreateWorkspace, canJoinOrRequest, claimedWorkspaceName, isAgencyPrincipalSetup, isBondOwnerSetup, isDeveloperCompanySetup, workspaceNoun])
  const pageDescription = canClaimExistingWorkspace
    ? claimedWorkspaceName
      ? `${claimedWorkspaceName} already exists in Arch9. Confirm the workspace details to activate your principal access.`
      : 'Confirm the existing agency workspace details to activate your principal access.'
    : isAgencyPrincipalSetup
      ? getAgencySetupDescription(agencySetupType)
      : isBondOwnerSetup
        ? 'Choose the originator setup type, then capture the owner, operating, and launch-team details Arch9 needs to create a complete bond workspace.'
        : isDeveloperCompanySetup
          ? 'Create the developer workspace your sales team, agency partners, attorneys, and buyers will use to manage launches and unit sales.'
        : canAcceptInvite
          ? 'We found your invite. Arch9 will verify it, activate your membership, and open the correct workspace.'
          : 'Arch9 has your profile and signup path. Create or join a workspace to unlock dashboard access.'

  useEffect(() => {
    setForm((previous) => ({
      ...getDefaultForm(intent, profile),
      ...previous,
    }))
    setAgencyDraft((previous) => mergeAgencyOnboardingDraft(getAgencyDraftDefaults(intent, profile), previous, profile))
  }, [intent, profile])

  useEffect(() => {
    if (!canOpenActiveWorkspace || !hasCommercialWorkspaceAccess) return
    clearStoredSignupIntent()
    navigate('/commercial', { replace: true })
  }, [canOpenActiveWorkspace, hasCommercialWorkspaceAccess, navigate])

  useEffect(() => {
    if (!canOpenActiveWorkspace) return
    clearStoredSignupIntent()
    navigate(getPostInviteDashboardPath({ hasCommercialWorkspaceAccess, agencySignupType, intent, baseRole }), { replace: true })
  }, [
    agencySignupType,
    baseRole,
    canOpenActiveWorkspace,
    hasCommercialWorkspaceAccess,
    intent,
    navigate,
  ])

  useEffect(() => {
    if (!isAgencyPrincipalSetup || !setupDraftStorageKey || hydratedDraftKeyRef.current === setupDraftStorageKey) return
    hydratedDraftKeyRef.current = setupDraftStorageKey
    const savedDraft = loadSetupDraft(setupDraftStorageKey)
    if (!savedDraft) return

    setForm((previous) => ({
      ...previous,
      ...(savedDraft.form || {}),
    }))
    setAgencyDraft((previous) =>
      mergeAgencyOnboardingDraft(getAgencyDraftDefaults(intent, profile), savedDraft.agencyDraft || previous, profile),
    )
    const savedStepIndex = Number(savedDraft.agencyStepIndex)
    if (Number.isFinite(savedStepIndex)) {
      const savedKeyIndex = AGENCY_SETUP_STEPS.findIndex((step) => step.key === savedDraft.agencyStepKey)
      // Old drafts combined agency and owner details, followed by branches.
      setAgencyStepIndex(savedKeyIndex >= 0 ? savedKeyIndex : [0, 1, 2, 2, 2][savedStepIndex] || 0)
    }
    if (savedDraft.savedAt) {
      setMessage(`Draft restored from ${new Date(savedDraft.savedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}.`)
    }
  }, [intent, isAgencyPrincipalSetup, profile, setupDraftStorageKey])

  useEffect(() => {
    if (!canClaimExistingWorkspace || !isAgencyPrincipalSetup || !authState.user?.id) {
      setClaimWorkspaceSettings(null)
      setClaimWorkspaceLoading(false)
      return undefined
    }

    let cancelled = false
    setClaimWorkspaceLoading(true)
    fetchAgencyOnboardingSettings({ forceRefresh: true })
      .then((settings) => {
        if (cancelled) return
        setClaimWorkspaceSettings(settings)
        setAgencyDraft((previous) => mergeClaimWorkspaceDetailsIntoDraft(previous, settings, profile))
      })
      .catch((settingsError) => {
        if (cancelled) return
        console.error('[ONBOARDING] claim-workspace-settings:failed', settingsError)
        setError((previous) => previous || 'We could not load the existing workspace details. Refresh and try again.')
      })
      .finally(() => {
        if (!cancelled) {
          setClaimWorkspaceLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [authState.user?.id, canClaimExistingWorkspace, isAgencyPrincipalSetup, profile])

  useEffect(() => {
    if (!isAgencyPrincipalSetup || !setupDraftStorageKey || hydratedDraftKeyRef.current !== setupDraftStorageKey) return undefined
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current)
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      saveSetupDraft(setupDraftStorageKey, {
        form,
        agencyDraft,
        agencyStepIndex,
        agencyStepKey: AGENCY_SETUP_STEPS[agencyStepIndex]?.key,
      })
      setMessage(`Draft saved ${new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}.`)
    }, 800)

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current)
      }
    }
  }, [agencyDraft, agencyStepIndex, form, isAgencyPrincipalSetup, setupDraftStorageKey])

  useEffect(() => {
    const token = normalizeText(intent?.invite_token || form.inviteToken)
    if (!canAcceptInvite || !token || !authState.user?.id || saving) return
    if (inviteAutoContinueRef.current === token) return
    const attemptKey = `${authState.user.id}:${token}`
    if (autoInviteAttemptKeys.has(attemptKey)) {
      setMessage('Invite checked. Workspace access is still being resolved.')
      return
    }
    autoInviteAttemptKeys.add(attemptKey)
    inviteAutoContinueRef.current = token
    const targetPath = getPostInviteDashboardPath({ hasCommercialWorkspaceAccess, agencySignupType, intent, baseRole })

    if (canOpenActiveWorkspace) {
      clearStoredSignupIntent()
      navigate(targetPath, { replace: true })
      return
    }

    async function acceptAndContinue() {
      try {
        setSaving(true)
        setError('')
        setMessage('Accepting invite. Checking your workspace access...')
        await joinWorkspaceFromInvite(token, authState.user, { intent })
        await refreshAuthState?.()
        setMessage('Invite accepted. Finalising your workspace access...')
      } catch (inviteError) {
        if (isInviteAlreadyAcceptedError(inviteError)) {
          setMessage('Invite already accepted. Checking your workspace access once...')
          await refreshAuthState?.()
          return
        }
        setError(inviteError?.message || 'Invite acceptance failed.')
      } finally {
        setSaving(false)
      }
    }

    void acceptAndContinue()
  }, [agencySignupType, authState.user, baseRole, canAcceptInvite, canOpenActiveWorkspace, form.inviteToken, hasCommercialWorkspaceAccess, intent, navigate, refreshAuthState, saving])

  function updateField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  function updateAgencyDraft(nextDraftOrUpdater) {
    setAgencyDraft((previous) => {
      const nextDraft = typeof nextDraftOrUpdater === 'function' ? nextDraftOrUpdater(previous) : nextDraftOrUpdater
      return mergeAgencyOnboardingDraft(previous, nextDraft, profile)
    })
  }

  function updateAgencySection(section, field, value) {
    updateAgencyDraft((previous) => ({
      ...previous,
      [section]: {
        ...(previous?.[section] || {}),
        [field]: value,
      },
    }))
  }

  function updateBrandColour(field, value) {
    updateAgencyDraft((previous) => ({
      ...previous,
      branding: {
        ...(previous?.branding || {}),
        brandColours: {
          ...(previous?.branding?.brandColours || {}),
          [field]: value,
        },
      },
    }))
  }

  function updatePersonalDetails(field, value) {
    updateAgencyDraft((previous) => {
      const details = { ...getAgencySignupDetails(previous, profile), [field]: value }
      return {
        ...previous,
        principalInformation: {
          ...previous.principalInformation,
          ...details,
          principalFullName: [details.firstName, details.lastName].filter(Boolean).join(' '),
        },
      }
    })
  }

  async function handleProfilePhoto(file) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Choose a JPG, PNG or WebP image smaller than 5 MB.')
      return
    }
    try {
      setUploadingLogoTarget('profilePhoto')
      setError('')
      const upload = await uploadAccountAvatar({ file })
      updatePersonalDetails('avatarUrl', upload.resolvedUrl || upload.publicUrl)
    } catch (uploadError) {
      setError(uploadError?.message || 'Your photo could not be uploaded. Try again or continue without it.')
    } finally {
      setUploadingLogoTarget('')
    }
  }

  async function handleLogoUpload(file, targetKey) {
    if (!file) return
    try {
      setUploadingLogoTarget(targetKey)
      setError('')
      setMessage('')
      const upload = await uploadOrganisationBrandingAsset({
        file,
        variant: AGENCY_LOGO_VARIANTS.find((asset) => asset.key === targetKey)?.variant || 'light',
      })
      updateAgencyDraft((previous) => ({
        ...previous,
        branding: applyAgencyBrandingUpload(previous?.branding, targetKey, upload, file.name),
      }))
      setMessage(`${AGENCY_LOGO_VARIANTS.find((asset) => asset.key === targetKey)?.label || 'Logo'} uploaded.`)
    } catch (uploadError) {
      setError(uploadError?.message || 'Unable to upload the selected logo.')
    } finally {
      setUploadingLogoTarget('')
    }
  }

  async function completeAgencyPrincipalSetup() {
    if (saving || uploadingLogoTarget) return
    const allStepError = AGENCY_SETUP_STEPS
      .map((step) => validateAgencySignupStep(step.key, agencyDraft))
      .find(Boolean)
    if (allStepError) {
      setError(allStepError)
      return
    }

    try {
      setSaving(true)
      setError('')
      setMessage('')
      const verifiedEmail = authState.user?.email || profile?.email || principal.emailAddress
      const submission = buildAgencySignupSubmission(agencyDraft, profile, verifiedEmail)
      await updateUserProfile({
        userId: authState.user?.id,
        firstName: submission.principalInformation.firstName,
        lastName: submission.principalInformation.lastName,
        avatarUrl: submission.principalInformation.avatarUrl,
      })
      const result = await completeAgencyOnboarding(submission)
      window.clearTimeout(autosaveTimerRef.current)
      clearSetupDraft(setupDraftStorageKey)
      refreshAuthState?.()
      const organisationName = result.organisation?.displayName || result.organisation?.name || agencyDraft.agencyInformation.agencyName
      const completedAgencyType = normalizeAgencyType(result.onboarding?.agencyInformation?.agencyType || agencyDraft.agencyInformation?.agencyType)
      const targetPath = completedAgencyType === 'commercial' ? '/commercial' : '/dashboard'
      setMessage(`${organisationName} is ready. Opening your workspace…`)
      window.setTimeout(() => {
        navigate(targetPath, { replace: true })
      }, 500)
    } catch (setupError) {
      setError(setupError?.message || 'Agency setup failed.')
    } finally {
      setSaving(false)
    }
  }

  function handleAgencyStepSubmit(event) {
    event.preventDefault()
    if (saving || uploadingLogoTarget) return
    const stepError = validateAgencySignupStep(agencyCurrentStep.key, agencyDraft)
    if (stepError) {
      setError(stepError)
      return
    }

    setError('')
    if (agencyStepIndex < AGENCY_SETUP_STEPS.length - 1) {
      setAgencyStepIndex((previous) => Math.min(previous + 1, AGENCY_SETUP_STEPS.length - 1))
      return
    }
    void completeAgencyPrincipalSetup()
  }

  async function handleCreateWorkspace(event) {
    event.preventDefault()
    if (!intent) {
      setError('Signup intent is missing. Confirm your business type and position first.')
      return
    }
    if (!normalizeText(form.name)) {
      setError('Workspace name is required.')
      return
    }
    if (!normalizeText(form.businessEmail)) {
      setError('Business email is required.')
      return
    }
    if (!normalizeText(form.contactNumber)) {
      setError('Contact number is required.')
      return
    }
    if (intent.workspace_type === WORKSPACE_TYPES.agency && !normalizeText(form.mainBranchName)) {
      setError('Main branch name is required for agency setup.')
      return
    }

    try {
      setSaving(true)
      setError('')
      setMessage('')
      const result = await createWorkspaceFromIntent(intent, authState.user, {
        ...form,
        firstName: profile?.firstName,
        lastName: profile?.lastName,
      })
      refreshAuthState?.()
      setMessage(`${result.workspace.name} is ready. Opening your dashboard...`)
      window.setTimeout(() => {
        navigate(getDashboardPath(intent.app_role), { replace: true })
      }, 500)
    } catch (createError) {
      setError(createError?.message || 'Workspace setup failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAcceptInvite(event) {
    event.preventDefault()
    const token = normalizeText(form.inviteToken)
    if (!token) {
      setError('Invite token is required.')
      return
    }

    try {
      setSaving(true)
      setError('')
      setMessage('')
      await joinWorkspaceFromInvite(token, authState.user, { intent })
      refreshAuthState?.()
      setMessage('Invite accepted. Finalising your workspace access...')
    } catch (inviteError) {
      if (isInviteAlreadyAcceptedError(inviteError)) {
        setMessage('Invite already accepted. Refreshing your workspace access...')
        await refreshAuthState?.()
        return
      }
      setError(inviteError?.message || 'Invite acceptance failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRequestAccess(event) {
    event.preventDefault()
    if (!intent) {
      setError('Signup intent is missing. Confirm your business type and position first.')
      return
    }
    if (!selectedWorkspace?.id) {
      setError(`Search for and select the ${workspaceNoun} you want to join before sending your request.`)
      return
    }

    try {
      setSaving(true)
      setError('')
      setMessage('')
      const membership = await requestOrganizationMembership({
        organizationId: selectedWorkspace.id,
        message: form.requestMessage,
      })
      setRequest({ membership, workspace: selectedWorkspace })
      refreshAuthState?.()
      setMessage(`Access request sent to ${selectedWorkspace.name}. Its owner or admin can review it from the Members queue.`)
    } catch (requestError) {
      setError(requestError?.message || 'Access request failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleWorkspaceSearch() {
    const query = normalizeText(form.workspaceNameForRequest)
    if (query.length < 2) {
      setError(`Enter at least two characters of the ${workspaceNoun} name to search.`)
      return
    }

    try {
      setSearchingWorkspaces(true)
      setError('')
      setWorkspaceMatches(await searchOrganizations({
        query,
        organizationType: intent?.workspace_type || '',
      }))
    } catch (searchError) {
      setWorkspaceMatches([])
      setError(searchError?.message || `Unable to search for ${workspaceNoun}s right now.`)
    } finally {
      setSearchingWorkspaces(false)
    }
  }

  const hasPendingMembership = pendingMemberships.length > 0
  const hasSuspendedMembership = suspendedMemberships.length > 0
  const hasPendingOnboardingState = onboardingState?.onboardingStatus === ONBOARDING_STATUSES.workspacePendingApproval
  const showPendingApprovalNotice = !canAcceptInvite && (hasPendingMembership || hasPendingOnboardingState || request)
  const inviteToken = normalizeText(form.inviteToken)
  const agency = agencyDraft?.agencyInformation || {}
  const principal = agencyDraft?.principalInformation || {}
  const branding = agencyDraft?.branding || {}
  const personalDetails = getAgencySignupDetails(agencyDraft, profile)
  const verifiedEmail = authState.user?.email || profile?.email || principal.emailAddress || ''
  const previewColour = /^#[0-9a-f]{6}$/i.test(branding.brandColours?.primary || '') ? branding.brandColours.primary : '#166b50'
  function renderAgencyStep() {
    if (agencyCurrentStep.key === 'personal') {
      return (
        <div className="agency-setup-card">
          <SetupSectionHeader title="Your details" />
          <div className="agency-signup-photo">
            <div className="agency-signup-avatar">
              {personalDetails.avatarUrl
                ? <img src={personalDetails.avatarUrl} alt="Your profile" />
                : <span aria-hidden="true">{[personalDetails.firstName, personalDetails.lastName].map((part) => part?.[0] || '').join('') || 'You'}</span>}
            </div>
            <div>
              <label className="setup-secondary-button agency-signup-upload">
                {uploadingLogoTarget === 'profilePhoto' ? 'Uploading…' : 'Add profile photo'}
                <input type="file" aria-label="Profile photo (optional)" accept="image/jpeg,image/png,image/webp" disabled={saving || Boolean(uploadingLogoTarget)} onChange={(event) => { void handleProfilePhoto(event.target.files?.[0]); event.target.value = '' }} />
              </label>
              <p>Optional · JPG, PNG or WebP, up to 5 MB</p>
            </div>
          </div>
          <div className="setup-field-grid">
            <SetupField label="First name">
              <input className="setup-input" autoComplete="given-name" required value={personalDetails.firstName} onChange={(event) => updatePersonalDetails('firstName', event.target.value)} />
            </SetupField>
            <SetupField label="Surname">
              <input className="setup-input" autoComplete="family-name" required value={personalDetails.lastName} onChange={(event) => updatePersonalDetails('lastName', event.target.value)} />
            </SetupField>
            <SetupField label="Email" hint="Already verified">
              <input className="setup-input" type="email" autoComplete="email" readOnly value={verifiedEmail} />
            </SetupField>
            <SetupField label="Your FFC number (optional)">
              <input className="setup-input" value={principal.ppraNumber || ''} onChange={(event) => updateAgencySection('principalInformation', 'ppraNumber', event.target.value)} />
            </SetupField>
          </div>
        </div>
      )
    }

    if (agencyCurrentStep.key === 'organisation') {
      return (
        <div className="agency-setup-card">
          <SetupSectionHeader title="Agency details" />
          <div className="setup-field-grid">
            <SetupField label="Agency name">
              <input className="setup-input" autoComplete="organization" required value={agency.agencyName || ''} onChange={(event) => updateAgencySection('agencyInformation', 'agencyName', event.target.value)} />
            </SetupField>
            <SetupField label="Company registration number (optional)">
              <input className="setup-input" value={agency.companyRegistrationNumber || ''} onChange={(event) => updateAgencySection('agencyInformation', 'companyRegistrationNumber', event.target.value)} />
            </SetupField>
            <SetupField label="Agency FFC number (optional)">
              <input className="setup-input" value={agency.eaabPpraNumber || ''} onChange={(event) => updateAgencySection('agencyInformation', 'eaabPpraNumber', event.target.value)} />
            </SetupField>
          </div>
        </div>
      )
    }

    return (
      <div className="agency-setup-card">
        <SetupSectionHeader title="Make it yours" />
        <div className="agency-signup-logo-options">
          {AGENCY_LOGO_VARIANTS.map((asset) => (
            <div className="agency-signup-logo-option" key={asset.key}>
              <div className={`agency-signup-logo-preview${asset.variant === 'dark' ? ' is-dark' : ''}${asset.variant === 'icon' ? ' is-icon' : ''}`}>
                {branding[asset.key]
                  ? <img src={branding[asset.key]} alt={`${asset.label} preview`} />
                  : <Building2 size={28} aria-hidden="true" />}
              </div>
              <div className="agency-signup-logo-caption">
                <strong>{asset.label}</strong>
                <span>{asset.description}</span>
              </div>
              <label className="setup-secondary-button agency-signup-upload">
                <UploadCloud size={14} />
                {uploadingLogoTarget === asset.key ? 'Uploading…' : branding[asset.key] ? 'Change' : 'Upload'}
                <input type="file" aria-label={`${asset.label} (optional)`} accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={saving || Boolean(uploadingLogoTarget)} onChange={(event) => { void handleLogoUpload(event.target.files?.[0], asset.key); event.target.value = '' }} />
              </label>
            </div>
          ))}
        </div>
        <div className="agency-signup-colour-row">
          <SetupField label="Primary colour (optional)">
            <div className="setup-colour-field">
              <input type="color" aria-label="Choose primary colour" value={previewColour} onChange={(event) => updateBrandColour('primary', event.target.value)} />
              <input className="setup-input" aria-label="Primary colour hex" maxLength={7} pattern="#[0-9a-fA-F]{6}" title="Use a six-digit hex colour, such as #166b50" value={branding.brandColours?.primary || ''} onChange={(event) => updateBrandColour('primary', event.target.value)} />
            </div>
          </SetupField>
          <div className="agency-signup-colour-preview" style={{ '--agency-colour': previewColour }} aria-label="Your branding preview">
            {branding.logoIcon ? <img src={branding.logoIcon} alt="Agency icon preview" /> : <Building2 size={24} />}
            <strong>{agency.agencyName || 'Your agency'}</strong>
          </div>
        </div>
      </div>
    )
  }

  if (isBondOwnerSetup && !canOpenActiveWorkspace) {
    return <BondOnboardingForm key={setupDraftStorageKey} profile={profile} authState={authState} intent={intent} initialForm={form} draftStorageKey={setupDraftStorageKey} refreshAuthState={refreshAuthState} />
  }

  if (isDeveloperCompanySetup && !canOpenActiveWorkspace) {
    return <DeveloperOnboardingForm key={setupDraftStorageKey} profile={profile} authState={authState} intent={intent} initialForm={form} draftStorageKey={setupDraftStorageKey} refreshAuthState={refreshAuthState} />
  }

  if (canCreateWorkspace && intent?.workspace_type === WORKSPACE_TYPES.attorneyFirm && !canOpenActiveWorkspace) {
    return <Navigate to="/attorney/onboarding" replace />
  }

  return (
    <OnboardingProgressLayout
      title={canClaimExistingWorkspace && claimWorkspaceLoading ? 'Loading your agency workspace…' : pageTitle}
      description={isAgencyPrincipalSetup && !canClaimExistingWorkspace ? '' : pageDescription}
      activeStep={
        isAgencyPrincipalSetup
          ? agencyCurrentStep.key
          : onboardingState?.onboardingStep || ONBOARDING_STEPS.createOrJoinWorkspace
      }
      steps={isAgencyPrincipalSetup ? AGENCY_SETUP_STEPS : undefined}
      className={isAgencyPrincipalSetup ? 'agency-workspace-onboarding' : canAcceptInvite ? 'setup-invite-progress-page' : ''}
      onStepChange={isAgencyPrincipalSetup ? (index) => {
        const stepError = index > agencyStepIndex
          ? AGENCY_SETUP_STEPS.slice(0, index).map((step) => validateAgencySignupStep(step.key, agencyDraft)).find(Boolean)
          : ''
        if (stepError) { setError(stepError); return }
        setAgencyStepIndex(index)
        setError('')
      } : null}
      stepNavigationDisabled={saving || Boolean(uploadingLogoTarget)}
      panelClassName={canAcceptInvite ? 'setup-invite-progress-panel' : ''}
    >
      {isAgencyPrincipalSetup ? (
        <form className="agency-setup-shell" onSubmit={handleAgencyStepSubmit}>
          <section className="agency-setup-main">
            {renderAgencyStep()}
            {message ? <p className="setup-message success">{message}</p> : null}
            {error ? <p className="setup-message error">{error}</p> : null}
            <div className="agency-setup-actions">
              <button
                type="button"
                className="setup-secondary-button"
                onClick={() => {
                  setError('')
                  setAgencyStepIndex((previous) => Math.max(previous - 1, 0))
                }}
                disabled={saving || Boolean(uploadingLogoTarget) || agencyStepIndex === 0}
              >
                Back
              </button>
              <div className="agency-signup-final-actions">
                {agencyCurrentStep.key === 'branding' ? (
                  <button type="button" className="agency-signup-skip" disabled={saving || Boolean(uploadingLogoTarget)} onClick={() => void completeAgencyPrincipalSetup()}>Skip for now</button>
                ) : null}
                <button type="submit" className="setup-primary-button" disabled={saving || Boolean(uploadingLogoTarget)}>
                  {saving
                    ? 'Opening your workspace...'
                    : agencyStepIndex === AGENCY_SETUP_STEPS.length - 1
                      ? 'Open my workspace'
                      : (
                          <>
                            Continue
                            <ArrowRight size={16} />
                          </>
                        )}
                </button>
              </div>
            </div>
          </section>
        </form>
      ) : (
        <>
          {intent && !canAcceptInvite ? (
            <SetupStatusCard title="Signup path">
              <p>
                {APP_ROLE_LABELS[intent.app_role] || intent.app_role} · {workspaceNoun} ·{' '}
                {intent.intended_org_role.replace(/_/g, ' ')}
              </p>
            </SetupStatusCard>
          ) : !canAcceptInvite ? (
            <SetupStatusCard title="Signup intent missing" tone="warning">
              <p>
                This looks like a legacy or interrupted account. Confirm your business type on the profile recovery
                screen before creating or joining a workspace.
              </p>
              <button type="button" className="header-secondary-cta mt-3" onClick={() => navigate('/onboarding/profile')}>
                Continue profile recovery
              </button>
            </SetupStatusCard>
          ) : null}

          {canOpenActiveWorkspace ? (
            <SetupStatusCard title="Workspace membership active" tone="success">
              <p>Your active membership is ready. You can open your dashboard.</p>
              {currentWorkspace?.name ? (
                <p className="mt-2">
                  You are joining {currentWorkspace.name} as {(currentMembership?.role || '').replace(/_/g, ' ') || 'a member'}.
                </p>
              ) : null}
              <button type="button" className="header-secondary-cta mt-3" onClick={() => navigate(getDashboardPath(baseRole))}>
                Open dashboard
              </button>
            </SetupStatusCard>
          ) : null}

          {showPendingApprovalNotice ? (
            <SetupStatusCard title="Pending approval" tone="warning">
              <p>
                Your workspace access is pending. You cannot open protected dashboards until an owner, principal, partner,
                or manager approves your membership.
              </p>
              {request?.workspace?.name ? (
                <p className="mt-2">
                  Your request is with {request.workspace.name}. Their owner or admin can review it from the Members queue.
                </p>
              ) : null}
            </SetupStatusCard>
          ) : null}

          {hasSuspendedMembership ? (
            <SetupStatusCard title="Access unavailable" tone="error">
              <p>Your existing workspace membership is suspended or removed. Contact your workspace administrator.</p>
            </SetupStatusCard>
          ) : null}

          {canCreateWorkspace ? (
            <form className="grid gap-4 rounded-[16px] border border-[#dde4ee] bg-white px-4 py-4" onSubmit={handleCreateWorkspace}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                  {workspaceNoun[0].toUpperCase() + workspaceNoun.slice(1)} name
                  <input className="auth-input" value={form.name} onChange={(event) => updateField('name', event.target.value)} />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                  Legal name
                  <input className="auth-input" value={form.legalName} onChange={(event) => updateField('legalName', event.target.value)} />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                  Business email
                  <input className="auth-input" type="email" value={form.businessEmail} onChange={(event) => updateField('businessEmail', event.target.value)} />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                  Contact number
                  <input className="auth-input" value={form.contactNumber} onChange={(event) => updateField('contactNumber', event.target.value)} />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                  Registration number
                  <input className="auth-input" value={form.registrationNumber} onChange={(event) => updateField('registrationNumber', event.target.value)} />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                  Province
                  <input className="auth-input" value={form.province} onChange={(event) => updateField('province', event.target.value)} />
                </label>
                {intent?.workspace_type === WORKSPACE_TYPES.agency || intent?.workspace_type === WORKSPACE_TYPES.bondOriginator ? (
                  <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                    {intent.workspace_type === WORKSPACE_TYPES.agency ? 'Main branch name' : 'Main team name'}
                    <input className="auth-input" value={form.mainBranchName} onChange={(event) => updateField('mainBranchName', event.target.value)} />
                  </label>
                ) : null}
                {intent?.workspace_type === WORKSPACE_TYPES.developerCompany ? (
                  <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                    Operating area
                    <input className="auth-input" value={form.operatingArea} onChange={(event) => updateField('operatingArea', event.target.value)} />
                  </label>
                ) : null}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="submit" className="header-primary-cta" disabled={saving}>
                  {saving ? 'Creating workspace...' : `Create ${workspaceNoun}`}
                </button>
              </div>
            </form>
          ) : null}

          {canAcceptInvite ? (
            <form className="setup-invite-panel" onSubmit={handleAcceptInvite}>
              <div className="setup-invite-head">
                <span className="setup-invite-icon">
                  <ShieldCheck size={22} />
                </span>
                <div>
                  <p>Secure invite</p>
                  <h2>Joining your {workspaceNoun} workspace</h2>
                  <span>
                    We will confirm the invite, create your active membership, and send you straight to your dashboard.
                  </span>
                </div>
              </div>

              <div className="setup-invite-token-card">
                <label className="setup-field">
                  <span>Invite token</span>
                  <input
                    className="setup-input setup-invite-token-input"
                    value={form.inviteToken}
                    onChange={(event) => updateField('inviteToken', event.target.value)}
                    disabled={saving}
                    spellCheck="false"
                  />
                </label>
              </div>

              {saving ? (
                <div className="setup-invite-status">
                  <span className="setup-invite-spinner" aria-hidden="true" />
                  <div>
                    <strong>Accepting invite</strong>
                    <p>Syncing your workspace access. This usually takes a few seconds.</p>
                  </div>
                </div>
              ) : error ? (
                <div className="setup-invite-status is-error">
                  <strong>Invite acceptance needs attention</strong>
                  <p>{error}</p>
                </div>
              ) : (
                <div className="setup-invite-status is-ready">
                  <CheckCircle2 size={18} />
                  <div>
                    <strong>Ready to continue</strong>
                    <p>Your invite is loaded and ready to verify.</p>
                  </div>
                </div>
              )}

              <div className="setup-invite-actions">
                <button type="submit" className="setup-primary-button" disabled={saving || !inviteToken}>
                  {saving ? 'Opening workspace...' : 'Continue to workspace'}
                  {!saving ? <ArrowRight size={16} /> : null}
                </button>
              </div>
            </form>
          ) : null}

          {canJoinOrRequest ? (
            <div className="grid gap-4">
              <form className="grid gap-4 rounded-[16px] border border-[#dde4ee] bg-white px-4 py-4" onSubmit={handleAcceptInvite}>
                <SetupStatusCard title="Have an invite code?">
                  <p>Paste it here to join immediately. An invite is the fastest way into an existing workspace.</p>
                </SetupStatusCard>
                <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                  Invite token
                  <input className="auth-input" value={form.inviteToken} onChange={(event) => updateField('inviteToken', event.target.value)} />
                </label>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="submit" className="header-secondary-cta" disabled={saving}>
                    Accept invite
                  </button>
                </div>
              </form>

              <form className="grid gap-4 rounded-[16px] border border-[#dde4ee] bg-white px-4 py-4" onSubmit={handleRequestAccess}>
                <SetupStatusCard title="Request access" tone="warning">
                  <p>Search for your agency, select it, then send your request. It appears in that agency&apos;s Members queue for an owner or admin to approve.</p>
                </SetupStatusCard>
                <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                  {workspaceNoun[0].toUpperCase() + workspaceNoun.slice(1)} name
                  <div className="flex flex-wrap gap-2">
                    <input
                      className="auth-input min-w-[12rem] flex-1"
                      value={form.workspaceNameForRequest}
                      onChange={(event) => {
                        updateField('workspaceNameForRequest', event.target.value)
                        setSelectedWorkspace(null)
                        setWorkspaceMatches([])
                      }}
                      placeholder={`Search for your ${workspaceNoun}`}
                    />
                    <button type="button" className="header-secondary-cta" onClick={() => void handleWorkspaceSearch()} disabled={searchingWorkspaces || saving}>
                      {searchingWorkspaces ? 'Searching...' : 'Search'}
                    </button>
                  </div>
                </label>
                {workspaceMatches.length ? (
                  <div className="grid gap-2" aria-label={`${workspaceNoun} search results`}>
                    {workspaceMatches.map((workspace) => {
                      const selected = selectedWorkspace?.id === workspace.id
                      return (
                        <button
                          key={workspace.id}
                          type="button"
                          aria-pressed={selected}
                          className={`rounded-[12px] border px-3 py-3 text-left text-sm transition ${selected ? 'border-[#1e5f91] bg-[#eef7ff] text-[#163b5b]' : 'border-[#dbe4ee] bg-white text-[#31485e] hover:border-[#9bbcd6]'}`}
                          onClick={() => {
                            setSelectedWorkspace(workspace)
                            updateField('workspaceNameForRequest', workspace.name)
                          }}
                        >
                          <span className="block font-semibold">{workspace.name}</span>
                          <span className="mt-1 block text-xs opacity-80">{workspace.typeLabel || workspaceNoun}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
                {normalizeText(form.workspaceNameForRequest).length >= 2 && !searchingWorkspaces && workspaceMatches.length === 0 && !selectedWorkspace ? (
                  <p className="text-xs leading-5 text-[#60758d]">Search to find the agency before sending your request.</p>
                ) : null}
                {selectedWorkspace?.name ? (
                  <p className="rounded-[12px] border border-[#cfe8d8] bg-[#effaf3] px-3 py-2 text-sm text-[#236340]">
                    Requesting access to <strong>{selectedWorkspace.name}</strong>. This does not grant dashboard access until approved.
                  </p>
                ) : null}
                <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                  Message
                  <textarea className="auth-input min-h-[96px]" value={form.requestMessage} onChange={(event) => updateField('requestMessage', event.target.value)} />
                </label>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="submit" className="header-primary-cta" disabled={saving || !selectedWorkspace?.id}>
                    {saving ? 'Sending request...' : 'Request access'}
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          {!canOpenActiveWorkspace && !intent && onboardingRequiredReason ? (
            <SetupStatusCard title="Repair state" tone="warning">
              <p>Current setup reason: {onboardingRequiredReason.replace(/_/g, ' ')}.</p>
            </SetupStatusCard>
          ) : null}

          {!canOpenActiveWorkspace && onboardingState?.recoveryReason ? (
            <SetupStatusCard title="Recovery required" tone="warning">
              <p>Arch9 needs to repair: {onboardingState.recoveryReason.replace(/_/g, ' ')}.</p>
            </SetupStatusCard>
          ) : null}

          {message && !canAcceptInvite ? <p className="rounded-[12px] border border-[#cfe8d8] bg-[#effaf3] px-3 py-2 text-sm text-[#236340]">{message}</p> : null}
          {error && !canAcceptInvite ? <p className="rounded-[12px] border border-[#f2c8c4] bg-[#fff5f4] px-3 py-2 text-sm text-[#9f1c1c]">{error}</p> : null}
        </>
      )}
    </OnboardingProgressLayout>
  )
}
