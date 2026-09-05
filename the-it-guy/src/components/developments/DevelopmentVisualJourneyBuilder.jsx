import { ArrowDown, ArrowUp, Eye, Plus, Settings2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import Button from "../ui/Button";
import {
  addVisualMapChildScene,
  getVisualMapScene,
  getVisualMapSceneBreadcrumbs,
} from "../../core/developments/developmentVisualMap.js";
import {
  addVisualJourneyLink,
  applyVisualJourneyTemplate,
  buildVisualJourneyOutline,
  removeVisualJourneyScene,
  reorderVisualJourneyScene,
  VISUAL_JOURNEY_TEMPLATES,
} from "../../core/developments/developmentVisualJourney.js";
import {
  applyDevelopmentVisualSuggestion,
  buildDevelopmentVisualSuggestions,
} from "../../core/developments/developmentVisualSuggestions.js";
import { buildDevelopmentVisualCapabilityReport } from "../../core/developments/developmentVisualCapabilities.js";

const text = (value) => String(value || "").trim();
const VIEW_TYPES = [
  ["aerial", "Aerial view"],
  ["masterplan", "Site plan"],
  ["exterior", "Exterior render"],
  ["elevation", "Building elevation"],
  ["floor_plan", "Floor plan"],
  ["interior", "Interior render"],
  ["amenity", "Amenity"],
  ["parking_plan", "Parking plan"],
];

export default function DevelopmentVisualJourneyBuilder({
  visualMap,
  inventory = [],
  structureNodes = [],
  onChange,
  onAdvanced,
}) {
  const outline = useMemo(
    () => buildVisualJourneyOutline(visualMap),
    [visualMap],
  );
  const approvedAssets = visualMap.assets.filter(
    (asset) => asset.status === "approved" && asset.processingState === "ready",
  );
  const [previewSceneId, setPreviewSceneId] = useState(
    visualMap.defaultSceneId,
  );
  const [view, setView] = useState({
    parentSceneId: visualMap.defaultSceneId,
    name: "",
    type: "exterior",
    assetId: "",
  });
  const [link, setLink] = useState({
    sceneId: visualMap.defaultSceneId,
    label: "",
    type: "scene",
    target: "",
    filterKey: "block",
  });
  const [removeId, setRemoveId] = useState("");
  const [replacementId, setReplacementId] = useState("");
  const [dismissedSuggestions, setDismissedSuggestions] = useState([]);
  const suggestions = useMemo(
    () =>
      buildDevelopmentVisualSuggestions({
        visualMap,
        inventory,
        structureNodes,
      }).filter((item) => !dismissedSuggestions.includes(item.id)),
    [visualMap, inventory, structureNodes, dismissedSuggestions],
  );
  const capabilityReport = useMemo(
    () => buildDevelopmentVisualCapabilityReport({ visualMap, inventory }),
    [visualMap, inventory],
  );
  const previewScene = getVisualMapScene(visualMap, previewSceneId);
  const breadcrumbs = getVisualMapSceneBreadcrumbs(visualMap, previewScene?.id);
  const templateAllowed =
    visualMap.scenes.length === 1 && !visualMap.scenes[0]?.hotspots.length;

  const applyTemplate = (templateId) => {
    const assetByType = Object.fromEntries(
      approvedAssets.map((asset) => [asset.type, asset]),
    );
    const next = applyVisualJourneyTemplate(visualMap, templateId, {
      inventory,
      assetByType,
    });
    onChange(next);
    setPreviewSceneId(next.defaultSceneId);
  };

  const addView = () => {
    if (!text(view.name)) return;
    const asset = approvedAssets.find((item) => item.id === view.assetId);
    const next = addVisualMapChildScene(visualMap, view.parentSceneId, {
      name: view.name,
      type: view.type,
      background: { url: asset?.url || "" },
      navigationLabel: view.name,
    });
    onChange(next);
    setPreviewSceneId(next.scenes.at(-1).id);
    setView((current) => ({ ...current, name: "", assetId: "" }));
  };

  const addConnection = () => {
    let destination = { type: "none" };
    if (link.type === "scene")
      destination = { type: "scene", sceneId: link.target };
    if (link.type === "unit")
      destination = { type: "unit", unitId: link.target };
    if (link.type === "inventory_filter")
      destination = {
        type: "inventory_filter",
        filters: { [link.filterKey]: link.target },
      };
    if (!link.target) return;
    onChange(
      addVisualJourneyLink(visualMap, link.sceneId, {
        label: link.label || "View details",
        destination,
      }),
    );
    setLink((current) => ({ ...current, label: "", target: "" }));
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-7">
      <div className="mx-auto grid max-w-7xl gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-xl border border-[#dbe4df] bg-white p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-[.14em] text-[#397054]">
              Start with a template
            </span>
            <p className="mt-1 text-xs leading-5 text-[#6c7c75]">
              Choose the closest buyer journey. You can change every step.
            </p>
            <div className="mt-3 grid gap-2">
              {VISUAL_JOURNEY_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  disabled={!templateAllowed}
                  onClick={() => applyTemplate(template.id)}
                  className="rounded-lg border border-[#dbe4df] p-3 text-left disabled:cursor-not-allowed disabled:opacity-45 enabled:hover:border-[#65967c] enabled:hover:bg-[#f5faf7]"
                >
                  <strong className="block text-xs text-[#29483e]">
                    {template.name}
                  </strong>
                  <span className="mt-1 block text-[10px] leading-4 text-[#71847b]">
                    {template.description}
                  </span>
                </button>
              ))}
            </div>
            {!templateAllowed ? (
              <p className="mt-2 text-[10px] leading-4 text-[#8a6a2c]">
                Templates are only available before the first connection is
                mapped, protecting your existing journey.
              </p>
            ) : null}
          </section>

          <section className="rounded-xl border border-[#dbe4df] bg-white p-4 shadow-sm">
            <strong className="text-sm text-[#29483e]">Add another view</strong>
            <p className="mt-1 text-xs text-[#71847b]">
              What should the buyer see after the current step?
            </p>
            <select
              value={view.parentSceneId}
              onChange={(event) =>
                setView((current) => ({
                  ...current,
                  parentSceneId: event.target.value,
                }))
              }
              className="mt-3 h-9 w-full rounded-md border bg-white px-2 text-xs"
            >
              {outline.map((item) => (
                <option key={item.id} value={item.id}>
                  After {item.name}
                </option>
              ))}
            </select>
            <input
              value={view.name}
              onChange={(event) =>
                setView((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="View name, e.g. Block A exterior"
              className="mt-2 h-9 w-full rounded-md border px-2 text-xs"
            />
            <select
              value={view.type}
              onChange={(event) =>
                setView((current) => ({ ...current, type: event.target.value }))
              }
              className="mt-2 h-9 w-full rounded-md border bg-white px-2 text-xs"
            >
              {VIEW_TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={view.assetId}
              onChange={(event) =>
                setView((current) => ({
                  ...current,
                  assetId: event.target.value,
                }))
              }
              className="mt-2 h-9 w-full rounded-md border bg-white px-2 text-xs"
            >
              <option value="">Add image later</option>
              {approvedAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              className="mt-3 w-full"
              disabled={!text(view.name)}
              onClick={addView}
            >
              <Plus size={13} /> Add view
            </Button>
          </section>
        </aside>

        <main className="space-y-5">
          <section className="rounded-xl border border-[#cfe0d7] bg-[#f4faf6] p-4 shadow-sm md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-[.14em] text-[#397054]">
                  Selected buyer experience
                </span>
                <h3 className="mt-1 text-base font-semibold capitalize text-[#29483e]">
                  {capabilityReport.experience.replaceAll("_", " ")}
                </h3>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-[#63776e]">
                  {capabilityReport.reason}
                </p>
              </div>
              <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-bold text-[#397054]">
                {capabilityReport.deadEndSceneCount} scene
                {capabilityReport.deadEndSceneCount === 1 ? "" : "s"} use a
                fallback
              </span>
            </div>
          </section>
          {suggestions.length ? (
            <section className="rounded-xl border border-[#d8c997] bg-[#fffaf0] p-4 shadow-sm md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[.14em] text-[#886515]">
                    Smart setup suggestions
                  </span>
                  <h3 className="mt-1 text-base font-semibold text-[#4e411f]">
                    {suggestions.length} repetitive task
                    {suggestions.length === 1 ? "" : "s"} can be automated
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-[#786a43]">
                    Nothing is public until you accept, review, save and
                    publish.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setDismissedSuggestions((current) => [
                        ...current,
                        ...suggestions.map((item) => item.id),
                      ])
                    }
                  >
                    Reject all
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const next = suggestions.reduce(
                        (current, suggestion) =>
                          applyDevelopmentVisualSuggestion(
                            current,
                            suggestion,
                            inventory,
                          ),
                        visualMap,
                      );
                      onChange(next);
                    }}
                  >
                    Accept all drafts
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {suggestions.map((suggestion) => (
                  <article
                    key={suggestion.id}
                    className="rounded-lg border border-[#eadcaf] bg-white p-3"
                  >
                    <strong className="block text-xs text-[#4e411f]">
                      {suggestion.title}
                    </strong>
                    <p className="mt-1 text-[10px] leading-4 text-[#786a43]">
                      {suggestion.description}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onChange(
                            applyDevelopmentVisualSuggestion(
                              visualMap,
                              suggestion,
                              inventory,
                            ),
                          )
                        }
                        className="text-[10px] font-bold text-[#276447] underline"
                      >
                        Accept as draft
                      </button>
                      {suggestion.type === "copy_floor" ? (
                        <button
                          type="button"
                          onClick={() =>
                            onChange(
                              applyDevelopmentVisualSuggestion(
                                visualMap,
                                {
                                  ...suggestion,
                                  payload: {
                                    ...suggestion.payload,
                                    mirror: true,
                                  },
                                },
                                inventory,
                              ),
                            )
                          }
                          className="text-[10px] font-bold text-[#276447] underline"
                        >
                          Mirror instead
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          setDismissedSuggestions((current) => [
                            ...current,
                            suggestion.id,
                          ])
                        }
                        className="text-[10px] font-bold text-[#87795a] underline"
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
          <section className="rounded-xl border border-[#dbe4df] bg-white p-4 shadow-sm md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-[.14em] text-[#397054]">
                  Buyer journey
                </span>
                <h3 className="mt-1 text-lg font-semibold text-[#203c35]">
                  What buyers will move through
                </h3>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={onAdvanced}
              >
                <Settings2 size={13} /> Advanced mapping
              </Button>
            </div>
            <div className="mt-4 grid gap-2">
              {outline.map((item, index) => (
                <div key={item.id}>
                  <article className="rounded-lg border border-[#dbe4df] bg-[#fbfdfb] p-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-[#173f38] text-[10px] font-bold text-white">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <strong className="block truncate text-sm text-[#29483e]">
                          {item.name}
                        </strong>
                        <span className="text-[10px] capitalize text-[#71847b]">
                          {item.type.replaceAll("_", " ")}
                          {item.imageUrl ? " · image ready" : " · needs image"}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          aria-label={`Preview ${item.name}`}
                          onClick={() => setPreviewSceneId(item.id)}
                          className="rounded p-1.5 text-[#567067] hover:bg-white"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${item.name} up`}
                          disabled={!index}
                          onClick={() =>
                            onChange(
                              reorderVisualJourneyScene(
                                visualMap,
                                item.id,
                                "up",
                              ),
                            )
                          }
                          className="rounded p-1.5 text-[#567067] disabled:opacity-25 hover:bg-white"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${item.name} down`}
                          disabled={index === outline.length - 1}
                          onClick={() =>
                            onChange(
                              reorderVisualJourneyScene(
                                visualMap,
                                item.id,
                                "down",
                              ),
                            )
                          }
                          className="rounded p-1.5 text-[#567067] disabled:opacity-25 hover:bg-white"
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${item.name}`}
                          disabled={item.id === visualMap.defaultSceneId}
                          onClick={() => {
                            setRemoveId(item.id);
                            setReplacementId("");
                          }}
                          className="rounded p-1.5 text-[#8d5148] disabled:opacity-25 hover:bg-red-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {item.destinations.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[#e5ebe8] pt-2">
                        {item.destinations.map((target) => (
                          <span
                            key={target.hotspotId}
                            className="rounded-full bg-white px-2 py-1 text-[9px] text-[#60766d]"
                          >
                            Click “{target.label}” →{" "}
                            {target.destination.type.replaceAll("_", " ")}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                  {index < outline.length - 1 ? (
                    <div className="mx-auto h-5 w-px bg-[#b9ccc1]" />
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-4 rounded-xl border border-[#dbe4df] bg-white p-4 shadow-sm md:grid-cols-2 md:p-5">
            <div>
              <strong className="text-sm text-[#29483e]">
                Make an area clickable
              </strong>
              <p className="mt-1 text-xs leading-5 text-[#71847b]">
                Choose what happens after a buyer clicks. Fine-tune its position
                in Advanced Mapping.
              </p>
              <select
                value={link.sceneId}
                onChange={(event) =>
                  setLink((current) => ({
                    ...current,
                    sceneId: event.target.value,
                  }))
                }
                className="mt-3 h-9 w-full rounded-md border bg-white px-2 text-xs"
              >
                {outline.map((item) => (
                  <option key={item.id} value={item.id}>
                    On {item.name}
                  </option>
                ))}
              </select>
              <input
                value={link.label}
                onChange={(event) =>
                  setLink((current) => ({
                    ...current,
                    label: event.target.value,
                  }))
                }
                placeholder="Clickable label, e.g. View Block A"
                className="mt-2 h-9 w-full rounded-md border px-2 text-xs"
              />
              <select
                value={link.type}
                onChange={(event) =>
                  setLink((current) => ({
                    ...current,
                    type: event.target.value,
                    target: "",
                  }))
                }
                className="mt-2 h-9 w-full rounded-md border bg-white px-2 text-xs"
              >
                <option value="scene">Open another view</option>
                <option value="unit">Open property details</option>
                <option value="inventory_filter">Show a property group</option>
              </select>
              {link.type === "inventory_filter" ? (
                <select
                  value={link.filterKey}
                  onChange={(event) =>
                    setLink((current) => ({
                      ...current,
                      filterKey: event.target.value,
                    }))
                  }
                  className="mt-2 h-9 w-full rounded-md border bg-white px-2 text-xs"
                >
                  <option value="phase">Phase</option>
                  <option value="block">Block</option>
                  <option value="floor">Floor</option>
                  <option value="unitType">Property type</option>
                </select>
              ) : null}
              {link.type === "scene" ? (
                <select
                  value={link.target}
                  onChange={(event) =>
                    setLink((current) => ({
                      ...current,
                      target: event.target.value,
                    }))
                  }
                  className="mt-2 h-9 w-full rounded-md border bg-white px-2 text-xs"
                >
                  <option value="">Choose the next view…</option>
                  {outline
                    .filter((item) => item.id !== link.sceneId)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              ) : link.type === "unit" ? (
                <select
                  value={link.target}
                  onChange={(event) =>
                    setLink((current) => ({
                      ...current,
                      target: event.target.value,
                    }))
                  }
                  className="mt-2 h-9 w-full rounded-md border bg-white px-2 text-xs"
                >
                  <option value="">Choose a property…</option>
                  {inventory.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      Residence{" "}
                      {unit.displayNumber || unit.unitNumber || unit.id}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={link.target}
                  onChange={(event) =>
                    setLink((current) => ({
                      ...current,
                      target: event.target.value,
                    }))
                  }
                  placeholder="Group value, e.g. Block A"
                  className="mt-2 h-9 w-full rounded-md border px-2 text-xs"
                />
              )}
              <Button
                type="button"
                size="sm"
                className="mt-3"
                disabled={!link.target}
                onClick={addConnection}
              >
                Add clickable area
              </Button>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-1 text-[10px] font-bold uppercase tracking-[.08em] text-[#557067]">
                {breadcrumbs.map((item, index) => (
                  <span key={item.id}>
                    {index ? " / " : ""}
                    {item.name}
                  </span>
                ))}
              </div>
              <div className="relative mt-2 min-h-72 overflow-hidden rounded-lg bg-[#dfe5e1]">
                {previewScene?.background.url ? (
                  <img
                    src={previewScene.background.url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center p-8 text-center text-xs text-[#71847b]">
                    Add an approved image to preview this step.
                  </div>
                )}
                {previewScene?.hotspots.map((hotspot) => {
                  const point =
                    hotspot.label?.position ||
                    (hotspot.geometry.type === "point"
                      ? hotspot.geometry.coordinates
                      : [50, 50]);
                  return (
                    <span
                      key={hotspot.id}
                      style={{ left: `${point[0]}%`, top: `${point[1]}%` }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-white/95 px-2 py-1 text-[9px] font-bold text-[#29483e] shadow"
                    >
                      {hotspot.label.text || hotspot.target.id}
                    </span>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] leading-4 text-[#71847b]">
                Previewing {previewScene?.name}. Click the eye beside any step
                to preview from there.
              </p>
            </div>
          </section>
        </main>
      </div>

      {removeId ? (
        <div className="fixed inset-0 z-[140] grid place-items-center bg-[#082f28]/55 p-4">
          <section className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-[#203c35]">
              Remove this view safely?
            </h3>
            <p className="mt-2 text-sm leading-6 text-[#667971]">
              Choose where existing clicks should go. With no replacement, child
              views are removed with this step so the public journey cannot
              break.
            </p>
            <select
              value={replacementId}
              onChange={(event) => setReplacementId(event.target.value)}
              className="mt-4 h-10 w-full rounded-md border bg-white px-3 text-sm"
            >
              <option value="">No replacement</option>
              {outline
                .filter((item) => item.id !== removeId)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRemoveId("")}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const next = removeVisualJourneyScene(
                    visualMap,
                    removeId,
                    replacementId,
                  );
                  onChange(next);
                  setPreviewSceneId(next.defaultSceneId);
                  setRemoveId("");
                }}
              >
                Remove and relink
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
