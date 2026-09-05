import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Globe2,
  Mail,
  MapPin,
  Palette,
  Phone,
  Plus,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthSession } from '../context/AuthSessionContext'
import { useWorkspace } from '../context/WorkspaceContext'
import OnboardingProgressLayout from '../components/onboarding/OnboardingProgressLayout'
import { APP_ROLE_LABELS } from '../lib/appRoleMetadata'
import { ONBOARDING_REQUIRED_REASONS, ONBOARDING_STATUSES, ONBOARDING_STEPS } from '../constants/onboardingStatuses'
import { SIGNUP_ONBOARDING_PATHS, SIGNUP_WORKSPACE_ACTIONS } from '../constants/signupIntents'
import { clearStoredSignupIntent } from '../lib/signupIntent'
import { hasCommercialAccessMarker } from '../lib/commercialAccess'
import { WORKSPACE_KINDS, WORKSPACE_TYPES } from '../constants/workspaceTypes'
import {
  AGENCY_BUSINESS_FOCUS_OPTIONS,
  AGENCY_INVITE_ROLE_OPTIONS,
  AGENCY_TYPE_OPTIONS,
  buildDefaultAgencyOnboarding,
  createAgencyBranchDraft,
  createAgencyInviteDraft,
  isCommercialAgencyType,
  mergeAgencyOnboardingDraft,
  normalizeAgencyType,
} from '../lib/agencyOnboarding'
import {
  completeAgencyOnboarding,
  uploadOrganisationBrandingAsset,
} from '../lib/settingsApi'
import { fetchAgencyOnboardingSettings } from '../lib/organisationBootstrapApi'
import {
  createWorkspaceFromIntent,
  joinWorkspaceFromInvite,
} from '../services/workspaceService'
import { requestOrganizationMembership, searchOrganizations } from '../services/organizationService'

const AGENCY_SETUP_STEPS = [
  { key: 'organisation', label: 'Organisation' },
  { key: 'branches', label: 'Branches' },
  { key: 'branding', label: 'Branding' },
  { key: 'team', label: 'Team' },
  { key: 'review', label: 'Review' },
]
const BOND_SETUP_STEPS = [
  { key: 'type', label: 'Type' },
  { key: 'business', label: 'Business' },
  { key: 'owner', label: 'Owner' },
  { key: 'team', label: 'Team' },
  { key: 'review', label: 'Review' },
]
const BOND_WORKSPACE_KIND_OPTIONS = [
  {
    value: WORKSPACE_KINDS.personalOriginator,
    label: 'Independent originator',
    title: 'I operate as an individual originator',
    description: 'Create a solo workspace with owner-led consulting and processing.',
    defaultTeamName: 'My Pipeline',
    ownerTitle: 'Independent Originator',
  },
  {
    value: WORKSPACE_KINDS.bondCompany,
    label: 'Originator company',
    title: 'I represent a bond originator company',
    description: 'Create a company workspace that can grow into branches, teams, and role-based invites.',
    defaultTeamName: 'Main Team',
    ownerTitle: 'Owner',
  },
]
const BOND_INVITE_ROLE_OPTIONS = [
  { value: 'consultant', label: 'Consultant' },
  { value: 'processor', label: 'Processor' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin_staff', label: 'Admin Staff' },
]
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

function getAgencySetupLabel(agencyType = '') {
  const normalized = normalizeAgencyType(agencyType)
  if (normalized === 'commercial') return 'commercial brokerage'
  if (normalized === 'mixed') return 'mixed agency'
  return 'agency'
}

function getAgencySetupTitle(agencyType = '') {
  const normalized = normalizeAgencyType(agencyType)
  if (normalized === 'commercial') return 'Set up your commercial brokerage'
  if (normalized === 'mixed') return 'Set up your mixed agency workspace'
  return 'Set up your agency workspace'
}

function getAgencySetupDescription(agencyType = '') {
  const normalized = normalizeAgencyType(agencyType)
  if (normalized === 'commercial') {
    return 'Create the commercial brokerage profile your brokers will enter: business details, branches, branding, permissions, and team invitations.'
  }
  if (normalized === 'mixed') {
    return 'Create one operating profile for residential and commercial teams: agency details, branches, branding, permissions, and invitations.'
  }
  return 'Create the operating profile your agents will enter: agency details, branches, branding, permissions, and team invitations.'
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

function splitFullName(value = '') {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean)
  if (parts.length <= 1) {
    return {
      firstName: parts[0] || '',
      lastName: '',
    }
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

function createBondInviteDraft(seed = {}) {
  return {
    id: seed.id || `bond-invite-${Math.random().toString(36).slice(2, 10)}`,
    name: normalizeText(seed.name),
    email: normalizeText(seed.email),
    role: normalizeText(seed.role) || 'consultant',
  }
}

function getBondDraftDefaults(intent, profile) {
  const companyName = normalizeText(profile?.companyName)
  const workspaceKind = normalizeText(intent?.workspace_kind) === WORKSPACE_KINDS.personalOriginator
    ? WORKSPACE_KINDS.personalOriginator
    : WORKSPACE_KINDS.bondCompany
  const kindOption = BOND_WORKSPACE_KIND_OPTIONS.find((option) => option.value === workspaceKind) || BOND_WORKSPACE_KIND_OPTIONS[1]
  const personalName = normalizeText(profile?.fullName)
  const defaultBusinessName = workspaceKind === WORKSPACE_KINDS.personalOriginator
    ? companyName || personalName
    : companyName
  return {
    businessInformation: {
      businessName: defaultBusinessName || '',
      legalName: defaultBusinessName || '',
      tradingName: defaultBusinessName || '',
      registrationNumber: '',
      businessEmail: normalizeText(profile?.email),
      contactNumber: normalizeText(profile?.phoneNumber),
      website: '',
      province: '',
      city: '',
      physicalAddress: '',
      supportEmail: normalizeText(profile?.email),
    },
    ownerInformation: {
      fullName: normalizeText(profile?.fullName),
      title: kindOption.ownerTitle,
      email: normalizeText(profile?.email),
      phoneNumber: normalizeText(profile?.phoneNumber),
    },
    teamStructure: {
      defaultTeamName: kindOption.defaultTeamName,
      launchRoles: {
        ownerHandlesConsulting: true,
        ownerHandlesProcessing: true,
      },
      expectedMonthlyApplications: '',
      notes: '',
    },
    invitations: [createBondInviteDraft()],
    meta: {
      workspaceKind,
      onboardingPath: intent?.onboarding_path || 'bond_owner',
    },
  }
}

function mergeBondOnboardingDraft(defaultDraft, incomingDraft = {}) {
  return {
    ...defaultDraft,
    ...(incomingDraft || {}),
    businessInformation: {
      ...defaultDraft.businessInformation,
      ...((incomingDraft && incomingDraft.businessInformation) || {}),
    },
    ownerInformation: {
      ...defaultDraft.ownerInformation,
      ...((incomingDraft && incomingDraft.ownerInformation) || {}),
    },
    teamStructure: {
      ...defaultDraft.teamStructure,
      ...((incomingDraft && incomingDraft.teamStructure) || {}),
      launchRoles: {
        ...defaultDraft.teamStructure.launchRoles,
        ...((incomingDraft && incomingDraft.teamStructure?.launchRoles) || {}),
      },
    },
    invitations:
      Array.isArray(incomingDraft?.invitations) && incomingDraft.invitations.length
        ? incomingDraft.invitations.map((invite) => createBondInviteDraft(invite))
        : defaultDraft.invitations,
    meta: {
      ...defaultDraft.meta,
      ...((incomingDraft && incomingDraft.meta) || {}),
    },
  }
}

function countBondInvitesByRole(invites = [], role = '') {
  return (Array.isArray(invites) ? invites : []).filter((invite) => normalizeText(invite.role) === role && normalizeText(invite.email)).length
}

function resolveBondStepError(stepKey, draft) {
  const business = draft?.businessInformation || {}
  const owner = draft?.ownerInformation || {}
  const team = draft?.teamStructure || {}
  const invites = Array.isArray(draft?.invitations) ? draft.invitations : []
  const workspaceKind = normalizeText(draft?.meta?.workspaceKind) || WORKSPACE_KINDS.bondCompany
  const isPersonalOriginator = workspaceKind === WORKSPACE_KINDS.personalOriginator

  if (stepKey === 'type') {
    if (![WORKSPACE_KINDS.personalOriginator, WORKSPACE_KINDS.bondCompany].includes(workspaceKind)) {
      return 'Choose the originator setup type.'
    }
  }

  if (stepKey === 'business') {
    if (!normalizeText(business.businessName)) {
      return isPersonalOriginator ? 'Originator name is required.' : 'Bond originator business name is required.'
    }
    if (!isPersonalOriginator && !normalizeText(business.legalName)) return 'Legal name is required.'
    if (!normalizeText(business.businessEmail)) return isPersonalOriginator ? 'Contact email is required.' : 'Business email is required.'
    if (!normalizeText(business.contactNumber)) return isPersonalOriginator ? 'Contact number is required.' : 'Business contact number is required.'
    if (!normalizeText(business.province)) return 'Province is required.'
    if (!normalizeText(business.city)) return 'City is required.'
    if (!isPersonalOriginator && !normalizeText(business.physicalAddress)) return 'Physical address is required.'
  }

  if (stepKey === 'owner') {
    if (!normalizeText(owner.fullName)) return 'Owner full name is required.'
    if (!normalizeText(owner.email)) return 'Owner email is required.'
    if (!normalizeText(owner.phoneNumber)) return 'Owner phone number is required.'
  }

  if (stepKey === 'team') {
    if (!normalizeText(team.defaultTeamName)) return 'Default team name is required.'
    if (isPersonalOriginator) return ''
    for (const invite of invites) {
      const hasRowData = normalizeText(invite.name || invite.email)
      if (!hasRowData) continue
      if (!normalizeText(invite.name)) return 'Each invited teammate needs a name.'
      if (!normalizeText(invite.email)) return 'Each invited teammate needs an email address.'
    }
    if (!team.launchRoles?.ownerHandlesConsulting && countBondInvitesByRole(invites, 'consultant') === 0) {
      return 'Add a consultant invite or confirm that the owner will handle consulting at launch.'
    }
    if (!team.launchRoles?.ownerHandlesProcessing && countBondInvitesByRole(invites, 'processor') === 0) {
      return 'Add a processor invite or confirm that the owner will handle processing at launch.'
    }
  }

  return ''
}

function buildBondWorkspaceSubmission(draft, profile) {
  const business = draft?.businessInformation || {}
  const owner = draft?.ownerInformation || {}
  const team = draft?.teamStructure || {}
  const workspaceKind = normalizeText(draft?.meta?.workspaceKind) === WORKSPACE_KINDS.personalOriginator
    ? WORKSPACE_KINDS.personalOriginator
    : WORKSPACE_KINDS.bondCompany
  const isPersonalOriginator = workspaceKind === WORKSPACE_KINDS.personalOriginator
  const ownerName = normalizeText(owner.fullName || profile?.fullName)
  const ownerNameParts = splitFullName(ownerName)
  const cleanedInvites = (Array.isArray(draft?.invitations) ? draft.invitations : [])
    .map((invite) => ({
      email: normalizeText(invite.email),
      name: normalizeText(invite.name),
      workspace_role: normalizeText(invite.role) || 'consultant',
    }))
    .filter((invite) => invite.email)

  return {
    name: normalizeText(business.businessName),
    legalName: normalizeText(business.legalName || business.businessName),
    tradingName: normalizeText(business.tradingName || business.businessName),
    registrationNumber: normalizeText(business.registrationNumber),
    businessEmail: normalizeText(business.businessEmail),
    contactNumber: normalizeText(business.contactNumber),
    website: normalizeText(business.website),
    province: normalizeText(business.province),
    city: normalizeText(business.city),
    physicalAddress: normalizeText(business.physicalAddress),
    mainBranchName: normalizeText(team.defaultTeamName) || 'Main Team',
    primaryContactName: ownerName,
    ownerFullName: ownerName,
    ownerFirstName: ownerNameParts.firstName,
    ownerLastName: ownerNameParts.lastName,
    ownerEmail: normalizeText(owner.email),
    ownerPhone: normalizeText(owner.phoneNumber),
    firstName: ownerNameParts.firstName,
    lastName: ownerNameParts.lastName,
    workspaceKind,
    branches: [{
      name: normalizeText(team.defaultTeamName) || 'Main Team',
      province: normalizeText(business.province),
      city: normalizeText(business.city),
      location: normalizeText(business.city || business.province),
      phone: normalizeText(business.contactNumber),
      email: normalizeText(business.businessEmail),
    }],
    invites: cleanedInvites,
    settings: {
      workspaceType: WORKSPACE_TYPES.bondOriginator,
      workspaceKind,
      bondOnboarding: draft,
      bondWorkspace: {
        operatingModel: isPersonalOriginator ? 'independent' : 'company',
        teamName: normalizeText(team.defaultTeamName) || 'Main Team',
        supportEmail: normalizeText(business.supportEmail || business.businessEmail),
        ownerHandlesConsulting: Boolean(team.launchRoles?.ownerHandlesConsulting),
        ownerHandlesProcessing: Boolean(team.launchRoles?.ownerHandlesProcessing),
        expectedMonthlyApplications: normalizeText(team.expectedMonthlyApplications),
        launchNotes: normalizeText(team.notes),
      },
    },
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

function resolveAgencyStepError(stepKey, draft) {
  const agency = draft?.agencyInformation || {}
  const principal = draft?.principalInformation || {}
  const branches = draft?.branchStructure?.branches || []
  const invites = draft?.invitations || []

  if (stepKey === 'organisation') {
    if (!normalizeText(agency.agencyName)) return 'Agency name is required.'
    if (!normalizeText(agency.mainEmailAddress)) return 'Business email is required.'
    if (!normalizeText(agency.mainOfficeNumber)) return 'Main office number is required.'
    if (!normalizeText(agency.physicalAddress)) return 'Physical address is required.'
    if (!normalizeText(agency.province)) return 'Province is required.'
    if (!normalizeText(principal.principalFullName)) return 'Principal name is required.'
    if (!normalizeText(principal.emailAddress)) return 'Principal email is required.'
  }

  if (stepKey === 'branches') {
    if (!branches.length) return 'Add at least one branch.'
    for (const branch of branches) {
      if (!normalizeText(branch.branchName)) return 'Each branch needs a name.'
      if (!normalizeText(branch.officeLocation)) return 'Each branch needs an office location.'
    }
  }

  if (stepKey === 'team') {
    for (const invite of invites) {
      const hasRowData = normalizeText(invite.name || invite.email)
      if (!hasRowData) continue
      if (!normalizeText(invite.name)) return 'Each invite needs an agent name.'
      if (!normalizeText(invite.email)) return 'Each invite needs an email address.'
    }
  }

  return ''
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
  const [bondDraft, setBondDraft] = useState(() => getBondDraftDefaults(intent, profile))
  const [bondStepIndex, setBondStepIndex] = useState(0)
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
  const bondCurrentStep = BOND_SETUP_STEPS[bondStepIndex] || BOND_SETUP_STEPS[0]
  const agencySignupType = getAgencyTypeForSignupIntent(intent)
  const agencySetupType = agencyDraft?.agencyInformation?.agencyType || agencySignupType
  const agencySetupLabel = getAgencySetupLabel(agencySetupType)
  const claimedWorkspaceName = getOrganisationName(claimWorkspaceSettings?.organisation)
  const agencyDisplayName = canClaimExistingWorkspace
    ? firstText(claimedWorkspaceName, agencyDraft?.agencyInformation?.agencyName, `Existing ${agencySetupLabel}`)
    : firstText(agencyDraft?.agencyInformation?.agencyName, `New ${agencySetupLabel}`)
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
    setBondDraft((previous) => mergeBondOnboardingDraft(getBondDraftDefaults(intent, profile), previous))
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
      setAgencyStepIndex(Math.max(0, Math.min(AGENCY_SETUP_STEPS.length - 1, savedStepIndex)))
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

  function updateBondDraft(nextDraftOrUpdater) {
    setBondDraft((previous) => {
      const nextDraft = typeof nextDraftOrUpdater === 'function' ? nextDraftOrUpdater(previous) : nextDraftOrUpdater
      return mergeBondOnboardingDraft(previous, nextDraft)
    })
  }

  function updateBondSection(section, field, value) {
    updateBondDraft((previous) => ({
      ...previous,
      [section]: {
        ...(previous?.[section] || {}),
        [field]: value,
      },
    }))
  }

  function updateBondLaunchRole(field, value) {
    updateBondDraft((previous) => ({
      ...previous,
      teamStructure: {
        ...(previous?.teamStructure || {}),
        launchRoles: {
          ...(previous?.teamStructure?.launchRoles || {}),
          [field]: value,
        },
      },
    }))
  }

  function updateBondWorkspaceKind(workspaceKind) {
    const kindOption = BOND_WORKSPACE_KIND_OPTIONS.find((option) => option.value === workspaceKind) || BOND_WORKSPACE_KIND_OPTIONS[1]
    const isPersonalOriginator = workspaceKind === WORKSPACE_KINDS.personalOriginator
    updateBondDraft((previous) => {
      const previousKind = normalizeText(previous?.meta?.workspaceKind) || WORKSPACE_KINDS.bondCompany
      const previousOption = BOND_WORKSPACE_KIND_OPTIONS.find((option) => option.value === previousKind) || BOND_WORKSPACE_KIND_OPTIONS[1]
      const ownerName = normalizeText(previous?.ownerInformation?.fullName || profile?.fullName)
      const currentBusinessName = normalizeText(previous?.businessInformation?.businessName)
      const nextBusinessName = currentBusinessName || (isPersonalOriginator ? ownerName : normalizeText(profile?.companyName))
      const currentTeamName = normalizeText(previous?.teamStructure?.defaultTeamName)
      const nextTeamName = !currentTeamName || currentTeamName === previousOption.defaultTeamName
        ? kindOption.defaultTeamName
        : currentTeamName
      const currentOwnerTitle = normalizeText(previous?.ownerInformation?.title)
      const nextOwnerTitle = !currentOwnerTitle || currentOwnerTitle === previousOption.ownerTitle
        ? kindOption.ownerTitle
        : currentOwnerTitle
      return {
        ...previous,
        businessInformation: {
          ...(previous?.businessInformation || {}),
          businessName: nextBusinessName,
          legalName: normalizeText(previous?.businessInformation?.legalName) || nextBusinessName,
          tradingName: normalizeText(previous?.businessInformation?.tradingName) || nextBusinessName,
        },
        ownerInformation: {
          ...(previous?.ownerInformation || {}),
          title: nextOwnerTitle,
        },
        teamStructure: {
          ...(previous?.teamStructure || {}),
          defaultTeamName: nextTeamName,
          launchRoles: {
            ...(previous?.teamStructure?.launchRoles || {}),
            ownerHandlesConsulting: isPersonalOriginator ? true : previous?.teamStructure?.launchRoles?.ownerHandlesConsulting ?? true,
            ownerHandlesProcessing: isPersonalOriginator ? true : previous?.teamStructure?.launchRoles?.ownerHandlesProcessing ?? true,
          },
        },
        meta: {
          ...(previous?.meta || {}),
          workspaceKind,
          operatingModel: isPersonalOriginator ? 'independent' : 'company',
        },
      }
    })
  }

  function updateBondInvite(inviteId, patch) {
    updateBondDraft((previous) => ({
      ...previous,
      invitations: (previous?.invitations || []).map((invite) =>
        invite.id === inviteId ? { ...invite, ...patch } : invite,
      ),
    }))
  }

  function addBondInvite() {
    updateBondDraft((previous) => ({
      ...previous,
      invitations: [
        ...(previous?.invitations || []),
        createBondInviteDraft(),
      ],
    }))
  }

  function removeBondInvite(inviteId) {
    updateBondDraft((previous) => {
      const nextRows = (previous?.invitations || []).filter((invite) => invite.id !== inviteId)
      return {
        ...previous,
        invitations: nextRows.length ? nextRows : [createBondInviteDraft()],
      }
    })
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

  function updateBranch(branchId, patch) {
    updateAgencyDraft((previous) => ({
      ...previous,
      branchStructure: {
        ...(previous?.branchStructure || {}),
        branches: (previous?.branchStructure?.branches || []).map((branch) =>
          branch.id === branchId ? { ...branch, ...patch } : branch,
        ),
      },
    }))
  }

  function addBranch() {
    updateAgencyDraft((previous) => ({
      ...previous,
      branchStructure: {
        ...(previous?.branchStructure || {}),
        branches: [
          ...(previous?.branchStructure?.branches || []),
          createAgencyBranchDraft({ branchName: `Branch ${(previous?.branchStructure?.branches || []).length + 1}` }),
        ],
      },
    }))
  }

  function removeBranch(branchId) {
    updateAgencyDraft((previous) => {
      const nextBranches = (previous?.branchStructure?.branches || []).filter((branch) => branch.id !== branchId)
      return {
        ...previous,
        branchStructure: {
          ...(previous?.branchStructure || {}),
          branches: nextBranches.length ? nextBranches : [createAgencyBranchDraft()],
        },
      }
    })
  }

  function updateInvite(inviteId, patch) {
    updateAgencyDraft((previous) => ({
      ...previous,
      invitations: (previous?.invitations || []).map((invite) =>
        invite.id === inviteId ? { ...invite, ...patch } : invite,
      ),
    }))
  }

  function addInvite() {
    updateAgencyDraft((previous) => ({
      ...previous,
      invitations: [
        ...(previous?.invitations || []),
        createAgencyInviteDraft({ branchId: previous?.branchStructure?.branches?.[0]?.id || '' }),
      ],
    }))
  }

  function removeInvite(inviteId) {
    updateAgencyDraft((previous) => {
      const nextRows = (previous?.invitations || []).filter((invite) => invite.id !== inviteId)
      return {
        ...previous,
        invitations: nextRows.length ? nextRows : [createAgencyInviteDraft()],
      }
    })
  }

  async function handleLogoUpload(file, targetKey) {
    if (!file) return
    try {
      setUploadingLogoTarget(targetKey)
      setError('')
      setMessage('')
      const upload = await uploadOrganisationBrandingAsset({
        file,
        variant: targetKey === 'logoDark' ? 'dark' : 'light',
      })
      updateAgencyDraft((previous) => ({
        ...previous,
        branding: {
          ...(previous?.branding || {}),
          [targetKey]: upload.resolvedUrl || upload.publicUrl || previous?.branding?.[targetKey] || '',
          [`${targetKey}Name`]: upload.fileName || file.name,
          [`${targetKey}Bucket`]: upload.bucket || previous?.branding?.[`${targetKey}Bucket`] || '',
          [`${targetKey}Path`]: upload.path || previous?.branding?.[`${targetKey}Path`] || '',
        },
      }))
      setMessage(`${targetKey === 'logoDark' ? 'Dark' : 'Light'} logo uploaded.`)
    } catch (uploadError) {
      setError(uploadError?.message || 'Unable to upload the selected logo.')
    } finally {
      setUploadingLogoTarget('')
    }
  }

  async function completeAgencyPrincipalSetup() {
    const allStepError = AGENCY_SETUP_STEPS
      .map((step) => resolveAgencyStepError(step.key, agencyDraft))
      .find(Boolean)
    if (allStepError) {
      setError(allStepError)
      return
    }

    try {
      setSaving(true)
      setError('')
      setMessage('')
      const result = await completeAgencyOnboarding(agencyDraft)
      clearSetupDraft(setupDraftStorageKey)
      refreshAuthState?.()
      const organisationName = result.organisation?.displayName || result.organisation?.name || agencyDraft.agencyInformation.agencyName
      const resumedCopy = result.completion?.resumed_duplicate_workspace ? ' Existing setup resumed and repaired.' : ''
      const completedAgencyType = normalizeAgencyType(result.onboarding?.agencyInformation?.agencyType || agencyDraft.agencyInformation?.agencyType)
      const targetPath = completedAgencyType === 'commercial' ? '/commercial' : '/dashboard'
      const inviteWarnings = result.inviteEmailDelivery?.warnings || []
      const inviteCopy = inviteWarnings.length
        ? ` ${inviteWarnings[0]}`
        : result.inviteEmailDelivery?.sent?.length
          ? ` ${result.inviteEmailDelivery.sent.length} invite email${result.inviteEmailDelivery.sent.length === 1 ? '' : 's'} sent.`
          : ''
      setMessage(`${organisationName} is ready.${resumedCopy}${inviteCopy} Opening your ${completedAgencyType === 'commercial' ? 'Commercial workspace' : 'dashboard'}...`)
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
    const stepError = resolveAgencyStepError(agencyCurrentStep.key, agencyDraft)
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

  async function completeBondOwnerSetup() {
    const allStepError = BOND_SETUP_STEPS
      .map((step) => resolveBondStepError(step.key, bondDraft))
      .find(Boolean)
    if (allStepError) {
      setError(allStepError)
      return
    }

    try {
      setSaving(true)
      setError('')
      setMessage('')
      const submission = buildBondWorkspaceSubmission(bondDraft, profile)
      const result = await createWorkspaceFromIntent(intent, authState.user, submission)
      refreshAuthState?.()
      setMessage(`${result.workspace.name} is ready. Opening your dashboard...`)
      window.setTimeout(() => {
        navigate(getDashboardPath(intent?.app_role || baseRole), { replace: true })
      }, 500)
    } catch (setupError) {
      setError(setupError?.message || 'Bond originator setup failed.')
    } finally {
      setSaving(false)
    }
  }

  function handleBondStepSubmit(event) {
    event.preventDefault()
    const stepError = resolveBondStepError(bondCurrentStep.key, bondDraft)
    if (stepError) {
      setError(stepError)
      return
    }

    setError('')
    if (bondStepIndex < BOND_SETUP_STEPS.length - 1) {
      setBondStepIndex((previous) => Math.min(previous + 1, BOND_SETUP_STEPS.length - 1))
      return
    }
    void completeBondOwnerSetup()
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
  const branches = agencyDraft?.branchStructure?.branches || []
  const invites = agencyDraft?.invitations || []
  const agency = agencyDraft?.agencyInformation || {}
  const principal = agencyDraft?.principalInformation || {}
  const branding = agencyDraft?.branding || {}
  const bondBusiness = bondDraft?.businessInformation || {}
  const bondOwner = bondDraft?.ownerInformation || {}
  const bondTeam = bondDraft?.teamStructure || {}
  const bondInvites = Array.isArray(bondDraft?.invitations) ? bondDraft.invitations : []
  const bondWorkspaceKind = normalizeText(bondDraft?.meta?.workspaceKind) || WORKSPACE_KINDS.bondCompany
  const isPersonalBondOriginator = bondWorkspaceKind === WORKSPACE_KINDS.personalOriginator
  const bondWorkspaceKindLabel =
    BOND_WORKSPACE_KIND_OPTIONS.find((option) => option.value === bondWorkspaceKind)?.label || 'Originator company'
  const inviteCount = invites.filter((invite) => normalizeText(invite.name || invite.email)).length
  const currentStepReady = resolveAgencyStepError(agencyCurrentStep.key, agencyDraft) ? 0 : 1
  const completedStepCount = Math.min(AGENCY_SETUP_STEPS.length, agencyStepIndex + currentStepReady)
  const bondInviteCount = bondInvites.filter((invite) => normalizeText(invite.name || invite.email)).length
  const bondCurrentStepReady = resolveBondStepError(bondCurrentStep.key, bondDraft) ? 0 : 1
  const bondCompletedStepCount = Math.min(BOND_SETUP_STEPS.length, bondStepIndex + bondCurrentStepReady)
  const developerSetupItems = [
    {
      label: 'Company identity',
      complete: Boolean(normalizeText(form.name) && normalizeText(form.legalName)),
    },
    {
      label: 'Contact route',
      complete: Boolean(normalizeText(form.businessEmail) && normalizeText(form.contactNumber)),
    },
    {
      label: 'Operating footprint',
      complete: Boolean(normalizeText(form.province) || normalizeText(form.operatingArea)),
    },
    {
      label: 'Launch workspace',
      complete: Boolean(normalizeText(form.name) && normalizeText(form.businessEmail) && normalizeText(form.contactNumber)),
    },
  ]
  const developerCompletedSectionCount = developerSetupItems.filter((item) => item.complete).length

  function renderBondStep() {
    if (bondCurrentStep.key === 'type') {
      return (
        <div className="agency-setup-card">
          <SetupSectionHeader
            eyebrow="Workspace type"
            title="Choose your originator setup"
            copy="This controls the workspace kind Arch9 creates and the defaults used for teams, scope, and owner coverage."
            icon={Building2}
          />
          <div className="agency-setup-list">
            {BOND_WORKSPACE_KIND_OPTIONS.map((option) => {
              const isSelected = bondWorkspaceKind === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`agency-setup-row-card ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => updateBondWorkspaceKind(option.value)}
                  aria-pressed={isSelected}
                >
                  <div className="agency-setup-row-head">
                    <strong>{option.title}</strong>
                    {isSelected ? <CheckCircle2 size={17} /> : null}
                  </div>
                  <p className="text-left text-sm leading-6 text-[#5f748b]">{option.description}</p>
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    if (bondCurrentStep.key === 'business') {
      return (
        <div className="agency-setup-card">
          <SetupSectionHeader
            eyebrow="Foundation"
            title={isPersonalBondOriginator ? 'Originator profile' : 'Business profile'}
            copy={isPersonalBondOriginator
              ? 'This becomes your solo originator identity, support contact, and reporting home.'
              : 'This becomes the finance business identity, support contact, and default reporting home for the workspace.'}
            icon={Building2}
          />
          <div className="setup-field-grid">
            <SetupField label={isPersonalBondOriginator ? 'Originator display name' : 'Business name'}>
              <input className="setup-input" value={bondBusiness.businessName || ''} onChange={(event) => updateBondSection('businessInformation', 'businessName', event.target.value)} />
            </SetupField>
            <SetupField label="Legal name" hint={isPersonalBondOriginator ? 'Optional for independent originators.' : ''}>
              <input className="setup-input" value={bondBusiness.legalName || ''} onChange={(event) => updateBondSection('businessInformation', 'legalName', event.target.value)} />
            </SetupField>
            <SetupField label="Trading name">
              <input className="setup-input" value={bondBusiness.tradingName || ''} onChange={(event) => updateBondSection('businessInformation', 'tradingName', event.target.value)} />
            </SetupField>
            <SetupField label="Registration number" hint="Optional, but useful for duplicate protection and legal records.">
              <input className="setup-input" value={bondBusiness.registrationNumber || ''} onChange={(event) => updateBondSection('businessInformation', 'registrationNumber', event.target.value)} />
            </SetupField>
            <SetupField label={isPersonalBondOriginator ? 'Contact email' : 'Business email'}>
              <input className="setup-input" type="email" value={bondBusiness.businessEmail || ''} onChange={(event) => updateBondSection('businessInformation', 'businessEmail', event.target.value)} />
            </SetupField>
            <SetupField label="Contact number">
              <input className="setup-input" value={bondBusiness.contactNumber || ''} onChange={(event) => updateBondSection('businessInformation', 'contactNumber', event.target.value)} />
            </SetupField>
            <SetupField label="Support email">
              <input className="setup-input" type="email" value={bondBusiness.supportEmail || ''} onChange={(event) => updateBondSection('businessInformation', 'supportEmail', event.target.value)} />
            </SetupField>
            <SetupField label="Website">
              <input className="setup-input" value={bondBusiness.website || ''} onChange={(event) => updateBondSection('businessInformation', 'website', event.target.value)} placeholder="https://" />
            </SetupField>
            <SetupField label="Province">
              <input className="setup-input" value={bondBusiness.province || ''} onChange={(event) => updateBondSection('businessInformation', 'province', event.target.value)} />
            </SetupField>
            <SetupField label="City">
              <input className="setup-input" value={bondBusiness.city || ''} onChange={(event) => updateBondSection('businessInformation', 'city', event.target.value)} />
            </SetupField>
            <SetupField label="Physical address" hint={isPersonalBondOriginator ? 'Optional for independent originators.' : ''}>
              <textarea className="setup-input setup-textarea" value={bondBusiness.physicalAddress || ''} onChange={(event) => updateBondSection('businessInformation', 'physicalAddress', event.target.value)} />
            </SetupField>
          </div>
        </div>
      )
    }

    if (bondCurrentStep.key === 'owner') {
      return (
        <div className="agency-setup-card">
          <SetupSectionHeader
            eyebrow="Account owner"
            title="Launch owner details"
            copy="The owner receives HQ-level workspace access and becomes the first accountable contact for invites, operations, and recovery."
            icon={ShieldCheck}
          />
          <div className="setup-field-grid">
            <SetupField label="Full name">
              <input className="setup-input" value={bondOwner.fullName || ''} onChange={(event) => updateBondSection('ownerInformation', 'fullName', event.target.value)} />
            </SetupField>
            <SetupField label="Title / position">
              <input className="setup-input" value={bondOwner.title || ''} onChange={(event) => updateBondSection('ownerInformation', 'title', event.target.value)} />
            </SetupField>
            <SetupField label="Email">
              <input className="setup-input" type="email" value={bondOwner.email || ''} onChange={(event) => updateBondSection('ownerInformation', 'email', event.target.value)} />
            </SetupField>
            <SetupField label="Phone number">
              <input className="setup-input" value={bondOwner.phoneNumber || ''} onChange={(event) => updateBondSection('ownerInformation', 'phoneNumber', event.target.value)} />
            </SetupField>
          </div>
        </div>
      )
    }

    if (bondCurrentStep.key === 'team') {
      return (
        <div className="agency-setup-card">
          <SetupSectionHeader
            eyebrow="Operating setup"
            title={isPersonalBondOriginator ? 'Pipeline and coverage' : 'Default team and launch roles'}
            copy={isPersonalBondOriginator
              ? 'Arch9 creates a personal pipeline and gives the owner full coverage at launch.'
              : 'Arch9 creates one finance team immediately, then uses these launch choices to avoid leaving the workspace without coverage.'}
            icon={Users}
          />
          <div className="setup-field-grid">
            <SetupField label="Default team name">
              <input className="setup-input" value={bondTeam.defaultTeamName || ''} onChange={(event) => updateBondSection('teamStructure', 'defaultTeamName', event.target.value)} />
            </SetupField>
            <SetupField label="Expected monthly applications" hint="Optional planning signal for future dashboards and staffing.">
              <input className="setup-input" value={bondTeam.expectedMonthlyApplications || ''} onChange={(event) => updateBondSection('teamStructure', 'expectedMonthlyApplications', event.target.value)} />
            </SetupField>
            <label className="setup-field">
              <span>Owner covers consulting at launch</span>
              <button
                type="button"
                className="setup-secondary-button"
                onClick={() => updateBondLaunchRole('ownerHandlesConsulting', !bondTeam.launchRoles?.ownerHandlesConsulting)}
              >
                {bondTeam.launchRoles?.ownerHandlesConsulting ? 'Yes, owner covers consulting' : 'No, invite a consultant'}
              </button>
            </label>
            <label className="setup-field">
              <span>Owner covers processing at launch</span>
              <button
                type="button"
                className="setup-secondary-button"
                onClick={() => updateBondLaunchRole('ownerHandlesProcessing', !bondTeam.launchRoles?.ownerHandlesProcessing)}
              >
                {bondTeam.launchRoles?.ownerHandlesProcessing ? 'Yes, owner covers processing' : 'No, invite a processor'}
              </button>
            </label>
            <SetupField label="Launch notes" hint="Optional handoff notes for the first finance team.">
              <textarea className="setup-input setup-textarea" value={bondTeam.notes || ''} onChange={(event) => updateBondSection('teamStructure', 'notes', event.target.value)} />
            </SetupField>
          </div>

          {!isPersonalBondOriginator ? (
            <>
              <div className="agency-setup-divider" />
              <SetupSectionHeader
                eyebrow="Invites"
                title="Invite the first operating team"
                copy="Add consultants, processors, or admin staff who should enter the new workspace immediately after creation."
                icon={Mail}
              />
              <div className="agency-setup-list">
                {bondInvites.map((invite, index) => (
                  <section key={invite.id} className="agency-setup-row-card">
                    <div className="agency-setup-row-head">
                      <strong>{normalizeText(invite.name) || `Teammate ${index + 1}`}</strong>
                      <button type="button" className="setup-icon-button" onClick={() => removeBondInvite(invite.id)} disabled={bondInvites.length <= 1} aria-label="Remove invite">
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="setup-field-grid">
                      <SetupField label="Name">
                        <input className="setup-input" value={invite.name || ''} onChange={(event) => updateBondInvite(invite.id, { name: event.target.value })} />
                      </SetupField>
                      <SetupField label="Email">
                        <input className="setup-input" type="email" value={invite.email || ''} onChange={(event) => updateBondInvite(invite.id, { email: event.target.value })} />
                      </SetupField>
                      <SetupField label="Role">
                        <select className="setup-input" value={invite.role || 'consultant'} onChange={(event) => updateBondInvite(invite.id, { role: event.target.value })}>
                          {BOND_INVITE_ROLE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </SetupField>
                    </div>
                  </section>
                ))}
              </div>
              <button type="button" className="setup-secondary-button" onClick={addBondInvite}>
                <Plus size={16} />
                Add teammate invite
              </button>
            </>
          ) : null}
        </div>
      )
    }

    return (
      <div className="agency-setup-card">
        <SetupSectionHeader
          eyebrow="Final check"
          title={isPersonalBondOriginator ? 'Create the independent originator workspace' : 'Create the bond company workspace'}
          copy={isPersonalBondOriginator
            ? 'Arch9 will create a solo originator workspace, activate the owner membership, and create the personal pipeline.'
            : 'Arch9 will create the company workspace, activate the owner membership, create the default team, and queue the launch invites.'}
          icon={CheckCircle2}
        />
        <div className="agency-review-grid">
          <div>
            <Building2 size={18} />
            <span>{isPersonalBondOriginator ? 'Originator' : 'Business'}</span>
            <strong>{bondBusiness.businessName || 'Not set'}</strong>
            <small>{bondWorkspaceKindLabel}</small>
          </div>
          <div>
            <ShieldCheck size={18} />
            <span>Owner</span>
            <strong>{bondOwner.fullName || 'Not set'}</strong>
            <small>{bondOwner.email || 'Owner email missing'}</small>
          </div>
          <div>
            <Users size={18} />
            <span>{isPersonalBondOriginator ? 'Pipeline' : 'Team'}</span>
            <strong>{bondTeam.defaultTeamName || 'Main Team'}</strong>
            <small>{isPersonalBondOriginator ? 'Owner covers launch roles' : `${bondInviteCount} ${bondInviteCount === 1 ? 'invite' : 'invites'} ready`}</small>
          </div>
        </div>
      </div>
    )
  }

  function renderAgencyStep() {
    if (agencyCurrentStep.key === 'organisation') {
      return (
        <div className="agency-setup-card">
          <SetupSectionHeader
            eyebrow="Foundation"
            title={isCommercialAgencyType(agency.agencyType) ? `${agencySetupLabel[0].toUpperCase()}${agencySetupLabel.slice(1)} profile` : 'Agency profile'}
            copy={canClaimExistingWorkspace
              ? `Confirm the saved business details for ${agencyDisplayName}.`
              : 'This becomes the legal and operational identity for the workspace.'}
            icon={Building2}
          />
          <div className="setup-field-grid">
            <SetupField label={canClaimExistingWorkspace ? 'Workspace name' : 'Agency name'}>
              <input className="setup-input" value={agency.agencyName || ''} onChange={(event) => updateAgencySection('agencyInformation', 'agencyName', event.target.value)} />
            </SetupField>
            <SetupField label="Trading name">
              <input className="setup-input" value={agency.tradingName || ''} onChange={(event) => updateAgencySection('agencyInformation', 'tradingName', event.target.value)} />
            </SetupField>
            <SetupField label="Agency type">
              <select className="setup-input" value={agency.agencyType || 'residential'} onChange={(event) => updateAgencySection('agencyInformation', 'agencyType', event.target.value)}>
                {AGENCY_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </SetupField>
            <SetupField label="Business focus">
              <select className="setup-input" value={agency.businessFocus || 'sales'} onChange={(event) => updateAgencySection('agencyInformation', 'businessFocus', event.target.value)}>
                {AGENCY_BUSINESS_FOCUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </SetupField>
            <SetupField label="Registration number">
              <input className="setup-input" value={agency.companyRegistrationNumber || ''} onChange={(event) => updateAgencySection('agencyInformation', 'companyRegistrationNumber', event.target.value)} />
            </SetupField>
            <SetupField label="PPRA / FFC number">
              <input className="setup-input" value={agency.eaabPpraNumber || ''} onChange={(event) => updateAgencySection('agencyInformation', 'eaabPpraNumber', event.target.value)} />
            </SetupField>
            <SetupField label="Business email">
              <input className="setup-input" type="email" value={agency.mainEmailAddress || ''} onChange={(event) => updateAgencySection('agencyInformation', 'mainEmailAddress', event.target.value)} />
            </SetupField>
            <SetupField label="Office number">
              <input className="setup-input" value={agency.mainOfficeNumber || ''} onChange={(event) => updateAgencySection('agencyInformation', 'mainOfficeNumber', event.target.value)} />
            </SetupField>
            <SetupField label="Website">
              <input className="setup-input" value={agency.website || ''} onChange={(event) => updateAgencySection('agencyInformation', 'website', event.target.value)} placeholder="https://" />
            </SetupField>
            <SetupField label="Province">
              <input className="setup-input" value={agency.province || ''} onChange={(event) => updateAgencySection('agencyInformation', 'province', event.target.value)} />
            </SetupField>
            <SetupField label="Physical address">
              <textarea className="setup-input setup-textarea" value={agency.physicalAddress || ''} onChange={(event) => updateAgencySection('agencyInformation', 'physicalAddress', event.target.value)} />
            </SetupField>
            <SetupField label="Country">
              <input className="setup-input" value={agency.country || ''} onChange={(event) => updateAgencySection('agencyInformation', 'country', event.target.value)} />
            </SetupField>
          </div>

          <div className="agency-setup-divider" />
          <SetupSectionHeader
            eyebrow="Principal"
            title="Account owner"
            copy="The principal gets full workspace control and invite permissions."
            icon={ShieldCheck}
          />
          <div className="setup-field-grid">
            <SetupField label="Full name">
              <input className="setup-input" value={principal.principalFullName || ''} onChange={(event) => updateAgencySection('principalInformation', 'principalFullName', event.target.value)} />
            </SetupField>
            <SetupField label="Position">
              <input className="setup-input" value={principal.position || ''} onChange={(event) => updateAgencySection('principalInformation', 'position', event.target.value)} />
            </SetupField>
            <SetupField label="Email">
              <input className="setup-input" type="email" value={principal.emailAddress || ''} onChange={(event) => updateAgencySection('principalInformation', 'emailAddress', event.target.value)} />
            </SetupField>
            <SetupField label="Phone">
              <input className="setup-input" value={principal.phoneNumber || ''} onChange={(event) => updateAgencySection('principalInformation', 'phoneNumber', event.target.value)} />
            </SetupField>
            <SetupField label="Principal PPRA number">
              <input className="setup-input" value={principal.ppraNumber || ''} onChange={(event) => updateAgencySection('principalInformation', 'ppraNumber', event.target.value)} />
            </SetupField>
            <SetupField label="ID number">
              <input className="setup-input" value={principal.idNumber || ''} onChange={(event) => updateAgencySection('principalInformation', 'idNumber', event.target.value)} />
            </SetupField>
          </div>
        </div>
      )
    }

    if (agencyCurrentStep.key === 'branches') {
      return (
        <div className="agency-setup-card">
          <SetupSectionHeader
            eyebrow="Operating structure"
            title="Branches"
            copy="Create the offices your agents and reporting will be grouped under."
            icon={MapPin}
          />
          <div className="agency-setup-list">
            {branches.map((branch, index) => (
              <section key={branch.id} className="agency-setup-row-card">
                <div className="agency-setup-row-head">
                  <strong>{index === 0 ? 'Head office' : `Branch ${index + 1}`}</strong>
                  <button type="button" className="setup-icon-button" onClick={() => removeBranch(branch.id)} disabled={branches.length <= 1} aria-label="Remove branch">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="setup-field-grid">
                  <SetupField label="Branch name">
                    <input className="setup-input" value={branch.branchName || ''} onChange={(event) => updateBranch(branch.id, { branchName: event.target.value })} />
                  </SetupField>
                  <SetupField label="Office location">
                    <input className="setup-input" value={branch.officeLocation || ''} onChange={(event) => updateBranch(branch.id, { officeLocation: event.target.value })} />
                  </SetupField>
                  <SetupField label="Branch manager">
                    <input className="setup-input" value={branch.branchManager || ''} onChange={(event) => updateBranch(branch.id, { branchManager: event.target.value })} />
                  </SetupField>
                  <SetupField label="Estimated agents">
                    <input className="setup-input" type="number" min="0" value={branch.numberOfAgents || ''} onChange={(event) => updateBranch(branch.id, { numberOfAgents: event.target.value })} />
                  </SetupField>
                </div>
              </section>
            ))}
          </div>
          <button type="button" className="setup-secondary-button" onClick={addBranch}>
            <Plus size={16} />
            Add branch
          </button>
        </div>
      )
    }

    if (agencyCurrentStep.key === 'branding') {
      return (
        <div className="agency-setup-card">
          <SetupSectionHeader
            eyebrow="Branding"
            title="Workspace identity"
            copy="Apply agency branding before the team lands in the workspace."
            icon={Palette}
          />
          <div className="agency-branding-grid">
            <div className="agency-logo-upload">
              <div className="agency-logo-preview-box">
                {branding.logoLight ? <img src={branding.logoLight} alt="Light logo preview" /> : <Building2 size={28} />}
              </div>
              <div>
                <strong>Light logo</strong>
                <p>{branding.logoLightName || 'Used on documents, emails, and light UI surfaces.'}</p>
                <label className="setup-secondary-button">
                  <UploadCloud size={16} />
                  {uploadingLogoTarget === 'logoLight' ? 'Uploading...' : 'Upload logo'}
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={(event) => void handleLogoUpload(event.target.files?.[0], 'logoLight')} hidden />
                </label>
              </div>
            </div>

            <div className="agency-logo-upload agency-logo-upload-dark">
              <div className="agency-logo-preview-box">
                {branding.logoDark ? <img src={branding.logoDark} alt="Dark logo preview" /> : <Building2 size={28} />}
              </div>
              <div>
                <strong>Dark logo</strong>
                <p>{branding.logoDarkName || 'Used on dark headers and future branded portals.'}</p>
                <label className="setup-secondary-button">
                  <UploadCloud size={16} />
                  {uploadingLogoTarget === 'logoDark' ? 'Uploading...' : 'Upload logo'}
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={(event) => void handleLogoUpload(event.target.files?.[0], 'logoDark')} hidden />
                </label>
              </div>
            </div>
          </div>
          <div className="setup-field-grid agency-colour-grid">
            <SetupField label="Primary colour">
              <div className="setup-colour-field">
                <input type="color" value={branding.brandColours?.primary || '#274C69'} onChange={(event) => updateBrandColour('primary', event.target.value)} />
                <input className="setup-input" value={branding.brandColours?.primary || ''} onChange={(event) => updateBrandColour('primary', event.target.value)} />
              </div>
            </SetupField>
            <SetupField label="Secondary colour">
              <div className="setup-colour-field">
                <input type="color" value={branding.brandColours?.secondary || '#10273A'} onChange={(event) => updateBrandColour('secondary', event.target.value)} />
                <input className="setup-input" value={branding.brandColours?.secondary || ''} onChange={(event) => updateBrandColour('secondary', event.target.value)} />
              </div>
            </SetupField>
          </div>
        </div>
      )
    }

    if (agencyCurrentStep.key === 'team') {
      return (
        <div className="agency-setup-card">
          <SetupSectionHeader
            eyebrow="Team access"
            title="Invite agents"
            copy="Add the agents and branch operators who should receive access after setup."
            icon={Users}
          />
          <div className="agency-setup-list">
            {invites.map((invite, index) => (
              <section key={invite.id} className="agency-setup-row-card">
                <div className="agency-setup-row-head">
                  <strong>{normalizeText(invite.name) || `Team member ${index + 1}`}</strong>
                  <button type="button" className="setup-icon-button" onClick={() => removeInvite(invite.id)} disabled={invites.length <= 1} aria-label="Remove invite">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="setup-field-grid">
                  <SetupField label="Name">
                    <input className="setup-input" value={invite.name || ''} onChange={(event) => updateInvite(invite.id, { name: event.target.value })} />
                  </SetupField>
                  <SetupField label="Email">
                    <input className="setup-input" type="email" value={invite.email || ''} onChange={(event) => updateInvite(invite.id, { email: event.target.value })} />
                  </SetupField>
                  <SetupField label="Branch">
                    <select className="setup-input" value={invite.branchId || ''} onChange={(event) => updateInvite(invite.id, { branchId: event.target.value })}>
                      <option value="">Unassigned</option>
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>{branch.branchName || 'Branch'}</option>
                      ))}
                    </select>
                  </SetupField>
                  <SetupField label="Role">
                    <select className="setup-input" value={invite.role || 'agent'} onChange={(event) => updateInvite(invite.id, { role: event.target.value })}>
                      {AGENCY_INVITE_ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </SetupField>
                </div>
              </section>
            ))}
          </div>
          <button type="button" className="setup-secondary-button" onClick={addInvite}>
            <Plus size={16} />
            Add agent invite
          </button>
        </div>
      )
    }

    return (
      <div className="agency-setup-card">
        <SetupSectionHeader
          eyebrow="Final check"
          title={canClaimExistingWorkspace ? `Activate ${agencyDisplayName}` : `Create the ${agencySetupLabel} workspace`}
          copy={canClaimExistingWorkspace
            ? 'Arch9 will save these details, activate your principal membership, and open the existing workspace.'
            : 'Arch9 will create the organisation, save this setup, activate the principal account, and queue the team invitations.'}
          icon={CheckCircle2}
        />
        <div className="agency-review-grid">
          <div>
            <Building2 size={18} />
            <span>{isCommercialAgencyType(agency.agencyType) ? agencySetupLabel : 'Agency'}</span>
            <strong>{agency.agencyName || 'Not set'}</strong>
            <small>{agency.province || 'Province missing'}</small>
          </div>
          <div>
            <Users size={18} />
            <span>Team</span>
            <strong>{branches.length} {branches.length === 1 ? 'branch' : 'branches'}</strong>
            <small>{inviteCount} {inviteCount === 1 ? 'invite' : 'invites'} ready</small>
          </div>
          <div>
            <Palette size={18} />
            <span>Branding</span>
            <strong>{branding.logoLight ? 'Logo uploaded' : 'Arch9 fallback'}</strong>
            <small>{branding.brandColours?.primary || '#274C69'} primary</small>
          </div>
        </div>
      </div>
    )
  }

  function renderDeveloperSetup() {
    return (
      <form className="agency-setup-shell" onSubmit={handleCreateWorkspace}>
        <aside className="agency-setup-command">
          <div>
            <p className="agency-setup-kicker">Developer setup</p>
            <h2>{form.name || 'New developer workspace'}</h2>
            <span>{APP_ROLE_LABELS[intent.app_role] || 'Developer'} · {intendedRole.replace(/_/g, ' ') || 'owner'}</span>
          </div>
          <div className="agency-setup-progress">
            <strong>{developerCompletedSectionCount}/{developerSetupItems.length}</strong>
            <span>launch sections ready</span>
            <div><i style={{ width: `${Math.round((developerCompletedSectionCount / developerSetupItems.length) * 100)}%` }} /></div>
          </div>
          <nav className="agency-setup-nav" aria-label="Developer setup readiness">
            {developerSetupItems.map((item, index) => (
              <button
                key={item.label}
                type="button"
                className={item.complete ? 'is-active' : ''}
                aria-pressed={item.complete}
              >
                <span>{index + 1}</span>
                <strong>{item.label}</strong>
                {item.complete ? <CheckCircle2 size={15} /> : null}
              </button>
            ))}
          </nav>
          <div className="agency-setup-snapshot">
            <p><Mail size={14} />{form.businessEmail || 'Business email missing'}</p>
            <p><Phone size={14} />{form.contactNumber || 'Contact number missing'}</p>
            <p><MapPin size={14} />{form.operatingArea || form.province || 'Operating area optional'}</p>
          </div>
        </aside>

        <section className="agency-setup-main">
          <div className="agency-setup-card">
            <SetupSectionHeader
              eyebrow="Workspace foundation"
              title="Create the developer company profile"
              copy="This becomes the command centre for developments, stock visibility, buyer demand, and shared transaction progress."
              icon={Building2}
            />
            <div className="setup-field-grid">
              <SetupField label="Developer company name">
                <input className="setup-input" value={form.name} onChange={(event) => updateField('name', event.target.value)} />
              </SetupField>
              <SetupField label="Legal name">
                <input className="setup-input" value={form.legalName} onChange={(event) => updateField('legalName', event.target.value)} />
              </SetupField>
              <SetupField label="Business email">
                <input className="setup-input" type="email" value={form.businessEmail} onChange={(event) => updateField('businessEmail', event.target.value)} />
              </SetupField>
              <SetupField label="Contact number">
                <input className="setup-input" value={form.contactNumber} onChange={(event) => updateField('contactNumber', event.target.value)} />
              </SetupField>
              <SetupField label="Registration number" hint="Optional, but useful for legal records and duplicate protection.">
                <input className="setup-input" value={form.registrationNumber} onChange={(event) => updateField('registrationNumber', event.target.value)} />
              </SetupField>
              <SetupField label="Province">
                <input className="setup-input" value={form.province} onChange={(event) => updateField('province', event.target.value)} />
              </SetupField>
              <SetupField label="Operating area" hint="Example: Johannesburg North, Cape Town Atlantic Seaboard, KZN North Coast.">
                <input className="setup-input" value={form.operatingArea} onChange={(event) => updateField('operatingArea', event.target.value)} />
              </SetupField>
              <SetupField label="Primary contact">
                <input className="setup-input" value={form.primaryContactName} onChange={(event) => updateField('primaryContactName', event.target.value)} />
              </SetupField>
            </div>
          </div>

          <div className="agency-setup-card">
            <SetupSectionHeader
              eyebrow="Launch workspace"
              title="What Arch9 prepares next"
              copy="Once created, this workspace can hold developments, unit inventory, agency partner activity, buyer leads, and transaction movement."
              icon={CheckCircle2}
            />
            <div className="agency-review-grid">
              <div>
                <Building2 size={18} />
                <span>Developments</span>
                <strong>Project-ready</strong>
                <small>Stock, units, pricing, and release status</small>
              </div>
              <div>
                <Users size={18} />
                <span>Sales network</span>
                <strong>Partner visibility</strong>
                <small>Agents, buyers, and launch activity</small>
              </div>
              <div>
                <ShieldCheck size={18} />
                <span>Transactions</span>
                <strong>Controlled workspace</strong>
                <small>Offers, finance, transfer, and registration</small>
              </div>
            </div>
          </div>

          {message ? <p className="setup-message success">{message}</p> : null}
          {error ? <p className="setup-message error">{error}</p> : null}
          <div className="agency-setup-actions">
            <button type="submit" className="setup-primary-button" disabled={saving}>
              {saving ? 'Creating developer workspace...' : (
                <>
                  Create developer company
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </section>
      </form>
    )
  }

  return (
    <OnboardingProgressLayout
      title={pageTitle}
      description={pageDescription}
      activeStep={
        isAgencyPrincipalSetup
          ? agencyCurrentStep.key
          : isBondOwnerSetup
            ? bondCurrentStep.key
            : onboardingState?.onboardingStep || ONBOARDING_STEPS.createOrJoinWorkspace
      }
      steps={isAgencyPrincipalSetup ? AGENCY_SETUP_STEPS : isBondOwnerSetup ? BOND_SETUP_STEPS : undefined}
      className={canAcceptInvite ? 'setup-invite-progress-page' : ''}
      panelClassName={canAcceptInvite ? 'setup-invite-progress-panel' : ''}
    >
      {isAgencyPrincipalSetup ? (
        <form className="agency-setup-shell" onSubmit={handleAgencyStepSubmit}>
          <aside className="agency-setup-command">
            <div>
              <p className="agency-setup-kicker">{canClaimExistingWorkspace ? 'Workspace claim' : 'Principal setup'}</p>
              <h2>{claimWorkspaceLoading ? 'Loading workspace...' : agencyDisplayName}</h2>
              <span>{APP_ROLE_LABELS[intent.app_role] || 'Agent'} · {intendedRole.replace(/_/g, ' ')}</span>
            </div>
            <div className="agency-setup-progress">
              <strong>{completedStepCount}/{AGENCY_SETUP_STEPS.length}</strong>
              <span>setup sections ready</span>
              <div><i style={{ width: `${Math.round((completedStepCount / AGENCY_SETUP_STEPS.length) * 100)}%` }} /></div>
            </div>
            <nav className="agency-setup-nav" aria-label="Agency setup steps">
              {AGENCY_SETUP_STEPS.map((step, index) => {
                const isActive = index === agencyStepIndex
                const hasError = Boolean(resolveAgencyStepError(step.key, agencyDraft))
                return (
                  <button
                    key={step.key}
                    type="button"
                    className={isActive ? 'is-active' : ''}
                    onClick={() => {
                      setAgencyStepIndex(index)
                      setError('')
                    }}
                  >
                    <span>{index + 1}</span>
                    <strong>{step.label}</strong>
                    {!hasError ? <CheckCircle2 size={15} /> : null}
                  </button>
                )
              })}
            </nav>
            <div className="agency-setup-snapshot">
              <p><Mail size={14} />{agency.mainEmailAddress || 'Business email missing'}</p>
              <p><Phone size={14} />{agency.mainOfficeNumber || 'Office number missing'}</p>
              <p><Globe2 size={14} />{agency.website || 'Website optional'}</p>
            </div>
          </aside>

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
                disabled={saving || agencyStepIndex === 0}
              >
                Back
              </button>
              <button type="submit" className="setup-primary-button" disabled={saving}>
                {saving
                  ? 'Creating agency...'
                  : agencyStepIndex === AGENCY_SETUP_STEPS.length - 1
                    ? 'Create agency and send invites'
                    : (
                        <>
                          Continue
                          <ArrowRight size={16} />
                        </>
                      )}
              </button>
            </div>
          </section>
        </form>
      ) : isBondOwnerSetup ? (
        <form className="agency-setup-shell" onSubmit={handleBondStepSubmit}>
          <aside className="agency-setup-command">
            <div>
              <p className="agency-setup-kicker">{isPersonalBondOriginator ? 'Independent originator setup' : 'Bond company setup'}</p>
              <h2>{bondBusiness.businessName || 'New bond business'}</h2>
              <span>{bondWorkspaceKindLabel} · {APP_ROLE_LABELS[intent.app_role] || 'Bond Originator'}</span>
            </div>
            <div className="agency-setup-progress">
              <strong>{bondCompletedStepCount}/{BOND_SETUP_STEPS.length}</strong>
              <span>setup sections ready</span>
              <div><i style={{ width: `${Math.round((bondCompletedStepCount / BOND_SETUP_STEPS.length) * 100)}%` }} /></div>
            </div>
            <nav className="agency-setup-nav" aria-label="Bond setup steps">
              {BOND_SETUP_STEPS.map((step, index) => {
                const isActive = index === bondStepIndex
                const hasError = Boolean(resolveBondStepError(step.key, bondDraft))
                return (
                  <button
                    key={step.key}
                    type="button"
                    className={isActive ? 'is-active' : ''}
                    onClick={() => {
                      setBondStepIndex(index)
                      setError('')
                    }}
                  >
                    <span>{index + 1}</span>
                    <strong>{step.label}</strong>
                    {!hasError ? <CheckCircle2 size={15} /> : null}
                  </button>
                )
              })}
            </nav>
            <div className="agency-setup-snapshot">
              <p><Mail size={14} />{bondBusiness.businessEmail || 'Business email missing'}</p>
              <p><Phone size={14} />{bondBusiness.contactNumber || 'Business phone missing'}</p>
              <p><Users size={14} />{isPersonalBondOriginator ? bondTeam.defaultTeamName || 'My Pipeline' : bondTeam.defaultTeamName || 'Main Team'}</p>
            </div>
          </aside>

          <section className="agency-setup-main">
            {renderBondStep()}
            {message ? <p className="setup-message success">{message}</p> : null}
            {error ? <p className="setup-message error">{error}</p> : null}
            <div className="agency-setup-actions">
              <button
                type="button"
                className="setup-secondary-button"
                onClick={() => {
                  setError('')
                  setBondStepIndex((previous) => Math.max(previous - 1, 0))
                }}
                disabled={saving || bondStepIndex === 0}
              >
                Back
              </button>
              <button type="submit" className="setup-primary-button" disabled={saving}>
                {saving
                  ? 'Creating bond workspace...'
                  : bondStepIndex === BOND_SETUP_STEPS.length - 1
                    ? isPersonalBondOriginator ? 'Create independent workspace' : 'Create bond business workspace'
                    : (
                        <>
                          Continue
                          <ArrowRight size={16} />
                        </>
                      )}
              </button>
            </div>
          </section>
        </form>
      ) : isDeveloperCompanySetup ? (
        renderDeveloperSetup()
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
