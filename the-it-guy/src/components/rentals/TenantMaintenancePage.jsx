import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

const title = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
const date = (value, withTime = false) =>
  value
    ? new Date(value).toLocaleDateString("en-ZA", {
        day: "numeric",
        month: "short",
        year: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
      })
    : "Not available";
const open = (request) =>
  !["resolved", "closed", "cancelled", "completed"].includes(
    String(request.status || "").toLowerCase(),
  );
const tenantStatus = (request) =>
  ({
    submitted: "Submitted",
    acknowledged: "Under review",
    triaged: "Under review",
    assigned:
      request.assignment?.status === "in_progress"
        ? "In progress"
        : "Contractor assigned",
    resolved: "Completed",
    cancelled: "Cancelled",
  })[request.status] || title(request.status);

function Card({ children, className = "" }) {
  return (
    <section
      className={`rounded-[16px] border border-[#e5e7eb] bg-white p-4 shadow-[0_6px_18px_rgba(15,23,42,.045)] sm:p-5 ${className}`}
    >
      {children}
    </section>
  );
}
function Heading({ icon: Icon, children, action }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[color-mix(in_srgb,var(--tenant-accent)_18%,white)] text-[var(--tenant-primary)]">
          <Icon size={18} />
        </span>
        <h2 className="text-base font-semibold tracking-[-.025em] text-[#15231e]">
          {children}
        </h2>
      </div>
      {action}
    </div>
  );
}
function Status({ children, tone = "green" }) {
  const classes =
    tone === "amber"
      ? "bg-[#fff4df] text-[#925a0d]"
      : tone === "red"
        ? "bg-[#fff0ee] text-[#aa392d]"
        : "bg-[color-mix(in_srgb,var(--tenant-accent)_20%,white)] text-[var(--tenant-primary)]";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${classes}`}
    >
      {children}
    </span>
  );
}

function ReportIssueFlow({ onClose, onSubmit, saving }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    category: "plumbing",
    title: "",
    area: "",
    description: "",
    priority: "routine",
    accessPreference: "Please contact me before attending",
    availability: "",
  });
  const emergency = ["emergency", "urgent"].includes(form.priority);
  const update = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  const valid =
    step === 1
      ? form.title.trim().length >= 3 && form.description.trim().length >= 10
      : true;
  const submit = async () => {
    await onSubmit(form);
    onClose();
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-issue-title"
      className="fixed inset-0 z-50 grid place-items-end bg-[#071e1a]/45 p-0 sm:place-items-center sm:p-5"
    >
      <section className="w-full max-w-xl rounded-t-[20px] bg-white p-5 shadow-2xl sm:rounded-[20px] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#66716a]">
              Report an issue
            </p>
            <h2
              id="report-issue-title"
              className="mt-1 text-2xl font-semibold tracking-[-.04em] text-[#15231e]"
            >
              Tell us what’s happening
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close report issue"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full border border-[#e5e7eb] text-[#344054]"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-[#67716b]">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--tenant-primary)] text-white">
            {step}
          </span>
          <span>{step === 1 ? "Issue details" : "Access & review"}</span>
        </div>
        {step === 1 ? (
          <div className="mt-5 grid gap-4">
            <label className="text-sm font-semibold text-[#28352e]">
              What needs attention?
              <input
                value={form.title}
                onChange={update("title")}
                maxLength={160}
                className="mt-1.5 min-h-11 w-full rounded-lg border border-[#dfe4e1] px-3 text-sm font-normal"
                placeholder="For example, leaking kitchen tap"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-[#28352e]">
                Category
                <select
                  value={form.category}
                  onChange={update("category")}
                  className="mt-1.5 min-h-11 w-full rounded-lg border border-[#dfe4e1] bg-white px-3 text-sm font-normal"
                >
                  {[
                    "plumbing",
                    "electrical",
                    "appliance",
                    "security",
                    "structural",
                    "pest",
                    "cleaning",
                    "other",
                  ].map((value) => (
                    <option key={value} value={value}>
                      {title(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-[#28352e]">
                Area or room
                <input
                  value={form.area}
                  onChange={update("area")}
                  maxLength={160}
                  className="mt-1.5 min-h-11 w-full rounded-lg border border-[#dfe4e1] px-3 text-sm font-normal"
                  placeholder="Kitchen"
                />
              </label>
            </div>
            <label className="text-sm font-semibold text-[#28352e]">
              Describe the issue
              <textarea
                value={form.description}
                onChange={update("description")}
                minLength={10}
                maxLength={4000}
                rows={4}
                className="mt-1.5 w-full rounded-lg border border-[#dfe4e1] p-3 text-sm font-normal"
                placeholder="Tell us what you noticed and when it started."
              />
            </label>
            <label className="text-sm font-semibold text-[#28352e]">
              Urgency
              <select
                value={form.priority}
                onChange={update("priority")}
                className="mt-1.5 min-h-11 w-full rounded-lg border border-[#dfe4e1] bg-white px-3 text-sm font-normal"
              >
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="emergency">Emergency</option>
              </select>
            </label>
          </div>
        ) : (
          <div className="mt-5 grid gap-4">
            <label className="text-sm font-semibold text-[#28352e]">
              Access preference
              <textarea
                value={form.accessPreference}
                onChange={update("accessPreference")}
                maxLength={500}
                rows={2}
                className="mt-1.5 w-full rounded-lg border border-[#dfe4e1] p-3 text-sm font-normal"
              />
            </label>
            <label className="text-sm font-semibold text-[#28352e]">
              Preferred availability (optional)
              <input
                value={form.availability}
                onChange={update("availability")}
                maxLength={1000}
                className="mt-1.5 min-h-11 w-full rounded-lg border border-[#dfe4e1] px-3 text-sm font-normal"
                placeholder="Weekdays after 15:00"
              />
            </label>
            <div className="rounded-xl bg-[#faf5eb] p-3 text-sm text-[#674510]">
              <strong>For emergencies:</strong> fire, gas leaks, serious
              flooding or an immediate security risk require emergency services
              first. This request does not replace emergency services.
            </div>
          </div>
        )}
        {emergency ? (
          <p className="mt-4 rounded-xl bg-[#fff0ee] p-3 text-sm text-[#8f3428]">
            If there is immediate danger, contact emergency services first.
            We’ll also mark this for urgent team triage.
          </p>
        ) : null}
        <div className="mt-6 flex justify-between gap-3">
          <button
            type="button"
            onClick={step === 1 ? onClose : () => setStep(1)}
            className="min-h-11 rounded-lg border border-[#dfe4e1] px-4 text-sm font-semibold text-[#28352e]"
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step === 1 ? (
            <button
              type="button"
              disabled={!valid}
              onClick={() => setStep(2)}
              className="min-h-11 rounded-lg bg-[var(--tenant-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit()}
              className="min-h-11 rounded-lg bg-[var(--tenant-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Sending…" : "Submit request"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

export default function TenantMaintenancePage({
  data = {},
  onSubmit,
  onNavigate,
  saving = false,
}) {
  const [reporting, setReporting] = useState(false);
  const requests = data.maintenanceRequests || [];
  const openRequests = useMemo(() => requests.filter(open), [requests]);
  const featured = openRequests[0] || null;
  const scheduled = openRequests.find((request) => request.assignment) || null;
  const themeStyle = {
    "--tenant-primary": data.branding?.primaryColour || "#071E1A",
    "--tenant-accent": data.branding?.accentColour || "#64B992",
  };
  const submit = async (form) => {
    await onSubmit(form);
    setReporting(false);
  };
  return (
    <div
      style={themeStyle}
      className="mx-auto max-w-[1440px] space-y-4 pb-3 sm:space-y-5"
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(260px,.65fr)_minmax(260px,.65fr)]">
        {featured ? (
          <Card className="bg-[color-mix(in_srgb,var(--tenant-accent)_13%,white)]">
            <Heading icon={Wrench}>Active request</Heading>
            <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold tracking-[-.03em] text-[#15231e]">
                  {featured.description.split("\n")[0]}
                </h2>
                <p className="mt-1 text-sm text-[#64716a]">
                  Request #{featured.id.slice(0, 8).toUpperCase()}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Status
                    tone={
                      featured.priority === "emergency"
                        ? "red"
                        : featured.status === "submitted"
                          ? "amber"
                          : "green"
                    }
                  >
                    {tenantStatus(featured)}
                  </Status>
                  {featured.assignment?.assignee_name ? (
                    <span className="text-sm font-medium text-[#35483d]">
                      {featured.assignment.assignee_name}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-6 text-[#53645a]">
                  {featured.description.split("\n").slice(1).join(" ").trim() ||
                    "Your team has received the details."}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById(`maintenance-${featured.id}`)
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-[var(--tenant-primary)] px-3 text-sm font-semibold text-[var(--tenant-primary)]"
              >
                View request <ChevronRight size={16} />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-black/10 pt-4 text-center text-xs">
              <span className="font-semibold text-[var(--tenant-primary)]">
                Submitted
              </span>
              <span
                className={
                  featured.assignment
                    ? "font-semibold text-[var(--tenant-primary)]"
                    : "text-[#7a837d]"
                }
              >
                {featured.assignment ? "Contractor assigned" : "Under review"}
              </span>
              <span
                className={
                  featured.status === "resolved"
                    ? "font-semibold text-[var(--tenant-primary)]"
                    : "text-[#7a837d]"
                }
              >
                Completed
              </span>
            </div>
          </Card>
        ) : (
          <Card className="xl:col-span-1">
            <Heading icon={CheckCircle2}>Everything looks good</Heading>
            <p className="mt-4 text-sm leading-6 text-[#607166]">
              You don’t have any open maintenance requests.
            </p>
            <button
              type="button"
              onClick={() => setReporting(true)}
              className="mt-4 min-h-10 rounded-lg bg-[var(--tenant-primary)] px-4 text-sm font-semibold text-white"
            >
              Report an issue
            </button>
          </Card>
        )}
        <Card>
          <Heading icon={CalendarDays}>Upcoming visit</Heading>
          {scheduled?.assignment ? (
            <div className="mt-4">
              <p className="text-lg font-semibold text-[#17241d]">
                Contractor assigned
              </p>
              <p className="mt-2 text-sm text-[#607166]">
                {scheduled.assignment.assignee_name}
              </p>
              <p className="mt-3 text-sm text-[#607166]">
                Your rental team will confirm the appointment time here.
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-[#607166]">
              No contractor visit is scheduled.
            </p>
          )}
        </Card>
        <Card>
          <Heading icon={CircleHelp}>Quick help</Heading>
          <div className="mt-4 grid divide-y divide-[#edf0ee]">
            <button
              type="button"
              onClick={() => setReporting(true)}
              className="flex min-h-12 items-center justify-between text-left text-sm font-semibold text-[#28352e]"
            >
              Report an issue <ChevronRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => onNavigate("messages")}
              className="flex min-h-12 items-center justify-between text-left text-sm font-semibold text-[#28352e]"
            >
              Message team <ChevronRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => onNavigate("support")}
              className="flex min-h-12 items-center justify-between text-left text-sm font-semibold text-[#9a5a0b]"
            >
              Emergency help <ChevronRight size={16} />
            </button>
          </div>
        </Card>
      </div>
      <Card>
        <Heading icon={ClipboardList}>Your requests</Heading>
        {requests.length ? (
          <div className="mt-4 divide-y divide-[#edf0ee]">
            {requests.map((request) => (
              <article
                id={`maintenance-${request.id}`}
                key={request.id}
                className="py-4 first:pt-0"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-[#19271f]">
                      {request.description.split("\n")[0] ||
                        title(request.category)}
                    </h3>
                    <p className="mt-1 text-sm text-[#64716a]">
                      {request.tenant_area || title(request.category)} ·
                      submitted {date(request.reported_at)}
                    </p>
                  </div>
                  <Status
                    tone={
                      request.priority === "emergency"
                        ? "red"
                        : request.status === "submitted"
                          ? "amber"
                          : "green"
                    }
                  >
                    {tenantStatus(request)}
                  </Status>
                </div>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-[#59665f]">
                  {request.description.split("\n").slice(1).join(" ").trim()}
                </p>
                {request.events?.length ? (
                  <div className="mt-3 border-l-2 border-[color-mix(in_srgb,var(--tenant-accent)_45%,white)] pl-3">
                    {request.events.map((event) => (
                      <p
                        key={event.id || event.created_at}
                        className="mb-2 text-sm text-[#56635b]"
                      >
                        <strong className="text-[#26352c]">
                          {event.tenant_visible_status ||
                            title(event.event_type)}
                        </strong>{" "}
                        · {event.tenant_message || date(event.created_at, true)}
                      </p>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-[#607166]">
            Your request history will appear here once you submit an issue.
          </p>
        )}
      </Card>
      <section className="flex flex-col justify-between gap-3 rounded-[14px] border border-[#f0ddba] bg-[#fffaf0] px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 shrink-0 text-[#a76610]" size={20} />
          <div>
            <p className="font-semibold text-[#513510]">
              Is this an emergency?
            </p>
            <p className="mt-1 text-sm text-[#725b3d]">
              For fire, serious flooding, gas leaks or immediate security risks,
              contact emergency services first.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("support")}
          className="min-h-10 rounded-lg border border-[#a77935] px-4 text-sm font-semibold text-[#674510]"
        >
          View emergency contacts
        </button>
      </section>
      {reporting ? (
        <ReportIssueFlow
          onClose={() => setReporting(false)}
          onSubmit={submit}
          saving={false}
        />
      ) : null}
    </div>
  );
}
