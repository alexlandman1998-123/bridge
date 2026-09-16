import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  Eye,
  FileText,
  MessageCircle,
  MoreVertical,
  Search,
  Share2,
  Upload,
} from "lucide-react";
import { useMemo, useState } from "react";

const mockDocuments = {
  attention: {
    title: "Insurance policy renewal",
    property: "Harbour Heights · Apartment 14",
    copy: "Your landlord policy renews on 15 February 2027.",
  },
  important: [
    ["September 2026 owner statement", "Available"],
    ["Signed lease agreement", "Signed"],
    ["Move-in inspection report", "Available"],
  ],
  summary: { total: 46, shared: 4, actions: 1 },
  library: [
    {
      id: "statement",
      name: "September 2026 owner statement.pdf",
      property: "Portfolio",
      category: "Statements",
      date: "20 Sep 2026",
      sharedBy: "Only Realty",
      status: "Available",
    },
    {
      id: "lease",
      name: "Signed lease agreement – Harbour Heights 14.pdf",
      property: "Harbour Heights 14",
      category: "Lease",
      date: "1 Aug 2026",
      sharedBy: "Only Realty",
      status: "Signed",
      expanded: true,
    },
    {
      id: "inspection",
      name: "Routine inspection report – Ocean View Villa.pdf",
      property: "Ocean View Villa",
      category: "Inspections",
      date: "14 Sep 2026",
      sharedBy: "Sarah Mokoena",
      status: "Available",
    },
    {
      id: "insurance",
      name: "Santam landlord policy.pdf",
      property: "Harbour Heights 14",
      category: "Insurance",
      date: "15 Feb 2026",
      sharedBy: "Only Realty",
      status: "Current",
    },
    {
      id: "quote",
      name: "Plumbing repair quote – Harbour Heights 14.pdf",
      property: "Harbour Heights 14",
      category: "Maintenance",
      date: "16 Sep 2026",
      sharedBy: "AquaFix Plumbing",
      status: "Awaiting approval",
    },
  ],
};
const categoryStyle = {
  Statements: "bg-[#e6f4ff] text-[#17639a]",
  Lease: "bg-[#e7f8f0] text-[#17613f]",
  Inspections: "bg-[#eeeaff] text-[#5b4aa0]",
  Insurance: "bg-[#fff3dc] text-[#996115]",
  Maintenance: "bg-[#fff0e6] text-[#ac5807]",
  Property: "bg-[#edf2ef] text-[#52645a]",
};
const statusStyle = (status) =>
  status === "Awaiting approval"
    ? "bg-[#fff3e3] text-[#a45a07]"
    : "bg-[#ecfaf2] text-[#17613f]";
function Card({ children, className = "" }) {
  return (
    <section
      className={`rounded-[14px] border border-[#e1e7e3] bg-white p-4 shadow-[0_6px_18px_rgba(15,23,42,.04)] ${className}`}
    >
      {children}
    </section>
  );
}
function Heading({ icon: Icon, children, action }) {
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
function Action({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-[#075b40] underline underline-offset-4"
    >
      {children}
      <ChevronRight size={16} />
    </button>
  );
}
function DocumentPreview() {
  return (
    <div className="flex h-32 w-24 shrink-0 flex-col rounded-md border border-[#e5e6e1] bg-white p-2 shadow-sm">
      <div className="h-5 border-b border-[#d6e8dd] text-center text-[0.42rem] font-semibold text-[#17613f]">
        Arch9 Rentals
      </div>
      <p className="mt-3 text-center text-[0.42rem] font-semibold text-[#2b3a31]">
        RESIDENTIAL LEASE AGREEMENT
      </p>
      <i className="mt-3 h-1 w-full rounded bg-[#dfe5e1]" />
      <i className="mt-1 h-1 w-5/6 rounded bg-[#dfe5e1]" />
      <i className="mt-1 h-1 w-full rounded bg-[#dfe5e1]" />
      <i className="mt-auto h-1 w-1/2 self-end rounded bg-[#98b7a6]" />
    </div>
  );
}

export default function LandlordDocumentsPage({ onNavigate }) {
  const data = mockDocuments;
  const [category, setCategory] = useState("All");
  const [property, setProperty] = useState("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState("lease");
  const [menu, setMenu] = useState("");
  const visible = useMemo(
    () =>
      data.library.filter(
        (item) =>
          (category === "All" || item.category === category) &&
          (property === "all" || item.property === property) &&
          (!query.trim() ||
            `${item.name} ${item.property}`
              .toLowerCase()
              .includes(query.trim().toLowerCase())),
      ),
    [category, property, query],
  );
  const messages = () => onNavigate?.("messages");
  return (
    <div className="mx-auto max-w-[1440px] space-y-3 pb-3">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.15em] text-[#63716a]">
            Documents
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-.05em] text-[#142219] sm:text-[2.35rem]">
            Your documents
          </h1>
          <p className="mt-1 text-base text-[#5c6961]">
            Statements, leases, reports and property records in one secure
            place.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMenu("upload")}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#07533a] px-4 text-sm font-semibold text-white"
        >
          <Upload size={17} />
          Upload document
        </button>
      </header>
      <div className="grid gap-3 lg:grid-cols-[1.15fr_1.1fr_.8fr]">
        <Card className="border-[#f0dec0] bg-[#fffaf1]">
          <Heading icon={CircleAlert}>Needs your attention</Heading>
          <p className="mt-4 text-xl font-semibold tracking-[-.04em] text-[#25251f]">
            {data.attention.title}
          </p>
          <p className="mt-1 text-sm font-medium text-[#4d554e]">
            {data.attention.property}
          </p>
          <p className="mt-3 text-sm text-[#645e52]">{data.attention.copy}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategory("Insurance")}
              className="min-h-10 rounded-lg bg-[#07533a] px-4 text-sm font-semibold text-white"
            >
              Review renewal
            </button>
            <button
              type="button"
              onClick={() => setCategory("Insurance")}
              className="min-h-10 rounded-lg border border-[#3b795e] bg-white px-4 text-sm font-semibold text-[#075b40]"
            >
              View policy
            </button>
          </div>
        </Card>
        <Card>
          <Heading icon={FileText}>Important documents</Heading>
          <div className="mt-3 divide-y divide-[#edf0ee]">
            {data.important.map(([name, status]) => (
              <button
                type="button"
                key={name}
                onClick={() => setQuery(name.split(" ").slice(-2).join(" "))}
                className="flex min-h-12 w-full items-center justify-between gap-2 py-2 text-left"
              >
                <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-[#2c3a31]">
                  <FileText size={17} />
                  {name}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="rounded-full bg-[#ecfaf2] px-2 py-1 text-xs font-semibold text-[#17613f]">
                    {status}
                  </span>
                  <ChevronRight size={16} />
                </span>
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <Heading icon={Clock3}>Document summary</Heading>
          <p className="mt-4 text-2xl font-semibold tracking-[-.045em] text-[#222b24]">
            {data.summary.total} documents
          </p>
          <div className="mt-3 grid gap-2 text-sm">
            <p className="text-[#17613f]">
              <i className="mr-2 inline-block h-2 w-2 rounded-full bg-[#198754]" />
              {data.summary.shared} shared this month
            </p>
            <p className="text-[#a45a07]">
              <i className="mr-2 inline-block h-2 w-2 rounded-full bg-[#d27a00]" />
              {data.summary.actions} action required
            </p>
          </div>
          <div className="mt-4 border-t border-[#edf0ee] pt-2">
            <Action onClick={() => setMenu("activity")}>View activity</Action>
          </div>
        </Card>
      </div>
      <Card className="min-w-0">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <Heading icon={FileText}>Document library</Heading>
          <div className="grid gap-2 sm:grid-cols-3">
            <select
              value={property}
              onChange={(event) => setProperty(event.target.value)}
              className="min-h-10 rounded-lg border border-[#dce4df] bg-white px-3 text-sm"
            >
              <option value="all">All properties</option>
              {[...new Set(data.library.map((item) => item.property))].map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
            <select className="min-h-10 rounded-lg border border-[#dce4df] bg-white px-3 text-sm">
              <option>Newest first</option>
            </select>
            <label className="flex min-h-10 items-center gap-2 rounded-lg border border-[#dce4df] px-3 text-sm">
              <Search size={16} />
              <span className="sr-only">Search documents</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search documents"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
          </div>
        </div>
        <div className="mt-4 flex gap-1 overflow-x-auto rounded-lg bg-[#f3f6f4] p-1">
          {[
            "All",
            "Statements",
            "Lease",
            "Inspections",
            "Insurance",
            "Maintenance",
            "Property",
          ].map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setCategory(name)}
              className={`min-h-9 shrink-0 rounded-md px-3 text-sm font-semibold ${category === name ? "bg-[#07533a] text-white shadow-sm" : "text-[#536159]"}`}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="hidden min-w-[930px] w-full text-left text-sm md:table">
            <thead className="bg-[#f5f7f5] text-xs font-semibold text-[#647169]">
              <tr>
                {[
                  "Document",
                  "Property",
                  "Category",
                  "Date",
                  "Shared by",
                  "Status",
                  "Actions",
                ].map((label) => (
                  <th
                    key={label}
                    className="px-3 py-3 first:rounded-l-lg last:rounded-r-lg"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf0ee]">
              {visible.map((item) => (
                <>
                  <tr key={item.id}>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded(expanded === item.id ? "" : item.id)
                        }
                        className="inline-flex items-center gap-2 font-semibold text-[#2d3d32] hover:underline"
                      >
                        <FileText className="text-[#bd2c24]" size={18} />
                        {item.name}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-[#506158]">
                      {item.property}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${categoryStyle[item.category]}`}
                      >
                        {item.category}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[#506158]">{item.date}</td>
                    <td className="px-3 py-3 text-[#506158]">
                      {item.sharedBy}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(item.status)}`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="relative px-3 py-3">
                      <button
                        type="button"
                        aria-label={`Actions for ${item.name}`}
                        onClick={() => setMenu(menu === item.id ? "" : item.id)}
                        className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#edf3ef]"
                      >
                        <MoreVertical size={18} />
                      </button>
                      {menu === item.id ? (
                        <div className="absolute right-3 top-11 z-20 w-52 rounded-xl border border-[#dfe6e1] bg-white p-1.5 shadow-lg">
                          {[
                            [Eye, "Preview"],
                            [Download, "Download"],
                            [FileText, "View statement details"],
                            [Share2, "Share with rental team"],
                          ].map(([Icon, label]) => (
                            <button
                              type="button"
                              key={label}
                              onClick={() =>
                                label === "Share with rental team"
                                  ? messages()
                                  : setMenu("")
                              }
                              className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-[#f3f6f3]"
                            >
                              <Icon size={16} />
                              {label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                  {expanded === item.id ? (
                    <tr key={`${item.id}-detail`}>
                      <td colSpan="7" className="bg-[#fffcf5] px-5 py-4">
                        <div className="flex flex-wrap items-center gap-5">
                          <DocumentPreview />
                          <div className="min-w-[220px] flex-1">
                            <p className="text-lg font-semibold text-[#27362c]">
                              Signed lease agreement
                            </p>
                            <p className="mt-1 text-sm text-[#607067]">
                              Harbour Heights · Apartment 14
                            </p>
                            <p className="mt-2 text-sm text-[#516158]">
                              Version 2 · Final · 2.4 MB · PDF
                            </p>
                            <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-[#17613f]">
                              <CheckCircle2 size={16} />
                              Signed by Jordan Taylor and Only Realty
                            </p>
                          </div>
                          <div className="grid gap-2">
                            <button
                              type="button"
                              onClick={() => setMenu("open")}
                              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#07533a] px-4 text-sm font-semibold text-white"
                            >
                              <Eye size={16} />
                              Open document
                            </button>
                            <button
                              type="button"
                              onClick={() => setMenu("download")}
                              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#3b795e] bg-white px-4 text-sm font-semibold text-[#075b40]"
                            >
                              <Download size={16} />
                              Download PDF
                            </button>
                            <Action onClick={() => setMenu("signature")}>
                              View signature details
                            </Action>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </>
              ))}
            </tbody>
          </table>
          <div className="grid gap-3 md:hidden">
            {visible.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-[#e4ebe6] p-3"
              >
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="inline-flex items-center gap-2 font-semibold text-[#2d3d32]">
                      <FileText className="text-[#bd2c24]" size={18} />
                      {item.name}
                    </p>
                    <p className="mt-1 text-sm text-[#647168]">
                      {item.property} · {item.date}
                    </p>
                  </div>
                  <span
                    className={`h-fit rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(item.status)}`}
                  >
                    {item.status}
                  </span>
                </div>
                <span
                  className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${categoryStyle[item.category]}`}
                >
                  {item.category}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setExpanded(expanded === item.id ? "" : item.id)
                  }
                  className="mt-3 block text-sm font-semibold text-[#075b40] underline"
                >
                  {expanded === item.id ? "Hide details" : "View details"}
                </button>
                {expanded === item.id ? (
                  <div className="mt-3 border-t pt-3">
                    <p className="text-sm text-[#516158]">
                      Version 2 · Final · 2.4 MB · PDF
                    </p>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
        {!visible.length ? (
          <p className="py-8 text-center text-sm text-[#66736b]">
            No documents match these filters.
          </p>
        ) : null}
      </Card>
      <section className="flex flex-col justify-between gap-3 rounded-[14px] border border-[#cde9da] bg-[#effaf3] px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex gap-3">
          <MessageCircle className="mt-0.5 shrink-0 text-[#17613f]" size={20} />
          <div>
            <p className="font-semibold text-[#24352b]">
              Looking for a document?
            </p>
            <p className="mt-1 text-sm text-[#5f7166]">
              Your rental team can help you find it.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={messages}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#07533a] px-4 text-sm font-semibold text-white"
        >
          <MessageCircle size={16} />
          Message rental team
        </button>
      </section>
    </div>
  );
}
