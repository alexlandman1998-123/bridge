import { CheckCircle2, PackageCheck, RefreshCw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import {
  listKnowledgeFactoryReportProducts,
  saveKnowledgeFactoryReportProduct,
} from "../../services/propertyIntelligence/knowledgeFactoryReportProductsService";

function rands(cents) {
  return `R${(Number(cents || 0) / 100).toFixed(2)}`;
}

export default function KnowledgeFactoryReportProductsPanel({
  organisationId,
}) {
  const [state, setState] = useState({
    loading: true,
    products: [],
    error: "",
  });
  const [prices, setPrices] = useState({});
  const [busy, setBusy] = useState("");
  async function load({ quiet = false } = {}) {
    if (!organisationId) return;
    if (!quiet)
      setState((previous) => ({ ...previous, loading: true, error: "" }));
    try {
      const result = await listKnowledgeFactoryReportProducts({
        organisationId,
      });
      const products = Array.isArray(result.products) ? result.products : [];
      setPrices(
        Object.fromEntries(
          products.map((item) => [
            item.productId,
            (Number(item.customerPriceCents || 0) / 100).toFixed(2),
          ]),
        ),
      );
      setState({ loading: false, products, error: "" });
    } catch (error) {
      setState((previous) => ({
        ...previous,
        loading: false,
        error: error?.message || "Report packages are unavailable.",
      }));
    }
  }
  useEffect(() => {
    void load();
  }, [organisationId]);
  async function save(product, markUatValidated = false) {
    const price = Math.round(Number(prices[product.productId]) * 100);
    if (!Number.isInteger(price) || price < 0) {
      setState((previous) => ({
        ...previous,
        error: "Enter a valid selling price before saving.",
      }));
      return;
    }
    setBusy(`${product.productId}:${markUatValidated ? "ready" : "save"}`);
    try {
      const result = await saveKnowledgeFactoryReportProduct({
        organisationId,
        productId: product.productId,
        customerPriceCents: price,
        markUatValidated,
      });
      const products = Array.isArray(result.products) ? result.products : [];
      setState({ loading: false, products, error: "" });
    } catch (error) {
      setState((previous) => ({
        ...previous,
        error: error?.message || "The report package could not be saved.",
      }));
    } finally {
      setBusy("");
    }
  }
  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white shadow-sm"
      data-testid="knowledge-factory-report-products"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5">
        <div className="flex gap-3">
          <PackageCheck className="mt-0.5 text-[#1769dc]" size={20} />
          <div>
            <h3 className="font-semibold text-slate-900">
              Phase 1: report packages
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Define the fixed products agents will eventually buy. The field
              list is locked here; no customer report can be generated in this
              phase.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold"
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>
      <div className="p-5">
        {state.error ? (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          >
            {state.error}
          </p>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-2">
          {state.products.map((product) => (
            <article
              key={product.productId}
              className="rounded-xl border border-slate-200 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-slate-900">
                    {product.name}
                  </h4>
                  <p className="mt-1 text-sm leading-5 text-slate-500">
                    {product.description}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${product.status === "uat_validated" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                >
                  {product.status === "uat_validated"
                    ? "UAT validated"
                    : "Draft"}
                </span>
              </div>
              <div className="mt-4 rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Included information
                </p>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {product.fields.map((field) => (
                    <li key={field}>• {field}</li>
                  ))}
                </ul>
              </div>
              {product.excludedFields?.length ? (
                <div className="mt-3 rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Deliberately not included
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-600">
                    {product.excludedFields.map((field) => (
                      <li key={field}>• {field}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="mt-4 rounded-lg border border-slate-200 p-3 text-xs text-slate-600">
                <p className="font-semibold uppercase tracking-wide text-slate-500">
                  UAT contract dependencies
                </p>
                <p className="mt-1">
                  {product.contractValidationCount}/{product.requiredContractOperations?.length || 0} passed: {product.requiredContractOperations?.join(", ") || "None"}
                </p>
                {product.missingContractOperations?.length ? (
                  <p className="mt-1 font-medium text-amber-700">
                    Still required: {product.missingContractOperations.join(", ")}
                  </p>
                ) : (
                  <p className="mt-1 font-medium text-emerald-700">
                    Contract evidence complete.
                  </p>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                <label className="text-sm font-medium text-slate-700">
                  Proposed selling price
                  <input
                    inputMode="decimal"
                    value={prices[product.productId] ?? ""}
                    onChange={(event) =>
                      setPrices((previous) => ({
                        ...previous,
                        [product.productId]: event.target.value.replace(
                          /[^\d.]/g,
                          "",
                        ),
                      }))
                    }
                    className="mt-1 block min-h-10 w-32 rounded-lg border border-slate-200 px-3"
                    aria-label={`${product.name} proposed selling price`}
                  />
                </label>
                <div className="text-right text-xs text-slate-500">
                  <p>
                    {product.validationCount}/{product.validationRequired} UAT
                    components validated
                  </p>
                  <p className="mt-1 font-semibold text-slate-700">
                    Quoted supplier total:{" "}
                    {Number(product.validationCount)
                      ? `${new Intl.NumberFormat("en-ZA").format(product.validatedSupplierCredits)} credits`
                      : "Awaiting validation"}
                  </p>
                  <p className="mt-1">
                    {product.validatedSupplierCostCents === null
                      ? "Save commercial controls to calculate supplier cost and margin."
                      : `Validated supplier cost: ${rands(product.validatedSupplierCostCents)} · Proposed gross margin: ${rands(product.proposedGrossMarginCents)}`}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void save(product)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold disabled:bg-slate-100"
                >
                  <Save size={15} />
                  {busy === `${product.productId}:save`
                    ? "Saving…"
                    : `Save ${rands(Math.round(Number(prices[product.productId]) * 100))}`}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy) || !product.canMarkUatValidated}
                  onClick={() => void save(product, true)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white disabled:bg-slate-200 disabled:text-slate-500"
                >
                  <CheckCircle2 size={15} />
                  {busy === `${product.productId}:ready`
                    ? "Updating…"
                    : "Mark UAT ready"}
                </button>
              </div>
            </article>
          ))}
        </div>
        {state.loading ? (
          <p className="mt-4 text-sm text-slate-500">
            Loading Phase 1 report definitions…
          </p>
        ) : null}
      </div>
    </section>
  );
}
