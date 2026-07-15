import { normalizeWebsite } from '../../../services/attorneyFirmServiceShared.js'
import { getAllowedDepartmentsForRole } from './teamInviteUtils.js'

export const ONBOARDING_STEPS = [
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
    description: 'Choose transfer, bond, cancellation, admin, and management lanes.',
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
  {
    key: 'workspace_preview',
    label: 'Workspace Preview',
    description: 'Preview client-facing surfaces before activation.',
  },
]

export const DEFAULT_FIRM_INFORMATION = {
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

export const DEFAULT_BRANDING = {
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

export const DEFAULT_DEPARTMENTS = {
  transfer: true,
  bond: true,
  cancellation: true,
  admin: true,
  management: true,
}

const DEPARTMENT_LABELS = {
  transfer: 'Transfer Department',
  bond: 'Bond Department',
  cancellation: 'Bond Cancellation Department',
  admin: 'Admin Department',
  management: 'Management',
}

const ROLE_LABELS = {
  director_partner: 'Director / Partner',
  transfer_attorney: 'Transfer Attorney',
  bond_attorney: 'Bond Attorney',
  cancellation_attorney: 'Cancellation Attorney',
  conveyancing_secretary: 'Conveyancing Secretary',
  admin_staff: 'Admin Staff',
  reception_scheduling: 'Reception / Scheduling',
  candidate_attorney: 'Candidate Attorney',
}

export function buildInviteId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `invite-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

export function createEmptyInvite(defaultDepartmentType = '') {
  return {
    id: buildInviteId(),
    email: '',
    role: '',
    departmentType: defaultDepartmentType,
  }
}

export function isValidEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  if (!email) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function isValidWebsite(value) {
  return !value || Boolean(normalizeWebsite(value))
}

export function normalizeHexColour(value, fallback) {
  const normalized = String(value || '').trim()
  if (!normalized) return fallback
  const match = normalized.match(/^#([0-9a-fA-F]{6})$/)
  return match ? `#${match[1]}`.toLowerCase() : fallback
}

export function buildFirmInformationFromFirm(firm = {}) {
  return {
    name: firm.name || '',
    registrationNumber: firm.registrationNumber || '',
    vatNumber: firm.vatNumber || '',
    email: firm.email || '',
    phone: firm.phone || '',
    website: firm.website || '',
    addressLine1: firm.addressLine1 || '',
    addressLine2: firm.addressLine2 || '',
    city: firm.city || '',
    province: firm.province || '',
    postalCode: firm.postalCode || '',
    country: firm.country || 'South Africa',
  }
}

export function buildBrandingFromFirm(firm = {}) {
  return {
    ...DEFAULT_BRANDING,
    logoUrl: firm.logoUrl || '',
    logoBucket: firm.logoBucket || '',
    logoPath: firm.logoPath || '',
    logoDarkUrl: firm.logoDarkUrl || '',
    logoDarkBucket: firm.logoDarkBucket || '',
    logoDarkPath: firm.logoDarkPath || '',
    primaryColour: firm.primaryColour || DEFAULT_BRANDING.primaryColour,
    secondaryColour: firm.secondaryColour || DEFAULT_BRANDING.secondaryColour,
  }
}

export function buildSelectedDepartmentsFromRows(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return DEFAULT_DEPARTMENTS
  return rows.reduce(
    (accumulator, department) => {
      const type = String(department?.departmentType || '').trim()
      if (type) accumulator[type] = department.isActive !== false
      return accumulator
    },
    { ...DEFAULT_DEPARTMENTS, transfer: false, bond: false, cancellation: false, admin: false, management: true },
  )
}

export function getActiveDepartmentTypes(selectedDepartments = {}) {
  return ['transfer', 'bond', 'cancellation', 'admin', 'management'].filter((type) => Boolean(selectedDepartments[type]))
}

export function validateFirmInformation(values = {}) {
  const errors = {}
  if (!String(values.name || '').trim()) {
    errors.name = 'Firm name is required.'
  }
  if (values.email && !isValidEmail(values.email)) {
    errors.email = 'Please enter a valid email address.'
  }
  if (values.website && !isValidWebsite(values.website)) {
    errors.website = 'Please enter a valid domain, such as arch9.co.za.'
  }
  return errors
}

export function validateBranding(values = {}) {
  const errors = {}
  if (values.primaryColour && !/^#[0-9a-fA-F]{6}$/.test(values.primaryColour)) {
    errors.primaryColour = 'Use a valid hex colour.'
  }
  if (values.secondaryColour && !/^#[0-9a-fA-F]{6}$/.test(values.secondaryColour)) {
    errors.secondaryColour = 'Use a valid hex colour.'
  }
  return errors
}

export function validateInvites(invites = [], activeDepartmentTypes = []) {
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

export function formatSavedTime(iso = '') {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function buildDraftStorageKey(profileId = '') {
  return `itg:attorney-onboarding-draft:${String(profileId || 'anonymous').trim() || 'anonymous'}`
}

export function sanitizeDraftInvite(invite = {}) {
  return {
    id: invite.id || buildInviteId(),
    email: String(invite.email || ''),
    role: String(invite.role || ''),
    departmentType: String(invite.departmentType || ''),
  }
}

export function buildDraftPayload({
  currentStepIndex = 0,
  firmInformation = DEFAULT_FIRM_INFORMATION,
  branding = DEFAULT_BRANDING,
  selectedDepartments = DEFAULT_DEPARTMENTS,
  invites = [],
  savedAt = new Date().toISOString(),
} = {}) {
  return {
    currentStepIndex: Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, Number(currentStepIndex) || 0)),
    firmInformation,
    branding,
    selectedDepartments: {
      ...selectedDepartments,
      management: true,
    },
    invites: Array.isArray(invites) ? invites.map(sanitizeDraftInvite) : [],
    savedAt,
  }
}

export function parseDraftPayload(rawDraft) {
  if (!rawDraft) return null
  const parsed = typeof rawDraft === 'string' ? JSON.parse(rawDraft) : rawDraft
  if (!parsed || typeof parsed !== 'object') return null
  return buildDraftPayload(parsed)
}

export function hasValidationErrors(errors = {}) {
  return Object.keys(errors || {}).length > 0
}

export function getValidationErrorsForStep(stepKey, context = {}) {
  const {
    firmInformation = {},
    branding = {},
    invites = [],
    activeDepartmentTypes = [],
  } = context

  if (stepKey === 'firm_information') return validateFirmInformation(firmInformation)
  if (stepKey === 'branding') return validateBranding(branding)
  if (stepKey === 'team_invites') return validateInvites(invites, activeDepartmentTypes)
  return {}
}

function formatPacketValue(value, fallback = '-') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function formatPacketList(values = [], fallback = 'None') {
  const visibleValues = values.map((value) => String(value || '').trim()).filter(Boolean)
  return visibleValues.length ? visibleValues.join(', ') : fallback
}

export function buildLaunchPacket({
  firmInformation = {},
  branding = {},
  activeDepartmentTypes = [],
  invites = [],
  dossier = {},
} = {}) {
  const firmName = formatPacketValue(firmInformation.name, 'Attorney Firm')
  const activeInviteRows = invites
    .filter((invite) => String(invite.email || '').trim())
    .map((invite) => {
      const role = ROLE_LABELS[invite.role] || invite.role || 'Team member'
      const department = DEPARTMENT_LABELS[invite.departmentType] || invite.departmentType || 'Unassigned'
      return `${String(invite.email || '').trim()} - ${role} / ${department}`
    })
  const requiredItems = Array.isArray(dossier.requiredItems) ? dossier.requiredItems : []
  const recommendedItems = Array.isArray(dossier.recommendedItems) ? dossier.recommendedItems : []
  const launchSurfaces = Array.isArray(dossier.launchSurfaces) ? dossier.launchSurfaces : []
  const nextAction = dossier.nextAction
    ? `${dossier.nextAction.actionLabel} ${dossier.nextAction.label}`
    : 'Activate workspace'

  const lines = [
    `${firmName} Launch Packet`,
    '',
    `Status: ${formatPacketValue(dossier.headline, 'Activation dossier')}`,
    `Summary: ${formatPacketValue(dossier.summary, 'Workspace setup is ready for review.')}`,
    `Next action: ${nextAction}`,
    '',
    'Firm Profile',
    `- Name: ${firmName}`,
    `- Email: ${formatPacketValue(firmInformation.email)}`,
    `- Phone: ${formatPacketValue(firmInformation.phone)}`,
    `- Website: ${formatPacketValue(firmInformation.website)}`,
    '',
    'Brand Kit',
    `- Primary colour: ${formatPacketValue(branding.primaryColour, DEFAULT_BRANDING.primaryColour)}`,
    `- Secondary colour: ${formatPacketValue(branding.secondaryColour, DEFAULT_BRANDING.secondaryColour)}`,
    `- Logo: ${branding.logoUrl || branding.logoFileName || branding.logoPath ? 'Ready' : 'Pending'}`,
    '',
    'Workflows',
    `- Active lanes: ${formatPacketList(activeDepartmentTypes.map((type) => DEPARTMENT_LABELS[type] || type))}`,
    '',
    'Required Gates',
    ...requiredItems.map((item) => `- ${item.label}: ${item.isReady ? 'Ready' : 'Needs attention'} - ${item.description || ''}`.trim()),
    '',
    'Launch Surfaces',
    ...launchSurfaces.map((surface) => `- ${surface.label}: ${surface.detail}`),
    '',
    'Recommended Follow-Up',
    ...(recommendedItems.length
      ? recommendedItems.map((item) => `- ${item.label}: ${item.description}`)
      : ['- None']),
    '',
    'Team Invitations',
    ...(activeInviteRows.length ? activeInviteRows.map((inviteRow) => `- ${inviteRow}`) : ['- None queued']),
  ]

  return {
    title: `${firmName} Launch Packet`,
    text: lines.join('\n'),
    nextAction,
    inviteCount: activeInviteRows.length,
  }
}

export function buildActivationGuard(activationDossier = {}) {
  const requiredItems = Array.isArray(activationDossier.requiredItems) ? activationDossier.requiredItems : []
  const blockedItems = requiredItems.filter((item) => !item.isReady)
  const firstBlockedItem = blockedItems[0] || null
  const blockedCount = blockedItems.length
  const inferredStatus = activationDossier.status || (blockedCount ? 'blocked' : 'ready')
  const canActivate = inferredStatus === 'ready' && blockedCount === 0
  const gateLabel = blockedCount === 1 ? 'required gate' : 'required gates'

  return {
    canActivate,
    blockedCount,
    blockedItems,
    stepKey: firstBlockedItem?.stepKey || '',
    actionLabel: firstBlockedItem ? `Fix ${firstBlockedItem.label}` : 'Activate workspace',
    message: canActivate
      ? 'All required gates are clear.'
      : blockedCount
        ? `Resolve ${blockedCount} ${gateLabel} before activation.`
        : 'Review required gates before activation.',
  }
}

export function buildActivationDossier({
  firmInformation = {},
  branding = {},
  activeDepartmentTypes = [],
  invites = [],
  readiness = {},
} = {}) {
  const readinessItems = Array.isArray(readiness.items) ? readiness.items : []
  const requiredItems = readinessItems
    .filter((item) => item.blocking)
    .map((item) => ({
      ...item,
      isReady: item.state === 'complete' || item.state === 'optional',
    }))
  const recommendedItems = readinessItems.filter((item) => !item.blocking && item.state !== 'complete')
  const logoReady = Boolean(branding.logoUrl || branding.logoFileName || branding.logoPath)
  const contactChannels = [
    firmInformation.email,
    firmInformation.phone,
    firmInformation.website,
  ].filter((value) => String(value || '').trim()).length
  const activeInvites = invites.filter((invite) => String(invite.email || '').trim())
  const readyGateCount = requiredItems.filter((item) => item.isReady).length
  const missingGateCount = requiredItems.length - readyGateCount
  const isActivationReady = missingGateCount === 0
  const nextActionItem = requiredItems.find((item) => !item.isReady) || recommendedItems[0] || null

  const dossier = {
    status: isActivationReady ? 'ready' : 'blocked',
    headline: isActivationReady ? 'Launch dossier is ready' : 'Launch dossier needs attention',
    summary: isActivationReady
      ? 'Required gates are cleared for workspace activation.'
      : 'Resolve the required gates before activating the workspace.',
    nextAction: nextActionItem
      ? {
          key: nextActionItem.key,
          label: nextActionItem.label,
          stepKey: nextActionItem.stepKey,
          state: nextActionItem.state,
          actionLabel: nextActionItem.state === 'needs_attention' ? 'Fix' : 'Review',
        }
      : null,
    metrics: [
      {
        key: 'readiness',
        label: 'Readiness',
        value: `${readiness.percent || 0}%`,
        detail: readiness.nextAction || 'Activation path',
      },
      {
        key: 'workflow_lanes',
        label: 'Workflow lanes',
        value: String(activeDepartmentTypes.length),
        detail: activeDepartmentTypes.length === 1 ? 'active department' : 'active departments',
      },
      {
        key: 'team_access',
        label: 'Team access',
        value: String(activeInvites.length),
        detail: activeInvites.length === 1 ? 'invite prepared' : 'invites prepared',
      },
      {
        key: 'client_surface',
        label: 'Client surface',
        value: contactChannels ? String(contactChannels) : '0',
        detail: contactChannels === 1 ? 'contact channel' : 'contact channels',
      },
    ],
    requiredItems,
    recommendedItems,
    launchSurfaces: [
      {
        key: 'letterhead',
        label: 'Letterhead',
        state: logoReady ? 'complete' : 'prepared',
        stepKey: 'branding',
        detail: logoReady ? 'Logo and colours are ready.' : 'Colours are ready; logo can follow.',
      },
      {
        key: 'matter_routing',
        label: 'Matter routing',
        state: activeDepartmentTypes.length ? 'complete' : 'needs_attention',
        stepKey: 'departments',
        detail: activeDepartmentTypes.length ? `${activeDepartmentTypes.length} lanes will open.` : 'No lanes selected.',
      },
      {
        key: 'client_portal',
        label: 'Client portal',
        state: contactChannels ? 'complete' : 'recommended',
        stepKey: 'firm_information',
        detail: contactChannels ? `${contactChannels} contact channels available.` : 'Add contact details after launch.',
      },
      {
        key: 'team_invites',
        label: 'Team invites',
        state: activeInvites.length ? 'complete' : 'optional',
        stepKey: 'team_invites',
        detail: activeInvites.length ? `${activeInvites.length} queued for send.` : 'Team can be added later.',
      },
    ],
  }

  return {
    ...dossier,
    activationGuard: buildActivationGuard(dossier),
    launchPacket: buildLaunchPacket({
      firmInformation,
      branding,
      activeDepartmentTypes,
      invites,
      dossier,
    }),
  }
}

export function buildOnboardingGuidance({
  firmInformation = {},
  branding = {},
  activeDepartmentTypes = [],
  invites = [],
} = {}) {
  const firmErrors = validateFirmInformation(firmInformation)
  const brandingErrors = validateBranding(branding)
  const inviteErrors = validateInvites(invites, activeDepartmentTypes)
  const firmReady = !hasValidationErrors(firmErrors)
  const brandingReady = !hasValidationErrors(brandingErrors)
  const invitesReady = !hasValidationErrors(inviteErrors)
  const departmentsReady = activeDepartmentTypes.includes('management') && activeDepartmentTypes.length > 0
  const contactReady = Boolean(
    String(firmInformation.email || '').trim() ||
    String(firmInformation.phone || '').trim() ||
    String(firmInformation.website || '').trim(),
  )
  const logoReady = Boolean(branding.logoUrl || branding.logoFileName || branding.logoPath)

  const items = [
    {
      key: 'firm_profile',
      label: 'Firm profile',
      description: firmReady ? 'Legal identity is ready.' : 'Add the firm name to unlock activation.',
      state: firmReady ? 'complete' : 'needs_attention',
      blocking: true,
      stepKey: 'firm_information',
    },
    {
      key: 'brand_system',
      label: 'Brand system',
      description: brandingReady
        ? logoReady
          ? 'Brand colors and logo are ready.'
          : 'Brand colors are ready. Logo can be added later.'
        : 'Use valid six-digit hex colors.',
      state: brandingReady ? 'complete' : 'needs_attention',
      blocking: true,
      stepKey: 'branding',
    },
    {
      key: 'workflow_lanes',
      label: 'Workflow lanes',
      description: departmentsReady
        ? `${activeDepartmentTypes.length} legal lanes are active.`
        : 'Keep management active and select at least one lane.',
      state: departmentsReady ? 'complete' : 'needs_attention',
      blocking: true,
      stepKey: 'departments',
    },
    {
      key: 'team_access',
      label: 'Team access',
      description: invitesReady
        ? invites.length
          ? `${invites.length} invite${invites.length === 1 ? '' : 's'} prepared.`
          : 'No invites yet. You can add the team later.'
        : 'Resolve invite email, role, or department issues.',
      state: invitesReady ? (invites.length ? 'complete' : 'optional') : 'needs_attention',
      blocking: true,
      stepKey: 'team_invites',
    },
    {
      key: 'client_surface',
      label: 'Client surface',
      description: contactReady ? 'Client-facing contact details are present.' : 'Add contact details for a richer client surface.',
      state: contactReady ? 'complete' : 'recommended',
      blocking: false,
      stepKey: 'firm_information',
    },
  ]

  const blockingItems = items.filter((item) => item.blocking)
  const completeBlockingItems = blockingItems.filter((item) => item.state === 'complete' || item.state === 'optional')
  const nextAttentionItem = items.find((item) => item.state === 'needs_attention') || items.find((item) => item.state === 'recommended')
  const percent = blockingItems.length ? Math.round((completeBlockingItems.length / blockingItems.length) * 100) : 100

  const readiness = {
    percent,
    label: 'Activation readiness',
    headline: percent === 100 ? 'Ready to activate' : 'Setup needs attention',
    summary: nextAttentionItem
      ? nextAttentionItem.description
      : 'All required setup pieces are ready for activation.',
    nextAction: nextAttentionItem ? nextAttentionItem.label : 'Activate workspace',
    items,
  }

  return {
    readiness,
    activationDossier: buildActivationDossier({
      firmInformation,
      branding,
      activeDepartmentTypes,
      invites,
      readiness,
    }),
    stepStatuses: {
      firm_information: {
        status: firmReady ? 'complete' : 'needs_attention',
        label: firmReady ? 'Ready' : 'Required',
      },
      branding: {
        status: brandingReady ? 'complete' : 'needs_attention',
        label: brandingReady ? (logoReady ? 'Ready' : 'Logo optional') : 'Needs fix',
      },
      departments: {
        status: departmentsReady ? 'complete' : 'needs_attention',
        label: departmentsReady ? `${activeDepartmentTypes.length} active` : 'Required',
      },
      team_invites: {
        status: invitesReady ? (invites.length ? 'complete' : 'optional') : 'needs_attention',
        label: invitesReady ? (invites.length ? `${invites.length} ready` : 'Optional') : 'Needs fix',
      },
      review_confirm: {
        status: percent === 100 ? 'complete' : 'pending',
        label: percent === 100 ? 'Ready' : 'Review',
      },
      workspace_preview: {
        status: percent === 100 ? 'complete' : 'pending',
        label: percent === 100 ? 'Activate' : 'Preview',
      },
    },
  }
}
