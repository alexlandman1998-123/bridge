import { useEffect, useState } from 'react'
import { listRentalOnboardingRequirements } from '../../../../services/rentals/rentalOnboardingRequirementRepository.js'
const label = (value) => String(value || '').replaceAll('_', ' ')
export default function RentalLandlordChecklistPreview({ leadId, revision, portfolio = [] }) {
  const key = `${leadId}:${revision}`
  const [result, setResult] = useState(null)
  const rows = result?.key === key ? result.rows : null
  const error = result?.key === key ? result.error : ''
  useEffect(() => {
    let cancelled = false
    listRentalOnboardingRequirements({ landlordLeadId: leadId }).then((items) => { if (!cancelled) setResult({ key, rows: items.filter((item) => item.active), error: '' }) }).catch((cause) => { if (!cancelled) setResult({ key, rows: null, error: cause.message }) })
    return () => { cancelled = true }
  }, [leadId, key])
  return <section className="rounded-xl border border-[#dce7f2] p-4 lg:col-span-2"><h3 className="font-semibold text-[#29435d]">Landlord document matrix preview</h3><p className="mt-2 text-sm text-[#60758b]">Based on the saved landlord profile and properties. The expanded matrix awaits policy confirmation. Document references do not complete these requirements.</p>{error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : rows === null ? <p className="mt-2 text-sm">Loading saved checklist…</p> : rows.length === 0 ? <p className="mt-2 text-sm">Save the landlord profile and resolve the landlord type to prepare this preview.</p> : <ul className="mt-3 grid gap-2 md:grid-cols-2">{rows.map((row) => <li key={row.id} className="rounded-lg bg-[#f5f8fb] p-3 text-sm"><span className="capitalize">{label(row.purpose)}</span><p className="mt-1 text-xs text-[#60758b]">{row.scopeKey.startsWith('property:') ? portfolio.find((item) => `property:${item.id}` === row.scopeKey)?.title || 'Property' : label(row.subjectId)} · Preview</p></li>)}</ul>}</section>
}
