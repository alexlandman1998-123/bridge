import {
  ArrowLeft,
  BedDouble,
  Car,
  Check,
  Columns3,
  Compass,
  Expand,
  Grid2X2,
  Heart,
  GitCompareArrows,
  Layers3,
  List,
  Maximize2,
  Minus,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  auditDevelopmentVisualMap,
  getPublishedVisualMap,
  getVisualHotspotSceneId,
  getVisualMapScene,
  getVisualMapSceneBreadcrumbs,
  getVisualMapSceneUnitIds,
  resolveDevelopmentVisualMap,
  resolveVisualHotspotDestination,
} from "../../core/developments/developmentVisualMap.js";
import {
  buildVisualExplorerEvent,
  filterPublicVisualUnits,
  normaliseVisualSelectionIds,
  publicVisualFilterOptions,
  toggleVisualSelection,
  visualHotspotCentre,
  visualUnitStatus,
} from "../../core/developments/developmentVisualExplorer.js";
import { normaliseSitePlanViewport } from "../../core/developments/developmentSitePlanViewport.js";
import {
  buildDevelopmentVisualCapabilityReport,
  getVisualUnitFloorPlanFallback,
  resolveVisualCapabilityDestination,
} from "../../core/developments/developmentVisualCapabilities.js";
import {
  getLikelyNextVisualScene,
  getVisualOrientation,
  getVisualSceneFloorTabs,
  getVisualSceneImageCandidates,
  getVisualScenePrompt,
} from "../../core/developments/developmentVisualExperience.js";

const STATUS = {
  available: {
    label: "Available",
    fill: "#36a36b",
    chip: "bg-emerald-50 text-emerald-800",
  },
  reserved: {
    label: "Reserved",
    fill: "#d79b35",
    chip: "bg-amber-50 text-amber-800",
  },
  sold: { label: "Sold", fill: "#77838e", chip: "bg-slate-100 text-slate-600" },
  unreleased: {
    label: "Not released",
    fill: "#a5a9a4",
    chip: "bg-stone-100 text-stone-600",
  },
};
const money = (value, compact = false) => {
  const amount = Number(value);
  if (!amount) return "Price on request";
  if (compact)
    return `R${(amount / 1000000).toFixed(amount % 1000000 ? 2 : 0)}m`;
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(amount);
};
const unitImage = (unit, media) =>
  unit.imageUrl ||
  unit.heroImageUrl ||
  media.galleryImageUrls?.[0] ||
  media.heroImageUrl ||
  "/demo-listing-images/revo-sales-cover.png";
const sceneBackgroundStyle = (scene, fallbackUrl) => {
  const crop = normaliseSitePlanViewport(scene?.viewport);
  const horizontal =
    crop.width === 100 ? 50 : (crop.x / (100 - crop.width)) * 100;
  const vertical =
    crop.height === 100 ? 50 : (crop.y / (100 - crop.height)) * 100;
  const images = getVisualSceneImageCandidates(scene);
  const fallback = images.fallback || fallbackUrl || images.webp || images.avif;
  const imageSet = [
    images.avif ? `url("${images.avif}") type("image/avif")` : "",
    images.webp ? `url("${images.webp}") type("image/webp")` : "",
    fallback ? `url("${fallback}")` : "",
  ].filter(Boolean);
  return {
    backgroundImage:
      imageSet.length > 1
        ? `image-set(${imageSet.join(",")})`
        : `url("${fallback}")`,
    backgroundPosition: `${horizontal}% ${vertical}%`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${10000 / crop.width}% ${10000 / crop.height}%`,
  };
};
const initialFilters = () => {
  if (typeof window === "undefined")
    return {
      query: "",
      type: "all",
      status: "all",
      bedrooms: "all",
      floor: "all",
      block: "all",
      phase: "all",
      release: "all",
      maxPrice: "",
    };
  const params = new URLSearchParams(window.location.search);
  return {
    query: params.get("units") || "",
    type: params.get("type") || "all",
    status: params.get("status") || "all",
    bedrooms: params.get("beds") || "all",
    floor: params.get("floor") || "all",
    block: params.get("block") || "all",
    phase: params.get("phase") || "all",
    release: params.get("release") || "all",
    maxPrice: params.get("maxPrice") || "",
  };
};
const initialSelection = (key, inventory) => {
  if (typeof window === "undefined") return [];
  const params = new URLSearchParams(window.location.search);
  const storageKey = `arch9:development-visualiser:${window.location.pathname}:${key}`;
  let stored = "";
  try {
    stored = window.localStorage.getItem(storageKey) || "";
  } catch {
    stored = "";
  }
  return normaliseVisualSelectionIds(
    params.get(key) || stored,
    inventory.map((unit) => unit.id),
  );
};

const emitExplorerEvent = (action, detail) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("arch9:development-visualiser", {
      detail: buildVisualExplorerEvent(action, detail),
    }),
  );
};

function SelectFilter({ label, value, options, onChange }) {
  if (!options.length) return null;
  return (
    <label className="grid min-w-[145px] gap-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#708078]">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-md border border-[#ded9ce] bg-white px-3 text-xs font-medium normal-case tracking-normal text-[#173d33] outline-none focus:border-[#aa853b]"
      >
        <option value="all">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function UnitDrawer({
  unit,
  media,
  enquiry,
  shortlisted,
  compared,
  floorPlanFallback,
  onToggleShortlist,
  onToggleCompare,
  onClose,
}) {
  if (!unit) return null;
  const status = STATUS[visualUnitStatus(unit.status)];
  const plan =
    unit.floorplanUrl ||
    unit.floorPlanUrl ||
    unit.floorplanImageUrl ||
    floorPlanFallback?.url;
  const capture = () => {
    try {
      window.sessionStorage.setItem(
        "arch9:development-enquiry-unit",
        JSON.stringify({
          id: unit.id,
          unitNumber: unit.unitNumber,
          price: unit.price,
        }),
      );
    } catch {
      // Storage can be unavailable in privacy-restricted browsers; the link still works.
    }
  };
  return (
    <aside className="fixed inset-x-0 bottom-0 z-[80] max-h-[90svh] overflow-y-auto rounded-t-[26px] bg-[#fffdf9] shadow-[0_-20px_60px_rgba(9,35,29,.25)] md:inset-y-0 md:left-auto md:w-[440px] md:rounded-none">
      <button
        onClick={onClose}
        aria-label="Close residence details"
        className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-white shadow"
      >
        <X size={18} />
      </button>
      <img
        src={unitImage(unit, media)}
        alt=""
        className="h-52 w-full object-cover md:h-64"
      />
      <div className="p-6 md:p-8">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${status.chip}`}
        >
          {status.label}
        </span>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#a47d31]">
              Residence
            </p>
            <h3 className="mt-1 font-serif text-4xl text-[#143d33]">
              {unit.unitNumber}
            </h3>
            <p className="mt-2 text-[#61746a]">
              {unit.unitType || "Residence"}
              {unit.block ? ` · ${unit.block}` : ""}
            </p>
          </div>
          <strong className="text-right text-xl text-[#143d33]">
            {money(unit.price)}
          </strong>
        </div>
        <div className="mt-6 grid grid-cols-4 divide-x border-y border-[#e6dfd3] py-4 text-center text-xs text-[#61746a]">
          <span>
            <BedDouble size={18} className="mx-auto mb-1" />
            {unit.bedrooms ?? "—"} beds
          </span>
          <span>
            <Columns3 size={18} className="mx-auto mb-1" />
            {unit.bathrooms ?? "—"} baths
          </span>
          <span>
            <Car size={18} className="mx-auto mb-1" />
            {unit.parkingCount ?? "—"} bays
          </span>
          <span>
            <Maximize2 size={18} className="mx-auto mb-1" />
            {unit.sizeSqm ? `${unit.sizeSqm}m²` : "—"}
          </span>
        </div>
        {plan ? (
          <div className="mt-6 rounded-xl border border-[#e4ddd1] bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-[#a47d31]">
              Floor plan
            </p>
            {floorPlanFallback?.source === "unit_type" ? (
              <p className="mt-1 text-[10px] text-[#718078]">
                Representative plan · {floorPlanFallback.reason}
              </p>
            ) : null}
            <img
              src={plan}
              alt={`${unit.unitNumber} floor plan`}
              className="mt-3 h-48 w-full object-contain"
            />
          </div>
        ) : null}
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            onClick={onToggleShortlist}
            className={`flex h-11 items-center justify-center gap-2 rounded-md border text-sm font-semibold ${shortlisted ? "border-[#b78c39] bg-[#fff8e8] text-[#7b5919]" : "border-[#dcd6ca]"}`}
          >
            <Heart size={16} fill={shortlisted ? "currentColor" : "none"} />
            {shortlisted ? "Shortlisted" : "Shortlist"}
          </button>
          <button
            onClick={onToggleCompare}
            className={`flex h-11 items-center justify-center gap-2 rounded-md border text-sm font-semibold ${compared ? "border-[#0c5a49] bg-[#edf7f3] text-[#0c5a49]" : "border-[#dcd6ca]"}`}
          >
            <GitCompareArrows size={16} />
            {compared ? "Comparing" : "Compare"}
          </button>
        </div>
        <a
          href={enquiry}
          onClick={capture}
          className="mt-3 flex h-14 items-center justify-center bg-[#073e32] font-semibold text-white"
        >
          Enquire about {unit.unitNumber}
        </a>
      </div>
    </aside>
  );
}

function ComparisonDialog({ units, media, enquiry, onRemove, onClose }) {
  if (!units.length) return null;
  const rows = [
    ["Price", (unit) => money(unit.price)],
    ["Type", (unit) => unit.unitType || "—"],
    ["Bedrooms", (unit) => unit.bedrooms ?? "—"],
    ["Bathrooms", (unit) => unit.bathrooms ?? "—"],
    ["Size", (unit) => (unit.sizeSqm ? `${unit.sizeSqm} m²` : "—")],
    ["Parking", (unit) => unit.parkingCount ?? "—"],
    ["Floor", (unit) => unit.floor ?? unit.floorNumber ?? "—"],
    ["Phase", (unit) => unit.phase || "—"],
    ["Status", (unit) => STATUS[visualUnitStatus(unit.status)].label],
  ];
  return (
    <div
      className="fixed inset-0 z-[95] overflow-y-auto bg-[#08251f]/70 p-3 backdrop-blur-sm md:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Compare residences"
    >
      <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl bg-[#fffdf9] shadow-2xl">
        <header className="flex items-center justify-between border-b px-5 py-4 md:px-7">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a47d31]">
              Buyer shortlist
            </p>
            <h3 className="mt-1 font-serif text-3xl text-[#143d33]">
              Compare residences
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close comparison"
            className="grid h-10 w-10 place-items-center rounded-full border"
          >
            <X size={18} />
          </button>
        </header>
        <div className="overflow-x-auto">
          <div
            className="grid min-w-[680px]"
            style={{
              gridTemplateColumns: `150px repeat(${units.length}, minmax(170px, 1fr))`,
            }}
          >
            <span className="border-b border-r bg-[#f5f1e9]" />
            {units.map((unit) => (
              <div key={unit.id} className="relative border-b border-r p-3">
                <img
                  src={unitImage(unit, media)}
                  alt=""
                  className="h-28 w-full rounded-lg object-cover"
                />
                <strong className="mt-3 block text-lg text-[#143d33]">
                  {unit.unitNumber}
                </strong>
                <button
                  onClick={() => onRemove(unit.id)}
                  className="absolute right-5 top-5 grid h-8 w-8 place-items-center rounded-full bg-white shadow"
                  aria-label={`Remove ${unit.unitNumber} from comparison`}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <strong className="border-b border-r bg-[#f5f1e9] px-4 py-3 text-xs uppercase tracking-[.1em] text-[#66776e]">
                  {label}
                </strong>
                {units.map((unit) => (
                  <span
                    key={`${label}:${unit.id}`}
                    className="border-b border-r px-4 py-3 text-sm text-[#29433b]"
                  >
                    {value(unit)}
                  </span>
                ))}
              </div>
            ))}
            <span className="border-r bg-[#f5f1e9]" />
            {units.map((unit) => (
              <div key={`${unit.id}:action`} className="border-r p-3">
                <a
                  href={enquiry}
                  className="flex h-11 items-center justify-center rounded-md bg-[#073e32] text-sm font-semibold text-white"
                >
                  Enquire about {unit.unitNumber}
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PublicDevelopmentVisualExplorer({
  inventory = [],
  media = {},
  enquiry = "#enquire",
  mobile = false,
  freshness = {},
  previewVisualMap = null,
  initialSceneId = "",
  simulatedFailedSceneIds = [],
  embedded = false,
}) {
  const visualMap = useMemo(
    () =>
      previewVisualMap
        ? resolveDevelopmentVisualMap({ visualMap: previewVisualMap })
        : getPublishedVisualMap(media.visualMap),
    [media.visualMap, previewVisualMap],
  );
  const [sceneId, setSceneId] = useState(() => {
    const requested =
      initialSceneId || typeof window === "undefined"
        ? initialSceneId
        : new URLSearchParams(window.location.search).get("scene");
    return visualMap.scenes.some((item) => item.id === requested)
      ? requested
      : visualMap.defaultSceneId;
  });
  const scene = getVisualMapScene(visualMap, sceneId);
  const [filters, setFilters] = useState(initialFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(() =>
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("unit") || "",
  );
  const [hoveredId, setHoveredId] = useState("");
  const [view, setView] = useState("map");
  const [layout, setLayout] = useState("list");
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [favourites, setFavourites] = useState(
    () => new Set(initialSelection("shortlist", inventory)),
  );
  const [comparison, setComparison] = useState(
    () => new Set(initialSelection("compare", inventory).slice(0, 3)),
  );
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [sceneImageStatus, setSceneImageStatus] = useState("loading");
  const [previousSceneStyle, setPreviousSceneStyle] = useState(null);
  const [journeyNotice, setJourneyNotice] = useState("");
  const [failedSceneIds, setFailedSceneIds] = useState(
    () => new Set(simulatedFailedSceneIds),
  );
  const [selectedFloorPlan, setSelectedFloorPlan] = useState(null);
  const [sceneHistory, setSceneHistory] = useState([]);
  const [showFirstUseHint, setShowFirstUseHint] = useState(false);
  const drag = useRef(null);
  const touchPoints = useRef(new Map());
  const emittedSceneStates = useRef(new Set());
  const cardRefs = useRef(new Map());
  const options = useMemo(
    () => publicVisualFilterOptions(inventory),
    [inventory],
  );
  const allMappedUnitIds = useMemo(
    () =>
      new Set(getVisualMapSceneUnitIds(visualMap, visualMap.defaultSceneId)),
    [visualMap],
  );
  const sceneUnitIds = useMemo(
    () => new Set(getVisualMapSceneUnitIds(visualMap, sceneId)),
    [visualMap, sceneId],
  );
  const sceneInventory = useMemo(
    () =>
      allMappedUnitIds.size
        ? inventory.filter((unit) => sceneUnitIds.has(String(unit.id)))
        : inventory,
    [allMappedUnitIds, inventory, sceneUnitIds],
  );
  const units = useMemo(
    () => filterPublicVisualUnits(sceneInventory, filters),
    [sceneInventory, filters],
  );
  const unitsById = useMemo(
    () => new Map(inventory.map((unit) => [String(unit.id), unit])),
    [inventory],
  );
  const selected = unitsById.get(String(selectedId)) || null;
  const readiness = useMemo(
    () => auditDevelopmentVisualMap(visualMap, inventory),
    [visualMap, inventory],
  );
  const capability = useMemo(
    () =>
      buildDevelopmentVisualCapabilityReport({
        visualMap,
        inventory,
        failedSceneIds: [...failedSceneIds],
      }),
    [visualMap, inventory, failedSceneIds],
  );
  const breadcrumbs = useMemo(
    () => getVisualMapSceneBreadcrumbs(visualMap, sceneId),
    [visualMap, sceneId],
  );
  const likelyNextScene = useMemo(
    () => getLikelyNextVisualScene(visualMap, sceneId),
    [visualMap, sceneId],
  );
  const floorTabs = useMemo(
    () => getVisualSceneFloorTabs(visualMap, sceneId),
    [visualMap, sceneId],
  );
  const orientation = getVisualOrientation(scene);
  const visibleIds = useMemo(
    () => new Set(units.map((unit) => String(unit.id))),
    [units],
  );
  const hotspots = useMemo(
    () =>
      (scene?.hotspots || []).filter(
        (hotspot) =>
          hotspot.visibility !== "hidden" &&
          (hotspot.type !== "unit" ||
            visibleIds.has(String(hotspot.target.id))),
      ),
    [scene, visibleIds],
  );
  const setFilter = (key, value) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const clearFilters = () =>
    setFilters({
      query: "",
      type: "all",
      status: "all",
      bedrooms: "all",
      floor: "all",
      block: "all",
      phase: "all",
      release: "all",
      maxPrice: "",
    });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const mapping = {
      units: filters.query,
      type: filters.type,
      status: filters.status,
      beds: filters.bedrooms,
      floor: filters.floor,
      block: filters.block,
      phase: filters.phase,
      release: filters.release,
      maxPrice: filters.maxPrice,
      unit: selectedId,
      scene: sceneId === visualMap.defaultSceneId ? "" : sceneId,
      shortlist: [...favourites].join(","),
      compare: [...comparison].join(","),
    };
    Object.entries(mapping).forEach(([key, value]) =>
      value && value !== "all" ? params.set(key, value) : params.delete(key),
    );
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`,
    );
    try {
      window.localStorage.setItem(
        `arch9:development-visualiser:${window.location.pathname}:shortlist`,
        [...favourites].join(","),
      );
      window.localStorage.setItem(
        `arch9:development-visualiser:${window.location.pathname}:compare`,
        [...comparison].join(","),
      );
    } catch {
      // URL state still preserves the buyer's selection when storage is unavailable.
    }
  }, [
    filters,
    selectedId,
    sceneId,
    visualMap.defaultSceneId,
    favourites,
    comparison,
  ]);
  useEffect(() => {
    cardRefs.current
      .get(String(selectedId))
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);
  useEffect(() => {
    const validIds = inventory.map((unit) => unit.id);
    queueMicrotask(() => {
      setFavourites(
        (current) =>
          new Set(normaliseVisualSelectionIds([...current], validIds)),
      );
      setComparison(
        (current) =>
          new Set(
            normaliseVisualSelectionIds([...current], validIds).slice(0, 3),
          ),
      );
      if (
        selectedId &&
        !validIds.some((id) => String(id) === String(selectedId))
      )
        setSelectedId("");
    });
  }, [inventory, selectedId]);
  useEffect(() => {
    const url = scene?.background?.url || media.sitePlanUrl;
    if (simulatedFailedSceneIds.includes(scene?.id)) {
      queueMicrotask(() => {
        setSceneImageStatus("error");
        setFailedSceneIds((current) => new Set([...current, scene.id]));
      });
      return undefined;
    }
    if (!url) {
      queueMicrotask(() => setSceneImageStatus("missing"));
      return undefined;
    }
    let active = true;
    queueMicrotask(() => active && setSceneImageStatus("loading"));
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      setSceneImageStatus("ready");
      setFailedSceneIds((current) => {
        if (!current.has(scene.id)) return current;
        const next = new Set(current);
        next.delete(scene.id);
        return next;
      });
    };
    image.onerror = () => {
      if (!active) return;
      setSceneImageStatus("error");
      setFailedSceneIds((current) => new Set([...current, scene.id]));
    };
    image.src = url;
    return () => {
      active = false;
    };
  }, [
    scene?.background?.url,
    scene?.id,
    media.sitePlanUrl,
    simulatedFailedSceneIds,
  ]);
  useEffect(() => {
    if (!["ready", "missing", "error"].includes(sceneImageStatus) || !scene)
      return;
    const key = `${scene.id}:${sceneImageStatus}`;
    if (emittedSceneStates.current.has(key)) return;
    emittedSceneStates.current.add(key);
    queueMicrotask(() => {
      emitExplorerEvent("scene_viewed", {
        sceneId: scene.id,
        metadata: {
          sceneName: scene.name,
          sceneType: scene.type,
          imageStatus: sceneImageStatus,
        },
      });
      if (["missing", "error"].includes(sceneImageStatus))
        emitExplorerEvent("fallback_encountered", {
          sceneId: scene.id,
          metadata: {
            sceneName: scene.name,
            reason:
              sceneImageStatus === "error" ? "image_failed" : "image_missing",
          },
        });
    });
  }, [scene, sceneImageStatus]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hintKey = "arch9:development-visualiser:first-use-seen";
    try {
      if (!window.localStorage.getItem(hintKey)) setShowFirstUseHint(true);
    } catch {
      setShowFirstUseHint(true);
    }
  }, []);
  useEffect(() => {
    if (sceneImageStatus !== "ready" || !likelyNextScene?.background?.url)
      return undefined;
    const image = new Image();
    image.src = likelyNextScene.background.url;
    return () => {
      image.src = "";
    };
  }, [sceneImageStatus, likelyNextScene?.id, likelyNextScene?.background?.url]);
  useEffect(() => {
    const handleKey = (event) => {
      if (event.key !== "Escape") return;
      if (comparisonOpen) setComparisonOpen(false);
      else if (selectedId) setSelectedId("");
      else if (fullscreen) setFullscreen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [comparisonOpen, selectedId, fullscreen]);
  const choose = (id) => {
    const unit = inventory.find((item) => String(item.id) === String(id));
    const floorPlan = getVisualUnitFloorPlanFallback(visualMap, unit);
    setSelectedId(String(id));
    setSelectedFloorPlan(floorPlan);
    setHoveredId("");
    emitExplorerEvent("unit_opened", {
      sceneId,
      unitId: id,
      metadata: { unitNumber: unit?.unitNumber || "" },
    });
    if (
      unit?.floorplanUrl ||
      unit?.floorPlanUrl ||
      unit?.floorplanImageUrl ||
      floorPlan.url
    )
      emitExplorerEvent("floor_plan_viewed", {
        sceneId,
        unitId: id,
        metadata: {
          unitNumber: unit?.unitNumber || "",
          source: floorPlan.source,
        },
      });
  };
  const navigateScene = (nextSceneId, { replaceHistory = false } = {}) => {
    if (!nextSceneId || nextSceneId === sceneId) return;
    if (!replaceHistory)
      setSceneHistory((current) => [...current, sceneId].slice(-20));
    if (sceneImageStatus === "ready")
      setPreviousSceneStyle(sceneBackgroundStyle(scene, media.sitePlanUrl));
    setSceneImageStatus("loading");
    setSceneId(nextSceneId);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const navigateBack = () => {
    const previous = sceneHistory.at(-1);
    if (!previous) return;
    setSceneHistory((current) => current.slice(0, -1));
    navigateScene(previous, { replaceHistory: true });
  };
  const dismissFirstUseHint = () => {
    setShowFirstUseHint(false);
    try {
      window.localStorage.setItem(
        "arch9:development-visualiser:first-use-seen",
        "true",
      );
    } catch {
      // The hint still closes for this visit when storage is unavailable.
    }
  };
  const activateHotspot = (hotspot) => {
    const destination = resolveVisualCapabilityDestination({
      visualMap,
      hotspot,
      inventory,
      failedSceneIds: [...failedSceneIds],
    });
    emitExplorerEvent("hotspot_selected", {
      sceneId,
      unitId: destination.unitId,
      metadata: {
        targetType: hotspot.target?.type || "",
        targetId: hotspot.target?.id || "",
        destinationType: destination.type,
      },
    });
    if (destination.fallbackReason)
      emitExplorerEvent("fallback_encountered", {
        sceneId,
        unitId: destination.unitId,
        metadata: {
          sceneName: scene?.name || "",
          reason: destination.fallbackReason,
        },
      });
    setJourneyNotice("");
    if (destination.type === "scene") navigateScene(destination.sceneId);
    else if (destination.type === "unit") choose(destination.unitId);
    else if (destination.type === "inventory_filter") {
      const destinationFilters = { ...destination.filters };
      if (destinationFilters.unitType) {
        destinationFilters.type = destinationFilters.unitType;
        delete destinationFilters.unitType;
      }
      setFilters((current) => ({ ...current, ...destinationFilters }));
      if (mobile) setView("residences");
    } else if (destination.type === "external")
      window.open(
        destination.url,
        destination.newTab ? "_blank" : "_self",
        "noopener,noreferrer",
      );
    else if (destination.type === "amenity")
      setJourneyNotice(hotspot.label?.text || "Amenity details");
    else
      setJourneyNotice("More information is available in the residence list.");
    emitExplorerEvent("destination", {
      sceneId,
      unitId: destination.unitId,
      shortlistSize: favourites.size,
      compareSize: comparison.size,
    });
  };
  const toggleShortlist = (unitId) => {
    setFavourites((current) => {
      const next = new Set(toggleVisualSelection([...current], unitId));
      emitExplorerEvent("shortlisted", {
        unitId,
        sceneId,
        shortlistSize: next.size,
        compareSize: comparison.size,
      });
      return next;
    });
  };
  const toggleCompare = (unitId) => {
    setComparison((current) => {
      const next = new Set(toggleVisualSelection([...current], unitId, 3));
      emitExplorerEvent("compared", {
        unitId,
        sceneId,
        shortlistSize: favourites.size,
        compareSize: next.size,
      });
      return next;
    });
  };
  const shareSelection = async () => {
    const url = window.location.href;
    try {
      if (navigator.share)
        await navigator.share({ title: "My residence shortlist", url });
      else await navigator.clipboard.writeText(url);
      emitExplorerEvent("share", {
        sceneId,
        shortlistSize: favourites.size,
        compareSize: comparison.size,
      });
    } catch {
      // The user can cancel the native share sheet without affecting their selections.
    }
  };
  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  const canvas = (
    <div
      role="application"
      aria-label={`Interactive ${scene?.name || "development"} plan. Use plus and minus to zoom and drag to pan.`}
      tabIndex={0}
      className="relative h-full min-h-[430px] touch-none overflow-hidden bg-[#d8ded8] select-none"
      onWheel={(event) =>
        setZoom((value) =>
          Math.min(2.5, Math.max(1, value + (event.deltaY < 0 ? 0.1 : -0.1))),
        )
      }
      onKeyDown={(event) => {
        if (event.key === "+" || event.key === "=")
          setZoom((value) => Math.min(2.5, value + 0.2));
        if (event.key === "-") setZoom((value) => Math.max(1, value - 0.2));
        if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
            event.key,
          )
        ) {
          const buttons = [
            ...event.currentTarget.querySelectorAll("[data-hotspot-button]"),
          ];
          if (!buttons.length) return;
          event.preventDefault();
          const current = buttons.indexOf(document.activeElement);
          const direction = ["ArrowRight", "ArrowDown"].includes(event.key)
            ? 1
            : -1;
          buttons[
            (current + direction + buttons.length) % buttons.length
          ].focus();
        }
      }}
      onPointerDown={(event) => {
        if (event.target.closest("button,[data-hotspot]")) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        touchPoints.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        const points = [...touchPoints.current.values()];
        drag.current =
          points.length > 1
            ? {
                kind: "pinch",
                distance: Math.hypot(
                  points[0].x - points[1].x,
                  points[0].y - points[1].y,
                ),
                zoom,
              }
            : { kind: "pan", x: event.clientX, y: event.clientY, pan };
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        touchPoints.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        const points = [...touchPoints.current.values()];
        if (drag.current.kind === "pinch" && points.length > 1) {
          const distance = Math.hypot(
            points[0].x - points[1].x,
            points[0].y - points[1].y,
          );
          setZoom(
            Math.min(
              2.5,
              Math.max(
                1,
                drag.current.zoom * (distance / drag.current.distance),
              ),
            ),
          );
        } else if (drag.current.kind === "pan") {
          setPan({
            x: drag.current.pan.x + event.clientX - drag.current.x,
            y: drag.current.pan.y + event.clientY - drag.current.y,
          });
        }
      }}
      onPointerUp={(event) => {
        touchPoints.current.delete(event.pointerId);
        drag.current = null;
      }}
      onPointerCancel={(event) => {
        touchPoints.current.delete(event.pointerId);
        drag.current = null;
      }}
    >
      <div
        className="absolute inset-0 origin-center motion-safe:transition-transform motion-safe:duration-200"
        style={{ transform }}
      >
        {sceneImageStatus === "loading" && previousSceneStyle ? (
          <div
            className="absolute inset-0 scale-[1.01] opacity-70 blur-[1px] motion-safe:transition-opacity motion-safe:duration-300"
            style={previousSceneStyle}
            aria-hidden="true"
          />
        ) : null}
        {sceneImageStatus === "ready" ? (
          <div
            className="absolute inset-0 opacity-100 motion-safe:transition-opacity motion-safe:duration-300"
            style={sceneBackgroundStyle(scene, media.sitePlanUrl)}
          />
        ) : null}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
        >
          {hotspots
            .filter((hotspot) => hotspot.geometry.type === "polygon")
            .map((hotspot) => {
              const unit = unitsById.get(String(hotspot.target.id));
              const childSceneId = getVisualHotspotSceneId(hotspot);
              const childUnits = childSceneId
                ? getVisualMapSceneUnitIds(visualMap, childSceneId)
                    .map((id) => unitsById.get(String(id)))
                    .filter(Boolean)
                : [];
              const groupStatus = childUnits.some(
                (item) => visualUnitStatus(item.status) === "available",
              )
                ? "available"
                : childUnits.some(
                      (item) => visualUnitStatus(item.status) === "reserved",
                    )
                  ? "reserved"
                  : childUnits.length
                    ? "sold"
                    : "unreleased";
              const status =
                STATUS[unit ? visualUnitStatus(unit.status) : groupStatus];
              const active =
                String(hotspot.target.id) === String(selectedId) ||
                String(hotspot.target.id) === String(hoveredId);
              return (
                <polygon
                  key={hotspot.id}
                  data-hotspot
                  points={hotspot.geometry.coordinates
                    .map((point) => point.join(","))
                    .join(" ")}
                  fill={status?.fill || "#1f7460"}
                  fillOpacity={active ? 0.8 : 0.55}
                  stroke={active ? "#fff4c9" : "#ffffff"}
                  strokeWidth={active ? 0.65 : 0.25}
                  vectorEffect="non-scaling-stroke"
                  className="cursor-pointer transition-all"
                  onMouseEnter={() => setHoveredId(String(hotspot.target.id))}
                  onMouseLeave={() => setHoveredId("")}
                  onClick={() => activateHotspot(hotspot)}
                />
              );
            })}
        </svg>
        {hotspots.map((hotspot) => {
          const [x, y] =
            hotspot.label?.position || visualHotspotCentre(hotspot);
          const unit = unitsById.get(String(hotspot.target.id));
          const childSceneId = getVisualHotspotSceneId(hotspot);
          const destination = resolveVisualHotspotDestination(
            visualMap,
            hotspot,
            inventory,
          );
          const childCount = childSceneId
            ? getVisualMapSceneUnitIds(visualMap, childSceneId).length
            : 0;
          if (!unit && destination.type === "none") return null;
          return (
            <button
              key={`${hotspot.id}:label`}
              data-hotspot
              data-hotspot-button
              aria-label={`${hotspot.label?.text || unit?.unitNumber || hotspot.target.id}. ${destination.type === "scene" ? "Explore this view" : "Open details"}`}
              onClick={() => activateHotspot(hotspot)}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: `translate(-50%,-50%) scale(${1 / zoom})`,
              }}
              className={`absolute rounded-md border border-white/80 px-2 py-1 text-[10px] font-bold shadow-md outline-none motion-safe:transition motion-safe:hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-[#f4d99b]/80 ${String(hotspot.target.id) === String(selectedId) ? "bg-[#062f28] text-white ring-2 ring-[#f4d99b]" : "bg-white/95 text-[#133d32]"}`}
            >
              {hotspot.label?.text || unit?.unitNumber || hotspot.target.id}
              {childCount ? ` · ${childCount}` : ""}
            </button>
          );
        })}
      </div>
      {sceneImageStatus !== "ready" ? (
        <div
          className={`absolute inset-0 grid place-items-center p-8 text-center ${previousSceneStyle && sceneImageStatus === "loading" ? "bg-[#dfe5e1]/55 backdrop-blur-[1px]" : "bg-[#dfe5e1]/92"}`}
        >
          <span className="max-w-sm text-sm text-[#52685e]">
            {sceneImageStatus === "loading"
              ? "Loading interactive plan…"
              : capability.scenes.find((item) => item.sceneId === scene?.id)
                  ?.reason ||
                "This image is unavailable. Residence availability remains accessible."}
            {sceneImageStatus !== "loading" ? (
              <button
                type="button"
                onClick={() => setView("residences")}
                className="mx-auto mt-4 block rounded-md bg-[#143d33] px-4 py-2 text-xs font-bold text-white"
              >
                View residences
              </button>
            ) : null}
          </span>
        </div>
      ) : null}
      {journeyNotice ? (
        <div className="absolute bottom-4 left-4 flex max-w-[calc(100%-140px)] items-center gap-3 rounded-lg bg-[#082f28]/95 px-4 py-3 text-xs font-semibold text-white shadow-lg backdrop-blur">
          <span>{journeyNotice}</span>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setJourneyNotice("")}
            className="rounded p-1 hover:bg-white/15"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}
      <div className="absolute left-4 top-4 flex max-w-[calc(100%-145px)] flex-wrap items-center overflow-hidden rounded-md bg-[#082f28]/90 p-1 text-white shadow-lg backdrop-blur">
        {sceneHistory.length ? (
          <button
            type="button"
            onClick={navigateBack}
            aria-label="Back to previous view"
            className="grid h-8 w-8 place-items-center rounded hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white"
          >
            <ArrowLeft size={15} />
          </button>
        ) : null}
        {breadcrumbs.map((item, index) => (
          <span key={item.id} className="flex items-center">
            {index ? <span className="px-1 text-white/45">/</span> : null}
            <button
              onClick={() => navigateScene(item.id)}
              className={`rounded px-2 py-1.5 text-[10px] font-bold uppercase tracking-[.1em] ${item.id === sceneId ? "bg-white text-[#143d33]" : "hover:bg-white/15"}`}
            >
              {item.name}
            </button>
          </span>
        ))}
      </div>
      <div
        className="absolute right-4 top-4 grid h-12 w-12 place-items-center rounded-full bg-white/95 text-[#143d33] shadow-lg"
        title={orientation.label}
        aria-label={orientation.label}
      >
        <Compass
          size={23}
          style={{ transform: `rotate(${orientation.degrees}deg)` }}
          className="motion-safe:transition-transform"
        />
      </div>
      {hotspots.length ? (
        <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-full bg-[#fffdf9]/95 px-4 py-2 text-center text-[10px] font-bold uppercase tracking-[.1em] text-[#174438] shadow-lg backdrop-blur motion-safe:animate-pulse">
          {getVisualScenePrompt(scene, hotspots.length)}
        </div>
      ) : null}
      {floorTabs.length > 1 ? (
        <div className="absolute bottom-4 left-4 flex max-w-[calc(100%-145px)] gap-1 overflow-x-auto rounded-lg bg-white/95 p-1.5 shadow-lg backdrop-blur">
          {floorTabs.map((floor) => (
            <button
              key={floor.id}
              type="button"
              onClick={() => navigateScene(floor.id)}
              aria-pressed={floor.id === sceneId}
              className={`shrink-0 rounded-md px-3 py-2 text-[10px] font-bold ${floor.id === sceneId ? "bg-[#123f34] text-white" : "text-[#365d52] hover:bg-[#edf3ef]"}`}
            >
              {floor.name}
            </button>
          ))}
        </div>
      ) : null}
      {likelyNextScene ? (
        <button
          type="button"
          onClick={() => navigateScene(likelyNextScene.id)}
          className="absolute right-4 top-20 hidden w-36 overflow-hidden rounded-lg border-2 border-white bg-white text-left shadow-xl md:block"
          aria-label={`Explore next view: ${likelyNextScene.name}`}
        >
          <span
            className="block h-16 bg-[#d9e1dc] bg-cover bg-center"
            style={{
              backgroundImage: `url("${likelyNextScene.background.url}")`,
            }}
          />
          <span className="block px-3 py-2">
            <small className="block text-[8px] font-bold uppercase tracking-wider text-[#8a713d]">
              Next view
            </small>
            <strong className="block truncate text-[11px] text-[#173d33]">
              {likelyNextScene.name}
            </strong>
          </span>
        </button>
      ) : null}
      {showFirstUseHint ? (
        <div className="absolute inset-x-4 bottom-20 z-20 mx-auto max-w-sm rounded-xl bg-[#082f28] p-4 text-sm text-white shadow-2xl md:bottom-6">
          <strong className="block">Explore the development visually</strong>
          <p className="mt-1 text-xs leading-5 text-white/75">
            Select a highlighted area to go deeper. Drag to move, pinch or use
            the controls to zoom, and use arrow keys to move between hotspots.
          </p>
          <button
            type="button"
            onClick={dismissFirstUseHint}
            className="mt-3 rounded-md bg-white px-3 py-1.5 text-xs font-bold text-[#143d33]"
          >
            Got it
          </button>
        </div>
      ) : null}
      <div className="absolute bottom-4 right-4 grid overflow-hidden rounded-lg bg-white shadow-lg">
        <button
          aria-label="Zoom in"
          onClick={() => setZoom((value) => Math.min(2.5, value + 0.2))}
          className="grid h-11 w-11 place-items-center border-b"
        >
          <Plus size={17} />
        </button>
        <button
          aria-label="Zoom out"
          onClick={() => {
            setZoom((value) => Math.max(1, value - 0.2));
            if (zoom <= 1.2) setPan({ x: 0, y: 0 });
          }}
          className="grid h-11 w-11 place-items-center"
        >
          <Minus size={17} />
        </button>
      </div>
    </div>
  );

  const filtersPanel = (
    <>
      <label className="relative min-w-[210px] flex-1">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[#74847b]"
        />
        <input
          value={filters.query}
          onChange={(event) => setFilter("query", event.target.value)}
          placeholder="Search unit, block or phase"
          className="h-10 w-full rounded-md border border-[#ded9ce] bg-white pl-9 pr-3 text-xs outline-none focus:border-[#aa853b]"
        />
      </label>
      <SelectFilter
        label="Property type"
        value={filters.type}
        options={options.types}
        onChange={(value) => setFilter("type", value)}
      />
      <SelectFilter
        label="Availability"
        value={filters.status}
        options={["available", "reserved", "sold", "unreleased"]}
        onChange={(value) => setFilter("status", value)}
      />
      <SelectFilter
        label="Bedrooms"
        value={filters.bedrooms}
        options={options.bedrooms}
        onChange={(value) => setFilter("bedrooms", value)}
      />
      <SelectFilter
        label="Floor"
        value={filters.floor}
        options={options.floors}
        onChange={(value) => setFilter("floor", value)}
      />
      <SelectFilter
        label="Phase"
        value={filters.phase}
        options={options.phases}
        onChange={(value) => setFilter("phase", value)}
      />
      <SelectFilter
        label="Release"
        value={filters.release}
        options={options.releases}
        onChange={(value) => setFilter("release", value)}
      />
      <label className="grid min-w-[145px] gap-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#708078]">
        <span>Maximum price</span>
        <input
          type="number"
          min="0"
          step="100000"
          value={filters.maxPrice}
          onChange={(event) => setFilter("maxPrice", event.target.value)}
          placeholder="Any price"
          className="h-10 rounded-md border border-[#ded9ce] bg-white px-3 text-xs normal-case tracking-normal"
        />
      </label>
    </>
  );

  const content = (
    <div
      className={`relative ${fullscreen ? "fixed inset-0 z-[70] bg-[#f4f1ea] p-3 md:p-5" : ""}`}
    >
      <div className="mx-auto max-w-[1480px] overflow-hidden rounded-xl border border-[#ded8cc] bg-[#fffdf9] shadow-[0_24px_70px_rgba(16,52,43,.12)]">
        {!readiness.ready ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
            Some interactive plan areas are temporarily unavailable. The
            residence list remains current.
          </div>
        ) : null}
        <div className="flex items-center gap-2 overflow-x-auto border-b border-[#e5dfd4] p-3 md:flex-wrap md:p-4">
          {mobile ? (
            <button
              onClick={() => setFilterOpen(true)}
              className="flex h-11 shrink-0 items-center gap-2 rounded-md border px-4 text-sm font-semibold"
            >
              <SlidersHorizontal size={17} /> Filters
            </button>
          ) : (
            filtersPanel
          )}
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => setComparisonOpen(true)}
              disabled={!comparison.size}
              className="flex h-10 items-center gap-2 rounded-md border bg-white px-3 text-xs font-semibold disabled:opacity-45"
            >
              <GitCompareArrows size={15} /> Compare{" "}
              {comparison.size ? `(${comparison.size})` : ""}
            </button>
            <button
              onClick={shareSelection}
              disabled={!favourites.size && !comparison.size}
              className="flex h-10 items-center gap-2 rounded-md border bg-white px-3 text-xs font-semibold disabled:opacity-45"
            >
              <Share2 size={15} /> Share
            </button>
          </div>
          <div className="ml-auto flex shrink-0 overflow-hidden rounded-md border bg-white">
            <button
              aria-label="Map and list"
              onClick={() => setLayout("list")}
              className={`p-2.5 ${layout === "list" ? "bg-[#0b4337] text-white" : ""}`}
            >
              <List size={17} />
            </button>
            <button
              aria-label="Map and grid"
              onClick={() => setLayout("grid")}
              className={`border-l p-2.5 ${layout === "grid" ? "bg-[#0b4337] text-white" : ""}`}
            >
              <Grid2X2 size={17} />
            </button>
            <button
              aria-label="Fullscreen"
              onClick={() => setFullscreen((value) => !value)}
              className="border-l p-2.5"
            >
              {fullscreen ? <X size={17} /> : <Expand size={17} />}
            </button>
          </div>
        </div>
        {mobile ? (
          <div className="border-b p-3">
            <label className="relative block">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#74847b]"
              />
              <input
                value={filters.query}
                onChange={(event) => setFilter("query", event.target.value)}
                placeholder="Search residences"
                className="h-11 w-full rounded-md border pl-9 pr-3 text-sm"
              />
            </label>
          </div>
        ) : null}
        <div
          className={`${mobile ? "" : "lg:grid lg:grid-cols-[minmax(0,1fr)_380px]"}`}
          style={{
            height: fullscreen
              ? "calc(100vh - 100px)"
              : mobile
                ? "68svh"
                : "min(690px, 72vh)",
          }}
        >
          <div
            className={`${mobile && view !== "map" ? "hidden" : ""} min-h-0`}
          >
            {canvas}
          </div>
          <aside
            className={`${mobile && view === "map" ? "hidden" : ""} min-h-0 overflow-y-auto border-l border-[#e5dfd4] bg-[#f8f6f1]`}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-[#fffdf9]/95 px-4 py-3 backdrop-blur">
              <span>
                <b className="text-lg text-[#143d33]" aria-live="polite">
                  {units.length}
                </b>
                <small className="ml-2 text-[#718078]">residences</small>
              </span>
              <button
                onClick={clearFilters}
                className="text-xs font-bold text-[#8b6b2e]"
              >
                Clear filters
              </button>
            </div>
            <div
              className={layout === "grid" ? "grid grid-cols-2 gap-2 p-2" : ""}
            >
              {units.map((unit) => {
                const status = STATUS[visualUnitStatus(unit.status)];
                const active = String(unit.id) === String(selectedId);
                return (
                  <article
                    ref={(node) =>
                      node
                        ? cardRefs.current.set(String(unit.id), node)
                        : cardRefs.current.delete(String(unit.id))
                    }
                    key={unit.id}
                    onMouseEnter={() => setHoveredId(String(unit.id))}
                    onMouseLeave={() => setHoveredId("")}
                    className={`relative border-b border-[#e8e2d7] bg-white transition ${active ? "ring-2 ring-inset ring-[#bd984d]" : "hover:bg-[#fcfaf5]"} ${layout === "grid" ? "overflow-hidden rounded-lg border" : ""}`}
                  >
                    <button
                      onClick={() => choose(unit.id)}
                      className={`${layout === "grid" ? "block p-3" : "grid w-full grid-cols-[72px_minmax(0,1fr)_auto] gap-3 p-3"} text-left`}
                    >
                      <img
                        src={unitImage(unit, media)}
                        alt=""
                        className={`${layout === "grid" ? "mb-3 h-24 w-full" : "h-16 w-[72px]"} rounded-md object-cover`}
                      />
                      <span className="min-w-0">
                        <b className="block text-sm text-[#153d33]">
                          {unit.unitNumber}
                        </b>
                        <small className="mt-1 block truncate text-[#687a70]">
                          {unit.unitType || "Residence"}
                          {unit.sizeSqm ? ` · ${unit.sizeSqm}m²` : ""}
                        </small>
                        <span
                          className={`mt-2 inline-flex rounded-full px-2 py-1 text-[9px] font-bold ${status.chip}`}
                        >
                          {status.label}
                        </span>
                      </span>
                      <strong className="text-xs text-[#153d33]">
                        {money(unit.price, true)}
                      </strong>
                    </button>
                    <button
                      aria-label="Save residence"
                      onClick={() => toggleShortlist(String(unit.id))}
                      className="absolute right-3 top-3 text-[#8a928d]"
                    >
                      <Heart
                        size={16}
                        fill={
                          favourites.has(String(unit.id)) ? "#bd984d" : "none"
                        }
                      />
                    </button>
                    <button
                      aria-label="Compare residence"
                      onClick={() => toggleCompare(String(unit.id))}
                      className={`absolute right-10 top-3 ${comparison.has(String(unit.id)) ? "text-[#0c5a49]" : "text-[#8a928d]"}`}
                    >
                      <GitCompareArrows size={16} />
                    </button>
                  </article>
                );
              })}
              {!units.length ? (
                <div className="grid place-items-center p-10 text-center text-sm text-[#6b7c72]">
                  <span>
                    <Layers3 className="mx-auto mb-3" />
                    No residences match these filters.
                  </span>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
        {mobile ? (
          <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 rounded-xl bg-white p-1 shadow-xl">
            <button
              onClick={() => setView("map")}
              className={`rounded-lg px-7 py-3 font-semibold ${view === "map" ? "bg-[#073e32] text-white" : ""}`}
            >
              Map
            </button>
            <button
              onClick={() => setView("residences")}
              className={`rounded-lg px-5 py-3 font-semibold ${view === "residences" ? "bg-[#073e32] text-white" : ""}`}
            >
              Residences
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <section
      id="availability"
      className={`scroll-mt-16 bg-[#f4f1ea] ${embedded ? "py-3" : "py-12 md:py-16"}`}
      onClickCapture={(event) => {
        const anchor = event.target.closest?.("a[href]");
        if (!anchor || anchor.getAttribute("href") !== enquiry) return;
        anchor.dataset.visualAnalyticsCaptured = "true";
        emitExplorerEvent("enquiry_started", {
          sceneId,
          unitId: selectedId,
          metadata: {
            sceneName: scene?.name || "",
            source: selectedId ? "unit_details" : "visualiser",
          },
        });
      }}
    >
      {!embedded ? (
        <div className="mx-auto mb-7 max-w-[1480px] px-5">
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#a47d31]">
            Live development visualiser
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-serif text-4xl leading-none text-[#143d33] md:text-5xl">
              Find your place.
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold uppercase tracking-[.1em] text-[#61736a]">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${freshness.status === "offline" || freshness.status === "delayed" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}
                title={
                  freshness.updatedAt
                    ? `Updated ${new Date(freshness.updatedAt).toLocaleTimeString()}`
                    : "Connecting to live availability"
                }
              >
                <i
                  className={`h-1.5 w-1.5 rounded-full ${freshness.status === "refreshing" || freshness.status === "connecting" ? "animate-pulse bg-amber-500" : freshness.status === "offline" || freshness.status === "delayed" ? "bg-amber-600" : "bg-emerald-600"}`}
                />
                {freshness.status === "offline"
                  ? "Offline · last known"
                  : freshness.status === "delayed"
                    ? "Live updates delayed"
                    : freshness.status === "refreshing" ||
                        freshness.status === "connecting"
                      ? "Refreshing"
                      : "Live availability"}
              </span>
              {Object.entries(STATUS).map(([key, status]) => (
                <span key={key} className="flex items-center gap-1.5">
                  <i
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ background: status.fill }}
                  />
                  {status.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {content}
      {favourites.size ? (
        <div className="sticky bottom-4 z-40 mx-auto mt-4 flex max-w-fit items-center gap-3 rounded-xl bg-[#082f28] px-3 py-2 text-white shadow-2xl">
          <span className="flex items-center gap-2 pr-2 text-xs font-semibold">
            <Heart size={15} fill="currentColor" /> {favourites.size}{" "}
            shortlisted
          </span>
          <div className="flex -space-x-2">
            {[...favourites].slice(0, 4).map((id) => {
              const unit = unitsById.get(String(id));
              return unit ? (
                <button
                  key={id}
                  onClick={() => choose(id)}
                  title={`Open ${unit.unitNumber}`}
                >
                  <img
                    src={unitImage(unit, media)}
                    alt=""
                    className="h-9 w-9 rounded-full border-2 border-[#082f28] object-cover"
                  />
                </button>
              ) : null;
            })}
          </div>
          <button
            onClick={shareSelection}
            className="grid h-9 w-9 place-items-center rounded-md bg-white/12"
            aria-label="Share shortlist"
          >
            <Share2 size={15} />
          </button>
          {comparison.size ? (
            <button
              onClick={() => setComparisonOpen(true)}
              className="h-9 rounded-md bg-[#d0ab55] px-3 text-xs font-bold text-[#143d33]"
            >
              Compare {comparison.size}
            </button>
          ) : null}
        </div>
      ) : null}
      {filterOpen ? (
        <div
          className="fixed inset-0 z-[90] bg-black/35"
          onClick={() => setFilterOpen(false)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="absolute inset-x-0 bottom-0 max-h-[86svh] overflow-y-auto rounded-t-[26px] bg-[#fffdf9] p-6"
          >
            <i className="mx-auto mb-5 block h-1.5 w-12 rounded-full bg-stone-300" />
            <div className="flex justify-between">
              <h3 className="text-2xl font-semibold">Filters</h3>
              <button
                onClick={clearFilters}
                className="text-sm font-bold text-[#8b6b2e]"
              >
                Clear
              </button>
            </div>
            <div className="mt-5 grid gap-4">{filtersPanel}</div>
            <button
              onClick={() => setFilterOpen(false)}
              className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-md bg-[#073e32] font-semibold text-white"
            >
              <Check size={18} /> Show {units.length} residences
            </button>
          </div>
        </div>
      ) : null}
      <UnitDrawer
        unit={selected}
        media={media}
        enquiry={enquiry}
        shortlisted={favourites.has(String(selected?.id))}
        compared={comparison.has(String(selected?.id))}
        floorPlanFallback={
          selectedFloorPlan ||
          getVisualUnitFloorPlanFallback(visualMap, selected || {})
        }
        onToggleShortlist={() => toggleShortlist(String(selected?.id))}
        onToggleCompare={() => toggleCompare(String(selected?.id))}
        onClose={() => setSelectedId("")}
      />
      {comparisonOpen ? (
        <ComparisonDialog
          units={[...comparison]
            .map((id) => unitsById.get(String(id)))
            .filter(Boolean)}
          media={media}
          enquiry={enquiry}
          onRemove={(id) => toggleCompare(String(id))}
          onClose={() => setComparisonOpen(false)}
        />
      ) : null}
    </section>
  );
}
