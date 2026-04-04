import { Copy, ExternalLink, Link2, ShieldX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from './ui/Button'
import {
  fetchClientPortalLinks,
  getOrCreateTransactionOnboarding,
  getOrCreateClientPortalLink,
  revokeClientPortalLink,
} from '../lib/api'

function ClientPortalAccessPanel({
  developmentId,
  unitId,
  transactionId,
  buyerId,
  purchaserType = 'individual',
  disabled = false,
  onActiveLinkChange,
}) {
  const [links, setLinks] = useState([])
  const [onboarding, setOnboarding] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState('')
  const [copiedOnboarding, setCopiedOnboarding] = useState(false)
  const [error, setError] = useState('')

  const activeLink = useMemo(() => links.find((item) => item.is_active) || null, [links])

  const loadLinks = useCallback(async () => {
    if (!transactionId) {
      setLinks([])
      setOnboarding(null)
      return
    }

    try {
      setLoading(true)
      setError('')
      const rows = await fetchClientPortalLinks(transactionId)
      setLinks(rows)

      try {
        const onboardingRecord = await getOrCreateTransactionOnboarding({
          transactionId,
          purchaserType,
        })
        setOnboarding(onboardingRecord)
      } catch (onboardingError) {
        setOnboarding(null)
        setError(onboardingError.message)
      }
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [transactionId, purchaserType])

  useEffect(() => {
    void loadLinks()
  }, [loadLinks])

  useEffect(() => {
    onActiveLinkChange?.(activeLink)
  }, [activeLink, onActiveLinkChange])

  async function handleGenerate() {
    if (!developmentId || !unitId || !transactionId) {
      return
    }

    try {
      setSaving(true)
      setError('')
      await getOrCreateClientPortalLink({
        developmentId,
        unitId,
        transactionId,
        buyerId: buyerId || null,
      })
      await loadLinks()
    } catch (createError) {
      setError(createError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRevoke(linkId) {
    try {
      setSaving(true)
      setError('')
      await revokeClientPortalLink(linkId)
      await loadLinks()
    } catch (revokeError) {
      setError(revokeError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleCopy(link) {
    const url = `${window.location.origin}/client/${link.token}`
    await navigator.clipboard.writeText(url)
    setCopiedId(link.id)
    setTimeout(() => setCopiedId(''), 1400)
  }

  async function handleCopyOnboarding() {
    if (!onboarding?.token) {
      return
    }

    const url = `${window.location.origin}/client/onboarding/${onboarding.token}`
    await navigator.clipboard.writeText(url)
    setCopiedOnboarding(true)
    setTimeout(() => setCopiedOnboarding(false), 1400)
  }

  return (
    <section className="rounded-[22px] border border-[#dde4ee] bg-[#fbfcfe] p-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h4 className="text-[1rem] font-semibold tracking-[-0.03em] text-[#142132]">Client Portal Access</h4>
          <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Share a buyer-facing portal and onboarding link without leaving the unit workspace.</p>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-[16px] border border-[#f6d4d4] bg-[#fff5f5] px-4 py-3 text-sm text-[#b42318]">{error}</div> : null}
      {loading ? <div className="mt-4 rounded-[16px] border border-[#dde4ee] bg-white px-4 py-3 text-sm text-[#6b7d93]">Loading portal links...</div> : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={handleGenerate}
          disabled={saving || disabled || !transactionId || Boolean(activeLink)}
        >
          Generate Client Link
        </Button>

        {activeLink ? (
          <>
            <Button type="button" variant="secondary" onClick={() => handleCopy(activeLink)} disabled={saving || disabled}>
              <Copy size={14} />
              {copiedId === activeLink.id ? 'Copied' : 'Copy Link'}
            </Button>

            <a
              href={`/client/${activeLink.token}`}
              target="_blank"
              rel="noreferrer"
              className="ui-button-secondary"
            >
              <ExternalLink size={14} />
              Open Portal
            </a>
          </>
        ) : null}
      </div>

      {!transactionId ? (
        <div className="mt-4 rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-4 text-sm text-[#6b7d93]">
          Create a transaction first to generate a client portal link.
        </div>
      ) : null}

      {onboarding ? (
        <section className="mt-5 rounded-[18px] border border-[#dde4ee] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h5 className="text-sm font-semibold text-[#142132]">Information Sheet Link</h5>
              <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Persona-based onboarding form generated from the purchaser structure.</p>
            </div>
            <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#66758b]">
              {onboarding.status}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#fbfcfe] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]">
              {onboarding.purchaserTypeLabel}
            </span>
            <Button type="button" variant="secondary" onClick={handleCopyOnboarding} disabled={saving || disabled}>
              <Copy size={14} />
              {copiedOnboarding ? 'Copied' : 'Copy Onboarding Link'}
            </Button>
            <a
              href={`/client/onboarding/${onboarding.token}`}
              target="_blank"
              rel="noreferrer"
              className="ui-button-secondary"
            >
              <Link2 size={14} />
              Open Onboarding
            </a>
          </div>
        </section>
      ) : null}

      <div className="mt-5 space-y-3">
        {links.map((link) => (
          <article
            key={link.id}
            className={[
              'flex flex-col gap-4 rounded-[18px] border px-4 py-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)] lg:flex-row lg:items-center lg:justify-between',
              link.is_active ? 'border-[#dde4ee] bg-white' : 'border-[#ead7d7] bg-[#fff7f7]',
            ].join(' ')}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm font-semibold text-[#142132]">{link.is_active ? 'Active client portal link' : 'Revoked client portal link'}</strong>
                <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-2.5 py-1 text-[0.72rem] font-semibold text-[#66758b]">
                  Updated {new Date(link.updated_at).toLocaleDateString()}
                </span>
              </div>
              <p className="mt-1 break-all text-sm text-[#4f647a]">{link.token}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => handleCopy(link)} disabled={saving || disabled}>
                <Copy size={14} />
                {copiedId === link.id ? 'Copied' : 'Copy'}
              </Button>

              {link.is_active ? (
                <Button type="button" variant="secondary" onClick={() => handleRevoke(link.id)} disabled={saving || disabled} className="border-[#f2d1d1] text-[#b42318] hover:bg-[#fff5f5]">
                  <ShieldX size={14} />
                  Revoke
                </Button>
              ) : null}

              <a
                href={`/client/${link.token}`}
                target="_blank"
                rel="noreferrer"
                className="ui-button-secondary"
              >
                <Link2 size={14} />
                View
              </a>
            </div>
          </article>
        ))}

        {!links.length && transactionId ? (
          <div className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
            No client portal links created yet.
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default ClientPortalAccessPanel
