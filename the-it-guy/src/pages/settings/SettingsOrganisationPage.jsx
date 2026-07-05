import { useEffect, useMemo, useState } from 'react'
import AddressAutocomplete from '../../components/location/AddressAutocomplete'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import { useOrganisation } from '../../context/OrganisationContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { createAgencyBranchDraft } from '../../lib/agencyOnboarding'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import { upsertAreaFromAddress } from '../../lib/location/upsertArea'
import {
  saveAgencyOnboardingDraft,
  updateOrganisationSettings,
  uploadOrganisationBrandingAsset,
} from '../../lib/settingsApi'
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

const WORKSPACE_TYPE_COPY_KEYS = {
  agency: 'agency',
  bond_originator: 'bond',
}

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

const BOND_ORIGINATOR_TYPE_OPTIONS = [
  { value: 'independent', label: 'Independent originator' },
  { value: 'regional', label: 'Regional bond originator' },
  { value: 'national', label: 'National originator network' },
]

const BOND_BUSINESS_FOCUS_OPTIONS = [
  { value: 'bond_applications', label: 'Bond applications' },
  { value: 'prequalification', label: 'Pre-qualification' },
  { value: 'full_service', label: 'Full finance support' },
]

const BOND_SETTINGS_COPY = {
  header: {
    title: 'Bond originator structure, governance, and branding',
    description: 'HQ-owned setup used across reporting hierarchy, consultant scope, application visibility, and branch operations.',
  },
  unavailable: 'Bond originator organisation settings are unavailable right now. Please retry from the dashboard setup guide.',
  readOnly: 'Read-only for your role. Only HQ administrators can edit bond originator organisation settings.',
  saved: 'Bond originator organisation settings saved.',
  organisationSection: {
    title: 'Bond Originator Information',
    description: 'Core bond originator details that drive workspace identity and operational ownership.',
  },
  adminSection: {
    title: 'Executive Administrator',
    description: 'Primary HQ administrator identity used for admin control and reporting lineage.',
  },
  branchesSection: {
    title: 'Regions & Branches',
    description: 'Regional and branch entities drive manager scope, reporting visibility, and operational ownership.',
    addLabel: 'Add Branch',
    rowLabel: 'Branch',
  },
  permissionsSection: {
    title: 'Permissions & Visibility',
    description: 'Controls for application ownership, consultant visibility, and regional/branch collaboration defaults.',
  },
}

function buildOrganisationAddressValue(organisation = {}, onboarding = {}) {
  const agencyInfo = onboarding?.agencyInformation || {}
  const formattedAddress = String(
    organisation?.formattedAddress ||
      agencyInfo.formattedAddress ||
      [organisation?.addressLine1 || agencyInfo.physicalAddress, organisation?.suburb, organisation?.city, organisation?.province || agencyInfo.province].filter(Boolean).join(', '),
  ).trim()

  if (!formattedAddress) return null

  return {
    formattedAddress,
    streetAddress: String(organisation?.addressLine1 || agencyInfo.physicalAddress || '').trim(),
    suburb: String(organisation?.suburb || '').trim(),
    city: String(organisation?.city || '').trim(),
    province: String(organisation?.province || agencyInfo.province || '').trim(),
    country: String(organisation?.country || agencyInfo.country || 'South Africa').trim(),
    postalCode: String(organisation?.postalCode || '').trim(),
    latitude: typeof organisation?.latitude === 'number' ? organisation.latitude : Number(organisation?.latitude) || undefined,
    longitude: typeof organisation?.longitude === 'number' ? organisation.longitude : Number(organisation?.longitude) || undefined,
    placeId: String(organisation?.googlePlaceId || '').trim(),
  }
}

const AGENCY_SETTINGS_COPY = {
  header: {
    title: 'Agency structure, governance, and branding',
    description: 'Principal-owned setup used across permissions, reporting hierarchy, CRM visibility, and branch operations.',
  },
  unavailable: 'Organisation settings are unavailable right now. Please retry from the dashboard setup guide.',
  readOnly: 'Read-only for your role. Only Principal-level administrators can edit organisation settings.',
  saved: 'Organisation settings saved.',
  organisationSection: {
    title: 'Agency Information',
    description: 'Core agency details that drive organisation identity and operational ownership.',
  },
  adminSection: {
    title: 'Principal Information',
    description: 'Principal profile and ownership identity used for admin control and reporting lineage.',
  },
  branchesSection: {
    title: 'Branches',
    description: 'Branch entities drive manager scope, reporting visibility, and operational ownership.',
    addLabel: 'Add Branch',
    rowLabel: 'Branch',
  },
  permissionsSection: {
    title: 'Permissions & Visibility',
    description: 'Controls for CRM ownership and branch/agent visibility defaults.',
  },
}

function getLogoPreviewLabel(sourceUrl, fallbackLabel = 'Uploaded logo') {
  const value = String(sourceUrl || '').trim()
  if (!value) return ''
  if (value.startsWith('data:image/')) {
    return fallbackLabel
  }
  const clean = value.split('?')[0]
  const lastSegment = clean.split('/').filter(Boolean).pop() || ''
  if (!lastSegment) return fallbackLabel
  return decodeURIComponent(lastSegment)
}

export default function SettingsOrganisationPage({ section = 'organisation' }) {
  const { role, currentWorkspace, workspaceType } = useWorkspace()
  const resolvedWorkspaceType = currentWorkspace?.type || workspaceType || ''
  const copyKey = WORKSPACE_TYPE_COPY_KEYS[resolvedWorkspaceType] || (role === 'bond_originator' ? 'bond' : 'agency')
  const isBondOriginator = copyKey === 'bond'
  const copy = isBondOriginator ? BOND_SETTINGS_COPY : AGENCY_SETTINGS_COPY
  const {
    state: organisationContextState,
    loading: organisationContextLoading,
    error: organisationContextError,
    applyOrganisationState,
    refreshOrganisation,
  } = useOrganisation()
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogoTarget, setUploadingLogoTarget] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      if (organisationContextLoading) {
        setLoading(true)
        return
      }

      if (organisationContextState) {
        setState(organisationContextState)
        setError('')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const response = await refreshOrganisation({ forceRefresh: true })
        if (active) {
          setState(response)
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message || organisationContextError)
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
  }, [organisationContextError, organisationContextLoading, organisationContextState, refreshOrganisation])

  const form = useMemo(() => state?.organisation || null, [state])
  const onboarding = useMemo(() => state?.onboarding || null, [state])
  const membershipRole = normalizeOrganisationMembershipRole(state?.membershipRole, {
    appRole: role,
    workspaceType: resolvedWorkspaceType,
  })
  const canEdit = canManageOrganisationSettings({
    appRole: role,
    membershipRole,
    workspaceType: resolvedWorkspaceType,
  })
  const showBrandingOnly = section === 'branding'
  const headerKicker = showBrandingOnly ? 'Branding' : 'Organisation'
  const headerTitle = showBrandingOnly ? 'Branding' : copy.header.title
  const headerDescription = showBrandingOnly
    ? 'Brand assets used for portal, reporting, and outbound communication surfaces.'
    : copy.header.description

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

  function updateOrganisationAddress(value) {
    setState((previous) => {
      const nextAddress = value
        ? {
            formattedAddress: value.formattedAddress || '',
            addressLine1: value.streetAddress || value.formattedAddress || '',
            suburb: value.suburb || '',
            city: value.city || '',
            province: value.province || '',
            country: value.country || 'South Africa',
            postalCode: value.postalCode || '',
            latitude: value.latitude ?? null,
            longitude: value.longitude ?? null,
            googlePlaceId: value.placeId || '',
          }
        : {
            formattedAddress: '',
            addressLine1: '',
            suburb: '',
            city: '',
            province: '',
            country: 'South Africa',
            postalCode: '',
            latitude: null,
            longitude: null,
            googlePlaceId: '',
          }

      return {
        ...previous,
        organisation: {
          ...previous.organisation,
          ...nextAddress,
        },
        onboarding: {
          ...previous.onboarding,
          agencyInformation: {
            ...(previous.onboarding?.agencyInformation || {}),
            physicalAddress: nextAddress.addressLine1,
            formattedAddress: nextAddress.formattedAddress,
            province: nextAddress.province,
            country: nextAddress.country,
          },
        },
      }
    })
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

  async function handleLogoUpload(file, targetKey) {
    if (!file || !canEdit || !state) return
    try {
      const isIconLogo = targetKey === 'logoIcon'
      const isDarkLogo = targetKey === 'logoDark'
      setUploadingLogoTarget(targetKey)
      setError('')
      setMessage(isIconLogo ? 'Uploading icon logo...' : isDarkLogo ? 'Uploading dark logo...' : 'Uploading primary logo...')
      const upload = await uploadOrganisationBrandingAsset({
        file,
        variant: isIconLogo ? 'icon' : isDarkLogo ? 'dark' : 'primary',
      })
      const assetUrl = upload.resolvedUrl || upload.signedUrl || upload.publicUrl || ''
      const brandingFieldBucket = isIconLogo ? 'logoIconBucket' : isDarkLogo ? 'logoDarkBucket' : 'logoLightBucket'
      const brandingFieldPath = isIconLogo ? 'logoIconPath' : isDarkLogo ? 'logoDarkPath' : 'logoLightPath'

      const nextState = {
        ...state,
        onboarding: {
          ...state.onboarding,
          branding: {
            ...(state.onboarding?.branding || {}),
            [targetKey]: assetUrl || state.onboarding?.branding?.[targetKey] || '',
            [`${targetKey}Name`]: file.name,
            [brandingFieldBucket]: upload.bucket || state.onboarding?.branding?.[brandingFieldBucket] || '',
            [brandingFieldPath]: upload.path || state.onboarding?.branding?.[brandingFieldPath] || '',
          },
        },
        organisation: targetKey === 'logoLight'
          ? {
              ...state.organisation,
              logoUrl: assetUrl || state.organisation?.logoUrl || '',
            }
          : state.organisation,
      }

      setState(nextState)

      const saveTasks = [saveAgencyOnboardingDraft(nextState.onboarding)]
      if (targetKey === 'logoLight') {
        saveTasks.push(updateOrganisationSettings(nextState.organisation))
      }
      await Promise.all(saveTasks)

      applyOrganisationState(nextState)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('itg:organisation-branding-updated'))
      }

      setMessage(isIconLogo ? 'Icon logo uploaded and applied.' : isDarkLogo ? 'Dark logo uploaded and applied.' : 'Primary logo uploaded and applied.')
    } catch (uploadError) {
      setError(uploadError?.message || 'Unable to upload the selected logo. Please try again.')
    } finally {
      setUploadingLogoTarget('')
    }
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
        saveAgencyOnboardingDraft({
          ...state.onboarding,
          organisationType: isBondOriginator ? 'bond_originator' : state.onboarding?.organisationType,
        }, { syncCommercialAccess: true }),
      ])

      await upsertAreaFromAddress(buildOrganisationAddressValue(state.organisation, state.onboarding), { incrementListingCount: false })

      const nextState = {
        ...state,
        ...organisationResponse,
        membershipRole: organisationResponse.membershipRole || onboardingResponse.membershipRole || state?.membershipRole || 'viewer',
        onboarding: onboardingResponse.onboarding,
      }

      setState((previous) => ({
        ...previous,
        ...nextState,
      }))
      applyOrganisationState(nextState)

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('itg:organisation-branding-updated'))
      }

      if (onboardingResponse?.commercialSync?.skipped) {
        setMessage(`${copy.saved} Commercial access was not activated because the Commercial module is not installed on this environment.`)
      } else {
        setMessage(copy.saved)
      }
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <SettingsLoadingState label="Loading organisation settings…" />
  }

  if (!form || !onboarding) {
    return (
      <div className={settingsPageClass}>
        <SettingsPageHeader
          kicker={headerKicker}
          title={headerTitle}
          description={headerDescription}
        />
        <SettingsBanner tone="warning">
          {error || copy.unavailable}
        </SettingsBanner>
      </div>
    )
  }

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker={headerKicker}
        title={headerTitle}
        description={headerDescription}
      />

      {!canEdit ? <SettingsBanner tone="warning">{copy.readOnly}</SettingsBanner> : null}

      <form className="space-y-4" onSubmit={handleSave}>
        {!showBrandingOnly ? (
          <>
            <SettingsSectionCard title={copy.organisationSection.title} description={copy.organisationSection.description}>
              <div className={settingsGridClass}>
                <label className={settingsFieldClass}>
                  <span className="text-sm font-medium text-[#51657b]">{isBondOriginator ? 'Bond originator company name' : 'Agency name'}</span>
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
                  <span className="text-sm font-medium text-[#51657b]">{isBondOriginator ? 'Originator operating model' : 'Agency type'}</span>
                  <Field
                    as="select"
                    value={onboarding.agencyInformation?.agencyType || (isBondOriginator ? 'national' : 'residential')}
                    disabled={!canEdit}
                    onChange={(event) => updateAgencyField('agencyType', event.target.value)}
                  >
                    {(isBondOriginator ? BOND_ORIGINATOR_TYPE_OPTIONS : [
                      { value: 'residential', label: 'Residential' },
                      { value: 'commercial', label: 'Commercial' },
                      { value: 'mixed', label: 'Mixed' },
                    ]).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Field>
                </label>
                <label className={settingsFieldClass}>
                  <span className="text-sm font-medium text-[#51657b]">{isBondOriginator ? 'Origination focus' : 'Business focus'}</span>
                  <Field
                    as="select"
                    value={onboarding.agencyInformation?.businessFocus || (isBondOriginator ? 'bond_applications' : 'sales')}
                    disabled={!canEdit}
                    onChange={(event) => updateAgencyField('businessFocus', event.target.value)}
                  >
                    {(isBondOriginator ? BOND_BUSINESS_FOCUS_OPTIONS : [
                      { value: 'sales', label: 'Sales' },
                      { value: 'rentals', label: 'Rentals' },
                      { value: 'sales_rentals', label: 'Sales & Rentals' },
                    ]).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
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
                  <span className="text-sm font-medium text-[#51657b]">{isBondOriginator ? 'NCR / FSP / compliance number' : 'EAAB / PPRA number'}</span>
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
                  <span className="text-sm font-medium text-[#51657b]">{isBondOriginator ? 'HQ office number' : 'Main office number'}</span>
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
                  <span className="text-sm font-medium text-[#51657b]">{isBondOriginator ? 'HQ email address' : 'Main email address'}</span>
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
                <div className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
                  <AddressAutocomplete
                    label="Physical address"
                    value={buildOrganisationAddressValue(form, onboarding)}
                    disabled={!canEdit}
                    onChange={updateOrganisationAddress}
                    placeholder="12 Main Road Bedfordview"
                    description="Used for branch routing, profile quality, local search, and platform analytics."
                  />
                </div>
                <label className={settingsFieldClass}>
                  <span className="text-sm font-medium text-[#51657b]">Suburb</span>
                  <Field
                    value={form.suburb || ''}
                    disabled={!canEdit}
                    onChange={(event) => updateField('suburb', event.target.value)}
                  />
                </label>
                <label className={settingsFieldClass}>
                  <span className="text-sm font-medium text-[#51657b]">City</span>
                  <Field
                    value={form.city || ''}
                    disabled={!canEdit}
                    onChange={(event) => updateField('city', event.target.value)}
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
                  <span className="text-sm font-medium text-[#51657b]">Postal code</span>
                  <Field
                    value={form.postalCode || ''}
                    disabled={!canEdit}
                    onChange={(event) => updateField('postalCode', event.target.value)}
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

            <SettingsSectionCard title={copy.adminSection.title} description={copy.adminSection.description}>
              <div className={settingsGridClass}>
                <label className={settingsFieldClass}>
                  <span className="text-sm font-medium text-[#51657b]">{isBondOriginator ? 'HQ administrator full name' : 'Principal full name'}</span>
                  <Field value={onboarding.principalInformation?.principalFullName || ''} disabled={!canEdit} onChange={(event) => updatePrincipalField('principalFullName', event.target.value)} />
                </label>
                <label className={settingsFieldClass}>
                  <span className="text-sm font-medium text-[#51657b]">{isBondOriginator ? 'HQ administrator email' : 'Principal email'}</span>
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
              title={copy.branchesSection.title}
              description={copy.branchesSection.description}
              actions={canEdit ? <Button type="button" variant="secondary" onClick={addBranch}>{copy.branchesSection.addLabel}</Button> : null}
            >
              <div className="space-y-3">
                {(onboarding.branchStructure?.branches || []).map((branch, index) => (
                  <article key={branch.id} className="rounded-[12px] border border-[#e1e9f3] bg-[#f8fbff] p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold uppercase text-[#2e4259]">{copy.branchesSection.rowLabel} {index + 1}</h4>
                      {canEdit ? (
                        <Button type="button" variant="ghost" onClick={() => removeBranch(branch.id)} disabled={(onboarding.branchStructure?.branches || []).length <= 1}>
                          Remove
                        </Button>
                      ) : null}
                    </div>
                    <div className={settingsGridClass}>
                      <label className={settingsFieldClass}>
                        <span className="text-sm font-medium text-[#51657b]">{isBondOriginator ? 'Branch / region name' : 'Branch name'}</span>
                        <Field value={branch.branchName || ''} disabled={!canEdit} onChange={(event) => updateBranch(branch.id, 'branchName', event.target.value)} />
                      </label>
                      <label className={settingsFieldClass}>
                        <span className="text-sm font-medium text-[#51657b]">{isBondOriginator ? 'Office / region location' : 'Office location'}</span>
                        <Field value={branch.officeLocation || ''} disabled={!canEdit} onChange={(event) => updateBranch(branch.id, 'officeLocation', event.target.value)} />
                      </label>
                      <label className={settingsFieldClass}>
                        <span className="text-sm font-medium text-[#51657b]">{isBondOriginator ? 'Regional / branch manager' : 'Branch manager'}</span>
                        <Field value={branch.branchManager || ''} disabled={!canEdit} onChange={(event) => updateBranch(branch.id, 'branchManager', event.target.value)} />
                      </label>
                      <label className={settingsFieldClass}>
                        <span className="text-sm font-medium text-[#51657b]">{isBondOriginator ? 'Number of consultants' : 'Number of agents'}</span>
                        <Field value={branch.numberOfAgents || ''} disabled={!canEdit} onChange={(event) => updateBranch(branch.id, 'numberOfAgents', event.target.value)} />
                      </label>
                    </div>
                  </article>
                ))}
              </div>
            </SettingsSectionCard>
          </>
        ) : null}

        <SettingsSectionCard title="Branding" description="Brand assets used for portal, reporting, and outbound communication surfaces.">
          <div className="organisation-branding-grid">
            <article className="agency-brand-upload organisation-brand-upload-wide">
              <div className="organisation-brand-upload-head">
                <div>
                  <strong>Primary Logo</strong>
                  <p>Horizontal logo for sidebars, reports, and organisation headers.</p>
                </div>
                {canEdit ? (
                  <label className="agency-upload-trigger">
                    <input
                      type="file"
                      accept="image/png,image/svg+xml,image/jpeg,image/webp"
                      onChange={(event) => void handleLogoUpload(event.target.files?.[0], 'logoLight')}
                    />
                    {uploadingLogoTarget === 'logoLight' ? 'Uploading...' : 'Replace'}
                  </label>
                ) : null}
              </div>
              <div className="organisation-logo-preview-frame organisation-logo-preview-frame-primary">
                {onboarding.branding?.logoLight ? (
                  <img className="agency-logo-preview" src={onboarding.branding.logoLight} alt="Primary logo preview" />
                ) : (
                  <span>Primary logo not uploaded</span>
                )}
              </div>
              <p className="agency-upload-caption">
                {onboarding.branding?.logoLightName
                  ? onboarding.branding.logoLightName
                  : onboarding.branding?.logoLight
                    ? getLogoPreviewLabel(onboarding.branding.logoLight, 'Primary logo')
                    : 'Arch9 fallback branding is active.'}
              </p>
            </article>

            <article className="agency-brand-upload">
              <div className="organisation-brand-upload-head">
                <div>
                  <strong>Icon Logo</strong>
                  <p>Square mark for compact surfaces.</p>
                </div>
                {canEdit ? (
                  <label className="agency-upload-trigger">
                    <input
                      type="file"
                      accept="image/png,image/svg+xml,image/jpeg,image/webp"
                      onChange={(event) => void handleLogoUpload(event.target.files?.[0], 'logoIcon')}
                    />
                    {uploadingLogoTarget === 'logoIcon' ? 'Uploading...' : 'Replace'}
                  </label>
                ) : null}
              </div>
              <div className="organisation-logo-preview-frame organisation-logo-preview-frame-icon">
                {onboarding.branding?.logoIcon ? (
                  <img className="agency-logo-preview" src={onboarding.branding.logoIcon} alt="Icon logo preview" />
                ) : (
                  <span>Initials fallback</span>
                )}
              </div>
              <p className="agency-upload-caption">
                {onboarding.branding?.logoIconName
                  ? onboarding.branding.logoIconName
                  : onboarding.branding?.logoIcon
                    ? getLogoPreviewLabel(onboarding.branding.logoIcon, 'Icon logo')
                    : 'Small surfaces use the primary logo or initials.'}
              </p>
            </article>

            <article className="agency-brand-upload organisation-brand-upload-wide">
              <div className="organisation-brand-upload-head">
                <div>
                  <strong>Dark / High Contrast Logo</strong>
                  <p>Used where a stronger contrast asset is needed.</p>
                </div>
                {canEdit ? (
                  <label className="agency-upload-trigger">
                    <input
                      type="file"
                      accept="image/png,image/svg+xml,image/jpeg,image/webp"
                      onChange={(event) => void handleLogoUpload(event.target.files?.[0], 'logoDark')}
                    />
                    {uploadingLogoTarget === 'logoDark' ? 'Uploading...' : 'Replace'}
                  </label>
                ) : null}
              </div>
              <div className="organisation-logo-preview-frame organisation-logo-preview-frame-dark">
                {onboarding.branding?.logoDark ? (
                  <img className="agency-logo-preview agency-logo-preview-dark" src={onboarding.branding.logoDark} alt="Dark logo preview" />
                ) : (
                  <span>Dark logo not uploaded</span>
                )}
              </div>
              <p className="agency-upload-caption">
                {onboarding.branding?.logoDarkName
                  ? onboarding.branding.logoDarkName
                  : onboarding.branding?.logoDark
                    ? getLogoPreviewLabel(onboarding.branding.logoDark, 'Dark logo')
                    : 'Optional for theme-aware branding.'}
              </p>
            </article>

            <div className="organisation-colour-panel">
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Primary colour</span>
                <div className="organisation-colour-field">
                  <span style={{ backgroundColor: onboarding.branding?.brandColours?.primary || '#274C69' }} />
                  <Field value={onboarding.branding?.brandColours?.primary || ''} disabled={!canEdit} onChange={(event) => updateBrandColour('primary', event.target.value)} />
                </div>
              </label>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Secondary colour</span>
                <div className="organisation-colour-field">
                  <span style={{ backgroundColor: onboarding.branding?.brandColours?.secondary || '#10273A' }} />
                  <Field value={onboarding.branding?.brandColours?.secondary || ''} disabled={!canEdit} onChange={(event) => updateBrandColour('secondary', event.target.value)} />
                </div>
              </label>
            </div>
          </div>
        </SettingsSectionCard>

        {!showBrandingOnly ? (
          <SettingsSectionCard title={copy.permissionsSection.title} description={copy.permissionsSection.description}>
            <div className={settingsGridClass}>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">{isBondOriginator ? 'HQ scope' : 'Principal scope'}</span>
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
                <span className="text-sm font-medium text-[#51657b]">{isBondOriginator ? 'Consultant scope' : 'Agent scope'}</span>
                <Field as="select" value={onboarding.permissions?.agentScope || 'own'} disabled={!canEdit} onChange={(event) => updatePermissionField('agentScope', event.target.value)}>
                  {PERMISSION_SCOPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </Field>
              </label>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">{isBondOriginator ? 'Application visibility' : 'CRM lead visibility'}</span>
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
                    <span>{isBondOriginator ? 'Allow cross-branch application collaboration' : 'Allow cross-branch collaboration'}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(onboarding.permissions?.allowCrossBranchCollaboration)}
                      disabled={!canEdit}
                      onChange={(event) => updatePermissionField('allowCrossBranchCollaboration', event.target.checked)}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 text-sm text-[#51657b]">
                    <span>{isBondOriginator ? 'Allow shared application queues' : 'Allow shared lead pools'}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(onboarding.permissions?.allowSharedLeadPools)}
                      disabled={!canEdit}
                      onChange={(event) => updatePermissionField('allowSharedLeadPools', event.target.checked)}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 text-sm text-[#51657b]">
                    <span>{isBondOriginator ? 'Allow shared developer/development access' : 'Allow shared listings'}</span>
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
        ) : null}

        {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
        {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}

        {canEdit ? (
          <div className={settingsActionRowClass}>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : showBrandingOnly ? 'Save Branding' : isBondOriginator ? 'Save Bond Originator Settings' : 'Save Organisation Settings'}
            </Button>
          </div>
        ) : null}
      </form>
    </div>
  )
}
