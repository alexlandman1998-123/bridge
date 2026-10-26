import { createElement, lazy, Suspense } from "react";
import { useSearchParams } from 'react-router-dom'
import { MarketingLink as Link } from './MarketingNavigation.jsx'
import {
  ArrowRight,
  BarChart3,
  ExternalLink,
  Eye,
  Facebook,
  Instagram,
  LayoutTemplate,
  Megaphone,
  MousePointerClick,
  Plus,
  RefreshCw,
  Share2,
  Wallet,
} from "lucide-react";
import { useMetaWorkspace } from "../../hooks/useMetaWorkspace";
import ChannelWorkspaceTemplates from "./ChannelWorkspaceTemplates";
import "../../pages/WhatsAppCampaigns.css";
import "../../pages/EmailCampaigns.css";
import "./MetaMarketingWorkspace.css";
const ConnectionSettings = lazy(
  () => import("../../pages/settings/SettingsLeadCapturePage"),
);
const tabs = [
  ["overview", "Overview"],
  ["paid", "Paid ads"],
  ["organic", "Organic content"],
  ["templates", "Templates"],
  ["connections", "Connections"],
];

export default function MetaMarketingWorkspace() {
  const [params, setParams] = useSearchParams();
  const {
    organisationId,
    pages = [],
    loading,
    error,
    canManage,
    refresh,
  } = useMetaWorkspace();
  const tab = tabs.some(([key]) => key === params.get("tab"))
    ? params.get("tab")
    : "overview";
  const format = params.get("format") === "social" ? "social" : "meta";
  const select = (next, nextFormat) => {
    const updated = new URLSearchParams(params);
    updated.delete("format");
    if (next === "overview") updated.delete("tab");
    else updated.set("tab", next);
    if (nextFormat) updated.set("format", nextFormat);
    setParams(updated);
  };
  const stats = [
    [
      Facebook,
      "Connected Pages",
      pages.filter((page) => page.connection_status === "connected").length,
      "Facebook Page connections",
    ],
    [
      Share2,
      "Ready to publish",
      pages.filter((page) => page.canPost).length,
      "Pages with posting permission",
    ],
    [Eye, "Reach", null, "Insights not connected"],
    [MousePointerClick, "Link clicks", null, "Insights not connected"],
    [Wallet, "Ad spend", null, "Ad reporting not connected"],
  ];
  const lanes = [
    {
      key: "paid",
      channel: "meta",
      Icon: Megaphone,
      title: "Paid advertising",
      description:
        "Build a focused offer, find the right audience and prepare your next Facebook or Instagram ad.",
      action: "Explore ad templates",
      points: [
        "Seller lead generation",
        "Property promotions",
        "Show day invitations",
      ],
    },
    {
      key: "organic",
      channel: "social",
      Icon: Share2,
      title: "Organic content",
      description:
        "Stay visible with property stories, local knowledge and updates your followers will want to read.",
      action: "Explore social templates",
      points: [
        "New listings & sold stories",
        "Neighbourhood spotlights",
        "Community conversations",
      ],
    },
  ];
  return (
    <div className="wa-page email-page email-landing meta-marketing">
      <header className="email-landing-heading">
        <div className="meta-title">
          <span className="meta-header-brands" aria-hidden="true">
            <Facebook size={25} />
            <Instagram size={25} />
          </span>
          <h1>Facebook &amp; Instagram</h1>
        </div>
        <button
          type="button"
          className="wa-primary-button"
          onClick={() => select("templates")}
        >
          <Plus size={17} />
          Create content
        </button>
      </header>
      <section
        className="email-homepage-stats"
        aria-label="Meta marketing statistics"
        aria-busy={loading}
      >
        {stats.map(([Icon, label, value, note]) => (
          <article className="email-homepage-stat" key={label}>
            <div className="email-stat-heading">
              <span>{label}</span>
              <span className="email-homepage-stat-icon">
                {createElement(Icon, { size: 18, 'aria-hidden': true })}
              </span>
            </div>
            <strong>
              {loading
                ? "…"
                : error || value === null
                  ? "—"
                  : value.toLocaleString()}
            </strong>
            <small>{error ? "Data unavailable" : note}</small>
          </article>
        ))}
      </section>
      <nav className="email-workspace-nav" aria-label="Meta workspace">
        {tabs.map(([key, label]) => (
          <button
            type="button"
            key={key}
            aria-current={tab === key ? "page" : undefined}
            onClick={() => select(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <div className="wa-error" role="alert">
          {error}{" "}
          <button
            type="button"
            className="meta-inline-button"
            onClick={() => void refresh()}
          >
            Retry connections
          </button>
        </div>
      )}
      {tab === "connections" ? (
        canManage ? (
          <Suspense
            fallback={<p role="status">Loading connection settings…</p>}
          >
            <ConnectionSettings key={organisationId} section="meta" embedded />
          </Suspense>
        ) : (
          <section className="meta-panel">
            <h2>Page connections</h2>
            <p>
              An agency administrator can manage Facebook Page connections and
              lead forms.
            </p>
          </section>
        )
      ) : tab === "templates" ? (
        <>
          <div
            className="meta-template-switch"
            role="group"
            aria-label="Template format"
          >
            <button
              type="button"
              aria-pressed={format === "meta"}
              onClick={() => select("templates", "meta")}
            >
              <Megaphone size={18} />
              Paid ad templates
            </button>
            <button
              type="button"
              aria-pressed={format === "social"}
              onClick={() => select("templates", "social")}
            >
              <Share2 size={18} />
              Organic post templates
            </button>
          </div>
          <ChannelWorkspaceTemplates
            key={`${organisationId}:${format}`}
            channel={format}
            organisationId={organisationId}
          />
        </>
      ) : (
        <>
          <div
            className={`meta-lanes ${tab === "overview" ? "" : "meta-lanes-single"}`}
          >
            {lanes
              .filter((lane) => tab === "overview" || lane.key === tab)
              .map(
                ({
                  key,
                  channel,
                  Icon,
                  title,
                  description,
                  action,
                  points,
                }) => (
                  <section className={`meta-lane meta-lane-${key}`} key={key}>
                    <div className="meta-lane-icon">
                      {createElement(Icon, { size: 25 })}
                    </div>
                    <h2>{title}</h2>
                    <p>{description}</p>
                    <ul>
                      {points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => select("templates", channel)}
                    >
                      {action}
                      <ArrowRight size={18} />
                    </button>
                  </section>
                ),
              )}
          </div>
          {tab === "overview" ? (
            <div className="meta-overview-bottom">
              <section className="meta-panel">
                <header>
                  <h2>Your Facebook Pages</h2>
                  <button
                    type="button"
                    className="meta-inline-button"
                    disabled={loading}
                    onClick={() => void refresh()}
                  >
                    <RefreshCw size={15} />
                    Refresh
                  </button>
                </header>
                {loading ? (
                  <p role="status">Loading Pages…</p>
                ) : error ? (
                  <p>Page connections could not be loaded.</p>
                ) : pages.length ? (
                  <div className="meta-page-list">
                    {pages.map((page) => (
                      <div key={page.id}>
                        <span className="meta-page-icon">
                          <Facebook size={20} />
                        </span>
                        <div>
                          <strong>{page.page_name || "Facebook Page"}</strong>
                          <small>
                            {page.canPost
                              ? "Listing publishing available"
                              : "Posting permission required"}
                          </small>
                        </div>
                        <span className="meta-connection-status">
                          {page.connection_status || "Unknown"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="meta-page-empty">
                    <Facebook size={28} />
                    <p>No Facebook Pages connected yet.</p>
                  </div>
                )}
                <button
                  type="button"
                  className="meta-inline-button"
                  onClick={() => select("connections")}
                >
                  {canManage ? "Manage connections" : "View connection details"}
                  <ArrowRight size={16} />
                </button>
              </section>
              <section className="meta-panel meta-template-promo">
                <LayoutTemplate size={26} />
                <h2>A starting point for every post</h2>
                <p>
                  Customise ready-made ad and social copy, or reuse your
                  agency’s saved templates.
                </p>
                <button
                  type="button"
                  className="wa-primary-button"
                  onClick={() => select("templates")}
                >
                  Browse templates
                  <ArrowRight size={16} />
                </button>
              </section>
            </div>
          ) : tab === "paid" ? (
            <section className="meta-panel meta-workflow">
              <BarChart3 size={25} />
              <div>
                <h2>Take your plan into Ads Manager</h2>
                <p>
                  Prepare ad copy and a campaign brief here. Set budgets,
                  audiences and placements in Meta Ads Manager. Ad delivery and
                  reporting are managed there.
                </p>
              </div>
              <a
                href="https://adsmanager.facebook.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Ads Manager
                <ExternalLink size={16} />
              </a>
            </section>
          ) : (
            <section className="meta-panel meta-workflow">
              <Share2 size={25} />
              <div>
                <h2>From your listings to your followers</h2>
                <p>
                  Open a listing to prepare and review its Facebook post. Use
                  Business Suite to schedule other Facebook and Instagram
                  content.
                </p>
              </div>
              <Link to="/listings">
                Open listings
                <ArrowRight size={16} />
              </Link>
              <a
                href="https://business.facebook.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Business Suite
                <ExternalLink size={16} />
              </a>
            </section>
          )}
          {tab !== "overview" && (
            <ChannelWorkspaceTemplates
              key={`${organisationId}:${tab}`}
              channel={tab === "paid" ? "meta" : "social"}
              organisationId={organisationId}
            />
          )}
        </>
      )}
    </div>
  );
}
