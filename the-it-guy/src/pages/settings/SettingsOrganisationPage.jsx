import { useEffect, useMemo, useState } from 'react'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import { useWorkspace } from '../../context/WorkspaceContext'
import { fetchOrganisationSettings, updateOrganisationSettings } from '../../lib/settingsApi'
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

export default function SettingsOrganisationPage() {
  const { role } = useWorkspace()
  const canEdit = role === 'developer'
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
        const response = await fetchOrganisationSettings()
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

  function updateField(key, value) {
    setState((previous) => ({
      ...previous,
      organisation: {
        ...previous.organisation,
        [key]: value,
      },
    }))
  }

  async function handleSave(event) {
    event.preventDefault()
    if (!canEdit) return

    try {
      setSaving(true)
      setError('')
      setMessage('')
      const response = await updateOrganisationSettings(state.organisation)
      setState(response)
      setMessage('Organisation settings saved.')
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !form) {
    return <SettingsLoadingState label="Loading organisation settings…" />
  }

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Organisation"
        title="Company identity and support defaults"
        description="Manage company details, support defaults, and workspace identity settings."
      />

      {!canEdit ? <SettingsBanner tone="warning">Read-only for your role. Developer admins can edit these settings.</SettingsBanner> : null}

      <form className="space-y-0" onSubmit={handleSave}>
        <SettingsSectionCard title="General" description="Organisation identity shown in internal and shared workspace contexts.">
          <div className={settingsGridClass}>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Organisation name</span>
              <Field value={form.name} disabled={!canEdit} onChange={(event) => updateField('name', event.target.value)} />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Display name</span>
              <Field value={form.displayName} disabled={!canEdit} onChange={(event) => updateField('displayName', event.target.value)} />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Company email</span>
              <Field value={form.companyEmail} disabled={!canEdit} onChange={(event) => updateField('companyEmail', event.target.value)} />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Company phone</span>
              <Field value={form.companyPhone} disabled={!canEdit} onChange={(event) => updateField('companyPhone', event.target.value)} />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Website</span>
              <Field value={form.website} disabled={!canEdit} onChange={(event) => updateField('website', event.target.value)} />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Logo URL</span>
              <Field value={form.logoUrl} disabled={!canEdit} onChange={(event) => updateField('logoUrl', event.target.value)} />
            </label>
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard title="Address" description="Company and support address details used for operational records and invoices.">
          <div className={settingsGridClass}>
            <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
              <span className="text-sm font-medium text-[#51657b]">Address line 1</span>
              <Field value={form.addressLine1} disabled={!canEdit} onChange={(event) => updateField('addressLine1', event.target.value)} />
            </label>
            <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
              <span className="text-sm font-medium text-[#51657b]">Address line 2</span>
              <Field value={form.addressLine2} disabled={!canEdit} onChange={(event) => updateField('addressLine2', event.target.value)} />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">City</span>
              <Field value={form.city} disabled={!canEdit} onChange={(event) => updateField('city', event.target.value)} />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Province</span>
              <Field value={form.province} disabled={!canEdit} onChange={(event) => updateField('province', event.target.value)} />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Postal code</span>
              <Field value={form.postalCode} disabled={!canEdit} onChange={(event) => updateField('postalCode', event.target.value)} />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Country</span>
              <Field value={form.country} disabled={!canEdit} onChange={(event) => updateField('country', event.target.value)} />
            </label>
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard title="Support defaults" description="Primary support contacts surfaced in shared-facing contexts and future notifications.">
          <div className={settingsGridClass}>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Support email</span>
              <Field value={form.supportEmail} disabled={!canEdit} onChange={(event) => updateField('supportEmail', event.target.value)} />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Support phone</span>
              <Field value={form.supportPhone} disabled={!canEdit} onChange={(event) => updateField('supportPhone', event.target.value)} />
            </label>
            <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
              <span className="text-sm font-medium text-[#51657b]">Primary contact person</span>
              <Field
                value={form.primaryContactPerson}
                disabled={!canEdit}
                onChange={(event) => updateField('primaryContactPerson', event.target.value)}
              />
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
