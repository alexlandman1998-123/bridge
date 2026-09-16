import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Download,
  FileText,
  FileUp,
  Search,
  ShieldCheck,
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
const tone = (status) =>
  ["signed", "current", "verified"].includes(status)
    ? "bg-[color-mix(in_srgb,var(--tenant-accent)_20%,white)] text-[var(--tenant-primary)]"
    : ["action_required", "awaiting_upload", "awaiting_signature"].includes(
          status,
        )
      ? "bg-[#fff4df] text-[#925a0d]"
      : "bg-[#f3f4f3] text-[#657069]";
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
function Status({ children, value }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone(value)}`}
    >
      {children}
    </span>
  );
}

export default function TenantDocumentsPage({
  data = {},
  onNavigate,
  demo = false,
}) {
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState("");
  const [notice, setNotice] = useState("");
  const docs = data.documents || [];
  const categories = [
    "all",
    "lease",
    "payments",
    "inspections",
    "personal",
    "property",
    "other",
  ];
  const visible = useMemo(
    () =>
      docs.filter(
        (doc) =>
          (category === "all" || doc.category === category) &&
          doc.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [docs, category, query],
  );
  const attention = data.documentAttention || null;
  const themeStyle = {
    "--tenant-primary": data.branding?.primaryColour || "#071E1A",
    "--tenant-accent": data.branding?.accentColour || "#64B992",
  };
  const open = (doc) => {
    if (doc.link) window.open(doc.link, "_blank", "noopener,noreferrer");
    else
      setNotice(
        doc.reportAvailable
          ? "This document is not available yet."
          : "This demo document has no downloadable production file.",
      );
  };
  return (
    <div
      style={themeStyle}
      className="mx-auto max-w-[1440px] space-y-4 pb-3 sm:space-y-5"
    >
      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={() =>
            setNotice(
              demo
                ? "Demo upload flow: choose a document type and file to continue."
                : "Document uploads will be available once tenant-scoped secure storage is connected.",
            )
          }
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--tenant-primary)] px-4 text-sm font-semibold text-white"
        >
          <FileUp size={17} />
          Upload document
        </button>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(270px,.75fr)_minmax(240px,.65fr)]">
        {attention ? (
          <Card className="border-[#f0ddba] bg-[#fffaf0]">
            <div className="flex gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fff0d3] text-[#a76610]">
                <AlertTriangle size={20} />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.12em] text-[#824d13]">
                  Needs your attention
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-.03em] text-[#322714]">
                  {attention.title}
                </h2>
                <p className="mt-1 text-sm text-[#6e5c3c]">
                  {attention.detail}
                </p>
                <p className="mt-3 text-sm font-semibold text-[#513510]">
                  Due {date(attention.dueOn)}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setNotice(
                        demo
                          ? "Demo upload flow: proof of residence selected."
                          : "Document uploads will be available once tenant-scoped secure storage is connected.",
                      )
                    }
                    className="min-h-10 rounded-lg bg-[var(--tenant-primary)] px-4 text-sm font-semibold text-white"
                  >
                    Upload now
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotice(attention.requirements)}
                    className="min-h-10 rounded-lg border border-[#a77935] px-4 text-sm font-semibold text-[#674510]"
                  >
                    View requirements
                  </button>
                </div>
                <p className="mt-3 text-xs text-[#80663e]">
                  PDF, JPG or PNG · Maximum 10 MB
                </p>
              </div>
            </div>
          </Card>
        ) : (
          <Card>
            <Heading icon={CheckCircle2}>Your documents are up to date</Heading>
            <p className="mt-3 text-sm text-[#607166]">
              There is nothing requiring your attention.
            </p>
          </Card>
        )}
        <Card>
          <Heading icon={FileText}>Important documents</Heading>
          <div className="mt-3 divide-y divide-[#edf0ee]">
            {docs
              .filter((doc) => doc.important)
              .slice(0, 3)
              .map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => open(doc)}
                  className="flex min-h-12 w-full items-center justify-between gap-3 text-left"
                >
                  <span className="truncate text-sm font-semibold text-[#2a382f]">
                    {doc.name}
                  </span>
                  <Status value={doc.status}>{label(doc.status)}</Status>
                </button>
              ))}
            {!docs.some((doc) => doc.important) ? (
              <p className="py-3 text-sm text-[#607166]">
                Important shared documents will appear here.
              </p>
            ) : null}
          </div>
        </Card>
        <Card>
          <Heading icon={ShieldCheck}>Document summary</Heading>
          <div className="mt-4 grid gap-3 text-sm text-[#435249]">
            <p>
              <strong className="text-lg text-[#1c2c22]">{docs.length}</strong>{" "}
              documents
            </p>
            <p>
              <strong className="text-lg text-[#1c2c22]">
                {docs.filter((doc) => doc.sharedThisMonth).length}
              </strong>{" "}
              shared this month
            </p>
            <p>
              <strong className="text-lg text-[#a76610]">
                {attention ? 1 : 0}
              </strong>{" "}
              action required
            </p>
          </div>
        </Card>
      </div>
      <Card>
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <Heading icon={FileText}>Document library</Heading>
          <div className="flex flex-wrap gap-2">
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-[#e2e6e3] p-1">
              {categories.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setCategory(item)}
                  className={`min-h-9 shrink-0 rounded-md px-3 text-sm font-semibold ${category === item ? "bg-[var(--tenant-primary)] text-white" : "text-[#5d685f]"}`}
                >
                  {item === "all" ? "All" : label(item)}{" "}
                  {item === "all"
                    ? docs.length
                    : docs.filter((doc) => doc.category === item).length}
                </button>
              ))}
            </div>
            <label className="flex min-h-10 items-center gap-2 rounded-lg border border-[#e2e6e3] px-3 text-sm text-[#68716b]">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-32 border-0 p-0 outline-none"
                placeholder="Search documents"
              />
            </label>
          </div>
        </div>
        <div className="mt-4 divide-y divide-[#edf0ee]">
          {visible.map((doc) => (
            <article key={doc.id} className="py-4 first:pt-0">
              <button
                type="button"
                onClick={() => setExpanded(expanded === doc.id ? "" : doc.id)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div className="flex min-w-0 gap-3">
                  <FileText
                    className="mt-0.5 shrink-0 text-[var(--tenant-primary)]"
                    size={19}
                  />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#19271f]">
                      {doc.name}
                    </p>
                    <p className="mt-1 text-sm text-[#64716a]">
                      {label(doc.category)} · {date(doc.createdAt)} ·{" "}
                      {doc.sharedBy}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Status value={doc.status}>{label(doc.status)}</Status>
                  <ChevronDown
                    className={
                      expanded === doc.id
                        ? "rotate-180 transition"
                        : "transition"
                    }
                    size={18}
                  />
                </div>
              </button>
              {expanded === doc.id ? (
                <div className="mt-4 grid gap-4 rounded-xl bg-[#fafafa] p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div>
                    <p className="font-semibold text-[#25332b]">{doc.name}</p>
                    <p className="mt-2 text-sm text-[#5c695f]">
                      {doc.version || "Current version"} ·{" "}
                      {doc.fileType || "Document"} · shared{" "}
                      {date(doc.createdAt)}
                    </p>
                    <p className="mt-2 flex items-center gap-2 text-sm text-[#4c6254]">
                      <ShieldCheck size={16} />
                      Stored securely
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:flex-col">
                    <button
                      type="button"
                      onClick={() => open(doc)}
                      className="min-h-10 rounded-lg bg-[var(--tenant-primary)] px-3 text-sm font-semibold text-white"
                    >
                      Open document
                    </button>
                    <button
                      type="button"
                      onClick={() => open(doc)}
                      className="min-h-10 rounded-lg border border-[var(--tenant-primary)] px-3 text-sm font-semibold text-[var(--tenant-primary)]"
                    >
                      <Download className="mr-1 inline" size={15} />
                      Download
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          ))}
          {!visible.length ? (
            <p className="py-5 text-sm text-[#607166]">
              No documents match this view.
            </p>
          ) : null}
        </div>
      </Card>
      <section className="flex flex-col justify-between gap-3 rounded-[14px] border border-[#dce9df] bg-white px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex gap-3">
          <CircleHelp
            className="mt-0.5 shrink-0 text-[var(--tenant-primary)]"
            size={20}
          />
          <div>
            <p className="font-semibold text-[#26362d]">
              Can’t find a document?
            </p>
            <p className="mt-1 text-sm text-[#627068]">
              Send your rental team a message and they’ll help you locate it.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("messages")}
          className="min-h-10 rounded-lg bg-[var(--tenant-primary)] px-4 text-sm font-semibold text-white"
        >
          Message the team
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
