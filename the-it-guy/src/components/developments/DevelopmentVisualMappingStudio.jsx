import {
  Check,
  ChevronDown,
  Eye,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  Save,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Button from "../ui/Button";
import DevelopmentVisualJourneyBuilder from "./DevelopmentVisualJourneyBuilder";
import DevelopmentVisualPreviewStudio from "./DevelopmentVisualPreviewStudio";
import {
  addVisualMapChildScene,
  addVisualMapAssets,
  auditDevelopmentVisualMap,
  findVisualMapHotspotIssues,
  getVisualHotspotSceneId,
  getVisualMapScene,
  removeVisualMapScene,
  removeVisualMapAsset,
  replaceVisualMapSceneHotspots,
  resolveDevelopmentVisualMap,
  updateVisualMapScene,
  updateVisualMapHotspotDestination,
  updateVisualMapAsset,
  VISUAL_ASSET_ASSOCIATION_TYPES,
  VISUAL_ASSET_TYPES,
} from "../../core/developments/developmentVisualMap.js";

const STATUS_COLOURS = {
  available: { fill: "rgba(45, 143, 91, .42)", stroke: "#167044" },
  reserved: { fill: "rgba(226, 151, 48, .44)", stroke: "#a65c12" },
  sold: { fill: "rgba(82, 111, 143, .43)", stroke: "#315f8c" },
  unreleased: { fill: "rgba(117, 130, 143, .34)", stroke: "#5f6d7c" },
};

const text = (value) => String(value || "").trim();
const statusKey = (value) => {
  const source = text(value).toLowerCase();
  if (
    source.includes("reserve") ||
    source.includes("hold") ||
    source.includes("offer")
  )
    return "reserved";
  if (
    source.includes("sold") ||
    source.includes("registered") ||
    source.includes("complete")
  )
    return "sold";
  if (
    source.includes("unreleased") ||
    source.includes("draft") ||
    source.includes("not released")
  )
    return "unreleased";
  return "available";
};
const centroid = (points = []) =>
  points.length
    ? points
        .reduce(([x, y], [pointX, pointY]) => [x + pointX, y + pointY], [0, 0])
        .map((value) => value / points.length)
    : [50, 50];
const snapshot = (points, labelPosition) => ({
  points: points.map((point) => [...point]),
  labelPosition: [...labelPosition],
});
const backgroundStyleForScene = (scene) => {
  if (!scene?.background?.url) return {};
  const viewport = scene.viewport || { x: 0, y: 0, width: 100, height: 100 };
  const horizontal =
    viewport.width === 100 ? 50 : (viewport.x / (100 - viewport.width)) * 100;
  const vertical =
    viewport.height === 100 ? 50 : (viewport.y / (100 - viewport.height)) * 100;
  return {
    backgroundImage: `linear-gradient(rgba(8,28,24,.08),rgba(8,28,24,.12)),url(${scene.background.url})`,
    backgroundPosition: `${horizontal}% ${vertical}%`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${10000 / viewport.width}% ${10000 / viewport.height}%`,
  };
};

export default function DevelopmentVisualMappingStudio({
  open,
  visualMap,
  inventory = [],
  structureNodes = [],
  saving = false,
  onUploadAssets,
  onClose,
  onSave,
}) {
  const mapRef = useRef(null);
  const [draftMap, setDraftMap] = useState(() =>
    resolveDevelopmentVisualMap({ visualMap }),
  );
  const [sceneId, setSceneId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [points, setPoints] = useState([]);
  const [labelPosition, setLabelPosition] = useState([50, 50]);
  const [labelManuallyPlaced, setLabelManuallyPlaced] = useState(false);
  const [mode, setMode] = useState("draw");
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [feedback, setFeedback] = useState("");
  const [sceneFormOpen, setSceneFormOpen] = useState(false);
  const [sceneForm, setSceneForm] = useState({
    name: "",
    type: "building",
    url: "",
  });
  const [navigationHotspotId, setNavigationHotspotId] = useState("");
  const [assetUploading, setAssetUploading] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState("guided");
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const nextMap = resolveDevelopmentVisualMap({ visualMap });
    setDraftMap(nextMap);
    setSceneId(nextMap.defaultSceneId);
    setUnitId("");
    setPoints([]);
    setLabelManuallyPlaced(false);
    setUndoStack([]);
    setRedoStack([]);
    setFeedback("");
    setSceneFormOpen(false);
    setSceneForm({ name: "", type: "building", url: "" });
    setNavigationHotspotId("");
    setAssetUploading(false);
    setWorkspaceMode("guided");
    setPreviewOpen(false);
  }, [open, visualMap]);

  const scene = useMemo(
    () => getVisualMapScene(draftMap, sceneId),
    [draftMap, sceneId],
  );
  const unitById = useMemo(
    () => new Map(inventory.map((unit) => [text(unit.id), unit])),
    [inventory],
  );
  const mappedUnitIds = useMemo(
    () =>
      new Set(
        (scene?.hotspots || [])
          .filter((item) => item.type === "unit")
          .map((item) => item.target.id),
      ),
    [scene],
  );
  const issues = useMemo(
    () => findVisualMapHotspotIssues(draftMap, sceneId),
    [draftMap, sceneId],
  );
  const readiness = useMemo(
    () => auditDevelopmentVisualMap(draftMap, inventory),
    [draftMap, inventory],
  );
  const selectedHotspot = (scene?.hotspots || []).find(
    (item) => item.type === "unit" && item.target.id === unitId,
  );
  const selectedJourneyHotspot = (scene?.hotspots || []).find(
    (item) => item.id === navigationHotspotId,
  );
  const associationOptions = useMemo(() => {
    const values = {
      phase: new Set(),
      block: new Set(),
      floor: new Set(),
      unit: new Set(),
      unit_type: new Set(),
    };
    inventory.forEach((unit) => {
      if (unit.phase || unit.phaseName)
        values.phase.add(text(unit.phase || unit.phaseName));
      if (unit.block || unit.blockName)
        values.block.add(text(unit.block || unit.blockName));
      if (unit.floor || unit.floorNumber)
        values.floor.add(text(unit.floor || unit.floorNumber));
      values.unit.add(text(unit.id));
      if (unit.unitType || unit.type)
        values.unit_type.add(text(unit.unitType || unit.type));
    });
    return Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, [...value]]),
    );
  }, [inventory]);

  async function intakeAssets(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length || assetUploading) return;
    setAssetUploading(true);
    setFeedback("");
    try {
      const uploaded = onUploadAssets
        ? await onUploadAssets(files)
        : files.map((file) => ({
            name: file.name,
            processingState: "missing",
          }));
      const assets = (uploaded || []).map((row, index) => ({
        ...row,
        name: row?.name || row?.title || files[index]?.name,
        uploadedAt:
          row?.uploadedAt || row?.uploaded_at || new Date().toISOString(),
        source: "upload",
      }));
      const before = draftMap.assets.length;
      const nextMap = addVisualMapAssets(draftMap, assets, inventory);
      setDraftMap(nextMap);
      const added = nextMap.assets.length - before;
      setFeedback(
        added === files.length
          ? `${added} visual asset${added === 1 ? "" : "s"} classified as drafts. Review and approve them before use.`
          : `${added} asset${added === 1 ? "" : "s"} added; ${files.length - added} duplicate${files.length - added === 1 ? " was" : "s were"} skipped.`,
      );
    } catch (error) {
      setDraftMap(
        addVisualMapAssets(
          draftMap,
          files.map((file) => ({
            name: file.name,
            processingState: "failed",
            error: error?.message || "Upload failed",
          })),
          inventory,
        ),
      );
      setFeedback(error?.message || "Visual asset upload failed.");
    } finally {
      setAssetUploading(false);
    }
  }

  function coordinatesForEvent(event) {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return [
      Math.round(
        Math.min(
          100,
          Math.max(0, ((event.clientX - rect.left) / rect.width) * 100),
        ) * 10,
      ) / 10,
      Math.round(
        Math.min(
          100,
          Math.max(0, ((event.clientY - rect.top) / rect.height) * 100),
        ) * 10,
      ) / 10,
    ];
  }

  function recordChange() {
    setUndoStack((history) =>
      [...history, snapshot(points, labelPosition)].slice(-50),
    );
    setRedoStack([]);
  }

  function selectUnit(nextUnitId) {
    const hotspot = (scene?.hotspots || []).find(
      (item) => item.type === "unit" && item.target.id === nextUnitId,
    );
    const nextPoints =
      hotspot?.geometry.type === "polygon"
        ? hotspot.geometry.coordinates.map((point) => [...point])
        : [];
    setUnitId(nextUnitId);
    setPoints(nextPoints);
    setLabelPosition(hotspot?.label?.position || centroid(nextPoints));
    setLabelManuallyPlaced(Boolean(hotspot?.label?.position));
    setMode(nextPoints.length ? "edit" : "draw");
    setUndoStack([]);
    setRedoStack([]);
    setFeedback(
      hotspot?.geometry.type === "point"
        ? "Legacy marker selected. Trace the unit footprint to replace it."
        : "",
    );
  }

  function handleCanvasClick(event) {
    const point = coordinatesForEvent(event);
    if (!point) return;
    if (navigationHotspotId) {
      const hotspots = scene.hotspots.map((hotspot) =>
        hotspot.id === navigationHotspotId
          ? {
              ...hotspot,
              geometry: { type: "point", coordinates: point },
              label: { ...hotspot.label, position: point },
            }
          : hotspot,
      );
      setDraftMap(replaceVisualMapSceneHotspots(draftMap, scene.id, hotspots));
      setNavigationHotspotId("");
      setFeedback("Navigation marker moved in the draft.");
      return;
    }
    if (!unitId || draggingIndex !== null) return;
    if (mode === "label") {
      recordChange();
      setLabelPosition(point);
      setLabelManuallyPlaced(true);
      setMode(points.length >= 3 ? "edit" : "draw");
      return;
    }
    if (mode !== "draw") return;
    recordChange();
    setPoints((current) => [...current, point]);
  }

  function undo() {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setRedoStack((history) => [...history, snapshot(points, labelPosition)]);
    setPoints(previous.points);
    setLabelPosition(previous.labelPosition);
    setUndoStack((history) => history.slice(0, -1));
  }

  function redo() {
    const next = redoStack.at(-1);
    if (!next) return;
    setUndoStack((history) => [...history, snapshot(points, labelPosition)]);
    setPoints(next.points);
    setLabelPosition(next.labelPosition);
    setRedoStack((history) => history.slice(0, -1));
  }

  function applyFootprint() {
    if (!unitId || points.length < 3) return;
    const unit = unitById.get(unitId);
    const existing = scene.hotspots.filter(
      (item) => !(item.type === "unit" && item.target.id === unitId),
    );
    const hotspot = {
      id: selectedHotspot?.id || `unit:${unitId}`,
      type: "unit",
      target: { type: "unit", id: unitId },
      geometry: { type: "polygon", coordinates: points },
      label: {
        text: text(
          unit?.displayNumber || unit?.unitNumber || unit?.unit_number,
        ),
        position: labelManuallyPlaced ? labelPosition : centroid(points),
      },
      visibility: selectedHotspot?.visibility || "public",
      displayOrder: selectedHotspot?.displayOrder ?? existing.length,
    };
    setDraftMap(
      replaceVisualMapSceneHotspots(draftMap, scene.id, [...existing, hotspot]),
    );
    setMode("edit");
    setFeedback(
      `Unit ${hotspot.label.text || unitId} footprint applied to the draft.`,
    );
  }

  function removeMapping() {
    if (!unitId || !selectedHotspot) return;
    setDraftMap(
      replaceVisualMapSceneHotspots(
        draftMap,
        scene.id,
        scene.hotspots.filter((item) => item.id !== selectedHotspot.id),
      ),
    );
    setPoints([]);
    setLabelPosition([50, 50]);
    setLabelManuallyPlaced(false);
    setMode("draw");
    setFeedback("Mapping removed from the draft. Save the map to confirm.");
  }

  function startDragging(index, event) {
    event.stopPropagation();
    recordChange();
    setDraggingIndex(index);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveVertex(event) {
    if (draggingIndex === null) return;
    const point = coordinatesForEvent(event);
    if (!point) return;
    setPoints((current) =>
      current.map((value, index) => (index === draggingIndex ? point : value)),
    );
  }

  function addChildScene() {
    if (!text(sceneForm.name)) return;
    const nextMap = addVisualMapChildScene(draftMap, scene.id, {
      name: sceneForm.name,
      type: sceneForm.type,
      background: { type: "image", url: sceneForm.url },
      navigationLabel: sceneForm.name,
    });
    const child = nextMap.scenes.at(-1);
    setDraftMap(nextMap);
    setSceneId(child.id);
    setSceneFormOpen(false);
    setSceneForm({
      name: "",
      type: child.type === "building" ? "floor_plan" : "building",
      url: "",
    });
    setUnitId("");
    setPoints([]);
    setFeedback(
      `${child.name} created and linked from ${scene.name}. Its navigation marker starts in the centre of the parent plan.`,
    );
  }

  function deleteCurrentScene() {
    if (!scene?.parentSceneId) return;
    const parentId = scene.parentSceneId;
    setDraftMap(removeVisualMapScene(draftMap, scene.id));
    setSceneId(parentId);
    setUnitId("");
    setPoints([]);
    setFeedback("Scene and its child scenes removed from the draft.");
  }

  if (!open) return null;
  const backgroundStyle = backgroundStyleForScene(scene);

  return (
    <div
      className="fixed inset-0 z-[120] flex flex-col bg-[#eef2ef]"
      role="dialog"
      aria-modal="true"
      aria-label="Visual Mapping Studio"
    >
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-[#dbe4df] bg-white px-5 py-3">
        <div>
          <span className="text-[.65rem] font-bold uppercase tracking-[.16em] text-[#397054]">
            Development visualiser
          </span>
          <h2 className="text-lg font-semibold tracking-[-.03em] text-[#152b27]">
            Visual Mapping Studio
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="mr-2 flex rounded-lg bg-[#eef3f0] p-1">
            <button
              type="button"
              onClick={() => setWorkspaceMode("guided")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${workspaceMode === "guided" ? "bg-white text-[#234c3d] shadow-sm" : "text-[#687970]"}`}
            >
              Guided setup
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceMode("advanced")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${workspaceMode === "advanced" ? "bg-white text-[#234c3d] shadow-sm" : "text-[#687970]"}`}
            >
              Advanced mapping
            </button>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!undoStack.length}
            onClick={undo}
          >
            <Undo2 size={14} /> Undo
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!redoStack.length}
            onClick={redo}
          >
            <Redo2 size={14} /> Redo
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setPreviewOpen(true)}
          >
            <Eye size={14} /> Buyer preview
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            <X size={14} /> Close
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving || issues.length > 0}
            onClick={() => onSave?.(draftMap)}
          >
            <Save size={14} /> {saving ? "Saving…" : "Save map"}
          </Button>
        </div>
      </header>
      {workspaceMode === "guided" ? (
        <DevelopmentVisualJourneyBuilder
          visualMap={draftMap}
          inventory={inventory}
          structureNodes={structureNodes}
          onChange={setDraftMap}
          onAdvanced={() => setWorkspaceMode("advanced")}
        />
      ) : (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[280px_minmax(0,1fr)_280px]">
          <aside className="min-h-0 overflow-y-auto border-r border-[#dbe4df] bg-white p-4">
            <section className="mb-5 border-b border-[#e3eae6] pb-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-[.65rem] font-bold uppercase tracking-[.12em] text-[#60766d]">
                    Visual assets
                  </span>
                  <p className="mt-1 text-[10px] leading-4 text-[#71847b]">
                    Upload whatever the developer has. Classification is a draft
                    until approved.
                  </p>
                </div>
                <span className="rounded-full bg-[#edf5f0] px-2 py-1 text-[10px] font-bold text-[#276447]">
                  {draftMap.assets.length}
                </span>
              </div>
              <label
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void intakeAssets(event.dataTransfer.files);
                }}
                className={`mt-3 grid cursor-pointer place-items-center rounded-lg border border-dashed border-[#9db9aa] bg-[#f6faf7] px-3 py-4 text-center ${assetUploading ? "pointer-events-none opacity-60" : "hover:bg-[#eef7f1]"}`}
              >
                <Upload size={16} className="text-[#276447]" />
                <strong className="mt-1 text-xs text-[#29483e]">
                  {assetUploading
                    ? "Uploading…"
                    : "Drop or choose visual files"}
                </strong>
                <span className="mt-1 text-[9px] text-[#71847b]">
                  Images and PDF brochures
                </span>
                <input
                  type="file"
                  multiple
                  accept="image/*,application/pdf,.pdf"
                  disabled={assetUploading}
                  className="hidden"
                  onChange={(event) => {
                    void intakeAssets(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>
              <div className="mt-3 grid max-h-80 gap-2 overflow-y-auto pr-1">
                {draftMap.assets.map((asset) => (
                  <article
                    key={asset.id}
                    className="overflow-hidden rounded-lg border border-[#dbe4df] bg-white"
                  >
                    {asset.url && asset.type !== "brochure" ? (
                      <img
                        src={asset.url}
                        alt=""
                        className="h-20 w-full bg-[#eef2ef] object-cover"
                      />
                    ) : null}
                    <div className="p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <input
                          value={asset.name}
                          aria-label="Asset display name"
                          onChange={(event) =>
                            setDraftMap(
                              updateVisualMapAsset(draftMap, asset.id, {
                                name: event.target.value,
                              }),
                            )
                          }
                          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs font-semibold text-[#29483e] outline-none"
                        />
                        <button
                          type="button"
                          aria-label={`Remove ${asset.name}`}
                          onClick={() =>
                            setDraftMap(
                              removeVisualMapAsset(draftMap, asset.id),
                            )
                          }
                          className="text-[#87978f] hover:text-red-600"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        <select
                          aria-label="Asset type"
                          value={asset.type}
                          onChange={(event) =>
                            setDraftMap(
                              updateVisualMapAsset(draftMap, asset.id, {
                                type: event.target.value,
                              }),
                            )
                          }
                          className="h-8 rounded border bg-white px-1 text-[10px]"
                        >
                          {VISUAL_ASSET_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type.replaceAll("_", " ")}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label="Association type"
                          value={asset.association.type}
                          onChange={(event) =>
                            setDraftMap(
                              updateVisualMapAsset(draftMap, asset.id, {
                                association: {
                                  type: event.target.value,
                                  id: "",
                                },
                              }),
                            )
                          }
                          className="h-8 rounded border bg-white px-1 text-[10px]"
                        >
                          {VISUAL_ASSET_ASSOCIATION_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type.replaceAll("_", " ")}
                            </option>
                          ))}
                        </select>
                      </div>
                      {asset.association.type !== "development" ? (
                        <select
                          aria-label="Associated structure item"
                          value={asset.association.id}
                          onChange={(event) =>
                            setDraftMap(
                              updateVisualMapAsset(draftMap, asset.id, {
                                association: {
                                  ...asset.association,
                                  id: event.target.value,
                                },
                              }),
                            )
                          }
                          className="mt-1.5 h-8 w-full rounded border bg-white px-1 text-[10px]"
                        >
                          <option value="">Choose association…</option>
                          {(
                            associationOptions[asset.association.type] || []
                          ).map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setDraftMap(
                              updateVisualMapAsset(draftMap, asset.id, {
                                status:
                                  asset.status === "approved"
                                    ? "draft"
                                    : "approved",
                              }),
                            )
                          }
                          className={`rounded-full px-2 py-1 text-[9px] font-bold ${asset.status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
                        >
                          {asset.status === "approved" ? "Approved" : "Draft"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftMap(
                              updateVisualMapAsset(draftMap, asset.id, {
                                visibility:
                                  asset.visibility === "public"
                                    ? "internal"
                                    : "public",
                              }),
                            )
                          }
                          className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-700"
                        >
                          {asset.visibility === "public"
                            ? "Public"
                            : "Internal"}
                        </button>
                        {asset.processingState !== "ready" ? (
                          <span className="rounded-full bg-red-50 px-2 py-1 text-[9px] font-bold text-red-700">
                            {asset.processingState}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 border-t border-[#edf1ef] pt-2">
                        <span className="truncate text-[9px] text-[#7b8b83]">
                          {asset.source}
                          {asset.uploadedAt
                            ? ` · ${new Date(asset.uploadedAt).toLocaleDateString()}`
                            : ""}
                        </span>
                        {asset.url && asset.type !== "brochure" ? (
                          <button
                            type="button"
                            onClick={() =>
                              setDraftMap(
                                updateVisualMapScene(draftMap, scene.id, {
                                  background: { type: "image", url: asset.url },
                                }),
                              )
                            }
                            className="shrink-0 text-[9px] font-bold text-[#276447] underline"
                          >
                            Use in scene
                          </button>
                        ) : null}
                      </div>
                      {asset.error ? (
                        <p className="mt-1 text-[9px] text-red-700">
                          {asset.error}
                        </p>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <label className="text-[.65rem] font-bold uppercase tracking-[.12em] text-[#60766d]">
              Scene
            </label>
            <select
              value={sceneId}
              onChange={(event) => {
                setSceneId(event.target.value);
                setUnitId("");
                setPoints([]);
              }}
              className="mt-2 h-10 w-full rounded-lg border border-[#d8e2dd] bg-white px-3 text-sm"
            >
              {draftMap.scenes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.type.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setSceneFormOpen((value) => !value)}
              >
                <Plus size={14} /> Child scene
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!scene?.parentSceneId}
                onClick={deleteCurrentScene}
              >
                <Trash2 size={14} /> Delete scene
              </Button>
            </div>
            {sceneFormOpen ? (
              <div className="mt-3 rounded-lg border border-[#dbe4df] bg-[#f7faf8] p-3">
                <strong className="text-xs text-[#29483e]">
                  Add beneath {scene?.name}
                </strong>
                <input
                  value={sceneForm.name}
                  onChange={(event) =>
                    setSceneForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Scene name, e.g. Block A"
                  className="mt-3 h-9 w-full rounded-md border bg-white px-2 text-xs"
                />
                <label className="relative mt-2 block">
                  <select
                    value={sceneForm.type}
                    onChange={(event) =>
                      setSceneForm((current) => ({
                        ...current,
                        type: event.target.value,
                      }))
                    }
                    className="h-9 w-full appearance-none rounded-md border bg-white px-2 text-xs"
                  >
                    <option value="phase">Phase</option>
                    <option value="aerial">Aerial view</option>
                    <option value="building">Building</option>
                    <option value="exterior">Exterior render</option>
                    <option value="elevation">Elevation</option>
                    <option value="floor_plan">Floor plan</option>
                    <option value="interior">Interior</option>
                    <option value="amenity">Amenity</option>
                    <option value="parking_plan">Parking plan</option>
                  </select>
                  <ChevronDown
                    size={13}
                    className="pointer-events-none absolute right-2 top-3"
                  />
                </label>
                <input
                  value={sceneForm.url}
                  onChange={(event) =>
                    setSceneForm((current) => ({
                      ...current,
                      url: event.target.value,
                    }))
                  }
                  placeholder="Plan/image URL"
                  className="mt-2 h-9 w-full rounded-md border bg-white px-2 text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  className="mt-2 w-full"
                  disabled={!text(sceneForm.name)}
                  onClick={addChildScene}
                >
                  Create linked scene
                </Button>
              </div>
            ) : null}
            <div className="mt-3 rounded-lg border border-[#e2e9e5] p-3">
              <label className="text-[.6rem] font-bold uppercase tracking-[.12em] text-[#71847b]">
                Current scene details
              </label>
              <input
                value={scene?.name || ""}
                onChange={(event) =>
                  setDraftMap(
                    updateVisualMapScene(draftMap, scene.id, {
                      name: event.target.value,
                    }),
                  )
                }
                className="mt-2 h-9 w-full rounded-md border bg-white px-2 text-xs"
              />
              <input
                value={scene?.background?.url || ""}
                onChange={(event) =>
                  setDraftMap(
                    updateVisualMapScene(draftMap, scene.id, {
                      background: { url: event.target.value },
                    }),
                  )
                }
                placeholder="Plan/image URL"
                className="mt-2 h-9 w-full rounded-md border bg-white px-2 text-xs"
              />
            </div>
            {(scene?.hotspots || []).length ? (
              <div className="mt-4">
                <strong className="text-xs text-[#29483e]">
                  Journey links
                </strong>
                <div className="mt-2 grid max-h-52 gap-1.5 overflow-y-auto pr-1">
                  {scene.hotspots.map((hotspot) => (
                    <button
                      key={hotspot.id}
                      type="button"
                      onClick={() => {
                        setNavigationHotspotId(hotspot.id);
                        setUnitId("");
                        setPoints([]);
                        setFeedback(
                          `Click the plan to position ${hotspot.label?.text || hotspot.target.id}.`,
                        );
                      }}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs ${navigationHotspotId === hotspot.id ? "border-[#1d684c] bg-[#eef8f2]" : "border-[#e2e9e5]"}`}
                    >
                      <span>{hotspot.label?.text || hotspot.target.id}</span>
                      <MousePointer2 size={13} />
                    </button>
                  ))}
                </div>
                {selectedJourneyHotspot ? (
                  <div className="mt-2 rounded-lg border border-[#dbe4df] bg-[#f7faf8] p-3">
                    <label className="text-[.6rem] font-bold uppercase tracking-[.12em] text-[#71847b]">
                      Click destination
                    </label>
                    <select
                      value={selectedJourneyHotspot.destination?.type || "none"}
                      onChange={(event) => {
                        const type = event.target.value;
                        const destination =
                          type === "scene"
                            ? {
                                type,
                                sceneId:
                                  draftMap.scenes.find(
                                    (item) => item.id !== scene.id,
                                  )?.id || "",
                              }
                            : type === "unit"
                              ? { type, unitId: text(inventory[0]?.id) }
                              : type === "inventory_filter"
                                ? {
                                    type,
                                    filters: {
                                      block: selectedJourneyHotspot.target.id,
                                    },
                                  }
                                : type === "external"
                                  ? { type, url: "", newTab: true }
                                  : type === "amenity"
                                    ? {
                                        type,
                                        amenityId:
                                          selectedJourneyHotspot.target.id,
                                      }
                                    : { type: "none" };
                        setDraftMap(
                          updateVisualMapHotspotDestination(
                            draftMap,
                            scene.id,
                            selectedJourneyHotspot.id,
                            destination,
                          ),
                        );
                      }}
                      className="mt-2 h-9 w-full rounded-md border bg-white px-2 text-xs"
                    >
                      <option value="scene">Another visual</option>
                      <option value="unit">Property details</option>
                      <option value="inventory_filter">
                        Filtered residences
                      </option>
                      <option value="external">External link</option>
                      <option value="amenity">Amenity details</option>
                      <option value="none">No interaction</option>
                    </select>
                    {selectedJourneyHotspot.destination?.type === "scene" ? (
                      <select
                        value={selectedJourneyHotspot.destination.sceneId || ""}
                        onChange={(event) =>
                          setDraftMap(
                            updateVisualMapHotspotDestination(
                              draftMap,
                              scene.id,
                              selectedJourneyHotspot.id,
                              { type: "scene", sceneId: event.target.value },
                            ),
                          )
                        }
                        className="mt-2 h-9 w-full rounded-md border bg-white px-2 text-xs"
                      >
                        {draftMap.scenes
                          .filter((item) => item.id !== scene.id)
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                      </select>
                    ) : null}
                    {selectedJourneyHotspot.destination?.type === "unit" ? (
                      <select
                        value={selectedJourneyHotspot.destination.unitId || ""}
                        onChange={(event) =>
                          setDraftMap(
                            updateVisualMapHotspotDestination(
                              draftMap,
                              scene.id,
                              selectedJourneyHotspot.id,
                              { type: "unit", unitId: event.target.value },
                            ),
                          )
                        }
                        className="mt-2 h-9 w-full rounded-md border bg-white px-2 text-xs"
                      >
                        {inventory.map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            Unit{" "}
                            {unit.displayNumber || unit.unitNumber || unit.id}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {selectedJourneyHotspot.destination?.type ===
                    "inventory_filter" ? (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <select
                          value={
                            Object.keys(
                              selectedJourneyHotspot.destination.filters || {},
                            )[0] || "block"
                          }
                          onChange={(event) =>
                            setDraftMap(
                              updateVisualMapHotspotDestination(
                                draftMap,
                                scene.id,
                                selectedJourneyHotspot.id,
                                {
                                  type: "inventory_filter",
                                  filters: {
                                    [event.target.value]:
                                      Object.values(
                                        selectedJourneyHotspot.destination
                                          .filters || {},
                                      )[0] || selectedJourneyHotspot.target.id,
                                  },
                                },
                              ),
                            )
                          }
                          className="h-9 rounded-md border bg-white px-2 text-xs"
                        >
                          <option value="phase">Phase</option>
                          <option value="block">Block</option>
                          <option value="floor">Floor</option>
                          <option value="unitType">Unit type</option>
                        </select>
                        <input
                          value={
                            Object.values(
                              selectedJourneyHotspot.destination.filters || {},
                            )[0] || ""
                          }
                          onChange={(event) => {
                            const key =
                              Object.keys(
                                selectedJourneyHotspot.destination.filters ||
                                  {},
                              )[0] || "block";
                            setDraftMap(
                              updateVisualMapHotspotDestination(
                                draftMap,
                                scene.id,
                                selectedJourneyHotspot.id,
                                {
                                  type: "inventory_filter",
                                  filters: { [key]: event.target.value },
                                },
                              ),
                            );
                          }}
                          placeholder="Filter value"
                          className="h-9 rounded-md border bg-white px-2 text-xs"
                        />
                      </div>
                    ) : null}
                    {selectedJourneyHotspot.destination?.type === "external" ? (
                      <input
                        value={selectedJourneyHotspot.destination.url || ""}
                        onChange={(event) =>
                          setDraftMap(
                            updateVisualMapHotspotDestination(
                              draftMap,
                              scene.id,
                              selectedJourneyHotspot.id,
                              {
                                type: "external",
                                url: event.target.value,
                                newTab: true,
                              },
                            ),
                          )
                        }
                        placeholder="https://…"
                        className="mt-2 h-9 w-full rounded-md border bg-white px-2 text-xs"
                      />
                    ) : null}
                    {selectedJourneyHotspot.destination?.type === "amenity" ? (
                      <input
                        value={
                          selectedJourneyHotspot.destination.amenityId || ""
                        }
                        onChange={(event) =>
                          setDraftMap(
                            updateVisualMapHotspotDestination(
                              draftMap,
                              scene.id,
                              selectedJourneyHotspot.id,
                              {
                                type: "amenity",
                                amenityId: event.target.value,
                              },
                            ),
                          )
                        }
                        placeholder="Amenity reference"
                        className="mt-2 h-9 w-full rounded-md border bg-white px-2 text-xs"
                      />
                    ) : null}
                    <p className="mt-2 text-[10px] leading-4 text-[#71847b]">
                      Use the marker button above, then click the image to
                      reposition this area.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="mt-5 flex items-center justify-between">
              <strong className="text-sm text-[#203c35]">Unit queue</strong>
              <span className="text-xs text-[#71847b]">
                {mappedUnitIds.size}/{inventory.length}
              </span>
            </div>
            <div className="mt-2 grid gap-1.5">
              {inventory.map((unit) => {
                const id = text(unit.id);
                const mapped = mappedUnitIds.has(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectUnit(id)}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm ${unitId === id ? "border-[#1d684c] bg-[#eef8f2]" : "border-[#e2e9e5] bg-white hover:bg-[#f8faf9]"}`}
                  >
                    <span>
                      <strong className="block text-[#233b35]">
                        Unit{" "}
                        {unit.displayNumber ||
                          unit.unitNumber ||
                          unit.unit_number}
                      </strong>
                      <small className="text-[#71847b]">
                        {unit.displayType || unit.unitType || "Residence"}
                      </small>
                    </span>
                    {mapped ? (
                      <Check size={15} className="text-[#238053]" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-[#d2a34d]" />
                    )}
                  </button>
                );
              })}
            </div>
          </aside>
          <main className="relative min-h-[480px] overflow-hidden bg-[#dfe5e1] p-4">
            <div
              ref={mapRef}
              onClick={handleCanvasClick}
              onPointerMove={moveVertex}
              onPointerUp={() => setDraggingIndex(null)}
              className={`relative h-full min-h-[440px] overflow-hidden rounded-xl border border-white/70 bg-[#d6ded9] bg-no-repeat shadow-inner ${mode === "draw" || mode === "label" || navigationHotspotId ? "cursor-crosshair" : ""}`}
              style={backgroundStyle}
            >
              <svg
                className="absolute inset-0 h-full w-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                {(scene?.hotspots || []).map((hotspot) => {
                  const unit = unitById.get(hotspot.target.id);
                  const colours =
                    STATUS_COLOURS[
                      statusKey(unit?.inventoryStatus || unit?.status)
                    ];
                  const selected = hotspot.target.id === unitId;
                  if (hotspot.geometry.type === "point") {
                    const [x, y] = hotspot.geometry.coordinates;
                    return (
                      <circle
                        key={hotspot.id}
                        cx={x}
                        cy={y}
                        r={getVisualHotspotSceneId(hotspot) ? "1.8" : "1.2"}
                        vectorEffect="non-scaling-stroke"
                        fill={
                          getVisualHotspotSceneId(hotspot)
                            ? "#d0ab55"
                            : colours.fill
                        }
                        stroke={
                          selected || navigationHotspotId === hotspot.id
                            ? "#fff"
                            : colours.stroke
                        }
                        strokeWidth={selected ? 1 : 0.45}
                        onClick={(event) => {
                          event.stopPropagation();
                          getVisualHotspotSceneId(hotspot)
                            ? setSceneId(getVisualHotspotSceneId(hotspot))
                            : selectUnit(hotspot.target.id);
                        }}
                      />
                    );
                  }
                  return (
                    <polygon
                      key={hotspot.id}
                      points={hotspot.geometry.coordinates
                        .map((point) => point.join(","))
                        .join(" ")}
                      vectorEffect="non-scaling-stroke"
                      fill={colours.fill}
                      stroke={selected ? "#fff" : colours.stroke}
                      strokeWidth={selected ? 1 : 0.45}
                      onClick={(event) => {
                        event.stopPropagation();
                        selectUnit(hotspot.target.id);
                      }}
                    />
                  );
                })}
                {points.length ? (
                  <polyline
                    points={points.map((point) => point.join(",")).join(" ")}
                    vectorEffect="non-scaling-stroke"
                    fill={points.length >= 3 ? "rgba(208,171,85,.34)" : "none"}
                    stroke="#f7d47c"
                    strokeWidth=".65"
                    strokeDasharray={points.length >= 3 ? undefined : "2 1"}
                  />
                ) : null}
                {points.map(([x, y], index) => (
                  <circle
                    key={`${x}-${y}-${index}`}
                    cx={x}
                    cy={y}
                    r="1.05"
                    vectorEffect="non-scaling-stroke"
                    fill="#fff"
                    stroke="#7b5b16"
                    strokeWidth=".55"
                    className="cursor-move"
                    onPointerDown={(event) => startDragging(index, event)}
                  />
                ))}
                {unitId && points.length >= 3 ? (
                  <circle
                    cx={labelPosition[0]}
                    cy={labelPosition[1]}
                    r=".85"
                    fill="#0d3e31"
                    stroke="#fff"
                    strokeWidth=".35"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
              </svg>
              {!scene?.background?.url ? (
                <div className="absolute inset-0 grid place-items-center text-sm text-[#687c73]">
                  Upload a plan before mapping footprints.
                </div>
              ) : null}
              {unitId ? (
                <div className="absolute left-4 top-4 rounded-lg border border-white/80 bg-white/95 px-3 py-2 text-xs shadow">
                  <strong>
                    Unit {unitById.get(unitId)?.displayNumber || unitId}
                  </strong>
                  <span className="ml-2 text-[#6e8178]">
                    {mode === "draw"
                      ? "Click each corner"
                      : mode === "label"
                        ? "Click the label position"
                        : "Drag vertices to refine"}
                  </span>
                </div>
              ) : null}
            </div>
          </main>
          <aside className="border-l border-[#dbe4df] bg-white p-4">
            <span className="text-[.65rem] font-bold uppercase tracking-[.12em] text-[#60766d]">
              Footprint tools
            </span>
            {unitId ? (
              <>
                <h3 className="mt-2 text-xl font-semibold text-[#19332c]">
                  Unit {unitById.get(unitId)?.displayNumber || unitId}
                </h3>
                <p className="mt-2 text-xs leading-5 text-[#6b7d74]">
                  Trace at least three corners. Drag any vertex to refine the
                  boundary, then apply it to the draft.
                </p>
                <div className="mt-4 grid gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={mode === "draw" ? "primary" : "secondary"}
                    onClick={() => setMode("draw")}
                  >
                    <Pencil size={14} /> Draw corners
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={mode === "edit" ? "primary" : "secondary"}
                    disabled={points.length < 3}
                    onClick={() => setMode("edit")}
                  >
                    <MousePointer2 size={14} /> Edit vertices
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={mode === "label" ? "primary" : "secondary"}
                    disabled={points.length < 3}
                    onClick={() => setMode("label")}
                  >
                    Place label
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={points.length < 3}
                    onClick={applyFootprint}
                  >
                    <Check size={14} /> Apply footprint
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={!points.length}
                    onClick={() => {
                      recordChange();
                      setPoints([]);
                      setMode("draw");
                    }}
                  >
                    Clear drawing
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={!selectedHotspot}
                    onClick={removeMapping}
                  >
                    <Trash2 size={14} /> Remove mapping
                  </Button>
                </div>
                <div className="mt-5 rounded-lg bg-[#f4f7f5] p-3 text-xs text-[#62766d]">
                  <strong className="block text-[#29483e]">
                    {points.length} vertices
                  </strong>
                  {selectedHotspot?.geometry.type === "point"
                    ? "Legacy point will be retired when the footprint is applied."
                    : selectedHotspot
                      ? "Polygon mapped in this draft."
                      : "Not yet mapped."}
                </div>
              </>
            ) : (
              <p className="mt-3 rounded-lg bg-[#f4f7f5] p-3 text-xs leading-5 text-[#62766d]">
                Choose a unit from the queue to start tracing its footprint.
              </p>
            )}
            {issues.length ? (
              <div className="mt-5 rounded-lg border border-[#efd49e] bg-[#fff8e8] p-3">
                <strong className="text-xs text-[#865b13]">
                  Resolve {issues.length} duplicate mapping issue
                  {issues.length === 1 ? "" : "s"} before saving.
                </strong>
              </div>
            ) : null}
            <div
              className={`mt-5 rounded-lg border p-3 ${readiness.ready ? "border-[#cfe5d8] bg-[#f1faf4]" : "border-[#efc9c1] bg-[#fff5f3]"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <strong
                  className={`text-xs ${readiness.ready ? "text-[#276947]" : "text-[#9b392d]"}`}
                >
                  {readiness.ready
                    ? "Publication structure ready"
                    : `${readiness.errors.length} publication blocker${readiness.errors.length === 1 ? "" : "s"}`}
                </strong>
                <span className="text-[10px] font-bold text-[#60766d]">
                  {readiness.coveragePercent}% mapped
                </span>
              </div>
              {readiness.issues.length ? (
                <ul className="mt-2 grid gap-1 text-[11px] leading-4 text-[#6b665d]">
                  {readiness.issues.slice(0, 6).map((issue, index) => (
                    <li key={`${issue.code}:${issue.sceneId}:${index}`}>
                      • {issue.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[11px] text-[#60766d]">
                  All scene links, backgrounds, and inventory references pass
                  validation.
                </p>
              )}
            </div>
            {feedback ? (
              <p className="mt-5 rounded-lg border border-[#cfe5d8] bg-[#f1faf4] p-3 text-xs text-[#276947]">
                {feedback}
              </p>
            ) : null}
          </aside>
        </div>
      )}
      <DevelopmentVisualPreviewStudio
        open={previewOpen}
        visualMap={draftMap}
        inventory={inventory}
        onClose={() => setPreviewOpen(false)}
        onRollback={(nextMap) => {
          setDraftMap(nextMap);
          setPreviewOpen(false);
          setFeedback(
            "Live snapshot restored to the draft. Save to keep this rollback.",
          );
        }}
      />
    </div>
  );
}
