import { useEffect, useState } from 'react'
import { getDealSetupReadiness } from '../../services/dealSetupService'

export default function DealSetupReadinessPanel({ transactionId }) {
  const [readiness, setReadiness] = useState(null)
  useEffect(() => {
    if (!transactionId) return
    let active = true
    getDealSetupReadiness({ transactionId }).then((result) => active && setReadiness(result)).catch(() => active && setReadiness(null))
    return () => { active = false }
  }, [transactionId])
  if (!readiness) return null
  return <section className={`rounded-[14px] border px-4 py-3 ${readiness.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}><strong className="text-sm">{readiness.ready ? 'Deal Setup ready' : `Deal Setup blocked · ${readiness.blockerCount}`}</strong>{!readiness.ready ? <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{readiness.blockers.slice(0, 5).map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : null}</section>
}
