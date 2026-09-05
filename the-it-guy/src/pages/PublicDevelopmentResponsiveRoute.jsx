import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import PublicDevelopmentLandingPage from "./PublicDevelopmentLandingPage";
import MobilePublicDevelopmentExperience from "./MobilePublicDevelopmentExperience";
import "./public-development-responsive.css";
import { hydrateVisualMapMediaLibrary } from "../core/developments/developmentVisualMap.js";
import { normaliseDevelopmentVisualEvent } from "../core/developments/developmentVisualAnalytics.js";

const text = (value) => String(value || "").trim();
const list = (value) =>
  Array.isArray(value)
    ? value.map(text).filter(Boolean)
    : text(value)
        .split(/\r?\n|,/)
        .map(text)
        .filter(Boolean);
const keyFor = (status) => {
  const value = text(status).toLowerCase();
  if (value.includes("reserve") || value.includes("offer")) return "reserved";
  if (value.includes("sold") || value.includes("complete")) return "sold";
  if (value.includes("unreleased") || value.includes("draft"))
    return "unreleased";
  return "available";
};
const createAnalyticsSessionId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID)
    return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const value = Math.floor(Math.random() * 16);
    return (token === "x" ? value : (value & 3) | 8).toString(16);
  });
};

export default function PublicDevelopmentResponsiveRoute() {
  const { slug = "" } = useParams();
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const [freshness, setFreshness] = useState({
    status: "connecting",
    updatedAt: null,
  });
  const [mobileViewport, setMobileViewport] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(max-width: 767px)").matches,
  );
  const refreshTimer = useRef(null);
  const analyticsQueue = useRef([]);
  const analyticsTimer = useRef(null);
  const analyticsSessionId = useRef(createAnalyticsSessionId());

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = (event) => setMobileViewport(event.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const loadPublicDevelopment = useCallback(
    async ({ background = false } = {}) => {
      if (!isSupabaseConfigured || !supabase) return;
      if (background)
        setFreshness((current) => ({
          ...current,
          status: navigator.onLine ? "refreshing" : "offline",
        }));
      const { data, error } = await supabase.rpc(
        "get_public_development_landing",
        { requested_slug: slug },
      );
      if (error || !data) {
        if (background) {
          setFreshness((current) => ({
            ...current,
            status: navigator.onLine ? "delayed" : "offline",
          }));
          return;
        }
        setState({
          loading: false,
          data: null,
          error: error?.message || "This development page is not published.",
        });
        return;
      }
      setState({ loading: false, data, error: "" });
      setFreshness({ status: "live", updatedAt: new Date().toISOString() });
    },
    [slug],
  );

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => active && loadPublicDevelopment());
    return () => {
      active = false;
    };
  }, [loadPublicDevelopment]);

  useEffect(() => {
    if (!state.data || !supabase) return undefined;
    const developmentId =
      state.data.developmentId ||
      state.data.development_id ||
      state.data.id ||
      state.data.development?.id;
    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(
        () => void loadPublicDevelopment({ background: true }),
        250,
      );
    };
    const handleOnline = () => scheduleRefresh();
    const handleOffline = () =>
      setFreshness((current) => ({ ...current, status: "offline" }));
    const handleVisibility = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine)
        scheduleRefresh();
    }, 60000);
    const channel = developmentId
      ? supabase
          .channel(`public-development:${developmentId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "units",
              filter: `development_id=eq.${developmentId}`,
            },
            scheduleRefresh,
          )
          .subscribe((status) => {
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
              setFreshness((current) => ({
                ...current,
                status: navigator.onLine ? "delayed" : "offline",
              }));
          })
      : null;
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(refreshTimer.current);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [state.data, loadPublicDevelopment]);

  useEffect(() => {
    if (!state.data || !supabase) return undefined;
    let active = true;
    let lastSceneId = null;
    let lastSceneName = "";
    let interacted = false;
    let enquiryStarted = false;
    let abandoned = false;
    const startedAt = Date.now();
    const flush = async () => {
      window.clearTimeout(analyticsTimer.current);
      analyticsTimer.current = null;
      if (!analyticsQueue.current.length) return;
      const batch = analyticsQueue.current.splice(0, 25);
      const { error } = await supabase.rpc(
        "record_public_development_visual_events",
        {
          requested_slug: slug,
          requested_session_id: analyticsSessionId.current,
          requested_events: batch,
        },
      );
      if (error && active)
        analyticsQueue.current = [...batch, ...analyticsQueue.current].slice(
          0,
          100,
        );
      if (analyticsQueue.current.length && active)
        analyticsTimer.current = window.setTimeout(() => void flush(), 1500);
    };
    const queueEvent = (rawEvent) => {
      const event = normaliseDevelopmentVisualEvent(
        rawEvent,
        window.innerWidth,
      );
      if (!event) return;
      if (event.sceneId) lastSceneId = event.sceneId;
      if (event.metadata?.sceneName) lastSceneName = event.metadata.sceneName;
      if (event.eventType === "enquiry_started") enquiryStarted = true;
      if (!["scene_viewed", "fallback_encountered"].includes(event.eventType))
        interacted = true;
      analyticsQueue.current.push(event);
      if (analyticsQueue.current.length >= 10) void flush();
      else if (!analyticsTimer.current)
        analyticsTimer.current = window.setTimeout(() => void flush(), 1500);
    };
    const recordAbandonment = () => {
      if (
        abandoned ||
        enquiryStarted ||
        !interacted ||
        Date.now() - startedAt < 5000
      )
        return;
      abandoned = true;
      queueEvent({
        eventType: "journey_abandoned",
        sceneId: lastSceneId,
        metadata: {
          sceneName: lastSceneName,
          seconds: Math.round((Date.now() - startedAt) / 1000),
        },
      });
    };
    const handleVisualEvent = (event) => queueEvent(event.detail);
    const handleDocumentClick = (event) => {
      const anchor = event.target.closest?.("a[href]");
      if (!anchor || anchor.dataset.visualAnalyticsCaptured === "true") return;
      const href = anchor.getAttribute("href") || "";
      const links = state.data?.marketing?.externalLinks || {};
      const enquiryLinks = new Set(
        ["#enquire", links.whatsappEnquiryUrl, links.bookingViewingUrl].filter(
          Boolean,
        ),
      );
      if (!enquiryLinks.has(href)) return;
      queueEvent({
        eventType: "enquiry_started",
        sceneId: lastSceneId,
        metadata: { sceneName: lastSceneName, source: "landing_page" },
      });
    };
    const handleVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      void flush();
    };
    const handlePageHide = () => {
      recordAbandonment();
      void flush();
    };
    window.addEventListener("arch9:development-visualiser", handleVisualEvent);
    document.addEventListener("click", handleDocumentClick);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      active = false;
      recordAbandonment();
      void flush();
      window.clearTimeout(analyticsTimer.current);
      window.removeEventListener(
        "arch9:development-visualiser",
        handleVisualEvent,
      );
      document.removeEventListener("click", handleDocumentClick);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [slug, state.data]);

  if (state.loading)
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f2eb] text-[#153d33]">
        Loading development…
      </main>
    );
  if (!state.data)
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f2eb] px-6 text-center text-[#153d33]">
        <div>
          <h1 className="font-serif text-3xl">Development unavailable</h1>
          <p className="mt-3 text-sm">{state.error}</p>
        </div>
      </main>
    );

  const data = state.data;
  const marketing = data.marketing || {};
  const media = hydrateVisualMapMediaLibrary(marketing.mediaLibrary || {}, {
    preferPublished: true,
  });
  const inventory = Array.isArray(data.inventory) ? data.inventory : [];
  const available = inventory.filter(
    (unit) => keyFor(unit.status) === "available",
  );
  const prices = inventory.map((unit) => Number(unit.price)).filter(Boolean);
  const fromPrice = Math.min(...prices);
  const agency =
    text(data.developerCompany).replace(/\s+site$/i, "") || "Revo Property";
  const hero = media.heroImageUrl || "";
  const images = [
    ...new Set(
      [...list(media.galleryImageUrls), ...list(media.imageUrls), hero].filter(
        Boolean,
      ),
    ),
  ];
  const enquiry =
    marketing.externalLinks?.whatsappEnquiryUrl ||
    marketing.externalLinks?.bookingViewingUrl ||
    "#enquire";
  const branding = data.organisationBranding || {};
  // The high-contrast mark is explicitly intended for dark hero and mobile
  // surfaces. The primary/light record can be a coloured logo.
  const logoUrl = text(
    branding.logoHighContrastUrl ||
      branding.logoUrl ||
      branding.logoDarkUrl ||
      branding.logoLightUrl,
  );
  const brandStyle = {
    "--development-primary": text(branding.primaryColour) || "#073e32",
    "--development-accent": text(branding.accentColour) || "#d0ab55",
  };

  const sharedProps = {
    data,
    marketing,
    media,
    inventory,
    available,
    fromPrice,
    agency,
    hero,
    images,
    enquiry,
    freshness,
  };
  return mobileViewport ? (
    <div className="public-development-mobile" style={brandStyle}>
      {logoUrl ? (
        <img
          className="public-development-mobile-logo"
          src={logoUrl}
          alt={`${agency} logo`}
        />
      ) : null}
      <MobilePublicDevelopmentExperience {...sharedProps} />
    </div>
  ) : (
    <div className="public-development-desktop" style={brandStyle}>
      {logoUrl ? (
        <img
          className="public-development-revo-logo"
          src={logoUrl}
          alt={`${agency} logo`}
        />
      ) : null}
      <PublicDevelopmentLandingPage {...sharedProps} />
    </div>
  );
}
