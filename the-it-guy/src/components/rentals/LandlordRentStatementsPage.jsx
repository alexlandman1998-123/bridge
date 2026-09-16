import {
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  FileText,
  Landmark,
  MessageCircle,
  MoreVertical,
  ReceiptText,
  Search,
  WalletCards,
} from "lucide-react";
import { useMemo, useState } from "react";

const money = (value) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  })
    .format(value)
    .replace("ZAR", "R");

// Replace this one object with the consolidated owner-scoped finance response when available.
const mockFinancialPageData = {
  periodLabel: "September 2026",
  collection: {
    collected: 57500,
    expected: 62500,
    percentage: 92,
    attention: "1 payment needs attention",
  },
  outstanding: { amount: 5000, tenancies: 1, property: "The Mews · Unit 3" },
  disbursement: { amount: 48960, due: "Due 25 Sep 2026", status: "Scheduled" },
  yearToDate: { collected: 486500, status: "On track against expected rent" },
  rentRoll: [
    {
      id: "harbour",
      property: "Harbour Heights 14",
      tenant: "Jordan Taylor",
      expected: 18500,
      received: 18500,
      balance: 0,
      status: "Paid",
      image: "/brand/harbour-heights-apartment-14.png",
    },
    {
      id: "ocean",
      property: "Ocean View Villa",
      tenant: "Maya Smith",
      expected: 22000,
      received: 22000,
      balance: 0,
      status: "Paid",
      image: "/brand/landlord-demo/ocean-view-villa.jpg",
    },
    {
      id: "maple",
      property: "Maple Grove 8",
      tenant: "Vacant",
      expected: 12000,
      received: null,
      balance: null,
      status: "Available",
      image: "/brand/landlord-demo/maple-grove-8.jpg",
    },
    {
      id: "mews",
      property: "The Mews 3",
      tenant: "Daniel Botha",
      expected: 10000,
      received: 5000,
      balance: 5000,
      status: "Attention",
      image: "/brand/landlord-demo/the-mews-3.jpg",
    },
  ],
  statements: [
    ["September 2026 owner statement", "Available 20 Sep 2026", "Download"],
    ["August 2026 owner statement", "Paid 25 Aug 2026", "View statement"],
    ["July 2026 owner statement", "Paid 25 Jul 2026", "View statement"],
  ],
  activity: [
    ["Rent received from Jordan Taylor", "1 Sep 2026 · 09:14", 18500],
    ["Payment received from Maya Smith", "1 Sep 2026 · 11:06", 22000],
    ["Partial payment received for The Mews 3", "16 Sep 2026 · 14:22", 5000],
  ],
};

function PageCard({ children, className = "" }) {
  return (
    <section
      className={`rounded-[14px] border border-[#e1e7e3] bg-white p-4 shadow-[0_6px_18px_rgba(15,23,42,.04)] ${className}`}
    >
      {children}
    </section>
  );
}

function CardTitle({ icon: Icon, children, action }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#edf8f2] text-[#17613f]">
          <Icon size={18} />
        </span>
        <h2 className="truncate text-base font-semibold tracking-[-.025em] text-[#18251e]">
          {children}
        </h2>
      </div>
      {action}
    </div>
  );
}

function TextAction({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-[#075b40] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075b40]"
    >
      {children}
      <ChevronRight size={16} />
    </button>
  );
}

function SummaryCard({ icon, title, children, className = "" }) {
  return (
    <PageCard className={className}>
      <CardTitle icon={icon}>{title}</CardTitle>
      {children}
    </PageCard>
  );
}

function statusStyle(status) {
  if (status === "Paid") return "bg-[#ecfaf2] text-[#17613f]";
  if (status === "Attention") return "bg-[#fff3e3] text-[#a55b07]";
  return "bg-[#f0f3f1] text-[#64716a]";
}

export default function LandlordRentStatementsPage({ onNavigate }) {
  const data = mockFinancialPageData;
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [openMenu, setOpenMenu] = useState("");
  const rows = useMemo(
    () =>
      data.rentRoll.filter((row) => {
        const propertyMatches =
          propertyFilter === "all" || row.id === propertyFilter;
        const statusMatches =
          statusFilter === "all" || row.status.toLowerCase() === statusFilter;
        const needle = query.trim().toLowerCase();
        return (
          propertyMatches &&
          statusMatches &&
          (!needle ||
            `${row.property} ${row.tenant}`.toLowerCase().includes(needle))
        );
      }),
    [propertyFilter, query, statusFilter],
  );
  const downloadNotice = () => onNavigate?.("documents");

  return (
    <div className="mx-auto max-w-[1440px] space-y-3 pb-3">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.15em] text-[#63716a]">
            Financials
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-.05em] text-[#142219] sm:text-[2.35rem]">
            Rent &amp; statements
          </h1>
          <p className="mt-1 text-base text-[#5c6961]">
            A clear view of rent, payments and owner statements across your
            portfolio.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#dce4df] bg-white px-3 text-sm font-semibold text-[#33463a]"
          >
            <CalendarDays size={17} />
            {data.periodLabel}
          </button>
          <button
            type="button"
            onClick={downloadNotice}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#17613f] bg-white px-3 text-sm font-semibold text-[#075b40]"
          >
            <Download size={17} />
            Download statement
          </button>
        </div>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <SummaryCard
          icon={WalletCards}
          title="Rent collection"
          className="bg-[#f0fbf5]"
        >
          <p className="mt-4 text-2xl font-semibold tracking-[-.045em] text-[#16251b]">
            {money(data.collection.collected)} collected
          </p>
          <p className="mt-1 text-sm text-[#506158]">
            of {money(data.collection.expected)} expected
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#dce8e0]">
              <div
                className="h-full rounded-full bg-[#198754]"
                style={{ width: `${data.collection.percentage}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-[#26382d]">
              {data.collection.percentage}%
            </span>
          </div>
          <p className="mt-3 inline-flex items-center gap-2 text-sm text-[#a65b09]">
            <CircleAlert size={16} />
            {data.collection.attention}
          </p>
          <div className="mt-3 border-t border-[#dce8e0] pt-2">
            <TextAction onClick={() => setStatusFilter("attention")}>
              View rent roll
            </TextAction>
          </div>
        </SummaryCard>
        <SummaryCard icon={CircleAlert} title="Outstanding">
          <p className="mt-4 text-2xl font-semibold tracking-[-.045em] text-[#22231f]">
            {money(data.outstanding.amount)}
          </p>
          <p className="mt-1 text-sm text-[#536159]">
            {data.outstanding.tenancies} tenancy
          </p>
          <p className="mt-3 rounded-lg bg-[#fff4e2] px-3 py-2 text-sm font-medium text-[#76501d]">
            <Building2 className="mr-2 inline" size={16} />
            {data.outstanding.property}
          </p>
          <div className="mt-3 border-t border-[#edf0ee] pt-2">
            <TextAction onClick={() => setStatusFilter("attention")}>
              Review balance
            </TextAction>
          </div>
        </SummaryCard>
        <SummaryCard icon={Landmark} title="Next owner disbursement">
          <p className="mt-4 text-2xl font-semibold tracking-[-.045em] text-[#22231f]">
            {money(data.disbursement.amount)}
          </p>
          <p className="mt-1 text-sm text-[#536159]">{data.disbursement.due}</p>
          <span className="mt-3 inline-flex rounded-full bg-[#ecfaf2] px-2.5 py-1 text-xs font-semibold text-[#17613f]">
            {data.disbursement.status}
          </span>
          <div className="mt-3 border-t border-[#edf0ee] pt-2">
            <TextAction onClick={() => setOpenMenu("breakdown")}>
              View breakdown
            </TextAction>
          </div>
        </SummaryCard>
        <SummaryCard icon={Banknote} title="Year to date">
          <p className="mt-4 text-2xl font-semibold tracking-[-.045em] text-[#22231f]">
            {money(data.yearToDate.collected)} collected
          </p>
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-[#edf8f2] px-3 py-2 text-sm font-medium text-[#17613f]">
            <CheckCircle2 size={17} />
            {data.yearToDate.status}
          </p>
          <div className="mt-3 border-t border-[#edf0ee] pt-2">
            <TextAction onClick={() => setOpenMenu("performance")}>
              View financial performance
            </TextAction>
          </div>
        </SummaryCard>
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.75fr)_minmax(330px,.75fr)]">
        <PageCard className="min-w-0">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
            <div>
              <CardTitle icon={Building2}>Rent roll</CardTitle>
              <p className="mt-1 text-sm text-[#63716a]">{data.periodLabel}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <select
                value={propertyFilter}
                onChange={(event) => setPropertyFilter(event.target.value)}
                className="min-h-10 rounded-lg border border-[#dce4df] bg-white px-3 text-sm text-[#34463a]"
              >
                <option value="all">All properties</option>
                {data.rentRoll.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.property}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="min-h-10 rounded-lg border border-[#dce4df] bg-white px-3 text-sm text-[#34463a]"
              >
                <option value="all">All statuses</option>
                <option value="paid">Paid</option>
                <option value="available">Available</option>
                <option value="attention">Attention</option>
              </select>
              <label className="flex min-h-10 items-center gap-2 rounded-lg border border-[#dce4df] bg-white px-3 text-sm text-[#6d796f]">
                <Search size={16} />
                <span className="sr-only">Search rent roll</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search"
                  className="min-w-0 flex-1 bg-transparent outline-none"
                />
              </label>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="hidden min-w-[780px] w-full text-left text-sm md:table">
              <thead className="bg-[#f5f7f5] text-xs font-semibold text-[#647169]">
                <tr>
                  {[
                    "Property",
                    "Tenant",
                    "Expected",
                    "Received",
                    "Balance",
                    "Status",
                    "Actions",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="px-3 py-3 first:rounded-l-lg last:rounded-r-lg"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0ee]">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={row.image}
                          alt=""
                          className="h-10 w-10 rounded-md object-cover"
                        />
                        <span className="font-semibold text-[#25342b]">
                          {row.property}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[#506158]">{row.tenant}</td>
                    <td className="px-3 py-2.5 font-medium">
                      {money(row.expected)}
                    </td>
                    <td className="px-3 py-2.5 font-medium">
                      {row.received === null ? "—" : money(row.received)}
                    </td>
                    <td className="px-3 py-2.5 font-medium">
                      {row.balance === null ? "—" : money(row.balance)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(row.status)}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="relative px-3 py-2.5">
                      <button
                        type="button"
                        aria-label={`Actions for ${row.property}`}
                        onClick={() =>
                          setOpenMenu(openMenu === row.id ? "" : row.id)
                        }
                        className="grid h-9 w-9 place-items-center rounded-lg text-[#304137] hover:bg-[#eef3ef]"
                      >
                        <MoreVertical size={18} />
                      </button>
                      {openMenu === row.id ? (
                        <div className="absolute right-3 top-11 z-20 w-52 rounded-xl border border-[#dfe6e1] bg-white p-1.5 shadow-lg">
                          <button
                            type="button"
                            onClick={() => onNavigate?.("properties")}
                            className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-[#f3f6f3]"
                          >
                            <Building2 size={16} />
                            View property
                          </button>
                          <button
                            type="button"
                            onClick={() => setOpenMenu("")}
                            className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-[#f3f6f3]"
                          >
                            <WalletCards size={16} />
                            View payment history
                          </button>
                          <button
                            type="button"
                            onClick={downloadNotice}
                            className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-[#f3f6f3]"
                          >
                            <FileText size={16} />
                            View statement
                          </button>
                          <button
                            type="button"
                            onClick={() => onNavigate?.("messages")}
                            className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-[#f3f6f3]"
                          >
                            <MessageCircle size={16} />
                            Message rental team
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="grid gap-3 md:hidden">
              {rows.map((row) => (
                <article
                  key={row.id}
                  className="rounded-xl border border-[#e5ebe7] p-3"
                >
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#24342a]">
                        {row.property}
                      </p>
                      <p className="mt-1 text-sm text-[#647168]">
                        {row.tenant}
                      </p>
                    </div>
                    <span
                      className={`h-fit rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(row.status)}`}
                    >
                      {row.status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <span>
                      <small className="block text-[#748078]">Expected</small>
                      {money(row.expected)}
                    </span>
                    <span>
                      <small className="block text-[#748078]">Received</small>
                      {row.received === null ? "—" : money(row.received)}
                    </span>
                    <span>
                      <small className="block text-[#748078]">Balance</small>
                      {row.balance === null ? "—" : money(row.balance)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>
          {!rows.length ? (
            <p className="py-8 text-center text-sm text-[#6a776f]">
              No rent roll entries match these filters.
            </p>
          ) : null}
        </PageCard>
        <div className="grid content-start gap-3">
          <PageCard>
            <CardTitle
              icon={ReceiptText}
              action={
                <TextAction onClick={downloadNotice}>View all</TextAction>
              }
            >
              Latest statements
            </CardTitle>
            <div className="mt-3 divide-y divide-[#edf0ee]">
              {data.statements.map(([title, detail, action]) => (
                <div
                  key={title}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <FileText className="shrink-0 text-[#17613f]" size={18} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#2c3a31]">
                        {title}
                      </p>
                      <p className="mt-0.5 text-xs text-[#728078]">{detail}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={downloadNotice}
                    className="shrink-0 text-sm font-semibold text-[#075b40] underline underline-offset-4"
                  >
                    {action}
                  </button>
                </div>
              ))}
            </div>
          </PageCard>
          <PageCard>
            <CardTitle
              icon={Clock3}
              action={
                <TextAction onClick={() => setOpenMenu("activity")}>
                  View all
                </TextAction>
              }
            >
              Recent financial activity
            </CardTitle>
            <div className="mt-3 divide-y divide-[#edf0ee]">
              {data.activity.map(([title, detail, amount]) => (
                <div
                  key={title}
                  className="flex items-start justify-between gap-3 py-3 first:pt-0"
                >
                  <div className="flex gap-2.5">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#edf8f2] text-[#17613f]">
                      <Banknote size={16} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[#2c3a31]">
                        {title}
                      </p>
                      <p className="mt-0.5 text-xs text-[#728078]">{detail}</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-[#17613f]">
                    {money(amount)}
                  </span>
                </div>
              ))}
            </div>
          </PageCard>
        </div>
      </div>
      <section className="flex flex-col justify-between gap-3 rounded-[14px] border border-[#cde9da] bg-[#effaf3] px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex gap-3">
          <FileText className="mt-0.5 shrink-0 text-[#17613f]" size={20} />
          <div>
            <p className="font-semibold text-[#24352b]">
              Need a detailed breakdown?
            </p>
            <p className="mt-1 text-sm text-[#5f7166]">
              Download a full owner statement for your records.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={downloadNotice}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#07533a] px-4 text-sm font-semibold text-white"
        >
          <Download size={16} />
          Download statement
        </button>
      </section>
    </div>
  );
}
