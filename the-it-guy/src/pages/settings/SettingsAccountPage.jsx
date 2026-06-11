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
  SettingsToggleRow,
  settingsActionRowClass,
  settingsFieldClass,
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
    image.onerror = () => reject(new Error('Bridge could not read that image. Try a JPG or PNG file.'))
    image.src = dataUrl
  })
}

async function createProfileAvatarCanvas(file) {
  if (file.size > AVATAR_MAX_SOURCE_BYTES) {
    throw new Error('Choose an image smaller than 12MB. Bridge will resize it before saving.')
  }

  const originalDataUrl = await readImageFileAsDataUrl(file)
  const image = await loadImageFromDataUrl(originalDataUrl)
  const sourceSize = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height)

  if (!sourceSize) {
    throw new Error('Bridge could not read that image. Try a different profile picture.')
  }

  const outputSize = Math.min(AVATAR_TARGET_SIZE, sourceSize)
  const sourceX = Math.max(0, ((image.naturalWidth || image.width) - sourceSize) / 2)
  const sourceY = Math.max(0, ((image.naturalHeight || image.height) - sourceSize) / 2)
  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Bridge could not resize that image in this browser. Try a smaller JPG or PNG file.')
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

  throw new Error('Bridge resized the image, but it is still too large. Try a simpler JPG or PNG file.')
}

export default function SettingsAccountPage() {
  const { refreshProfile, updateLocalProfile } = useWorkspace()
  const [form, setForm] = useState(null)
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
      setAvatarError('Choose an image smaller than 12MB. Bridge will resize it before saving.')
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
      updateLocalProfile({ avatarUrl: '', avatar_url: '' })
      setMessage('Profile picture removed.')
    } catch (removeError) {
      setAvatarError(removeError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSave(event) {
    event.preventDefault()
    try {
      setSaving(true)
      setError('')
      setMessage('')
      const saved = await updateAccountSettings(form)
      setForm(saved)
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
      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
      {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}

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
                {avatarProcessing ? 'Preparing…' : 'Upload Image'}
                <input type="file" accept="image/*" className="sr-only" disabled={avatarProcessing} onChange={handleAvatarFileChange} />
              </label>
              {form.avatarUrl ? (
                <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-[#f0d7d7] bg-white px-4 text-sm font-semibold text-[#9a4038] shadow-sm transition hover:bg-[#fff6f6]" disabled={saving || avatarProcessing} onClick={handleRemoveAvatar}>
                  {saving ? 'Removing…' : 'Remove'}
                </button>
              ) : null}
            </div>
          </div>
          {avatarError ? <SettingsBanner tone="error">{avatarError}</SettingsBanner> : null}
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

        <div className={settingsActionRowClass}>
          <Button type="submit" disabled={saving || avatarProcessing}>
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
