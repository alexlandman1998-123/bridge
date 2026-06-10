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

function getInitials(form = {}) {
  const source = [form.firstName, form.lastName].filter(Boolean).join(' ') || form.email || 'User'
  return String(source)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'U'
}

function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Unable to read the selected image.'))
    reader.readAsDataURL(file)
  })
}

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

  async function handleAvatarFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file for your profile picture.')
      event.target.value = ''
      return
    }
    if (file.size > 1.5 * 1024 * 1024) {
      setError('Profile pictures must be smaller than 1.5MB.')
      event.target.value = ''
      return
    }
    try {
      setError('')
      const dataUrl = await readImageFileAsDataUrl(file)
      updateField('avatarUrl', dataUrl)
    } catch (readError) {
      setError(readError.message)
    } finally {
      event.target.value = ''
    }
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
        description="Set your profile details, local defaults, notifications, and account security."
      />

      <form className="space-y-0" onSubmit={handleSave}>
        <SettingsSectionCard title="Profile" description="These details identify you across Bridge and external workspaces.">
          <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-[#e1e9f2] bg-[#fbfdff] p-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <span className="inline-flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#d7e2ef] bg-white text-lg font-semibold text-[#244e70] shadow-sm">
                {form.avatarUrl ? <img src={form.avatarUrl} alt="" className="h-full w-full object-cover" /> : getInitials(form)}
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[#10243a]">Profile picture</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-[#60758d]">Shown in Bridge headers, agent workspaces, and seller-facing appointment surfaces where your profile is used.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#24364b] shadow-sm transition hover:bg-[#f7fafc]">
                Upload Image
                <input type="file" accept="image/*" className="sr-only" onChange={handleAvatarFileChange} />
              </label>
              {form.avatarUrl ? (
                <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-[#f0d7d7] bg-white px-4 text-sm font-semibold text-[#9a4038] shadow-sm transition hover:bg-[#fff6f6]" onClick={() => updateField('avatarUrl', '')}>
                  Remove
                </button>
              ) : null}
            </div>
          </div>
          <div className={settingsGridClass}>
            <label className={`${settingsFieldClass} md:col-span-2`}>
              <span className="text-sm font-medium text-[#51657b]">Profile picture URL</span>
              <Field value={form.avatarUrl || ''} onChange={(event) => updateField('avatarUrl', event.target.value)} placeholder="https://..." />
            </label>
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
          <div>
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
