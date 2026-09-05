import {
  AlertTriangle,
  CheckCircle2,
  Monitor,
  RotateCcw,
  Smartphone,
  Tablet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildDevelopmentVisualPreviewReadiness,
  buildVisualPreviewScenario,
  getVisualPreviewJourneyKinds,
  rollbackVisualMapToPublishedSnapshot,
  validateVisualMapAssetLoading,
  VISUAL_PREVIEW_DEVICES,
  VISUAL_PREVIEW_SCENARIOS,
} from "../../core/developments/developmentVisualPreview.js";
import Button from "../ui/Button";
import PublicDevelopmentVisualExplorer from "./PublicDevelopmentVisualExplorer";

const DEVICE_ICONS = { desktop: Monitor, tablet: Tablet, mobile: Smartphone };

export default function DevelopmentVisualPreviewStudio({
  open,
  visualMap,
  inventory = [],
  onClose,
  onRollback,
}) {
  const [deviceId, setDeviceId] = useState("desktop");
  const [scenarioId, setScenarioId] = useState("live_draft");
  const [entrySceneId, setEntrySceneId] = useState("");
  const [assetReport, setAssetReport] = useState(null);
  const [confirmRollback, setConfirmRollback] = useState(false);
  const readiness = useMemo(
    () => buildDevelopmentVisualPreviewReadiness({ visualMap, inventory }),
    [visualMap, inventory],
  );
  const scenario = useMemo(
    () => buildVisualPreviewScenario(visualMap, inventory, scenarioId),
    [visualMap, inventory, scenarioId],
  );
  const journeys = useMemo(
    () => getVisualPreviewJourneyKinds(visualMap),
    [visualMap],
  );
  const device =
    VISUAL_PREVIEW_DEVICES.find((item) => item.id === deviceId) ||
    VISUAL_PREVIEW_DEVICES[0];
  const scenes = scenario.visualMap.scenes;
  const effectiveEntry = scenes.some((scene) => scene.id === entrySceneId)
    ? entrySceneId
    : scenario.visualMap.defaultSceneId;

  useEffect(() => {
    if (!open) return;
    setEntrySceneId(visualMap?.defaultSceneId || "");
    setScenarioId("live_draft");
    setConfirmRollback(false);
  }, [open, visualMap?.defaultSceneId]);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setAssetReport(null);
    validateVisualMapAssetLoading(visualMap).then((report) => {
      if (active) setAssetReport(report);
    });
    return () => {
      active = false;
    };
  }, [open, visualMap]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[135] flex flex-col bg-[#172923]"
      role="dialog"
      aria-modal="true"
      aria-label="Buyer journey preview"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#10211c] px-5 py-3 text-white">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.17em] text-[#d2ad5c]">
            Pre-publication proof
          </p>
          <h2 className="text-lg font-semibold">Buyer journey preview</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-lg bg-white/10 p-1"
            aria-label="Preview device"
          >
            {VISUAL_PREVIEW_DEVICES.map((option) => {
              const Icon = DEVICE_ICONS[option.id];
              return (
                <button
                  key={option.id}
                  type="button"
                  title={`${option.label} preview`}
                  aria-pressed={deviceId === option.id}
                  onClick={() => setDeviceId(option.id)}
                  className={`grid h-8 w-9 place-items-center rounded-md ${deviceId === option.id ? "bg-white text-[#173d33]" : "text-white/70"}`}
                >
                  <Icon size={15} />
                </button>
              );
            })}
          </div>
          <label className="grid gap-1 text-[9px] font-bold uppercase tracking-wider text-white/60">
            Test condition
            <select
              value={scenarioId}
              onChange={(event) => setScenarioId(event.target.value)}
              className="h-9 rounded-md border border-white/15 bg-white/10 px-3 text-xs normal-case tracking-normal text-white"
            >
              {VISUAL_PREVIEW_SCENARIOS.map((option) => (
                <option
                  key={option.id}
                  value={option.id}
                  className="text-black"
                >
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[9px] font-bold uppercase tracking-wider text-white/60">
            Journey entry
            <select
              value={effectiveEntry}
              onChange={(event) => setEntrySceneId(event.target.value)}
              className="h-9 max-w-52 rounded-md border border-white/15 bg-white/10 px-3 text-xs normal-case tracking-normal text-white"
            >
              {scenes.map((scene) => (
                <option key={scene.id} value={scene.id} className="text-black">
                  {scene.id === scenario.visualMap.defaultSceneId
                    ? `${journeys.singleHome ? "Single-home" : "Site plan"}: `
                    : "Block / view: "}
                  {scene.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            <X size={14} /> Close preview
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_330px]">
        <main className="min-h-0 overflow-auto bg-[#263a33] p-4 md:p-7">
          <div
            className="mx-auto min-h-full overflow-hidden rounded-xl bg-white shadow-2xl transition-[width] duration-200"
            style={{ width: `min(100%, ${device.width}px)` }}
          >
            <PublicDevelopmentVisualExplorer
              key={`${deviceId}:${scenarioId}:${effectiveEntry}:${scenario.visualMap.revision}`}
              inventory={scenario.inventory}
              media={{ visualMap: scenario.visualMap }}
              previewVisualMap={scenario.visualMap}
              initialSceneId={effectiveEntry}
              simulatedFailedSceneIds={scenario.failedSceneIds}
              mobile={deviceId === "mobile"}
              embedded
              freshness={{ status: "live" }}
            />
          </div>
        </main>

        <aside className="min-h-0 overflow-y-auto bg-[#fffdf8] p-5">
          <div className="flex items-center gap-2">
            {readiness.safeToPublish ? (
              <CheckCircle2 className="text-emerald-600" size={20} />
            ) : (
              <AlertTriangle className="text-red-600" size={20} />
            )}
            <div>
              <h3 className="font-semibold text-[#18372e]">
                {readiness.decision === "ready"
                  ? "Ready to publish"
                  : readiness.decision === "safe_with_fallbacks"
                    ? "Safe with fallbacks"
                    : "Publishing blocked"}
              </h3>
              <p className="text-[11px] text-[#6b7d75]">
                Warnings allow a partial launch; structural errors do not.
              </p>
            </div>
          </div>

          <section className="mt-5">
            <h4 className="text-[10px] font-bold uppercase tracking-[.14em] text-[#60766d]">
              Journey readiness
            </h4>
            <div className="mt-2 grid gap-2">
              {readiness.checks.map((check, index) => (
                <div
                  key={`${check.code}:${check.sceneId}:${index}`}
                  className="rounded-lg border border-[#e2e5df] bg-white p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-xs text-[#23463c]">
                      {check.label}
                    </strong>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${check.status === "error" ? "bg-red-100 text-red-700" : check.status === "warning" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}
                    >
                      {check.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-[#6b756f]">
                    {check.detail}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-5 rounded-lg border border-[#deddd4] bg-white p-4 text-xs">
            <strong className="text-[#23463c]">Asset loading</strong>
            <p className="mt-1 text-[#6b756f]">
              {!assetReport
                ? "Checking every journey image…"
                : assetReport.ready
                  ? `${assetReport.results.length} image${assetReport.results.length === 1 ? "" : "s"} loaded successfully.`
                  : `${assetReport.failedUrls.length} image${assetReport.failedUrls.length === 1 ? "" : "s"} failed to load.`}
            </p>
          </section>

          <section className="mt-3 rounded-lg border border-[#deddd4] bg-white p-4 text-xs">
            <strong className="text-[#23463c]">Draft versus live</strong>
            <p className="mt-1 leading-4 text-[#6b756f]">
              {readiness.comparison.summary}
            </p>
            {readiness.comparison.hasPublishedSnapshot ? (
              confirmRollback ? (
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      onRollback?.(
                        rollbackVisualMapToPublishedSnapshot(visualMap),
                      )
                    }
                  >
                    Confirm restore
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setConfirmRollback(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  onClick={() => setConfirmRollback(true)}
                >
                  <RotateCcw size={13} /> Restore live snapshot
                </Button>
              )
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
