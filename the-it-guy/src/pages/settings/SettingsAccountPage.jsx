import { useEffect, useState } from 'react'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import { useWorkspace } from '../../context/WorkspaceContext'
import { changePassword, fetchAccountSettings, updateAccountSettings, uploadAccountAvatar } from '../../lib/settingsApi'
import {
  SettingsBanner,
  SettingsLoadingState,
  SettingsPageHeader,
  SettingsSectionCard,
  SettingsStickySaveBar,
  SettingsToggleRow,
  settingsCardClass,
  settingsFieldClass,
  settingsFieldSpanClass,
  settingsGridClass,
  settingsPageClass,
} from './settingsUi'

const AVATAR_MAX_SOURCE_BYTES = 12 * 1024 * 1024
const AVATAR_TARGET_SIZE = 512
const AVATAR_MAX_FILE_BYTES = 650 * 1024
const AVATAR_QUALITIES = [0.86, 0.76, 0.66, 0.56, 0.46]

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

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Arch9 could not read that image. Try a JPG or PNG file.'))
    image.src = dataUrl
  })
}

async function createProfileAvatarCanvas(file) {
  if (file.size > AVATAR_MAX_SOURCE_BYTES) {
    throw new Error('Choose an image smaller than 12MB. Arch9 will resize it before saving.')
  }

  const originalDataUrl = await readImageFileAsDataUrl(file)
  const image = await loadImageFromDataUrl(originalDataUrl)
  const sourceSize = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height)

  if (!sourceSize) {
    throw new Error('Arch9 could not read that image. Try a different profile picture.')
  }

  const outputSize = Math.min(AVATAR_TARGET_SIZE, sourceSize)
  const sourceX = Math.max(0, ((image.naturalWidth || image.width) - sourceSize) / 2)
  const sourceY = Math.max(0, ((image.naturalHeight || image.height) - sourceSize) / 2)
  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Arch9 could not resize that image in this browser. Try a smaller JPG or PNG file.')
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, outputSize, outputSize)
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, outputSize, outputSize)

  return canvas
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality)
  })
}

async function createProfileAvatarFile(file) {
  const canvas = await createProfileAvatarCanvas(file)

  for (const quality of AVATAR_QUALITIES) {
    const blob = await canvasToBlob(canvas, quality)
    if (blob && blob.size <= AVATAR_MAX_FILE_BYTES) {
      return new File([blob], 'profile-avatar.jpg', { type: 'image/jpeg' })
    }
  }

  throw new Error('Arch9 resized the image, but it is still too large. Try a simpler JPG or PNG file.')
}

export default function SettingsAccountPage({ section = 'profile' }) {
  const { refreshProfile, updateLocalProfile } = useWorkspace()
  const [form, setForm] = useState(null)
  const [initialForm, setInitialForm] = useState(null)
  const [passwordForm, setPasswordForm] = useState({ password: '', confirmPassword: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [avatarProcessing, setAvatarProcessing] = useState(false)
  const [avatarError, setAvatarError] = useState('')
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
          setInitialForm(response)
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
      setAvatarError('Choose an image file for your profile picture.')
      event.target.value = ''
      return
    }
    if (file.size > AVATAR_MAX_SOURCE_BYTES) {
      setAvatarError('Choose an image smaller than 12MB. Arch9 will resize it before saving.')
      event.target.value = ''
      return
    }
    try {
      setError('')
      setMessage('')
      setAvatarError('')
      setAvatarProcessing(true)
      const avatarFile = await createProfileAvatarFile(file)
      const upload = await uploadAccountAvatar({ file: avatarFile })
      const avatarUrl = upload.resolvedUrl
      const saved = await updateAccountSettings({ ...form, avatarUrl })
      const nextForm = { ...saved, avatarUrl: saved.avatarUrl || avatarUrl }
      setForm(nextForm)
      setInitialForm(nextForm)
      updateLocalProfile({ avatarUrl: nextForm.avatarUrl, avatar_url: nextForm.avatarUrl })
      setMessage('Profile picture saved.')
    } catch (uploadError) {
      setAvatarError(uploadError.message)
    } finally {
      setAvatarProcessing(false)
      event.target.value = ''
    }
  }

  async function handleRemoveAvatar() {
    try {
      setSaving(true)
      setError('')
      setMessage('')
      setAvatarError('')
      const saved = await updateAccountSettings({ ...form, avatarUrl: '' })
      setForm(saved)
      setInitialForm(saved)
      updateLocalProfile({ avatarUrl: '', avatar_url: '' })
      setMessage('Profile picture removed.')
    } catch (removeError) {
      setAvatarError(removeError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSave(event) {
    event?.preventDefault?.()
    try {
      setSaving(true)
      setError('')
      setMessage('')
      const saved = await updateAccountSettings(form)
      setForm(saved)
      setInitialForm(saved)
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

  const hasUnsavedChanges = JSON.stringify(form || {}) !== JSON.stringify(initialForm || {})
  const profileName = [form.firstName, form.lastName].filter(Boolean).join(' ') || form.email || 'Arch9 User'
  const showProfile = section === 'profile'
  const showSecurity = section === 'security'
  const showNotifications = section === 'notifications'
  const showPreferences = section === 'preferences'
  const sectionMeta = showSecurity
    ? {
        kicker: 'Personal',
        title: 'Security',
        description: 'Password, multi-factor authentication, sessions, and login history.',
      }
    : showNotifications
      ? {
          kicker: 'Personal',
          title: 'Notifications',
          description: 'Email, in-app, SMS, and critical alert preferences.',
        }
      : showPreferences
        ? {
            kicker: 'Personal',
            title: 'Preferences',
            description: 'Language, timezone, date format, and regional defaults.',
          }
        : {
            kicker: 'Personal',
            title: 'Profile',
            description: 'Personal Information',
          }

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker={sectionMeta.kicker}
        title={sectionMeta.title}
        description={sectionMeta.description}
      />

      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
      {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}

      {showProfile ? (
        <form className="space-y-5" onSubmit={handleSave}>
          <SettingsSectionCard title="Profile Photo" description="Avatar and visible identity across Arch9 and seller-facing workflows.">
            <div className="flex flex-col gap-4 rounded-[16px] border border-[#e1e9f2] bg-[#fbfdff] p-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-4">
                <span className="inline-flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#d7e2ef] bg-white text-lg font-semibold text-[#244e70] shadow-sm">
                  {form.avatarUrl ? <img src={form.avatarUrl} alt="" className="h-full w-full object-cover" /> : getInitials(form)}
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-[#10243a]">{profileName}</h2>
                  <p className="mt-1 max-w-xl text-sm font-normal leading-6 text-[#60758d]">{form.title || 'Job title not set'} · {form.companyName || 'Organisation pending'}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 sm:ml-auto">
                <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-[10px] border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#24364b] shadow-sm transition hover:bg-[#f7fafc]">
                  {avatarProcessing ? 'Preparing...' : 'Upload image'}
                  <input type="file" accept="image/*" className="sr-only" disabled={avatarProcessing} onChange={handleAvatarFileChange} />
                </label>
                {form.avatarUrl ? (
                  <button type="button" className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#f0d7d7] bg-white px-4 text-sm font-semibold text-[#9a4038] shadow-sm transition hover:bg-[#fff6f6]" disabled={saving || avatarProcessing} onClick={handleRemoveAvatar}>
                    {saving ? 'Removing...' : 'Remove'}
                  </button>
                ) : null}
              </div>
            </div>
            {avatarError ? <SettingsBanner tone="error">{avatarError}</SettingsBanner> : null}
          </SettingsSectionCard>

          <SettingsSectionCard title="Personal Information" description="Keep visible contact details current for collaboration and client-facing workflows.">
            <div className={settingsGridClass}>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">First name</span>
                <Field value={form.firstName} onChange={(event) => updateField('firstName', event.target.value)} />
              </label>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Surname</span>
                <Field value={form.lastName} onChange={(event) => updateField('lastName', event.target.value)} />
              </label>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Email</span>
                <Field value={form.email} disabled />
              </label>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Phone</span>
                <Field value={form.phoneNumber} onChange={(event) => updateField('phoneNumber', event.target.value)} />
              </label>
              <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
                <span className="text-sm font-medium text-[#51657b]">Bio</span>
                <Field as="textarea" value="" placeholder="Bio is not stored for this workspace yet." disabled />
              </label>
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard title="Employment" description="Employment details are used in signatures, assignment views and internal directories.">
            <div className={settingsGridClass}>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Job title</span>
                <Field value={form.title} onChange={(event) => updateField('title', event.target.value)} />
              </label>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Organisation</span>
                <Field value={form.companyName} onChange={(event) => updateField('companyName', event.target.value)} />
              </label>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Department</span>
                <Field value="" placeholder="Not configured" disabled />
              </label>
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard title="Preferences" description="Local defaults for dates and workspace display.">
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
                <span className="text-sm font-medium text-[#51657b]">Language</span>
                <Field as="select" value="en-ZA" disabled>
                  <option value="en-ZA">English (South Africa)</option>
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
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Theme</span>
                <Field as="select" value="system" disabled>
                  <option value="system">System default</option>
                </Field>
              </label>
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard title="Danger Zone" description="Account deletion is disabled while your user is linked to active organisation workflows.">
            <button type="button" className="inline-flex min-h-10 items-center rounded-[10px] border border-[#f0d7d7] bg-white px-4 text-sm font-semibold text-[#9a4038] opacity-60" disabled>
              Delete account
            </button>
          </SettingsSectionCard>
        </form>
      ) : null}

      {showSecurity ? (
        <div className="space-y-5">
          <form onSubmit={handlePasswordSave}>
            <SettingsSectionCard title="Password" description="Update your password for internal workspace access.">
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
              <div className="mt-5 flex justify-end border-t border-[#e8eef5] pt-4">
                <Button type="submit" disabled={passwordSaving}>
                  {passwordSaving ? 'Updating...' : 'Change password'}
                </Button>
              </div>
            </SettingsSectionCard>
          </form>

          <SettingsSectionCard title="Two-factor authentication" description="Add a second verification step before account access.">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#162334]">MFA status</p>
                <p className="mt-1 text-sm font-normal text-[#60758d]">Two-factor authentication is not enabled for this account.</p>
              </div>
              <Button type="button" variant="secondary" disabled>Enable MFA</Button>
            </div>
          </SettingsSectionCard>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className={settingsCardClass}>
              <h3 className="text-base font-semibold text-[#162334]">Active Sessions</h3>
              <p className="mt-2 text-sm font-normal leading-6 text-[#60758d]">Current browser session is active. Session management will appear here when device telemetry is available.</p>
              <Button type="button" variant="secondary" className="mt-4" disabled>Log out other sessions</Button>
            </section>
            <section className={settingsCardClass}>
              <h3 className="text-base font-semibold text-[#162334]">Connected Devices</h3>
              <p className="mt-2 text-sm font-normal leading-6 text-[#60758d]">Trusted device management is not configured yet.</p>
            </section>
          </div>

          <SettingsSectionCard title="Login History" description="Recent authentication events for this account.">
            <div className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-[#f9fbfe] px-5 py-8 text-center text-sm text-[#60758d]">No login history is available.</div>
          </SettingsSectionCard>
        </div>
      ) : null}

      {showNotifications ? (
        <form className="space-y-5" onSubmit={handleSave}>
          <SettingsSectionCard title="Email" description="Messages sent to your account email.">
            <SettingsToggleRow
              title="Mentions"
              description="Send email when you are explicitly mentioned in comments or updates."
              checked={form.notificationPreferences.emailMentions}
              onChange={(value) => updateNotification('emailMentions', value)}
            />
            <SettingsToggleRow
              title="Document uploads"
              description="Send email when new transaction documents are uploaded for your scope."
              checked={form.notificationPreferences.emailDocumentUploads}
              onChange={(value) => updateNotification('emailDocumentUploads', value)}
            />
            <SettingsToggleRow
              title="Workflow changes"
              description="Send email when transactions move between operational stages."
              checked={form.notificationPreferences.emailWorkflowChanges}
              onChange={(value) => updateNotification('emailWorkflowChanges', value)}
            />
          </SettingsSectionCard>

          <SettingsSectionCard title="Push, SMS and Critical Alerts" description="Fine-grained notification channels for product and compliance events.">
            <SettingsToggleRow
              title="In-app notifications"
              description="Show task, handoff, and document activity in the Arch9 workspace."
              checked={form.notificationPreferences.inAppNotifications}
              onChange={(value) => updateNotification('inAppNotifications', value)}
            />
            <SettingsToggleRow title="Push notifications" description="Browser and device push notifications." checked={false} disabled onChange={() => {}} />
            <SettingsToggleRow title="SMS alerts" description="SMS notifications for urgent operational events." checked={false} disabled onChange={() => {}} />
            <SettingsToggleRow title="Marketing updates" description="Product updates, release notes and education." checked={false} disabled onChange={() => {}} />
            <SettingsToggleRow title="Critical alerts" description="Security and compliance notices that cannot be missed." checked disabled onChange={() => {}} />
          </SettingsSectionCard>
        </form>
      ) : null}

      {showPreferences ? (
        <form className="space-y-5" onSubmit={handleSave}>
          <SettingsSectionCard title="Regional Defaults" description="Controls for date, currency and locale formatting.">
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
                <span className="text-sm font-medium text-[#51657b]">Language</span>
                <Field as="select" value="en-ZA" disabled>
                  <option value="en-ZA">English (South Africa)</option>
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
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Number format</span>
                <Field as="select" value="en-ZA" disabled>
                  <option value="en-ZA">1 234,56</option>
                </Field>
              </label>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Currency</span>
                <Field as="select" value="ZAR" disabled>
                  <option value="ZAR">ZAR - South African Rand</option>
                </Field>
              </label>
              <label className={settingsFieldClass}>
                <span className="text-sm font-medium text-[#51657b]">Theme</span>
                <Field as="select" value="system" disabled>
                  <option value="system">System default</option>
                </Field>
              </label>
            </div>
          </SettingsSectionCard>
        </form>
      ) : null}

      <SettingsStickySaveBar
        dirty={hasUnsavedChanges && (showProfile || showNotifications || showPreferences)}
        saving={saving}
        onDiscard={() => {
          setForm(initialForm)
          setMessage('')
          setError('')
        }}
        onSave={handleSave}
      />
    </div>
  )
}
