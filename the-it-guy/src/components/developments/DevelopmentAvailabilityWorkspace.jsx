import {
  ArrowUpRight,
  BedDouble,
  Building2,
  CalendarClock,
  CircleDollarSign,
  Copy,
  Crosshair,
  Filter,
  Home,
  LockKeyhole,
  MapPinned,
  Maximize2,
  MessageSquare,
  Minus,
  PencilLine,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Button from "../ui/Button";
import Field from "../ui/Field";
import { buildDevelopmentStructurePathMap } from "../../core/developments/developmentStructureModel";
import { buildCataloguePriceByUnitType } from "../../core/developments/developmentProductCatalogueModel";

const currency = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 0,
});
const STATUS_META = {
  available: {
    label: "Available",
    tone: "bg-[#e9f7ee] text-[#167044]",
    dot: "bg-[#2f9b62]",
  },
  reserved: {
    label: "Reserved",
    tone: "bg-[#fff1dd] text-[#a65c12]",
    dot: "bg-[#e99532]",
  },
  sold: {
    label: "Sold",
    tone: "bg-[#e7f0fb] text-[#315f8c]",
    dot: "bg-[#4d82af]",
  },
  unreleased: {
    label: "Unreleased",
    tone: "bg-[#eef1f5] text-[#5f6d7c]",
    dot: "bg-[#98a4b1]",
  },
};
const text = (value) => String(value || "").trim();
function normaliseStatus(value) {
  const source = text(value).toLowerCase();
  if (
    source.includes("unreleased") ||
    source.includes("not released") ||
    source.includes("draft")
  )
    return "unreleased";
  if (source.includes("reserved") || source.includes("hold")) return "reserved";
  if (
    source.includes("sold") ||
    source.includes("registered") ||
    source.includes("completed")
  )
    return "sold";
  if (
    source.includes("transfer") ||
    source.includes("offer") ||
    source.includes("sale")
  )
    return "reserved";
  return "available";
}
function getUnitNumber(unit = {}) {
  return (
    text(
      unit.unitNumber || unit.unit_number || unit.unitLabel || unit.unit_label,
    ) || "—"
  );
}
function getUnitPrice(unit = {}) {
  return (
    [
      unit.currentPrice,
      unit.current_price,
      unit.salesPrice,
      unit.listPrice,
      unit.list_price,
      unit.price,
    ]
      .map(Number)
      .find((candidate) => Number.isFinite(candidate) && candidate > 0) || 0
  );
}
function getUnitLocation(unit = {}) {
  return (
    [text(unit.phase), text(unit.block)].filter(Boolean).join(" · ") ||
    "Development stock"
  );
}
function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("en-ZA").format(number)
    : "—";
}
function defaultMapPosition(index, total) {
  const columns = Math.max(
    3,
    Math.min(6, Math.ceil(Math.sqrt(Math.max(total, 1) * 1.4))),
  );
  const row = Math.floor(index / columns);
  const rows = Math.ceil(Math.max(total, 1) / columns);
  return {
    x: 10 + (index % columns) * (80 / Math.max(columns - 1, 1)),
    y: 16 + row * (68 / Math.max(rows - 1, 1)),
  };
}
function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.available;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-[0.08em] ${meta.tone}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${meta.dot}`}
        aria-hidden="true"
      />
      {meta.label}
    </span>
  );
}
function MetricCard({ label, value, tone = "default" }) {
  const accents = {
    default: "border-[#dfe7f0] bg-white text-[#1c2e40]",
    available: "border-[#cae7d4] bg-[#f5fcf7] text-[#15653d]",
    reserved: "border-[#f3d7af] bg-[#fffaf3] text-[#a05a13]",
    sold: "border-[#d5e3f2] bg-[#f6faff] text-[#315f8c]",
  };
  return (
    <article
      className={`rounded-[16px] border px-4 py-3.5 ${accents[tone] || accents.default}`}
    >
      <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-[#72849a]">
        {label}
      </span>
      <strong className="mt-1.5 block text-[1.45rem] font-semibold leading-none tracking-[-0.04em]">
        {formatNumber(value)}
      </strong>
    </article>
  );
}

export default function DevelopmentAvailabilityWorkspace({
  units = [],
  structureNodes = [],
  productCatalogue = null,
  role = "",
  canManageInventory = false,
  canCreateTransactions = false,
  buyerLeads = [],
  reservationDepositConfigured = true,
  reservationDepositSummary = "",
  sitePlanUrl = "",
  sitePlanMap = {},
  sitePlanSaving = false,
  onSaveSitePlanMap,
  onUploadSitePlan,
  onEditUnit,
  onChangeUnitStatus,
  onSetReleaseState,
  onCreateTransaction,
  onOpenTransaction,
  onCreateBuyerLead,
  onLeadAction,
  onSaveUnitPrice,
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [blockFilter, setBlockFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [structureFilter, setStructureFilter] = useState("all");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [mapSelectionActive, setMapSelectionActive] = useState(false);
  const [placingUnit, setPlacingUnit] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [comparisonUnitIds, setComparisonUnitIds] = useState([]);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [showBuyerForm, setShowBuyerForm] = useState(false);
  const [buyerDraft, setBuyerDraft] = useState({
    name: "",
    email: "",
    phone: "",
    note: "",
  });
  const [salesSaving, setSalesSaving] = useState(false);
  const [salesError, setSalesError] = useState("");
  const [priceDraft, setPriceDraft] = useState("");
  const [controlSaving, setControlSaving] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const structurePathById = useMemo(
    () => buildDevelopmentStructurePathMap(structureNodes),
    [structureNodes],
  );
  const cataloguePriceByUnitType = useMemo(
    () => buildCataloguePriceByUnitType(productCatalogue || {}),
    [productCatalogue],
  );
  const inventory = useMemo(
    () =>
      units.map((unit) => {
        const structure = structurePathById.get(unit.structureNodeId || unit.structure_node_id);
        const unitPrice = getUnitPrice(unit);
        return {
        ...unit,
        inventoryStatus: normaliseStatus(unit.status || unit.transactionStage),
        displayNumber: getUnitNumber(unit),
        displayPrice:
          unitPrice ||
          Number(cataloguePriceByUnitType.get(unit.unitTypeId || unit.unit_type_id)?.listPrice || 0),
        priceSource: unitPrice ? "unit" : "catalogue",
        location: structure?.labelPath || getUnitLocation(unit),
        structureNodeId: unit.structureNodeId || unit.structure_node_id || "",
        structurePath: structure?.labelPath || "",
        structurePathIds: structure?.path?.map((item) => item.id) || [],
        displayType:
          text(unit.unitType || unit.unit_type) || "Unit type pending",
      };
      }),
    [cataloguePriceByUnitType, structurePathById, units],
  );
  const blocks = useMemo(
    () =>
      [
        ...new Set(inventory.map((unit) => text(unit.block)).filter(Boolean)),
      ].sort(),
    [inventory],
  );
  const unitTypes = useMemo(
    () =>
      [
        ...new Set(inventory.map((unit) => unit.displayType).filter(Boolean)),
      ].sort(),
    [inventory],
  );
  const structureOptions = useMemo(
    () =>
      [...structurePathById.values()]
        .filter((item) => item.labelPath)
        .sort((left, right) => left.labelPath.localeCompare(right.labelPath)),
    [structurePathById],
  );
  const metrics = useMemo(() => {
    const totals = inventory.reduce(
      (result, unit) => ({
        ...result,
        [unit.inventoryStatus]: result[unit.inventoryStatus] + 1,
      }),
      { available: 0, reserved: 0, sold: 0, unreleased: 0 },
    );
    return { total: inventory.length, ...totals };
  }, [inventory]);
  const commercialPulse = useMemo(() => {
    const released = Math.max(0, metrics.total - metrics.unreleased);
    const sellThrough = released
      ? Math.round((metrics.sold / released) * 100)
      : 0;
    const reservationRate = released
      ? Math.round((metrics.reserved / released) * 100)
      : 0;
    const pricePending = inventory.filter((unit) => !unit.displayPrice).length;
    const actionItems = [
      pricePending
        ? `${pricePending} unit${pricePending === 1 ? "" : "s"} need pricing`
        : "",
      metrics.unreleased
        ? `${metrics.unreleased} unit${metrics.unreleased === 1 ? "" : "s"} awaiting release`
        : "",
      !reservationDepositConfigured ? "Reservation policy needs setup" : "",
    ].filter(Boolean);
    return {
      released,
      sellThrough,
      reservationRate,
      pricePending,
      actionItems,
    };
  }, [inventory, metrics, reservationDepositConfigured]);
  const presentationUnits = useMemo(
    () =>
      inventory
        .filter((unit) => unit.inventoryStatus === "available")
        .slice(0, 6),
    [inventory],
  );
  const visibleUnits = useMemo(() => {
    const term = query.trim().toLowerCase();
    return inventory
      .filter((unit) => {
        const haystack =
          `${unit.displayNumber} ${unit.displayType} ${unit.location} ${unit.buyerName || ""}`.toLowerCase();
        return (
          (!term || haystack.includes(term)) &&
          (statusFilter === "all" || unit.inventoryStatus === statusFilter) &&
          (blockFilter === "all" || text(unit.block) === blockFilter) &&
          (typeFilter === "all" || unit.displayType === typeFilter) &&
          (structureFilter === "all" || unit.structurePathIds.includes(structureFilter))
        );
      })
      .sort((left, right) =>
        left.displayNumber.localeCompare(right.displayNumber, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );
  }, [blockFilter, inventory, query, statusFilter, structureFilter, typeFilter]);
  const selectedUnit =
    visibleUnits.find((unit) => unit.id === selectedUnitId) ||
    visibleUnits[0] ||
    null;
  const mapUnits = useMemo(() => {
    const mappedUnitIds = Object.keys(sitePlanMap || {});
    return mappedUnitIds.length
      ? visibleUnits.filter((unit) => mappedUnitIds.includes(unit.id))
      : visibleUnits;
  }, [sitePlanMap, visibleUnits]);
  const placedUnitCount = useMemo(
    () =>
      inventory.filter((unit) => {
        const position = sitePlanMap?.[unit.id];
        return (
          Number.isFinite(Number(position?.x)) &&
          Number.isFinite(Number(position?.y))
        );
      }).length,
    [inventory, sitePlanMap],
  );
  const sitePlanStatus = !sitePlanUrl
    ? "Plan needed"
    : placedUnitCount === 0
      ? "Ready to place units"
      : placedUnitCount >= inventory.length && inventory.length > 0
        ? "Ready to publish"
        : `${placedUnitCount} of ${inventory.length} units placed`;
  const isAgency = role === "agent";
  const comparisonUnits = inventory.filter((unit) =>
    comparisonUnitIds.includes(unit.id),
  );
  const selectedLead =
    buyerLeads.find((lead) => lead.developerLeadId === selectedLeadId) || null;
  const canStartSale = Boolean(
    selectedUnit &&
    selectedUnit.inventoryStatus === "available" &&
    canCreateTransactions,
  );
  useEffect(() => {
    setPriceDraft(
      selectedUnit?.displayPrice ? String(selectedUnit.displayPrice) : "",
    );
  }, [selectedUnit?.id, selectedUnit?.displayPrice]);
  function placeSelectedUnit(event) {
    if (!placingUnit || !selectedUnit || !canManageInventory) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(
      3,
      Math.min(97, ((event.clientX - rect.left) / rect.width) * 100),
    );
    const y = Math.max(
      3,
      Math.min(97, ((event.clientY - rect.top) / rect.height) * 100),
    );
    onSaveSitePlanMap?.({
      ...(sitePlanMap || {}),
      [selectedUnit.id]: {
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
      },
    });
    setPlacingUnit(false);
  }
  function beginSitePlanPlacement() {
    if (!sitePlanUrl || !selectedUnit || !canManageInventory) return;
    setMapSelectionActive(false);
    setPlacingUnit(true);
  }
  function reviewSitePlanPlacement() {
    setPlacingUnit(false);
    setZoom(1);
    if (selectedUnit) setMapSelectionActive(true);
  }
  function toggleComparison(unit) {
    setComparisonUnitIds((previous) =>
      previous.includes(unit.id)
        ? previous.filter((id) => id !== unit.id)
        : [...previous, unit.id].slice(-3),
    );
  }
  async function createBuyerLead() {
    if (!selectedUnit || !buyerDraft.name.trim()) {
      setSalesError("Add the buyer name before saving this lead.");
      return;
    }
    try {
      setSalesSaving(true);
      setSalesError("");
      const lead = await onCreateBuyerLead?.({
        unit: selectedUnit,
        buyerName: buyerDraft.name,
        buyerEmail: buyerDraft.email,
        buyerPhone: buyerDraft.phone,
        note: buyerDraft.note,
      });
      if (lead?.developerLeadId) setSelectedLeadId(lead.developerLeadId);
      setBuyerDraft({ name: "", email: "", phone: "", note: "" });
      setShowBuyerForm(false);
    } catch (error) {
      setSalesError(error?.message || "Buyer lead could not be added.");
    } finally {
      setSalesSaving(false);
    }
  }
  async function runLeadAction(action) {
    if (!selectedUnit || !selectedLead) {
      setSalesError("Choose a buyer lead before continuing.");
      return false;
    }
    try {
      setSalesSaving(true);
      setSalesError("");
      await onLeadAction?.({ lead: selectedLead, unit: selectedUnit, action });
      return true;
    } catch (error) {
      setSalesError(
        error?.message || "The sales action could not be recorded.",
      );
      return false;
    } finally {
      setSalesSaving(false);
    }
  }
  async function shareUnit() {
    if (!(await runLeadAction("share"))) return;
    const summary = `Unit ${selectedUnit.displayNumber} · ${selectedUnit.displayType} · ${selectedUnit.displayPrice ? currency.format(selectedUnit.displayPrice) : "Price on request"}`;
    try {
      await navigator.clipboard?.writeText(summary);
    } catch {
      /* The activity is still saved when clipboard access is unavailable. */
    }
  }
  async function savePrice() {
    if (!selectedUnit || !priceDraft.trim()) return;
    const price = Number(priceDraft);
    if (!Number.isFinite(price) || price < 0) {
      setSalesError("Enter a valid unit price.");
      return;
    }
    try {
      setControlSaving(true);
      setSalesError("");
      await onSaveUnitPrice?.(selectedUnit, price);
    } catch (error) {
      setSalesError(error?.message || "Price could not be saved.");
    } finally {
      setControlSaving(false);
    }
  }
  async function changeReleaseState() {
    if (!selectedUnit) return;
    try {
      setControlSaving(true);
      setSalesError("");
      await onSetReleaseState?.(
        selectedUnit,
        selectedUnit.inventoryStatus === "unreleased"
          ? "Available"
          : "Not Released",
      );
    } catch (error) {
      setSalesError(error?.message || "Release state could not be updated.");
    } finally {
      setControlSaving(false);
    }
  }

  if (presentationMode) {
    return (
      <section className="mt-4 overflow-hidden rounded-[28px] border border-[#173b38] bg-[#0b2425] shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
        <div className="relative min-h-[680px] px-5 py-6 sm:px-8 sm:py-9">
          <div
            className="absolute inset-0 bg-[radial-gradient(circle_at_14%_2%,rgba(69,160,124,0.36),transparent_30%),radial-gradient(circle_at_92%_15%,rgba(225,179,85,0.24),transparent_25%)]"
            aria-hidden="true"
          />
          <div className="relative mx-auto max-w-6xl">
            <div className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#b9decd]">
                <Sparkles size={15} />
                Client presentation
              </span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setPresentationMode(false)}
              >
                <X size={14} />
                Exit presentation
              </Button>
            </div>
            <div className="mt-14 max-w-3xl">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#a8d7c0]">
                Live availability
              </span>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.055em] text-white sm:text-6xl">
                Find the right home, with confidence.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[#d4e8df]">
                Explore currently available homes, live pricing and the latest
                development progress in one considered view.
              </p>
            </div>
            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {[
                [metrics.available, "Homes available"],
                [commercialPulse.sellThrough + "%", "Released stock sold"],
                [metrics.reserved, "Homes reserved"],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="rounded-[16px] border border-white/15 bg-white/10 px-4 py-4 backdrop-blur"
                >
                  <strong className="block text-2xl font-semibold tracking-[-0.04em] text-white">
                    {value}
                  </strong>
                  <span className="mt-1 block text-xs font-medium text-[#c4dcd1]">
                    {label}
                  </span>
                </div>
              ))}
            </div>
            <section className="mt-10 rounded-[22px] border border-white/15 bg-white/[0.08] p-4 backdrop-blur sm:p-5">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-xl font-semibold tracking-[-0.035em] text-white">
                    Available homes
                  </h3>
                  <p className="mt-1 text-sm text-[#c5d9d0]">
                    A selected range from the current release.
                  </p>
                </div>
                <span className="text-xs font-semibold text-[#b8daca]">
                  Updated live
                </span>
              </div>
              {presentationUnits.length ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {presentationUnits.map((unit) => (
                    <button
                      key={unit.id}
                      type="button"
                      onClick={() => {
                        setSelectedUnitId(unit.id);
                        setPresentationMode(false);
                      }}
                      className="rounded-[16px] border border-white/15 bg-[#f9fcfa] p-4 text-left transition hover:-translate-y-0.5 hover:bg-white"
                    >
                      <span className="inline-flex rounded-full bg-[#eaf6ee] px-2 py-1 text-[0.62rem] font-bold uppercase tracking-[0.1em] text-[#1d7448]">
                        Available
                      </span>
                      <strong className="mt-4 block text-xl font-semibold tracking-[-0.04em] text-[#173149]">
                        Unit {unit.displayNumber}
                      </strong>
                      <span className="mt-1 block text-sm text-[#63788b]">
                        {unit.displayType} · {unit.location}
                      </span>
                      <strong className="mt-4 block text-base text-[#203e51]">
                        {unit.displayPrice
                          ? currency.format(unit.displayPrice)
                          : "Price on request"}
                      </strong>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-5 rounded-[14px] bg-white/10 px-4 py-8 text-center text-sm text-[#d4e8df]">
                  New homes will appear here as they are released.
                </p>
              )}
            </section>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-4 grid gap-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total units" value={metrics.total} />
        <MetricCard
          label="Available"
          value={metrics.available}
          tone="available"
        />
        <MetricCard label="Reserved" value={metrics.reserved} tone="reserved" />
        <MetricCard label="Sold" value={metrics.sold} tone="sold" />
        <MetricCard label="Unreleased" value={metrics.unreleased} />
      </section>
      <section className="overflow-hidden rounded-[24px] border border-[#183a3c] bg-[#0c2527] shadow-[0_20px_48px_rgba(15,23,42,0.14)]">
        <div className="relative px-5 py-6 sm:px-6 lg:px-7">
          <div
            className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(69,160,124,0.34),transparent_31%),radial-gradient(circle_at_89%_14%,rgba(225,179,85,0.22),transparent_23%)]"
            aria-hidden="true"
          />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <span className="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-[#a6d5bf]">
                Live inventory
              </span>
              <h2 className="mt-2 text-[1.65rem] font-semibold tracking-[-0.04em] text-white">
                Availability workspace
              </h2>
              <p className="mt-2 max-w-[640px] text-sm leading-6 text-[#d4e5df]">
                A shared view of released stock, reservations, and sales
                progress for the development team.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
                <SlidersHorizontal size={14} />
                {isAgency ? "Agency sales view" : "Developer inventory view"}
              </span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setPresentationMode(true)}
              >
                <Maximize2 size={14} />
                Client presentation
              </Button>
            </div>
          </div>
        </div>
      </section>
      <section className="overflow-hidden rounded-[22px] border border-[#dce5ee] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.055)]">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-[1.02rem] font-semibold tracking-[-0.025em] text-[#142132]">
              Interactive site plan
            </h3>
            <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
              Select a unit on the plan or inventory. Status and selection
              remain in sync.
            </p>
          </div>
          <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${sitePlanUrl ? "bg-[#eaf7ef] text-[#167044]" : "bg-[#fff4e5] text-[#a65c12]"}`}>
            <MapPinned size={14} /> {sitePlanStatus}
          </span>
        </div>
        {canManageInventory ? (
          <section className="mb-4 grid gap-3 rounded-[18px] border border-[#dbe8e1] bg-[#f8fcfa] p-3 sm:grid-cols-3 sm:p-4">
            <div className="min-w-0">
              <span className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#4d7965]">1. Upload plan</span>
              <strong className="mt-1 block text-sm text-[#173149]">{sitePlanUrl ? "Plan image connected" : "Add a site-plan image or PDF"}</strong>
              <p className="mt-1 text-xs leading-5 text-[#6b7d93]">This becomes the shared background for Arch9 availability pages. PDFs use their first page for the map.</p>
              {onUploadSitePlan ? <label className={`mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-[#173f38] px-3 text-xs font-semibold text-white ${sitePlanSaving ? "cursor-wait opacity-60" : "cursor-pointer hover:bg-[#12322d]"}`}><Upload size={14} />{sitePlanSaving ? "Preparing plan…" : sitePlanUrl ? "Replace site plan" : "Upload site plan"}<input type="file" accept="image/*,application/pdf,.pdf" className="hidden" disabled={sitePlanSaving} onChange={onUploadSitePlan} /></label> : null}
            </div>
            <div className="min-w-0 border-t border-[#dce9e1] pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
              <span className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#4d7965]">2. Place units</span>
              <strong className="mt-1 block text-sm text-[#173149]">{placedUnitCount} of {inventory.length} coordinates saved</strong>
              <p className="mt-1 text-xs leading-5 text-[#6b7d93]">Select a unit, then place or adjust its marker on the plan.</p>
              <Button type="button" size="sm" className="mt-3" variant={placingUnit ? "primary" : "secondary"} disabled={!sitePlanUrl || !selectedUnit || sitePlanSaving} onClick={beginSitePlanPlacement}><Crosshair size={13} />{placingUnit ? "Click plan to place" : "Place selected unit"}</Button>
            </div>
            <div className="min-w-0 border-t border-[#dce9e1] pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
              <span className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#4d7965]">3. Review & publish</span>
              <strong className="mt-1 block text-sm text-[#173149]">Review the live map before public release</strong>
              <p className="mt-1 text-xs leading-5 text-[#6b7d93]">Public-page publishing remains under Marketing. This step lets you review the same saved markers.</p>
              <Button type="button" size="sm" variant="secondary" className="mt-3" disabled={!sitePlanUrl} onClick={reviewSitePlanPlacement}><MapPinned size={13} /> Review placement</Button>
            </div>
          </section>
        ) : null}
        <div className="grid gap-4 xl:grid-cols-[195px_minmax(0,1fr)_minmax(340px,0.85fr)]">
          <aside className="flex h-[470px] flex-col rounded-[18px] border border-[#e0e8e4] bg-[#fbfdfb] p-3.5 xl:h-[540px]">
            <span className="text-[0.66rem] font-bold uppercase tracking-[0.12em] text-[#536c61]">
              Browse by
            </span>
            <div className="mt-3 grid gap-2.5">
              <label className="relative block">
                <span className="sr-only">Search availability</span>
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8497aa]" />
                <Field value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 pl-8 text-xs" placeholder="Search unit, type, block, or buyer" />
              </label>
              <Field as="select" value={blockFilter} onChange={(event) => setBlockFilter(event.target.value)} className="h-9 text-xs"><option value="all">All blocks</option>{blocks.map((block) => <option key={block} value={block}>{block}</option>)}</Field>
              <Field as="select" value={structureFilter} onChange={(event) => setStructureFilter(event.target.value)} className="h-9 text-xs"><option value="all">All floors / structures</option>{structureOptions.map((item) => <option key={item.id} value={item.id}>{item.labelPath}</option>)}</Field>
              <Field as="select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-9 text-xs"><option value="all">All unit types</option>{unitTypes.map((type) => <option key={type} value={type}>{type}</option>)}</Field>
              <Field as="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 text-xs"><option value="all">All availability</option>{Object.entries(STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</Field>
            </div>
            <div className="mt-4 border-t border-[#e4ece6] pt-3">
              <span className="text-[0.66rem] font-bold uppercase tracking-[0.12em] text-[#536c61]">Legend</span>
              <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-2 text-xs font-medium text-[#63778b]">{Object.entries(STATUS_META).map(([status, meta]) => <span key={status} className="inline-flex items-center gap-1.5"><i className={`h-2.5 w-2.5 shrink-0 rounded-sm ${meta.dot}`} />{meta.label}</span>)}</div>
            </div>
            {canManageInventory ? <p className="mt-auto border-t border-[#e4ece6] pt-3 text-xs leading-5 text-[#60758d]">Use Site Plan Setup above to upload a plan and place unit markers.</p> : null}
          </aside>
          <div
          className="relative h-[470px] overflow-hidden rounded-[18px] border border-[#dce6ef] bg-[linear-gradient(135deg,#eaf0e7,#f7f4e9)] xl:h-[540px]"
          onClick={placeSelectedUnit}
          role={placingUnit ? "button" : undefined}
          tabIndex={placingUnit ? 0 : undefined}
          onKeyDown={(event) => {
            if (event.key === "Escape") setPlacingUnit(false);
          }}
        >
          <div
            className="absolute inset-0 origin-center transition-transform duration-200"
            style={{
              transform: `scale(${zoom})`,
              backgroundImage: sitePlanUrl
                ? `linear-gradient(rgba(11,31,28,0.06),rgba(11,31,28,0.12)), url(${sitePlanUrl})`
                : undefined,
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              backgroundSize: "cover",
            }}
          >
            {!sitePlanUrl ? (
              <div
                className="absolute inset-0 opacity-55 [background-image:linear-gradient(90deg,rgba(50,91,76,0.16)_1px,transparent_1px),linear-gradient(rgba(50,91,76,0.16)_1px,transparent_1px)] [background-size:42px_42px]"
                aria-hidden="true"
              />
            ) : null}
            {mapUnits.map((unit, index) => {
              const position =
                sitePlanMap?.[unit.id] ||
                defaultMapPosition(index, mapUnits.length);
              const selected = unit.id === selectedUnit?.id;
              const meta =
                STATUS_META[unit.inventoryStatus] || STATUS_META.available;
              return (
                <button
                  key={unit.id}
                  type="button"
                  aria-label={`Select unit ${unit.displayNumber}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedUnitId(unit.id);
                    setMapSelectionActive(true);
                  }}
                  className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-[5px] border px-2 py-1 text-[0.68rem] font-bold shadow-[0_3px_8px_rgba(15,23,42,0.14)] transition hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#173f38] ${selected ? "border-[#163f36] bg-[#163f36] text-white ring-2 ring-white/80" : `${meta.tone} border-white/90`}`}
                  style={{ left: `${position.x}%`, top: `${position.y}%` }}
                >
                  {unit.displayNumber}
                </button>
              );
            })}
          </div>
          <span className="absolute left-4 top-4 rounded-full border border-white/80 bg-white/90 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[#436055] shadow-sm">Masterplan</span>
          <span className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/90 text-xs font-bold text-[#304b40] shadow-sm">
            N
          </span>
          <div className="absolute bottom-4 right-4 flex overflow-hidden rounded-[10px] border border-white/80 bg-white/95 shadow-sm">
            <button
              type="button"
              aria-label="Zoom out"
              className="grid h-9 w-9 place-items-center border-r border-[#e5ebea] text-[#355147] hover:bg-[#f5f8f6]"
              onClick={() => setZoom((value) => Math.max(1, value - 0.15))}
            >
              <Minus size={15} />
            </button>
            <button
              type="button"
              aria-label="Reset map zoom"
              className="grid h-9 w-9 place-items-center border-r border-[#e5ebea] text-[#355147] hover:bg-[#f5f8f6]"
              onClick={() => setZoom(1)}
            >
              <RotateCcw size={14} />
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              className="grid h-9 w-9 place-items-center text-[#355147] hover:bg-[#f5f8f6]"
              onClick={() => setZoom((value) => Math.min(1.45, value + 0.15))}
            >
              <Plus size={15} />
            </button>
          </div>
          {placingUnit ? (
            <span className="absolute bottom-4 left-4 rounded-[10px] bg-[#163f36] px-3 py-2 text-xs font-semibold text-white shadow-lg">
              Click the plan to position Unit {selectedUnit?.displayNumber}
            </span>
          ) : null}
          {selectedUnit && mapSelectionActive && !placingUnit ? (
            <div className="absolute bottom-4 left-4 max-w-[220px] rounded-[14px] border border-white/90 bg-white/95 px-3.5 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.18)] backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[0.63rem] font-bold uppercase tracking-[0.1em] text-[#6b7d93]">Selected unit</span>
                  <strong className="mt-0.5 block text-sm text-[#173149]">{selectedUnit.displayNumber}</strong>
                </div>
                <button type="button" aria-label="Close unit details" className="-mr-1 -mt-1 rounded-md p-1 text-[#718398] hover:bg-[#eef3f4]" onClick={() => setMapSelectionActive(false)}><X size={14} /></button>
              </div>
              <span className="mt-2 block truncate text-xs text-[#60758d]">{selectedUnit.displayType}</span>
              <div className="mt-1.5 flex items-center justify-between gap-2"><strong className="text-sm text-[#21394f]">{selectedUnit.displayPrice ? currency.format(selectedUnit.displayPrice) : "Price on request"}</strong><StatusPill status={selectedUnit.inventoryStatus} /></div>
            </div>
          ) : null}
          </div>
          <article className="flex h-[470px] min-w-0 flex-col overflow-hidden rounded-[18px] border border-[#dce5ee] bg-white xl:h-[540px]">
            <div className="flex items-center justify-between border-b border-[#e8eef5] bg-[#fbfcfe] px-4 py-3"><div><h3 className="text-sm font-semibold tracking-[-0.02em] text-[#142132]">Unit availability</h3><p className="mt-0.5 text-xs text-[#6b7d93]">{visibleUnits.length} of {metrics.total} units shown</p></div><button type="button" className="text-xs font-semibold text-[#327553]" onClick={() => { setQuery(""); setStatusFilter("all"); setBlockFilter("all"); setStructureFilter("all"); setTypeFilter("all"); }}>Clear</button></div>
            {visibleUnits.length ? <div className="min-h-0 flex-1 overflow-y-auto">{visibleUnits.map((unit) => { const selected = unit.id === selectedUnit?.id; const meta = STATUS_META[unit.inventoryStatus] || STATUS_META.available; return <button key={unit.id} type="button" onClick={() => setSelectedUnitId(unit.id)} className={`grid w-full grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-[#edf2f7] px-4 py-3 text-left transition hover:bg-[#f8fbff] ${selected ? "bg-[#eff7f2] shadow-[inset_3px_0_0_#2f8f5c]" : "bg-white"}`}><strong className="text-sm font-semibold text-[#182b3d]">{unit.displayNumber}</strong><span className="min-w-0"><strong className="block truncate text-xs font-semibold text-[#30485f]">{unit.displayType}</strong><small className="mt-0.5 block truncate text-[0.68rem] text-[#78899c]">{unit.location}</small></span><span className="text-right"><strong className="block whitespace-nowrap text-xs text-[#24394e]">{unit.displayPrice ? currency.format(unit.displayPrice) : "POR"}</strong><small className="mt-1 inline-flex items-center gap-1 text-[0.65rem] font-bold text-[#60758d]"><i className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</small></span></button>; })}</div> : <div className="px-6 py-14 text-center"><Home className="mx-auto text-[#a2b0bf]" size={28} /><strong className="mt-4 block text-sm text-[#30485f]">No units match this view</strong><p className="mt-1 text-sm text-[#6b7d93]">Change the filters or add units in the stock master.</p></div>}
          </article>
        </div>
      </section>
      <section className="grid gap-5">
        <article className="hidden" aria-hidden="true">
          <div className="flex flex-col gap-3 border-b border-[#e8eef5] bg-[#fbfcfe] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="whitespace-nowrap text-[1.02rem] font-semibold tracking-[-0.025em] text-[#142132]">
                Unit availability
              </h3>
              <p className="mt-1 text-xs text-[#6b7d93]">
                {visibleUnits.length} of {metrics.total} units shown
              </p>
            </div>
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#687c91]">
              <Filter size={13} /> Live filters
            </span>
          </div>
          {visibleUnits.length ? (
            <div className="max-h-[620px] overflow-auto">
              <div className="min-w-[650px]">
                <div className="grid grid-cols-[minmax(90px,0.55fr)_minmax(150px,1fr)_minmax(125px,0.75fr)_minmax(145px,0.8fr)_auto] gap-3 border-b border-[#e8eef5] bg-[#f7f9fc] px-5 py-3 text-[0.67rem] font-bold uppercase tracking-[0.11em] text-[#7c8da1]">
                  <span>Unit</span>
                  <span>Type / location</span>
                  <span>Status</span>
                  <span>Price</span>
                  <span className="sr-only">Select</span>
                </div>
                {visibleUnits.map((unit) => {
                  const selected = unit.id === selectedUnit?.id;
                  return (
                    <button
                      key={unit.id}
                      type="button"
                      onClick={() => setSelectedUnitId(unit.id)}
                      className={`grid w-full grid-cols-[minmax(90px,0.55fr)_minmax(150px,1fr)_minmax(125px,0.75fr)_minmax(145px,0.8fr)_auto] items-center gap-3 border-b border-[#edf2f7] px-5 py-4 text-left transition hover:bg-[#f8fbff] ${selected ? "bg-[#eff7f2] shadow-[inset_3px_0_0_#2f8f5c]" : "bg-white"}`}
                    >
                    <strong className="text-sm font-semibold text-[#182b3d]">
                      {unit.displayNumber}
                    </strong>
                    <span className="min-w-0">
                      <strong className="block truncate text-sm font-medium text-[#30485f]">
                        {unit.displayType}
                      </strong>
                      <small className="mt-1 block truncate text-xs text-[#78899c]">
                        {unit.location}
                      </small>
                    </span>
                    <StatusPill status={unit.inventoryStatus} />
                    <strong className="text-sm font-semibold text-[#24394e]">
                      {unit.displayPrice
                        ? currency.format(unit.displayPrice)
                        : "Price pending"}
                    </strong>
                    <ArrowUpRight size={16} className="text-[#8aa0b3]" />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="px-6 py-14 text-center">
              <Home className="mx-auto text-[#a2b0bf]" size={28} />
              <strong className="mt-4 block text-sm text-[#30485f]">
                No units match this view
              </strong>
              <p className="mt-1 text-sm text-[#6b7d93]">
                Change the filters or add units in the stock master.
              </p>
            </div>
          )}
        </article>
        <aside className="rounded-[22px] border border-[#dce5ee] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.055)]">
          {selectedUnit ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-[#76899d]">
                    Selected unit
                  </span>
                  <h3 className="mt-1 text-[1.5rem] font-semibold tracking-[-0.04em] text-[#142132]">
                    Unit {selectedUnit.displayNumber}
                  </h3>
                </div>
                <StatusPill status={selectedUnit.inventoryStatus} />
              </div>
              <p className="mt-2 text-sm text-[#64778d]">
                {selectedUnit.displayType} · {selectedUnit.location}
              </p>
              <strong className="mt-5 block text-[1.55rem] font-semibold tracking-[-0.045em] text-[#173149]">
                {selectedUnit.displayPrice
                  ? currency.format(selectedUnit.displayPrice)
                  : "Price on request"}
              </strong>
              {selectedUnit.displayPrice && selectedUnit.priceSource === "catalogue" ? (
                <span className="mt-1 block text-xs font-medium text-[#6b7d93]">
                  Current catalogue price
                </span>
              ) : null}
              <div className="mt-5 grid grid-cols-2 gap-2.5">
                {[
                  [
                    <BedDouble
                      key="bedrooms"
                      size={14}
                      className="text-[#66849b]"
                    />,
                    "Bedrooms",
                    selectedUnit.bedrooms,
                  ],
                  [
                    <Home
                      key="bathrooms"
                      size={14}
                      className="text-[#66849b]"
                    />,
                    "Bathrooms",
                    selectedUnit.bathrooms,
                  ],
                  [
                    <MapPinned
                      key="size"
                      size={14}
                      className="text-[#66849b]"
                    />,
                    "Size",
                    selectedUnit.sizeSqm ? `${selectedUnit.sizeSqm} m²` : "—",
                  ],
                  [
                    <Building2
                      key="floorplan"
                      size={14}
                      className="text-[#66849b]"
                    />,
                    "Floorplan",
                    selectedUnit.floorplanName || "—",
                  ],
                ].map(([icon, label, value]) => (
                  <div
                    key={label}
                    className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfcfe] px-3 py-3"
                  >
                    {icon}
                    <span className="mt-2 block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#8292a3]">
                      {label}
                    </span>
                    <strong className="mt-1 block truncate text-sm text-[#263d52]">
                      {value || "—"}
                    </strong>
                  </div>
                ))}
              </div>
              {selectedUnit.buyerName ? (
                <div className="mt-4 rounded-[14px] border border-[#f0dfba] bg-[#fffbf2] px-3.5 py-3">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#9a631d]">
                    <Users size={14} />
                    Buyer / transaction
                  </span>
                  <strong className="mt-1.5 block text-sm text-[#5b431e]">
                    {selectedUnit.buyerName}
                  </strong>
                </div>
              ) : null}
              {canManageInventory ? (
                <section className="mt-5 rounded-[16px] border border-[#d8e0ee] bg-[#f8faff] p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="inline-flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[#3d5978]">
                        <LockKeyhole size={12} />
                        Developer controls
                      </span>
                      <p className="mt-1 text-xs text-[#62758d]">
                        Release stock and apply governed pricing.
                      </p>
                    </div>
                    <StatusPill status={selectedUnit.inventoryStatus} />
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <Field
                      type="number"
                      min="0"
                      step="1"
                      value={priceDraft}
                      disabled={controlSaving}
                      onChange={(event) => setPriceDraft(event.target.value)}
                      placeholder="Unit price"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={controlSaving || !priceDraft.trim()}
                      onClick={() => void savePrice()}
                    >
                      {controlSaving ? "Saving…" : "Save price"}
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#e0e8f1] bg-white px-3 py-2.5">
                    <span className="text-xs text-[#60758d]">
                      <strong className="font-semibold text-[#29425e]">
                        Reservation default:
                      </strong>{" "}
                      {reservationDepositConfigured
                        ? reservationDepositSummary || "Configured"
                        : "Needs configuration"}
                    </span>
                    <button
                      type="button"
                      disabled={
                        controlSaving || selectedUnit.inventoryStatus === "sold"
                      }
                      className="text-xs font-semibold text-[#285f47] hover:underline disabled:cursor-not-allowed disabled:text-[#91a2b2]"
                      onClick={() => void changeReleaseState()}
                    >
                      {selectedUnit.inventoryStatus === "unreleased"
                        ? "Release for sale"
                        : "Move to unreleased"}
                    </button>
                  </div>
                </section>
              ) : null}
              <section className="mt-5 rounded-[16px] border border-[#cfe4d9] bg-[#f5fbf7] p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[#397054]">
                      Sales desk
                    </span>
                    <p className="mt-1 text-xs text-[#527264]">
                      Link a buyer, then track the next sales action.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-semibold text-[#286646] hover:underline"
                    onClick={() => toggleComparison(selectedUnit)}
                  >
                    {comparisonUnitIds.includes(selectedUnit.id)
                      ? "Remove compare"
                      : "Compare"}
                  </button>
                </div>
                <Field
                  as="select"
                  className="mt-3 text-sm"
                  value={selectedLeadId}
                  onChange={(event) => setSelectedLeadId(event.target.value)}
                >
                  <option value="">Choose buyer lead</option>
                  {buyerLeads.map((lead) => (
                    <option
                      key={lead.developerLeadId}
                      value={lead.developerLeadId}
                    >
                      {lead.buyerFullName ||
                        lead.protectedSummary ||
                        "Protected buyer"}{" "}
                      · {lead.leadStatus}
                    </option>
                  ))}
                </Field>
                {showBuyerForm ? (
                  <div className="mt-3 grid gap-2">
                    <Field
                      value={buyerDraft.name}
                      onChange={(event) =>
                        setBuyerDraft((value) => ({
                          ...value,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Buyer name"
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field
                        value={buyerDraft.email}
                        onChange={(event) =>
                          setBuyerDraft((value) => ({
                            ...value,
                            email: event.target.value,
                          }))
                        }
                        placeholder="Email"
                      />
                      <Field
                        value={buyerDraft.phone}
                        onChange={(event) =>
                          setBuyerDraft((value) => ({
                            ...value,
                            phone: event.target.value,
                          }))
                        }
                        placeholder="Phone"
                      />
                    </div>
                    <Field
                      value={buyerDraft.note}
                      onChange={(event) =>
                        setBuyerDraft((value) => ({
                          ...value,
                          note: event.target.value,
                        }))
                      }
                      placeholder="Private buyer note (optional)"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={salesSaving}
                        onClick={() => void createBuyerLead()}
                      >
                        <UserPlus size={13} />
                        {salesSaving ? "Saving…" : "Add buyer"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setShowBuyerForm(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#286646] hover:underline"
                    onClick={() => setShowBuyerForm(true)}
                  >
                    <UserPlus size={13} />
                    Add a new buyer lead
                  </button>
                )}
                {salesError ? (
                  <p className="mt-2 text-xs font-medium text-[#b74334]">
                    {salesError}
                  </p>
                ) : null}
                {selectedLead ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={salesSaving}
                      onClick={() => void shareUnit()}
                    >
                      <Copy size={13} />
                      Share summary
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={salesSaving}
                      onClick={() => void runLeadAction("viewing")}
                    >
                      <CalendarClock size={13} />
                      Request viewing
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={salesSaving}
                      onClick={() => void runLeadAction("follow_up")}
                    >
                      <MessageSquare size={13} />
                      Log follow-up
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={salesSaving || !canStartSale}
                      onClick={async () => {
                        if (await runLeadAction("reservation"))
                          onCreateTransaction?.(selectedUnit);
                      }}
                    >
                      <CircleDollarSign size={13} />
                      Request reserve
                    </Button>
                  </div>
                ) : null}
              </section>
              {comparisonUnits.length ? (
                <section className="mt-4 rounded-[14px] border border-[#dfe8f1] bg-[#fbfcfe] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[#72859a]">
                      Comparison ({comparisonUnits.length}/3)
                    </span>
                    <button
                      type="button"
                      className="text-xs text-[#60778e] hover:underline"
                      onClick={() => setComparisonUnitIds([])}
                    >
                      Clear
                    </button>
                  </div>
                  <div className="mt-2 grid gap-2">
                    {comparisonUnits.map((unit) => (
                      <div
                        key={unit.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-xs"
                      >
                        <span>
                          <strong className="text-[#20384e]">
                            {unit.displayNumber}
                          </strong>{" "}
                          <span className="text-[#718398]">
                            {unit.displayType}
                          </span>
                        </span>
                        <span className="flex items-center gap-2 font-semibold text-[#28455e]">
                          {unit.displayPrice
                            ? currency.format(unit.displayPrice)
                            : "POR"}
                          <button
                            type="button"
                            aria-label={`Remove Unit ${unit.displayNumber} from comparison`}
                            onClick={() => toggleComparison(unit)}
                          >
                            <X size={13} />
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
              <div className="mt-5 grid gap-2.5">
                {canStartSale ? (
                  <Button onClick={() => onCreateTransaction?.(selectedUnit)}>
                    <CircleDollarSign size={15} />
                    {isAgency ? "Start buyer sale" : "Start sale"}
                  </Button>
                ) : null}
                {selectedUnit.currentTransactionId ? (
                  <Button
                    variant="secondary"
                    onClick={() => onOpenTransaction?.(selectedUnit)}
                  >
                    <ArrowUpRight size={15} />
                    Open transaction
                  </Button>
                ) : null}
                {canManageInventory ? (
                  <Button
                    variant="secondary"
                    onClick={() => onEditUnit?.(selectedUnit)}
                  >
                    <PencilLine size={15} />
                    Edit unit
                  </Button>
                ) : null}
              </div>
              {canManageInventory ? (
                <div className="mt-4 border-t border-[#e9eef4] pt-4">
                  <label className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#64788e]">
                    <Tag size={13} />
                    Availability status
                  </label>
                  <Field
                    as="select"
                    value={
                      text(selectedUnit.status) ||
                      STATUS_META[selectedUnit.inventoryStatus].label
                    }
                    onChange={(event) =>
                      onChangeUnitStatus?.(selectedUnit, event.target.value)
                    }
                  >
                    <option value="Available">Available</option>
                    <option value="Reserved">Reserved</option>
                    <option value="Sold">Sold</option>
                    <option value="Not Released">Not released</option>
                  </Field>
                </div>
              ) : null}
            </>
          ) : null}
        </aside>
      </section>
    </section>
  );
}
