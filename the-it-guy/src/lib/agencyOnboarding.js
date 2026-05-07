const ONBOARDING_SCHEMA_VERSION = 1

export const AGENCY_TYPE_OPTIONS = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'mixed', label: 'Mixed' },
]

export const AGENCY_BUSINESS_FOCUS_OPTIONS = [
  { value: 'sales', label: 'Sales' },
  { value: 'rentals', label: 'Rentals' },
  { value: 'sales_rentals', label: 'Sales & Rentals' },
]

export const AGENCY_ORGANISATION_TYPE_OPTIONS = [
  { value: 'agency', label: 'Agency', enabled: true },
  { value: 'developer', label: 'Developer', enabled: false },
  { value: 'attorney', label: 'Attorney', enabled: false },
  { value: 'bond_originator', label: 'Bond Originator', enabled: false },
]

export const AGENCY_INVITE_ROLE_OPTIONS = [
  { value: 'agent', label: 'Agent' },
  { value: 'branch_manager', label: 'Branch Manager' },
  { value: 'administrator', label: 'Administrator' },
]

function generateDraftId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeText(value) {
  return String(value || '').trim()
}

export function createAgencyBranchDraft(overrides = {}) {
  return {
    id: overrides.id || generateDraftId('branch'),
    branchName: normalizeText(overrides.branchName || 'Head Office'),
    officeLocation: normalizeText(overrides.officeLocation),
    branchManager: normalizeText(overrides.branchManager),
    numberOfAgents: normalizeText(overrides.numberOfAgents),
  }
}

export function createAgencyInviteDraft(overrides = {}) {
  return {
    id: overrides.id || generateDraftId('invite'),
    name: normalizeText(overrides.name),
    email: normalizeText(overrides.email).toLowerCase(),
    branchId: normalizeText(overrides.branchId),
    role: normalizeText(overrides.role || 'agent') || 'agent',
  }
}

export function buildDefaultAgencyOnboarding(profile = null) {
  const fullName = normalizeText(profile?.fullName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' '))

  return {
    schemaVersion: ONBOARDING_SCHEMA_VERSION,
    organisationType: 'agency',
    agencyInformation: {
      agencyName: normalizeText(profile?.companyName),
      tradingName: '',
      agencyType: 'residential',
      businessFocus: 'sales',
      companyRegistrationNumber: '',
      vatNumber: '',
      eaabPpraNumber: '',
      website: '',
      mainOfficeNumber: normalizeText(profile?.phoneNumber),
      mainEmailAddress: normalizeText(profile?.email),
      physicalAddress: '',
      province: '',
      country: 'South Africa',
    },
    principalInformation: {
      principalFullName: fullName,
      emailAddress: normalizeText(profile?.email),
      phoneNumber: normalizeText(profile?.phoneNumber),
      position: 'Principal / Owner',
      ppraNumber: '',
      idNumber: '',
    },
    branchStructure: {
      branches: [createAgencyBranchDraft()],
    },
    branding: {
      logoLight: '',
      logoDark: '',
      logoLightName: '',
      logoDarkName: '',
      brandColours: {
        primary: '#274C69',
        secondary: '#10273A',
      },
    },
    invitations: [createAgencyInviteDraft()],
    permissions: {
      principalScope: 'all',
      branchManagerScope: 'branch',
      agentScope: 'own',
      crmLeadVisibility: 'private',
      allowCrossBranchCollaboration: false,
      allowSharedLeadPools: false,
      allowSharedListings: false,
    },
    status: {
      completedAt: null,
      lastSavedAt: null,
    },
  }
}

function mergeBranchRows(nextRows = [], fallbackRows = []) {
  const source = Array.isArray(nextRows) && nextRows.length ? nextRows : fallbackRows
  const normalized = (source || []).map((row) => createAgencyBranchDraft(row))
  return normalized.length ? normalized : [createAgencyBranchDraft()]
}

function mergeInviteRows(nextRows = [], fallbackRows = []) {
  const source = Array.isArray(nextRows) && nextRows.length ? nextRows : fallbackRows
  const normalized = (source || []).map((row) => createAgencyInviteDraft(row))
  return normalized.length ? normalized : [createAgencyInviteDraft()]
}

export function mergeAgencyOnboardingDraft(baseDraft = {}, nextDraft = {}, profile = null) {
  const defaults = buildDefaultAgencyOnboarding(profile)
  const base = baseDraft && typeof baseDraft === 'object' ? baseDraft : {}
  const incoming = nextDraft && typeof nextDraft === 'object' ? nextDraft : {}

  return {
    ...defaults,
    ...base,
    ...incoming,
    organisationType: normalizeText(incoming.organisationType || base.organisationType || defaults.organisationType) || 'agency',
    agencyInformation: {
      ...defaults.agencyInformation,
      ...(base.agencyInformation || {}),
      ...(incoming.agencyInformation || {}),
    },
    principalInformation: {
      ...defaults.principalInformation,
      ...(base.principalInformation || {}),
      ...(incoming.principalInformation || {}),
    },
    branchStructure: {
      branches: mergeBranchRows(incoming.branchStructure?.branches, base.branchStructure?.branches),
    },
    branding: {
      ...defaults.branding,
      ...(base.branding || {}),
      ...(incoming.branding || {}),
      brandColours: {
        ...defaults.branding.brandColours,
        ...(base.branding?.brandColours || {}),
        ...(incoming.branding?.brandColours || {}),
      },
    },
    invitations: mergeInviteRows(incoming.invitations, base.invitations),
    permissions: {
      ...defaults.permissions,
      ...(base.permissions || {}),
      ...(incoming.permissions || {}),
    },
    status: {
      ...defaults.status,
      ...(base.status || {}),
      ...(incoming.status || {}),
    },
  }
}

export function normalizeBranchManagerName(branch = {}) {
  return normalizeText(branch.branchManager)
}

export function normalizeBranchAgentCount(branch = {}) {
  const value = Number(branch.numberOfAgents)
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.trunc(value)
}

