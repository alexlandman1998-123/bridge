import { Archive, ExternalLink, Pencil, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AddDevelopmentModal from '../../components/AddDevelopmentModal'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import { useWorkspace } from '../../context/WorkspaceContext'
import { archiveDevelopmentSetting, listDevelopmentSettings, saveDevelopmentConfiguration } from '../../lib/settingsApi'
import {
  SettingsBanner,
  SettingsEmptyState,
  SettingsLoadingState,
  SettingsPageHeader,
  SettingsSectionCard,
  SettingsToggleRow,
  settingsActionRowClass,
  settingsFieldClass,
  settingsFieldSpanClass,
  settingsGridClass,
  settingsPageClass,
} from './settingsUi'

function DevelopmentEditor({ item, canEdit, onSave, onCancel, saving }) {
  const [form, setForm] = useState(item)

  useEffect(() => {
    setForm(item)
  }, [item])

  function updateField(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  return (
    <form
      className="mt-6 space-y-5 border-t border-[#edf2f7] pt-6"
      onSubmit={(event) => {
        event.preventDefault()
        onSave(form)
      }}
    >
      <div className={settingsGridClass}>
        <label className={settingsFieldClass}>
          <span className="text-sm font-medium text-[#51657b]">Development name</span>
          <Field value={form.name} disabled={!canEdit} onChange={(event) => updateField('name', event.target.value)} />
        </label>
        <label className={settingsFieldClass}>
          <span className="text-sm font-medium text-[#51657b]">Reference / code</span>
          <Field value={form.code} disabled={!canEdit} onChange={(event) => updateField('code', event.target.value)} />
        </label>
        <label className={settingsFieldClass}>
          <span className="text-sm font-medium text-[#51657b]">Total units</span>
          <Field
            type="number"
            min="0"
            value={form.plannedUnits}
            disabled={!canEdit}
            onChange={(event) => updateField('plannedUnits', event.target.value)}
          />
        </label>
        <label className={settingsFieldClass}>
          <span className="text-sm font-medium text-[#51657b]">Status</span>
          <Field as="select" value={form.status} disabled={!canEdit} onChange={(event) => updateField('status', event.target.value)}>
            <option value="Planning">Planning</option>
            <option value="Launching">Launching</option>
            <option value="Selling">Selling</option>
            <option value="Transferring">Transferring</option>
            <option value="Completed">Completed</option>
            <option value="Archived">Archived</option>
          </Field>
        </label>
        <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
          <span className="text-sm font-medium text-[#51657b]">Location</span>
          <Field value={form.location} disabled={!canEdit} onChange={(event) => updateField('location', event.target.value)} />
        </label>
        <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
          <span className="text-sm font-medium text-[#51657b]">Address</span>
          <Field value={form.address} disabled={!canEdit} onChange={(event) => updateField('address', event.target.value)} />
        </label>
        <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
          <span className="text-sm font-medium text-[#51657b]">Assigned transferring attorney</span>
          <Field value={form.attorneyName} disabled={!canEdit} onChange={(event) => updateField('attorneyName', event.target.value)} />
        </label>
        <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
          <span className="text-sm font-medium text-[#51657b]">Attorney contact email</span>
          <Field
            value={form.attorneyContactEmail}
            disabled={!canEdit}
            onChange={(event) => updateField('attorneyContactEmail', event.target.value)}
          />
        </label>
      </div>

      <div className="grid gap-3">
        <SettingsToggleRow
          title="Client portal enabled"
          description="Turn on shared post-onboarding workspace access for this development."
          checked={form.clientPortalEnabled}
          disabled={!canEdit}
          onChange={(value) => updateField('clientPortalEnabled', value)}
        />
        <SettingsToggleRow
          title="Snag tracking enabled"
          description="Enable unit-level snag capture and post-registration issue tracking."
          checked={form.snagReportingEnabled}
          disabled={!canEdit}
          onChange={(value) => updateField('snagReportingEnabled', value)}
        />
        <SettingsToggleRow
          title="Alterations enabled"
          description="Allow unit owners to submit alteration requests after registration."
          checked={form.alterationRequestsEnabled}
          disabled={!canEdit}
          onChange={(value) => updateField('alterationRequestsEnabled', value)}
        />
      </div>

      <div className={settingsActionRowClass}>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {canEdit ? (
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save Development'}
          </Button>
        ) : null}
      </div>
    </form>
  )
}

export default function SettingsDevelopmentsPage() {
  const navigate = useNavigate()
  const { role } = useWorkspace()
  const canEdit = role === 'developer'
  const [items, setItems] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await listDevelopmentSettings()
      setItems(response)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function handleSave(item) {
    try {
      setSavingId(item.id)
      setError('')
      await saveDevelopmentConfiguration(item)
      await loadData()
      setEditingId(null)
      setMessage('Development settings saved.')
      window.dispatchEvent(new Event('itg:developments-changed'))
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSavingId('')
    }
  }

  async function handleArchive(item) {
    if (!canEdit) return

    try {
      setSavingId(item.id)
      setError('')
      await archiveDevelopmentSetting(item.id)
      await loadData()
      setMessage(`${item.name} archived.`)
      window.dispatchEvent(new Event('itg:developments-changed'))
    } catch (archiveError) {
      setError(archiveError.message)
    } finally {
      setSavingId('')
    }
  }

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Development Settings"
        title="Manage development configuration"
        description="Manage development configuration, defaults, and linked legal setup."
        actions={
          canEdit ? (
            <Button type="button" onClick={() => setShowCreateModal(true)}>
              <Plus size={16} />
              Add Development
            </Button>
          ) : null
        }
      />

      {!canEdit ? (
        <SettingsBanner tone="warning">Read-only for your role. Developer admins can edit development settings.</SettingsBanner>
      ) : null}
      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
      {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}

      {loading ? <SettingsLoadingState label="Loading developments…" /> : null}

      {!loading && !items.length ? (
        <SettingsEmptyState
          title="No developments configured yet"
          description="Create your first development to start tracking units, transactions, and project defaults."
          action={
            canEdit ? (
              <Button type="button" onClick={() => setShowCreateModal(true)}>
                Add Development
              </Button>
            ) : null
          }
        />
      ) : null}

      {!loading ? (
        <div className="grid gap-4">
          {items.map((item) => {
            const isEditing = editingId === item.id
            return (
              <SettingsSectionCard
                key={item.id}
                className="overflow-hidden"
                title={item.name}
                description={item.location || 'Location pending'}
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full border border-[#d7e3ef] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#51657b]">
                      {item.status || 'Planning'}
                    </span>
                    <span className="inline-flex rounded-full border border-[#d7e3ef] bg-white px-3 py-1 text-xs font-semibold text-[#51657b]">
                      {item.plannedUnits} units
                    </span>
                  </div>
                }
              >
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-[18px] border border-[#e4ebf3] bg-[#fbfdff] px-4 py-4">
                    <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7b8da6]">Attorney</span>
                    <strong className="mt-2 block text-base font-semibold text-[#162334]">{item.attorneyName || 'Not configured'}</strong>
                  </div>
                  <div className="rounded-[18px] border border-[#e4ebf3] bg-[#fbfdff] px-4 py-4">
                    <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7b8da6]">Client Portal</span>
                    <strong className="mt-2 block text-base font-semibold text-[#162334]">
                      {item.clientPortalEnabled ? 'Enabled' : 'Disabled'}
                    </strong>
                  </div>
                  <div className="rounded-[18px] border border-[#e4ebf3] bg-[#fbfdff] px-4 py-4">
                    <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7b8da6]">Snags</span>
                    <strong className="mt-2 block text-base font-semibold text-[#162334]">
                      {item.snagReportingEnabled ? 'Enabled' : 'Disabled'}
                    </strong>
                  </div>
                  <div className="rounded-[18px] border border-[#e4ebf3] bg-[#fbfdff] px-4 py-4">
                    <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7b8da6]">Alterations</span>
                    <strong className="mt-2 block text-base font-semibold text-[#162334]">
                      {item.alterationRequestsEnabled ? 'Enabled' : 'Disabled'}
                    </strong>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Button type="button" variant="secondary" onClick={() => navigate(`/developments/${item.id}`)}>
                    <ExternalLink size={15} />
                    View Development
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setEditingId(isEditing ? null : item.id)}>
                    <Pencil size={15} />
                    {isEditing ? 'Close' : 'Edit'}
                  </Button>
                  {canEdit ? (
                    <Button type="button" variant="ghost" disabled={savingId === item.id} onClick={() => handleArchive(item)}>
                      <Archive size={15} />
                      Archive
                    </Button>
                  ) : null}
                </div>

                {isEditing ? (
                  <DevelopmentEditor
                    item={item}
                    canEdit={canEdit}
                    onSave={handleSave}
                    onCancel={() => setEditingId(null)}
                    saving={savingId === item.id}
                  />
                ) : null}
              </SettingsSectionCard>
            )
          })}
        </div>
      ) : null}

      <AddDevelopmentModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={async () => {
          await loadData()
          window.dispatchEvent(new Event('itg:developments-changed'))
        }}
      />
    </div>
  )
}
