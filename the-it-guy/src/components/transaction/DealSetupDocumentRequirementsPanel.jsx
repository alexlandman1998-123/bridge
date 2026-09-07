import { useEffect, useState } from 'react'
import { deriveDealSetupDocumentRequirements } from '../../services/dealSetupService'

export default function DealSetupDocumentRequirementsPanel({ transactionId }) {
  const [requirements, setRequirements] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (!transactionId) return
    let active = true
    deriveDealSetupDocumentRequirements({ transactionId })
      .then((result) => active && setRequirements(result.requirements || []))
      .catch((loadError) => active && setError(loadError.message || 'Deal Setup requirements could not be loaded.'))
    return () => { active = false }
  }, [transactionId])
  if (error) return null
  return <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface"><div><h3 className="text-section-title font-semibold text-textStrong">Required from Deal Setup</h3><p className="mt-1 text-secondary text-textMuted">These requirements are calculated from buyers, signers, purchaser type, and finance. Profile documents marked satisfied do not need to be uploaded again.</p></div><div className="mt-4 grid gap-2 md:grid-cols-2">{requirements.map((requirement) => <article key={requirement.id} className="rounded-control border border-borderSoft bg-surfaceAlt px-3 py-3"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-textStrong">{requirement.label}</strong><p className="mt-1 text-xs text-textMuted">{requirement.owner} · {requirement.reason}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[0.65rem] font-semibold ${requirement.satisfiedByProfile ? 'bg-successSoft text-success' : 'bg-warningSoft text-warning'}`}>{requirement.satisfiedByProfile ? 'Profile satisfied' : 'Required'}</span></div></article>)}</div>{!requirements.length ? <p className="mt-4 text-sm text-textMuted">No requirements can be calculated until Deal Setup has buyer and finance details.</p> : null}</section>
}
