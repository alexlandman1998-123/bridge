import { AlertCircle, Loader2, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "../../lib/googleMaps";

const DEFAULT_CENTER = { lat: -26.2041, lng: 28.0473 };
const AUTO_SEARCH_DEBOUNCE_MS = 650;
const MIN_MAP_SEARCH_INTERVAL_MS = 5_000;

function apiKey() {
  return String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();
}

function toBounds(map) {
  const bounds = map?.getBounds?.();
  if (!bounds) return null;
  const northEast = bounds.getNorthEast();
  const southWest = bounds.getSouthWest();
  return {
    west: southWest.lng(),
    east: northEast.lng(),
    south: southWest.lat(),
    north: northEast.lat(),
  };
}

function boundsKey(bounds) {
  return [bounds.west, bounds.east, bounds.south, bounds.north]
    .map((value) => Number(value).toFixed(4))
    .join(":");
}

export default function KnowledgeFactoryParcelMap({
  properties = [],
  loading = false,
  onSearchArea,
  onFocusProperty,
  focusedProperty,
}) {
  const containerRef = useRef(null);
  const autocompleteRef = useRef(null);
  const mapRef = useRef(null);
  const polygonsRef = useRef([]);
  const onSearchAreaRef = useRef(onSearchArea);
  const loadingRef = useRef(loading);
  const searchTimerRef = useRef(null);
  const lastBoundsRef = useRef("");
  const lastSearchAtRef = useRef(0);
  const [state, setState] = useState({
    status: apiKey() ? "loading" : "missing-key",
    error: "",
    autocompleteAvailable: false,
  });

  useEffect(() => {
    onSearchAreaRef.current = onSearchArea;
    loadingRef.current = loading;
  }, [loading, onSearchArea]);

  useEffect(() => {
    const key = apiKey();
    if (!key || !containerRef.current) return undefined;
    let active = true;
    let idleListener = null;
    const scheduleSearch = (map) => {
      const bounds = toBounds(map);
      if (!bounds) return;
      const key = boundsKey(bounds);
      if (key === lastBoundsRef.current) return;
      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
      const elapsed = Date.now() - lastSearchAtRef.current;
      const wait = Math.max(
        AUTO_SEARCH_DEBOUNCE_MS,
        MIN_MAP_SEARCH_INTERVAL_MS - elapsed,
      );
      searchTimerRef.current = window.setTimeout(() => {
        if (!active || key === lastBoundsRef.current) return;
        if (loadingRef.current) {
          scheduleSearch(map);
          return;
        }
        lastBoundsRef.current = key;
        lastSearchAtRef.current = Date.now();
        onSearchAreaRef.current?.(bounds);
      }, wait);
    };
    loadGoogleMaps()
      .then(async (google) => {
        const maps = google?.maps;
        if (!active || !maps) return;
        const Map =
          typeof maps.importLibrary === "function"
            ? (await maps.importLibrary("maps")).Map
            : maps.Map;
        if (!active) return;
        if (typeof Map !== "function")
          throw new Error("Google Maps did not provide the map renderer.");
        const map = new Map(containerRef.current, {
          center: DEFAULT_CENTER,
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        mapRef.current = map;
        idleListener = map.addListener("idle", () => scheduleSearch(map));
        let autocompleteAvailable = false;
        if (
          typeof maps.importLibrary === "function" &&
          autocompleteRef.current
        ) {
          try {
            const { PlaceAutocompleteElement } =
              await maps.importLibrary("places");
            if (!active || !PlaceAutocompleteElement) return;
            const autocomplete = new PlaceAutocompleteElement();
            autocomplete.placeholder =
              "Search a South African address or suburb";
            autocomplete.includedRegionCodes = ["za"];
            autocompleteRef.current.replaceChildren(autocomplete);
            autocomplete.addEventListener(
              "gmp-select",
              async ({ placePrediction }) => {
                const place = placePrediction?.toPlace?.();
                if (!place) return;
                await place.fetchFields({ fields: ["location", "viewport"] });
                if (place.viewport) map.fitBounds(place.viewport);
                else if (place.location) {
                  map.setCenter(place.location);
                  map.setZoom(17);
                }
              },
            );
            autocompleteAvailable = true;
          } catch (error) {
            console.warn(
              "Google Places autocomplete is unavailable; pan and zoom the map to load parcels.",
              error,
            );
          }
        }
        setState({ status: "ready", error: "", autocompleteAvailable });
      })
      .catch((error) => {
        if (active)
          setState({
            status: "error",
            error: error?.message || "Google Maps is unavailable.",
          });
      });
    return () => {
      active = false;
      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
      idleListener?.remove?.();
    };
  }, []);

  useEffect(() => {
    const maps = window.google?.maps;
    const map = mapRef.current;
    if (!maps || !map) return;
    polygonsRef.current.forEach((polygon) => polygon.setMap(null));
    polygonsRef.current = properties.map((property) => {
      const polygon = new maps.Polygon({
        paths: property.polygon.map((point) => ({
          lat: point.latitude,
          lng: point.longitude,
        })),
        strokeColor: "#1769dc",
        strokeOpacity: 0.9,
        strokeWeight: focusedProperty?.id === property.id ? 4 : 2,
        fillColor: focusedProperty?.id === property.id ? "#1769dc" : "#4cc9f0",
        fillOpacity: focusedProperty?.id === property.id ? 0.32 : 0.18,
        map,
      });
      polygon.addListener("click", () => onFocusProperty?.(property));
      return polygon;
    });
  }, [properties, focusedProperty?.id, onFocusProperty]);

  if (state.status === "missing-key" || state.status === "error") {
    return (
      <div className="grid min-h-[520px] flex-1 place-items-center bg-slate-50 p-6 text-center">
        <div className="max-w-md">
          <AlertCircle className="mx-auto text-amber-500" size={28} />
          <h3 className="mt-3 font-semibold text-slate-900">
            Map configuration is needed
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {state.status === "missing-key"
              ? "Set the browser-restricted VITE_GOOGLE_MAPS_API_KEY to activate the canvassing map."
              : state.error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative min-h-[520px] flex-1 overflow-hidden bg-slate-100"
      data-testid="knowledge-factory-parcel-map"
    >
      <div
        ref={containerRef}
        className="absolute inset-0"
        aria-label="Knowledge Factory parcel map"
      />
      <div className="absolute left-4 right-4 top-4 z-10 flex max-w-xl gap-2">
        <div
          ref={autocompleteRef}
          className={`min-h-11 min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${state.autocompleteAvailable ? "" : "flex items-center px-3 text-sm text-slate-600"}`}
          aria-label="Search a South African address or suburb"
        >
          {state.status === "ready" && !state.autocompleteAvailable
            ? "Pan and zoom to an address or suburb. Parcels load automatically."
            : null}
        </div>
      </div>
      <div
        className="absolute left-4 top-20 z-10 flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm"
        aria-live="polite"
      >
        {loading ? (
          <Loader2 className="animate-spin text-[#1769dc]" size={14} />
        ) : null}
        {loading ? "Loading parcels…" : `${properties.length} parcels in view`}
      </div>
      {focusedProperty ? (
        <article className="absolute bottom-4 left-4 z-10 w-[min(310px,calc(100%-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-[#1769dc]">
              <MapPin size={18} />
            </span>
            <div>
              <h3 className="font-semibold text-slate-900">
                Property {focusedProperty.propertyId}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Erf {focusedProperty.erf ?? "—"} · Portion{" "}
                {focusedProperty.portion ?? "—"}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Report options are open in the panel on the right. No supplier
                request has been made.
              </p>
            </div>
          </div>
        </article>
      ) : null}
    </div>
  );
}
