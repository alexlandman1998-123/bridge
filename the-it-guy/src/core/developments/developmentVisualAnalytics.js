export const DEVELOPMENT_VISUAL_EVENT_TYPES = Object.freeze([
  "scene_viewed",
  "hotspot_selected",
  "unit_opened",
  "floor_plan_viewed",
  "shortlisted",
  "compared",
  "enquiry_started",
  "journey_abandoned",
  "fallback_encountered",
]);

const text = (value) => String(value ?? "").trim();
const ACTION_TO_EVENT = {
  scene_viewed: "scene_viewed",
  hotspot_selected: "hotspot_selected",
  destination: "hotspot_selected",
  unit_opened: "unit_opened",
  floor_plan_viewed: "floor_plan_viewed",
  shortlist: "shortlisted",
  shortlisted: "shortlisted",
  compare: "compared",
  compared: "compared",
  enquiry_started: "enquiry_started",
  journey_abandoned: "journey_abandoned",
  fallback_encountered: "fallback_encountered",
};

export function visualAnalyticsViewport(width) {
  const value = Number(width) || 1280;
  return value < 768 ? "mobile" : value < 1100 ? "tablet" : "desktop";
}

export function normaliseDevelopmentVisualEvent(event = {}, width = 1280) {
  const eventType = ACTION_TO_EVENT[text(event.eventType || event.action)];
  if (!DEVELOPMENT_VISUAL_EVENT_TYPES.includes(eventType)) return null;
  const metadata =
    event.metadata && typeof event.metadata === "object" ? event.metadata : {};
  return {
    eventType,
    sceneId: text(event.sceneId) || null,
    unitId: text(event.unitId) || null,
    viewport: visualAnalyticsViewport(width),
    occurredAt: event.occurredAt || new Date().toISOString(),
    metadata: Object.fromEntries(
      Object.entries(metadata)
        .filter(
          ([key, value]) =>
            !["email", "phone", "name", "url"].includes(key) &&
            ["string", "number", "boolean"].includes(typeof value),
        )
        .slice(0, 20),
    ),
  };
}

export function buildDevelopmentVisualAnalytics(events = []) {
  const rows = events.filter(Boolean);
  const sessions = new Set(rows.map((row) => row.sessionId).filter(Boolean));
  const count = (type) => rows.filter((row) => row.eventType === type).length;
  const group = (key, type) => {
    const values = new Map();
    rows
      .filter((row) => (!type || row.eventType === type) && row[key])
      .forEach((row) => values.set(row[key], (values.get(row[key]) || 0) + 1));
    return [...values.entries()]
      .map(([id, total]) => ({ id, total }))
      .sort((a, b) => b.total - a.total);
  };
  const enquiries = count("enquiry_started");
  return {
    summary: {
      sessions: sessions.size,
      sceneViews: count("scene_viewed"),
      unitOpens: count("unit_opened"),
      enquiries,
      fallbacks: count("fallback_encountered"),
      abandonments: count("journey_abandoned"),
      enquiryRate: sessions.size
        ? Math.round((enquiries * 1000) / sessions.size) / 10
        : 0,
    },
    scenes: group("sceneId", "scene_viewed"),
    units: group("unitId", "unit_opened"),
    dropoffs: group("sceneId", "journey_abandoned"),
    devices: group("viewport"),
  };
}
