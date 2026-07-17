import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import useAttorneyPermissions from '../hooks/useAttorneyPermissions'
import { getCurrentUserPrimaryAttorneyFirm, updateAttorneyFirm } from '../services/attorneyFirms'
import AttorneyMatterNumberingSettings from '../components/attorney/AttorneyMatterNumberingSettings'
import AttorneyFirmModulesSettings from '../components/attorney/AttorneyFirmModulesSettings'
import { FEATURE_FLAGS } from '../lib/featureFlags'

function AttorneyFirmSettingsPage() {
  const { role } = useWorkspace()
  const permissionsState = useAttorneyPermissions()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [firm, setFirm] = useState(null)
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    website: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    province: '',
    postalCode: '',
    country: 'South Africa',
    logoUrl: '',
    primaryColour: '#0f4c81',
    secondaryColour: '#1e2a44',
  })

  const canSubmit = useMemo(() => Boolean(String(form.name || '').trim()) && !saving, [form.name, saving])
  const canEditBranding = permissionsState.hasPermission('can_manage_branding')

  useEffect(() => {
    let active = true

    async function loadFirm() {
      setLoading(true)
      setError('')
      try {
        const currentFirm = await getCurrentUserPrimaryAttorneyFirm()
        if (!active) return
        setFirm(currentFirm)
        if (!currentFirm) {
          setForm((previous) => ({ ...previous, name: '' }))
          return
        }
        setForm({
          name: currentFirm.name || '',
          email: currentFirm.email || '',
          phone: currentFirm.phone || '',
          website: currentFirm.website || '',
          addressLine1: currentFirm.addressLine1 || '',
          addressLine2: currentFirm.addressLine2 || '',
          city: currentFirm.city || '',
          province: currentFirm.province || '',
          postalCode: currentFirm.postalCode || '',
          country: currentFirm.country || 'South Africa',
          logoUrl: currentFirm.logoUrl || '',
          primaryColour: currentFirm.primaryColour || '#0f4c81',
          secondaryColour: currentFirm.secondaryColour || '#1e2a44',
        })
      } catch (loadError) {
        if (!active) return
        setError(loadError.message || 'Unable to load firm settings.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadFirm()
    return () => {
      active = false
    }
  }, [])

  function updateField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!firm?.id || !canEditBranding) return

    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const updated = await updateAttorneyFirm(firm.id, form)
      setFirm(updated)
      setSuccess('Firm settings updated.')
    } catch (submitError) {
      setError(submitError.message || 'Unable to update firm settings.')
    } finally {
      setSaving(false)
    }
  }

  if (role !== 'attorney') {
    return <Navigate to="/dashboard" replace />
  }

  if (permissionsState.loading) {
    return (
      <section className="page">
        <div className="panel card-tier-standard">
          <p className="status-message" style={{ margin: 0 }}>Loading firm permissions…</p>
        </div>
      </section>
    )
  }

  if (permissionsState.error) {
    return (
      <section className="page">
        <div className="panel card-tier-standard">
          <p className="status-message" style={{ margin: 0, color: '#b42318' }}>{permissionsState.error}</p>
        </div>
      </section>
    )
  }

  if (permissionsState.membership && !permissionsState.membership.isActive) {
    return (
      <section className="page">
        <div className="panel card-tier-standard">
          <p className="status-message" style={{ margin: 0 }}>
            {permissionsState.membership.status === 'suspended'
              ? 'Your access to this firm has been suspended. Please contact your firm administrator.'
              : 'You are not an active member of this attorney firm.'}
          </p>
        </div>
      </section>
    )
  }

  if (loading) {
    return (
      <section className="page">
        <div className="panel card-tier-standard">
          <p className="status-message" style={{ margin: 0 }}>Loading firm settings…</p>
        </div>
      </section>
    )
  }

  if (!firm?.id) {
    return <Navigate to="/attorney/onboarding" replace />
  }

  return (
    <section className="page" style={{ maxWidth: '1120px', display: 'grid', gap: '1rem' }}>
      <div className="panel card-tier-standard" style={{ display: 'grid', gap: '0.85rem' }}>
        <h2 style={{ margin: 0 }}>Attorney Firm Settings</h2>
        <p className="status-message" style={{ margin: 0 }}>Update your firm profile, branding baseline, and filing-system preferences.</p>
        {!canEditBranding ? (
          <p className="status-message" style={{ margin: 0 }}>
            You can view firm branding details, but only users with branding permissions can edit this section.
          </p>
        ) : null}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.85rem' }}>
          <label className="form-field">
            <span>Firm Name</span>
            <input value={form.name} onChange={(event) => updateField('name', event.target.value)} required disabled={!canEditBranding} />
          </label>

          <div style={{ display: 'grid', gap: '0.85rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label className="form-field">
              <span>Email</span>
              <input type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} disabled={!canEditBranding} />
            </label>
            <label className="form-field">
              <span>Phone</span>
              <input value={form.phone} onChange={(event) => updateField('phone', event.target.value)} disabled={!canEditBranding} />
            </label>
            <label className="form-field">
              <span>Website</span>
              <input type="url" value={form.website} onChange={(event) => updateField('website', event.target.value)} placeholder="https://" disabled={!canEditBranding} />
            </label>
          </div>

          <label className="form-field">
            <span>Address Line 1</span>
            <input value={form.addressLine1} onChange={(event) => updateField('addressLine1', event.target.value)} disabled={!canEditBranding} />
          </label>

          <div style={{ display: 'grid', gap: '0.85rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label className="form-field">
              <span>City</span>
              <input value={form.city} onChange={(event) => updateField('city', event.target.value)} disabled={!canEditBranding} />
            </label>
            <label className="form-field">
              <span>Province</span>
              <input value={form.province} onChange={(event) => updateField('province', event.target.value)} disabled={!canEditBranding} />
            </label>
            <label className="form-field">
              <span>Postal Code</span>
              <input value={form.postalCode} onChange={(event) => updateField('postalCode', event.target.value)} disabled={!canEditBranding} />
            </label>
          </div>

          <div style={{ display: 'grid', gap: '0.85rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label className="form-field" style={{ gridColumn: '1 / -1' }}>
              <span>Logo URL</span>
              <input value={form.logoUrl} onChange={(event) => updateField('logoUrl', event.target.value)} placeholder="https://" disabled={!canEditBranding} />
            </label>
            <label className="form-field">
              <span>Primary Colour</span>
              <input type="color" value={form.primaryColour} onChange={(event) => updateField('primaryColour', event.target.value)} disabled={!canEditBranding} />
            </label>
            <label className="form-field">
              <span>Secondary Colour</span>
              <input type="color" value={form.secondaryColour} onChange={(event) => updateField('secondaryColour', event.target.value)} disabled={!canEditBranding} />
            </label>
          </div>

          {error ? <p className="status-message" style={{ margin: 0, color: '#b42318' }}>{error}</p> : null}
          {success ? <p className="status-message" style={{ margin: 0, color: '#067647' }}>{success}</p> : null}

          {canEditBranding ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="header-primary-cta" disabled={!canSubmit}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          ) : null}
        </form>
      </div>
      {FEATURE_FLAGS.enableAttorneyModuleSettings ? (
        <AttorneyFirmModulesSettings firmId={firm.id} />
      ) : null}
      <AttorneyMatterNumberingSettings
        firmId={firm.id}
        canManage={permissionsState.canManageFirmSettings}
      />
    </section>
  )
}

export default AttorneyFirmSettingsPage
