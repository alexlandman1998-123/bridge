import { Archive, CheckCircle2, Loader2, PauseCircle, Save, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getRentalProperty } from '../../../../services/rentals/rentalPropertyRepository.js'
import { listRentalUnits } from '../../../../services/rentals/rentalUnitRepository.js'
import {
  deleteRentalVacancyMedia,
  getRentalVacancyMarketing,
  listRentalVacancyMedia,
  saveRentalVacancyMarketing,
  transitionRentalVacancyMarketing,
  uploadRentalVacancyMedia,
} from '../../../../services/rentals/rentalVacancyMarketingRepository.js'
import {
  buildRentalVacancyMarketingPreview,
  canTransitionRentalVacancyMarketing,
  evaluateRentalVacancyMarketingReadiness,
} from '../../../../services/rentals/rentalVacancyMarketingModel.js'

const text = (value) => String(value ?? '').trim()
const emptyForm = { title: '', description: '', features: '' }

function initialForm(marketing) {
  return marketing ? { title: marketing.title, description: marketing.description, features: marketing.features.join('\n') } : emptyForm
}

function statusLabel(status = '') { return text(status).replaceAll('_', ' ') || 'draft' }

export function RentalVacancyMarketingPanel({ vacancy = {}, userId = '' }) {
  const [marketing, setMarketing] = useState(null)
  const [media, setMedia] = useState([])
  const [property, setProperty] = useState(null)
  const [unit, setUnit] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!vacancy.id) return
    try {
      setLoading(true); setError('')
      const [nextMarketing, nextMedia, nextProperty, units] = await Promise.all([
        getRentalVacancyMarketing(vacancy.id), listRentalVacancyMedia(vacancy.id), getRentalProperty(vacancy.propertyId), listRentalUnits({ propertyId: vacancy.propertyId }),
      ])
      setMarketing(nextMarketing); setMedia(nextMedia); setProperty(nextProperty); setUnit(units.find((item) => item.id === vacancy.unitId) || null); setForm(initialForm(nextMarketing))
    } catch (cause) { setError(cause?.message || 'Unable to load internal marketing.') } finally { setLoading(false) }
  }, [vacancy.id, vacancy.propertyId, vacancy.unitId])

  useEffect(() => { void load() }, [load])

  const candidate = useMemo(() => ({ ...(marketing || {}), title: form.title, description: form.description, features: form.features.split('\n').map(text).filter(Boolean) }), [form, marketing])
  const readiness = useMemo(() => evaluateRentalVacancyMarketingReadiness({ marketing: candidate, mediaCount: media.length, vacancy }), [candidate, media.length, vacancy])
  const preview = useMemo(() => buildRentalVacancyMarketingPreview({ marketing: candidate, vacancy, property, unit }), [candidate, property, unit, vacancy])

  const save = async () => {
    try {
      setSaving(true); setError('')
      const next = await saveRentalVacancyMarketing({ organisationId: vacancy.organisationId, vacancyId: vacancy.id, branchId: vacancy.branchId, createdBy: userId, expectedVersion: marketing?.version, ...candidate })
      setMarketing(next); setForm(initialForm(next))
    } catch (cause) { setError(cause?.message || 'Unable to save marketing.') } finally { setSaving(false) }
  }

  const transition = async (status) => {
    try {
      if (status === 'ready_for_review' && !readiness.ready) throw new Error(`Resolve: ${readiness.blockers.join(', ').replaceAll('_', ' ')}.`)
      setSaving(true); setError('')
      setMarketing(await transitionRentalVacancyMarketing(marketing, status))
    } catch (cause) { setError(cause?.message || 'Unable to update marketing status.') } finally { setSaving(false) }
  }

  const upload = async (event) => {
    const [file] = Array.from(event.target.files || [])
    event.target.value = ''
    if (!file) return
    try {
      setSaving(true); setError('')
      await uploadRentalVacancyMedia({ organisationId: vacancy.organisationId, vacancyId: vacancy.id, branchId: vacancy.branchId, file, createdBy: userId })
      setMedia(await listRentalVacancyMedia(vacancy.id))
    } catch (cause) { setError(cause?.message || 'Unable to upload media.') } finally { setSaving(false) }
  }

  const remove = async (item) => {
    try { setSaving(true); setError(''); await deleteRentalVacancyMedia(item); setMedia((current) => current.filter((mediaItem) => mediaItem.id !== item.id)) } catch (cause) { setError(cause?.message || 'Unable to remove media.') } finally { setSaving(false) }
  }

  if (loading) return <section className="rounded-xl border bg-white p-5 shadow-sm"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></section>

  return <section className="space-y-5 rounded-xl border bg-white p-5 shadow-sm">
    <header><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-slate-900">Internal marketing</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold capitalize text-slate-700">{statusLabel(marketing?.status)}</span></div><p className="mt-1 text-sm text-slate-600">This is Rentals-only. Nothing here creates, updates or publishes a Sales listing.</p></header>
    <div className="grid gap-3"><input value={form.title} maxLength={140} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Marketing title" className="rounded-lg border px-3 py-2 text-sm" /><textarea value={form.description} maxLength={8000} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Internal marketing description" rows={5} className="rounded-lg border px-3 py-2 text-sm" /><textarea value={form.features} onChange={(event) => setForm((current) => ({ ...current, features: event.target.value }))} placeholder="Features, one per line" rows={3} className="rounded-lg border px-3 py-2 text-sm" /></div>
    <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><p className="font-medium">Readiness: {readiness.ready ? 'ready for review' : `blocked by ${readiness.blockers.map((item) => item.replaceAll('_', ' ')).join(', ')}`}</p><p className="mt-1">External publication: <span className="font-semibold">not published</span></p></div>
    <div><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Media ({media.length})</h3><label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium"><Upload className="h-4 w-4" />Add media<input type="file" accept="image/*,video/*" disabled={saving} onChange={(event) => void upload(event)} className="sr-only" /></label></div>{media.length ? <ul className="mt-2 divide-y rounded-lg border">{media.map((item) => <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm"><span className="truncate">{item.media_type} · {item.storage_path.split('/').pop()}</span><button disabled={saving} onClick={() => void remove(item)} className="rounded p-1 text-slate-500 hover:text-red-700" aria-label="Remove media"><X className="h-4 w-4" /></button></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">Add at least one image before review.</p>}</div>
    <div className="rounded-lg border p-3 text-sm"><p className="font-semibold">Internal preview</p><p className="mt-1 font-medium">{preview.title}</p><p className="mt-1 text-slate-600">R{preview.monthlyRent.toLocaleString()} · deposit R{preview.depositAmount.toLocaleString()} · available {preview.availableFrom || 'TBC'}</p>{preview.features.length ? <p className="mt-1 text-slate-600">{preview.features.join(' · ')}</p> : null}</div>
    <div className="flex flex-wrap gap-2"><button disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-1 rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"><Save className="h-4 w-4" />Save</button>{marketing && canTransitionRentalVacancyMarketing(marketing.status, 'ready_for_review') ? <button disabled={saving} onClick={() => void transition('ready_for_review')} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium"><CheckCircle2 className="h-4 w-4" />Ready for review</button> : null}{marketing && canTransitionRentalVacancyMarketing(marketing.status, 'approved') ? <button disabled={saving} onClick={() => void transition('approved')} className="rounded-lg border px-3 py-2 text-sm font-medium">Approve internally</button> : null}{marketing && canTransitionRentalVacancyMarketing(marketing.status, 'paused') ? <button disabled={saving} onClick={() => void transition('paused')} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium"><PauseCircle className="h-4 w-4" />Pause</button> : null}{marketing && canTransitionRentalVacancyMarketing(marketing.status, 'archived') ? <button disabled={saving} onClick={() => void transition('archived')} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium"><Archive className="h-4 w-4" />Archive</button> : null}</div>
    {error ? <p className="text-sm text-red-700">{error}</p> : null}
  </section>
}
