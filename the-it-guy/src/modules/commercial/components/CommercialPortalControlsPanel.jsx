import { Copy, ExternalLink, Loader2, Plus, RotateCw, ShieldCheck, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatDate, titleize } from '../commercialFormatters'
import {
  COMMERCIAL_PORTAL_ROLE_OPTIONS,
  createCommercialPortalInvitation,
  disableCommercialPortalAccess,
  listCommercialPortalAccessForTransaction,
  resendCommercialPortalInvitation,
  revokeCommercialPortalAccess,
} from '../services/commercialPortalApi'

function defaultContactForRole(transaction = {}, role = 'tenant') {
  if (['landlord', 'seller', 'property_manager'].includes(role)) {
    return {
      name: transaction.landlord?.contact_person || transaction.landlord?.name || '',
      email: transaction.landlord?.email || '',
      phone: transaction.landlord?.phone || '',
      company: transaction.landlord?.name || '',
    }
  }
  return {
    name: transaction.contact?.name || transaction.contact?.email || transaction.tenant?.contact_person || transaction.tenant?.name || '',
    email: transaction.contact?.email || transaction.company?.email || transaction.tenant?.email || '',
    phone: transaction.contact?.mobile || transaction.contact?.phone || transaction.tenant?.phone || '',
    company: transaction.company?.company_name || transaction.company?.name || transaction.tenant?.name || '',
  }
}

function buildAbsolutePortalUrl(path = '') {
  if (!path) return ''
  if (typeof window === 'undefined') return path
  return `${window.location.origin}${path}`
}

function CommercialPortalControlsPanel({ organisationId = '', transaction = null }) {
  const [accessRows, setAccessRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [role, setRole] = useState('tenant')
  const [contact, setContact] = useState(defaultContactForRole(transaction, 'tenant'))

  async function loadRows() {
    if (!organisationId || !transaction?.id) return
    setLoading(true)
    setError('')
    try {
      const rows = await listCommercialPortalAccessForTransaction(organisationId, transaction.id)
      setAccessRows(rows)
    } catch (loadError) {
      setError(loadError?.message || 'Portal access could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setContact(defaultContactForRole(transaction, role))
  }, [role, transaction])

  useEffect(() => {
    void loadRows()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organisationId, transaction?.id])

  async function handleCreate(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await createCommercialPortalInvitation({
        organisationId,
        transaction,
        portalRole: role,
        contact,
        expiryDays: 30,
      })
      await loadRows()
    } catch (createError) {
      setError(createError?.message || 'Portal access could not be created.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRevoke(row) {
    setSaving(true)
    setError('')
    try {
      await revokeCommercialPortalAccess(row.id)
      await loadRows()
    } catch (revokeError) {
      setError(revokeError?.message || 'Portal access could not be revoked.')
    } finally {
      setSaving(false)
    }
  }

  function copyLink(row) {
    const url = buildAbsolutePortalUrl(`/commercial/portal/${row.token}`)
    if (navigator?.clipboard?.writeText) {
      void navigator.clipboard.writeText(url)
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Portal Access</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            Create and manage curated external access for landlords, tenants, buyers, sellers, investors, property managers, and corporate contacts. External users cannot see commissions, internal notes, management dashboards, or broker tools.
          </p>
        </div>
        <button type="button" onClick={loadRows} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-600">
          <RotateCw size={15} />
          Refresh
        </button>
      </div>

      {error ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}

      <form onSubmit={handleCreate} className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="grid gap-1 text-sm font-semibold text-[#102236]">
            Portal Type
            <select value={role} onChange={(event) => setRole(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none">
              {COMMERCIAL_PORTAL_ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-[#102236]">
            Contact Name
            <input value={contact.name} onChange={(event) => setContact((current) => ({ ...current, name: event.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none" />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-[#102236]">
            Email
            <input type="email" value={contact.email} onChange={(event) => setContact((current) => ({ ...current, email: event.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none" />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-[#102236]">
            Company
            <input value={contact.company} onChange={(event) => setContact((current) => ({ ...current, company: event.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none" />
          </label>
        </div>
        <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:opacity-60 md:w-fit">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Create Portal Link
        </button>
      </form>

      <div className="mt-5 grid gap-3">
        {loading ? (
          <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
        ) : accessRows.length ? accessRows.map((row) => {
          const path = `/commercial/portal/${row.token}`
          const isActive = row.status === 'active'
          return (
            <article key={row.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                      <ShieldCheck size={13} />
                      {titleize(row.status)}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">{titleize(row.portal_role)}</span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-[#102236]">{row.contact?.contact_name || row.contact?.company_name || 'Portal contact'}</p>
                  <p className="mt-1 text-sm text-slate-500">{row.contact?.contact_email || 'No email'} · Expires {formatDate(row.expires_at)}</p>
                  <p className="mt-2 break-all text-xs font-semibold text-blue-600">{buildAbsolutePortalUrl(path)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => copyLink(row)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-600">
                    <Copy size={15} />
                    Copy
                  </button>
                  <button type="button" onClick={() => resendCommercialPortalInvitation(row.id).then(loadRows).catch((resendError) => setError(resendError?.message || 'Portal invitation could not be resent.'))} disabled={saving} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-600 disabled:opacity-60">
                    <RotateCw size={15} />
                    Resend
                  </button>
                  <a href={path} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-600">
                    <ExternalLink size={15} />
                    Open
                  </a>
                  {isActive ? (
                    <>
                      <button type="button" onClick={() => disableCommercialPortalAccess(row.id).then(loadRows).catch((disableError) => setError(disableError?.message || 'Portal access could not be disabled.'))} disabled={saving} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60">
                        <XCircle size={15} />
                        Disable
                      </button>
                      <button type="button" onClick={() => handleRevoke(row)} disabled={saving} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60">
                        <XCircle size={15} />
                        Revoke
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </article>
          )
        }) : (
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No external commercial portal access has been created for this transaction yet.</p>
        )}
      </div>
    </section>
  )
}

export default CommercialPortalControlsPanel
