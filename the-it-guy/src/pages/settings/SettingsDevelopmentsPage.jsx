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
      className="space-y-5 pt-5"
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
        <SettingsToggleRow
          title="Reservation deposit enabled by default"
          description="New transactions in this development default to reservation deposit required."
          checked={Boolean(form.reservationDepositEnabledByDefault)}
          disabled={!canEdit}
          onChange={(value) => updateField('reservationDepositEnabledByDefault', value)}
        />
      </div>

      <div className="space-y-4 rounded-[16px] border border-[#e4ebf3] bg-[#fbfdff] p-4">
        <header className="space-y-1">
          <h4 className="text-sm font-semibold text-[#162334]">Reservation Deposit Settings</h4>
          <p className="text-xs leading-5 text-[#6b7d93]">
            These details are used when reservation deposit is required and can be overridden per transaction.
          </p>
        </header>

        <div className={settingsGridClass}>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Reservation amount</span>
            <Field
              type="number"
              min="0"
              step="0.01"
              value={form.reservationDepositAmount ?? ''}
              disabled={!canEdit}
              onChange={(event) => updateField('reservationDepositAmount', event.target.value)}
              placeholder="0.00"
            />
          </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Account holder name</span>
            <Field
              value={form.reservationAccountHolderName || ''}
              disabled={!canEdit}
              onChange={(event) => updateField('reservationAccountHolderName', event.target.value)}
            />
          </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Bank name</span>
            <Field
              value={form.reservationBankName || ''}
              disabled={!canEdit}
              onChange={(event) => updateField('reservationBankName', event.target.value)}
            />
          </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Account number</span>
            <Field
              value={form.reservationAccountNumber || ''}
              disabled={!canEdit}
              onChange={(event) => updateField('reservationAccountNumber', event.target.value)}
            />
          </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Branch code</span>
            <Field
              value={form.reservationBranchCode || ''}
              disabled={!canEdit}
              onChange={(event) => updateField('reservationBranchCode', event.target.value)}
            />
          </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Account type</span>
            <Field
              value={form.reservationAccountType || ''}
              disabled={!canEdit}
              onChange={(event) => updateField('reservationAccountType', event.target.value)}
              placeholder="Savings / Current"
            />
          </label>
          <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
            <span className="text-sm font-medium text-[#51657b]">Payment reference format</span>
            <Field
              value={form.reservationPaymentReferenceFormat || ''}
              disabled={!canEdit}
              onChange={(event) => updateField('reservationPaymentReferenceFormat', event.target.value)}
              placeholder="RES-{unit}-{txn}"
            />
          </label>
          <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
            <span className="text-sm font-medium text-[#51657b]">Payment instructions</span>
            <Field
              as="textarea"
              rows={3}
              value={form.reservationPaymentInstructions || ''}
              disabled={!canEdit}
              onChange={(event) => updateField('reservationPaymentInstructions', event.target.value)}
            />
          </label>
          <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
            <span className="text-sm font-medium text-[#51657b]">Notification recipients</span>
            <Field
              value={form.reservationNotificationRecipients || ''}
              disabled={!canEdit}
              onChange={(event) => updateField('reservationNotificationRecipients', event.target.value)}
              placeholder="ops@firm.com, finance@firm.com"
            />
          </label>
        </div>
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
        description="Configure development defaults and manage active developments from one workspace."
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

      {loading ? <SettingsLoadingState label="Loading developments…" compact /> : null}

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
        <SettingsSectionCard
          title="Active Developments"
          description="Use this table to maintain development records, legal defaults, and feature modules."
        >
          <div className="overflow-hidden rounded-[18px] border border-[#e3eaf2]">
            <div className="hidden grid-cols-[1.5fr_0.8fr_0.7fr_1.2fr_1fr_1.25fr] gap-4 border-b border-[#e6edf4] bg-[#f7fafc] px-5 py-3 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6] lg:grid">
              <span>Development</span>
              <span>Status</span>
              <span>Units</span>
              <span>Attorney</span>
              <span>Modules</span>
              <span>Actions</span>
            </div>

            <div className="divide-y divide-[#e9eff5] bg-white">
              {items.map((item) => {
                const isEditing = editingId === item.id

                return (
                  <div key={item.id}>
                    <div className="grid gap-3 px-5 py-4 lg:grid-cols-[1.5fr_0.8fr_0.7fr_1.2fr_1fr_1.25fr] lg:items-center lg:gap-4">
                      <div className="min-w-0 space-y-1">
                        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#8da0b6] lg:hidden">Development</span>
                        <strong className="block truncate text-sm text-[#162334]">{item.name}</strong>
                        <span className="block truncate text-xs text-[#6b7d93]">{item.location || 'Location pending'}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#8da0b6] lg:hidden">Status</span>
                        <span className="inline-flex rounded-full border border-[#d7e3ef] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#51657b]">
                          {item.status || 'Planning'}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#8da0b6] lg:hidden">Units</span>
                        <span className="text-sm font-medium text-[#51657b]">{item.plannedUnits}</span>
                      </div>
                      <div className="min-w-0 space-y-1">
                        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#8da0b6] lg:hidden">Attorney</span>
                        <span className="block truncate text-sm text-[#51657b]">{item.attorneyName || 'Not configured'}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#8da0b6] lg:hidden">Modules</span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex rounded-full border border-[#d7e3ef] px-2.5 py-1 text-[0.68rem] font-semibold text-[#51657b]">
                            Portal {item.clientPortalEnabled ? 'On' : 'Off'}
                          </span>
                          <span className="inline-flex rounded-full border border-[#d7e3ef] px-2.5 py-1 text-[0.68rem] font-semibold text-[#51657b]">
                            Snags {item.snagReportingEnabled ? 'On' : 'Off'}
                          </span>
                          <span className="inline-flex rounded-full border border-[#d7e3ef] px-2.5 py-1 text-[0.68rem] font-semibold text-[#51657b]">
                            Alterations {item.alterationRequestsEnabled ? 'On' : 'Off'}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#8da0b6] lg:hidden">Actions</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button type="button" variant="secondary" onClick={() => navigate(`/developments/${item.id}`)}>
                            <ExternalLink size={14} />
                            Open
                          </Button>
                          <Button type="button" variant="ghost" onClick={() => setEditingId(isEditing ? null : item.id)}>
                            <Pencil size={14} />
                            {isEditing ? 'Close' : 'Edit'}
                          </Button>
                          {canEdit ? (
                            <Button type="button" variant="ghost" disabled={savingId === item.id} onClick={() => handleArchive(item)}>
                              <Archive size={14} />
                              Archive
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="border-t border-[#e8eef5] bg-[#fbfdff] px-5 pb-5">
                        <DevelopmentEditor
                          item={item}
                          canEdit={canEdit}
                          onSave={handleSave}
                          onCancel={() => setEditingId(null)}
                          saving={savingId === item.id}
                        />
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        </SettingsSectionCard>
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
