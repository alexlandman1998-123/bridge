import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { convertRentalApplicationToTenancy, getRentalApplicationTenancyConversion } from '../../../../services/rentals/rentalApplicationRepository.js'

export default function RentalApplicationTenancyConversionPanel({ application, onConverted }) {
  const [conversion, setConversion] = useState(null); const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  const load = async () => { if (!application?.id) return; try { setConversion(await getRentalApplicationTenancyConversion(application.id)) } catch (cause) { setError(cause.message) } }
  useEffect(() => { setError(''); void load() }, [application?.id])
  const convert = async () => { if (!window.confirm('Create the tenancy and lease draft for this approved application?')) return; try { setSaving(true); setError(''); const result = await convertRentalApplicationToTenancy({ applicationId: application.id, expectedVersion: application.version }); setConversion({ id: result.tenancy_id, status: 'draft', rental_leases: result.lease_id ? { id: result.lease_id, status: 'draft' } : null }); await onConverted?.() } catch (cause) { setError(cause.message) } finally { setSaving(false) } }
  if (application?.status !== 'approved') return null
  return <section className="mt-5 border-t pt-5"><h3 className="font-semibold">Tenancy conversion</h3>{conversion ? <div className="mt-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"><p><b>Tenancy draft created.</b> Lease draft: {conversion.rental_leases?.status || 'created'}.</p><p className="mt-1">Continue to the tenancy workspace to manage signing, move-in readiness, inspection, and activation.</p><Link to={`/agent/rentals/tenancies/${encodeURIComponent(conversion.id)}`} className="mt-3 inline-flex items-center gap-1 font-semibold text-emerald-900 underline">Open tenancy workspace <ArrowRight className="h-4 w-4" /></Link></div> : <div className="mt-3 rounded-lg bg-slate-50 p-3"><p className="text-sm text-slate-600">This creates one tenancy draft and one lease draft, then reserves the unit for lease setup. It does not occupy the unit.</p><button type="button" disabled={saving} onClick={() => void convert()} className="mt-3 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Creating…' : 'Create tenancy draft'}</button></div>}{error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}</section>
}
