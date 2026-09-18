import {
  AlertTriangle,
  BarChart3,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  getKnowledgeFactoryPackageCommercialPolicy,
  saveKnowledgeFactoryPackageCommercialPolicy,
} from "../../services/propertyIntelligence/knowledgeFactoryPackageCommercialPolicyService";

const PRODUCTS = [
  { id: "basic_owner_lookup", label: "Basic address + owner lookup" },
  { id: "full_canvassing_report", label: "Full canvassing report" },
];

function rands(cents) {
  return `R${(Number(cents || 0) / 100).toFixed(2)}`;
}
function initialPolicy(policy = {}) {
  return {
    allowedProductIds:
      policy.allowed_product_ids || PRODUCTS.map((item) => item.id),
    perReportCreditCap: policy.per_report_credit_cap ?? 100000,
    basicReportCreditCap: policy.basic_report_credit_cap ?? 100000,
    fullReportCreditCap: policy.full_report_credit_cap ?? 100000,
    monthlyCreditCap: policy.monthly_credit_cap ?? 1000000,
    monthlyReportCap: policy.monthly_report_cap ?? 100,
    dailyReportCapPerUser: policy.daily_report_cap_per_user ?? 10,
    rolloutStage: policy.rollout_stage || "controlled_uat",
    supplierCreditsPerCent: policy.supplier_credits_per_cent ?? 40,
  };
}

export default function KnowledgeFactoryPackageCommercialPolicyPanel({
  organisationId,
}) {
  const [state, setState] = useState({
    loading: true,
    busy: false,
    error: "",
    policy: initialPolicy(),
    configured: false,
    usage: null,
  });
  const load = useCallback(async () => {
    if (!organisationId) return;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const result = await getKnowledgeFactoryPackageCommercialPolicy({
        organisationId,
      });
      setState({
        loading: false,
        busy: false,
        error: "",
        policy: initialPolicy(result.policy),
        configured: result.policy?.configured === true,
        usage: result.usage || null,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error?.message || "Package commercial controls are unavailable.",
      }));
    }
  }, [organisationId]);
  useEffect(() => {
    void load();
  }, [load]);
  function toggleProduct(productId) {
    setState((current) => {
      const selected = current.policy.allowedProductIds.includes(productId);
      const allowedProductIds = selected
        ? current.policy.allowedProductIds.filter((item) => item !== productId)
        : [...current.policy.allowedProductIds, productId];
      return { ...current, policy: { ...current.policy, allowedProductIds } };
    });
  }
  function update(field, value) {
    setState((current) => ({
      ...current,
      policy: { ...current.policy, [field]: value },
    }));
  }
  async function save(event) {
    event.preventDefault();
    if (state.busy) return;
    setState((current) => ({ ...current, busy: true, error: "" }));
    try {
      const result = await saveKnowledgeFactoryPackageCommercialPolicy({
        organisationId,
        ...state.policy,
      });
      setState({
        loading: false,
        busy: false,
        error: "",
        policy: initialPolicy(result.policy),
        configured: true,
        usage: result.usage || null,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        busy: false,
        error:
          error?.message || "Package commercial controls could not be saved.",
      }));
    }
  }
  const usage = state.usage || {};
  const supplierCostCents = Math.round(
    Number(usage.creditsConsumed || 0) /
      Math.max(1, Number(state.policy.supplierCreditsPerCent || 40)),
  );
  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white shadow-sm"
      data-testid="knowledge-factory-package-commercial-controls"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 text-[#1769dc]" size={20} />
          <div>
            <h3 className="font-semibold text-slate-900">
              Commercial release controls
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Limits are checked on the server before a package can request
              supplier data. They are separate from the older section-level
              policy while packages are still in controlled UAT.
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
            className="mb-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {state.error}
          </p>
        ) : null}
        {!state.configured && !state.loading ? (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Package execution remains blocked until these limits are saved by a
            principal-level administrator.
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["This month", `${usage.reportCount || 0} reports`],
            [
              "Supplier credits",
              `${Number(usage.creditsConsumed || 0).toLocaleString("en-ZA")} / ${Number(state.policy.monthlyCreditCap || 0).toLocaleString("en-ZA")}`,
            ],
            [
              "Customer value",
              `${rands(usage.customerRevenueCents)} revenue · ${rands(supplierCostCents)} estimated supplier cost`,
            ],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {label}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {value}
              </p>
            </div>
          ))}
        </div>
        <form className="mt-5 space-y-5" onSubmit={save}>
          <fieldset>
            <legend className="text-sm font-semibold text-slate-800">
              Packages available in this rollout
            </legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {PRODUCTS.map((product) => (
                <label
                  key={product.id}
                  className="inline-flex items-center gap-2 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={state.policy.allowedProductIds.includes(
                      product.id,
                    )}
                    onChange={() => toggleProduct(product.id)}
                  />
                  {product.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[
              ["basicReportCreditCap", "Maximum supplier credits for Basic"],
              ["fullReportCreditCap", "Maximum supplier credits for Full"],
              ["monthlyCreditCap", "Maximum supplier credits per month"],
              ["monthlyReportCap", "Maximum reports per month"],
              ["dailyReportCapPerUser", "Maximum reports per user each day"],
            ].map(([field, label]) => (
              <label key={field} className="text-sm font-medium text-slate-700">
                {label}
                <input
                  required
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={state.policy[field]}
                  onChange={(event) =>
                    update(field, event.target.value.replace(/\D/g, ""))
                  }
                  className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3"
                />
              </label>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Rollout stage
              <select
                value={state.policy.rolloutStage}
                onChange={(event) => update("rolloutStage", event.target.value)}
                className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3"
              >
                <option value="controlled_uat">Controlled UAT</option>
                <option value="pilot">Pilot</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Supplier credits per cent
              <input
                required
                min="1"
                step="1"
                inputMode="numeric"
                value={state.policy.supplierCreditsPerCent}
                onChange={(event) =>
                  update(
                    "supplierCreditsPerCent",
                    event.target.value.replace(/\D/g, ""),
                  )
                }
                className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3"
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Use 40 for subscription credits or 30 for prepaid credits.
              </span>
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-blue-50 p-4 text-sm text-blue-950">
            <span className="flex max-w-3xl gap-2 leading-5">
              <BarChart3 size={16} className="mt-0.5 shrink-0" />
              The supplier-cost figure is an operational estimate from recorded
              credits. The preflight guard uses the latest approved complete
              package query and its own Basic or Full credit cap; it does not
              let the browser choose a query.
            </span>
            <button
              type="submit"
              disabled={state.busy || state.loading}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#1769dc] px-4 font-semibold text-white disabled:bg-slate-300"
            >
              <Save size={15} />
              {state.busy ? "Saving…" : "Save controls"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
