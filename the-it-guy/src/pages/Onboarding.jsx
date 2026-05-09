import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Globe2,
  Landmark,
  ShieldCheck,
  Users,
  WalletCards,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  AGENCY_BUSINESS_FOCUS_OPTIONS,
  AGENCY_INVITE_ROLE_OPTIONS,
  AGENCY_ORGANISATION_TYPE_OPTIONS,
  AGENCY_TYPE_OPTIONS,
  buildDefaultAgencyOnboarding,
  createAgencyBranchDraft,
  createAgencyInviteDraft,
  mergeAgencyOnboardingDraft,
} from '../lib/agencyOnboarding'
import {
  completeAgencyOnboarding,
  completeInvitedMemberOnboarding,
  fetchAgencyOnboardingSettings,
  saveAgencyOnboardingDraft,
  uploadOrganisationBrandingAsset,
} from '../lib/settingsApi'
import { INTERNAL_APP_ROLES } from '../lib/roles'

const PENDING_ORG_INVITE_TOKEN_STORAGE_KEY = 'itg:pending-org-invite-token'
const ONBOARDING_BOOTSTRAP_TIMEOUT_MS = 15000

const AGENCY_STEPS = [
  { key: 'organisation_type', label: 'Organisation Type' },
  { key: 'agency_information', label: 'Agency Information' },
  { key: 'principal_information', label: 'Principal Information' },
  { key: 'branch_structure', label: 'Branch Structure' },
  { key: 'branding', label: 'Branding Setup' },
  { key: 'invite_agents', label: 'Invite Agents' },
  { key: 'review', label: 'Review & Complete' },
]

const ORGANISATION_TYPE_META = {
  agency: {
    icon: Building2,
    description: 'For estate agencies, brokerages, and property teams that need to manage agents, listings, leads, deals, and transactions in one place.',
  },
  developer: {
    icon: Landmark,
    description: 'For developers managing projects, units, sales teams, buyers, and transfer workflows.',
  },
  attorney: {
    icon: ShieldCheck,
    description: 'For conveyancers and legal teams managing transfer instructions, documents, clients, and registration workflows.',
  },
  bond_originator: {
    icon: WalletCards,
    description: 'For bond originators managing applications, buyers, banks, approvals, and finance workflows.',
  },
}

function parseAgentCount(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.trunc(parsed)
}

function splitFullName(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) {
    return { firstName: '', lastName: '' }
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

function resolveStepValidation(stepKey, draft) {
  const info = draft?.agencyInformation || {}
  const principal = draft?.principalInformation || {}
  const branches = draft?.branchStructure?.branches || []

  if (stepKey === 'organisation_type') {
    if (draft?.organisationType !== 'agency') {
      return 'Agency onboarding is currently enabled first. Please select Agency to continue.'
    }
  }

  if (stepKey === 'agency_information') {
    if (!String(info.agencyName || '').trim()) return 'Agency name is required.'
    if (!String(info.agencyType || '').trim()) return 'Agency type is required.'
    if (!String(info.businessFocus || '').trim()) return 'Business focus is required.'
    if (!String(info.mainOfficeNumber || '').trim()) return 'Main office number is required.'
    if (!String(info.mainEmailAddress || '').trim()) return 'Main email address is required.'
    if (!String(info.physicalAddress || '').trim()) return 'Physical address is required.'
    if (!String(info.province || '').trim()) return 'Province is required.'
    if (!String(info.country || '').trim()) return 'Country is required.'
  }

  if (stepKey === 'principal_information') {
    if (!String(principal.principalFullName || '').trim()) return 'Principal full name is required.'
    if (!String(principal.emailAddress || '').trim()) return 'Principal email address is required.'
    if (!String(principal.phoneNumber || '').trim()) return 'Principal phone number is required.'
    if (!String(principal.position || '').trim()) return 'Principal position is required.'
  }

  if (stepKey === 'branch_structure') {
    if (!branches.length) return 'At least one branch is required.'
    for (const branch of branches) {
      if (!String(branch.branchName || '').trim()) return 'Each branch requires a branch name.'
      if (!String(branch.officeLocation || '').trim()) return 'Each branch requires an office location.'
      if (!String(branch.branchManager || '').trim()) return 'Each branch requires a branch manager name.'
    }
  }

  if (stepKey === 'invite_agents') {
    const inviteRows = draft?.invitations || []
    const hasAnyInviteData = inviteRows.some((item) => String(item?.name || item?.email || '').trim())
    if (hasAnyInviteData) {
      for (const invite of inviteRows) {
        const hasRowData = String(invite?.name || invite?.email || '').trim()
        if (!hasRowData) continue
        if (!String(invite.name || '').trim()) return 'Each invite requires an agent name.'
        if (!String(invite.email || '').trim()) return 'Each invite requires an email address.'
      }
    }
  }

  return ''
}

function Onboarding() {
  const navigate = useNavigate()
  const { profile, profileLoading, onboardingCompleted, role, saveProfileDraft } = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [draft, setDraft] = useState(null)
  const [onboardingMode, setOnboardingMode] = useState('principal_setup')
  const [stepIndex, setStepIndex] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [uploadingLogoTarget, setUploadingLogoTarget] = useState('')
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0)
  const [invitedForm, setInvitedForm] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    ppraNumber: '',
  })
  const autosaveTimerRef = useRef(null)
  const latestDraftRevisionRef = useRef(0)

  useEffect(() => {
    let active = true
    const timeoutError = new Error('We couldn’t load your onboarding workspace in time. Please retry.')

    async function withTimeout(task) {
      let timeoutId = null
      try {
        return await Promise.race([
          task,
          new Promise((_, reject) => {
            timeoutId = window.setTimeout(() => reject(timeoutError), ONBOARDING_BOOTSTRAP_TIMEOUT_MS)
          }),
        ])
      } finally {
        if (timeoutId) {
          window.clearTimeout(timeoutId)
        }
      }
    }

    async function load() {
      try {
        console.debug('[Onboarding] bootstrap:start', { profileId: profile?.id || null, attempt: bootstrapAttempt + 1 })
        setLoading(true)
        setError('')
        const response = await withTimeout(fetchAgencyOnboardingSettings())
        if (!active) return
        setDraft(mergeAgencyOnboardingDraft(response.onboarding, {}, profile))
        setOnboardingMode(response?.onboardingMode === 'invited_member' ? 'invited_member' : 'principal_setup')
        setInvitedForm({
          firstName: String(profile?.firstName || '').trim(),
          lastName: String(profile?.lastName || '').trim(),
          phoneNumber: String(profile?.phoneNumber || '').trim(),
          ppraNumber: '',
        })
        setInitialized(true)
        console.debug('[Onboarding] bootstrap:success', {
          onboardingMode: response?.onboardingMode || 'principal_setup',
          persisted: Boolean(response?.persisted),
          profileId: profile?.id || null,
        })
      } catch (loadError) {
        if (!active) return
        console.error('[Onboarding] bootstrap:failed', loadError)
        setError(loadError?.message || 'Unable to load onboarding flow.')
        setDraft(null)
        setInitialized(false)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      active = false
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current)
      }
    }
  }, [bootstrapAttempt, profile])

  useEffect(() => {
    if (!initialized || !dirty || !draft) return
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current)
    }

    const revisionAtSchedule = latestDraftRevisionRef.current
    autosaveTimerRef.current = window.setTimeout(async () => {
      try {
        setSaving(true)
        setError('')
        await saveAgencyOnboardingDraft(draft)
        if (revisionAtSchedule === latestDraftRevisionRef.current) {
          setDirty(false)
          setMessage(`Saved ${new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}`)
        }
      } catch (saveError) {
        setError(saveError.message || 'Unable to save onboarding draft.')
      } finally {
        setSaving(false)
      }
    }, 1200)
  }, [draft, dirty, initialized])

  const currentStep = AGENCY_STEPS[stepIndex] || AGENCY_STEPS[0]
  const progressPercentage = Math.round(((stepIndex + 1) / AGENCY_STEPS.length) * 100)
  const branches = draft?.branchStructure?.branches || []
  const invites = draft?.invitations || []

  const branchCountValue = useMemo(() => {
    if (!branches.length) return '0'
    return String(branches.length)
  }, [branches])

  if (!profileLoading && onboardingCompleted && INTERNAL_APP_ROLES.includes(role)) {
    return <Navigate to="/dashboard" replace />
  }

  function updateDraft(nextDraftOrUpdater) {
    setDraft((previous) => {
      const resolved = typeof nextDraftOrUpdater === 'function' ? nextDraftOrUpdater(previous) : nextDraftOrUpdater
      return mergeAgencyOnboardingDraft(previous, resolved, profile)
    })
    latestDraftRevisionRef.current += 1
    setDirty(true)
  }

  function goNextStep() {
    const validationError = resolveStepValidation(currentStep.key, draft)
    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    setStepIndex((previous) => Math.min(previous + 1, AGENCY_STEPS.length - 1))
  }

  function goBackStep() {
    setError('')
    setStepIndex((previous) => Math.max(previous - 1, 0))
  }

  function updateBranchCount(value) {
    const count = Math.min(Math.max(parseAgentCount(value), 1), 50)
    updateDraft((previous) => {
      const existing = [...(previous?.branchStructure?.branches || [])]
      if (existing.length < count) {
        while (existing.length < count) {
          existing.push(createAgencyBranchDraft({
            branchName: existing.length === 0 ? 'Head Office' : `Branch ${existing.length + 1}`,
          }))
        }
      } else if (existing.length > count) {
        existing.length = count
      }
      return {
        ...previous,
        branchStructure: {
          ...(previous?.branchStructure || {}),
          branches: existing,
        },
      }
    })
  }

  function addBranch() {
    updateDraft((previous) => ({
      ...previous,
      branchStructure: {
        ...(previous?.branchStructure || {}),
        branches: [...(previous?.branchStructure?.branches || []), createAgencyBranchDraft({ branchName: `Branch ${(previous?.branchStructure?.branches || []).length + 1}` })],
      },
    }))
  }

  function removeBranch(branchId) {
    updateDraft((previous) => {
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

  function addInvite() {
    updateDraft((previous) => ({
      ...previous,
      invitations: [...(previous?.invitations || []), createAgencyInviteDraft()],
    }))
  }

  function removeInvite(inviteId) {
    updateDraft((previous) => {
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
      setMessage('Uploading logo…')
      const upload = await uploadOrganisationBrandingAsset({
        file,
        variant: targetKey === 'logoDark' ? 'dark' : 'light',
      })
      updateDraft((previous) => ({
        ...previous,
        branding: {
          ...(previous?.branding || {}),
          [targetKey]: upload.publicUrl || previous?.branding?.[targetKey] || '',
          [`${targetKey}Name`]: file.name,
        },
      }))
      setMessage(`${targetKey === 'logoDark' ? 'Dark' : 'Light'} logo uploaded.`)
    } catch (uploadError) {
      setError(uploadError?.message || 'Unable to upload the selected logo file.')
    } finally {
      setUploadingLogoTarget('')
    }
  }

  async function handleCompleteOnboarding() {
    const validationError = resolveStepValidation(currentStep.key, draft)
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      setCompleting(true)
      setError('')
      const completionResponse = await completeAgencyOnboarding(draft)
      const principal = completionResponse?.onboarding?.principalInformation || draft?.principalInformation || {}
      const splitName = splitFullName(principal.principalFullName)
      await saveProfileDraft({
        firstName: splitName.firstName || profile?.firstName || '',
        lastName: splitName.lastName || profile?.lastName || '',
        companyName: completionResponse?.onboarding?.agencyInformation?.agencyName || profile?.companyName || '',
        phoneNumber: principal.phoneNumber || profile?.phoneNumber || '',
        role: 'agent',
        onboardingCompleted: true,
      })
      navigate('/dashboard', { replace: true })
    } catch (completeError) {
      setError(completeError.message || 'Unable to complete agency onboarding.')
    } finally {
      setCompleting(false)
    }
  }

  async function handleCompleteInvitedOnboarding(event) {
    event.preventDefault()
    const firstName = String(invitedForm.firstName || '').trim()
    const lastName = String(invitedForm.lastName || '').trim()
    if (!firstName || !lastName) {
      setError('Full name is required to complete onboarding.')
      return
    }

    try {
      setCompleting(true)
      setError('')
      let inviteToken = ''
      if (typeof window !== 'undefined') {
        inviteToken = String(window.sessionStorage.getItem(PENDING_ORG_INVITE_TOKEN_STORAGE_KEY) || '').trim()
      }

      if (inviteToken) {
        await completeInvitedMemberOnboarding({
          token: inviteToken,
          firstName,
          lastName,
          phoneNumber: invitedForm.phoneNumber,
          ppraNumber: invitedForm.ppraNumber,
        })
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(PENDING_ORG_INVITE_TOKEN_STORAGE_KEY)
        }
      } else {
        await saveProfileDraft({
          firstName,
          lastName,
          phoneNumber: invitedForm.phoneNumber,
          role: 'agent',
          onboardingCompleted: true,
        })
      }

      navigate('/dashboard', { replace: true })
    } catch (completeError) {
      setError(completeError.message || 'Unable to complete invited onboarding.')
    } finally {
      setCompleting(false)
    }
  }

  if (loading || !draft) {
    if (!loading && error) {
      return (
        <section className="auth-loading-screen">
          <div className="auth-loading-card">
            <h2>We couldn’t load your onboarding workspace.</h2>
            <p>{error}</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className="auth-primary-cta"
                onClick={() => setBootstrapAttempt((previous) => previous + 1)}
              >
                Retry
              </button>
              <button
                type="button"
                className="auth-secondary-cta"
                onClick={() => navigate('/dashboard', { replace: true })}
              >
                Go to Dashboard
              </button>
              <button
                type="button"
                className="auth-secondary-cta"
                onClick={async () => {
                  try {
                    setSaving(true)
                    setError('')
                    const cleanDraft = buildDefaultAgencyOnboarding()
                    await saveAgencyOnboardingDraft(cleanDraft)
                    setDraft(mergeAgencyOnboardingDraft(cleanDraft, {}, profile))
                    setStepIndex(0)
                    setDirty(false)
                    setInitialized(true)
                    setBootstrapAttempt((previous) => previous + 1)
                  } catch (restartError) {
                    setError(restartError?.message || 'Unable to restart onboarding setup.')
                  } finally {
                    setSaving(false)
                  }
                }}
                disabled={saving}
              >
                {saving ? 'Restarting…' : 'Restart Onboarding Setup'}
              </button>
            </div>
          </div>
        </section>
      )
    }

    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>Preparing Agency Onboarding…</h2>
          <p>
            Loading your organisation setup workspace.
            <br />
            <span className="text-xs text-[#6c8198]">If this takes longer than 15 seconds, retry.</span>
          </p>
        </div>
      </section>
    )
  }

  if (onboardingMode === 'invited_member') {
    return (
      <div className="auth-page onboarding-page agency-onboarding-page">
        <main className="auth-shell onboarding-shell agency-onboarding-shell">
          <section className="auth-hero onboarding-hero agency-onboarding-hero">
            <p className="auth-brand">bridge.</p>
            <h1>Complete Your Agent Profile</h1>
            <p>Confirm your profile details to activate your organisation access.</p>
          </section>

          <section className="auth-card onboarding-card agency-onboarding-card">
            <div className="auth-card-head">
              <span className="auth-card-eyebrow">Invited Member</span>
              <h2>Join Organisation</h2>
              <p>You were invited to an existing organisation. No agency creation is required.</p>
            </div>

            <form className="auth-form onboarding-form agency-onboarding-form" onSubmit={handleCompleteInvitedOnboarding}>
              <section className="agency-grid">
                <label>
                  First Name
                  <input
                    type="text"
                    value={invitedForm.firstName}
                    onChange={(event) => setInvitedForm((previous) => ({ ...previous, firstName: event.target.value }))}
                  />
                </label>
                <label>
                  Last Name
                  <input
                    type="text"
                    value={invitedForm.lastName}
                    onChange={(event) => setInvitedForm((previous) => ({ ...previous, lastName: event.target.value }))}
                  />
                </label>
                <label>
                  Phone Number
                  <input
                    type="text"
                    value={invitedForm.phoneNumber}
                    onChange={(event) => setInvitedForm((previous) => ({ ...previous, phoneNumber: event.target.value }))}
                  />
                </label>
                <label>
                  PPRA Number (Optional)
                  <input
                    type="text"
                    value={invitedForm.ppraNumber}
                    onChange={(event) => setInvitedForm((previous) => ({ ...previous, ppraNumber: event.target.value }))}
                  />
                </label>
              </section>

              <div className="auth-actions">
                <button type="submit" className="auth-primary-cta" disabled={completing}>
                  {completing ? 'Activating…' : 'Activate Access'}
                </button>
              </div>
            </form>

            {error ? <p className="auth-form-error">{error}</p> : null}
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="auth-page onboarding-page agency-onboarding-page">
      <main className="auth-shell onboarding-shell agency-onboarding-shell">
        <section className="auth-hero onboarding-hero agency-onboarding-hero">
          <p className="auth-brand">bridge.</p>
          <h1 style={{ color: '#ffffff' }}>Welcome to Bridge.</h1>
          <p>Configure your agency structure, ownership, permissions, and team access before launch.</p>

          <div className="auth-hero-points">
            <article>
              <ShieldCheck size={16} />
              <div>
                <strong>Principal-first governance</strong>
                <span>Owner-led structure with controlled branch visibility and role access.</span>
              </div>
            </article>
            <article>
              <Users size={16} />
              <div>
                <strong>Scalable branch hierarchy</strong>
                <span>Designed for multi-office agencies, branch managers, and agent CRM ownership.</span>
              </div>
            </article>
            <article>
              <Globe2 size={16} />
              <div>
                <strong>Brand and reporting foundation</strong>
                <span>Onboarding data flows into Settings, permissions, and organisation intelligence.</span>
              </div>
            </article>
          </div>
        </section>

        <section className="auth-card onboarding-card agency-onboarding-card">
          <div className="auth-card-head">
            <span className="auth-card-eyebrow">{currentStep.key === 'organisation_type' ? 'Module Setup' : 'Agency Onboarding'}</span>
            <h2>{currentStep.key === 'organisation_type' ? 'Choose what you are setting up' : currentStep.label}</h2>
            {currentStep.key === 'organisation_type' ? (
              <p>Select your organisation module to start the right onboarding flow.</p>
            ) : (
              <p>Step {stepIndex + 1} of {AGENCY_STEPS.length}</p>
            )}
          </div>

          {currentStep.key !== 'organisation_type' ? (
            <div className="agency-progress-wrap">
              <div className="agency-progress-track">
                <span className="agency-progress-fill" style={{ width: `${progressPercentage}%` }} />
              </div>
              <span className="agency-progress-label">{progressPercentage}% Complete</span>
            </div>
          ) : null}

          <div className="agency-onboarding-scroll">
            {currentStep.key !== 'organisation_type' ? (
              <div className="agency-step-pills">
                {AGENCY_STEPS.map((step, index) => (
                  <button
                    key={step.key}
                    type="button"
                    className={`agency-step-pill ${index === stepIndex ? 'active' : ''} ${index < stepIndex ? 'completed' : ''}`}
                    onClick={() => setStepIndex(index)}
                  >
                    {index < stepIndex ? <CheckCircle2 size={13} /> : null}
                    <span>{step.label}</span>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="auth-form onboarding-form agency-onboarding-form">
            {currentStep.key === 'organisation_type' ? (
              <section className="agency-role-grid">
                {AGENCY_ORGANISATION_TYPE_OPTIONS.map((option) => {
                  const meta = ORGANISATION_TYPE_META[option.value] || {}
                  const Icon = meta.icon || Building2
                  const isActive = draft.organisationType === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={!option.enabled}
                      className={`agency-role-card ${isActive ? 'active' : ''}`}
                      onClick={() => updateDraft({ organisationType: option.value })}
                    >
                      <div className="agency-role-card-head">
                        <span className="agency-role-card-icon"><Icon size={18} /></span>
                        <div>
                          <strong>{option.label}</strong>
                          <span>{meta.description || ''}</span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </section>
            ) : null}

            {currentStep.key === 'agency_information' ? (
              <section className="agency-grid">
                <label>
                  Agency Name
                  <input
                    type="text"
                    value={draft.agencyInformation.agencyName}
                    onChange={(event) => updateDraft({
                      agencyInformation: {
                        ...draft.agencyInformation,
                        agencyName: event.target.value,
                      },
                    })}
                  />
                </label>
                <label>
                  Trading Name
                  <input
                    type="text"
                    value={draft.agencyInformation.tradingName}
                    onChange={(event) => updateDraft({
                      agencyInformation: {
                        ...draft.agencyInformation,
                        tradingName: event.target.value,
                      },
                    })}
                  />
                </label>
                <label>
                  Agency Type
                  <select
                    value={draft.agencyInformation.agencyType}
                    onChange={(event) => updateDraft({
                      agencyInformation: {
                        ...draft.agencyInformation,
                        agencyType: event.target.value,
                      },
                    })}
                  >
                    {AGENCY_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Business Focus
                  <select
                    value={draft.agencyInformation.businessFocus}
                    onChange={(event) => updateDraft({
                      agencyInformation: {
                        ...draft.agencyInformation,
                        businessFocus: event.target.value,
                      },
                    })}
                  >
                    {AGENCY_BUSINESS_FOCUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Company Registration Number
                  <input
                    type="text"
                    value={draft.agencyInformation.companyRegistrationNumber}
                    onChange={(event) => updateDraft({ agencyInformation: { ...draft.agencyInformation, companyRegistrationNumber: event.target.value } })}
                  />
                </label>
                <label>
                  VAT Number
                  <input
                    type="text"
                    value={draft.agencyInformation.vatNumber}
                    onChange={(event) => updateDraft({ agencyInformation: { ...draft.agencyInformation, vatNumber: event.target.value } })}
                  />
                </label>
                <label>
                  EAAB / PPRA Number
                  <input
                    type="text"
                    value={draft.agencyInformation.eaabPpraNumber}
                    onChange={(event) => updateDraft({ agencyInformation: { ...draft.agencyInformation, eaabPpraNumber: event.target.value } })}
                  />
                </label>
                <label>
                  Website
                  <input
                    type="text"
                    value={draft.agencyInformation.website}
                    onChange={(event) => updateDraft({ agencyInformation: { ...draft.agencyInformation, website: event.target.value } })}
                  />
                </label>
                <label>
                  Main Office Number
                  <input
                    type="text"
                    value={draft.agencyInformation.mainOfficeNumber}
                    onChange={(event) => updateDraft({ agencyInformation: { ...draft.agencyInformation, mainOfficeNumber: event.target.value } })}
                  />
                </label>
                <label>
                  Main Email Address
                  <input
                    type="email"
                    value={draft.agencyInformation.mainEmailAddress}
                    onChange={(event) => updateDraft({ agencyInformation: { ...draft.agencyInformation, mainEmailAddress: event.target.value } })}
                  />
                </label>
                <label className="span-2">
                  Physical Address
                  <input
                    type="text"
                    value={draft.agencyInformation.physicalAddress}
                    onChange={(event) => updateDraft({ agencyInformation: { ...draft.agencyInformation, physicalAddress: event.target.value } })}
                  />
                </label>
                <label>
                  Province
                  <input
                    type="text"
                    value={draft.agencyInformation.province}
                    onChange={(event) => updateDraft({ agencyInformation: { ...draft.agencyInformation, province: event.target.value } })}
                  />
                </label>
                <label>
                  Country
                  <input
                    type="text"
                    value={draft.agencyInformation.country}
                    onChange={(event) => updateDraft({ agencyInformation: { ...draft.agencyInformation, country: event.target.value } })}
                  />
                </label>
              </section>
            ) : null}

            {currentStep.key === 'principal_information' ? (
              <section className="agency-grid">
                <p className="agency-step-note span-2">
                  The signing user becomes the Primary Principal. You can add additional principal-level administrators from Organisation Members later.
                </p>
                <label>
                  Principal Full Name
                  <input
                    type="text"
                    value={draft.principalInformation.principalFullName}
                    onChange={(event) => updateDraft({ principalInformation: { ...draft.principalInformation, principalFullName: event.target.value } })}
                  />
                </label>
                <label>
                  Email Address
                  <input
                    type="email"
                    value={draft.principalInformation.emailAddress}
                    onChange={(event) => updateDraft({ principalInformation: { ...draft.principalInformation, emailAddress: event.target.value } })}
                  />
                </label>
                <label>
                  Phone Number
                  <input
                    type="text"
                    value={draft.principalInformation.phoneNumber}
                    onChange={(event) => updateDraft({ principalInformation: { ...draft.principalInformation, phoneNumber: event.target.value } })}
                  />
                </label>
                <label>
                  Position
                  <input
                    type="text"
                    value={draft.principalInformation.position}
                    onChange={(event) => updateDraft({ principalInformation: { ...draft.principalInformation, position: event.target.value } })}
                  />
                </label>
                <label>
                  PPRA Number
                  <input
                    type="text"
                    value={draft.principalInformation.ppraNumber}
                    onChange={(event) => updateDraft({ principalInformation: { ...draft.principalInformation, ppraNumber: event.target.value } })}
                  />
                </label>
                <label>
                  ID Number (Optional)
                  <input
                    type="text"
                    value={draft.principalInformation.idNumber}
                    onChange={(event) => updateDraft({ principalInformation: { ...draft.principalInformation, idNumber: event.target.value } })}
                  />
                </label>
              </section>
            ) : null}

            {currentStep.key === 'branch_structure' ? (
              <section className="agency-stack">
                <label className="agency-inline-field">
                  <span>How many offices / branches do you operate?</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={branchCountValue}
                    onChange={(event) => updateBranchCount(event.target.value)}
                  />
                </label>

                <div className="agency-stack">
                  {branches.map((branch, index) => (
                    <article key={branch.id} className="agency-branch-card">
                      <div className="agency-card-head">
                        <strong>Branch {index + 1}</strong>
                        <button type="button" className="ghost-button" onClick={() => removeBranch(branch.id)} disabled={branches.length <= 1}>
                          Remove
                        </button>
                      </div>
                      <div className="agency-grid">
                        <label>
                          Branch Name
                          <input
                            type="text"
                            value={branch.branchName}
                            onChange={(event) => updateDraft((previous) => ({
                              ...previous,
                              branchStructure: {
                                ...(previous?.branchStructure || {}),
                                branches: (previous?.branchStructure?.branches || []).map((item) =>
                                  item.id === branch.id ? { ...item, branchName: event.target.value } : item,
                                ),
                              },
                            }))}
                          />
                        </label>
                        <label>
                          Office Location
                          <input
                            type="text"
                            value={branch.officeLocation}
                            onChange={(event) => updateDraft((previous) => ({
                              ...previous,
                              branchStructure: {
                                ...(previous?.branchStructure || {}),
                                branches: (previous?.branchStructure?.branches || []).map((item) =>
                                  item.id === branch.id ? { ...item, officeLocation: event.target.value } : item,
                                ),
                              },
                            }))}
                          />
                        </label>
                        <label>
                          Branch Manager
                          <input
                            type="text"
                            value={branch.branchManager}
                            onChange={(event) => updateDraft((previous) => ({
                              ...previous,
                              branchStructure: {
                                ...(previous?.branchStructure || {}),
                                branches: (previous?.branchStructure?.branches || []).map((item) =>
                                  item.id === branch.id ? { ...item, branchManager: event.target.value } : item,
                                ),
                              },
                            }))}
                          />
                        </label>
                        <label>
                          Number of Agents
                          <input
                            type="number"
                            min={0}
                            value={branch.numberOfAgents}
                            onChange={(event) => updateDraft((previous) => ({
                              ...previous,
                              branchStructure: {
                                ...(previous?.branchStructure || {}),
                                branches: (previous?.branchStructure?.branches || []).map((item) =>
                                  item.id === branch.id ? { ...item, numberOfAgents: event.target.value } : item,
                                ),
                              },
                            }))}
                          />
                        </label>
                      </div>
                    </article>
                  ))}
                </div>

                <button type="button" className="ghost-button agency-add-row" onClick={addBranch}>
                  <ArrowRight size={14} />
                  Add Branch
                </button>
              </section>
            ) : null}

            {currentStep.key === 'branding' ? (
              <section className="agency-grid">
                <article className="agency-brand-upload">
                  <strong>Light Contrast Logo</strong>
                  <label className="agency-upload-trigger">
                    <input
                      type="file"
                      accept="image/png,image/svg+xml,image/jpeg,image/webp"
                      onChange={(event) => void handleLogoUpload(event.target.files?.[0], 'logoLight')}
                    />
                    {uploadingLogoTarget === 'logoLight' ? 'Uploading…' : 'Upload Light Logo'}
                  </label>
                  <p className="agency-upload-caption">
                    {draft.branding.logoLightName ? `Uploaded: ${draft.branding.logoLightName}` : 'PNG or SVG recommended'}
                  </p>
                  {draft.branding.logoLight ? <img className="agency-logo-preview" src={draft.branding.logoLight} alt="Light logo preview" /> : null}
                </article>
                <article className="agency-brand-upload">
                  <strong>Dark / High Contrast Logo</strong>
                  <label className="agency-upload-trigger">
                    <input
                      type="file"
                      accept="image/png,image/svg+xml,image/jpeg,image/webp"
                      onChange={(event) => void handleLogoUpload(event.target.files?.[0], 'logoDark')}
                    />
                    {uploadingLogoTarget === 'logoDark' ? 'Uploading…' : 'Upload Dark Logo'}
                  </label>
                  <p className="agency-upload-caption">
                    {draft.branding.logoDarkName ? `Uploaded: ${draft.branding.logoDarkName}` : 'Used on dark UI surfaces'}
                  </p>
                  {draft.branding.logoDark ? <img className="agency-logo-preview agency-logo-preview-dark" src={draft.branding.logoDark} alt="Dark logo preview" /> : null}
                </article>
                <label>
                  Primary Brand Colour
                  <input
                    type="text"
                    value={draft.branding.brandColours.primary}
                    onChange={(event) => updateDraft({
                      branding: {
                        ...draft.branding,
                        brandColours: {
                          ...(draft.branding.brandColours || {}),
                          primary: event.target.value,
                        },
                      },
                    })}
                  />
                </label>
                <label>
                  Secondary Brand Colour
                  <input
                    type="text"
                    value={draft.branding.brandColours.secondary}
                    onChange={(event) => updateDraft({
                      branding: {
                        ...draft.branding,
                        brandColours: {
                          ...(draft.branding.brandColours || {}),
                          secondary: event.target.value,
                        },
                      },
                    })}
                  />
                </label>
              </section>
            ) : null}

            {currentStep.key === 'invite_agents' ? (
              <section className="agency-stack">
                <div className="agency-stack">
                  {invites.map((invite, index) => (
                    <article key={invite.id} className="agency-invite-card">
                      <div className="agency-card-head">
                        <strong>Agent Invite {index + 1}</strong>
                        <button type="button" className="ghost-button" onClick={() => removeInvite(invite.id)} disabled={invites.length <= 1}>
                          Remove
                        </button>
                      </div>
                      <div className="agency-grid">
                        <label>
                          Agent Name
                          <input
                            type="text"
                            value={invite.name}
                            onChange={(event) => updateDraft((previous) => ({
                              ...previous,
                              invitations: (previous?.invitations || []).map((item) => (item.id === invite.id ? { ...item, name: event.target.value } : item)),
                            }))}
                          />
                        </label>
                        <label>
                          Email Address
                          <input
                            type="email"
                            value={invite.email}
                            onChange={(event) => updateDraft((previous) => ({
                              ...previous,
                              invitations: (previous?.invitations || []).map((item) => (item.id === invite.id ? { ...item, email: event.target.value } : item)),
                            }))}
                          />
                        </label>
                        <label>
                          Assign Branch
                          <select
                            value={invite.branchId}
                            onChange={(event) => updateDraft((previous) => ({
                              ...previous,
                              invitations: (previous?.invitations || []).map((item) => (item.id === invite.id ? { ...item, branchId: event.target.value } : item)),
                            }))}
                          >
                            <option value="">Select branch</option>
                            {branches.map((branch) => (
                              <option key={branch.id} value={branch.id}>{branch.branchName || 'Branch'}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Assign Role
                          <select
                            value={invite.role}
                            onChange={(event) => updateDraft((previous) => ({
                              ...previous,
                              invitations: (previous?.invitations || []).map((item) => (item.id === invite.id ? { ...item, role: event.target.value } : item)),
                            }))}
                          >
                            {AGENCY_INVITE_ROLE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </article>
                  ))}
                </div>

                <button type="button" className="ghost-button agency-add-row" onClick={addInvite}>
                  <ArrowRight size={14} />
                  Add Another Agent
                </button>
              </section>
            ) : null}

            {currentStep.key === 'review' ? (
              <section className="agency-review">
                <article>
                  <h3>Organisation Structure</h3>
                  <p>{draft.agencyInformation.agencyName || 'Agency name pending'}</p>
                  <small>{draft.agencyInformation.agencyType} • {draft.agencyInformation.businessFocus}</small>
                </article>
                <article>
                  <h3>Principal Ownership</h3>
                  <p>{draft.principalInformation.principalFullName || 'Principal name pending'}</p>
                  <small>{draft.principalInformation.emailAddress || 'Email pending'}</small>
                </article>
                <article>
                  <h3>Branches</h3>
                  <p>{branches.length} branch(es) configured</p>
                  <small>{branches.reduce((sum, item) => sum + parseAgentCount(item.numberOfAgents), 0)} planned agent seats</small>
                </article>
                <article>
                  <h3>Invitations</h3>
                  <p>{invites.filter((item) => item.email).length} invite(s) ready</p>
                  <small>Roles and branch assignments will sync to organisation access.</small>
                </article>
              </section>
            ) : null}
            </div>

            {error ? <p className="auth-feedback error">{error}</p> : null}
          </div>

          <div className="agency-onboarding-actions">
            <button type="button" className="ghost-button" onClick={goBackStep} disabled={stepIndex === 0 || completing}>
              <ChevronLeft size={14} />
              Back
            </button>

            {currentStep.key !== 'review' ? (
              <button type="button" className="auth-submit" onClick={goNextStep} disabled={completing}>
                Continue
                <ChevronRight size={15} />
              </button>
            ) : (
              <button type="button" className="auth-submit" onClick={handleCompleteOnboarding} disabled={completing}>
                {completing ? 'Completing…' : 'Launch Agency Workspace'}
                {!completing ? <CheckCircle2 size={15} /> : null}
              </button>
            )}
          </div>

          <p className="agency-autosave-caption">{saving ? 'Saving draft…' : message || 'Draft autosaves in the background.'}</p>
        </section>
      </main>
    </div>
  )
}

export default Onboarding
