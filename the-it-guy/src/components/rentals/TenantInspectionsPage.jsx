import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  MapPin,
  Search,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";

const label = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
const date = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-ZA", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Not available";
const status = (inspection) =>
  ({
    awaiting_tenant_confirmation: "Awaiting confirmation",
    tenant_confirmed: "Confirmed",
    reschedule_requested: "New time requested",
    scheduled: "Scheduled",
    completed: "Completed",
    report_available: "Report available",
    awaiting_signature: "Signature required",
    cancelled: "Cancelled",
  })[inspection.status] || label(inspection.status);
const tone = (inspection) =>
  [
    "awaiting_tenant_confirmation",
    "reschedule_requested",
    "awaiting_signature",
  ].includes(inspection.status)
    ? "bg-[#fff4df] text-[#925a0d]"
    : inspection.status === "cancelled"
      ? "bg-[#f4f4f3] text-[#68716b]"
      : "bg-[color-mix(in_srgb,var(--tenant-accent)_20%,white)] text-[var(--tenant-primary)]";
function Card({ children, className = "" }) {
  return (
    <section
      className={`rounded-[16px] border border-[#e5e7eb] bg-white p-4 shadow-[0_6px_18px_rgba(15,23,42,.045)] sm:p-5 ${className}`}
    >
      {children}
    </section>
  );
}
function Heading({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-[color-mix(in_srgb,var(--tenant-accent)_18%,white)] text-[var(--tenant-primary)]">
        <Icon size={18} />
      </span>
      <h2 className="text-base font-semibold tracking-[-.025em] text-[#15231e]">
        {children}
      </h2>
    </div>
  );
}

export default function TenantInspectionsPage({
  data = {},
  onNavigate,
  demo = false,
}) {
  const [tab, setTab] = useState("all");
  const [expanded, setExpanded] = useState("");
  const [notice, setNotice] = useState("");
  const inspections = data.inspections || [];
  const visible = useMemo(
    () =>
      inspections.filter(
        (item) =>
          tab === "all" ||
          (tab === "upcoming"
            ? !["completed", "report_available", "cancelled"].includes(
                item.status,
              )
            : ["completed", "report_available"].includes(item.status)),
      ),
    [inspections, tab],
  );
  const upcoming = inspections.find(
    (item) =>
      !["completed", "report_available", "cancelled"].includes(item.status),
  );
  const themeStyle = {
    "--tenant-primary": data.branding?.primaryColour || "#071E1A",
    "--tenant-accent": data.branding?.accentColour || "#64B992",
  };
  const confirm = () =>
    setNotice(
      demo
        ? "Inspection confirmed in this demo. We’ll see you on 24 September between 10:00 and 11:00."
        : "Inspection confirmation will be available when tenant inspection actions are connected.",
    );
  return (
    <div
      style={themeStyle}
      className="mx-auto max-w-[1440px] space-y-4 pb-3 sm:space-y-5"
    >
      {upcoming ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(260px,.6fr)_minmax(260px,.6fr)]">
          <Card className="bg-[color-mix(in_srgb,var(--tenant-accent)_13%,white)]">
            <Heading icon={CalendarDays}>Upcoming inspection</Heading>
            <div className="mt-5 flex flex-col gap-4 sm:flex-row">
              <div className="grid h-28 w-28 shrink-0 place-items-center rounded-xl bg-white text-center shadow-sm">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.13em] text-[var(--tenant-primary)]">
                    {new Date(upcoming.startsAt).toLocaleDateString("en-ZA", {
                      month: "short",
                    })}
                  </p>
                  <p className="mt-1 text-4xl font-semibold tracking-[-.05em] text-[#16261c]">
                    {new Date(upcoming.startsAt).getDate()}
                  </p>
                  <p className="mt-1 text-xs text-[#5e6a62]">
                    {new Date(upcoming.startsAt).toLocaleDateString("en-ZA", {
                      weekday: "short",
                    })}
                  </p>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold tracking-[-.035em] text-[#16261c]">
                  {upcoming.title}
                </h2>
                <div className="mt-3 grid gap-1.5 text-sm text-[#435249]">
                  <span className="flex items-center gap-2">
                    <CalendarDays size={15} />
                    {date(upcoming.startsAt)}
                  </span>
                  <span className="flex items-center gap-2">
                    <Clock3 size={15} />
                    {upcoming.time}
                  </span>
                  <span className="flex items-center gap-2">
                    <MapPin size={15} />
                    {upcoming.inspector || "Rental team"}
                  </span>
                </div>
                <div className="mt-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone(upcoming)}`}
                  >
                    {status(upcoming)}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={confirm}
                    className="min-h-10 rounded-lg bg-[var(--tenant-primary)] px-4 text-sm font-semibold text-white"
                  >
                    Confirm inspection
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setNotice(
                        demo
                          ? "Your preferred time request has been recorded in this demo."
                          : "Rescheduling will be available when tenant inspection actions are connected.",
                      )
                    }
                    className="min-h-10 rounded-lg border border-[var(--tenant-primary)] px-4 text-sm font-semibold text-[var(--tenant-primary)]"
                  >
                    Request another time
                  </button>
                </div>
                <p className="mt-4 text-sm text-[#5c695f]">
                  The inspection usually takes{" "}
                  {upcoming.duration || "30–45 minutes"}.
                </p>
              </div>
            </div>
          </Card>
          <Card>
            <Heading icon={FileText}>How to prepare</Heading>
            <ul className="mt-4 grid gap-3 text-sm text-[#34443a]">
              {[
                "Make sure all rooms are accessible",
                "Have maintenance concerns ready",
                "Secure pets during the visit",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <CheckCircle2
                    className="shrink-0 text-[var(--tenant-primary)]"
                    size={18}
                  />
                  {item}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() =>
                setNotice(
                  "The inspection guide will be available here once your rental team publishes it.",
                )
              }
              className="mt-5 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[var(--tenant-primary)] underline underline-offset-4"
            >
              View inspection guide <ChevronRight size={16} />
            </button>
          </Card>
          <Card>
            <Heading icon={Wrench}>Property access</Heading>
            <div className="mt-4 rounded-xl bg-[color-mix(in_srgb,var(--tenant-accent)_12%,white)] p-3">
              <p className="text-sm font-semibold text-[#203228]">
                I’ll be home
              </p>
              <p className="mt-1 text-xs text-[#5f6d63]">
                Access preference awaiting confirmation
              </p>
            </div>
            <button
              type="button"
              onClick={confirm}
              className="mt-4 min-h-10 w-full rounded-lg bg-[var(--tenant-primary)] px-4 text-sm font-semibold text-white"
            >
              Confirm access
            </button>
            <button
              type="button"
              onClick={() =>
                setNotice(
                  "Access instructions will be available when tenant inspection actions are connected.",
                )
              }
              className="mt-2 min-h-10 w-full text-sm font-semibold text-[var(--tenant-primary)]"
            >
              Update instructions
            </button>
          </Card>
        </div>
      ) : (
        <Card>
          <Heading icon={CalendarDays}>No upcoming inspections</Heading>
          <p className="mt-4 text-sm text-[#607166]">
            You don’t currently have an inspection scheduled.
          </p>
        </Card>
      )}
      <Card>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <Heading icon={FileText}>Inspection history</Heading>
          <div className="flex flex-wrap gap-2">
            <div className="inline-flex rounded-lg border border-[#e2e6e3] p-1">
              {[
                ["all", "All"],
                ["upcoming", "Upcoming"],
                ["completed", "Completed"],
              ].map(([key, name]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`min-h-9 rounded-md px-3 text-sm font-semibold ${tab === key ? "bg-[var(--tenant-primary)] text-white" : "text-[#5d685f]"}`}
                >
                  {name}{" "}
                  {key === "all"
                    ? inspections.length
                    : key === "upcoming"
                      ? inspections.filter(
                          (item) =>
                            ![
                              "completed",
                              "report_available",
                              "cancelled",
                            ].includes(item.status),
                        ).length
                      : inspections.filter((item) =>
                          ["completed", "report_available"].includes(
                            item.status,
                          ),
                        ).length}
                </button>
              ))}
            </div>
            <label className="flex min-h-10 items-center gap-2 rounded-lg border border-[#e2e6e3] px-3 text-sm text-[#68716b]">
              <Search size={16} />
              <input
                className="w-28 border-0 p-0 outline-none"
                placeholder="Search"
              />
            </label>
          </div>
        </div>
        <div className="mt-4 divide-y divide-[#edf0ee]">
          {visible.map((inspection) => (
            <article key={inspection.id} className="py-4 first:pt-0">
              <button
                type="button"
                onClick={() =>
                  setExpanded(expanded === inspection.id ? "" : inspection.id)
                }
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div>
                  <p className="font-semibold text-[#19271f]">
                    {inspection.title}
                  </p>
                  <p className="mt-1 text-sm text-[#64716a]">
                    {date(inspection.startsAt)} ·{" "}
                    {inspection.inspector || "Rental team"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone(inspection)}`}
                  >
                    {status(inspection)}
                  </span>
                  <ChevronDown
                    className={
                      expanded === inspection.id
                        ? "rotate-180 transition"
                        : "transition"
                    }
                    size={18}
                  />
                </div>
              </button>
              {expanded === inspection.id ? (
                <div className="mt-4 grid gap-4 rounded-xl bg-[#fafafa] p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div>
                    <p className="font-semibold text-[#25332b]">
                      {inspection.status === "completed"
                        ? "Inspection completed"
                        : "Inspection summary"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#5c695f]">
                      {inspection.summary ||
                        "Your inspection details will appear here once the rental team has published them."}
                    </p>
                    {inspection.reportAvailable ? (
                      <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-[var(--tenant-primary)]">
                        <FileText size={16} />
                        Report available
                      </p>
                    ) : (
                      <p className="mt-3 text-sm text-[#68716b]">
                        Report being prepared
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 sm:flex-col">
                    <button
                      type="button"
                      onClick={() =>
                        setNotice(
                          inspection.reportAvailable
                            ? "A secure report viewer will open here when report delivery is connected."
                            : "This report is not available yet.",
                        )
                      }
                      className="min-h-10 rounded-lg border border-[var(--tenant-primary)] px-3 text-sm font-semibold text-[var(--tenant-primary)]"
                    >
                      {inspection.reportAvailable
                        ? "View report"
                        : "View inspection"}
                    </button>
                    {inspection.reportAvailable ? (
                      <button
                        type="button"
                        onClick={() =>
                          setNotice(
                            "Secure PDF downloads will be enabled once final reports are connected.",
                          )
                        }
                        className="min-h-10 rounded-lg bg-[var(--tenant-primary)] px-3 text-sm font-semibold text-white"
                      >
                        Download PDF
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </article>
          ))}
          {!visible.length ? (
            <p className="py-5 text-sm text-[#607166]">
              No inspections match this view.
            </p>
          ) : null}
        </div>
      </Card>
      <section className="flex flex-col justify-between gap-3 rounded-[14px] border border-[#f0ddba] bg-[#fffaf0] px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex gap-3">
          <CircleHelp className="mt-0.5 shrink-0 text-[#a76610]" size={20} />
          <div>
            <p className="font-semibold text-[#513510]">
              Something changed since your last inspection?
            </p>
            <p className="mt-1 text-sm text-[#725b3d]">
              Report maintenance issues separately so your rental team can
              respond sooner.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("maintenance")}
          className="min-h-10 rounded-lg bg-[var(--tenant-primary)] px-4 text-sm font-semibold text-white"
        >
          Report an issue
        </button>
      </section>
      {notice ? (
        <p
          role="status"
          className="rounded-xl border border-[#dce9df] bg-white p-3 text-sm text-[#334a3d]"
        >
          {notice}
        </p>
      ) : null}
    </div>
  );
}
