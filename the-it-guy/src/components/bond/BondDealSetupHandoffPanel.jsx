import { useEffect, useState } from 'react'
import { deriveDealSetupDocumentRequirements, loadCanonicalDealSetup } from '../../services/dealSetupService'

export default function BondDealSetupHandoffPanel({ transactionId }) {
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
  const financeType = String(data.deal.setup.finance.type || '').toLowerCase()
  if (!['bond', 'hybrid', 'combination'].includes(financeType)) return null
  const financeRequirements = data.requirements.requirements.filter((item) => item.group === 'finance' || item.group === 'buyer_fica')
  return <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface"><h3 className="text-section-title font-semibold text-textStrong">Deal Setup · Bond handoff</h3><p className="mt-1 text-secondary text-textMuted">Live finance data and buyer requirements from Deal Setup. Legal-only documents remain unavailable here.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><div><span className="text-label text-textMuted">Applicants</span><strong className="mt-1 block text-sm text-textStrong">{data.deal.setup.buyers.map((buyer) => buyer.participant_name || buyer.participant_email || 'Buyer').join(' · ') || 'Not captured'}</strong></div><div><span className="text-label text-textMuted">Purchase price</span><strong className="mt-1 block text-sm text-textStrong">{data.deal.setup.terms.purchasePrice ?? 'Not captured'}</strong></div><div><span className="text-label text-textMuted">Bond amount</span><strong className="mt-1 block text-sm text-textStrong">{data.deal.setup.finance.bondAmount ?? 'Not captured'}</strong></div><div><span className="text-label text-textMuted">Finance route</span><strong className="mt-1 block text-sm text-textStrong">{data.deal.setup.finance.managedBy || 'Not captured'}</strong></div><div><span className="text-label text-textMuted">Bank</span><strong className="mt-1 block text-sm text-textStrong">{data.deal.setup.finance.bank || 'Not captured'}</strong></div><div><span className="text-label text-textMuted">Cash contribution</span><strong className="mt-1 block text-sm text-textStrong">{data.deal.setup.finance.cashAmount ?? 'Not captured'}</strong></div></div><div className="mt-4 border-t border-borderSoft pt-3"><strong className="text-sm text-textStrong">Finance pack requirements</strong><p className="mt-1 text-sm text-textMuted">{financeRequirements.length ? financeRequirements.map((item) => item.label).join(' · ') : 'No finance-pack requirements have been calculated yet.'}</p></div></section>
}
