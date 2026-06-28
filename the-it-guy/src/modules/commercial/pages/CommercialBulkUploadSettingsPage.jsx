import { AlertCircle, CheckCircle2, DatabaseZap, Save, Settings2, UploadCloud } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { fetchOrganisationSettings, updateWorkflowSettings } from '../../../lib/settingsApi'

const RECORD_TYPE_OPTIONS = [
  { value: 'vacancies', label: 'Vacancies', description: 'Commercial vacancy schedules and unit availability.' },
  { value: 'leads', label: 'Leads / Requirements', description: 'Tenant or buyer demand records used by the pipeline.' },
  { value: 'canvassing_landlord_prospects', label: 'Landlord Canvassing Prospects', description: 'Supply-side landlord targets and portfolio prospects.' },
  { value: 'canvassing_tenant_prospects', label: 'Tenant Canvassing Prospects', description: 'Demand-side occupier targets and tenant prospects.' },
  { value: 'properties', label: 'Properties', description: 'Property anchors used by vacancies and listings.' },
  { value: 'landlords', label: 'Landlords', description: 'Portfolio owners and landlord organisations.' },
  { value: 'companies', label: 'Companies', description: 'Commercial account records for tenants, buyers, funds, and counterparties.' },
  { value: 'contacts', label: 'Contacts', description: 'Decision makers, asset managers, property managers, and tenant reps.' },
  { value: 'listings', label: 'Listings', description: 'Market-ready commercial sale or lease opportunities.' },
]

const DEFAULT_BULK_UPLOAD_SETTINGS = {
  enabled: true,
  allowedRecordTypes: [
    'vacancies',
    'leads',
    'canvassing_landlord_prospects',
    'canvassing_tenant_prospects',
  ],
  requireManagerApproval: true,
  duplicateStrategy: 'review',
  defaultOwnerMode: 'uploading_broker',
  maxRowsPerUpload: 1000,
  documentUploadsEnabled: false,
}

const DUPLICATE_STRATEGIES = [
  { value: 'review', label: 'Review duplicates' },
  { value: 'skip', label: 'Skip duplicates' },
  { value: 'update', label: 'Update matching records' },
]

const OWNER_MODES = [
  { value: 'uploading_broker', label: 'Uploading broker' },
  { value: 'selected_broker', label: 'Selected broker' },
  { value: 'unassigned', label: 'Leave unassigned' },
]

function normalizeBulkUploadSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const allowedRecordTypes = Array.isArray(source.allowedRecordTypes)
    ? source.allowedRecordTypes.filter((recordType) => RECORD_TYPE_OPTIONS.some((option) => option.value === recordType))
    : DEFAULT_BULK_UPLOAD_SETTINGS.allowedRecordTypes

  return {
    ...DEFAULT_BULK_UPLOAD_SETTINGS,
    ...source,
    enabled: source.enabled !== false,
    allowedRecordTypes,
    requireManagerApproval: source.requireManagerApproval !== false,
    duplicateStrategy: DUPLICATE_STRATEGIES.some((strategy) => strategy.value === source.duplicateStrategy)
      ? source.duplicateStrategy
      : DEFAULT_BULK_UPLOAD_SETTINGS.duplicateStrategy,
    defaultOwnerMode: OWNER_MODES.some((mode) => mode.value === source.defaultOwnerMode)
      ? source.defaultOwnerMode
      : DEFAULT_BULK_UPLOAD_SETTINGS.defaultOwnerMode,
    maxRowsPerUpload: Math.max(1, Math.min(10000, Number(source.maxRowsPerUpload) || DEFAULT_BULK_UPLOAD_SETTINGS.maxRowsPerUpload)),
    documentUploadsEnabled: Boolean(source.documentUploadsEnabled),
  }
}

function CommercialBulkUploadSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [settings, setSettings] = useState(DEFAULT_BULK_UPLOAD_SETTINGS)
  const [organisationSettings, setOrganisationSettings] = useState({})

  useEffect(() => {
    let cancelled = false

    async function loadSettings() {
      setLoading(true)
      setError('')
      try {
        const response = await fetchOrganisationSettings({ forceRefresh: true })
        if (cancelled) return
        const nextOrganisationSettings = response?.organisationSettings || response || {}
        setOrganisationSettings(nextOrganisationSettings)
        setSettings(normalizeBulkUploadSettings(nextOrganisationSettings.commercialWorkspace?.bulkUpload))
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || 'Bulk upload settings could not be loaded.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadSettings()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedCount = settings.allowedRecordTypes.length
  const enabledSummary = useMemo(() => {
    if (!settings.enabled) return 'Bulk upload disabled'
    if (!selectedCount) return 'No record types selected'
    return `${selectedCount} record ${selectedCount === 1 ? 'type' : 'types'} enabled`
  }, [selectedCount, settings.enabled])

  function updateSetting(key, value) {
    setSuccess('')
    setSettings((previous) => ({ ...previous, [key]: value }))
  }

  function toggleRecordType(recordType) {
    setSuccess('')
    setSettings((previous) => {
      const selected = new Set(previous.allowedRecordTypes || [])
      if (selected.has(recordType)) selected.delete(recordType)
      else selected.add(recordType)
      return { ...previous, allowedRecordTypes: Array.from(selected) }
    })
  }

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const normalized = normalizeBulkUploadSettings(settings)
      const existingCommercialWorkspace = organisationSettings.commercialWorkspace || {}
      const nextSettings = {
        ...organisationSettings,
        commercialWorkspace: {
          ...existingCommercialWorkspace,
          bulkUpload: normalized,
        },
      }
      const response = await updateWorkflowSettings(nextSettings)
      const updatedSettings = response?.organisationSettings || response || nextSettings
      setOrganisationSettings(updatedSettings)
      setSettings(normalizeBulkUploadSettings(updatedSettings.commercialWorkspace?.bulkUpload))
      setSuccess('Bulk upload settings saved.')
    } catch (saveError) {
      setError(saveError?.message || 'Bulk upload settings could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="grid gap-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">Bulk Upload & Imports</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              Configure which commercial data types can be bulk uploaded before the import workflow is enabled.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
            <DatabaseZap size={14} /> Phase 1 settings
          </span>
        </div>
      </section>

      {error ? (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
          {success}
        </div>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
        {loading ? (
          <div className="grid gap-3">
            <div className="h-8 w-56 animate-pulse rounded-xl bg-slate-100" />
            <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          </div>
        ) : (
          <div className="grid gap-6">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-[#102236]">Import Access</h2>
                <p className="mt-1 text-sm text-slate-500">{enabledSummary}</p>
              </div>
              <button
                type="button"
                onClick={() => updateSetting('enabled', !settings.enabled)}
                className={`inline-flex min-h-10 w-fit items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition ${
                  settings.enabled ? 'bg-[#102b46] text-white hover:bg-[#163a5b]' : 'border border-slate-200 bg-white text-[#102236] hover:bg-slate-50'
                }`}
              >
                <UploadCloud size={16} />
                {settings.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <Settings2 size={17} className="text-[#1267a3]" />
                <h2 className="text-base font-semibold text-[#102236]">Allowed Upload Types</h2>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {RECORD_TYPE_OPTIONS.map((option) => {
                  const selected = settings.allowedRecordTypes.includes(option.value)
                  return (
                    <label
                      key={option.value}
                      className={`flex min-h-[112px] cursor-pointer gap-3 rounded-2xl border p-4 transition ${
                        selected ? 'border-[#9fb9d1] bg-[#eef5fb]' : 'border-slate-200 bg-[#fbfcfe] hover:bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleRecordType(option.value)}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-[#1267a3] focus:ring-[#9fb9d1]"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-[#102236]">{option.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">{option.description}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-4 border-t border-slate-100 pt-5 lg:grid-cols-3">
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Max rows per upload</span>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={settings.maxRowsPerUpload}
                  onChange={(event) => updateSetting('maxRowsPerUpload', event.target.value)}
                  className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236] outline-none focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Duplicate handling</span>
                <select
                  value={settings.duplicateStrategy}
                  onChange={(event) => updateSetting('duplicateStrategy', event.target.value)}
                  className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236] outline-none focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
                >
                  {DUPLICATE_STRATEGIES.map((strategy) => <option key={strategy.value} value={strategy.value}>{strategy.label}</option>)}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Default owner</span>
                <select
                  value={settings.defaultOwnerMode}
                  onChange={(event) => updateSetting('defaultOwnerMode', event.target.value)}
                  className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236] outline-none focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
                >
                  {OWNER_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                </select>
              </label>
            </div>

            <div className="grid gap-3 border-t border-slate-100 pt-5 md:grid-cols-2">
              <label className="flex min-h-16 cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                <input
                  type="checkbox"
                  checked={settings.requireManagerApproval}
                  onChange={(event) => updateSetting('requireManagerApproval', event.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-[#1267a3] focus:ring-[#9fb9d1]"
                />
                <span>
                  <span className="block text-sm font-semibold text-[#102236]">Require manager approval</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">Imports stay in review until a commercial manager approves them.</span>
                </span>
              </label>
              <label className="flex min-h-16 cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                <input
                  type="checkbox"
                  checked={settings.documentUploadsEnabled}
                  onChange={(event) => updateSetting('documentUploadsEnabled', event.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-[#1267a3] focus:ring-[#9fb9d1]"
                />
                <span>
                  <span className="block text-sm font-semibold text-[#102236]">Allow document imports later</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">Reserved for the later ZIP or manifest-based document upload workflow.</span>
                </span>
              </label>
            </div>

            <div className="flex justify-end border-t border-slate-100 pt-5">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#102b46] px-5 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}
      </section>
    </form>
  )
}

export default CommercialBulkUploadSettingsPage
