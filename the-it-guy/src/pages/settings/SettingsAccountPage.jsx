import {
  AtSign,
  BadgeCheck,
  BellRing,
  Camera,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  ExternalLink,
  FileText,
  Handshake,
  HelpCircle,
  History,
  KeyRound,
  Mail,
  MessageSquare,
  Monitor,
  MonitorCheck,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'
import { createElement, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Field from '../../components/ui/Field'
import { useWorkspace } from '../../context/WorkspaceContext'
import { changePassword, fetchAccountSettings, updateAccountSettings, uploadAccountAvatar } from '../../lib/settingsApi'
import {
  SettingsBanner,
  SettingsLoadingState,
  SettingsPageHeader,
  SettingsSectionCard,
  SettingsStickySaveBar,
  settingsFieldClass,
  settingsGridClass,
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
const NOTIFICATION_UNSAVED_PROMPT = 'You have unsaved notification changes. Leave without saving?'
const DEFAULT_NOTIFICATION_PREFERENCES = {
  emailEnabled: true,
  emailMentions: true,
  emailDocumentUploads: true,
  emailWorkflowChanges: true,
  inAppEnabled: true,
  inAppNotifications: true,
  inAppTransactionUpdates: true,
  inAppTaskReminders: true,
  inAppAppointments: true,
  inAppPartnerActivity: true,
  smsEnabled: true,
  smsCriticalAlerts: true,
  smsOtpVerification: true,
  smsAppointmentReminders: false,
  desktopNotificationsEnabled: false,
  desktopBrowserNotifications: false,
  desktopTransactionAssigned: false,
  desktopDocumentSigned: false,
  notificationDigest: 'weekly',
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  quietHoursTimezone: 'Africa/Johannesburg',
}
const NOTIFICATION_DIGEST_OPTIONS = [
  { value: 'never', label: 'Never' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

function getInitials(form = {}) {
  const source = [form.firstName, form.lastName].filter(Boolean).join(' ') || form.email || 'User'
  return String(source)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'U'
}

function normalizeDisplayText(value = '') {
  return String(value || '').trim()
}

function formatRoleLabel(value = '') {
  const role = normalizeDisplayText(value || 'Principal').replace(/_/g, ' ')
  if (!role) return 'Principal'
  return role.charAt(0).toUpperCase() + role.slice(1)
}

function resolveWorkspaceName(currentWorkspace = {}, form = {}) {
  return (
    normalizeDisplayText(form.companyName) ||
    normalizeDisplayText(currentWorkspace?.displayName || currentWorkspace?.display_name || currentWorkspace?.name) ||
    'Kingstons Real Estate'
  )
}

function getProfileCompletion(form = {}) {
  const checks = [
    { key: 'photo', label: 'Profile photo', complete: Boolean(normalizeDisplayText(form.avatarUrl)) },
    { key: 'phone', label: 'Phone number', complete: Boolean(normalizeDisplayText(form.phoneNumber)) },
    { key: 'title', label: 'Job title', complete: Boolean(normalizeDisplayText(form.title)) },
    { key: 'bio', label: 'Bio', complete: Boolean(normalizeDisplayText(form.bio)) },
  ]
  const completed = checks.filter((item) => item.complete).length
  const percentage = Math.max(0, Math.min(100, Math.round((completed / checks.length) * 100)))
  return {
    checks,
    completed,
    missing: checks.length - completed,
    percentage,
  }
}

function getNotificationPreferences(form = {}) {
  const source = form.notificationPreferences && typeof form.notificationPreferences === 'object'
    ? form.notificationPreferences
    : {}
  const preferences = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...source,
  }

  if (source.inAppEnabled === undefined && source.inAppNotifications !== undefined) {
    preferences.inAppEnabled = Boolean(source.inAppNotifications)
  }

  return preferences
}

function getNotificationStatus(preferences = {}, desktopNotificationsSupported = false) {
  return {
    email: preferences.emailEnabled ? 'Enabled' : 'Disabled',
    inApp: preferences.inAppEnabled ? 'Enabled' : 'Disabled',
    sms: preferences.smsEnabled ? 'Critical only' : 'Disabled',
    browser: desktopNotificationsSupported && preferences.desktopNotificationsEnabled ? 'Enabled' : 'Disabled',
  }
}

function ProfilePageHeader({ sectionTitle = 'Profile', description = 'Manage your personal information and preferences.' }) {
  return (
    <header className="pb-1">
      <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold leading-tight text-[#17233a]">
        <span className="text-[#6b7d93]">Settings</span>
        <ChevronRight className="h-4 w-4 text-[#9aa8b8]" strokeWidth={2} />
        <span>{sectionTitle}</span>
      </h1>
      <p className="mt-2 text-sm leading-6 text-[#60758d]">{description}</p>
    </header>
  )
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
    <label className={`${PROFILE_FIELD_CLASS} ${className}`.trim()} htmlFor={id}>
      <span className={PROFILE_LABEL_CLASS}>{label}</span>
      {children}
    </label>
  )
}

function SecurityStatusPill({ state = 'not-enabled', children }) {
  const enabled = state === 'enabled'
  return (
    <span
      className={[
        'inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold',
        enabled
          ? 'border-[#cfe8dc] bg-[#edf8f2] text-[#0f7f4f]'
          : 'border-[#eadbb5] bg-[#fff8e6] text-[#8a5a16]',
      ].join(' ')}
    >
      {children}
    </span>
  )
}

function SecurityHealthRow({ label, status, complete = false }) {
  const Icon = complete ? CheckCircle2 : Circle
  return (
    <div className="flex items-start gap-3">
      <Icon className={complete ? 'mt-0.5 h-4 w-4 text-[#0f7f4f]' : 'mt-0.5 h-4 w-4 text-[#a5b2c2]'} strokeWidth={2} />
      <div>
        <p className="text-sm font-semibold text-[#17233a]">{label}</p>
        <p className="mt-0.5 text-xs font-medium text-[#60758d]">{status}</p>
      </div>
    </div>
  )
}

function NotificationSwitch({ checked = false, disabled = false, label, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      aria-label={label}
      disabled={disabled}
      className={[
        'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition focus:outline-none focus:ring-4 focus:ring-[#dff2e8]',
        checked ? 'bg-[#0f7f4f]' : 'bg-[#cbd6e2]',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:shadow-[0_0_0_4px_rgba(15,127,79,0.08)]',
      ].join(' ')}
      onClick={() => {
        if (!disabled) onChange?.(!checked)
      }}
    >
      <span
        className={[
          'inline-block h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.24)] transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  )
}

function NotificationRecommendedBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-[#cfe8dc] bg-[#edf8f2] px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#0f7f4f]">
      Recommended
    </span>
  )
}

function NotificationPreferenceRow({ icon: Icon, title, description, checked, disabled = false, recommended = false, onChange }) {
  return (
    <div className={['grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:items-center', disabled ? 'opacity-50' : ''].join(' ')}>
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#dce8ef] bg-[#f6faf8] text-[#0f7f4f]">
        {createElement(Icon, { className: 'h-5 w-5', strokeWidth: 1.9 })}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-[#17233a]">{title}</p>
          {recommended ? <NotificationRecommendedBadge /> : null}
        </div>
        <p className="mt-1 text-sm leading-6 text-[#60758d]">{description}</p>
      </div>
      <div className="sm:justify-self-end">
        <NotificationSwitch checked={checked} disabled={disabled} label={title} onChange={onChange} />
      </div>
    </div>
  )
}

function NotificationCategoryCard({ title, description, enabled, onToggle, children }) {
  return (
    <ProfileCard
      title={title}
      description={description}
      actions={<NotificationSwitch checked={enabled} label={title} onChange={onToggle} />}
    >
      <div className="divide-y divide-[#e5edf4] border-t border-[#e5edf4]">{children}</div>
    </ProfileCard>
  )
}

function NotificationDigestOption({ label, selected, onSelect }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={[
        'flex h-11 items-center justify-center rounded-[12px] border px-3 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-[#dff2e8]',
        selected
          ? 'border-[#0f7f4f] bg-[#edf8f2] text-[#0f7f4f] shadow-[inset_0_0_0_1px_rgba(15,127,79,0.1)]'
          : 'border-[#d9e3ef] bg-white text-[#40566d] hover:bg-[#f7fafc]',
      ].join(' ')}
      onClick={onSelect}
    >
      {label}
    </button>
  )
}

function NotificationStatusRow({ label, value, tone = 'neutral' }) {
  const enabled = tone === 'enabled'
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-semibold text-[#31455c]">{label}</span>
      <span className={enabled ? 'text-sm font-semibold text-[#0f7f4f]' : 'text-sm font-semibold text-[#60758d]'}>
        {value}
      </span>
    </div>
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
  const { currentMembership, currentWorkspace, refreshProfile, role, updateLocalProfile } = useWorkspace()
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
    setMessage('')
    setForm((previous) => ({
      ...previous,
      notificationPreferences: {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        ...previous.notificationPreferences,
        [key]: value,
      },
    }))
  }

  function updateNotificationPreferences(patch = {}) {
    setMessage('')
    setForm((previous) => ({
      ...previous,
      notificationPreferences: {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        ...previous.notificationPreferences,
        ...patch,
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

  async function saveAccountSettings(successMessage = 'Account settings saved.') {
    try {
      setSaving(true)
      setError('')
      setMessage('')
      const saved = await updateAccountSettings(form)
      setForm(saved)
      setInitialForm(saved)
      await refreshProfile()
      setMessage(successMessage)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSave(event) {
    event?.preventDefault?.()
    await saveAccountSettings('Account settings saved.')
  }

  async function handleNotificationSave(event) {
    event?.preventDefault?.()
    await saveAccountSettings('Notification preferences updated.')
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

  const showProfile = section === 'profile'
  const showSecurity = section === 'security'
  const showNotifications = section === 'notifications'
  const showPreferences = section === 'preferences'
  const showDanger = section === 'danger'
  const hasUnsavedChanges = form ? JSON.stringify(form || {}) !== JSON.stringify(initialForm || {}) : false
  const shouldWarnUnsavedNotifications = showNotifications && hasUnsavedChanges

  useEffect(() => {
    if (!shouldWarnUnsavedNotifications || typeof window === 'undefined') return undefined

    function handleBeforeUnload(event) {
      event.preventDefault()
      event.returnValue = ''
      return ''
    }

    function handleDocumentClick(event) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target instanceof Element ? event.target : event.target?.parentElement
      const anchor = target?.closest?.('a[href]')
      if (!anchor || anchor.target || anchor.hasAttribute('download')) return
      const nextUrl = new URL(anchor.href, window.location.href)
      if (nextUrl.origin !== window.location.origin || nextUrl.pathname === window.location.pathname) return
      if (window.confirm(NOTIFICATION_UNSAVED_PROMPT)) return
      event.preventDefault()
      event.stopPropagation()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('click', handleDocumentClick, true)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('click', handleDocumentClick, true)
    }
  }, [shouldWarnUnsavedNotifications])

  if (loading || !form) {
    return <SettingsLoadingState label="Loading account settings…" />
  }

  const profileName = [form.firstName, form.lastName].filter(Boolean).join(' ') || form.email || 'Arch9 User'
  const workspaceName = resolveWorkspaceName(currentWorkspace, form)
  const membershipRole = normalizeDisplayText(currentMembership?.role || currentMembership?.workspaceRole || currentMembership?.organisationRole)
  const roleLabel = formatRoleLabel(membershipRole || form.role || role || 'Principal')
  const contactLine = [form.email, form.phoneNumber].map(normalizeDisplayText).filter(Boolean).join(' · ')
  const profileCompletion = getProfileCompletion(form)
  const notificationPreferences = getNotificationPreferences(form)
  const desktopNotificationsSupported = typeof window !== 'undefined' && 'Notification' in window
  const notificationStatus = getNotificationStatus(notificationPreferences, desktopNotificationsSupported)
  const sectionMeta = showSecurity
    ? {
        kicker: 'Personal',
        title: 'Security',
        description: 'Password, multi-factor authentication, sessions, and login history.',
      }
    : showDanger
      ? {
          kicker: 'Advanced',
          title: 'Danger Zone',
          description: 'Account-level controls that require extra care.',
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
      {showProfile || showSecurity || showNotifications ? (
        <ProfilePageHeader
          sectionTitle={showSecurity ? 'Security' : showNotifications ? 'Notifications' : 'Profile'}
          description={
            showSecurity
              ? 'Manage password, multi-factor authentication, sessions, and login activity.'
              : showNotifications
                ? "Manage how and when you'd like to hear from Arch9."
                : 'Manage your personal information and preferences.'
          }
        />
      ) : (
        <SettingsPageHeader
          kicker={sectionMeta.kicker}
          title={sectionMeta.title}
          description={sectionMeta.description}
        />
      )}

      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
      {message && !(showNotifications && message === 'Notification preferences updated.') ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}
      {showNotifications && message === 'Notification preferences updated.' ? (
        <div className="fixed bottom-6 right-6 z-40 max-w-sm rounded-[16px] border border-[#ccead8] bg-white px-4 py-3 text-sm font-semibold text-[#1f7a45] shadow-[0_18px_42px_rgba(15,23,42,0.14)]" role="status">
          Notification preferences updated.
        </div>
      ) : null}

      {showProfile ? (
        <form className="space-y-6" onSubmit={handleSave}>
          <section className="rounded-[24px] border border-[#dfe8f1] bg-white p-5 shadow-[0_18px_46px_rgba(15,23,42,0.06)] sm:p-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-center">
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
                  {contactLine ? <p className="mt-1 text-sm leading-6 text-[#60758d]">{contactLine}</p> : null}
                  <div className="mt-5 flex flex-wrap gap-2">
                    <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-[#0f7f4f] bg-[#0f7f4f] px-4 text-sm font-semibold text-white shadow-[0_10px_18px_rgba(15,127,79,0.18)] transition hover:bg-[#0d6f45]">
                      <Camera className="h-4 w-4" strokeWidth={2} />
                      {avatarProcessing ? 'Preparing...' : 'Upload photo'}
                      <input type="file" accept="image/*" className="sr-only" disabled={avatarProcessing} onChange={handleAvatarFileChange} />
                    </label>
                    <button
                      type="button"
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#24364b] shadow-[0_6px_16px_rgba(15,23,42,0.04)] transition hover:bg-[#f7fafc]"
                    >
                      <ExternalLink className="h-4 w-4" strokeWidth={2} />
                      View public profile
                    </button>
                    {form.avatarUrl ? (
                      <button
                        type="button"
                        className="inline-flex h-11 items-center justify-center rounded-[12px] border border-[#f0d7d7] bg-white px-4 text-sm font-semibold text-[#9a4038] transition hover:bg-[#fff6f6]"
                        disabled={saving || avatarProcessing}
                        onClick={handleRemoveAvatar}
                      >
                        {saving ? 'Removing...' : 'Remove'}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="rounded-[18px] border border-[#e0e9f2] bg-[#f8fbfa] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-[#17233a]">Profile completion</p>
                    <p className="mt-1 text-xs font-medium text-[#60758d]">
                      {profileCompletion.missing} {profileCompletion.missing === 1 ? 'step' : 'steps'} remaining
                    </p>
                  </div>
                  <strong className="text-2xl font-semibold leading-none text-[#0f7f4f]">{profileCompletion.percentage}%</strong>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e3ece8]">
                  <span className="block h-full rounded-full bg-[#0f7f4f]" style={{ width: `${profileCompletion.percentage}%` }} />
                </div>
              </div>
            </div>
            {avatarError ? <SettingsBanner tone="error">{avatarError}</SettingsBanner> : null}
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,920px)_280px] xl:items-start">
            <div className="space-y-6">
              <ProfileCard
                title="Personal information"
                description="Your personal details and contact information."
                actions={
                  <button
                    type="button"
                    className="inline-flex h-9 items-center justify-center rounded-[10px] border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] transition hover:bg-[#f7fafc]"
                    onClick={() => firstNameRef.current?.focus()}
                  >
                    Edit
                  </button>
                }
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <ProfileTextField label="First name" id="profile-first-name">
                    <Field
                      id="profile-first-name"
                      ref={firstNameRef}
                      className={PROFILE_INPUT_CLASS}
                      value={form.firstName}
                      onChange={(event) => updateField('firstName', event.target.value)}
                    />
                  </ProfileTextField>
                  <ProfileTextField label="Surname" id="profile-last-name">
                    <Field
                      id="profile-last-name"
                      className={PROFILE_INPUT_CLASS}
                      value={form.lastName}
                      onChange={(event) => updateField('lastName', event.target.value)}
                    />
                  </ProfileTextField>
                  <ProfileTextField label="Email address" id="profile-email">
                    <Field id="profile-email" className={PROFILE_INPUT_CLASS} value={form.email} disabled />
                  </ProfileTextField>
                  <ProfileTextField label="Phone number" id="profile-phone">
                    <Field
                      id="profile-phone"
                      className={PROFILE_INPUT_CLASS}
                      value={form.phoneNumber}
                      onChange={(event) => updateField('phoneNumber', event.target.value)}
                    />
                  </ProfileTextField>
                  <ProfileTextField label="Bio" id="profile-bio" className="md:col-span-2">
                    <textarea
                      id="profile-bio"
                      className="ui-textarea h-[92px] min-h-[92px] resize-none rounded-[12px] border-[#d8e3ee] bg-white px-3.5 py-3 text-sm text-[#17233a] shadow-[0_1px_0_rgba(15,23,42,0.02)] outline-none transition placeholder:text-[#9aa8b8] focus:border-[#0f7f4f] focus:ring-4 focus:ring-[#dff2e8]"
                      value={form.bio || ''}
                      maxLength={280}
                      placeholder="A short note for your team and partners."
                      onChange={(event) => updateField('bio', event.target.value)}
                    />
                  </ProfileTextField>
                </div>
              </ProfileCard>

              <ProfileCard title="Employment information" description="Employment details used in directories, assignments and signatures.">
                <div className="grid gap-4 md:grid-cols-2">
                  <ProfileTextField label="Job title" id="profile-title">
                    <Field
                      id="profile-title"
                      className={PROFILE_INPUT_CLASS}
                      value={form.title}
                      onChange={(event) => updateField('title', event.target.value)}
                    />
                  </ProfileTextField>
                  <ProfileTextField label="Organisation" id="profile-organisation">
                    <Field
                      id="profile-organisation"
                      className={PROFILE_INPUT_CLASS}
                      value={form.companyName}
                      onChange={(event) => updateField('companyName', event.target.value)}
                    />
                  </ProfileTextField>
                  <ProfileTextField label="Department" id="profile-department">
                    <Field
                      id="profile-department"
                      className={PROFILE_INPUT_CLASS}
                      value={form.department || ''}
                      onChange={(event) => updateField('department', event.target.value)}
                    />
                  </ProfileTextField>
                  <ProfileTextField label="Office" id="profile-office">
                    <Field
                      id="profile-office"
                      className={PROFILE_INPUT_CLASS}
                      value={form.office || ''}
                      onChange={(event) => updateField('office', event.target.value)}
                    />
                  </ProfileTextField>
                </div>
              </ProfileCard>

              <ProfileCard title="Preferences" description="Local defaults for dates, language and workspace display.">
                <div className="grid gap-4 md:grid-cols-2">
                  <ProfileTextField label="Timezone" id="profile-timezone">
                    <Field as="select" id="profile-timezone" className={PROFILE_INPUT_CLASS} value={form.timezone} onChange={(event) => updateField('timezone', event.target.value)}>
                      <option value="Africa/Johannesburg">Africa/Johannesburg</option>
                      <option value="UTC">UTC</option>
                      <option value="Europe/London">Europe/London</option>
                    </Field>
                  </ProfileTextField>
                  <ProfileTextField label="Language" id="profile-language">
                    <Field as="select" id="profile-language" className={PROFILE_INPUT_CLASS} value={form.language || 'en-ZA'} onChange={(event) => updateField('language', event.target.value)}>
                      <option value="en-ZA">English (South Africa)</option>
                      <option value="en-GB">English (United Kingdom)</option>
                    </Field>
                  </ProfileTextField>
                  <ProfileTextField label="Date format" id="profile-date-format">
                    <Field as="select" id="profile-date-format" className={PROFILE_INPUT_CLASS} value={form.dateFormat} onChange={(event) => updateField('dateFormat', event.target.value)}>
                      <option value="DD MMM YYYY">DD MMM YYYY</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    </Field>
                  </ProfileTextField>
                  <ProfileTextField label="Theme" id="profile-theme">
                    <Field as="select" id="profile-theme" className={PROFILE_INPUT_CLASS} value={form.theme || 'system'} onChange={(event) => updateField('theme', event.target.value)}>
                      <option value="system">System default</option>
                      <option value="light">Light</option>
                    </Field>
                  </ProfileTextField>
                </div>
              </ProfileCard>
            </div>

            <aside className="hidden xl:block">
              <div className="sticky top-4 space-y-4 rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.045)]">
                <div>
                  <h2 className="text-base font-semibold text-[#17233a]">Complete your profile</h2>
                  <p className="mt-2 text-sm leading-6 text-[#60758d]">A complete profile helps your team and partners collaborate with you.</p>
                </div>
                <div className="space-y-3 border-y border-[#e5edf4] py-4">
                  {profileCompletion.checks.map((item) => {
                    const Icon = item.complete ? CheckCircle2 : Circle
                    return (
                      <div key={item.key} className="flex items-center gap-2 text-sm font-medium text-[#31455c]">
                        <Icon className={item.complete ? 'h-4 w-4 text-[#0f7f4f]' : 'h-4 w-4 text-[#a5b2c2]'} strokeWidth={2} />
                        <span>{item.label}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="rounded-[16px] bg-[#f8fbfa] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#17233a]">
                    <HelpCircle className="h-4 w-4 text-[#0f7f4f]" strokeWidth={2} />
                    Need help?
                  </div>
                  <Link
                    to="/settings/help"
                    className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-[12px] border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] transition hover:bg-[#f7fafc]"
                  >
                    Open Help Centre
                  </Link>
                </div>
              </div>
            </aside>
          </div>
        </form>
      ) : null}

      {showSecurity ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,920px)_280px] xl:items-start">
          <div className="space-y-6">
            <form onSubmit={handlePasswordSave}>
              <ProfileCard title="Password" description="Update your password for internal workspace access.">
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

            <ProfileCard title="Two-factor authentication" description="Add a second verification step before account access.">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dce8ef] bg-[#f6faf8] text-[#0f7f4f]">
                    <ShieldCheck className="h-5 w-5" strokeWidth={1.9} />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[#17233a]">Status:</span>
                      <SecurityStatusPill>Not enabled</SecurityStatusPill>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#60758d]">Two-factor authentication is not enabled for this account.</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[12px] border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#24364b] shadow-[0_6px_16px_rgba(15,23,42,0.04)] transition hover:bg-[#f7fafc] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled
                >
                  Enable MFA
                </button>
              </div>
            </ProfileCard>

            <div className="grid gap-6 lg:grid-cols-2">
              <ProfileCard title="Active sessions" description="Current browser session is active.">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#cfe8dc] bg-[#edf8f2] text-[#0f7f4f]">
                    <MonitorCheck className="h-5 w-5" strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#17233a]">Current device</p>
                    <p className="mt-1 text-sm leading-6 text-[#60758d]">You are signed in from this browser.</p>
                    <button
                      type="button"
                      className="mt-4 inline-flex h-10 items-center justify-center rounded-[11px] border border-[#d9e3ef] bg-white px-3.5 text-sm font-semibold text-[#24364b] transition hover:bg-[#f7fafc] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled
                    >
                      Log out other sessions
                    </button>
                  </div>
                </div>
              </ProfileCard>

              <ProfileCard title="Connected devices" description="Trusted device management is not configured yet.">
                <div className="rounded-[16px] border border-dashed border-[#d9e4ef] bg-[#f9fbfe] p-4 opacity-80">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dce8ef] bg-white text-[#7b8da6]">
                      <Smartphone className="h-5 w-5" strokeWidth={1.9} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[#31455c]">No trusted devices</p>
                      <p className="mt-1 text-sm leading-6 text-[#60758d]">Device trust controls will appear here when configured for this workspace.</p>
                    </div>
                  </div>
                </div>
              </ProfileCard>
            </div>

            <ProfileCard title="Login history" description="Recent authentication events for this account.">
              <div className="rounded-[16px] border border-dashed border-[#d7e2ee] bg-[#f9fbfe] p-5">
                <div className="flex flex-col gap-3 text-center sm:flex-row sm:items-center sm:text-left">
                  <span className="mx-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#dce8ef] bg-white text-[#7b8da6] sm:mx-0">
                    <History className="h-5 w-5" strokeWidth={1.9} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[#17233a]">No login history is available.</p>
                    <p className="mt-1 text-sm leading-6 text-[#60758d]">Recent sign-in activity will be listed here once login events are available.</p>
                  </div>
                </div>
              </div>
            </ProfileCard>
          </div>

          <aside className="hidden xl:block">
            <div className="sticky top-4 space-y-4 rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.045)]">
              <div>
                <h2 className="text-base font-semibold text-[#17233a]">Security health</h2>
                <p className="mt-2 text-sm leading-6 text-[#60758d]">Review the key protections on this account.</p>
              </div>
              <div className="space-y-4 border-y border-[#e5edf4] py-4">
                <SecurityHealthRow label="Password" status="Set" complete />
                <SecurityHealthRow label="Two-factor authentication" status="Not enabled" />
                <SecurityHealthRow label="Active sessions" status="Current device" complete />
              </div>
              <div className="rounded-[16px] border border-[#eadbb5] bg-[#fff8e6] p-4">
                <p className="text-sm font-semibold text-[#17233a]">Recommendation</p>
                <p className="mt-2 text-sm leading-6 text-[#6f5a26]">Enable MFA to better protect this account.</p>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {showNotifications ? (
        <form className="grid gap-6 xl:grid-cols-[minmax(0,920px)_280px] xl:items-start" onSubmit={handleNotificationSave}>
          <div className="space-y-6">
            <NotificationCategoryCard
              title="Email Notifications"
              description="Receive important updates in your inbox."
              enabled={notificationPreferences.emailEnabled}
              onToggle={(value) => updateNotification('emailEnabled', value)}
            >
              <NotificationPreferenceRow
                icon={AtSign}
                title="Mentions"
                description="Receive an email when someone mentions you."
                checked={notificationPreferences.emailMentions}
                disabled={!notificationPreferences.emailEnabled}
                onChange={(value) => updateNotification('emailMentions', value)}
              />
              <NotificationPreferenceRow
                icon={FileText}
                title="Workflow Updates"
                description="Receive updates when transactions move stages."
                checked={notificationPreferences.emailWorkflowChanges}
                disabled={!notificationPreferences.emailEnabled}
                onChange={(value) => updateNotification('emailWorkflowChanges', value)}
              />
              <NotificationPreferenceRow
                icon={Mail}
                title="Document Uploads"
                description="Receive emails when new documents are uploaded."
                checked={notificationPreferences.emailDocumentUploads}
                disabled={!notificationPreferences.emailEnabled}
                onChange={(value) => updateNotification('emailDocumentUploads', value)}
              />
            </NotificationCategoryCard>

            <NotificationCategoryCard
              title="In-App Notifications"
              description="Receive updates inside Arch9."
              enabled={notificationPreferences.inAppEnabled}
              onToggle={(value) => updateNotificationPreferences({ inAppEnabled: value, inAppNotifications: value })}
            >
              <NotificationPreferenceRow
                icon={BellRing}
                title="Transaction Updates"
                description="See transaction changes and assignments inside Arch9."
                checked={notificationPreferences.inAppTransactionUpdates}
                disabled={!notificationPreferences.inAppEnabled}
                onChange={(value) => updateNotification('inAppTransactionUpdates', value)}
              />
              <NotificationPreferenceRow
                icon={Clock3}
                title="Task Reminders"
                description="Receive reminders for tasks that need your attention."
                checked={notificationPreferences.inAppTaskReminders}
                disabled={!notificationPreferences.inAppEnabled}
                onChange={(value) => updateNotification('inAppTaskReminders', value)}
              />
              <NotificationPreferenceRow
                icon={CalendarDays}
                title="Appointments"
                description="Show appointment confirmations and changes in Arch9."
                checked={notificationPreferences.inAppAppointments}
                disabled={!notificationPreferences.inAppEnabled}
                onChange={(value) => updateNotification('inAppAppointments', value)}
              />
              <NotificationPreferenceRow
                icon={Handshake}
                title="Partner Activity"
                description="Receive updates when partners act on shared work."
                checked={notificationPreferences.inAppPartnerActivity}
                disabled={!notificationPreferences.inAppEnabled}
                onChange={(value) => updateNotification('inAppPartnerActivity', value)}
              />
            </NotificationCategoryCard>

            <NotificationCategoryCard
              title="SMS Notifications"
              description="Receive important time-sensitive updates."
              enabled={notificationPreferences.smsEnabled}
              onToggle={(value) => updateNotification('smsEnabled', value)}
            >
              <NotificationPreferenceRow
                icon={ShieldAlert}
                title="Critical Alerts"
                description="Receive security and urgent workflow alerts by SMS."
                checked={notificationPreferences.smsCriticalAlerts}
                disabled={!notificationPreferences.smsEnabled}
                recommended
                onChange={(value) => updateNotification('smsCriticalAlerts', value)}
              />
              <NotificationPreferenceRow
                icon={KeyRound}
                title="OTP Verification"
                description="Receive one-time passcodes for account verification."
                checked={notificationPreferences.smsOtpVerification}
                disabled={!notificationPreferences.smsEnabled}
                recommended
                onChange={(value) => updateNotification('smsOtpVerification', value)}
              />
              <NotificationPreferenceRow
                icon={CalendarDays}
                title="Appointment Reminders"
                description="Receive appointment reminders when timing is important."
                checked={notificationPreferences.smsAppointmentReminders}
                disabled={!notificationPreferences.smsEnabled}
                onChange={(value) => updateNotification('smsAppointmentReminders', value)}
              />
            </NotificationCategoryCard>

            {desktopNotificationsSupported ? (
              <NotificationCategoryCard
                title="Desktop Notifications"
                description="Receive browser notifications while signed in."
                enabled={notificationPreferences.desktopNotificationsEnabled}
                onToggle={(value) => updateNotificationPreferences({ desktopNotificationsEnabled: value, desktopBrowserNotifications: value })}
              >
                <NotificationPreferenceRow
                  icon={Monitor}
                  title="Browser Notifications"
                  description="Allow Arch9 to show browser notifications on this device."
                  checked={notificationPreferences.desktopBrowserNotifications}
                  disabled={!notificationPreferences.desktopNotificationsEnabled}
                  onChange={(value) => updateNotification('desktopBrowserNotifications', value)}
                />
                <NotificationPreferenceRow
                  icon={MessageSquare}
                  title="Transaction Assigned"
                  description="Notify me when a transaction is assigned to me."
                  checked={notificationPreferences.desktopTransactionAssigned}
                  disabled={!notificationPreferences.desktopNotificationsEnabled}
                  onChange={(value) => updateNotification('desktopTransactionAssigned', value)}
                />
                <NotificationPreferenceRow
                  icon={FileText}
                  title="Document Signed"
                  description="Notify me when a signing action is completed."
                  checked={notificationPreferences.desktopDocumentSigned}
                  disabled={!notificationPreferences.desktopNotificationsEnabled}
                  onChange={(value) => updateNotification('desktopDocumentSigned', value)}
                />
              </NotificationCategoryCard>
            ) : (
              <ProfileCard title="Desktop Notifications" description="Receive browser notifications while signed in.">
                <div className="rounded-[16px] border border-dashed border-[#d9e4ef] bg-[#f9fbfe] p-5 opacity-80">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dce8ef] bg-white text-[#7b8da6]">
                      <Monitor className="h-5 w-5" strokeWidth={1.9} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[#31455c]">Browser notifications are not available.</p>
                      <p className="mt-1 text-sm leading-6 text-[#60758d]">This browser does not support desktop notifications, so these controls are disabled.</p>
                    </div>
                  </div>
                </div>
              </ProfileCard>
            )}

            <ProfileCard title="Notification Summary" description="How often would you like email summaries?">
              <div className="grid gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Notification summary frequency">
                {NOTIFICATION_DIGEST_OPTIONS.map((option) => (
                  <NotificationDigestOption
                    key={option.value}
                    label={option.label}
                    selected={notificationPreferences.notificationDigest === option.value}
                    onSelect={() => updateNotification('notificationDigest', option.value)}
                  />
                ))}
              </div>
            </ProfileCard>

            <ProfileCard
              title="Quiet Hours"
              description="Pause non-critical notifications."
              actions={
                <NotificationSwitch
                  checked={notificationPreferences.quietHoursEnabled}
                  label="Quiet Hours"
                  onChange={(value) => updateNotification('quietHoursEnabled', value)}
                />
              }
            >
              <div className={['grid gap-4 md:grid-cols-3', !notificationPreferences.quietHoursEnabled ? 'opacity-50' : ''].join(' ')}>
                <ProfileTextField label="Start time" id="quiet-hours-start">
                  <Field
                    id="quiet-hours-start"
                    type="time"
                    className={PROFILE_INPUT_CLASS}
                    value={notificationPreferences.quietHoursStart}
                    disabled={!notificationPreferences.quietHoursEnabled}
                    onChange={(event) => updateNotification('quietHoursStart', event.target.value)}
                  />
                </ProfileTextField>
                <ProfileTextField label="End time" id="quiet-hours-end">
                  <Field
                    id="quiet-hours-end"
                    type="time"
                    className={PROFILE_INPUT_CLASS}
                    value={notificationPreferences.quietHoursEnd}
                    disabled={!notificationPreferences.quietHoursEnabled}
                    onChange={(event) => updateNotification('quietHoursEnd', event.target.value)}
                  />
                </ProfileTextField>
                <ProfileTextField label="Timezone" id="quiet-hours-timezone">
                  <Field
                    as="select"
                    id="quiet-hours-timezone"
                    className={PROFILE_INPUT_CLASS}
                    value={notificationPreferences.quietHoursTimezone}
                    disabled={!notificationPreferences.quietHoursEnabled}
                    onChange={(event) => updateNotification('quietHoursTimezone', event.target.value)}
                  >
                    <option value="Africa/Johannesburg">Africa/Johannesburg</option>
                    <option value="UTC">UTC</option>
                    <option value="Europe/London">Europe/London</option>
                  </Field>
                </ProfileTextField>
              </div>
            </ProfileCard>
          </div>

          <aside className="hidden xl:block">
            <div className="sticky top-4 space-y-4 rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.045)]">
              <div>
                <h2 className="text-base font-semibold text-[#17233a]">Notification Status</h2>
                <p className="mt-2 text-sm leading-6 text-[#60758d]">Current delivery channels for this account.</p>
              </div>
              <div className="space-y-3 border-y border-[#e5edf4] py-4">
                <NotificationStatusRow label="Email" value={notificationStatus.email} tone={notificationPreferences.emailEnabled ? 'enabled' : 'neutral'} />
                <NotificationStatusRow label="In-App" value={notificationStatus.inApp} tone={notificationPreferences.inAppEnabled ? 'enabled' : 'neutral'} />
                <NotificationStatusRow label="SMS" value={notificationStatus.sms} tone={notificationPreferences.smsEnabled ? 'enabled' : 'neutral'} />
                <NotificationStatusRow label="Browser" value={notificationStatus.browser} tone={desktopNotificationsSupported && notificationPreferences.desktopNotificationsEnabled ? 'enabled' : 'neutral'} />
              </div>
              <div className="rounded-[16px] bg-[#f8fbfa] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#17233a]">
                  <HelpCircle className="h-4 w-4 text-[#0f7f4f]" strokeWidth={2} />
                  Need help?
                </div>
                <Link
                  to="/settings/organisation"
                  className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-[12px] border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] transition hover:bg-[#f7fafc]"
                >
                  Manage organisation-wide notifications
                </Link>
              </div>
            </div>
          </aside>
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

      {showDanger ? (
        <div className="space-y-5">
          <SettingsSectionCard title="Danger Zone" description="Account deletion is disabled while your user is linked to active organisation workflows.">
            <button type="button" className="inline-flex min-h-10 items-center rounded-[10px] border border-[#f0d7d7] bg-white px-4 text-sm font-semibold text-[#9a4038] opacity-60" disabled>
              Delete account
            </button>
          </SettingsSectionCard>
        </div>
      ) : null}

      <SettingsStickySaveBar
        dirty={hasUnsavedChanges && (showProfile || showNotifications || showPreferences)}
        saving={saving}
        message={showNotifications ? 'You have unsaved notification changes.' : 'You have unsaved changes'}
        discardLabel={showNotifications ? 'Discard' : 'Discard changes'}
        saveLabel={showNotifications ? 'Save Changes' : 'Save changes'}
        onDiscard={() => {
          setForm(initialForm)
          setMessage('')
          setError('')
        }}
        onSave={showNotifications ? handleNotificationSave : handleSave}
      />
    </div>
  )
}
