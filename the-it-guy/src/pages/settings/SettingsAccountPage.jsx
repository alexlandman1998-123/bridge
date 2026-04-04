import { useEffect, useState } from 'react'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import { useWorkspace } from '../../context/WorkspaceContext'
import { changePassword, fetchAccountSettings, updateAccountSettings } from '../../lib/settingsApi'
import {
  SettingsBanner,
  SettingsLoadingState,
  SettingsPageHeader,
  SettingsSectionCard,
  SettingsToggleRow,
  settingsActionRowClass,
  settingsFieldClass,
  settingsGridClass,
  settingsPageClass,
} from './settingsUi'

export default function SettingsAccountPage() {
  const { refreshProfile } = useWorkspace()
  const [form, setForm] = useState(null)
  const [passwordForm, setPasswordForm] = useState({ password: '', confirmPassword: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        const response = await fetchAccountSettings()
        if (active) {
          setForm(response)
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

  function updateField(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  function updateNotification(key, value) {
    setForm((previous) => ({
      ...previous,
      notificationPreferences: {
        ...previous.notificationPreferences,
        [key]: value,
      },
    }))
  }

  async function handleSave(event) {
    event.preventDefault()
    try {
      setSaving(true)
      setError('')
      setMessage('')
      await updateAccountSettings(form)
      await refreshProfile()
      setMessage('Account settings saved.')
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handlePasswordSave(event) {
    event.preventDefault()
    if (!passwordForm.password) {
      setPasswordError('Enter a new password.')
      return
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      setPasswordError('Passwords do not match.')
      return
    }

    try {
      setPasswordSaving(true)
      setPasswordError('')
      setPasswordMessage('')
      await changePassword({ password: passwordForm.password })
      setPasswordForm({ password: '', confirmPassword: '' })
      setPasswordMessage('Password updated.')
    } catch (saveError) {
      setPasswordError(saveError.message)
    } finally {
      setPasswordSaving(false)
    }
  }

  if (loading || !form) {
    return <SettingsLoadingState label="Loading account settings…" />
  }

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Account"
        title="Profile and preferences"
        description="Manage your personal profile, security details, and notification defaults."
      />

      <form className="space-y-5" onSubmit={handleSave}>
        <SettingsSectionCard title="Profile" description="These details identify you across Bridge and external workspaces.">
          <div className={settingsGridClass}>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">First name</span>
              <Field value={form.firstName} onChange={(event) => updateField('firstName', event.target.value)} />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Last name</span>
              <Field value={form.lastName} onChange={(event) => updateField('lastName', event.target.value)} />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Email</span>
              <Field value={form.email} disabled />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Phone number</span>
              <Field value={form.phoneNumber} onChange={(event) => updateField('phoneNumber', event.target.value)} />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Job title</span>
              <Field value={form.title} onChange={(event) => updateField('title', event.target.value)} />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Company</span>
              <Field value={form.companyName} onChange={(event) => updateField('companyName', event.target.value)} />
            </label>
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard title="Preferences" description="Set the local defaults used when you navigate the internal workspace.">
          <div className={settingsGridClass}>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Timezone</span>
              <Field as="select" value={form.timezone} onChange={(event) => updateField('timezone', event.target.value)}>
                <option value="Africa/Johannesburg">Africa/Johannesburg</option>
                <option value="UTC">UTC</option>
                <option value="Europe/London">Europe/London</option>
              </Field>
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Date format</span>
              <Field as="select" value={form.dateFormat} onChange={(event) => updateField('dateFormat', event.target.value)}>
                <option value="DD MMM YYYY">DD MMM YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              </Field>
            </label>
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard title="Notifications" description="Choose which updates should reach you by email or inside the platform.">
          <div className="grid gap-3">
            <SettingsToggleRow
              title="Email notifications on mentions"
              description="Send email when you are explicitly mentioned in comments or updates."
              checked={form.notificationPreferences.emailMentions}
              onChange={(value) => updateNotification('emailMentions', value)}
            />
            <SettingsToggleRow
              title="Email notifications on document uploads"
              description="Send email when new transaction documents are uploaded for your scope."
              checked={form.notificationPreferences.emailDocumentUploads}
              onChange={(value) => updateNotification('emailDocumentUploads', value)}
            />
            <SettingsToggleRow
              title="Email notifications on workflow changes"
              description="Send email when transactions move between operational stages."
              checked={form.notificationPreferences.emailWorkflowChanges}
              onChange={(value) => updateNotification('emailWorkflowChanges', value)}
            />
            <SettingsToggleRow
              title="In-app notifications"
              description="Show task, handoff, and document activity in the Bridge workspace."
              checked={form.notificationPreferences.inAppNotifications}
              onChange={(value) => updateNotification('inAppNotifications', value)}
            />
          </div>
        </SettingsSectionCard>

        {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
        {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}

        <div className={settingsActionRowClass}>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </form>

      <form onSubmit={handlePasswordSave}>
        <SettingsSectionCard title="Security" description="Update your password for internal workspace access.">
          <div className={settingsGridClass}>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">New password</span>
              <Field
                type="password"
                value={passwordForm.password}
                onChange={(event) => setPasswordForm((previous) => ({ ...previous, password: event.target.value }))}
              />
            </label>
            <label className={settingsFieldClass}>
              <span className="text-sm font-medium text-[#51657b]">Confirm password</span>
              <Field
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(event) => setPasswordForm((previous) => ({ ...previous, confirmPassword: event.target.value }))}
              />
            </label>
          </div>

          {passwordError ? <div className="mt-5"><SettingsBanner tone="error">{passwordError}</SettingsBanner></div> : null}
          {passwordMessage ? <div className="mt-5"><SettingsBanner tone="success">{passwordMessage}</SettingsBanner></div> : null}

          <div className={`${settingsActionRowClass} mt-5`}>
            <Button type="submit" disabled={passwordSaving}>
              {passwordSaving ? 'Updating…' : 'Change Password'}
            </Button>
          </div>
        </SettingsSectionCard>
      </form>
    </div>
  )
}
