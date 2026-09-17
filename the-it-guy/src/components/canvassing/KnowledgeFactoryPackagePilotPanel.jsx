import {
  AlertTriangle,
  CheckCircle2,
  PauseCircle,
  RefreshCw,
  Rocket,
  Save,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  getKnowledgeFactoryPackagePilot,
  saveKnowledgeFactoryPackagePilot,
} from "../../services/propertyIntelligence/knowledgeFactoryPackagePilotService";

function initialPilot(pilot = {}) {
  return {
    status: pilot.status || "candidate",
    allowedUserIds: Array.isArray(pilot.allowed_user_ids)
      ? pilot.allowed_user_ids
      : [],
  };
}

export default function KnowledgeFactoryPackagePilotPanel({ organisationId }) {
  const [state, setState] = useState({
    loading: true,
    busy: false,
    error: "",
    pilot: initialPilot(),
    candidates: [],
    limit: 5,
    privateGateEnabled: false,
  });
  const load = useCallback(async () => {
    if (!organisationId) return;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const result = await getKnowledgeFactoryPackagePilot({ organisationId });
      setState({
        loading: false,
        busy: false,
        error: "",
        pilot: initialPilot(result.pilot),
        candidates: Array.isArray(result.candidates) ? result.candidates : [],
        limit: Number(result.maxPilotUsers || 5),
        privateGateEnabled: result.privatePilotGateEnabled === true,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error?.message || "Package pilot status is unavailable.",
      }));
    }
  }, [organisationId]);
  useEffect(() => {
    void load();
  }, [load]);
  function toggleUser(userId) {
    setState((current) => {
      const selected = current.pilot.allowedUserIds.includes(userId);
      if (!selected && current.pilot.allowedUserIds.length >= current.limit)
        return {
          ...current,
          error: `Choose no more than ${current.limit} named pilot users.`,
        };
      return {
        ...current,
        error: "",
        pilot: {
          ...current.pilot,
          allowedUserIds: selected
            ? current.pilot.allowedUserIds.filter((id) => id !== userId)
            : [...current.pilot.allowedUserIds, userId],
        },
      };
    });
  }
  async function save(status = state.pilot.status) {
    if (state.busy) return;
    setState((current) => ({ ...current, busy: true, error: "" }));
    try {
      const result = await saveKnowledgeFactoryPackagePilot({
        organisationId,
        status,
        allowedUserIds: state.pilot.allowedUserIds,
      });
      setState({
        loading: false,
        busy: false,
        error: "",
        pilot: initialPilot(result.pilot),
        candidates: Array.isArray(result.candidates) ? result.candidates : [],
        limit: Number(result.maxPilotUsers || 5),
        privateGateEnabled: result.privatePilotGateEnabled === true,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        busy: false,
        error: error?.message || "Package pilot could not be saved.",
      }));
    }
  }
  const active = state.pilot.status === "active";
  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white shadow-sm"
      data-testid="knowledge-factory-package-pilot"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5">
        <div className="flex gap-3">
          <Rocket className="mt-0.5 text-[#1769dc]" size={20} />
          <div>
            <h3 className="font-semibold text-slate-900">
              Phase 6: named-user pilot
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              A pilot is limited to a maximum of {state.limit} named users.
              Being an organisation member alone does not give an agent pilot
              access.
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
        <div
          className={`mb-4 rounded-xl border p-3 text-sm ${state.privateGateEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}
        >
          {state.privateGateEnabled ? (
            <span className="flex gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              The private pilot gate is enabled. Activation still requires the
              Phase 5 policy to be set to Pilot and at least one UAT-ready
              package.
            </span>
          ) : (
            <span className="flex gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              The private pilot gate is off. You may prepare the cohort, but it
              cannot be activated until
              <code className="mx-1 rounded bg-amber-100 px-1">
                KNOWLEDGE_FACTORY_PILOT_ENABLED=true
              </code>
              is set server-side.
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
          <div className="flex gap-3">
            <UsersRound className="mt-0.5 text-slate-500" size={18} />
            <div>
              <p className="font-semibold text-slate-800">
                {state.pilot.allowedUserIds.length}/{state.limit} named users
              </p>
              <p className="text-sm text-slate-500">
                Current pilot state: {state.pilot.status.replace(/_/g, " ")}
              </p>
            </div>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}
          >
            {active ? "Pilot active" : state.pilot.status}
          </span>
        </div>
        <fieldset className="mt-5">
          <legend className="text-sm font-semibold text-slate-800">
            Eligible named users
          </legend>
          <p className="mt-1 text-sm text-slate-500">
            Only active users with existing property-report permission are
            listed here.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {state.candidates.map((candidate) => (
              <label
                key={candidate.userId}
                className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={state.pilot.allowedUserIds.includes(
                    candidate.userId,
                  )}
                  onChange={() => toggleUser(candidate.userId)}
                  disabled={state.busy}
                />
                <span>{candidate.email}</span>
              </label>
            ))}
          </div>
          {!state.loading && !state.candidates.length ? (
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
              No eligible users yet. Grant a named user the property-report
              entitlement before adding them to this pilot.
            </p>
          ) : null}
        </fieldset>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={state.busy}
            onClick={() => void save("candidate")}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold disabled:bg-slate-100"
          >
            <Save size={15} />
            Save cohort
          </button>
          <button
            type="button"
            disabled={state.busy || !state.pilot.allowedUserIds.length}
            onClick={() => void save("active")}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white disabled:bg-slate-300"
          >
            <Rocket size={15} />
            Activate pilot
          </button>
          <button
            type="button"
            disabled={state.busy || !active}
            onClick={() => void save("paused")}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-300 px-3 text-sm font-semibold text-amber-800 disabled:bg-slate-100"
          >
            <PauseCircle size={15} />
            Pause immediately
          </button>
        </div>
      </div>
    </section>
  );
}
