import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildDevelopmentVisualAnalytics,
  normaliseDevelopmentVisualEvent,
  visualAnalyticsViewport,
} from "../developmentVisualAnalytics.js";

assert.equal(visualAnalyticsViewport(390), "mobile");
assert.equal(visualAnalyticsViewport(900), "tablet");
assert.equal(visualAnalyticsViewport(1440), "desktop");
assert.equal(normaliseDevelopmentVisualEvent({ action: "share" }), null);

const safe = normaliseDevelopmentVisualEvent(
  {
    action: "shortlist",
    sceneId: "site",
    unitId: 101,
    metadata: {
      unitNumber: "A-101",
      email: "must-not-persist@example.test",
      nested: { ignored: true },
    },
  },
  390,
);
assert.equal(safe.eventType, "shortlisted");
assert.equal(safe.viewport, "mobile");
assert.equal(safe.metadata.unitNumber, "A-101");
assert.equal(safe.metadata.email, undefined);
assert.equal(safe.metadata.nested, undefined);

const analytics = buildDevelopmentVisualAnalytics([
  {
    sessionId: "a",
    eventType: "scene_viewed",
    sceneId: "site",
    viewport: "mobile",
  },
  {
    sessionId: "a",
    eventType: "unit_opened",
    sceneId: "site",
    unitId: "101",
    viewport: "mobile",
  },
  {
    sessionId: "a",
    eventType: "shortlisted",
    unitId: "101",
    viewport: "mobile",
  },
  {
    sessionId: "a",
    eventType: "enquiry_started",
    sceneId: "site",
    viewport: "mobile",
  },
  {
    sessionId: "b",
    eventType: "scene_viewed",
    sceneId: "block-a",
    viewport: "desktop",
  },
  {
    sessionId: "b",
    eventType: "fallback_encountered",
    sceneId: "block-a",
    viewport: "desktop",
  },
  {
    sessionId: "b",
    eventType: "journey_abandoned",
    sceneId: "block-a",
    viewport: "desktop",
  },
]);
assert.deepEqual(analytics.summary, {
  sessions: 2,
  sceneViews: 2,
  unitOpens: 1,
  enquiries: 1,
  fallbacks: 1,
  abandonments: 1,
  enquiryRate: 50,
});
assert.deepEqual(analytics.scenes[0], { id: "site", total: 1 });
assert.deepEqual(analytics.units[0], { id: "101", total: 1 });
assert.deepEqual(analytics.dropoffs[0], { id: "block-a", total: 1 });

const migration = readFileSync(
  new URL(
    "../../../../../supabase/migrations/20260905150420_development_visual_analytics_phase14.sql",
    import.meta.url,
  ),
  "utf8",
);
assert.match(migration, /enable row level security/i);
assert.match(
  migration,
  /revoke all on table public\.development_visual_events from anon/i,
);
assert.match(migration, /jsonb_array_length\(requested_events\) > 25/i);
assert.match(
  migration,
  /bridge_can_manage_development_record\(development_id\)/i,
);
assert.match(
  migration,
  /grant execute on function public\.record_public_development_visual_events[^;]+to anon, authenticated/is,
);

console.log("development visual analytics Phase 14 checks passed");
