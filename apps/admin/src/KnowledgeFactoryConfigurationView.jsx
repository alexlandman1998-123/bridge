import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { supabase } from './lib/supabaseClient'

const API = 'https://app.arch9.co.za/api/admin/knowledge-factory/configuration'
const TEST_API = 'https://app.arch9.co.za/api/admin/knowledge-factory/uat-report-test'
const FULL_TEST_API = 'https://app.arch9.co.za/api/admin/knowledge-factory/uat-full-report-test'
const LIMITS = [
  ['basicReportCreditCap', 'Basic maximum supplier credits', 'basic_report_credit_cap'],
  ['fullReportCreditCap', 'Full maximum supplier credits', 'full_report_credit_cap'],
  ['monthlyCreditCap', 'Monthly maximum supplier credits', 'monthly_credit_cap'],
  ['monthlyReportCap', 'Monthly maximum reports', 'monthly_report_cap'],
  ['dailyReportCapPerUser', 'Daily maximum reports per user', 'daily_report_cap_per_user'],
]
async function request(organisationId, input, api = API) {
  const { data } = await supabase.auth.getSession()
  if (!data.session?.access_token) throw new Error('Sign in to the internal Operating Console again.')
  const response = await fetch(`${api}?organisationId=${encodeURIComponent(organisationId)}`, {
    method: input ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(input ? { 'Content-Type': 'application/json' } : {}) },
    ...(input ? { body: JSON.stringify(input) } : {}),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Internal supplier setup is unavailable.')
  return result
}
const money = (cents) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(cents / 100)

function ApprovedUatTest({ organisationId, api = TEST_API, label = 'Basic' }) {
  const [status, setStatus] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setStatus(null); setResult(null); setError('')
    request(organisationId, null, api).then((value) => { if (active) setStatus(value) }).catch(() => {})
    return () => { active = false }
  }, [organisationId, api])
  async function run() {
    setBusy(true); setError('')
    // Disable immediately; never auto-repeat a potentially charged execution.
    setStatus((value) => ({ ...value, available: false }))
    try {
      const value = await request(organisationId, { action: 'run_approved_test' }, api)
      setResult(value)
    } catch (failure) { setError(`${failure.message} Do not retry this report.`) }
    finally {
      setBusy(false)
      request(organisationId, null, api).then(setStatus).catch(() => {})
    }
  }
  if (!status) return null
  const evidence = result || status.result?.request_metadata
  return <section aria-label="Approved one-time UAT report test">
    <h3>Approved one-time {label} UAT report test</h3>
    <p>Property {status.propertyId} · one execution · no automatic retries. Estimated budget {status.creditBudget} credits (illustrative {money(Math.ceil(status.creditBudget / 30))} prepaid), not a supplier-enforced cap. Customer report access remains disabled.</p>
    <button className="secondary-button" type="button" disabled={busy || !status.available} onClick={run}>{busy ? 'Running one-time UAT report…' : status.consumed ? 'One-time test consumed' : label === 'Basic' ? 'Run approved one-time Basic UAT test' : 'Run approved one-time Full UAT test'}</button>
    {error ? <p role="alert">{error}</p> : null}
    {evidence ? <div role="status">
      <h4>{evidence.reportReturned || result?.report ? `${label} UAT report returned` : 'UAT test result'}</h4>
      <p>Billing verified: {evidence.billingVerified ? 'Yes' : 'No'} · within budget: {evidence.withinBudget ? 'Verified' : 'Not verified'}. {evidence.reportIssue || result?.reportIssue || ''}</p>
      <p>Supplier credits: {evidence.billing?.credits ?? 'Not supplied'} · amount deducted: {evidence.billing?.amountDeducted ?? 'Not supplied'} · billing status: {evidence.billing?.status || 'Not supplied'}.</p>
      {result?.report ? <>
        <p>{result.report.property.address || 'No street address returned'} · {result.report.property.suburb || ''} · {result.report.property.town || ''}</p>
        <p>Erf {result.report.property.erf ?? 'Not supplied'} · portion {result.report.property.portion ?? 'Not supplied'} · extent {result.report.property.extent ?? 'Not supplied'}.</p>
        <h4>Current owners</h4>
        <ul>{result.report.owners.map((owner, index) => <li key={index}>{owner.name || 'Name not supplied'} · {owner.type || 'Type not supplied'} · share {owner.share ?? 'Not supplied'}</li>)}</ul>
        <p>Current ownership registered: {result.report.ownership?.registeredAt || 'Not supplied'}.</p>
        {label === 'Full' ? <>
          <h4>Municipal valuation and selected transfer history</h4>
          <p>Municipal value: {result.report.municipalValuation?.value ?? 'Not supplied'} · zoning: {result.report.municipalValuation?.zoning || 'Not supplied'}.</p>
          <ul>{(result.report.transactions || []).map((transfer, index) => <li key={index}>Registered {transfer.registeredAt || 'Not supplied'} · purchase amount {transfer.purchaseAmount ?? 'Not supplied'} · {transfer.isCurrentOwner === true ? 'Current ownership' : 'Selected transfer'}</li>)}</ul>
          <p>{result.report.transferHistory?.hasMore === true ? 'Earlier transfers exist; only five were requested.' : 'History is limited to the supplier records returned.'}</p>
          <p>Finance indicator: {result.report.finance?.hasCurrentBond === true ? 'Recorded' : result.report.finance?.hasCurrentBond === false ? 'Supplier indicates no bond' : 'Not supplied'} · current bonds in returned records: {result.report.finance?.currentBondCount ?? 'Not supplied'}.</p>
        </> : null}
        <p>This private diagnostic is not saved as a customer report. Owner details disappear when this page is refreshed.</p>
      </> : null}
      <details><summary>Diagnostic billing and field-presence metadata (no owner data)</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify({ preflight: evidence.preflight, costs: evidence.costs, billing: evidence.billing, metadata: evidence.metadata, fieldCoverage: evidence.fieldCoverage, requests: evidence.requests, executionSent: evidence.executionSent }, null, 2)}</pre></details>
    </div> : null}
  </section>
}


function ReportChargeReview({ row, busy, onReview }) {
  const [credits, setCredits] = useState('')
  const [deducted, setDeducted] = useState('')
  const [reference, setReference] = useState('')
  return <li><p>{row.status} · {row.reserved_credits} reserved · {row.charged_credits ?? 'unknown'} charged credits</p>
    <form className="property24-credentials-form" onSubmit={event => { event.preventDefault(); onReview({ action: 'review_charge', intentId: row.purchase_intent_id, chargedCredits: Number(credits), deductedCredits: Number(deducted), supplierReference: reference }) }}>
      <label><span>Confirmed supplier credits</span><input required type="number" min="0" step="1" value={credits} onChange={event => setCredits(event.target.value)} /></label>
      <label><span>Confirmed amount deducted (credits)</span><input required type="number" min="0" step="1" value={deducted} onChange={event => setDeducted(event.target.value)} /></label>
      <label><span>Supplier charge confirmation reference</span><input required minLength={3} maxLength={250} value={reference} onChange={event => setReference(event.target.value)} /></label>
      <button type="submit" disabled={busy || credits === '' || deducted === ''}>Record confirmed charge</button>
    </form>
    {row.status === 'reserved' ? <p>This report is not marked sent. Confirm zero charged and deducted credits before releasing its reservation.</p> : null}
  </li>
}

function ReportCommercePanel({ organisationId }) {
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [price, setPrice] = useState('')
  const [productId, setProductId] = useState('basic_owner_lookup')
  const [form, setForm] = useState({ environment: 'uat', evidenceAuditId: '', supplierReference: '', reviewNote: '', expiresAt: '', fieldsReviewed: false, feeScheduleConfirmed: false })
  const api = 'https://app.arch9.co.za/api/admin/knowledge-factory/report-commerce'
  useEffect(() => {
    let active = true
    request(organisationId, null, api).then(value => { if (active) setState(value) }).catch(failure => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [organisationId])
  async function perform(input) {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await request(organisationId, input, api)
      setNotice(result.message || 'Report accounting updated.')
      setState(await request(organisationId, null, api))
    } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  const update = (field, value) => setForm(previous => ({ ...previous, [field]: value }))
  const evidence = state?.diagnostics?.find(item => item.id === form.evidenceAuditId)
  return <section aria-label="Report approval and monthly billing">
    <h3>Report approval and monthly billing</h3>
    <p>Customer charges accumulate on the agency’s monthly invoice after a live report is saved. Test reports are excluded. Invoices are issued here after the month closes; delivery and payment collection are handled separately.</p>
    {error ? <p role="alert">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
    {!state ? <p>Loading report accounting…</p> : <>
      <form className="property24-credentials-form" onSubmit={event => { event.preventDefault(); void perform({ ...form, productId: evidence?.productId, action: 'approve_cost' }) }}>
        <label><span>Saved supplier report evidence</span><select required value={form.evidenceAuditId} onChange={event => update('evidenceAuditId', event.target.value)}><option value="">Choose a completed diagnostic</option>{state.diagnostics.map(item => <option key={item.id} value={item.id} disabled={!item.complete}>{item.productId === 'basic_owner_lookup' ? 'Basic' : 'Full'} · {item.createdAt.slice(0,10)} · {item.complete ? 'Complete evidence' : 'Incomplete fields or billing'}</option>)}</select></label>
        <label><span>Approval environment</span><select value={form.environment} onChange={event => update('environment',event.target.value)}><option value="uat">Supplier test environment</option><option value="live">Supplier live environment</option></select></label>
        <label><span>Supplier fee confirmation reference</span><input required minLength={3} maxLength={250} value={form.supplierReference} onChange={event => update('supplierReference',event.target.value)} /></label>
        <label><span>Review note</span><input required minLength={10} maxLength={1000} value={form.reviewNote} onChange={event => update('reviewNote',event.target.value)} /></label>
        <label><span>Approval expires (within 30 days)</span><input required type="date" value={form.expiresAt} onChange={event => update('expiresAt',event.target.value)} /></label>
        <label><input type="checkbox" checked={form.fieldsReviewed} onChange={event => update('fieldsReviewed',event.target.checked)} />I reviewed the report fields and their completeness.</label>
        <label><input type="checkbox" checked={form.feeScheduleConfirmed} onChange={event => update('feeScheduleConfirmed',event.target.checked)} />The supplier confirmed this fee schedule for the selected environment.</label>
        <button className="secondary-button" disabled={busy || !evidence?.complete || !form.fieldsReviewed || !form.feeScheduleConfirmed}>Save reviewed cost approval</button>
      </form>
      <form className="property24-credentials-form" onSubmit={event => { event.preventDefault(); void perform({ action: 'save_package', productId, customerPriceCents: Math.round(Number(price)*100) }) }}>
        <label><span>Report package</span><select value={productId} onChange={event => setProductId(event.target.value)}><option value="basic_owner_lookup">Basic owner report</option><option value="full_canvassing_report">Full property report</option></select></label>
        <label><span>Agency price per report (ZAR)</span><input required type="number" min="0.01" max="1000" step="0.01" value={price} onChange={event => setPrice(event.target.value)} /></label>
        <button type="submit" disabled={busy}>Save price and approve package</button>
      </form>
      <ul>{state.approvals.map(approval => <li key={approval.id}>{approval.product_id === 'basic_owner_lookup' ? 'Basic' : 'Full'} · {approval.supplier_environment} · maximum {approval.maximum_credits} credits · expires {approval.expires_at.slice(0,10)} {approval.revoked_at ? '· revoked' : <button type="button" disabled={busy} onClick={() => void perform({ action: 'revoke_approval', approvalId: approval.id })}>Revoke approval</button>}</li>)}</ul>
      {state.usageReview.length ? <details><summary>Supplier usage awaiting completion or review ({state.usageReview.length})</summary><ul>{state.usageReview.map(row => <ReportChargeReview key={row.purchase_intent_id} row={row} busy={busy} onReview={input => void perform(input)} />)}</ul><p>Uncertain charges retain their reservation until the supplier confirms the amount. Recording a charge does not request another report or bill the agency for a failed report.</p></details> : null}
      <h4>Monthly agency invoices</h4>
      {!state.invoices.length ? <p>No live report charges yet.</p> : <ul>{state.invoices.map(invoice => <li key={invoice.id}>{invoice.invoice_month.slice(0,7)} · {invoice.status} · {money(invoice.knowledge_factory_report_invoice_lines.reduce((sum,line) => sum+line.amount_cents,0))} {invoice.status === 'draft' && invoice.invoice_month < new Date().toISOString().slice(0,7)+'-01' ? <button type="button" disabled={busy} onClick={() => void perform({ action: 'issue_invoice', invoiceId: invoice.id })}>Issue monthly invoice</button> : null}</li>)}</ul>}
    </>}
  </section>
}

function SetupForm({ organisationId }) {
  const [status, setStatus] = useState(null)
  const [limits, setLimits] = useState({})
  const [rate, setRate] = useState('')
  const [products, setProducts] = useState(['basic_owner_lookup'])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [propertyId, setPropertyId] = useState('383723')
  const [recipeId, setRecipeId] = useState('package_basic_v1')
  const [purpose, setPurpose] = useState('Verify complete report costs before a controlled Knowledge Factory pilot')
  const [quote, setQuote] = useState(null)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = true
    setError('')
    request(organisationId).then((result) => {
      if (!active) return
      setStatus(result)
      setLimits(Object.fromEntries(LIMITS.map(([key, , column]) => [key, result.policy?.[column] ?? ''])))
      setRate(result.policy?.supplier_credits_per_cent ? String(result.policy.supplier_credits_per_cent) : '30')
      setProducts(result.policy?.allowed_product_ids || ['basic_owner_lookup'])
    }).catch((failure) => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [organisationId, refresh])

  async function save(event) {
    event.preventDefault()
    setBusy(true); setNotice(''); setError('')
    try {
      await request(organisationId, { action: 'save_limits', ...limits, supplierCreditsPerCent: rate, allowedProductIds: products, perReportCreditCap: Math.max(Number(limits.basicReportCreditCap), Number(limits.fullReportCreditCap)) })
      setNotice('Limits saved for controlled UAT. This did not activate a pilot or grant report access.')
      setRefresh((value) => value + 1)
    } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  async function validate(event) {
    event.preventDefault()
    setBusy(true); setNotice(''); setError(''); setQuote(null)
    try {
      const result = await request(organisationId, { action: 'validate_cost', recipeId, propertyId, purpose })
      setQuote(result)
      setNotice(result.estimate ? 'Maximum-cost estimate calculated. No report purchased, billing evidence saved or product approved.' : 'Cost-only supplier validation recorded. No property report was purchased or returned.')
    } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  return <>
    {error ? <p role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {!status ? <p>{error ? 'Setup could not load. No controls have been changed.' : 'Loading internal supplier setup…'}</p> : <>
      <dl>
        <div><dt>Supplier contract</dt><dd>v1 · {status.supplier.uatEndpointConfigured ? 'Versioned UAT endpoint configured' : 'Versioned UAT endpoint needs configuration'}</dd></div>
        <div><dt>Credentials</dt><dd>{status.supplier.credentialsConfigured ? 'Configured privately (not a login verification)' : 'Private credentials missing'}</dd></div>
        <div><dt>Saved limits</dt><dd>{status.policy ? status.policy.rollout_stage : 'Not configured'}</dd></div>
        <div><dt>Organisation report access</dt><dd>{status.access?.enabled && !status.access?.suspended_at && status.access?.allowed_operations?.includes('property_report') ? 'Enabled; named-user permission is still required' : 'Not enabled'}</dd></div>
        <div><dt>Pilot</dt><dd>{status.pilot?.status || 'Not configured'} · activation unavailable in this screen</dd></div>
      </dl>
      <h3>Report limits</h3>
      <p>Choose approved caps explicitly. These are supplier credits, not rand prices. Saving keeps the rollout in controlled UAT; it does not enable paid reports.</p>
      <form className="property24-credentials-form" onSubmit={save}>
        <fieldset><legend>Packages permitted by these limits</legend>
          {[['basic_owner_lookup', 'Basic'], ['full_canvassing_report', 'Full']].map(([id, label]) => <label key={id}><input type="checkbox" checked={products.includes(id)} onChange={(event) => setProducts((items) => event.target.checked ? [...items, id] : items.filter((item) => item !== id))} />{label}</label>)}
        </fieldset>
        {LIMITS.map(([key, label]) => <label key={key}><span>{label}</span><input type="number" min="1" max={key === 'dailyReportCapPerUser' ? '10000' : key === 'monthlyReportCap' ? '100000' : '100000000'} step="1" required value={limits[key] ?? ''} onChange={(event) => setLimits((current) => ({ ...current, [key]: event.target.value }))} /></label>)}
        <label><span>Supplier credit plan</span><select required value={rate} onChange={(event) => setRate(event.target.value)}><option value="">Confirm the supplier account plan</option><option value="40">Subscription · 40 credits per cent</option><option value="30">Prepaid · 30 credits per cent</option></select></label>
        <button className="primary-button" type="submit" disabled={busy || !products.length}>Save UAT limits only</button>
      </form>
      <h3>Exact-package cost check</h3>
      <p>Checks complexity without generating a report, then adds the v1 field fees at every query limit to estimate a conservative maximum. This is not a supplier-confirmed price and does not approve the package.</p>
      <form className="property24-credentials-form" onSubmit={validate}>
        <label><span>Report package</span><select value={recipeId} onChange={(event) => { setRecipeId(event.target.value); setQuote(null) }}><option value="package_basic_v1">Basic · supplier API v1</option><option value="package_full_v1">Full · supplier API v1</option></select></label>
        <label><span>UAT property ID</span><input required inputMode="numeric" pattern="[1-9][0-9]*" value={propertyId} onChange={(event) => { setPropertyId(event.target.value); setQuote(null) }} /></label>
        <label><span>Validation purpose</span><input required minLength={10} maxLength={500} value={purpose} onChange={(event) => setPurpose(event.target.value)} /></label>
        <button className="secondary-button" type="submit" disabled={busy || !status.supplier.uatEndpointConfigured || !status.supplier.credentialsConfigured}>{busy ? 'Working…' : 'Validate cost only'}</button>
      </form>
      {quote?.estimate ? <div role="status"><h3>Maximum-cost estimate · property {quote.estimate.propertyId}</h3><p>Up to {quote.estimate.maximumCredits} supplier credits: complexity {quote.estimate.complexity} + maximum field fees {quote.estimate.maximumSurcharge}.</p><p>Illustrative maximum: {money(Math.ceil(quote.estimate.maximumCredits / 40))} subscription / {money(Math.ceil(quote.estimate.maximumCredits / 30))} prepaid. Confirm the supplier account plan before setting a customer price.</p><p>Conservative estimate, not supplier-confirmed billing. No product approved or report generated.</p></div> : quote?.item ? <div role="status"><h3>Supplier cost evidence · property {quote.item.property_id}</h3><p>{quote.item.credits_consumed} supplier credits · field cost {quote.item.field_cost} · type cost {quote.item.type_cost} · surcharge {quote.item.price_surcharge}</p><p>Illustrative supplier value: {money(Math.ceil(quote.item.credits_consumed / 40))} subscription / {money(Math.ceil(quote.item.credits_consumed / 30))} prepaid. This is not the customer price or an invoice.</p><p>Billing status: {quote.billing?.status || 'Not supplied'} · amount deducted: {quote.billing?.amountDeducted ?? 'Not supplied'} credits. Calculated credits and actual deduction are separate.</p></div> : null}
      {quote?.estimate?.ownerFieldFees ? <div>
        <h4>Owner fields within this estimate</h4>
        <p>The two name versions, owner type and share total {quote.estimate.ownerFieldFees.creditsPerOwner} credits per returned owner: approximately {money(Math.ceil(quote.estimate.ownerFieldFees.creditsPerOwner / 30))} prepaid. This component excludes the property, transfer and query charges.</p>
        <p>The full estimate allows up to {quote.estimate.ownerFieldFees.maximumOwners} owners ({quote.estimate.ownerFieldFees.maximumCredits} owner-field credits). Actual billing still needs supplier verification; the earlier UAT sample was charged at the full allowance despite displaying one placeholder owner.</p>
        <p>Phone numbers are not included in this query. Their availability and cost remain unverified.</p>
      </div> : null}
      <h3>Report readiness</h3>
      <ul>{status.products.map((product) => <li key={product.product_id}>{product.name || product.product_id}: {product.status} · customer price {money(product.customer_price_cents)}</li>)}</ul>
      <p>Remaining release review: exact supplier cost and field contract, approved customer pricing, named-user access and active capped pilot. None is bypassed by this setup screen.</p>
      <ReportCommercePanel organisationId={organisationId} />
      <ApprovedUatTest organisationId={organisationId} />
      <ApprovedUatTest organisationId={organisationId} api={FULL_TEST_API} label="Full" />
    </>}
  </>
}

export default function KnowledgeFactoryConfigurationView({ access, organisations = [] }) {
  const [organisationId, setOrganisationId] = useState('')
  if (access.level !== 'executive') return null
  return <section className="data-panel property24-credentials-panel">
    <div className="panel-title"><div><h2>Knowledge Factory setup</h2><span>Internal executive only · paid activation unavailable</span></div><ShieldCheck size={20} aria-hidden="true" /></div>
    <label className="property24-credentials-form"><span>Knowledge Factory organisation</span><select value={organisationId} onChange={(event) => setOrganisationId(event.target.value)}><option value="">Choose an organisation</option>{[...organisations].sort((a, b) => String(a.name || a.displayName || '').localeCompare(String(b.name || b.displayName || ''))).map((organisation) => <option key={organisation.id} value={organisation.id}>{organisation.name || organisation.displayName || 'Unnamed organisation'}</option>)}</select></label>
    {organisationId ? <SetupForm key={organisationId} organisationId={organisationId} /> : <p>Select an organisation to review its internal report setup.</p>}
  </section>
}
