import { ExternalLink, Link2, ToggleLeft, ToggleRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useOrganisation } from '../../context/OrganisationContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { fetchOrganisationSettings, updateOrganisationSettings } from '../../lib/settingsApi'
import {
  SettingsBanner,
  SettingsEmptyState,
  SettingsLoadingState,
  SettingsSectionCard,
  SettingsStickySaveBar,
  settingsPageClass,
} from './settingsUi'

const INPUT_CLASS = 'h-11 rounded-[12px] border border-[#d8e3ee] bg-white px-3.5 text-sm text-[#17233a] shadow-[0_1px_0_rgba(15,23,42,0.02)] placeholder:text-[#9aa8b8] focus:border-[#0f7f4f] focus:outline-none focus:ring-2 focus:ring-[#dff2e8]'
const TEXTAREA_CLASS = 'min-h-[130px] rounded-[12px] border border-[#d8e3ee] bg-white px-3.5 py-3 text-sm text-[#17233a] shadow-[0_1px_0_rgba(15,23,42,0.02)] placeholder:text-[#9aa8b8] focus:border-[#0f7f4f] focus:outline-none focus:ring-2 focus:ring-[#dff2e8]'

const DEFAULT_PRIVATE_PROPERTY_SETTINGS = {
  enabled: false,
  portalUrl: '',
  agencyId: '',
  contactEmail: '',
  contactPhone: '',
  notes: '',
  lastSavedAt: '',
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizePrivatePropertySettings(settings = {}) {
  const source = settings && typeof settings === 'object' ? settings : {}
  return {
    ...DEFAULT_PRIVATE_PROPERTY_SETTINGS,
    ...source,
    enabled: Boolean(source.enabled),
    portalUrl: normalizeText(source.portalUrl || source.portal_url),
    agencyId: normalizeText(source.agencyId || source.agency_id),
    contactEmail: normalizeText(source.contactEmail || source.contact_email).toLowerCase(),
    contactPhone: normalizeText(source.contactPhone || source.contact_phone),
    notes: normalizeText(source.notes),
    lastSavedAt: normalizeText(source.lastSavedAt || source.last_saved_at),
  }
}

function buildOrganisationPayload(context = {}, settingsJson = {}) {
  const organisation = context.organisation || {}
  return {
    name: organisation.name || organisation.displayName || 'Organisation',
    displayName: organisation.displayName || organisation.name || '',
    logoUrl: organisation.logoUrl || organisation.logo_url || '',
    companyEmail: organisation.companyEmail || organisation.company_email || '',
    companyPhone: organisation.companyPhone || organisation.company_phone || '',
    website: organisation.website || '',
    addressLine1: organisation.addressLine1 || organisation.address_line_1 || organisation.address || '',
    addressLine2: organisation.addressLine2 || organisation.address_line_2 || '',
    formattedAddress: organisation.formattedAddress || organisation.formatted_address || '',
    suburb: organisation.suburb || '',
    city: organisation.city || '',
    province: organisation.province || '',
    postalCode: organisation.postalCode || organisation.postal_code || '',
    country: organisation.country || 'South Africa',
    latitude: organisation.latitude ?? null,
    longitude: organisation.longitude ?? null,
    googlePlaceId: organisation.googlePlaceId || organisation.google_place_id || '',
    supportEmail: organisation.supportEmail || organisation.support_email || '',
    supportPhone: organisation.supportPhone || organisation.support_phone || '',
    primaryContactPerson: organisation.primaryContactPerson || organisation.primary_contact_person || '',
    settingsJson,
  }
}

function StatusPill({ ready, label }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
      ready
        ? 'border-[#ccead8] bg-[#f2fbf5] text-[#1f7a45]'
        : 'border-[#f3d9a8] bg-[#fff8ec] text-[#a16207]'
    }`}>
      {ready ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
      {label}
    </span>
  )
}

function Field({ label, children, hint = '' }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[0.78rem] font-semibold text-[#43566d]">{label}</span>
      {children}
      {hint ? <span className="text-xs leading-5 text-[#6b7d93]">{hint}</span> : null}
    </label>
  )
}

function ReadOnlyLink({ label, value }) {
  if (!value) return null
  return (
    <a
      href={value}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 text-sm font-semibold text-[#0f7f4f] transition hover:text-[#0d6f45]"
    >
      <ExternalLink className="h-4 w-4" />
      {label}
    </a>
  )
}

export default function SettingsPrivatePropertyPage() {
  const { refreshOrganisation } = useOrganisation()
  const { currentWorkspace } = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [context, setContext] = useState(null)
  const [settings, setSettings] = useState(() => normalizePrivatePropertySettings())
  const [savedSettings, setSavedSettings] = useState(() => normalizePrivatePropertySettings())

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        const organisationContext = await fetchOrganisationSettings({ forceRefresh: true })
        if (cancelled) return
        const nextSettings = normalizePrivatePropertySettings(organisationContext.organisationSettings?.privateProperty)
        setContext(organisationContext)
        setSettings(nextSettings)
        setSavedSettings(nextSettings)
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Unable to load Private Property settings.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const dirty = JSON.stringify(settings) !== JSON.stringify(savedSettings)
  const workspaceName = currentWorkspace?.name || context?.organisation?.displayName || context?.organisation?.name || 'Organisation'
  const connectionReady = Boolean(settings.enabled && settings.agencyId && settings.portalUrl)
  const contactReady = Boolean(settings.contactEmail || settings.contactPhone)

  function updateSettings(patch) {
    setSuccess('')
    setError('')
    setSettings((current) => normalizePrivatePropertySettings({ ...current, ...patch }))
  }

  async function saveSettings() {
    if (!context) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const nextPrivateProperty = normalizePrivatePropertySettings({
        ...settings,
        lastSavedAt: new Date().toISOString(),
      })
      const organisationSettings = context.organisationSettings || {}
      const nextSettingsJson = {
        ...organisationSettings,
        privateProperty: nextPrivateProperty,
      }
      const result = await updateOrganisationSettings(buildOrganisationPayload(context, nextSettingsJson))
      const nextContext = {
        ...context,
        ...result,
        organisationSettings: nextSettingsJson,
      }
      setContext(nextContext)
      setSettings(nextPrivateProperty)
      setSavedSettings(nextPrivateProperty)
      setSuccess('Private Property settings saved.')
      await refreshOrganisation?.({ forceRefresh: true })
    } catch (saveError) {
      setError(saveError.message || 'Unable to save Private Property settings.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <SettingsLoadingState label="Loading Private Property settings..." />

  if (!context?.organisation?.id) {
    return (
      <div className={settingsPageClass}>
        <SettingsEmptyState
          title="Organisation required"
          description="Complete organisation setup before connecting Private Property."
        />
      </div>
    )
  }

  return (
    <div className={`${settingsPageClass} space-y-6`}>
      <header className="flex flex-col gap-4 border-b border-[#e2eaf2] pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#0f7f4f]">
            <Link2 className="h-4 w-4" />
            {workspaceName}
          </div>
          <h1 className="text-2xl font-semibold text-[#142132]">Private Property</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758d]">
            Store the Private Property connection details, enquiry routing contact, and notes used by the syndication workflow.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill ready={settings.enabled} label={settings.enabled ? 'Enabled' : 'Disabled'} />
          <StatusPill ready={connectionReady} label={connectionReady ? 'Connection ready' : 'Incomplete setup'} />
        </div>
      </header>

      {error ? <SettingsBanner>{error}</SettingsBanner> : null}
      {success ? <SettingsBanner tone="success">{success}</SettingsBanner> : null}

      <SettingsSectionCard
        title="Connection Setup"
        description="Capture the account and portal details needed for Private Property syndication."
      >
        <div className="grid gap-3 lg:grid-cols-3">
          <div className={`rounded-[14px] border px-4 py-3 ${
            settings.enabled
              ? 'border-[#ccead8] bg-[#f2fbf5]'
              : 'border-[#e2eaf2] bg-white'
          }`}>
            <p className="text-xs font-semibold uppercase text-[#6b7d93]">Status</p>
            <p className="mt-1 text-sm font-semibold text-[#17233a]">{settings.enabled ? 'Private Property syndication is enabled.' : 'Syndication is currently disabled.'}</p>
          </div>
          <div className={`rounded-[14px] border px-4 py-3 ${
            settings.agencyId ? 'border-[#ccead8] bg-[#f2fbf5]' : 'border-[#e2eaf2] bg-white'
          }`}>
            <p className="text-xs font-semibold uppercase text-[#6b7d93]">Agency reference</p>
            <p className="mt-1 text-sm font-semibold text-[#17233a]">{settings.agencyId || 'Not saved yet'}</p>
          </div>
          <div className={`rounded-[14px] border px-4 py-3 ${
            settings.portalUrl ? 'border-[#ccead8] bg-[#f2fbf5]' : 'border-[#e2eaf2] bg-white'
          }`}>
            <p className="text-xs font-semibold uppercase text-[#6b7d93]">Portal URL</p>
            <p className="mt-1 break-all text-sm font-semibold text-[#17233a]">{settings.portalUrl || 'Not saved yet'}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Enable syndication">
            <button
              type="button"
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border px-4 text-sm font-semibold transition ${
                settings.enabled
                  ? 'border-[#0f7f4f] bg-[#0f7f4f] text-white shadow-[0_8px_16px_rgba(15,127,79,0.2)] hover:bg-[#0d6f45]'
                  : 'border-[#d9e3ef] bg-white text-[#24364b] hover:bg-[#f7fafc]'
              }`}
              onClick={() => updateSettings({ enabled: !settings.enabled })}
            >
              {settings.enabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
              {settings.enabled ? 'Enabled' : 'Enable Private Property'}
            </button>
          </Field>

          <Field label="Agency ID" hint="Save the agency reference used by your Private Property account.">
            <input
              className={INPUT_CLASS}
              value={settings.agencyId}
              onChange={(event) => updateSettings({ agencyId: event.target.value })}
              placeholder="123456"
            />
          </Field>

          <Field label="Portal URL" hint="Link the live listing profile or agency landing page.">
            <input
              className={INPUT_CLASS}
              value={settings.portalUrl}
              onChange={(event) => updateSettings({ portalUrl: event.target.value })}
              placeholder="https://www.privateproperty.co.za/..."
            />
          </Field>

          <Field label="Contact email" hint="Where Private Property enquiries should be routed.">
            <input
              className={INPUT_CLASS}
              value={settings.contactEmail}
              onChange={(event) => updateSettings({ contactEmail: event.target.value })}
              placeholder="listings@example.co.za"
            />
          </Field>

          <Field label="Contact phone" hint="Optional support number shown on the syndication record.">
            <input
              className={INPUT_CLASS}
              value={settings.contactPhone}
              onChange={(event) => updateSettings({ contactPhone: event.target.value })}
              placeholder="+27 82 000 0000"
            />
          </Field>

          <Field label="Syndication notes" hint="Internal setup notes for the team that manages this portal.">
            <textarea
              className={`${TEXTAREA_CLASS} md:col-span-2`}
              value={settings.notes}
              onChange={(event) => updateSettings({ notes: event.target.value })}
              placeholder="Add any Private Property setup notes here."
            />
          </Field>
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Syndication Summary"
        description="A quick view of the details the team will see when they revisit this setup."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[14px] border border-[#e3ebf3] bg-white px-4 py-3">
            <p className="text-xs font-semibold uppercase text-[#6b7d93]">Connection</p>
            <p className="mt-1 text-sm text-[#17233a]">
              {connectionReady ? 'Portal, agency reference, and enabled status are all present.' : 'Complete the portal URL, agency reference, and enabled status.'}
            </p>
          </div>
          <div className="rounded-[14px] border border-[#e3ebf3] bg-white px-4 py-3">
            <p className="text-xs font-semibold uppercase text-[#6b7d93]">Routing</p>
            <p className="mt-1 text-sm text-[#17233a]">
              {contactReady ? 'A contact email or phone is available for enquiry routing.' : 'Add a contact email or phone number for enquiry routing.'}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#e3ebf3] bg-[#f9fbfe] px-4 py-3">
          <div className="text-sm text-[#60758d]">
            {settings.lastSavedAt ? `Last saved ${new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(settings.lastSavedAt))}` : 'No save has been recorded yet.'}
          </div>
          <ReadOnlyLink label="Open portal link" value={settings.portalUrl} />
        </div>
      </SettingsSectionCard>

      <SettingsStickySaveBar
        dirty={dirty}
        saving={saving}
        message="You have unsaved Private Property changes"
        onDiscard={() => setSettings(savedSettings)}
        onSave={saveSettings}
        saveLabel="Save Private Property"
      />
    </div>
  )
}
