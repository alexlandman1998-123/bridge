import { ArrowRight, CheckCircle2, Clock3, Eye, FileSearch, LoaderCircle, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { createCanvassingActivity, createCanvassingProspect } from '../../lib/canvassingRepository'
import { propertyDataProvider } from '../../services/propertyIntelligence/propertyDataProvider'
import {
  buildPropertyReportProspectActivity,
  buildPropertyReportProspectDraft,
  buildPropertyReportProspectPayload,
  isPropertyReportAlreadyCanvassed,
} from '../../services/propertyIntelligence/propertyReportCanvassing'
import Field from '../ui/Field'
import Modal from '../ui/Modal'

const EMPTY_PROSPECTS = Object.freeze([])

function formatCurrency(value) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(Number(value || 0))
}

function formatDateTime(value) {
  if (!value) return 'Not available'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function statusMeta(status) {
  if (status === 'ready') return { label: 'Ready', className: 'border-emerald-200 bg-emerald-50 text-emerald-700', Icon: CheckCircle2 }
  if (status === 'processing') return { label: 'Processing', className: 'border-blue-200 bg-blue-50 text-blue-700', Icon: LoaderCircle }
  return { label: 'Queued', className: 'border-amber-200 bg-amber-50 text-amber-700', Icon: Clock3 }
}

function ReportViewer({ report, isCanvassed, onAddToCanvassing, onClose }) {
  if (!report) return null
  const isDemoData = report.isDemoData === true
  const reportTypeIds = new Set(report.reportTypes.map((reportType) => reportType.id))
  return (
    <Modal open onClose={onClose} title={report.property.address} subtitle={`Erf ${report.property.erfNumber} • ${report.property.suburb}`} className="max-w-5xl">
      <div className="space-y-5">
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${isDemoData ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
          <div><p className="text-sm font-semibold">Arch9 {isDemoData ? 'demonstration ' : ''}property report</p><p className="mt-1 text-xs opacity-80">{isDemoData ? report.demoNotice : 'Report supplied through the configured property data provider.'}</p></div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold"><ShieldCheck size={14} />{isDemoData ? 'Demo report' : 'Provider report'}</span>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Property type', report.property.propertyType],
            ['Erf size', `${report.property.erfSizeSquareMetres.toLocaleString('en-ZA')} m²`],
            ['Report order', report.orderId],
            ['Completed', formatDateTime(report.completedAt)],
          ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-slate-900">{value}</p></div>)}
        </section>

        {reportTypeIds.has('deeds_summary') ? (
          <section className="rounded-2xl border border-slate-200 p-5">
            <h4 className="text-base font-semibold text-slate-900">Deeds summary</h4>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div><dt className="text-xs text-slate-500">Registered owner</dt><dd className="mt-1 font-semibold text-slate-900">{report.deedsSummary.registeredOwner}</dd>{isDemoData ? <dd className="mt-1 text-xs text-amber-700">Fictional owner identity</dd> : null}</div>
              <div><dt className="text-xs text-slate-500">Title deed number</dt><dd className="mt-1 font-semibold text-slate-900">{report.deedsSummary.titleDeedNumber}</dd></div>
              <div><dt className="text-xs text-slate-500">Registration division</dt><dd className="mt-1 font-semibold text-slate-900">{report.deedsSummary.registrationDivision}</dd></div>
              <div><dt className="text-xs text-slate-500">Registered description</dt><dd className="mt-1 font-semibold text-slate-900">{report.deedsSummary.registeredDescription}</dd></div>
            </dl>
          </section>
        ) : null}

        {reportTypeIds.has('transfer_history') ? (
          <section className="rounded-2xl border border-slate-200 p-5">
            <h4 className="text-base font-semibold text-slate-900">Transfer history</h4>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Transfer date</th><th className="px-4 py-3">Consideration</th><th className="px-4 py-3">Title deed</th></tr></thead><tbody className="divide-y divide-slate-100">{report.transferHistory.map((transfer) => <tr key={transfer.titleDeedNumber}><td className="px-4 py-3 font-medium text-slate-800">{formatDateTime(transfer.transferDate)}</td><td className="px-4 py-3 font-semibold text-slate-900">{formatCurrency(transfer.transferAmount)}</td><td className="px-4 py-3 text-slate-600">{transfer.titleDeedNumber}</td></tr>)}</tbody></table>
            </div>
          </section>
        ) : null}

        {reportTypeIds.has('property_valuation') ? (
          <section className="rounded-2xl border border-slate-200 p-5">
            <h4 className="text-base font-semibold text-slate-900">Indicative property valuation</h4>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Indicative value</p><p className="mt-1 text-xl font-semibold text-slate-900">{formatCurrency(report.valuation.indicativeValue)}</p></div>
              <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Indicative range</p><p className="mt-1 text-sm font-semibold text-slate-900">{formatCurrency(report.valuation.lowerRange)} – {formatCurrency(report.valuation.upperRange)}</p></div>
              <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Comparable properties</p><p className="mt-1 text-xl font-semibold text-slate-900">{report.valuation.comparablePropertyCount}</p></div>
            </div>
          </section>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <p className="text-xs text-slate-500">Report price: {formatCurrency(report.amount)} • {isDemoData ? 'Indicative demo pricing' : 'Provider pricing'} • Ex VAT</p>
          <button type="button" disabled={isCanvassed} onClick={() => onAddToCanvassing(report)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1769dc] px-4 text-sm font-semibold text-white hover:bg-[#1359bc] disabled:cursor-default disabled:bg-emerald-100 disabled:text-emerald-700">{isCanvassed ? <CheckCircle2 size={16} /> : <UserPlus size={16} />}{isCanvassed ? 'Added to Canvassing' : 'Add to Canvassing'}</button>
        </div>
      </div>
    </Modal>
  )
}

function AddToCanvassingModal({ report, draft, error, saving, onChange, onClose, onSubmit }) {
  if (!report || !draft) return null
  const isDemoData = report.isDemoData === true
  return (
    <Modal open onClose={() => { if (!saving) onClose() }} title="Add to Canvassing" subtitle={report.property.formattedAddress || report.property.address} className="max-w-2xl">
      <form className="space-y-5" onSubmit={onSubmit}>
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {isDemoData ? 'This creates a seller prospect from fictional demonstration data.' : 'This creates a seller prospect from the connected property report.'} Review the contact fields before saving.
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-medium text-slate-700">First name<Field required value={draft.firstName} onChange={(event) => onChange('firstName', event.target.value)} /></label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">Last name<Field value={draft.lastName} onChange={(event) => onChange('lastName', event.target.value)} /></label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">Phone <span className="font-normal text-slate-400">(optional)</span><Field type="tel" value={draft.phone} onChange={(event) => onChange('phone', event.target.value)} /></label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">Email <span className="font-normal text-slate-400">(optional)</span><Field type="email" value={draft.email} onChange={(event) => onChange('email', event.target.value)} /></label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">Next follow-up <span className="font-normal text-slate-400">(optional)</span><Field type="date" value={draft.nextFollowUpDate} onChange={(event) => onChange('nextFollowUpDate', event.target.value)} /></label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">Priority<Field as="select" value={draft.followUpPriority} onChange={(event) => onChange('followUpPriority', event.target.value)}><option>Low</option><option>Medium</option><option>High</option></Field></label>
        </div>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">Canvassing note<Field as="textarea" rows={3} value={draft.followUpNote} onChange={(event) => onChange('followUpNote', event.target.value)} /></label>
        <dl className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-slate-500">Property</dt><dd className="mt-1 font-semibold text-slate-900">{report.property.address}</dd></div>
          <div><dt className="text-xs text-slate-500">Source</dt><dd className="mt-1 font-semibold text-slate-900">Property Intelligence</dd></div>
          <div><dt className="text-xs text-slate-500">Prospect type</dt><dd className="mt-1 font-semibold text-slate-900">Seller Prospect</dd></div>
          <div><dt className="text-xs text-slate-500">Assigned to</dt><dd className="mt-1 font-semibold text-slate-900">Current agent</dd></div>
        </dl>
        {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" disabled={saving} onClick={onClose} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1769dc] px-4 text-sm font-semibold text-white hover:bg-[#1359bc] disabled:cursor-wait disabled:bg-slate-300">{saving ? <LoaderCircle className="animate-spin" size={16} /> : <UserPlus size={16} />}{saving ? 'Adding prospect…' : 'Create seller prospect'}</button>
        </div>
      </form>
    </Modal>
  )
}

export default function PropertyReportsWorkspace({ prospects = EMPTY_PROSPECTS, onProspectCreated }) {
  const navigate = useNavigate()
  const { currentWorkspace, profile, currentMembership } = useWorkspace()
  const [reportState, setReportState] = useState({ status: 'loading', orders: [], error: '' })
  const [selectedReport, setSelectedReport] = useState(null)
  const [detailLoadingId, setDetailLoadingId] = useState('')
  const [conversion, setConversion] = useState({ report: null, draft: null, saving: false, error: '' })
  const [convertedPropertyIds, setConvertedPropertyIds] = useState(() => new Set())
  const organisationId = currentWorkspace?.id || ''

  async function loadOrders({ quiet = false } = {}) {
    if (!quiet) setReportState((previous) => ({ ...previous, status: 'loading', error: '' }))
    try {
      const result = await propertyDataProvider.getReportOrders({ organisationId })
      setReportState({ status: 'ready', orders: result.items, error: '' })
      return result.items
    } catch (error) {
      setReportState({ status: 'error', orders: [], error: error?.message || 'Unable to load property reports.' })
      return []
    }
  }

  useEffect(() => {
    let active = true
    let timer = null
    async function refreshUntilSettled() {
      const orders = await propertyDataProvider.getReportOrders({ organisationId }).catch((error) => {
        if (active) setReportState({ status: 'error', orders: [], error: error?.message || 'Unable to load property reports.' })
        return { items: [] }
      })
      if (!active) return
      setReportState({ status: 'ready', orders: orders.items, error: '' })
      if (orders.items.some((order) => order.status !== 'ready')) timer = window.setTimeout(refreshUntilSettled, 500)
    }
    void refreshUntilSettled()
    return () => {
      active = false
      if (timer) window.clearTimeout(timer)
    }
  }, [organisationId])

  const propertyReports = useMemo(() => reportState.orders.flatMap((order) => (Array.isArray(order.propertySummaries) ? order.propertySummaries : []).map((property) => ({ ...property, order }))), [reportState.orders])
  const totalSpend = useMemo(() => reportState.orders.reduce((total, order) => total + Number(order.quote?.total || 0), 0), [reportState.orders])

  async function viewReport(orderId, propertyId) {
    setDetailLoadingId(`${orderId}:${propertyId}`)
    try {
      const order = await propertyDataProvider.getReportOrder(orderId)
      const rawReport = order.propertyReports.find((item) => item.property.id === propertyId)
      if (!rawReport) throw new Error('The selected property report could not be found.')
      setSelectedReport({ ...rawReport, isDemoData: rawReport.isDemoData ?? propertyDataProvider.isDemoData })
    } catch (error) {
      setReportState((previous) => ({ ...previous, error: error?.message || 'Unable to open the selected report.' }))
    } finally {
      setDetailLoadingId('')
    }
  }

  function isCanvassed(propertyId) {
    return convertedPropertyIds.has(propertyId) || isPropertyReportAlreadyCanvassed(prospects, propertyId)
  }

  async function openAddToCanvassing(orderIdOrReport, propertyId = '') {
    try {
      setReportState((previous) => ({ ...previous, error: '' }))
      let report = orderIdOrReport
      if (typeof orderIdOrReport === 'string') {
        const order = await propertyDataProvider.getReportOrder(orderIdOrReport)
        const rawReport = order.propertyReports.find((item) => item.property.id === propertyId)
        report = rawReport ? { ...rawReport, isDemoData: rawReport.isDemoData ?? propertyDataProvider.isDemoData } : null
      }
      if (!report) throw new Error('The selected property report could not be found.')
      if (isCanvassed(report.property.id)) return
      setConversion({ report, draft: buildPropertyReportProspectDraft(report), saving: false, error: '' })
    } catch (error) {
      setReportState((previous) => ({ ...previous, error: error?.message || 'Unable to prepare this canvassing prospect.' }))
    }
  }

  function updateConversionDraft(field, value) {
    setConversion((previous) => ({ ...previous, draft: { ...previous.draft, [field]: value }, error: '' }))
  }

  async function addToCanvassing(event) {
    event.preventDefault()
    if (!conversion.report || !conversion.draft || conversion.saving) return
    setConversion((previous) => ({ ...previous, saving: true, error: '' }))
    const agentId = profile?.userId || profile?.user_id || currentMembership?.userId || currentMembership?.user_id || profile?.id || ''
    const agentName = profile?.fullName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || 'Current Agent'
    const context = {
      organisationId,
      assignedAgentId: agentId,
      assignedUserId: agentId,
      assignedAgentName: agentName,
      assignedAgentEmail: profile?.email || '',
      branchId: profile?.branchId || currentMembership?.branchId || currentMembership?.branch_id || '',
      createdBy: agentId,
    }
    try {
      const payload = buildPropertyReportProspectPayload(conversion.report, conversion.draft, context)
      const created = await createCanvassingProspect(organisationId, payload)
      let activity = null
      try {
        activity = await createCanvassingActivity(organisationId, buildPropertyReportProspectActivity(conversion.report, created, context))
      } catch (activityError) {
        console.warn('[CANVASSING] property report prospect activity could not be created.', activityError)
      }
      setConvertedPropertyIds((previous) => new Set(previous).add(conversion.report.property.id))
      onProspectCreated?.(created, activity)
      setSelectedReport(null)
      setConversion({ report: null, draft: null, saving: false, error: '' })
    } catch (error) {
      setConversion((previous) => ({ ...previous, saving: false, error: error?.message || 'Unable to add this property to canvassing.' }))
    }
  }

  return (
    <section className="space-y-4" data-canvassing-workspace="property-reports">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Report orders', reportState.orders.length],
          ['Property reports', propertyReports.length],
          ['Indicative spend', formatCurrency(totalSpend)],
        ].map(([label, value]) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p></article>)}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
          <div><h3 className="text-lg font-semibold text-slate-900">Property reports</h3><p className="mt-1 text-sm text-slate-500">Review completed {propertyDataProvider.isDemoData ? 'fictional ' : ''}reports and prepare properties for canvassing.</p></div>
          <button type="button" onClick={() => loadOrders()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw size={15} />Refresh</button>
        </div>

        {reportState.error ? <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{reportState.error}</div> : null}
        {reportState.status === 'loading' ? <div className="grid min-h-[320px] place-items-center text-sm font-medium text-slate-500"><span className="inline-flex items-center gap-2"><LoaderCircle className="animate-spin" size={18} />Loading property reports…</span></div> : null}

        {reportState.status !== 'loading' && propertyReports.length ? (
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            {propertyReports.map(({ order, ...property }) => {
              const status = statusMeta(order.status)
              const StatusIcon = status.Icon
              const detailId = `${order.id}:${property.id}`
              return (
                <article key={detailId} className="rounded-2xl border border-slate-200 p-4 transition hover:border-slate-300 hover:shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><h4 className="truncate font-semibold text-slate-900">{property.address}</h4><p className="mt-1 text-xs text-slate-500">Erf {property.erfNumber} • {property.propertyType} • {property.suburb}</p></div>
                    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}><StatusIcon className={order.status === 'processing' ? 'animate-spin' : ''} size={13} />{status.label}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">{property.reportTypes.map((reportType) => <span key={reportType} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{reportType.replaceAll('_', ' ')}</span>)}</div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-slate-500">Requested</dt><dd className="mt-1 font-semibold text-slate-800">{formatDateTime(order.requestedAt)}</dd></div><div><dt className="text-slate-500">Requested by</dt><dd className="mt-1 truncate font-semibold text-slate-800">{order.requestedByName}</dd></div><div><dt className="text-slate-500">{propertyDataProvider.isDemoData ? 'Demo price' : 'Price'}</dt><dd className="mt-1 font-semibold text-slate-800">{formatCurrency(property.amount)}</dd></div><div><dt className="text-slate-500">Order</dt><dd className="mt-1 truncate font-semibold text-slate-800">{order.id}</dd></div></dl>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button type="button" disabled={order.status !== 'ready' || detailLoadingId === detailId} onClick={() => viewReport(order.id, property.id)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#1769dc] px-3 text-sm font-semibold text-white hover:bg-[#1359bc] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">{detailLoadingId === detailId ? <LoaderCircle className="animate-spin" size={16} /> : <Eye size={16} />}View report</button>
                    <button type="button" disabled={order.status !== 'ready' || isCanvassed(property.id)} onClick={() => openAddToCanvassing(order.id, property.id)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-default disabled:border-emerald-200 disabled:bg-emerald-50 disabled:text-emerald-700">{isCanvassed(property.id) ? <CheckCircle2 size={16} /> : <UserPlus size={16} />}{isCanvassed(property.id) ? 'Added to Canvassing' : 'Add to Canvassing'}</button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : null}

        {reportState.status !== 'loading' && !propertyReports.length ? (
          <div className="grid min-h-[360px] place-items-center p-6 text-center"><div className="max-w-md"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-[#1769dc]"><FileSearch size={24} /></span><h3 className="mt-4 text-lg font-semibold text-slate-900">No property reports yet</h3><p className="mt-2 text-sm leading-6 text-slate-600">Select {propertyDataProvider.isDemoData ? 'fictional ' : ''}properties, choose report products and complete a {propertyDataProvider.isDemoData ? 'demonstration ' : ''}order first.</p><Link to="/pipeline/canvassing/property-search" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1769dc] px-4 text-sm font-semibold text-white hover:bg-[#1359bc]">Open Property Search<ArrowRight size={16} /></Link></div></div>
        ) : null}
      </section>

      {convertedPropertyIds.size ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span className="inline-flex items-center gap-2 font-semibold"><CheckCircle2 size={17} />{convertedPropertyIds.size} {convertedPropertyIds.size === 1 ? 'property added' : 'properties added'} to Current Prospects.</span><button type="button" onClick={() => navigate('/pipeline/canvassing')} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3 font-semibold text-emerald-800 shadow-sm hover:bg-emerald-100">View Current Prospects<ArrowRight size={15} /></button></div> : null}
      <ReportViewer report={selectedReport} isCanvassed={selectedReport ? isCanvassed(selectedReport.property.id) : false} onAddToCanvassing={openAddToCanvassing} onClose={() => setSelectedReport(null)} />
      <AddToCanvassingModal report={conversion.report} draft={conversion.draft} error={conversion.error} saving={conversion.saving} onChange={updateConversionDraft} onClose={() => setConversion({ report: null, draft: null, saving: false, error: '' })} onSubmit={addToCanvassing} />
    </section>
  )
}
