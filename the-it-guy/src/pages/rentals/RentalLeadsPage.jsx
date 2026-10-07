import RentalLeadActionsMenu from './RentalLeadActionsMenu';
import { recordRentalLeadOutcome } from '../../services/rentals/rentalLeadOutcomeService';
import { RENTAL_LEAD_LOST_REASONS } from '../../services/rentals/rentalLeadOutcomeModel';
import RentalLeadDialog, { INITIAL_RENTAL_LEAD_FORM as INITIAL_FORM, LeadRoleButton } from './RentalLeadDialog';
import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Columns3,
  Filter,
  RefreshCw,
  Table2,
  TrendingUp,
  UserRound,
  X,
  Building2,
  ChevronRight,
  Download,
  Loader2,
  Plus,
  Search,
  Upload,
  Users,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../../context/WorkspaceContext";
import { getRentalListingForAgent } from '../../services/rentals/rentalListingDraftService';
import { buildRentalListingQueryOptions, resolveRentalWorkspaceScope } from "../../services/rentals/rentalWorkspaceScope";
import {
  advanceRentalLead,
  createRentalLead,
  listRentalLeads,
} from "../../services/rentals/rentalLeadService";
import {
  getRentalLeadPipelineStages,
  getNextRentalLeadStage,
  getRentalLeadStageLabel,
} from "../../services/rentals/rentalLeadPipelineModel";
import { getRentalLeadStageEvidenceRequirement } from "../../services/rentals/rentalLeadWorkflowEvidenceModel";
import { mapCsvRowsToImportRows, parseCsvText } from "../../lib/csvImport";
import {
  buildRentalLeadImportAuditContext,
  buildRentalLeadImportPreview,
  createRentalLeadImportTemplateCsv,
} from "../../services/rentals/rentalLeadImportModel";

import { LeadSourceBrand, PropertyThumbnail, StagePill } from "../agency/LeadListPage";

import { filterRentalLeadList, rentalLeadListSummary } from "../../services/rentals/rentalLeadListModel";


function formatCurrency(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0
    ? new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency: "ZAR",
        maximumFractionDigits: 0,
      }).format(amount)
    : "Not captured";
}
function stageTone(stage = "") {
  if (
    [
      "listing_ready",
      "listing_created",
      "placement_ready",
      "fica_complete",
      "mandate_signed",
    ].includes(stage)
  )
    return "border-[#cfe8dc] bg-[#effaf3] text-[#26724c]";
  if (stage.includes("scheduled"))
    return "border-[#d8e5f5] bg-[#eff6ff] text-[#2563a4]";
  if (
    stage.includes("pending") ||
    stage === "contacted" ||
    stage === "qualified"
  )
    return "border-[#efdcb7] bg-[#fff9ec] text-[#8a641d]";
  return "border-[#dbe6f1] bg-[#f8fbff] text-[#4d6782]";
}
function rentalProfile(lead) {
  return lead.role === "landlord"
    ? [
        lead.propertyType || "Property type pending",
        lead.expectedMonthlyRent
          ? formatCurrency(lead.expectedMonthlyRent)
          : "Rent pending",
      ].join(" · ")
    : [
        lead.bedrooms ? `${lead.bedrooms} beds` : "Beds pending",
        lead.monthlyBudget
          ? formatCurrency(lead.monthlyBudget)
          : "Budget pending",
      ].join(" · ");
}

function RentalLeadMetric({ label, value, detail, compare, icon: Icon, tone }) {
  return <article className="min-w-0 rounded-[14px] border border-[#e4ebf2] bg-white/90 px-3 py-2.5 shadow-[0_10px_24px_rgba(24,45,68,0.045)]"><div className="flex items-center justify-between gap-2"><span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">{label}</span><span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] ${tone}`}>{createElement(Icon, { size: 14, "aria-hidden": true })}</span></div><div className="mt-2 flex min-w-0 items-end justify-between gap-3"><strong className="block min-w-0 truncate text-[1.55rem] font-semibold leading-none tracking-[-0.04em] text-[#102236]" title={String(value)}>{value}</strong><span className="truncate text-[0.68rem] font-semibold text-[#6f8398]">{compare}</span></div><p className="mt-1 truncate text-[0.74rem] font-medium text-[#667b92]">{detail}</p></article>
}

function RentalLeadAction({
  lead,
  onAdvance,
  advancing,
  onTerminalAction,
  compact = false,
}) {
  const nextStage = getNextRentalLeadStage(lead);
  const label = nextStage
    ? nextStage === 'viewing_scheduled' ? 'Schedule viewing'
      : nextStage === 'mandate_signed' ? 'Record signed mandate'
        : nextStage === 'listing_created' ? lead.relationships?.listingId ? 'Finish listing handoff' : 'Create listing'
        : `Move to ${getRentalLeadStageLabel(nextStage, lead.role)}`
    : lead.role === "landlord"
      ? lead.relationships?.listingId ? "Open listing" : "Create listing"
      : "Open application workspace";
  return (
    <button
      type="button"
      data-rental-control="lead-stage-action"
      disabled={advancing}
      onClick={(event) => {
        event.stopPropagation();
        nextStage ? onAdvance(lead, nextStage) : onTerminalAction(lead)
      }}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[12px] border border-[#c6d8ea] bg-white px-3 text-xs font-semibold text-[#1f4f78] transition hover:border-[#9fb7d1] hover:bg-[#f6faff] disabled:opacity-60 ${compact ? "h-9" : "min-h-10"}`}
    >
      {advancing ? (
        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
      ) : null}
      {label}
      <ChevronRight size={14} aria-hidden="true" />
    </button>
  );
}


function RentalLeadImportDialog({ preview, importing, onClose, onImport }) {
  if (!preview) return null;
  const { summary, rows } = preview;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-[#0f1f2f]/35 p-4 sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Review rental lead import"
    >
      <section className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[16px] border border-[#dce6f2] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-[#607891]">
              Rental CRM import
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[#18324b]">
              Review lead rows
            </h2>
            <p className="mt-1 text-sm text-[#60758b]">
              Only ready rows will be created. Invalid and possible duplicate
              rows remain excluded for review.
            </p>
          </div>
          <button
            type="button"
            className="ui-pill-button"
            disabled={importing}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-[12px] border border-[#dce6f2] bg-[#f8fbff] p-3">
            <p className="text-xs text-[#60758b]">Rows loaded</p>
            <p className="mt-1 text-lg font-semibold text-[#18324b]">
              {summary.total}
            </p>
          </div>
          <div className="rounded-[12px] border border-[#cfe8dc] bg-[#effaf3] p-3">
            <p className="text-xs text-[#26724c]">Ready</p>
            <p className="mt-1 text-lg font-semibold text-[#26724c]">
              {summary.ready}
            </p>
          </div>
          <div className="rounded-[12px] border border-[#efdcb7] bg-[#fff9ec] p-3">
            <p className="text-xs text-[#8a641d]">Possible duplicates</p>
            <p className="mt-1 text-lg font-semibold text-[#8a641d]">
              {summary.possibleDuplicates}
            </p>
          </div>
          <div className="rounded-[12px] border border-[#f2c6c6] bg-[#fff7f7] p-3">
            <p className="text-xs text-[#9f3131]">Invalid</p>
            <p className="mt-1 text-lg font-semibold text-[#9f3131]">
              {summary.invalid}
            </p>
          </div>
        </div>
        <div className="mt-5 overflow-hidden rounded-[12px] border border-[#e1e8f0]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#f8fbff] text-xs uppercase text-[#607891]">
              <tr>
                <th className="px-3 py-3">Row</th>
                <th className="px-3 py-3">Lead</th>
                <th className="px-3 py-3">Role</th>
                <th className="px-3 py-3">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 30).map((row) => (
                <tr key={row.id} className="border-t border-[#edf2f7]">
                  <td className="px-3 py-3 text-[#60758b]">
                    {row.candidate.rowNumber || "—"}
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-[#20364d]">
                      {[row.candidate.firstName, row.candidate.lastName]
                        .filter(Boolean)
                        .join(" ") || "Unnamed lead"}
                    </p>
                    <p className="mt-0.5 text-xs text-[#60758b]">
                      {row.candidate.email ||
                        row.candidate.phone ||
                        "No contact details"}
                    </p>
                  </td>
                  <td className="px-3 py-3 capitalize text-[#20364d]">
                    {row.candidate.role}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${row.status === "ready" ? "bg-[#effaf3] text-[#26724c]" : row.status === "possible_duplicate" ? "bg-[#fff9ec] text-[#8a641d]" : "bg-[#fff7f7] text-[#9f3131]"}`}
                    >
                      {row.status === "ready"
                        ? "Ready"
                        : row.status === "possible_duplicate"
                          ? row.duplicateReason
                          : row.errors.join(" ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 30 ? (
            <p className="border-t border-[#edf2f7] px-3 py-3 text-xs text-[#60758b]">
              Showing the first 30 of {rows.length} rows.
            </p>
          ) : null}
        </div>
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="ui-pill-button"
            disabled={importing}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="ui-pill-button ui-pill-button-active"
            disabled={importing || !summary.ready}
            onClick={onImport}
          >
            {importing ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Upload size={16} aria-hidden="true" />
            )}
            Import {summary.ready} ready{" "}
            {summary.ready === 1 ? "lead" : "leads"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function RentalLeadsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedListingId = searchParams.get('listingId') || '';
  const requestedCreateRole = searchParams.get('create') || '';
  const [linkedListing, setLinkedListing] = useState(null);
  const workspace = useWorkspace();
  const scope = useMemo(
    () => resolveRentalWorkspaceScope(workspace),
    [workspace],
  );
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [role, setRole] = useState("tenant");
  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [viewMode, setViewMode] = useState("table");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...INITIAL_FORM });
  const [saving, setSaving] = useState(false);
  const [advancingId, setAdvancingId] = useState("");
  const [lostLead, setLostLead] = useState(null);
  const [lostReason, setLostReason] = useState('');
  const [outcomeSaving, setOutcomeSaving] = useState(false);
  const [outcomeError, setOutcomeError] = useState('');
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const actor = useMemo(
    () => ({
      id: scope.assignedAgentId,
      userId: scope.assignedAgentId,
      email: workspace?.profile?.email || workspace?.user?.email || "",
      name: workspace?.profile?.fullName || workspace?.profile?.name || "",
    }),
    [
      scope.assignedAgentId,
      workspace?.profile?.email,
      workspace?.profile?.fullName,
      workspace?.profile?.name,
      workspace?.user?.email,
    ],
  );
  const loadLeads = useCallback(async () => {
    if (!scope.organisationId) {
      setLeads([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError("");
      setLeads(
        await listRentalLeads(scope.organisationId, {
          assignedAgentId: scope.assignedAgentId,
          branchId: scope.branchId,
          scopeLevel: scope.scopeLevel,
          includeClosed: true,
          includeAllOrganisationLeads: scope.scopeLevel === "organisation",
        }),
      );
    } catch (loadError) {
      setError(loadError?.message || "Unable to load rental leads.");
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [
    scope.assignedAgentId,
    scope.branchId,
    scope.organisationId,
    scope.scopeLevel,
  ]);
  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);
  useEffect(() => {
    let cancelled = false;
    if (requestedCreateRole !== 'tenant' || !requestedListingId || !scope.assignedAgentId || !scope.organisationId) return undefined;
    setLinkedListing(null);
    setDialogOpen(false);
    void getRentalListingForAgent(requestedListingId, scope.assignedAgentId, buildRentalListingQueryOptions(scope)).then((listing) => {
      if (cancelled) return;
      if (!listing) throw new Error('The selected rental listing is unavailable.');
      setLinkedListing(listing);
      setRole('tenant');
      setForm({ ...INITIAL_FORM, role: 'tenant', listingId: listing.id, desiredArea: listing.suburb || listing.city || '' });
      setDialogOpen(true);
    }).catch((loadError) => { if (!cancelled) setError(loadError.message || 'Unable to open the listing-linked lead form.'); });
    return () => { cancelled = true; };
  }, [requestedCreateRole, requestedListingId, scope]);
  function closeCreateDialog() {
    setDialogOpen(false);
    setLinkedListing(null);
    setForm({ ...INITIAL_FORM, role: role === 'tenant' ? 'tenant' : 'landlord' });
    if (requestedCreateRole) setSearchParams({}, { replace: true });
  }
  const summary = useMemo(() => rentalLeadListSummary(leads), [leads]);
  const sources = useMemo(() => [...new Set(leads.map((lead) => lead.source || 'Manual'))].sort(), [leads]);
  const agents = useMemo(() => [...new Map(leads.filter((lead) => lead.assignedAgentId).map((lead) => [lead.assignedAgentId, lead.assignedAgentName || 'Assigned agent'])).entries()], [leads]);
  const stages = role === 'closed' ? [...new Set(leads.filter((lead) => lead.outcome?.status && lead.outcome.status !== 'open').map((lead) => lead.stage))] : getRentalLeadPipelineStages(role);
  const roleLeads = useMemo(() => filterRentalLeadList(leads, { role, query, owner: ownerFilter, source: sourceFilter, stage: stageFilter, sort, assignedAgentId: scope.assignedAgentId }), [leads, query, role, ownerFilter, sourceFilter, stageFilter, sort, scope.assignedAgentId]);
  function changeRole(next) { setRole(next); setStageFilter('all'); }
  const roleTitle = role === 'landlord' ? 'Landlord Leads' : role === 'tenant' ? 'Tenant Leads' : 'Closed Leads';
  const filterClass = 'min-h-[38px] min-w-0 rounded-[12px] border border-[#dbe6f1] bg-white px-3 text-[0.82rem] font-semibold text-[#2b4056]';
  function updateForm(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setError("");
  }
  async function handleCreate(event) {
    event.preventDefault();
    try {
      setSaving(true);
      setError("");
      const created = await createRentalLead({ ...form, listingId: form.role === 'tenant' ? linkedListing?.id || '' : '' }, {
        organisationId: scope.organisationId,
        branchId: scope.branchId,
        actor,
        assignedAgent: actor,
      });
      setLeads((current) => [created, ...current]);
      setRole(created.role);
      closeCreateDialog();
      setForm({ ...INITIAL_FORM, role: created.role });
    } catch (createError) {
      setError(createError?.message || "Unable to create rental lead.");
    } finally {
      setSaving(false);
    }
  }
  function collectWorkflowEvidence(lead, toStage) {
    const requirement = getRentalLeadStageEvidenceRequirement(lead, toStage);
    if (!requirement.fields.length) return {};
    const labels = {
      scheduledFor: "Scheduled date and time (e.g. 2026-09-05T14:00)",
      note: "Milestone note",
      qualificationOutcome: "Type qualified to confirm qualification",
      viewingOutcome: "Type attended to confirm the viewing outcome",
      mandateReference: "Mandate reference",
      signedAt: "Mandate signed date and time (e.g. 2026-09-05T14:00)",
      applicationReference: "Application reference",
      ficaReference: "FICA evidence reference",
    };
    const evidence = {};
    for (const field of requirement.fields) {
      const value = window.prompt(`${requirement.title}: ${labels[field]}`);
      if (value === null) return null;
      evidence[field] = value;
    }
    return evidence;
  }
  async function handleAdvance(lead, toStage) {
    if (toStage === 'viewing_scheduled') { navigate('/agent/rentals/pipeline/viewings'); return }
    if (toStage === 'mandate_signed') { navigate('/agent/rentals/pipeline/mandates'); return }
    if (toStage === 'listing_created' && !lead.relationships?.listingId) { navigate(`/agent/rentals/listings/new?leadId=${encodeURIComponent(lead.id)}`); return }
    const evidence = ['viewing_completed', 'application_submitted'].includes(toStage) ? {} : collectWorkflowEvidence(lead, toStage);
    if (evidence === null) return;
    try {
      setAdvancingId(lead.id);
      setError("");
      const updated = await advanceRentalLead(lead, {
        organisationId: scope.organisationId,
        actor,
        scope: { assignedAgentId: scope.assignedAgentId, branchId: scope.branchId, scopeLevel: scope.scopeLevel, includeAllOrganisationLeads: scope.scopeLevel === 'organisation', organisationId: scope.organisationId, listingBranchId: scope.listingBranchId, includeAllOrganisationListings: scope.includeAllOrganisationListings },
        toStage,
        evidence,
      });
      setLeads((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (advanceError) {
      setError(advanceError?.message || "Unable to update rental lead.");
    } finally {
      setAdvancingId("");
    }
  }
  function downloadImportTemplate() {
    const link = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob([createRentalLeadImportTemplateCsv()], {
        type: "text/csv;charset=utf-8",
      }),
    );
    link.href = url;
    link.download = "arch9-rental-lead-import-template.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const rows = mapCsvRowsToImportRows(parseCsvText(await file.text()));
      if (!rows.length) throw new Error("No lead rows were found in this CSV.");
      setImportPreview(
        buildRentalLeadImportPreview(rows, {
          organisationId: scope.organisationId,
          existingLeads: leads,
        }),
      );
      setError("");
    } catch (fileError) {
      setError(fileError?.message || "Could not read this CSV.");
    }
  }
  async function importReadyRows() {
    if (!importPreview) return;
    try {
      setImporting(true);
      setError("");
      const readyRows = importPreview.rows.filter((row) => row.importable);
      const batchId = `rental-csv-${Date.now()}`;
      const importedAt = new Date().toISOString();
      const created = [];
      for (const row of readyRows)
        created.push(
          await createRentalLead(
            {
              ...row.candidate,
              ingestion: buildRentalLeadImportAuditContext(row.candidate, {
                batchId,
                importedAt,
                importedBy: actor.id,
              }),
            },
            {
              organisationId: scope.organisationId,
              branchId: scope.branchId,
              actor,
              assignedAgent: actor,
            },
          ),
        );
      setLeads((current) => [...created, ...current]);
      if (created[0]) setRole(created[0].role);
      setImportPreview(null);
    } catch (importError) {
      setError(importError?.message || "Unable to import rental leads.");
    } finally {
      setImporting(false);
    }
  }
  const terminalAction = (lead) =>
    navigate(
      lead.role === "landlord"
        ? lead.relationships?.listingId
          ? `/agent/rentals/listings/${encodeURIComponent(lead.relationships.listingId)}/marketing`
          : `/agent/rentals/listings/new?leadId=${encodeURIComponent(lead.id)}`
        : `/agent/rentals/pipeline/leads/${encodeURIComponent(lead.id)}`,
    );
  function startMarkLost(lead) {
    setLostLead(lead);
    setLostReason('');
    setOutcomeError('');
  }
  async function handleMarkLost(event) {
    event.preventDefault();
    try {
      setOutcomeSaving(true);
      setOutcomeError('');
      const result = await recordRentalLeadOutcome(lostLead, { status: 'lost', reason: lostReason }, {
        organisationId: scope.organisationId,
        actor,
        scope: { assignedAgentId: scope.assignedAgentId, branchId: scope.branchId, scopeLevel: scope.scopeLevel, includeAllOrganisationLeads: scope.scopeLevel === 'organisation' },
      });
      setLeads((current) => current.map((item) => item.id === lostLead.id ? { ...item, outcome: result.outcome } : item));
      setLostLead(null);
    } catch (saveError) {
      setOutcomeError(saveError?.message || 'Unable to mark this lead as lost.');
    } finally {
      setOutcomeSaving(false);
    }
  }
  const openLeadWorkspace = (lead) => {
    navigate(`/agent/rentals/pipeline/leads/${encodeURIComponent(lead.id)}`);
  };
  return (
    <section className="page-content">
      <div className="ui-section-stack">
        <section className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Rental lead summary">
          <RentalLeadMetric label="New Leads" value={summary.newLeads} detail={`${summary.active} active leads`} compare="Awaiting progress" icon={UserRound} tone="bg-[#edf5ff] text-[#315f8f]" />
          <RentalLeadMetric label="Converted MTD" value={summary.converted} detail={`${summary.convertedTenants} tenant leads · ${summary.convertedLandlords} landlord leads`} compare="Month to date" icon={TrendingUp} tone="bg-[#effaf3] text-[#26724c]" />
          <RentalLeadMetric label="Top Source" value={summary.topSource} detail={`${summary.topSourceCount} leads`} compare="All captured leads" icon={ArrowUpRight} tone="bg-[#f5f8fc] text-[#405b75]" />
          <RentalLeadMetric label="Lost Rate" value={`${summary.lostRate}%`} detail={`${summary.lost} lost or withdrawn`} compare={`${summary.total} total leads`} icon={X} tone="bg-[#fff5f4] text-[#9a4038]" />
        </section>
        <section className="min-w-0 rounded-[16px] border border-[#e4ebf2] bg-white/90 p-2.5 shadow-[0_10px_26px_rgba(24,45,68,0.045)]" aria-label="Rental lead filters">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:flex xl:justify-end">
            <select aria-label="Source filter" className={filterClass} value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">All Sources</option>{sources.map((source) => <option key={source}>{source}</option>)}</select>
            <select aria-label="Stage filter" className={filterClass} value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="all">All Stages</option>{stages.map((stage) => <option key={stage} value={stage}>{getRentalLeadStageLabel(stage, role === 'closed' ? leads.find((lead) => lead.stage === stage)?.role : role)}</option>)}</select>
            <select aria-label="Agent filter" className={filterClass} value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}><option value="all">All Agents</option><option value="mine">Assigned to me</option><option value="unassigned">Unassigned</option>{agents.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
            <select aria-label="Sort leads" className={filterClass} value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Sort: Newest</option><option value="oldest">Sort: Oldest</option><option value="stage">Sort: Stage</option></select>
            <button type="button" data-rental-control="reset-filters" className={`${filterClass} inline-flex items-center justify-center gap-2`} onClick={() => { setSourceFilter('all'); setStageFilter('all'); setOwnerFilter('all'); setSort('newest'); setQuery(''); }}><Filter size={15} />Reset</button>
          </div>
        </section>
        {error ? (
          <p className="rounded-[12px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">
            {error}
          </p>
        ) : null}
        <section className="overflow-hidden rounded-[18px] border border-[rgba(15,23,42,0.06)] bg-white shadow-[0_16px_42px_rgba(15,23,42,0.045)]">
          <header className="border-b border-[rgba(15,23,42,0.06)] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] px-4 py-4 sm:px-5 sm:py-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div><div className="flex items-center gap-2"><h1 className="text-[1.45rem] font-semibold tracking-[-0.04em] text-[#142132]">{roleTitle}</h1><span className="rounded-full border border-[#dce7f2] bg-[#f8fbff] px-3 py-1 text-sm font-semibold text-[#35546c]">{roleLeads.length}</span></div><p className="mt-1.5 text-sm font-medium text-[#60758b]">Track and manage your landlord and tenant leads.</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-[14px] border border-[#dbe4ee] bg-[#f6f9fc] p-0.5" role="group" aria-label="Preferred lead view">{[['table', Table2, 'Table'], ['kanban', Columns3, 'Kanban']].map(([mode, Icon, label]) => <button key={mode} type="button" aria-pressed={viewMode === mode} data-rental-control="lead-view" className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-[12px] px-3 text-xs font-semibold ${viewMode === mode ? 'bg-white text-[#163247] shadow' : 'text-[#51667f]'}`} onClick={() => setViewMode(mode)}>{createElement(Icon, { size: 13 })}{label}</button>)}</div>
                <button type="button" data-rental-control="lead-refresh" disabled={loading} className="inline-flex min-h-[42px] items-center gap-2 rounded-[14px] border border-[#dbe4ee] bg-white px-4 text-sm font-semibold text-[#405b75] disabled:opacity-60" onClick={() => void loadLeads()}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button>
                {role !== 'closed' ? <button type="button" className="ui-pill-button ui-pill-button-active" onClick={() => { setForm((current) => ({ ...current, role })); setDialogOpen(true); }}><Plus size={16} />Add {role === 'landlord' ? 'Landlord' : 'Tenant'} Lead</button> : null}
              </div>
            </div>
            <div className="mt-4 grid gap-1 rounded-[14px] border border-[#dbe6f1] bg-[#f8fbff] p-1 sm:grid-cols-3">{['tenant', 'landlord', 'closed'].map((key) => <LeadRoleButton key={key} role={key} count={summary[key]} active={role === key} onClick={() => changeRole(key)} />)}</div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><label className="flex h-10 w-full max-w-md items-center gap-2 rounded-[12px] border border-[#dce6f2] bg-white px-3"><Search size={15} className="shrink-0 text-[#7b8ca2]" aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search rental leads" className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-[#142132] outline-none" placeholder="Search leads, addresses or names..." /></label><div className="flex flex-wrap items-center gap-2">
              <Link to="/agent/rentals/applications" className="ui-pill-button">Review applications</Link>
              <button
                type="button"
                className="ui-pill-button"
                onClick={downloadImportTemplate}
              >
                <Download size={16} aria-hidden="true" />
                CSV template
              </button>
              <label className="ui-pill-button cursor-pointer">
                <Upload size={16} aria-hidden="true" />
                Import CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={handleImportFile}
                />
              </label>
</div></div>
          </header>
          {viewMode === 'kanban' ? <div className="overflow-x-auto p-4"><div className="flex min-w-max items-start gap-4">{stages.map((stage) => { const cards = roleLeads.filter((lead) => lead.stage === stage); return <section key={stage} className="w-64 rounded-[16px] border border-[#e0e8f1] bg-[#f8fbff] p-3"><h2 className="flex items-center justify-between text-sm font-semibold text-[#20364d]"><span>{getRentalLeadStageLabel(stage, role === 'closed' ? cards[0]?.role : role)}</span><span>{cards.length}</span></h2><div className="mt-3 space-y-3">{cards.map((lead) => <button key={lead.id} type="button" data-rental-control="lead-kanban-card" onClick={() => openLeadWorkspace(lead)} className="block w-full rounded-[14px] border border-[#dfe8f3] bg-white p-3 text-left shadow-sm"><span className="block truncate text-sm font-semibold text-[#142132]">{lead.name}</span><span className="mt-2 block line-clamp-2 text-xs text-[#60758b]">{lead.focus}</span><span className="mt-3 block truncate text-xs text-[#60758b]">{lead.assignedAgentName || 'Unassigned'}</span></button>)}</div></section>; })}</div>{loading ? <p className="mt-3 text-sm text-[#60758b]">Loading rental leads…</p> : null}</div> : <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[900px] table-fixed text-left" aria-label={roleTitle}>
              <thead className="h-11 bg-[#fbfdff] text-[0.7rem] font-semibold uppercase tracking-[0.04em] text-[#7890a8]">
                <tr>
                  <th scope="col" className="w-[25%] px-5 py-3">{role === "landlord" ? "Property" : "Rental requirement"}</th>
                  <th scope="col" className="w-[18%] px-4 py-3">Lead</th>
                  <th scope="col" className="w-[12%] px-4 py-3">Source</th>
                  <th scope="col" className="w-[17%] px-4 py-3">Stage</th>
                  <th scope="col" className="w-[22%] px-4 py-3">Next action / agent</th>
                  <th scope="col" className="w-[6%] px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan="6" className="px-5 py-12 text-center text-sm text-[#60758b]"><span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" />Loading rental leads…</span></td></tr> : roleLeads.length ? roleLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={(event) => {
                      if (event.target.closest('button, a, input, select, textarea')) return;
                      openLeadWorkspace(lead);
                    }}
                    className="cursor-pointer border-t border-[#edf2f7] transition-colors duration-150 hover:bg-[#f8fbfe]"
                  >
                    <td className="px-5 py-3"><div className="flex min-w-0 items-center gap-3"><PropertyThumbnail row={{ propertyImageUrl: lead.propertyImageUrl }} /><div className="min-w-0 flex-1">
                      <button type="button" data-rental-control="lead-property" onClick={() => openLeadWorkspace(lead)} title={lead.focus} className="block max-w-full truncate text-left text-sm font-semibold text-[#142132] hover:text-[#1f4f78] hover:underline">{lead.focus}</button>
                      <p title={rentalProfile(lead)} className="mt-1 truncate text-xs text-[#60758b]">{rentalProfile(lead)}</p>
                    </div></div></td>
                    <td className="px-4 py-3"><button type="button" data-rental-control="lead-contact" onClick={() => openLeadWorkspace(lead)} title={lead.name} className="block max-w-full truncate text-left text-sm font-semibold text-[#142132] hover:text-[#1f4f78] hover:underline">{lead.name}</button><p title={lead.phone || lead.email} className="mt-1 truncate text-xs text-[#60758b]">{lead.phone || lead.email || "No contact details"}</p></td>
                    <td className="px-4 py-3"><LeadSourceBrand source={lead.source || "Manual"} /></td>
                    <td className="px-4 py-3"><div className="max-w-full overflow-hidden" title={lead.stageLabel}><StagePill stage={lead.stageLabel} /></div></td>
                    <td className="px-4 py-3"><p title={lead.nextAction} className="truncate text-sm font-semibold text-[#142132]">{role === "closed" ? `Outcome: ${lead.outcome?.status || "closed"}` : lead.nextAction}</p><p title={lead.assignedAgentName} className="mt-1 truncate text-xs text-[#60758b]">{lead.assignedAgentName || "Unassigned"}</p></td>
                    <td className="px-3 py-3"><RentalLeadActionsMenu lead={lead} onOpen={openLeadWorkspace} onLost={startMarkLost} disabled={outcomeSaving} /></td>
                  </tr>
                )) : <tr><td colSpan="6" className="px-5 py-14 text-center"><p className="font-semibold text-[#20364d]">No {role} leads yet</p><p className="mt-1 text-sm text-[#60758b]">Create a lead or adjust your search to populate this rental pipeline.</p></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 p-4 lg:hidden">
            {loading ? (
              <p className="py-10 text-center text-sm text-[#60758b]">
                Loading rental leads…
              </p>
            ) : roleLeads.length ? (
              roleLeads.map((lead) => (
                <article
                  key={lead.id}
                  onClick={(event) => {
                    if (event.target.closest('button, a, input, select, textarea')) return;
                    openLeadWorkspace(lead);
                  }}
                  className="cursor-pointer rounded-[16px] border border-[#e1e8f0] bg-white p-4 shadow-sm transition hover:border-[#b9cade]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button type="button" onClick={() => openLeadWorkspace(lead)} data-rental-control="lead-contact" className="block max-w-full truncate text-left font-semibold text-[#142132] transition hover:text-[#1f4f78] hover:underline">{lead.name}</button>
                      <p className="mt-1 truncate text-sm text-[#60758b]">
                        {lead.phone || lead.email || "No contact details"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${stageTone(lead.stage)}`}
                    >
                      {lead.stageLabel}
                    </span>
                  </div>
                  <div className="mt-3 border-y border-[#edf2f7] py-3">
                    <p className="font-semibold text-[#20364c]">{lead.focus}</p>
                    <p className="mt-1 text-xs text-[#60758b]">
                      {rentalProfile(lead)} · {lead.source}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[#60758b]">
                        {role === "closed" ? `Outcome: ${lead.outcome?.status || "closed"}` : lead.nextAction}
                      </p>
                      <p title={lead.assignedAgentName} className="mt-1 truncate text-xs font-semibold text-[#142132]">
                        {lead.assignedAgentName}
                      </p>
                    </div>
                    <RentalLeadActionsMenu lead={lead} onOpen={openLeadWorkspace} onLost={startMarkLost} disabled={outcomeSaving} />
                    {role !== "closed" ? <RentalLeadAction
                      lead={lead}
                      onAdvance={handleAdvance}
                      advancing={advancingId === lead.id}
                      onTerminalAction={terminalAction}
                      compact
                    /> : null}
                  </div>
                </article>
              ))
            ) : (
              <p className="py-10 text-center text-sm text-[#60758b]">
                No {role} leads yet.
              </p>
            )}
          </div>
          </>}
        </section>
      </div>
      {lostLead ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f1f2f]/35 p-4" onClick={() => { if (!outcomeSaving) setLostLead(null); }} onKeyDown={(event) => { if (event.key === 'Escape' && !outcomeSaving) setLostLead(null); }}>
        <form role="dialog" aria-modal="true" aria-label="Mark lead as lost" className="w-full max-w-md rounded-[20px] bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()} onSubmit={handleMarkLost}>
          <h2 className="text-lg font-semibold text-[#20364d]">Mark {lostLead.name} as lost</h2>
          <p className="mt-2 text-sm text-[#60758b]">Choose a reason. The lead will move to Closed Leads and keep its history.</p>
          <label className="mt-4 grid gap-2 text-sm font-semibold text-[#20364d]">Lost reason<select autoFocus required disabled={outcomeSaving} value={lostReason} onChange={(event) => setLostReason(event.target.value)} className={filterClass}><option value="">Choose a reason</option>{RENTAL_LEAD_LOST_REASONS.map((reason) => <option key={reason} value={reason}>{reason.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())}</option>)}</select></label>
          {outcomeError ? <p role="alert" className="mt-3 text-sm text-[#9a4038]">{outcomeError}</p> : null}
          <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={outcomeSaving} className={filterClass} onClick={() => setLostLead(null)}>Cancel</button><button type="submit" disabled={outcomeSaving || !lostReason} className={`${filterClass} text-[#9a4038] disabled:opacity-50`}>{outcomeSaving ? 'Saving…' : 'Mark as lost'}</button></div>
        </form>
      </div> : null}
      {dialogOpen ? (
        <RentalLeadDialog
          linkedListing={linkedListing}
          form={form}
          onChange={updateForm}
          onClose={closeCreateDialog}
          onSubmit={handleCreate}
          saving={saving}
          error={error}
        />
      ) : null}
      <RentalLeadImportDialog
        preview={importPreview}
        importing={importing}
        onClose={() => setImportPreview(null)}
        onImport={() => void importReadyRows()}
      />
    </section>
  );
}
