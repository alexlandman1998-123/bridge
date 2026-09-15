import {
  ArrowLeft,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  Home,
  Landmark,
  Loader2,
  Mail,
  MoreHorizontal,
  Phone,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react";
import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useParams } from "react-router-dom";
import { useWorkspace } from "../../context/WorkspaceContext";
import { RentalLandlordMandatePanel } from "../../modules/rentals/shared/landlords/RentalLandlordMandatePanel.jsx";
import { listPersistedRentalTenancies } from "../../services/rentals/rentalApplicationRepository.js";
import {
  listRentalActivityProjections,
  listRentalDocumentLinks,
} from "../../services/rentals/rentalEvidenceRepository.js";
import {
  listRentalPropertyMandates,
  listRentalPropertyOwners,
} from "../../services/rentals/rentalLandlordMandateRepository.js";
import { getRentalMaintenanceQueue } from "../../services/rentals/rentalMaintenanceRepository.js";
import { getRentalProperty } from "../../services/rentals/rentalPropertyRepository.js";
import { listRentalUnits } from "../../services/rentals/rentalUnitRepository.js";

const tabs = [
  ["overview", "Overview"],
  ["landlord", "Landlord"],
  ["tenancy", "Tenancy"],
  ["financials", "Financials"],
  ["maintenance", "Maintenance"],
  ["inspections", "Inspections"],
  ["documents", "Documents"],
  ["activity", "Activity"],
];
const title = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
const money = (value) =>
  Number(value) > 0
    ? `R ${Number(value).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`
    : "Not captured";
const date = (value) => {
  const parsed = value && new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return parsed && !Number.isNaN(parsed.getTime())
    ? new Intl.DateTimeFormat("en-ZA", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(parsed)
    : "Not captured";
};
const safe = (item, fallback = []) =>
  item.status === "fulfilled" ? item.value : fallback;
function tenantName(tenancy = {}) {
  const person = tenancy.tenant?.identity || tenancy.tenant || {};
  return (
    [person.firstName, person.lastName].filter(Boolean).join(" ") ||
    person.name ||
    "Tenant details pending"
  );
}
function leaseEnd(tenancy = {}) {
  const terms = tenancy.lease?.terms_json || {};
  if (terms.end_date) return new Date(`${terms.end_date}T00:00:00`);
  const start =
    tenancy.intendedOccupationDate ||
    terms.intended_occupation_date ||
    terms.start_date;
  const months = Number(terms.lease_term_months || 0);
  if (!start || !months) return null;
  const end = new Date(`${start}T00:00:00`);
  end.setMonth(end.getMonth() + months);
  return Number.isNaN(end.getTime()) ? null : end;
}
function Panel({
  title: heading,
  icon: Icon,
  action,
  children,
  className = "",
}) {
  return (
    <section
      className={`rounded-[16px] border border-[#dfe7f0] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,.035)] ${className}`}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[#142132]">
          {Icon ? <Icon size={18} className="text-[#1769d1]" /> : null}
          <h2 className="font-semibold">{heading}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
function Stat({
  icon: Icon,
  label,
  value,
  tone = "bg-[#f3f7fb] text-[#35546c]",
  to,
}) {
  return (
    <Link
      to={to}
      className="flex min-w-[160px] flex-1 items-center gap-3 rounded-xl border border-[#e1e8f0] bg-white px-3 py-3 transition hover:border-[#bdd6c9]"
    >
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${tone}`}>
        {createElement(Icon, { size: 18 })}
      </span>
      <span>
        <span className="block text-xs text-[#60758b]">{label}</span>
        <span className="mt-0.5 block text-sm font-semibold text-[#142132]">
          {value}
        </span>
      </span>
    </Link>
  );
}
function EmptyPanel({ title: heading, description, action }) {
  return (
    <Panel title={heading} icon={FileText}>
      {
        <>
          <p className="mt-4 rounded-xl border border-dashed border-[#dbe6f1] bg-[#fafcff] p-5 text-sm text-[#60758b]">
            {description}
          </p>
          {action ? <div className="mt-3">{action}</div> : null}
        </>
      }
    </Panel>
  );
}

export default function RentalPropertyDetailPage() {
  const workspace = useWorkspace();
  const { propertyId } = useParams();
  const location = useLocation();
  const [property, setProperty] = useState(null);
  const [data, setData] = useState({
    units: [],
    tenancies: [],
    owners: [],
    mandates: [],
    maintenance: [],
    documents: [],
    activity: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const basePath = `/agent/rentals/properties/${propertyId}`;
  const current =
    tabs.find(([id]) => location.pathname.endsWith(`/${id}`))?.[0] ||
    "overview";
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const next = await getRentalProperty(propertyId);
      if (!next) {
        setProperty(null);
        return;
      }
      setProperty(next);
      const rows = await Promise.allSettled([
        listRentalUnits({ propertyId: next.id, limit: 100 }),
        listPersistedRentalTenancies(next.organisationId),
        listRentalPropertyOwners(next.organisationId),
        listRentalPropertyMandates(next.id),
        getRentalMaintenanceQueue({ limit: 250 }),
        listRentalDocumentLinks({ propertyId: next.id, limit: 20 }),
        listRentalActivityProjections({ propertyId: next.id, limit: 12 }),
      ]);
      setData({
        units: safe(rows[0]),
        tenancies: safe(rows[1]).filter((item) => item.propertyId === next.id),
        owners: safe(rows[2]).filter((owner) =>
          owner.relationships.some((item) => item.propertyId === next.id),
        ),
        mandates: safe(rows[3]),
        maintenance: safe(rows[4]).filter(
          (item) => item.property_id === next.id,
        ),
        documents: safe(rows[5]),
        activity: safe(rows[6]),
      });
    } catch (cause) {
      setError(cause?.message || "Unable to load rental property.");
      setProperty(null);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);
  useEffect(() => {
    void load();
  }, [load]);
  const summary = useMemo(() => {
    const tenancy = data.tenancies.find((item) => item.status === "active");
    const unit = data.units.find((item) => item.id === tenancy?.unitId);
    const terms = tenancy?.lease?.terms_json || {};
    const end = tenancy ? leaseEnd(tenancy) : null;
    const open = data.maintenance.filter(
      (item) => !["resolved", "closed", "cancelled"].includes(item.status),
    );
    const owner =
      data.owners.find((item) =>
        item.relationships.some((relationship) => relationship.primaryContact),
      ) ||
      data.owners[0] ||
      null;
    return {
      tenancy,
      unit,
      end,
      rent: unit?.targetRent || terms.monthly_rent,
      open,
      urgent: open.filter((item) =>
        ["urgent", "emergency"].includes(item.priority),
      ),
      owner,
      mandate:
        data.mandates.find((item) => item.mandateStatus === "active") ||
        data.mandates[0] ||
        null,
    };
  }, [data]);
  if (loading)
    return (
      <main className="grid min-h-56 place-items-center text-sm text-[#60758b]">
        <span className="inline-flex items-center gap-2">
          <Loader2 size={16} className="animate-spin" />
          Loading property…
        </span>
      </main>
    );
  if (error || !property)
    return (
      <main className="mx-auto w-full px-4 py-6">
        <Link
          to="/agent/rentals/portfolio/properties"
          className="inline-flex items-center gap-1 text-sm font-semibold text-[#1769d1]"
        >
          <ArrowLeft size={15} />
          Back to properties
        </Link>
        <p className="mt-5 rounded-xl border border-[#f2c6c6] bg-[#fff7f7] p-3 text-sm text-[#9f3131]">
          {error || "This property is unavailable in your current workspace."}
        </p>
      </main>
    );
  const tabPath = (id) => (id === "overview" ? basePath : `${basePath}/${id}`);
  const unitCount = data.units.length;
  const occupied = data.units.filter(
    (item) => item.status === "occupied",
  ).length;
  const days = summary.end
    ? Math.max(0, Math.ceil((summary.end.getTime() - Date.now()) / 86400000))
    : null;
  const address = [
    property.address?.line1,
    property.address?.suburb,
    property.address?.city,
  ]
    .filter(Boolean)
    .join(", ");
  const next = !summary.owner
    ? [
        "Add a landlord relationship",
        "Link the owner and set a primary operational contact before this property can be managed confidently.",
        "Add landlord",
        tabPath("landlord"),
      ]
    : !summary.mandate
      ? [
          "Record the management mandate",
          "An active management mandate is still needed for this property.",
          "Add mandate",
          tabPath("landlord"),
        ]
      : summary.urgent.length
        ? [
            "Review urgent maintenance",
            `${summary.urgent.length} urgent issue${summary.urgent.length === 1 ? " requires" : "s require"} attention for this property.`,
            "View maintenance",
            tabPath("maintenance"),
          ]
        : days !== null && days <= 90
          ? [
              "Lease renewal decision required",
              `This lease expires in ${days} days. Confirm renewal intentions with the landlord and tenant.`,
              "View tenancy",
              tabPath("tenancy"),
            ]
          : summary.tenancy
            ? [
                "Keep the active tenancy on track",
                "Review the tenancy, lease terms and property actions in one place.",
                "View tenancy",
                tabPath("tenancy"),
              ]
            : [
                "Prepare this vacant property for letting",
                "There is no active tenancy. Review the property before creating a rental listing.",
                "Create listing",
                "/agent/rentals/listings/new",
              ];
  const overview = (
    <div className="space-y-3">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-[#bde5d2] bg-[#f1fcf6] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ddf6e9] text-[#087a55]">
            <CalendarDays size={19} />
          </span>
          <div>
            <h2 className="font-semibold text-[#163a2b]">{next[0]}</h2>
            <p className="mt-0.5 text-sm text-[#497061]">{next[1]}</p>
          </div>
        </div>
        <Link
          to={next[3]}
          className="inline-flex min-h-10 items-center justify-center rounded-[10px] bg-[#087a55] px-4 text-sm font-semibold text-white"
        >
          {next[2]}
        </Link>
      </section>
      <section className="flex gap-2 overflow-x-auto pb-1">
        <Stat
          icon={Home}
          label="Occupancy"
          value={
            unitCount ? `${occupied}/${unitCount} occupied` : "No units yet"
          }
          tone={
            occupied
              ? "bg-[#effaf3] text-[#16734f]"
              : "bg-[#fff7eb] text-[#c86400]"
          }
          to={tabPath("tenancy")}
        />
        <Stat
          icon={CircleDollarSign}
          label="Rent"
          value={money(summary.rent)}
          to={tabPath("financials")}
        />
        <Stat
          icon={CalendarDays}
          label="Lease"
          value={summary.end ? `${days} days remaining` : "No active lease"}
          tone={summary.end ? "bg-[#fff7eb] text-[#c86400]" : undefined}
          to={tabPath("tenancy")}
        />
        <Stat
          icon={Wrench}
          label="Maintenance"
          value={`${summary.open.length} open`}
          tone={
            summary.urgent.length
              ? "bg-[#fff7eb] text-[#c86400]"
              : "bg-[#effaf3] text-[#16734f]"
          }
          to={tabPath("maintenance")}
        />
        <Stat
          icon={ShieldCheck}
          label="Compliance"
          value={
            data.documents.length
              ? `${data.documents.length} documents`
              : "Not captured"
          }
          to={tabPath("documents")}
        />
      </section>
      <section className="grid gap-3 xl:grid-cols-2">
        <Panel
          title={summary.tenancy ? "Current tenancy" : "Current vacancy"}
          icon={UserRound}
          action={
            <Link
              to={tabPath("tenancy")}
              className="text-sm font-semibold text-[#087a55]"
            >
              View tenancy
            </Link>
          }
        >
          {summary.tenancy ? (
            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-[#142132]">
                  {tenantName(summary.tenancy)}
                </p>
                <p className="mt-1 text-sm text-[#60758b]">
                  Unit {summary.unit?.unitLabel || "pending"} · Active tenancy
                </p>
                <div className="mt-4 grid grid-cols-2 gap-5 text-sm">
                  <p>
                    <span className="block text-xs text-[#718399]">
                      Lease period
                    </span>
                    <b className="text-[#35546c]">
                      {date(summary.tenancy.intendedOccupationDate)} —{" "}
                      {date(summary.end)}
                    </b>
                  </p>
                  <p>
                    <span className="block text-xs text-[#718399]">
                      Monthly rent
                    </span>
                    <b className="text-[#35546c]">{money(summary.rent)}</b>
                  </p>
                </div>
              </div>
              <Link
                to={tabPath("tenancy")}
                className="rounded-[10px] border border-[#0b966a] px-3 py-2 text-sm font-semibold text-[#087a55]"
              >
                View tenancy
              </Link>
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-[#dbe6f1] bg-[#fafcff] p-4 text-sm text-[#60758b]">
              This property has no active tenancy. Create a rental listing when
              it is ready to let.
            </p>
          )}
        </Panel>
        <Panel
          title="Landlord"
          icon={Landmark}
          action={
            <Link
              to={tabPath("landlord")}
              className="text-sm font-semibold text-[#087a55]"
            >
              View landlord
            </Link>
          }
        >
          {summary.owner ? (
            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-[#142132]">
                  {summary.owner.name}
                </p>
                <p className="mt-1 text-sm text-[#60758b]">
                  Primary owner · {data.owners.length} owner
                  {data.owners.length === 1 ? "" : "s"} linked
                </p>
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-[#35546c]">
                  {summary.owner.phone ? (
                    <span className="inline-flex items-center gap-1">
                      <Phone size={14} />
                      {summary.owner.phone}
                    </span>
                  ) : null}
                  {summary.owner.email ? (
                    <span className="inline-flex items-center gap-1">
                      <Mail size={14} />
                      {summary.owner.email}
                    </span>
                  ) : null}
                </div>
              </div>
              <span className="rounded-full bg-[#effaf3] px-3 py-1 text-xs font-semibold text-[#26724c]">
                {summary.mandate
                  ? `${title(summary.mandate.mandateStatus)} mandate`
                  : "Mandate needed"}
              </span>
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-[#dbe6f1] bg-[#fafcff] p-4 text-sm text-[#60758b]">
              No landlord relationship is linked to this property yet.
            </p>
          )}
        </Panel>
        <Panel
          title="Financial snapshot"
          icon={CircleDollarSign}
          action={
            <Link
              to={tabPath("financials")}
              className="text-sm font-semibold text-[#087a55]"
            >
              Financials
            </Link>
          }
        >
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-[#718399]">Monthly rent</p>
              <p className="mt-1 font-semibold text-[#142132]">
                {money(summary.rent)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#718399]">Deposit</p>
              <p className="mt-1 font-semibold text-[#142132]">
                {money(summary.tenancy?.lease?.terms_json?.deposit_amount)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#718399]">Payments</p>
              <p className="mt-1 font-semibold text-[#142132]">Not captured</p>
            </div>
            <div>
              <p className="text-xs text-[#718399]">Maintenance</p>
              <p className="mt-1 font-semibold text-[#142132]">Not captured</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-[#718399]">
            Payment and ledger data will appear here when linked to this
            property.
          </p>
        </Panel>
        <Panel title="Important dates" icon={CalendarDays}>
          <div className="mt-4 space-y-2 text-sm">
            {summary.tenancy?.intendedOccupationDate ? (
              <p className="flex justify-between border-b border-[#edf2f7] pb-2">
                <span className="text-[#60758b]">Lease started</span>
                <b className="text-[#35546c]">
                  {date(summary.tenancy.intendedOccupationDate)}
                </b>
              </p>
            ) : null}
            {summary.end ? (
              <p className="flex justify-between border-b border-[#edf2f7] pb-2">
                <span className="text-[#60758b]">Lease expiry</span>
                <b className="text-[#35546c]">{date(summary.end)}</b>
              </p>
            ) : null}
            {summary.mandate?.endsOn ? (
              <p className="flex justify-between">
                <span className="text-[#60758b]">Mandate expiry</span>
                <b className="text-[#35546c]">{date(summary.mandate.endsOn)}</b>
              </p>
            ) : null}
            {!summary.end && !summary.mandate?.endsOn ? (
              <p className="rounded-xl border border-dashed border-[#dbe6f1] bg-[#fafcff] p-4 text-[#60758b]">
                No important dates have been recorded yet.
              </p>
            ) : null}
          </div>
        </Panel>
        <Panel
          title="Maintenance"
          icon={Wrench}
          action={
            <Link
              to={tabPath("maintenance")}
              className="text-sm font-semibold text-[#087a55]"
            >
              View maintenance
            </Link>
          }
        >
          {summary.open.length ? (
            <div className="mt-4 space-y-2">
              {summary.open.slice(0, 2).map((issue) => (
                <div
                  key={issue.request_id}
                  className="flex items-center justify-between rounded-xl bg-[#fafcff] px-3 py-2.5"
                >
                  <div>
                    <p className="font-semibold text-[#20364d]">
                      {title(issue.category)} issue
                    </p>
                    <p className="text-xs text-[#718399]">
                      {title(issue.priority)} · {title(issue.status)}
                    </p>
                  </div>
                  <ChevronRight size={17} className="text-[#1769d1]" />
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-[#dbe6f1] bg-[#fafcff] p-4 text-sm text-[#60758b]">
              No open maintenance issues are linked to this property.
            </p>
          )}
        </Panel>
        <Panel
          title="Recent activity"
          icon={Clock3}
          action={
            <Link
              to={tabPath("activity")}
              className="text-sm font-semibold text-[#087a55]"
            >
              View all
            </Link>
          }
        >
          <div className="mt-4 space-y-2">
            {data.activity.slice(0, 3).map((event) => (
              <div
                key={event.id}
                className="border-b border-[#edf2f7] pb-2 last:border-0"
              >
                <p className="text-sm font-semibold text-[#20364d]">
                  {event.title}
                </p>
                <p className="mt-0.5 text-xs text-[#718399]">
                  {event.description || title(event.activityType)} ·{" "}
                  {date(event.occurredAt)}
                </p>
              </div>
            ))}
            {!data.activity.length ? (
              <p className="rounded-xl border border-dashed border-[#dbe6f1] bg-[#fafcff] p-4 text-sm text-[#60758b]">
                No property activity has been recorded yet.
              </p>
            ) : null}
          </div>
        </Panel>
      </section>
    </div>
  );
  const content = {
    overview,
    landlord: (
      <RentalLandlordMandatePanel
        property={property}
        userId={workspace.profile?.id || workspace.userId || ""}
      />
    ),
    tenancy: (
      <Panel title="Tenancy history" icon={UserRound}>
        {data.tenancies.length ? (
          <div className="mt-4 space-y-3">
            {data.tenancies.map((tenancy) => (
              <Link
                key={tenancy.id}
                to={`/agent/rentals/tenancies/${tenancy.id}`}
                className="flex items-center justify-between rounded-xl border border-[#e1e8f0] p-3"
              >
                <div>
                  <p className="font-semibold text-[#20364d]">
                    {tenantName(tenancy)}
                  </p>
                  <p className="mt-1 text-sm text-[#60758b]">
                    {title(tenancy.status)} · Occupation{" "}
                    {date(tenancy.intendedOccupationDate)}
                  </p>
                </div>
                <ChevronRight size={17} className="text-[#1769d1]" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-[#dbe6f1] bg-[#fafcff] p-5 text-sm text-[#60758b]">
            No tenancy records are linked to this property.
          </p>
        )}
      </Panel>
    ),
    financials: (
      <EmptyPanel
        title="Property financials"
        description="No property-level ledger or payment records are connected yet. Rental terms remain visible on the Overview until financial records are available."
      />
    ),
    maintenance: (
      <Panel
        title="Property maintenance"
        icon={Wrench}
        action={
          <Link
            to="/agent/rentals/maintenance"
            className="text-sm font-semibold text-[#087a55]"
          >
            Open maintenance workspace
          </Link>
        }
      >
        {summary.open.length ? (
          <div className="mt-4 space-y-3">
            {summary.open.map((issue) => (
              <article
                key={issue.request_id}
                className="rounded-xl border border-[#e1e8f0] p-3"
              >
                <p className="font-semibold text-[#20364d]">
                  {title(issue.category)} issue
                </p>
                <p className="mt-1 text-sm text-[#60758b]">
                  {title(issue.priority)} priority · Reported{" "}
                  {date(issue.reported_at)}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-[#dbe6f1] bg-[#fafcff] p-5 text-sm text-[#60758b]">
            No maintenance issues are linked to this property.
          </p>
        )}
      </Panel>
    ),
    inspections: (
      <EmptyPanel
        title="Property inspections"
        description="No inspection records are currently linked to this property. Schedule and complete inspections from the central Inspections workspace."
        action={
          <Link
            to="/agent/rentals/inspections"
            className="text-sm font-semibold text-[#087a55]"
          >
            Open inspections
          </Link>
        }
      />
    ),
    documents: (
      <Panel title="Property documents" icon={FileText}>
        {data.documents.length ? (
          <div className="mt-4 divide-y divide-[#edf2f7]">
            {data.documents.map((document) => (
              <div
                key={document.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="font-semibold text-[#20364d]">
                    {document.documentLabel || "Property document"}
                  </p>
                  <p className="mt-1 text-xs text-[#718399]">
                    {title(document.documentCategory || document.entityType)} ·{" "}
                    {date(document.createdAt)}
                  </p>
                </div>
                <FileText size={17} className="text-[#1769d1]" />
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-[#dbe6f1] bg-[#fafcff] p-5 text-sm text-[#60758b]">
            No documents are linked to this property.
          </p>
        )}
      </Panel>
    ),
    activity: (
      <Panel title="Property activity" icon={Clock3}>
        {data.activity.length ? (
          <div className="mt-4 space-y-3">
            {data.activity.map((event) => (
              <article
                key={event.id}
                className="border-l-2 border-[#d6e4ef] pl-4"
              >
                <p className="font-semibold text-[#20364d]">{event.title}</p>
                <p className="mt-1 text-sm text-[#60758b]">
                  {event.description || title(event.activityType)}
                </p>
                <p className="mt-1 text-xs text-[#718399]">
                  {date(event.occurredAt)}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-[#dbe6f1] bg-[#fafcff] p-5 text-sm text-[#60758b]">
            No property activity has been recorded yet.
          </p>
        )}
      </Panel>
    ),
  };
  return (
    <main className="mx-auto w-full px-2 py-2 sm:px-3 lg:px-4">
      <section className="space-y-3 pb-6">
        <Link
          to="/agent/rentals/portfolio/properties"
          className="inline-flex items-center gap-1 text-sm font-semibold text-[#1769d1]"
        >
          <ArrowLeft size={15} />
          Back to properties
        </Link>
        <section className="overflow-hidden rounded-[18px] border border-[#dfe7f0] bg-white shadow-[0_12px_30px_rgba(15,23,42,.05)]">
          <div className="grid lg:grid-cols-[220px_minmax(0,1fr)_270px]">
            <div className="grid min-h-40 place-items-center bg-[linear-gradient(135deg,#eaf4ff,#f8fbff)] text-center text-[#1769d1]">
              <div>
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white shadow-sm">
                  <Building2 size={26} />
                </span>
                <p className="mt-2 text-xs font-semibold text-[#60758b]">
                  No property image
                </p>
              </div>
            </div>
            <div className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold tracking-[-.02em] text-[#102236]">
                    {property.name}
                  </h1>
                  <p className="mt-1 text-sm text-[#47698d]">
                    {address || "Address pending"}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="More property actions"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-[#dbe6f1] text-[#58718b]"
                >
                  <MoreHorizontal size={18} />
                </button>
              </div>
              <p className="mt-3 text-sm text-[#35546c]">
                {title(property.propertyType)} · {unitCount} unit
                {unitCount === 1 ? "" : "s"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${summary.tenancy ? "bg-[#e5f8ef] text-[#087a55]" : "bg-[#fff6e8] text-[#a55a00]"}`}
                >
                  {summary.tenancy ? "Occupied" : "Vacant"}
                </span>
                <span className="rounded-full bg-[#f0f5fb] px-3 py-1 text-xs font-semibold text-[#35546c]">
                  {summary.tenancy ? "Lease active" : "No active lease"}
                </span>
                {summary.open.length ? (
                  <span className="rounded-full bg-[#fff3e9] px-3 py-1 text-xs font-semibold text-[#c86400]">
                    {summary.open.length} open maintenance issue
                    {summary.open.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
            </div>
            <aside className="border-t border-[#e5edf5] p-4 lg:border-l lg:border-t-0">
              <p className="text-xl font-semibold text-[#102236]">
                {money(summary.rent)}
                {summary.rent ? (
                  <span className="text-sm font-medium text-[#60758b]">
                    {" "}
                    / month
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-sm text-[#60758b]">
                {summary.end
                  ? `Lease ends ${date(summary.end)}`
                  : "No active lease"}
              </p>
              {summary.tenancy ? (
                <div className="mt-4 flex items-center gap-2">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[#edf5ff] text-[#1769d1]">
                    <UserRound size={17} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#20364d]">
                      {tenantName(summary.tenancy)}
                    </p>
                    <p className="text-xs text-[#60758b]">Current tenant</p>
                  </div>
                </div>
              ) : null}
              <Link
                to={
                  summary.tenancy
                    ? tabPath("tenancy")
                    : "/agent/rentals/listings/new"
                }
                className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-[10px] bg-[#087a55] px-3 text-sm font-semibold text-white"
              >
                {summary.tenancy ? "View tenancy" : "Create listing"}
              </Link>
            </aside>
          </div>
        </section>
        <nav
          aria-label="Property workspace"
          className="flex overflow-x-auto rounded-[14px] border border-[#dbe6f2] bg-white p-1.5"
        >
          {tabs.map(([id, label]) => (
            <NavLink
              key={id}
              to={tabPath(id)}
              end={id === "overview"}
              className={({ isActive }) =>
                `min-w-[118px] shrink-0 rounded-[10px] px-4 py-2.5 text-center text-sm font-semibold transition ${isActive ? "bg-[#edf7f3] text-[#087a55]" : "text-[#60758b] hover:bg-[#f8fbff]"}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        {content[current]}
      </section>
    </main>
  );
}
