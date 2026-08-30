import { Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'
import RentalApplicationDecisionPanel from '../../modules/rentals/shared/applications/RentalApplicationDecisionPanel.jsx'
import RentalApplicationScreeningPanel from '../../modules/rentals/shared/applications/RentalApplicationScreeningPanel.jsx'
import RentalApplicationTenancyConversionPanel from '../../modules/rentals/shared/applications/RentalApplicationTenancyConversionPanel.jsx'
import { getRentalApplicationReview, listPersistedRentalApplications } from '../../services/rentals/rentalApplicationRepository.js'

const text = (value) => String(value ?? '').trim()

export default function RentalApplicationWorkspacePage() {
  const workspace = useWorkspace()
  const organisationId = useMemo(() => text(workspace.workspace?.id || workspace.currentMembership?.organisation_id), [workspace])
  const [items, setItems] = useState([])
  const [review, setReview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => { if (!organisationId) return; try { setLoading(true); setItems(await listPersistedRentalApplications(organisationId)) } catch (reason) { setError(reason.message) } finally { setLoading(false) } }, [organisationId])
  useEffect(() => { void load() }, [load])
  const open = async (id) => { try { setError(''); setReview(await getRentalApplicationReview(id)) } catch (reason) { setError(reason.message) } }
  const refreshReview = async () => { if (!review?.id) return; await open(review.id); await load() }

  return <main className="mx-auto max-w-6xl space-y-5 p-4">
    <header className="flex justify-between"><div><p className="text-sm font-semibold text-sky-700">Rentals / Applications</p><h1 className="text-2xl font-bold">Application review</h1></div><button type="button" aria-label="Refresh applications" onClick={() => void load()} className="rounded-lg border p-2"><RefreshCw className="h-4 w-4" /></button></header>
    {loading ? <Loader2 className="mx-auto animate-spin" /> : <div className="grid gap-4 lg:grid-cols-2"><section className="space-y-2">{items.map((item) => <button type="button" onClick={() => void open(item.id)} key={item.id} className="w-full rounded-xl border bg-white p-4 text-left"><b>{item.data?.identity?.firstName || 'Applicant'} {item.data?.identity?.lastName || ''}</b><p className="text-sm text-slate-600">{item.status} · {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ''}</p></button>)}</section><section className="rounded-xl border bg-white p-5">{review ? <><p className="text-xs font-semibold uppercase text-sky-700">{review.status}</p><h2 className="mt-1 text-lg font-bold">{review.data?.identity?.firstName || 'Applicant'} {review.data?.identity?.lastName || ''}</h2><p className="mt-3 text-sm"><b>Employment:</b> {review.data?.employment?.employer || 'Not provided'}</p><p className="mt-2 text-sm"><b>Income:</b> {review.data?.income?.monthlyIncome || 'Not provided'}</p><h3 className="mt-4 font-semibold">Documents</h3><ul className="text-sm">{review.documents.map((document) => <li key={document.id}>{document.type}: {document.status}</li>)}</ul><h3 className="mt-4 font-semibold">Consents</h3><ul className="text-sm">{review.consents.map((consent) => <li key={consent.type}>{consent.type} · {consent.version}</li>)}</ul><RentalApplicationScreeningPanel application={review} organisationId={organisationId} /><RentalApplicationDecisionPanel application={review} onDecision={refreshReview} /><RentalApplicationTenancyConversionPanel application={review} onConverted={refreshReview} /></> : <p className="text-sm text-slate-600">Select an application to review it.</p>}</section></div>}
    {error ? <p className="text-red-700">{error}</p> : null}
  </main>
}
