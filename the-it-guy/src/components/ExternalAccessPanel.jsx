import { Copy, Link2, List, MailPlus, ShieldX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from './ui/Button'
import Field from './ui/Field'
import {
  EXTERNAL_ACCESS_ROLES,
  createExternalAccessLink,
  fetchExternalAccessLinks,
  revokeExternalAccessLink,
} from '../lib/api'
import { getTransactionRoleLabel } from '../core/transactions/roleConfig'

function ExternalAccessPanel({ transactionId, buyerId, buyerEmail, disabled = false, onLinksChange = null }) {
  const navigate = useNavigate()
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState('')
  const [form, setForm] = useState({
    role: 'attorney',
    email: buyerEmail || '',
    expiresDays: 14,
  })

  const canCreate = Boolean(transactionId) && Boolean(form.email.trim()) && !disabled

  const loadLinks = useCallback(async () => {
    if (!transactionId) {
      setLinks([])
      onLinksChange?.([])
      return
    }

    try {
      setLoading(true)
      setError('')
      const rows = await fetchExternalAccessLinks(transactionId)
      setLinks(rows)
      onLinksChange?.(rows)
    } catch (loadError) {
      setError(loadError.message)
      onLinksChange?.([])
    } finally {
      setLoading(false)
    }
  }, [onLinksChange, transactionId])

  useEffect(() => {
    void loadLinks()
  }, [loadLinks])

  const sortedLinks = useMemo(
    () =>
      [...links].sort((a, b) => {
        if (a.revoked === b.revoked) {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        }

        return a.revoked ? 1 : -1
      }),
    [links],
  )

  async function handleCreate(event) {
    event.preventDefault()
    if (!canCreate) {
      return
    }

    try {
      setSaving(true)
      setError('')
      await createExternalAccessLink({
        transactionId,
        buyerId: buyerId || null,
        role: form.role,
        email: form.email.trim(),
        expiresDays: form.expiresDays,
      })
      await loadLinks()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRevoke(linkId) {
    try {
      setSaving(true)
      setError('')
      await revokeExternalAccessLink(linkId)
      await loadLinks()
    } catch (revokeError) {
      setError(revokeError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleCopyLink(link) {
    const url = `${window.location.origin}/external/${link.access_token}`
    await navigator.clipboard.writeText(url)
    setCopiedId(link.id)
    setTimeout(() => setCopiedId(''), 1400)
  }

  return (
    <section className="rounded-[22px] border border-[#dde4ee] bg-[#fbfcfe] p-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h4 className="text-[1rem] font-semibold tracking-[-0.03em] text-[#142132]">External Access</h4>
          <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Generate secure links for conveyancers, bond originators, or other transaction participants.</p>
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#eef4f9] text-[#35546c]">
          <MailPlus size={16} />
        </span>
      </div>

      {error ? <div className="mt-4 rounded-[16px] border border-[#f6d4d4] bg-[#fff5f5] px-4 py-3 text-sm text-[#b42318]">{error}</div> : null}
      {loading ? <div className="mt-4 rounded-[16px] border border-[#dde4ee] bg-white px-4 py-3 text-sm text-[#6b7d93]">Loading access links...</div> : null}

      <form onSubmit={handleCreate} className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_auto]">
        <label className="grid gap-2 text-sm font-medium text-[#35546c]">
          <span>Role</span>
          <Field
            as="select"
            value={form.role}
            onChange={(event) => setForm((previous) => ({ ...previous, role: event.target.value }))}
          >
            {EXTERNAL_ACCESS_ROLES.map((role) => (
              <option value={role} key={role}>
                {getTransactionRoleLabel(role)}
              </option>
            ))}
          </Field>
        </label>

        <label className="grid gap-2 text-sm font-medium text-[#35546c]">
          <span>Email</span>
          <Field
            type="email"
            value={form.email}
            onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))}
            placeholder="person@example.com"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-[#35546c]">
          <span>Expires (days)</span>
          <Field
            type="number"
            min="1"
            max="90"
            value={form.expiresDays}
            onChange={(event) => setForm((previous) => ({ ...previous, expiresDays: event.target.value }))}
          />
        </label>

        <div className="flex items-end">
          <Button type="submit" disabled={saving || !canCreate} className="w-full xl:w-auto">
            Generate Link
          </Button>
        </div>
      </form>

      {!transactionId ? (
        <div className="mt-4 rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-4 text-sm text-[#6b7d93]">
          Create a transaction first to generate external access links.
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {sortedLinks.map((link) => {
          const isExpired = link.expires_at ? new Date(link.expires_at).getTime() < Date.now() : false
          const statusText = link.revoked
            ? 'Revoked'
            : isExpired
              ? 'Expired'
              : link.expires_at
                ? `Expires ${new Date(link.expires_at).toLocaleDateString()}`
                : 'No expiry'

          return (
            <article
              key={link.id}
              className={[
                'flex flex-col gap-4 rounded-[18px] border px-4 py-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)] lg:flex-row lg:items-center lg:justify-between',
                link.revoked ? 'border-[#ead7d7] bg-[#fff7f7]' : 'border-[#dde4ee] bg-white',
              ].join(' ')}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm font-semibold text-[#142132]">{getTransactionRoleLabel(link.role)}</strong>
                  <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-2.5 py-1 text-[0.72rem] font-semibold text-[#66758b]">
                    {statusText}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[#4f647a]">{link.email}</p>
                <span className="mt-1 block text-xs text-[#8aa0b8]">{new Date(link.created_at).toLocaleString()}</span>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => handleCopyLink(link)} disabled={saving}>
                  <Copy size={14} />
                  {copiedId === link.id ? 'Copied' : 'Copy'}
                </Button>
                {!link.revoked ? (
                  <Button type="button" variant="secondary" onClick={() => handleRevoke(link.id)} disabled={saving} className="border-[#f2d1d1] text-[#b42318] hover:bg-[#fff5f5]">
                    <ShieldX size={14} />
                    Revoke
                  </Button>
                ) : null}
                <a
                  href={`/external/${link.access_token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ui-button-secondary"
                >
                  <Link2 size={14} />
                  View
                </a>
              </div>
            </article>
          )
        })}

        {!sortedLinks.length && transactionId ? (
          <div className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
            No external access links created yet.
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex justify-end">
        <Button type="button" variant="ghost" onClick={() => navigate('/units')}>
          <List size={14} />
          Units
        </Button>
      </div>
    </section>
  )
}

export default ExternalAccessPanel
