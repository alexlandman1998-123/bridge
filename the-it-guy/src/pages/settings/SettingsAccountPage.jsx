import { BadgeCheck, Camera, CheckCircle2, Circle, KeyRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Field from '../../components/ui/Field'
import { useWorkspace } from '../../context/WorkspaceContext'
import { changePassword, fetchAccountSettings, updateAccountSettings, uploadAccountAvatar } from '../../lib/settingsApi'
import { getOrganisationJobTitleLabel } from '../../lib/organisationJobTitles'
import {
  SettingsBanner,
  SettingsLoadingState,
  SettingsPageHeader,
  SettingsStickySaveBar,
  settingsPageClass,
} from './settingsUi'

const AVATAR_MAX_SOURCE_BYTES = 12 * 1024 * 1024
const AVATAR_TARGET_SIZE = 512
const AVATAR_MAX_FILE_BYTES = 650 * 1024
const AVATAR_QUALITIES = [0.86, 0.76, 0.66, 0.56, 0.46]
const PROFILE_INPUT_CLASS = 'h-11 rounded-[12px] border-[#d8e3ee] bg-white text-sm text-[#17233a] shadow-[0_1px_0_rgba(15,23,42,0.02)] placeholder:text-[#9aa8b8] focus:border-[#0f7f4f] focus:ring-[#dff2e8]'
const PROFILE_LABEL_CLASS = 'text-[0.78rem] font-semibold text-[#43566d]'
const PROFILE_FIELD_CLASS = 'grid gap-1.5'
const PROFILE_CARD_CLASS = 'rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.045)] sm:p-6'

function normalizeDisplayText(value = '') {
  return String(value || '').trim()
}

function getInitials(form = {}) {
  const source = [form.firstName, form.lastName].filter(Boolean).join(' ') || form.email || 'User'
  return String(source)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'U'
}

function formatRoleLabel(value = '') {
  const role = normalizeDisplayText(value || 'Member').replace(/_/g, ' ')
  return role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Member'
}

function resolveWorkspaceName(currentWorkspace = {}, form = {}) {
  return (
    normalizeDisplayText(currentWorkspace?.displayName || currentWorkspace?.display_name || currentWorkspace?.name) ||
    normalizeDisplayText(form.companyName) ||
    'Current workspace'
  )
}

function getProfileCompletion(form = {}) {
  const checks = [
    { key: 'photo', label: 'Profile photo', complete: Boolean(normalizeDisplayText(form.avatarUrl)) },
    { key: 'phone', label: 'Phone number', complete: Boolean(normalizeDisplayText(form.phoneNumber)) },
    { key: 'bio', label: 'Bio', complete: Boolean(normalizeDisplayText(form.bio)) },
  ]
  const completed = checks.filter((item) => item.complete).length
  return {
    checks,
    percentage: Math.round((completed / checks.length) * 100),
  }
}

function ProfileCard({ title, description, actions, children }) {
  return (
    <section className={PROFILE_CARD_CLASS}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[1.05rem] font-semibold text-[#17233a]">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-6 text-[#60758d]">{description}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function ProfileTextField({ label, id, className = '', children }) {
  return (
    <label className={`${PROFILE_FIELD_CLASS} ${className}`} htmlFor={id}>
      <span className={PROFILE_LABEL_CLASS}>{label}</span>
      {children}
    </label>
  )
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
  if (!sourceSize) throw new Error('Arch9 could not read that image. Try a different profile picture.')

  const outputSize = Math.min(AVATAR_TARGET_SIZE, sourceSize)
  const sourceX = Math.max(0, ((image.naturalWidth || image.width) - sourceSize) / 2)
  const sourceY = Math.max(0, ((image.naturalHeight || image.height) - sourceSize) / 2)
  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Arch9 could not resize that image in this browser. Try a smaller JPG or PNG file.')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, outputSize, outputSize)
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, outputSize, outputSize)
  return canvas
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
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
  const { currentWorkspace, organisationMembership, organisationMembershipRole, refreshProfile, role, updateLocalProfile } = useWorkspace()
  const firstNameRef = useRef(null)
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
        if (active) setError(loadError.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  function updateField(key, value) {
    setMessage('')
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  async function handleAvatarFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setAvatarError('Choose an image file for your profile picture.')
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
      const saved = await updateAccountSettings({ ...form, avatarUrl: upload.resolvedUrl })
      const nextForm = { ...saved, avatarUrl: saved.avatarUrl || upload.resolvedUrl }
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

  if (loading || !form) return <SettingsLoadingState label="Loading account settings…" />

  const showSecurity = section === 'security'
  const hasUnsavedChanges = JSON.stringify(form) !== JSON.stringify(initialForm)
  const profileName = [form.firstName, form.lastName].filter(Boolean).join(' ') || form.email || 'Arch9 User'
  const workspaceName = resolveWorkspaceName(currentWorkspace, form)
  const roleLabel = formatRoleLabel(organisationMembershipRole || form.role || role)
  const managedJobTitle = getOrganisationJobTitleLabel(
    organisationMembership?.jobTitle || organisationMembership?.job_title,
    form.title,
  )
  const contactLine = [form.email, form.phoneNumber].map(normalizeDisplayText).filter(Boolean).join(' · ')
  const profileCompletion = getProfileCompletion(form)

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Personal"
        title={showSecurity ? 'Security' : 'Profile'}
        description={showSecurity ? 'Update your account password.' : 'Manage the personal details your team uses to identify and contact you.'}
      />

      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
      {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}

      {showSecurity ? (
        <form onSubmit={handlePasswordSave} className="max-w-[920px]">
          <ProfileCard title="Password" description="Choose a strong password for your workspace account.">
            <div className="grid gap-4 md:grid-cols-2">
              <ProfileTextField label="New password" id="security-new-password">
                <Field
                  id="security-new-password"
                  type="password"
                  className={PROFILE_INPUT_CLASS}
                  value={passwordForm.password}
                  onChange={(event) => setPasswordForm((previous) => ({ ...previous, password: event.target.value }))}
                />
              </ProfileTextField>
              <ProfileTextField label="Confirm password" id="security-confirm-password">
                <Field
                  id="security-confirm-password"
                  type="password"
                  className={PROFILE_INPUT_CLASS}
                  value={passwordForm.confirmPassword}
                  onChange={(event) => setPasswordForm((previous) => ({ ...previous, confirmPassword: event.target.value }))}
                />
              </ProfileTextField>
            </div>
            {passwordError ? <div className="mt-5"><SettingsBanner tone="error">{passwordError}</SettingsBanner></div> : null}
            {passwordMessage ? <div className="mt-5"><SettingsBanner tone="success">{passwordMessage}</SettingsBanner></div> : null}
            <div className="mt-5 flex justify-end border-t border-[#e8eef5] pt-4">
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-[#0f7f4f] bg-[#0f7f4f] px-4 text-sm font-semibold text-white shadow-[0_10px_18px_rgba(15,127,79,0.18)] transition hover:bg-[#0d6f45] disabled:border-[#cbd8e5] disabled:bg-[#eef2f6] disabled:text-[#8391a2] disabled:shadow-none"
                disabled={passwordSaving}
              >
                <KeyRound className="h-4 w-4" strokeWidth={2} />
                {passwordSaving ? 'Updating...' : 'Change password'}
              </button>
            </div>
          </ProfileCard>
        </form>
      ) : (
        <form className="space-y-6" onSubmit={handleSave}>
          <section className="rounded-[24px] border border-[#dfe8f1] bg-white p-5 shadow-[0_18px_46px_rgba(15,23,42,0.06)] sm:p-6">
            <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
              <span className="inline-flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#d7e2ef] bg-[#f1f6f9] text-2xl font-semibold text-[#244e70] shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                {form.avatarUrl ? <img src={form.avatarUrl} alt="" className="h-full w-full object-cover" /> : getInitials(form)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="min-w-0 text-[1.35rem] font-semibold leading-tight text-[#17233a]">{profileName}</h2>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#cfe8dc] bg-[#edf8f2] px-2.5 py-1 text-xs font-semibold text-[#0f7f4f]">
                    <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2} />
                    {roleLabel}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-[#40566d]">{workspaceName}</p>
                {managedJobTitle ? <p className="mt-1 text-sm text-[#60758d]">{managedJobTitle} · Managed by your organisation</p> : null}
                {contactLine ? <p className="mt-1 text-sm leading-6 text-[#60758d]">{contactLine}</p> : null}
                <div className="mt-5 flex flex-wrap gap-2">
                  <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-[#0f7f4f] bg-[#0f7f4f] px-4 text-sm font-semibold text-white shadow-[0_10px_18px_rgba(15,127,79,0.18)] transition hover:bg-[#0d6f45]">
                    <Camera className="h-4 w-4" strokeWidth={2} />
                    {avatarProcessing ? 'Preparing...' : 'Upload photo'}
                    <input type="file" accept="image/*" className="sr-only" disabled={avatarProcessing} onChange={handleAvatarFileChange} />
                  </label>
                  {form.avatarUrl ? (
                    <button
                      type="button"
                      className="inline-flex h-11 items-center justify-center rounded-[12px] border border-[#f0d7d7] bg-white px-4 text-sm font-semibold text-[#9a4038] transition hover:bg-[#fff6f6]"
                      disabled={saving || avatarProcessing}
                      onClick={handleRemoveAvatar}
                    >
                      {saving ? 'Removing...' : 'Remove photo'}
                    </button>
                  ) : null}
                </div>
                {avatarError ? <div className="mt-4"><SettingsBanner tone="error">{avatarError}</SettingsBanner></div> : null}
              </div>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,920px)_280px] xl:items-start">
            <ProfileCard
              title="Personal information"
              description="Your name and contact details are visible to people you work with."
              actions={(
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center rounded-[10px] border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] transition hover:bg-[#f7fafc]"
                  onClick={() => firstNameRef.current?.focus()}
                >
                  Edit
                </button>
              )}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <ProfileTextField label="First name" id="profile-first-name">
                  <Field id="profile-first-name" ref={firstNameRef} className={PROFILE_INPUT_CLASS} value={form.firstName} onChange={(event) => updateField('firstName', event.target.value)} />
                </ProfileTextField>
                <ProfileTextField label="Surname" id="profile-last-name">
                  <Field id="profile-last-name" className={PROFILE_INPUT_CLASS} value={form.lastName} onChange={(event) => updateField('lastName', event.target.value)} />
                </ProfileTextField>
                <ProfileTextField label="Email address" id="profile-email">
                  <Field id="profile-email" className={PROFILE_INPUT_CLASS} value={form.email} disabled />
                </ProfileTextField>
                <ProfileTextField label="Phone number" id="profile-phone">
                  <Field id="profile-phone" className={PROFILE_INPUT_CLASS} value={form.phoneNumber} onChange={(event) => updateField('phoneNumber', event.target.value)} />
                </ProfileTextField>
                <ProfileTextField label="Bio" id="profile-bio" className="md:col-span-2">
                  <textarea
                    id="profile-bio"
                    className="ui-textarea h-[92px] min-h-[92px] resize-none rounded-[12px] border-[#d8e3ee] bg-white px-3.5 py-3 text-sm text-[#17233a] outline-none transition placeholder:text-[#9aa8b8] focus:border-[#0f7f4f] focus:ring-4 focus:ring-[#dff2e8]"
                    value={form.bio || ''}
                    maxLength={280}
                    placeholder="A short note for your team and partners."
                    onChange={(event) => updateField('bio', event.target.value)}
                  />
                </ProfileTextField>
              </div>
            </ProfileCard>

            <aside className="hidden xl:block">
              <div className="sticky top-4 space-y-4 rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.045)]">
                <div>
                  <h2 className="text-base font-semibold text-[#17233a]">Profile completeness</h2>
                  <p className="mt-2 text-sm leading-6 text-[#60758d]">Complete details help your team identify and contact you.</p>
                </div>
                <div className="space-y-3 border-y border-[#e5edf4] py-4">
                  {profileCompletion.checks.map((item) => {
                    const Icon = item.complete ? CheckCircle2 : Circle
                    return (
                      <div key={item.key} className="flex items-center gap-2 text-sm font-medium text-[#31455c]">
                        <Icon className={item.complete ? 'h-4 w-4 text-[#0f7f4f]' : 'h-4 w-4 text-[#a5b2c2]'} strokeWidth={2} />
                        {item.label}
                      </div>
                    )
                  })}
                </div>
                <p className="text-sm font-semibold text-[#0f7f4f]">{profileCompletion.percentage}% complete</p>
              </div>
            </aside>
          </div>
        </form>
      )}

      {!showSecurity ? (
        <SettingsStickySaveBar
          dirty={hasUnsavedChanges}
          saving={saving}
          message="You have unsaved changes"
          discardLabel="Discard changes"
          saveLabel="Save changes"
          onDiscard={() => {
            setForm(initialForm)
            setMessage('')
            setError('')
          }}
          onSave={handleSave}
        />
      ) : null}
    </div>
  )
}
