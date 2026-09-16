import {
  ArrowLeft,
  Banknote,
  BellRing,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  Gauge,
  HeartHandshake,
  MapPin,
  MessageCircle,
  MoreVertical,
  ReceiptText,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import SellingEnquiryFlow from "./SellingEnquiryFlow";

const money = (value) =>
  Number.isFinite(Number(value))
    ? new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency: "ZAR",
        maximumFractionDigits: 0,
      })
        .format(Number(value))
        .replace("ZAR", "R")
    : "Not available";

const tabs = [
  ["overview", "Overview", Building2],
  ["tenancy", "Tenancy", UserRound],
  ["finances", "Finances", Banknote],
  ["maintenance", "Maintenance", Wrench],
  ["inspections", "Inspections", CalendarDays],
  ["insurance", "Insurance", ShieldCheck],
  ["documents", "Documents", FileText],
  ["activity", "Activity", Clock3],
];

function Panel({ icon: Icon, title, action, children, className = "" }) {
  return (
    <section
      className={`rounded-[14px] border border-[#e1e7e3] bg-white p-4 shadow-[0_6px_18px_rgba(15,23,42,.04)] ${className}`}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#edf8f2] text-[#17613f]">
            <Icon size={18} />
          </span>
          <h2 className="truncate text-base font-semibold tracking-[-.025em] text-[#18251e]">
            {title}
          </h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function LinkButton({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-[#075b40] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075b40]"
    >
      {children} <ChevronRight size={16} />
    </button>
  );
}

function EmptyPanel({ title, copy }) {
  return (
    <section className="rounded-[14px] border border-dashed border-[#d7e1db] bg-white p-6 text-center">
      <h2 className="font-semibold text-[#26352d]">{title}</h2>
      <p className="mt-2 text-sm text-[#66736b]">{copy}</p>
    </section>
  );
}

export default function LandlordPropertyWorkspace({
  property = {},
  tab = "overview",
  demo = false,
  onBack,
  onTabChange,
  onNavigate,
}) {
  const [sellingOpen, setSellingOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const selectedTab = tabs.some(([key]) => key === tab) ? tab : "overview";
  const isHarbourDemo = demo && property.id === "harbour";
  const details = isHarbourDemo
    ? {
        name: "Harbour Heights · Apartment 14",
        address: "12 Ocean View Drive, Sea Point, Cape Town",
        image: "/brand/harbour-heights-apartment-14.png",
        rent: 18500,
        tenant: "Jordan Taylor",
        leaseStart: "1 Aug 2026",
        leaseEnd: "31 Jul 2027",
        daysRemaining: 318,
        progress: 13,
      }
    : {
        name: property.name || "Property",
        address: property.location || "Address not captured",
        image: property.image || "",
        rent: property.rent,
        tenant: "",
        leaseStart: "Not available",
        leaseEnd: "Not available",
        daysRemaining: null,
        progress: 0,
      };
  const toTab = (nextTab) => onTabChange?.(nextTab);

  const overview = isHarbourDemo ? (
    <div className="grid gap-3 xl:grid-cols-12">
      <Panel
        icon={CheckCircle2}
        title="Lease health"
        action={
          <LinkButton onClick={() => toTab("tenancy")}>View tenancy</LinkButton>
        }
        className="xl:col-span-5"
      >
        <div className="mt-3 rounded-xl bg-[#edf9f2] p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-[#194632]">Active tenancy</p>
              <p className="mt-0.5 text-sm text-[#4d685a]">{details.tenant}</p>
            </div>
            <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-[#17613f]">
              {details.progress}% complete
            </span>
          </div>
          <div
            className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#dbe5df]"
            role="progressbar"
            aria-label="Lease progress"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={details.progress}
          >
            <div
              className="h-full rounded-full bg-[#21865b]"
              style={{ width: `${details.progress}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs font-medium text-[#4b6758]">
            <span>{details.leaseStart}</span>
            <span>{details.daysRemaining} days remaining</span>
            <span>{details.leaseEnd}</span>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <span className="inline-flex items-center gap-2 font-semibold text-[#17613f]">
            <CheckCircle2 size={17} />
            Rent paid for September
          </span>
          <LinkButton onClick={() => toTab("finances")}>
            View finances
          </LinkButton>
        </div>
      </Panel>
      <Panel
        icon={Gauge}
        title="Property performance"
        action={
          <LinkButton onClick={() => toTab("finances")}>
            View finances
          </LinkButton>
        }
        className="xl:col-span-4"
      >
        <dl className="mt-3 grid grid-cols-2 overflow-hidden rounded-xl border border-[#e7ece9] text-sm">
          {[
            ["Monthly rent", money(details.rent)],
            ["Annualised rent", money(details.rent * 12)],
            ["Estimated yearly yield", "7.4%"],
            ["Property value", "R3 000 000"],
          ].map(([term, value]) => (
            <div
              key={term}
              className="border-b border-[#e7ece9] p-3 even:border-l even:border-l-[#e7ece9] last:border-b-0 [&:nth-last-child(2)]:border-b-0"
            >
              <dt className="text-xs text-[#68746d]">{term}</dt>
              <dd className="mt-1 font-semibold text-[#1d2a22]">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#17613f]">
          <Gauge size={16} />
          On track this year
        </p>
        <div className="mt-4 border-t border-[#edf0ee] pt-3">
          <p className="font-semibold text-[#26362c]">Thinking of selling?</p>
          <p className="mt-1 text-sm text-[#657168]">
            Get a no-obligation valuation and speak to your property team.
          </p>
          <button
            type="button"
            onClick={() => setSellingOpen(true)}
            className="mt-3 min-h-10 rounded-lg border border-[#3b795e] px-3 text-sm font-semibold text-[#075b40]"
          >
            Discuss selling
          </button>
        </div>
      </Panel>
      <Panel
        icon={BellRing}
        title="Needs your approval"
        action={
          <LinkButton onClick={() => toTab("maintenance")}>View all</LinkButton>
        }
        className="xl:col-span-3"
      >
        <div className="mt-3 rounded-xl bg-[#fff7e9] p-3.5">
          <p className="text-sm font-semibold text-[#3b3020]">
            Plumbing repair quote
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-[-.04em] text-[#25251f]">
            R2 450
          </p>
          <p className="mt-1 text-sm text-[#81613a]">Leaking kitchen tap</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => toTab("maintenance")}
              className="min-h-9 flex-1 rounded-lg border border-[#aa8b58] bg-white px-2 text-sm font-semibold text-[#5a4320]"
            >
              Review
            </button>
            <button
              type="button"
              onClick={() => toTab("maintenance")}
              className="min-h-9 flex-1 rounded-lg bg-[#07533a] px-2 text-sm font-semibold text-white"
            >
              Approve
            </button>
          </div>
        </div>
        <p className="mt-3 text-sm text-[#626e66]">1 decision awaiting you</p>
      </Panel>
      <div className="grid gap-3 md:grid-cols-2 xl:col-span-12 xl:grid-cols-4">
        <Panel
          icon={Wrench}
          title="Maintenance"
          action={
            <LinkButton onClick={() => toTab("maintenance")}>
              View request
            </LinkButton>
          }
        >
          <p className="mt-3 font-semibold text-[#28372d]">
            Leaking kitchen tap
          </p>
          <p className="mt-1 text-sm text-[#657168]">
            Contractor scheduled · 18 Sep, 09:00–11:00
          </p>
          <div className="mt-4 flex items-center gap-1">
            <span className="h-2.5 flex-1 rounded-full bg-[#21865b]" />
            <span className="h-2.5 flex-1 rounded-full bg-[#21865b]" />
            <span className="h-2.5 flex-1 rounded-full bg-[#21865b]" />
          </div>
          <p className="mt-2 text-xs text-[#637168]">
            Submitted · Approved · Scheduled
          </p>
        </Panel>
        <Panel
          icon={ShieldCheck}
          title="Insurance"
          action={
            <LinkButton onClick={() => toTab("insurance")}>
              View policy
            </LinkButton>
          }
        >
          <p className="mt-3 font-semibold text-[#28372d]">
            Santam landlord policy
          </p>
          <p className="mt-1 text-sm text-[#657168]">
            Active · Renews 15 Feb 2027
          </p>
          <p className="mt-4 rounded-lg bg-[#fff8ed] px-3 py-2 text-sm text-[#76511e]">
            No active claims
          </p>
        </Panel>
        <Panel
          icon={CalendarDays}
          title="Inspections"
          action={
            <LinkButton onClick={() => toTab("inspections")}>
              View inspection
            </LinkButton>
          }
        >
          <p className="mt-3 font-semibold text-[#28372d]">
            Next routine inspection
          </p>
          <p className="mt-1 text-sm text-[#657168]">24 Sep 2026 · 10:00</p>
          <p className="mt-3 inline-flex rounded-full bg-[#ecfaf2] px-2.5 py-1 text-xs font-semibold text-[#17613f]">
            Confirmed
          </p>
          <p className="mt-2 text-sm text-[#657168]">Sarah Mokoena</p>
        </Panel>
        <Panel
          icon={FileText}
          title="Documents"
          action={
            <LinkButton onClick={() => toTab("documents")}>View all</LinkButton>
          }
        >
          <div className="mt-3 grid gap-2 text-sm">
            {[
              ["Signed lease agreement", "Signed"],
              ["Latest owner statement", "Available"],
              ["Building insurance policy", "Current"],
            ].map(([name, state]) => (
              <div
                key={name}
                className="flex items-center justify-between gap-2"
              >
                <span className="inline-flex min-w-0 items-center gap-2 truncate text-[#344238]">
                  <FileText size={15} />
                  {name}
                </span>
                <span className="text-xs font-semibold text-[#17613f]">
                  {state}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <Panel
        icon={Clock3}
        title="Recent activity"
        action={
          <LinkButton onClick={() => toTab("activity")}>
            View all activity
          </LinkButton>
        }
        className="xl:col-span-12"
      >
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Rent received from Jordan Taylor", "1 Sep 2026 · 09:14"],
            ["Contractor scheduled for kitchen tap", "16 Sep 2026 · 14:22"],
            ["Routine inspection confirmed", "14 Sep 2026 · 11:06"],
            ["Owner statement shared", "1 Sep 2026 · 10:03"],
          ].map(([title, timestamp]) => (
            <div key={title} className="border-l-2 border-[#bde7ce] pl-3">
              <p className="text-sm font-semibold text-[#344238]">{title}</p>
              <p className="mt-1 text-xs text-[#707b74]">{timestamp}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  ) : (
    <EmptyPanel
      title="Property data is still being prepared"
      copy="Lease, finance, maintenance, inspection, insurance and activity data will appear here when they are available for this property."
    />
  );

  const nonOverview = {
    tenancy: [
      "Tenancy information",
      "Current lease details and authorised tenant information will appear here.",
    ],
    finances: [
      "Property finances",
      "Authoritative rent roll, payments, owner statements and disbursements are not available in this portal response yet.",
    ],
    maintenance: [
      "Maintenance",
      "Open work, owner-approved quotes and completed repairs will appear here.",
    ],
    inspections: [
      "Inspections",
      "Upcoming inspections and owner-authorised reports will appear here.",
    ],
    insurance: [
      "Insurance",
      "No insurance data has been connected for this property yet.",
    ],
    documents: [
      "Property documents",
      "Owner-authorised lease, finance, inspection, insurance and property documents will appear here.",
    ],
    activity: [
      "Property activity",
      "The property-specific activity timeline will appear here.",
    ],
  };
  const demoTabs = {
    tenancy: (
      <div className="grid gap-3 lg:grid-cols-[1.15fr_.85fr]">
        <Panel icon={UserRound} title="Active tenancy">
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
            {[
              ["Tenant", "Jordan Taylor"],
              ["Lease status", "Active"],
              ["Lease start", "1 Aug 2026"],
              ["Lease end", "31 Jul 2027"],
              ["Monthly rent", money(details.rent)],
              ["Deposit held", "R18 500"],
            ].map(([term, value]) => (
              <div key={term} className="rounded-xl bg-[#f5f8f5] p-3">
                <dt className="text-xs text-[#6d796f]">{term}</dt>
                <dd className="mt-1 font-semibold text-[#25352b]">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 rounded-xl border border-[#d8e8de] bg-[#effaf3] p-3 text-sm text-[#356047]">
            Rent is paid for September. The current fixed-term lease is on
            track.
          </div>
        </Panel>
        <Panel icon={CalendarDays} title="Lease milestones">
          <div className="mt-4 grid gap-4 border-l-2 border-[#cae7d6] pl-4 text-sm">
            {[
              ["Lease signed", "1 Aug 2026"],
              ["Move-in complete", "1 Aug 2026"],
              ["Renewal discussion", "May 2027"],
              ["Lease end", "31 Jul 2027"],
            ].map(([title, date]) => (
              <div key={title}>
                <p className="font-semibold text-[#2c3c31]">{title}</p>
                <p className="mt-1 text-[#6d796f]">{date}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    ),
    finances: (
      <div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
        <Panel icon={Banknote} title="Rent & payment health">
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[#edf9f2] p-4">
              <p className="text-sm text-[#5b6f61]">September rent</p>
              <p className="mt-1 text-2xl font-semibold tracking-[-.04em]">
                {money(details.rent)}
              </p>
              <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[#17613f]">
                <CheckCircle2 size={16} />
                Paid 1 Sep 2026
              </p>
            </div>
            <div className="rounded-xl bg-[#f5f7f5] p-4">
              <p className="text-sm text-[#5b6f61]">Next payment</p>
              <p className="mt-1 text-2xl font-semibold tracking-[-.04em]">
                {money(details.rent)}
              </p>
              <p className="mt-2 text-sm text-[#5b6f61]">Due 1 Oct 2026</p>
            </div>
          </div>
          <div className="mt-4 divide-y divide-[#edf0ee] text-sm">
            {[
              ["September 2026", "R18 500", "Paid"],
              ["August 2026", "R18 500", "Paid"],
              ["July 2026", "R18 500", "Paid"],
            ].map(([month, amount, status]) => (
              <div
                key={month}
                className="flex items-center justify-between py-3"
              >
                <span className="font-semibold text-[#2e3d33]">{month}</span>
                <span>{amount}</span>
                <span className="rounded-full bg-[#ecfaf2] px-2 py-1 text-xs font-semibold text-[#17613f]">
                  {status}
                </span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel icon={Gauge} title="Property performance">
          <dl className="mt-4 grid gap-3 text-sm">
            {[
              ["Annualised rent", money(details.rent * 12)],
              ["Property value", "R3 000 000"],
              ["Estimated yearly yield", "7.4%"],
              ["Owner statement", "Available"],
            ].map(([term, value]) => (
              <div
                key={term}
                className="flex justify-between gap-3 border-b border-[#edf0ee] pb-3 last:border-0"
              >
                <dt className="text-[#68756c]">{term}</dt>
                <dd className="font-semibold text-[#26362c]">{value}</dd>
              </div>
            ))}
          </dl>
          <button
            type="button"
            className="mt-4 min-h-10 rounded-lg bg-[#07533a] px-3 text-sm font-semibold text-white"
          >
            View owner statement
          </button>
        </Panel>
      </div>
    ),
    maintenance: (
      <div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
        <Panel icon={Wrench} title="Open maintenance request">
          <div className="mt-4 rounded-xl bg-[#fffaf1] p-4">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-[#28382d]">
                  Leaking kitchen tap
                </p>
                <p className="mt-1 text-sm text-[#68756c]">
                  AquaFix Plumbing · 18 Sep, 09:00–11:00
                </p>
              </div>
              <span className="h-fit rounded-full bg-[#ecfaf2] px-2.5 py-1 text-xs font-semibold text-[#17613f]">
                Contractor scheduled
              </span>
            </div>
            <div className="mt-4 flex gap-1">
              {[
                "Submitted",
                "Approved",
                "Assigned",
                "Scheduled",
                "Completed",
              ].map((step, index) => (
                <span
                  key={step}
                  className={`h-2 flex-1 rounded-full ${index < 4 ? "bg-[#21865b]" : "bg-[#dfe6e1]"}`}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-[#66736b]">
              Submitted · Approved · Contractor assigned · Scheduled · Completed
            </p>
          </div>
          <button
            type="button"
            className="mt-4 min-h-10 rounded-lg border border-[#3b795e] px-3 text-sm font-semibold text-[#075b40]"
          >
            View request
          </button>
        </Panel>
        <Panel icon={BellRing} title="Quote awaiting approval">
          <p className="mt-4 font-semibold text-[#2c3a31]">
            Plumbing repair quote
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-[-.04em]">
            R2 450
          </p>
          <p className="mt-1 text-sm text-[#68756c]">Leaking kitchen tap</p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="min-h-10 flex-1 rounded-lg border border-[#9e8152] bg-white text-sm font-semibold text-[#60481f]"
            >
              Review
            </button>
            <button
              type="button"
              className="min-h-10 flex-1 rounded-lg bg-[#07533a] text-sm font-semibold text-white"
            >
              Approve
            </button>
          </div>
        </Panel>
      </div>
    ),
    inspections: (
      <div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
        <Panel icon={CalendarDays} title="Upcoming inspection">
          <div className="mt-4 flex flex-wrap gap-4 rounded-xl bg-[#edf9f2] p-4">
            <div className="grid h-16 w-16 place-items-center rounded-xl bg-white text-center">
              <span className="text-xs font-semibold text-[#17613f]">SEP</span>
              <strong className="text-2xl">24</strong>
            </div>
            <div>
              <p className="font-semibold text-[#27372d]">
                Routine property inspection
              </p>
              <p className="mt-1 text-sm text-[#5c6d62]">
                24 September 2026 · 10:00–11:00
              </p>
              <p className="mt-1 text-sm text-[#5c6d62]">Sarah Mokoena</p>
              <span className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#17613f]">
                Confirmed
              </span>
            </div>
          </div>
          <button
            type="button"
            className="mt-4 min-h-10 rounded-lg border border-[#3b795e] px-3 text-sm font-semibold text-[#075b40]"
          >
            View inspection
          </button>
        </Panel>
        <Panel icon={FileText} title="Recent reports">
          <div className="mt-4 grid gap-3 text-sm">
            {[
              ["Move-in inspection report", "1 Aug 2026"],
              ["Incoming condition inspection", "31 Jul 2026"],
              ["Pre-occupation walkthrough", "28 Jul 2026"],
            ].map(([title, date]) => (
              <div
                key={title}
                className="flex items-center justify-between gap-3"
              >
                <span className="font-semibold text-[#35443a]">{title}</span>
                <span className="text-[#68756c]">{date}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    ),
    insurance: (
      <div className="grid gap-3 lg:grid-cols-[1.1fr_.9fr]">
        <Panel icon={ShieldCheck} title="Policy summary">
          <div className="mt-4 rounded-xl bg-[#edf9f2] p-4">
            <p className="text-lg font-semibold text-[#27372d]">
              Santam landlord policy
            </p>
            <p className="mt-1 text-sm text-[#5e6e64]">
              Landlord building insurance
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#17613f]">
                Active
              </span>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#506158]">
                Renews 15 Feb 2027
              </span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-[#68756c]">Policy documents available</span>
            <button
              type="button"
              className="font-semibold text-[#075b40] underline"
            >
              View policy
            </button>
          </div>
        </Panel>
        <Panel icon={CheckCircle2} title="Claims">
          <p className="mt-4 rounded-xl bg-[#f5f7f5] p-4 text-sm text-[#506158]">
            There are no active insurance claims for this property.
          </p>
          <button
            type="button"
            className="mt-4 min-h-10 rounded-lg border border-[#3b795e] px-3 text-sm font-semibold text-[#075b40]"
          >
            View insurance documents
          </button>
        </Panel>
      </div>
    ),
    documents: (
      <div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
        <Panel icon={FileText} title="Property documents">
          <div className="mt-4 divide-y divide-[#edf0ee]">
            {[
              ["Signed lease agreement", "Lease", "Signed"],
              ["September owner statement", "Finances", "Available"],
              ["Move-in inspection report", "Inspections", "Available"],
              ["Santam landlord policy", "Insurance", "Current"],
            ].map(([name, type, status]) => (
              <div
                key={name}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-semibold text-[#2f3e34]">{name}</p>
                  <p className="mt-1 text-xs text-[#6a766e]">{type}</p>
                </div>
                <span className="rounded-full bg-[#ecfaf2] px-2.5 py-1 text-xs font-semibold text-[#17613f]">
                  {status}
                </span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel icon={Clock3} title="Document activity">
          <div className="mt-4 grid gap-3 text-sm">
            {[
              ["Owner statement shared", "Today"],
              ["Inspection report added", "14 Sep 2026"],
              ["Policy document updated", "1 Sep 2026"],
            ].map(([title, date]) => (
              <div key={title} className="border-l-2 border-[#bde7ce] pl-3">
                <p className="font-semibold text-[#35443a]">{title}</p>
                <p className="mt-1 text-[#68756c]">{date}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    ),
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-3 pb-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#3f5749] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075b40]"
      >
        <ArrowLeft size={17} />
        My properties
      </button>
      <section className="overflow-hidden rounded-[16px] border border-[#e1e7e3] bg-white shadow-[0_7px_20px_rgba(15,23,42,.045)]">
        <div className="grid gap-4 p-3 sm:grid-cols-[minmax(240px,.72fr)_minmax(0,1.28fr)] sm:p-4">
          <div className="h-48 overflow-hidden rounded-xl bg-[#eaf1ec] sm:h-full sm:min-h-[190px]">
            {details.image ? (
              <img
                src={details.image}
                alt={details.name}
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col justify-between py-1 sm:pr-2">
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold tracking-[-.045em] text-[#13221a] sm:text-3xl">
                    {details.name}
                  </h1>
                  <p className="mt-2 flex items-start gap-2 text-sm text-[#536159]">
                    <MapPin className="mt-0.5 shrink-0" size={17} />
                    {details.address}
                  </p>
                </div>
                <div className="relative flex gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate?.("messages")}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#07533a] px-3.5 text-sm font-semibold text-white"
                  >
                    <MessageCircle size={16} />
                    Message rental team
                  </button>
                  {isHarbourDemo ? (
                    <>
                      <button
                        type="button"
                        aria-label="Property actions"
                        onClick={() => setHeaderMenuOpen(!headerMenuOpen)}
                        className="grid h-10 w-10 place-items-center rounded-lg border border-[#dce4df] text-[#33453b]"
                      >
                        <MoreVertical size={18} />
                      </button>
                      {headerMenuOpen ? (
                        <div className="absolute right-0 top-12 z-20 w-64 rounded-xl border border-[#dfe6e1] bg-white p-1.5 shadow-lg">
                          <button
                            type="button"
                            onClick={() => {
                              setHeaderMenuOpen(false);
                              setSellingOpen(true);
                            }}
                            className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold text-[#26362c] hover:bg-[#f3f6f3]"
                          >
                            Discuss selling this property
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <span className="rounded-full bg-[#ecfaf2] px-2.5 py-1 text-xs font-semibold text-[#17613f]">
                  {property.status === "vacant" ? "Vacant" : "Occupied"}
                </span>
                <span className="rounded-full bg-[#ecfaf2] px-2.5 py-1 text-xs font-semibold text-[#17613f]">
                  Managed
                </span>
              </div>
            </div>
            <div className="mt-4 grid gap-3 border-t border-[#edf0ee] pt-4 sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <Banknote className="text-[#17613f]" size={21} />
                <div>
                  <p className="font-semibold text-[#25342b]">
                    {money(details.rent)} pm
                  </p>
                  <p className="text-xs text-[#68746d]">Current rent</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <UserRound className="text-[#17613f]" size={21} />
                <div>
                  <p className="font-semibold text-[#25342b]">
                    {details.tenant || "No tenant data"}
                  </p>
                  <p className="text-xs text-[#68746d]">Current tenant</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CalendarDays className="text-[#17613f]" size={21} />
                <div>
                  <p className="font-semibold text-[#25342b]">
                    Lease ends {details.leaseEnd}
                  </p>
                  <p className="text-xs text-[#68746d]">
                    {details.daysRemaining
                      ? `${details.daysRemaining} days remaining`
                      : "Lease status unavailable"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <nav
        className="flex overflow-x-auto rounded-[14px] border border-[#e1e7e3] bg-white p-1"
        aria-label="Property workspace sections"
        role="tablist"
      >
        {tabs.map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={selectedTab === key}
            onClick={() => toTab(key)}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${selectedTab === key ? "bg-[#edf8f2] text-[#075b40] shadow-sm" : "text-[#536159] hover:bg-[#f4f6f4]"}`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>
      {selectedTab === "overview" ? (
        overview
      ) : isHarbourDemo && demoTabs[selectedTab] ? (
        demoTabs[selectedTab]
      ) : (
        <EmptyPanel
          title={nonOverview[selectedTab][0]}
          copy={nonOverview[selectedTab][1]}
        />
      )}
      <section className="flex flex-col justify-between gap-3 rounded-[14px] border border-[#cde9da] bg-[#effaf3] px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex gap-3">
          <HeartHandshake
            className="mt-0.5 shrink-0 text-[#17613f]"
            size={20}
          />
          <div>
            <p className="font-semibold text-[#24352b]">
              Questions about {details.name}?
            </p>
            <p className="mt-1 text-sm text-[#5f7166]">
              Your rental team is ready to help.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate?.("messages")}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#07533a] px-4 text-sm font-semibold text-white"
        >
          <MessageCircle size={16} />
          Message rental team
        </button>
      </section>
      {sellingOpen ? (
        <SellingEnquiryFlow
          property={details}
          onClose={() => setSellingOpen(false)}
          onMessage={() => {
            setSellingOpen(false);
            onNavigate?.("messages");
          }}
        />
      ) : null}
    </div>
  );
}
