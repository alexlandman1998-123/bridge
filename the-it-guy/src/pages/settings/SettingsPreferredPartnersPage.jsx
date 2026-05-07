import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import { useWorkspace } from '../../context/WorkspaceContext'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import {
  fetchOrganisationSettings,
  listOrganisationPreferredPartners,
  removeOrganisationPreferredPartner,
  saveOrganisationPreferredPartner,
} from '../../lib/settingsApi'
import {
  filterPreferredPartners,
  getPreferredPartnerTypeLabel,
  PREFERRED_PARTNER_PROVINCES,
  PREFERRED_PARTNER_TYPES,
} from '../../lib/preferredPartners'
import {
  SettingsBanner,
  SettingsEmptyState,
  SettingsLoadingState,
  SettingsPageHeader,
  SettingsSectionCard,
  settingsActionRowClass,
  settingsFieldClass,
  settingsFieldSpanClass,
  settingsGridClass,
  settingsPageClass,
} from './settingsUi'

function createPartnerDraft() {
  return {
    partnerType: 'transfer_attorney',
    companyName: '',
    contactPerson: '',
    email: '',
    phone: '',
    website: '',
    physicalAddress: '',
    province: 'Gauteng',
    notes: '',
    isActive: true,
    isPreferredDefault: false,
  }
}

export default function SettingsPreferredPartnersPage() {
  const { role } = useWorkspace()
  const [membershipRole, setMembershipRole] = useState('viewer')
  const canEdit = canManageOrganisationSettings({
    appRole: role,
    membershipRole: normalizeOrganisationMembershipRole(membershipRole),
  })
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editingPartnerId, setEditingPartnerId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [form, setForm] = useState(createPartnerDraft())

  const loadPartners = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const [context, rows] = await Promise.all([
        fetchOrganisationSettings(),
        listOrganisationPreferredPartners(),
      ])
      setMembershipRole(context?.membershipRole || 'viewer')
      setPartners(rows || [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load preferred partners.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPartners()
  }, [loadPartners])

  const filteredPartners = useMemo(
    () =>
      filterPreferredPartners(partners, {
        type: typeFilter,
        query: searchQuery,
        activeOnly: statusFilter === 'active',
      }).filter((item) => (statusFilter === 'inactive' ? !item.isActive : true)),
    [partners, searchQuery, statusFilter, typeFilter],
  )

  function updateFormField(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  function resetForm() {
    setEditingPartnerId('')
    setForm(createPartnerDraft())
  }

  function startEdit(partner) {
    setEditingPartnerId(partner.id)
    setForm({
      partnerType: partner.partnerType || 'transfer_attorney',
      companyName: partner.companyName || '',
      contactPerson: partner.contactPerson || '',
      email: partner.email || '',
      phone: partner.phone || '',
      website: partner.website || '',
      physicalAddress: partner.physicalAddress || '',
      province: partner.province || 'Gauteng',
      notes: partner.notes || '',
      isActive: Boolean(partner.isActive),
      isPreferredDefault: Boolean(partner.isPreferredDefault),
    })
  }

  function validateForm() {
    if (!String(form.companyName || '').trim()) {
      throw new Error('Company name is required.')
    }
    if (!String(form.contactPerson || '').trim()) {
      throw new Error('Contact person is required.')
    }
    if (!String(form.email || '').trim()) {
      throw new Error('Email address is required.')
    }
    if (!String(form.phone || '').trim()) {
      throw new Error('Phone number is required.')
    }
    if (!String(form.website || '').trim()) {
      throw new Error('Website is required.')
    }
    if (!String(form.physicalAddress || '').trim()) {
      throw new Error('Physical address is required.')
    }
    if (!String(form.province || '').trim()) {
      throw new Error('Province is required.')
    }
  }

  async function handleSave(event) {
    event.preventDefault()
    if (!canEdit) return

    try {
      validateForm()
      setSaving(true)
      setError('')
      setMessage('')
      await saveOrganisationPreferredPartner({
        id: editingPartnerId || undefined,
        ...form,
      })
      await loadPartners()
      setMessage(editingPartnerId ? 'Preferred partner updated.' : 'Preferred partner added.')
      resetForm()
    } catch (saveError) {
      setError(saveError.message || 'Unable to save preferred partner.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(partner) {
    if (!canEdit) return

    try {
      setError('')
      setMessage('')
      await removeOrganisationPreferredPartner(partner.id)
      if (String(editingPartnerId) === String(partner.id)) {
        resetForm()
      }
      await loadPartners()
      setMessage('Preferred partner removed.')
    } catch (removeError) {
      setError(removeError.message || 'Unable to remove preferred partner.')
    }
  }

  async function handleToggleActive(partner) {
    if (!canEdit) return

    try {
      setError('')
      await saveOrganisationPreferredPartner({
        ...partner,
        isActive: !partner.isActive,
        isPreferredDefault: partner.isActive ? false : partner.isPreferredDefault,
      })
      await loadPartners()
    } catch (toggleError) {
      setError(toggleError.message || 'Unable to update partner status.')
    }
  }

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Preferred Partners"
        title="Organisation role-player network"
        description="Manage approved bond and legal partners so agents can assign role players in seconds during deal setup."
      />

      {!canEdit ? (
        <SettingsBanner tone="warning">Read-only for your role. Only Principal-level administrators can manage organisation preferred partners.</SettingsBanner>
      ) : null}

      <SettingsSectionCard title="Partner Directory" description="Search, filter, and maintain your approved organisation partner panel.">
        <div className="grid gap-4 md:grid-cols-3">
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Search partners</span>
            <Field value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search company, contact, or email" />
          </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Partner type</span>
            <Field as="select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="all">All partner types</option>
              {PREFERRED_PARTNER_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Field>
          </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Status</span>
            <Field as="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </Field>
          </label>
        </div>

        {loading ? <SettingsLoadingState label="Loading preferred partners…" compact /> : null}

        {!loading && !filteredPartners.length ? (
          <SettingsEmptyState
            title="No preferred partners match this filter"
            description="Add your first partner below, or adjust the filters to see existing partners."
          />
        ) : null}

        {!loading && filteredPartners.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredPartners.map((partner) => (
              <article key={partner.id} className="rounded-[16px] border border-[#e3eaf3] bg-[#fbfdff] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-[#162334]">{partner.companyName}</p>
                    <p className="mt-1 text-sm text-[#60748b]">{partner.contactPerson || 'No contact person set'}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full border border-[#d7e2ef] bg-white px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#5f748c]">
                      {getPreferredPartnerTypeLabel(partner.partnerType)}
                    </span>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] ${
                        partner.isActive
                          ? 'border-[#cce8d6] bg-[#f1fbf4] text-[#1f7a45]'
                          : 'border-[#f0d4d4] bg-[#fff5f5] text-[#a23b3b]'
                      }`}
                    >
                      {partner.isActive ? 'Active' : 'Inactive'}
                    </span>
                    {partner.isPreferredDefault ? (
                      <span className="inline-flex rounded-full border border-[#d8e6f7] bg-[#eef5ff] px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#2b5f93]">
                        Default
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-sm text-[#5f748c]">
                  <p>{partner.email || 'No email'}</p>
                  <p>{partner.phone || 'No phone number'}</p>
                  <p>{partner.website || 'No website'}</p>
                  <p>{partner.physicalAddress || 'No physical address'}{partner.province ? `, ${partner.province}` : ''}</p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {canEdit ? (
                    <Button type="button" variant="ghost" onClick={() => startEdit(partner)}>
                      Edit
                    </Button>
                  ) : null}
                  {canEdit ? (
                    <Button type="button" variant="ghost" onClick={() => handleToggleActive(partner)}>
                      {partner.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  ) : null}
                  {canEdit ? (
                    <Button type="button" variant="ghost" onClick={() => handleRemove(partner)}>
                      Remove
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </SettingsSectionCard>

      <SettingsSectionCard
        title={editingPartnerId ? 'Edit Preferred Partner' : 'Add Preferred Partner'}
        description="Capture organisation-approved partner details used in New Deal role-player assignment."
      >
        <form className={settingsGridClass} onSubmit={handleSave}>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Partner type</span>
            <Field
              as="select"
              value={form.partnerType}
              disabled={!canEdit}
              onChange={(event) => updateFormField('partnerType', event.target.value)}
            >
              {PREFERRED_PARTNER_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Field>
          </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Company name</span>
            <Field value={form.companyName} disabled={!canEdit} onChange={(event) => updateFormField('companyName', event.target.value)} />
          </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Contact person</span>
            <Field value={form.contactPerson} disabled={!canEdit} onChange={(event) => updateFormField('contactPerson', event.target.value)} />
          </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Email address</span>
            <Field type="email" value={form.email} disabled={!canEdit} onChange={(event) => updateFormField('email', event.target.value)} />
          </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Phone number</span>
            <Field value={form.phone} disabled={!canEdit} onChange={(event) => updateFormField('phone', event.target.value)} />
          </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Website</span>
            <Field value={form.website} disabled={!canEdit} onChange={(event) => updateFormField('website', event.target.value)} />
          </label>
          <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
            <span className="text-sm font-medium text-[#51657b]">Physical address</span>
            <Field value={form.physicalAddress} disabled={!canEdit} onChange={(event) => updateFormField('physicalAddress', event.target.value)} />
          </label>
          <label className={settingsFieldClass}>
            <span className="text-sm font-medium text-[#51657b]">Province</span>
            <Field as="select" value={form.province} disabled={!canEdit} onChange={(event) => updateFormField('province', event.target.value)}>
              {PREFERRED_PARTNER_PROVINCES.map((province) => (
                <option key={province} value={province}>
                  {province}
                </option>
              ))}
            </Field>
          </label>
          <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
            <span className="text-sm font-medium text-[#51657b]">Notes</span>
            <Field as="textarea" rows={3} value={form.notes} disabled={!canEdit} onChange={(event) => updateFormField('notes', event.target.value)} />
          </label>

          <label className="flex items-center gap-3 text-sm font-medium text-[#35546c]">
            <input
              type="checkbox"
              checked={Boolean(form.isActive)}
              disabled={!canEdit}
              onChange={(event) => updateFormField('isActive', event.target.checked)}
            />
            Active
          </label>

          <label className="flex items-center gap-3 text-sm font-medium text-[#35546c]">
            <input
              type="checkbox"
              checked={Boolean(form.isPreferredDefault)}
              disabled={!canEdit}
              onChange={(event) => updateFormField('isPreferredDefault', event.target.checked)}
            />
            Preferred by default
          </label>

          {canEdit ? (
            <div className={`${settingsActionRowClass} md:col-span-2`}>
              {editingPartnerId ? (
                <Button type="button" variant="ghost" onClick={resetForm} disabled={saving}>
                  Cancel Edit
                </Button>
              ) : null}
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : editingPartnerId ? 'Save Changes' : 'Add Preferred Partner'}
              </Button>
            </div>
          ) : null}
        </form>
      </SettingsSectionCard>

      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
      {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}
    </div>
  )
}
