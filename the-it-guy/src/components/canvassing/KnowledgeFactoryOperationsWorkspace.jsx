import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { getKnowledgeFactoryOperationsSnapshot } from "../../services/propertyIntelligence/knowledgeFactoryOperationsService";
import KnowledgeFactoryUatCasesPanel from "./KnowledgeFactoryUatCasesPanel";
import KnowledgeFactoryCommercialPolicyPanel from "./KnowledgeFactoryCommercialPolicyPanel";
import KnowledgeFactoryCostMatrixPanel from "./KnowledgeFactoryCostMatrixPanel";
import KnowledgeFactoryReportProductsPanel from "./KnowledgeFactoryReportProductsPanel";
import KnowledgeFactoryPackageCommercialPolicyPanel from "./KnowledgeFactoryPackageCommercialPolicyPanel";
import KnowledgeFactoryPackagePilotPanel from "./KnowledgeFactoryPackagePilotPanel";

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "No activity yet"
    : new Intl.DateTimeFormat("en-ZA", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function UatCheck({ complete, children }) {
  return (
    <li className="flex items-start gap-2 text-sm leading-5 text-slate-700">
      <CheckCircle2
        className={
          complete
            ? "mt-0.5 shrink-0 text-emerald-600"
            : "mt-0.5 shrink-0 text-slate-300"
        }
        size={16}
      />
      {children}
    </li>
  );
}

export default function KnowledgeFactoryOperationsWorkspace() {
  const { currentWorkspace } = useWorkspace();
  const organisationId =
    currentWorkspace?.organisationId ||
    currentWorkspace?.organisation_id ||
    currentWorkspace?.id ||
    "";
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  async function load() {
    setState((p) => ({ ...p, loading: true, error: "" }));
    try {
      setState({
        loading: false,
        data: await getKnowledgeFactoryOperationsSnapshot({ organisationId }),
        error: "",
      });
    } catch (error) {
      setState({
        loading: false,
        data: null,
        error: error?.message || "Operations data is unavailable.",
      });
    }
  }
  useEffect(() => {
    void load();
  }, [organisationId]);
  const data = state.data;
  const rollout = data?.rollout;
  return (
    <section
      className="space-y-5"
      data-canvassing-workspace="knowledge-factory-operations"
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 text-[#1769dc]" size={20} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">
                  Knowledge Factory operations
                </h2>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-amber-900">
                  Controlled UAT
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Admin-only visibility for named-user access, recorded credit
                usage, rollout readiness and audit activity.
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
      {state.error ? (
        <p className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertTriangle size={17} />
          {state.error}
        </p>
      ) : null}
      {state.loading ? (
        <div className="grid min-h-52 place-items-center">
          <LoaderCircle className="animate-spin" />
        </div>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [
                "Organisation access",
                rollout?.enabled ? "Enabled" : "Disabled",
              ],
              ["Named users", rollout?.namedUserCount || 0],
              [
                "Recorded credits",
                new Intl.NumberFormat("en-ZA").format(data.credits),
              ],
              ["Audited events", rollout?.auditedEventCount || 0],
            ].map(([label, value]) => (
              <article
                key={label}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {value}
                </p>
              </article>
            ))}
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
              <div className="flex gap-3">
                <ShieldCheck
                  className="mt-0.5 shrink-0 text-[#1769dc]"
                  size={19}
                />
                <div>
                  <h3 className="font-semibold text-blue-950">
                    UAT guardrails
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-blue-900">
                    This workspace is limited by organisation entitlement and
                    named-user permission. Each real supplier action is audited
                    with its purpose and recorded credit usage.
                  </p>
                </div>
              </div>
              <ul className="mt-4 space-y-3">
                <UatCheck complete={rollout?.enabled}>
                  Organisation entitlement is active and not suspended.
                </UatCheck>
                <UatCheck complete={(rollout?.mapUserCount || 0) > 0}>
                  {rollout?.mapUserCount || 0} named user
                  {(rollout?.mapUserCount || 0) === 1 ? "" : "s"} can search map
                  parcels.
                </UatCheck>
                <UatCheck complete={(rollout?.reportUserCount || 0) > 0}>
                  {rollout?.reportUserCount || 0} named user
                  {(rollout?.reportUserCount || 0) === 1 ? "" : "s"} can request
                  property reports.
                </UatCheck>
                <UatCheck complete={(rollout?.auditedEventCount || 0) > 0}>
                  Supplier activity is being retained in the immutable audit
                  log.
                </UatCheck>
              </ul>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-start gap-3">
                <UsersRound className="mt-0.5 text-slate-500" size={19} />
                <div>
                  <h3 className="font-semibold text-slate-900">
                    UAT testing snapshot
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Use this before inviting another tester or moving to a
                    broader UAT set.
                  </p>
                </div>
              </div>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Latest supplier activity
                  </dt>
                  <dd className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                    <Clock3 size={14} />
                    {formatDate(rollout?.latestEventAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Failed or denied events
                  </dt>
                  <dd
                    className={`mt-1 text-sm font-semibold ${rollout?.failedEventCount || 0 ? "text-amber-700" : "text-emerald-700"}`}
                  >
                    {rollout?.failedEventCount || 0}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Requested reports
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-800">
                    {data.reportCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Pending sensitive approvals
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-800">
                    {data.pendingLookups}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
          <KnowledgeFactoryCostMatrixPanel organisationId={organisationId} />
          <KnowledgeFactoryReportProductsPanel
            organisationId={organisationId}
          />
          <KnowledgeFactoryPackageCommercialPolicyPanel
            organisationId={organisationId}
          />
          <KnowledgeFactoryPackagePilotPanel organisationId={organisationId} />
          <KnowledgeFactoryCommercialPolicyPanel
            organisationId={organisationId}
          />
          <KnowledgeFactoryUatCasesPanel organisationId={organisationId} />
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5">
              <h3 className="font-semibold">Recent audited activity</h3>
              <p className="mt-1 text-sm text-slate-500">
                Emergency suspension remains an explicit administrator change in
                the access-control record.
              </p>
            </div>
            {data.events.length ? (
              <div className="divide-y divide-slate-100">
                {data.events.map((event, index) => (
                  <div
                    key={`${event.created_at}-${index}`}
                    className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
                  >
                    <div>
                      <p className="font-medium text-slate-800">
                        {event.operation.replace(/_/g, " ")} · {event.outcome}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {event.request_purpose} · {formatDate(event.created_at)}
                        {event.error_code ? ` · ${event.error_code}` : ""}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-slate-600">
                      {Number(event.credits_consumed || 0).toLocaleString(
                        "en-ZA",
                      )}{" "}
                      credits
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-10 text-center text-sm text-slate-500">
                <Activity className="mx-auto mb-3 text-slate-400" />
                No audited activity yet.
              </div>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
