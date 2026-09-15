import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Filter,
  Loader2,
  Play,
  Plus,
  Search,
} from "lucide-react";
import {
  listRentalInspectionSchedules,
  startRentalInspection,
} from "../../services/rentals/rentalInspectionRepository.js";

const DAY = 86400000;
const label = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
const dateOf = (item) => new Date(item.scheduled_for);
const complete = (item) => ["completed", "cancelled"].includes(item.status);
const typeOf = (item) =>
  item.rental_inspection_templates?.inspection_type || "routine";
const today = () => new Date().toISOString().slice(0, 10);
const ref = (item) =>
  `IN-${
    String(item.id || "")
      .slice(0, 6)
      .toUpperCase() || "PENDING"
  }`;
const when = (item) =>
  Number.isNaN(dateOf(item).getTime())
    ? "Not scheduled"
    : dateOf(item).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      });

function Metric({ icon, value, label: title, tone = "text-[#142132]" }) {
  return (
    <article className="rounded-2xl border border-[#e1e8f0] bg-white p-4">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef8f3] text-[#087a55]">
        {createElement(icon, { size: 20 })}
      </span>
      <p className={`mt-3 text-2xl font-semibold ${tone}`}>{value}</p>
      <p className="mt-1 text-xs text-[#60758b]">{title}</p>
    </article>
  );
}
function Badge({ children, tone = "slate" }) {
  const colors = {
    slate: "bg-[#f3f7fb] text-[#46617b]",
    green: "bg-[#eaf8f0] text-[#087a55]",
    amber: "bg-[#fff6e5] text-[#a96000]",
    red: "bg-[#fff0f1] text-[#c5253c]",
    blue: "bg-[#edf5ff] text-[#1769d1]",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${colors[tone]}`}
    >
      {children}
    </span>
  );
}
function AttentionCard({ item, busy, onStart }) {
  const overdue = dateOf(item).toISOString().slice(0, 10) < today();
  const active = item.status === "in_progress";
  return (
    <article className="w-[330px] shrink-0 snap-start overflow-hidden rounded-2xl border border-[#e1e8f0] bg-white shadow-[0_8px_18px_rgba(15,23,42,.04)]">
      <div className="flex h-24 items-start justify-between bg-gradient-to-br from-[#e7f0f9] to-[#f5f8fb] p-3">
        <Badge tone={overdue ? "red" : active ? "blue" : "amber"}>
          {overdue ? "Overdue" : active ? "In progress" : "Ready to begin"}
        </Badge>
        <ClipboardCheck size={22} className="text-[#1769d1]" />
      </div>
      <div className="p-4">
        <p className="text-xs font-semibold text-[#60758b]">
          {label(typeOf(item))} · {ref(item)}
        </p>
        <h3 className="mt-1 font-semibold text-[#142132]">
          {item.rental_inspection_templates?.name || "Property inspection"}
        </h3>
        <p className="mt-1 text-sm text-[#60758b]">
          Tenancy {String(item.tenancy_id || "pending").slice(0, 8)} ·{" "}
          {when(item)}
        </p>
        <p className="mt-3 border-t border-[#edf1f5] pt-3 text-sm text-[#46617b]">
          {active ? "Evidence capture in progress" : "Checklist ready to begin"}
        </p>
        {item.status === "scheduled" ? (
          <button
            disabled={busy}
            onClick={() => onStart(item.id)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#087a55] px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Play size={15} />
            Start inspection
          </button>
        ) : (
          <button className="mt-3 w-full rounded-lg border border-[#dbe4ee] px-3 py-2.5 text-sm font-semibold text-[#35546c]">
            View inspection
          </button>
        )}
      </div>
    </article>
  );
}

export default function RentalInspectionsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const rail = useRef(null);
  const selectedType = params.get("type") || "all";
  const query = params.get("q") || "";
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setSchedules(await listRentalInspectionSchedules());
    } catch (cause) {
      setError(cause?.message || "Unable to load inspections.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    setParams(next);
  };
  const rows = useMemo(
    () =>
      schedules.filter((item) => {
        const typeMatch =
          selectedType === "all" || selectedType === "completed"
            ? selectedType !== "completed" || complete(item)
            : typeOf(item) === selectedType;
        const haystack = [
          item.id,
          item.tenancy_id,
          item.assigned_to,
          item.status,
          item.rental_inspection_templates?.name,
          typeOf(item),
        ]
          .join(" ")
          .toLowerCase();
        return typeMatch && haystack.includes(query.toLowerCase());
      }),
    [schedules, selectedType, query],
  );
  const metrics = useMemo(() => {
    const now = new Date();
    const end = new Date(now.getTime() + 7 * DAY);
    return {
      upcoming: schedules.filter(
        (item) => !complete(item) && dateOf(item) > now,
      ).length,
      due: schedules.filter(
        (item) => !complete(item) && dateOf(item) >= now && dateOf(item) <= end,
      ).length,
      signoff: schedules.filter((item) => item.status === "awaiting_sign_off")
        .length,
      findings: schedules.filter((item) => item.status === "requires_review")
        .length,
      done: schedules.filter(
        (item) =>
          complete(item) &&
          dateOf(item).getMonth() === now.getMonth() &&
          dateOf(item).getFullYear() === now.getFullYear(),
      ).length,
    };
  }, [schedules]);
  const attention = useMemo(
    () =>
      schedules
        .filter(
          (item) =>
            !complete(item) &&
            (item.status !== "scheduled" ||
              dateOf(item).toISOString().slice(0, 10) <= today()),
        )
        .slice(0, 8),
    [schedules],
  );
  const dayRows = useMemo(
    () =>
      schedules
        .filter((item) => dateOf(item).toISOString().slice(0, 10) === today())
        .slice(0, 4),
    [schedules],
  );
  const start = async (id) => {
    try {
      setBusy(id);
      const result = await startRentalInspection(id);
      if (result?.inspection_id)
        navigate(`/agent/rentals/inspections/${result.inspection_id}`);
      else await load();
    } catch (cause) {
      setError(cause?.message || "Unable to start inspection.");
    } finally {
      setBusy("");
    }
  };
  const tabs = [
    ["all", "All inspections"],
    ["incoming", "Incoming"],
    ["routine", "Routine"],
    ["outgoing", "Outgoing"],
    ["ad_hoc", "Ad-hoc"],
    ["completed", "Completed"],
  ];
  return (
    <main className="mx-auto w-full max-w-[1600px] px-3 py-3 sm:px-5 lg:px-7">
      <section className="space-y-4 pb-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#142132]">
              Inspections
            </h1>
            <p className="mt-1 text-sm text-[#60758b]">
              Schedule inspections, capture condition evidence and resolve every
              finding.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex h-10 min-w-64 items-center gap-2 rounded-xl border border-[#dbe4ee] bg-white px-3">
              <Search size={15} className="text-[#7b8ca2]" />
              <input
                value={query}
                onChange={(event) => update({ q: event.target.value })}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none"
                placeholder="Search inspections or tenancies"
              />
            </label>
            <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#dbe4ee] bg-white px-3 text-sm font-semibold text-[#35546c]">
              <Filter size={15} />
              Filters
            </button>
            <button
              title="Schedule inspection using an Inspection template"
              onClick={() => update({ schedule: "new" })}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#087a55] px-4 text-sm font-semibold text-white"
            >
              <Plus size={16} />
              Schedule inspection
            </button>
          </div>
        </header>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            icon={CalendarDays}
            value={metrics.upcoming}
            label="Upcoming"
          />
          <Metric
            icon={Clock3}
            value={metrics.due}
            label="Due this week"
            tone="text-[#1769d1]"
          />
          <Metric
            icon={ClipboardCheck}
            value={metrics.signoff}
            label="Awaiting sign-off"
            tone="text-amber-700"
          />
          <Metric
            icon={AlertTriangle}
            value={metrics.findings}
            label="Findings open"
            tone="text-red-700"
          />
          <Metric
            icon={CheckCircle2}
            value={metrics.done}
            label="Completed this month"
          />
        </section>
        <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#dbe4ee] bg-white p-1">
          <nav className="flex max-w-full overflow-x-auto">
            {tabs.map(([key, text]) => (
              <button
                key={key}
                onClick={() => update({ type: key === "all" ? "" : key })}
                className={`shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold ${selectedType === key ? "bg-[#0f2743] text-white" : "text-[#60758b]"}`}
              >
                {text}
              </button>
            ))}
          </nav>
          <div className="flex gap-1">
            <button className="rounded-lg border border-[#dbe4ee] px-3 py-2 text-sm font-semibold text-[#35546c]">
              All properties
            </button>
            <button className="rounded-lg border border-[#dbe4ee] px-3 py-2 text-sm font-semibold text-[#35546c]">
              Calendar
            </button>
            <button className="rounded-lg bg-[#eaf8f0] px-3 py-2 text-sm font-semibold text-[#087a55]">
              List
            </button>
          </div>
        </section>
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-w-0 rounded-2xl border border-[#e1e8f0] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#142132]">
                Needs attention{" "}
                <span className="ml-2 text-sm font-normal text-[#60758b]">
                  {attention.length} items
                </span>
              </h2>
              <div className="flex gap-1">
                <button
                  onClick={() =>
                    rail.current?.scrollBy({ left: -350, behavior: "smooth" })
                  }
                  className="grid h-8 w-8 place-items-center rounded-full border border-[#dbe4ee]"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() =>
                    rail.current?.scrollBy({ left: 350, behavior: "smooth" })
                  }
                  className="grid h-8 w-8 place-items-center rounded-full border border-[#dbe4ee]"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
            {loading ? (
              <div className="grid min-h-60 place-items-center">
                <Loader2 className="animate-spin" />
              </div>
            ) : attention.length ? (
              <div
                ref={rail}
                className="flex snap-x gap-3 overflow-x-auto pb-1"
              >
                {attention.map((item) => (
                  <AttentionCard
                    key={item.id}
                    item={item}
                    busy={busy === item.id}
                    onStart={start}
                  />
                ))}
              </div>
            ) : (
              <p className="grid min-h-48 place-items-center rounded-xl border border-dashed text-sm text-[#60758b]">
                No inspections need attention.
              </p>
            )}
          </section>
          <aside className="space-y-4">
            <section className="rounded-2xl border border-[#e1e8f0] bg-white p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-[#142132]">Today</h2>
                <button className="text-sm font-semibold text-[#087a55]">
                  Open calendar
                </button>
              </div>
              <div className="mt-3 divide-y">
                {dayRows.map((item) => (
                  <button
                    key={item.id}
                    onClick={() =>
                      item.status === "scheduled" && void start(item.id)
                    }
                    className="flex w-full items-center justify-between gap-3 py-3 text-left"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#142132]">
                        {label(typeOf(item))} inspection
                      </p>
                      <p className="mt-1 text-xs text-[#60758b]">
                        Tenancy{" "}
                        {String(item.tenancy_id || "pending").slice(0, 8)} ·{" "}
                        {when(item)}
                      </p>
                    </div>
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-[#eef4f9] text-xs font-semibold text-[#35546c]">
                      {String(item.assigned_to || "—")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                  </button>
                ))}
                {!dayRows.length ? (
                  <p className="py-4 text-sm text-[#60758b]">
                    No inspections scheduled today.
                  </p>
                ) : null}
              </div>
            </section>
            <section className="rounded-2xl border border-[#e1e8f0] bg-white p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-[#142132]">
                  Findings requiring action
                </h2>
                <button className="text-sm font-semibold text-[#087a55]">
                  View all
                </button>
              </div>
              <p className="mt-3 text-sm text-[#60758b]">
                Findings will appear here when inspection evidence is marked for
                review.
              </p>
            </section>
          </aside>
        </section>
        <section
          aria-label="Inspection queue"
          className="overflow-hidden rounded-2xl border border-[#e1e8f0] bg-white"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e9eef3] p-4">
            <div>
              <h2 className="text-lg font-semibold text-[#142132]">
                Inspection register
              </h2>
              <p className="mt-1 text-sm text-[#60758b]">
                All scheduled and completed property inspections
              </p>
            </div>
            <span className="text-sm font-semibold text-[#60758b]">
              {rows.length} inspections
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-[#f8fafc] text-xs uppercase tracking-wide text-[#60758b]">
                <tr>
                  <th className="px-4 py-3">Inspection</th>
                  <th className="px-4 py-3">Property / tenancy</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Inspector</th>
                  <th className="px-4 py-3">Scheduled</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-[#edf1f5] text-[#35546c]"
                  >
                    <td className="px-4 py-3 font-semibold text-[#1769d1]">
                      {ref(item)}
                    </td>
                    <td className="px-4 py-3">
                      Tenancy {String(item.tenancy_id || "pending").slice(0, 8)}
                    </td>
                    <td className="px-4 py-3">{label(typeOf(item))}</td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          complete(item)
                            ? "green"
                            : item.status === "in_progress"
                              ? "blue"
                              : "slate"
                        }
                      >
                        {label(item.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {String(item.assigned_to || "Unassigned").slice(0, 16)}
                    </td>
                    <td className="px-4 py-3">{when(item)}</td>
                    <td className="px-4 py-3">
                      {item.status === "scheduled" ? (
                        <button
                          onClick={() => void start(item.id)}
                          disabled={busy === item.id}
                          className="font-semibold text-[#087a55]"
                        >
                          Start
                        </button>
                      ) : (
                        <span className="text-[#60758b]">View</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!loading && !rows.length ? (
                  <tr>
                    <td
                      colSpan="7"
                      className="px-4 py-10 text-center text-[#60758b]"
                    >
                      No inspections match this view.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
