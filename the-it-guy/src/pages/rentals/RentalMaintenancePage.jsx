import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  Plus,
  Search,
  Wrench,
} from "lucide-react";
import {
  acknowledgeRentalMaintenanceRequest,
  getRentalMaintenanceQueue,
} from "../../services/rentals/rentalMaintenanceRepository.js";

const label = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
const open = (item) =>
  !["resolved", "closed", "cancelled"].includes(item.status);

function Metric({ icon, label: title, value, tone = "text-[#142132]" }) {
  return (
    <article className="rounded-[16px] border border-[#e1e8f0] bg-white p-4">
      {createElement(icon, { size: 18, className: "text-[#1769d1]" })}
      <p className={`mt-3 text-2xl font-semibold ${tone}`}>{value}</p>
      <p className="mt-1 text-xs text-[#60758b]">{title}</p>
    </article>
  );
}
function IssueCard({ item, busy, onAcknowledge }) {
  const urgent =
    item.sla_breached || ["urgent", "emergency"].includes(item.priority);
  return (
    <article
      className={`rounded-[16px] border bg-white p-4 shadow-[0_8px_18px_rgba(15,23,42,.04)] ${urgent ? "border-l-4 border-l-red-500" : "border-[#e1e8f0]"}`}
    >
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <div className="flex gap-2 text-xs font-semibold">
            <span className={urgent ? "text-red-700" : "text-blue-700"}>
              {item.sla_breached ? "OVERDUE" : label(item.priority)}
            </span>
            <span className="text-[#60758b]">{item.request_id}</span>
          </div>
          <h3 className="mt-2 font-semibold text-[#142132]">
            {label(item.category)} issue
          </h3>
          <p className="mt-1 text-sm text-[#60758b]">
            {item.assignee_name || "Unassigned"} · reported{" "}
            {item.reported_at
              ? new Date(item.reported_at).toLocaleString()
              : "recently"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#f5f8fb] px-2.5 py-1 text-xs font-semibold text-[#36516e]">
            {label(item.status)}
          </span>
          {item.status === "submitted" ? (
            <button
              disabled={busy}
              onClick={() => onAcknowledge(item.request_id)}
              className="rounded-lg bg-[#087a55] px-3 py-2 text-xs font-semibold text-white"
            >
              Acknowledge
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function RentalMaintenancePage() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setQueue(await getRentalMaintenanceQueue());
    } catch (cause) {
      setError(cause?.message || "Unable to load maintenance requests.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const metrics = useMemo(
    () => ({
      open: queue.filter(open).length,
      urgent: queue.filter(
        (item) => open(item) && ["urgent", "emergency"].includes(item.priority),
      ).length,
      approval: queue.filter((item) => /approval/i.test(item.status)).length,
      overdue: queue.filter((item) => open(item) && item.sla_breached).length,
    }),
    [queue],
  );
  const rows = useMemo(
    () =>
      queue.filter(
        (item) =>
          [item.request_id, item.category, item.status, item.assignee_name]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (tab === "all" || tab === "new"
            ? tab !== "new" || item.status === "submitted"
            : tab === "in_progress"
              ? ["acknowledged", "triaged", "assigned", "in_progress"].includes(
                  item.status,
                )
              : tab === "overdue"
                ? item.sla_breached
                : item.status === tab),
      ),
    [queue, query, tab],
  );
  const acknowledge = async (id) => {
    try {
      setBusy(id);
      await acknowledgeRentalMaintenanceRequest(id);
      await load();
    } catch (cause) {
      setError(cause?.message || "Unable to acknowledge request.");
    } finally {
      setBusy("");
    }
  };
  const tabs = [
    ["all", "All issues"],
    ["new", "New"],
    ["in_progress", "In progress"],
    ["awaiting_approval", "Awaiting approval"],
    ["scheduled", "Scheduled"],
    ["resolved", "Resolved"],
  ];
  return (
    <main className="mx-auto w-full max-w-[1600px] px-3 py-3 sm:px-5 lg:px-7">
      <section className="space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#142132]">
              Maintenance
            </h1>
            <p className="mt-1 text-sm text-[#60758b]">
              Triage tenant issues, coordinate contractors and keep every
              property moving.
            </p>
          </div>
          <div className="flex gap-2">
            <label className="flex h-10 min-w-64 items-center gap-2 rounded-xl border border-[#dbe4ee] bg-white px-3">
              <Search size={15} className="text-[#7b8ca2]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none"
                placeholder="Search issues or assignee"
              />
            </label>
            <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#087a55] px-4 text-sm font-semibold text-white">
              <Plus size={16} />
              Log issue
            </button>
          </div>
        </header>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric icon={Wrench} label="Open issues" value={metrics.open} />
          <Metric
            icon={AlertTriangle}
            label="Urgent"
            value={metrics.urgent}
            tone="text-red-700"
          />
          <Metric
            icon={Clock3}
            label="Awaiting approval"
            value={metrics.approval}
            tone="text-amber-700"
          />
          <Metric
            icon={AlertTriangle}
            label="Overdue"
            value={metrics.overdue}
            tone="text-red-700"
          />
          <Metric icon={CheckCircle2} label="Avg. resolution" value="—" />
        </section>
        <nav className="flex overflow-x-auto rounded-xl border border-[#dbe4ee] bg-white p-1">
          {tabs.map(([key, title]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold ${tab === key ? "bg-[#0f2743] text-white" : "text-[#60758b]"}`}
            >
              {title}
            </button>
          ))}
        </nav>
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-[#142132]">
              Needs attention
            </h2>
            {loading ? (
              <div className="grid min-h-64 place-items-center rounded-xl border bg-white">
                <Loader2 className="animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                {rows.map((item) => (
                  <IssueCard
                    key={item.request_id}
                    item={item}
                    busy={busy === item.request_id}
                    onAcknowledge={acknowledge}
                  />
                ))}
                {!rows.length ? (
                  <p className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-[#60758b]">
                    No issues in this view.
                  </p>
                ) : null}
              </div>
            )}
          </section>
          <aside className="space-y-4">
            <section className="rounded-[16px] border border-[#e1e8f0] bg-white p-4">
              <h2 className="font-semibold text-[#142132]">Live triage</h2>
              <p className="mt-3 text-3xl font-semibold">{metrics.open}</p>
              <p className="text-sm text-[#60758b]">open maintenance issues</p>
              <div className="mt-4 space-y-2 text-sm">
                <p className="flex justify-between">
                  <span>Urgent</span>
                  <b>{metrics.urgent}</b>
                </p>
                <p className="flex justify-between">
                  <span>Overdue</span>
                  <b>{metrics.overdue}</b>
                </p>
              </div>
            </section>
            <section className="rounded-[16px] border border-[#e1e8f0] bg-white p-4">
              <h2 className="font-semibold text-[#142132]">SLA at risk</h2>
              {queue
                .filter((item) => item.sla_breached)
                .slice(0, 4)
                .map((item) => (
                  <p
                    key={item.request_id}
                    className="mt-3 border-l-2 border-red-500 pl-3 text-sm"
                  >
                    <b>{label(item.category)} issue</b>
                    <br />
                    <span className="text-xs text-red-700">SLA breached</span>
                  </p>
                ))}
              {!metrics.overdue ? (
                <p className="mt-3 text-sm text-[#60758b]">
                  No overdue issues.
                </p>
              ) : null}
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}
