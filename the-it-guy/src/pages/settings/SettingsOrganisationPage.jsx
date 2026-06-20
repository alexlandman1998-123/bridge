import { useEffect, useMemo, useState } from 'react'
import AddressAutocomplete from '../../components/location/AddressAutocomplete'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import { useOrganisation } from '../../context/OrganisationContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { createAgencyBranchDraft } from '../../lib/agencyOnboarding'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import { upsertAreaFromAddress } from '../../lib/location/upsertArea'
import { saveAgencyOnboardingDraft, updateOrganisationSettings, uploadOrganisationBrandingAsset } from '../../lib/settingsApi'
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

const PARTNER_PROFILE_CONTENT_ROLES = [
  { key: 'agency', label: 'Agency', hint: 'Displayed when the organisation is used as an agency partner.' },
  { key: 'bond_originator', label: 'Bond Originator', hint: 'Displayed when the organisation is used as a bond partner.' },
  { key: 'attorney_firm', label: 'Attorney Firm', hint: 'Displayed when the organisation is used as a legal partner.' },
  { key: 'developer_company', label: 'Developer', hint: 'Displayed when the organisation is used as a development partner.' },
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

function normalizePartnerProfileContent(content = {}) {
  const source = content && typeof content === 'object' ? content : {}
  return PARTNER_PROFILE_CONTENT_ROLES.reduce((accumulator, role) => {
    const roleContent = source[role.key] && typeof source[role.key] === 'object' ? source[role.key] : {}
    accumulator[role.key] = {
      aboutCompany: roleContent.aboutCompany || roleContent.about_company || '',
      serviceDelivery: roleContent.serviceDelivery || roleContent.service_delivery || '',
    }
    return accumulator
  }, {})
}

export default function SettingsOrganisationPage() {
  const { role } = useWorkspace()
  const isBondOriginator = role === 'bond_originator'
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
  const organisationSettingsJson = useMemo(() => form?.settingsJson || {}, [form?.settingsJson])
  const partnerProfileContent = useMemo(
    () => normalizePartnerProfileContent(organisationSettingsJson.partnerProfileContent),
    [organisationSettingsJson.partnerProfileContent],
  )
  const membershipRole = normalizeOrganisationMembershipRole(state?.membershipRole)
  const canEdit = canManageOrganisationSettings({
    appRole: role,
    membershipRole,
  })

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

  function updatePartnerProfileContentField(roleKey, fieldKey, value) {
    setState((previous) => ({
      ...previous,
      organisation: {
        ...(previous.organisation || {}),
        settingsJson: {
          ...((previous.organisation && previous.organisation.settingsJson) || {}),
          partnerProfileContent: {
            ...normalizePartnerProfileContent(previous.organisation?.settingsJson?.partnerProfileContent),
            [roleKey]: {
              ...normalizePartnerProfileContent(previous.organisation?.settingsJson?.partnerProfileContent)[roleKey],
              [fieldKey]: value,
            },
          },
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
          kicker="Organisation"
          title={copy.header.title}
          description={copy.header.description}
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
        kicker="Organisation"
        title={copy.header.title}
        description={copy.header.description}
      />

      {!canEdit ? <SettingsBanner tone="warning">{copy.readOnly}</SettingsBanner> : null}

      <form className="space-y-0" onSubmit={handleSave}>
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
          <div className="space-y-4">
            {(onboarding.branchStructure?.branches || []).map((branch, index) => (
              <article key={branch.id} className="rounded-[16px] border border-[#e1e9f3] bg-[#f8fbff] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#2e4259]">{copy.branchesSection.rowLabel} {index + 1}</h4>
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

        <SettingsSectionCard
          title="Partner Profile Content"
          description="Write the public-facing company overview and service delivery copy that appears on Bridge partner profiles. Each role can be edited separately."
        >
          <div className="grid gap-4 xl:grid-cols-2">
            {PARTNER_PROFILE_CONTENT_ROLES.map((roleOption) => {
              const roleContent = partnerProfileContent[roleOption.key] || {}
              return (
                <article key={roleOption.key} className="rounded-[18px] border border-[#e4ebf2] bg-[#fbfdff] p-5">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#2e4259]">{roleOption.label}</h4>
                    <p className="text-sm leading-6 text-[#6b7d93]">{roleOption.hint}</p>
                  </div>
                  <div className="mt-4 grid gap-4">
                    <label className={settingsFieldClass}>
                      <span className="text-sm font-medium text-[#51657b]">About the company</span>
                      <Field
                        as="textarea"
                        value={roleContent.aboutCompany || ''}
                        disabled={!canEdit}
                        onChange={(event) => updatePartnerProfileContentField(roleOption.key, 'aboutCompany', event.target.value)}
                        placeholder={`Describe how this ${roleOption.label.toLowerCase()} presents itself to Bridge partners.`}
                      />
                    </label>
                    <label className={settingsFieldClass}>
                      <span className="text-sm font-medium text-[#51657b]">Service delivery</span>
                      <Field
                        as="textarea"
                        value={roleContent.serviceDelivery || ''}
                        disabled={!canEdit}
                        onChange={(event) => updatePartnerProfileContentField(roleOption.key, 'serviceDelivery', event.target.value)}
                        placeholder={`Describe the service delivery style for this ${roleOption.label.toLowerCase()} profile.`}
                      />
                    </label>
                  </div>
                </article>
              )
            })}
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard title="Branding" description="Brand assets used for portal, reporting, and outbound communication surfaces.">
          <div className={settingsGridClass}>
            <article className="agency-brand-upload">
              <strong>Primary Logo</strong>
              <p className="mt-1 text-sm leading-5 text-[#60758d]">Used on profile pages, reports and organisation headers. Recommended: horizontal logo.</p>
              {canEdit ? (
                <label className="agency-upload-trigger">
                  <input
                    type="file"
                    accept="image/png,image/svg+xml,image/jpeg,image/webp"
                    onChange={(event) => void handleLogoUpload(event.target.files?.[0], 'logoLight')}
                  />
                  {uploadingLogoTarget === 'logoLight' ? 'Uploading...' : 'Upload Primary Logo'}
                </label>
              ) : null}
              <p className="agency-upload-caption">
                {onboarding.branding?.logoLightName
                  ? `Uploaded: ${onboarding.branding.logoLightName}`
                  : onboarding.branding?.logoLight
                    ? `Uploaded: ${getLogoPreviewLabel(onboarding.branding.logoLight, 'Primary logo')}`
                    : 'No primary logo uploaded yet (Bridge fallback is active)'}
              </p>
              {onboarding.branding?.logoLight ? (
                <img className="agency-logo-preview" src={onboarding.branding.logoLight} alt="Light logo preview" />
              ) : (
                <div className="rounded-[12px] border border-dashed border-[#d9e4ef] bg-[#f8fbff] px-4 py-6 text-center text-sm text-[#6b7d93]">
                  Bridge fallback branding will be used for large brand surfaces.
                </div>
              )}
            </article>

            <article className="agency-brand-upload">
              <strong>Icon Logo</strong>
              <p className="mt-1 text-sm leading-5 text-[#60758d]">Used on cards, tables, lists and dashboards. Recommended: square logo mark.</p>
              {canEdit ? (
                <label className="agency-upload-trigger">
                  <input
                    type="file"
                    accept="image/png,image/svg+xml,image/jpeg,image/webp"
                    onChange={(event) => void handleLogoUpload(event.target.files?.[0], 'logoIcon')}
                  />
                  {uploadingLogoTarget === 'logoIcon' ? 'Uploading...' : 'Upload Icon Logo'}
                </label>
              ) : null}
              <p className="agency-upload-caption">
                {onboarding.branding?.logoIconName
                  ? `Uploaded: ${onboarding.branding.logoIconName}`
                  : onboarding.branding?.logoIcon
                    ? `Uploaded: ${getLogoPreviewLabel(onboarding.branding.logoIcon, 'Icon logo')}`
                    : 'No icon logo uploaded yet. Small surfaces will fall back to the primary logo or initials.'}
              </p>
              {onboarding.branding?.logoIcon ? (
                <img className="agency-logo-preview" src={onboarding.branding.logoIcon} alt="Icon logo preview" />
              ) : (
                <div className="rounded-[12px] border border-dashed border-[#d9e4ef] bg-[#f8fbff] px-4 py-6 text-center text-sm text-[#6b7d93]">
                  Initials will be used when no logo is available.
                </div>
              )}
            </article>

            <article className="agency-brand-upload">
              <strong>Dark / High Contrast Logo</strong>
              {canEdit ? (
                <label className="agency-upload-trigger">
                  <input
                    type="file"
                    accept="image/png,image/svg+xml,image/jpeg,image/webp"
                    onChange={(event) => void handleLogoUpload(event.target.files?.[0], 'logoDark')}
                  />
                  {uploadingLogoTarget === 'logoDark' ? 'Uploading…' : 'Upload Dark Logo'}
                </label>
              ) : null}
              <p className="agency-upload-caption">
                {onboarding.branding?.logoDarkName
                  ? `Uploaded: ${onboarding.branding.logoDarkName}`
                  : onboarding.branding?.logoDark
                    ? `Uploaded: ${getLogoPreviewLabel(onboarding.branding.logoDark, 'Dark logo')}`
                    : 'No dark/high-contrast logo uploaded yet'}
              </p>
              {onboarding.branding?.logoDark ? (
                <img className="agency-logo-preview agency-logo-preview-dark" src={onboarding.branding.logoDark} alt="Dark logo preview" />
              ) : (
                <div className="rounded-[12px] border border-dashed border-[#d9e4ef] bg-[#f8fbff] px-4 py-6 text-center text-sm text-[#6b7d93]">
                  Optional for future theme-aware branding.
                </div>
              )}
            </article>

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

        {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
        {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}

        {canEdit ? (
          <div className={settingsActionRowClass}>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : isBondOriginator ? 'Save Bond Originator Settings' : 'Save Organisation Settings'}
            </Button>
          </div>
        ) : null}
      </form>
    </div>
  )
}
