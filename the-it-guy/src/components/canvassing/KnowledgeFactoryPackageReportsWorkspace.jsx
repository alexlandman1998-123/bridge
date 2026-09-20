import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useWorkspace } from "../../context/WorkspaceContext";
import {
  convertKnowledgeFactoryReportToProspect,
  downloadKnowledgeFactoryCompletedReport,
  listKnowledgeFactoryCompletedReports,
} from "../../services/propertyIntelligence/knowledgeFactoryReportConversionService";
import Field from "../ui/Field";
import Modal from "../ui/Modal";

function text(value = "") {
  return String(value || "").trim();
}
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-ZA", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `R${amount.toLocaleString("en-ZA")}`
    : "Not supplied";
}

function reportDate(value) {
  if (!value) return "Not supplied";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? text(value)
    : new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(parsed);
}

function DetailRow({ label, value }) {
  const display = Array.isArray(value)
    ? value.filter(Boolean).join(" / ")
    : value;
  const hasValue = display !== undefined && display !== null && display !== "";
  return (
    <div className="grid gap-1 border-b border-slate-100 py-2.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="break-words text-sm text-slate-800">{hasValue ? display : "Not supplied"}</dd>
    </div>
  );
}

function ReportReviewModal({ report, downloading, onClose, onDownload }) {
  if (!report) return null;
  const property = report.report_data?.property || {};
  const owners = Array.isArray(report.report_data?.owners)
    ? report.report_data.owners
    : [];
  const valuation = report.report_data?.municipalValuation || {};
  const transactions = Array.isArray(report.report_data?.transactions)
    ? report.report_data.transactions
    : [];
  const finance = report.report_data?.finance || {};
  const signals = report.opportunity_signals || {};
  const definition = report.report_definition_snapshot || {};
  const context = report.request_context_snapshot || {};
  const isFull = report.product_id === "full_canvassing_report";
  const pdfAvailable = report.report_snapshot_version === "canvassing-report-v1";
  return (
    <Modal
      open
      onClose={() => {
        if (!downloading) onClose?.();
      }}
      title="Property report review"
      subtitle={property.address || `Property ${report.property_id}`}
      className="max-w-3xl"
    >
      <div className="max-h-[68vh] space-y-5 overflow-y-auto pr-1">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
          This is the saved UAT report snapshot. Reviewing or downloading it does not make another supplier request or use more supplier credits.
        </div>
        <section>
          <h3 className="text-sm font-semibold text-slate-900">Report record</h3>
          <dl className="mt-2">
            <DetailRow label="Package" value={definition.name || report.product_id?.replace(/_/g, " ")} />
            <DetailRow label="Generated" value={formatDate(report.executed_at)} />
            <DetailRow label="Business purpose" value={context.requestPurpose} />
            <DetailRow label="Supplier credits used" value={Number.isFinite(Number(report.credits_consumed)) ? report.credits_consumed : "Not supplied"} />
          </dl>
        </section>
        <section>
          <h3 className="text-sm font-semibold text-slate-900">Property identity</h3>
          <dl className="mt-2">
            <DetailRow label="Property ID" value={property.propertyId || report.property_id} />
            <DetailRow label="Address" value={property.address} />
            <DetailRow label="Suburb / town" value={[property.suburb, property.town]} />
            <DetailRow label="Province / postal code" value={[property.province, property.postalCode]} />
            <DetailRow label="Property type / extent" value={[property.type, property.extent ? `${property.extent} sqm` : ""]} />
          </dl>
        </section>
        <section>
          <h3 className="text-sm font-semibold text-slate-900">Current ownership</h3>
          <dl className="mt-2">
            {owners.length ? owners.map((owner, index) => (
              <DetailRow key={`${owner?.name || "owner"}-${index}`} label={`Owner ${index + 1}`} value={[owner?.name, owner?.type, owner?.share ? `Share: ${owner.share}` : ""]} />
            )) : <DetailRow label="Owner record" value="No current owner record was supplied in this saved snapshot." />}
            <DetailRow label="Ownership registered" value={reportDate(signals.ownershipRegisteredAt)} />
            <DetailRow label="Approximate tenure" value={Number.isFinite(Number(signals.ownershipTenureYears)) ? `${signals.ownershipTenureYears} years` : "Not supplied"} />
          </dl>
        </section>
        {isFull ? <>
          <section>
            <h3 className="text-sm font-semibold text-slate-900">Municipal valuation and zoning</h3>
            <dl className="mt-2">
              <DetailRow label="Municipal valuation" value={money(valuation.value)} />
              <DetailRow label="Valuation date" value={reportDate(valuation.date)} />
              <DetailRow label="Municipality / zoning" value={[valuation.municipality, valuation.zoning]} />
            </dl>
          </section>
          <section>
            <h3 className="text-sm font-semibold text-slate-900">Transfer and finance indicators</h3>
            <dl className="mt-2">
              {transactions.length ? transactions.map((transaction, index) => <DetailRow key={`${transaction?.registeredAt || "transfer"}-${index}`} label={`Transfer ${index + 1}`} value={[transaction?.registeredAt ? `Registered ${reportDate(transaction.registeredAt)}` : "", Number.isFinite(Number(transaction?.purchaseAmount)) ? money(transaction.purchaseAmount) : "", transaction?.isCurrentOwner ? "Current ownership record" : ""]} />) : <DetailRow label="Transfer history" value="No transfer timeline was supplied in this saved snapshot." />}
              <DetailRow label="Current finance indicator" value={finance.hasCurrentBond === true ? "Recorded" : "No record supplied"} />
              <DetailRow label="Current bond count" value={finance.currentBondCount} />
            </dl>
          </section>
        </> : null}
        <section>
          <h3 className="text-sm font-semibold text-slate-900">Scope and provenance</h3>
          <dl className="mt-2">
            <DetailRow label="Snapshot version" value={report.report_snapshot_version} />
            <DetailRow label="Definition version" value={definition.definitionVersion} />
            <DetailRow label="Cost-validation recipe" value={definition.costValidationRecipeId} />
            <DetailRow label="Not included" value={Array.isArray(definition.excludedFields) ? definition.excludedFields.join("; ") : "Not supplied"} />
          </dl>
        </section>
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
        <button type="button" disabled={!pdfAvailable || downloading} onClick={() => void onDownload?.(report)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1769dc] px-4 text-sm font-semibold text-white disabled:bg-slate-300" title={pdfAvailable ? "Download the reviewed saved snapshot" : "This older report cannot be rendered from a complete saved snapshot"}>
          {downloading ? <LoaderCircle className="animate-spin" size={16} /> : <Download size={16} />}
          {downloading ? "Preparing PDF..." : "Download PDF"}
        </button>
        <button type="button" disabled={downloading} onClick={onClose} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">Close</button>
      </div>
    </Modal>
  );
}

function ConversionModal({ report, saving, error, onClose, onSubmit }) {
  const [draft, setDraft] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    nextFollowUpDate: "",
    followUpPriority: "Medium",
    followUpNote: "Review property context and plan first contact.",
  });
  if (!report) return null;
  const property = report.report_data?.property || {};
  return (
    <Modal
      open
      onClose={() => {
        if (!saving) onClose?.();
      }}
      title="Create canvassing prospect"
      subtitle={property.address || `Property ${report.property_id}`}
      className="max-w-2xl"
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit?.(draft);
        }}
      >
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
          <div className="flex gap-2">
            <ShieldCheck className="mt-0.5 shrink-0" size={17} />
            <p>
              The property context is linked to the new prospect. Owner and
              contact details are not copied from the supplier report; enter
              only contact information you independently hold and may use.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            First name
            <Field
              required
              value={draft.firstName}
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  firstName: event.target.value,
                }))
              }
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Last name
            <Field
              required
              value={draft.lastName}
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  lastName: event.target.value,
                }))
              }
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Phone <span className="font-normal text-slate-400">(optional)</span>
            <Field
              type="tel"
              value={draft.phone}
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  phone: event.target.value,
                }))
              }
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Email <span className="font-normal text-slate-400">(optional)</span>
            <Field
              type="email"
              value={draft.email}
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  email: event.target.value,
                }))
              }
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Follow-up date
            <Field
              type="date"
              value={draft.nextFollowUpDate}
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  nextFollowUpDate: event.target.value,
                }))
              }
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Priority
            <Field
              as="select"
              value={draft.followUpPriority}
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  followUpPriority: event.target.value,
                }))
              }
            >
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
              <option>Urgent</option>
            </Field>
          </label>
        </div>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          First-contact note
          <Field
            as="textarea"
            rows={3}
            value={draft.followUpNote}
            onChange={(event) =>
              setDraft((previous) => ({
                ...previous,
                followUpNote: event.target.value,
              }))
            }
          />
        </label>
        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          >
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1769dc] px-4 text-sm font-semibold text-white disabled:bg-slate-300"
          >
            {saving ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <UserPlus size={16} />
            )}
            {saving ? "Creating…" : "Create prospect"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function KnowledgeFactoryPackageReportsWorkspace({
  onProspectCreated,
}) {
  const { currentWorkspace } = useWorkspace();
  const organisationId =
    currentWorkspace?.organisationId ||
    currentWorkspace?.organisation_id ||
    currentWorkspace?.id ||
    "";
  const [state, setState] = useState({
    status: "loading",
    items: [],
    error: "",
  });
  const [conversion, setConversion] = useState({
    report: null,
    saving: false,
    error: "",
  });
  const [downloadingReportId, setDownloadingReportId] = useState("");
  const [reviewingReport, setReviewingReport] = useState(null);

  async function load() {
    if (!organisationId) return;
    setState((previous) => ({ ...previous, status: "loading", error: "" }));
    try {
      const result = await listKnowledgeFactoryCompletedReports({
        organisationId,
      });
      setState({
        status: "ready",
        items: Array.isArray(result.items) ? result.items : [],
        error: "",
      });
    } catch (error) {
      setState({
        status: "error",
        items: [],
        error: error?.message || "Completed reports are unavailable.",
      });
    }
  }

  useEffect(() => {
    void load();
  }, [organisationId]);

  async function convert(draft) {
    const report = conversion.report;
    if (!report || conversion.saving) return;
    setConversion((previous) => ({ ...previous, saving: true, error: "" }));
    try {
      const result = await convertKnowledgeFactoryReportToProspect({
        organisationId,
        reportResultId: report.id,
        ...draft,
      });
      onProspectCreated?.(result.prospect, result.activity || null);
      setConversion({ report: null, saving: false, error: "" });
      await load();
    } catch (error) {
      setConversion((previous) => ({
        ...previous,
        saving: false,
        error:
          error?.message || "The canvassing prospect could not be created.",
      }));
    }
  }

  async function download(report) {
    if (!report?.id || downloadingReportId) return;
    setDownloadingReportId(report.id);
    try {
      const result = await downloadKnowledgeFactoryCompletedReport({
        organisationId,
        reportResultId: report.id,
      });
      const { downloadKnowledgeFactoryReportPdf } = await import(
        "../../services/propertyIntelligence/knowledgeFactoryReportPdf"
      );
      downloadKnowledgeFactoryReportPdf(result.report);
    } catch (error) {
      setState((previous) => ({
        ...previous,
        error: error?.message || "The saved report could not be downloaded.",
      }));
    } finally {
      setDownloadingReportId("");
    }
  }

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white shadow-sm"
      data-canvassing-workspace="knowledge-factory-package-reports"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Completed reports
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Review a completed package, then explicitly create one seller
            prospect from it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </header>
      {state.error ? (
        <p className="m-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertTriangle size={17} /> {state.error}
        </p>
      ) : null}
      {state.status === "loading" ? (
        <div className="grid min-h-48 place-items-center text-sm text-slate-500">
          <LoaderCircle className="animate-spin" size={18} />
        </div>
      ) : state.items.length ? (
        <div className="divide-y divide-slate-100">
          {state.items.map((report) => {
            const property = report.report_data?.property || {};
            const converted = report.conversion?.status === "converted";
            return (
              <article key={report.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {property.address || `Property ${report.property_id}`}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {report.product_id.replace(/_/g, " ")} ·{" "}
                      {formatDate(report.executed_at)}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    Completed
                  </span>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-xs text-slate-500">Suburb</dt>
                    <dd className="mt-1 font-medium text-slate-800">
                      {property.suburb || "Not supplied"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Property type</dt>
                    <dd className="mt-1 font-medium text-slate-800">
                      {property.type || "Not supplied"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">
                      Municipal valuation
                    </dt>
                    <dd className="mt-1 font-medium text-slate-800">
                      {money(report.report_data?.municipalValuation?.value)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Supplier credits</dt>
                    <dd className="mt-1 font-medium text-slate-800">
                      {Number.isFinite(Number(report.credits_consumed))
                        ? report.credits_consumed
                        : "Not supplied"}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewingReport(report)}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Eye size={16} /> Review report
                  </button>
                  <button
                    type="button"
                    disabled={
                      report.report_snapshot_version !== "canvassing-report-v1" ||
                      Boolean(downloadingReportId)
                    }
                    onClick={() => void download(report)}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#1769dc] px-3 text-sm font-semibold text-white hover:bg-[#1257b7] disabled:cursor-default disabled:bg-slate-300"
                    title={
                      report.report_snapshot_version === "canvassing-report-v1"
                        ? "Download saved property intelligence report"
                        : "This older report cannot be rendered from a complete saved snapshot"
                    }
                  >
                    {downloadingReportId === report.id ? (
                      <LoaderCircle className="animate-spin" size={16} />
                    ) : (
                      <Download size={16} />
                    )}
                    {downloadingReportId === report.id
                      ? "Preparing PDF..."
                      : "Download PDF"}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(report.conversion) || converted}
                    onClick={() =>
                      setConversion({ report, saving: false, error: "" })
                    }
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-default disabled:border-emerald-200 disabled:bg-emerald-50 disabled:text-emerald-700"
                  >
                    {converted ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      <UserPlus size={16} />
                    )}
                    {converted
                      ? "Added to Canvassing"
                      : "Create canvassing prospect"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="grid min-h-72 place-items-center p-6 text-center text-sm text-slate-500">
          <div>
            <FileText className="mx-auto text-slate-400" size={24} />
            <p className="mt-3 font-medium text-slate-700">
              No completed package reports yet.
            </p>
            <p className="mt-1">
              Run a confirmed UAT report from Property Search first.
            </p>
          </div>
        </div>
      )}
      <ConversionModal
        report={conversion.report}
        saving={conversion.saving}
        error={conversion.error}
        onClose={() =>
          setConversion({ report: null, saving: false, error: "" })
        }
        onSubmit={convert}
      />
      <ReportReviewModal
        report={reviewingReport}
        downloading={downloadingReportId === reviewingReport?.id}
        onClose={() => setReviewingReport(null)}
        onDownload={download}
      />
    </section>
  );
}
