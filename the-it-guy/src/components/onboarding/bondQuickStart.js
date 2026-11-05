import { WORKSPACE_KINDS } from '../../constants/workspaceTypes'
import {
  DEVELOPER_SIGNUP_STEPS, DEVELOPER_LOGO_VARIANTS,
  createDeveloperSignupDraft, restoreDeveloperSignupDraft,
  validateDeveloperSignupStep, buildDeveloperSignupForm,
} from './developerQuickStart'

export const BOND_SIGNUP_STEPS = DEVELOPER_SIGNUP_STEPS
export const BOND_LOGO_VARIANTS = DEVELOPER_LOGO_VARIANTS
export const BOND_BUSINESS_TYPES = [
  { value: WORKSPACE_KINDS.bondCompany, label: 'Originator company' },
  { value: WORKSPACE_KINDS.personalOriginator, label: 'Independent originator' },
]

const flow = 'bond_quick_start_v1'
const workspaceKind = (value) => value === WORKSPACE_KINDS.personalOriginator ? value : WORKSPACE_KINDS.bondCompany

export function createBondSignupDraft(profile = {}, form = {}, intent = {}) {
  const draft = createDeveloperSignupDraft(profile, form)
  return {
    ...draft, flow,
    companyDetails: {
      ...draft.companyDetails,
      workspaceKind: workspaceKind(form.workspaceKind || intent.workspace_kind),
    },
  }
}

export function restoreBondSignupDraft(raw, fallback) {
  try {
    const saved = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return fallback
    if (saved.flow === flow) {
      const draft = restoreDeveloperSignupDraft({ ...saved, flow: 'developer_quick_start_v1' }, fallback)
      return { ...draft, flow, companyDetails: { ...draft.companyDetails, workspaceKind: workspaceKind(draft.companyDetails.workspaceKind) } }
    }
    if (saved.flow) return fallback
    // Retain entered business/owner information from the previous five-step form.
    const oldDraft = saved.bondDraft || {}
    const business = oldDraft.businessInformation || {}
    const owner = oldDraft.ownerInformation || {}
    const draft = restoreDeveloperSignupDraft(saved, fallback)
    const ownerParts = String(owner.fullName || '').trim().split(/\s+/)
    return {
      ...draft, flow,
      personalDetails: {
        ...draft.personalDetails,
        firstName: owner.fullName ? ownerParts[0] : draft.personalDetails.firstName,
        lastName: owner.fullName ? ownerParts.slice(1).join(' ') : draft.personalDetails.lastName,
      },
      companyDetails: {
        ...draft.companyDetails, ...business,
        name: business.businessName || draft.companyDetails.name,
        workspaceKind: workspaceKind(oldDraft.meta?.workspaceKind || draft.companyDetails.workspaceKind),
      },
    }
  } catch { return fallback }
}

export const validateBondSignupStep = validateDeveloperSignupStep

export function buildBondSignupForm(draft, verifiedEmail) {
  const form = buildDeveloperSignupForm(draft, verifiedEmail)
  const company = draft.companyDetails
  const kind = workspaceKind(company.workspaceKind)
  const independent = kind === WORKSPACE_KINDS.personalOriginator
  const teamName = independent ? 'My Pipeline' : 'Main Team'
  const { developerOnboarding: _developerOnboarding, ...settings } = form.settings
  return {
    ...form,
    workspaceKind: kind,
    tradingName: company.tradingName || form.name,
    website: company.website || '',
    city: company.city || '',
    physicalAddress: company.physicalAddress || '',
    ownerPhone: company.contactNumber || '',
    mainBranchName: teamName,
    // The atomic onboarding service creates the required default team. No invites
    // or launch-role prompts are needed before an owner can use the workspace.
    branches: [],
    invites: [],
    settings: {
      ...settings,
      bondOnboarding: {
        flow,
        businessInformation: { ...company, businessName: form.name, businessEmail: verifiedEmail },
        ownerInformation: { fullName: form.ownerFullName, email: verifiedEmail },
        meta: { workspaceKind: kind },
      },
      bondWorkspace: {
        operatingModel: independent ? 'independent' : 'company',
        teamName,
        supportEmail: company.supportEmail || verifiedEmail,
        ownerHandlesConsulting: true,
        ownerHandlesProcessing: true,
      },
    },
  }
}
