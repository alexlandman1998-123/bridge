import {
  CheckCircle2,
  CreditCard,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  confirmKnowledgeFactoryReportPurchase,
  executeKnowledgeFactoryReportPurchase,
  listKnowledgeFactoryPurchasableProducts,
  quoteKnowledgeFactoryReportPurchase,
} from "../../services/propertyIntelligence/knowledgeFactoryReportPurchaseService";
import { listKnowledgeFactorySellerLeadOptions } from "../../services/propertyIntelligence/knowledgeFactoryReportConversionService";
import Modal from "../ui/Modal";

function money(cents) {
  return `R${(Number(cents || 0) / 100).toFixed(2)}`;
}
function recordedCredits(value) {
  return value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value));
}

export default function KnowledgeFactoryReportPurchaseModal({
  property,
  organisationId,
  onClose,
}) {
  const [state, setState] = useState({
    loading: true,
    products: [],
    error: "",
    selected: "",
    purpose: "Canvassing potential seller opportunity",
    saved: null,
    attested: false,
  });
  const [sellerOptions,setSellerOptions] = useState({items:[],loading:true,error:'',linkedLeadId:null});
  const [sellerLeadId,setSellerLeadId] = useState('');
  const [sellerSearch,setSellerSearch] = useState('');
  const [sellerOptionsAttempt,setSellerOptionsAttempt] = useState(0);
  const selectedPropertyId = property?.propertyId || property?.id;
  useEffect(() => {
    let active=true;
    setSellerLeadId('');
    setSellerOptions({items:[],loading:true,error:'',linkedLeadId:null});
    const timer=setTimeout(() => {
      listKnowledgeFactorySellerLeadOptions({organisationId,propertyId:selectedPropertyId,search:sellerSearch})
      .then(result => {if(active) setSellerOptions({...result,loading:false,error:''});})
      .catch(() => {if(active) setSellerOptions({items:[],loading:false,error:'Existing seller leads could not be loaded. Retry before continuing if you want to link one.',linkedLeadId:null});});
    },250);
    return () => {active=false;clearTimeout(timer);};
  },[organisationId,selectedPropertyId,sellerOptionsAttempt,sellerSearch]);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [report, setReport] = useState(null);
  useEffect(() => {
    let active = true;
    listKnowledgeFactoryPurchasableProducts({ organisationId })
      .then((result) => {
        if (!active) return;
        const products = Array.isArray(result.products) ? result.products : [];
        setState((previous) => ({
          ...previous,
          loading: false,
          products,
          environment: result.supplierEnvironment || "uat",
          selected: products[0]?.productId || "",
          error: "",
        }));
      })
      .catch((error) => {
        if (active)
          setState((previous) => ({
            ...previous,
            loading: false,
            error: error?.message || "Report packages are unavailable.",
          }));
      });
    return () => {
      active = false;
    };
  }, [organisationId]);
  const selected =
    state.products.find((item) => item.productId === state.selected) || null;
  const live = (state.saved?.supplier_environment || state.environment) === "live";
  async function quote(event) {
    event.preventDefault();
    if (!selected || saving || state.purpose.trim().length < 10 || (live && (sellerOptions.loading || sellerOptions.error))) return;
    setSaving(true);
    try {
      const result = await quoteKnowledgeFactoryReportPurchase({
        organisationId,
        propertyId: property?.propertyId || property?.id,
        productId: selected.productId,
        purpose: state.purpose,
        boundaryReceipt: property?.boundaryReceipt || null,
        sellerLeadId: sellerLeadId || null,
      });
      setState((previous) => ({
        ...previous,
        saved: result.intent || {},
        boundaryStatus: result.boundary || {status:'unavailable'},
        error: "",
      }));
    } catch (error) {
      setState((previous) => ({
        ...previous,
        error: error?.message || "The report selection could not be confirmed.",
      }));
    } finally {
      setSaving(false);
    }
  }
  async function confirmQuote() {
    if (!state.saved?.id || !state.attested || saving) return;
    setSaving(true);
    try {
      const result = await confirmKnowledgeFactoryReportPurchase({
        organisationId,
        intentId: state.saved.id,
        attested: true,
      });
      setState((previous) => ({ ...previous, saved: result.intent || previous.saved, error: "" }));
    } catch (error) {
      setState((previous) => ({ ...previous, error: error?.message || "The report quote could not be confirmed." }));
    } finally {
      setSaving(false);
    }
  }
  async function execute() {
    if (!state.saved?.id || executing || state.executionAttempted) return;
    setExecuting(true);
    setState(previous => ({ ...previous, executionAttempted: true }));
    try {
      const result = await executeKnowledgeFactoryReportPurchase({
        organisationId,
        intentId: state.saved.id,
      });
      setReport(result.report || null);
      setState((previous) => ({ ...previous, error: "" }));
    } catch (error) {
      setState((previous) => ({
        ...previous,
        error: error?.message || "The report could not be executed.",
      }));
    } finally {
      setExecuting(false);
    }
  }
  return (
    <Modal
      open
      onClose={() => {
        if (!saving && !executing) onClose?.();
      }}
      title="Choose a property report"
      subtitle={`Property ${property?.propertyId || property?.id}`}
      className="max-w-2xl"
    >
      {state.saved ? (
        <div className="space-y-4">
          <div className={`rounded-xl border p-4 ${state.saved.status === "confirmed_pending_execution" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-blue-200 bg-blue-50 text-blue-950"}`}>
            <p className="flex items-center gap-2 font-semibold">
              <CheckCircle2 size={18} />
              {state.saved.status === "confirmed_pending_execution" ? "Report quote confirmed" : (live ? "Report cost estimate ready" : "UAT cost estimate ready")}
            </p>
            <p className="mt-2 text-sm leading-6">
              {state.saved.product_name} costs {money(state.saved.customer_price_cents)} to the customer. The fixed package query has a conservative maximum estimate of {recordedCredits(state.saved.quoted_supplier_credits) ? `${state.saved.quoted_supplier_credits} supplier credits` : "an unavailable supplier cost"}, not a supplier-confirmed bill. No supplier report data has been requested in this step.
            </p>
            <p className="mt-2 text-sm">{live ? "A successfully saved report will be added to your agency’s monthly invoice at this price." : "This is a supplier test report and will not be added to your agency’s invoice."}</p>
            <p className="mt-2 text-xs">Quote expires {state.saved.quote_expires_at ? new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(state.saved.quote_expires_at)) : "soon"}.</p>
          </div>
          {selected?.productId === 'full_canvassing_report' ? <p className="text-sm text-slate-600">{state.boundaryStatus?.status === 'supplied' ? 'The verified property outline will be included in this report.' : `A verified property outline is unavailable for this report. ${state.boundaryStatus?.reason || 'The PDF will show the available property data.'}`}</p> : null}
          {(state.saved?.target_seller_lead_id || sellerLeadId) ? <p className="text-sm text-slate-600">This report will be filed to the selected existing seller lead.</p> : null}
          {state.error ? (
            <p
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
            >
              {state.error}
            </p>
          ) : null}
          {state.saved.status !== "confirmed_pending_execution" ? (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <label className="flex items-start gap-2 text-sm leading-5 text-slate-700"><input type="checkbox" checked={state.attested} onChange={(event) => setState((previous) => ({ ...previous, attested: event.target.checked }))} className="mt-1" />I confirm this lookup is necessary for the stated business purpose and that I have authority to request it.</label>
              <button type="button" disabled={!state.attested || saving} onClick={() => void confirmQuote()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1769dc] px-4 text-sm font-semibold text-white disabled:bg-slate-300">{saving ? <LoaderCircle className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}{saving ? "Confirming…" : `Confirm report at ${money(state.saved.customer_price_cents)}`}</button>
            </div>
          ) : report ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-900">Report ready</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {live ? "The report was saved securely and added to your agency’s monthly invoice. It consumed" : "The controlled UAT report was saved securely. It consumed"}{" "}
                {recordedCredits(report.creditsConsumed)
                  ? `${report.creditsConsumed} supplier credits`
                  : "the supplier-recorded credits"}
                .
              </p>
              <p className="mt-3 text-sm font-medium text-slate-900">
                {report.data?.property?.address || "Property details returned"}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {report.data?.owners?.length
                  ? `${report.data.owners.length} current owner record${report.data.owners.length === 1 ? "" : "s"} included.`
                  : "No current owner record was returned."}
              </p>
              {report.sellerFiling?.status === 'filed' ? (
                <p className="mt-3 text-sm text-emerald-800">All supplied owners and the PDF are filed under the seller lead. <a className="font-semibold underline" href={`/pipeline/leads/${report.sellerFiling.leadId}`}>Open seller lead</a></p>
              ) : report.sellerFiling?.status === 'test_report' ? (
                <p className="mt-3 text-sm text-slate-600">This test report does not create a real seller lead.</p>
              ) : live ? (
                <p className="mt-3 text-sm text-amber-800">Your report is saved. Retry seller lead or document filing from Completed reports; do not purchase it again.</p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              Running this report will now request the package’s fixed
              supplier fields and consume supplier credits. The result is saved
              to the secure report record for this property.
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {state.executionAttempted && !report && !executing ? (
              <p className="text-sm text-slate-700">Check Completed reports before requesting another report for this property. Ask your administrator to review this request if no report is saved.</p>
            ) : null}
            {!report && !state.executionAttempted ? (
              <button
                type="button"
                disabled={saving || executing}
                onClick={() => setState((previous) => ({ ...previous, saved: null, attested: false, error: "" }))}
                className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold disabled:opacity-50"
              >
                Get a new estimate
              </button>
            ) : null}
            {state.saved.status === "confirmed_pending_execution" && !report && !state.executionAttempted ? (
              <button
                type="button"
                disabled={executing}
                onClick={execute}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1769dc] px-4 text-sm font-semibold text-white disabled:bg-slate-300"
              >
                {executing ? (
                  <LoaderCircle className="animate-spin" size={16} />
                ) : (
                  <CreditCard size={16} />
                )}
                {executing ? "Running report…" : live ? "Run report and add to monthly invoice" : "Run UAT report"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              disabled={executing}
              className="min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:bg-slate-300"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={quote}>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
            <div className="flex gap-2">
              <ShieldCheck className="mt-0.5 shrink-0" size={17} />
              <p>
                Review the package and price before requesting a cost estimate. This step does not retrieve a report or add a charge to your agency invoice.
              </p>
            </div>
          </div>
          {state.error ? (
            <p
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
            >
              {state.error}
            </p>
          ) : null}
          {live ? <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-900" htmlFor="report-seller-lead">Save to seller lead</label>
            {sellerOptions.linkedLeadId ? <p className="text-sm text-slate-600">This property already has a linked seller lead. New reports will be saved there.</p> : <>
              <label className="block text-xs text-slate-500" htmlFor="report-seller-search">Find an existing seller by name or address</label>
              <input id="report-seller-search" type="search" maxLength={120} value={sellerSearch} onChange={event=>setSellerSearch(event.target.value)} className="w-full rounded-lg border border-slate-200 p-2 text-sm"/>
              <select id="report-seller-lead" className="w-full rounded-lg border border-slate-200 p-3 text-sm" value={sellerLeadId} disabled={sellerOptions.loading || saving} onChange={event => setSellerLeadId(event.target.value)}>
                <option value="">Create a seller lead for this property</option>
                {(sellerOptions.items || []).map(item => <option key={item.leadId} value={item.leadId}>{[item.name || 'Seller lead',item.address].filter(Boolean).join(' — ')}</option>)}
              </select>
              <p className="text-xs text-slate-500">Choose an existing lead to keep its details and documents together. All supplied owners will be linked for review.</p>
            </>}
            {sellerOptions.error ? <div><p role="alert" className="text-sm text-amber-800">{sellerOptions.error}</p><button type="button" onClick={() => setSellerOptionsAttempt(attempt=>attempt+1)} className="mt-2 text-sm font-semibold underline">Retry seller lead lookup</button></div> : null}
          </div> : null}
          {state.loading ? (
            <div className="grid min-h-32 place-items-center text-sm text-slate-500">
              <LoaderCircle className="animate-spin" size={18} />
            </div>
          ) : state.products.length ? (
            <fieldset>
              <legend className="text-sm font-semibold text-slate-900">
                Available report packages
              </legend>
              <div className="mt-3 space-y-3">
                {state.products.map((product) => (
                  <label
                    key={product.productId}
                    className={`block cursor-pointer rounded-xl border p-4 ${state.selected === product.productId ? "border-[#1769dc] bg-blue-50" : "border-slate-200 bg-white"}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="report-package"
                        checked={state.selected === product.productId}
                        onChange={() =>
                          setState((previous) => ({
                            ...previous,
                            selected: product.productId,
                          }))
                        }
                      />
                      <span className="flex-1">
                        <span className="flex items-center justify-between gap-3">
                          <strong className="text-sm text-slate-900">
                            {product.name}
                          </strong>
                          <strong className="text-sm text-slate-900">
                            {money(product.customerPriceCents)}
                          </strong>
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-slate-600">
                          {product.description}
                        </span>
                        <span className="mt-3 block text-xs font-medium text-slate-700">
                          Includes: {product.fields.join(" · ")}
                        </span>
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              There are no UAT-ready report packages yet. An administrator must
              validate the package components and mark a package UAT ready in
              Operations first.
            </div>
          )}
          <label className="block text-sm font-medium text-slate-700">
            Business purpose
            <textarea
              required
              minLength={10}
              maxLength={500}
              value={state.purpose}
              onChange={(event) =>
                setState((previous) => ({
                  ...previous,
                  purpose: event.target.value,
                }))
              }
              className="mt-1.5 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </label>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !selected || !state.products.length || (live && (sellerOptions.loading || Boolean(sellerOptions.error)))}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1769dc] px-4 text-sm font-semibold text-white disabled:bg-slate-300"
            >
              {saving ? (
                <LoaderCircle className="animate-spin" size={16} />
              ) : (
                <CreditCard size={16} />
              )}
              {saving
                ? "Getting estimate…"
                : `${live ? "Get estimate" : "Get UAT estimate"} for ${selected ? money(selected.customerPriceCents) : "report"}`}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
