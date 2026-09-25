import { CircleAlert, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { getListingSellerHistoricalNormalization } from '../../services/listings/listingSellerHistoricalNormalizationService'
import Button from '../ui/Button'

const TONES = Object.freeze({
  ready: 'border-[#cfe5d8] bg-[#f4fbf7] text-[#176a43]',
  attention: 'border-[#f2dfbd] bg-[#fffaf0] text-[#7a5a17]',
  danger: 'border-[#efcaca] bg-[#fff6f6] text-[#9f2d2d]',
})

export default function ListingSellerHistoricalNormalizationBanner({ listingId, onReview }) {
  const [audit, setAudit] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!listingId) return
    setLoading(true)
    setError('')
    try {
      setAudit(await getListingSellerHistoricalNormalization(listingId))
    } catch (loadError) {
      setError(loadError?.message || 'Historical seller audit could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [listingId])

  useEffect(() => { void load() }, [load])

  if (!loading && !audit && !error) return null
  if (loading && !audit) {
    return <div className="flex items-center gap-2 rounded-[16px] border border-[#dde4ee] bg-white px-4 py-3 text-sm text-[#607387]"><Loader2 size={15} className="animate-spin" />Checking historical seller data…</div>
  }
  if (error) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[#efcaca] bg-[#fff6f6] px-4 py-3 text-sm text-[#8b3232]" data-testid="seller-history-audit-error">
        <span>{error}</span><Button type="button" size="sm" variant="secondary" onClick={() => void load()}><RefreshCw size={13} />Retry</Button>
      </div>
    )
  }
  if (!audit?.requiresReview) return null

  return (
    <article className={`flex flex-col gap-3 rounded-[18px] border px-4 py-4 sm:flex-row sm:items-center sm:justify-between ${TONES[audit.tone] || TONES.attention}`} data-testid="seller-history-remediation">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 shrink-0">{audit.tone === 'danger' ? <CircleAlert size={19} /> : <ShieldCheck size={19} />}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{audit.label}</p>
          <p className="mt-1 text-xs leading-5 opacity-90">{audit.description}</p>
          {audit.inferredProfileType ? <p className="mt-1 text-xs font-semibold">Historical value: {audit.inferredProfileType.replaceAll('_', ' ')}</p> : null}
        </div>
      </div>
      <Button type="button" size="sm" variant="secondary" className="shrink-0" onClick={() => onReview?.(audit)}>{audit.actionLabel}</Button>
    </article>
  )
}

