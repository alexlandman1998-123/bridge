import { AlertTriangle, CheckCircle2, FileText, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  acceptDeveloperPartnerInvitationByToken,
  fetchDeveloperPartnerInvitation,
} from '../lib/api'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function formatDate(value) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function getAgreementLabel(partnerType = '') {
  if (partnerType === 'transfer_attorney') return 'Transfer Attorney SLA'
  if (partnerType === 'bond_originator') return 'Bond Originator SLA'
  return 'Agency Mandate'
}

function getScopeLabel(context = {}) {
  const scopeType = context.relationship?.scopeType
  const scopeJson = context.relationship?.scopeJson || {}
  if (scopeType === 'specific_developments') {
    const count = Array.isArray(scopeJson.developmentIds) ? scopeJson.developmentIds.length : 0
    return count ? `${count} specific developments` : 'Specific developments'
  }
  if (scopeType === 'specific_phases') return 'Specific phases'
  if (scopeType === 'specific_units') return 'Specific units'
  return 'All developments'
}

function InfoRow({ label, value }) {
  return (
    <div className="rounded-[8px] border border-[#e2eaf4] bg-[#fbfdff] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#71869d]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#142132]">{value || 'Not recorded'}</p>
    </div>
  )
}

export default function DeveloperPartnerInvitePage() {
  const { token } = useParams()
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ partnerDisplayName: '', partnerEmail: '' })

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    fetchDeveloperPartnerInvitation(token)
      .then((nextContext) => {
        if (!active) return
        setContext(nextContext)
        setForm({
          partnerDisplayName: nextContext.relationship.partnerDisplayName || nextContext.partner?.name || '',
          partnerEmail: nextContext.relationship.partnerInvitationEmail || '',
        })
      })
      .catch((loadError) => {
        if (!active) return
        setError(loadError?.message || 'Unable to load this partner invite.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  const partnerTypeLabel = context?.relationship?.partnerTypeLabel || 'Partner'
  const agreementLabel = useMemo(() => getAgreementLabel(context?.relationship?.partnerType), [context?.relationship?.partnerType])

  async function handleAccept() {
    setAccepting(true)
    setError('')
    try {
      await acceptDeveloperPartnerInvitationByToken(token, form)
      setAccepted(true)
    } catch (acceptError) {
      setError(acceptError?.message || 'Unable to accept this partner invite.')
    } finally {
      setAccepting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f8fb] px-4 py-8 text-[#142132]">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <p className="text-2xl font-semibold tracking-[-0.02em] text-[#0f2742]">Arch9</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#71869d]">Developer Partner Invite</p>
        </div>

        <section className="overflow-hidden rounded-[8px] border border-[#dbe5f0] bg-white shadow-[0_20px_60px_rgba(15,47,79,0.10)]">
          <div className="border-b border-[#e5edf6] bg-[#0f2742] px-6 py-7 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#bfe2ff]">Partner relationship</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
              {loading ? 'Loading invite' : accepted ? 'Invite accepted' : `${context?.developer?.name || 'Developer'} invited you`}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#dbeafe]">
              Accepting confirms the relationship. The developer can then generate the related mandate or SLA in Arch9.
            </p>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-[8px] bg-[#eef3f8]" />)}
              </div>
            ) : error ? (
              <div className="flex items-start gap-3 rounded-[8px] border border-[#f8d7da] bg-[#fff5f6] px-4 py-3 text-sm text-[#8d2831]">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            ) : accepted ? (
              <div className="rounded-[8px] border border-[#cfeedd] bg-[#f1fbf6] p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-[#0f8f4c]" />
                  <div>
                    <h2 className="text-lg font-semibold text-[#10243a]">Relationship accepted</h2>
                    <p className="mt-2 text-sm leading-6 text-[#52677f]">
                      The developer workspace has been updated. The next step is agreement generation and activation.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoRow label="Developer" value={context?.developer?.name} />
                  <InfoRow label="Partner role" value={partnerTypeLabel} />
                  <InfoRow label="Scope" value={getScopeLabel(context)} />
                  <InfoRow label="Invite expires" value={formatDate(context?.relationship?.expiresAt)} />
                </div>

                <div className="rounded-[8px] border border-[#e2eaf4] bg-[#fbfdff] p-4">
                  <div className="flex items-start gap-3">
                    <FileText size={18} className="mt-0.5 shrink-0 text-[#0f8f4c]" />
                    <div>
                      <p className="text-sm font-semibold text-[#10243a]">{agreementLabel}</p>
                      <p className="mt-1 text-sm leading-6 text-[#60758d]">
                        The developer can generate this agreement after you accept the relationship.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-semibold text-[#10243a]">Organisation name</span>
                    <input
                      value={form.partnerDisplayName}
                      onChange={(event) => setForm((current) => ({ ...current, partnerDisplayName: event.target.value }))}
                      className="mt-1 h-11 w-full rounded-[8px] border border-[#d8e2ef] bg-white px-3 text-sm text-[#10243a] outline-none transition focus:border-[#0f8f4c] focus:ring-4 focus:ring-[#0f8f4c]/10"
                      placeholder="Your organisation"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-[#10243a]">Contact email</span>
                    <input
                      type="email"
                      value={form.partnerEmail}
                      onChange={(event) => setForm((current) => ({ ...current, partnerEmail: event.target.value }))}
                      className="mt-1 h-11 w-full rounded-[8px] border border-[#d8e2ef] bg-white px-3 text-sm text-[#10243a] outline-none transition focus:border-[#0f8f4c] focus:ring-4 focus:ring-[#0f8f4c]/10"
                      placeholder="partner@example.com"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-[#0f2742] px-5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(15,39,66,0.18)] transition hover:bg-[#173a5e] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  onClick={handleAccept}
                  disabled={accepting || !normalizeText(form.partnerDisplayName)}
                >
                  <ShieldCheck size={17} />
                  {accepting ? 'Accepting...' : 'Accept Invite'}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
