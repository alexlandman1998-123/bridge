import { ArrowLeft, Bell, Building2, Check, CheckCircle2, ChevronRight, Home, Loader2, MailPlus, Plus, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchOrganisationSettings, listOrganisationUsers } from '../../../lib/settingsApi'
import { createWorkspaceUserInvite } from '../../../services/workspaceUserInviteService'
import { getBranches } from '../../../services/agencyBranchService'
import {
  activateCommercialWorkspaceForCurrentUser,
  enableCommercialWorkspaceForCurrentUser,
  remindCommercialAccessReviewersForCurrentUser,
  requestCommercialAccessForCurrentUser,
} from '../services/commercialApi'

const REVIEWER_ROLES = new Set(['owner', 'principal', 'director', 'partner', 'admin', 'super_admin', 'platform_admin'])

const BUSINESS_MODEL_OPTIONS = [
  { value: 'sales', label: 'Commercial Sales', description: 'Track mandates, buyers, and sale transactions.' },
  { value: 'leasing', label: 'Commercial Leasing', description: 'Manage leasing, occupiers, and lease pipelines.' },
  { value: 'sales_leasing', label: 'Commercial Sales + Leasing', description: 'Run both sales and leasing from one workspace.' },
]

const FEATURE_LABELS = {
  commercialListings: 'Commercial Listings',
  commercialPipeline: 'Commercial Pipeline',
  commercialCanvassing: 'Commercial Canvassing',
  brokerageReporting: 'Brokerage Reporting',
  commercialLeasing: 'Commercial Leasing',
  headsOfTerms: 'Heads of Terms',
  tenantManagement: 'Tenant Management',
  commercialDocumentCentre: 'Commercial Document Centre',
}

const COMMERCIAL_ROLE_OPTIONS = [
  { value: 'agent', label: 'Broker / Agent' },
  { value: 'assistant', label: 'Assistant' },
  { value: 'branch_manager', label: 'Branch Manager' },
  { value: 'admin', label: 'Admin' },
]

const WIZARD_STEPS = [
  'Business Model',
  'Team Setup',
  'Branch Structure',
  'Commercial Features',
  'Review & Confirm',
]

const WIZARD_STEP_TITLES = [
  'Business',
  'Team',
  'Branches',
  'Features',
  'Review',
]

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
}

function createBranchDraft(overrides = {}) {
  const fallbackId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10)
  return {
    id: normalizeText(overrides.id) || `commercial-branch-${fallbackId}`,
    name: normalizeText(overrides.name || overrides.branchName),
    location: normalizeText(overrides.location || overrides.officeLocation),
    managerName: normalizeText(overrides.managerName || overrides.branchManager),
  }
}

function buildFallbackBranches(context = null) {
  const organisationSettings = context?.organisationSettings || {}
  const onboardingBranches = organisationSettings?.agencyOnboarding?.branchStructure?.branches || organisationSettings?.organisationBranches || []
  return onboardingBranches
    .map((branch) => ({
      id: normalizeText(branch.id),
      name: normalizeText(branch.name || branch.branchName),
      location: normalizeText(branch.location || branch.officeLocation),
      managerName: normalizeText(branch.managerName || branch.branchManager),
    }))
    .filter((branch) => branch.name)
}

function formatBusinessModel(value = '') {
  return BUSINESS_MODEL_OPTIONS.find((option) => option.value === value)?.label || 'Commercial Sales + Leasing'
}

function formatUserName(user = {}) {
  return normalizeText(user.fullName) || normalizeText(user.email) || 'Workspace user'
}

function formatUserRole(user = {}) {
  const role = normalizeLower(user.role || user.workspaceRole || user.organisationRole)
  if (!role) return 'User'
  return role
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function formatCommercialError(error, fallbackMessage) {
  const message = normalizeText(error?.message || error)
  if (!message) return fallbackMessage
  if (message.includes('Commercial is not installed on this environment')) {
    const detail = normalizeText(error?.details)
    if (detail) {
      return `Commercial couldn't be enabled right now. ${detail.endsWith('.') ? detail : `${detail}.`}`
    }
    return "Commercial couldn't be enabled right now. Please retry once the latest Commercial workspace update is available on this environment."
  }
  return message
}

function buildDefaultDraft({ context = null, users = [], branches = [] } = {}) {
  const organisationSettings = context?.organisationSettings || {}
  const commercialWorkspace = organisationSettings?.commercialWorkspace || {}
  const currentProfileId = normalizeText(context?.profile?.id)
  const currentProfileEmail = normalizeEmail(context?.profile?.email)

  const existingSelectedUserIds = Array.isArray(commercialWorkspace.selectedOrganisationUserIds)
    ? commercialWorkspace.selectedOrganisationUserIds.map((value) => normalizeText(value)).filter(Boolean)
    : []

  const defaultSelectedUserIds = existingSelectedUserIds.length
    ? existingSelectedUserIds
    : users
      .filter((user) => {
        const role = normalizeLower(user.role)
        return normalizeText(user.userId) === currentProfileId || normalizeEmail(user.email) === currentProfileEmail || REVIEWER_ROLES.has(role)
      })
      .map((user) => normalizeText(user.id))

  const businessModel = normalizeLower(commercialWorkspace.businessModel || 'sales_leasing')
  const defaultFeatures = {
    commercialListings: true,
    commercialPipeline: true,
    commercialCanvassing: true,
    brokerageReporting: true,
    commercialLeasing: businessModel !== 'sales',
    headsOfTerms: businessModel !== 'sales',
    tenantManagement: false,
    commercialDocumentCentre: true,
  }

  return {
    businessModel: ['sales', 'leasing', 'sales_leasing'].includes(businessModel) ? businessModel : 'sales_leasing',
    selectedOrganisationUserIds: [...new Set(defaultSelectedUserIds)],
    invitedUsers: [],
    branchMode: normalizeLower(commercialWorkspace.branchMode) === 'dedicated' ? 'dedicated' : 'existing',
    dedicatedBranches: Array.isArray(commercialWorkspace.branchNames) && commercialWorkspace.branchNames.length
      ? commercialWorkspace.branchNames.map((name) => createBranchDraft({ name }))
      : [createBranchDraft({ name: 'Commercial HQ' })],
      featureSelections: {
      ...defaultFeatures,
      commercialLeasing: commercialWorkspace.leasingEnabled ?? defaultFeatures.commercialLeasing,
      headsOfTerms: commercialWorkspace.headsOfTermsEnabled ?? defaultFeatures.headsOfTerms,
      tenantManagement: commercialWorkspace.tenantManagementEnabled ?? defaultFeatures.tenantManagement,
      commercialCanvassing: commercialWorkspace.canvassingEnabled ?? defaultFeatures.commercialCanvassing,
      commercialDocumentCentre: commercialWorkspace.documentCentreEnabled ?? defaultFeatures.commercialDocumentCentre,
    },
    availableBranches: branches.length ? branches : buildFallbackBranches(context),
  }
}

function FeaturePill({ label }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#d8e7f6] bg-white px-3 py-1.5 text-sm font-medium text-[#15324f]">
      <Check size={14} className="text-emerald-600" />
      {label}
    </span>
  )
}

function StepBadge({ index, active, complete }) {
  return (
    <span
      className={[
        'flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold transition',
        complete
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : active
            ? 'border-[#bfd5ea] bg-[#eef5fb] text-[#15324f]'
            : 'border-slate-200 bg-white text-slate-400',
      ].join(' ')}
    >
      {complete ? <Check size={14} /> : index + 1}
    </span>
  )
}

function CommercialEnablementExperience({ accessState, onAccessGranted }) {
  const navigate = useNavigate()
  const [setupState, setSetupState] = useState({ loading: true, error: '', context: null, users: [], branches: [] })
  const [wizardOpen, setWizardOpen] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [draft, setDraft] = useState(null)
  const [actionState, setActionState] = useState({ saving: false, error: '', completion: null, selfActivating: false })
  const [requestState, setRequestState] = useState({
    loading: false,
    reminding: false,
    error: '',
    success: false,
    reminderSuccess: false,
    reusedExistingRequest: false,
    reviewerCount: 0,
    emailCount: 0,
  })
  const [inviteFormOpen, setInviteFormOpen] = useState(false)
  const [inviteState, setInviteState] = useState({ saving: false, error: '', message: '' })
  const [inviteForm, setInviteForm] = useState({ firstName: '', lastName: '', email: '', role: 'agent' })

  useEffect(() => {
    let cancelled = false

    async function loadSetupState() {
      try {
        setSetupState((previous) => ({ ...previous, loading: true, error: '' }))
        const [context, users, branches] = await Promise.all([
          fetchOrganisationSettings().catch(() => null),
          listOrganisationUsers().catch(() => []),
          getBranches().catch(() => []),
        ])

        if (cancelled) return
        const resolvedBranches = (branches || []).length
          ? branches.map((branch) => ({
            id: normalizeText(branch.id),
            name: normalizeText(branch.name),
            location: normalizeText(branch.location),
            managerName: normalizeText(branch.principalName || branch.managerName),
          }))
          : buildFallbackBranches(context)

        setSetupState({
          loading: false,
          error: '',
          context,
          users: (users || []).filter((user) => normalizeLower(user.status) !== 'deactivated'),
          branches: resolvedBranches,
        })
      } catch (error) {
        if (!cancelled) {
          setSetupState({
            loading: false,
            error: formatCommercialError(error, 'Commercial setup options could not be loaded.'),
            context: null,
            users: [],
            branches: [],
          })
        }
      }
    }

    void loadSetupState()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!setupState.loading && !draft) {
      setDraft(buildDefaultDraft({
        context: setupState.context,
        users: setupState.users,
        branches: setupState.branches,
      }))
    }
  }, [draft, setupState])

  useEffect(() => {
    if (stepIndex === 1) {
      setInviteFormOpen(true)
    }
  }, [stepIndex])

  const canEnableCommercial = useMemo(() => {
    const membershipRole = normalizeLower(setupState.context?.membershipRole)
    const profileRole = normalizeLower(setupState.context?.profile?.role)
    return REVIEWER_ROLES.has(membershipRole) || REVIEWER_ROLES.has(profileRole)
  }, [setupState.context?.membershipRole, setupState.context?.profile?.role])

  const canSelfActivate = Boolean(accessState?.scope?.eligibleForCommercialSelfActivation)
  const activeStepLabel = WIZARD_STEPS[stepIndex] || WIZARD_STEPS[0]
  const selectedExistingUserCount = (draft?.selectedOrganisationUserIds || []).length
  const invitedUserCount = (draft?.invitedUsers || []).length
  const selectedUserCount = selectedExistingUserCount + invitedUserCount
  const enabledFeatureCount = Object.values(draft?.featureSelections || {}).filter(Boolean).length
  const branchCount = draft?.branchMode === 'dedicated'
    ? (draft?.dedicatedBranches || []).filter((branch) => normalizeText(branch.name)).length
    : (draft?.availableBranches || []).length

  function updateDraft(patch) {
    setDraft((previous) => ({ ...previous, ...patch }))
  }

  function updateFeature(key, enabled) {
    setDraft((previous) => ({
      ...previous,
      featureSelections: {
        ...(previous?.featureSelections || {}),
        [key]: enabled,
      },
    }))
  }

  function updateBusinessModel(value) {
    setDraft((previous) => ({
      ...previous,
      businessModel: value,
      featureSelections: {
        ...(previous?.featureSelections || {}),
        commercialListings: true,
        commercialPipeline: true,
        commercialCanvassing: true,
        brokerageReporting: true,
        commercialLeasing: value !== 'sales',
        headsOfTerms: value !== 'sales',
      },
    }))
  }

  function toggleUser(userRowId) {
    const safeUserRowId = normalizeText(userRowId)
    if (!safeUserRowId) return
    setDraft((previous) => {
      const selectedIds = new Set(previous?.selectedOrganisationUserIds || [])
      if (selectedIds.has(safeUserRowId)) {
        selectedIds.delete(safeUserRowId)
      } else {
        selectedIds.add(safeUserRowId)
      }
      return {
        ...previous,
        selectedOrganisationUserIds: [...selectedIds],
      }
    })
  }

  function addDedicatedBranch() {
    setDraft((previous) => ({
      ...previous,
      dedicatedBranches: [...(previous?.dedicatedBranches || []), createBranchDraft()],
    }))
  }

  function updateDedicatedBranch(branchId, key, value) {
    setDraft((previous) => ({
      ...previous,
      dedicatedBranches: (previous?.dedicatedBranches || []).map((branch) =>
        branch.id === branchId ? { ...branch, [key]: value } : branch,
      ),
    }))
  }

  function removeDedicatedBranch(branchId) {
    setDraft((previous) => {
      const nextBranches = (previous?.dedicatedBranches || []).filter((branch) => branch.id !== branchId)
      return {
        ...previous,
        dedicatedBranches: nextBranches.length ? nextBranches : [createBranchDraft()],
      }
    })
  }

  function validateCurrentStep() {
    if (!draft) return 'Commercial setup is still loading.'
    if (stepIndex === 0 && !normalizeText(draft.businessModel)) return 'Choose how your commercial business operates.'
    if (stepIndex === 1 && !(draft.selectedOrganisationUserIds || []).length && !(draft.invitedUsers || []).length) {
      return 'Select at least one user who should have access to Commercial.'
    }
    if (stepIndex === 2 && draft.branchMode === 'dedicated') {
      const hasBranchName = (draft.dedicatedBranches || []).some((branch) => normalizeText(branch.name))
      if (!hasBranchName) return 'Add at least one Commercial branch before continuing.'
    }
    return ''
  }

  function handleContinue() {
    const validationError = validateCurrentStep()
    if (validationError) {
      setActionState((previous) => ({ ...previous, error: validationError }))
      return
    }
    setActionState((previous) => ({ ...previous, error: '' }))
    setStepIndex((previous) => Math.min(previous + 1, WIZARD_STEPS.length - 1))
  }

  async function handleEnableCommercialWorkspace() {
    const validationError = validateCurrentStep()
    if (validationError) {
      setActionState((previous) => ({ ...previous, error: validationError }))
      return
    }

    try {
      setActionState({ saving: true, error: '', completion: null, selfActivating: false })
      const result = await enableCommercialWorkspaceForCurrentUser({
        businessModel: draft.businessModel,
        selectedOrganisationUserIds: draft.selectedOrganisationUserIds,
        branchMode: draft.branchMode,
        dedicatedBranches: draft.branchMode === 'dedicated' ? draft.dedicatedBranches : [],
        featureSelections: draft.featureSelections,
        invitedUsers: draft.invitedUsers,
      })
      setActionState({ saving: false, error: '', completion: result, selfActivating: false })
    } catch (error) {
      setActionState({
        saving: false,
        error: formatCommercialError(error, 'Commercial workspace could not be enabled right now.'),
        completion: null,
        selfActivating: false,
      })
    }
  }

  async function handleSelfActivate() {
    try {
      setActionState({ saving: false, error: '', completion: null, selfActivating: true })
      const scope = await activateCommercialWorkspaceForCurrentUser()
      if (!scope?.hasCommercialAccess) {
        throw new Error('Commercial access could not be confirmed for your account. Ask your principal to grant Commercial access from Settings > Users, then try again.')
      }
      onAccessGranted?.(scope)
      navigate('/commercial')
    } catch (error) {
      setActionState({
        saving: false,
        error: formatCommercialError(error, 'Commercial access could not be opened right now.'),
        completion: null,
        selfActivating: false,
      })
    }
  }

  async function handleRequestCommercialAccess() {
    try {
      setRequestState({
        loading: true,
        reminding: false,
        error: '',
        success: false,
        reminderSuccess: false,
        reusedExistingRequest: false,
        reviewerCount: 0,
        emailCount: 0,
      })
      const result = await requestCommercialAccessForCurrentUser()
      setRequestState({
        loading: false,
        reminding: false,
        error: '',
        success: true,
        reminderSuccess: false,
        reusedExistingRequest: Boolean(result?.reusedExistingRequest),
        reviewerCount: Number(result?.reviewerCount || 0),
        emailCount: Number(result?.notificationResult?.emailCount || 0),
      })
    } catch (error) {
      setRequestState((previous) => ({
        ...previous,
        loading: false,
        error: formatCommercialError(error, 'Commercial access could not be requested right now.'),
      }))
    }
  }

  async function handleRemindPrincipal() {
    try {
      setRequestState((previous) => ({ ...previous, reminding: true, error: '' }))
      const result = await remindCommercialAccessReviewersForCurrentUser()
      setRequestState((previous) => ({
        ...previous,
        reminding: false,
        success: true,
        reminderSuccess: true,
        reusedExistingRequest: true,
        reviewerCount: Number(result?.reviewerCount || 0),
        emailCount: Number(result?.notificationResult?.emailCount || 0),
      }))
    } catch (error) {
      setRequestState((previous) => ({
        ...previous,
        reminding: false,
        error: formatCommercialError(error, 'We could not send a Commercial reminder right now.'),
      }))
    }
  }

  async function handleInviteCommercialUser(event) {
    event.preventDefault()
    const email = normalizeEmail(inviteForm.email)
    if (!email) {
      setInviteState({ saving: false, error: 'Enter an email address before sending the invite.', message: '' })
      return
    }

    try {
      setInviteState({ saving: true, error: '', message: '' })
      const inviteResult = await createWorkspaceUserInvite({
        firstName: inviteForm.firstName,
        lastName: inviteForm.lastName,
        email,
        role: inviteForm.role,
        source: 'commercial_workspace_enablement',
      })

      setDraft((previous) => {
        const inviteeName = [normalizeText(inviteForm.firstName), normalizeText(inviteForm.lastName)].filter(Boolean).join(' ') || email
        const nextInvitedUsers = [
          ...(previous?.invitedUsers || []).filter((invite) => normalizeEmail(invite.email) !== email),
          { email, fullName: inviteeName },
        ]
        return {
          ...previous,
          invitedUsers: nextInvitedUsers,
        }
      })

      setInviteForm({ firstName: '', lastName: '', email: '', role: 'agent' })
      setInviteState({
        saving: false,
        error: '',
        message: inviteResult.reusedExistingInvite ? 'Existing invite resent through the usual workspace invite flow.' : 'Commercial user invited through the usual workspace invite flow.',
      })
    } catch (error) {
      setInviteState({
        saving: false,
        error: formatCommercialError(error, 'Commercial invite could not be sent right now.'),
        message: '',
      })
    }
  }

  if (accessState?.loading || setupState.loading || !draft) {
    return (
      <section className="flex min-h-full items-center justify-center bg-[#f6f8fb] px-4 py-10 text-[#102236]">
        <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Commercial workspace</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">Preparing your Commercial workspace</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">Loading users, branches, and workspace preferences for setup.</p>
        </div>
      </section>
    )
  }

  if (actionState.completion) {
    return (
      <section className="flex min-h-full items-center justify-center bg-[#f6f8fb] px-4 py-10 text-[#102236]">
        <div className="w-full max-w-2xl rounded-[32px] border border-[#dbe6f2] bg-white p-8 shadow-[0_28px_80px_rgba(15,23,42,0.08)] sm:p-10">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-[20px] bg-emerald-50 text-emerald-700">
            <CheckCircle2 size={24} />
          </span>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Commercial workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">Commercial Workspace Ready</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500">
            Your organisation now has access to Commercial. Commercial users can immediately begin creating listings, mandates, and transactions.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {actionState.completion.settings?.enabledFeatures?.map((featureKey) => (
              <FeaturePill key={featureKey} label={FEATURE_LABELS[featureKey] || featureKey} />
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                onAccessGranted?.(actionState.completion.scope)
                navigate('/commercial')
              }}
              className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#102b46] px-5 text-sm font-semibold text-white transition hover:bg-[#163a5b]"
            >
              Go To Commercial
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-[#15324f] transition hover:border-[#bfd5ea] hover:text-[#0c4a7d]"
            >
              <Home size={16} />
              Back to Residential
            </button>
          </div>
        </div>
      </section>
    )
  }

  if (accessState?.reason === 'platform_install_missing') {
    return (
      <section className="flex min-h-full items-center justify-center bg-[#f6f8fb] px-4 py-10 text-[#102236]">
        <div className="w-full max-w-2xl rounded-[32px] border border-[#dbe6f2] bg-white p-8 shadow-[0_28px_80px_rgba(15,23,42,0.08)] sm:p-10">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-[20px] bg-amber-50 text-amber-700">
            <Bell size={24} />
          </span>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Commercial workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">Commercial isn't installed on this environment yet</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500">
            Selecting a mixed agency type updates your organisation settings, but it cannot activate Commercial until the Commercial backend schema is available on this deployed environment.
          </p>
          <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            {accessState.message || "Commercial couldn't be enabled right now. Please retry once the latest Commercial workspace update is available on this environment."}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-[#15324f] transition hover:border-[#bfd5ea] hover:text-[#0c4a7d]"
            >
              <Home size={16} />
              Back to Residential
            </button>
          </div>
        </div>
      </section>
    )
  }

  if (canSelfActivate || !canEnableCommercial) {
    const accessTitle = canSelfActivate
      ? 'Commercial Workspace'
      : 'Commercial Workspace access'

    return (
      <section className="flex min-h-full items-center justify-center bg-[#f6f8fb] px-4 py-10 text-[#102236]">
        <div className="w-full max-w-2xl rounded-[32px] border border-[#dbe6f2] bg-white p-8 shadow-[0_28px_80px_rgba(15,23,42,0.08)] sm:p-10">
          <span className={`inline-flex h-14 w-14 items-center justify-center rounded-[20px] ${canSelfActivate ? 'bg-[#eef5fb] text-[#15324f]' : 'bg-amber-50 text-amber-700'}`}>
            {canSelfActivate ? <Building2 size={24} /> : <Bell size={24} />}
          </span>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Commercial workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">{accessTitle}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500">
            {canSelfActivate
              ? 'Commercial has already been prepared for this organisation. Open the workspace to start working with listings, leasing, reporting, and brokerage workflows.'
              : 'Commercial is available for this organisation, but your account still needs permission before you can open it. Ask your principal for access and we will notify them right away.'}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {['Commercial Listings', 'Commercial Leasing', 'Heads of Terms', 'Commercial Reporting'].map((label) => (
              <FeaturePill key={label} label={label} />
            ))}
          </div>

          {actionState.error ? (
            <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
              {actionState.error}
            </p>
          ) : null}
          {requestState.error ? (
            <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
              {requestState.error}
            </p>
          ) : null}
          {requestState.success ? (
            <p className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
              {requestState.reusedExistingRequest
                ? requestState.reminderSuccess
                  ? requestState.reviewerCount > 0
                    ? `Reminder sent. ${requestState.reviewerCount === 1 ? 'Principal' : `${requestState.reviewerCount} principals`} notified${requestState.emailCount ? requestState.emailCount === 1 ? ' by email too' : `, ${requestState.emailCount} by email` : ''}.`
                    : 'Reminder sent. Ask your principal to approve it from Settings > Users.'
                  : 'Your Commercial access request is already waiting for review.'
                : requestState.reviewerCount > 0
                  ? requestState.reviewerCount === 1
                    ? `Commercial access request sent. Principal notified${requestState.emailCount ? ' by email too' : ''}.`
                    : `Commercial access request sent. ${requestState.reviewerCount} principals notified${requestState.emailCount ? `, ${requestState.emailCount} by email` : ''}.`
                  : 'Commercial access request sent to your principal.'}
            </p>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {canSelfActivate ? (
              <button
                type="button"
                onClick={handleSelfActivate}
                disabled={actionState.selfActivating}
                className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#102b46] px-5 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionState.selfActivating ? <Loader2 size={16} className="animate-spin" /> : <Building2 size={16} />}
                Open Commercial Workspace
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRequestCommercialAccess}
                disabled={requestState.loading || requestState.reminding}
                className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#102b46] px-5 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {requestState.loading ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
                Request Commercial access
              </button>
            )}
            {!canSelfActivate && requestState.reusedExistingRequest ? (
              <button
                type="button"
                onClick={handleRemindPrincipal}
                disabled={requestState.loading || requestState.reminding}
                className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-[#15324f] transition hover:border-[#bfd5ea] hover:text-[#0c4a7d] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {requestState.reminding ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
                Remind principal
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-[#15324f] transition hover:border-[#bfd5ea] hover:text-[#0c4a7d]"
            >
              <Home size={16} />
              Back to Residential
            </button>
          </div>
        </div>
      </section>
    )
  }

  const validationError = validateCurrentStep()

  return (
    <section className="h-full overflow-y-auto bg-[radial-gradient(circle_at_top_left,_rgba(14,89,145,0.08),_transparent_34%),linear-gradient(180deg,_#f8fbfe_0%,_#f3f7fb_100%)] px-4 py-4 text-[#102236] sm:px-6 sm:py-5">
      <div className="mx-auto flex min-h-full max-w-[1320px] flex-col">
        <div className="flex min-h-full flex-col rounded-[34px] border border-[#dbe6f2] bg-white p-6 shadow-[0_28px_80px_rgba(15,23,42,0.08)] sm:p-7 lg:p-7">
          {!wizardOpen ? (
            <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Commercial workspace</p>
                    <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em] text-[#102236]">Expand your CRM into Commercial.</h1>
                    <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500">
                      Enable commercial property sales and leasing inside the same organisation, using the same users, branches, and governance you already manage today.
                    </p>
                  </div>
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] bg-[#eef5fb] text-[#0c4a7d]">
                    <Sparkles size={20} />
                  </span>
                </div>

                <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    'Commercial Listings',
                    'Commercial Leasing',
                    'Heads of Terms',
                    'Commercial Pipeline',
                    'Commercial Reporting',
                    'Brokerage Management',
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3 rounded-2xl border border-[#e5edf6] bg-[#fbfdff] px-4 py-3 text-sm font-medium text-[#15324f]">
                      <CheckCircle2 size={18} className="text-emerald-600" />
                      {item}
                    </div>
                  ))}
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-4 rounded-[24px] border border-[#e7eef6] bg-[#f8fbfe] px-5 py-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Estimated setup time</p>
                    <p className="mt-1 text-lg font-semibold text-[#102236]">5 minutes</p>
                  </div>
                  <div className="h-10 w-px bg-[#dbe6f2]" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Existing users</p>
                    <p className="mt-1 text-lg font-semibold text-[#102236]">{setupState.users.length}</p>
                  </div>
                  <div className="h-10 w-px bg-[#dbe6f2]" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Existing branches</p>
                    <p className="mt-1 text-lg font-semibold text-[#102236]">{setupState.branches.length}</p>
                  </div>
                </div>

                {setupState.error ? (
                  <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                    {setupState.error}
                  </p>
                ) : null}
                {actionState.error ? (
                  <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                    {actionState.error}
                  </p>
                ) : null}

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setWizardOpen(true)
                      setActionState((previous) => ({ ...previous, error: '' }))
                    }}
                    className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#102b46] px-5 text-sm font-semibold text-white transition hover:bg-[#163a5b]"
                  >
                    Enable Commercial
                    <ChevronRight size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/dashboard')}
                    className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-[#15324f] transition hover:border-[#bfd5ea] hover:text-[#0c4a7d]"
                  >
                    <Home size={16} />
                    Back to Residential
                  </button>
                </div>
            </>
          ) : (
            <>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (stepIndex === 0) {
                        setWizardOpen(false)
                        return
                      }
                      setStepIndex((previous) => Math.max(previous - 1, 0))
                    }}
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-[#15324f] transition hover:border-[#bfd5ea] hover:text-[#0c4a7d]"
                  >
                    <ArrowLeft size={15} />
                    {stepIndex === 0 ? 'Back' : 'Previous'}
                  </button>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Step {stepIndex + 1} of {WIZARD_STEPS.length}
                  </span>
                </div>

                <div className="mt-6 grid gap-2 md:grid-cols-5">
                  {WIZARD_STEPS.map((step, index) => {
                    const active = index === stepIndex
                    const complete = index < stepIndex
                    const shortLabel = WIZARD_STEP_TITLES[index] || step

                    return (
                      <div
                        key={step}
                        className={[
                          'flex min-w-0 items-center gap-3 rounded-[22px] border px-3 py-3 transition',
                          complete
                            ? 'border-emerald-200 bg-emerald-50/70'
                            : active
                              ? 'border-[#bfd5ea] bg-[#eef5fb] shadow-[0_10px_24px_rgba(15,23,42,0.04)]'
                              : 'border-slate-200 bg-white',
                        ].join(' ')}
                      >
                        <StepBadge index={index} active={active} complete={complete} />
                        <div className="min-w-0">
                          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Step {index + 1}</p>
                          <p className={`mt-1 truncate text-sm font-medium ${active ? 'text-[#102236]' : 'text-slate-500'}`}>{shortLabel}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-7">
                  {stepIndex === 0 ? (
                    <div className="space-y-5">
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:items-end">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Step 1</p>
                          <h2 className="mt-2 max-w-[13ch] text-[2.35rem] font-semibold leading-[0.98] tracking-[-0.06em] text-[#102236] sm:text-[2.6rem] lg:max-w-[12ch] lg:text-[2.9rem]">
                            How does your commercial business operate?
                          </h2>
                        </div>
                        <p className="max-w-md text-sm leading-7 text-slate-500 lg:justify-self-end">
                          Choose the operating model that matches how your team works today. You can adjust it later.
                        </p>
                      </div>

                      <div className="grid gap-3 lg:grid-cols-3">
                        {BUSINESS_MODEL_OPTIONS.map((option) => {
                          const active = draft.businessModel === option.value
                          const featured = option.value === 'sales_leasing'
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => updateBusinessModel(option.value)}
                              className={[
                                'group flex min-h-[180px] flex-col justify-between rounded-[26px] border px-5 py-5 text-left transition',
                                active
                                  ? 'border-[#b8d0e7] bg-[#f4f9fe] shadow-[0_18px_40px_rgba(15,23,42,0.06)] ring-1 ring-inset ring-[#d9e7f3]'
                                  : 'border-[#e5edf6] bg-white hover:border-[#cfddea] hover:bg-[#fcfdff]',
                              ].join(' ')}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-[1.06rem] font-semibold tracking-[-0.03em] text-[#102236]">{option.label}</p>
                                    {featured ? (
                                      <span className="rounded-full bg-[#e9f3fb] px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#0c4a7d]">
                                        Recommended
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="mt-3 text-sm leading-6 text-slate-500">{option.description}</p>
                                </div>
                                <span
                                  className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${
                                    active
                                      ? 'border-[#0c4a7d] bg-[#0c4a7d] text-white shadow-[0_6px_14px_rgba(12,74,125,0.25)]'
                                      : 'border-slate-300 bg-white text-transparent group-hover:border-[#bfd5ea]'
                                  }`}
                                >
                                  <Check size={14} />
                                </span>
                              </div>
                              <div className="mt-5 flex items-center justify-between gap-4">
                                <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${active ? 'text-[#0c4a7d]' : 'text-slate-400'}`}>
                                  {active ? 'Selected' : 'Tap to choose'}
                                </p>
                                {active ? (
                                  <span className="rounded-full bg-[#0c4a7d] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white">
                                    Active
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  {stepIndex === 1 ? (
                    <div className="space-y-5">
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-end">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Step 2</p>
                          <h2 className="mt-2 max-w-[13ch] text-[2.2rem] font-semibold leading-[1] tracking-[-0.055em] text-[#102236] sm:text-[2.5rem] lg:max-w-[12ch] lg:text-[2.75rem]">
                            Who should have access to Commercial?
                          </h2>
                        </div>
                        <div className="max-w-md lg:justify-self-end">
                          <p className="text-sm leading-7 text-slate-500">Select existing users or invite new commercial team members.</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="rounded-full border border-[#d8e7f6] bg-[#f4f9fe] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#0c4a7d]">
                              {selectedExistingUserCount} selected
                            </span>
                            {invitedUserCount ? (
                              <span className="rounded-full border border-[#d8e7f6] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                {invitedUserCount} invited
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.82fr)]">
                        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                          {(setupState.users || []).map((user) => {
                            const checked = (draft.selectedOrganisationUserIds || []).includes(user.id)
                            return (
                              <label
                                key={user.id}
                                className={[
                                  'group flex min-h-[168px] cursor-pointer flex-col justify-between rounded-[24px] border px-5 py-5 transition',
                                  checked
                                    ? 'border-[#b8d0e7] bg-[#f4f9fe] shadow-[0_18px_36px_rgba(15,23,42,0.05)] ring-1 ring-inset ring-[#d9e7f3]'
                                    : 'border-[#e5edf6] bg-white hover:border-[#cfddea] hover:bg-[#fcfdff]',
                                ].join(' ')}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleUser(user.id)}
                                  className="sr-only"
                                />
                                <div className="flex items-start justify-between gap-4">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[1.03rem] font-semibold tracking-[-0.03em] text-[#102236]">{formatUserName(user)}</p>
                                    <p className="mt-2 break-words text-sm leading-6 text-slate-500">{user.email}</p>
                                  </div>
                                  <span
                                    className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${
                                      checked
                                        ? 'border-[#0c4a7d] bg-[#0c4a7d] text-white shadow-[0_6px_14px_rgba(12,74,125,0.25)]'
                                        : 'border-slate-300 bg-white text-transparent group-hover:border-[#bfd5ea]'
                                    }`}
                                  >
                                    <Check size={14} />
                                  </span>
                                </div>
                                <div className="mt-5 flex items-center justify-between gap-4">
                                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                    {formatUserRole(user)} · {normalizeText(user.status || 'active')}
                                  </p>
                                  {checked ? (
                                    <span className="rounded-full bg-[#0c4a7d] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white">
                                      Selected
                                    </span>
                                  ) : null}
                                </div>
                              </label>
                            )
                          })}
                        </div>

                        <div className="rounded-[26px] border border-dashed border-[#d4e1ee] bg-[#fbfdff] p-5">
                          <div className="rounded-[22px] border border-[#dbe7f3] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.03)]">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <button
                                  type="button"
                                  onClick={() => setInviteFormOpen((value) => !value)}
                                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#0c4a7d]"
                                >
                                  <MailPlus size={16} />
                                  Invite Commercial User
                                </button>
                                <p className="mt-2 text-sm leading-6 text-slate-500">Use the existing workspace invite flow so the team receives the same onboarding experience.</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setInviteFormOpen((value) => !value)}
                                className="rounded-full border border-[#d8e7f6] bg-[#f4f9fe] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#0c4a7d]"
                              >
                                {inviteFormOpen ? 'Collapse' : 'Open'}
                              </button>
                            </div>

                            {inviteFormOpen ? (
                              <form className="mt-5 grid gap-3" onSubmit={handleInviteCommercialUser}>
                              <label className="grid gap-2 text-sm text-slate-500">
                                First name
                                <input
                                  value={inviteForm.firstName}
                                  onChange={(event) => setInviteForm((previous) => ({ ...previous, firstName: event.target.value }))}
                                  className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-[#102236] outline-none transition focus:border-[#bfd5ea]"
                                />
                              </label>
                              <label className="grid gap-2 text-sm text-slate-500">
                                Last name
                                <input
                                  value={inviteForm.lastName}
                                  onChange={(event) => setInviteForm((previous) => ({ ...previous, lastName: event.target.value }))}
                                  className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-[#102236] outline-none transition focus:border-[#bfd5ea]"
                                />
                              </label>
                              <label className="grid gap-2 text-sm text-slate-500">
                                Email
                                <input
                                  value={inviteForm.email}
                                  onChange={(event) => setInviteForm((previous) => ({ ...previous, email: event.target.value }))}
                                  className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-[#102236] outline-none transition focus:border-[#bfd5ea]"
                                />
                              </label>
                              <label className="grid gap-2 text-sm text-slate-500">
                                Role
                                <select
                                  value={inviteForm.role}
                                  onChange={(event) => setInviteForm((previous) => ({ ...previous, role: event.target.value }))}
                                  className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-[#102236] outline-none transition focus:border-[#bfd5ea]"
                                >
                                  {COMMERCIAL_ROLE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button
                                type="submit"
                                disabled={inviteState.saving}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {inviteState.saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                Send invite
                              </button>
                              </form>
                            ) : null}
                          </div>

                          {inviteState.error ? (
                            <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                              {inviteState.error}
                            </p>
                          ) : null}
                          {inviteState.message ? (
                            <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
                              {inviteState.message}
                            </p>
                          ) : null}

                          {(draft.invitedUsers || []).length ? (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {draft.invitedUsers.map((invite) => (
                                <span key={invite.email} className="inline-flex items-center gap-2 rounded-full border border-[#d8e7f6] bg-white px-3 py-1.5 text-sm font-medium text-[#15324f]">
                                  <MailPlus size={14} className="text-[#0c4a7d]" />
                                  {invite.fullName || invite.email}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {stepIndex === 2 ? (
                    <div className="space-y-6">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Step 3</p>
                        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">How would you like to structure Commercial?</h2>
                      </div>

                      <div className="grid gap-3">
                        <button
                          type="button"
                          onClick={() => updateDraft({ branchMode: 'existing' })}
                          className={`rounded-[24px] border px-5 py-5 text-left transition ${draft.branchMode === 'existing' ? 'border-[#bfd5ea] bg-[#f3f9ff]' : 'border-[#e5edf6] bg-white hover:border-[#d2dfed]'}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-lg font-semibold text-[#102236]">Use Existing Branches</p>
                              <p className="mt-2 text-sm leading-6 text-slate-500">Recommended. Commercial operates under your current branch structure.</p>
                              <div className="mt-4 flex flex-wrap gap-2">
                                {(draft.availableBranches || []).length ? (
                                  draft.availableBranches.map((branch) => <FeaturePill key={branch.id || branch.name} label={branch.name} />)
                                ) : (
                                  <span className="text-sm text-slate-500">No branches loaded yet.</span>
                                )}
                              </div>
                            </div>
                            <span className={`mt-1 flex h-6 w-6 items-center justify-center rounded-full border ${draft.branchMode === 'existing' ? 'border-[#0c4a7d] bg-[#0c4a7d] text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                              <Check size={14} />
                            </span>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => updateDraft({ branchMode: 'dedicated' })}
                          className={`rounded-[24px] border px-5 py-5 text-left transition ${draft.branchMode === 'dedicated' ? 'border-[#bfd5ea] bg-[#f3f9ff]' : 'border-[#e5edf6] bg-white hover:border-[#d2dfed]'}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-lg font-semibold text-[#102236]">Create Dedicated Commercial Branches</p>
                              <p className="mt-2 text-sm leading-6 text-slate-500">Create Commercial-specific branches if you want a separate operating structure.</p>
                            </div>
                            <span className={`mt-1 flex h-6 w-6 items-center justify-center rounded-full border ${draft.branchMode === 'dedicated' ? 'border-[#0c4a7d] bg-[#0c4a7d] text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                              <Check size={14} />
                            </span>
                          </div>
                        </button>
                      </div>

                      {draft.branchMode === 'dedicated' ? (
                        <div className="space-y-3 rounded-[24px] border border-[#e5edf6] bg-[#fbfdff] p-5">
                          {(draft.dedicatedBranches || []).map((branch) => (
                            <div key={branch.id} className="grid gap-3 rounded-2xl border border-[#e7eef6] bg-white p-4 sm:grid-cols-3">
                              <label className="grid gap-2 text-sm text-slate-500">
                                Branch name
                                <input
                                  value={branch.name}
                                  onChange={(event) => updateDedicatedBranch(branch.id, 'name', event.target.value)}
                                  className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-[#102236] outline-none transition focus:border-[#bfd5ea]"
                                />
                              </label>
                              <label className="grid gap-2 text-sm text-slate-500">
                                Location
                                <input
                                  value={branch.location}
                                  onChange={(event) => updateDedicatedBranch(branch.id, 'location', event.target.value)}
                                  className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-[#102236] outline-none transition focus:border-[#bfd5ea]"
                                />
                              </label>
                              <div className="flex items-end gap-3">
                                <label className="grid flex-1 gap-2 text-sm text-slate-500">
                                  Branch manager
                                  <input
                                    value={branch.managerName}
                                    onChange={(event) => updateDedicatedBranch(branch.id, 'managerName', event.target.value)}
                                    className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-[#102236] outline-none transition focus:border-[#bfd5ea]"
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={() => removeDedicatedBranch(branch.id)}
                                  className="inline-flex min-h-11 items-center rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-[#15324f] transition hover:border-[#bfd5ea] hover:text-[#0c4a7d]"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={addDedicatedBranch}
                            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#15324f] transition hover:border-[#bfd5ea] hover:text-[#0c4a7d]"
                          >
                            <Plus size={16} />
                            Add Branch
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {stepIndex === 3 ? (
                    <div className="space-y-6">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Step 4</p>
                        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">Select Commercial Features</h2>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        {[
                          { key: 'commercialListings', description: 'Keep stock, mandates, and marketing inventory structured.', locked: true },
                          { key: 'commercialPipeline', description: 'Run the commercial pipeline across listings, viewings, and deals.', locked: true },
                          { key: 'commercialCanvassing', description: 'Track canvassing and prospecting work before records enter the pipeline.', locked: true },
                          { key: 'brokerageReporting', description: 'Measure brokerage performance, activity, and pipeline health.', locked: true },
                          { key: 'commercialLeasing', description: 'Capture leasing demand, occupiers, and vacancy journeys.' },
                          { key: 'headsOfTerms', description: 'Prepare and track Heads of Terms before lease finalisation.' },
                          { key: 'tenantManagement', description: 'Maintain tenant relationships and occupier operations.' },
                          { key: 'commercialDocumentCentre', description: 'Store commercial documents, compliance files, and working packs.' },
                        ].map((feature) => {
                          const enabled = Boolean(draft.featureSelections?.[feature.key])
                          return (
                            <label key={feature.key} className={`flex cursor-pointer gap-4 rounded-[24px] border px-4 py-4 transition ${enabled ? 'border-[#bfd5ea] bg-[#f3f9ff]' : 'border-[#e5edf6] bg-white hover:border-[#d2dfed]'}`}>
                              <input
                                type="checkbox"
                                checked={enabled}
                                disabled={feature.locked}
                                onChange={(event) => updateFeature(feature.key, event.target.checked)}
                                className="mt-1 h-4 w-4 rounded border-slate-300 text-[#0c4a7d] focus:ring-[#0c4a7d]"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-[#102236]">{FEATURE_LABELS[feature.key]}</p>
                                  {feature.locked ? (
                                    <span className="rounded-full bg-[#e9f3fb] px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#0c4a7d]">
                                      Default
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-2 text-sm leading-6 text-slate-500">{feature.description}</p>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  {stepIndex === 4 ? (
                    <div className="space-y-6">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Step 5</p>
                        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">Review & Confirm</h2>
                      </div>

                      <div className="grid gap-4 rounded-[28px] border border-[#e5edf6] bg-[#fbfdff] p-5 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/70 bg-white p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Commercial Workspace</p>
                          <p className="mt-2 text-sm font-semibold text-[#102236]">Business Model</p>
                          <p className="mt-1 text-sm text-slate-500">{formatBusinessModel(draft.businessModel)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/70 bg-white p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Users</p>
                          <p className="mt-2 text-sm font-semibold text-[#102236]">{selectedUserCount}</p>
                          <p className="mt-1 text-sm text-slate-500">Existing team members plus invited Commercial users.</p>
                        </div>
                        <div className="rounded-2xl border border-white/70 bg-white p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Branches</p>
                          <p className="mt-2 text-sm font-semibold text-[#102236]">{draft.branchMode === 'existing' ? 'Use Existing' : `${branchCount} dedicated`}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            {draft.branchMode === 'existing'
                              ? 'Commercial will run inside the current branch structure.'
                              : 'Commercial will create its own branch structure inside this organisation.'}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/70 bg-white p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Features</p>
                          <p className="mt-2 text-sm font-semibold text-[#102236]">{enabledFeatureCount} enabled</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {Object.entries(draft.featureSelections)
                              .filter(([, enabled]) => Boolean(enabled))
                              .map(([featureKey]) => (
                                <FeaturePill key={featureKey} label={FEATURE_LABELS[featureKey]} />
                              ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {actionState.error ? (
                  <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                    {actionState.error}
                  </p>
                ) : null}

                <div className="mt-8 border-t border-slate-200/80 pt-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className={`text-sm leading-6 ${validationError && stepIndex < WIZARD_STEPS.length - 1 ? 'text-rose-600' : 'text-slate-500'}`}>
                      {validationError && stepIndex < WIZARD_STEPS.length - 1 ? validationError : `You're on ${activeStepLabel}.`}
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      {stepIndex < WIZARD_STEPS.length - 1 ? (
                        <button
                          type="button"
                          onClick={handleContinue}
                          className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#102b46] px-5 text-sm font-semibold text-white transition hover:bg-[#163a5b]"
                        >
                          Continue
                          <ChevronRight size={16} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleEnableCommercialWorkspace}
                          disabled={actionState.saving}
                          className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#102b46] px-5 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actionState.saving ? <Loader2 size={16} className="animate-spin" /> : <Building2 size={16} />}
                          Enable Commercial Workspace
                        </button>
                      )}
                    </div>
                  </div>
                </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

export default CommercialEnablementExperience
