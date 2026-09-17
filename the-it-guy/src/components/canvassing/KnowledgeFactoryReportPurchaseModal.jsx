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
} from "../../services/propertyIntelligence/knowledgeFactoryReportPurchaseService";
import Modal from "../ui/Modal";

function money(cents) {
  return `R${(Number(cents || 0) / 100).toFixed(2)}`;
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
  });
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
  async function confirm(event) {
    event.preventDefault();
    if (!selected || saving || state.purpose.trim().length < 10) return;
    setSaving(true);
    try {
      const result = await confirmKnowledgeFactoryReportPurchase({
        organisationId,
        propertyId: property?.propertyId || property?.id,
        productId: selected.productId,
        purpose: state.purpose,
      });
      setState((previous) => ({
        ...previous,
        saved: result.intent || {},
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
  async function execute() {
    if (!state.saved?.id || executing) return;
    setExecuting(true);
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
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
            <p className="flex items-center gap-2 font-semibold">
              <CheckCircle2 size={18} />
              Report selection confirmed
            </p>
            <p className="mt-2 text-sm leading-6">
              {state.saved.product_name} at{" "}
              {money(state.saved.customer_price_cents)} has been recorded for
              this property. No supplier data has been requested or charged in
              this step.
            </p>
          </div>
          {state.error ? (
            <p
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
            >
              {state.error}
            </p>
          ) : null}
          {report ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-900">Report ready</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                The controlled UAT report was saved securely. It consumed{" "}
                {Number.isFinite(Number(report.creditsConsumed))
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
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              Running this UAT report will now request the package’s fixed
              supplier fields and consume supplier credits. The result is saved
              to the secure report record for this property.
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {!report ? (
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
                {executing ? "Running UAT report…" : "Run UAT report"}
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
        <form className="space-y-5" onSubmit={confirm}>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
            <div className="flex gap-2">
              <ShieldCheck className="mt-0.5 shrink-0" size={17} />
              <p>
                Review the package and price before confirming. This records a
                controlled purchase intention only; it does not retrieve
                supplier data or use credits.
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
          <label className="flex items-start gap-2 text-sm leading-5 text-slate-700">
            <input required type="checkbox" className="mt-1" />I confirm this
            lookup is necessary for the stated business purpose and that I have
            authority to request it.
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
              disabled={saving || !selected || !state.products.length}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1769dc] px-4 text-sm font-semibold text-white disabled:bg-slate-300"
            >
              {saving ? (
                <LoaderCircle className="animate-spin" size={16} />
              ) : (
                <CreditCard size={16} />
              )}
              {saving
                ? "Confirming…"
                : `Confirm ${selected ? money(selected.customerPriceCents) : "report"}`}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
