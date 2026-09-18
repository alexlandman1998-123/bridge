import {
  Calculator,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  listKnowledgeFactoryCostMatrix,
  validateKnowledgeFactoryCostRecipe,
} from "../../services/propertyIntelligence/knowledgeFactoryCostMatrixService";

const RECIPES = [
  [
    "package_basic_v1",
    "Basic package - exact query",
    "The complete Basic report query. Validate this before making Basic available.",
    true,
  ],
  [
    "package_full_v1",
    "Full package - exact query",
    "The complete Full report query, including controlled transfer and finance indicators.",
    true,
  ],
  [
    "snapshot_core",
    "1. Minimal property snapshot",
    "Core parcel, address and locality fields.",
    false,
  ],
  [
    "snapshot_valuation",
    "2. Snapshot + municipal valuation",
    "Core snapshot plus valuation and zoning.",
    false,
  ],
  [
    "owner_current_transfer",
    "3. Current-owner signal",
    "Current transfer marker and minimum ownership fields.",
    false,
  ],
  [
    "transaction_history_recent",
    "4. Recent transaction history",
    "Three controlled transfer records.",
    false,
  ],
  [
    "finance_current_bonds",
    "5. Current-bond indicators",
    "One transfer and up to five bond records.",
    false,
  ],
];

function credits(value) {
  return Number.isFinite(Number(value))
    ? `${new Intl.NumberFormat("en-ZA").format(Number(value))} credits`
    : "No estimate returned";
}
function money(value, divisor) {
  const number = Number(value);
  return Number.isFinite(number) ? `~R${(number / divisor).toFixed(2)}` : "—";
}

export default function KnowledgeFactoryCostMatrixPanel({ organisationId }) {
  const [propertyId, setPropertyId] = useState("");
  const [purpose, setPurpose] = useState(
    "Controlled UAT validation of canvassing report supplier costs",
  );
  const [state, setState] = useState({ loading: true, items: [], error: "" });
  const [busy, setBusy] = useState("");
  async function load({ quiet = false } = {}) {
    if (!organisationId) return;
    if (!quiet) setState((value) => ({ ...value, loading: true, error: "" }));
    try {
      const result = await listKnowledgeFactoryCostMatrix({ organisationId });
      setState({
        loading: false,
        items: Array.isArray(result.items) ? result.items : [],
        error: "",
      });
    } catch (error) {
      setState((value) => ({
        ...value,
        loading: false,
        error: error?.message || "Cost-matrix history is unavailable.",
      }));
    }
  }
  useEffect(() => {
    void load();
  }, [organisationId]);
  const current = useMemo(
    () =>
      new Map(
        state.items
          .filter(
            (item) =>
              String(item.property_id) === propertyId &&
              item.outcome === "validated",
          )
          .map((item) => [item.recipe_id, item]),
      ),
    [state.items, propertyId],
  );
  async function validate(recipeId) {
    if (busy || !/^[1-9]\d{0,14}$/.test(propertyId) || purpose.length < 10)
      return;
    setBusy(recipeId);
    try {
      await validateKnowledgeFactoryCostRecipe({
        organisationId,
        propertyId,
        recipeId,
        purpose,
      });
      await load({ quiet: true });
    } catch (error) {
      setState((value) => ({
        ...value,
        error: error?.message || "Supplier cost validation failed.",
      }));
    } finally {
      setBusy("");
    }
  }
  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white shadow-sm"
      data-testid="knowledge-factory-cost-matrix"
    >
      <div className="border-b border-slate-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex gap-3">
            <Calculator className="mt-0.5 text-[#1769dc]" size={20} />
            <div>
              <h3 className="font-semibold text-slate-900">
                Canvassing cost-validation matrix
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Each action sends a supplier cost-validation query only. It does
                not request a report, store supplier data or expose ownership,
                seller or bond details.
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
      </div>
      <div className="p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            One UAT Property ID
            <input
              required
              inputMode="numeric"
              value={propertyId}
              onChange={(event) =>
                setPropertyId(event.target.value.replace(/\D/g, ""))
              }
              className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3"
              placeholder="From a selected map parcel"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            UAT purpose
            <input
              required
              minLength={10}
              maxLength={500}
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3"
            />
          </label>
        </div>
        {state.error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          >
            {state.error}
          </p>
        ) : null}
        <div className="mt-5 grid gap-3 lg:grid-cols-4">
          {RECIPES.map(([id, title, description, isPackage]) => {
            const result = current.get(id);
            return (
              <article
                key={id}
                className="flex min-h-64 flex-col rounded-xl border border-slate-200 p-4"
              >
                <p className="text-sm font-semibold text-slate-900">{title}</p>
                {isPackage ? (
                  <span className="mt-2 w-fit rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
                    Required before release
                  </span>
                ) : null}
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {description}
                </p>
                {result ? (
                  <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-950">
                    <p className="flex items-center gap-1 font-semibold">
                      <CheckCircle2 size={14} />
                      Validated
                    </p>
                    <p className="mt-2 font-semibold">
                      {credits(result.credits_consumed)}
                    </p>
                    <p className="mt-1">
                      Supplier cost: {money(result.credits_consumed, 4000)}{" "}
                      subscription / {money(result.credits_consumed, 3000)}{" "}
                      prepaid
                    </p>
                    <p className="mt-2 text-emerald-800">
                      Fields {result.field_cost ?? "—"} · Types{" "}
                      {result.type_cost ?? "—"} · Surcharge{" "}
                      {result.price_surcharge ?? "—"}
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 text-xs leading-5 text-slate-500">
                    Not yet validated for this property.
                  </p>
                )}
                <button
                  type="button"
                  disabled={
                    !/^[1-9]\d{0,14}$/.test(propertyId) ||
                    purpose.length < 10 ||
                    Boolean(result) ||
                    Boolean(busy)
                  }
                  onClick={() => void validate(id)}
                  className="mt-auto inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white disabled:bg-slate-200 disabled:text-slate-500"
                >
                  {busy === id ? (
                    <LoaderCircle className="animate-spin" size={15} />
                  ) : (
                    <Calculator size={15} />
                  )}
                  {busy === id ? "Validating…" : "Validate cost"}
                </button>
              </article>
            );
          })}
        </div>
        {state.loading ? (
          <p className="mt-4 text-sm text-slate-500">
            Loading earlier validations…
          </p>
        ) : null}
      </div>
    </section>
  );
}
