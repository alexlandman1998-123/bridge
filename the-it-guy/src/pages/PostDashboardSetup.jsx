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
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthSession } from '../context/AuthSessionContext'
import { useWorkspace } from '../context/WorkspaceContext'
import OnboardingProgressLayout from '../components/onboarding/OnboardingProgressLayout'
import { APP_ROLE_LABELS } from '../lib/roles'
import { ONBOARDING_STATUSES, ONBOARDING_STEPS } from '../constants/onboardingStatuses'
import { SIGNUP_WORKSPACE_ACTIONS } from '../constants/signupIntents'
import { WORKSPACE_TYPES } from '../constants/workspaceTypes'
import {
  AGENCY_BUSINESS_FOCUS_OPTIONS,
  AGENCY_INVITE_ROLE_OPTIONS,
  AGENCY_TYPE_OPTIONS,
  buildDefaultAgencyOnboarding,
  createAgencyBranchDraft,
  createAgencyInviteDraft,
  mergeAgencyOnboardingDraft,
} from '../lib/agencyOnboarding'
import {
  completeAgencyOnboarding,
  uploadOrganisationBrandingAsset,
} from '../lib/settingsApi'
import {
  createWorkspaceFromIntent,
  joinWorkspaceFromInvite,
  requestWorkspaceAccess,
} from '../services/workspaceService'

const AGENCY_SETUP_STEPS = [
  { key: 'organisation', label: 'Organisation' },
  { key: 'branches', label: 'Branches' },
  { key: 'branding', label: 'Branding' },
  { key: 'team', label: 'Team' },
  { key: 'review', label: 'Review' },
]

function normalizeText(value) {
  return String(value || '').trim()
}

function getWorkspaceNoun(workspaceType = '') {
  if (workspaceType === WORKSPACE_TYPES.agency) return 'agency'
  if (workspaceType === WORKSPACE_TYPES.developerCompany) return 'developer company'
  if (workspaceType === WORKSPACE_TYPES.attorneyFirm) return 'attorney firm'
  if (workspaceType === WORKSPACE_TYPES.bondOriginator) return 'bond originator business'
  return 'workspace'
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
    requestMessage: `Please approve my access to your ${workspaceNoun} on Bridge.`,
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
  return mergeAgencyOnboardingDraft(defaultDraft, {
    agencyInformation: {
      ...defaultDraft.agencyInformation,
      agencyName: companyName || defaultDraft.agencyInformation.agencyName,
      tradingName: companyName || defaultDraft.agencyInformation.tradingName,
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
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [request, setRequest] = useState(null)
  const [uploadingLogoTarget, setUploadingLogoTarget] = useState('')
  const workspaceNoun = getWorkspaceNoun(intent?.workspace_type)
  const canCreateWorkspace = intent?.workspace_action === SIGNUP_WORKSPACE_ACTIONS.createWorkspace
  const canJoinOrRequest = intent?.workspace_action === SIGNUP_WORKSPACE_ACTIONS.joinOrRequestWorkspace
  const canAcceptInvite = intent?.workspace_action === SIGNUP_WORKSPACE_ACTIONS.acceptInvite
  const intendedRole = normalizeText(intent?.intended_org_role)
  const isAgencyPrincipalSetup =
    canCreateWorkspace &&
    intent?.workspace_type === WORKSPACE_TYPES.agency &&
    ['owner', 'principal'].includes(intendedRole)
  const agencyCurrentStep = AGENCY_SETUP_STEPS[agencyStepIndex] || AGENCY_SETUP_STEPS[0]
  const pageTitle = useMemo(() => {
    if (isAgencyPrincipalSetup) return 'Set up your agency workspace'
    if (canCreateWorkspace) return `Create your ${workspaceNoun}`
    if (canAcceptInvite) return 'Accept your workspace invite'
    if (canJoinOrRequest) return `Join a ${workspaceNoun}`
    return 'Workspace setup'
  }, [canAcceptInvite, canCreateWorkspace, canJoinOrRequest, isAgencyPrincipalSetup, workspaceNoun])
  const pageDescription = isAgencyPrincipalSetup
    ? 'Create the operating profile your agents will enter: agency details, branches, branding, permissions, and team invitations.'
    : 'Bridge has your profile and signup path. The last step is creating or joining a real backend workspace so dashboard access is tied to an active membership.'

  useEffect(() => {
    setForm((previous) => ({
      ...getDefaultForm(intent, profile),
      ...previous,
    }))
    setAgencyDraft((previous) => mergeAgencyOnboardingDraft(getAgencyDraftDefaults(intent, profile), previous, profile))
  }, [intent, profile])

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
      refreshAuthState?.()
      setMessage(`${result.organisation?.displayName || result.organisation?.name || agencyDraft.agencyInformation.agencyName} is ready. Opening your dashboard...`)
      window.setTimeout(() => {
        navigate('/dashboard', { replace: true })
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
      setMessage('Invite accepted. Opening your workspace...')
      window.setTimeout(() => {
        navigate(getDashboardPath(intent?.app_role || baseRole), { replace: true })
      }, 500)
    } catch (inviteError) {
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
    if (!normalizeText(form.workspaceNameForRequest)) {
      setError('Enter the workspace or business name you need access to.')
      return
    }

    try {
      setSaving(true)
      setError('')
      setMessage('')
      const createdRequest = await requestWorkspaceAccess(intent, authState.user, {
        workspaceName: form.workspaceNameForRequest,
        message: form.requestMessage,
      })
      setRequest(createdRequest)
      refreshAuthState?.()
      setMessage('Access request sent. You will remain pending until an owner or admin approves it.')
    } catch (requestError) {
      setError(requestError?.message || 'Access request failed.')
    } finally {
      setSaving(false)
    }
  }

  const hasActiveMembership = activeMemberships.length > 0
  const hasPendingMembership = pendingMemberships.length > 0
  const hasSuspendedMembership = suspendedMemberships.length > 0
  const hasPendingOnboardingState = onboardingState?.onboardingStatus === ONBOARDING_STATUSES.workspacePendingApproval
  const branches = agencyDraft?.branchStructure?.branches || []
  const invites = agencyDraft?.invitations || []
  const agency = agencyDraft?.agencyInformation || {}
  const principal = agencyDraft?.principalInformation || {}
  const branding = agencyDraft?.branding || {}
  const inviteCount = invites.filter((invite) => normalizeText(invite.name || invite.email)).length
  const currentStepReady = resolveAgencyStepError(agencyCurrentStep.key, agencyDraft) ? 0 : 1
  const completedStepCount = Math.min(AGENCY_SETUP_STEPS.length, agencyStepIndex + currentStepReady)

  function renderAgencyStep() {
    if (agencyCurrentStep.key === 'organisation') {
      return (
        <div className="agency-setup-card">
          <SetupSectionHeader
            eyebrow="Foundation"
            title="Agency profile"
            copy="This becomes the legal and operational identity for the workspace."
            icon={Building2}
          />
          <div className="setup-field-grid">
            <SetupField label="Agency name">
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
          title="Create the agency workspace"
          copy="Bridge will create the organisation, save this setup, activate the principal account, and queue the team invitations."
          icon={CheckCircle2}
        />
        <div className="agency-review-grid">
          <div>
            <Building2 size={18} />
            <span>Agency</span>
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
            <strong>{branding.logoLight ? 'Logo uploaded' : 'Bridge fallback'}</strong>
            <small>{branding.brandColours?.primary || '#274C69'} primary</small>
          </div>
        </div>
      </div>
    )
  }

  return (
    <OnboardingProgressLayout
      title={pageTitle}
      description={pageDescription}
      activeStep={isAgencyPrincipalSetup ? agencyCurrentStep.key : onboardingState?.onboardingStep || ONBOARDING_STEPS.createOrJoinWorkspace}
      steps={isAgencyPrincipalSetup ? AGENCY_SETUP_STEPS : undefined}
    >
      {isAgencyPrincipalSetup ? (
        <form className="agency-setup-shell" onSubmit={handleAgencyStepSubmit}>
          <aside className="agency-setup-command">
            <div>
              <p className="agency-setup-kicker">Principal setup</p>
              <h2>{agency.agencyName || 'New agency'}</h2>
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
      ) : (
        <>
          {intent ? (
            <SetupStatusCard title="Signup path">
              <p>
                {APP_ROLE_LABELS[intent.app_role] || intent.app_role} · {workspaceNoun} ·{' '}
                {intent.intended_org_role.replace(/_/g, ' ')}
              </p>
            </SetupStatusCard>
          ) : (
            <SetupStatusCard title="Signup intent missing" tone="warning">
              <p>
                This looks like a legacy or interrupted account. Confirm your business type on the profile recovery
                screen before creating or joining a workspace.
              </p>
              <button type="button" className="header-secondary-cta mt-3" onClick={() => navigate('/onboarding/profile')}>
                Continue profile recovery
              </button>
            </SetupStatusCard>
          )}

          {hasActiveMembership ? (
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

          {hasPendingMembership || hasPendingOnboardingState || request ? (
            <SetupStatusCard title="Pending approval" tone="warning">
              <p>
                Your workspace access is pending. You cannot open protected dashboards until an owner, principal, partner,
                or manager approves your membership.
              </p>
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
            <form className="grid gap-4 rounded-[16px] border border-[#dde4ee] bg-white px-4 py-4" onSubmit={handleAcceptInvite}>
              <SetupStatusCard title="Invite acceptance">
                <p>Confirm the invite token and Bridge will create your active membership if the invite is valid.</p>
              </SetupStatusCard>
              <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                Invite token
                <input className="auth-input" value={form.inviteToken} onChange={(event) => updateField('inviteToken', event.target.value)} />
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="submit" className="header-primary-cta" disabled={saving}>
                  {saving ? 'Accepting invite...' : 'Accept invite'}
                </button>
              </div>
            </form>
          ) : null}

          {canJoinOrRequest ? (
            <div className="grid gap-4">
              <form className="grid gap-4 rounded-[16px] border border-[#dde4ee] bg-white px-4 py-4" onSubmit={handleAcceptInvite}>
                <SetupStatusCard title="Have an invite code?">
                  <p>Paste it here. Operational users can only enter a workspace through a valid invite or approval.</p>
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
                  <p>This creates a pending backend request. It does not create a workspace or unlock dashboards.</p>
                </SetupStatusCard>
                <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                  Workspace or business name
                  <input className="auth-input" value={form.workspaceNameForRequest} onChange={(event) => updateField('workspaceNameForRequest', event.target.value)} />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                  Message
                  <textarea className="auth-input min-h-[96px]" value={form.requestMessage} onChange={(event) => updateField('requestMessage', event.target.value)} />
                </label>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="submit" className="header-primary-cta" disabled={saving}>
                    {saving ? 'Sending request...' : 'Request access'}
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          {!intent && onboardingRequiredReason ? (
            <SetupStatusCard title="Repair state" tone="warning">
              <p>Current setup reason: {onboardingRequiredReason.replace(/_/g, ' ')}.</p>
            </SetupStatusCard>
          ) : null}

          {onboardingState?.recoveryReason ? (
            <SetupStatusCard title="Recovery required" tone="warning">
              <p>Bridge needs to repair: {onboardingState.recoveryReason.replace(/_/g, ' ')}.</p>
            </SetupStatusCard>
          ) : null}

          {message ? <p className="rounded-[12px] border border-[#cfe8d8] bg-[#effaf3] px-3 py-2 text-sm text-[#236340]">{message}</p> : null}
          {error ? <p className="rounded-[12px] border border-[#f2c8c4] bg-[#fff5f4] px-3 py-2 text-sm text-[#9f1c1c]">{error}</p> : null}
        </>
      )}
    </OnboardingProgressLayout>
  )
}
