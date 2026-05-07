import { useEffect, useMemo, useState } from 'react'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import { createAgencyBranchDraft } from '../../lib/agencyOnboarding'
import { fetchAgencyOnboardingSettings, saveAgencyOnboardingDraft, updateOrganisationSettings } from '../../lib/settingsApi'
import {
  SettingsBanner,
  SettingsLoadingState,
  SettingsPageHeader,
  SettingsSectionCard,
  settingsActionRowClass,
  settingsFieldClass,
  settingsFieldSpanClass,
  settingsGridClass,
  settingsPageClass,
} from './settingsUi'

const PERMISSION_SCOPE_OPTIONS = [
  { value: 'all', label: 'All Organisation Data' },
  { value: 'branch', label: 'Branch Scoped' },
  { value: 'own', label: 'Own Records Only' },
]

const CRM_VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private by Default' },
  { value: 'branch', label: 'Visible to Branch' },
  { value: 'organisation', label: 'Visible to Organisation' },
]

const EDIT_ROLES = new Set(['admin'])

export default function SettingsOrganisationPage() {
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        const response = await fetchAgencyOnboardingSettings()
        if (active) {
          setState(response)
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  const form = useMemo(() => state?.organisation || null, [state])
  const onboarding = useMemo(() => state?.onboarding || null, [state])
  const canEdit = EDIT_ROLES.has(String(state?.membershipRole || '').trim().toLowerCase())

  function updateField(key, value) {
    setState((previous) => ({
      ...previous,
      organisation: {
        ...previous.organisation,
        [key]: value,
      },
    }))
  }

  function updateAgencyField(key, value) {
    setState((previous) => ({
      ...previous,
      onboarding: {
        ...previous.onboarding,
        agencyInformation: {
          ...(previous.onboarding?.agencyInformation || {}),
          [key]: value,
        },
      },
    }))
  }

  function updatePrincipalField(key, value) {
    setState((previous) => ({
      ...previous,
      onboarding: {
        ...previous.onboarding,
        principalInformation: {
          ...(previous.onboarding?.principalInformation || {}),
          [key]: value,
        },
      },
    }))
  }

  function updatePermissionField(key, value) {
    setState((previous) => ({
      ...previous,
      onboarding: {
        ...previous.onboarding,
        permissions: {
          ...(previous.onboarding?.permissions || {}),
          [key]: value,
        },
      },
    }))
  }

  function updateBrandingField(key, value) {
    setState((previous) => ({
      ...previous,
      onboarding: {
        ...previous.onboarding,
        branding: {
          ...(previous.onboarding?.branding || {}),
          [key]: value,
        },
      },
    }))
  }

  function updateBrandColour(key, value) {
    setState((previous) => ({
      ...previous,
      onboarding: {
        ...previous.onboarding,
        branding: {
          ...(previous.onboarding?.branding || {}),
          brandColours: {
            ...(previous.onboarding?.branding?.brandColours || {}),
            [key]: value,
          },
        },
      },
    }))
  }

  function updateBranch(branchId, key, value) {
    setState((previous) => ({
      ...previous,
      onboarding: {
        ...previous.onboarding,
        branchStructure: {
          ...(previous.onboarding?.branchStructure || {}),
          branches: (previous.onboarding?.branchStructure?.branches || []).map((branch) =>
            branch.id === branchId ? { ...branch, [key]: value } : branch,
          ),
        },
      },
    }))
  }

  function addBranch() {
    setState((previous) => ({
      ...previous,
      onboarding: {
        ...previous.onboarding,
        branchStructure: {
          ...(previous.onboarding?.branchStructure || {}),
          branches: [...(previous.onboarding?.branchStructure?.branches || []), createAgencyBranchDraft()],
        },
      },
    }))
  }

  function removeBranch(branchId) {
    setState((previous) => {
      const nextBranches = (previous.onboarding?.branchStructure?.branches || []).filter((branch) => branch.id !== branchId)
      return {
        ...previous,
        onboarding: {
          ...previous.onboarding,
          branchStructure: {
            ...(previous.onboarding?.branchStructure || {}),
            branches: nextBranches.length ? nextBranches : [createAgencyBranchDraft()],
          },
        },
      }
    })
  }

  async function handleSave(event) {
    event.preventDefault()
    if (!canEdit) return

    try {
      setSaving(true)
      setError('')
      setMessage('')

      const [organisationResponse, onboardingResponse] = await Promise.all([
        updateOrganisationSettings(state.organisation),
        saveAgencyOnboardingDraft(state.onboarding),
      ])

      setState((previous) => ({
        ...previous,
        ...organisationResponse,
        membershipRole: organisationResponse.membershipRole || onboardingResponse.membershipRole || previous?.membershipRole || 'viewer',
        onboarding: onboardingResponse.onboarding,
      }))

      setMessage('Organisation settings saved.')
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !form || !onboarding) {
    return <SettingsLoadingState label="Loading organisation settings…" />
  }

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Organisation"
        title="Agency structure, governance, and branding"
        description="Principal-owned setup used across permissions, reporting hierarchy, CRM visibility, and branch operations."
      />

      {!canEdit ? <SettingsBanner tone="warning">Read-only for your role. Only Principal-level administrators can edit organisation settings.</SettingsBanner> : null}

      <form className="space-y-0" onSubmit={handleSave}>
        <SettingsSectionCard title="Agency Information" description="Core agency details that drive organisation identity and operational ownership.">
          <div className={settingsGridClass}>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Agency name</span>
              <Field
                value={onboarding.agencyInformation?.agencyName || ''}
                disabled={!canEdit}
                onChange={(event) => {
                  const value = event.target.value
                  updateAgencyField('agencyName', value)
                  updateField('name', value)
                }}
              />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Trading name</span>
              <Field
                value={onboarding.agencyInformation?.tradingName || ''}
                disabled={!canEdit}
                onChange={(event) => {
                  const value = event.target.value
                  updateAgencyField('tradingName', value)
                  updateField('displayName', value)
                }}
              />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Agency type</span>
              <Field
                as="select"
                value={onboarding.agencyInformation?.agencyType || 'residential'}
                disabled={!canEdit}
                onChange={(event) => updateAgencyField('agencyType', event.target.value)}
              >
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="mixed">Mixed</option>
              </Field>
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Business focus</span>
              <Field
                as="select"
                value={onboarding.agencyInformation?.businessFocus || 'sales'}
                disabled={!canEdit}
                onChange={(event) => updateAgencyField('businessFocus', event.target.value)}
              >
                <option value="sales">Sales</option>
                <option value="rentals">Rentals</option>
                <option value="sales_rentals">Sales &amp; Rentals</option>
              </Field>
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Company registration number</span>
              <Field
                value={onboarding.agencyInformation?.companyRegistrationNumber || ''}
                disabled={!canEdit}
                onChange={(event) => updateAgencyField('companyRegistrationNumber', event.target.value)}
              />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">VAT number</span>
              <Field
                value={onboarding.agencyInformation?.vatNumber || ''}
                disabled={!canEdit}
                onChange={(event) => updateAgencyField('vatNumber', event.target.value)}
              />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">EAAB / PPRA number</span>
              <Field
                value={onboarding.agencyInformation?.eaabPpraNumber || ''}
                disabled={!canEdit}
                onChange={(event) => updateAgencyField('eaabPpraNumber', event.target.value)}
              />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Website</span>
              <Field
                value={onboarding.agencyInformation?.website || ''}
                disabled={!canEdit}
                onChange={(event) => {
                  const value = event.target.value
                  updateAgencyField('website', value)
                  updateField('website', value)
                }}
              />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Main office number</span>
              <Field
                value={onboarding.agencyInformation?.mainOfficeNumber || ''}
                disabled={!canEdit}
                onChange={(event) => {
                  const value = event.target.value
                  updateAgencyField('mainOfficeNumber', value)
                  updateField('companyPhone', value)
                }}
              />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Main email address</span>
              <Field
                value={onboarding.agencyInformation?.mainEmailAddress || ''}
                disabled={!canEdit}
                onChange={(event) => {
                  const value = event.target.value
                  updateAgencyField('mainEmailAddress', value)
                  updateField('companyEmail', value)
                }}
              />
            </label>
            <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
              <span className="text-sm font-medium text-[#51657b]">Physical address</span>
              <Field
                value={onboarding.agencyInformation?.physicalAddress || ''}
                disabled={!canEdit}
                onChange={(event) => {
                  const value = event.target.value
                  updateAgencyField('physicalAddress', value)
                  updateField('addressLine1', value)
                }}
              />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Province</span>
              <Field
                value={onboarding.agencyInformation?.province || ''}
                disabled={!canEdit}
                onChange={(event) => {
                  const value = event.target.value
                  updateAgencyField('province', value)
                  updateField('province', value)
                }}
              />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Country</span>
              <Field
                value={onboarding.agencyInformation?.country || ''}
                disabled={!canEdit}
                onChange={(event) => {
                  const value = event.target.value
                  updateAgencyField('country', value)
                  updateField('country', value)
                }}
              />
            </label>
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard title="Principal Information" description="Principal profile and ownership identity used for admin control and reporting lineage.">
          <div className={settingsGridClass}>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Principal full name</span>
              <Field value={onboarding.principalInformation?.principalFullName || ''} disabled={!canEdit} onChange={(event) => updatePrincipalField('principalFullName', event.target.value)} />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Principal email</span>
              <Field value={onboarding.principalInformation?.emailAddress || ''} disabled={!canEdit} onChange={(event) => updatePrincipalField('emailAddress', event.target.value)} />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Phone number</span>
              <Field value={onboarding.principalInformation?.phoneNumber || ''} disabled={!canEdit} onChange={(event) => updatePrincipalField('phoneNumber', event.target.value)} />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Position</span>
              <Field value={onboarding.principalInformation?.position || ''} disabled={!canEdit} onChange={(event) => updatePrincipalField('position', event.target.value)} />
            </label>
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard
          title="Branches"
          description="Branch entities drive manager scope, reporting visibility, and operational ownership."
          actions={canEdit ? <Button type="button" variant="secondary" onClick={addBranch}>Add Branch</Button> : null}
        >
          <div className="space-y-4">
            {(onboarding.branchStructure?.branches || []).map((branch, index) => (
              <article key={branch.id} className="rounded-[16px] border border-[#e1e9f3] bg-[#f8fbff] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#2e4259]">Branch {index + 1}</h4>
                  {canEdit ? (
                    <Button type="button" variant="ghost" onClick={() => removeBranch(branch.id)} disabled={(onboarding.branchStructure?.branches || []).length <= 1}>
                      Remove
                    </Button>
                  ) : null}
                </div>
                <div className={settingsGridClass}>
                  <label className={settingsFieldClass}>
                    <span className="text-sm font-medium text-[#51657b]">Branch name</span>
                    <Field value={branch.branchName || ''} disabled={!canEdit} onChange={(event) => updateBranch(branch.id, 'branchName', event.target.value)} />
                  </label>
                  <label className={settingsFieldClass}>
                    <span className="text-sm font-medium text-[#51657b]">Office location</span>
                    <Field value={branch.officeLocation || ''} disabled={!canEdit} onChange={(event) => updateBranch(branch.id, 'officeLocation', event.target.value)} />
                  </label>
                  <label className={settingsFieldClass}>
                    <span className="text-sm font-medium text-[#51657b]">Branch manager</span>
                    <Field value={branch.branchManager || ''} disabled={!canEdit} onChange={(event) => updateBranch(branch.id, 'branchManager', event.target.value)} />
                  </label>
                  <label className={settingsFieldClass}>
                    <span className="text-sm font-medium text-[#51657b]">Number of agents</span>
                    <Field value={branch.numberOfAgents || ''} disabled={!canEdit} onChange={(event) => updateBranch(branch.id, 'numberOfAgents', event.target.value)} />
                  </label>
                </div>
              </article>
            ))}
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard title="Branding" description="Brand assets used for portal, reporting, and outbound communication surfaces.">
          <div className={settingsGridClass}>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Light logo URL</span>
              <Field value={onboarding.branding?.logoLight || ''} disabled={!canEdit} onChange={(event) => updateBrandingField('logoLight', event.target.value)} />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Dark logo URL</span>
              <Field value={onboarding.branding?.logoDark || ''} disabled={!canEdit} onChange={(event) => updateBrandingField('logoDark', event.target.value)} />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Primary colour</span>
              <Field value={onboarding.branding?.brandColours?.primary || ''} disabled={!canEdit} onChange={(event) => updateBrandColour('primary', event.target.value)} />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Secondary colour</span>
              <Field value={onboarding.branding?.brandColours?.secondary || ''} disabled={!canEdit} onChange={(event) => updateBrandColour('secondary', event.target.value)} />
            </label>
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard title="Permissions & Visibility" description="Controls for CRM ownership and branch/agent visibility defaults.">
          <div className={settingsGridClass}>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Principal scope</span>
              <Field as="select" value={onboarding.permissions?.principalScope || 'all'} disabled={!canEdit} onChange={(event) => updatePermissionField('principalScope', event.target.value)}>
                {PERMISSION_SCOPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Field>
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Branch manager scope</span>
              <Field as="select" value={onboarding.permissions?.branchManagerScope || 'branch'} disabled={!canEdit} onChange={(event) => updatePermissionField('branchManagerScope', event.target.value)}>
                {PERMISSION_SCOPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Field>
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Agent scope</span>
              <Field as="select" value={onboarding.permissions?.agentScope || 'own'} disabled={!canEdit} onChange={(event) => updatePermissionField('agentScope', event.target.value)}>
                {PERMISSION_SCOPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Field>
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">CRM lead visibility</span>
              <Field as="select" value={onboarding.permissions?.crmLeadVisibility || 'private'} disabled={!canEdit} onChange={(event) => updatePermissionField('crmLeadVisibility', event.target.value)}>
                {CRM_VISIBILITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Field>
            </label>
            <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
              <span className="text-sm font-medium text-[#51657b]">Collaboration controls</span>
              <div className="grid gap-2 rounded-[12px] border border-[#e4ecf5] bg-white px-4 py-3">
                <label className="flex items-center justify-between gap-3 text-sm text-[#51657b]">
                  <span>Allow cross-branch collaboration</span>
                  <input
                    type="checkbox"
                    checked={Boolean(onboarding.permissions?.allowCrossBranchCollaboration)}
                    disabled={!canEdit}
                    onChange={(event) => updatePermissionField('allowCrossBranchCollaboration', event.target.checked)}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm text-[#51657b]">
                  <span>Allow shared lead pools</span>
                  <input
                    type="checkbox"
                    checked={Boolean(onboarding.permissions?.allowSharedLeadPools)}
                    disabled={!canEdit}
                    onChange={(event) => updatePermissionField('allowSharedLeadPools', event.target.checked)}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm text-[#51657b]">
                  <span>Allow shared listings</span>
                  <input
                    type="checkbox"
                    checked={Boolean(onboarding.permissions?.allowSharedListings)}
                    disabled={!canEdit}
                    onChange={(event) => updatePermissionField('allowSharedListings', event.target.checked)}
                  />
                </label>
              </div>
            </label>
          </div>
        </SettingsSectionCard>

        {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
        {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}

        {canEdit ? (
          <div className={settingsActionRowClass}>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save Organisation Settings'}
            </Button>
          </div>
        ) : null}
      </form>
    </div>
  )
}
