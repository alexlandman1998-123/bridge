import { ArrowLeft, Building2, Loader2 } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getRentalProperty } from '../../services/rentals/rentalPropertyRepository.js'
import { useWorkspace } from '../../context/WorkspaceContext'
import { RentalUnitsPanel } from '../../modules/rentals/shared/units/RentalUnitsPanel.jsx'
import { RentalLandlordMandatePanel } from '../../modules/rentals/shared/landlords/RentalLandlordMandatePanel.jsx'

const RentalPropertyEvidencePanel = lazy(() => import('../../modules/rentals/shared/evidence/RentalPropertyEvidencePanel.jsx').then((module) => ({ default: module.RentalPropertyEvidencePanel })))

export function RentalPropertyDetailPage() {
  const workspace = useWorkspace()
  const { propertyId } = useParams()
  const [property, setProperty] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const [activePanel, setActivePanel] = useState('overview')
  const load = useCallback(async () => { try { setLoading(true); setError(''); setProperty(await getRentalProperty(propertyId)) } catch (cause) { setError(cause?.message || 'Unable to load rental property.') } finally { setLoading(false) } }, [propertyId])
  useEffect(() => { void load() }, [load])
  const address = useMemo(() => property ? [property.address.line1, property.address.line2, property.address.suburb, property.address.city, property.address.province, property.address.postalCode].filter(Boolean).join(', ') : '', [property])
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-6"><Link to="/agent/rentals/portfolio/properties" className="inline-flex items-center gap-1 text-sm font-medium text-sky-700"><ArrowLeft className="h-4 w-4"/>Properties</Link>{loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin"/></div> : error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : !property ? <p className="rounded-lg border p-5 text-sm text-slate-600">Property not found in this workspace.</p> : <><section className="rounded-xl border bg-white p-6 shadow-sm"><div className="flex items-start gap-3"><Building2 className="mt-1 h-6 w-6 text-sky-700"/><div><p className="text-xs font-semibold uppercase text-sky-700">{property.propertyType} · {property.status}</p><h1 className="text-2xl font-bold text-slate-900">{property.name}</h1><p className="mt-2 text-slate-600">{address}</p></div></div><div className="mt-6 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">This managed property remains independently operated from Sales listings.</div></section><div className="flex gap-2"><button onClick={() => setActivePanel('overview')} className={`rounded-lg px-3 py-2 text-sm ${activePanel === 'overview' ? 'bg-sky-700 text-white' : 'border'}`}>Property setup</button><button onClick={() => setActivePanel('evidence')} className={`rounded-lg px-3 py-2 text-sm ${activePanel === 'evidence' ? 'bg-sky-700 text-white' : 'border'}`}>Documents & activity</button></div>{activePanel === 'overview' ? <><RentalLandlordMandatePanel property={property} userId={workspace.profile?.id || workspace.userId || ''}/><RentalUnitsPanel property={property} userId={workspace.profile?.id || workspace.userId || ''}/></> : <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin"/></div>}><RentalPropertyEvidencePanel property={property} userId={workspace.profile?.id || workspace.userId || ''}/></Suspense>}</>}</main>
}
