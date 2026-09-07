import { useEffect, useState } from 'react'
import { deriveDealSetupDocumentRequirements, loadCanonicalDealSetup } from '../../services/dealSetupService'

export default function AttorneyDealSetupHandoffPanel({ transactionId }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    if (!transactionId) return
    let active = true
    const load = () => Promise.all([loadCanonicalDealSetup({ transactionId }), deriveDealSetupDocumentRequirements({ transactionId })])
      .then(([deal, requirements]) => active && setData({ deal, requirements }))
      .catch(() => active && setData({ unavailable: true }))
    load()
    const refresh = (event) => { if (!event.detail?.transactionId || event.detail.transactionId === transactionId) load() }
    window.addEventListener('deal-setup:updated', refresh)
    return () => { active = false; window.removeEventListener('deal-setup:updated', refresh) }
  }, [transactionId])
  if (!data || data.unavailable) return null
  const { setup } = data.deal
  const missing = data.requirements.requirements.filter((item) => !item.satisfiedByProfile)
  return <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface"><h3 className="text-section-title font-semibold text-textStrong">Deal Setup handoff</h3><p className="mt-1 text-secondary text-textMuted">Live buyer, commercial, and finance information supplied by the transaction team.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><div><span className="text-label text-textMuted">Buyer structure</span><strong className="mt-1 block text-sm text-textStrong">{setup.terms.purchaserType || 'Not captured'}</strong></div><div><span className="text-label text-textMuted">Buyers</span><strong className="mt-1 block text-sm text-textStrong">{setup.buyers.map((buyer) => buyer.participant_name || buyer.participant_email || 'Buyer').join(' · ') || 'Not captured'}</strong></div><div><span className="text-label text-textMuted">Purchase price</span><strong className="mt-1 block text-sm text-textStrong">{setup.terms.purchasePrice ?? 'Not captured'}</strong></div><div><span className="text-label text-textMuted">Finance</span><strong className="mt-1 block text-sm text-textStrong">{setup.finance.type || 'Not captured'}</strong></div><div><span className="text-label text-textMuted">Finance route</span><strong className="mt-1 block text-sm text-textStrong">{setup.finance.managedBy || 'Not captured'}</strong></div><div><span className="text-label text-textMuted">Bank / bond amount</span><strong className="mt-1 block text-sm text-textStrong">{[setup.finance.bank, setup.finance.bondAmount].filter((value) => value !== null && value !== undefined && value !== '').join(' · ') || 'Not captured'}</strong></div></div><div className="mt-4 border-t border-borderSoft pt-3"><strong className="text-sm text-textStrong">Legal document follow-up</strong><p className="mt-1 text-sm text-textMuted">{missing.length ? `${missing.length} requirement${missing.length === 1 ? '' : 's'} still needs a transaction document or review.` : 'All calculated requirements are currently satisfied from reusable profiles.'}</p></div></section>
}
