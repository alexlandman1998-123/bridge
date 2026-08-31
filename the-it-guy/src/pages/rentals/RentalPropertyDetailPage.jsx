import { ArrowLeft, Building2, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { RentalLandlordMandatePanel } from '../../modules/rentals/shared/landlords/RentalLandlordMandatePanel.jsx'
import { RentalUnitsPanel } from '../../modules/rentals/shared/units/RentalUnitsPanel.jsx'
import { getRentalProperty } from '../../services/rentals/rentalPropertyRepository.js'

const title = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
export default function RentalPropertyDetailPage() {
  const workspace = useWorkspace(); const { propertyId } = useParams(); const [property, setProperty] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const load = useCallback(async () => { try { setLoading(true); setError(''); setProperty(await getRentalProperty(propertyId)) } catch (cause) { setError(cause?.message || 'Unable to load rental property.') } finally { setLoading(false) } }, [propertyId])
  useEffect(() => { void load() }, [load])
  const address = useMemo(() => property ? [property.address.line1, property.address.line2, property.address.suburb, property.address.city, property.address.province, property.address.postalCode].filter(Boolean).join(', ') : '', [property])
  if (loading) return <main className="mx-auto grid min-h-56 max-w-[1600px] place-items-center px-5 text-sm text-[#60758b]"><span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" />Loading property…</span></main>
  if (error) return <main className="mx-auto max-w-[1600px] px-5 py-6"><Link to="/agent/rentals/portfolio/properties" className="inline-flex items-center gap-1 text-sm font-semibold text-[#1769d1]"><ArrowLeft size={15} />Back to properties</Link><p className="mt-5 rounded-xl border border-[#f2c6c6] bg-[#fff7f7] p-3 text-sm text-[#9f3131]">{error}</p></main>
  if (!property) return <main className="mx-auto max-w-[1600px] px-5 py-6"><Link to="/agent/rentals/portfolio/properties" className="inline-flex items-center gap-1 text-sm font-semibold text-[#1769d1]"><ArrowLeft size={15} />Back to properties</Link><p className="mt-5 rounded-xl border border-dashed p-8 text-sm text-[#60758b]">This property is unavailable in your current workspace.</p></main>
  return <main className="mx-auto w-full max-w-[1600px] px-3 py-2 sm:px-5 lg:px-7"><section className="space-y-4 pb-6"><Link to="/agent/rentals/portfolio/properties" className="inline-flex items-center gap-1 text-sm font-semibold text-[#1769d1]"><ArrowLeft size={15} />Back to properties</Link><section className="rounded-[18px] border border-[#dfe7f0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,.05)]"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#edf5ff] text-[#1769d1]"><Building2 size={20} /></span><div><h1 className="text-xl font-semibold text-[#142132]">{property.name}</h1><p className="mt-1 text-sm text-[#60758b]">{address || 'Address pending'}</p></div></div><span className="rounded-full border border-[#dbe6f1] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold text-[#4d6782]">{title(property.propertyType)} · {title(property.status)}</span></div></section><RentalLandlordMandatePanel property={property} userId={workspace.profile?.id || workspace.userId || ''} /><RentalUnitsPanel property={property} userId={workspace.profile?.id || workspace.userId || ''} /></section></main>
}
