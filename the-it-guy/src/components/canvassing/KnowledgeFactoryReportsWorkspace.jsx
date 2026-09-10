import { AlertTriangle, CheckCircle2, FileSearch, LoaderCircle, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { createCanvassingActivity, createCanvassingProspect } from '../../lib/canvassingRepository'
import {
  listKnowledgeFactoryReports,
  quoteKnowledgeFactoryReport,
  requestKnowledgeFactoryReport,
} from '../../services/propertyIntelligence/knowledgeFactoryMapService'
import Field from '../ui/Field'
import Modal from '../ui/Modal'

const REPORT_OPTIONS = [
  { id: 'property_summary', label: 'Property summary', description: 'Address, erf, extent, property classification and locality.' },
  { id: 'municipal_valuation', label: 'Municipal valuation', description: 'Recorded municipal value, valuation date, municipality and zoning when supplied.' },
]

function text(value) {
  return String(value || '').trim()
}

function formatCredits(value) {
  const number = Number(value)
  return Number.isFinite(number) ? `${new Intl.NumberFormat('en-ZA').format(number)} credits` : 'Credit estimate unavailable'
}

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function reportMarker(reportId) {
  return `Knowledge Factory report request: ${text(reportId)}`
}

function isAlreadyConverted(prospects = [], reportId) {
  const marker = reportMarker(reportId).toLowerCase()
  return prospects.some((prospect) => text(prospect?.notes).toLowerCase().includes(marker))
}

function CreateProspectModal({ report, draft, saving, error, onChange, onClose, onSubmit }) {
  if (!report || !draft) return null
  const summary = report.report_summary || {}
  return <Modal open onClose={() => { if (!saving) onClose() }} title="Create canvassing prospect" subtitle={summary.address || `Property ${report.property_id}`} className="max-w-2xl"><form className="space-y-5" onSubmit={onSubmit}>
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">No owner or contact identity has been imported. Enter only contact details you independently hold and are permitted to use for canvassing.</div>
    <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1.5 text-sm font-medium text-slate-700">First name<Field required value={draft.firstName} onChange={(event) => onChange('firstName', event.target.value)} /></label><label className="space-y-1.5 text-sm font-medium text-slate-700">Last name<Field required value={draft.lastName} onChange={(event) => onChange('lastName', event.target.value)} /></label><label className="space-y-1.5 text-sm font-medium text-slate-700">Phone <span className="font-normal text-slate-400">(optional)</span><Field type="tel" value={draft.phone} onChange={(event) => onChange('phone', event.target.value)} /></label><label className="space-y-1.5 text-sm font-medium text-slate-700">Email <span className="font-normal text-slate-400">(optional)</span><Field type="email" value={draft.email} onChange={(event) => onChange('email', event.target.value)} /></label><label className="space-y-1.5 text-sm font-medium text-slate-700">Follow-up date <Field type="date" value={draft.nextFollowUpDate} onChange={(event) => onChange('nextFollowUpDate', event.target.value)} /></label><label className="space-y-1.5 text-sm font-medium text-slate-700">Priority<Field as="select" value={draft.followUpPriority} onChange={(event) => onChange('followUpPriority', event.target.value)}><option>Low</option><option>Medium</option><option>High</option></Field></label></div>
    <label className="block space-y-1.5 text-sm font-medium text-slate-700">First-contact note<Field as="textarea" rows={3} value={draft.followUpNote} onChange={(event) => onChange('followUpNote', event.target.value)} /></label>
    {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
    <div className="flex justify-end gap-2 border-t border-slate-200 pt-4"><button type="button" disabled={saving} onClick={onClose} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">Cancel</button><button type="submit" disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1769dc] px-4 text-sm font-semibold text-white disabled:bg-slate-300">{saving ? <LoaderCircle className="animate-spin" size={16} /> : <UserPlus size={16} />}{saving ? 'Creating…' : 'Create prospect'}</button></div>
  </form></Modal>
}

export default function KnowledgeFactoryReportsWorkspace({ prospects = [], onProspectCreated }) {
  const location = useLocation()
  const { currentWorkspace, profile, currentMembership } = useWorkspace()
  const organisationId = currentWorkspace?.organisationId || currentWorkspace?.organisation_id || currentWorkspace?.id || ''
  const initialPropertyId = text(location.state?.propertyId || location.state?.property?.propertyId || location.state?.property?.id)
  const [propertyId, setPropertyId] = useState(initialPropertyId)
  const [purpose, setPurpose] = useState('Canvassing potential seller opportunities')
  const [reportTypes, setReportTypes] = useState(['property_summary'])
  const [quote, setQuote] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [requestState, setRequestState] = useState({ status: 'loading', items: [], error: '' })
  const [busy, setBusy] = useState('')
  const [conversion, setConversion] = useState({ report: null, draft: null, saving: false, error: '' })

  async function loadReports({ quiet = false } = {}) {
    if (!organisationId) return
    if (!quiet) setRequestState((previous) => ({ ...previous, status: 'loading', error: '' }))
    try {
      const result = await listKnowledgeFactoryReports({ organisationId })
      setRequestState({ status: 'ready', items: Array.isArray(result.items) ? result.items : [], error: '' })
    } catch (error) {
      setRequestState({ status: 'error', items: [], error: error?.message || 'Property reports are unavailable.' })
    }
  }

  useEffect(() => { void loadReports() }, [organisationId])
  useEffect(() => { if (initialPropertyId) setPropertyId(initialPropertyId) }, [initialPropertyId])

  const canQuote = /^[1-9]\d{0,14}$/.test(propertyId) && purpose.length >= 10 && reportTypes.length > 0 && !busy
  const quoteExpired = quote?.quote_expires_at && new Date(quote.quote_expires_at).getTime() <= Date.now()

  function toggleType(id) {
    setQuote(null)
    setConfirmed(false)
    setReportTypes((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id])
  }

  async function requestQuote() {
    if (!canQuote) return
    setBusy('quote')
    try {
      const result = await quoteKnowledgeFactoryReport({ organisationId, purpose, propertyId, reportTypes })
      setQuote(result.quote || null)
      setConfirmed(false)
      await loadReports({ quiet: true })
    } catch (error) {
      setRequestState((previous) => ({ ...previous, error: error?.message || 'The report quote could not be created.' }))
    } finally {
      setBusy('')
    }
  }

  async function submitReport() {
    if (!quote?.id || !confirmed || quoteExpired || busy) return
    setBusy('request')
    try {
      await requestKnowledgeFactoryReport({ organisationId, purpose, quoteId: quote.id })
      setQuote(null)
      setConfirmed(false)
      await loadReports({ quiet: true })
    } catch (error) {
      setRequestState((previous) => ({ ...previous, error: error?.message || 'The property report could not be requested.' }))
    } finally {
      setBusy('')
    }
  }

  function openConversion(report) {
    if (!report?.report_summary || isAlreadyConverted(prospects, report.id)) return
    setConversion({ report, saving: false, error: '', draft: { firstName: '', lastName: '', phone: '', email: '', nextFollowUpDate: '', followUpPriority: 'Medium', followUpNote: 'Review property context and plan first contact.' } })
  }

  function updateConversion(field, value) {
    setConversion((previous) => ({ ...previous, error: '', draft: { ...previous.draft, [field]: value } }))
  }

  async function createProspect(event) {
    event.preventDefault()
    if (!conversion.report || !conversion.draft || conversion.saving) return
    const draft = conversion.draft
    if (!text(draft.firstName) || !text(draft.lastName)) {
      setConversion((previous) => ({ ...previous, error: 'Enter the prospect’s first and last name.' }))
      return
    }
    setConversion((previous) => ({ ...previous, saving: true, error: '' }))
    const summary = conversion.report.report_summary || {}
    const agentId = profile?.userId || profile?.user_id || profile?.id || currentMembership?.userId || currentMembership?.user_id || ''
    const agentName = profile?.fullName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || profile?.email || 'Current agent'
    const notes = [reportMarker(conversion.report.id), `Created from a reviewed Knowledge Factory property report for property ${conversion.report.property_id}.`, 'No owner identity was supplied by the property report. Contact data was entered manually by the agent.'].join('\n')
    try {
      const prospect = await createCanvassingProspect(organisationId, {
        organisationId, assignedAgentId: agentId, assignedUserId: agentId, assignedAgentName: agentName, assignedAgentEmail: profile?.email || '',
        branchId: profile?.branchId || currentMembership?.branchId || currentMembership?.branch_id || '', createdBy: agentId,
        firstName: text(draft.firstName), lastName: text(draft.lastName), phone: text(draft.phone), email: text(draft.email).toLowerCase(),
        prospectType: 'Seller Prospect', area: text(summary.suburb), areaSuburb: text(summary.suburb), streetAddress: text(summary.address), formattedAddress: text(summary.address),
        city: text(summary.town), province: text(summary.province), country: 'South Africa', postalCode: text(summary.postalCode), propertyType: text(summary.propertyType),
        source: 'Knowledge Factory Property Report', canvassingMethod: 'Area Farming', status: 'New', nextFollowUpDate: text(draft.nextFollowUpDate), followUpPriority: text(draft.followUpPriority) || 'Medium', followUpNote: text(draft.followUpNote),
        estimatedValue: Number(summary.municipalValuation?.value || 0) || 0, propertyOccupancy: 'Unknown', sellingIntent: 'Just Gathering Information', notes,
      })
      let activity = null
      try {
        activity = await createCanvassingActivity(organisationId, {
          organisationId, prospectId: prospect.id, agentId, agentName, activityType: 'Property Report Reviewed', activityNote: `Prospect created after reviewing Knowledge Factory property report ${conversion.report.id}.`, outcome: 'Added to Canvassing', activityDate: new Date().toISOString(), createdBy: agentId,
          metadata: { source: 'Knowledge Factory', reportRequestId: conversion.report.id, propertyId: String(conversion.report.property_id) },
        })
      } catch (activityError) {
        console.warn('[CANVASSING] Knowledge Factory report activity could not be created.', activityError)
      }
      onProspectCreated?.(prospect, activity)
      setConversion({ report: null, draft: null, saving: false, error: '' })
    } catch (error) {
      setConversion((previous) => ({ ...previous, saving: false, error: error?.message || 'The canvassing prospect could not be created.' }))
    }
  }

  return <section className="space-y-5" data-canvassing-workspace="knowledge-factory-reports">
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
      <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 text-[#1769dc]" size={20} /><div><p className="font-semibold">Knowledge Factory property reports</p><p className="mt-1 leading-6 text-blue-900">Reports are requested server-side only. You see the supplier credit estimate first; submitting the report requires a second, explicit confirmation. Ownership, bonds, transfers, credit and FICA data are not included in Phase 2.</p></div></div>
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
      <form className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" onSubmit={(event) => { event.preventDefault(); void requestQuote() }}>
        <div className="flex items-start gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600"><FileSearch size={18} /></span><div><h2 className="text-lg font-semibold text-slate-900">Prepare a report</h2><p className="mt-1 text-sm text-slate-500">Use a parcel ID from the map, select the safe report sections, then request a live credit quote.</p></div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-medium text-slate-700">Property ID<input required inputMode="numeric" value={propertyId} onChange={(event) => { setPropertyId(event.target.value.replace(/\D/g, '')); setQuote(null); setConfirmed(false) }} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" placeholder="From selected parcel" /></label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">Business purpose<input required minLength={10} maxLength={500} value={purpose} onChange={(event) => { setPurpose(event.target.value); setQuote(null); setConfirmed(false) }} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label>
        </div>
        <fieldset className="mt-5"><legend className="text-sm font-semibold text-slate-800">Report sections</legend><div className="mt-3 space-y-2">{REPORT_OPTIONS.map((option) => <label key={option.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${reportTypes.includes(option.id) ? 'border-blue-200 bg-blue-50/60' : 'border-slate-200'}`}><input className="mt-1" type="checkbox" checked={reportTypes.includes(option.id)} onChange={() => toggleType(option.id)} /><span><span className="block text-sm font-semibold text-slate-800">{option.label}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">{option.description}</span></span></label>)}</div></fieldset>
        <button type="submit" disabled={!canQuote} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1769dc] px-4 text-sm font-semibold text-white hover:bg-[#1359bc] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">{busy === 'quote' ? <LoaderCircle className="animate-spin" size={16} /> : <FileSearch size={16} />}Get credit estimate</button>
      </form>

      <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-slate-900">Cost confirmation</h2>{quote ? <div className="mt-4 space-y-4"><div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Supplier credit estimate</p><p className="mt-1 text-2xl font-semibold text-amber-950">{formatCredits(quote.credits_consumed)}</p><p className="mt-2 text-xs leading-5 text-amber-900">Quote expires {formatDate(quote.quote_expires_at)}. A live report request may consume this estimate.</p></div>{quoteExpired ? <p className="text-sm text-rose-700">This quote has expired. Request a new estimate.</p> : <label className="flex items-start gap-2 text-sm leading-5 text-slate-700"><input className="mt-1" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I confirm this business purpose and approve the quoted supplier credit usage.</label>}<button type="button" disabled={!confirmed || quoteExpired || Boolean(busy)} onClick={() => void submitReport()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">{busy === 'request' ? <LoaderCircle className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}Request live property report</button></div> : <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-500">No report has been quoted yet. Cost details are fetched from the supplier validation response before anything chargeable can be requested.</div>}</aside>
    </div>

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between gap-3 border-b border-slate-200 p-5"><div><h2 className="text-lg font-semibold text-slate-900">Requested reports</h2><p className="mt-1 text-sm text-slate-500">Only your own requests and organisation-admin views are available.</p></div><button type="button" onClick={() => void loadReports()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw size={15} />Refresh</button></div>{requestState.error ? <p className="m-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertTriangle size={17} />{requestState.error}</p> : null}{requestState.status === 'loading' ? <div className="grid min-h-40 place-items-center text-sm text-slate-500"><LoaderCircle className="animate-spin" size={18} /></div> : requestState.items.length ? <div className="divide-y divide-slate-100">{requestState.items.map((item) => <article key={item.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">Property {item.property_id}</p><p className="mt-1 text-xs text-slate-500">{item.requested_report_types?.map((type) => type.replace(/_/g, ' ')).join(' · ')} · {formatDate(item.created_at)}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.status === 'ready' ? 'bg-emerald-50 text-emerald-700' : item.status === 'failed' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{item.status}</span></div>{item.report_summary ? <><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-xs text-slate-500">Address</dt><dd className="mt-1 font-medium text-slate-800">{item.report_summary.address || 'Not supplied'}</dd></div><div><dt className="text-xs text-slate-500">Property type</dt><dd className="mt-1 font-medium text-slate-800">{item.report_summary.propertyType || 'Not supplied'}</dd></div><div><dt className="text-xs text-slate-500">Extent</dt><dd className="mt-1 font-medium text-slate-800">{item.report_summary.extent ? `${Number(item.report_summary.extent).toLocaleString('en-ZA')} m²` : 'Not supplied'}</dd></div><div><dt className="text-xs text-slate-500">Municipal valuation</dt><dd className="mt-1 font-medium text-slate-800">{item.report_summary.municipalValuation?.value ? `R${Number(item.report_summary.municipalValuation.value).toLocaleString('en-ZA')}` : 'Not requested / not supplied'}</dd></div></dl><button type="button" disabled={isAlreadyConverted(prospects, item.id)} onClick={() => openConversion(item)} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-default disabled:border-emerald-200 disabled:bg-emerald-50 disabled:text-emerald-700">{isAlreadyConverted(prospects, item.id) ? <CheckCircle2 size={16} /> : <UserPlus size={16} />}{isAlreadyConverted(prospects, item.id) ? 'Added to Canvassing' : 'Create canvassing prospect'}</button></> : null}</article>)}</div> : <div className="p-10 text-center text-sm text-slate-500">No property reports have been requested yet.</div>}</section>
    <CreateProspectModal report={conversion.report} draft={conversion.draft} saving={conversion.saving} error={conversion.error} onChange={updateConversion} onClose={() => setConversion({ report: null, draft: null, saving: false, error: '' })} onSubmit={createProspect} />
  </section>
}
